import { config } from '../config.js';
import { db } from '../db.js';
import { notify } from './audit.js';
import { open } from './secretBox.js';
import { num } from './serialize.js';
import { charge, refund } from './wallet.js';
import { sendBillTemplate, waNumber } from './whatsapp.js';

/** Whether this business has switched on "send bills on WhatsApp". */
export const eBillingOn = (settings: unknown) => !!settings && typeof settings === 'object' && (settings as Record<string, unknown>).eBillingEnabled === true;

/**
 * Sends the thank-you bill to the customer's WhatsApp after an invoice is saved.
 * Runs in the background: the bill is never held up or undone by WhatsApp.
 */
export function sendBillInBackground(tenantId: string, saleId: string) {
  setImmediate(() => {
    sendBill(tenantId, saleId).catch((e) => console.error('e-bill failed', saleId, e));
  });
}

async function sendBill(tenantId: string, saleId: string) {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true, settings: true, whatsAppSetup: true } });
  if (!tenant || !eBillingOn(tenant.settings)) return;
  if (await db.billMessage.findUnique({ where: { saleId }, select: { id: true } })) return; // Already handled.

  const sale = await db.sale.findUnique({ where: { id: saleId } });
  if (!sale || !sale.customerId) return; // Walk-in bills have no number to send to.
  const customer = await db.customer.findFirst({ where: { id: sale.customerId, tenantId } });
  const to = waNumber(customer?.phone);
  const base = { tenantId, saleId, invoiceNo: sale.invoiceNo, customer: sale.customerName };

  const skip = (error: string, toNumber = to ?? customer?.phone ?? '') =>
    db.billMessage.create({ data: { ...base, to: toNumber, status: 'skipped', error } }).catch(() => undefined);

  if (!to) return skip('The customer has no valid mobile number.');
  const setup = tenant.whatsAppSetup;
  if (!setup) return skip('WhatsApp is not connected.');
  if (setup.templateStatus !== 'APPROVED') return skip('The bill template is not approved by WhatsApp yet.');

  // Claim the bill first so it can never be sent (or charged) twice.
  const row = await db.billMessage.create({ data: { ...base, to, status: 'sending' } }).catch(() => null);
  if (!row) return;

  const price = config.EBILL_PRICE;
  if (!(await charge(tenantId, price, `WhatsApp bill ${sale.invoiceNo}`, sale.invoiceNo))) {
    await db.billMessage.update({ where: { id: row.id }, data: { status: 'skipped', error: 'Wallet balance is too low or has expired.' } });
    await notifyOnce(tenantId, 'wallet-low', 'E-billing paused: recharge your wallet', `${sale.invoiceNo} was not sent on WhatsApp because the wallet balance is too low or has expired.`, '/settings?section=wallet');
    return;
  }

  try {
    const waMessageId = await sendBillTemplate(setup.phoneNumberId, open(setup.tokenEnc), to, {
      customer: sale.customerName,
      business: tenant.name,
      invoiceNo: sale.invoiceNo,
      amount: num(sale.total),
      date: sale.date,
    });
    await db.billMessage.update({ where: { id: row.id }, data: { status: 'sent', waMessageId, charged: price } });
  } catch (e) {
    const error = (e instanceof Error ? e.message : 'Could not send').slice(0, 300);
    await refund(tenantId, price, `Refund: ${sale.invoiceNo} was not sent`, sale.invoiceNo);
    await db.billMessage.update({ where: { id: row.id }, data: { status: 'failed', error } });
    await notifyOnce(tenantId, 'ebill-failed', 'A bill could not be sent on WhatsApp', `${sale.invoiceNo}: ${error}`, '/settings?section=ebilling');
  }
}

/** At most one notification of a kind every 6 hours, so a busy counter is not flooded. */
async function notifyOnce(tenantId: string, kind: string, title: string, message: string, href: string) {
  const recent = await db.notification.findFirst({ where: { tenantId, kind, createdAt: { gte: new Date(Date.now() - 6 * 3600e3) } } });
  if (!recent) await notify(tenantId, kind, title, message, href);
}
