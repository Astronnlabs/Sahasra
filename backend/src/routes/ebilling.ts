import crypto from 'node:crypto';
import { Prisma, type WalletTopup } from '@prisma/client';
import express, { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { eBillingOn } from '../lib/ebill.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { checkoutForm, payuReady, verifyPayment, responseHashValid } from '../lib/payu.js';
import { open, seal, secretBoxReady } from '../lib/secretBox.js';
import { num } from '../lib/serialize.js';
import { charge, credit, expireIfDue, refund, WALLET_VALID_DAYS } from '../lib/wallet.js';
import { BILL_TEMPLATE, billParamValues, createTemplate, sendBillTemplate, templateStatus, verifyNumber, waNumber } from '../lib/whatsapp.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';

export const ebillingRouter = Router();

// ════════ E-billing (WhatsApp) ════════

async function ebillingState(tenantId: string) {
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true, whatsAppSetup: true } });
  const s = t.whatsAppSetup;
  return {
    enabled: eBillingOn(t.settings),
    price: config.EBILL_PRICE,
    serverReady: secretBoxReady(),
    template: { name: BILL_TEMPLATE.name, preview: BILL_TEMPLATE.body, footer: BILL_TEMPLATE.footer, example: billParamValues({ customer: 'Rahul', business: 'Your business', invoiceNo: 'INV-0042', amount: 1250, date: new Date() }) },
    setup: s
      ? { phoneNumberId: s.phoneNumberId, wabaId: s.wabaId, displayPhone: s.displayPhone, verifiedName: s.verifiedName, templateStatus: s.templateStatus, templateReason: s.templateReason, connectedAt: s.createdAt.toISOString() }
      : null,
  };
}

/** Reads (or creates) the bill template on the business's account and stores its status. */
async function syncTemplate(tenantId: string, wabaId: string, token: string, createIfMissing: boolean) {
  let st = await templateStatus(wabaId, token);
  if (!st && createIfMissing) st = await createTemplate(wabaId, token);
  await db.whatsAppSetup.update({ where: { tenantId }, data: { templateStatus: st?.status ?? 'NOT_CREATED', templateReason: st?.reason ?? null } });
}

ebillingRouter.get('/ebilling', requireTenant, guard('settings'), async (req, res) => {
  res.json(await ebillingState(tid(req)));
});

ebillingRouter.put('/ebilling/setup', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const b = z
    .object({
      phoneNumberId: z.string().trim().regex(/^\d{6,25}$/, 'Phone Number ID is a long number from WhatsApp Manager → API setup'),
      wabaId: z.string().trim().regex(/^\d{6,25}$/, 'WhatsApp Business Account ID is a long number'),
      accessToken: z.string().trim().min(20, 'Paste the full permanent access token').max(1000),
    })
    .parse(req.body);
  const tenantId = tid(req);
  const info = await verifyNumber(b.phoneNumberId, b.wabaId, b.accessToken);
  const tokenEnc = seal(b.accessToken);
  await db.whatsAppSetup.upsert({
    where: { tenantId },
    create: { tenantId, phoneNumberId: b.phoneNumberId, wabaId: b.wabaId, tokenEnc, ...info },
    update: { phoneNumberId: b.phoneNumberId, wabaId: b.wabaId, tokenEnc, ...info, templateStatus: 'NOT_CREATED', templateReason: null },
  });
  await syncTemplate(tenantId, b.wabaId, b.accessToken, true);
  await audit(req, 'edited', 'Settings', 'E-Billing', `WhatsApp connected: ${info.displayPhone || b.phoneNumberId}`);
  res.json(await ebillingState(tenantId));
});

ebillingRouter.post('/ebilling/template', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const tenantId = tid(req);
  const s = await db.whatsAppSetup.findUnique({ where: { tenantId } });
  if (!s) throw badRequest('Connect your WhatsApp number first.');
  await syncTemplate(tenantId, s.wabaId, open(s.tokenEnc), true);
  res.json(await ebillingState(tenantId));
});

