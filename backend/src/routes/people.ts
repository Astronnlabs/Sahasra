import { Prisma, type Employee } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { crud } from '../lib/crud.js';
import { badRequest } from '../lib/http.js';
import { employeeOut } from '../lib/mappers.js';
import { deductionsFor, payrollSettingsOf, payrollSettingsSchema } from '../lib/payroll.js';
import { num, plain, round2 } from '../lib/serialize.js';
import { nextSeq } from '../lib/tenants.js';
import { email, isoDate, phone, positiveMoney, requiredText, text } from '../lib/validate.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';

export const peopleRouter = Router();

const STATUSES = ['present', 'absent', 'half-day', 'late', 'leave', 'holiday'] as const;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
/** UTC midnight for a yyyy-MM-dd (matches Postgres DATE). */
const utcDay = (s: string) => new Date(`${s}T00:00:00.000Z`);
const localToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const employeeSchema = z.object({
  name: requiredText('Name', 60, 2),
  phone,
  email,
  designation: requiredText('Designation', 60, 2),
  department: requiredText('Department', 60),
  branch: text(60).default('Main Branch'),
  salary: positiveMoney,
  joinDate: isoDate,
  status: z.enum(['active', 'on-leave', 'inactive']).default('active'),
  dob: isoDate.nullable().optional(),
  address: text(200).default(''),
  bloodGroup: text(5).default(''),
  pan: text(10).default(''),
  bank: text(60).default(''),
});

/** Employees with today's attendance attached (null = not marked; Sundays default to holiday). */
async function withToday(tenantId: string, rows: Employee[]) {
  const today = localToday();
  const marks = await db.attendance.findMany({ where: { tenantId, date: utcDay(today) } });
  const sunday = new Date().getDay() === 0;
  return rows.map((e) => ({ ...employeeOut(e), todayStatus: marks.find((m) => m.employeeId === e.id)?.status ?? (sunday ? 'holiday' : null) }));
}

/** Who can be picked as "done by" on a bill — names only, no pay or personal details. */
peopleRouter.get('/pos/staff', requireTenant, guard(['pos', 'sales', 'appointments']), async (req, res) => {
  const rows = await db.employee.findMany({ where: { tenantId: tid(req), status: { not: 'inactive' } }, select: { id: true, name: true, designation: true }, orderBy: { name: 'asc' } });
  res.json(rows);
});

peopleRouter.get('/employees', requireTenant, guard(['employees', 'attendance', 'payroll', 'appointments', 'services']), async (req, res) => {
  const rows = await db.employee.findMany({ where: { tenantId: tid(req) }, orderBy: { name: 'asc' } });
  res.json(await withToday(tid(req), rows));
});

crud(peopleRouter, {
  path: '/employees',
  page: ['employees', 'attendance', 'payroll'],
  writePage: 'employees',
  module: 'Employees',
  model: db.employee,
  create: employeeSchema,
  update: employeeSchema.partial(),
  out: employeeOut,
  label: (e) => `${e.name} (${e.code})`,
  beforeCreate: async (req, data) => {
    const seq = await db.$transaction((tx) => nextSeq(tx, tid(req), 'employeeSeq'));
    return { ...data, code: `EMP-${String(seq).padStart(3, '0')}` };
  },
});

