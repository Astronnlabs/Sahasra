import { Prisma } from '@prisma/client';
import { addDays, differenceInCalendarDays, format, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { ANY_BUSINESS_TYPE, normaliseAccess, PAGE_IDS, PLAN_PRICE, PLANS } from '../lib/access.js';
import { generatePassword, hashPassword } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { tenantOut, ticketOut, userOut } from '../lib/mappers.js';
import { num } from '../lib/serialize.js';
import { assertLoginFree, createTenant, tenantDetails } from '../lib/tenants.js';
import { email, GSTIN_RE, optionalEmail, optionalPhone, optionalText, PAN_RE, password, phone, phoneKey, requiredText, text, upperOptional } from '../lib/validate.js';
import { requireSuperAdmin } from '../middleware/auth.js';
import { mePayload } from './auth.js';

export const platformRouter = Router();
platformRouter.use('/platform', requireSuperAdmin);

/** Platform actions are logged against the affected business so its owner can see them. */
async function log(req: Request, tenantId: string | null, action: 'created' | 'edited' | 'deleted', module: string, target: string, details = '') {
  try {
    await db.auditLog.create({ data: { tenantId, userId: req.auth!.user.id, user: `${req.auth!.user.name} (Sahaasra Support)`, action, module, target: target.slice(0, 200), details: details.slice(0, 500), ip: req.ip ?? '' } });
  } catch (e) {
    console.error('audit failed', e);
  }
}

const userCounts = async () => {
  const rows = await db.user.groupBy({ by: ['tenantId'], where: { tenantId: { not: null } }, _count: true });
  return new Map(rows.map((r) => [r.tenantId!, r._count]));
};

async function findTenant(id: string) {
  const t = await db.tenant.findUnique({ where: { id } });
  if (!t) throw notFound('Business');
  return t;
}
const withUsers = async (id: string) => {
  const t = await findTenant(id);
  return tenantOut(t, await db.user.count({ where: { tenantId: id } }));
};

// ════════ Businesses ════════
const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number().nullable(),
  accuracy: z.number().min(0).nullable(),
  capturedAt: z.string().datetime(),
  source: z.enum(['device', 'manual']),
});

const detailsSchema = z.object({
  name: requiredText('Business name', 80, 2),
  legalName: optionalText(120),
  type: z.enum(ANY_BUSINESS_TYPE),
  gstin: upperOptional(GSTIN_RE, 'GSTIN should look like 27ABCDE1234F1Z5'),
  pan: upperOptional(PAN_RE, 'PAN should look like ABCDE1234F'),
  businessPhone: optionalPhone,
  businessEmail: optionalEmail,
  website: optionalText(120),
  addressLine: optionalText(200),
  city: requiredText('City', 60),
  state: optionalText(60),
  pincode: z.string().trim().optional().transform((v) => v || undefined).refine((v) => !v || /^[1-9]\d{5}$/.test(v), 'Enter a 6-digit PIN code'),
  location: locationSchema.nullable().optional(),
  ownerName: requiredText('Owner name', 60, 2),
  ownerEmail: email,
  phone,
  ownerAltPhone: optionalPhone,
  ownerPan: upperOptional(PAN_RE, 'PAN should look like ABCDE1234F'),
  notes: optionalText(1000),
});
const accessSchema = z.array(z.enum(PAGE_IDS)).nullable();

platformRouter.get('/platform/tenants', async (_req, res) => {
  const [rows, counts] = await Promise.all([db.tenant.findMany({ orderBy: { createdAt: 'desc' } }), userCounts()]);
  res.json(rows.map((t) => tenantOut(t, counts.get(t.id) ?? 0)));
});

platformRouter.get('/platform/tenants/:id', async (req, res) => {
  res.json(await withUsers(String(req.params.id)));
});

const dateInput = z.union([z.string(), z.date()]).nullish().transform((v) => {
  if (!v) return undefined;
  if (typeof v === 'string' && !v.trim()) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
});

