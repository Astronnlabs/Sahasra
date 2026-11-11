import { format } from 'date-fns';
import type { InvoiceData, InvoiceTemplate, SellerSnapshot, TemplateElement } from '@/features/bill-studio/model';
import { amountInWords } from '@/lib/format';
import type { KotDesign } from '@/services';
import type { Kot } from '@/types';
import { EscPos, type Alignment, type Bitmap } from './builder';
import { canEncode, simplify, type PrinterEncoding } from './encoding';
import { barcodeToBitmap, loadImage, pictureToBitmap, qrToBitmap, rowToBitmap, textToBitmap, type Density } from './raster';

/** How a receipt is put on paper. Everything printed comes from this app — nothing is added by a printing service. */
export interface ReceiptOptions {
  /** Printable width in dots: 384 for 58 mm paper, 576 for 80 mm. */
  paperDots: number;
  encoding: PrinterEncoding;
  density: Density;
  /** QR codes and barcodes: as pictures (every printer) or with the printer's own commands (sharper, newer printers). */
  codes: 'image' | 'printer';
  /** Cut the paper at the end (printers with a cutter only). */
  cut: boolean;
}

/** Business details printed on the bill (the snapshot saved with the invoice, or today's details). */
export type Seller = Pick<SellerSnapshot, 'businessName' | 'address' | 'phone' | 'email' | 'gstin' | 'logo' | 'upiId' | 'bankName' | 'bankAccount' | 'bankIfsc' | 'bankBranch'>;

const FONT_A_DOTS = 12; // Font A is 12 × 24 dots.
const PAYMENT_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank', credit: 'Credit', split: 'Split' };

/** Word-wraps text to `width` characters (long words are broken). */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > width) {
        if (cur) {
          out.push(cur);
          cur = '';
        }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= width) cur += ` ${w}`;
      else {
        out.push(cur);
        cur = w;
      }
    }
    out.push(cur);
  }
  return out;
}

const num = (v: number) => {
  const precise = Math.round(v * 100) % 100 !== 0;
  return v.toLocaleString('en-IN', { minimumFractionDigits: precise ? 2 : 0, maximumFractionDigits: 2 });
};
const rs = (v: number) => `Rs.${num(v)}`;

interface TextStyle {
  align?: Alignment;
  bold?: boolean;
  /** Width and height multipliers. */
  w?: number;
  h?: number;
}

/**
 * Writes receipt lines. Text the printer can print goes as text (fast, sharp); anything its
 * character set lacks — Indian scripts, emoji — is drawn and sent as a picture instead of "?".
 */
class ReceiptWriter {
  readonly p: EscPos;
  readonly cols: number;
  constructor(readonly o: ReceiptOptions) {
    this.p = new EscPos(o.encoding).init();
    this.cols = Math.floor(o.paperDots / FONT_A_DOTS);
    if (o.density === 'dark') this.p.doubleStrike(true);
  }

  private style(s: TextStyle) {
    this.p.align(s.align ?? 'left').bold(!!s.bold).size(s.w ?? 1, s.h ?? 1);
  }

  private reset() {
    this.p.bold(false).size(1, 1).align('left');
  }

  image(bmp: Bitmap | null) {
    if (!bmp) return;
    this.p.align('left').image(bmp);
  }

  text(raw: string, s: TextStyle = {}) {
    const t = simplify(raw, this.o.encoding).trim();
    if (!t) return;
    if (canEncode(t, this.o.encoding)) {
      const width = Math.floor(this.cols / (s.w ?? 1));
      this.style(s);
      for (const l of wrap(t, width)) this.p.line(l);
      this.reset();
    } else {
      this.image(textToBitmap(raw.trim(), { paperDots: this.o.paperDots, align: s.align ?? 'left', px: 22 * (s.h ?? 1), bold: s.bold, density: this.o.density }));
    }
  }

  /** Label on the left, value on the right. */
  row(left: string, right: string, s: Omit<TextStyle, 'align' | 'w'> = {}) {
    const l = simplify(left, this.o.encoding);
    const r = simplify(right, this.o.encoding);
    if (!canEncode(l + r, this.o.encoding)) {
      this.image(rowToBitmap(left, right, { paperDots: this.o.paperDots, px: 22 * (s.h ?? 1), bold: s.bold, density: this.o.density }));
      return;
    }
    this.style({ ...s, align: 'left' });
    // Leading spaces indent the label (add-ons under their item).
    const indent = /^ */.exec(l)![0];
    const room = this.cols - r.length - 1 - indent.length;
    const lines = wrap(l.trimStart(), Math.max(room, 4)).map((x) => indent + x);
    lines.forEach((line, i) => this.p.line(i === lines.length - 1 ? line + ' '.repeat(Math.max(1, this.cols - line.length - r.length)) + r : line));
    this.reset();
  }

