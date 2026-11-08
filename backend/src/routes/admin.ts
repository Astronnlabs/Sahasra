import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { PERMISSION_MODULES, PERMISSIONS } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { generatePassword, hashPassword } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { ticketOut, userOut } from '../lib/mappers.js';
import { plain } from '../lib/serialize.js';
import { assertLoginFree } from '../lib/tenants.js';
import { email, password, phone, phoneKey, requiredText, text } from '../lib/validate.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';

export const adminRouter = Router();

// ════════ Business users ════════
adminRouter.get('/users', requireTenant, guard(['users', 'roles']), async (req, res) => {
  const users = await db.user.findMany({ where: { tenantId: tid(req) }, orderBy: { createdAt: 'asc' } });
  res.json(users.map(userOut));
});

const userSchema = z.object({ name: requiredText('Name', 60, 2), email, phone, role: requiredText('Role', 40), branch: text(60).default('All Branches') });

async function assertRole(tenantId: string, role: string, actorRole: string) {
  if (role === 'Owner') throw badRequest('There can only be one Owner. Choose another role.');
  if (!(await db.role.findUnique({ where: { tenantId_name: { tenantId, name: role } } }))) throw badRequest('Role not found.');
  if (role === 'Admin' && !['Owner', 'Super Admin'].includes(actorRole)) throw forbidden('Only the owner can create admins.');
}

adminRouter.post('/users', requireTenant, guard('users', 'create'), async (req, res) => {
  const b = userSchema.extend({ password: password.optional() }).parse(req.body);
  await assertRole(tid(req), b.role, req.auth!.user.role);
  await assertLoginFree(b.email, b.phone);
  const tempPassword = b.password ?? generatePassword();
  const u = await db.user.create({ data: { tenantId: tid(req), name: b.name, email: b.email, phone: b.phone, phoneKey: phoneKey(b.phone), role: b.role, branch: b.branch, status: 'invited', passwordHash: await hashPassword(tempPassword) } });
  await audit(req, 'created', 'Users', u.name, `Added as ${u.role}`);
  res.status(201).json({ ...userOut(u), tempPassword: b.password ? undefined : tempPassword });
});

adminRouter.put('/users/:id', requireTenant, guard('users', 'edit'), async (req, res) => {
  const b = userSchema.partial().extend({ status: z.enum(['active', 'suspended']).optional() }).parse(req.body);
  const u = await db.user.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!u) throw notFound('User');
  if (u.role === 'Owner' && (b.role && b.role !== 'Owner' || b.status === 'suspended')) throw forbidden('The owner cannot be demoted or suspended here. Contact Sahasra support.');
  if (u.id === req.auth!.user.id && b.status === 'suspended') throw badRequest('You cannot suspend yourself.');
  if (b.role && b.role !== u.role) await assertRole(tid(req), b.role, req.auth!.user.role);
  if (b.email || b.phone) await assertLoginFree(b.email ?? u.email, b.phone ?? u.phone, u.id);
  const updated = await db.user.update({ where: { id: u.id }, data: { ...b, ...(b.phone ? { phoneKey: phoneKey(b.phone) } : {}) } });
  if (b.status === 'suspended') await db.session.deleteMany({ where: { userId: u.id } });
  await audit(req, 'edited', 'Users', updated.name, `Changed: ${Object.keys(b).join(', ')}`);
  res.json(userOut(updated));
});

adminRouter.post('/users/:id/reset-password', requireTenant, guard('users', 'edit'), async (req, res) => {
  const u = await db.user.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!u) throw notFound('User');
  if (u.role === 'Owner' && req.auth!.user.id !== u.id) throw forbidden("Only Sahasra support can reset the owner's password.");
  const tempPassword = generatePassword();
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(tempPassword) } });
  await db.session.deleteMany({ where: { userId: u.id } });
  await audit(req, 'edited', 'Users', u.name, 'Password reset');
  res.json({ tempPassword });
});

