import { sellerSnapshot } from '../lib/seller.js';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db, type Tx } from '../db.js';
import { audit, notify } from '../lib/audit.js';
import { crud } from '../lib/crud.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { purchaseOut, saleOut, vendorOut } from '../lib/mappers.js';
import { num, plain, round2 } from '../lib/serialize.js';
import { stockAlert } from '../lib/stockAlerts.js';
import { billLineSchema, priceLines, type BillLine } from '../lib/pricing.js';
import { addSerials, isSerialTracked, restoreSerials, sellSerials } from '../lib/serials.js';
import { nextSeq } from '../lib/tenants.js';
import { isoDate, money, positiveMoney, requiredText, text } from '../lib/validate.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';

export const transactionsRouter = Router();

const settingsOf = async (tx: Tx, tenantId: string) => ((await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } })).settings ?? {}) as Record<string, unknown>;
const can = (req: Request, module: string, perm: string) => req.auth!.permissions === 'all' || (req.auth!.permissions[module] ?? []).includes(perm as never);

/** A purchase line (always a catalogue product, quantity in its base unit). */
const lineSchema = z.object({
  productId: z.string().max(40).optional(),
  name: requiredText('Item name', 120),
  sku: text(40).default(''),
  hsn: text(10).default(''),
  qty: z.coerce.number().positive('Quantity must be more than 0').max(100000),
  rate: money,
  discount: money.default(0),
  gstRate: z.coerce.number().min(0).max(40),
});
/** Same arithmetic as the POS screen: line discounts, then bill discount spread pro-rata, then GST. */
export function computeTotals(items: { qty: number; rate: number; discount: number; gstRate: number }[], billDiscount: number) {
  const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const afterLine = items.reduce((s, i) => s + i.qty * i.rate - i.discount, 0);
  const bill = Math.min(Math.max(0, billDiscount), afterLine);
  const ratio = afterLine > 0 ? (afterLine - bill) / afterLine : 1;
  const tax = items.reduce((s, i) => s + (i.qty * i.rate - i.discount) * ratio * (i.gstRate / 100), 0);
  const lineDiscounts = items.reduce((s, i) => s + i.discount, 0);
  return { subtotal: round2(subtotal), discount: round2(lineDiscounts + bill), tax: round2(tax), total: Math.round(afterLine - bill + tax) };
}

// ── Sales ──
transactionsRouter.get('/sales', requireTenant, guard(['sales', 'pos', 'customers', 'reports']), async (req, res) => {
  const rows = await db.sale.findMany({ where: { tenantId: tid(req) }, include: { items: true }, orderBy: { date: 'desc' } });
  res.json(rows.map(saleOut));
});

transactionsRouter.get('/sales/returns', requireTenant, guard('sales'), async (req, res) => {
  const rows = await db.returnRecord.findMany({ where: { tenantId: tid(req), kind: 'sale' }, orderBy: { date: 'desc' } });
  res.json(rows.map((r) => plain(r)));
});

transactionsRouter.post('/sales/checkout', requireTenant, guard('pos', 'create'), async (req, res) => {
  const b = z
    .object({
      customerId: z.string().max(40).optional(),
      customerName: text(80).default('Walk-in Customer'),
      items: z.array(billLineSchema).min(1, 'Add at least one item').max(500),
      billDiscount: money.default(0),
      payment: z.enum(['cash', 'upi', 'card', 'bank', 'credit', 'split']),
      /** "trade" uses each product's trade (contractor / wholesale) price where one is set. */
      priceList: z.enum(['retail', 'trade']).default('retail'),
      branch: text(60).default('Main Branch'),
      notes: text(300).optional(),
    })
    .parse(req.body);

  const anyDiscount = b.billDiscount > 0 || b.items.some((i) => i.discount > 0);
  if (anyDiscount && !can(req, 'POS', 'discount')) throw forbidden('Your role is not allowed to give discounts.');
  if (b.payment === 'credit' && !b.customerId) throw badRequest('Select a customer to sell on credit.');

  const sale = await db.$transaction((tx) => createSale(tx, req, b, { canFreeText: req.auth!.permissions === 'all' }));
  await audit(req, 'created', 'Sales', sale.invoiceNo, `Invoice for ₹${num(sale.total)} via ${sale.payment}`);
  res.status(201).json(saleOut(sale));
});

