import { format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { toast } from '@/components/ui/toast';
import { usePageAccess } from '@/hooks/usePageAccess';
import { elementPdfBlob } from '@/lib/pdf';
import { getPrinterSettings, localPrinters, NoPrinterService, printPdf } from '@/lib/printer';
import { printElement } from '@/lib/share';
import type { KotDesign } from '@/services';
import type { Kot } from '@/types';
import { DEFAULT_KOT_DESIGN, KOT_PAGES, useKotDesign } from './kotDesign';

const WIDTH = { thermal80: 302, thermal58: 219 } as const;
const ITEM_SIZE = { normal: 13, large: 15, xl: 19 } as const;
const FONT = { mono: 'ui-monospace, Menlo, Consolas, monospace', sans: 'Inter, Arial, Helvetica, sans-serif' } as const;

/** Kitchen order ticket on a thermal roll, laid out as designed in Bill Studio → KOT ticket. */
export function KotTicket({ kot, business, design = DEFAULT_KOT_DESIGN }: { kot: Kot; business: string; design?: KotDesign }) {
  const d = design;
  const narrow = d.paper === 'thermal58';
  const itemPx = ITEM_SIZE[d.itemSize] - (narrow ? 1 : 0);
  const small = narrow ? 10 : 11;
  return (
    <div style={{ width: WIDTH[d.paper], padding: narrow ? 10 : 14, background: '#fff', color: '#000', fontFamily: FONT[d.font] }}>
      {d.showBusiness && <div style={{ textAlign: 'center', fontSize: small }}>{business}</div>}
      {d.header && <div style={{ textAlign: 'center', fontSize: small, fontWeight: 600 }}>{d.header}</div>}
      {d.title && <div style={{ textAlign: 'center', fontSize: narrow ? 18 : 22, fontWeight: 800, letterSpacing: 2, margin: '4px 0' }}>{d.title}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: narrow ? 12 : 13, fontWeight: 700 }}>
        <span>{d.showKotNumber ? kot.number : ''}</span>
        <span>{kot.table}</span>
      </div>
      {(d.showOrderType || d.showTime) && (
        <div style={{ fontSize: small, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ textTransform: 'capitalize' }}>{d.showOrderType ? kot.type.replace('-', ' ') : ''}</span>
          <span>{d.showTime ? format(new Date(kot.createdAt), 'dd MMM, h:mm a') : ''}</span>
        </div>
      )}
      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />
      {kot.items.map((it, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 8, fontSize: itemPx, fontWeight: 700 }}>
            <span style={{ minWidth: itemPx * 2.3 }}>{it.qty} ×</span>
            <span>{it.name}</span>
          </div>
          {d.showNotes && it.note && <div style={{ marginLeft: itemPx * 2.3 + 8, fontSize: small + 1, fontStyle: 'italic' }}>Note: {it.note}</div>}
        </div>
      ))}
      {(d.showItemCount || d.footer) && <div style={{ borderTop: '1px dashed #000', margin: '8px 0 4px' }} />}
      {d.showItemCount && <div style={{ fontSize: small, textAlign: 'center' }}>{kot.items.reduce((s, i) => s + i.qty, 0)} items</div>}
      {d.footer && <div style={{ fontSize: small, textAlign: 'center', marginTop: 2 }}>{d.footer}</div>}
    </div>
  );
}

/** Prints KOTs on the kitchen printer chosen in Settings → Printer (or the print window). */
export function useKotPrinter(override?: KotDesign) {
  const { businessName } = useWorkspace();
  const { can } = usePageAccess();
  const { design: saved } = useKotDesign(!override && [...KOT_PAGES, 'bill-studio'].some(can));
  const design = override ?? saved;
  const [queue, setQueue] = useState<Kot | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!queue) return;
    const t = setTimeout(async () => {
      const el = ref.current?.firstElementChild as HTMLElement | null;
      const kot = queue;
      setQueue(null);
      if (!el) return;
      const settings = getPrinterSettings().kot;
      try {
        await localPrinters();
        const pdf = await elementPdfBlob(el, design.paper);
        const r = await printPdf(pdf, { printer: settings.printer, copies: settings.copies, paper: design.paper, title: kot.number });
        toast.success(`${kot.number} printed on ${r.printer}`);
      } catch (e) {
        if (e instanceof NoPrinterService) {
          if (!printElement(el, kot.number)) toast.error('Allow pop-ups for this site to print KOTs.');
        } else {
          toast.error(`${kot.number} didn’t print: ${e instanceof Error ? e.message : 'printer error'}`, { description: 'Check the KOT printer in Settings → Printer.' });
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [queue, design.paper]);

  const element = queue ? (
    <div ref={ref} aria-hidden className="pointer-events-none fixed -left-[10000px] top-0">
      <KotTicket kot={queue} business={businessName} design={design} />
    </div>
  ) : null;

  return { print: (kot: Kot) => setQueue(kot), printing: !!queue, element };
}