platformRouter.post('/platform/tenants', async (req, res) => {
  const b = detailsSchema.extend({
    plan: z.enum(PLANS),
    access: accessSchema.optional(),
    password: password.optional(),
    astronLabsService: z.boolean().optional(),
    planValidFrom: dateInput,
    planValidTo: dateInput,
  }).parse(req.body);
  const isAstron = b.plan === 'astron_labs' || b.astronLabsService;
  const tempPassword = b.password ?? generatePassword();
  const { tenant } = await createTenant({
    ...b,
    location: b.location ?? undefined,
    access: b.access ?? null,
    password: tempPassword,
    ownerStatus: 'invited',
    astronLabsService: isAstron || false,
    planValidFrom: b.planValidFrom,
    planValidTo: b.planValidTo,
  });
  await log(req, tenant.id, 'created', 'Platform', tenant.name, `Business created on the ${b.plan} plan${isAstron ? ' (Astron Labs Services)' : ''}`);
  res.status(201).json({ tenant: tenantOut(tenant, 1), ownerLogin: { email: tenant.ownerEmail, phone: tenant.ownerPhone, tempPassword: b.password ? undefined : tempPassword } });
});

platformRouter.put('/platform/tenants/:id', async (req, res) => {
  const t = await findTenant(String(req.params.id));
  const b = detailsSchema.parse(req.body);
  const owner = await db.user.findFirst({ where: { tenantId: t.id, role: 'Owner' } });
  await assertLoginFree(b.ownerEmail, b.phone, owner?.id);
  await db.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: t.id }, data: tenantDetails({ ...b, location: b.location ?? undefined }) });
    if (owner) await tx.user.update({ where: { id: owner.id }, data: { name: b.ownerName, email: b.ownerEmail, phone: b.phone, phoneKey: phoneKey(b.phone) } });
  });
  await log(req, t.id, 'edited', 'Platform', b.name, 'Business details updated');
  res.json(await withUsers(t.id));
});

platformRouter.put('/platform/tenants/:id/access', async (req, res) => {
  const t = await findTenant(String(req.params.id));
  const { pages } = z.object({ pages: accessSchema }).parse(req.body);
  const next = pages ? normaliseAccess(pages) : null;
  await db.tenant.update({ where: { id: t.id }, data: { access: next ?? Prisma.DbNull } });
  const before = t.access === null ? [...PAGE_IDS] : normaliseAccess(t.access);
  const after = next ?? [...PAGE_IDS];
  const added = after.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !after.includes(p));
  await log(req, t.id, 'edited', 'Platform', t.name, [added.length && `Granted: ${added.join(', ')}`, removed.length && `Removed: ${removed.join(', ')}`].filter(Boolean).join(' · ') || 'Page access saved');
  res.json(await withUsers(t.id));
});

platformRouter.post('/platform/tenants/:id/plan', async (req, res) => {
  const t = await findTenant(String(req.params.id));
  const { plan, astronLabsService, planValidFrom, planValidTo } = z.object({
    plan: z.enum(PLANS),
    astronLabsService: z.boolean().optional(),
    planValidFrom: dateInput,
    planValidTo: dateInput,
  }).parse(req.body);
  const isAstron = plan === 'astron_labs' || astronLabsService;
  await db.tenant.update({
    where: { id: t.id },
    data: {
      plan,
      mrr: PLAN_PRICE[plan] ?? 0,
      status: plan === 'trial' ? 'trial' : 'active',
      trialEndsAt: plan === 'trial' ? t.trialEndsAt ?? addDays(new Date(), 14) : null,
      astronLabsService: isAstron || false,
      planValidFrom: planValidFrom ? new Date(planValidFrom) : (isAstron ? new Date() : null),
      planValidTo: planValidTo ? new Date(planValidTo) : null,
    },
  });
  await log(req, t.id, 'edited', 'Platform', t.name, `Plan changed from ${t.plan} to ${plan}${isAstron ? ' (Astron Labs Services)' : ''}`);
  res.json(await withUsers(t.id));
});

