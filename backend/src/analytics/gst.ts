import { addMonths, format, startOfMonth } from 'date-fns';
import { db } from '../db.js';
import { num } from '../lib/serialize.js';
import { gstSummary } from './dashboard.js';
import { counted, loadPurchases, loadSales, sum } from './data.js';

const half = (n: number) => Math.round(n / 2);

export async function summary(tenantId: string) {
  const s = await gstSummary(tenantId);
  const next = startOfMonth(addMonths(new Date(), 1));
  const due = (day: number) => new Date(next.getFullYear(), next.getMonth(), day).toISOString();
  return {
    output: s.output,
    input: s.input,
    liability: s.liability,
    itc: s.itc,
    period: format(new Date(), 'MMMM yyyy'),
    returns: [
      { id: 'GSTR-1', label: 'GSTR-1', description: 'Outward supplies', due: due(11), status: 'not-started' as const },
      { id: 'GSTR-2B', label: 'GSTR-2B', description: 'Auto-drafted ITC statement', due: due(14), status: 'not-started' as const },
      { id: 'GSTR-3B', label: 'GSTR-3B', description: 'Summary return & tax payment', due: due(20), status: 'not-started' as const },
    ],
  };
}

/** Intra-state tax split into CGST + SGST. */
export async function salesRegister(tenantId: string) {
  const [sales, customers] = await Promise.all([loadSales(tenantId), db.customer.findMany({ where: { tenantId }, select: { id: true, gstin: true } })]);
  return sales.filter(counted).reverse().map((s) => {
    const gstin = customers.find((c) => c.id === s.customerId)?.gstin;
    const cgst = half(s.tax);
    return { id: s.id, number: s.invoiceNo, party: s.customerName, gstin: gstin || '—', date: s.date.toISOString(), taxable: s.subtotal - s.discount, cgst, sgst: Math.round(s.tax) - cgst, igst: 0, total: s.total, type: gstin ? 'B2B' : 'B2C' };
  });
}

export async function purchaseRegister(tenantId: string) {
  const [purchases, vendors] = await Promise.all([loadPurchases(tenantId), db.vendor.findMany({ where: { tenantId }, select: { id: true, gstin: true } })]);
  return purchases
    .filter((p) => p.status !== 'cancelled')
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((p) => {
      const cgst = half(p.tax);
      return { id: p.id, number: p.billNo, party: p.vendorName, gstin: vendors.find((v) => v.id === p.vendorId)?.gstin || '—', date: p.date.toISOString(), taxable: p.subtotal - p.discount, cgst, sgst: Math.round(p.tax) - cgst, igst: 0, total: p.total, type: 'B2B' };
    });
}

export async function hsnSummary(tenantId: string) {
  const sales = (await loadSales(tenantId)).filter(counted);
  const map = new Map<string, { hsn: string; description: string; qty: number; taxable: number; rate: number }>();
  sales.forEach((s) => s.items.forEach((it) => {
    const key = `${it.hsn || '—'}|${it.gstRate}`;
    const row = map.get(key) ?? { hsn: it.hsn || '—', description: it.name, qty: 0, taxable: 0, rate: it.gstRate };
    row.qty += it.qty;
    row.taxable += it.qty * it.rate - it.discount;
    map.set(key, row);
  }));
  return Array.from(map.values())
    .map((r) => ({ ...r, taxable: Math.round(r.taxable), tax: Math.round((r.taxable * r.rate) / 100) }))
    .sort((a, b) => b.taxable - a.taxable);
}

export async function rateBreakdown(tenantId: string) {
  const [sales, purchases] = await Promise.all([loadSales(tenantId), loadPurchases(tenantId)]);
  const valid = sales.filter(counted);
  const received = purchases.filter((p) => p.status === 'received');
  return [0, 5, 12, 18, 28].map((r) => ({
    label: `${r}%`,
    value: Math.round(sum(valid, (s) => sum(s.items.filter((i) => i.gstRate === r), (i) => ((i.qty * i.rate - i.discount) * r) / 100))),
    value2: Math.round(sum(received, (p) => sum(p.items.filter((i) => i.gstRate === r), (i) => ((i.qty * i.rate - i.discount) * r) / 100))),
  }));
}

/** Credit notes come from sales returns/refunds, debit notes from purchase returns. */
export async function notes(tenantId: string) {
  const rows = await db.returnRecord.findMany({ where: { tenantId }, orderBy: { date: 'desc' } });
  const map = (kind: string) =>
    rows.filter((r) => r.kind === kind).map((r) => {
      const tax = num(r.tax);
      return { id: r.id, number: r.ref, party: r.party, against: r.against, date: r.date.toISOString(), taxable: Math.round((num(r.amount) - tax) * 100) / 100, tax, reason: r.reason };
    });
  return { credit: map('sale'), debit: map('purchase') };
}
