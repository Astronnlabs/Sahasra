import type { Expense, LineItem, PaymentMethod, Product, Purchase, ReturnRecord, Sale, StockMovement, VendorSupply, Warehouse } from '@/types';
import { api, resource } from './client';
import { announceSale } from './saleEvents';

/** A POS line. Prices and tax are looked up on the server from the catalogue. */
export interface CheckoutLine {
  productId?: string;
  serviceId?: string;
  packageId?: string;
  /** "Sell as" option name (Half, Full, Box of 10…). */
  option?: string;
  addons?: string[];
  /** IMEI / serial of each unit, for tracked items. */
  serials?: string[];
  name: string;
  qty: number;
  discount: number;
  /** Employee who gave the service (salons). */
  staffId?: string;
  /** Packages: employee per service inside, by service id. */
  staffFor?: Record<string, string>;
}

export interface CheckoutInput {
  customerId?: string;
  customerName: string;
  items: CheckoutLine[];
  /** Discount on the whole bill, on top of line discounts. */
  billDiscount: number;
  /** "trade" uses trade (contractor / wholesale) prices where set. */
  priceList?: 'retail' | 'trade';
  payment: PaymentMethod;
  branch: string;
  notes?: string;
}

export interface BillStaff {
  id: string;
  name: string;
  designation: string;
}
/** Active staff who can be named as "done by" on a bill. */
export const billStaffService = { list: () => api.get<BillStaff[]>('/pos/staff') };

export const salesService = {
  list: () => api.get<Sale[]>('/sales'),
  /** The server prices items from the catalogue and computes tax and totals. */
  checkout: (input: CheckoutInput) => api.post<Sale>('/sales/checkout', input).then(announceSale),
  /** The bill PDF for the customer's WhatsApp e-bill (sent with the message). */
  attachEbillPdf: (id: string, pdf: string) => api.post<{ accepted: boolean }>(`/sales/${id}/ebill-pdf`, { pdf }),
  /** Whether the bill went out on WhatsApp: none | sending | sent | failed | skipped. */
  ebillStatus: (id: string) => api.get<{ status: 'none' | 'sending' | 'sent' | 'failed' | 'skipped'; to: string; error: string | null }>(`/sales/${id}/ebill`),
  refund: (id: string, reason?: string) => api.post<Sale>(`/sales/${id}/refund`, { reason }),
  markReturned: (id: string, reason?: string) => api.post<Sale>(`/sales/${id}/return`, { reason }),
  returns: () => api.get<ReturnRecord[]>('/sales/returns'),
};

export interface PurchaseInput {
  vendorId: string;
  billNo: string;
  date: string;
  status: 'received' | 'ordered';
  items: (Omit<LineItem, 'id'> & { productId: string })[];
  notes?: string;
  /** IMEI / serial numbers received, by product (tracked items only). */
  serials?: Record<string, string[]>;
}

export const purchasesService = {
  list: () => api.get<Purchase[]>('/purchases'),
  record: (input: PurchaseInput) => api.post<Purchase>('/purchases', input),
  receive: (id: string, serials: Record<string, string[]> = {}) => api.post<Purchase>(`/purchases/${id}/receive`, { serials }),
  returns: () => api.get<ReturnRecord[]>('/purchases/returns'),
  /** A received bill is reversed (stock out, vendor dues reduced). */
  remove: (id: string) => api.del<{ id: string }>(`/purchases/${id}`),
};

export const EXPENSE_CATEGORIES: Expense['category'][] = ['Rent', 'Salary', 'Electricity', 'Marketing', 'Transport', 'Maintenance', 'Office', 'Miscellaneous'];

export type ExpenseInput = Omit<Expense, 'id' | 'receipt' | 'receiptUrl'> & { receiptUploadId?: string | null };

export const expensesService = resource<Expense, ExpenseInput>('/expenses');

export const inventoryService = {
  overview: () =>
    api.get<{
      totalValue: number;
      low: Product[];
      out: Product[];
      expiring: Product[];
      byCategory: { category: string; value: number }[];
      flow: { label: string; inward: number; outward: number }[];
      items: Product[];
    }>('/inventory/overview'),
  movements: () => api.get<StockMovement[]>('/inventory/movements'),
  warehouses: () => api.get<Warehouse[]>('/inventory/warehouses'),
  /** Vendors with the stock each has supplied. */
  vendors: () => api.get<VendorSupply[]>('/inventory/vendors'),
  /** `vendorId` (optional) records who supplied stock being added. */
  adjust: (input: { productId: string; qty: number; reason: string; warehouse: string; vendorId?: string | null }) => api.post<Product>('/inventory/adjust', input),
};

export interface UploadedFile {
  id: string;
  fileName: string;
  url: string;
}

export const uploadsService = {
  upload: (file: File, purpose?: 'logo' | 'receipt' | 'image') => api.upload<UploadedFile>('/uploads', file, { purpose }),
};