ebillingRouter.delete('/ebilling/setup', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const tenantId = tid(req);
  await db.whatsAppSetup.deleteMany({ where: { tenantId } });
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  await db.tenant.update({ where: { id: tenantId }, data: { settings: { ...((t.settings ?? {}) as Record<string, unknown>), eBillingEnabled: false } as Prisma.InputJsonValue } });
  await audit(req, 'deleted', 'Settings', 'E-Billing', 'WhatsApp disconnected and e-billing turned off');
  res.json(await ebillingState(tenantId));
});

/** Sends a sample bill to any number, charged like a real one. */
ebillingRouter.post('/ebilling/test', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const { phone } = z.object({ phone: z.string().trim().max(20) }).parse(req.body);
  const to = waNumber(phone);
  if (!to) throw badRequest('Enter a valid 10-digit mobile number.');
  const tenantId = tid(req);
  const s = await db.whatsAppSetup.findUnique({ where: { tenantId } });
  if (!s) throw badRequest('Connect your WhatsApp number first.');
  if (s.templateStatus !== 'APPROVED') throw badRequest('WhatsApp has not approved the bill template yet. Check its status again in a few minutes.');
  const price = config.EBILL_PRICE;
  if (!(await charge(tenantId, price, `Test message to ${phone}`, 'TEST'))) throw badRequest(`Your wallet needs at least ₹${price} to send a message. Recharge it first.`);
  try {
    await sendBillTemplate(s.phoneNumberId, open(s.tokenEnc), to, { customer: 'Customer', business: req.auth!.tenant!.name, invoiceNo: 'TEST-0001', amount: 1, date: new Date() });
  } catch (e) {
    await refund(tenantId, price, 'Refund: test message was not sent', 'TEST');
    throw e;
  }
  res.json({ ok: true, charged: price });
});

ebillingRouter.get('/ebilling/messages', requireTenant, guard('settings'), async (req, res) => {
  const rows = await db.billMessage.findMany({ where: { tenantId: tid(req) }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(rows.map((m) => ({ id: m.id, invoiceNo: m.invoiceNo, customer: m.customer, to: m.to, status: m.status, error: m.error, charged: num(m.charged), createdAt: m.createdAt.toISOString() })));
});

// ════════ Wallet ════════

/** Settles a recharge from PayU's own record. Adds the money exactly once. */
async function settleTopup(top: WalletTopup, hashNote?: string) {
  const v = await verifyPayment(top.txnid);
  if (v.status === 'success' && Math.abs(v.amount - num(top.amount)) < 0.01) {
    await db.$transaction(async (tx) => {
      // A recharge marked failed earlier is still credited if PayU now confirms the money arrived.
      const claimed = await tx.walletTopup.updateMany({ where: { id: top.id, status: { in: ['pending', 'failed'] } }, data: { status: 'success', payuId: v.mihpayid ?? null, mode: v.mode ?? null, completedAt: new Date(), error: hashNote ?? null } });
      if (claimed.count) await credit(tx, top.tenantId, num(top.amount), 'topup', `Wallet recharge via PayU${v.mode ? ` (${v.mode})` : ''}`, top.txnid);
    });
    return 'success' as const;
  }
  if (v.status === 'success') {
    // Paid amount does not match the order: never credit automatically.
    await db.walletTopup.updateMany({ where: { id: top.id, status: 'pending' }, data: { status: 'failed', error: `Amount mismatch: PayU reports ₹${v.amount}`, payuId: v.mihpayid ?? null } });
    return 'failed' as const;
  }
  if (v.status === 'failed') {
    await db.walletTopup.updateMany({ where: { id: top.id, status: 'pending' }, data: { status: 'failed', error: (v.error ?? 'Payment failed').slice(0, 200), completedAt: new Date() } });
    return 'failed' as const;
  }
  return 'pending' as const;
}

ebillingRouter.get('/wallet', requireTenant, guard('settings'), async (req, res) => {
  const tenantId = tid(req);
  // Recharges whose return from PayU never arrived (tab closed, network) are checked again here.
  if (payuReady()) {
    const stale = await db.walletTopup.findMany({ where: { tenantId, status: 'pending', createdAt: { gte: new Date(Date.now() - 2 * 864e5), lte: new Date(Date.now() - 60e3) } }, take: 3 });
    for (const t of stale) await settleTopup(t).catch(() => undefined);
  }
  const state = await db.$transaction((tx) => expireIfDue(tx, tenantId));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [txns, month] = await Promise.all([
    db.walletTxn.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.billMessage.aggregate({ where: { tenantId, status: 'sent', createdAt: { gte: monthStart } }, _count: true, _sum: { charged: true } }),
  ]);
  res.json({
    balance: state.balance,
    expiresAt: state.balance > 0 && state.expiresAt ? state.expiresAt.toISOString() : null,
    price: config.EBILL_PRICE,
    validDays: WALLET_VALID_DAYS,
    canRecharge: payuReady(),
    thisMonth: { messages: month._count, spent: num(month._sum.charged ?? 0) },
    txns: txns.map((t) => ({ id: t.id, kind: t.kind, amount: num(t.amount), balanceAfter: num(t.balanceAfter), description: t.description, reference: t.reference, createdAt: t.createdAt.toISOString() })),
  });
});

ebillingRouter.post('/wallet/topup', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const { amount } = z.object({ amount: z.coerce.number().int('Whole rupees only').min(100, 'Minimum recharge is ₹100').max(50000, 'Maximum recharge is ₹50,000') }).parse(req.body);
  const tenantId = tid(req);
  const t = req.auth!.tenant!;
  const txnid = `SW${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
  const form = checkoutForm({
    txnid,
    amount: amount.toFixed(2),
    productinfo: 'SAHASRA wallet recharge',
    firstname: t.ownerName || req.auth!.user.name,
    email: t.ownerEmail || req.auth!.user.email,
    phone: t.ownerPhone || req.auth!.user.phone || '',
    tenantId,
    returnUrl: `${req.protocol}://${req.get('host')}/api/payments/payu/return`,
  });
  await db.walletTopup.create({ data: { txnid, tenantId, amount, createdBy: req.auth!.user.name } });
  await audit(req, 'created', 'Wallet', txnid, `Recharge of ₹${amount} started`);
  res.json(form);
});