/** The owner sets a new password for anyone in the business (themselves included) without the current one. */
adminRouter.post('/users/:id/set-password', requireTenant, guard('users', 'edit'), async (req, res) => {
  if (!['Owner', 'Super Admin'].includes(req.auth!.user.role)) throw forbidden('Only the owner can set passwords directly. Use “Reset password” instead.');
  const b = z.object({ password }).parse(req.body);
  const u = await db.user.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!u) throw notFound('User');
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(b.password) } });
  // Sign them out everywhere — except this browser when the owner changes their own password.
  await db.session.deleteMany({ where: { userId: u.id, ...(u.id === req.auth!.user.id ? { id: { not: req.auth!.sessionId } } : {}) } });
  await audit(req, 'edited', 'Users', u.name, u.id === req.auth!.user.id ? 'Changed own password' : 'Password set by owner');
  res.json({ ok: true });
});

/** Removes a staff login. Their past bills and audit history keep their name. */
adminRouter.delete('/users/:id', requireTenant, guard('users', 'delete'), async (req, res) => {
  const u = await db.user.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!u) throw notFound('User');
  if (u.role === 'Owner') throw forbidden('The owner login cannot be deleted.');
  if (u.id === req.auth!.user.id) throw badRequest('You cannot delete your own login.');
  if (u.role === 'Admin' && !['Owner', 'Super Admin'].includes(req.auth!.user.role)) throw forbidden('Only the owner can delete admins.');
  await db.$transaction([db.heldBill.deleteMany({ where: { tenantId: tid(req), userId: u.id } }), db.user.delete({ where: { id: u.id } })]);
  await audit(req, 'deleted', 'Users', u.name, `${u.role} login removed`);
  res.json({ id: u.id });
});

// ════════ Roles ════════
const permsSchema = z.record(z.enum(PERMISSION_MODULES), z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length));

adminRouter.get('/roles', requireTenant, guard(['roles', 'users']), async (req, res) => {
  const [roles, counts] = await Promise.all([
    db.role.findMany({ where: { tenantId: tid(req) }, orderBy: { createdAt: 'asc' } }),
    db.user.groupBy({ by: ['role'], where: { tenantId: tid(req) }, _count: true }),
  ]);
  res.json(roles.map((r) => ({ id: r.id, name: r.name, description: r.description, system: r.system, members: counts.find((c) => c.role === r.name)?._count ?? 0, permissions: r.permissions })));
});

adminRouter.post('/roles', requireTenant, guard('roles', 'create'), async (req, res) => {
  const b = z.object({ name: requiredText('Role name', 40, 2), description: text(120).default('Custom role'), permissions: permsSchema.default({}) }).parse(req.body);
  if (['Owner', 'Super Admin'].includes(b.name)) throw badRequest('That role name is reserved.');
  const r = await db.role.create({ data: { tenantId: tid(req), name: b.name, description: b.description || 'Custom role', permissions: b.permissions, system: false } });
  await audit(req, 'created', 'Roles', r.name);
  res.status(201).json({ ...plain(r), members: 0 });
});

adminRouter.put('/roles/:id', requireTenant, guard('roles', 'edit'), async (req, res) => {
  const b = z.object({ permissions: permsSchema }).parse(req.body);
  const r = await db.role.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!r) throw notFound('Role');
  if (r.name === 'Owner') throw forbidden('The Owner role always has full access.');
  const updated = await db.role.update({ where: { id: r.id }, data: { permissions: b.permissions as Prisma.InputJsonValue } });
  await audit(req, 'edited', 'Roles', r.name, 'Permissions updated');
  res.json({ ...plain(updated), members: await db.user.count({ where: { tenantId: tid(req), role: r.name } }) });
});

adminRouter.delete('/roles/:id', requireTenant, guard('roles', 'delete'), async (req, res) => {
  const r = await db.role.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!r) throw notFound('Role');
  if (r.system) throw badRequest(`${r.name} is a built-in role and can't be deleted.`);
  const members = await db.user.count({ where: { tenantId: tid(req), role: r.name } });
  if (members) throw badRequest(`${members} user${members === 1 ? ' has' : 's have'} the ${r.name} role. Give them another role first.`);
  await db.role.delete({ where: { id: r.id } });
  await audit(req, 'deleted', 'Roles', r.name);
  res.json({ id: r.id });
});

