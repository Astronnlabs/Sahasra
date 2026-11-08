import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AreaTrendChart, ChartLegend, ChartSkeleton } from '@/components/charts/Charts';
import { useChartTheme } from '@/components/charts/useChartTheme';
import { Card, CardHeader } from '@/components/ui/card';
import { qk } from '@/hooks/queries';
import { formatINR, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboardService, type SalesRange } from '@/services';

const RANGES: { value: SalesRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '3m', label: '3 Months' },
  { value: '1y', label: '1 Year' },
];

export function SalesChartWidget() {
  const [range, setRange] = useState<SalesRange>('7d');
  const c = useChartTheme();
  const { data, isLoading } = useQuery({
    queryKey: qk.dashboard('sales', range),
    queryFn: () => dashboardService.salesSeries(range),
    placeholderData: keepPreviousData,
  });

  const summary = useMemo(() => {
    if (!data) return null;
    const total = data.reduce((s, p) => s + p.sales, 0);
    const prev = data.reduce((s, p) => s + p.previous, 0);
    return { total, change: prev ? ((total - prev) / prev) * 100 : undefined, avg: total / data.length };
  }, [data]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Sales Overview"
        description="Compared with the previous period"
        actions={
          <div role="tablist" aria-label="Sales range" className="hidden gap-0.5 rounded-lg border border-border bg-surface p-0.5 sm:flex">
            {RANGES.map((r) => (
              <button
                key={r.value}
                role="tab"
                aria-selected={range === r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                  range === r.value ? 'bg-card text-primary shadow-card' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="scrollbar-none flex gap-1 overflow-x-auto px-5 pt-3 sm:hidden">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium', range === r.value ? 'bg-primary text-white' : 'bg-surface text-muted-foreground')}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-4">
        <div className="flex items-end gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Total sales</p>
            <p className="tabular text-2xl font-semibold tracking-tight">{summary ? formatINR(summary.total) : '—'}</p>
          </div>
          {summary && (
            <div className="pb-1">
              <p className="text-xs text-muted-foreground">Average</p>
              <p className="tabular text-sm font-semibold">{formatINR(Math.round(summary.avg))}</p>
            </div>
          )}
          {summary?.change !== undefined && (
            <span className={cn('mb-1.5 rounded-md px-1.5 py-0.5 text-xs font-semibold', summary.change >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
              {formatPercent(summary.change)}
            </span>
          )}
        </div>
        <ChartLegend
          items={[
            { label: 'This period', color: c.primary },
            { label: 'Previous period', color: c.secondary, dashed: true },
          ]}
        />
      </div>
      <div className="flex-1 px-3 pb-4 pt-2">
        {isLoading || !data ? (
          <ChartSkeleton height={290} />
        ) : (
          <AreaTrendChart
            data={data}
            xKey="label"
            height={290}
            series={[
              { key: 'sales', label: 'This period' },
              { key: 'previous', label: 'Previous period' },
            ]}
          />
        )}
      </div>
    </Card>
  );
}
