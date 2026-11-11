import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { toast } from '@/components/ui/toast';
import { InvoiceRenderer } from '@/features/bill-studio/InvoiceRenderer';
import { PRESET_TEMPLATES, saleToInvoiceData, type InvoiceTemplate } from '@/features/bill-studio/model';
import { useTemplates } from '@/features/bill-studio/useTemplates';
import { qk } from '@/hooks/queries';
import { inNativeApp, nativeSaveFile, nativeShareFile } from '@/lib/bluetooth/native';
import { getPrinter, receiptOptions, type SavedPrinter } from '@/lib/bluetooth/printers';
import type { Bitmap } from '@/lib/escpos/builder';
import { elementToBitmap } from '@/lib/escpos/raster';
import { invoiceToEscPos, type Seller } from '@/lib/escpos/receipt';
import { EscPos } from '@/lib/escpos/builder';
import { downloadElementPdf, elementPdfBlob } from '@/lib/pdf';
import { bluetoothIdOf, getPrinterSettings, localPrinters, NoPrinterService, printPdf, PRINTER_STATUS_KEY } from '@/lib/printer';
import { DuplicateJobError, logComputerPrint, printOnBluetooth } from '@/lib/printJobs';
import { printElement } from '@/lib/share';
import type { Customer, Sale } from '@/types';

type Mode = 'print' | 'download' | 'dialog' | 'share';
type Job = { sale: Sale; mode: Mode; reprint?: boolean };

/**
 * The bill design for a thermal Bluetooth printer: the bill's own design when it is a receipt
 * design, otherwise the business's receipt design for that paper width (Bill Studio), otherwise
 * Sahaasra's built-in receipt design. An A4 design is never squeezed onto a receipt roll.
 */
export function receiptTemplate(billTemplate: InvoiceTemplate | undefined, templates: InvoiceTemplate[], paper: 58 | 80): InvoiceTemplate {
  if (billTemplate?.paper.startsWith('thermal')) return billTemplate;
  const want = paper === 58 ? 'thermal58' : 'thermal80';
  return (
    templates.find((t) => t.paper === want && t.isDefault) ??
    templates.find((t) => t.paper === want && !PRESET_TEMPLATES.some((p) => p.id === t.id)) ??
    templates.find((t) => t.paper === want) ??
    PRESET_TEMPLATES.find((t) => t.paper === want)!
  );
}

/** The Bluetooth printer chosen for bills on this device, if any. */
const bluetoothBillPrinter = (): SavedPrinter | null => {
  const id = bluetoothIdOf(getPrinterSettings().bill.printer);
  return id ? getPrinter(id) : null;
};

/**
 * Renders an invoice off-screen with the design it was issued with (or today's default
 * design for older invoices), then prints it or saves it as a PDF.
 *  - Bluetooth printer chosen for bills (phones/tablets): an ESC/POS receipt goes straight to it.
 *  - Sahaasra Printer for Windows installed: straight to the computer's printer.
 *  - Otherwise the print window.
 * Printing never touches the sale itself: a failed print can always be repeated.
 */
