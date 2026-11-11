/**
 * Data import for services, staff, past bills, appointments and attendance (Settings → Your data).
 * Rows arrive already mapped to our field names by the app. Each row is checked on its own, so one bad
 * row never blocks the rest; `dryRun` reports what would happen without saving anything.
 */
import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { sellerSnapshot } from '../lib/seller.js';
import { num, round2 } from '../lib/serialize.js';
import { nextSeq } from '../lib/tenants.js';
import { optionalEmail, phone, phoneKey, requiredText, text } from '../lib/validate.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';
import type { PageId, Permission } from '../lib/access.js';

export const importMoreRouter = Router();

type Row = Record<string, unknown>;
type RowResult = { row: number; action: 'create' | 'update' | 'skip' | 'error'; message?: string; field?: string };

const body = z.object({
  rows: z.array(z.record(z.string().max(40), z.union([z.string().max(20000), z.number(), z.boolean(), z.null()]))).min(1, 'The file has no rows to import.').max(5000, 'Import up to 5,000 rows at a time.'),
  existing: z.enum(['skip', 'update']).default('skip'),
  dryRun: z.boolean().default(false),
  /** Check only: staff names in the same file that will be imported first (so attendance can find them). */
  pendingStaff: z.array(z.string().trim().max(80)).max(5000).default([]),
});

const clean = (row: Row) => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== ''));
const issue = (e: unknown): Pick<RowResult, 'message' | 'field'> => {
  if (e instanceof z.ZodError) return { field: String(e.issues[0]?.path[0] ?? ''), message: e.issues[0]?.message ?? 'Invalid value' };
  return { message: e instanceof Error ? e.message : 'Could not import this row' };
};
const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** "2026-08-25", "25-08-2026", "2026-08-25 16:24:30" → a Date at that local day (noon, so it never slips a day). */
function dayOf(v: unknown, time?: unknown): Date {
  const s = String(v ?? '').trim();
  let y: string, m: string, d: string;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const ind = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (iso) [, y, m, d] = iso;
  else if (ind) [, d, m, y] = ind.map((x, i) => (i === 3 && x.length === 2 ? `20${x}` : x)) as [string, string, string, string];
  else throw new z.ZodError([{ code: 'custom', path: ['date'], message: `"${s || 'blank'}" is not a date` }]);
  let hh = 12, mm = 0;
  const t = String(time ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?/i);
  if (t) {
    hh = Number(t[1]) % (t[3] ? 12 : 24) + (t[3] && /pm/i.test(t[3]) ? 12 : 0);
    mm = Number(t[2]);
  }
  const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new z.ZodError([{ code: 'custom', path: ['date'], message: `"${s}" is not a date` }]);
  return date;
}

/** Registers POST /import/<kind>: runs `one` on every row and reports created / updated / skipped / problems. */
function importer(kind: string, page: PageId | PageId[], action: Permission, module: string, run: (req: Request, ctx: { existing: 'skip' | 'update'; dryRun: boolean; pendingStaff: string[] }) => Promise<(row: Row) => Promise<RowResult['action'] | { action: RowResult['action']; message: string }>>) {
  importMoreRouter.post(`/import/${kind}`, requireTenant, guard(page, action), async (req, res) => {
    const b = body.parse(req.body);
    const one = await run(req, b);
    const results: RowResult[] = [];
    for (const [i, raw] of b.rows.entries()) {
      try {
        const r = await one(clean(raw));
        results.push(typeof r === 'string' ? { row: i + 1, action: r } : { row: i + 1, ...r });
      } catch (e) {
        results.push({ row: i + 1, action: 'error', ...issue(e) });
      }
    }
    const count = (a: RowResult['action']) => results.filter((r) => r.action === a).length;
    const summary = { created: count('create'), updated: count('update'), skipped: count('skip'), failed: count('error') };
    if (!b.dryRun && summary.created + summary.updated > 0) await audit(req, 'created', module, 'Data import', `Imported ${summary.created} new, updated ${summary.updated}, skipped ${summary.skipped}, ${summary.failed} with errors`);
    res.json({ ...summary, dryRun: b.dryRun, rows: results.filter((r) => r.action === 'skip' || r.action === 'error').slice(0, 500) });
  });
}

