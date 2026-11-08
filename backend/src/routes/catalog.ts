import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { crud } from '../lib/crud.js';
import { badRequest, notFound } from '../lib/http.js';
import { customerOut, saleOut, purchaseOut, vendorOut } from '../lib/mappers.js';
import { num, plain, round2 } from '../lib/serialize.js';
import { addSerials, isSerialTracked } from '../lib/serials.js';
import { stockAlert } from '../lib/stockAlerts.js';
import { autoSku } from '../lib/tenants.js';
import { GSTIN_RE, int, money, optionalEmail, phone, phoneKey, positiveMoney, requiredText, text, upperOptional, isoDate } from '../lib/validate.js';
import { guard, requireTenant, tid } from '../middleware/auth.js';

export const catalogRouter = Router();

// ── Products ──
const GST_RATES = [0, 0.25, 1.5, 3, 5, 12, 18, 28, 40];
const qtyNumber = z.coerce.number().min(0, 'Cannot be negative').max(1e9);
/** Industry-specific details, e.g. { foodType: 'Veg', imeiTracking: true, composition: '…' }. */
const attributesSchema = z
  .record(z.string().trim().max(40), z.union([z.string().trim().max(300), z.number(), z.boolean(), z.null()]))
  .refine((a) => Object.keys(a).length <= 40, 'Too many details')
  .default({});
const optionSchema = z.object({ name: requiredText('Option name', 40), price: money, factor: z.coerce.number().positive().max(100000).default(1) });
/**
 * An extra sold with an item. Either typed in (Extra cheese) with its own price and cost,
 * or an existing menu item (Coke) — then it is billed as its own line and uses that item's stock.
 */
const addonSchema = z.object({ name: requiredText('Add-on name', 40), price: money, cost: money.default(0), productId: z.string().max(40).optional() });

/** Linked add-ons must be other active items of this business; their name follows the item. */
async function checkAddons(req: Request, productId: string | null, addons: z.infer<typeof addonSchema>[] | undefined) {
  if (!addons?.length) return addons;
  const ids = [...new Set(addons.map((a) => a.productId).filter((x): x is string => !!x))];
  if (productId && ids.includes(productId)) throw badRequest('An item can’t be its own add-on.');
  const linked = ids.length ? await db.product.findMany({ where: { tenantId: tid(req), id: { in: ids } }, select: { id: true, name: true, status: true } }) : [];
  const names = new Set<string>();
  return addons.map((a) => {
    const p = a.productId ? linked.find((x) => x.id === a.productId) : undefined;
    if (a.productId && (!p || p.status === 'archived')) throw badRequest(`Add-on "${a.name}" is no longer on your menu.`);
    const name = p ? p.name.slice(0, 40) : a.name;
    if (names.has(name.toLowerCase())) throw badRequest(`"${name}" is added twice as an add-on.`);
    names.add(name.toLowerCase());
    return p ? { name, price: a.price, cost: a.cost, productId: p.id } : { name, price: a.price, cost: a.cost };
  });
}

/** An uploaded photo (/api/uploads/<id>) or a built-in picture (/dishes/<key>.svg, /salon/<key>.svg). */
const imageField = z
  .string()
  .trim()
  .regex(/^(|\/api\/uploads\/[a-z0-9]{20,40}|\/(dishes|salon)\/[a-z0-9-]{2,40}\.svg)$/, 'Choose a picture from the library or upload a photo')
  .default('');

const productFields = {
  name: requiredText('Product name', 120, 2),
  /** Left blank, the server generates one (ITM-0001…). */
  sku: z.string().trim().max(40).transform((s) => s.toUpperCase()).optional(),
  barcode: z.string().trim().regex(/^[0-9A-Za-z-]{0,20}$/, 'Barcode can have up to 20 letters or digits').default(''),
  category: requiredText('Category', 60),
  brand: text(60).default(''),
  unit: text(20).default('Pcs'),
  purchasePrice: money.default(0),
  /** Must be above 0 unless the item is for in-house use only. */
  sellingPrice: money.default(0),
  mrp: money.default(0),
  tradePrice: money.default(0),
  gstRate: z.coerce.number().refine((r) => GST_RATES.includes(r), 'Invalid GST rate'),
  hsn: z.string().trim().regex(/^(\d{4,8})?$/, 'HSN should be 4–8 digits').default(''),
  stock: qtyNumber.default(0),
  minStock: qtyNumber.default(0),
  /** True for made-to-order items (dishes) that don't track stock. */
  isSelfProduct: z.boolean().default(false),
  allowDecimalQty: z.boolean().default(false),
  options: z.array(optionSchema).max(20).default([]),
  addons: z.array(addonSchema).max(30).default([]),
  attributes: attributesSchema,
  supplier: text(80).default(''),
  status: z.enum(['active', 'archived', 'draft']).default('active'),
  warehouse: text(60).default('Main Store'),
  expiryDate: isoDate.nullable().optional(),
  image: imageField,
  /** Marked out of stock by hand; POS and table orders won't sell it. */
  soldOut: z.boolean().default(false),
  /** Used inside the business (salon shampoo, wax) and never sold. */
  inHouse: z.boolean().default(false),
};
const productSchema = z.object(productFields);
type ProductInput = z.infer<typeof productSchema>;

