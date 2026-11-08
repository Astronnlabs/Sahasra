import { sellerSnapshot } from '../lib/seller.js';
import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db, type Tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { crud } from '../lib/crud.js';
import { badRequest, notFound } from '../lib/http.js';
import { saleOut } from '../lib/mappers.js';
import { num, plain } from '../lib/serialize.js';
import { stockAlert } from '../lib/stockAlerts.js';
import { autoSku, nextSeq } from '../lib/tenants.js';
import { int, isoDate, money, phone, positiveMoney, requiredText, text } from '../lib/validate.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';
import { computeTotals, nextInvoiceNo } from './transactions.js';

export const industryRouter = Router();

// ════════ Restaurant ════════
const R_PAGES = ['restaurant-tables', 'restaurant-orders', 'restaurant-kitchen'] as const;

interface OrderLine { id: string; menuItemId: string; name: string; qty: number; price: number; note?: string; sentToKitchen: boolean }

const tableOut = (t: object) => {
  const p = plain(t) as Record<string, unknown>;
  return { ...p, guests: p.guests ?? undefined, waiter: p.waiter ?? undefined, openedAt: p.openedAt ?? undefined, orderId: p.orderId ?? undefined, mergedWith: p.mergedWith ?? undefined, reservedFor: p.reservedFor ?? undefined };
};
const orderOut = (o: object) => {
  const p = plain(o) as Record<string, unknown>;
  return { ...p, tableId: p.tableId ?? undefined, customer: p.customer ?? undefined };
};

industryRouter.get('/restaurant/tables', requireTenant, guard([...R_PAGES]), async (req, res) => {
  res.json((await db.restaurantTable.findMany({ where: { tenantId: tid(req) }, orderBy: { label: 'asc' } })).map(tableOut));
});

industryRouter.post('/restaurant/tables', requireTenant, guard('restaurant-tables', 'create'), async (req, res) => {
  const b = z.object({ label: requiredText('Table name', 10).transform((s) => s.toUpperCase()), seats: int.min(1).max(50), area: z.enum(['Ground Floor', 'First Floor', 'Terrace']) }).parse(req.body);
  const t = await db.restaurantTable.create({ data: { ...b, tenantId: tid(req) } });
  await audit(req, 'created', 'Restaurant', `Table ${t.label}`);
  res.status(201).json(tableOut(t));
});

industryRouter.delete('/restaurant/tables/:id', requireTenant, guard('restaurant-tables', 'delete'), async (req, res) => {
  const t = await db.restaurantTable.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!t) throw notFound('Table');
  if (t.orderId) throw badRequest('Settle the open order before removing this table.');
  await db.restaurantTable.delete({ where: { id: t.id } });
  res.json({ id: t.id });
});

industryRouter.patch('/restaurant/tables/:id/status', requireTenant, guard('restaurant-tables', 'edit'), async (req, res) => {
  const { status } = z.object({ status: z.enum(['available', 'occupied', 'reserved', 'cleaning']) }).parse(req.body);
  const t = await db.restaurantTable.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!t) throw notFound('Table');
  const reset = status === 'available' ? { orderId: null, guests: null, waiter: null, openedAt: null, mergedWith: Prisma.DbNull, reservedFor: null } : {};
  res.json(tableOut(await db.restaurantTable.update({ where: { id: t.id }, data: { status, ...reset } })));
});

/** The restaurant menu is the business's product catalogue (one menu for POS, tables and reports). */
const menuOut = (p: { id: string; name: string; category: string; sellingPrice: Prisma.Decimal; gstRate: Prisma.Decimal; attributes: Prisma.JsonValue; image?: string; soldOut?: boolean }) => {
  const foodType = (p.attributes as Record<string, unknown> | null)?.foodType;
  return { id: p.id, name: p.name, category: p.category, price: num(p.sellingPrice), gstRate: num(p.gstRate), veg: foodType !== 'Non-veg' && foodType !== 'Egg', foodType: typeof foodType === 'string' ? foodType : 'Veg', image: p.image || undefined, soldOut: !!p.soldOut };
};

