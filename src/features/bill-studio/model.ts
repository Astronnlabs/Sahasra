import {
  AlignLeft,
  Banknote,
  Barcode,
  Building2,
  CalendarDays,
  FileSignature,
  Hash,
  Image,
  Landmark,
  ListOrdered,
  Mail,
  MapPin,
  Phone,
  Minus,
  PenLine,
  QrCode,
  Receipt,
  ScrollText,
  Sigma,
  Stamp,
  Type,
  UserRound,
  Droplets,
  type LucideIcon,
} from 'lucide-react';
import type { Sale } from '@/types';

export type PaperSize = 'A4' | 'A5' | 'thermal80' | 'thermal58';
export type Align = 'left' | 'center' | 'right';

export type ElementType =
  | 'logo'
  | 'businessName'
  | 'businessAddress'
  | 'phone'
  | 'email'
  | 'gstin'
  | 'title'
  | 'invoiceMeta'
  | 'customer'
  | 'itemsTable'
  | 'taxSummary'
  | 'totals'
  | 'amountInWords'
  | 'paymentQr'
  | 'bankDetails'
  | 'terms'
  | 'signature'
  | 'stamp'
  | 'footer'
  | 'customText'
  | 'barcode'
  | 'divider';

export interface TableColumns {
  sku: boolean;
  hsn: boolean;
  qty: boolean;
  rate: boolean;
  discount: boolean;
  tax: boolean;
}

export interface ElementProps {
  align: Align;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  marginTop: number;
  color?: string;
  text?: string;
  /** Phone / email elements: the label printed before the value ("Ph:", "Call us:"…). */
  label?: string;
  columns?: TableColumns;
  /** CGST+SGST vs IGST */
  taxMode?: 'intra' | 'inter';
}

export interface TemplateElement {
  id: string;
  type: ElementType;
  props: ElementProps;
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  paper: PaperSize;
  accent: string;
  font: 'sans' | 'serif' | 'mono';
  watermark: string;
  elements: TemplateElement[];
  isDefault: boolean;
  updatedAt: string;
}

export const PAPER: Record<PaperSize, { label: string; width: number; minHeight: number; note: string }> = {
  A4: { label: 'A4', width: 794, minHeight: 1123, note: '210 × 297 mm' },
  A5: { label: 'A5', width: 559, minHeight: 794, note: '148 × 210 mm' },
  thermal80: { label: 'Thermal 80mm', width: 302, minHeight: 500, note: 'Receipt printer' },
  thermal58: { label: 'Thermal 58mm', width: 219, minHeight: 420, note: 'Compact receipt' },
};

export const ACCENTS = ['#6D3DE8', '#171522', '#1F6FEB', '#0F8A5F', '#C2410C', '#B4235A'];

export const ELEMENT_LIBRARY: { group: string; items: { type: ElementType; label: string; icon: LucideIcon; repeatable?: boolean }[] }[] = [
  {
    group: 'Header',
    items: [
      { type: 'logo', label: 'Logo', icon: Image },
      { type: 'businessName', label: 'Business name', icon: Building2 },
      { type: 'businessAddress', label: 'Business address', icon: MapPin },
      { type: 'phone', label: 'Phone number', icon: Phone },
      { type: 'email', label: 'Email', icon: Mail },
      { type: 'gstin', label: 'GSTIN', icon: Landmark },
      { type: 'title', label: 'Invoice title', icon: Type },
      { type: 'invoiceMeta', label: 'Invoice no. & date', icon: CalendarDays },
    ],
  },
  { group: 'Party', items: [{ type: 'customer', label: 'Customer & GSTIN', icon: UserRound }] },
  {
    group: 'Items & tax',
    items: [
      { type: 'itemsTable', label: 'Product table', icon: ListOrdered },
      { type: 'taxSummary', label: 'CGST / SGST / IGST', icon: Receipt },
      { type: 'totals', label: 'Subtotal & grand total', icon: Sigma },
      { type: 'amountInWords', label: 'Amount in words', icon: Hash },
    ],
  },
  {
    group: 'Payment',
    items: [
      { type: 'paymentQr', label: 'Payment QR', icon: QrCode },
      { type: 'bankDetails', label: 'Bank details', icon: Banknote },
    ],
  },
  {
    group: 'Footer',
    items: [
      { type: 'terms', label: 'Terms', icon: ScrollText },
      { type: 'signature', label: 'Signature', icon: PenLine },
      { type: 'stamp', label: 'Stamp', icon: Stamp },
      { type: 'footer', label: 'Footer', icon: FileSignature },
    ],
  },
  {
    group: 'Extras',
    items: [
      { type: 'customText', label: 'Custom text', icon: AlignLeft, repeatable: true },
      { type: 'barcode', label: 'Barcode', icon: Barcode },
      { type: 'divider', label: 'Divider', icon: Minus, repeatable: true },
    ],
  },
];

