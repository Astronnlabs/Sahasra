import { config } from '../config.js';
import { HttpError } from './http.js';

/**
 * WhatsApp Business Platform (Cloud API) calls, using the business's own number and token.
 * Bills go out as an approved UTILITY template — business-initiated messages need one.
 */

export const BILL_TEMPLATE = {
  name: 'sahasra_bill_thank_you',
  language: 'en',
  category: 'UTILITY',
  body:
    'Hi {{1}}, thank you for your purchase at {{2}}!\n\n' +
    'Bill no: {{3}}\n' +
    'Amount: Rs. {{4}}\n' +
    'Date: {{5}}\n\n' +
    'Please keep this message for your records.',
  example: ['Rahul', 'B.tech Biriyani', 'INV-0042', '1,250', '08 Nov 2026, 1:15 pm'],
  footer: 'Sent via SAHASRA',
} as const;

const graphUrl = (path: string) => `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${path.replace(/^\//, '')}`;

/** Calls the Graph API and turns Meta's error into a readable message. */
async function graph<T>(path: string, token: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(graphUrl(path), {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, 'Could not reach WhatsApp (Meta). Please try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; error_user_msg?: string; error_user_title?: string; code?: number } } & T;
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    const msg = e.error_user_msg || e.message || `WhatsApp returned ${res.status}`;
    // 190 = invalid / expired token.
    throw new HttpError(e.code === 190 ? 400 : 502, e.code === 190 ? `The WhatsApp access token is invalid or has expired. ${msg}` : `WhatsApp: ${msg}`);
  }
  return data;
}

/** Confirms the token can use this phone number and that it belongs to the WhatsApp Business Account. */
export async function verifyNumber(phoneNumberId: string, wabaId: string, token: string) {
  const phone = await graph<{ id: string; display_phone_number?: string; verified_name?: string }>(`${phoneNumberId}?fields=display_phone_number,verified_name`, token);
  const list = await graph<{ data: { id: string }[] }>(`${wabaId}/phone_numbers?fields=id&limit=100`, token);
  if (!list.data?.some((p) => p.id === phoneNumberId)) {
    throw new HttpError(400, 'This Phone Number ID does not belong to that WhatsApp Business Account ID.');
  }
  return { displayPhone: phone.display_phone_number ?? '', verifiedName: phone.verified_name ?? '' };
}

type TemplateRow = { id: string; name: string; status: string; language: string; rejected_reason?: string };

/** Current status of the bill template on this account, or null when it has not been created. */
export async function templateStatus(wabaId: string, token: string) {
  const r = await graph<{ data: TemplateRow[] }>(`${wabaId}/message_templates?name=${BILL_TEMPLATE.name}&fields=id,name,status,language,rejected_reason&limit=20`, token);
  const row = r.data?.find((t) => t.name === BILL_TEMPLATE.name && t.language === BILL_TEMPLATE.language);
  if (!row) return null;
  const reason = row.rejected_reason && row.rejected_reason !== 'NONE' ? row.rejected_reason : null;
  return { status: row.status.toUpperCase(), reason };
}

/** Creates the thank-you template on the business's account (Meta reviews it, usually within minutes). */
export async function createTemplate(wabaId: string, token: string) {
  const r = await graph<{ id: string; status?: string }>(`${wabaId}/message_templates`, token, {
    method: 'POST',
    body: {
      name: BILL_TEMPLATE.name,
      language: BILL_TEMPLATE.language,
      category: BILL_TEMPLATE.category,
      components: [
        { type: 'BODY', text: BILL_TEMPLATE.body, example: { body_text: [BILL_TEMPLATE.example] } },
        { type: 'FOOTER', text: BILL_TEMPLATE.footer },
      ],
    },
  });
  return { status: (r.status ?? 'PENDING').toUpperCase(), reason: null as string | null };
}

/** Indian mobile numbers → 91XXXXXXXXXX; numbers already in international form are kept. */
export function waNumber(phone: string | null | undefined) {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) return `91${d}`;
  if (d.length >= 11 && d.length <= 15 && !d.startsWith('0')) return d;
  return null;
}

/** Template parameters may not contain new lines, tabs or long runs of spaces. */
const param = (v: string) => v.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 120) || '-';

export interface BillParams {
  customer: string;
  business: string;
  invoiceNo: string;
  amount: number;
  date: Date;
}

export function billParamValues(p: BillParams) {
  const amount = p.amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const date = p.date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return [p.customer, p.business, p.invoiceNo, amount, date].map(param);
}

/** Sends the bill template. Returns WhatsApp's message id. */
export async function sendBillTemplate(phoneNumberId: string, token: string, to: string, p: BillParams) {
  const r = await graph<{ messages?: { id: string }[] }>(`${phoneNumberId}/messages`, token, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: BILL_TEMPLATE.name,
        language: { code: BILL_TEMPLATE.language },
        components: [{ type: 'body', parameters: billParamValues(p).map((text) => ({ type: 'text', text })) }],
      },
    },
  });
  const id = r.messages?.[0]?.id;
  if (!id) throw new HttpError(502, 'WhatsApp did not accept the message.');
  return id;
}