const checkProduct = (p: Partial<ProductInput>) => {
  if (!p.inHouse && p.sellingPrice !== undefined && !(p.sellingPrice > 0)) throw new z.ZodError([{ code: 'custom', path: ['sellingPrice'], message: 'Must be greater than 0' }]);
  if (p.mrp && p.sellingPrice && p.sellingPrice > p.mrp) throw badRequest('Selling price cannot exceed MRP.');
  if (p.allowDecimalQty === false && ((p.stock ?? 0) % 1 !== 0 || (p.minStock ?? 0) % 1 !== 0)) throw badRequest('Stock must be a whole number unless the item is sold loose.');
  const names = (p.options ?? []).map((o) => o.name.toLowerCase());
  if (new Set(names).size !== names.length) throw badRequest('Each "sell as" option needs a different name.');
};

const productOut = (p: Record<string, unknown>) => {
  const o = plain(p) as Record<string, unknown>;
  return { ...o, expiryDate: o.expiryDate ?? undefined, variantGroup: o.variantGroup ?? undefined };
};

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** An uploaded photo must be an image that belongs to this business. */
async function checkImage(req: Request, image: string | undefined) {
  const id = image?.match(/^\/api\/uploads\/(\w+)$/)?.[1];
  if (!id) return;
  const up = await db.upload.findFirst({ where: { id, tenantId: tid(req) }, select: { mimeType: true } });
  if (!up || !up.mimeType.startsWith('image/')) throw badRequest('That photo was not found. Upload it again.');
}

/** A product or service can't be deleted while a package still sells it. */
async function blockIfInPackage(req: Request, refId: string, name: string) {
  const pkgs = await db.package.findMany({ where: { tenantId: tid(req) }, select: { name: true, items: true } });
  const using = pkgs.filter((p) => Array.isArray(p.items) && (p.items as { refId?: string }[]).some((i) => i.refId === refId));
  if (using.length) throw badRequest(`${name} is part of ${using.map((p) => `"${p.name}"`).join(', ')}. Remove it from ${using.length === 1 ? 'that package' : 'those packages'} first.`);
}

crud(catalogRouter, {
  path: '/products',
  page: ['products', 'pos', 'inventory', 'purchases', 'packages', 'restaurant-tables', 'restaurant-orders'],
  writePage: 'products',
  module: 'Products',
  model: db.product,
  create: productSchema,
  update: productSchema.partial(),
  out: productOut,
  orderBy: { name: 'asc' },
  label: (p) => `${p.name} (${p.sku})`,
  // Past invoices and purchases keep the item's name. Sold IMEIs stay for warranty lookups.
  beforeDelete: async (req, p) => {
    await blockIfInPackage(req, p.id, p.name);
    const services = await db.serviceItem.findMany({ where: { tenantId: tid(req) }, select: { name: true, consumables: true } });
    const using = services.filter((s) => Array.isArray(s.consumables) && (s.consumables as { productId?: string }[]).some((c) => c.productId === p.id));
    if (using.length) throw badRequest(`${p.name} is used by ${using.map((s) => `"${s.name}"`).join(', ')}. Remove it from ${using.length === 1 ? 'that service' : 'those services'} first.`);
    await db.productSerial.deleteMany({ where: { tenantId: tid(req), productId: p.id, status: { not: 'sold' } } });
  },
  beforeCreate: async (req, data: ProductInput) => {
    checkProduct(data);
    await checkImage(req, data.image);
    // IMEI / serial items start at 0 and gain stock as their numbers are added.
    const tracked = isSerialTracked(data);
    if (tracked && data.options.some((o) => o.factor !== 1)) throw badRequest('IMEI-tracked items are sold one piece at a time.');
    return {
      ...data,
      sku: data.sku || (await autoSku(tid(req))),
      stock: data.isSelfProduct || tracked ? 0 : data.stock,
      allowDecimalQty: tracked ? false : data.allowDecimalQty,
      isSelfProduct: tracked ? false : data.isSelfProduct,
      options: json(data.options),
      addons: json(await checkAddons(req, null, data.addons)),
      attributes: json(data.attributes),
    };
  },
  beforeUpdate: async (req, data: Partial<ProductInput>, existing) => {
    checkProduct({ ...plain(existing), ...data } as Partial<ProductInput>);
    if (data.image !== undefined && data.image !== existing.image) await checkImage(req, data.image);
    if (data.sku === '') delete data.sku;
    const tracked = isSerialTracked({ attributes: data.attributes ?? existing.attributes });
    if (tracked) {
      const inStock = await db.productSerial.count({ where: { tenantId: tid(req), productId: existing.id, status: 'in_stock' } });
      // Turning tracking on: stock now follows the IMEI list (the form adds the numbers right after).
      if (!isSerialTracked(existing)) data.stock = inStock;
      else if (data.stock !== undefined && data.stock !== num(existing.stock)) throw badRequest('Stock of IMEI-tracked items changes by adding or removing IMEI numbers.');
      data.allowDecimalQty = false;
      data.isSelfProduct = false;
    }
    if (data.options) data.options = json(data.options) as unknown as ProductInput['options'];
    if (data.addons) data.addons = json(await checkAddons(req, existing.id, data.addons)) as unknown as ProductInput['addons'];
    if (data.stock !== undefined && data.stock !== num(existing.stock) && !(data.isSelfProduct ?? existing.isSelfProduct)) {
      await db.stockMovement.create({
        data: { tenantId: tid(req), productId: existing.id, product: existing.name, sku: existing.sku, type: 'adjustment', qty: data.stock - num(existing.stock), reference: tracked && !isSerialTracked(existing) ? 'IMEI tracking turned on' : existing.inHouse ? (data.stock > num(existing.stock) ? 'In-house stock added' : 'In-house stock count') : 'Edited on product', warehouse: existing.warehouse, by: req.auth!.user.name },
      });
    }
    return data;
  },
  // Lowered by hand (edit, in-house count): alert if it just went low or ran out.
  afterUpdate: (req, row, existing) => stockAlert(db, tid(req), row, num(existing.stock), num(row.stock)),
});