/** Sahasra support can add credit by hand (e.g. paid in cash or by bank transfer). */
ebillingRouter.post('/wallet/adjust', requireTenant, async (req, res) => {
  if (!req.auth!.isSuperAdmin) throw forbidden('Only Sahasra support can add credit by hand.');
  const b = z.object({ amount: z.coerce.number().positive().max(100000), note: z.string().trim().min(3, 'Add a note (e.g. paid in cash)').max(120) }).parse(req.body);
  const balance = await db.$transaction((tx) => credit(tx, tid(req), b.amount, 'adjustment', `Added by Sahasra support: ${b.note}`));
  await audit(req, 'edited', 'Wallet', 'Wallet', `Credit ₹${b.amount} added: ${b.note}`);
  res.json({ balance });
});

// ════════ PayU return (no session, no CSRF header: PayU posts here) ════════

export const payuReturnRouter = Router();
payuReturnRouter.post('/payments/payu/return', express.urlencoded({ extended: false, limit: '64kb' }), async (req: Request, res) => {
  const p = (req.body ?? {}) as Record<string, string | undefined>;
  const back = (status: 'success' | 'failed' | 'pending') => res.redirect(303, `/settings?section=wallet&payment=${status}`);
  const txnid = String(p.txnid ?? '').slice(0, 40);
  const top = txnid ? await db.walletTopup.findUnique({ where: { txnid } }) : null;
  if (!top) throw notFound('Recharge');
  if (top.status === 'success') return back('success');
  // The verify API is the source of truth; a bad hash is recorded but cannot add money by itself.
  let hashOk = false;
  try {
    hashOk = responseHashValid(p);
  } catch {
    hashOk = false;
  }
  // If PayU cannot be reached right now, the wallet screen checks this recharge again later.
  const result = await settleTopup(top, hashOk ? undefined : 'Return hash did not match').catch(() => 'pending' as const);
  back(result);
});
