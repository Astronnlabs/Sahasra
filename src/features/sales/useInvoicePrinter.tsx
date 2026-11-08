import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { InvoiceRenderer } from '@/features/bill-studio/InvoiceRenderer';
import { saleToInvoiceData, type InvoiceTemplate } from '@/features/bill-studio/model';
import { useTemplates } from '@/features/bill-studio/useTemplates';
import { qk } from '@/hooks/queries';
import { downloadElementPdf, elementPdfBlob } from '@/lib/pdf';
import { getPrinterSettings, localPrinters, NoPrinterService, printPdf, PRINTER_STATUS_KEY } from '@/lib/printer';
import { printElement } from '@/lib/share';
import type { Customer, Sale } from '@/types';

type Job = { sale: Sale; mode: 'print' | 'download' | 'dialog' };

/**
 * Renders an invoice off-screen with the design it was issued with (or today's default
 * design for older invoices), then prints it or saves it as a PDF. With the Print Helper
 * set up on this computer, Print goes straight to the printer without a dialog.
 */
export function useInvoicePrinter() {
  const qc = useQueryClient();
  const { defaultTemplate } = useTemplates();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  /** Last direct print that failed, so screens can offer the print dialog instead. */
  const [failed, setFailed] = useState<{ sale: Sale; message: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const saved = job?.sale.seller?.template;
  const template: InvoiceTemplate | undefined = saved ? { ...saved, isDefault: false, updatedAt: '' } : defaultTemplate;

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
      if (job.mode === 'dialog') {
        dialog();
      } else if (job.mode === 'print') {
        setBusy(true);
        try {
          // Direct printing when this computer has the printer service; otherwise the print window.
          await localPrinters();
          const pdf = await elementPdfBlob(el, template.paper);
          const r = await printPdf(pdf, { printer: settings.printer, copies: settings.copies, paper: template.paper, title: sale.invoiceNo });
          setFailed(null);
          toast.success(`${sale.invoiceNo} printed on ${r.printer}`);
        } catch (e) {
          if (e instanceof NoPrinterService) {
            dialog();
          } else {
            // Never leave the counter stuck: offer the print window instead.
            const message = e instanceof Error ? e.message : 'Could not print.';
            setFailed({ sale, message });
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
      } else {
        setBusy(true);
        try {
          await downloadElementPdf(el, `${sale.invoiceNo}.pdf`, template.paper);
          toast.success(`${sale.invoiceNo}.pdf downloaded`);
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
    print: (sale: Sale) => {
      setFailed(null);
      setJob({ sale, mode: 'print' });
    },
    /** Why the last direct print failed (null when it worked). */
    failed,
    /** Prints the failed bill through the browser's print dialog instead. */
    printWithDialog: (sale: Sale) => {
      setFailed(null);
      setJob({ sale, mode: 'dialog' });
    },
    download: (sale: Sale) => setJob({ sale, mode: 'download' }),
    /** True while a bill is being prepared for the printer or a PDF. */
    busy: busy || (!!job && job.mode !== 'dialog'),
    printing: !!job && job.mode === 'print',
    downloading: !!job && job.mode === 'download',
    element,
  };
}