// ════════ Notifications & audit ════════
adminRouter.delete('/notifications/:id', requireTenant, async (req, res) => {
  await db.notification.deleteMany({ where: { id: String(req.params.id), tenantId: tid(req) } });
  res.json({ ok: true });
});
adminRouter.get('/notifications', requireTenant, async (req, res) => {
  const rows = await db.notification.findMany({ where: { tenantId: tid(req) }, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json(rows.map((n) => ({ ...plain(n), href: n.href ?? undefined })));
});
adminRouter.post('/notifications/:id/read', requireTenant, async (req, res) => {
  await db.notification.updateMany({ where: { id: String(req.params.id), tenantId: tid(req) }, data: { read: true } });
  res.json({ ok: true });
});
adminRouter.post('/notifications/read-all', requireTenant, async (req, res) => {
  await db.notification.updateMany({ where: { tenantId: tid(req), read: false }, data: { read: true } });
  res.json({ ok: true });
});

adminRouter.get('/audit-logs', requireTenant, guard('audit-logs'), async (req, res) => {
  const rows = await db.auditLog.findMany({ where: { tenantId: tid(req) }, orderBy: { at: 'desc' }, take: 1000 });
  res.json(rows.map((l) => plain(l)));
});

// ════════ Support (business side) ════════
adminRouter.get('/support/tickets', requireTenant, async (req, res) => {
  const rows = await db.ticket.findMany({ where: { tenantId: tid(req) }, include: { messages: true, tenant: { select: { name: true } } }, orderBy: { updatedAt: 'desc' } });
  // Internal notes from the Sahasra team are never sent to the business.
  res.json(rows.map((t) => ({ ...ticketOut(t), messages: ticketOut(t).messages.filter((m) => m.from !== 'note') })));
});

adminRouter.post('/support/tickets', requireTenant, async (req, res) => {
  const b = z.object({ subject: requiredText('Subject', 120, 5), category: z.enum(['billing', 'technical', 'gst', 'account', 'feature']), priority: z.enum(['low', 'medium', 'high', 'urgent']), text: requiredText('Description', 2000, 10) }).parse(req.body);
  const a = req.auth!;
  const t = await db.ticket.create({
    data: { tenantId: tid(req), requesterId: a.user.id, requester: a.user.name, email: a.user.email, subject: b.subject, category: b.category, priority: b.priority, messages: { create: { from: 'customer', author: a.user.name, text: b.text } } },
    include: { messages: true, tenant: { select: { name: true } } },
  });
  await audit(req, 'created', 'Support', ticketOut(t).number, b.subject);
  res.status(201).json(ticketOut(t));
});

adminRouter.post('/support/tickets/:id/reply', requireTenant, async (req, res) => {
  const b = z.object({ text: requiredText('Message', 2000) }).parse(req.body);
  const t = await db.ticket.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!t) throw notFound('Ticket');
  if (t.status === 'closed') throw badRequest('This ticket is closed. Please raise a new one.');
  const now = new Date();
  const updated = await db.ticket.update({
    where: { id: t.id },
    data: { status: 'open', updatedAt: now, messages: { create: { from: 'customer', author: req.auth!.user.name, text: b.text, at: now } } },
    include: { messages: true, tenant: { select: { name: true } } },
  });
  const out = ticketOut(updated);
  res.json({ ...out, messages: out.messages.filter((m) => m.from !== 'note') });
});

// ════════ Bill Studio templates ════════
const templateSchema = z.object({ name: requiredText('Template name', 40), paper: z.enum(['A4', 'A5', 'thermal80', 'thermal58']), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), font: z.enum(['sans', 'serif', 'mono']), watermark: text(20).default(''), elements: z.array(z.record(z.unknown())).max(80), isDefault: z.boolean().default(false) });
/** The app addresses templates by `key`; the database id stays internal. */
const tplOut = (t: { id: string; key: string; tenantId: string } & Record<string, unknown>) => {
  const { id: _id, key, tenantId: _t, ...rest } = plain(t);
  void _id;
  void _t;
  return { ...rest, id: key };
};
const tplKey = (req: Request) => z.string().trim().min(1).max(60).regex(/^[\w-]+$/, 'Invalid template id').parse(req.params.id);
const findTpl = (req: Request) => db.billTemplate.findUnique({ where: { tenantId_key: { tenantId: tid(req), key: tplKey(req) } } });

adminRouter.get('/bill-templates', requireTenant, guard(['bill-studio', 'sales', 'pos']), async (req, res) => {
  res.json((await db.billTemplate.findMany({ where: { tenantId: tid(req) }, orderBy: { updatedAt: 'desc' } })).map(tplOut));
});