industryRouter.get('/restaurant/menu', requireTenant, guard([...R_PAGES]), async (req, res) => {
  const rows = await db.product.findMany({ where: { tenantId: tid(req), status: 'active' }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  res.json(rows.map(menuOut));
});

/** Quick-add a dish from the table screen; it becomes a regular menu item (no stock tracking). */
industryRouter.post('/restaurant/menu', requireTenant, guard(['restaurant-tables', 'restaurant-orders'], 'create'), async (req, res) => {
  const b = z.object({ name: requiredText('Dish name', 60, 2), category: text(30).default('Main Course'), price: positiveMoney, veg: z.boolean().default(true), gstRate: z.coerce.number().min(0).max(28).default(5) }).parse(req.body);
  const tenantId = tid(req);
  const p = await db.product.create({
    data: {
      tenantId,
      name: b.name,
      sku: await autoSku(tenantId),
      category: b.category || 'Main Course',
      unit: 'Plate',
      sellingPrice: b.price,
      gstRate: b.gstRate,
      isSelfProduct: true,
      productType: 'self',
      attributes: { foodType: b.veg ? 'Veg' : 'Non-veg' },
    },
  });
  await audit(req, 'created', 'Products', `${p.name} (${p.sku})`, 'Added from the table screen');
  res.status(201).json(menuOut(p));
});

industryRouter.get('/restaurant/orders', requireTenant, guard([...R_PAGES]), async (req, res) => {
  res.json((await db.restaurantOrder.findMany({ where: { tenantId: tid(req) }, orderBy: { createdAt: 'desc' }, take: 300 })).map(orderOut));
});

industryRouter.post('/restaurant/orders/open', requireTenant, guard(['restaurant-tables', 'restaurant-orders'], 'create'), async (req, res) => {
  const b = z.object({ tableId: z.string().max(40).optional(), type: z.enum(['dine-in', 'takeaway', 'delivery']), customer: text(80).optional() }).parse(req.body);
  const order = await db.$transaction(async (tx) => {
    const tenantId = tid(req);
    if (b.tableId) {
      const t = await tx.restaurantTable.findFirst({ where: { id: b.tableId, tenantId } });
      if (!t) throw notFound('Table');
      if (t.orderId) {
        const existing = await tx.restaurantOrder.findFirst({ where: { id: t.orderId, tenantId, status: 'open' } });
        if (existing) return existing;
      }
    }
    const seq = await nextSeq(tx, tenantId, 'orderSeq');
    const created = await tx.restaurantOrder.create({ data: { tenantId, number: `ORD-${String(seq).padStart(4, '0')}`, type: b.type, tableId: b.tableId ?? null, customer: b.customer ?? null } });
    if (b.tableId) await tx.restaurantTable.update({ where: { id: b.tableId }, data: { status: 'occupied', orderId: created.id, openedAt: created.createdAt, guests: 2, waiter: req.auth!.user.name } });
    return created;
  });
  res.status(201).json(orderOut(order));
});

const lineSchema = z.object({ id: z.string().max(60), menuItemId: z.string().max(40), name: text(80), qty: int.min(1).max(999), price: money, note: text(120).optional(), sentToKitchen: z.boolean() });

industryRouter.put('/restaurant/orders/:id/lines', requireTenant, guard(['restaurant-tables', 'restaurant-orders'], 'edit'), async (req, res) => {
  const lines = z.array(lineSchema).max(300).parse(req.body.lines);
  const o = await db.restaurantOrder.findFirst({ where: { id: String(req.params.id), tenantId: tid(req), status: 'open' } });
  if (!o) throw notFound('Open order');
  const menu = await db.product.findMany({ where: { tenantId: tid(req), id: { in: lines.map((l) => l.menuItemId) } } });
  // Prices always come from the menu.
  const priced = lines.map((l) => {
    const m = menu.find((x) => x.id === l.menuItemId);
    if (!m || m.status !== 'active') throw badRequest(`${l.name} is not on the menu.`);
    // Already-sent dishes are being served; only new ones are stopped.
    if (m.soldOut && !l.sentToKitchen) throw badRequest(`${m.name} is out of stock.`);
    return { ...l, name: m.name, price: num(m.sellingPrice) };
  });
  res.json(orderOut(await db.restaurantOrder.update({ where: { id: o.id }, data: { lines: priced as unknown as Prisma.InputJsonValue } })));
});

industryRouter.post('/restaurant/orders/:id/kot', requireTenant, guard(['restaurant-tables', 'restaurant-orders'], 'create'), async (req, res) => {
  const kot = await db.$transaction(async (tx) => {
    const tenantId = tid(req);
    const o = await tx.restaurantOrder.findFirst({ where: { id: String(req.params.id), tenantId, status: 'open' } });
    if (!o) throw notFound('Open order');
    const lines = (o.lines as unknown as OrderLine[]) ?? [];
    const pending = lines.filter((l) => !l.sentToKitchen);
    if (!pending.length) return null;
    const table = o.tableId ? await tx.restaurantTable.findFirst({ where: { id: o.tableId } }) : null;
    const seq = await nextSeq(tx, tenantId, 'kotSeq');
    const created = await tx.kot.create({
      data: { tenantId, number: `KOT-${String(seq).padStart(4, '0')}`, orderId: o.id, table: table?.label ?? (o.type === 'takeaway' ? 'Takeaway' : 'Delivery'), type: o.type, items: pending.map((l) => ({ name: l.name, qty: l.qty, note: l.note })) },
    });
    await tx.restaurantOrder.update({ where: { id: o.id }, data: { lines: lines.map((l) => ({ ...l, sentToKitchen: true })) as unknown as Prisma.InputJsonValue } });
    return created;
  });
  res.json(kot ? plain(kot) : null);
});

industryRouter.get('/restaurant/kots', requireTenant, guard([...R_PAGES]), async (req, res) => {
  const since = new Date(Date.now() - 2 * 864e5);
  res.json((await db.kot.findMany({ where: { tenantId: tid(req), createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } })).map((k) => plain(k)));
});

industryRouter.patch('/restaurant/kots/:id', requireTenant, guard(['restaurant-kitchen', 'restaurant-orders'], 'edit'), async (req, res) => {
  const { status } = z.object({ status: z.enum(['new', 'preparing', 'ready', 'served']) }).parse(req.body);
  const k = await db.kot.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!k) throw notFound('KOT');
  res.json(plain(await db.kot.update({ where: { id: k.id }, data: { status } })));
});

industryRouter.post('/restaurant/tables/transfer', requireTenant, guard('restaurant-tables', 'edit'), async (req, res) => {
  const b = z.object({ fromId: z.string().max(40), toId: z.string().max(40) }).parse(req.body);
  await db.$transaction(async (tx) => {
    const tenantId = tid(req);
    const from = await tx.restaurantTable.findFirst({ where: { id: b.fromId, tenantId } });
    const to = await tx.restaurantTable.findFirst({ where: { id: b.toId, tenantId } });
    if (!from?.orderId) throw badRequest('Nothing to transfer.');
    if (!to || to.status !== 'available') throw badRequest('Choose a free table.');
    await tx.restaurantTable.update({ where: { id: to.id }, data: { status: 'occupied', orderId: from.orderId, guests: from.guests, waiter: from.waiter, openedAt: from.openedAt } });
    await tx.restaurantTable.update({ where: { id: from.id }, data: { status: 'cleaning', orderId: null, guests: null, waiter: null, openedAt: null } });
    await tx.restaurantOrder.update({ where: { id: from.orderId }, data: { tableId: to.id } });
  });
  res.json({ ok: true });
});

industryRouter.post('/restaurant/tables/merge', requireTenant, guard('restaurant-tables', 'edit'), async (req, res) => {
  const b = z.object({ targetId: z.string().max(40), otherIds: z.array(z.string().max(40)).min(1).max(20) }).parse(req.body);
  await db.$transaction(async (tx) => {
    const tenantId = tid(req);
    const target = await tx.restaurantTable.findFirst({ where: { id: b.targetId, tenantId } });
    if (!target?.orderId) throw badRequest('The target table has no open order.');
    const targetOrder = await tx.restaurantOrder.findFirstOrThrow({ where: { id: target.orderId } });
    let lines = (targetOrder.lines as unknown as OrderLine[]) ?? [];
    for (const id of b.otherIds) {
      const t = await tx.restaurantTable.findFirst({ where: { id, tenantId } });
      if (!t) continue;
      if (t.orderId) {
        const o = await tx.restaurantOrder.findFirst({ where: { id: t.orderId } });
        if (o && o.id !== targetOrder.id) {
          lines = lines.concat((o.lines as unknown as OrderLine[]) ?? []);
          await tx.restaurantOrder.update({ where: { id: o.id }, data: { status: 'closed', lines: [] } });
        }
      }
      await tx.restaurantTable.update({ where: { id: t.id }, data: { status: 'occupied', orderId: targetOrder.id, mergedWith: [target.id] } });
    }
    await tx.restaurantOrder.update({ where: { id: targetOrder.id }, data: { lines: lines as unknown as Prisma.InputJsonValue } });
    await tx.restaurantTable.update({ where: { id: target.id }, data: { mergedWith: b.otherIds } });
  });
  res.json({ ok: true });
});

/** Settles the bill: creates a real invoice and frees the table(s). */
industryRouter.post('/restaurant/orders/:id/settle', requireTenant, guard(['restaurant-tables', 'restaurant-orders'], 'create'), async (req, res) => {
  const { method } = z.object({ method: z.enum(['cash', 'upi', 'card']) }).parse(req.body);
  const sale = await db.$transaction(async (tx: Tx) => {
    const tenantId = tid(req);
    const o = await tx.restaurantOrder.findFirst({ where: { id: String(req.params.id), tenantId, status: 'open' } });
    if (!o) throw notFound('Open order');
    const lines = (o.lines as unknown as OrderLine[]) ?? [];
    if (!lines.length) throw badRequest('Add items before settling the bill.');
    const menu = await tx.product.findMany({ where: { tenantId, id: { in: lines.map((l) => l.menuItemId) } } });
    const items = lines.map((l) => {
      const m = menu.find((x) => x.id === l.menuItemId);
      if (!m) throw badRequest(`${l.name} is no longer on the menu.`);
      const tracked = !m.isSelfProduct;
      return { productId: m.id, name: m.name, sku: m.sku, hsn: m.hsn, qty: l.qty, rate: l.price, discount: 0, gstRate: num(m.gstRate), cost: num(m.purchasePrice), stockQty: tracked ? l.qty : 0, product: m };
    });
    const t = computeTotals(items, 0);
    const settings = ((await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } })).settings ?? {}) as Record<string, unknown>;
    const invoiceNo = await nextInvoiceNo(tx, tenantId, settings);
    const table = o.tableId ? await tx.restaurantTable.findFirst({ where: { id: o.tableId } }) : null;
    const created = await tx.sale.create({
      data: {
        tenantId, invoiceNo, customerName: o.customer || (table ? `Table ${table.label}` : 'Walk-in Customer'), subtotal: t.subtotal, discount: 0, tax: t.tax, total: t.total, paid: t.total, payment: method, status: 'paid', cashier: req.auth!.user.name,
        notes: `${o.number}${table ? ` · Table ${table.label}` : ` · ${o.type}`}`,
        seller: await sellerSnapshot(tx, tenantId),
        items: { create: items.map((i) => ({ productId: i.productId, name: i.name, sku: i.sku, hsn: i.hsn, qty: i.qty, stockQty: i.stockQty, rate: i.rate, gstRate: i.gstRate, cost: i.cost })) },
      },
      include: { items: true },
    });
    // Bottled drinks and other stocked items leave inventory; dishes don't.
    for (const i of items.filter((x) => x.stockQty > 0)) {
      const updated = await tx.product.update({ where: { id: i.productId }, data: { stock: { decrement: i.stockQty } } });
      await tx.stockMovement.create({ data: { tenantId, productId: i.productId, product: i.name, sku: i.sku, type: 'out', qty: i.stockQty, reference: invoiceNo, warehouse: i.product.warehouse, by: req.auth!.user.name } });
      await stockAlert(tx, tenantId, updated, num(updated.stock) + i.stockQty, num(updated.stock));
    }
    await tx.payment.create({ data: { tenantId, direction: 'in', saleId: created.id, amount: t.total, method, reference: invoiceNo, createdBy: req.auth!.user.name } });
    await tx.restaurantOrder.update({ where: { id: o.id }, data: { status: 'closed', saleId: created.id } });
    await tx.restaurantTable.updateMany({ where: { tenantId, orderId: o.id }, data: { status: 'cleaning', orderId: null, guests: null, waiter: null, openedAt: null, mergedWith: Prisma.DbNull } });
    return created;
  });
  await audit(req, 'created', 'Sales', sale.invoiceNo, `Restaurant bill ₹${num(sale.total)}`);
  res.json(saleOut(sale));
});