// ── Services ──
const GENDER: Record<string, string> = { men: 'Men', male: 'Men', gents: 'Men', man: 'Men', women: 'Women', female: 'Women', ladies: 'Women', woman: 'Women', unisex: 'Unisex', all: 'Unisex', kids: 'Kids', child: 'Kids', children: 'Kids' };
const serviceRow = z.object({
  name: requiredText('Service name', 80, 2),
  category: text(60).default('General'),
  price: z.coerce.number().positive('Must be greater than 0').max(1e9),
  durationMins: z.coerce.number().int().min(0).max(1440).default(0),
  gstRate: z.coerce.number().refine((r) => [0, 0.25, 1.5, 3, 5, 12, 18, 28, 40].includes(r), 'Invalid GST rate').optional(),
  sac: z.string().trim().regex(/^(\d{4,6})?$/, 'SAC should be 4–6 digits').default(''),
  // Old software sometimes stores odd values (e.g. −64); commission is kept between 0 and 100.
  commissionPct: z.coerce.number().default(0).transform((v) => Math.min(100, Math.max(0, v))),
  gender: text(20).optional(),
  status: text(20).optional(),
});

importer('services', 'services', 'create', 'Services', async (req, ctx) => {
  const tenantId = tid(req);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { gstin: true } });
  const list = await db.serviceItem.findMany({ where: { tenantId }, select: { id: true, name: true, price: true, attributes: true } });
  // Same name can be several services (Hair Spa for men ₹500, for women ₹1,300…): name + for + price identify one.
  const keyOf = (name: string, gender: string, price: number) => `${name.trim().toLowerCase()}|${gender.toLowerCase()}|${round2(price)}`;
  const byKey = new Map(list.map((s) => [keyOf(s.name, String((s.attributes as Record<string, unknown>)?.gender ?? ''), num(s.price)), s]));
  const seen = new Set<string>();
  return async (row) => {
    const r = serviceRow.parse(row);
    const gender = GENDER[lower(r.gender)] ?? '';
    const key = keyOf(r.name, gender, r.price);
    if (seen.has(key)) throw new Error('Same service (name, for, price) appears twice in the file.');
    seen.add(key);
    const match = byKey.get(key);
    if (match && ctx.existing === 'skip') return { action: 'skip', message: 'Already in your services' };
    const data = {
      name: r.name,
      category: r.category,
      price: r.price,
      durationMins: r.durationMins,
      gstRate: r.gstRate ?? (tenant.gstin ? 18 : 0),
      sac: r.sac,
      commissionPct: r.commissionPct,
      status: /inactive|disabled|off|hidden|archived/.test(lower(r.status)) ? 'inactive' : 'active',
      attributes: (gender ? { gender } : {}) as Prisma.InputJsonValue,
    };
    if (!ctx.dryRun) {
      if (match) await db.serviceItem.update({ where: { id: match.id }, data });
      else byKey.set(key, await db.serviceItem.create({ data: { ...data, tenantId } }));
    }
    return match ? 'update' : 'create';
  };
});

// ── Staff (employees) ──
const employeeRow = z.object({
  name: requiredText('Name', 60, 2),
  phone,
  email: optionalEmail.transform((v) => v ?? ''),
  designation: text(60).default('Staff'),
  department: text(60).default('General'),
  salary: z.coerce.number().min(0).max(1e9).default(0),
  joinDate: z.unknown().optional(),
  status: text(20).optional(),
  address: text(200).default(''),
});

importer('employees', 'employees', 'create', 'Employees', async (req, ctx) => {
  const tenantId = tid(req);
  const list = await db.employee.findMany({ where: { tenantId }, select: { id: true, phone: true, name: true } });
  const byPhone = new Map(list.map((e) => [phoneKey(e.phone) ?? e.phone, e]));
  const seen = new Set<string>();
  return async (row) => {
    const r = employeeRow.parse(row);
    const key = phoneKey(r.phone) ?? r.phone;
    if (seen.has(key)) throw new Error('Same mobile number appears twice in the file.');
    seen.add(key);
    const match = byPhone.get(key);
    if (match && ctx.existing === 'skip') return { action: 'skip', message: `Already saved as ${match.name}` };
    const data = {
      name: r.name,
      phone: r.phone,
      email: r.email,
      designation: r.designation || 'Staff',
      department: r.department || 'General',
      salary: r.salary,
      joinDate: r.joinDate ? dayOf(r.joinDate) : new Date(),
      status: /inactive|left|resigned|disabled/.test(lower(r.status)) ? 'inactive' : /leave/.test(lower(r.status)) ? 'on-leave' : 'active',
      address: r.address,
    };
    if (!ctx.dryRun) {
      if (match) await db.employee.update({ where: { id: match.id }, data });
      else {
        const seq = await db.$transaction((tx) => nextSeq(tx, tenantId, 'employeeSeq'));
        byPhone.set(key, await db.employee.create({ data: { ...data, tenantId, code: `EMP-${String(seq).padStart(3, '0')}` } }));
      }
    }
    return match ? 'update' : 'create';
  };
});