export const ELEMENT_META = Object.fromEntries(ELEMENT_LIBRARY.flatMap((g) => g.items).map((i) => [i.type, i])) as Record<ElementType, (typeof ELEMENT_LIBRARY)[number]['items'][number]>;

export const WATERMARK_ICON = Droplets;

const DEFAULT_TEXT: Partial<Record<ElementType, string>> = {
  title: 'TAX INVOICE',
  terms: '1. Goods once sold will not be taken back.\n2. E. & O.E.',
  footer: 'Thank you for your business!',
  customText: 'Add your custom message here',
};

export function defaultProps(type: ElementType, paper: PaperSize = 'A4'): ElementProps {
  const thermal = paper.startsWith('thermal');
  const base: ElementProps = { align: thermal ? 'center' : 'left', fontSize: thermal ? 11 : 12, fontWeight: 400, marginTop: thermal ? 6 : 10, text: DEFAULT_TEXT[type] };
  switch (type) {
    case 'businessName':
      return { ...base, fontSize: thermal ? 15 : 22, fontWeight: 700, marginTop: thermal ? 4 : 6 };
    case 'title':
      return { ...base, align: thermal ? 'center' : 'right', fontSize: thermal ? 12 : 13, fontWeight: 700, marginTop: thermal ? 8 : 0 };
    case 'itemsTable':
      return { ...base, marginTop: 16, columns: { sku: false, hsn: !thermal, qty: true, rate: true, discount: false, tax: !thermal } };
    case 'totals':
      return { ...base, align: thermal ? 'center' : 'right', fontWeight: 500 };
    case 'taxSummary':
      return { ...base, align: thermal ? 'center' : 'right', taxMode: 'intra' };
    case 'footer':
      return { ...base, align: 'center', fontSize: thermal ? 10 : 11, marginTop: 20 };
    case 'signature':
    case 'stamp':
      return { ...base, align: 'right', marginTop: 24 };
    case 'divider':
      return { ...base, marginTop: 8 };
    default:
      return base;
  }
}

export function makeElement(type: ElementType, paper: PaperSize = 'A4'): TemplateElement {
  return { id: `${type}_${Math.random().toString(36).slice(2, 8)}`, type, props: defaultProps(type, paper) };
}

function build(paper: PaperSize, types: ElementType[], overrides: Partial<Record<ElementType, Partial<ElementProps>>> = {}): TemplateElement[] {
  return types.map((t) => {
    const el = makeElement(t, paper);
    return { ...el, props: { ...el.props, ...overrides[t] } };
  });
}

const now = new Date().toISOString();