/** Reserves the next invoice number using the business's prefix and starting number. */
export async function nextInvoiceNo(tx: Tx, tenantId: string, settings: Record<string, unknown>) {
  const seq = await nextSeq(tx, tenantId, 'invoiceSeq');
  const prefix = typeof settings.invoicePrefix === 'string' && settings.invoicePrefix ? settings.invoicePrefix : 'INV-';
  const start = Math.max(1, Number(settings.invoiceStartAt ?? 1));
  return `${prefix}${String(start + seq - 1).padStart(4, '0')}`;
}

export interface SaleInput {
  customerId?: string;
  customerName: string;
  items: BillLine[];
  billDiscount: number;
  payment: 'cash' | 'upi' | 'card' | 'bank' | 'credit' | 'split';
  priceList: 'retail' | 'trade';
  branch: string;
  notes?: string;
}

/**
 * Creates an invoice inside a transaction: catalogue pricing, stock out, IMEI units,
 * payment and customer balance. `alreadyPaid` is money taken before the invoice
 * (e.g. a job card advance) — it counts toward the bill but isn't recorded again.
 */
export async function createSale(tx: Tx, req: Request, b: SaleInput, opts: { canFreeText: boolean; alreadyPaid?: number }) {
  const tenantId = tid(req);
  const settings = await settingsOf(tx, tenantId);
  const allowNegative = settings.allowNegativeStock !== false;
  const { items, stock, products, consume } = await priceLines(tx, tenantId, b.items, { canFreeText: opts.canFreeText, priceList: b.priceList });

  const maxPct = Number(settings.maxDiscountPct ?? 100);
  const t = computeTotals(items, b.billDiscount);
  if (t.subtotal > 0 && (t.discount / t.subtotal) * 100 > maxPct + 0.001 && req.auth!.permissions !== 'all') throw forbidden(`Discount exceeds the ${maxPct}% allowed for your role.`);

  if (!allowNegative) {
    for (const { product: p, qty } of stock.values()) {
      if (num(p.stock) < qty) throw badRequest(`Only ${num(p.stock)} ${p.unit} of ${p.name} in stock.`);
    }
  }

  const customer = b.customerId ? await tx.customer.findFirst({ where: { id: b.customerId, tenantId } }) : null;
  if (b.customerId && !customer) throw badRequest('Customer not found.');

  const before = Math.min(opts.alreadyPaid ?? 0, t.total);
  const paid = b.payment === 'credit' ? before : t.total;
  const invoiceNo = await nextInvoiceNo(tx, tenantId, settings);

  const created = await tx.sale.create({
    data: {
      tenantId,
      invoiceNo,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? (b.customerName || 'Walk-in Customer'),
      branch: b.branch,
      subtotal: t.subtotal,
      discount: t.discount,
      tax: t.tax,
      total: t.total,
      paid,
      payment: b.payment,
      status: paid >= t.total ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      cashier: req.auth!.user.name,
      notes: b.notes,
      seller: await sellerSnapshot(tx, tenantId),
      items: { create: items },
    },
    include: { items: true },
  });

  // Record exactly which IMEI / serial units left with this invoice.
  for (const i of items.filter((x) => x.serials.length && x.productId)) {
    await sellSerials(tx, tenantId, products.find((p) => p.id === i.productId)!, i.serials, created);
  }

  for (const { product: p, qty } of stock.values()) {
    const updated = await tx.product.update({ where: { id: p.id }, data: { stock: { decrement: qty } } });
    await tx.stockMovement.create({ data: { tenantId, productId: p.id, product: p.name, sku: p.sku, type: 'out', qty, reference: invoiceNo, warehouse: p.warehouse, by: req.auth!.user.name } });
    await stockAlert(tx, tenantId, updated, num(updated.stock) + qty, num(updated.stock));
  }

  // In-house products used by the services (never blocks the bill — the stock can be corrected later).
  for (const { product: p, qty, services } of consume.values()) {
    const updated = await tx.product.update({ where: { id: p.id }, data: { stock: { decrement: qty } } });
    await tx.stockMovement.create({ data: { tenantId, productId: p.id, product: p.name, sku: p.sku, type: 'out', qty, reference: `${invoiceNo} · used for ${services.join(', ')}`.slice(0, 190), warehouse: p.warehouse, by: req.auth!.user.name } });
    await stockAlert(tx, tenantId, updated, num(updated.stock) + qty, num(updated.stock));
  }

  const collectedNow = round2(paid - before);
  if (collectedNow > 0) await tx.payment.create({ data: { tenantId, direction: 'in', customerId: customer?.id ?? null, saleId: created.id, amount: collectedNow, method: b.payment, reference: invoiceNo, createdBy: req.auth!.user.name } });

  if (customer) {
    const due = t.total - paid;
    const creditDays = Number(settings.creditDays ?? 15);
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        orders: { increment: 1 },
        totalSpend: { increment: t.total },
        outstanding: { increment: due },
        lastPurchase: created.date,
        ...(due > 0 ? { dueDate: new Date(Date.now() + creditDays * 864e5) } : {}),
      },
    });
  }
  return created;
}