platformRouter.post('/platform/tenants/:id/status', async (req, res) => {
  const t = await findTenant(String(req.params.id));
  const { status } = z.object({ status: z.enum(['active', 'trial', 'suspended', 'churned']) }).parse(req.body);
  const live = status === 'active' || status === 'trial';
  await db.tenant.update({
    where: { id: t.id },
    data: { status, mrr: live ? (status === 'trial' ? 0 : PLAN_PRICE[t.plan] ?? 0) : 0, ...(status === 'trial' && !t.trialEndsAt ? { trialEndsAt: addDays(new Date(), 14) } : {}) },
  });
  // Suspending a business signs its users out everywhere.
  if (!live) await db.session.deleteMany({ where: { user: { tenantId: t.id } } });
  await log(req, t.id, 'edited', 'Platform', t.name, `Status changed from ${t.status} to ${status}`);
  res.json(await withUsers(t.id));
});

platformRouter.post('/platform/tenants/:id/extend-trial', async (req, res) => {
  const t = await findTenant(String(req.params.id));
  const { days } = z.object({ days: z.coerce.number().int().min(1).max(90) }).parse(req.body);
  const base = t.trialEndsAt && t.trialEndsAt.getTime() > Date.now() ? t.trialEndsAt : new Date();
  await db.tenant.update({ where: { id: t.id }, data: { trialEndsAt: addDays(base, days), status: 'trial', plan: 'trial', mrr: 0 } });
  await log(req, t.id, 'edited', 'Platform', t.name, `Trial extended by ${days} days`);
  res.json(await withUsers(t.id));
});

platformRouter.post('/platform/tenants/:id/reset-owner-password', async (req, res) => {
  const t = await findTenant(String(req.params.id));
  const owner = await db.user.findFirst({ where: { tenantId: t.id, role: 'Owner' } });
  if (!owner) throw notFound('Owner login');
  const tempPassword = generatePassword();
  await db.user.update({ where: { id: owner.id }, data: { passwordHash: await hashPassword(tempPassword), status: owner.status === 'suspended' ? 'suspended' : 'invited' } });
  await db.session.deleteMany({ where: { userId: owner.id } });
  await log(req, t.id, 'edited', 'Users', owner.name, 'Owner password reset by Sahaasra support');
  res.json({ email: owner.email, phone: owner.phone ?? '', tempPassword });
});

/** Permanently erases a business and all its data. The exact name must be typed to confirm. */
platformRouter.delete('/platform/tenants/:id', async (req, res) => {
  const t = await findTenant(String(req.params.id));
  const { confirm } = z.object({ confirm: z.string().trim() }).parse(req.body ?? {});
  if (confirm !== t.name) throw badRequest(`Type the business name "${t.name}" exactly to confirm.`);
  await db.$transaction([db.session.updateMany({ where: { impersonateTenantId: t.id }, data: { impersonateTenantId: null } }), db.tenant.delete({ where: { id: t.id } })]);
  await log(req, null, 'deleted', 'Platform', t.name, `Business ${t.id} (${t.ownerEmail}) and all its data deleted`);
  res.json({ id: t.id });
});

// ════════ Support mode (act inside a business) ════════
platformRouter.post('/platform/support-mode', async (req, res) => {
  const { tenantId } = z.object({ tenantId: z.string().min(1) }).parse(req.body);
  const t = await findTenant(tenantId);
  await db.session.update({ where: { id: req.auth!.sessionId }, data: { impersonateTenantId: t.id } });
  await log(req, t.id, 'edited', 'Platform', t.name, 'Support mode started');
  req.auth = { ...req.auth!, tenant: t, tenantId: t.id, impersonating: true };
  res.json(mePayload(req));
});

platformRouter.delete('/platform/support-mode', async (req, res) => {
  const a = req.auth!;
  if (a.impersonating && a.tenantId) await log(req, a.tenantId, 'edited', 'Platform', a.tenant?.name ?? '', 'Support mode ended');
  await db.session.update({ where: { id: a.sessionId }, data: { impersonateTenantId: null } });
  req.auth = { ...a, tenant: null, tenantId: null, impersonating: false };
  res.json(mePayload(req));
});

// ════════ Users across all businesses ════════
const platformUserOut = (u: Parameters<typeof userOut>[0] & { tenant: { name: string } | null }) => ({ ...userOut(u), tenantId: u.tenantId ?? '', tenantName: u.tenant?.name ?? '—' });

