import { format } from 'date-fns';
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { Barcode, QrCode, upiLink } from '@/components/common/Codes';
import { LogoMark } from '@/components/layout/Logo';
import { amountInWords, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PAPER, SAMPLE_INVOICE, type InvoiceData, type InvoiceTemplate, type TemplateElement } from './model';

const InvoiceDataContext = createContext<InvoiceData>(SAMPLE_INVOICE);

const FONT: Record<InvoiceTemplate['font'], string> = {
  sans: '"Inter Variable", Inter, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: string }) {
  return (
    <div className="flex justify-between gap-4" style={{ fontWeight: strong ? 700 : undefined, color: strong ? accent : undefined }}>
      <span style={{ opacity: strong ? 1 : 0.7 }}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

export function ElementView({ el, template }: { el: TemplateElement; template: InvoiceTemplate }) {
  const live = useWorkspace();
  const S = useContext(InvoiceDataContext);
  // An issued invoice prints the business details saved with it; otherwise today's details.
  const ws = S.seller ? { ...S.seller, logo: S.seller.logo || undefined } : live;
  const p = el.props;
  const setting = (k: 'upiId' | 'bankName' | 'bankAccount' | 'bankIfsc' | 'bankBranch') =>
    S.seller ? S.seller[k] : typeof live.settings[k] === 'string' ? (live.settings[k] as string).trim() : '';
  const due = Math.max(0, S.total - S.paid);
  // Paise are shown where they exist, so tax lines add up exactly.
  const money = (v: number) => formatINR(v, Math.round(v * 100) % 100 !== 0);
  const gst = Math.round((S.cgst + S.sgst + S.igst) * 100) / 100;
  const roundOff = Math.round((S.total - S.taxable - gst) * 100) / 100;
  const thermal = template.paper.startsWith('thermal');
  const justify = p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start';
  const style: CSSProperties = { textAlign: p.align, fontSize: p.fontSize, fontWeight: p.fontWeight, marginTop: p.marginTop, color: p.color };
  const block = (children: ReactNode, extra?: CSSProperties) => <div style={{ ...style, ...extra }}>{children}</div>;

  switch (el.type) {
    case 'logo':
      return (
        <div style={{ ...style, display: 'flex', justifyContent: justify }}>
          {ws.logo ? <img src={ws.logo} alt="" style={{ height: p.fontSize * 3.6, width: p.fontSize * 3.6 }} className="rounded-lg object-cover" /> : <LogoMark className="!h-auto" />}
        </div>
      );
    case 'businessName':
      return block(ws.businessName, { color: p.color ?? template.accent, letterSpacing: '-0.01em', lineHeight: 1.15 });
    case 'businessAddress':
      return block(<span style={{ opacity: 0.75, whiteSpace: 'pre-line' }}>{ws.address}{`\n`}{ws.phone} · {ws.email}</span>);
    case 'gstin':
      // Unregistered businesses print no GSTIN line.
      if (!ws.gstin && !S.sample) return null;
      return block(<span><span style={{ opacity: 0.7 }}>GSTIN:</span> <b>{ws.gstin}</b></span>);
    case 'title':
      return block(p.text ?? 'TAX INVOICE', { letterSpacing: '0.18em', color: p.color ?? template.accent });
    case 'invoiceMeta':
      return block(
        thermal ? (
          <span>{S.number} · {format(new Date(S.date), 'dd/MM/yyyy HH:mm')}</span>
        ) : (
          <div style={{ display: 'inline-grid', gridTemplateColumns: 'auto auto', columnGap: 16, rowGap: 2, textAlign: 'left' }}>
            <span style={{ opacity: 0.7 }}>Invoice No.</span><b>{S.number}</b>
            <span style={{ opacity: 0.7 }}>Date</span><b>{format(new Date(S.date), 'dd MMM yyyy')}</b>
                      </div>
        ),
      );
    case 'customer':
      return block(
        <div>
          <div style={{ fontSize: '0.8em', fontWeight: 600, letterSpacing: '0.08em', opacity: 0.6 }}>BILL TO</div>
          <div style={{ fontWeight: 600 }}>{S.customer.name}</div>
          {!thermal && S.customer.address && <div style={{ opacity: 0.75 }}>{S.customer.address}</div>}
          {S.customer.gstin && <div style={{ opacity: 0.75 }}>GSTIN: {S.customer.gstin}</div>}
        </div>,
      );
    case 'itemsTable': {
      const c = p.columns ?? { sku: false, hsn: true, qty: true, rate: true, discount: false, tax: true };
      const cell = 'px-1.5 py-1';
      return (
        <table style={{ ...style, width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: thermal ? undefined : `${template.accent}14`, borderBottom: thermal ? '1px dashed #999' : undefined, fontSize: '0.85em' }}>
              <th className={cell} style={{ fontWeight: 600 }}>Item</th>
              {c.sku && <th className={cell}>SKU</th>}
              {c.hsn && <th className={cell}>HSN/SAC</th>}
              {c.qty && <th className={cn(cell, 'text-right')}>Qty</th>}
              {c.rate && <th className={cn(cell, 'text-right')}>Rate</th>}
              {c.discount && <th className={cn(cell, 'text-right')}>Disc.</th>}
              {c.tax && <th className={cn(cell, 'text-right')}>GST</th>}
              <th className={cn(cell, 'text-right')}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {S.items.map((it, idx) => (
              <tr key={idx} style={{ borderBottom: `1px ${thermal ? 'dashed #ccc' : 'solid #EFEBF7'}` }}>
                <td className={cell}>{it.name}</td>
                {c.sku && <td className={cell} style={{ opacity: 0.7 }}>{it.sku}</td>}
                {c.hsn && <td className={cell} style={{ opacity: 0.7 }}>{it.hsn}</td>}
                {c.qty && <td className={cn(cell, 'text-right')}>{it.qty}</td>}
                {c.rate && <td className={cn(cell, 'text-right')}>{formatINR(it.rate)}</td>}
                {c.discount && <td className={cn(cell, 'text-right')}>{it.discount ? formatINR(it.discount) : '—'}</td>}
                {c.tax && <td className={cn(cell, 'text-right')}>{it.gst}%</td>}
                <td className={cn(cell, 'text-right')} style={{ fontWeight: 500 }}>{formatINR(it.qty * it.rate - it.discount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'taxSummary':
      return (
        <div style={{ ...style, display: 'flex', justifyContent: justify }}>
          <div style={{ minWidth: thermal ? '100%' : 220 }}>
            <Row label="Taxable value" value={money(S.taxable)} />
            {p.taxMode === 'inter' ? <Row label="IGST" value={money(S.igst || S.cgst + S.sgst)} /> : <><Row label="CGST" value={money(S.cgst)} /><Row label="SGST" value={money(S.sgst)} /></>}
          </div>
        </div>
      );
    case 'totals':
      return (
        <div style={{ ...style, display: 'flex', justifyContent: justify }}>
          <div style={{ minWidth: thermal ? '100%' : 220 }}>
            <Row label="Subtotal" value={money(S.subtotal)} />
            {S.discount > 0 && <Row label="Discount" value={'− ' + money(S.discount)} />}
            {gst > 0 && <Row label="GST" value={money(gst)} />}
            {Math.abs(roundOff) >= 0.01 && <Row label="Round off" value={(roundOff < 0 ? '− ' : '') + money(Math.abs(roundOff))} />}
            <div style={{ borderTop: `1px ${thermal ? 'dashed' : 'solid'} ${thermal ? '#999' : template.accent}`, marginTop: 4, paddingTop: 4, fontSize: '1.25em' }}>
              <Row label="Grand Total" value={formatINR(S.total)} strong accent={thermal ? undefined : template.accent} />
            </div>
          </div>
        </div>
      );
    case 'amountInWords':
      return block(<span><span style={{ opacity: 0.7 }}>Amount in words: </span><i>{amountInWords(S.total)}</i></span>);
    case 'paymentQr': {
      const upiId = setting('upiId');
      const amount = S.sample ? S.total : due;
      if (!upiId) {
        if (!S.sample) return null;
        return block(<span style={{ opacity: 0.6, fontSize: '0.85em' }}>UPI QR appears here once you add your UPI ID in Settings → Payments.</span>);
      }
      // A paid invoice needs no payment QR.
      if (!S.sample && amount <= 0) return null;
      return (
        <div style={{ ...style, display: 'flex', justifyContent: justify, alignItems: 'center', gap: 10 }}>
          <QrCode value={upiLink(upiId, ws.businessName, amount, S.number)} className={thermal ? 'h-20 w-20' : 'h-24 w-24'} label={`UPI QR for ${formatINR(amount)}`} />
          {!thermal && <div style={{ fontSize: '0.9em' }}><b>Scan & pay {formatINR(amount)} via UPI</b><div style={{ opacity: 0.7 }}>{upiId}</div></div>}
        </div>
      );
    }
    case 'bankDetails': {
      const bank = { name: setting('bankName'), account: setting('bankAccount'), ifsc: setting('bankIfsc'), branch: setting('bankBranch') };
      if (!bank.account) {
        if (!S.sample) return null;
        return block(<span style={{ opacity: 0.6, fontSize: '0.85em' }}>Bank details appear here once you add them in Settings → Payments.</span>);
      }
      return block(
        <div style={{ display: 'inline-block', textAlign: 'left' }}>
          <div style={{ fontSize: '0.8em', fontWeight: 600, letterSpacing: '0.08em', opacity: 0.6 }}>BANK DETAILS</div>
          <div>{[bank.name, bank.branch].filter(Boolean).join(' · ')}</div>
          <div>A/c {bank.account}{bank.ifsc && ` · IFSC ${bank.ifsc}`}</div>
        </div>,
      );
    }
    case 'terms':
      return block(<div><div style={{ fontSize: '0.8em', fontWeight: 600, letterSpacing: '0.08em', opacity: 0.6 }}>TERMS & CONDITIONS</div><div style={{ whiteSpace: 'pre-line', opacity: 0.8 }}>{p.text}</div></div>);
    case 'signature':
      return (
        <div style={{ ...style, display: 'flex', justifyContent: justify }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ height: 40, width: 140 }} />
            <div style={{ borderTop: '1px solid #ccc', paddingTop: 2, fontSize: '0.85em' }}>For {ws.businessName}<br />Authorised Signatory</div>
          </div>
        </div>
      );
    case 'stamp':
      // The PAID stamp only appears on invoices that are fully paid.
      if (!S.sample && due > 0) return null;
      return (
        <div style={{ ...style, display: 'flex', justifyContent: justify }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', border: `2px solid ${template.accent}`, color: template.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 9, fontWeight: 700, transform: 'rotate(-12deg)', opacity: 0.75, padding: 8 }}>
            {ws.businessName.toUpperCase()}<br />★ PAID ★
          </div>
        </div>
      );
    case 'footer':
      return block(<span style={{ opacity: 0.75 }}>{p.text}</span>);
    case 'customText':
      return block(<span style={{ whiteSpace: 'pre-line' }}>{p.text}</span>);
    case 'barcode':
      return <div style={{ ...style, display: 'flex', justifyContent: justify }}><Barcode value={S.number} /></div>;
    case 'divider':
      return <hr style={{ marginTop: p.marginTop, border: 0, borderTop: `1px ${thermal ? 'dashed #999' : `solid ${template.accent}33`}` }} />;
  }
}

interface PaperProps {
  template: InvoiceTemplate;
  children: ReactNode;
  className?: string;
}

/** The physical page — white regardless of app theme, like real paper. */
export function Paper({ template, children, className }: PaperProps) {
  const size = PAPER[template.paper];
  const thermal = template.paper.startsWith('thermal');
  return (
    <div
      className={cn('relative bg-white text-[#171522] shadow-[0_8px_30px_-10px_rgba(30,20,70,0.25)]', thermal ? 'rounded-sm' : 'rounded', className)}
      style={{ width: size.width, minHeight: size.minHeight, padding: thermal ? 14 : template.paper === 'A5' ? 28 : 44, fontFamily: FONT[template.font] }}
    >
      {template.watermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden>
          <span style={{ transform: 'rotate(-30deg)', fontSize: size.width / 7, fontWeight: 800, color: template.accent, opacity: 0.06, whiteSpace: 'nowrap' }}>{template.watermark}</span>
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/** Renders a template — with the sample invoice in the designer, or a real invoice when printing. */
export function InvoiceRenderer({ template, data = SAMPLE_INVOICE }: { template: InvoiceTemplate; data?: InvoiceData }) {
  return (
    <InvoiceDataContext.Provider value={data}>
      <Paper template={template}>
        {template.elements.map((el) => (
          <ElementView key={el.id} el={el} template={template} />
        ))}
      </Paper>
    </InvoiceDataContext.Provider>
  );
}
