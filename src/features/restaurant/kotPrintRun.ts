import { toast } from '@/components/ui/toast';
import { getPrinter, receiptOptions } from '@/lib/bluetooth/printers';
import { EscPos } from '@/lib/escpos/builder';
import { elementToBitmap } from '@/lib/escpos/raster';
import { kotToEscPos } from '@/lib/escpos/receipt';
import { elementPdfBlob } from '@/lib/pdf';
import { bluetoothIdOf, getPrinterSettings, localPrinters, NoPrinterService, printPdf } from '@/lib/printer';
import { DuplicateJobError, logComputerPrint, printOnBluetooth } from '@/lib/printJobs';
import { printElement } from '@/lib/share';
import type { KotDesign } from '@/services';
import type { Kot } from '@/types';

/**
 * Prints one KOT from its rendered ticket `el`. `release` is called as soon as the ticket has
 * been captured, so the next KOT can be prepared while this one is still being sent.
 */
export async function printKot(el: HTMLElement, kot: Kot, business: string, design: KotDesign, release: () => void) {
  const settings = getPrinterSettings().kot;
  const btId = bluetoothIdOf(settings.printer);

  if (btId) {
    // Kitchen ticket on a Bluetooth printer (phone or tablet).
    const bt = getPrinter(btId);
    if (!bt) {
      release();
      toast.error(`${kot.number} didn’t print: the Bluetooth KOT printer was removed.`, { description: 'Choose the KOT printer in Settings → Printer.' });
      return;
    }
    try {
      const picture = bt.style === 'image' ? await elementToBitmap(el, bt.dots, bt.density) : null;
      release();
      const r = await printOnBluetooth({
        kind: kot.id === 'test' ? 'test' : 'kot',
        reference: kot.number,
        printerId: bt.id,
        copies: settings.copies,
        build: async () => {
          if (picture) {
            const p = new EscPos(bt.encoding).init().image(picture).feed(bt.cut ? 2 : 4);
            if (bt.cut) p.cut();
            return p.build();
          }
          return kotToEscPos(kot, business, design, receiptOptions(bt));
        },
      });
      if (r.status === 'printed') toast.success(`${kot.number} printed on ${bt.name}`);
      else if (r.status !== 'cancelled') toast.error(`${kot.number} didn’t print: ${r.error ?? 'printer error'}`, { description: 'Print it again from the order, or check Settings → Printer.' });
    } catch (e) {
      release();
      if (e instanceof DuplicateJobError) toast.info(e.message);
      else toast.error(`${kot.number} didn’t print: ${e instanceof Error ? e.message : 'printer error'}`);
    }
    return;
  }

  let pdf: Blob | null = null;
  try {
    await localPrinters();
    pdf = await elementPdfBlob(el, design.paper);
  } catch (e) {
    if (e instanceof NoPrinterService) {
      printElement(el, kot.number);
      release();
      return;
    }
  }
  release();
  try {
    if (!pdf) throw new Error('Could not prepare the ticket.');
    const r = await printPdf(pdf, { printer: settings.printer, copies: settings.copies, paper: design.paper, title: kot.number });
    toast.success(`${kot.number} printed on ${r.printer}`);
    if (kot.id !== 'test') logComputerPrint({ kind: 'kot', reference: kot.number, printer: r.printer, copies: settings.copies, ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'printer error';
    if (kot.id !== 'test') logComputerPrint({ kind: 'kot', reference: kot.number, printer: settings.printer || 'Default printer', copies: settings.copies, ok: false, error: message });
    toast.error(`${kot.number} didn’t print: ${message}`, { description: 'Check the KOT printer in Settings → Printer.' });
  }
}