// ════════ Hotel ════════
const roomSchema = z.object({ number: requiredText('Room number', 8), floor: int.min(0).max(200), type: z.enum(['Standard', 'Deluxe', 'Executive', 'Suite']), rate: positiveMoney, status: z.enum(['available', 'occupied', 'reserved', 'cleaning', 'maintenance']).default('available'), guest: text(80).nullable().optional(), checkOut: isoDate.nullable().optional() });
crud(industryRouter, {
  path: '/hotel/rooms',
  page: ['hotel-rooms', 'hotel-reservations'],
  writePage: 'hotel-rooms',
  module: 'Hotel',
  model: db.room,
  create: roomSchema,
  orderBy: { number: 'asc' },
  label: (r) => `Room ${r.number}`,
  out: (r) => {
    const p = plain(r) as Record<string, unknown>;
    return { ...p, guest: p.guest ?? undefined, checkOut: p.checkOut ?? undefined };
  },
  beforeUpdate: (_req, data) => (data.status === 'available' || data.status === 'cleaning' ? { ...data, guest: data.guest ?? null, checkOut: data.checkOut ?? null } : data),
  beforeDelete: async (req, r) => {
    if (r.status === 'occupied') throw badRequest(`Room ${r.number} has a guest. Check them out first.`);
    const upcoming = await db.reservation.count({ where: { tenantId: tid(req), roomNumber: r.number, status: { in: ['confirmed', 'pending', 'checked-in'] } } });
    if (upcoming) throw badRequest(`Room ${r.number} has ${upcoming} active booking${upcoming === 1 ? '' : 's'}. Cancel or move ${upcoming === 1 ? 'it' : 'them'} first.`);
  },
});