adminRouter.put('/bill-templates/:id', requireTenant, guard('bill-studio', 'edit'), async (req, res) => {
  const b = templateSchema.parse(req.body);
  if (JSON.stringify(b.elements).length > 60_000) throw badRequest('Template is too large.');
  const key = tplKey(req);
  const existing = await findTpl(req);
  const t = await db.$transaction(async (tx) => {
    if (b.isDefault) await tx.billTemplate.updateMany({ where: { tenantId: tid(req) }, data: { isDefault: false } });
    const data = { ...b, elements: b.elements as Prisma.InputJsonValue };
    return existing ? tx.billTemplate.update({ where: { id: existing.id }, data }) : tx.billTemplate.create({ data: { ...data, key, tenantId: tid(req) } });
  });
  await audit(req, existing ? 'edited' : 'created', 'Bill Studio', t.name);
  res.json(tplOut(t));
});

adminRouter.post('/bill-templates/:id/default', requireTenant, guard('bill-studio', 'edit'), async (req, res) => {
  const t = await findTpl(req);
  if (!t) throw notFound('Template');
  await db.$transaction([db.billTemplate.updateMany({ where: { tenantId: tid(req) }, data: { isDefault: false } }), db.billTemplate.update({ where: { id: t.id }, data: { isDefault: true } })]);
  res.json({ ok: true });
});

adminRouter.delete('/bill-templates/:id', requireTenant, guard('bill-studio', 'delete'), async (req, res) => {
  const t = await findTpl(req);
  if (!t) throw notFound('Template');
  if (t.isDefault) throw badRequest('Choose another default template before deleting this one.');
  await db.billTemplate.delete({ where: { id: t.id } });
  await audit(req, 'deleted', 'Bill Studio', t.name);
  res.json({ id: t.key });
});

// ════════ KOT ticket design (kept in the business settings) ════════
const kotDesignSchema = z.object({
  paper: z.enum(['thermal80', 'thermal58']),
  font: z.enum(['mono', 'sans']),
  title: text(20),
  itemSize: z.enum(['normal', 'large', 'xl']),
  showBusiness: z.boolean(),
  showOrderType: z.boolean(),
  showTime: z.boolean(),
  showNotes: z.boolean(),
  showItemCount: z.boolean(),
  showKotNumber: z.boolean(),
  header: text(60).default(''),
  footer: text(80).default(''),
});
const kotDesignOf = async (tenantId: string) => {
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  return ((t.settings ?? {}) as Record<string, unknown>).kotDesign ?? null;
};

adminRouter.get('/kot-design', requireTenant, guard(['bill-studio', 'restaurant-orders', 'restaurant-kitchen']), async (req, res) => {
  res.json({ design: await kotDesignOf(tid(req)) });
});

adminRouter.put('/kot-design', requireTenant, guard('bill-studio', 'edit'), async (req, res) => {
  const design = kotDesignSchema.parse(req.body);
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tid(req) }, select: { settings: true } });
  const settings = { ...((t.settings ?? {}) as Record<string, unknown>), kotDesign: design };
  await db.tenant.update({ where: { id: tid(req) }, data: { settings: settings as Prisma.InputJsonValue } });
  await audit(req, 'edited', 'Bill Studio', 'KOT ticket design');
  res.json({ design });
});

// ════════ POS held bills ════════
adminRouter.get('/pos/held', requireTenant, guard('pos'), async (req, res) => {
  res.json((await db.heldBill.findMany({ where: { tenantId: tid(req) }, orderBy: { heldAt: 'desc' }, take: 30 })).map((h) => plain(h)));
});
adminRouter.post('/pos/held', requireTenant, guard('pos', 'create'), async (req, res) => {
  const b = z.object({ label: requiredText('Label', 60), state: z.record(z.unknown()) }).parse(req.body);
  if (JSON.stringify(b.state).length > 100_000) throw badRequest('Bill is too large to hold.');
  const h = await db.heldBill.create({ data: { tenantId: tid(req), userId: req.auth!.user.id, label: b.label, state: b.state as Prisma.InputJsonValue } });
  res.status(201).json(plain(h));
});
adminRouter.delete('/pos/held/:id', requireTenant, guard('pos'), async (req, res) => {
  await db.heldBill.deleteMany({ where: { id: String(req.params.id), tenantId: tid(req) } });
  res.json({ ok: true });
});

