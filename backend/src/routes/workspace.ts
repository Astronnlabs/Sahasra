import { Prisma } from '@prisma/client';
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db.js';
import { ANY_BUSINESS_TYPE } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound, forbidden } from '../lib/http.js';
import { workspaceOut } from '../lib/mappers.js';
import { plain } from '../lib/serialize.js';
import { optionalEmail, optionalPhone, optionalText, requiredText, upperOptional, GSTIN_RE } from '../lib/validate.js';
import { guard, requireAuth, requireTenant, tid } from '../middleware/auth.js';

export const workspaceRouter = Router();

workspaceRouter.get('/workspace', requireTenant, async (req, res) => {
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tid(req) } });
  res.json({ ...workspaceOut(t), addressLine: t.addressLine ?? '', city: t.city, state: t.state ?? '', pincode: t.pincode ?? '' });
});

workspaceRouter.put('/workspace/profile', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const b = z
    .object({
      businessName: requiredText('Business name', 80, 2),
      businessType: z.enum(ANY_BUSINESS_TYPE).optional(),
      phone: optionalPhone,
      email: optionalEmail,
      gstin: upperOptional(GSTIN_RE, 'GSTIN should look like 27ABCDE1234F1Z5'),
      addressLine: optionalText(200),
      city: optionalText(60),
      state: optionalText(60),
      pincode: z.string().trim().optional().refine((v) => !v || /^\d{6}$/.test(v), 'PIN code must be 6 digits'),
    })
    .parse(req.body);
  const current = await db.tenant.findUniqueOrThrow({ where: { id: tid(req) }, select: { type: true } });
  // The business type is set by Sahasra; only a Super Admin (support mode) may change it.
  if (b.businessType && b.businessType !== current.type && !req.auth!.isSuperAdmin) throw forbidden('Your business type is managed by Sahasra. Ask from Help & Support to change it.');
  const t = await db.tenant.update({
    where: { id: tid(req) },
    data: {
      name: b.businessName,
      ...(b.businessType ? { type: b.businessType } : {}),
      businessPhone: b.phone ?? null,
      businessEmail: b.email ?? null,
      gstin: b.gstin ?? null,
      addressLine: b.addressLine ?? null,
      city: b.city ?? '',
      state: b.state ?? null,
      pincode: b.pincode || null,
    },
  });
  await audit(req, 'edited', 'Settings', 'Business Profile', 'Business details updated');
  res.json(workspaceOut(t));
});

/** Business-wide settings (invoice numbering, POS, GST, notifications…), merged key by key. */
workspaceRouter.put('/workspace/settings', requireTenant, guard('settings', 'edit'), async (req, res) => {
  const patch = z.record(z.string().max(60), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])).parse(req.body);
  const current = await db.tenant.findUniqueOrThrow({ where: { id: tid(req) }, select: { settings: true } });
  const settings = { ...((current.settings ?? {}) as Record<string, unknown>), ...patch };
  await db.tenant.update({ where: { id: tid(req) }, data: { settings: settings as Prisma.InputJsonValue } });
  await audit(req, 'edited', 'Settings', 'Settings', `Updated: ${Object.keys(patch).join(', ')}`);
  res.json(settings);
});

/** Per-user UI preferences such as dashboard layout. */
workspaceRouter.get('/me/preferences', requireAuth, async (req, res) => {
  const u = await db.user.findUniqueOrThrow({ where: { id: req.auth!.user.id }, select: { preferences: true } });
  res.json(u.preferences ?? {});
});
workspaceRouter.put('/me/preferences', requireAuth, async (req, res) => {
  const patch = z.record(z.string().max(60), z.unknown()).parse(req.body);
  if (JSON.stringify(patch).length > 20_000) throw badRequest('Preferences are too large.');
  const u = await db.user.findUniqueOrThrow({ where: { id: req.auth!.user.id }, select: { preferences: true } });
  const preferences = { ...((u.preferences ?? {}) as Record<string, unknown>), ...patch };
  await db.user.update({ where: { id: req.auth!.user.id }, data: { preferences: preferences as Prisma.InputJsonValue } });
  res.json(preferences);
});

// ── Uploads ──
const ALLOWED: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString() === '%PDF-',
};
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

workspaceRouter.post('/uploads', requireTenant, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Choose a file to upload.');
  const check = ALLOWED[file.mimetype];
  if (!check || !check(file.buffer)) throw badRequest('Only PNG, JPG, WebP or PDF files up to 5 MB are allowed.');
  if ((req.query.purpose === 'image' || req.query.purpose === 'logo') && !file.mimetype.startsWith('image/')) throw badRequest('Choose a PNG, JPG or WebP picture.');
  const dir = path.join(config.uploadDir, tid(req));
  await fs.promises.mkdir(dir, { recursive: true });
  const stored = path.join(dir, crypto.randomBytes(16).toString('hex'));
  await fs.promises.writeFile(stored, file.buffer);
  const row = await db.upload.create({ data: { tenantId: tid(req), fileName: path.basename(file.originalname).slice(0, 150), mimeType: file.mimetype, size: file.size, path: stored } });
  if (req.query.purpose === 'logo') {
    if (!file.mimetype.startsWith('image/')) throw badRequest('The logo must be an image.');
    await db.tenant.update({ where: { id: tid(req) }, data: { logoUploadId: row.id } });
  }
  res.status(201).json({ id: row.id, fileName: row.fileName, size: row.size, url: `/api/uploads/${row.id}` });
});

workspaceRouter.get('/uploads/:id', requireAuth, async (req, res) => {
  const row = await db.upload.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound('File');
  if (!req.auth!.isSuperAdmin && row.tenantId !== req.auth!.tenantId) throw forbidden();
  res.setHeader('Content-Type', row.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.fileName)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(row.path);
});

/** Full JSON export of the business's data (owner/admin backup). */
workspaceRouter.get('/export', requireTenant, guard('settings', 'export'), async (req, res) => {
  const where = { tenantId: tid(req) };
  const [tenant, products, services, customers, vendors, sales, purchases, payments, expenses, employees, attendance, advances, stockMovements] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tid(req) } }),
    db.product.findMany({ where }),
    db.serviceItem.findMany({ where }),
    db.customer.findMany({ where }),
    db.vendor.findMany({ where }),
    db.sale.findMany({ where, include: { items: true } }),
    db.purchase.findMany({ where, include: { items: true } }),
    db.payment.findMany({ where }),
    db.expense.findMany({ where }),
    db.employee.findMany({ where }),
    db.attendance.findMany({ where }),
    db.advance.findMany({ where }),
    db.stockMovement.findMany({ where }),
  ]);
  await audit(req, 'exported', 'Settings', 'Full data export');
  res.setHeader('Content-Disposition', `attachment; filename="sahasra-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(plain({ exportedAt: new Date(), business: workspaceOut(tenant), products, services, customers, vendors, sales, purchases, payments, expenses, employees, attendance, advances, stockMovements }));
});
