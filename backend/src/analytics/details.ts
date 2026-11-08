import { db } from '../db.js';
import { num, round2 } from '../lib/serialize.js';
import { counted, inWindow, loadExpenses, loadSales, periodWindow, sum, type SaleRow } from './data.js';

/** Branch filter value from the dashboard → the branch name stored on bills ('' = all branches). */
export const branchName = (branch: string) => (branch === 'all' ? '' : branch === 'br_main' ? 'Main Branch' : branch);

/** Short periods are broken down by hour, longer ones by day. */
function bucketer(range: string) {
  const hourly = range === 'today' || range === 'yesterday';
  const key = (d: Date) => (hourly ? String(d.getHours()).padStart(2, '0') : d.toISOString().slice(0, 10));
  const label = (k: string) => (hourly ? `${Number(k) % 12 || 12} ${Number(k) < 12 ? 'AM' : 'PM'}` : new Date(`${k}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
  return { hourly, key, label };
}

function timeline<T>(rows: T[], date: (r: T) => Date, value: (r: T) => number, range: string) {
  const b = bucketer(range);
  const map = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const k = b.key(date(r));
    const cur = map.get(k) ?? { amount: 0, count: 0 };
    cur.amount += value(r);
    cur.count += 1;
    map.set(k, cur);
  }
  return [...map.entries()].sort(([a], [z]) => a.localeCompare(z)).map(([k, v]) => ({ label: b.label(k), amount: round2(v.amount), count: v.count }));
}

const group = <T>(rows: T[], key: (r: T) => string, value: (r: T) => number, extra?: (r: T) => number) => {
  const map = new Map<string, { amount: number; count: number; qty: number }>();
  for (const r of rows) {
    const k = key(r) || 'Other';
    const cur = map.get(k) ?? { amount: 0, count: 0, qty: 0 };
    cur.amount += value(r);
    cur.count += 1;
    cur.qty += extra ? extra(r) : 0;
    map.set(k, cur);
  }
  return [...map.entries()].map(([name, v]) => ({ name, amount: round2(v.amount), count: v.count, qty: round2(v.qty) })).sort((a, b) => b.amount - a.amount);
};

/** Category of every product and service sold, by id. */
async function categories(tenantId: string, sales: SaleRow[]) {
  const items = sales.flatMap((s) => s.items);
  const productIds = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter((x): x is string => !!x))];
  const [products, services] = await Promise.all([
    productIds.length ? db.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, category: true } }) : [],
    serviceIds.length ? db.serviceItem.findMany({ where: { tenantId, id: { in: serviceIds } }, select: { id: true, category: true } }) : [],
  ]);
  return new Map([...products, ...services].map((x) => [x.id, { category: x.category }]));
}

/**
 * Every line's value before GST, after its share of any bill discount, so
 * category and item totals add up to the bills' taxable value.
 */
function netLines(sales: SaleRow[], cats: Map<string, { category: string }>) {
  return sales.flatMap((s) => {
    const gross = sum(s.items, (i) => i.qty * i.rate - i.discount);
    const ratio = gross > 0 ? (s.subtotal - s.discount) / gross : 1;
    // A combo is stored as one line per part; count the combo once, not once per part.
    const parts = (name: string) => s.items.filter((x) => x.packageName === name).length || 1;
    return s.items.map((i) => ({
      sale: s,
      // Parts of a package are listed under the package so combos show as sold.
      name: i.packageName ? `${i.packageName} (combo)` : i.name,
      category: i.packageName ? 'Combos & packages' : cats.get(i.productId ?? i.serviceId ?? '')?.category || (i.serviceId ? 'Services' : 'Other'),
      qty: i.packageName ? i.qty / parts(i.packageName) : i.qty,
      net: (i.qty * i.rate - i.discount) * ratio,
      cost: i.qty * i.cost,
      noCost: !!i.productId && i.cost === 0,
    }));
  });
}

async function salesInRange(tenantId: string, range: string, branch: string) {
  const w = periodWindow(range);
  const bn = branchName(branch);
  const all = await loadSales(tenantId, w.start);
  return { w, sales: all.filter(counted).filter((s) => inWindow(s.date, w.start, w.end) && (!bn || s.branch === bn)) };
}

export async function salesDetail(tenantId: string, range: string, branch: string) {
  const { sales } = await salesInRange(tenantId, range, branch);
  const lines = netLines(sales, await categories(tenantId, sales));
  const total = sum(sales, (s) => s.total);
  return {
    summary: {
      total: round2(total),
      bills: sales.length,
      average: sales.length ? round2(total / sales.length) : 0,
      itemsSold: Math.round(sum(lines, (l) => l.qty) * 1000) / 1000,
      beforeGst: round2(sum(sales, (s) => s.subtotal - s.discount)),
      gst: round2(sum(sales, (s) => s.tax)),
      discount: round2(sum(sales, (s) => s.discount)),
    },
    timeline: timeline(sales, (s) => s.date, (s) => s.total, range),
    byCategory: group(lines, (l) => l.category, (l) => l.net, (l) => l.qty),
    byItem: group(lines, (l) => l.name, (l) => l.net, (l) => l.qty).slice(0, 50),
    bills: [...sales].reverse().map((s) => ({
      id: s.id,
      invoiceNo: s.invoiceNo,
      date: s.date.toISOString(),
      customerName: s.customerName,
      items: s.items.map((i) => `${i.name}${i.qty !== 1 ? ` × ${i.qty}` : ''}`).join(', '),
      itemCount: round2(sum(s.items, (i) => i.qty)),
      total: s.total,
      paid: s.paid,
      payment: s.payment,
      status: s.status,
    })),
  };
}

/** Money received from customers (bills, old dues, advances) less refunds given back. */
export async function collectionRows(tenantId: string, from: Date, to: Date, branch: string) {
  const bn = branchName(branch);
  const rows = await db.payment.findMany({ where: { tenantId, vendorId: null, date: { gte: from, lt: to } }, orderBy: { date: 'desc' } });
  const saleIds = [...new Set(rows.map((p) => p.saleId).filter((x): x is string => !!x))];
  const custIds = [...new Set(rows.map((p) => p.customerId).filter((x): x is string => !!x))];
  const [sales, customers] = await Promise.all([
    saleIds.length ? db.sale.findMany({ where: { tenantId, id: { in: saleIds } }, select: { id: true, invoiceNo: true, customerName: true, branch: true } }) : [],
    custIds.length ? db.customer.findMany({ where: { tenantId, id: { in: custIds } }, select: { id: true, name: true } }) : [],
  ]);
  return rows
    .map((p) => {
      const sale = sales.find((s) => s.id === p.saleId);
      const refund = p.direction === 'out';
      const kind = refund ? 'Refund' : /^Advance/.test(p.reference) ? 'Advance' : sale ? 'Bill payment' : 'Due collected';
      return {
        id: p.id,
        date: p.date.toISOString(),
        method: p.method,
        amount: refund ? -num(p.amount) : num(p.amount),
        kind,
        reference: sale?.invoiceNo ?? p.reference,
        customerName: customers.find((c) => c.id === p.customerId)?.name ?? sale?.customerName ?? 'Walk-in Customer',
        branch: sale?.branch ?? '',
      };
    })
    .filter((p) => !bn || p.branch === bn);
}

const METHOD_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer', split: 'Split payment', credit: 'Credit' };

export async function collectionDetail(tenantId: string, range: string, branch: string) {
  const w = periodWindow(range);
  const rows = await collectionRows(tenantId, w.start, w.end, branch);
  const received = rows.filter((r) => r.amount > 0);
  const refunds = rows.filter((r) => r.amount < 0);
  return {
    summary: {
      net: round2(sum(rows, (r) => r.amount)),
      received: round2(sum(received, (r) => r.amount)),
      refunds: round2(-sum(refunds, (r) => r.amount)),
      payments: received.length,
    },
    byMode: group(received, (r) => METHOD_LABEL[r.method] ?? r.method, (r) => r.amount),
    byKind: group(received, (r) => r.kind, (r) => r.amount),
    timeline: timeline(received, (r) => new Date(r.date), (r) => r.amount, range),
    entries: rows.map((r) => ({ ...r, method: METHOD_LABEL[r.method] ?? r.method })),
  };
}

export async function expensesDetail(tenantId: string, range: string) {
  const w = periodWindow(range);
  const rows = (await loadExpenses(tenantId, w.start)).filter((e) => inWindow(e.date, w.start, w.end)).sort((a, b) => b.date.getTime() - a.date.getTime());
  const total = sum(rows, (e) => e.amount);
  return {
    summary: { total: round2(total), count: rows.length, pending: round2(sum(rows.filter((e) => e.status !== 'paid'), (e) => e.amount)) },
    byCategory: group(rows, (e) => e.category, (e) => e.amount),
    byMode: group(rows, (e) => METHOD_LABEL[e.method] ?? e.method, (e) => e.amount),
    timeline: timeline(rows, (e) => e.date, (e) => e.amount, range),
    entries: rows.map((e) => ({ id: e.id, date: e.date.toISOString(), title: e.title, category: e.category, paidTo: e.paidTo, method: METHOD_LABEL[e.method] ?? e.method, amount: e.amount, status: e.status })),
  };
}

/** Profit = sales before GST − what the sold goods cost you − expenses. GST collected is not income. */
export async function profitNumbers(tenantId: string, from: Date, to: Date, branch: string) {
  const bn = branchName(branch);
  const sales = (await loadSales(tenantId, from)).filter(counted).filter((s) => inWindow(s.date, from, to) && (!bn || s.branch === bn));
  const expenses = (await loadExpenses(tenantId, from)).filter((e) => inWindow(e.date, from, to));
  const netSales = sum(sales, (s) => s.subtotal - s.discount);
  const cost = sum(sales, (s) => sum(s.items, (i) => i.qty * i.cost));
  const exp = sum(expenses, (e) => e.amount);
  return { sales, netSales, cost, expenses: exp, gross: netSales - cost, net: netSales - cost - exp };
}

export async function profitDetail(tenantId: string, range: string, branch: string) {
  const w = periodWindow(range);
  const p = await profitNumbers(tenantId, w.start, w.end, branch);
  const lines = netLines(p.sales, await categories(tenantId, p.sales));
  const byKey = (key: (l: (typeof lines)[number]) => string) => {
    const map = new Map<string, { qty: number; sales: number; cost: number; noCost: boolean }>();
    for (const l of lines) {
      const k = key(l) || 'Other';
      const cur = map.get(k) ?? { qty: 0, sales: 0, cost: 0, noCost: false };
      cur.qty += l.qty;
      cur.sales += l.net;
      cur.cost += l.cost;
      cur.noCost ||= l.noCost;
      map.set(k, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, qty: round2(v.qty), sales: round2(v.sales), cost: round2(v.cost), profit: round2(v.sales - v.cost), margin: v.sales ? round2(((v.sales - v.cost) / v.sales) * 100) : 0, noCost: v.noCost }))
      .sort((a, b) => b.profit - a.profit);
  };
  const salesInclGst = sum(p.sales, (s) => s.total);
  return {
    summary: {
      salesInclGst: round2(salesInclGst),
      gst: round2(sum(p.sales, (s) => s.tax)),
      netSales: round2(p.netSales),
      cost: round2(p.cost),
      grossProfit: round2(p.gross),
      grossMargin: p.netSales ? round2((p.gross / p.netSales) * 100) : 0,
      expenses: round2(p.expenses),
      netProfit: round2(p.net),
      netMargin: p.netSales ? round2((p.net / p.netSales) * 100) : 0,
      itemsWithoutCost: new Set(lines.filter((l) => l.noCost).map((l) => l.name)).size,
    },
    byCategory: byKey((l) => l.category),
    byItem: byKey((l) => l.name).slice(0, 50),
  };
}
