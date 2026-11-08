import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, Building2, CalendarDays, Download, FileSpreadsheet, FileText, Landmark, Package, PiggyBank, Truck, UsersRound, Users, Wallet, CreditCard, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { AreaTrendChart, BarsChart, ChartLegend, DonutChart } from '@/components/charts/Charts';
import { ChartCard } from '@/components/charts/ChartCard';
import { useChartTheme } from '@/components/charts/useChartTheme';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { BRANCHES } from '@/app/config/constants';
import { formatINR, formatNumber } from '@/lib/format';
import { cn, downloadTextFile, toCsv } from '@/lib/utils';
import { reportsService, type CellFormat, type ReportCategory } from '@/services';
import { useAuth } from '@/app/providers/AuthProvider';
import { usePageAccess } from '@/hooks/usePageAccess';

/** `pages`: the report shows only if the user can open at least one of them (same rule on the server). */
const CATEGORIES: { id: ReportCategory; label: string; icon: LucideIcon; description: string; pages: string[] }[] = [
  { id: 'sales', label: 'Sales', icon: BarChart3, description: 'Revenue, invoices and categories', pages: ['sales', 'pos'] },
  { id: 'profit', label: 'Profit', icon: PiggyBank, description: 'P&L and margins', pages: ['sales', 'pos'] },
  { id: 'inventory', label: 'Inventory', icon: Package, description: 'Stock value and turnover', pages: ['inventory'] },
  { id: 'customers', label: 'Customers', icon: Users, description: 'Segments, top buyers, dues', pages: ['customers'] },
  { id: 'vendors', label: 'Vendors', icon: Truck, description: 'Purchases and payables', pages: ['vendors', 'purchases'] },
  { id: 'expenses', label: 'Expenses', icon: Wallet, description: 'Spending by category', pages: ['expenses'] },
  { id: 'employees', label: 'Employees', icon: UsersRound, description: 'Attendance and performance', pages: ['employees', 'attendance', 'payroll'] },
  { id: 'gst', label: 'GST', icon: Landmark, description: 'Tax by rate and liability', pages: ['gst'] },
  { id: 'payments', label: 'Payments', icon: CreditCard, description: 'Collections by method', pages: ['sales', 'pos'] },
];

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This financial year' },
];
const BRANCH_OPTIONS = [{ value: 'all', label: 'All Branches' }, ...BRANCHES.map((b) => ({ value: b.id, label: b.name }))];

function fmt(format: CellFormat, v: string | number) {
  if (typeof v === 'string') return v;
  if (format === 'currency') return formatINR(v);
  if (format === 'percent') return `${v.toFixed(1)}%`;
  if (format === 'number') return Number.isInteger(v) ? formatNumber(v) : v.toFixed(1);
  return String(v);
}

