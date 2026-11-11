import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';

/**
 * Print history. Devices print on their own (Bluetooth or the computer's printer service) and
 * report what happened here when they are online. Only the bill/KOT number is stored — no
 * customer details, and never Bluetooth addresses or printer secrets.
 */
export const printJobsRouter = Router();

const KEEP_DAYS = 90;

const job = z.object({
  id: z.string().uuid(),
  kind: z.enum(['bill', 'kot']),
  reference: z.string().trim().min(1).max(40),
  printer: z.string().trim().max(80),
  connection: z.enum(['bluetooth-classic', 'bluetooth-le', 'windows']),
  device: z.string().trim().max(60).default(''),
  copies: z.number().int().min(1).max(5),
  status: z.enum(['printed', 'failed', 'cancelled', 'interrupted']),
  error: z.string().max(300).nullable().optional(),
  reprint: z.boolean().default(false),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().optional(),
});

/** Anyone in the business who prints records their own prints. */
printJobsRouter.post('/print-jobs/sync', requireTenant, async (req, res) => {
  const { jobs } = z.object({ jobs: z.array(job).max(50) }).parse(req.body);
  const tenantId = tid(req);
  const userId = req.auth!.user.id;
  // A device sends each print once more if it missed the reply; ids already stored are skipped,
  // and an id belonging to another business is never overwritten.
  const existing = new Set((await db.printJob.findMany({ where: { id: { in: jobs.map((j) => j.id) } }, select: { id: true } })).map((r) => r.id));
  const fresh = jobs.filter((j) => !existing.has(j.id));
  if (fresh.length) {
    await db.printJob.createMany({
      data: fresh.map((j) => ({
        id: j.id,
        tenantId,
        userId,
        kind: j.kind,
        reference: j.reference,
        printer: j.printer || 'Printer',
        connection: j.connection,
        device: j.device,
        copies: j.copies,
        status: j.status,
        error: j.error ?? null,
        reprint: j.reprint,
        createdAt: new Date(j.createdAt),
        finishedAt: j.finishedAt ? new Date(j.finishedAt) : null,
      })),
      skipDuplicates: true,
    });
  }
  // History is kept for 90 days.
  await db.printJob.deleteMany({ where: { tenantId, createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 864e5) } } });
  res.json({ saved: fresh.length });
});

printJobsRouter.get('/print-jobs', requireTenant, guard(['settings', 'pos', 'sales']), async (req, res) => {
  const tenantId = tid(req);
  const rows = await db.printJob.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds }, tenantId }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  res.json(
    rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      reference: r.reference,
      printer: r.printer,
      connection: r.connection,
      device: r.device,
      copies: r.copies,
      status: r.status,
      error: r.error,
      reprint: r.reprint,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      user: r.userId ? (nameOf.get(r.userId) ?? null) : null,
    })),
  );
});