// ── Attendance ──
peopleRouter.get('/attendance', requireTenant, guard(['attendance', 'employees']), async (req, res) => {
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(req.query.month);
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const first = utcDay(`${month}-01`);
  const last = utcDay(`${month}-${String(days).padStart(2, '0')}`);
  const today = localToday();
  const [employees, marks] = await Promise.all([
    db.employee.findMany({ where: { tenantId: tid(req) }, orderBy: { name: 'asc' } }),
    db.attendance.findMany({ where: { tenantId: tid(req), date: { gte: first, lte: last } } }),
  ]);
  res.json(
    employees.map((employee) => {
      const summary = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<(typeof STATUSES)[number], number>;
      const row = Array.from({ length: days }, (_, i) => {
        const key = `${month}-${String(i + 1).padStart(2, '0')}`;
        const isFuture = key > today;
        const mark = marks.find((a) => a.employeeId === employee.id && dayKey(a.date) === key);
        const sunday = new Date(y, m - 1, i + 1).getDay() === 0;
        const status = isFuture ? null : (mark?.status ?? (sunday ? 'holiday' : null));
        if (status) summary[status as (typeof STATUSES)[number]] += 1;
        return { date: new Date(y, m - 1, i + 1).toISOString(), status };
      });
      return { employee: employeeOut(employee), days: row, summary };
    }),
  );
});

peopleRouter.put('/attendance', requireTenant, guard('attendance', 'edit'), async (req, res) => {
  const b = z.object({ employeeIds: z.array(z.string().max(40)).min(1).max(1000), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(STATUSES), onlyUnmarked: z.boolean().default(false) }).parse(req.body);
  if (b.date > localToday()) throw badRequest('You cannot mark attendance for a future date.');
  const employees = await db.employee.findMany({ where: { tenantId: tid(req), id: { in: b.employeeIds } } });
  const date = utcDay(b.date);
  let changed = 0;
  for (const e of employees) {
    if (b.onlyUnmarked) {
      const existing = await db.attendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date } } });
      if (existing && existing.status !== 'absent') continue;
    }
    await db.attendance.upsert({ where: { employeeId_date: { employeeId: e.id, date } }, create: { tenantId: tid(req), employeeId: e.id, date, status: b.status }, update: { status: b.status } });
    changed++;
  }
  await audit(req, 'edited', 'Employees', `Attendance ${b.date}`, `${changed} marked ${b.status}`);
  res.json({ updated: changed });
});

// ── Advances ──
const advanceSchema = z.object({ employeeId: requiredText('Employee', 40), amount: positiveMoney, monthlyRecovery: positiveMoney, reason: requiredText('Reason', 80, 3) });
const advanceOut = (a: { id: string; employeeId: string; amount: unknown; recovered: unknown; monthlyRecovery: unknown; reason: string; date: Date; employee?: { name: string } }) => ({
  ...(plain(a) as object),
  name: a.employee?.name ?? '',
  employee: undefined,
});
crud(peopleRouter, {
  path: '/advances',
  page: ['payroll', 'employees'],
  writePage: 'payroll',
  module: 'Payroll',
  model: db.advance,
  create: advanceSchema,
  orderBy: { date: 'desc' },
  include: { employee: { select: { name: true } } },
  out: advanceOut,
  label: (a) => `Advance ₹${num(a.amount)} to ${a.employee?.name ?? ''}`,
  beforeCreate: async (req, data) => {
    const e = await db.employee.findFirst({ where: { id: data.employeeId, tenantId: tid(req) } });
    if (!e) throw badRequest('Employee not found.');
    if (data.monthlyRecovery > data.amount) throw badRequest('Monthly recovery cannot exceed the advance.');
    return data;
  },
});

// ── Payroll ──
async function computePayroll(tenantId: string) {
  const [employees, advances, tenant] = await Promise.all([
    db.employee.findMany({ where: { tenantId, status: { not: 'inactive' } }, orderBy: { name: 'asc' } }),
    db.advance.findMany({ where: { tenantId } }),
    db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } }),
  ]);
  const rules = payrollSettingsOf(tenant.settings);
  return employees.map((e) => {
    const salary = num(e.salary);
    const advance = round2(advances.filter((a) => a.employeeId === e.id).reduce((s, a) => s + Math.min(num(a.monthlyRecovery), Math.max(0, num(a.amount) - num(a.recovered))), 0));
    // PF, ESI, professional tax and custom cuts as set in Settings → Payroll.
    const breakdown = deductionsFor(salary, rules);
    const deductions = round2(breakdown.reduce((s, d) => s + d.amount, 0));
    return { employeeId: e.id, name: e.name, designation: e.designation, gross: salary, allowances: 0, overtime: 0, commission: 0, advance, deductions, breakdown, net: Math.max(0, round2(salary - advance - deductions)) };
  });
}