/** Creates one product per size × colour, each with its own SKU, barcode and stock. */
catalogRouter.post('/products/variants', requireTenant, guard('products', 'create'), async (req, res) => {
  const b = productSchema
    .extend({
      sizes: z.array(text(20)).max(30).default([]),
      colours: z.array(text(30)).max(30).default([]),
    })
    .parse(req.body);
  checkProduct(b);
  await checkImage(req, b.image);
  b.addons = (await checkAddons(req, null, b.addons)) ?? [];
  const sizes = Array.from(new Set(b.sizes.filter(Boolean)));
  const colours = Array.from(new Set(b.colours.filter(Boolean)));
  if (!sizes.length && !colours.length) throw badRequest('Add at least one size or colour.');
  const combos = (sizes.length ? sizes : ['']).flatMap((size) => (colours.length ? colours : ['']).map((colour) => ({ size, colour })));
  if (combos.length > 200) throw badRequest('Too many combinations (max 200).');
  const tenantId = tid(req);
  const base = b.sku || (await autoSku(tenantId));
  const group = crypto.randomUUID();
  const code = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8);
  const { sizes: _s, colours: _c, ...fields } = b;
  void _s;
  void _c;
  const created = await db.$transaction(async (tx) => {
    const rows = [];
    for (const { size, colour } of combos) {
      const label = [size, colour].filter(Boolean).join(' / ');
      const sku = [base, code(size), code(colour)].filter(Boolean).join('-');
      if (await tx.product.findFirst({ where: { tenantId, sku }, select: { id: true } })) throw badRequest(`SKU ${sku} already exists. Choose a different base SKU.`);
      rows.push(
        await tx.product.create({
          data: {
            ...fields,
            tenantId,
            name: `${b.name} (${label})`,
            sku,
            barcode: '',
            variantGroup: group,
            options: json(fields.options),
            addons: json(fields.addons),
            attributes: json({ ...fields.attributes, ...(size ? { size } : {}), ...(colour ? { colour } : {}) }),
          },
        }),
      );
    }
    return rows;
  });
  await audit(req, 'created', 'Products', b.name, `${created.length} variants created`);
  res.status(201).json(created.map(productOut));
});

catalogRouter.post('/products/:id/duplicate', requireTenant, guard('products', 'create'), async (req, res) => {
  const p = await db.product.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!p) throw notFound('Product');
  let sku = `${p.sku}-C`;
  for (let i = 2; await db.product.findFirst({ where: { tenantId: tid(req), sku } }); i++) sku = `${p.sku}-C${i}`;
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = p;
  void _id; void _c; void _u;
  const copy = await db.product.create({
    data: { ...rest, name: `${p.name} (Copy)`, sku, stock: 0, status: 'draft', variantGroup: null, options: json(p.options), addons: json(p.addons), attributes: json(p.attributes) },
  });
  await audit(req, 'created', 'Products', copy.name, `Duplicated from ${p.sku}`);
  res.status(201).json(productOut(copy));
});

/** Quick switch from the menu, POS or kitchen: "Biryani is finished". */
catalogRouter.post('/products/:id/sold-out', requireTenant, guard(['products', 'pos', 'restaurant-orders', 'restaurant-kitchen'], 'edit'), async (req, res) => {
  const { soldOut } = z.object({ soldOut: z.boolean() }).parse(req.body);
  const p = await db.product.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!p) throw notFound('Product');
  const row = await db.product.update({ where: { id: p.id }, data: { soldOut } });
  await audit(req, 'edited', 'Products', row.name, soldOut ? 'Marked out of stock' : 'Back in stock');
  res.json(productOut(row));
});

catalogRouter.post('/products/:id/archive', requireTenant, guard('products', 'edit'), async (req, res) => {
  const p = await db.product.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!p) throw notFound('Product');
  const row = await db.product.update({ where: { id: p.id }, data: { status: 'archived' } });
  await audit(req, 'edited', 'Products', row.name, 'Archived');
  res.json(productOut(row));
});

