import { z } from 'zod';
import { round2 } from './serialize.js';
import { requiredText } from './validate.js';

/** How salaries are cut each month: PF, ESI, professional tax and the owner's own deductions. */
const pct = z.coerce.number().min(0).max(100);
const rupees = z.coerce.number().min(0).max(1e7);

export const payrollSettingsSchema = z.object({
  pf: z.object({
    enabled: z.boolean(),
    pct,
    /** PF on the full salary, or on basic pay (basicPct % of salary). */
    on: z.enum(['full', 'basic']),
    basicPct: pct,
    /** PF wage ceiling (₹15,000 by law for most); 0 = no limit. */
    wageCap: rupees,
  }),
  esi: z.object({
    enabled: z.boolean(),
    pct,
    /** ESI applies only up to this monthly salary (₹21,000 by law). */
    maxSalary: rupees,
  }),
  pt: z.object({
    enabled: z.boolean(),
    mode: z.enum(['fixed', 'percent']),
    amount: rupees,
    pct,
    /** Only salaries above this are taxed; 0 = everyone. */
    minSalary: rupees,
  }),
  custom: z
    .array(z.object({ id: z.string().trim().min(1).max(40), name: requiredText('Deduction name', 40), mode: z.enum(['fixed', 'percent']), value: z.coerce.number().min(0).max(1e7), enabled: z.boolean() }))
    .max(10)
    .default([]),
});
export type PayrollSettings = z.infer<typeof payrollSettingsSchema>;

/** The deductions Sahaasra always used (PF 12% + ₹200 professional tax), so pay doesn't change until the owner edits them. */
export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  pf: { enabled: true, pct: 12, on: 'full', basicPct: 50, wageCap: 0 },
  esi: { enabled: false, pct: 0.75, maxSalary: 21000 },
  pt: { enabled: true, mode: 'fixed', amount: 200, pct: 0, minSalary: 0 },
  custom: [],
};

/** Saved settings merged over the defaults (older businesses have none). */
export function payrollSettingsOf(settings: unknown): PayrollSettings {
  const saved = ((settings ?? {}) as Record<string, unknown>).payroll;
  const parsed = payrollSettingsSchema.safeParse(saved);
  return parsed.success ? parsed.data : DEFAULT_PAYROLL_SETTINGS;
}

export interface Deduction {
  key: string;
  label: string;
  amount: number;
}

/** Each deduction for one month's salary, in the order they appear on the payslip. */
export function deductionsFor(salary: number, s: PayrollSettings): Deduction[] {
  const out: Deduction[] = [];
  if (s.pf.enabled && s.pf.pct > 0) {
    let wage = s.pf.on === 'basic' ? (salary * s.pf.basicPct) / 100 : salary;
    if (s.pf.wageCap > 0) wage = Math.min(wage, s.pf.wageCap);
    out.push({ key: 'pf', label: `PF (${s.pf.pct}%)`, amount: Math.round((wage * s.pf.pct) / 100) });
  }
  if (s.esi.enabled && s.esi.pct > 0 && (s.esi.maxSalary <= 0 || salary <= s.esi.maxSalary)) {
    // ESI is rounded up to the next rupee.
    out.push({ key: 'esi', label: `ESI (${s.esi.pct}%)`, amount: Math.ceil((salary * s.esi.pct) / 100) });
  }
  if (s.pt.enabled && salary > s.pt.minSalary) {
    const amount = s.pt.mode === 'fixed' ? s.pt.amount : Math.round((salary * s.pt.pct) / 100);
    if (amount > 0) out.push({ key: 'pt', label: 'Professional tax', amount });
  }
  for (const c of s.custom) {
    if (!c.enabled) continue;
    const amount = c.mode === 'fixed' ? round2(c.value) : Math.round((salary * c.value) / 100);
    if (amount > 0) out.push({ key: `c_${c.id}`, label: c.name, amount });
  }
  return out;
}
