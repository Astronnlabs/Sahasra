import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { eBillingOn } from '../lib/ebill.js';
import { badRequest } from '../lib/http.js';
import { open, seal, secretBoxReady } from '../lib/secretBox.js';
import { num } from '../lib/serialize.js';
import { vaahakAccount, vaahakBillStatuses, vaahakSendBill, waNumber, type VaahakAccount } from '../lib/vaahak.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';

/**
 * E-billing: bills are sent to customers on WhatsApp through VAAHAK (the business's VAAHAK
 * WhatsApp number) and paid from the business's VAAHAK wallet.
 */
export const ebillingRouter = Router();

const credsOf = (l: { accountId: string; keyEnc: string }) => ({ accountId: l.accountId, key: open(l.keyEnc) });

async function ebillingState(tenantId: string, refreshTemplate = false) {
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true, vaahakLink: true } });
  const l = t.vaahakLink;
  let account: VaahakAccount | null = null;
  let accountError: string | null = null;
  if (l) {
    try {
      account = await vaahakAccount(credsOf(l), refreshTemplate);
    } catch (e) {
      accountError = e instanceof Error ? e.message : 'Could not reach VAAHAK.';
    }
  }
  return {
    enabled: eBillingOn(t.settings),
    serverReady: secretBoxReady(),
    link: l ? { accountId: l.accountId, keyPrefix: l.keyPrefix, businessName: l.businessName, connectedAt: l.createdAt.toISOString() } : null,
    account,
    accountError,
  };
}

ebillingRouter.get('/ebilling', requireTenant, guard('settings'), async (req, res) => {
  res.json(await ebillingState(tid(req), req.query.refresh === '1'));
});

ebillingRouter.put('/ebilling/connect', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const b = z
    .object({
      accountId: z.string().trim().min(10, 'Paste the Account ID from VAAHAK → Wallet & e-bills').max(40),
      key: z.string().trim().startsWith('vk_live_', 'The connection key starts with vk_live_').max(100),
    })
    .parse(req.body);
  const tenantId = tid(req);
  // Proves the ID and key work before anything is saved.
  const account = await vaahakAccount({ accountId: b.accountId, key: b.key });
  const data = { accountId: b.accountId, keyEnc: seal(b.key), keyPrefix: b.key.slice(0, 14), businessName: account.businessName };
  await db.vaahakLink.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  await audit(req, 'edited', 'Settings', 'E-Billing', `VAAHAK connected: ${account.businessName}`);
  res.json(await ebillingState(tenantId));
});

ebillingRouter.delete('/ebilling/connect', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const tenantId = tid(req);
  await db.vaahakLink.deleteMany({ where: { tenantId } });
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  await db.tenant.update({ where: { id: tenantId }, data: { settings: { ...((t.settings ?? {}) as Record<string, unknown>), eBillingEnabled: false } as Prisma.InputJsonValue } });
  await audit(req, 'deleted', 'Settings', 'E-Billing', 'VAAHAK disconnected and e-billing turned off');
  res.json(await ebillingState(tenantId));
});

/** Sends a sample bill to any number. It is a real WhatsApp message, paid from the VAAHAK wallet. */
ebillingRouter.post('/ebilling/test', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const { phone } = z.object({ phone: z.string().trim().max(20) }).parse(req.body);
  const to = waNumber(phone);
  if (!to) throw badRequest('Enter a valid 10-digit mobile number.');
  const tenantId = tid(req);
  const l = await db.vaahakLink.findUnique({ where: { tenantId } });
  if (!l) throw badRequest('Connect VAAHAK first.');
  const r = await vaahakSendBill(credsOf(l), {
    billId: `test-${Date.now().toString(36)}`,
    invoiceNo: 'TEST-0001',
    customerName: 'Customer',
    to,
    amount: 1,
    date: new Date().toISOString(),
    businessName: req.auth!.tenant!.name,
  });
  if (r.status === 'failed') throw badRequest(r.message ?? 'The test message was not sent.');
  res.json({ ok: true, charged: r.charged, balance: r.balance });
});

/** Recent bills with live WhatsApp delivery status (sent → delivered → read) from VAAHAK. */
ebillingRouter.get('/ebilling/messages', requireTenant, guard('settings'), async (req, res) => {
  const tenantId = tid(req);
  let rows = await db.billMessage.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
  const open7 = rows.filter((m) => m.status === 'sent' && m.delivery !== 'read' && m.delivery !== 'failed' && m.createdAt.getTime() > Date.now() - 7 * 864e5);
  const l = open7.length ? await db.vaahakLink.findUnique({ where: { tenantId } }) : null;
  if (l) {
    try {
      const statuses = await vaahakBillStatuses(credsOf(l), open7.map((m) => m.saleId));
      for (const s of statuses) {
        const m = open7.find((x) => x.saleId === s.billId);
        if (!m) continue;
        const failed = s.status === 'failed' || s.delivery === 'failed';
        const delivery = failed ? 'failed' : (s.delivery ?? m.delivery);
        if (delivery !== m.delivery || failed) {
          await db.billMessage.update({
            where: { id: m.id },
            data: failed ? { status: 'failed', delivery: 'failed', error: s.error ?? 'WhatsApp could not deliver it', charged: s.charged } : { delivery },
          });
        }
      }
      rows = await db.billMessage.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
    } catch {
      /* VAAHAK unreachable: show what we have */
    }
  }
  res.json(rows.map((m) => ({ id: m.id, invoiceNo: m.invoiceNo, customer: m.customer, to: m.to, status: m.status, delivery: m.delivery, error: m.error, charged: num(m.charged), createdAt: m.createdAt.toISOString() })));
});
