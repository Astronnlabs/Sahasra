import type { Tx } from '../db.js';
import { db } from '../db.js';
import { notify } from './audit.js';
import { num } from './serialize.js';

interface Item {
  id: string;
  name: string;
  unit: string;
  minStock: Parameters<typeof num>[0];
  isSelfProduct: boolean;
  inHouse?: boolean;
  status?: string;
}

const linkOf = (p: Item) => `/products?${p.inHouse ? 'tab=in-house&' : ''}q=${encodeURIComponent(p.name)}`;
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** Whether this business wants stock alerts (Settings → Notifications). */
async function wanted(tx: Tx | typeof db, tenantId: string) {
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return ((t?.settings ?? {}) as Record<string, unknown>).notifyLowStock !== false;
}

/** One alert per item and kind a day, so a busy counter isn't flooded. */
async function alertedRecently(tx: Tx | typeof db, tenantId: string, kind: string, href: string) {
  return !!(await tx.notification.findFirst({ where: { tenantId, kind, href, createdAt: { gte: new Date(Date.now() - 864e5) } }, select: { id: true } }));
}

/** Sends the low / out alert for an item's current stock; false when nothing was due or it was sent today. */
async function send(tx: Tx | typeof db, tenantId: string, p: Item, stock: number) {
  const min = num(p.minStock);
  const href = linkOf(p);
  const what = p.inHouse ? `${p.name} (in-house)` : p.name;
  if (stock <= 0) {
    if (await alertedRecently(tx, tenantId, 'out-of-stock', href)) return false;
    await notify(tenantId, 'out-of-stock', p.inHouse ? 'Finished' : 'Out of stock', p.inHouse ? `${what} has run out. Services that use it will push it below zero until you add stock.` : `${what} is out of stock (${fmt(stock)} ${p.unit}). Reorder to keep selling it.`, href, tx as Tx);
    return true;
  }
  if (stock <= min) {
    if (await alertedRecently(tx, tenantId, 'low-stock', href)) return false;
    await notify(tenantId, 'low-stock', p.inHouse ? 'Running low' : 'Low stock', `${what} is down to ${fmt(stock)} ${p.unit} (alert at ${fmt(min)}).`, href, tx as Tx);
    return true;
  }
  return false;
}

/**
 * Call after any stock change. Alerts when the item just dropped to its minimum (low stock) or to zero
 * (out of stock / finished). Items that don't track stock (dishes) never alert.
 */
export async function stockAlert(tx: Tx | typeof db, tenantId: string, p: Item, before: number, after: number) {
  if (p.isSelfProduct || p.status === 'archived' || after >= before) return;
  const min = num(p.minStock);
  const crossedOut = before > 0 && after <= 0;
  const crossedLow = before > min && after <= min;
  if (!crossedOut && !crossedLow) return;
  if (!(await wanted(tx, tenantId))) return;
  await send(tx, tenantId, p, after);
}

/**
 * Daily reminder for items that are still low or out (and for stock that was already low before alerts
 * existed). Runs at start-up and every few hours; each item alerts at most once a day.
 */
export async function sweepStockAlerts() {
  const tenants = await db.tenant.findMany({ where: { status: { in: ['active', 'trial'] } }, select: { id: true, settings: true } });
  let sent = 0;
  for (const t of tenants) {
    if (((t.settings ?? {}) as Record<string, unknown>).notifyLowStock === false) continue;
    const items = await db.product.findMany({ where: { tenantId: t.id, status: 'active', isSelfProduct: false }, select: { id: true, name: true, unit: true, stock: true, minStock: true, isSelfProduct: true, inHouse: true, status: true } });
    for (const p of items) {
      const stock = num(p.stock);
      if (stock > num(p.minStock) && stock > 0) continue;
      if (await send(db, t.id, p, stock)) sent++;
    }
  }
  return sent;
}