  /** Several columns; the first takes the remaining width and wraps. */
  columns(cells: { text: string; width: number; align: 'left' | 'right' }[], s: Omit<TextStyle, 'align' | 'w' | 'h'> = {}) {
    const first = cells[0];
    const rest = cells.slice(1);
    const firstW = this.cols - rest.reduce((a, c) => a + c.width, 0);
    const texts = cells.map((c) => simplify(c.text, this.o.encoding));
    if (!canEncode(texts.join(''), this.o.encoding)) {
      // An item name in another script: the name as a picture, the numbers as text below it.
      this.image(textToBitmap(first.text, { paperDots: this.o.paperDots, align: 'left', px: 22, bold: s.bold, density: this.o.density }));
      this.style({ ...s, align: 'right' });
      this.p.line(rest.map((c, i) => texts[i + 1].padStart(c.width)).join(''));
      this.reset();
      return;
    }
    this.style({ ...s, align: 'left' });
    const nameLines = wrap(texts[0], Math.max(firstW - 1, 4));
    nameLines.forEach((nl, i) => {
      if (i < nameLines.length - 1) return this.p.line(nl);
      const tail = rest.map((c, j) => (c.align === 'right' ? texts[j + 1].slice(0, c.width).padStart(c.width) : texts[j + 1].slice(0, c.width).padEnd(c.width))).join('');
      this.p.line(nl.padEnd(firstW).slice(0, firstW) + tail);
    });
    this.reset();
    void first;
  }

  rule(ch = '-') {
    this.p.align('left').line(ch.repeat(this.cols));
  }

  feed(n = 1) {
    this.p.feed(n);
  }

  async qr(value: string, align: Alignment, sizeDots: number) {
    if (this.o.codes === 'printer') {
      this.p.align(align).qr(value, Math.max(3, Math.round(sizeDots / 33)));
      this.reset();
    } else {
      this.image(await qrToBitmap(value, { sizeDots, paperDots: this.o.paperDots, align }));
    }
  }

  async barcode(value: string, align: Alignment) {
    if (this.o.codes === 'printer') {
      this.p.align(align).barcode128(value);
      this.reset();
    } else {
      this.image(await barcodeToBitmap(value, { paperDots: this.o.paperDots, align }));
    }
  }

  finish() {
    // Enough paper to tear the receipt off past the print head.
    this.p.doubleStrike(false).feed(this.o.cut ? 2 : 4);
    if (this.o.cut) this.p.cut();
    return this.p.build();
  }
}

const sizeFor = (fontSize: number, text: string, cols: number): { w: number; h: number } => {
  if (fontSize >= 14) return text.length <= cols / 2 ? { w: 2, h: 2 } : { w: 1, h: 2 };
  return { w: 1, h: 1 };
};

function upiLink(upiId: string, payee: string, amount: number, note: string) {
  const qs = new URLSearchParams({ pa: upiId, pn: payee, cu: 'INR' });
  if (amount > 0) qs.set('am', amount.toFixed(2));
  qs.set('tn', note.slice(0, 50));
  return `upi://pay?${qs.toString()}`;
}

/**
 * Items, as in the receipt design: the name on its own line (bold), then "qty x rate" and the
 * amount; add-ons ("+ Extra Aloo") indented under their item on one line.
 */
function itemsTable(w: ReceiptWriter, el: TemplateElement, S: InvoiceData) {
  const c = el.props.columns ?? { sku: false, hsn: false, qty: true, rate: true, discount: false, tax: false };
  w.row('Item', 'Amount', { bold: true });
  w.rule();
  S.items.forEach((it, i) => {
    const amount = num(it.qty * it.rate - it.discount);
    if (it.name.startsWith('+ ')) {
      w.row(`  ${it.name}${it.qty !== 1 ? ` x ${num(it.qty)}` : ''}`, amount);
      return;
    }
    void i;
    w.text(c.sku && it.sku ? `${it.name} (${it.sku})` : it.name, { bold: true });
    const parts = [
      c.qty || c.rate ? `${c.qty ? num(it.qty) : ''}${c.qty && c.rate ? ' x ' : ''}${c.rate ? rs(it.rate) : ''}` : '',
      c.discount && it.discount ? `Disc ${rs(it.discount)}` : '',
      c.tax ? `GST ${it.gst}%` : '',
      c.hsn && it.hsn ? `HSN ${it.hsn}` : '',
    ].filter(Boolean);
    w.row(parts.join(' - '), amount);
  });
}