const reservationSchema = z
  .object({
    guest: requiredText('Guest name', 60, 2),
    phone,
    roomNumber: requiredText('Room', 8),
    checkIn: isoDate,
    checkOut: isoDate,
    guests: int.min(1).max(10),
    advance: money.default(0),
    source: z.enum(['Walk-in', 'Website', 'Phone', 'OTA']),
  })
  .refine((v) => v.checkOut > v.checkIn, { path: ['checkOut'], message: 'Check-out must be after check-in' });
const resOut = (r: object) => plain(r);

industryRouter.get('/hotel/reservations', requireTenant, guard(['hotel-reservations', 'hotel-rooms']), async (req, res) => {
  res.json((await db.reservation.findMany({ where: { tenantId: tid(req) }, orderBy: { checkIn: 'desc' } })).map(resOut));
});

industryRouter.post('/hotel/reservations', requireTenant, guard('hotel-reservations', 'create'), async (req, res) => {
  const b = reservationSchema.parse(req.body);
  const room = await db.room.findFirst({ where: { tenantId: tid(req), number: b.roomNumber } });
  if (!room) throw badRequest('Room not found.');
  const clash = await db.reservation.findFirst({ where: { tenantId: tid(req), roomNumber: b.roomNumber, status: { in: ['confirmed', 'checked-in', 'pending'] }, checkIn: { lt: b.checkOut }, checkOut: { gt: b.checkIn } } });
  if (clash) throw badRequest(`Room ${b.roomNumber} is already booked for those dates (${clash.code}).`);
  const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 864e5));
  const count = await db.reservation.count({ where: { tenantId: tid(req) } });
  const r = await db.reservation.create({ data: { ...b, tenantId: tid(req), roomType: room.type, amount: num(room.rate) * nights, code: `RES-${String(count + 1).padStart(4, '0')}`, status: 'confirmed' } });
  await audit(req, 'created', 'Hotel', r.code, `${r.guest} · Room ${r.roomNumber}`);
  res.status(201).json(resOut(r));
});

