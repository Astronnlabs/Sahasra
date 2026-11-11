import type { Customer, Employee, Purchase, PurchaseItem, Sale, SaleItem, Tenant, Ticket, TicketMessage, User, Vendor } from '@prisma/client';
import { normaliseAccess } from './access.js';
import { num, plain } from './serialize.js';
import { planState } from './subscription.js';

const DAY = 864e5;

/** Business record as the platform console sees it. */
export function tenantOut(t: Tenant, users = 0) {
  const p = plain(t);
  return {
    id: p.id,
    name: p.name,
    legalName: p.legalName ?? undefined,
    type: p.type,
    /** The business's own logo (Settings → Business Profile), if uploaded. */
    logo: t.logoUploadId ? `/api/uploads/${t.logoUploadId}` : undefined,
    gstin: p.gstin ?? undefined,
    pan: p.pan ?? undefined,
    businessPhone: p.businessPhone ?? undefined,
    businessEmail: p.businessEmail ?? undefined,
    website: p.website ?? undefined,
    addressLine: p.addressLine ?? undefined,
    city: p.city,
    state: p.state ?? undefined,
    pincode: p.pincode ?? undefined,
    location: p.location ?? undefined,
    ownerName: p.ownerName,
    ownerEmail: p.ownerEmail,
    phone: p.ownerPhone,
    ownerAltPhone: p.ownerAltPhone ?? undefined,
    ownerPan: p.ownerPan ?? undefined,
    access: t.access === null ? undefined : normaliseAccess(t.access),
    notes: p.notes ?? undefined,
    plan: p.plan,
    status: p.status,
    users,
    mrr: num(t.mrr),
    createdAt: p.createdAt,
    lastActive: p.lastActiveAt,
    trialEndsAt: p.trialEndsAt ?? undefined,
    astronLabsService: t.astronLabsService || undefined,
    planValidFrom: p.planValidFrom ?? undefined,
    planValidTo: p.planValidTo ?? undefined,
    selfSignup: t.selfSignup || undefined,
    planPeriod: t.planPeriod ?? undefined,
  };
}

/** What a business's own users may see about their workspace. */
export function workspaceOut(t: Tenant) {
  return {
    tenantId: t.id,
    businessName: t.name,
    businessType: t.type,
    phone: t.businessPhone ?? t.ownerPhone,
    email: t.businessEmail ?? t.ownerEmail,
    gstin: t.gstin ?? '',
    address: [t.addressLine, t.city, t.state, t.pincode].filter(Boolean).join(', '),
    logo: t.logoUploadId ? `/api/uploads/${t.logoUploadId}` : undefined,
    status: t.status,
    plan: t.plan,
    access: t.access === null ? null : normaliseAccess(t.access),
    settings: (t.settings ?? {}) as Record<string, unknown>,
    astronLabsService: t.astronLabsService || false,
    planValidFrom: t.planValidFrom?.toISOString() ?? null,
    planValidTo: t.planValidTo?.toISOString() ?? null,
    /** When under Astron Labs services, billing is free and labelled accordingly. */
    billingLabel: t.astronLabsService ? 'Astron Labs Services (Free)' : undefined,
    /** Online plan (Build): validity and whether the software is locked until it is paid. */
    subscription: planState(t),
  };
}

export function userOut(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? '',
    role: u.role,
    branch: u.branch,
    status: u.status,
    tenantId: u.tenantId ?? undefined,
    createdAt: u.createdAt.toISOString(),
    lastActive: (u.lastLoginAt ?? u.createdAt).toISOString(),
    lastLogin: u.lastLoginAt?.toISOString(),
  };
}

export function customerOut(c: Customer) {
  const p = plain(c);
  const outstanding = num(c.outstanding);
  const last = c.lastPurchase ?? c.createdAt;
  const overdue = outstanding > 0 && !!c.dueDate && c.dueDate.getTime() < Date.now();
  return {
    ...p,
    gstin: p.gstin ?? undefined,
    dueDate: p.dueDate ?? undefined,
    totalSpend: num(c.totalSpend),
    outstanding,
    lastPurchase: last.toISOString(),
    tags: Array.isArray(c.tags) ? c.tags : [],
    status: overdue ? 'overdue' : Date.now() - last.getTime() > 75 * DAY ? 'inactive' : 'active',
  };
}

export function vendorOut(v: Vendor) {
  const p = plain(v);
  const payable = num(v.payable);
  return {
    ...p,
    dueDate: p.dueDate ?? undefined,
    totalPurchased: num(v.totalPurchased),
    payable,
    lastPurchase: (v.lastPurchase ?? v.createdAt).toISOString(),
    status: payable > 0 && v.dueDate && v.dueDate.getTime() < Date.now() ? 'overdue' : 'active',
  };
}

export function saleOut(s: Sale & { items: SaleItem[] }) {
  const p = plain(s);
  return {
    ...p,
    customerId: p.customerId ?? undefined,
    notes: p.notes ?? undefined,
    seller: p.seller ?? undefined,
    items: s.items.map((i) => ({ id: i.id, productId: i.productId ?? undefined, serviceId: i.serviceId ?? undefined, packageId: i.packageId ?? undefined, packageName: i.packageName || undefined, name: i.name, sku: i.sku, hsn: i.hsn, qty: num(i.qty), rate: num(i.rate), discount: num(i.discount), gstRate: num(i.gstRate), staff: i.staff || undefined })),
  };
}

export function purchaseOut(pu: Purchase & { items: PurchaseItem[] }) {
  const p = plain(pu);
  return {
    ...p,
    items: pu.items.map((i) => ({ id: i.id, productId: i.productId ?? undefined, name: i.name, sku: i.sku, hsn: i.hsn, qty: num(i.qty), rate: num(i.rate), discount: num(i.discount), gstRate: num(i.gstRate) })),
  };
}

export function employeeOut(e: Employee) {
  const p = plain(e);
  return { ...p, salary: num(e.salary), dob: p.dob ?? '' };
}

export function ticketOut(t: Ticket & { messages: TicketMessage[]; tenant?: { name: string } }) {
  return {
    id: t.id,
    number: `SUP-${String(1000 + t.seq)}`,
    tenantId: t.tenantId,
    tenantName: t.tenant?.name ?? '',
    requester: t.requester,
    email: t.email,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assignee: t.assignee ?? undefined,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    messages: t.messages
      .slice()
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((m) => ({ id: m.id, from: m.from, author: m.author, text: m.text, at: m.at.toISOString() })),
  };
}
