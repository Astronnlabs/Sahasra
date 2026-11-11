import crypto from 'node:crypto';
import type { PlanPayment, Tenant } from '@prisma/client';
import { addMonths } from 'date-fns';
import { config } from '../config.js';
import { db } from '../db.js';
import { notify } from './audit.js';
import { HttpError } from './http.js';

/**
 * SAHASRA plans bought online with PayU hosted checkout.
 * The customer is sent to PayU's own payment page; PayU posts the result back to us and the plan is
 * extended only after PayU's verify API confirms the payment and its amount.
 */

export const PERIODS = {
  monthly: { label: 'Monthly', months: 1 },
  quarterly: { label: 'Quarterly', months: 3 },
  yearly: { label: 'Yearly', months: 12 },
} as const;
export type Period = keyof typeof PERIODS;
export const PERIOD_IDS = Object.keys(PERIODS) as Period[];

/** Plans customers can buy themselves. Prices are final amounts in ₹. */
export const BUY_PLANS = {
  build: { name: 'Build', prices: { monthly: 1, quarterly: 2, yearly: 3 } as Record<Period, number> },
} as const;
export type BuyPlan = keyof typeof BUY_PLANS;
export const BUY_PLAN_IDS = Object.keys(BUY_PLANS) as BuyPlan[];

export function planCatalog() {
  return BUY_PLAN_IDS.map((id) => ({
    id,
    name: BUY_PLANS[id].name,
    options: PERIOD_IDS.map((p) => ({ period: p, label: PERIODS[p].label, months: PERIODS[p].months, price: BUY_PLANS[id].prices[p] })),
  }));
}

/** A self-signed-up business must hold a paid, unexpired Build plan to use the software. */
export function planLocked(t: Tenant, now = new Date()) {
  if (!t.selfSignup || t.astronLabsService || t.plan !== 'build') return false;
  return !t.planValidTo || t.planValidTo.getTime() <= now.getTime();
}

export function planState(t: Tenant) {
  const now = Date.now();
  const validTo = t.planValidTo;
  const active = !!validTo && validTo.getTime() > now;
  return {
    plan: t.plan,
    period: (t.planPeriod as Period | null) ?? null,
    validFrom: t.planValidFrom?.toISOString() ?? null,
    validTo: validTo?.toISOString() ?? null,
    active,
    daysLeft: active ? Math.ceil((validTo!.getTime() - now) / 864e5) : 0,
    /** Bought online (self sign-up): the software is locked without a paid plan. */
    required: t.selfSignup && !t.astronLabsService && t.plan === 'build',
    locked: planLocked(t),
  };
}

// ── PayU ──
const HOSTS = {
  live: { pay: 'https://secure.payu.in/_payment', verify: 'https://info.payu.in/merchant/postservice?form=2' },
  test: { pay: 'https://test.payu.in/_payment', verify: 'https://test.payu.in/merchant/postservice?form=2' },
};
/** PayU may redirect the checkout between its own sub-domains; the browser checks each hop. */
export const PAYU_FORM_HOSTS = ['https://secure.payu.in', 'https://test.payu.in', 'https://*.payu.in'];

export const payuReady = () => !!config.PAYU_KEY && !!config.PAYU_SALT;

function creds() {
  if (!config.PAYU_KEY || !config.PAYU_SALT) throw new HttpError(503, 'Online payment is not set up on the server yet. Please contact Sahasra support.');
  return { key: config.PAYU_KEY, salt: config.PAYU_SALT, hosts: HOSTS[config.PAYU_MODE] };
}

const sha512 = (s: string) => crypto.createHash('sha512').update(s, 'utf8').digest('hex');
/** PayU rejects most punctuation in these fields. */
const clean = (v: string, max: number) => v.replace(/[^A-Za-z0-9 .@_+-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export const publicUrl = () => (config.PUBLIC_URL ?? config.APP_ORIGIN).replace(/\/+$/, '');
export const payuReturnUrl = () => `${publicUrl()}/api/payments/payu/return`;

/** The signed form the browser posts to PayU's hosted payment page. */
export function checkoutForm(i: { txnid: string; amount: string; productinfo: string; firstname: string; email: string; phone: string; tenantId: string }) {
  const { key, salt, hosts } = creds();
  const f = {
    key,
    txnid: i.txnid,
    amount: i.amount,
    productinfo: clean(i.productinfo, 100),
    firstname: clean(i.firstname, 60) || 'Customer',
    email: clean(i.email, 80) || 'astronnlabs@gmail.com',
    phone: i.phone.replace(/\D/g, '').slice(-10),
    udf1: i.tenantId,
    udf2: '',
    udf3: '',
    udf4: '',
    udf5: '',
    surl: payuReturnUrl(),
    furl: payuReturnUrl(),
  };
  // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
  const hash = sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1, f.udf2, f.udf3, f.udf4, f.udf5, '', '', '', '', '', salt].join('|'));
  return { action: hosts.pay, fields: { ...f, hash } };
}

/** Checks the hash PayU sends back with the result. */
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

