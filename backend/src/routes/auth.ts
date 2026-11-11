import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { createSession, destroySession, hashPassword, verifyPassword } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/http.js';
import { workspaceOut } from '../lib/mappers.js';
import { BUSINESS_TYPES } from '../lib/access.js';
import { createTenant } from '../lib/tenants.js';
import { email, password, phone, phoneKey, requiredText } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });

/** Payload the web app needs after sign-in or on load. */
export function mePayload(req: Request) {
  const a = req.auth!;
  return {
    user: { id: a.user.id, name: a.user.name, email: a.user.email, phone: a.user.phone ?? '', role: a.user.role, tenantId: a.user.tenantId ?? undefined },
    impersonating: a.impersonating && a.tenant ? { tenantId: a.tenant.id, tenantName: a.tenant.name } : null,
    workspace: a.tenant ? workspaceOut(a.tenant) : null,
    permissions: a.permissions,
  };
}

// ── First-run platform owner setup ──
authRouter.get('/setup', async (_req, res) => {
  const admins = await db.user.count({ where: { role: 'Super Admin' } });
  res.json({ needsSetup: admins === 0 });
});

authRouter.post('/setup', limiter, async (req, res) => {
  const body = z.object({ name: requiredText('Name', 60, 2), email, password }).parse(req.body);
  const user = await db.$transaction(async (tx) => {
    if ((await tx.user.count({ where: { role: 'Super Admin' } })) > 0) throw forbidden('The platform owner account already exists. Please sign in.');
    if (await tx.user.findUnique({ where: { email: body.email } })) throw conflict(`${body.email} is already used by another account.`);
    return tx.user.create({ data: { name: body.name, email: body.email, passwordHash: await hashPassword(body.password), role: 'Super Admin', status: 'active', lastLoginAt: new Date() } });
  });
  await createSession(req, res, user.id, true);
  res.status(201).json({ ok: true });
});

// ── Sign in ──
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-0', 12);

authRouter.post('/login', limiter, async (req, res) => {
  const body = z.object({ identifier: z.string().trim().min(1, 'Enter your email or mobile number').max(120), password: z.string().min(1, 'Enter your password').max(128), remember: z.boolean().default(true) }).parse(req.body);
  const id = body.identifier.toLowerCase();
  const key = id.includes('@') ? null : phoneKey(id);
  const user = id.includes('@') ? await db.user.findUnique({ where: { email: id }, include: { tenant: true } }) : key ? await db.user.findUnique({ where: { phoneKey: key }, include: { tenant: true } }) : null;
  // Always run a bcrypt comparison so response time doesn't reveal whether an account exists.
  const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Incorrect email/mobile or password.');
  if (user.status === 'suspended') throw forbidden('Your access has been suspended. Please contact your business owner.');
  if (user.tenant && (user.tenant.status === 'suspended' || user.tenant.status === 'churned')) throw forbidden(`${user.tenant.name} is suspended. Please contact Sahasra support.`);
  const now = new Date();
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: now, status: 'active' } });
  if (user.tenantId) await db.tenant.update({ where: { id: user.tenantId }, data: { lastActiveAt: now } });
  await createSession(req, res, user.id, body.remember);
  await db.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id, user: user.name, action: 'logged in', module: 'Auth', target: user.email, details: String(req.headers['user-agent'] ?? '').slice(0, 120), ip: req.ip ?? '' } });
  res.json({ ok: true });
});

// ── Public sign-up: anyone can create a business; it is unlocked once the Build plan is paid ──
const signupLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many sign-ups from this network. Please try again in an hour.' } });

authRouter.post('/signup', signupLimiter, async (req, res) => {
  const body = z
    .object({
      businessName: requiredText('Business name', 80, 2),
      type: z.enum(BUSINESS_TYPES, { errorMap: () => ({ message: 'Choose your business type' }) }),
      city: requiredText('City', 60),
      ownerName: requiredText('Your name', 60, 2),
      email,
      phone,
      password,
    })
    .strict()
    .parse(req.body);
  const { owner } = await createTenant({
    name: body.businessName,
    type: body.type,
    city: body.city,
    ownerName: body.ownerName,
    ownerEmail: body.email,
    phone: body.phone,
    plan: 'build',
    password: body.password,
    ownerStatus: 'active',
    selfSignup: true,
  });
  await db.user.update({ where: { id: owner.id }, data: { lastLoginAt: new Date() } });
  await createSession(req, res, owner.id, true);
  await db.auditLog.create({ data: { tenantId: owner.tenantId, userId: owner.id, user: owner.name, action: 'created', module: 'Auth', target: body.businessName, details: 'Signed up on the website', ip: req.ip ?? '' } });
  res.status(201).json({ ok: true });
});

// Businesses can also be created by the Sahasra Super Admin — see /platform/tenants.

authRouter.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(mePayload(req));
});

authRouter.post('/change-password', requireAuth, limiter, async (req, res) => {
  const body = z.object({ current: z.string().min(1, 'Enter your current password'), next: password }).parse(req.body);
  const user = await db.user.findUniqueOrThrow({ where: { id: req.auth!.user.id } });
  if (!(await verifyPassword(body.current, user.passwordHash))) throw badRequest('Your current password is incorrect.');
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.next) } });
  // Sign out every other device.
  await db.session.deleteMany({ where: { userId: user.id, NOT: { id: req.auth!.sessionId } } });
  await audit(req, 'edited', 'Auth', user.email, 'Password changed');
  res.json({ ok: true });
});

authRouter.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await db.session.findMany({ where: { userId: req.auth!.user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' } });
  res.json(sessions.map((s) => ({ id: s.id, userAgent: s.userAgent ?? '', ip: s.ip ?? '', createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), current: s.id === req.auth!.sessionId })));
});

authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const s = await db.session.findFirst({ where: { id: String(req.params.id), userId: req.auth!.user.id } });
  if (!s) throw notFound('Session');
  await db.session.delete({ where: { id: s.id } });
  res.json({ ok: true });
});
