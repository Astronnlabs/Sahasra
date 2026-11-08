import { api } from './client';

export type TemplateStatus = 'NOT_CREATED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | string;

export interface EBillingState {
  enabled: boolean;
  /** ₹ deducted from the wallet for each bill sent. */
  price: number;
  /** False until the server has its encryption key configured. */
  serverReady: boolean;
  template: { name: string; preview: string; footer: string; example: string[] };
  setup: {
    phoneNumberId: string;
    wabaId: string;
    displayPhone: string;
    verifiedName: string;
    templateStatus: TemplateStatus;
    templateReason: string | null;
    connectedAt: string;
  } | null;
}

export interface BillMessageRow {
  id: string;
  invoiceNo: string;
  customer: string;
  to: string;
  status: 'sending' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  charged: number;
  createdAt: string;
}

export interface WalletTxnRow {
  id: string;
  kind: 'topup' | 'charge' | 'refund' | 'expired' | 'adjustment';
  amount: number;
  balanceAfter: number;
  description: string;
  reference: string | null;
  createdAt: string;
}

export interface WalletState {
  balance: number;
  /** When the whole balance expires (null when empty). */
  expiresAt: string | null;
  price: number;
  validDays: number;
  canRecharge: boolean;
  thisMonth: { messages: number; spent: number };
  txns: WalletTxnRow[];
}

export const ebillingService = {
  get: () => api.get<EBillingState>('/ebilling'),
  connect: (input: { phoneNumberId: string; wabaId: string; accessToken: string }) => api.put<EBillingState>('/ebilling/setup', input),
  refreshTemplate: () => api.post<EBillingState>('/ebilling/template'),
  disconnect: () => api.del<EBillingState>('/ebilling/setup'),
  sendTest: (phone: string) => api.post<{ ok: true; charged: number }>('/ebilling/test', { phone }),
  messages: () => api.get<BillMessageRow[]>('/ebilling/messages'),
};

export const walletService = {
  get: () => api.get<WalletState>('/wallet'),
  /** Starts a PayU payment; the browser then posts `fields` to `action`. */
  startTopup: (amount: number) => api.post<{ action: string; fields: Record<string, string> }>('/wallet/topup', { amount }),
  /** Sahasra support only. */
  addCredit: (amount: number, note: string) => api.post<{ balance: number }>('/wallet/adjust', { amount, note }),
};

/** Sends the browser to PayU's secure checkout page. */
export function goToPayU(form: { action: string; fields: Record<string, string> }) {
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = form.action;
  for (const [name, value] of Object.entries(form.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    f.appendChild(input);
  }
  document.body.appendChild(f);
  f.submit();
}