// ── Past bills (sales history) ──
const PAY: Record<string, string> = { cash: 'cash', upi: 'upi', gpay: 'upi', phonepe: 'upi', paytm: 'upi', online: 'upi', card: 'card', credit_card: 'card', debit_card: 'card', bank: 'bank', neft: 'bank', transfer: 'bank', credit: 'credit', due: 'credit', split: 'split', mixed: 'split' };
const billRow = z.object({
  invoiceNo: requiredText('Bill number', 60),
  date: z.unknown(),
  customerName: text(120).default(''),
  customerPhone: text(30).default(''),
  items: z.unknown().optional(),
  subtotal: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).default(0),
  discountType: text(20).default(''),
  tax: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0, 'Cannot be negative'),
  paymentMethod: text(30).default(''),
  paymentStatus: text(30).default(''),
  notes: text(500).optional(),
  staff: text(80).optional(),
});
interface BillItem { name?: string; qty?: number; price?: number; type?: string; staffName?: string; staff?: string }

/** Items as stored by other software: JSON array of { name, qty, price, type, staffName }. */
function billItems(v: unknown): BillItem[] {
  if (Array.isArray(v)) return v as BillItem[];
  if (typeof v !== 'string' || !v.trim().startsWith('[')) return [];
  try {
    const parsed = JSON.parse(v) as unknown;
    return Array.isArray(parsed) ? (parsed as BillItem[]) : [];
  } catch {
    return [];
  }
}

