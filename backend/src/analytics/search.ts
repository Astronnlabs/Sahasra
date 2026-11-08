import type { Prisma } from '@prisma/client';
import { db } from '../db.js';
import type { PageId } from '../lib/access.js';
import { num } from '../lib/serialize.js';

interface SearchResult {
  id: string;
  type: 'customer' | 'invoice' | 'product' | 'vendor' | 'employee' | 'service' | 'order';
  title: string;
  subtitle: string;
  meta?: string;
  href: string;
}

const inr = (n: Prisma.Decimal | number) => `₹${Math.round(num(n)).toLocaleString('en-IN')}`;

/** Global search across the business's records. `canSee` filters by the caller's page access. */
export async function search(tenantId: string, raw: string, canSee: (page: PageId) => boolean): Promise<SearchResult[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const has = { contains: q, mode: 'insensitive' as const };
  const results: SearchResult[] = [];
  const invoice = (s: { id: string; invoiceNo: string; customerName: string; total: Prisma.Decimal; status: string }) =>
    results.push({ id: s.id, type: 'invoice', title: `Invoice ${s.invoiceNo}`, subtitle: `${s.customerName} · ${inr(s.total)}`, meta: s.status, href: `/sales?invoice=${encodeURIComponent(s.invoiceNo)}` });

  if (canSee('customers')) {
    const customers = await db.customer.findMany({ where: { tenantId, OR: [{ name: has }, { phone: has }, { email: has }] }, take: 4 });
    for (const c of customers) {
      results.push({
        id: c.id,
        type: 'customer',
        title: c.name,
        subtitle: [num(c.outstanding) ? `${inr(c.outstanding)} outstanding` : 'No dues', `${c.orders} previous purchases`].join(' · '),
        meta: c.phone,
        href: `/customers/${c.id}`,
      });
      if (canSee('sales')) (await db.sale.findMany({ where: { tenantId, customerId: c.id }, orderBy: { date: 'desc' }, take: 2 })).forEach(invoice);
    }
  }
  if (canSee('sales')) (await db.sale.findMany({ where: { tenantId, invoiceNo: has }, orderBy: { date: 'desc' }, take: 4 })).forEach(invoice);
  if (canSee('products')) {
    (await db.product.findMany({ where: { tenantId, status: { not: 'archived' }, OR: [{ name: has }, { sku: has }, { barcode: has }, { brand: has }] }, take: 5 })).forEach((p) =>
      results.push({ id: p.id, type: 'product', title: p.name, subtitle: `${p.sku} · ${inr(p.sellingPrice)} · ${p.stock} in stock`, href: `/products?q=${encodeURIComponent(p.sku)}` }),
    );
  }
  if (canSee('vendors')) {
    (await db.vendor.findMany({ where: { tenantId, OR: [{ name: has }, { gstin: has }, { contact: has }, { phone: has }] }, take: 3 })).forEach((v) =>
      results.push({ id: v.id, type: 'vendor', title: v.name, subtitle: [v.gstin, num(v.payable) ? `${inr(v.payable)} payable` : 'No payables'].filter(Boolean).join(' · '), href: `/vendors/${v.id}` }),
    );
  }
  if (canSee('employees')) {
    (await db.employee.findMany({ where: { tenantId, OR: [{ name: has }, { code: has }, { designation: has }] }, take: 3 })).forEach((e) =>
      results.push({ id: e.id, type: 'employee', title: e.name, subtitle: `${e.designation} · ${e.code}`, href: `/employees/${e.id}` }),
    );
  }
  if (canSee('services')) {
    (await db.serviceItem.findMany({ where: { tenantId, OR: [{ name: has }, { category: has }] }, take: 3 })).forEach((s) =>
      results.push({ id: s.id, type: 'service', title: s.name, subtitle: `${s.category} · ${inr(s.price)} · ${s.durationMins} min`, href: '/services' }),
    );
  }
  if (canSee('restaurant-orders')) {
    (await db.restaurantOrder.findMany({ where: { tenantId, OR: [{ number: has }, { customer: has }] }, take: 3 })).forEach((o) =>
      results.push({ id: o.id, type: 'order', title: o.number, subtitle: `${o.type} · ${Array.isArray(o.lines) ? o.lines.length : 0} items`, href: '/restaurant/orders' }),
    );
  }

  const seen = new Set<string>();
  return results.filter((r) => (seen.has(r.type + r.id) ? false : (seen.add(r.type + r.id), true)));
}
