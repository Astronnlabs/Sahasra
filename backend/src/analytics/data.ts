import { addDays, startOfDay, startOfMonth, startOfQuarter } from 'date-fns';
import { db } from '../db.js';
import { customerOut, employeeOut, vendorOut } from '../lib/mappers.js';
import { num } from '../lib/serialize.js';

export interface SaleRow {
  id: string;
  invoiceNo: string;
  customerId: string | null;
  customerName: string;
  date: Date;
  branch: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  payment: string;
  status: string;
  items: { productId: string | null; serviceId: string | null; packageName: string; name: string; hsn: string; qty: number; rate: number; discount: number; gstRate: number; cost: number }[];
}

export const counted = (s: { status: string }) => s.status !== 'refunded' && s.status !== 'returned' && s.status !== 'draft';

export async function loadSales(tenantId: string, since?: Date): Promise<SaleRow[]> {
  const rows = await db.sale.findMany({ where: { tenantId, ...(since ? { date: { gte: since } } : {}) }, include: { items: true }, orderBy: { date: 'asc' } });
  return rows.map((s) => ({
    id: s.id, invoiceNo: s.invoiceNo, customerId: s.customerId, customerName: s.customerName, date: s.date, branch: s.branch,
    subtotal: num(s.subtotal), discount: num(s.discount), tax: num(s.tax), total: num(s.total), paid: num(s.paid), payment: s.payment, status: s.status,
    items: s.items.map((i) => ({ productId: i.productId, serviceId: i.serviceId, packageName: i.packageName, name: i.name, hsn: i.hsn, qty: num(i.qty), rate: num(i.rate), discount: num(i.discount), gstRate: num(i.gstRate), cost: num(i.cost) })),
  }));
}

export async function loadPurchases(tenantId: string, since?: Date) {
  const rows = await db.purchase.findMany({ where: { tenantId, ...(since ? { date: { gte: since } } : {}) }, include: { items: true } });
  return rows.map((p) => ({ ...p, subtotal: num(p.subtotal), discount: num(p.discount), tax: num(p.tax), total: num(p.total), paid: num(p.paid), items: p.items.map((i) => ({ ...i, qty: num(i.qty), rate: num(i.rate), discount: num(i.discount), gstRate: num(i.gstRate) })) }));
}

export async function loadExpenses(tenantId: string, since?: Date) {
  const rows = await db.expense.findMany({ where: { tenantId, ...(since ? { date: { gte: since } } : {}) } });
  return rows.map((e) => ({ ...e, amount: num(e.amount) }));
}

export async function loadProducts(tenantId: string) {
  const rows = await db.product.findMany({ where: { tenantId, status: { not: 'archived' } } });
  return rows.map((p) => ({ ...p, stock: num(p.stock), minStock: num(p.minStock), purchasePrice: num(p.purchasePrice), sellingPrice: num(p.sellingPrice), tradePrice: num(p.tradePrice), gstRate: num(p.gstRate) }));
}

/** Items that don't track stock (dishes, made-to-order) never count as low or out of stock. */
export const tracksStock = (p: { isSelfProduct: boolean }) => !p.isSelfProduct;
export const isLowStock = (p: { isSelfProduct: boolean; stock: number; minStock: number }) => tracksStock(p) && p.stock <= p.minStock;

export const loadCustomers = async (tenantId: string) => (await db.customer.findMany({ where: { tenantId } })).map(customerOut);
export const loadVendors = async (tenantId: string) => (await db.vendor.findMany({ where: { tenantId } })).map(vendorOut);
export const loadEmployees = async (tenantId: string) => (await db.employee.findMany({ where: { tenantId } })).map(employeeOut);

export interface Window {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

function startOfFinancialYear(d: Date) {
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(year, 3, 1);
}

/** Current period and the equally long period before it. */
export function periodWindow(range: string, now = new Date()): Window {
  const tomorrow = addDays(startOfDay(now), 1);
  let start: Date;
  let end = tomorrow;
  switch (range) {
    case 'yesterday':
      start = addDays(startOfDay(now), -1);
      end = startOfDay(now);
      break;
    case '7d':
      start = addDays(tomorrow, -7);
      break;
    case '30d':
      start = addDays(tomorrow, -30);
      break;
    case 'month':
      start = startOfMonth(now);
      break;
    case 'quarter':
      start = startOfQuarter(now);
      break;
    case 'year':
      start = startOfFinancialYear(now);
      break;
    default:
      start = startOfDay(now);
  }
  const length = end.getTime() - start.getTime();
  return { start, end, prevStart: new Date(start.getTime() - length), prevEnd: start };
}

export const inWindow = (d: Date, from: Date, to: Date) => d.getTime() >= from.getTime() && d.getTime() < to.getTime();
export const pctChange = (current: number, previous: number) => (previous ? ((current - previous) / previous) * 100 : undefined);
export const sum = <T>(l: T[], f: (x: T) => number) => l.reduce((t, x) => t + f(x), 0);
export const costOf = (sales: SaleRow[]) => sum(sales, (s) => sum(s.items, (i) => i.qty * i.cost));
