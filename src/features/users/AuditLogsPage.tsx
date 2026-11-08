import { useQuery } from '@tanstack/react-query';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { CheckCircle2, Download, FilePlus2, History, LogIn, Pencil, RotateCcw, Search, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { qk } from '@/hooks/queries';
import { formatTime } from '@/lib/format';
import { cn, downloadTextFile, groupBy, toCsv } from '@/lib/utils';
import { auditService } from '@/services';
import type { AuditLog } from '@/types';

const ACTION_META: Record<AuditLog['action'], { icon: LucideIcon; tone: string }> = {
  created: { icon: FilePlus2, tone: 'bg-success-soft text-success' },
  edited: { icon: Pencil, tone: 'bg-primary-light text-primary' },
  deleted: { icon: Trash2, tone: 'bg-danger-soft text-danger' },
  approved: { icon: CheckCircle2, tone: 'bg-success-soft text-success' },
  exported: { icon: Upload, tone: 'bg-info-soft text-info' },
  'logged in': { icon: LogIn, tone: 'bg-surface text-muted-foreground' },
  refunded: { icon: RotateCcw, tone: 'bg-warning-soft text-warning' },
};

function dayLabel(iso: string) {
  const d = parseISO(iso);
  return isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEEE, d MMMM');
}

export function AuditLogsPage() {
  const { data, isLoading } = useQuery({ queryKey: qk.audit, queryFn: auditService.list });
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q);
  const [module, setModule] = useState('all');
  const [user, setUser] = useState('all');

  const modules = useMemo(() => Array.from(new Set((data ?? []).map((l) => l.module))), [data]);
  const users = useMemo(() => Array.from(new Set((data ?? []).map((l) => l.user))), [data]);

  const filtered = (data ?? []).filter(
    (l) =>
      (module === 'all' || l.module === module) &&
      (user === 'all' || l.user === user) &&
      (!deferred || `${l.user} ${l.target} ${l.details} ${l.module}`.toLowerCase().includes(deferred.toLowerCase())),
  );
  const groups = groupBy(filtered, (l) => dayLabel(l.at));

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="A tamper-evident record of every important change in your workspace."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              downloadTextFile('sahasra-audit-log.csv', toCsv(filtered.map((l) => ({ User: l.user, Action: l.action, Module: l.module, Target: l.target, Details: l.details, Date: format(parseISO(l.at), 'dd MMM yyyy'), Time: formatTime(l.at), IP: l.ip }))), 'text/csv');
              toast.success('Audit log exported');
            }}
          >
            <Download /> Export
          </Button>
        }
      />
      <Card className="mb-5 flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
        <div className="flex-1 sm:max-w-sm"><Input value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<Search />} placeholder="Search user, invoice or change" aria-label="Search audit logs" /></div>
        <Select value={module} onValueChange={setModule} options={[{ value: 'all', label: 'All modules' }, ...modules.map((m) => ({ value: m, label: m }))]} ariaLabel="Module" />
        <Select value={user} onValueChange={setUser} options={[{ value: 'all', label: 'All users' }, ...users.map((u) => ({ value: u, label: u }))]} ariaLabel="User" />
      </Card>

      {isLoading ? (
        <Card className="space-y-4 p-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={History} title="No matching activity" description="Try another search or clear the filters." /></Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([day, logs]) => (
            <section key={day}>
              <h2 className="section-label mb-3">{day}</h2>
              <Card className="p-5">
                <ol className="relative">
                  {logs.map((l, i) => {
                    const meta = ACTION_META[l.action];
                    return (
                      <li key={l.id} className="relative flex gap-4 pb-6 last:pb-0">
                        {i < logs.length - 1 && <span className="absolute left-[15px] top-9 h-[calc(100%-28px)] w-px bg-border" aria-hidden />}
                        <span className={cn('relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card', meta.tone)}><meta.icon className="h-3.5 w-3.5" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <p className="text-[13px] leading-snug">
                              <span className="inline-flex items-center gap-1.5 align-middle"><Avatar name={l.user} size="xs" /><b className="font-semibold">{l.user}</b></span>{' '}
                              <span className="text-muted-foreground">{l.action}</span> <b className="font-semibold">{l.target}</b>
                            </p>
                            <span className="shrink-0 text-xs text-subtle">{formatTime(l.at)}</span>
                          </div>
                          <p className="mt-1 text-[13px] text-muted-foreground">{l.details}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-subtle">
                            <Badge tone="neutral">{l.module}</Badge>
                            <span>IP {l.ip}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