/** Asks PayU directly for a transaction's status: success, failed, or still pending. */
export async function verifyPayment(txnid: string) {
  const { key, salt, hosts } = creds();
  const body = new URLSearchParams({ key, command: 'verify_payment', var1: txnid, hash: sha512([key, 'verify_payment', txnid, salt].join('|')) });
  const res = await fetch(hosts.verify, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body, signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => null)) as {
    transaction_details?: Record<string, { status?: string; amt?: string; amount?: string; transaction_amount?: string; mihpayid?: string; mode?: string; error_Message?: string }>;
  } | null;
  const d = data?.transaction_details?.[txnid];
  if (!d) return { status: 'pending' as const, amount: NaN };
  const amount = Number(d.transaction_amount ?? d.amt ?? d.amount ?? NaN);
  const s = (d.status ?? '').toLowerCase();
  // "Not Found" / "pending" mean the customer may still be paying: never treat as failed.
  const status = s === 'success' ? ('success' as const) : FINAL_FAILURES.has(s) ? ('failed' as const) : ('pending' as const);
  return { status, amount, mihpayid: d.mihpayid, mode: d.mode, error: d.error_Message };
}

export const newTxnId = () => `SP${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/**
 * Confirms a payment with PayU and, on success, extends the plan exactly once.
 * Validity is added on top of any time still left.
 */
export async function settlePayment(p: PlanPayment): Promise<'success' | 'failed' | 'pending'> {
  if (p.status !== 'pending') return p.status as 'success' | 'failed';
  const v = await verifyPayment(p.txnid);
  if (v.status === 'pending') {
    // Abandoned checkouts stop being "pending" after a day.
    if (Date.now() - p.createdAt.getTime() > 24 * 3600_000) {
      await db.planPayment.updateMany({ where: { id: p.id, status: 'pending' }, data: { status: 'failed', error: 'Payment was not completed' } });
      return 'failed';
    }
    return 'pending';
  }
  if (v.status === 'failed') {
    await db.planPayment.updateMany({ where: { id: p.id, status: 'pending' }, data: { status: 'failed', mihpayid: v.mihpayid ?? null, mode: v.mode ?? null, error: (v.error || 'Payment failed').slice(0, 300) } });
    return 'failed';
  }
  if (!(Math.abs(v.amount - Number(p.amount)) < 0.005)) {
    await db.planPayment.updateMany({ where: { id: p.id, status: 'pending' }, data: { status: 'failed', mihpayid: v.mihpayid ?? null, error: `Paid amount ₹${v.amount} does not match ₹${Number(p.amount)}` } });
    return 'failed';
  }

  const period = PERIODS[p.period as Period] ?? PERIODS.monthly;
  const done = await db.$transaction(async (tx) => {
    // Claim the payment: only one request can move it out of "pending".
    const claimed = await tx.planPayment.updateMany({ where: { id: p.id, status: 'pending' }, data: { status: 'success', paidAt: new Date(), mihpayid: v.mihpayid ?? null, mode: v.mode ?? null } });
    if (claimed.count === 0) return null;
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: p.tenantId } });
    const now = new Date();
    const stillValid = t.plan === p.plan && t.planValidTo && t.planValidTo > now;
    const from = stillValid ? t.planValidTo! : now;
    const to = addMonths(from, period.months);
    await tx.tenant.update({
      where: { id: t.id },
      data: {
        plan: p.plan,
        planPeriod: p.period,
        planValidFrom: stillValid ? t.planValidFrom ?? now : now,
        planValidTo: to,
        status: t.status === 'suspended' || t.status === 'churned' ? t.status : 'active',
        trialEndsAt: null,
        mrr: Math.round((Number(p.amount) / period.months) * 100) / 100,
      },
    });
    await tx.planPayment.update({ where: { id: p.id }, data: { validFrom: from, validTo: to } });
    await tx.auditLog.create({ data: { tenantId: t.id, userId: p.userId, user: 'PayU', action: 'created', module: 'Subscription', target: `${BUY_PLANS[p.plan as BuyPlan]?.name ?? p.plan} plan · ${period.label}`, details: `Paid ₹${Number(p.amount)} (PayU ${v.mihpayid ?? p.txnid}). Valid until ${to.toISOString().slice(0, 10)}.`, ip: '' } });
    return { tenantId: t.id, to };
  });
  if (done) await notify(done.tenantId, 'subscription', 'Plan activated', `Payment received. Your plan is valid until ${done.to.toDateString()}.`, '/subscription');
  return 'success';
}

/** Re-checks this business's unfinished payments (the customer may have closed the PayU page). */
export async function settleStale(tenantId: string) {
  const pending = await db.planPayment.findMany({ where: { tenantId, status: 'pending', createdAt: { lt: new Date(Date.now() - 20_000) } }, take: 5, orderBy: { createdAt: 'desc' } });
  for (const p of pending) await settlePayment(p).catch((e) => console.warn('PayU verify failed', p.txnid, (e as Error).message));
}

export const paymentOut = (p: PlanPayment) => ({
  id: p.id,
  txnid: p.txnid,
  plan: p.plan,
  planName: BUY_PLANS[p.plan as BuyPlan]?.name ?? p.plan,
  period: p.period,
  amount: Number(p.amount),
  status: p.status,
  mode: p.mode,
  error: p.error,
  validTo: p.validTo?.toISOString() ?? null,
  createdAt: p.createdAt.toISOString(),
  paidAt: p.paidAt?.toISOString() ?? null,
});