platformRouter.get('/platform/users', async (req, res) => {
  const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
  const rows = await db.user.findMany({ where: { role: { not: 'Super Admin' }, ...(tenantId ? { tenantId } : {}) }, include: { tenant: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
  res.json(rows.map(platformUserOut));
});

platformRouter.post('/platform/users', async (req, res) => {
  const b = z.object({ tenantId: z.string().min(1), name: requiredText('Name', 60, 2), email, phone, role: requiredText('Role', 40) }).parse(req.body);
  const t = await findTenant(b.tenantId);
  if (b.role === 'Owner' && (await db.user.count({ where: { tenantId: t.id, role: 'Owner' } }))) throw badRequest(`${t.name} already has an owner.`);
  if (!(await db.role.findUnique({ where: { tenantId_name: { tenantId: t.id, name: b.role } } }))) throw badRequest('That role does not exist in this business.');
  await assertLoginFree(b.email, b.phone);
  const tempPassword = generatePassword();
  const u = await db.user.create({ data: { tenantId: t.id, name: b.name, email: b.email, phone: b.phone, phoneKey: phoneKey(b.phone), role: b.role, status: 'invited', passwordHash: await hashPassword(tempPassword) }, include: { tenant: { select: { name: true } } } });
  await log(req, t.id, 'created', 'Users', u.name, `Added as ${u.role} by Sahaasra support`);
  res.status(201).json({ ...platformUserOut(u), tempPassword });
});

platformRouter.put('/platform/users/:id', async (req, res) => {
  const b = z.object({ status: z.enum(['active', 'suspended']) }).parse(req.body);
  const u = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!u || u.role === 'Super Admin') throw notFound('User');
  const updated = await db.user.update({ where: { id: u.id }, data: { status: b.status }, include: { tenant: { select: { name: true } } } });
  if (b.status === 'suspended') await db.session.deleteMany({ where: { userId: u.id } });
  await log(req, u.tenantId, 'edited', 'Users', u.name, b.status === 'suspended' ? 'Suspended by Sahaasra support' : 'Reactivated by Sahaasra support');
  res.json(platformUserOut(updated));
});

platformRouter.delete('/platform/users/:id', async (req, res) => {
  const u = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!u || u.role === 'Super Admin') throw notFound('User');
  if (u.role === 'Owner') throw badRequest('The owner login is deleted together with the business. Reset the password or suspend it instead.');
  await db.$transaction([db.heldBill.deleteMany({ where: { userId: u.id } }), db.user.delete({ where: { id: u.id } })]);
  await log(req, u.tenantId, 'deleted', 'Users', u.name, 'Login deleted by Sahaasra support');
  res.json({ id: u.id });
});

platformRouter.post('/platform/users/:id/reset-password', async (req, res) => {
  const u = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!u || u.role === 'Super Admin') throw notFound('User');
  const tempPassword = generatePassword();
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(tempPassword) } });
  await db.session.deleteMany({ where: { userId: u.id } });
  await log(req, u.tenantId, 'edited', 'Users', u.name, 'Password reset by Sahaasra support');
  res.json({ tempPassword });
});

/**
 * Super Admin edits any business user's login: name, email, mobile (what they sign in with) and,
 * optionally, sets a new password. Changing the login or password signs the user out everywhere.
 */
