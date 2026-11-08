import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Building2, CalendarDays, Download, Percent, TrendingUp, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BUSINESS_TYPE_MAP } from '@/app/config/business';
import { BarsChart, ChartLegend, DonutChart } from '@/components/charts/Charts';
import { ChartCard } from '@/components/charts/ChartCard';
import { useChartTheme } from '@/components/charts/useChartTheme';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { PLAN_LABEL } from '@/app/config/constants';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import { cn, downloadTextFile, toCsv } from '@/lib/utils';
import { platformStatsService, platformUsersService, tenantsService, type GrowthRange } from '@/services';
import { PK } from './platformKeys';

const RANGES: { value: GrowthRange; label: string; days: number }[] = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
  { value: '12m', label: '12 months', days: 365 },
];

export function GrowthPage() {
  const c = useChartTheme();
  const [range, setRange] = useState<GrowthRange>('30d');
  const days = RANGES.find((r) => r.value === range)!.days;
  const series = useQuery({ queryKey: PK.signups(range), queryFn: () => platformStatsService.signups(range), placeholderData: keepPreviousData });
  const tenants = useQuery({ queryKey: PK.tenants, queryFn: tenantsService.list });
  const users = useQuery({ queryKey: PK.users, queryFn: platformUsersService.list });

  const m = useMemo(() => {
    const now = new Date();
    const age = (iso: string) => differenceInCalendarDays(now, parseISO(iso));
    const ts = tenants.data ?? [];
    const us = users.data ?? [];
    const newT = ts.filter((t) => age(t.createdAt) < days);
    const prevT = ts.filter((t) => age(t.createdAt) >= days && age(t.createdAt) < days * 2);
    const newU = us.filter((u) => age(u.createdAt) < days);
    const prevU = us.filter((u) => age(u.createdAt) >= days && age(u.createdAt) < days * 2);
    const byType = Object.entries(newT.reduce<Record<string, number>>((a, t) => ((a[t.type] = (a[t.type] ?? 0) + 1), a), {}))
      .map(([type, value]) => ({ label: BUSINESS_TYPE_MAP[type as keyof typeof BUSINESS_TYPE_MAP]?.label ?? type, value }))
      .sort((a, b) => b.value - a.value);
    const byCity = Object.entries(newT.reduce<Record<string, number>>((a, t) => ((a[t.city] = (a[t.city] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const byPlan = (['trial', 'starter', 'growth', 'enterprise'] as const).map((p) => ({ name: PLAN_LABEL[p], value: newT.filter((t) => t.plan === p).length })).filter((x) => x.value > 0);
    const converted = newT.filter((t) => t.status === 'active').length;
    return {
      newT,
      newU,
      tChange: prevT.length ? ((newT.length - prevT.length) / prevT.length) * 100 : 100,
      uChange: prevU.length ? ((newU.length - prevU.length) / prevU.length) * 100 : 100,
      today: ts.filter((t) => age(t.createdAt) < 1).length,
      todayUsers: us.filter((u) => age(u.createdAt) < 1).length,
      byType,
      byCity,
      byPlan,
      conversion: newT.length ? Math.round((converted / newT.length) * 100) : 0,
      total: ts.length,
    };
  }, [tenants.data, users.data, days]);

  const loading = tenants.isLoading || users.isLoading;
  const label = RANGES.find((r) => r.value === range)!.label;

  const exportCsv = () => {
    downloadTextFile(`sahasra-new-businesses-${range}.csv`, toCsv(m.newT.map((t) => ({ Business: t.name, Industry: BUSINESS_TYPE_MAP[t.type]?.label ?? t.type, City: t.city, Owner: t.ownerName, Email: t.ownerEmail, Plan: PLAN_LABEL[t.plan], Status: t.status, Joined: formatDate(t.createdAt) }))), 'text/csv');
    toast.success(`${m.newT.length} new businesses exported`);
  };

  return (
    <>
      <PageHeader
        title="Growth & sign-ups"
        description="How many new businesses and users joined Sahasra."
        actions={
          <>
            <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="Period">
              {RANGES.map((r) => (
                <button key={r.value} role="tab" aria-selected={range === r.value} onClick={() => setRange(r.value)} className={cn('rounded-md px-3 py-1.5 text-xs font-medium', range === r.value ? 'bg-card text-primary shadow-card' : 'text-muted-foreground')}>{r.label}</button>
              ))}
            </div>
            <Button variant="secondary" onClick={exportCsv} disabled={!m.newT.length}><Download /> Export</Button>
          </>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label={`New businesses · ${label}`} value={formatNumber(m.newT.length)} icon={Building2} change={m.tChange} loading={loading} hint="vs previous period" accent />
        <StatCard label={`New users · ${label}`} value={formatNumber(m.newU.length)} icon={UserPlus} change={m.uChange} loading={loading} hint="vs previous period" />
        <StatCard label="Joined today" value={`${m.today} ${m.today === 1 ? 'business' : 'businesses'}`} icon={CalendarDays} loading={loading} hint={`${m.todayUsers} new users today`} />
        <StatCard label="Trial → paid" value={`${m.conversion}%`} icon={Percent} loading={loading} hint={`of new businesses · ${label}`} />
      </div>

      <ChartCard
        title="Sign-ups over time"
        description={range === '90d' ? 'Weekly' : range === '12m' ? 'Monthly' : 'Daily'}
        loading={series.isLoading}
        height={300}
        className="mb-5"
        actions={<ChartLegend items={[{ label: 'New businesses', color: c.primary }, { label: 'New users', color: c.secondary }]} />}
      >
        {series.data && <BarsChart data={series.data} xKey="label" format="number" height={300} series={[{ key: 'businesses', label: 'New businesses' }, { key: 'users', label: 'New users' }]} />}
      </ChartCard>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <ChartCard title="By industry" description={`New businesses · ${label}`} loading={loading} height={260}>
          {m.byType.length ? <BarsChart data={m.byType} xKey="label" layout="vertical" format="number" height={260} series={[{ key: 'value', label: 'Businesses' }]} /> : <p className="py-20 text-center text-[13px] text-muted-foreground">No sign-ups in this period.</p>}
        </ChartCard>
        <ChartCard title="By plan" description="Plan chosen at sign-up" loading={loading} height={220}>
          {m.byPlan.length ? <DonutChart data={m.byPlan} format="number" height={170} stacked center={{ label: 'New', value: formatNumber(m.newT.length) }} /> : <p className="py-20 text-center text-[13px] text-muted-foreground">No sign-ups in this period.</p>}
        </ChartCard>
        <Card>
          <CardHeader title="Top cities" description={`New businesses · ${label}`} icon={<TrendingUp />} />
          <CardContent className="space-y-3">
            {m.byCity.map(([city, n]) => (
              <div key={city}>
                <div className="mb-1 flex justify-between text-[13px]"><span>{city}</span><span className="tabular font-semibold">{n}</span></div>
                <Progress value={n} max={m.byCity[0]?.[1] ?? 1} label={city} />
              </div>
            ))}
            {!m.byCity.length && <p className="py-12 text-center text-[13px] text-muted-foreground">No sign-ups in this period.</p>}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="businesses">
        <TabsList>
          <TabsTrigger value="businesses">New businesses <Badge tone="primary">{m.newT.length}</Badge></TabsTrigger>
          <TabsTrigger value="users">New users <Badge tone="neutral">{m.newU.length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="businesses">
          <DataTable
            data={tenants.data ? m.newT : undefined}
            isLoading={loading}
            getRowId={(t) => t.id}
            searchText={(t) => `${t.name} ${t.ownerName} ${t.city}`}
            searchPlaceholder="Search new businesses"
            initialSort={{ id: 'joined', dir: 'desc' }}
            columns={[
              { id: 'name', header: 'Business', hideable: false, sortValue: (t) => t.name, cell: (t) => <div><p className="font-medium">{t.name}</p><p className="text-2xs text-subtle">{BUSINESS_TYPE_MAP[t.type]?.label} · {t.city}</p></div> },
              { id: 'owner', header: 'Owner', cell: (t) => <div><p>{t.ownerName}</p><p className="text-2xs text-subtle">{t.ownerEmail}</p></div> },
              { id: 'plan', header: 'Plan', cell: (t) => PLAN_LABEL[t.plan] },
              { id: 'joined', header: 'Joined', sortValue: (t) => t.createdAt, cell: (t) => formatDate(t.createdAt) },
              { id: 'status', header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
            ]}
            empty={<EmptyState icon={Building2} title="No new businesses" description={`Nobody signed up in the last ${label}.`} />}
          />
        </TabsContent>
        <TabsContent value="users">
          <DataTable
            data={users.data ? m.newU : undefined}
            isLoading={loading}
            getRowId={(u) => u.id}
            searchText={(u) => `${u.name} ${u.email} ${u.tenantName}`}
            searchPlaceholder="Search new users"
            initialSort={{ id: 'joined', dir: 'desc' }}
            columns={[
              { id: 'name', header: 'User', hideable: false, cell: (u) => <div><p className="font-medium">{u.name}</p><p className="text-2xs text-subtle">{u.email}</p></div> },
              { id: 'business', header: 'Business', cell: (u) => u.tenantName },
              { id: 'role', header: 'Role', cell: (u) => u.role },
              { id: 'joined', header: 'Joined', sortValue: (u) => u.createdAt, cell: (u) => formatDate(u.createdAt) },
              { id: 'status', header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
            ]}
            empty={<EmptyState icon={UserPlus} title="No new users" description={`No users joined in the last ${label}.`} />}
          />
        </TabsContent>
      </Tabs>
      <p className="mt-4 text-center text-xs text-subtle">{formatNumber(m.total)} businesses on the platform · growth shown {formatPercent(m.tChange)} vs the previous {label}</p>
    </>
  );
}
