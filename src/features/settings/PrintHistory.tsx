import { useQuery } from '@tanstack/react-query';
import { History, Printer, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { formatDistanceToNowStrict } from 'date-fns';
import { cancelPrintJob, clearFinishedJobs, DuplicateJobError, printJobAgain, usePrintJobs, type JobStatus } from '@/lib/printJobs';
import { printJobsService } from '@/services';

const STATUS: Record<JobStatus, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' | 'primary' }> = {
  queued: { label: 'Waiting', tone: 'neutral' },
  sending: { label: 'Printing', tone: 'primary' },
  printed: { label: 'Printed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  interrupted: { label: 'Interrupted', tone: 'warning' },
};
const CONNECTION = { 'bluetooth-classic': 'Bluetooth', 'bluetooth-le': 'Bluetooth LE', windows: 'Computer printer' } as const;
const KIND = { bill: 'Bill', kot: 'KOT', test: 'Test page' } as const;
const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

/** Print history: this device's queue (with cancel / print again) and every device of the business. */
export function PrintHistory() {
  const [tab, setTab] = useState('device');
  const { jobs, active } = usePrintJobs();
  const all = useQuery({ queryKey: ['print-jobs'], queryFn: printJobsService.list, enabled: tab === 'all', staleTime: 10_000 });

  const again = async (id: string) => {
    try {
      const r = await printJobAgain(id);
      if (r.status === 'printed') toast.success(`${r.reference} printed again`);
      else if (r.status === 'failed') toast.error(r.error ?? 'Did not print.');
    } catch (e) {
      if (e instanceof DuplicateJobError) toast.info(e.message);
      else toast.error(e instanceof Error ? e.message : 'Could not print.');
    }
  };

  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <History className="h-4 w-4 text-primary" />
        <p className="flex-1 text-[13px] font-semibold">Print history</p>
        {tab === 'device' && jobs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFinishedJobs}>
            Clear
          </Button>
        )}
      </div>
      <div className="px-4 pb-4 pt-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="device">This device</TabsTrigger>
            <TabsTrigger value="all">All devices</TabsTrigger>
          </TabsList>
          <TabsContent value="device" className="mt-3">
            {jobs.length ? (
              <ul className="divide-y divide-border">
                {jobs.slice(0, 30).map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                    <Printer className="h-4 w-4 shrink-0 text-subtle" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                        {KIND[j.kind]} {j.kind !== 'test' && j.reference}
                        <Badge tone={STATUS[j.status].tone}>
                          {STATUS[j.status].label}
                          {j.status === 'sending' && active?.id === j.id && active.total ? ` ${Math.round((active.sent / active.total) * 100)}%` : ''}
                        </Badge>
                        {j.reprint && <Badge tone="neutral">Reprint</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {j.printer} · {CONNECTION[j.connection]} · {j.copies > 1 ? `${j.copies} copies · ` : ''}
                        {ago(j.createdAt)}
                      </p>
                      {j.error && j.status !== 'printed' && <p className="text-xs text-danger">{j.error}</p>}
                    </div>
                    {(j.status === 'queued' || j.status === 'sending') && (
                      <Button size="sm" variant="ghost" onClick={() => cancelPrintJob(j.id)}>
                        <X /> Cancel
                      </Button>
                    )}
                    {j.data && j.status !== 'queued' && j.status !== 'sending' && (
                      <Button size="sm" variant="secondary" onClick={() => again(j.id)}>
                        <RotateCcw /> Print again
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[13px] text-muted-foreground">Nothing printed from this device yet.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Interrupted prints are never repeated automatically — check the paper first, then print again if needed. History is saved to your account when online.
            </p>
          </TabsContent>
          <TabsContent value="all" className="mt-3">
            {all.isLoading ? (
              <p className="py-3 text-[13px] text-muted-foreground">Loading…</p>
            ) : all.isError ? (
              <p className="py-3 text-[13px] text-muted-foreground">Could not load the history. Check your internet connection.</p>
            ) : all.data?.length ? (
              <ul className="divide-y divide-border">
                {all.data.map((j) => (
                  <li key={j.id} className="py-2.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                      {KIND[j.kind]} {j.reference}
                      <Badge tone={STATUS[j.status].tone}>{STATUS[j.status].label}</Badge>
                      {j.reprint && <Badge tone="neutral">Reprint</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {j.printer} · {CONNECTION[j.connection]} · {j.device}
                      {j.user ? ` · ${j.user}` : ''} · {ago(j.createdAt)}
                    </p>
                    {j.error && j.status !== 'printed' && <p className="text-xs text-danger">{j.error}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[13px] text-muted-foreground">No prints recorded yet.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