importer('sales', ['sales', 'pos'], 'create', 'Sales', async (req, ctx) => {
  const tenantId = tid(req);
  const [existing, customers, services, products, employees] = await Promise.all([
    db.sale.findMany({ where: { tenantId }, select: { invoiceNo: true } }),
    db.customer.findMany({ where: { tenantId }, select: { id: true, name: true, phone: true } }),
    db.serviceItem.findMany({ where: { tenantId }, select: { id: true, name: true, price: true, sac: true } }),
    db.product.findMany({ where: { tenantId }, select: { id: true, name: true, sku: true, hsn: true, purchasePrice: true } }),
    db.employee.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);
  const taken = new Set(existing.map((s) => s.invoiceNo.toLowerCase()));
  const custByPhone = new Map(customers.map((c) => [phoneKey(c.phone) ?? c.phone, c]));
  const staffOf = (name: string | undefined) => {
    const n = lower(name);
    if (!n) return { staffId: null, staff: '' };
    const e = employees.find((x) => lower(x.name) === n) ?? employees.find((x) => lower(x.name).startsWith(`${n} `));
    return { staffId: e?.id ?? null, staff: e?.name ?? String(name).trim().slice(0, 80) };
  };
  const seller = ctx.dryRun ? null : await db.$transaction((tx) => sellerSnapshot(tx, tenantId));
  return async (row) => {
    const r = billRow.parse(row);
    const no = r.invoiceNo.trim();
    if (taken.has(no.toLowerCase())) return { action: 'skip', message: 'This bill is already in Sahaasra' };
    const date = dayOf(r.date);
    if (date.getTime() > Date.now() + 864e5) throw new Error('Bill date is in the future.');

    const raw = billItems(r.items);
    const lines = raw.length
      ? raw.map((it) => {
          const name = String(it.name ?? 'Item').trim().slice(0, 200) || 'Item';
          const qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
          const price = Math.max(0, Number(it.price) || 0);
          const isProduct = /product|item|retail/.test(lower(it.type));
          // Link to today's catalogue by name (prefer the service with the same price).
          const svc = isProduct ? undefined : services.find((s) => lower(s.name) === lower(name) && num(s.price) === price) ?? services.find((s) => lower(s.name) === lower(name));
          const prod = isProduct || !svc ? products.find((p) => lower(p.name) === lower(name)) : undefined;
          return { name, qty, price, svc, prod, ...staffOf(it.staffName ?? it.staff ?? r.staff) };
        })
      : [{ name: 'Bill (imported)', qty: 1, price: r.subtotal ?? r.total, svc: undefined, prod: undefined, ...staffOf(r.staff) }];

    const gross = round2(lines.reduce((s, l) => s + l.qty * l.price, 0));
    const subtotal = r.subtotal ?? gross;
    const discount = round2(/percent|%/.test(lower(r.discountType)) ? (subtotal * r.discount) / 100 : r.discount);
    if (discount > subtotal + 0.01) throw new Error('Discount is larger than the bill.');
    const taxable = Math.max(0, subtotal - discount);
    const gstRate = taxable > 0 && r.tax > 0 ? Math.round((r.tax / taxable) * 1000) / 10 : 0;
    // The bill discount is shared across lines by value.
    const shares = lines.map((l) => (gross > 0 ? (l.qty * l.price) / gross : 1 / lines.length));
    const lineDisc = shares.map((s) => round2(discount * s));
    lineDisc[lineDisc.length - 1] = round2(discount - lineDisc.slice(0, -1).reduce((a, b) => a + b, 0));

    const status = lower(r.paymentStatus);
    const unpaid = /unpaid|pending|due|credit/.test(status) || lower(r.paymentMethod) === 'credit';
    const paid = unpaid ? 0 : r.total;
    const method = PAY[lower(r.paymentMethod).replace(/\s+/g, '_')] ?? (unpaid ? 'credit' : 'cash');
    const phoneK = phoneKey(r.customerPhone);
    const customer = phoneK ? custByPhone.get(phoneK) : undefined;

    if (ctx.dryRun) {
      taken.add(no.toLowerCase());
      return 'create';
    }
    await db.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          tenantId,
          invoiceNo: no,
          customerId: customer?.id ?? null,
          customerName: customer?.name ?? (r.customerName || 'Walk-in Customer'),
          date,
          subtotal,
          discount,
          tax: r.tax,
          total: r.total,
          paid,
          payment: method,
          status: paid >= r.total ? 'paid' : 'unpaid',
          cashier: 'Imported',
          notes: r.notes || null,
          seller: seller ?? Prisma.DbNull,
          // Old bills don't move today's stock.
          items: {
            create: lines.map((l, i) => ({
              productId: l.prod?.id ?? null,
              serviceId: l.svc?.id ?? null,
              name: l.name,
              sku: l.prod?.sku ?? l.svc?.sac ?? '',
              hsn: l.prod?.hsn ?? l.svc?.sac ?? '',
              qty: l.qty,
              stockQty: 0,
              rate: l.price,
              discount: lineDisc[i],
              gstRate,
              cost: l.prod ? num(l.prod.purchasePrice) : 0,
              staffId: l.staffId,
              staff: l.staff,
            })),
          },
        },
      });
      if (paid > 0) await tx.payment.create({ data: { tenantId, direction: 'in', customerId: customer?.id ?? null, saleId: sale.id, amount: paid, method, reference: no, date, createdBy: 'Imported' } });
      if (customer) {
        const c = await tx.customer.findUniqueOrThrow({ where: { id: customer.id }, select: { lastPurchase: true } });
        await tx.customer.update({
          where: { id: customer.id },
          data: { orders: { increment: 1 }, totalSpend: { increment: r.total }, outstanding: { increment: round2(r.total - paid) }, ...(!c.lastPurchase || c.lastPurchase < date ? { lastPurchase: date } : {}) },
        });
      }
    });
    taken.add(no.toLowerCase());
    return 'create';
  };
});

