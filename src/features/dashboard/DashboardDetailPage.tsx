import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, CircleAlert } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BRANCHES } from '@/app/config/constants';
import { DATE_RANGES, useWorkspace, type DateRangeKey } from '@/app/providers/WorkspaceProvider';
import { BarsChart, DonutChart } from '@/components/charts/Charts';
import { ChartCard } from '@/components/charts/ChartCard';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { qk } from '@/hooks/queries';
import { formatDateTime, formatINR, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboardService, type DetailMap, type Group, type ProfitRow } from '@/services';
import { PAYMENT_LABELS } from '@/features/sales/salesMeta';

type Kind = keyof DetailMap;
const KINDS: Record<Kind, { title: string; description: string }> = {
  sales: { title: 'Sales', description: 'Every bill with its time, plus what sold by category and item.' },
  collection: { title: 'Collection', description: 'Money received by payment mode — bills, old dues and advances — less refunds.' },
  expenses: { title: 'Expenses', description: 'Every expense with its category and how it was paid.' },
  profit: { title: 'Profit', description: 'Sales before GST, minus what the goods cost you, minus expenses.' },
};
const BRANCH_OPTIONS = [{ value: 'all', label: 'All Branches' }, ...BRANCHES.map((b) => ({ value: b.id, label: b.name }))];
const money = (v: number) => formatINR(v, Math.round(v * 100) % 100 !== 0);

