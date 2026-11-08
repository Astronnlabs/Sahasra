import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock, Headset, Inbox, LogIn, RotateCcw, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DetailList } from '@/components/common/DetailList';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PLAN_LABEL } from '@/app/config/constants';
import { useAppMutation } from '@/hooks/queries';
import { formatDateTime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { platformAdminsService, platformTicketsService, tenantsService } from '@/services';
import type { SupportTicket, TicketPriority, TicketStatus } from '@/types';
import { CATEGORY_LABEL, PRIORITIES, PriorityBadge } from '@/features/support/supportMeta';
import { TicketThread } from '@/features/support/TicketThread';
import { PK } from './platformKeys';
import { useSupportMode } from './useSupportMode';

const TABS: { id: TicketStatus | 'all'; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Awaiting customer' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];
const RANK: Record<TicketPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function SupportInboxPage() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: PK.tickets, queryFn: platformTicketsService.list, refetchInterval: 15000 });
  const admins = useQuery({ queryKey: [...PK.all, 'admins'], queryFn: platformAdminsService.list });
  const tenants = useQuery({ queryKey: PK.tenants, queryFn: tenantsService.list });
  const [tab, setTab] = useState<TicketStatus | 'all'>('open');
  const [priority, setPriority] = useState<'all' | TicketPriority>('all');
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim().toLowerCase());
  const selectedId = params.get('ticket');
  const supportMode = useSupportMode();

  const all = data ?? [];
  const list = useMemo(
    () =>
      all
        .filter((t) => (tab === 'all' || t.status === tab) && (priority === 'all' || t.priority === priority))
        .filter((t) => !query || `${t.number} ${t.subject} ${t.tenantName} ${t.requester}`.toLowerCase().includes(query))
        .sort((a, b) => (tab === 'open' ? RANK[a.priority] - RANK[b.priority] || a.createdAt.localeCompare(b.createdAt) : b.updatedAt.localeCompare(a.updatedAt))),
    [all, tab, priority, query],
  );
  const selected = all.find((t) => t.id === selectedId) ?? null;
  const tenant = selected ? tenants.data?.find((t) => t.id === selected.tenantId) : undefined;
  const select = (t: SupportTicket | null) => setParams(t ? { ticket: t.id } : {}, { replace: true });

  const avgResponse = useMemo(() => {
    const waits = all
      .map((t) => {
        const first = t.messages.find((m) => m.from === 'agent');
        return first ? (new Date(first.at).getTime() - new Date(t.createdAt).getTime()) / 60_000 : null;
      })
      .filter((m): m is number => m !== null);
    if (!waits.length) return '—';
    const avg = waits.reduce((a, b) => a + b, 0) / waits.length;
    return avg < 60 ? `${Math.max(1, Math.round(avg))} min` : `${(avg / 60).toFixed(1)} hrs`;
  }, [all]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    all.forEach((t) => (c[t.status] = (c[t.status] ?? 0) + 1));
    return c;
  }, [all]);

  const reply = useAppMutation(
    ({ id, text, from }: { id: string; text: string; from: 'agent' | 'note' }) => platformTicketsService.reply(id, { from, text }),
    { invalidate: [PK.all], success: (t) => (t.messages[t.messages.length - 1].from === 'note' ? 'Internal note added' : `Reply sent to ${t.requester}`) },
  );
  const update = useAppMutation(({ id, patch }: { id: string; patch: { status?: TicketStatus; priority?: TicketPriority; assignee?: string } }) => platformTicketsService.update(id, patch), {
    invalidate: [PK.all],
    success: 'Ticket updated',
  });

  return (
    <>
      <PageHeader title="Support" description="Help businesses quickly — every request from every workspace lands here." />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Open tickets" value={counts.open ?? 0} icon={Inbox} loading={isLoading} hint={`${all.filter((t) => t.status === 'open' && RANK[t.priority] <= 1).length} high priority`} accent />
        <StatCard label="Awaiting customer" value={counts.pending ?? 0} icon={Clock} loading={isLoading} />
        <StatCard label="Resolved" value={(counts.resolved ?? 0) + (counts.closed ?? 0)} icon={CheckCircle2} loading={isLoading} />
        <StatCard label="Avg. first response" value={avgResponse} icon={Headset} loading={isLoading} hint={avgResponse === '—' ? 'no replies yet' : 'across answered tickets'} />
      </div>

      <Card className="grid min-h-[620px] overflow-hidden xl:grid-cols-[360px_1fr_300px]">
        {/* Queue */}
        <section className={cn('flex min-h-0 flex-col border-border xl:border-r', selected && 'hidden xl:flex')} aria-label="Ticket queue">
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets, businesses…" aria-label="Search tickets" className="h-9 w-full rounded-lg border border-border bg-surface/60 pl-9 pr-3 text-[13px] outline-none focus:border-primary/50" />
            </div>
            <div className="scrollbar-none flex gap-1 overflow-x-auto" role="tablist" aria-label="Status">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn('shrink-0 rounded-md px-2.5 py-1 text-xs font-medium', tab === t.id ? 'bg-primary-light text-primary' : 'text-muted-foreground hover:text-foreground')}>
                  {t.label} <span className="tabular opacity-70">{counts[t.id] ?? 0}</span>
                </button>
              ))}
            </div>
            <NativeSelect value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="h-8 text-xs" aria-label="Priority filter">
              <option value="all">All priorities</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </NativeSelect>
          </div>
          <ul className="scrollbar-thin max-h-[640px] flex-1 divide-y divide-border overflow-y-auto">
            {isLoading && Array.from({ length: 6 }, (_, i) => <li key={i} className="p-4"><Skeleton className="h-12" /></li>)}
            {!isLoading && list.length === 0 && <li className="px-6 py-16 text-center text-[13px] text-muted-foreground">No tickets here.</li>}
            {list.map((t) => {
              const last = t.messages[t.messages.length - 1];
              const needsReply = t.status === 'open' && last.from === 'customer';
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => select(t)} aria-current={selected?.id === t.id} className={cn('w-full px-4 py-3 text-left transition-colors', selected?.id === t.id ? 'bg-primary-soft' : 'hover:bg-surface')}>
                    <div className="flex items-center gap-2">
                      {needsReply && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Needs reply" />}
                      <span className="flex-1 truncate text-[13px] font-semibold">{t.subject}</span>
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.tenantName} · {t.requester}</p>
                    <p className="mt-1 flex items-center justify-between text-2xs text-subtle">
                      <span>{t.number} · {CATEGORY_LABEL[t.category]}</span>
                      <span>{timeAgo(t.updatedAt)}</span>
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Conversation */}
        <section className={cn('flex min-h-[520px] flex-col', !selected && 'hidden xl:flex')} aria-label="Conversation">
          {selected ? (
            <>
              <header className="flex items-center gap-3 border-b border-border px-5 py-4">
                <Button variant="ghost" size="icon-sm" className="xl:hidden" onClick={() => select(null)} aria-label="Back to queue"><ArrowLeft /></Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{selected.subject}</p>
                  <p className="text-xs text-muted-foreground">{selected.number} · opened {formatDateTime(selected.createdAt)}</p>
                </div>
                <StatusBadge status={selected.status} />
              </header>
              <TicketThread ticket={selected} viewer="agent" sending={reply.isPending} onSend={(text, from) => reply.mutate({ id: selected.id, text, from: from === 'note' ? 'note' : 'agent' })} />
            </>
          ) : (
            <EmptyState icon={Headset} title="Select a ticket" description="Pick a conversation from the queue to reply, assign or resolve it." className="m-auto" />
          )}
        </section>

        {/* Details */}
        {selected && (
          <aside className="space-y-5 border-t border-border p-5 xl:border-l xl:border-t-0" aria-label="Ticket details">
            <div className="flex items-center gap-3">
              <Avatar name={selected.requester} size="md" />
              <div className="min-w-0"><p className="truncate text-[13px] font-semibold">{selected.requester}</p><p className="truncate text-xs text-muted-foreground">{selected.email}</p></div>
            </div>
            <div className="space-y-3">
              <label className="block space-y-1.5"><span className="text-xs font-medium">Status</span>
                <NativeSelect value={selected.status} onChange={(e) => update.mutate({ id: selected.id, patch: { status: e.target.value as TicketStatus } })}>
                  <option value="open">Open</option><option value="pending">Awaiting customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
                </NativeSelect>
              </label>
              <label className="block space-y-1.5"><span className="text-xs font-medium">Priority</span>
                <NativeSelect value={selected.priority} onChange={(e) => update.mutate({ id: selected.id, patch: { priority: e.target.value as TicketPriority } })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </NativeSelect>
              </label>
              <label className="block space-y-1.5"><span className="text-xs font-medium">Assigned to</span>
                <NativeSelect value={selected.assignee ?? ''} onChange={(e) => update.mutate({ id: selected.id, patch: { assignee: e.target.value } })}>
                  <option value="">Unassigned</option>
                  {admins.data?.filter((a) => a.status !== 'suspended').map((a) => <option key={a.id}>{a.name}</option>)}
                  {selected.assignee && !admins.data?.some((a) => a.name === selected.assignee) && <option>{selected.assignee}</option>}
                </NativeSelect>
              </label>
            </div>
            <div className="flex gap-2">
              {selected.status === 'resolved' || selected.status === 'closed' ? (
                <Button variant="secondary" className="flex-1" onClick={() => update.mutate({ id: selected.id, patch: { status: 'open' } })}><RotateCcw /> Reopen</Button>
              ) : (
                <Button variant="success" className="flex-1" onClick={() => update.mutate({ id: selected.id, patch: { status: 'resolved' } })}><CheckCircle2 /> Mark resolved</Button>
              )}
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="section-label mb-3">Business</p>
              {tenant ? (
                <>
                  <DetailList columns={1} items={[['Name', tenant.name], ['Plan', PLAN_LABEL[tenant.plan]], ['Status', <StatusBadge key="s" status={tenant.status} />], ['City', tenant.city], ['Phone', tenant.phone]]} />
                  <Button variant="soft" className="mt-4 w-full" onClick={() => supportMode(tenant)} disabled={tenant.status === 'suspended'}><LogIn /> Open in support mode</Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{selected.tenantName}</p>
              )}
            </div>
          </aside>
        )}
      </Card>
    </>
  );
}
