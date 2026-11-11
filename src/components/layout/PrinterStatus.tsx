import { ChefHat, Printer, ReceiptText, RefreshCw, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePrinterStatus, type PrinterLevel } from '@/lib/printer';
import { cn } from '@/lib/utils';

const DOT = { ok: 'bg-success', warn: 'bg-warning', error: 'bg-danger', unknown: 'bg-subtle' } as const;
const RANK: Record<PrinterLevel, number> = { unknown: 0, ok: 1, warn: 2, error: 3 };
const TITLE = { ok: 'Printers ready', warn: 'Printer needs attention', error: 'Printer not ready', unknown: 'Printing' } as const;

/** Top-bar printer indicator for the bill (and KOT) printer: green / amber / red. */
export function PrinterStatus() {
  const navigate = useNavigate();
  const { businessType } = useWorkspace();
  const [open, setOpen] = useState(false);
  const s = usePrinterStatus();
  const jobs = [
    { job: 'bill' as const, label: 'Bills', icon: ReceiptText },
    ...(businessType === 'restaurant' || businessType === 'hotel' ? [{ job: 'kot' as const, label: 'KOT', icon: ChefHat }] : []),
  ].map((j) => ({ ...j, ...s.jobStatus(j.job) }));
  // The dot shows the worst of the bill and KOT printers.
  const level = jobs.reduce<PrinterLevel>((w, j) => (RANK[j.level] > RANK[w] ? j.level : w), 'unknown');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Printer: ${jobs.map((j) => `${j.label} ${j.message}`).join(', ')}`}>
          <Printer className="!size-[18px]" />
          <span className={cn('absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card', DOT[level], level === 'error' && 'animate-pulse')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b border-border px-4 py-3 text-[13px] font-semibold">{TITLE[level]}</p>
        <ul className="space-y-1 px-2 py-2">
          {jobs.map((j) => (
            <li key={j.job} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <j.icon className="h-4 w-4 shrink-0 text-subtle" />
              <span className="w-10 shrink-0 text-xs font-medium">{j.label}</span>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[j.level])} />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{j.message}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 border-t border-border px-3 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => s.refresh()} loading={s.isFetching}><RefreshCw /> Refresh</Button>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              setOpen(false);
              navigate('/settings?section=printer');
            }}
          >
            <Settings2 /> Printer settings
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
