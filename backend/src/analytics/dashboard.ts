import { addDays, addMonths, differenceInCalendarDays, format, setHours, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';
import { db } from '../db.js';
import { collectionRows } from './details.js';
import { counted, costOf, inWindow, isLowStock, tracksStock, loadCustomers, loadExpenses, loadProducts, loadPurchases, loadSales, loadVendors, pctChange, periodWindow, sum, type SaleRow } from './data.js';

export type SalesRange = 'today' | '7d' | '30d' | '3m' | '1y';

const sumSales = (list: SaleRow[], from: Date, to: Date) => sum(list.filter((s) => inWindow(s.date, from, to)), (s) => s.total);

export async function salesSeries(tenantId: string, range: SalesRange) {
  const all = (await loadSales(tenantId, subDays(new Date(), 800))).filter(counted);
  const now = new Date();
  const point = (label: string, from: Date, to: Date, shiftMs: number) => ({
    label,
    sales: Math.round(sumSales(all, from, to)),
    previous: Math.round(sumSales(all, new Date(from.getTime() - shiftMs), new Date(to.getTime() - shiftMs))),
  });
  switch (range) {
    case 'today':
      return Array.from({ length: 13 }, (_, i) => {
        const from = setHours(startOfDay(now), 9 + i);
        return point(format(from, 'h a'), from, new Date(from.getTime() + 3600e3), 864e5);
      });
    case '7d':
    case '30d': {
      const n = range === '7d' ? 7 : 30;
      return Array.from({ length: n }, (_, i) => {
        const from = startOfDay(subDays(now, n - 1 - i));
        return point(format(from, n === 7 ? 'EEE' : 'dd MMM'), from, addDays(from, 1), n * 864e5);
      });
    }
    case '3m':
      return Array.from({ length: 13 }, (_, i) => {
        const from = startOfDay(subDays(now, (12 - i) * 7 + 6));
        return point(format(addDays(from, 6), 'dd MMM'), from, addDays(from, 7), 91 * 864e5);
      });
    case '1y':
      return Array.from({ length: 12 }, (_, i) => {
        const from = startOfMonth(subMonths(now, 11 - i));
        return point(format(from, 'MMM'), from, addMonths(from, 1), 365 * 864e5);
      });
  }
}

export async function kpis(tenantId: string, range: string, branch: string) {
  const w = periodWindow(range);
  const [sales, expenses] = await Promise.all([loadSales(tenantId, w.prevStart), loadExpenses(tenantId, w.prevStart)]);
  const bn = branch === 'all' ? null : branch === 'br_main' ? 'Main Branch' : branch;
  const scoped = sales.filter(counted).filter((s) => !bn || s.branch === bn);
  const cur = scoped.filter((s) => inWindow(s.date, w.start, w.end));
  const prev = scoped.filter((s) => inWindow(s.date, w.prevStart, w.prevEnd));
  const exp = (from: Date, to: Date) => sum(expenses.filter((e) => inWindow(e.date, from, to)), (e) => e.amount);
  const revenue = (l: SaleRow[]) => sum(l, (s) => s.total);
  // Collection = money actually received (bills, old dues, advances) less refunds — same as its detail page.
  const [colNow, colPrev] = await Promise.all([collectionRows(tenantId, w.start, w.end, branch), collectionRows(tenantId, w.prevStart, w.prevEnd, branch)]);
  const collected = (rows: { amount: number }[]) => sum(rows, (p) => p.amount);
  // Profit = sales before GST − cost of goods sold − expenses (GST collected is not income).
  const profit = (l: SaleRow[], from: Date, to: Date) => sum(l, (s) => s.subtotal - s.discount) - costOf(l) - exp(from, to);
  const label = range === 'today' ? "Today's " : '';
  const r = (n: number) => Math.round(n);
  return [
    { id: 'sales', label: `${label}Sales`, value: r(revenue(cur)), change: pctChange(revenue(cur), revenue(prev)) },
    { id: 'collection', label: `${label}Collection`, value: r(collected(colNow)), change: pctChange(collected(colNow), collected(colPrev)) },
    { id: 'expenses', label: `${label}Expenses`, value: r(exp(w.start, w.end)), change: pctChange(exp(w.start, w.end), exp(w.prevStart, w.prevEnd)) },
    { id: 'profit', label: `${label}Profit`, value: r(profit(cur, w.start, w.end)), change: pctChange(profit(cur, w.start, w.end), profit(prev, w.prevStart, w.prevEnd)) },
  ];
}

export async function health(tenantId: string) {
  const now = new Date();
  const [sales, products, customers] = await Promise.all([loadSales(tenantId, subDays(now, 60)), loadProducts(tenantId), loadCustomers(tenantId)]);
  const valid = sales.filter(counted);
  const recent = valid.filter((s) => differenceInCalendarDays(now, s.date) < 30);
  if (!recent.length) return null;
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
  const rev = sum(recent, (s) => s.total);
  const prevRev = sum(valid.filter((s) => { const d = differenceInCalendarDays(now, s.date); return d >= 30 && d < 60; }), (s) => s.total);
  const margin = rev ? ((rev - costOf(recent)) / rev) * 100 : 0;
  const paidShare = rev ? (sum(recent, (s) => s.paid) / rev) * 100 : 0;
  const stocked = products.filter(tracksStock);
  const stockOk = stocked.length ? (stocked.filter((p) => !isLowStock(p)).length / stocked.length) * 100 : 100;
  const active = customers.length ? (customers.filter((c) => differenceInCalendarDays(now, new Date(c.lastPurchase)) < 30).length / customers.length) * 100 : 0;
  const breakdown = [
    { label: 'Sales performance', score: clamp(prevRev ? 60 + ((rev - prevRev) / prevRev) * 100 : 60) },
    { label: 'Profitability', score: clamp(margin * 2.5) },
    { label: 'Cash flow', score: clamp(paidShare) },
    { label: 'Inventory', score: clamp(stockOk) },
    { label: 'Customer activity', score: clamp(active) },
  ];
  const score = Math.round(sum(breakdown, (b) => b.score) / breakdown.length);
  return { score, label: score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs attention', breakdown };
}

export async function topProducts(tenantId: string) {
  const now = new Date();
  const sales = (await loadSales(tenantId, subDays(now, 15))).filter(counted);
  const products = await loadProducts(tenantId);
  const tally = (from: number, to: number) => {
    const map = new Map<string, { name: string; units: number; revenue: number }>();
    sales
      .filter((s) => { const d = differenceInCalendarDays(now, s.date); return d >= from && d < to; })
      .forEach((s) => s.items.forEach((it) => {
        const key = it.productId ?? it.name;
        const row = map.get(key) ?? { name: it.name, units: 0, revenue: 0 };
        row.units += it.qty;
        row.revenue += it.qty * it.rate - it.discount;
        map.set(key, row);
      }));
    return map;
  };
  const cur = tally(0, 7);
  const prev = tally(7, 14);
  return Array.from(cur, ([id, r]) => ({ id, name: r.name, category: products.find((p) => p.id === id)?.category ?? 'Service', units: r.units, revenue: Math.round(r.revenue), trend: pctChange(r.revenue, prev.get(id)?.revenue ?? 0) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

export async function insights(tenantId: string) {
  const now = new Date();
  const [sales, products, customers] = await Promise.all([loadSales(tenantId, subDays(now, 8)), loadProducts(tenantId), loadCustomers(tenantId)]);
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const out: { id: string; tone: 'success' | 'warning' | 'danger' | 'primary'; title: string; text: string; href: string }[] = [];
  const valid = sales.filter(counted);
  const today = sum(valid.filter((s) => differenceInCalendarDays(now, s.date) === 0), (s) => s.total);
  const last7 = sum(valid.filter((s) => { const d = differenceInCalendarDays(now, s.date); return d >= 1 && d <= 7; }), (s) => s.total) / 7;
  if (today > 0 && last7 > 0) {
    const diff = ((today - last7) / last7) * 100;
    out.push({ id: 'momentum', tone: diff >= 0 ? 'success' : 'warning', title: 'Sales momentum', text: `Sales are ${Math.abs(Math.round(diff))}% ${diff >= 0 ? 'higher' : 'lower'} than your 7-day average.`, href: '/reports' });
  }
  const low = products.filter(isLowStock);
  if (low.length) out.push({ id: 'stock', tone: 'warning', title: 'Stock risk', text: `${low.length} product${low.length > 1 ? 's are' : ' is'} at or below minimum stock.`, href: '/inventory' });
  const overdue = customers.filter((c) => c.status === 'overdue');
  if (overdue.length) out.push({ id: 'dues', tone: 'danger', title: 'Overdue dues', text: `${fmt(sum(overdue, (c) => c.outstanding))} in customer dues are overdue.`, href: '/customers' });
  const outstanding = sum(customers, (c) => c.outstanding);
  if (!overdue.length && outstanding > 0) out.push({ id: 'credit', tone: 'primary', title: 'Credit sales', text: `${fmt(outstanding)} is pending from customers.`, href: '/customers' });
  return out;
}

export async function gstSummary(tenantId: string) {
  const from = startOfMonth(new Date());
  const to = addMonths(from, 1);
  const [sales, purchases] = await Promise.all([loadSales(tenantId, from), loadPurchases(tenantId, from)]);
  const output = Math.round(sum(sales.filter(counted).filter((s) => inWindow(s.date, from, to)), (s) => s.tax));
  const input = Math.round(sum(purchases.filter((p) => p.status === 'received' && inWindow(p.date, from, to)), (p) => p.tax));
  const due = new Date(to.getFullYear(), to.getMonth(), 11);
  return { output, input, liability: Math.max(0, output - input), itc: Math.max(0, input - output), dueInDays: differenceInCalendarDays(due, new Date()), period: format(from, 'MMMM yyyy') };
}

export async function attendanceToday(tenantId: string) {
  const n = new Date();
  const key = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  const [employees, marks] = await Promise.all([db.employee.findMany({ where: { tenantId, status: { not: 'inactive' } }, select: { id: true } }), db.attendance.findMany({ where: { tenantId, date: new Date(`${key}T00:00:00.000Z`) } })]);
  const counts: Record<string, number> = { present: 0, late: 0, absent: 0, leave: 0, 'half-day': 0, holiday: 0, unmarked: 0 };
  employees.forEach((e) => {
    const s = marks.find((m) => m.employeeId === e.id)?.status ?? (n.getDay() === 0 ? 'holiday' : 'unmarked');
    counts[s] = (counts[s] ?? 0) + 1;
  });
  return { total: employees.length, ...counts };
}

export async function expenseBreakdown(tenantId: string) {
  const list = await loadExpenses(tenantId, subDays(new Date(), 31));
  const map = new Map<string, number>();
  list.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount));
  return Array.from(map, ([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
}

export async function lists(tenantId: string) {
  const [recent, products, customers, vendors] = await Promise.all([
    db.sale.findMany({ where: { tenantId }, include: { items: true }, orderBy: { date: 'desc' }, take: 7 }),
    loadProducts(tenantId),
    loadCustomers(tenantId),
    loadVendors(tenantId),
  ]);
  return {
    recent,
    lowStock: products.filter(isLowStock).slice(0, 6),
    customerDues: customers.filter((c) => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 6),
    vendorDues: vendors.filter((v) => v.payable > 0).sort((a, b) => b.payable - a.payable).slice(0, 5),
  };
}
