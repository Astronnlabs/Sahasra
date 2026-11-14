import { api } from './client';

export type TemplateStatus = 'NOT_CREATED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | string;

/** The connected VAAHAK account, read live from VAAHAK. */
export interface VaahakAccount {
  accountId: string;
  businessName: string;
  whatsapp: { connected: boolean; phone: string | null; verifiedName: string | null };
  template: { name: string; status: TemplateStatus; reason: string | null; body: string; footer: string };
  /** The same message with the bill PDF attached. */
  pdfTemplate?: { name: string; status: TemplateStatus; reason: string | null };
  wallet: { balance: number; expiresAt: string | null; pricePerBill: number; validDays: number };
}

export interface EBillingState {
  enabled: boolean;
  /** False until the server has its encryption key configured. */
  serverReady: boolean;
  link: { accountId: string; keyPrefix: string; businessName: string; connectedAt: string } | null;
  account: VaahakAccount | null;
  /** Why VAAHAK could not be read right now (connection still saved). */
  accountError: string | null;
}

export interface BillMessageRow {
  id: string;
  invoiceNo: string;
  customer: string;
  to: string;
  status: 'sending' | 'sent' | 'failed' | 'skipped';
  /** WhatsApp delivery: sent | delivered | read | failed */
  delivery: string | null;
  error: string | null;
  charged: number;
  createdAt: string;
}

export const ebillingService = {
  get: (refresh = false) => api.get<EBillingState>(refresh ? '/ebilling?refresh=1' : '/ebilling'),
  connect: (input: { accountId: string; key: string }) => api.put<EBillingState>('/ebilling/connect', input),
  disconnect: () => api.del<EBillingState>('/ebilling/connect'),
  sendTest: (phone: string) => api.post<{ ok: true; charged: number; balance: number }>('/ebilling/test', { phone }),
  messages: () => api.get<BillMessageRow[]>('/ebilling/messages'),
};