async function reverseSale(req: Request, kind: 'refunded' | 'returned') {
  const reason = z.object({ reason: text(200).optional() }).parse(req.body ?? {}).reason;
  return db.$transaction(async (tx) => {
    const tenantId = tid(req);
    const s = await tx.sale.findFirst({ where: { id: String(req.params.id), tenantId }, include: { items: true } });
    if (!s) throw notFound('Invoice');
    if (s.status === 'refunded' || s.status === 'returned') throw badRequest(`${s.invoiceNo} has already been ${s.status}.`);
    // Put back exactly what left stock on this invoice (packages, "Box of 10" options and loose quantities included).
    for (const i of s.items) {
      await restoreSerials(tx, tenantId, s.id, Array.isArray(i.serials) ? (i.serials as string[]) : []);
      const back = num(i.stockQty);
      if (!i.productId || back <= 0) continue;
      const p = await tx.product.findFirst({ where: { id: i.productId, tenantId } });
      if (!p) continue;
      await tx.product.update({ where: { id: p.id }, data: { stock: { increment: back } } });
      await tx.stockMovement.create({ data: { tenantId, productId: p.id, product: p.name, sku: p.sku, type: 'in', qty: back, reference: `${s.invoiceNo} ${kind}`, warehouse: p.warehouse, by: req.auth!.user.name } });
    }
    const paid = num(s.paid);
    const unpaid = num(s.total) - paid;
    if (paid > 0) await tx.payment.create({ data: { tenantId, direction: 'out', customerId: s.customerId, saleId: s.id, amount: paid, method: s.payment === 'credit' || s.payment === 'split' ? 'cash' : s.payment, reference: `Refund ${s.invoiceNo}`, createdBy: req.auth!.user.name } });
    if (s.customerId) {
      await tx.customer.update({ where: { id: s.customerId }, data: { totalSpend: { decrement: num(s.total) }, outstanding: { decrement: unpaid }, orders: { decrement: 1 } } });
    }
    const seq = await nextSeq(tx, tenantId, 'returnSeq');
    await tx.returnRecord.create({ data: { tenantId, kind: 'sale', ref: `SR-${String(seq).padStart(4, '0')}`, against: s.invoiceNo, party: s.customerName, amount: num(s.total), tax: num(s.tax), reason: reason || (kind === 'refunded' ? 'Refund' : 'Goods returned'), status: 'approved' } });
    return tx.sale.update({ where: { id: s.id }, data: { status: kind }, include: { items: true } });
  });
}

transactionsRouter.post('/sales/:id/refund', requireTenant, guard('sales', 'refund'), async (req, res) => {
  const s = await reverseSale(req, 'refunded');
  await audit(req, 'refunded', 'Sales', s.invoiceNo, `Refund of ₹${num(s.total)}`);
  res.json(saleOut(s));
});

transactionsRouter.post('/sales/:id/return', requireTenant, guard('sales', 'refund'), async (req, res) => {
  const s = await reverseSale(req, 'returned');
  await audit(req, 'edited', 'Sales', s.invoiceNo, 'Goods returned, stock restored');
  res.json(saleOut(s));
});

// ── Purchases ──
transactionsRouter.get('/purchases', requireTenant, guard(['purchases', 'vendors', 'gst']), async (req, res) => {
  const rows = await db.purchase.findMany({ where: { tenantId: tid(req) }, include: { items: true }, orderBy: { date: 'desc' } });
  res.json(rows.map(purchaseOut));
});

transactionsRouter.get('/purchases/returns', requireTenant, guard('purchases'), async (req, res) => {
  const rows = await db.returnRecord.findMany({ where: { tenantId: tid(req), kind: 'purchase' }, orderBy: { date: 'desc' } });
  res.json(rows.map((r) => plain(r)));
});

