import { config } from '../config.js';
import { HttpError } from './http.js';

/**
 * VAAHAK API client. VAAHAK sends each bill on the business's own WhatsApp number (connected in
 * VAAHAK) and pays for it from the business's VAAHAK wallet. SAHAASRA only keeps the account ID and
 * the connection key (encrypted).
 */

export interface VaahakAccount {
  accountId: string;
  businessName: string;
  whatsapp: { connected: boolean; phone: string | null; verifiedName: string | null };
  template: { name: string; status: string; reason: string | null; body: string; footer: string };
  /** The same message with the bill PDF attached (older VAAHAK versions don't report it). */
  pdfTemplate?: { name: string; status: string; reason: string | null };
  wallet: { balance: number; expiresAt: string | null; pricePerBill: number; validDays: number };
}

export interface VaahakSendResult {
  billId: string;
  status: 'sent' | 'sending' | 'failed';
  code?: string;
  message?: string;
  waMessageId?: string | null;
  charged: number;
  balance: number;
  /** True when the bill PDF went with the message. */
  pdf?: boolean;
}

export interface VaahakBillStatus {
  billId: string;
  status: string;
  delivery: string | null;
  error: string | null;
  charged: number;
}

export interface VaahakCreds {
  accountId: string;
  key: string;
}

async function call<T>(creds: VaahakCreds, method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 30000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.VAAHAK_API_URL.replace(/\/+$/, '')}/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${creds.key}`,
        'x-vaahak-account': creds.accountId,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HttpError(502, 'Could not reach VAAHAK. Please try again in a minute.');
  }
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !json?.success) {
    const msg = json?.error?.message ?? `VAAHAK returned an error (${res.status}).`;
    throw new HttpError(res.status === 401 ? 400 : res.status === 429 ? 429 : 502, res.status === 401 ? `VAAHAK did not accept the connection: ${msg}` : msg);
  }
  return json.data as T;
}

/** Account, WhatsApp number, bill template status and wallet balance. */
export const vaahakAccount = (c: VaahakCreds, refreshTemplate = false) => call<VaahakAccount>(c, 'GET', `/account${refreshTemplate ? '?refresh=1' : ''}`, undefined, 60000);

export interface VaahakBill {
  billId: string;
  invoiceNo: string;
  customerName: string;
  to: string;
  amount: number;
  date?: string;
  businessName?: string;
  /** The bill PDF, base64 (sent attached once VAAHAK's PDF bill template is approved). */
  pdf?: string;
  pdfName?: string;
}

/** Sends one bill. Sending the same billId again never sends or charges twice. */
export const vaahakSendBill = (c: VaahakCreds, bill: VaahakBill) => call<VaahakSendResult>(c, 'POST', '/bills', bill, 60000);

export const vaahakBillStatuses = (c: VaahakCreds, billIds: string[]) =>
  billIds.length ? call<VaahakBillStatus[]>(c, 'GET', `/bills?ids=${billIds.map(encodeURIComponent).join(',')}`) : Promise.resolve([]);

/** Indian mobile numbers → 91XXXXXXXXXX; numbers already in international form are kept. */
export function waNumber(phone: string | null | undefined) {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) return `91${d}`;
  if (d.length >= 11 && d.length <= 15 && !d.startsWith('0')) return d;
  return null;
}