/**
 * The bill as ESC/POS commands, following the Bill Studio design element by element
 * (the same order, alignment, emphasis and texts as the on-screen design).
 */
export async function invoiceToEscPos(template: InvoiceTemplate, S: InvoiceData, seller: Seller, o: ReceiptOptions): Promise<Uint8Array> {
  const w = new ReceiptWriter(o);
  const due = Math.max(0, S.total - S.paid);
  const gst = Math.round((S.cgst + S.sgst + S.igst) * 100) / 100;
  const roundOff = Math.round((S.total - S.taxable - gst) * 100) / 100;
  const nameElsewhere = template.elements.some((e) => e.type === 'businessName');

  for (const el of template.elements) {
    const p = el.props;
    const align = p.align;
    const bold = p.fontWeight >= 600;
    if (p.marginTop >= 14 && el.type !== 'divider') w.feed(1);
    switch (el.type) {
      case 'logo': {
        const img = seller.logo ? await loadImage(seller.logo) : null;
        if (img && 'width' in img) w.image(pictureToBitmap(img as ImageBitmap, { maxDots: Math.min(Math.round(o.paperDots * 0.4), Math.round(p.fontSize * 3.6 * 2.4)), paperDots: o.paperDots, align }));
        else if (!nameElsewhere && seller.businessName) w.text(seller.businessName, { align, bold: true, ...sizeFor(16, seller.businessName, w.cols) });
        break;
      }
      case 'businessName':
        w.text(seller.businessName, { align, bold: true, ...sizeFor(p.fontSize, seller.businessName, w.cols) });
        break;
      case 'businessAddress':
        if (seller.address) w.text(seller.address, { align });
        if (seller.phone || seller.email) w.text([seller.phone, seller.email].filter(Boolean).join(' · '), { align });
        break;
      case 'gstin':
        if (seller.gstin) w.text(`GSTIN: ${seller.gstin}`, { align, bold });
        break;
      case 'title':
        w.text(p.text ?? 'TAX INVOICE', { align, bold: true, ...sizeFor(p.fontSize, p.text ?? '', w.cols) });
        break;
      case 'invoiceMeta':
        w.row('Bill No.', S.number);
        w.row('Date', format(new Date(S.date), 'dd/MM/yyyy, hh:mm a'));
        break;
      case 'customer':
        w.row('Customer', S.customer.name);
        if (S.customer.gstin) w.row('GSTIN', S.customer.gstin);
        break;
      case 'itemsTable':
        itemsTable(w, el, S);
        break;
      case 'taxSummary':
        w.row('Taxable value', rs(S.taxable));
        if (p.taxMode === 'inter') w.row('IGST', rs(S.igst || S.cgst + S.sgst));
        else {
          w.row('CGST', rs(S.cgst));
          w.row('SGST', rs(S.sgst));
        }
        break;
      case 'totals':
        w.rule();
        w.row('Subtotal', rs(S.subtotal));
        if (S.discount > 0) w.row('Discount', `-${rs(S.discount)}`);
        if (gst > 0) w.row('GST', rs(gst));
        if (Math.abs(roundOff) >= 0.01) w.row('Round off', `${roundOff < 0 ? '-' : ''}${rs(Math.abs(roundOff))}`);
        w.rule();
        w.row('TOTAL', rs(S.total), { bold: true, h: 2 });
        w.rule();
        if (S.payment && S.paid > 0) w.row(`Paid (${PAYMENT_LABEL[S.payment] ?? S.payment})`, rs(S.paid));
        if (!S.sample && due > 0 && S.payment) w.row('Balance due', rs(due), { bold: true });
        break;
      case 'amountInWords':
        w.text(`Amount in words: ${amountInWords(S.total)}`, { align });
        break;
      case 'paymentQr': {
        const amount = S.sample ? S.total : due;
        if (!seller.upiId || amount <= 0) break;
        await w.qr(upiLink(seller.upiId, seller.businessName, amount, S.number), align, Math.min(240, Math.round(o.paperDots * 0.55)));
        w.text(`Scan & pay ${rs(amount)} via UPI`, { align });
        break;
      }
      case 'bankDetails':
        if (!seller.bankAccount) break;
        w.text('BANK DETAILS', { align, bold: true });
        if (seller.bankName || seller.bankBranch) w.text([seller.bankName, seller.bankBranch].filter(Boolean).join(' · '), { align });
        w.text(`A/c ${seller.bankAccount}${seller.bankIfsc ? ` · IFSC ${seller.bankIfsc}` : ''}`, { align });
        break;
      case 'terms':
        if (!p.text) break;
        w.text('TERMS & CONDITIONS', { align, bold: true });
        w.text(p.text, { align });
        break;
      case 'signature':
        w.feed(2);
        w.text(`For ${seller.businessName}`, { align });
        w.text('Authorised Signatory', { align });
        break;
      case 'stamp':
        if (!S.sample && due > 0) break;
        w.text('*** PAID ***', { align, bold: true, w: 2, h: 2 });
        break;
      case 'footer':
      case 'customText':
        if (p.text) w.text(p.text, { align, bold });
        break;
      case 'barcode':
        await w.barcode(S.number, align);
        break;
      case 'divider':
        // The totals draw their own rule.
        if (template.elements[template.elements.indexOf(el) + 1]?.type !== 'totals') w.rule();
        break;
    }
  }
  return w.finish();
}