export function ReportsPage() {
  const c = useChartTheme();
  const { can } = usePageAccess();
  const { hasPermission } = useAuth();
  // Only reports whose pages this business and role can open (profit also needs the "view profit" permission).
  const available = CATEGORIES.filter((cat) => cat.pages.some((p) => can(p)) && (cat.id !== 'profit' || hasPermission('Reports', 'viewProfit')));
  const [picked, setCategory] = useState<ReportCategory>('sales');
  const category = available.some((x) => x.id === picked) ? picked : available[0]?.id;
  const [range, setRange] = useState('30d');
  const [branch, setBranch] = useState('all');
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['reports', category, range, branch],
    queryFn: () => reportsService.get(category!, range, branch),
    placeholderData: keepPreviousData,
    enabled: !!category,
  });
  const meta = CATEGORIES.find((x) => x.id === category);
  if (!meta) {
    return (
      <>
        <PageHeader title="Reports" description="Business analytics across sales, stock, people and tax." />
        <EmptyState icon={BarChart3} title="No reports available" description="Your role doesn’t have access to any of the pages these reports are built from." />
      </>
    );
  }

  const exportAs = (kind: 'csv' | 'pdf' | 'excel') => {
    if (!data) return;
    if (kind === 'pdf') {
      // The browser's print dialog can save the report as PDF.
      window.print();
      return;
    }
    // CSV opens directly in Excel and Google Sheets.
    downloadTextFile(`sahasra-${category}-report-${range}.csv`, toCsv(data.table.rows), 'text/csv');
    toast.success(`${meta.label} report downloaded`, { description: kind === 'excel' ? 'CSV file — opens in Excel.' : undefined });
  };

  const columns: Column<Record<string, string | number>>[] =
    data?.table.columns.map((col, i) => ({
      id: col.key,
      header: col.label,
      hideable: i !== 0,
      align: col.format === 'text' ? 'left' : 'right',
      sortValue: (r) => r[col.key],
      cell: (r) => <span className={i === 0 ? 'font-medium' : ''}>{fmt(col.format, r[col.key])}</span>,
    })) ?? [];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Business analytics across sales, stock, people and tax."
        actions={
          <>
            <Select value={range} onValueChange={setRange} options={RANGES} icon={<CalendarDays />} ariaLabel="Date range" />
            <Select value={branch} onValueChange={setBranch} options={BRANCH_OPTIONS} icon={<Building2 />} ariaLabel="Branch" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={!data}><Download /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => exportAs('csv')}><FileText /> CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs('excel')}><FileSpreadsheet /> Excel</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs('pdf')}><FileText /> PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Report categories" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
          {available.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              aria-current={category === cat.id ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                category === cat.id ? 'bg-primary text-white shadow-primary' : 'border border-border bg-card hover:border-primary/30 lg:border-transparent lg:bg-transparent lg:hover:bg-card',
              )}
            >
              <cat.icon className="h-4 w-4 shrink-0" />
              <span>
                <span className="block text-[13px] font-medium">{cat.label}</span>
                <span className={cn('hidden text-2xs lg:block', category === cat.id ? 'text-white/75' : 'text-muted-foreground')}>{cat.description}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className={cn('min-w-0 space-y-5 transition-opacity', isFetching && !isLoading && 'opacity-60')}>
          <div className="stagger grid grid-cols-2 gap-4 xl:grid-cols-4" key={category}>
            {(data?.kpis ?? Array.from({ length: 4 }, () => null)).map((k, i) =>
              k ? <StatCard key={k.label} label={k.label} value={fmt(k.format, k.value)} change={k.change} invertTrend={category === 'expenses'} /> : <StatCard key={i} label="" value="" loading />,
            )}
          </div>

          <ChartCard
            title={data?.chart.title ?? meta.label}
            description={`${RANGES.find((r) => r.value === range)?.label} · ${BRANCH_OPTIONS.find((b) => b.value === branch)?.label}`}
            loading={isLoading}
            height={300}
            actions={data && data.chart.type !== 'donut' && <ChartLegend items={data.chart.series.map((s, i) => ({ label: s, color: i === 0 ? c.primary : c.secondary, dashed: data.chart.type === 'area' && i === 1 }))} />}
          >
            {data &&
              (data.chart.type === 'area' ? (
                <AreaTrendChart data={data.chart.data} xKey="label" height={300} series={data.chart.series.length > 1 ? [{ key: 'value', label: data.chart.series[0] }, { key: 'value2', label: data.chart.series[1]! }] : [{ key: 'value', label: data.chart.series[0] }]} />
              ) : data.chart.type === 'bar' ? (
                <BarsChart data={data.chart.data} xKey="label" height={300} format={category === 'customers' ? 'number' : 'currency'} series={data.chart.series.length > 1 ? [{ key: 'value', label: data.chart.series[0] }, { key: 'value2', label: data.chart.series[1]! }] : [{ key: 'value', label: data.chart.series[0] }]} />
              ) : (
                <DonutChart data={data.chart.data.map((d) => ({ name: d.label, value: d.value }))} height={260} format={category === 'customers' ? 'number' : 'currency'} />
              ))}
          </ChartCard>

          <div>
            <h2 className="mb-3 text-[15px] font-semibold">{data?.table.title ?? 'Details'}</h2>
            <DataTable
              key={category}
              data={data?.table.rows}
              isLoading={isLoading}
              columns={columns}
              getRowId={(r) => String(Object.values(r)[0])}
              searchText={(r) => Object.values(r).join(' ')}
              searchPlaceholder="Search this report"
              empty={<EmptyState icon={BarChart3} title="No data for this period." description="Try a wider date range or a different branch." />}
            />
          </div>
        </div>
      </div>
    </>
  );
}
