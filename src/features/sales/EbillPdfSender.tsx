import { useEffect, useState } from 'react';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { SALE_CREATED_EVENT } from '@/services';
import type { Sale } from '@/types';
import { useInvoicePrinter } from './useInvoicePrinter';

/**
 * WhatsApp e-bills with the bill attached: when a bill for a customer is saved and e-billing is on,
 * this makes the bill PDF (exactly the Bill Studio design) in the background and hands it to the
 * server, which sends it with the WhatsApp message through VAAHAK. Bills are handled one by one.
 * If this doesn't finish (closed tab, no internet), the message still goes out without the PDF.
 */
export function EbillPdfSender() {
  const { settings } = useWorkspace();
  const on = settings.eBillingEnabled === true;
  const [queue, setQueue] = useState<Sale[]>([]);
  const maker = useInvoicePrinter();

  useEffect(() => {
    if (!on) return;
    const onSale = (e: Event) => {
      const sale = (e as CustomEvent<Sale>).detail;
      // Walk-in bills have no number to send to.
      if (sale?.id && sale.customerId) setQueue((q) => [...q, sale]);
    };
    window.addEventListener(SALE_CREATED_EVENT, onSale);
    return () => window.removeEventListener(SALE_CREATED_EVENT, onSale);
  }, [on]);

  useEffect(() => {
    if (!queue.length || maker.working) return;
    maker.ebill(queue[0]);
    setQueue((q) => q.slice(1));
  }, [queue, maker]);

  return maker.element;
}
