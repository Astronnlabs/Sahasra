import type { Package, Product, ServiceItem } from '@prisma/client';
import { z } from 'zod';
import type { Tx } from '../db.js';
import { badRequest, forbidden } from './http.js';
import { cleanSerials, isSerialTracked } from './serials.js';
import { num, round2 } from './serialize.js';
import { money, requiredText, text } from './validate.js';

/** One line as sent by POS. Prices and tax always come from the catalogue on the server. */
export const billLineSchema = z.object({
  productId: z.string().max(40).optional(),
  serviceId: z.string().max(40).optional(),
  packageId: z.string().max(40).optional(),
  /** "Sell as" option name (Half, Full, Box of 10…). */
  option: text(40).optional(),
  addons: z.array(text(40)).max(20).default([]),
  /** IMEI / serial numbers being sold (one per unit) for tracked items. */
  serials: z.array(text(30)).max(500).default([]),
  name: requiredText('Item name', 120),
  qty: z.coerce.number().positive('Quantity must be more than 0').max(100000),
  discount: money.default(0),
  // Only used for free-text lines billed by owners/admins.
  rate: money.optional(),
  gstRate: z.coerce.number().min(0).max(40).optional(),
  hsn: text(10).optional(),
  /** Employee who gave this service (salons). */
  staffId: z.string().max(40).optional(),
  /** For packages: employee per service inside it, by service id. */
  staffFor: z.record(z.string().max(40), z.string().max(40)).optional(),
});
export type BillLine = z.infer<typeof billLineSchema>;

export interface PricedLine {
  productId: string | null;
  serviceId: string | null;
  packageId: string | null;
  packageName: string;
  name: string;
  sku: string;
  hsn: string;
  qty: number;
  /** Base units leaving stock (0 when the product doesn't track stock). */
  stockQty: number;
  rate: number;
  discount: number;
  gstRate: number;
  /** Cost per unit sold. */
  cost: number;
  /** IMEI / serial numbers sold on this line. */
  serials: string[];
  /** Employee who gave the service. */
  staffId: string | null;
  staff: string;
}

/** In-house products used up by the services on a bill. */
export interface Consumption {
  product: Product;
  qty: number;
  /** Services that used it, for the stock history note. */
  services: string[];
}

interface Consumable { productId: string; qty: number }

interface SellOption { name: string; price: number; factor?: number }
/** Typed-in extra (price + cost added to the item), or a menu item billed as its own line. */
interface Addon { name: string; price: number; cost?: number; productId?: string }
interface PackagePart { kind: 'product' | 'service'; refId: string; name: string; qty: number }

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, ''));

/** Splits `total` across `weights` in paise so the parts add up exactly. */
function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((s, w) => s + w, 0);
  const shares = weights.map((w) => (sum > 0 ? round2((total * w) / sum) : round2(total / weights.length)));
  const diff = round2(total - shares.reduce((s, x) => s + x, 0));
  shares[shares.length - 1] = round2(shares[shares.length - 1] + diff);
  return shares;
}

/**
 * Turns POS lines into invoice lines: catalogue prices, option and add-on prices,
 * trade price, and packages expanded into their parts (price split by each part's value).
 */