/** IMEI / serial numbers received, per product id. */
const serialsByProductSchema = z.record(z.string().max(40), z.array(text(30)).max(500)).default({});

async function receivePurchase(tx: Tx, req: Request, purchaseId: string, serialsByProduct: Record<string, string[]> = {}) {
  const tenantId = tid(req);
  const p = await tx.purchase.findFirstOrThrow({ where: { id: purchaseId, tenantId }, include: { items: true } });
  const productIds = Array.from(new Set(p.items.map((i) => i.productId).filter((x): x is string => !!x)));
  for (const productId of productIds) {
    const prod = await tx.product.findFirst({ where: { id: productId, tenantId } });
    if (!prod) continue;
    const lines = p.items.filter((i) => i.productId === productId);
    const qty = lines.reduce((s, i) => s + num(i.qty), 0);
    await tx.product.update({ where: { id: prod.id }, data: { purchasePrice: lines[lines.length - 1].rate } });
    // Made-to-order items don't hold stock.
    if (prod.isSelfProduct) continue;
    if (isSerialTracked(prod)) {
      // Phones and other tracked units enter stock by their IMEI / serial numbers.
      const serials = serialsByProduct[productId] ?? [];
      if (serials.length !== qty) throw badRequest(`Enter ${qty} IMEI / serial number${qty === 1 ? '' : 's'} for ${prod.name} (got ${serials.length}).`);
      await addSerials(tx, tenantId, prod, serials, { reference: p.billNo, by: req.auth!.user.name, purchaseId: p.id, vendorId: p.vendorId, vendor: p.vendorName });
      continue;
    }
    await tx.product.update({ where: { id: prod.id }, data: { stock: { increment: qty } } });
    await tx.stockMovement.create({ data: { tenantId, productId: prod.id, product: prod.name, sku: prod.sku, type: 'in', qty, reference: p.billNo, warehouse: prod.warehouse, by: req.auth!.user.name, vendorId: p.vendorId, vendor: p.vendorName } });
  }
  const settings = await settingsOf(tx, tenantId);
  await tx.vendor.update({
    where: { id: p.vendorId },
    data: {
      purchases: { increment: 1 },
      totalPurchased: { increment: num(p.total) },
      payable: { increment: num(p.total) - num(p.paid) },
      lastPurchase: p.date,
      ...(num(p.total) > num(p.paid) ? { dueDate: new Date(Date.now() + Number(settings.vendorCreditDays ?? 30) * 864e5) } : {}),
    },
  });
  return tx.purchase.update({ where: { id: p.id }, data: { status: 'received', receivedAt: new Date() }, include: { items: true } });
}

transactionsRouter.post('/purchases', requireTenant, guard('purchases', 'create'), async (req, res) => {
  const b = z
    .object({
      vendorId: requiredText('Vendor', 40),
      billNo: requiredText('Invoice number', 30, 2),
      date: isoDate,
      status: z.enum(['received', 'ordered']),
      items: z.array(lineSchema.extend({ productId: requiredText('Product', 40) })).min(1, 'Add at least one item').max(500),
      notes: text(300).optional(),
      serials: serialsByProductSchema,
    })
    .parse(req.body);
  const purchase = await db.$transaction(async (tx) => {
    const tenantId = tid(req);
    const vendor = await tx.vendor.findFirst({ where: { id: b.vendorId, tenantId } });
    if (!vendor) throw badRequest('Vendor not found.');
    const products = await tx.product.findMany({ where: { tenantId, id: { in: b.items.map((i) => i.productId) } } });
    const items = b.items.map((i) => {
      const p = products.find((x) => x.id === i.productId);
      if (!p) throw badRequest(`${i.name} is not in your catalogue.`);
      return { ...i, name: p.name, sku: p.sku, hsn: p.hsn };
    });
    const t = computeTotals(items, 0);
    const created = await tx.purchase.create({
      data: {
        tenantId,
        billNo: b.billNo,
        vendorId: vendor.id,
        vendorName: vendor.name,
        date: b.date,
        subtotal: t.subtotal,
        discount: t.discount,
        tax: t.tax,
        total: t.total,
        paid: 0,
        status: 'ordered',
        paymentStatus: 'unpaid',
        notes: b.notes,
        items: { create: items.map((i) => ({ productId: i.productId, name: i.name, sku: i.sku, hsn: i.hsn, qty: i.qty, rate: i.rate, discount: i.discount, gstRate: i.gstRate })) },
      },
    });
    return b.status === 'received' ? receivePurchase(tx, req, created.id, b.serials) : tx.purchase.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
  });
  await audit(req, 'created', 'Purchases', purchase.billNo, `Purchase from ${purchase.vendorName} for ₹${num(purchase.total)}`);
  res.status(201).json(purchaseOut(purchase));
});