industryRouter.patch('/hotel/reservations/:id', requireTenant, guard('hotel-reservations', 'edit'), async (req, res) => {
  const { status } = z.object({ status: z.enum(['confirmed', 'checked-in', 'checked-out', 'cancelled', 'pending']) }).parse(req.body);
  const r = await db.$transaction(async (tx) => {
    const existing = await tx.reservation.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
    if (!existing) throw notFound('Reservation');
    const updated = await tx.reservation.update({ where: { id: existing.id }, data: { status } });
    // Keep the room board in sync.
    const roomPatch = status === 'checked-in' ? { status: 'occupied', guest: existing.guest, checkOut: existing.checkOut } : status === 'checked-out' ? { status: 'cleaning', guest: null, checkOut: null } : null;
    if (roomPatch) await tx.room.updateMany({ where: { tenantId: tid(req), number: existing.roomNumber }, data: roomPatch });
    return updated;
  });
  await audit(req, 'edited', 'Hotel', r.code, `Status → ${status}`);
  res.json(resOut(r));
});

industryRouter.delete('/hotel/reservations/:id', requireTenant, guard('hotel-reservations', 'delete'), async (req, res) => {
  const r = await db.reservation.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!r) throw notFound('Reservation');
  if (r.status === 'checked-in') throw badRequest(`${r.guest} is checked in. Check them out first.`);
  await db.reservation.delete({ where: { id: r.id } });
  await audit(req, 'deleted', 'Hotel', r.code, `${r.guest} · Room ${r.roomNumber}`);
  res.json({ id: r.id });
});

