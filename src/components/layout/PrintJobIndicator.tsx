import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cancelPrintJob, usePrintJobs } from '@/lib/printJobs';

/**
 * Shows the receipt being sent to a Bluetooth printer, with progress and Cancel — on every
 * screen, above the mobile navigation bar, so the counter can keep billing meanwhile.
 */
export function PrintJobIndicator() {
  const { jobs, active } = usePrintJobs();
  const waiting = jobs.filter((j) => j.status === 'queued').length;
  const preparing = active ? undefined : jobs.find((j) => j.status === 'queued');
  const current = active ?? preparing;
  if (!current) return null;
  const pct = active && active.total ? Math.round((active.sent / active.total) * 100) : 0;
  const id = current.id;
  const label = active ? `Printing ${current.reference}` : `Preparing ${current.reference}`;
  const printer = current.printer;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[76px] z-40 flex justify-center px-4 lg:bottom-6" role="status" aria-live="polite">
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-pop animate-fade-up">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
          <Printer className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {label}
            {waiting > (active ? 0 : 1) && <span className="font-normal text-muted-foreground"> · {waiting - (active ? 0 : 1)} waiting</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {printer}
            {active ? ` · ${pct}%` : ''}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${active ? Math.max(pct, 4) : 4}%` }} />
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => cancelPrintJob(id)} aria-label="Cancel printing">
          <X />
        </Button>
      </div>
    </div>
  );
}