export async function priceLines(tx: Tx, tenantId: string, lines: BillLine[], opts: { canFreeText: boolean; priceList: 'retail' | 'trade' }) {
  const packageIds = lines.map((l) => l.packageId).filter((x): x is string => !!x);
  const packages: Package[] = packageIds.length ? await tx.package.findMany({ where: { tenantId, id: { in: packageIds } } }) : [];
  const parts = packages.flatMap((p) => asArray<PackagePart>(p.items));
  const productIds = [...lines.map((l) => l.productId), ...parts.filter((x) => x.kind === 'product').map((x) => x.refId)].filter((x): x is string => !!x);
  const serviceIds = [...lines.map((l) => l.serviceId), ...parts.filter((x) => x.kind === 'service').map((x) => x.refId)].filter((x): x is string => !!x);
  const [products, services] = await Promise.all([
    productIds.length ? tx.product.findMany({ where: { tenantId, id: { in: productIds } } }) : Promise.resolve([] as Product[]),
    serviceIds.length ? tx.serviceItem.findMany({ where: { tenantId, id: { in: serviceIds } } }) : Promise.resolve([] as ServiceItem[]),
  ]);
  // Add-ons that are menu items (e.g. Coke with a biryani) are sold as their own lines.
  const linkedIds = lines.flatMap((l) => {
    const p = l.productId ? products.find((x) => x.id === l.productId) : undefined;
    return p ? asArray<Addon>(p.addons).filter((a) => a.productId && l.addons.includes(a.name)).map((a) => a.productId!) : [];
  });
  const missing = [...new Set(linkedIds)].filter((id) => !products.some((p) => p.id === id));
  if (missing.length) products.push(...(await tx.product.findMany({ where: { tenantId, id: { in: missing } } })));
  // Staff named on service lines must be this business's active employees.
  const staffIds = [...new Set(lines.flatMap((l) => [l.staffId, ...Object.values(l.staffFor ?? {})]).filter((x): x is string => !!x))];
  const employees = staffIds.length ? await tx.employee.findMany({ where: { tenantId, id: { in: staffIds } }, select: { id: true, name: true, status: true } }) : [];
  const staffOf = (id: string | undefined) => {
    if (!id) return { staffId: null, staff: '' };
    const e = employees.find((x) => x.id === id);
    if (!e || e.status === 'inactive') throw badRequest('The staff member chosen for a service is no longer an active employee. Choose again.');
    return { staffId: e.id, staff: e.name };
  };
  const productOf = (id: string, label: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) throw badRequest(`${label} is no longer in your catalogue.`);
    if (p.status === 'archived') throw badRequest(`${p.name} is archived and cannot be sold.`);
    if (p.inHouse) throw badRequest(`${p.name} is for in-house use and can't be sold.`);
    if (p.soldOut) throw badRequest(`${p.name} is marked out of stock. Turn it back on in the menu to sell it.`);
    return p;
  };
  const serviceOf = (id: string, label: string) => {
    const s = services.find((x) => x.id === id);
    if (!s || s.status !== 'active') throw badRequest(`${label} is not an active service.`);
    return s;
  };
  const checkQty = (p: Product, qty: number) => {
    if (!p.allowDecimalQty && !Number.isInteger(qty)) throw badRequest(`${p.name} can only be sold in whole numbers.`);
  };

  // Products the services use, and what they cost per service given.
  const usedIds = [...new Set(services.flatMap((s) => asArray<Consumable>(s.consumables).map((c) => c.productId)))];
  const usedProducts = usedIds.length ? await tx.product.findMany({ where: { tenantId, id: { in: usedIds } } }) : [];
  const useCost = (s: ServiceItem) =>
    round2(asArray<Consumable>(s.consumables).reduce((sum, c) => sum + Number(c.qty) * num(usedProducts.find((p) => p.id === c.productId)?.purchasePrice ?? 0), 0));

  const out: PricedLine[] = [];
  /** Times each service is given on this bill (package parts included). */
  const given: { service: ServiceItem; times: number }[] = [];
  for (const l of lines) {
    if (l.packageId) {
      const pkg = packages.find((x) => x.id === l.packageId);
      if (!pkg || pkg.status !== 'active') throw badRequest(`${l.name} is not an active package.`);
      if (!Number.isInteger(l.qty)) throw badRequest(`${pkg.name} can only be sold in whole numbers.`);
      const comps = asArray<PackagePart>(pkg.items).map((c) => {
        if (c.kind === 'product') {
          const p = productOf(c.refId, c.name);
          if (isSerialTracked(p)) throw badRequest(`Sell ${p.name} on its own line so its IMEI / serial number can be recorded.`);
          return { c, product: p, service: null, value: num(p.sellingPrice) * c.qty, gstRate: num(p.gstRate) };
        }
        const s = serviceOf(c.refId, c.name);
        return { c, product: null, service: s, value: num(s.price) * c.qty, gstRate: num(s.gstRate) };
      });
      if (!comps.length) throw badRequest(`${pkg.name} has no items.`);
      // Each part gets a share of the package price in proportion to its own value.
      const rates = allocate(num(pkg.price), comps.map((x) => x.value));
      const discounts = allocate(l.discount, rates);
      comps.forEach((x, i) => {
        const tracked = x.product && !x.product.isSelfProduct;
        if (x.service) given.push({ service: x.service, times: x.c.qty * l.qty });
        out.push({
          ...(x.service ? staffOf(l.staffFor?.[x.service.id]) : { staffId: null, staff: '' }),
          productId: x.product?.id ?? null,
          serviceId: x.service?.id ?? null,
          packageId: pkg.id,
          packageName: pkg.name,
          name: x.c.qty !== 1 ? `${x.product?.name ?? x.service!.name} × ${qtyText(x.c.qty)}` : (x.product?.name ?? x.service!.name),
          sku: x.product?.sku ?? x.service!.sac,
          hsn: x.product?.hsn ?? x.service!.sac,
          qty: l.qty,
          stockQty: tracked ? x.c.qty * l.qty : 0,
          rate: rates[i],
          discount: discounts[i],
          gstRate: x.gstRate,
          cost: x.product ? round2(num(x.product.purchasePrice) * x.c.qty) : round2(useCost(x.service!) * x.c.qty),
          serials: [],
        });
      });
      continue;
    }

    if (l.serviceId) {
      const s = serviceOf(l.serviceId, l.name);
      given.push({ service: s, times: l.qty });
      out.push({ productId: null, serviceId: s.id, packageId: null, packageName: '', name: s.name, sku: s.sac, hsn: s.sac, qty: l.qty, stockQty: 0, rate: num(s.price), discount: l.discount, gstRate: num(s.gstRate), cost: useCost(s), serials: [], ...staffOf(l.staffId) });
      continue;
    }

    if (l.productId) {
      const p = productOf(l.productId, l.name);
      checkQty(p, l.qty);
      // Each IMEI / serial-tracked unit must be identified on the bill.
      const serials = isSerialTracked(p) ? cleanSerials(l.serials) : [];
      if (isSerialTracked(p) && serials.length !== l.qty) throw badRequest(`Scan or pick ${l.qty} IMEI / serial number${l.qty === 1 ? '' : 's'} for ${p.name}.`);
      const option = l.option ? asArray<SellOption>(p.options).find((o) => o.name === l.option) : undefined;
      if (l.option && !option) throw badRequest(`"${l.option}" is not available for ${p.name}.`);
      const list = asArray<Addon>(p.addons);
      const addons = l.addons.map((name) => {
        // Two add-ons may share a name (Campa ₹10 / Campa ₹20): POS then sends "Campa ₹10".
        const priced = /^(.*\S)\s+₹\s?([\d,]+(?:\.\d+)?)$/.exec(name);
        const a =
          list.find((x) => x.name === name) ??
          (priced ? list.find((x) => x.name.trim().toLowerCase() === priced[1].trim().toLowerCase() && Math.abs(Number(x.price) - Number(priced[2].replace(/,/g, ''))) < 0.005) : undefined);
        if (!a) throw badRequest(`Add-on "${name}" is not available for ${p.name}.`);
        return a;
      });
      const factor = option?.factor && option.factor > 0 ? option.factor : 1;
      const base = option ? Number(option.price) : opts.priceList === 'trade' && num(p.tradePrice) > 0 ? num(p.tradePrice) : num(p.sellingPrice);
      // Every add-on is its own line on the bill ("+ Extra Aloo  ₹10"). Typed-in extras use the
      // item's GST; menu-item extras use that item's stock, GST and cost.
      const typed = addons.filter((a) => !a.productId);
      const linked = addons.filter((a) => a.productId);
      const rate = round2(base);
      const name = `${p.name}${option ? ` (${option.name})` : ''}`;
      // The line discount (from POS) is shared across the item and its extras by value.
      const discounts = allocate(l.discount, [rate, ...typed.map((a) => Number(a.price)), ...linked.map((a) => Number(a.price))].map((v) => v * l.qty));
      out.push({
        productId: p.id,
        serviceId: null,
        packageId: null,
        packageName: '',
        name: name.slice(0, 200),
        sku: p.sku,
        hsn: p.hsn,
        qty: l.qty,
        stockQty: p.isSelfProduct ? 0 : round2(l.qty * factor * 1000) / 1000,
        rate,
        discount: discounts[0],
        gstRate: num(p.gstRate),
        cost: round2(num(p.purchasePrice) * factor),
        serials,
        staffId: null,
        staff: '',
      });
      typed.forEach((a, i) => {
        out.push({
          productId: null,
          serviceId: null,
          packageId: null,
          packageName: '',
          name: `+ ${a.name}`.slice(0, 200),
          sku: '',
          hsn: p.hsn,
          qty: l.qty,
          stockQty: 0,
          rate: round2(Number(a.price)),
          discount: discounts[i + 1],
          gstRate: num(p.gstRate),
          cost: round2(Number(a.cost ?? 0)),
          serials: [],
          staffId: null,
          staff: '',
        });
      });
      linked.forEach((a, i) => {
        const x = productOf(a.productId!, a.name);
        if (isSerialTracked(x)) throw badRequest(`${x.name} must be sold on its own line so its IMEI / serial number can be recorded.`);
        out.push({
          productId: x.id,
          serviceId: null,
          packageId: null,
          packageName: '',
          name: `+ ${x.name}`.slice(0, 200),
          sku: x.sku,
          hsn: x.hsn,
          qty: l.qty,
          stockQty: x.isSelfProduct ? 0 : l.qty,
          rate: round2(Number(a.price)),
          discount: discounts[i + 1 + typed.length],
          gstRate: num(x.gstRate),
          cost: round2(Number(a.cost) || num(x.purchasePrice)),
          serials: [],
          staffId: null,
          staff: '',
        });
      });
      continue;
    }

    // Free-text line (not in the catalogue): owners/admins only.
    if (!opts.canFreeText) throw forbidden('Only items from your catalogue can be billed.');
    if (l.rate === undefined) throw badRequest(`Enter a price for ${l.name}.`);
    out.push({ productId: null, serviceId: null, packageId: null, packageName: '', name: l.name, sku: '', hsn: l.hsn ?? '', qty: l.qty, stockQty: 0, rate: l.rate, discount: l.discount, gstRate: l.gstRate ?? 0, cost: 0, serials: [], staffId: null, staff: '' });
  }

  for (const i of out) if (i.discount > i.qty * i.rate + 0.001) throw badRequest(`Discount on ${i.name} is larger than its price.`);

  // Total base units leaving stock, per product.
  const stock = new Map<string, { product: Product; qty: number }>();
  for (const i of out) {
    if (!i.productId || i.stockQty <= 0) continue;
    const p = products.find((x) => x.id === i.productId)!;
    const cur = stock.get(p.id) ?? { product: p, qty: 0 };
    cur.qty = round2(cur.qty * 1000 + i.stockQty * 1000) / 1000;
    stock.set(p.id, cur);
  }
  // The same IMEI can't be sold twice on one bill.
  const all = out.flatMap((i) => i.serials);
  if (new Set(all).size !== all.length) throw badRequest('The same IMEI / serial number is on the bill twice.');

  // In-house products the services use up (e.g. 20 ml shampoo per hair wash).
  const consume = new Map<string, Consumption>();
  for (const g of given) {
    for (const c of asArray<Consumable>(g.service.consumables)) {
      const p = usedProducts.find((x) => x.id === c.productId);
      if (!p || p.status === 'archived' || p.isSelfProduct) continue;
      const cur = consume.get(p.id) ?? { product: p, qty: 0, services: [] };
      cur.qty = Math.round((cur.qty + Number(c.qty) * g.times) * 1000) / 1000;
      if (!cur.services.includes(g.service.name)) cur.services.push(g.service.name);
      consume.set(p.id, cur);
    }
  }
  return { items: out, stock, products, consume };
}
