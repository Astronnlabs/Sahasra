import { Prisma } from '@prisma/client';
import { db, type Tx } from '../db.js';
import { DEFAULT_METAL_RATES, normaliseAccess, PLAN_PRICE, SYSTEM_ROLES } from './access.js';
import { hashPassword } from './auth.js';
import { conflict } from './http.js';
import { phoneKey } from './validate.js';

export interface TenantInput {
  name: string;
  legalName?: string;
  type: string;
  gstin?: string;
  pan?: string;
  businessPhone?: string;
  businessEmail?: string;
  website?: string;
  addressLine?: string;
  city: string;
  state?: string;
  pincode?: string;
  location?: Record<string, unknown>;
  ownerName: string;
  ownerEmail: string;
  phone: string;
  ownerAltPhone?: string;
  ownerPan?: string;
  notes?: string;
}

/** Fails early with a friendly message if a login identifier is already taken. */
export async function assertLoginFree(email: string, phone?: string | null, exceptUserId?: string) {
  const byEmail = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (byEmail && byEmail.id !== exceptUserId) throw conflict(`${email} is already used by another account.`);
  const key = phoneKey(phone);
  if (key) {
    const byPhone = await db.user.findUnique({ where: { phoneKey: key } });
    if (byPhone && byPhone.id !== exceptUserId) throw conflict(`Mobile number ${phone} is already used by another account.`);
  }
}

export const tenantDetails = (i: TenantInput) => ({
  name: i.name,
  legalName: i.legalName ?? null,
  type: i.type,
  gstin: i.gstin ?? null,
  pan: i.pan ?? null,
  businessPhone: i.businessPhone ?? null,
  businessEmail: i.businessEmail ?? null,
  website: i.website ?? null,
  addressLine: i.addressLine ?? null,
  city: i.city,
  state: i.state ?? null,
  pincode: i.pincode ?? null,
  location: (i.location as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
  ownerName: i.ownerName,
  ownerEmail: i.ownerEmail.toLowerCase(),
  ownerPhone: i.phone,
  ownerAltPhone: i.ownerAltPhone ?? null,
  ownerPan: i.ownerPan ?? null,
  notes: i.notes ?? null,
});

/**
 * Creates a business with its owner login, built-in roles and jewellery rate cards
 * in a single transaction.
 */
export async function createTenant(input: TenantInput & {
  plan: string;
  access?: string[] | null;
  password: string;
  ownerStatus?: 'active' | 'invited';
  astronLabsService?: boolean;
  planValidFrom?: Date | string | null;
  planValidTo?: Date | string | null;
}, tx?: Tx) {
  await assertLoginFree(input.ownerEmail, input.phone);
  const passwordHash = await hashPassword(input.password);
  const isAstron = input.astronLabsService ?? (input.plan === 'astron_labs');
  const run = async (t: Tx) => {
    const tenant = await t.tenant.create({
      data: {
        ...tenantDetails(input),
        plan: input.plan,
        status: input.plan === 'trial' ? 'trial' : 'active',
        mrr: PLAN_PRICE[input.plan] ?? 0,
        trialEndsAt: input.plan === 'trial' ? new Date(Date.now() + 14 * 864e5) : null,
        access: input.access ? normaliseAccess(input.access) : Prisma.DbNull,
        astronLabsService: isAstron || false,
        planValidFrom: input.planValidFrom ? new Date(input.planValidFrom) : (isAstron ? new Date() : null),
        planValidTo: input.planValidTo ? new Date(input.planValidTo) : null,
      },
    });
    await t.role.createMany({ data: SYSTEM_ROLES.map((r) => ({ tenantId: tenant.id, name: r.name, description: r.description, system: true, permissions: r.permissions })) });
    await t.metalRate.createMany({ data: DEFAULT_METAL_RATES.map((r) => ({ tenantId: tenant.id, ...r })) });
    const owner = await t.user.create({
      data: {
        tenantId: tenant.id,
        name: input.ownerName,
        email: input.ownerEmail.toLowerCase(),
        phone: input.phone,
        phoneKey: phoneKey(input.phone),
        passwordHash,
        role: 'Owner',
        status: input.ownerStatus ?? 'invited',
      },
    });
    return { tenant, owner };
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** Atomically reserves the next number in one of a business's sequences. */
export async function nextSeq(tx: Tx, tenantId: string, field: 'invoiceSeq' | 'orderSeq' | 'kotSeq' | 'repairSeq' | 'employeeSeq' | 'returnSeq' | 'skuSeq' | 'jobSeq') {
  const t = await tx.tenant.update({ where: { id: tenantId }, data: { [field]: { increment: 1 } }, select: { [field]: true } });
  return (t as unknown as Record<string, number>)[field];
}

/** Next free automatic SKU for the business (ITM-0001, ITM-0002…). */
export async function autoSku(tenantId: string) {
  for (;;) {
    const n = await db.$transaction((tx) => nextSeq(tx, tenantId, 'skuSeq'));
    const sku = `ITM-${String(n).padStart(4, '0')}`;
    if (!(await db.product.findFirst({ where: { tenantId, sku }, select: { id: true } }))) return sku;
  }
}