transactionsRouter.post('/purchases/:id/receive', requireTenant, guard('purchases', 'edit'), async (req, res) => {
  const { serials } = z.object({ serials: serialsByProductSchema }).parse(req.body ?? {});
  const purchase = await db.$transaction(async (tx) => {
    const p = await tx.purchase.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
    if (!p) throw notFound('Purchase');
    if (p.status === 'received') throw badRequest('These goods were already received.');
    return receivePurchase(tx, req, p.id, serials);
  });
  await notify(tid(req), 'purchase-received', 'Purchase received', `Goods against ${purchase.billNo} from ${purchase.vendorName} were received.`, '/purchases');
  await audit(req, 'edited', 'Purchases', purchase.billNo, 'Goods received, stock updated');
  res.json(purchaseOut(purchase));
});

/** Deletes a bill entered by mistake. A received bill is reversed: stock out, vendor dues reduced. */
transactionsRouter.delete('/purchases/:id', requireTenant, guard('purchases', 'delete'), async (req, res) => {
  const tenantId = tid(req);
  const p = await db.$transaction(async (tx) => {
    const p = await tx.purchase.findFirst({ where: { id: String(req.params.id), tenantId }, include: { items: true } });
    if (!p) throw notFound('Purchase');
    if (p.status === 'ordered') {
      await tx.purchase.delete({ where: { id: p.id } });
      return p;
    }
    if (p.status !== 'received') throw badRequest(`${p.billNo} has returns recorded against it and can't be deleted.`);
    if (num(p.paid) > 0) throw badRequest(`₹${num(p.paid).toLocaleString('en-IN')} was already paid against ${p.billNo}. Record a purchase return instead.`);
    const units = await tx.productSerial.findMany({ where: { tenantId, purchaseId: p.id } });
    const gone = units.filter((u) => u.status !== 'in_stock');
    if (gone.length) throw badRequest(`${gone.map((u) => u.serial).slice(0, 3).join(', ')}${gone.length > 3 ? '…' : ''} from this bill ${gone.length === 1 ? 'was' : 'were'} already sold or removed. Record a purchase return instead.`);
    for (const productId of new Set(p.items.map((i) => i.productId).filter((x): x is string => !!x))) {
      const prod = await tx.product.findFirst({ where: { id: productId, tenantId } });
      if (!prod || prod.isSelfProduct) continue;
      const tracked = units.filter((u) => u.productId === productId);
      const qty = isSerialTracked(prod) ? tracked.length : p.items.filter((i) => i.productId === productId).reduce((s, i) => s + num(i.qty), 0);
      if (tracked.length) await tx.productSerial.deleteMany({ where: { id: { in: tracked.map((u) => u.id) } } });
      if (qty > 0) {
        const updated = await tx.product.update({ where: { id: prod.id }, data: { stock: { decrement: qty } } });
        await tx.stockMovement.create({ data: { tenantId, productId: prod.id, product: prod.name, sku: prod.sku, type: 'adjustment', qty: -qty, reference: `Bill ${p.billNo} deleted`, warehouse: prod.warehouse, by: req.auth!.user.name } });
        await stockAlert(tx, tenantId, updated, num(prod.stock), num(updated.stock));
      }
    }
    const vendor = await tx.vendor.findFirst({ where: { id: p.vendorId, tenantId } });
    if (vendor) {
      const payable = round2(Math.max(0, num(vendor.payable) - num(p.total)));
      await tx.vendor.update({
        where: { id: vendor.id },
        data: { purchases: Math.max(0, vendor.purchases - 1), totalPurchased: round2(Math.max(0, num(vendor.totalPurchased) - num(p.total))), payable, ...(payable <= 0 ? { dueDate: null } : {}) },
      });
    }
    await tx.purchase.delete({ where: { id: p.id } });
    return p;
  });
  await audit(req, 'deleted', 'Purchases', p.billNo, `${p.vendorName} · ₹${num(p.total)}${p.status === 'received' ? ' (stock and dues reversed)' : ''}`);
  res.json({ id: p.id });
});