export function useInvoicePrinter() {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const { defaultTemplate, templates } = useTemplates();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  /** Last direct print that failed, so screens can offer to try again or use the print window. */
  const [failed, setFailed] = useState<{ sale: Sale; message: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const designOf = (sale: Sale): InvoiceTemplate | undefined => {
    const s = sale.seller?.template;
    return s ? { ...s, isDefault: false, updatedAt: '' } : defaultTemplate;
  };
  const billTemplate = job ? designOf(job.sale) : defaultTemplate;
  const btPrinter = job?.mode === 'print' ? bluetoothBillPrinter() : null;
  const template = btPrinter ? receiptTemplate(billTemplate, templates, btPrinter.paper) : billTemplate;

  const sellerOf = (sale: Sale): Seller =>
    sale.seller ?? {
      businessName: ws.businessName,
      address: ws.address,
      phone: ws.phone,
      email: ws.email,
      gstin: ws.gstin,
      logo: ws.logo ?? '',
      upiId: String(ws.settings.upiId ?? '').trim(),
      bankName: String(ws.settings.bankName ?? '').trim(),
      bankAccount: String(ws.settings.bankAccount ?? '').trim(),
      bankIfsc: String(ws.settings.bankIfsc ?? '').trim(),
      bankBranch: String(ws.settings.bankBranch ?? '').trim(),
    };

  /** Sends a bill to the Bluetooth printer (text receipt, or the given picture of the design). */
  const sendBluetooth = async (sale: Sale, bt: SavedPrinter, design: InvoiceTemplate, picture: Bitmap | null, reprint?: boolean) => {
    const customer = sale.customerId ? qc.getQueryData<Customer[]>(qk.customers)?.find((c) => c.id === sale.customerId) : undefined;
    const fail = (message: string) => {
      setFailed({ sale, message });
      toast.error(`${sale.invoiceNo} didn’t print`, {
        description: message,
        action: { label: 'Try again', onClick: () => print(sale) },
        duration: 10000,
      });
    };
    try {
      const result = await printOnBluetooth({
        kind: sale.id === 'test' ? 'test' : 'bill',
        reference: sale.invoiceNo,
        printerId: bt.id,
        copies: getPrinterSettings().bill.copies,
        reprint,
        build: async () => {
          if (picture) {
            const p = new EscPos(bt.encoding).init().image(picture).feed(bt.cut ? 2 : 4);
            if (bt.cut) p.cut();
            return p.build();
          }
          return invoiceToEscPos(design, saleToInvoiceData(sale, customer), sellerOf(sale), receiptOptions(bt));
        },
      });
      if (result.status === 'printed') {
        setFailed(null);
        toast.success(`${sale.invoiceNo} printed on ${bt.name}`);
      } else if (result.status === 'cancelled') {
        toast.info(`${sale.invoiceNo}: printing cancelled`);
      } else {
        fail(result.error ?? 'The printer did not print.');
      }
    } catch (e) {
      if (e instanceof DuplicateJobError) toast.info(e.message);
      else fail(e instanceof Error ? e.message : 'Could not print.');
    }
  };

  /**
   * Print. With a Bluetooth printer in the fast text style the receipt is built and sent at once —
   * no waiting for the bill to be drawn on screen.
   */
  const print = (sale: Sale, reprint?: boolean) => {
    setFailed(null);
    const bt = bluetoothBillPrinter();
    if (bt && bt.style === 'text') {
      const design = receiptTemplate(designOf(sale), templates, bt.paper);
      void sendBluetooth(sale, bt, design, null, reprint);
      return;
    }
    setJob({ sale, mode: 'print', reprint });
  };

  useEffect(() => {
    if (!job || !template) return;
    // Give fonts, QR codes and the logo a moment to render before copying the bill.
    const t = setTimeout(async () => {
      const el = ref.current?.firstElementChild as HTMLElement | null;
      if (!el) return setJob(null);
      const { sale } = job;
      const settings = getPrinterSettings().bill;
      const dialog = () => {
        if (!printElement(el, `Invoice ${sale.invoiceNo}`)) toast.error('Allow pop-ups for this site to print invoices.');
      };
      const fail = (message: string) => {
        setFailed({ sale, message });
        toast.error(`${sale.invoiceNo} didn’t print`, {
          description: message,
          action: { label: 'Try again', onClick: () => setJob({ sale, mode: 'print' }) },
          duration: 10000,
        });
      };

      if (job.mode === 'dialog') {
        dialog();
      } else if (job.mode === 'print' && btPrinter) {
        // Exact-design style: the rendered bill is turned into a picture first.
        try {
          const picture = await elementToBitmap(el, btPrinter.dots, btPrinter.density);
          // The bill is ready: the screen is free while the printer works (progress shows at the bottom).
          setJob((current) => (current === job ? null : current));
          await sendBluetooth(sale, btPrinter, template, picture, job.reprint);
        } catch (e) {
          fail(e instanceof Error ? e.message : 'Could not print.');
        } finally {
          setJob((current) => (current === job ? null : current));
        }
        return;
      } else if (job.mode === 'print') {
        setBusy(true);
        try {
          // Direct printing when this computer has the printer service; otherwise the print window.
          await localPrinters();
          const pdf = await elementPdfBlob(el, template.paper);
          const r = await printPdf(pdf, { printer: settings.printer, copies: settings.copies, paper: template.paper, title: sale.invoiceNo });
          setFailed(null);
          toast.success(`${sale.invoiceNo} printed on ${r.printer}`);
          if (sale.id !== 'test') logComputerPrint({ kind: 'bill', reference: sale.invoiceNo, printer: r.printer, copies: settings.copies, ok: true });
        } catch (e) {
          if (e instanceof NoPrinterService) {
            dialog();
          } else {
            // Never leave the counter stuck: offer the print window instead.
            const message = e instanceof Error ? e.message : 'Could not print.';
            setFailed({ sale, message });
            if (sale.id !== 'test') logComputerPrint({ kind: 'bill', reference: sale.invoiceNo, printer: settings.printer || 'Default printer', copies: settings.copies, ok: false, error: message });
            toast.error(message, {
              description: 'Check the printer in Settings → Printer.',
              action: { label: 'Print window', onClick: () => setJob({ sale, mode: 'dialog' }) },
              duration: 10000,
            });
          }
        } finally {
          setBusy(false);
          qc.invalidateQueries({ queryKey: PRINTER_STATUS_KEY });
        }
      } else if (job.mode === 'share') {
        setBusy(true);
        try {
          const blob = await elementPdfBlob(el, template.paper);
          const name = `${sale.invoiceNo}.pdf`;
          const text = `Invoice ${sale.invoiceNo} from ${ws.businessName}`;
          if (inNativeApp()) {
            await nativeShareFile(blob, name, text);
          } else {
            const file = new File([blob], name, { type: 'application/pdf' });
            if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name, text });
            else {
              await downloadElementPdf(el, name, template.paper);
              toast.success(`${name} downloaded — this browser can’t share files directly.`);
            }
          }
        } catch (e) {
          if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Could not share the PDF.');
        } finally {
          setBusy(false);
        }
      } else {
        setBusy(true);
        try {
          if (inNativeApp()) {
            const r = await nativeSaveFile(await elementPdfBlob(el, template.paper), `${sale.invoiceNo}.pdf`);
            toast.success(`${sale.invoiceNo}.pdf saved to ${r.location}`);
          } else {
            await downloadElementPdf(el, `${sale.invoiceNo}.pdf`, template.paper);
            toast.success(`${sale.invoiceNo}.pdf downloaded`);
          }
        } catch {
          toast.error('Could not create the PDF. Try Print → Save as PDF instead.');
        } finally {
          setBusy(false);
        }
      }
      setJob((current) => (current === job ? null : current));
    }, 400);
    return () => clearTimeout(t);
  }, [job, template, qc]);

  const customer = job?.sale.customerId ? qc.getQueryData<Customer[]>(qk.customers)?.find((c) => c.id === job.sale.customerId) : undefined;
  const element =
    job && template ? (
      <div ref={ref} aria-hidden className="pointer-events-none fixed -left-[10000px] top-0">
        <InvoiceRenderer template={template} data={saleToInvoiceData(job.sale, customer)} />
      </div>
    ) : null;

  return {
    print: (sale: Sale) => print(sale),
    /** Prints a bill that was already printed (marked as a reprint in the print history). */
    printAgain: (sale: Sale) => print(sale, true),
    /** Why the last direct print failed (null when it worked). */
    failed,
    /** Prints the failed bill through the browser's print dialog instead. */
    printWithDialog: (sale: Sale) => {
      setFailed(null);
      setJob({ sale, mode: 'dialog' });
    },
    download: (sale: Sale) => setJob({ sale, mode: 'download' }),
    /** Shares the bill as a PDF (WhatsApp, email…) where the device allows it. */
    share: (sale: Sale) => setJob({ sale, mode: 'share' }),
    /** True while a bill is being prepared for the printer or a PDF. */
    busy: busy || (!!job && job.mode !== 'dialog'),
    printing: !!job && job.mode === 'print',
    downloading: !!job && job.mode === 'download',
    sharing: !!job && job.mode === 'share',
    element,
  };
}