// ── IMEI / serial numbers ──
const serialOut = (s: { id: string; serial: string; status: string; invoiceNo: string | null; customerName: string | null; soldAt: Date | null; warrantyUntil: Date | null; note: string; createdAt: Date }) => ({
  id: s.id,
  serial: s.serial,
  status: s.status,
  invoiceNo: s.invoiceNo ?? undefined,
  customerName: s.customerName ?? undefined,
  soldAt: s.soldAt?.toISOString(),
  warrantyUntil: s.warrantyUntil?.toISOString(),
  note: s.note || undefined,
  addedAt: s.createdAt.toISOString(),
});

async function trackedProduct(req: Request) {
  const p = await db.product.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!p) throw notFound('Product');
  if (!isSerialTracked(p)) throw badRequest(`${p.name} doesn't track IMEI / serial numbers. Turn it on in the product first.`);
  return p;
}

catalogRouter.get('/products/:id/serials', requireTenant, guard(['products', 'pos', 'inventory']), async (req, res) => {
  const p = await trackedProduct(req);
  const status = z.enum(['in_stock', 'sold', 'removed', 'all']).catch('all').parse(req.query.status);
  const rows = await db.productSerial.findMany({ where: { tenantId: tid(req), productId: p.id, ...(status === 'all' ? {} : { status }) }, orderBy: { createdAt: 'desc' }, take: 2000 });
  res.json(rows.map(serialOut));
});

/** Adds units by IMEI / serial number (opening stock or stock found later). Purchases add them on receipt. */
catalogRouter.post('/products/:id/serials', requireTenant, guard('products', 'edit'), async (req, res) => {
  const { serials } = z.object({ serials: z.array(text(30)).min(1, 'Enter at least one number').max(500) }).parse(req.body);
  const p = await trackedProduct(req);
  const added = await db.$transaction((tx) => addSerials(tx, tid(req), p, serials, { reference: 'IMEI / serials added', by: req.auth!.user.name }));
  await audit(req, 'edited', 'Products', p.name, `${added} IMEI / serial numbers added`);
  res.status(201).json({ added });
});

/** Removes a unit that is in stock (damaged, lost, returned to supplier). */
catalogRouter.delete('/products/:id/serials/:serialId', requireTenant, guard('products', 'edit'), async (req, res) => {
  const { reason } = z.object({ reason: text(80).default('Removed from stock') }).parse(req.body ?? {});
  const p = await trackedProduct(req);
  await db.$transaction(async (tx) => {
    const s = await tx.productSerial.findFirst({ where: { id: String(req.params.serialId), tenantId: tid(req), productId: p.id } });
    if (!s) throw notFound('IMEI / serial');
    if (s.status !== 'in_stock') throw badRequest(`${s.serial} is not in stock.`);
    await tx.productSerial.update({ where: { id: s.id }, data: { status: 'removed', note: reason || 'Removed from stock' } });
    const updated = await tx.product.update({ where: { id: p.id }, data: { stock: { decrement: 1 } } });
    await tx.stockMovement.create({ data: { tenantId: tid(req), productId: p.id, product: p.name, sku: p.sku, type: 'adjustment', qty: -1, reference: `${s.serial}: ${reason || 'Removed'}`, warehouse: p.warehouse, by: req.auth!.user.name } });
    await stockAlert(tx, tid(req), updated, num(updated.stock) + 1, num(updated.stock));
  });
  await audit(req, 'edited', 'Products', p.name, 'IMEI / serial removed from stock');
  res.json({ ok: true });
});

/** Who bought a unit and until when its warranty runs (for repairs and returns). */
catalogRouter.get('/serials/lookup', requireTenant, guard(['products', 'pos', 'job-cards', 'sales']), async (req, res) => {
  const q = z.string().trim().toUpperCase().min(4).max(30).safeParse(req.query.q);
  if (!q.success) {
    res.json(null);
    return;
  }
  const s = await db.productSerial.findUnique({ where: { tenantId_serial: { tenantId: tid(req), serial: q.data } } });
  if (!s) {
    res.json(null);
    return;
  }
  const p = await db.product.findFirst({ where: { id: s.productId, tenantId: tid(req) }, select: { id: true, name: true } });
  res.json({ ...serialOut(s), productId: p?.id, productName: p?.name ?? 'Deleted product', underWarranty: !!s.warrantyUntil && s.warrantyUntil.getTime() > Date.now() });
});

// ── Services ──
const serviceSchema = z.object({
  name: requiredText('Service name', 80, 2),
  category: requiredText('Category', 60),
  price: positiveMoney,
  /** What the price is for: service, page, plate, day, visit, hour, point, trip, person. */
  priceUnit: z.enum(['service', 'page', 'copy', 'plate', 'person', 'day', 'night', 'visit', 'hour', 'point', 'trip', 'piece']).default('service'),
  durationMins: int.min(0).max(1440).default(0),
  gstRate: z.coerce.number().refine((r) => GST_RATES.includes(r), 'Invalid GST rate'),
  sac: z.string().trim().regex(/^(\d{4,6})?$/, 'SAC should be 4–6 digits').default(''),
  commissionPct: z.coerce.number().min(0).max(100).default(0),
  staff: z.array(text(60)).max(50).default([]),
  attributes: attributesSchema,
  status: z.enum(['active', 'inactive']).default('active'),
  image: imageField,
  /** In-house products used each time the service is given, e.g. 20 ml shampoo. */
  consumables: z.array(z.object({ productId: z.string().min(1).max(40), qty: z.coerce.number().positive('Enter how much is used').max(100000) })).max(20).default([]),
});

