import type { Product } from '@prisma/client';
import { addMonths } from 'date-fns';
import type { Tx } from '../db.js';
import { badRequest } from './http.js';

/** Products whose every unit has its own IMEI / serial number. */
export const isSerialTracked = (p: Pick<Product, 'attributes'>) => (p.attributes as Record<string, unknown> | null)?.imeiTracking === true;

/** Trimmed, upper-cased, de-duplicated serial numbers (rejects odd characters). */
export function cleanSerials(list: string[]) {
  const out = Array.from(new Set(list.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  const bad = out.find((s) => !/^[A-Z0-9/-]{4,30}$/.test(s));
  if (bad) throw badRequest(`"${bad}" doesn't look like an IMEI / serial number.`);
  return out;
}

/** Adds units to stock by their serial numbers. */
export async function addSerials(tx: Tx, tenantId: string, product: Product, serials: string[], ctx: { reference: string; by: string; purchaseId?: string; vendorId?: string; vendor?: string }) {
  const list = cleanSerials(serials);
  if (!list.length) return 0;
  const taken = await tx.productSerial.findMany({ where: { tenantId, serial: { in: list } }, select: { serial: true } });
  if (taken.length) throw badRequest(`Already in your records: ${taken.map((t) => t.serial).join(', ')}`);
  await tx.productSerial.createMany({ data: list.map((serial) => ({ tenantId, productId: product.id, serial, purchaseId: ctx.purchaseId ?? null })) });
  await tx.product.update({ where: { id: product.id }, data: { stock: { increment: list.length } } });
  await tx.stockMovement.create({ data: { tenantId, productId: product.id, product: product.name, sku: product.sku, type: 'in', qty: list.length, reference: ctx.reference, warehouse: product.warehouse, by: ctx.by, vendorId: ctx.vendorId ?? null, vendor: ctx.vendor ?? '' } });
  return list.length;
}

/** Marks the exact units sold on an invoice and starts their warranty. */
export async function sellSerials(tx: Tx, tenantId: string, product: Product, serials: string[], sale: { id: string; invoiceNo: string; customerName: string; date: Date }) {
  const list = cleanSerials(serials);
  const rows = await tx.productSerial.findMany({ where: { tenantId, serial: { in: list } } });
  for (const s of list) {
    const row = rows.find((r) => r.serial === s);
    if (!row || row.productId !== product.id) throw badRequest(`${s} is not a ${product.name} in your stock.`);
    if (row.status !== 'in_stock') throw badRequest(`${s} has already been ${row.status === 'sold' ? `sold (${row.invoiceNo})` : 'removed from stock'}.`);
  }
  const months = Number((product.attributes as Record<string, unknown> | null)?.warrantyMonths) || 0;
  await tx.productSerial.updateMany({
    where: { tenantId, serial: { in: list } },
    data: { status: 'sold', saleId: sale.id, invoiceNo: sale.invoiceNo, customerName: sale.customerName, soldAt: sale.date, warrantyUntil: months > 0 ? addMonths(sale.date, months) : null },
  });
}

/** Puts units from a refunded / returned invoice back in stock. */
export async function restoreSerials(tx: Tx, tenantId: string, saleId: string, serials: string[]) {
  if (!serials.length) return;
  await tx.productSerial.updateMany({
    where: { tenantId, saleId, serial: { in: serials } },
    data: { status: 'in_stock', saleId: null, invoiceNo: null, customerName: null, soldAt: null, warrantyUntil: null },
  });
}