// ── Appointments ──
const APPT_STATUS: Record<string, string> = { confirmed: 'booked', booked: 'booked', pending: 'booked', scheduled: 'booked', 'in-progress': 'in-progress', started: 'in-progress', completed: 'completed', done: 'completed', cancelled: 'cancelled', canceled: 'cancelled', 'no-show': 'no-show', noshow: 'no-show', missed: 'no-show' };
const apptRow = z.object({
  customer: requiredText('Customer', 60, 2),
  phone: text(30).default(''),
  service: text(200).default(''),
  staff: text(60).default(''),
  date: z.unknown(),
  time: text(20).default(''),
  durationMins: z.coerce.number().int().min(5).max(720).default(30),
  price: z.coerce.number().min(0).optional(),
  status: text(30).default(''),
});

importer('appointments', 'appointments', 'create', 'Appointments', async (req, ctx) => {
  const tenantId = tid(req);
  const [list, services] = await Promise.all([
    db.appointment.findMany({ where: { tenantId }, select: { id: true, customer: true, start: true } }),
    db.serviceItem.findMany({ where: { tenantId }, select: { name: true, price: true } }),
  ]);
  const keyOf = (c: string, start: Date) => `${c.trim().toLowerCase()}|${start.toISOString()}`;
  const byKey = new Map(list.map((a) => [keyOf(a.customer, a.start), a]));
  return async (row) => {
    const r = apptRow.parse(row);
    const start = dayOf(r.date, r.time);
    const key = keyOf(r.customer, start);
    const match = byKey.get(key);
    if (match && ctx.existing === 'skip') return { action: 'skip', message: 'Already booked' };
    const firstService = r.service.split(',')[0]?.trim() ?? '';
    const price = r.price ?? num(services.find((s) => lower(s.name) === lower(firstService))?.price ?? 0);
    const data = {
      customer: r.customer,
      phone: phoneKey(r.phone) ?? r.phone,
      service: (r.service || 'Service').slice(0, 80),
      staff: (r.staff || 'Any').slice(0, 60),
      start,
      durationMins: r.durationMins,
      price,
      status: APPT_STATUS[lower(r.status)] ?? (start.getTime() < Date.now() ? 'completed' : 'booked'),
    };
    if (!ctx.dryRun) {
      if (match) await db.appointment.update({ where: { id: match.id }, data });
      else byKey.set(key, await db.appointment.create({ data: { ...data, tenantId } }));
    }
    return match ? 'update' : 'create';
  };
});

// ── Attendance ──
const ATT_STATUS: Record<string, string> = { present: 'present', p: 'present', absent: 'absent', a: 'absent', late: 'late', 'half-day': 'half-day', halfday: 'half-day', half: 'half-day', leave: 'leave', 'on-leave': 'leave', holiday: 'holiday', off: 'holiday' };
const attRow = z.object({ employee: requiredText('Employee', 80, 2), date: z.unknown(), status: text(30).default('present') });

importer('attendance', 'attendance', 'edit', 'Employees', async (req, ctx) => {
  const tenantId = tid(req);
  const employees = await db.employee.findMany({ where: { tenantId }, select: { id: true, name: true } });
  // During a check, staff from the same file aren't saved yet — count them as found.
  const pending = ctx.dryRun ? ctx.pendingStaff.map((name, i) => ({ id: `pending-${i}`, name })) : [];
  return async (row) => {
    const r = attRow.parse(row);
    const n = lower(r.employee);
    // "Surojit" in the old app is "Surojit Mondal" here: an exact name, else one employee whose name starts with it.
    const find = (list: { id: string; name: string }[]) => {
      const starts = list.filter((e) => lower(e.name).startsWith(`${n} `));
      return list.find((x) => lower(x.name) === n) ?? (starts.length === 1 ? starts[0] : undefined);
    };
    const e = find(employees) ?? find(pending);
    if (!e) throw new z.ZodError([{ code: 'custom', path: ['employee'], message: `No employee named "${r.employee}". Add them in Employees, or import your staff list too.` }]);
    if (e.id.startsWith('pending-')) return 'create';
    const day = dayOf(r.date);
    const date = new Date(`${day.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const status = ATT_STATUS[lower(r.status)] ?? 'present';
    const match = await db.attendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date } } });
    if (match && ctx.existing === 'skip') return { action: 'skip', message: 'Already marked for that day' };
    if (!ctx.dryRun) {
      if (match) await db.attendance.update({ where: { id: match.id }, data: { status } });
      else await db.attendance.create({ data: { tenantId, employeeId: e.id, date, status } });
    }
    return match ? 'update' : 'create';
  };
});
