import { useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInMinutes, parseISO } from 'date-fns';
import { ArrowLeft, Bike, CheckCircle2, ChefHat, Clock, Flame, Printer, ShoppingBag, Utensils } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { qk } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { restaurantService } from '@/services';
import type { Kot, KotStatus } from '@/types';
import { useKotPrinter } from './useKotPrinter';

const COLUMNS: { status: KotStatus; title: string; next?: KotStatus; action?: string; accent: string }[] = [
  { status: 'new', title: 'New', next: 'preparing', action: 'Start cooking', accent: 'bg-info' },
  { status: 'preparing', title: 'Preparing', next: 'ready', action: 'Mark ready', accent: 'bg-warning' },
  { status: 'ready', title: 'Ready to serve', next: 'served', action: 'Served', accent: 'bg-success' },
];

const TYPE_ICON = { 'dine-in': Utensils, takeaway: ShoppingBag, delivery: Bike };

function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

export function KitchenPage() {
  const qc = useQueryClient();
  const now = useNow();
  const { data, isLoading } = useQuery({ queryKey: qk.restaurant('kots'), queryFn: restaurantService.kots, refetchInterval: 10_000 });
  const kotPrinter = useKotPrinter();

  const move = async (kot: Kot, next: KotStatus) => {
    qc.setQueryData<Kot[]>(qk.restaurant('kots'), (list) => list?.map((k) => (k.id === kot.id ? { ...k, status: next } : k)));
    await restaurantService.setKotStatus(kot.id, next);
    qc.invalidateQueries({ queryKey: ['restaurant'] });
    if (next === 'ready') toast.success(`${kot.number} is ready`, { description: `${kot.table} · notify the waiter` });
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-surface/40 p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="icon" asChild aria-label="Back to tables"><Link to="/restaurant/tables"><ArrowLeft /></Link></Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><ChefHat className="h-6 w-6 text-primary" /> Kitchen Display</h1>
            <p className="text-[13px] text-muted-foreground">Live KOTs · refreshes automatically</p>
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          {COLUMNS.map((c) => (
            <span key={c.status} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-medium">
              <span className={cn('h-2 w-2 rounded-full', c.accent)} /> {c.title} <b className="tabular">{data?.filter((k) => k.status === c.status).length ?? 0}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = (data ?? []).filter((k) => k.status === col.status);
          return (
            <section key={col.status} className="flex min-h-[300px] flex-col rounded-2xl border border-border bg-card" aria-label={col.title}>
              <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className={cn('h-2.5 w-2.5 rounded-full', col.accent)} />
                <h2 className="text-[14px] font-semibold">{col.title}</h2>
                <span className="tabular ml-auto rounded-full bg-surface px-2 py-0.5 text-xs font-semibold">{items.length}</span>
              </header>
              <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-3">
                {isLoading && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
                {!isLoading && items.length === 0 && (
                  <div className="flex h-full min-h-[160px] flex-col items-center justify-center text-center text-xs text-muted-foreground">
                    <CheckCircle2 className="mb-2 h-6 w-6 text-subtle" /> Nothing here right now
                  </div>
                )}
                {items.map((k) => {
                  const mins = differenceInMinutes(now, parseISO(k.createdAt));
                  const late = mins >= 20 && col.status !== 'ready';
                  const Icon = TYPE_ICON[k.type];
                  return (
                    <article key={k.id} className={cn('rounded-xl border bg-card p-4 shadow-card animate-fade-up', late ? 'border-danger/50' : 'border-border')}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-lg font-semibold"><Icon className="h-4 w-4 text-subtle" /> {k.table}</p>
                          <p className="text-2xs text-subtle">{k.number}</p>
                        </div>
                        <span className="flex items-center gap-1">
                          <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', late ? 'bg-danger-soft text-danger' : 'bg-surface text-muted-foreground')}>
                            {late ? <Flame className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {mins}m
                          </span>
                          <Button variant="ghost" size="icon-sm" onClick={() => kotPrinter.print(k)} aria-label={`Print ${k.number}`} title="Print KOT">
                            <Printer />
                          </Button>
                        </span>
                      </div>
                      <ul className="mt-3 space-y-1.5 border-t border-dashed border-border pt-3">
                        {k.items.map((i) => (
                          <li key={i.name} className="text-[14px]">
                            <span className="tabular mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary-light px-1 text-xs font-bold text-primary">{i.qty}</span>
                            <span className="font-medium">{i.name}</span>
                            {i.note && <p className="ml-8 text-xs italic text-warning">{i.note}</p>}
                          </li>
                        ))}
                      </ul>
                      {col.next && (
                        <Button className="mt-4 w-full" variant={col.status === 'ready' ? 'secondary' : 'primary'} onClick={() => move(k, col.next!)}>
                          {col.action}
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {kotPrinter.element}
    </div>
  );
}