/** Products a service uses must be this business's stock items; each listed once. */
async function checkConsumables(req: Request, list: { productId: string; qty: number }[] | undefined) {
  if (!list?.length) return list;
  const ids = list.map((c) => c.productId);
  if (new Set(ids).size !== ids.length) throw badRequest('A product is listed twice under "Products used".');
  const found = await db.product.findMany({ where: { tenantId: tid(req), id: { in: ids } }, select: { id: true, name: true, status: true, isSelfProduct: true } });
  for (const c of list) {
    const p = found.find((x) => x.id === c.productId);
    if (!p || p.status === 'archived') throw badRequest('A product under "Products used" was not found. Choose it again.');
    if (p.isSelfProduct) throw badRequest(`${p.name} doesn't track stock, so it can't be used up by a service.`);
  }
  return list.map((c) => ({ productId: c.productId, qty: Math.round(c.qty * 1000) / 1000 }));
}
crud(catalogRouter, {
  path: '/services',
  page: ['services', 'pos', 'appointments', 'packages'],
  writePage: 'services',
  module: 'Services',
  model: db.serviceItem,
  create: serviceSchema,
  orderBy: { name: 'asc' },
  label: (s) => s.name,
  beforeDelete: (req, s) => blockIfInPackage(req, s.id, s.name),
  beforeCreate: async (req, data) => {
    await checkImage(req, data.image);
    return { ...data, attributes: json(data.attributes), consumables: json(await checkConsumables(req, data.consumables)) };
  },
  beforeUpdate: async (req, data, existing) => {
    if (data.image !== undefined && data.image !== existing.image) await checkImage(req, data.image);
    const out = data.attributes ? { ...data, attributes: json(data.attributes) } : { ...data };
    if (data.consumables) out.consumables = json(await checkConsumables(req, data.consumables));
    return out;
  },
});

// ── Packages / combos ──
const packageSchema = z.object({
  name: requiredText('Package name', 80, 2),
  category: text(60).default('Packages'),
  description: text(300).default(''),
  price: positiveMoney,
  items: z
    .array(z.object({ kind: z.enum(['product', 'service']), refId: z.string().min(1).max(40), qty: z.coerce.number().positive().max(999) }))
    .min(1, 'Add at least one item to the package')
    .max(30),
  validityDays: int.min(1).max(3650).nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

/** Checks every part exists in this business and stores its current name. */
async function resolvePackageItems(req: Request, items: z.infer<typeof packageSchema>['items']) {
  const tenantId = tid(req);
  const productIds = items.filter((i) => i.kind === 'product').map((i) => i.refId);
  const serviceIds = items.filter((i) => i.kind === 'service').map((i) => i.refId);
  const [products, services] = await Promise.all([
    db.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, name: true, allowDecimalQty: true } }),
    db.serviceItem.findMany({ where: { tenantId, id: { in: serviceIds } }, select: { id: true, name: true } }),
  ]);
  return json(
    items.map((i) => {
      const product = i.kind === 'product' ? products.find((p) => p.id === i.refId) : undefined;
      const found = product ?? (i.kind === 'service' ? services.find((s) => s.id === i.refId) : undefined);
      if (!found) throw badRequest('An item in this package no longer exists. Remove it and try again.');
      if (product && i.qty % 1 !== 0 && !product.allowDecimalQty) throw badRequest(`${found.name} can only be added in whole numbers.`);
      return { kind: i.kind, refId: i.refId, name: found.name, qty: i.qty };
    }),
  );
}

crud(catalogRouter, {
  path: '/packages',
  page: ['packages', 'pos'],
  writePage: 'packages',
  module: 'Packages',
  model: db.package,
  create: packageSchema,
  orderBy: { name: 'asc' },
  label: (p) => p.name,
  beforeCreate: async (req, data) => ({ ...data, items: await resolvePackageItems(req, data.items) }),
  beforeUpdate: async (req, data) => (data.items ? { ...data, items: await resolvePackageItems(req, data.items) } : data),
});

// ── Customers ──
const customerSchema = z.object({
  name: requiredText('Name', 80, 2),
  phone,
  email: optionalEmail.transform((v) => v ?? ''),
  city: text(60).default(''),
  gstin: upperOptional(GSTIN_RE, 'GSTIN should look like 27ABCDE1234F1Z5').transform((v) => v ?? null),
  tags: z.array(text(30)).max(10).default([]),
});
crud(catalogRouter, {
  path: '/customers',
  page: ['customers', 'pos', 'sales'],
  writePage: 'customers',
  module: 'Customers',
  model: db.customer,
  create: customerSchema,
  update: customerSchema.partial(),
  out: customerOut,
  label: (c) => c.name,
  // Past invoices keep the customer's name; only the profile is removed.
  beforeDelete: (_req, c) => {
    if (num(c.outstanding) > 0.001) throw badRequest(`${c.name} still owes ₹${num(c.outstanding).toLocaleString('en-IN')}. Collect the payment before deleting.`);
  },
});

