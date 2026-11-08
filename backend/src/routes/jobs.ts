import { Prisma, type JobCard } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { sendBillInBackground } from '../lib/ebill.js';
import { badRequest, notFound } from '../lib/http.js';
import { saleOut } from '../lib/mappers.js';
import type { BillLine } from '../lib/pricing.js';
import { num, plain, round2 } from '../lib/serialize.js';
import { nextSeq } from '../lib/tenants.js';
import { isoDate, money, optionalPhone, requiredText, text } from '../lib/validate.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';
import { createSale } from './transactions.js';

/** Repair, tailoring and custom-work orders from receipt to delivery. */
export const jobsRouter = Router();

const KINDS = ['repair', 'tailoring', 'custom', 'service'] as const;
const METHODS = ['cash', 'upi', 'card', 'bank'] as const;

const lineSchema = z.object({
  kind: z.enum(['product', 'service', 'custom']),
  refId: z.string().max(40).optional(),
  name: requiredText('Item', 120),
  qty: z.coerce.number().positive().max(10000),
  /** Only for custom lines (labour, charges); catalogue items use their own price. */
  rate: money.optional(),
  gstRate: z.coerce.number().min(0).max(40).optional(),
});

const jobSchema = z.object({
  kind: z.enum(KINDS).default('repair'),
  customerId: z.string().max(40).nullable().optional(),
  customerName: requiredText('Customer name', 80, 2),
  phone: optionalPhone.transform((v) => v ?? ''),
  item: requiredText('Item received', 120, 2),
  identifier: text(40).default(''),
  problem: text(1000).default(''),
  details: z.record(z.string().trim().max(40), z.string().trim().max(200)).refine((d) => Object.keys(d).length <= 40, 'Too many details').default({}),
  estimate: money.default(0),
  assignedTo: text(60).default(''),
  promisedAt: isoDate.nullable().optional(),
  lines: z.array(lineSchema).max(50).default([]),
  notes: text(1000).default(''),
});

const jobOut = (j: JobCard) => {
  const p = plain(j) as Record<string, unknown>;
  return { ...p, customerId: j.customerId ?? undefined, promisedAt: p.promisedAt ?? undefined, saleId: j.saleId ?? undefined, invoiceNo: j.invoiceNo ?? undefined, deliveredAt: p.deliveredAt ?? undefined, advanceMethod: j.advanceMethod ?? undefined, balance: round2(Math.max(0, num(j.estimate) - num(j.advance))) };
};

/** Catalogue lines must exist in this business; their names are refreshed from the catalogue. */
async function checkLines(req: Request, lines: z.infer<typeof lineSchema>[]) {
  const tenantId = tid(req);
  const [products, services] = await Promise.all([
    db.product.findMany({ where: { tenantId, id: { in: lines.filter((l) => l.kind === 'product').map((l) => l.refId ?? '') } }, select: { id: true, name: true } }),
    db.serviceItem.findMany({ where: { tenantId, id: { in: lines.filter((l) => l.kind === 'service').map((l) => l.refId ?? '') } }, select: { id: true, name: true } }),
  ]);
  return lines.map((l) => {
    if (l.kind === 'custom') {
      if (l.rate === undefined) throw badRequest(`Enter a price for ${l.name}.`);
      return { kind: l.kind, name: l.name, qty: l.qty, rate: l.rate, gstRate: l.gstRate ?? 18 };
    }
    const found = (l.kind === 'product' ? products : services).find((x) => x.id === l.refId);
    if (!found) throw badRequest(`${l.name} is no longer in your catalogue.`);
    return { kind: l.kind, refId: found.id, name: found.name, qty: l.qty };
  });
}

async function findJob(req: Request) {
  const j = await db.jobCard.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!j) throw notFound('Job card');
  return j;
}

jobsRouter.get('/job-cards', requireTenant, guard('job-cards'), async (req, res) => {
  const rows = await db.jobCard.findMany({ where: { tenantId: tid(req) }, orderBy: { createdAt: 'desc' }, take: 2000 });
  res.json(rows.map(jobOut));
});

jobsRouter.get('/job-cards/:id', requireTenant, guard('job-cards'), async (req, res) => {
  res.json(jobOut(await findJob(req)));
});

jobsRouter.post('/job-cards', requireTenant, guard('job-cards', 'create'), async (req, res) => {
  const b = jobSchema.extend({ advance: money.default(0), advanceMethod: z.enum(METHODS).default('cash') }).parse(req.body);
  const tenantId = tid(req);
  if (b.customerId && !(await db.customer.findFirst({ where: { id: b.customerId, tenantId }, select: { id: true } }))) throw badRequest('Customer not found.');
  const lines = await checkLines(req, b.lines);
  const job = await db.$transaction(async (tx) => {
    const seq = await nextSeq(tx, tenantId, 'jobSeq');
    const number = `JC-${String(seq).padStart(4, '0')}`;
    const created = await tx.jobCard.create({
      data: {
        ...b,
        tenantId,
        number,
        customerId: b.customerId ?? null,
        promisedAt: b.promisedAt ?? null,
        details: b.details as Prisma.InputJsonValue,
        lines: lines as unknown as Prisma.InputJsonValue,
        advanceMethod: b.advance > 0 ? b.advanceMethod : null,
        createdBy: req.auth!.user.name,
      },
    });
    // The advance is real money received now; it is linked to the invoice on delivery.
    if (b.advance > 0) {
      await tx.payment.create({ data: { tenantId, direction: 'in', customerId: b.customerId ?? null, amount: b.advance, method: b.advanceMethod, reference: `Advance ${number}`, createdBy: req.auth!.user.name } });
    }
    return created;
  });
  await audit(req, 'created', 'Job cards', job.number, `${job.item} for ${job.customerName}`);
  res.status(201).json(jobOut(job));
});