/** A ranked list with a share bar — category / payment-mode breakdowns. */
function ShareList({ rows, empty, qtyLabel }: { rows: Group[]; empty: string; qtyLabel?: string }) {
  const total = rows.reduce((s, r) => s + r.amount, 0) || 1;
  if (!rows.length) return <p className="py-8 text-center text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium">{r.name}</span>
            <span className="tabular shrink-0 font-semibold">{money(r.amount)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (r.amount / total) * 100)}%` }} />
            </div>
            <span className="tabular w-24 shrink-0 text-right text-2xs text-muted-foreground">
              {qtyLabel ? `${Number(r.qty.toFixed(2))} ${qtyLabel}` : `${r.count} ${r.count === 1 ? 'entry' : 'entries'}`} · {Math.round((r.amount / total) * 100)}%
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ data, loading, hourly, title }: { data?: { label: string; amount: number }[]; loading: boolean; hourly: boolean; title: string }) {
  return (
    <ChartCard title={title} description={hourly ? 'By hour' : 'By day'} loading={loading} height={240}>
      {data && data.length ? <BarsChart data={data} xKey="label" series={[{ key: 'amount', label: title }]} height={240} /> : <p className="py-16 text-center text-[13px] text-muted-foreground">Nothing in this period.</p>}
    </ChartCard>
  );
}

function SalesView({ d, loading, hourly }: { d?: DetailMap['sales']; loading: boolean; hourly: boolean }) {
  const columns: Column<DetailMap['sales']['bills'][number]>[] = [
    { id: 'time', header: 'Time', sortValue: (b) => b.date, cell: (b) => <span className="tabular whitespace-nowrap">{hourly ? formatTime(b.date) : formatDateTime(b.date)}</span> },
    { id: 'invoice', header: 'Bill', hideable: false, cell: (b) => <Link to={`/sales?invoice=${encodeURIComponent(b.invoiceNo)}`} className="font-semibold text-primary hover:underline">{b.invoiceNo}</Link> },
    { id: 'customer', header: 'Customer', cell: (b) => b.customerName },
    { id: 'items', header: 'Items', cell: (b) => <span className="block max-w-[340px] truncate text-muted-foreground" title={b.items}>{b.items}</span> },
    { id: 'payment', header: 'Paid by', cell: (b) => PAYMENT_LABELS[b.payment as keyof typeof PAYMENT_LABELS] ?? b.payment },
    { id: 'total', header: 'Amount', align: 'right', sortValue: (b) => b.total, cell: (b) => <span className="font-semibold">{money(b.total)}</span> },
    { id: 'status', header: 'Status', cell: (b) => <StatusBadge status={b.status} /> },
  ];
  return (
    <>
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total sales" value={d ? money(d.summary.total) : '—'} loading={loading} accent hint={d ? `${money(d.summary.beforeGst)} + GST ${money(d.summary.gst)}` : undefined} />
        <StatCard label="Bills" value={d?.summary.bills ?? '—'} loading={loading} />
        <StatCard label="Average bill" value={d ? money(d.summary.average) : '—'} loading={loading} />
        <StatCard label="Items sold" value={d ? Number(d.summary.itemsSold.toFixed(2)) : '—'} loading={loading} hint={d && d.summary.discount ? `Discounts ${money(d.summary.discount)}` : undefined} />
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Timeline data={d?.timeline} loading={loading} hourly={hourly} title="Sales" />
        <Card>
          <CardHeader title="By category" description="Amounts before GST" />
          <CardContent className="pt-4">{d && <ShareList rows={d.byCategory} empty="No sales in this period." qtyLabel="sold" />}</CardContent>
        </Card>
      </div>
      <Card className="mb-5">
        <CardHeader title="Top items" description="What sold, before GST" />
        <CardContent className="pt-4">
          {d && (
            <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
              {d.byItem.slice(0, 20).map((i, n) => (
                <div key={i.name} className="flex items-center gap-3 text-[13px]">
                  <span className="tabular w-5 text-2xs text-subtle">{n + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  <span className="tabular text-xs text-muted-foreground">× {Number(i.qty.toFixed(2))}</span>
                  <span className="tabular w-24 text-right font-semibold">{money(i.amount)}</span>
                </div>
              ))}
              {!d.byItem.length && <p className="text-[13px] text-muted-foreground">No items sold in this period.</p>}
            </div>
          )}
        </CardContent>
      </Card>
      <DataTable data={d?.bills} isLoading={loading} columns={columns} getRowId={(b) => b.id} searchText={(b) => `${b.invoiceNo} ${b.customerName} ${b.items}`} searchPlaceholder="Search bill, customer or item" empty={<EmptyState icon={CalendarDays} title="No bills in this period." description="Bills appear here as soon as they are made in POS." />} />
    </>
  );
}

function CollectionView({ d, loading, hourly }: { d?: DetailMap['collection']; loading: boolean; hourly: boolean }) {
  const columns: Column<DetailMap['collection']['entries'][number]>[] = [
    { id: 'time', header: 'Time', sortValue: (e) => e.date, cell: (e) => <span className="tabular whitespace-nowrap">{hourly ? formatTime(e.date) : formatDateTime(e.date)}</span> },
    { id: 'mode', header: 'Mode', cell: (e) => <Badge tone={e.amount < 0 ? 'danger' : 'primary'}>{e.method}</Badge> },
    { id: 'kind', header: 'For', cell: (e) => e.kind },
    { id: 'ref', header: 'Reference', cell: (e) => <span className="text-muted-foreground">{e.reference}</span> },
    { id: 'customer', header: 'Customer', cell: (e) => e.customerName },
    { id: 'amount', header: 'Amount', align: 'right', sortValue: (e) => e.amount, cell: (e) => <span className={cn('font-semibold', e.amount < 0 && 'text-danger')}>{e.amount < 0 ? '− ' : ''}{money(Math.abs(e.amount))}</span> },
  ];
  return (
    <>
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Net collection" value={d ? money(d.summary.net) : '—'} loading={loading} accent />
        <StatCard label="Received" value={d ? money(d.summary.received) : '—'} loading={loading} hint={d ? `${d.summary.payments} payments` : undefined} />
        <StatCard label="Refunded" value={d ? money(d.summary.refunds) : '—'} loading={loading} />
        <StatCard label="Top mode" value={d?.byMode[0]?.name ?? '—'} loading={loading} hint={d?.byMode[0] ? money(d.byMode[0].amount) : undefined} />
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <ChartCard title="By payment mode" loading={loading} height={220}>
          {d && <DonutChart data={d.byMode.map((m) => ({ name: m.name, value: m.amount }))} center={{ label: 'Received', value: money(d.summary.received) }} stacked />}
        </ChartCard>
        <Card>
          <CardHeader title="Payment modes" description="Cash, UPI, card and others" />
          <CardContent className="pt-4">{d && <ShareList rows={d.byMode} empty="No payments in this period." />}</CardContent>
        </Card>
        <Card>
          <CardHeader title="Collected for" description="New bills, old dues and advances" />
          <CardContent className="pt-4">{d && <ShareList rows={d.byKind} empty="No payments in this period." />}</CardContent>
        </Card>
      </div>
      <div className="mb-5">
        <Timeline data={d?.timeline} loading={loading} hourly={hourly} title="Collection" />
      </div>
      <DataTable
        data={d?.entries}
        isLoading={loading}
        columns={columns}
        getRowId={(e) => e.id}
        searchText={(e) => `${e.method} ${e.reference} ${e.customerName} ${e.kind}`}
        searchPlaceholder="Search mode, bill or customer"
        filters={[{ id: 'mode', label: 'Modes', options: (d?.byMode ?? []).map((m) => ({ value: m.name, label: m.name })), predicate: (e, v) => e.method === v }]}
        empty={<EmptyState icon={CalendarDays} title="No payments in this period." description="Payments appear here as bills are paid and dues are collected." />}
      />
    </>
  );
}

function ExpensesView({ d, loading, hourly }: { d?: DetailMap['expenses']; loading: boolean; hourly: boolean }) {
  const columns: Column<DetailMap['expenses']['entries'][number]>[] = [
    { id: 'time', header: 'Date', sortValue: (e) => e.date, cell: (e) => <span className="tabular whitespace-nowrap">{hourly ? formatTime(e.date) : formatDateTime(e.date)}</span> },
    { id: 'title', header: 'Expense', hideable: false, cell: (e) => <span className="font-medium">{e.title}</span> },
    { id: 'category', header: 'Category', cell: (e) => e.category },
    { id: 'paidTo', header: 'Paid to', cell: (e) => e.paidTo },
    { id: 'mode', header: 'Mode', cell: (e) => <Badge tone="neutral">{e.method}</Badge> },
    { id: 'amount', header: 'Amount', align: 'right', sortValue: (e) => e.amount, cell: (e) => <span className="font-semibold">{money(e.amount)}</span> },
    { id: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
  ];
  return (
    <>
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total expenses" value={d ? money(d.summary.total) : '—'} loading={loading} accent />
        <StatCard label="Entries" value={d?.summary.count ?? '—'} loading={loading} />
        <StatCard label="Largest category" value={d?.byCategory[0]?.name ?? '—'} loading={loading} hint={d?.byCategory[0] ? money(d.byCategory[0].amount) : undefined} />
        <StatCard label="Not yet paid" value={d ? money(d.summary.pending) : '—'} loading={loading} />
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="By category" />
          <CardContent className="pt-4">{d && <ShareList rows={d.byCategory} empty="No expenses in this period." />}</CardContent>
        </Card>
        <Card>
          <CardHeader title="By payment mode" />
          <CardContent className="pt-4">{d && <ShareList rows={d.byMode} empty="No expenses in this period." />}</CardContent>
        </Card>
      </div>
      <DataTable data={d?.entries} isLoading={loading} columns={columns} getRowId={(e) => e.id} searchText={(e) => `${e.title} ${e.category} ${e.paidTo} ${e.method}`} searchPlaceholder="Search expense, category or payee" empty={<EmptyState icon={CalendarDays} title="No expenses in this period." description="Expenses you record appear here." />} />
    </>
  );
}

function ProfitView({ d, loading }: { d?: DetailMap['profit']; loading: boolean }) {
  const s = d?.summary;
  const columns = (label: string): Column<ProfitRow>[] => [
    { id: 'name', header: label, hideable: false, sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}{r.noCost && <span className="ml-2 text-2xs font-normal text-warning">no cost price</span>}</span> },
    { id: 'qty', header: 'Qty', align: 'right', sortValue: (r) => r.qty, cell: (r) => Number(r.qty.toFixed(2)) },
    { id: 'sales', header: 'Sales (before GST)', align: 'right', sortValue: (r) => r.sales, cell: (r) => money(r.sales) },
    { id: 'cost', header: 'Cost', align: 'right', sortValue: (r) => r.cost, cell: (r) => <span className="text-muted-foreground">{money(r.cost)}</span> },
    { id: 'profit', header: 'Profit', align: 'right', sortValue: (r) => r.profit, cell: (r) => <span className={cn('font-semibold', r.profit < 0 ? 'text-danger' : 'text-success')}>{money(r.profit)}</span> },
    { id: 'margin', header: 'Margin', align: 'right', sortValue: (r) => r.margin, cell: (r) => `${r.margin}%` },
  ];
  const Line = ({ label, value, minus, strong, hint }: { label: string; value: number; minus?: boolean; strong?: boolean; hint?: string }) => (
    <div className={cn('flex items-baseline justify-between gap-4 py-2', strong && 'border-t border-border pt-3 text-[15px] font-semibold')}>
      <span>{label}{hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}</span>
      <span className={cn('tabular', strong && (value < 0 ? 'text-danger' : 'text-success'))}>{minus || value < 0 ? '− ' : ''}{money(Math.abs(value))}</span>
    </div>
  );
  return (
    <>
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Net profit" value={s ? money(s.netProfit) : '—'} loading={loading} accent hint={s ? `${s.netMargin}% of sales` : undefined} />
        <StatCard label="Gross profit" value={s ? money(s.grossProfit) : '—'} loading={loading} hint={s ? `${s.grossMargin}% margin` : undefined} />
        <StatCard label="Cost of goods sold" value={s ? money(s.cost) : '—'} loading={loading} />
        <StatCard label="Expenses" value={s ? money(s.expenses) : '—'} loading={loading} />
      </div>
      {s && s.itemsWithoutCost > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl bg-warning-soft px-4 py-3 text-[13px]">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            {s.itemsWithoutCost} item{s.itemsWithoutCost === 1 ? ' has' : 's have'} no cost price, so {s.itemsWithoutCost === 1 ? 'its' : 'their'} full sale counts as profit. Add the{' '}
            <b>Purchase / cost price</b> in <Link to="/products" className="font-semibold text-primary hover:underline">Products / Menu</Link> for an accurate profit.
          </span>
        </div>
      )}
      <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="How profit is worked out" />
          <CardContent className="pt-2 text-[13px]">
            {s && (
              <>
                <Line label="Sales (bills total)" value={s.salesInclGst} />
                <Line label="GST collected" value={s.gst} minus hint="paid to the government" />
                <Line label="Net sales" value={s.netSales} strong />
                <Line label="Cost of goods sold" value={s.cost} minus hint="what you paid for them" />
                <Line label="Gross profit" value={s.grossProfit} strong />
                <Line label="Expenses" value={s.expenses} minus hint="rent, salary, bills…" />
                <Line label="Net profit" value={s.netProfit} strong />
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Profit by category" description="Each bar is the sales before GST: what the goods cost you, and what you kept" />
          <CardContent className="pt-4">
            {d && d.byCategory.length ? (
              <>
                <ul className="space-y-3.5">
                  {d.byCategory.slice(0, 8).map((c) => {
                    const max = Math.max(...d.byCategory.map((x) => x.sales), 1);
                    const width = (c.sales / max) * 100;
                    const costShare = c.sales ? Math.min(100, (c.cost / c.sales) * 100) : 0;
                    return (
                      <li key={c.name}>
                        <div className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="min-w-0 truncate font-medium">{c.name}</span>
                          <span className="tabular shrink-0">
                            <span className={cn('font-semibold', c.profit < 0 ? 'text-danger' : 'text-success')}>{money(c.profit)}</span>
                            <span className="text-xs text-muted-foreground"> of {money(c.sales)} · {c.margin}%</span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-2.5 rounded-full bg-surface">
                          <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${Math.max(width, 2)}%` }}>
                            <div className="h-full bg-subtle/40" style={{ width: `${costShare}%` }} title={`Cost ${money(c.cost)}`} />
                            <div className="h-full flex-1 bg-success" title={`Profit ${money(c.profit)}`} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-subtle/40" /> Cost</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-success" /> Profit</span>
                </div>
              </>
            ) : (
              <p className="py-16 text-center text-[13px] text-muted-foreground">No sales in this period.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-5">
        <DataTable data={d?.byItem} isLoading={loading} columns={columns('Item')} getRowId={(r) => r.name} searchText={(r) => r.name} searchPlaceholder="Search item" empty={<EmptyState icon={CalendarDays} title="No sales in this period." description="Profit appears here once you make sales." />} />
        <DataTable data={d?.byCategory} isLoading={loading} columns={columns('Category')} getRowId={(r) => r.name} empty={<EmptyState icon={CalendarDays} title="No sales in this period." description="" />} />
      </div>
    </>
  );
}

