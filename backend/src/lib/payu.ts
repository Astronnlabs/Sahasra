import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from './http.js';

/**
 * PayU hosted checkout (wallet recharge).
 * The browser posts a signed form to PayU; PayU posts the result back to our return URL,
 * where the response hash is checked and the payment is confirmed with PayU's verify API
 * before any money is added to a wallet.
 */

const HOSTS = {
  live: { pay: 'https://secure.payu.in/_payment', verify: 'https://info.payu.in/merchant/postservice?form=2' },
  test: { pay: 'https://test.payu.in/_payment', verify: 'https://test.payu.in/merchant/postservice?form=2' },
};

export const payuReady = () => !!config.PAYU_KEY && !!config.PAYU_SALT;

function creds() {
  if (!config.PAYU_KEY || !config.PAYU_SALT) throw new HttpError(503, 'Online recharge is not set up on the server yet. Please contact Sahasra support.');
  return { key: config.PAYU_KEY, salt: config.PAYU_SALT, hosts: HOSTS[config.PAYU_MODE] };
}

const sha512 = (s: string) => crypto.createHash('sha512').update(s, 'utf8').digest('hex');

/** PayU rejects most punctuation in these fields. */
const clean = (v: string, max: number) => v.replace(/[^A-Za-z0-9 .@_+-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export interface CheckoutInput {
  txnid: string;
  amount: string; // "500.00" — the exact string is part of the hash
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  tenantId: string;
  returnUrl: string;
}

/** The form fields (with hash) the browser posts to PayU. */
export function checkoutForm(i: CheckoutInput) {
  const { key, salt, hosts } = creds();
  const f = {
    key,
    txnid: i.txnid,
    amount: i.amount,
    productinfo: clean(i.productinfo, 100),
    firstname: clean(i.firstname, 60) || 'Customer',
    email: clean(i.email, 80) || 'billing@sahasra.app',
    phone: i.phone.replace(/\D/g, '').slice(-10),
    udf1: i.tenantId,
    udf2: '',
    udf3: '',
    udf4: '',
    udf5: '',
    surl: i.returnUrl,
    furl: i.returnUrl,
  };
  // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
  const hash = sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1, f.udf2, f.udf3, f.udf4, f.udf5, '', '', '', '', '', salt].join('|'));
  return { action: hosts.pay, fields: { ...f, hash } };
}

/** Checks the hash PayU sends back with the result (proves the post came from PayU). */
export function responseHashValid(p: Record<string, string | undefined>) {
  const { key, salt } = creds();
  const g = (k: string) => p[k] ?? '';
  // sha512([additionalCharges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
  const parts = [salt, g('status'), '', '', '', '', '', g('udf5'), g('udf4'), g('udf3'), g('udf2'), g('udf1'), g('email'), g('firstname'), g('productinfo'), g('amount'), g('txnid'), key];
  if (p.additionalCharges) parts.unshift(p.additionalCharges);
  const expected = sha512(parts.join('|'));
  const got = g('hash').toLowerCase();
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

const FINAL_FAILURES = new Set(['failure', 'failed', 'dropped', 'bounced', 'usercancelled', 'cancelled', 'cancel']);

/** Asks PayU directly for the status of a transaction: success, failed, or still pending. */
export async function verifyPayment(txnid: string) {
  const { key, salt, hosts } = creds();
  const body = new URLSearchParams({ key, command: 'verify_payment', var1: txnid, hash: sha512([key, 'verify_payment', txnid, salt].join('|')) });
  const res = await fetch(hosts.verify, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body, signal: AbortSignal.timeout(20000) });
  const data = (await res.json().catch(() => null)) as { status?: number; transaction_details?: Record<string, { status?: string; amt?: string; amount?: string; transaction_amount?: string; mihpayid?: string; mode?: string; error_Message?: string }> } | null;
  const d = data?.transaction_details?.[txnid];
  if (!d) return { status: 'pending' as const, amount: NaN };
  const amount = Number(d.transaction_amount ?? d.amt ?? d.amount ?? NaN);
  const s = (d.status ?? '').toLowerCase();
  // "Not Found" / "pending" / "in progress" mean the customer may still be paying: never treat as failed.
  const status = s === 'success' ? ('success' as const) : FINAL_FAILURES.has(s) ? ('failed' as const) : ('pending' as const);
  return { status, amount, mihpayid: d.mihpayid, mode: d.mode, error: d.error_Message };
}
