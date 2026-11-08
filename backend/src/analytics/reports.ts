import { differenceInCalendarDays } from 'date-fns';
import type { PageId } from '../lib/access.js';
import { salesSeries, type SalesRange } from './dashboard.js';
import { costOf, counted, inWindow, isLowStock, loadCustomers, loadEmployees, loadExpenses, loadProducts, loadPurchases, loadSales, loadVendors, pctChange, periodWindow, sum, tracksStock, type SaleRow } from './data.js';

export const REPORT_CATEGORIES = ['sales', 'profit', 'inventory', 'customers', 'vendors', 'expenses', 'employees', 'gst', 'payments'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** A report is shown only if the user can open at least one of the pages its data comes from. */
export const REPORT_PAGES: Record<ReportCategory, PageId[]> = {
  sales: ['sales', 'pos'],
  profit: ['sales', 'pos'],
  inventory: ['inventory'],
  customers: ['customers'],
  vendors: ['vendors', 'purchases'],
  expenses: ['expenses'],
  employees: ['employees', 'attendance', 'payroll'],
  gst: ['gst'],
  payments: ['sales', 'pos'],
};

type CellFormat = 'currency' | 'number' | 'percent' | 'text';
interface ReportData {
  kpis: { label: string; value: number; format: CellFormat; change?: number }[];
  chart: { type: 'area' | 'bar' | 'donut'; title: string; data: { label: string; value: number; value2?: number }[]; series: [string] | [string, string] };
  table: { title: string; columns: { key: string; label: string; format: CellFormat }[]; rows: Record<string, string | number>[] };
}

const SERIES_RANGE: Record<string, SalesRange> = { today: 'today', '7d': '7d', '30d': '30d', quarter: '3m', year: '1y' };
const PAY_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer', credit: 'Credit', split: 'Split' };
const share = (v: number, total: number) => (total ? (v / total) * 100 : 0);
const r0 = Math.round;

export async function buildReport(tenantId: string, category: ReportCategory, range: string, branch: string): Promise<ReportData> {
  const w = periodWindow(range);
  const bn = branch === 'all' ? null : branch === 'br_main' ? 'Main Branch' : branch;
  const [allSales, purchases, expenses, products, customers, vendors, employees] = await Promise.all([
    loadSales(tenantId, w.prevStart), loadPurchases(tenantId, w.start), loadExpenses(tenantId, w.prevStart), loadProducts(tenantId), loadCustomers(tenantId), loadVendors(tenantId), loadEmployees(tenantId),
  ]);
  const scoped = allSales.filter(counted).filter((s) => !bn || s.branch === bn);
  const sales = scoped.filter((s) => inWindow(s.date, w.start, w.end));
  const prevSales = scoped.filter((s) => inWindow(s.date, w.prevStart, w.prevEnd));
  const exp = expenses.filter((e) => inWindow(e.date, w.start, w.end));
  const prevExp = expenses.filter((e) => inWindow(e.date, w.prevStart, w.prevEnd));
  const bills = purchases.filter((p) => inWindow(p.date, w.start, w.end));
  const revenue = sum(sales, (s) => s.total);
  const prevRevenue = sum(prevSales, (s) => s.total);
  const trend = async () => (await salesSeries(tenantId, SERIES_RANGE[range] ?? '30d')).map((p) => ({ label: p.label, value: p.sales, value2: p.previous }));
  const lineValue = (it: SaleRow['items'][number]) => it.qty * it.rate - it.discount;

  switch (category) {
    case 'sales': {
      const byCat = new Map<string, { invoices: Set<string>; qty: number; revenue: number }>();
      sales.forEach((s) => s.items.forEach((it) => {
        const cat = products.find((p) => p.id === it.productId)?.category ?? 'Services';
        const row = byCat.get(cat) ?? { invoices: new Set(), qty: 0, revenue: 0 };
        row.invoices.add(s.id);
        row.qty += it.qty;
        row.revenue += lineValue(it);
        byCat.set(cat, row);
      }));
      const totalCat = sum(Array.from(byCat.values()), (r) => r.revenue);
      const returns = allSales.filter((s) => (s.status === 'refunded' || s.status === 'returned') && (!bn || s.branch === bn) && inWindow(s.date, w.start, w.end));
      return {
        kpis: [
          { label: 'Gross sales', value: r0(revenue), format: 'currency', change: pctChange(revenue, prevRevenue) },
          { label: 'Invoices', value: sales.length, format: 'number', change: pctChange(sales.length, prevSales.length) },
          { label: 'Average bill value', value: sales.length ? r0(revenue / sales.length) : 0, format: 'currency' },
          { label: 'Returns & refunds', value: r0(sum(returns, (s) => s.total)), format: 'currency' },
        ],
        chart: { type: 'area', title: 'Sales trend', data: await trend(), series: ['This period', 'Previous period'] },
        table: {
          title: 'Category-wise sales',
          columns: [
            { key: 'category', label: 'Category', format: 'text' },
            { key: 'invoices', label: 'Invoices', format: 'number' },
            { key: 'qty', label: 'Units', format: 'number' },
            { key: 'revenue', label: 'Revenue', format: 'currency' },
            { key: 'share', label: 'Share', format: 'percent' },
          ],
          rows: Array.from(byCat, ([category, r]) => ({ category, invoices: r.invoices.size, qty: r.qty, revenue: r0(r.revenue), share: share(r.revenue, totalCat) })).sort((a, b) => b.revenue - a.revenue),
        },
      };
    }
    case 'profit': {
      const cogs = r0(costOf(sales));
      const opex = sum(exp, (e) => e.amount);
      const gross = r0(revenue) - cogs;
      const net = r0(gross - opex);
      const byCat = new Map<string, number>();
      exp.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount));
      return {
        kpis: [
          { label: 'Revenue', value: r0(revenue), format: 'currency', change: pctChange(revenue, prevRevenue) },
          { label: 'Cost of goods', value: cogs, format: 'currency' },
          { label: 'Gross profit', value: gross, format: 'currency' },
          { label: 'Net margin', value: share(net, revenue), format: 'percent' },
        ],
        chart: { type: 'area', title: 'Revenue trend', data: await trend(), series: ['This period', 'Previous period'] },
        table: {
          title: 'Profit & loss summary',
          columns: [
            { key: 'head', label: 'Account', format: 'text' },
            { key: 'amount', label: 'Amount', format: 'currency' },
            { key: 'pct', label: '% of revenue', format: 'percent' },
          ],
          rows: [
            { head: 'Sales revenue', amount: r0(revenue), pct: revenue ? 100 : 0 },
            { head: 'Cost of goods sold', amount: cogs, pct: share(cogs, revenue) },
            { head: 'Gross profit', amount: gross, pct: share(gross, revenue) },
            ...Array.from(byCat, ([head, amount]) => ({ head, amount: r0(amount), pct: share(amount, revenue) })),
            { head: 'Net profit', amount: net, pct: share(net, revenue) },
          ],
        },
      };
    }
    case 'inventory': {
      const cats = Array.from(new Set(products.map((p) => p.category)));
      return {
        kpis: [
          { label: 'Stock value', value: r0(sum(products, (p) => p.stock * p.purchasePrice)), format: 'currency' },
          { label: 'Products', value: products.length, format: 'number' },
          { label: 'Low stock', value: products.filter((p) => isLowStock(p) && p.stock > 0).length, format: 'number' },
          { label: 'Out of stock', value: products.filter((p) => tracksStock(p) && p.stock <= 0).length, format: 'number' },
        ],
        chart: { type: 'bar', title: 'Stock value by category', data: cats.map((c) => ({ label: c, value: r0(sum(products.filter((p) => p.category === c), (p) => p.stock * p.purchasePrice)) })), series: ['Stock value'] },
        table: {
          title: 'Stock summary',
          columns: [
            { key: 'name', label: 'Product', format: 'text' },
            { key: 'sku', label: 'SKU', format: 'text' },
            { key: 'stock', label: 'In stock', format: 'number' },
            { key: 'value', label: 'Value', format: 'currency' },
          ],
          rows: products.map((p) => ({ name: p.name, sku: p.sku, stock: p.stock, value: r0(p.stock * p.purchasePrice) })),
        },
      };
    }
    case 'customers': {
      const now = new Date();
      const newCustomers = customers.filter((c) => inWindow(new Date(c.createdAt), w.start, w.end));
      const repeat = customers.filter((c) => c.orders > 1).length;
      const segments = [
        { label: 'Regular', value: customers.filter((c) => c.orders > 1 && !c.tags.length).length },
        { label: 'Tagged', value: customers.filter((c) => c.tags.length > 0).length },
        { label: 'One-time', value: customers.filter((c) => c.orders <= 1 && !c.tags.length).length },
      ].filter((s) => s.value > 0);
      return {
        kpis: [
          { label: 'Active customers', value: customers.filter((c) => differenceInCalendarDays(now, new Date(c.lastPurchase)) < 75).length, format: 'number' },
          { label: 'New customers', value: newCustomers.length, format: 'number' },
          { label: 'Repeat rate', value: share(repeat, customers.length), format: 'percent' },
          { label: 'Outstanding', value: r0(sum(customers, (c) => c.outstanding)), format: 'currency' },
        ],
        chart: { type: 'donut', title: 'Customer segments', data: segments, series: ['Customers'] },
        table: {
          title: 'Top customers',
          columns: [
            { key: 'name', label: 'Customer', format: 'text' },
            { key: 'city', label: 'City', format: 'text' },
            { key: 'orders', label: 'Orders', format: 'number' },
            { key: 'spend', label: 'Total spend', format: 'currency' },
            { key: 'outstanding', label: 'Outstanding', format: 'currency' },
          ],
          rows: [...customers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 20).map((c) => ({ name: c.name, city: c.city || '—', orders: c.orders, spend: c.totalSpend, outstanding: c.outstanding })),
        },
      };
    }
    case 'vendors':
      return {
        kpis: [
          { label: 'Purchases', value: r0(sum(bills, (p) => p.total)), format: 'currency' },
          { label: 'Vendors', value: vendors.length, format: 'number' },
          { label: 'Payables', value: r0(sum(vendors, (v) => v.payable)), format: 'currency' },
          { label: 'Bills', value: bills.length, format: 'number' },
        ],
        chart: { type: 'bar', title: 'Purchases by vendor', data: vendors.filter((v) => v.totalPurchased > 0).sort((a, b) => b.totalPurchased - a.totalPurchased).slice(0, 8).map((v) => ({ label: v.name.split(' ')[0] ?? v.name, value: v.totalPurchased })), series: ['Purchased'] },
        table: {
          title: 'Vendor ledger',
          columns: [
            { key: 'name', label: 'Vendor', format: 'text' },
            { key: 'gstin', label: 'GSTIN', format: 'text' },
            { key: 'bills', label: 'Bills', format: 'number' },
            { key: 'purchased', label: 'Purchased', format: 'currency' },
            { key: 'payable', label: 'Payable', format: 'currency' },
          ],
          rows: vendors.map((v) => ({ name: v.name, gstin: v.gstin || '—', bills: v.purchases, purchased: v.totalPurchased, payable: v.payable })),
        },
      };
    case 'expenses': {
      const total = sum(exp, (e) => e.amount);
      const byCat = Array.from(new Set(exp.map((e) => e.category))).map((c) => ({ label: c, value: r0(sum(exp.filter((e) => e.category === c), (e) => e.amount)) }));
      return {
        kpis: [
          { label: 'Total expenses', value: r0(total), format: 'currency', change: pctChange(total, sum(prevExp, (e) => e.amount)) },
          { label: 'Recurring', value: r0(sum(exp.filter((e) => e.recurring), (e) => e.amount)), format: 'currency' },
          { label: 'Pending approval', value: r0(sum(exp.filter((e) => e.status === 'pending'), (e) => e.amount)), format: 'currency' },
          { label: 'Expense ratio', value: share(total, revenue), format: 'percent' },
        ],
        chart: { type: 'donut', title: 'Expense breakdown', data: byCat, series: ['Amount'] },
        table: {
          title: 'Expense register',
          columns: [
            { key: 'title', label: 'Expense', format: 'text' },
            { key: 'category', label: 'Category', format: 'text' },
            { key: 'paidTo', label: 'Paid to', format: 'text' },
            { key: 'amount', label: 'Amount', format: 'currency' },
          ],
          rows: exp.map((e) => ({ title: e.title, category: e.category, paidTo: e.paidTo, amount: e.amount })),
        },
      };
    }
    case 'employees': {
      const staff = employees.filter((e) => e.status !== 'inactive');
      return {
        kpis: [
          { label: 'Headcount', value: staff.length, format: 'number' },
          { label: 'Active', value: staff.filter((e) => e.status === 'active').length, format: 'number' },
          { label: 'Monthly payroll', value: r0(sum(staff, (e) => e.salary)), format: 'currency' },
          { label: 'On leave', value: staff.filter((e) => e.status === 'on-leave').length, format: 'number' },
        ],
        chart: {
          type: 'bar',
          title: 'Salary by department',
          data: Array.from(new Set(staff.map((e) => e.department))).map((d) => ({ label: d, value: r0(sum(staff.filter((e) => e.department === d), (e) => e.salary)) })),
          series: ['Salary'],
        },
        table: {
          title: 'Staff list',
          columns: [
            { key: 'name', label: 'Employee', format: 'text' },
            { key: 'designation', label: 'Designation', format: 'text' },
            { key: 'department', label: 'Department', format: 'text' },
            { key: 'salary', label: 'Salary', format: 'currency' },
          ],
          rows: staff.map((e) => ({ name: e.name, designation: e.designation, department: e.department, salary: e.salary })),
        },
      };
    }
    case 'gst': {
      const received = bills.filter((p) => p.status === 'received');
      const output = sum(sales, (s) => s.tax);
      const input = sum(received, (p) => p.tax);
      const rates = [0, 5, 12, 18, 28];
      const taxableAt = (r: number) => sum(sales, (s) => sum(s.items.filter((it) => it.gstRate === r), lineValue));
      const inputAt = (r: number) => sum(received, (p) => sum(p.items.filter((it) => it.gstRate === r), (it) => ((it.qty * it.rate - it.discount) * r) / 100));
      return {
        kpis: [
          { label: 'Output GST', value: r0(output), format: 'currency' },
          { label: 'Input GST', value: r0(input), format: 'currency' },
          { label: 'Net liability', value: r0(Math.max(0, output - input)), format: 'currency' },
          { label: 'ITC available', value: r0(Math.max(0, input - output)), format: 'currency' },
        ],
        chart: { type: 'bar', title: 'Tax by rate slab', data: rates.map((r) => ({ label: `${r}%`, value: r0((taxableAt(r) * r) / 100), value2: r0(inputAt(r)) })), series: ['Output', 'Input'] },
        table: {
          title: 'Rate-wise summary',
          columns: [
            { key: 'rate', label: 'GST rate', format: 'text' },
            { key: 'taxable', label: 'Taxable value', format: 'currency' },
            { key: 'cgst', label: 'CGST', format: 'currency' },
            { key: 'sgst', label: 'SGST', format: 'currency' },
            { key: 'total', label: 'Total tax', format: 'currency' },
          ],
          rows: rates.filter((r) => taxableAt(r) > 0).map((r) => {
            const taxable = r0(taxableAt(r));
            const tax = r0((taxable * r) / 100);
            return { rate: `${r}%`, taxable, cgst: r0(tax / 2), sgst: tax - r0(tax / 2), total: tax };
          }),
        },
      };
    }
    case 'payments': {
      const methods = Object.keys(PAY_LABEL).filter((m) => m !== 'split');
      const collected = sum(sales, (s) => s.paid);
      return {
        kpis: [
          { label: 'Collected', value: r0(collected), format: 'currency', change: pctChange(collected, sum(prevSales, (s) => s.paid)) },
          { label: 'Receivables', value: r0(sum(customers, (c) => c.outstanding)), format: 'currency' },
          { label: 'Payables', value: r0(sum(vendors, (v) => v.payable)), format: 'currency' },
          { label: 'UPI share', value: share(sum(sales.filter((s) => s.payment === 'upi'), (s) => s.paid), collected), format: 'percent' },
        ],
        chart: { type: 'donut', title: 'Collections by method', data: methods.map((m) => ({ label: PAY_LABEL[m]!, value: r0(sum(sales.filter((x) => x.payment === m), (x) => x.paid)) })).filter((d) => d.value > 0), series: ['Collected'] },
        table: {
          title: 'Payment method summary',
          columns: [
            { key: 'method', label: 'Method', format: 'text' },
            { key: 'count', label: 'Transactions', format: 'number' },
            { key: 'amount', label: 'Amount', format: 'currency' },
          ],
          rows: methods.map((m) => ({ method: PAY_LABEL[m]!, count: sales.filter((x) => x.payment === m).length, amount: r0(sum(sales.filter((x) => x.payment === m), (x) => x.paid)) })).filter((r) => r.count > 0),
        },
      };
    }
  }
}
