import type { Prisma } from '@prisma/client';
import type { Tx } from '../db.js';
import { workspaceOut } from './mappers.js';

/**
 * The seller's details as they were when the invoice was issued: business name, address,
 * GSTIN, logo, UPI / bank details and the bill design. Stored on the sale so a bill
 * re-downloaded months later matches the original even if the business changes them.
 */
export async function sellerSnapshot(tx: Tx, tenantId: string): Promise<Prisma.InputJsonValue> {
  const [tenant, template] = await Promise.all([
    tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    tx.billTemplate.findFirst({ where: { tenantId, isDefault: true } }),
  ]);
  const w = workspaceOut(tenant);
  const str = (k: string) => (typeof w.settings[k] === 'string' ? (w.settings[k] as string).trim() : '');
  return {
    businessName: w.businessName,
    address: w.address,
    phone: w.phone ?? '',
    email: w.email ?? '',
    gstin: w.gstin,
    logo: w.logo ?? '',
    upiId: str('upiId'),
    bankName: str('bankName'),
    bankAccount: str('bankAccount'),
    bankIfsc: str('bankIfsc'),
    bankBranch: str('bankBranch'),
    // A saved design is copied in full; the built-in designs are part of the app.
    template: template
      ? { id: template.key, name: template.name, paper: template.paper, accent: template.accent, font: template.font, watermark: template.watermark, elements: template.elements as Prisma.InputJsonValue }
      : null,
  };
}