// ════════ Salon / services appointments ════════
crud(industryRouter, {
  path: '/appointments',
  page: 'appointments',
  module: 'Appointments',
  model: db.appointment,
  create: z.object({ customer: requiredText('Customer', 60, 2), phone, service: requiredText('Service', 80), staff: requiredText('Staff', 60), start: isoDate, durationMins: int.min(5).max(720), price: money, status: z.enum(['booked', 'in-progress', 'completed', 'cancelled', 'no-show']).default('booked') }),
  orderBy: { start: 'asc' },
  label: (a) => `${a.customer} · ${a.service}`,
});

// ════════ Jewellery ════════
industryRouter.get('/jewellery/rates', requireTenant, guard('jewellery'), async (req, res) => {
  res.json((await db.metalRate.findMany({ where: { tenantId: tid(req) }, orderBy: { label: 'asc' } })).map((r) => plain(r)));
});
industryRouter.patch('/jewellery/rates/:id', requireTenant, guard('jewellery', 'edit'), async (req, res) => {
  const { ratePerGram } = z.object({ ratePerGram: positiveMoney }).parse(req.body);
  const r = await db.metalRate.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!r) throw notFound('Rate');
  const old = num(r.ratePerGram);
  const change = old ? Math.round(((ratePerGram - old) / old) * 10000) / 100 : 0;
  const updated = await db.metalRate.update({ where: { id: r.id }, data: { ratePerGram, change } });
  await audit(req, 'edited', 'Jewellery', r.label, `Rate ₹${old} → ₹${ratePerGram}/g`);
  res.json(plain(updated));
});

crud(industryRouter, {
  path: '/jewellery/items',
  page: 'jewellery',
  module: 'Jewellery',
  model: db.jewelleryItem,
  create: z
    .object({ name: requiredText('Item name', 60, 2), category: text(30).default('Ornament'), metal: z.enum(['Gold', 'Silver', 'Platinum']), purity: z.enum(['24K', '22K', '18K', '925', '950']), grossWeight: z.coerce.number().positive(), netWeight: z.coerce.number().positive(), makingPerGram: money.default(0), stoneValue: money.default(0), huid: text(10).default('—'), status: z.enum(['in-stock', 'sold', 'on-approval']).default('in-stock') })
    .refine((v) => v.netWeight <= v.grossWeight, { path: ['netWeight'], message: 'Net weight cannot exceed gross weight' }),
  label: (i) => `${i.name} (${i.sku})`,
  beforeCreate: (_req: Request, data) => ({ ...data, sku: `JW-${Date.now().toString(36).toUpperCase().slice(-6)}`, huid: (data.huid || '—').toUpperCase() }),
});

const repairSchema = z.object({ customer: requiredText('Customer', 60, 2), item: requiredText('Item', 60, 2), work: requiredText('Work', 120, 2), promised: isoDate, estimate: money.default(0), status: z.enum(['received', 'in-progress', 'ready', 'delivered']).default('received') });
crud(industryRouter, {
  path: '/jewellery/repairs',
  page: 'jewellery',
  module: 'Jewellery',
  model: db.repairJob,
  create: repairSchema,
  orderBy: { received: 'desc' },
  label: (r) => `Repair ${r.ticket}`,
  beforeCreate: async (req, data) => {
    const seq = await db.$transaction((tx) => nextSeq(tx, tid(req), 'repairSeq'));
    return { ...data, ticket: `RP-${String(seq).padStart(4, '0')}` };
  },
});

// ════════ Pharmacy ════════
crud(industryRouter, {
  path: '/pharmacy/medicines',
  page: 'pharmacy',
  module: 'Pharmacy',
  model: db.medicine,
  create: z.object({ name: requiredText('Brand name', 60, 2), generic: requiredText('Composition', 120, 2), manufacturer: requiredText('Manufacturer', 60, 2), batch: requiredText('Batch', 20, 3).transform((s) => s.toUpperCase()), expiry: isoDate, schedule: z.enum(['OTC', 'H', 'H1', 'X']), pack: requiredText('Pack', 40), stock: int.min(0), minStock: int.min(0), mrp: positiveMoney, rate: money.default(0), gstRate: z.coerce.number().min(0).max(28).default(12), rack: text(10).default('') }),
  orderBy: { expiry: 'asc' },
  label: (m) => `${m.name} (${m.batch})`,
});