// ── Expenses ──
const expenseSchema = z.object({
  title: requiredText('Expense', 100, 2),
  category: z.enum(['Rent', 'Salary', 'Electricity', 'Marketing', 'Transport', 'Maintenance', 'Office', 'Miscellaneous']),
  amount: positiveMoney,
  date: isoDate,
  paidTo: requiredText('Paid to', 80, 2),
  method: z.enum(['cash', 'upi', 'card', 'bank']),
  status: z.enum(['paid', 'pending']),
  recurring: z.boolean().default(false),
  notes: text(300).optional(),
  receiptUploadId: z.string().max(40).nullable().optional(),
});
const checkReceipt = async (req: Request, data: { receiptUploadId?: string | null; receiptName?: string | null }) => {
  if (data.receiptUploadId) {
    const up = await db.upload.findFirst({ where: { id: data.receiptUploadId, tenantId: tid(req) } });
    if (!up) throw badRequest('Receipt file not found.');
    data.receiptName = up.fileName;
  } else if (data.receiptUploadId === null) data.receiptName = null;
  return data;
};
crud(transactionsRouter, {
  path: '/expenses',
  page: ['expenses', 'reports'],
  writePage: 'expenses',
  module: 'Expenses',
  model: db.expense,
  create: expenseSchema,
  update: expenseSchema.partial(),
  orderBy: { date: 'desc' },
  label: (e) => `${e.title} (₹${num(e.amount)})`,
  out: (e) => {
    const p = plain(e) as Record<string, unknown>;
    return { ...p, receipt: e.receiptName ?? undefined, receiptUrl: e.receiptUploadId ? `/api/uploads/${e.receiptUploadId}` : undefined, notes: e.notes ?? undefined };
  },
  beforeCreate: checkReceipt,
  beforeUpdate: (req, data) => checkReceipt(req, data),
});

// ── Inventory ──
transactionsRouter.get('/inventory/overview', requireTenant, guard('inventory'), async (req, res) => {
  const tenantId = tid(req);
  // Made-to-order items (dishes) hold no stock, so they are not part of inventory.
  const products = (await db.product.findMany({ where: { tenantId, status: { not: 'archived' }, isSelfProduct: false }, orderBy: { name: 'asc' } })).map((p) => plain(p) as unknown as ProductRow);
  const since = new Date(Date.now() - 14 * 864e5);
  since.setHours(0, 0, 0, 0);
  const moves = await db.stockMovement.findMany({ where: { tenantId, date: { gte: since } } });
  const totalValue = products.reduce((s, p) => s + p.stock * p.purchasePrice, 0);
  const byCat = new Map<string, number>();
  products.forEach((p) => byCat.set(p.category, (byCat.get(p.category) ?? 0) + p.stock * p.purchasePrice));
  const flow = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(since.getTime() + i * 864e5);
    const next = new Date(day.getTime() + 864e5);
    const onDay = moves.filter((m) => m.date >= day && m.date < next);
    return {
      label: day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      inward: onDay.filter((m) => m.type === 'in' || (m.type === 'adjustment' && num(m.qty) > 0)).reduce((s, m) => s + Math.abs(num(m.qty)), 0),
      outward: onDay.filter((m) => m.type === 'out' || (m.type === 'adjustment' && num(m.qty) < 0)).reduce((s, m) => s + Math.abs(num(m.qty)), 0),
    };
  });
  const in30 = Date.now() + 30 * 864e5;
  res.json({
    totalValue: round2(totalValue),
    low: products.filter((p) => p.stock > 0 && p.stock <= p.minStock),
    out: products.filter((p) => p.stock <= 0),
    expiring: products.filter((p) => p.expiryDate && new Date(p.expiryDate).getTime() <= in30),
    byCategory: Array.from(byCat, ([category, value]) => ({ category, value: Math.round(value) })).sort((a, b) => b.value - a.value),
    flow,
    items: products.map((p) => ({ ...p, expiryDate: p.expiryDate ?? undefined })),
  });
});

interface ProductRow { id: string; name: string; category: string; stock: number; minStock: number; purchasePrice: number; warehouse: string; expiryDate: string | null }

