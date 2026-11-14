import { db } from '../db.js';
import { notify } from './audit.js';
import { HttpError } from './http.js';
import { open } from './secretBox.js';
import { num } from './serialize.js';
import { vaahakSendBill, waNumber, type VaahakBill, type VaahakSendResult } from './vaahak.js';

/** Whether this business has switched on "send bills on WhatsApp". */
export const eBillingOn = (settings: unknown) => !!settings && typeof settings === 'object' && (settings as Record<string, unknown>).eBillingEnabled === true;

/** How long to wait for the bill PDF from the counter before sending the message without it. */
const PDF_WAIT_MS = 30_000;
const waitingForPdf = new Map<string, { tenantId: string; timer: ReturnType<typeof setTimeout> }>();

/**
 * Sends the bill to the customer's WhatsApp (through VAAHAK) after an invoice is saved.
 * The counter's browser makes the bill PDF (exactly the Bill Studio design) and hands it over
 * within a few seconds; it then goes with the message. If no PDF arrives in 30 seconds the bill
 * message is sent without it. Runs in the background: the bill is never held up or undone by WhatsApp.
 */
export function sendBillInBackground(tenantId: string, saleId: string) {
  const timer = setTimeout(() => {
    waitingForPdf.delete(saleId);
    sendBill(tenantId, saleId).catch((e) => console.error('e-bill failed', saleId, e));
  }, PDF_WAIT_MS);
  waitingForPdf.set(saleId, { tenantId, timer });
}

/** The bill PDF from the counter: sends the waiting bill now, with the PDF. False if nothing is waiting. */
export function attachBillPdf(tenantId: string, saleId: string, pdf: Buffer) {
  const w = waitingForPdf.get(saleId);
  if (!w || w.tenantId !== tenantId) return false;
  clearTimeout(w.timer);
  waitingForPdf.delete(saleId);
  setImmediate(() => {
    sendBill(tenantId, saleId, pdf).catch((e) => console.error('e-bill failed', saleId, e));
  });
  return true;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendBill(tenantId: string, saleId: string, pdf?: Buffer) {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true, settings: true, vaahakLink: true } });
  if (!tenant || !eBillingOn(tenant.settings)) return;
  if (await db.billMessage.findUnique({ where: { saleId }, select: { id: true } })) return; // Already handled.

  const sale = await db.sale.findUnique({ where: { id: saleId } });
  if (!sale || !sale.customerId) return; // Walk-in bills have no number to send to.
  const customer = await db.customer.findFirst({ where: { id: sale.customerId, tenantId } });
  const to = waNumber(customer?.phone);
  const base = { tenantId, saleId, invoiceNo: sale.invoiceNo, customer: sale.customerName };

  if (!to) {
    await db.billMessage.create({ data: { ...base, to: customer?.phone ?? '', status: 'skipped', error: 'The customer has no valid mobile number.' } }).catch(() => undefined);
    return;
  }
  const link = tenant.vaahakLink;
  if (!link) {
    await db.billMessage.create({ data: { ...base, to, status: 'skipped', error: 'VAAHAK is not connected.' } }).catch(() => undefined);
    return;
  }

  // Claim the bill first so it is handled once (VAAHAK also refuses to send or charge a bill twice).
  const row = await db.billMessage.create({ data: { ...base, to, status: 'sending' } }).catch(() => null);
  if (!row) return;

  let bill: VaahakBill = {
    billId: sale.id,
    invoiceNo: sale.invoiceNo,
    customerName: sale.customerName,
    to,
    amount: num(sale.total),
    date: sale.date.toISOString(),
    businessName: tenant.name,
    // The bill PDF goes with the message once WhatsApp has approved VAAHAK's PDF bill template.
    ...(pdf ? { pdf: pdf.toString('base64'), pdfName: `${sale.invoiceNo.replace(/[^\w.-]+/g, '-')}.pdf` } : {}),
  };
  const creds = { accountId: link.accountId, key: open(link.keyEnc) };

  let result: VaahakSendResult | null = null;
  let error = '';
  // VAAHAK may be waking up (free hosting sleeps): try once more after a short wait.
  for (let attempt = 0; attempt < 3 && !result; attempt++) {
    try {
      result = await vaahakSendBill(creds, bill);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not reach VAAHAK';
      // A PDF problem (older VAAHAK, file too large…) never stops the bill: send it without the PDF.
      if (bill.pdf && !(e instanceof HttpError && e.status === 429)) {
        const { pdf: _p, pdfName: _n, ...plain } = bill;
        void _p;
        void _n;
        bill = plain;
        continue;
      }
      const retryable = !(e instanceof HttpError) || e.status >= 500 || e.status === 429;
      if (!retryable) break;
      if (attempt === 0) await wait(20000);
    }
  }

  if (result && (result.status === 'sent' || result.status === 'sending')) {
    await db.billMessage.update({ where: { id: row.id }, data: { status: 'sent', delivery: 'sent', waMessageId: result.waMessageId ?? null, charged: result.charged } });
    return;
  }
  const message = (result?.message ?? error ?? 'Could not send').slice(0, 300);
  await db.billMessage.update({ where: { id: row.id }, data: { status: 'failed', error: message } });
  if (result?.code === 'LOW_BALANCE') {
    await notifyOnce(tenantId, 'wallet-low', 'E-billing paused: recharge your VAAHAK wallet', `${sale.invoiceNo} was not sent on WhatsApp because your VAAHAK wallet balance is too low or has expired.`, '/settings?section=ebilling');
  } else {
    await notifyOnce(tenantId, 'ebill-failed', 'A bill could not be sent on WhatsApp', `${sale.invoiceNo}: ${message}`, '/settings?section=ebilling');
  }
}

/** At most one notification of a kind every 6 hours, so a busy counter is not flooded. */
async function notifyOnce(tenantId: string, kind: string, title: string, message: string, href: string) {
  const recent = await db.notification.findFirst({ where: { tenantId, kind, createdAt: { gte: new Date(Date.now() - 6 * 3600e3) } } });
  if (!recent) await notify(tenantId, kind, title, message, href);
}