platformRouter.put('/platform/users/:id/login', async (req, res) => {
  const b = z.object({ name: requiredText('Name', 60, 2), email, phone, password: password.optional() }).parse(req.body);
  const u = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!u || u.role === 'Super Admin') throw notFound('User');
  await assertLoginFree(b.email, b.phone, u.id);
  const loginChanged = b.email !== u.email || phoneKey(b.phone) !== u.phoneKey;
  const updated = await db.user.update({
    where: { id: u.id },
    data: {
      name: b.name,
      email: b.email,
      phone: b.phone,
      phoneKey: phoneKey(b.phone),
      ...(b.password ? { passwordHash: await hashPassword(b.password) } : {}),
    },
    include: { tenant: { select: { name: true } } },
  });
  // The business record keeps the owner's contact in step with the owner's login.
  if (u.role === 'Owner' && u.tenantId) await db.tenant.update({ where: { id: u.tenantId }, data: { ownerName: b.name, ownerEmail: b.email, ownerPhone: b.phone } });
  if (loginChanged || b.password) await db.session.deleteMany({ where: { userId: u.id } });
  const what = [b.name !== u.name && 'name', loginChanged && 'login (email / mobile)', b.password && 'password'].filter(Boolean).join(', ');
  await log(req, u.tenantId, 'edited', 'Users', b.name, `${what || 'Details'} changed by Sahaasra support`);
  res.json(platformUserOut(updated));
});

// ════════ Platform administrators ════════
platformRouter.get('/platform/admins', async (_req, res) => {
  res.json((await db.user.findMany({ where: { role: 'Super Admin' }, orderBy: { createdAt: 'asc' } })).map(userOut));
});

platformRouter.post('/platform/admins', async (req, res) => {
  const b = z.object({ name: requiredText('Name', 60, 2), email }).parse(req.body);
  await assertLoginFree(b.email);
  const tempPassword = generatePassword();
  const u = await db.user.create({ data: { name: b.name, email: b.email, role: 'Super Admin', status: 'invited', passwordHash: await hashPassword(tempPassword) } });
  await log(req, null, 'created', 'Platform', u.email, 'Platform administrator added');
  res.status(201).json({ ...userOut(u), tempPassword });
});

platformRouter.put('/platform/admins/:id', async (req, res) => {
  const b = z.object({ status: z.enum(['active', 'suspended']) }).parse(req.body);
  const u = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!u || u.role !== 'Super Admin') throw notFound('Administrator');
  if (u.id === req.auth!.user.id) throw forbidden('You cannot suspend your own account.');
  const updated = await db.user.update({ where: { id: u.id }, data: { status: b.status } });
  if (b.status === 'suspended') await db.session.deleteMany({ where: { userId: u.id } });
  await log(req, null, 'edited', 'Platform', u.email, `Administrator ${b.status === 'suspended' ? 'suspended' : 'reactivated'}`);
  res.json(userOut(updated));
});

// ════════ Support tickets ════════
const ticketInclude = { messages: true, tenant: { select: { name: true } } } as const;

platformRouter.get('/platform/tickets', async (req, res) => {
  const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
  const rows = await db.ticket.findMany({ where: tenantId ? { tenantId } : {}, include: ticketInclude, orderBy: { updatedAt: 'desc' } });
  res.json(rows.map(ticketOut));
});

platformRouter.get('/platform/tickets/:id', async (req, res) => {
  const t = await db.ticket.findUnique({ where: { id: String(req.params.id) }, include: ticketInclude });
  if (!t) throw notFound('Ticket');
  res.json(ticketOut(t));
});

platformRouter.post('/platform/tickets/:id/reply', async (req, res) => {
  const b = z.object({ text: requiredText('Message', 4000), from: z.enum(['agent', 'note']).default('agent'), status: z.enum(['open', 'pending', 'resolved', 'closed']).optional() }).parse(req.body);
  const t = await db.ticket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound('Ticket');
  const now = new Date();
  const updated = await db.ticket.update({
    where: { id: t.id },
    data: {
      status: b.status ?? (b.from === 'agent' ? 'pending' : t.status),
      assignee: t.assignee ?? req.auth!.user.name,
      updatedAt: now,
      messages: { create: { from: b.from, author: b.from === 'agent' ? 'Sahaasra Support' : req.auth!.user.name, text: b.text, at: now } },
    },
    include: ticketInclude,
  });
  if (b.from === 'agent') {
    await db.notification.create({ data: { tenantId: t.tenantId, kind: 'system', title: 'Sahaasra support replied', message: `Reply on ${ticketOut(updated).number}: ${t.subject}`.slice(0, 200), href: '/support' } });
  }
  res.json(ticketOut(updated));
});

