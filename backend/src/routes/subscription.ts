import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { forbidden, notFound } from '../lib/http.js';
import {
  BUY_PLAN_IDS,
  BUY_PLANS,
  checkoutForm,
  newTxnId,
  paymentOut,
  PERIOD_IDS,
  PERIODS,
  payuReady,
  planCatalog,
  planState,
  responseHashValid,
  settlePayment,
  settleStale,
} from '../lib/subscription.js';
import { requireTenant, tid } from '../middleware/auth.js';

export const subscriptionRouter = Router();
subscriptionRouter.use('/subscription', requireTenant);

/** Only the business owner or an admin pays; Sahaasra support (support mode) can only look. */
const canBuy = (req: Request) => !req.auth!.impersonating && ['Owner', 'Admin'].includes(req.auth!.user.role);

async function overview(req: Request) {
  const tenantId = tid(req);
  await settleStale(tenantId);
  const [t, payments] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    db.planPayment.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return {
    businessName: t.name,
    state: planState(t),
    plans: planCatalog(),
    canPay: payuReady(),
    canBuy: canBuy(req),
    payments: payments.map(paymentOut),
  };
}

subscriptionRouter.get('/subscription', async (req, res) => {
  res.json(await overview(req));
});

subscriptionRouter.post('/subscription/checkout', async (req, res) => {
  if (!canBuy(req)) throw forbidden(req.auth!.impersonating ? 'Support mode cannot make payments for a business.' : 'Only the business owner or an admin can buy the plan.');
  const { plan, period } = z.object({ plan: z.enum(BUY_PLAN_IDS as [string, ...string[]]), period: z.enum(PERIOD_IDS as [string, ...string[]]) }).parse(req.body);
  const p = BUY_PLANS[plan as keyof typeof BUY_PLANS];
  const price = p.prices[period as keyof typeof PERIODS];
  const t = req.auth!.tenant!;
  const txnid = newTxnId();
  // Build the form first so a missing PayU setup fails before anything is stored.
  const form = checkoutForm({
    txnid,
    amount: price.toFixed(2),
    productinfo: `SAHAASRA ${p.name} plan ${PERIODS[period as keyof typeof PERIODS].label}`,
    firstname: t.ownerName || req.auth!.user.name,
    email: req.auth!.user.email || t.ownerEmail,
    phone: req.auth!.user.phone || t.ownerPhone,
    tenantId: t.id,
  });
  await db.planPayment.create({ data: { tenantId: t.id, txnid, plan, period, amount: price, userId: req.auth!.user.id } });
  await audit(req, 'created', 'Subscription', `${p.name} plan · ${PERIODS[period as keyof typeof PERIODS].label}`, `Checkout started for ₹${price} (${txnid})`);
  res.status(201).json(form);
});

subscriptionRouter.post('/subscription/payments/:id/check', async (req, res) => {
  const p = await db.planPayment.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!p) throw notFound('Payment');
  const status = await settlePayment(p);
  res.json({ status, ...(await overview(req)) });
});

/**
 * PayU posts the payment result here (success and failure). The page then sends the customer back to
 * the app. A plain HTML hop (not a redirect) is used so the browser treats the return as a same-site
 * visit and keeps the customer signed in.
 */
export async function payuReturn(req: Request, res: Response) {
  const p = (req.body ?? {}) as Record<string, string | undefined>;
  const txnid = String(p.txnid ?? '').slice(0, 40);
  const payment = txnid ? await db.planPayment.findUnique({ where: { txnid } }) : null;
  let status: 'success' | 'failed' | 'pending' = 'pending';
  if (payment) {
    let hashOk = false;
    try {
      hashOk = responseHashValid(p);
    } catch {
      hashOk = false;
    }
    if (!hashOk) console.warn('PayU return hash did not match', txnid);
    // PayU's verify API decides; the posted fields alone can never activate a plan.
    status = await settlePayment(payment).catch((e) => {
      console.warn('PayU verify failed; the plan page will check again', txnid, (e as Error).message);
      return 'pending' as const;
    });
  } else {
    status = 'failed';
  }
  const target = `/subscription?payment=${status}`;
  res
    .status(200)
    .type('html')
    .set('Cache-Control', 'no-store')
    .send(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${target}"><title>Returning to SAHAASRA</title></head>` +
        `<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#334155"><p>Returning to SAHAASRA… <a href="${target}">Continue</a></p></body></html>`,
    );
}