catalogRouter.get('/customers/:id/profile', requireTenant, guard('customers'), async (req, res) => {
  const customer = await db.customer.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) }, include: { notes: { orderBy: { createdAt: 'desc' } } } });
  if (!customer) throw notFound('Customer');
  const [invoices, payments] = await Promise.all([
    db.sale.findMany({ where: { tenantId: tid(req), customerId: customer.id }, include: { items: true }, orderBy: { date: 'desc' } }),
    db.payment.findMany({ where: { tenantId: tid(req), customerId: customer.id }, orderBy: { date: 'desc' } }),
  ]);
  const activity = [
    ...invoices.map((s) => ({ id: `s_${s.id}`, label: `Bought ${s.items.reduce((n, i) => n + num(i.qty), 0)} items · ${s.invoiceNo}`, at: s.date.toISOString() })),
    ...payments.filter((p) => !p.saleId).map((p) => ({ id: `p_${p.id}`, label: `Paid ₹${num(p.amount).toLocaleString('en-IN')} (${p.method})`, at: p.date.toISOString() })),
    { id: 'created', label: 'Customer created', at: customer.createdAt.toISOString() },
  ].sort((a, b) => b.at.localeCompare(a.at));
  res.json({
    customer: customerOut(customer),
    invoices: invoices.map(saleOut),
    payments: payments.map((p) => ({ id: p.id, date: p.date.toISOString(), amount: num(p.amount), method: p.method, reference: p.reference })),
    activity,
    notes: customer.notes.map((n) => ({ id: n.id, text: n.text, author: n.author, at: n.createdAt.toISOString() })),
  });
});

const paymentSchema = z.object({ amount: positiveMoney, method: z.enum(['cash', 'upi', 'card', 'bank']), date: isoDate.default(() => new Date()), reference: text(60).default('') });

catalogRouter.post('/customers/:id/payments', requireTenant, guard('customers', 'edit'), async (req, res) => {
  const b = paymentSchema.parse(req.body);
  const result = await db.$transaction(async (tx) => {
    const c = await tx.customer.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
    if (!c) throw notFound('Customer');
    const outstanding = num(c.outstanding);
    if (b.amount > outstanding + 0.001) throw badRequest(`Amount cannot exceed the outstanding ₹${outstanding.toLocaleString('en-IN')}.`);
    await tx.payment.create({ data: { tenantId: tid(req), direction: 'in', customerId: c.id, amount: b.amount, method: b.method, reference: b.reference, date: b.date, createdBy: req.auth!.user.name } });
    // Apply to the oldest unpaid invoices first.
    let left = b.amount;
    const unpaid = await tx.sale.findMany({ where: { tenantId: tid(req), customerId: c.id, status: { in: ['unpaid', 'partial', 'overdue'] } }, orderBy: { date: 'asc' } });
    for (const s of unpaid) {
      if (left <= 0) break;
      const due = num(s.total) - num(s.paid);
      const pay = Math.min(due, left);
      left = round2(left - pay);
      const paid = round2(num(s.paid) + pay);
      await tx.sale.update({ where: { id: s.id }, data: { paid, status: paid >= num(s.total) ? 'paid' : 'partial' } });
    }
    const remaining = round2(outstanding - b.amount);
    return tx.customer.update({ where: { id: c.id }, data: { outstanding: remaining, ...(remaining <= 0 ? { dueDate: null } : {}) } });
  });
  await audit(req, 'created', 'Customers', result.name, `Payment received ₹${b.amount} via ${b.method}`);
  res.json(customerOut(result));
});

catalogRouter.post('/customers/:id/notes', requireTenant, guard('customers', 'edit'), async (req, res) => {
  const b = z.object({ text: requiredText('Note', 500) }).parse(req.body);
  const c = await db.customer.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!c) throw notFound('Customer');
  const n = await db.customerNote.create({ data: { tenantId: tid(req), customerId: c.id, text: b.text, author: req.auth!.user.name } });
  res.status(201).json({ id: n.id, text: n.text, author: n.author, at: n.createdAt.toISOString() });
});

// ── Vendors ──
const vendorSchema = z.object({
  name: requiredText('Business name', 80, 2),
  contact: text(60).default(''),
  phone,
  email: optionalEmail.transform((v) => v ?? ''),
  city: text(60).default(''),
  gstin: upperOptional(GSTIN_RE, 'GSTIN should look like 27ABCDE1234F1Z5').transform((v) => v ?? ''),
  category: text(40).default('General'),
});
crud(catalogRouter, {
  path: '/vendors',
  page: ['vendors', 'purchases'],
  writePage: 'vendors',
  module: 'Vendors',
  model: db.vendor,
  create: vendorSchema,
  update: vendorSchema.partial(),
  out: vendorOut,
  label: (v) => v.name,
  // Past bills keep the vendor's name; only the profile is removed.
  beforeDelete: async (req, v) => {
    if (num(v.payable) > 0.001) throw badRequest(`You still owe ${v.name} ₹${num(v.payable).toLocaleString('en-IN')}. Settle the bill before deleting.`);
    const pending = await db.purchase.count({ where: { tenantId: tid(req), vendorId: v.id, status: 'ordered' } });
    if (pending) throw badRequest(`${v.name} has ${pending} order${pending === 1 ? '' : 's'} awaiting delivery. Receive or delete ${pending === 1 ? 'it' : 'them'} first.`);
  },
});