peopleRouter.get('/payroll/settings', requireTenant, guard(['payroll', 'employees']), async (req, res) => {
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tid(req) }, select: { settings: true } });
  res.json(payrollSettingsOf(t.settings));
});

peopleRouter.put('/payroll/settings', requireTenant, guard('payroll', 'edit'), async (req, res) => {
  const rules = payrollSettingsSchema.parse(req.body);
  const ids = rules.custom.map((c) => c.name.toLowerCase());
  if (new Set(ids).size !== ids.length) throw badRequest('Two custom deductions have the same name.');
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tid(req) }, select: { settings: true } });
  await db.tenant.update({ where: { id: tid(req) }, data: { settings: { ...((t.settings ?? {}) as Record<string, unknown>), payroll: rules } as Prisma.InputJsonValue } });
  const summary = [rules.pf.enabled && `PF ${rules.pf.pct}%`, rules.esi.enabled && `ESI ${rules.esi.pct}%`, rules.pt.enabled && (rules.pt.mode === 'fixed' ? `PT ₹${rules.pt.amount}` : `PT ${rules.pt.pct}%`), ...rules.custom.filter((c) => c.enabled).map((c) => c.name)].filter(Boolean).join(', ');
  await audit(req, 'edited', 'Payroll', 'Payroll deductions', summary || 'No deductions');
  res.json(rules);
});
const thisMonth = () => localToday().slice(0, 7);

peopleRouter.get('/payroll', requireTenant, guard(['payroll', 'employees']), async (req, res) => {
  const month = thisMonth();
  const run = await db.payrollRun.findUnique({ where: { tenantId_month: { tenantId: tid(req), month } } });
  if (run) {
    res.json((run.entries as unknown as object[]).map((e) => ({ ...e, status: 'paid' })));
    return;
  }
  res.json((await computePayroll(tid(req))).map((e) => ({ ...e, status: 'pending' })));
});

peopleRouter.post('/payroll/run', requireTenant, guard('payroll', 'approve'), async (req, res) => {
  const month = thisMonth();
  const result = await db.$transaction(async (tx) => {
    if (await tx.payrollRun.findUnique({ where: { tenantId_month: { tenantId: tid(req), month } } })) throw badRequest(`Payroll for ${month} has already been run.`);
    const entries = await computePayroll(tid(req));
    if (!entries.length) throw badRequest('Add employees before running payroll.');
    for (const e of entries) {
      let left = e.advance;
      const advances = await tx.advance.findMany({ where: { tenantId: tid(req), employeeId: e.employeeId }, orderBy: { date: 'asc' } });
      for (const a of advances) {
        if (left <= 0) break;
        const take = Math.min(left, num(a.amount) - num(a.recovered));
        if (take <= 0) continue;
        await tx.advance.update({ where: { id: a.id }, data: { recovered: { increment: take } } });
        left = round2(left - take);
      }
    }
    const total = round2(entries.reduce((s, e) => s + e.net, 0));
    await tx.payrollRun.create({ data: { tenantId: tid(req), month, entries: entries as unknown as Prisma.InputJsonValue, total } });
    await tx.expense.create({ data: { tenantId: tid(req), title: `Salaries — ${month}`, category: 'Salary', amount: total, date: new Date(), paidTo: 'Payroll', method: 'bank', status: 'paid', recurring: false } });
    return { month, total, employees: entries.length };
  });
  await audit(req, 'approved', 'Payroll', `Payroll ${month}`, `${result.employees} employees, ₹${result.total}`);
  res.json(result);
});