/** The page behind each dashboard card (Sales, Collection, Expenses, Profit). */
export function DashboardDetailPage() {
  const { kind = '' } = useParams();
  const { branch, dateRange, update } = useWorkspace();
  const valid = kind in KINDS;
  const k = (valid ? kind : 'sales') as Kind;
  const q = useQuery({ queryKey: qk.dashboard('details', k, dateRange, branch), queryFn: () => dashboardService.details(k, dateRange, branch), enabled: valid });
  if (!valid) return <Navigate to="/dashboard" replace />;
  const meta = KINDS[k];
  const rangeLabel = DATE_RANGES.find((r) => r.value === dateRange)?.label ?? 'Today';
  const hourly = dateRange === 'today' || dateRange === 'yesterday';

  return (
    <>
      <PageHeader
        title={`${meta.title} · ${rangeLabel}`}
        description={meta.description}
        back={{ to: '/dashboard', label: 'Dashboard' }}
        actions={
          <>
            {k !== 'expenses' && <Select value={branch} onValueChange={(v) => update({ branch: v })} options={BRANCH_OPTIONS} icon={<Building2 />} ariaLabel="Branch" />}
            <Select value={dateRange} onValueChange={(v) => update({ dateRange: v as DateRangeKey })} options={DATE_RANGES} icon={<CalendarDays />} ariaLabel="Date range" />
          </>
        }
      />
      {q.isError ? (
        <Card><EmptyState icon={CircleAlert} title="Couldn’t load these details." description={q.error instanceof Error ? q.error.message : 'Please try again.'} /></Card>
      ) : k === 'sales' ? (
        <SalesView d={q.data as DetailMap['sales'] | undefined} loading={q.isLoading} hourly={hourly} />
      ) : k === 'collection' ? (
        <CollectionView d={q.data as DetailMap['collection'] | undefined} loading={q.isLoading} hourly={hourly} />
      ) : k === 'expenses' ? (
        <ExpensesView d={q.data as DetailMap['expenses'] | undefined} loading={q.isLoading} hourly={hourly} />
      ) : (
        <ProfitView d={q.data as DetailMap['profit'] | undefined} loading={q.isLoading} />
      )}
    </>
  );
}
