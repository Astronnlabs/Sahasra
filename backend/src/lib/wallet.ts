import { db, type Tx } from '../db.js';
import { num, round2 } from './serialize.js';

/** The whole wallet balance expires this many days after the last top-up. */
export const WALLET_VALID_DAYS = 30;

type Kind = 'topup' | 'charge' | 'refund' | 'expired' | 'adjustment';

async function record(tx: Tx, tenantId: string, kind: Kind, amount: number, balanceAfter: number, description: string, reference?: string) {
  await tx.walletTxn.create({ data: { tenantId, kind, amount: round2(amount), balanceAfter: round2(balanceAfter), description: description.slice(0, 200), reference: reference?.slice(0, 100) } });
}

/** Writes off an expired balance. Returns the balance and expiry after the check. */
export async function expireIfDue(tx: Tx, tenantId: string) {
  const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { walletBalance: true, walletExpiresAt: true } });
  const balance = num(t.walletBalance);
  if (t.walletExpiresAt && t.walletExpiresAt <= new Date() && balance > 0) {
    // Only write it off once, even if two requests race here.
    const done = await tx.tenant.updateMany({ where: { id: tenantId, walletBalance: t.walletBalance, walletExpiresAt: t.walletExpiresAt }, data: { walletBalance: 0 } });
    if (done.count) await record(tx, tenantId, 'expired', -balance, 0, `Balance expired (${WALLET_VALID_DAYS} days after the last recharge)`);
    return { balance: 0, expiresAt: t.walletExpiresAt };
  }
  return { balance, expiresAt: t.walletExpiresAt };
}

/** Adds money and restarts the 30-day validity for the whole balance. */
export async function credit(tx: Tx, tenantId: string, amount: number, kind: 'topup' | 'adjustment', description: string, reference?: string) {
  await expireIfDue(tx, tenantId);
  const expiresAt = new Date(Date.now() + WALLET_VALID_DAYS * 864e5);
  const t = await tx.tenant.update({ where: { id: tenantId }, data: { walletBalance: { increment: round2(amount) }, walletExpiresAt: expiresAt }, select: { walletBalance: true } });
  await record(tx, tenantId, kind, amount, num(t.walletBalance), description, reference);
  return num(t.walletBalance);
}

/** Takes money for a message. Returns false (and changes nothing) when the balance is too low. */
export async function charge(tenantId: string, amount: number, description: string, reference?: string) {
  return db.$transaction(async (tx) => {
    await expireIfDue(tx, tenantId);
    const taken = await tx.tenant.updateMany({ where: { id: tenantId, walletBalance: { gte: amount } }, data: { walletBalance: { decrement: amount } } });
    if (!taken.count) return false;
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { walletBalance: true } });
    await record(tx, tenantId, 'charge', -amount, num(t.walletBalance), description, reference);
    return true;
  });
}

/** Gives back a charge for a message WhatsApp did not accept (validity unchanged). */
export async function refund(tenantId: string, amount: number, description: string, reference?: string) {
  await db.$transaction(async (tx) => {
    const t = await tx.tenant.update({ where: { id: tenantId }, data: { walletBalance: { increment: amount } }, select: { walletBalance: true } });
    await record(tx, tenantId, 'refund', amount, num(t.walletBalance), description, reference);
  });
}
