import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, Headset, IndianRupee, Sparkles, UserPlus, UsersRound } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BUSINESS_TYPE_MAP } from '@/app/config/business';
import { BarsChart, ChartLegend, DonutChart } from '@/components/charts/Charts';
import { ChartCard } from '@/components/charts/ChartCard';
import { useChartTheme } from '@/components/charts/useChartTheme';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PLAN_LABEL } from '@/app/config/constants';
import { formatINR, formatNumber, timeAgo } from '@/lib/format';
import { platformStatsService, tenantsService, ticketsService } from '@/services';
import { PriorityBadge } from '@/features/support/supportMeta';
import { BusinessAvatar } from './BusinessAvatar';
import { PK } from './platformKeys';

export function OverviewPage() {
  const c = useChartTheme();
  const stats = useQuery({ queryKey: PK.overview, queryFn: platformStatsService.overview, refetchInterval: 15_000 });
  const signups = useQuery({ queryKey: PK.signups('30d'), queryFn: () => platformStatsService.signups('30d') });
  const tenants = useQuery({ queryKey: PK.tenants, queryFn: tenantsService.list });
  const tickets = useQuery({ queryKey: PK.tickets, queryFn: ticketsService.list, refetchInterval: 10_000 });
  const s = stats.data;

  const plans = useMemo(() => {
    const live = (tenants.data ?? []).filter((t) => t.status === 'active' || t.status === 'trial');
    return (['trial', 'starter', 'growth', 'enterprise'] as const).map((p) => ({ name: PLAN_LABEL[p], value: live.filter((t) => t.plan === p).length }));
  }, [tenants.data]);
  const recent = (tenants.data ?? []).slice(0, 7);
  const queue = (tickets.data ?? []).filter((t) => t.status === 'open').sort((a, b) => ['urgent', 'high', 'medium', 'low'].indexOf(a.priority) - ['urgent', 'high', 'medium', 'low'].indexOf(b.priority)).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Every business on Sahasra, at a glance."
        actions={
          <>
            <Button variant="secondary" asChild><Link to="/superadmin/support"><Headset /> Support inbox</Link></Button>
            <Button asChild><Link to="/superadmin/businesses?new=1"><Building2 /> Add business</Link></Button>
          </>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Businesses" value={s ? formatNumber(s.totalBusinesses) : '—'} icon={Building2} loading={stats.isLoading} hint={s ? `${s.liveBusinesses} live · ${s.trials} on trial` : undefined} accent />
        <StatCard label="New businesses (30 days)" value={s ? formatNumber(s.new30) : '—'} icon={Sparkles} change={s?.newChange} loading={stats.isLoading} hint={s ? `${s.newToday} today · ${s.new7} this week` : undefined} />
        <StatCard label="Total users" value={s ? formatNumber(s.totalUsers) : '—'} icon={UsersRound} loading={stats.isLoading} hint={s ? `${formatNumber(s.activeUsers)} active this week · ${s.newUsersToday} new today` : undefined} />
        <StatCard label="Monthly recurring revenue" value={s ? formatINR(s.mrr) : '—'} icon={IndianRupee} loading={stats.isLoading} hint={s ? `${s.conversion}% trial conversion` : undefined} />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <ChartCard
          title="New sign-ups"
          description="Last 30 days"
          loading={signups.isLoading}
          height={260}
          className="xl:col-span-2"
          actions={
            <div className="flex items-center gap-4">
              <ChartLegend items={[{ label: 'Businesses', color: c.primary }, { label: 'Users', color: c.secondary }]} />
              <Link to="/superadmin/growth" className="text-xs font-medium text-primary hover:underline">Details</Link>
            </div>
          }
        >
          {signups.data && <BarsChart data={signups.data} xKey="label" format="number" height={260} series={[{ key: 'businesses', label: 'Businesses' }, { key: 'users', label: 'Users' }]} />}
        </ChartCard>
        <ChartCard title="Live businesses by plan" loading={tenants.isLoading} height={200}>
          <DonutChart data={plans} format="number" height={170} stacked center={{ label: 'Live', value: formatNumber(plans.reduce((a, p) => a + p.value, 0)) }} />
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Latest sign-ups" description="Newest businesses on the platform" icon={<UserPlus />} actions={<Link to="/superadmin/growth" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">View all <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
          <ul className="divide-y divide-border px-5 pb-2 pt-3">
            {tenants.isLoading
              ? Array.from({ length: 5 }, (_, i) => <li key={i} className="py-3"><Skeleton className="h-9" /></li>)
              : recent.map((t) => {
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <BusinessAvatar tenant={t} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{t.name}</p>
                        <p className="truncate text-2xs text-muted-foreground">{t.ownerName} · {t.city} · {BUSINESS_TYPE_MAP[t.type]?.label}</p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={t.status} />
                        <p className="mt-0.5 text-2xs text-subtle">{timeAgo(t.createdAt)}</p>
                      </div>
                    </li>
                  );
                })}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Support queue"
            description={s ? `${s.openTickets} open · ${s.urgentTickets} high priority` : 'Open tickets'}
            icon={<Headset />}
            actions={<Link to="/superadmin/support" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">Open inbox <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
          />
          <ul className="divide-y divide-border px-5 pb-2 pt-3">
            {queue.length === 0 && !tickets.isLoading && <li className="py-10 text-center text-[13px] text-muted-foreground">No open tickets — great work!</li>}
            {queue.map((t) => (
              <li key={t.id}>
                <Link to={`/superadmin/support?ticket=${t.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface">
                  <Avatar name={t.requester} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{t.subject}</p>
                    <p className="truncate text-2xs text-muted-foreground">{t.tenantName} · {t.number} · {timeAgo(t.createdAt)}</p>
                  </div>
                  <PriorityBadge priority={t.priority} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