catalogRouter.get('/vendors/:id/profile', requireTenant, guard('vendors'), async (req, res) => {
  const vendor = await db.vendor.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
  if (!vendor) throw notFound('Vendor');
  const [bills, payments] = await Promise.all([
    db.purchase.findMany({ where: { tenantId: tid(req), vendorId: vendor.id }, include: { items: true }, orderBy: { date: 'desc' } }),
    db.payment.findMany({ where: { tenantId: tid(req), vendorId: vendor.id }, orderBy: { date: 'desc' } }),
  ]);
  res.json({
    vendor: vendorOut(vendor),
    bills: bills.map(purchaseOut),
    payments: payments.map((p) => ({ id: p.id, date: p.date.toISOString(), amount: num(p.amount), method: p.method, reference: p.reference })),
    productNames: Array.from(new Set(bills.flatMap((b) => b.items.map((i) => i.name)))),
    documents: [],
  });
});

catalogRouter.post('/vendors/:id/payments', requireTenant, guard('vendors', 'edit'), async (req, res) => {
  const b = paymentSchema.parse(req.body);
  const result = await db.$transaction(async (tx) => {
    const v = await tx.vendor.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } });
    if (!v) throw notFound('Vendor');
    const payable = num(v.payable);
    if (b.amount > payable + 0.001) throw badRequest(`Amount cannot exceed the payable ₹${payable.toLocaleString('en-IN')}.`);
    await tx.payment.create({ data: { tenantId: tid(req), direction: 'out', vendorId: v.id, amount: b.amount, method: b.method, reference: b.reference, date: b.date, createdBy: req.auth!.user.name } });
    let left = b.amount;
    const unpaid = await tx.purchase.findMany({ where: { tenantId: tid(req), vendorId: v.id, paymentStatus: { in: ['unpaid', 'partial'] } }, orderBy: { date: 'asc' } });
    for (const p of unpaid) {
      if (left <= 0) break;
      const due = num(p.total) - num(p.paid);
      const pay = Math.min(due, left);
      left = round2(left - pay);
      const paid = round2(num(p.paid) + pay);
      await tx.purchase.update({ where: { id: p.id }, data: { paid, paymentStatus: paid >= num(p.total) ? 'paid' : 'partial' } });
    }
    const remaining = round2(payable - b.amount);
    return tx.vendor.update({ where: { id: v.id }, data: { payable: remaining, ...(remaining <= 0 ? { dueDate: null } : {}) } });
  });
  await audit(req, 'created', 'Vendors', result.name, `Payment made ₹${b.amount} via ${b.method}`);
  res.json(vendorOut(result));
});

// ── Data import (Settings → Your data): rows already mapped to our fields by the app ──
type ImportTarget = 'products' | 'customers' | 'vendors';
type RowResult = { row: number; action: 'create' | 'update' | 'skip' | 'error'; message?: string; field?: string };

const importBody = z.object({
  rows: z.array(z.record(z.string().max(40), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))).min(1, 'The file has no rows to import.').max(5000, 'Import up to 5,000 rows at a time.'),
  /** What to do when a row matches an existing record: leave it, or update it with the file's values. */
  existing: z.enum(['skip', 'update']).default('skip'),
  dryRun: z.boolean().default(false),
});

/** Blank cells mean "not given" so the usual defaults apply. */
const clean = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== ''));
const issue = (e: unknown): Pick<RowResult, 'message' | 'field'> => {
  if (e instanceof z.ZodError) return { field: String(e.issues[0]?.path[0] ?? ''), message: e.issues[0]?.message ?? 'Invalid value' };
  return { message: e instanceof Error ? e.message : 'Could not import this row' };
};

const IMPORTERS: Record<ImportTarget, { page: PageIdLike; module: string }> = {
  products: { page: 'products', module: 'Products' },
  customers: { page: 'customers', module: 'Customers' },
  vendors: { page: 'vendors', module: 'Vendors' },
};
type PageIdLike = 'products' | 'customers' | 'vendors';

