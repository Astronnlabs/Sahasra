import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { ANY_BUSINESS_TYPE } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http.js';
import { plain } from '../lib/serialize.js';
import { optionalText, phone, phoneKey, requiredText } from '../lib/validate.js';
import { requireSuperAdmin, requireTenant, tid } from '../middleware/auth.js';

export const referralsRouter = Router();

export const REFERRAL_STATUSES = ['new', 'contacted', 'joined', 'rewarded', 'declined'] as const;
const referralOut = (r: object) => plain(r);

// ════════ Business: refer another business ════════
referralsRouter.get('/referrals', requireTenant, async (req, res) => {
  const list = await db.referral.findMany({ where: { tenantId: tid(req) }, orderBy: { createdAt: 'desc' } });
  res.json(list.map(referralOut));
});

referralsRouter.post('/referrals', requireTenant, async (req, res) => {
  const b = z
    .object({
      businessName: requiredText('Business name', 80, 2),
      contactName: requiredText('Contact person', 60, 2),
      phone,
      city: optionalText(60),
      businessType: z.enum(ANY_BUSINESS_TYPE).optional(),
      notes: optionalText(300),
    })
    .parse(req.body);
  const tenantId = tid(req);
  if ((await db.referral.count({ where: { tenantId, createdAt: { gte: new Date(Date.now() - 864e5) } } })) >= 20) throw badRequest('You can send up to 20 referrals a day. Try again tomorrow.');
  const key = phoneKey(b.phone);
  const existing = await db.referral.findMany({ where: { tenantId }, select: { phone: true } });
  if (existing.some((r) => phoneKey(r.phone) === key)) throw badRequest('You have already referred this mobile number.');
  const r = await db.referral.create({ data: { ...b, city: b.city ?? '', tenantId, referredBy: req.auth!.user.name } });
  await audit(req, 'created', 'Referrals', r.businessName, `Referred ${r.contactName}`);
  res.status(201).json(referralOut(r));
});

// ════════ Super Admin: follow up and reward ════════
referralsRouter.get('/platform/referrals', requireSuperAdmin, async (_req, res) => {
  const list = await db.referral.findMany({ orderBy: { createdAt: 'desc' }, include: { tenant: { select: { id: true, name: true, ownerName: true, ownerPhone: true } } } });
  res.json(list.map(({ tenant, ...r }) => ({ ...referralOut(r), referrer: tenant })));
});

referralsRouter.patch('/platform/referrals/:id', requireSuperAdmin, async (req, res) => {
  const { status } = z.object({ status: z.enum(REFERRAL_STATUSES) }).parse(req.body);
  const r = await db.referral.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound('Referral');
  const updated = await db.referral.update({ where: { id: r.id }, data: { status } });
  await db.auditLog
    .create({ data: { tenantId: r.tenantId, userId: req.auth!.user.id, user: `${req.auth!.user.name} (Sahaasra Support)`, action: 'edited', module: 'Referrals', target: r.businessName.slice(0, 200), details: `Referral marked ${status}`, ip: req.ip ?? '' } })
    .catch((e) => console.error('audit failed', e));
  res.json(referralOut(updated));
});
