import type { Customer, JobCard, JobStatus, Package, PaymentMethod, Product, ProductSerial, Purchase, Sale, SerialLookup, ServiceItem, Vendor } from '@/types';
import { api, resource } from './client';

export type ProductInput = Omit<Product, 'id' | 'variantGroup'>;
export type PackageInput = Omit<Package, 'id' | 'items'> & { items: Omit<Package['items'][number], 'name'>[] };

const products = resource<Product, ProductInput>('/products');

export const productsService = {
  ...products,
  duplicate: (id: string) => api.post<Product>(`/products/${id}/duplicate`),
  archive: (id: string) => api.post<Product>(`/products/${id}/archive`),
  setSoldOut: (id: string, soldOut: boolean) => api.post<Product>(`/products/${id}/sold-out`, { soldOut }),
  /** Creates one product per size × colour (each with its own SKU and stock). */
  createVariants: (input: ProductInput & { sizes: string[]; colours: string[] }) => api.post<Product[]>('/products/variants', input),
  /** IMEI / serial units of a tracked product. */
  serials: (id: string, status: 'in_stock' | 'sold' | 'removed' | 'all' = 'all') => api.get<ProductSerial[]>(`/products/${id}/serials`, { status }),
  addSerials: (id: string, serials: string[]) => api.post<{ added: number }>(`/products/${id}/serials`, { serials }),
  removeSerial: (id: string, serialId: string) => api.del<{ ok: true }>(`/products/${id}/serials/${serialId}`),
  /** Who bought a unit and whether it's under warranty. */
  lookupSerial: (q: string) => api.get<SerialLookup | null>('/serials/lookup', { q }),
};

export type JobCardInput = Omit<JobCard, 'id' | 'number' | 'status' | 'balance' | 'saleId' | 'invoiceNo' | 'deliveredAt' | 'createdBy' | 'createdAt' | 'customerId' | 'promisedAt' | 'advanceMethod'> & {
  customerId?: string | null;
  promisedAt?: string | null;
  advanceMethod?: 'cash' | 'upi' | 'card' | 'bank';
};

export const jobCardsService = {
  ...resource<JobCard, JobCardInput>('/job-cards'),
  setStatus: (id: string, status: Exclude<JobStatus, 'delivered'>) => api.patch<JobCard>(`/job-cards/${id}/status`, { status }),
  /** Bills the card's parts and labour (less the advance) and marks it delivered. */
  deliver: (id: string, input: { payment: 'cash' | 'upi' | 'card' | 'bank' | 'credit'; discount: number; serials: Record<string, string[]> }) =>
    api.post<{ job: JobCard; sale: Sale }>(`/job-cards/${id}/deliver`, input),
};

export const packagesService = resource<Package, PackageInput>('/packages');

export const catalogServicesService = resource<ServiceItem>('/services');

export interface PartyPayment {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
}

export interface PaymentInput {
  amount: number;
  method: 'cash' | 'upi' | 'card' | 'bank';
  date?: string;
  reference?: string;
}

type CustomerInput = Pick<Customer, 'name' | 'phone' | 'email' | 'city' | 'gstin' | 'tags'>;
type VendorInput = Pick<Vendor, 'name' | 'contact' | 'phone' | 'email' | 'city' | 'gstin' | 'category'>;

export const customersService = {
  ...resource<Customer, CustomerInput>('/customers'),
  profile: (id: string) =>
    api.get<{
      customer: Customer;
      invoices: Sale[];
      payments: PartyPayment[];
      activity: { id: string; label: string; at: string }[];
      notes: { id: string; text: string; author: string; at: string }[];
    }>(`/customers/${id}/profile`),
  /** Records money received; applied to the oldest unpaid invoices first. */
  recordPayment: (id: string, input: PaymentInput) => api.post<Customer>(`/customers/${id}/payments`, input),
  addNote: (id: string, text: string) => api.post<{ id: string; text: string; author: string; at: string }>(`/customers/${id}/notes`, { text }),
};

export const vendorsService = {
  ...resource<Vendor, VendorInput>('/vendors'),
  profile: (id: string) =>
    api.get<{ vendor: Vendor; bills: Purchase[]; payments: PartyPayment[]; productNames: string[]; documents: { id: string; name: string; size: string; at: string }[] }>(`/vendors/${id}/profile`),
  /** Records money paid to the vendor; applied to the oldest unpaid bills first. */
  recordPayment: (id: string, input: PaymentInput) => api.post<Vendor>(`/vendors/${id}/payments`, input),
};