platformRouter.patch('/platform/tickets/:id', async (req, res) => {
  const b = z.object({ status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), assignee: text(60).optional() }).parse(req.body);
  const t = await db.ticket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound('Ticket');
  const updated = await db.ticket.update({ where: { id: t.id }, data: { ...b, assignee: b.assignee === '' ? null : b.assignee, updatedAt: new Date() }, include: ticketInclude });
  res.json(ticketOut(updated));
});

// ════════ Growth statistics ════════
platformRouter.get('/platform/stats/overview', async (_req, res) => {
  const now = new Date();
  const ago = (days: number) => subDays(startOfDay(now), days - 1);
  const [tenants, totalUsers, activeUsers, newUsersToday, openTickets, urgentTickets] = await Promise.all([
    db.tenant.findMany({ select: { status: true, createdAt: true, mrr: true } }),
    db.user.count({ where: { role: { not: 'Super Admin' } } }),
    db.user.count({ where: { role: { not: 'Super Admin' }, lastLoginAt: { gte: ago(7) } } }),
    db.user.count({ where: { role: { not: 'Super Admin' }, createdAt: { gte: ago(1) } } }),
    db.ticket.count({ where: { status: 'open' } }),
    db.ticket.count({ where: { status: 'open', priority: { in: ['high', 'urgent'] } } }),
  ]);
  const within = (d: Date, days: number) => differenceInCalendarDays(now, d) < days;
  const count = (s: string) => tenants.filter((t) => t.status === s).length;
  const new30 = tenants.filter((t) => within(t.createdAt, 30)).length;
  const prev30 = tenants.filter((t) => !within(t.createdAt, 30) && within(t.createdAt, 60)).length;
  const paid = count('active');
  const decided = paid + count('trial') + count('churned');
  res.json({
    totalBusinesses: tenants.length,
    liveBusinesses: paid + count('trial'),
    totalUsers,
    activeUsers,
    newToday: tenants.filter((t) => within(t.createdAt, 1)).length,
    newUsersToday,
    new7: tenants.filter((t) => within(t.createdAt, 7)).length,
    new30,
    newChange: prev30 ? ((new30 - prev30) / prev30) * 100 : new30 ? 100 : 0,
    mrr: tenants.filter((t) => t.status === 'active').reduce((s, t) => s + num(t.mrr), 0),
    trials: count('trial'),
    conversion: decided ? Math.round((paid / decided) * 100) : 0,
    openTickets,
    urgentTickets,
  });
});

platformRouter.get('/platform/stats/signups', async (req, res) => {
  const range = z.enum(['7d', '30d', '90d', '12m']).catch('30d').parse(req.query.range);
  const now = new Date();
  const since = range === '12m' ? startOfMonth(subMonths(now, 11)) : subDays(startOfDay(now), range === '7d' ? 7 : range === '30d' ? 30 : 91);
  const [ts, us] = await Promise.all([
    db.tenant.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.user.findMany({ where: { createdAt: { gte: since }, role: { not: 'Super Admin' } }, select: { createdAt: true } }),
  ]);
  if (range === '12m') {
    res.json(Array.from({ length: 12 }, (_, i) => {
      const key = format(startOfMonth(subMonths(now, 11 - i)), 'yyyy-MM');
      return { label: format(startOfMonth(subMonths(now, 11 - i)), 'MMM'), businesses: ts.filter((t) => format(t.createdAt, 'yyyy-MM') === key).length, users: us.filter((u) => format(u.createdAt, 'yyyy-MM') === key).length };
    }));
    return;
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const bucket = range === '90d' ? 7 : 1;
  const n = Math.ceil(days / bucket);
  res.json(Array.from({ length: n }, (_, i) => {
    const end = subDays(now, (n - 1 - i) * bucket);
    const start = subDays(end, bucket - 1);
    const inRange = (d: Date) => {
      const diff = differenceInCalendarDays(d, start);
      return diff >= 0 && diff < bucket;
    };
    return { label: format(end, days === 7 ? 'EEE' : 'dd MMM'), businesses: ts.filter((t) => inRange(t.createdAt)).length, users: us.filter((u) => inRange(u.createdAt)).length };
  }));
});