export const PRESET_TEMPLATES: InvoiceTemplate[] = [
  {
    id: 'tpl_classic',
    name: 'Classic A4',
    paper: 'A4',
    accent: '#6D3DE8',
    font: 'sans',
    watermark: '',
    isDefault: true,
    updatedAt: now,
    elements: build('A4', ['logo', 'businessName', 'businessAddress', 'phone', 'email', 'gstin', 'title', 'invoiceMeta', 'divider', 'customer', 'itemsTable', 'taxSummary', 'totals', 'amountInWords', 'paymentQr', 'bankDetails', 'terms', 'signature', 'footer']),
  },
  {
    id: 'tpl_modern',
    name: 'Modern Minimal',
    paper: 'A4',
    accent: '#171522',
    font: 'sans',
    watermark: '',
    isDefault: false,
    updatedAt: now,
    elements: build('A4', ['title', 'businessName', 'businessAddress', 'phone', 'email', 'gstin', 'invoiceMeta', 'customer', 'itemsTable', 'totals', 'amountInWords', 'bankDetails', 'footer'], {
      title: { align: 'left', fontSize: 28, fontWeight: 700 },
      businessName: { fontSize: 16, marginTop: 16 },
    }),
  },
  {
    id: 'tpl_service_a5',
    name: 'Service A5',
    paper: 'A5',
    accent: '#1F6FEB',
    font: 'sans',
    watermark: '',
    isDefault: false,
    updatedAt: now,
    elements: build('A5', ['logo', 'businessName', 'phone', 'gstin', 'title', 'invoiceMeta', 'customer', 'itemsTable', 'taxSummary', 'totals', 'paymentQr', 'signature', 'footer'], {
      businessName: { fontSize: 18 },
    }),
  },
  {
    id: 'tpl_thermal80',
    name: 'Retail Thermal 80mm',
    paper: 'thermal80',
    accent: '#171522',
    font: 'mono',
    watermark: '',
    isDefault: false,
    updatedAt: now,
    elements: build('thermal80', ['logo', 'businessName', 'businessAddress', 'phone', 'gstin', 'divider', 'title', 'invoiceMeta', 'customer', 'divider', 'itemsTable', 'totals', 'taxSummary', 'paymentQr', 'footer', 'barcode'], {
      logo: { fontSize: 16 },
    }),
  },
  {
    id: 'tpl_thermal58',
    name: 'Compact Thermal 58mm',
    paper: 'thermal58',
    accent: '#171522',
    font: 'mono',
    watermark: '',
    isDefault: false,
    updatedAt: now,
    elements: build('thermal58', ['logo', 'businessName', 'businessAddress', 'phone', 'gstin', 'divider', 'invoiceMeta', 'divider', 'itemsTable', 'totals', 'footer'], {
      logo: { fontSize: 14 },
      businessAddress: { fontSize: 10 },
      phone: { fontSize: 10, marginTop: 2 },
    }),
  },
];

/** Everything a template needs to render one invoice. */
export interface InvoiceData {
  /** True for the designer's placeholder invoice. */
  sample: boolean;
  number: string;
  date: string;
  customer: { name: string; gstin?: string; phone?: string; address?: string };
  items: { name: string; sku: string; hsn: string; qty: number; rate: number; discount: number; gst: number }[];
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  paid: number;
  /** How the bill was paid (cash, upi, card…), for issued invoices. */
  payment?: string;
  notes?: string;
  /** Seller details saved with the invoice; when absent the current business details are used. */
  seller?: SellerSnapshot;
}

/** The business details printed on an invoice, as they were on the day it was issued. */
export interface SellerSnapshot {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  logo: string;
  upiId: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankBranch: string;
  /** The saved design used for the invoice (null when a built-in design was the default). */
  template: Omit<InvoiceTemplate, 'isDefault' | 'updatedAt'> | null;
}

/** Placeholder invoice for the designer preview. 1,500 taxable @ 18% = ₹1,770. */
export const SAMPLE_INVOICE: InvoiceData = {
  sample: true,
  number: 'INV-0001',
  date: new Date().toISOString(),
  customer: { name: 'Customer Name', gstin: 'Customer GSTIN', phone: 'Phone', address: 'Customer address' },
  items: [
    { name: 'Sample item 1', sku: 'SKU-0001', hsn: '0000', qty: 1, rate: 1200, discount: 0, gst: 18 },
    { name: 'Sample item 2', sku: 'SKU-0002', hsn: '0000', qty: 2, rate: 160, discount: 20, gst: 18 },
  ],
  subtotal: 1520,
  discount: 20,
  taxable: 1500,
  cgst: 135,
  sgst: 135,
  igst: 0,
  total: 1770,
  paid: 0,
};

/** Converts a saved sale into template data (intra-state: tax split into CGST + SGST). */
export function saleToInvoiceData(sale: Sale, customer?: { gstin?: string; phone?: string; city?: string }): InvoiceData {
  const tax = Math.round(sale.tax * 100) / 100;
  const cgst = Math.round((tax / 2) * 100) / 100;
  return {
    sample: false,
    number: sale.invoiceNo,
    date: sale.date,
    customer: { name: sale.customerName, gstin: customer?.gstin, phone: customer?.phone, address: customer?.city },
    items: sale.items.map((i) => ({ name: i.packageName ? `${i.packageName}: ${i.name}` : i.name, sku: i.sku ?? '', hsn: i.hsn ?? '', qty: i.qty, rate: i.rate, discount: i.discount, gst: i.gstRate })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    taxable: sale.subtotal - sale.discount,
    cgst,
    sgst: Math.round((tax - cgst) * 100) / 100,
    igst: 0,
    total: sale.total,
    paid: sale.paid,
    payment: sale.payment,
    seller: sale.seller,
  };
}