jobsRouter.put('/job-cards/:id', requireTenant, guard('job-cards', 'edit'), async (req, res) => {
  const j = await findJob(req);
  if (j.status === 'delivered' || j.status === 'cancelled') throw badRequest(`${j.number} is ${j.status} and can't be changed.`);
  const b = jobSchema.partial().parse(req.body);
  const data: Prisma.JobCardUpdateInput = { ...b, details: b.details as Prisma.InputJsonValue | undefined, lines: b.lines ? ((await checkLines(req, b.lines)) as unknown as Prisma.InputJsonValue) : undefined };
  const updated = await db.jobCard.update({ where: { id: j.id }, data });
  await audit(req, 'edited', 'Job cards', j.number, `Changed: ${Object.keys(b).join(', ')}`);
  res.json(jobOut(updated));
});

jobsRouter.patch('/job-cards/:id/status', requireTenant, guard('job-cards', 'edit'), async (req, res) => {
  const { status } = z.object({ status: z.enum(['received', 'in_progress', 'ready', 'cancelled']) }).parse(req.body);
  const j = await findJob(req);
  if (j.status === 'delivered' || j.status === 'cancelled') throw badRequest(`${j.number} is already ${j.status}.`);
  const updated = await db.$transaction(async (tx) => {
    // Cancelling returns the advance to the customer.
    if (status === 'cancelled' && num(j.advance) > 0) {
      await tx.payment.create({ data: { tenantId: tid(req), direction: 'out', customerId: j.customerId, amount: num(j.advance), method: j.advanceMethod ?? 'cash', reference: `Advance refund ${j.number}`, createdBy: req.auth!.user.name } });
    }
    return tx.jobCard.update({ where: { id: j.id }, data: { status } });
  });
  await audit(req, 'edited', 'Job cards', j.number, `Status → ${status}${status === 'cancelled' && num(j.advance) > 0 ? ` (advance ₹${num(j.advance)} refunded)` : ''}`);
  res.json(jobOut(updated));
});

jobsRouter.delete('/job-cards/:id', requireTenant, guard('job-cards', 'delete'), async (req, res) => {
  const j = await findJob(req);
  if (j.status === 'delivered') throw badRequest(`${j.number} was billed on ${j.invoiceNo}. Refund that invoice instead.`);
  if (j.status !== 'cancelled' && num(j.advance) > 0) throw badRequest(`${j.number} has an advance of ₹${num(j.advance)}. Cancel the job first so the refund is recorded.`);
  await db.jobCard.delete({ where: { id: j.id } });
  await audit(req, 'deleted', 'Job cards', j.number, `${j.item} for ${j.customerName}`);
  res.json({ id: j.id });
});

/** Hands the item back: bills the parts and labour on the card and takes the balance. */
jobsRouter.post('/job-cards/:id/deliver', requireTenant, guard('job-cards', 'edit'), guard('pos', 'create'), async (req, res) => {
  const b = z.object({ payment: z.enum([...METHODS, 'credit']), discount: money.default(0), serials: z.record(z.string().max(40), z.array(text(30))).default({}) }).parse(req.body);
  const j = await findJob(req);
  if (j.status === 'delivered' || j.status === 'cancelled') throw badRequest(`${j.number} is already ${j.status}.`);
  const lines = (Array.isArray(j.lines) ? j.lines : []) as { kind: string; refId?: string; name: string; qty: number; rate?: number; gstRate?: number }[];
  if (!lines.length) throw badRequest('Add the parts and labour to bill before delivering.');
  if (b.payment === 'credit' && !j.customerId) throw badRequest('Link a saved customer to deliver on credit.');
  const billLines: BillLine[] = lines.map((l) => ({
    ...(l.kind === 'product' ? { productId: l.refId } : l.kind === 'service' ? { serviceId: l.refId } : { rate: l.rate, gstRate: l.gstRate }),
    name: l.name,
    qty: l.qty,
    discount: 0,
    addons: [],
    serials: l.kind === 'product' && l.refId ? (b.serials[l.refId] ?? []) : [],
  }));
  const advance = num(j.advance);
  const result = await db.$transaction(async (tx) => {
    // Labour and charges written on the card are allowed here (the card was approved by staff with edit rights).
    const sale = await createSale(
      tx,
      req,
      { customerId: j.customerId ?? undefined, customerName: j.customerName, items: billLines, billDiscount: b.discount, payment: b.payment, priceList: 'retail', branch: 'Main Branch', notes: `${j.number} · ${j.item}${j.identifier ? ` (${j.identifier})` : ''}` },
      { canFreeText: true, alreadyPaid: advance },
    );
    // Link the advance payment to this invoice.
    if (advance > 0) {
      await tx.payment.updateMany({ where: { tenantId: tid(req), reference: `Advance ${j.number}`, saleId: null }, data: { saleId: sale.id } });
      const extra = round2(advance - num(sale.total));
      if (extra > 0) {
        await tx.payment.create({ data: { tenantId: tid(req), direction: 'out', customerId: j.customerId, saleId: sale.id, amount: extra, method: j.advanceMethod ?? 'cash', reference: `Excess advance returned ${j.number}`, createdBy: req.auth!.user.name } });
      }
    }
    const job = await tx.jobCard.update({ where: { id: j.id }, data: { status: 'delivered', deliveredAt: new Date(), saleId: sale.id, invoiceNo: sale.invoiceNo } });
    return { sale, job };
  });
  await audit(req, 'edited', 'Job cards', j.number, `Delivered · invoice ${result.sale.invoiceNo}`);
  sendBillInBackground(tid(req), result.sale.id);
  res.json({ job: jobOut(result.job), sale: saleOut(result.sale) });
});