for (const [target, meta] of Object.entries(IMPORTERS) as [ImportTarget, (typeof IMPORTERS)[ImportTarget]][]) {
  catalogRouter.post(`/import/${target}`, requireTenant, guard(meta.page, 'create'), async (req, res) => {
    const b = importBody.parse(req.body);
    const tenantId = tid(req);
    const results: RowResult[] = [];
    const seen = new Set<string>();

    if (target === 'products') {
      const existing = await db.product.findMany({ where: { tenantId }, select: { id: true, sku: true, name: true, stock: true, isSelfProduct: true, warehouse: true, attributes: true, inHouse: true } });
      const bySku = new Map(existing.map((p) => [p.sku.toUpperCase(), p]));
      const byName = new Map(existing.map((p) => [`${p.inHouse ? 'h' : 'r'}:${p.name.trim().toLowerCase()}`, p]));
      for (const [i, raw] of b.rows.entries()) {
        const row = i + 1;
        try {
          const r = clean(raw);
          const kind = r.inHouse === true ? 'h' : 'r';
          // Retail and in-house items are matched only with their own kind.
          const skuMatch = r.sku ? bySku.get(String(r.sku).trim().toUpperCase()) : undefined;
          if (skuMatch && (skuMatch.inHouse ? 'h' : 'r') !== kind) throw new Error(`Code ${String(r.sku)} is already used by ${skuMatch.inHouse ? 'an in-house' : 'a for-sale'} item (${skuMatch.name}).`);
          const match = skuMatch ?? byName.get(`${kind}:${String(r.name ?? '').trim().toLowerCase()}`);
          const key = `${kind}:${String(r.sku || r.name || '').trim().toLowerCase()}`;
          if (key && seen.has(key)) throw new Error('Same item appears twice in the file.');
          if (key) seen.add(key);
          if (match && b.existing === 'skip') {
            results.push({ row, action: 'skip', message: 'Already in your items' });
            continue;
          }
          if (match) {
            const data = productSchema.partial().parse(r);
            checkProduct({ ...data });
            if (isSerialTracked(match) && data.stock !== undefined) delete data.stock;
            if (!b.dryRun) {
              const updated = await db.product.update({ where: { id: match.id }, data: { ...data, ...(data.sku === '' ? { sku: undefined } : {}), options: data.options ? json(data.options) : undefined, addons: undefined, attributes: data.attributes ? json(data.attributes) : undefined } });
              if (data.stock !== undefined && data.stock !== num(match.stock) && !updated.isSelfProduct) {
                await db.stockMovement.create({ data: { tenantId, productId: match.id, product: updated.name, sku: updated.sku, type: 'adjustment', qty: data.stock - num(match.stock), reference: 'Data import', warehouse: updated.warehouse, by: req.auth!.user.name } });
                await stockAlert(db, tenantId, updated, num(match.stock), num(updated.stock));
              }
            }
            results.push({ row, action: 'update' });
            continue;
          }
          const data = productSchema.parse({ category: 'General', gstRate: 0, ...r });
          checkProduct(data);
          if (data.sku && bySku.has(data.sku)) throw new Error(`SKU ${data.sku} is already used by another item.`);
          if (!b.dryRun) {
            const created = await db.product.create({
              data: { ...data, tenantId, sku: data.sku || (await autoSku(tenantId)), stock: data.isSelfProduct ? 0 : data.stock, options: json(data.options), addons: json([]), attributes: json(data.attributes) },
            });
            bySku.set(created.sku.toUpperCase(), { ...created });
            byName.set(`${kind}:${created.name.trim().toLowerCase()}`, { ...created });
          }
          results.push({ row, action: 'create' });
        } catch (e) {
          results.push({ row, action: 'error', ...issue(e) });
        }
      }
    } else {
      const model = target === 'customers' ? db.customer : db.vendor;
      const schema = target === 'customers' ? customerSchema : vendorSchema;
      const rows = await (model as typeof db.customer).findMany({ where: { tenantId }, select: { id: true, phone: true, name: true } });
      const byPhone = new Map(rows.map((c) => [phoneKey(c.phone) ?? c.phone, c]));
      for (const [i, raw] of b.rows.entries()) {
        const row = i + 1;
        try {
          const r = clean(raw);
          if (target === 'customers' && typeof r.tags === 'string') r.tags = r.tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 10);
          const key = phoneKey(String(r.phone ?? ''));
          if (key && seen.has(key)) throw new Error('Same mobile number appears twice in the file.');
          if (key) seen.add(key);
          const match = key ? byPhone.get(key) : undefined;
          if (match && b.existing === 'skip') {
            results.push({ row, action: 'skip', message: `Already saved as ${match.name}` });
            continue;
          }
          const data = (match ? schema.partial() : schema).parse(r);
          if (!b.dryRun) {
            if (match) await (model as typeof db.customer).update({ where: { id: match.id }, data: data as Prisma.CustomerUpdateInput });
            else {
              const created = await (model as typeof db.customer).create({ data: { ...(data as Prisma.CustomerCreateWithoutTenantInput), tenantId } as Prisma.CustomerUncheckedCreateInput });
              if (key) byPhone.set(key, created);
            }
          }
          results.push({ row, action: match ? 'update' : 'create' });
        } catch (e) {
          results.push({ row, action: 'error', ...issue(e) });
        }
      }
    }

    const count = (a: RowResult['action']) => results.filter((r) => r.action === a).length;
    const summary = { created: count('create'), updated: count('update'), skipped: count('skip'), failed: count('error') };
    if (!b.dryRun && summary.created + summary.updated > 0) {
      await audit(req, 'created', meta.module, 'Data import', `Imported ${summary.created} new, updated ${summary.updated}, skipped ${summary.skipped}, ${summary.failed} with errors`);
    }
    res.json({ ...summary, dryRun: b.dryRun, rows: results.filter((r) => r.action !== 'create' && r.action !== 'update').slice(0, 500) });
  });
}