transactionsRouter.get('/inventory/movements', requireTenant, guard('inventory'), async (req, res) => {
  const rows = await db.stockMovement.findMany({ where: { tenantId: tid(req) }, orderBy: { date: 'desc' }, take: 1000 });
  res.json(rows.map((r) => plain(r)));
});

/** Each vendor with the stock they have supplied (purchases received and stock added with a vendor). */
transactionsRouter.get('/inventory/vendors', requireTenant, guard('inventory'), async (req, res) => {
  const [vendors, moves] = await Promise.all([
    db.vendor.findMany({ where: { tenantId: tid(req) }, orderBy: { name: 'asc' } }),
    db.stockMovement.findMany({ where: { tenantId: tid(req), vendorId: { not: null }, qty: { gt: 0 } }, orderBy: { date: 'desc' }, select: { vendorId: true, product: true, qty: true, date: true } }),
  ]);
  res.json(
    vendors.map((v) => {
      const mine = moves.filter((m) => m.vendorId === v.id);
      const products = [...new Set(mine.map((m) => m.product))];
      return {
        ...vendorOut(v),
        supplies: mine.length,
        products: products.length,
        topProducts: products.slice(0, 3),
        lastSupplied: mine[0]?.date.toISOString(),
      };
    }),
  );
});

transactionsRouter.get('/inventory/warehouses', requireTenant, guard('inventory'), async (req, res) => {
  const products = await db.product.findMany({ where: { tenantId: tid(req), status: { not: 'archived' }, isSelfProduct: false } });
  const names = Array.from(new Set(['Main Store', ...products.map((p) => p.warehouse)]));
  res.json(names.map((name) => {
    const here = products.filter((p) => p.warehouse === name);
    return { id: name, name, city: '', manager: '', items: here.reduce((s, p) => s + num(p.stock), 0), value: round2(here.reduce((s, p) => s + num(p.stock) * num(p.purchasePrice), 0)), utilisation: 0 };
  }));
});

transactionsRouter.post('/inventory/adjust', requireTenant, guard('inventory', 'edit'), async (req, res) => {
  const b = z
    .object({
      productId: requiredText('Product', 40),
      qty: z.coerce.number().max(1e9).min(-1e9).refine((q) => q !== 0, 'Quantity cannot be zero'),
      reason: requiredText('Reason', 80),
      warehouse: text(60).default('Main Store'),
      /** Who supplied the stock being added (optional). */
      vendorId: z.string().max(40).nullable().optional(),
    })
    .parse(req.body);
  const product = await db.$transaction(async (tx) => {
    const p = await tx.product.findFirst({ where: { id: b.productId, tenantId: tid(req) } });
    if (!p) throw notFound('Product');
    if (b.vendorId && b.qty < 0) throw badRequest('A vendor can only be recorded when adding stock.');
    const vendor = b.vendorId ? await tx.vendor.findFirst({ where: { id: b.vendorId, tenantId: tid(req) }, select: { id: true, name: true } }) : null;
    if (b.vendorId && !vendor) throw badRequest('Vendor not found.');
    if (p.isSelfProduct) throw badRequest(`${p.name} doesn't track stock.`);
    if (isSerialTracked(p)) throw badRequest(`${p.name} is IMEI-tracked. Add or remove its IMEI / serial numbers from the product instead.`);
    if (!p.allowDecimalQty && !Number.isInteger(b.qty)) throw badRequest(`${p.name} is counted in whole numbers.`);
    if (num(p.stock) + b.qty < 0) throw badRequest(`Cannot reduce below zero — only ${num(p.stock)} in stock.`);
    await tx.stockMovement.create({
      data: { tenantId: tid(req), productId: p.id, product: p.name, sku: p.sku, type: vendor ? 'in' : 'adjustment', qty: b.qty, reference: b.reason, warehouse: b.warehouse, by: req.auth!.user.name, vendorId: vendor?.id ?? null, vendor: vendor?.name ?? '' },
    });
    if (vendor) await tx.vendor.update({ where: { id: vendor.id }, data: { lastPurchase: new Date() } });
    const updated = await tx.product.update({ where: { id: p.id }, data: { stock: { increment: b.qty } } });
    await stockAlert(tx, tid(req), updated, num(p.stock), num(updated.stock));
    return updated;
  });
  await audit(req, 'edited', 'Inventory', product.name, `Stock ${b.qty > 0 ? '+' : ''}${b.qty} (${b.reason})${b.vendorId ? ' from vendor' : ''}`);
  res.json(plain(product));
});