/** A kitchen order ticket as ESC/POS commands, following the KOT design in Bill Studio. */
export async function kotToEscPos(kot: Kot, business: string, d: KotDesign, o: ReceiptOptions): Promise<Uint8Array> {
  const w = new ReceiptWriter(o);
  const big = d.itemSize === 'normal' ? 1 : 2;
  if (d.showBusiness && business) w.text(business, { align: 'center' });
  if (d.header) w.text(d.header, { align: 'center', bold: true });
  if (d.title) w.text(d.title, { align: 'center', bold: true, w: 2, h: 2 });
  w.row(d.showKotNumber ? kot.number : '', kot.table, { bold: true });
  const type = kot.type.replace('-', ' ');
  if (d.showOrderType || d.showTime) w.row(d.showOrderType ? type.charAt(0).toUpperCase() + type.slice(1) : '', d.showTime ? format(new Date(kot.createdAt), 'dd MMM, h:mm a') : '');
  w.rule();
  for (const it of kot.items) {
    w.text(`${it.qty} x ${it.name}`, { bold: true, h: big, w: d.itemSize === 'xl' ? 2 : 1 });
    if (d.showNotes && it.note) w.text(`   Note: ${it.note}`);
  }
  if (d.showItemCount || d.footer) w.rule();
  if (d.showItemCount) w.text(`${kot.items.reduce((s, i) => s + i.qty, 0)} items`, { align: 'center' });
  if (d.footer) w.text(d.footer, { align: 'center' });
  return w.finish();
}

/** A test page that shows what this printer can do — to check a new printer (e.g. its width and character set). */
export async function testPageToEscPos(printerName: string, o: ReceiptOptions, label: string): Promise<Uint8Array> {
  const w = new ReceiptWriter(o);
  w.text('SAHAASRA', { align: 'center', bold: true, w: 2, h: 2 });
  w.text('Printer test', { align: 'center' });
  w.rule('=');
  w.row('Printer', printerName);
  w.row('Paper', label);
  w.row('Characters / line', String(w.cols));
  w.row('Time', format(new Date(), 'dd/MM/yyyy hh:mm a'));
  w.rule();
  w.text('Ruler (the last digit should be at the right edge):');
  w.p.line('1234567890'.repeat(Math.ceil(w.cols / 10)).slice(0, w.cols));
  w.rule();
  w.text('Left aligned');
  w.text('Centred', { align: 'center' });
  w.text('Right aligned', { align: 'right' });
  w.text('Bold text', { bold: true });
  w.p.underline(true).line('Underlined text').underline(false);
  w.text('Double size', { w: 2, h: 2, bold: true });
  w.rule();
  w.row('Amount', rs(1234.5));
  w.text('Rupee sign and Indian scripts (printed as a picture):');
  w.text('₹ 1,234.50 · हिंदी · বাংলা · தமிழ்', { align: 'center' });
  w.rule();
  await w.qr('https://sahaasra.in', 'center', 160);
  await w.barcode('TEST-0001', 'center');
  w.text('If everything above printed clearly, this printer is ready.', { align: 'center' });
  return w.finish();
}
