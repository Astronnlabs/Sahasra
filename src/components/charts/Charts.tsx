import { useId, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatINR, formatINRCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useChartTheme } from './useChartTheme';

type Formatter = 'currency' | 'number';
/** Keeps a readable scale (₹0–₹1K or 0–10) when every value is zero. */
const emptyMax = (f: Formatter) => (max: number) => (max > 0 ? max : f === 'currency' ? 1000 : 10);
const fmt = (f: Formatter, v: number) => (f === 'currency' ? formatINR(v) : formatNumber(v));
const fmtAxis = (f: Formatter, v: number) => (f === 'currency' ? formatINRCompact(v) : formatNumber(v));

interface SeriesDef {
  key: string;
  label: string;
}

function ChartTooltip({ active, payload, label, format }: TooltipProps<number, string> & { format: Formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-xl border border-border bg-card px-3 py-2.5 shadow-pop">
      {label !== undefined && <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-subtle">{label}</p>}
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? (p.payload as { fill?: string })?.fill }} />
              {p.name}
            </span>
            <span className="tabular font-semibold">{fmt(format, Number(p.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-3.5 rounded-full" style={{ background: i.dashed ? 'transparent' : i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : undefined }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

interface AreaTrendChartProps<T> {
  data: T[];
  xKey: keyof T & string;
  series: [SeriesDef] | [SeriesDef, SeriesDef];
  height?: number;
  format?: Formatter;
}

/** Primary series as a soft-filled area; optional comparison as a dashed line. */
export function AreaTrendChart<T extends object>({ data, xKey, series, height = 300, format = 'currency' }: AreaTrendChartProps<T>) {
  const c = useChartTheme();
  const gid = useId().replace(/:/g, '');
  const [main, compare] = series;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.primary} stopOpacity={0.22} />
            <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} dy={8} minTickGap={16} />
        <YAxis tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmtAxis(format, v)} domain={[0, emptyMax(format)]} allowDecimals={false} />
        <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: c.primary, strokeOpacity: 0.25, strokeWidth: 1 }} />
        {compare && (
          <Area type="monotone" dataKey={compare.key} name={compare.label} stroke={c.secondary} strokeWidth={2} strokeDasharray="5 5" fill="transparent" dot={false} activeDot={false} animationDuration={700} />
        )}
        <Area
          type="monotone"
          dataKey={main.key}
          name={main.label}
          stroke={c.primary}
          strokeWidth={2.5}
          fill={`url(#fill-${gid})`}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 3, stroke: c.surface, fill: c.primary }}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface BarsChartProps<T> {
  data: T[];
  xKey: keyof T & string;
  series: [SeriesDef] | [SeriesDef, SeriesDef];
  height?: number;
  format?: Formatter;
  layout?: 'vertical' | 'horizontal';
}

export function BarsChart<T extends object>({ data, xKey, series, height = 280, format = 'currency', layout = 'horizontal' }: BarsChartProps<T>) {
  const c = useChartTheme();
  const horizontalBars = layout === 'vertical';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: horizontalBars ? 8 : -8, bottom: 0 }} barGap={4}>
        <CartesianGrid stroke={c.grid} vertical={horizontalBars} horizontal={!horizontalBars} />
        {horizontalBars ? (
          <>
            <XAxis type="number" tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtAxis(format, v)} domain={[0, emptyMax(format)]} allowDecimals={false} />
            <YAxis type="category" dataKey={xKey} tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={96} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} dy={8} minTickGap={8} />
            <YAxis tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmtAxis(format, v)} domain={[0, emptyMax(format)]} allowDecimals={false} />
          </>
        )}
        <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: c.primary, fillOpacity: 0.05 }} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={i === 0 ? c.primary : c.secondary}
            radius={horizontalBars ? [0, 6, 6, 0] : [6, 6, 0, 0]}
            maxBarSize={series.length > 1 ? 18 : 28}
            animationDuration={700}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface DonutChartProps {
  data: { name: string; value: number }[];
  height?: number;
  format?: Formatter;
  center?: { label: string; value: string };
  showLegend?: boolean;
  /** Put the legend under the ring — for narrow cards. */
  stacked?: boolean;
}

export function DonutChart({ data, height = 220, format = 'currency', center, showLegend = true, stacked }: DonutChartProps) {
  const c = useChartTheme();
  const rawTotal = data.reduce((s, d) => s + d.value, 0);
  const total = rawTotal || 1;
  const colors = data.map((_, i) => c.series[i % c.series.length]);
  if (rawTotal === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: height }}>
        <div className="h-24 w-24 rounded-full border-[10px] border-surface" aria-hidden />
        <p className="mt-3 text-[13px] font-medium">No data yet</p>
        <p className="text-xs text-muted-foreground">This chart fills in as you record activity.</p>
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col items-center gap-5', !stacked && 'sm:flex-row')}>
      <div className="relative w-full max-w-[220px] shrink-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip format={format} />} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="96%" paddingAngle={2} stroke="none" animationDuration={700}>
              {data.map((d, i) => (
                <Cell key={d.name} fill={colors[i]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {center && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="tabular text-lg font-semibold">{center.value}</span>
            <span className="text-2xs text-muted-foreground">{center.label}</span>
          </div>
        )}
      </div>
      {showLegend && (
        <ul className="w-full space-y-2.5">
          {data.map((d, i) => (
            <li key={d.name} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colors[i] }} />
                <span className="truncate text-muted-foreground">{d.name}</span>
              </span>
              <span className="tabular shrink-0 font-medium">
                {fmt(format, d.value)} <span className="ml-1 text-xs text-subtle">{Math.round((d.value / total) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChartSkeleton({ height = 300 }: { height?: number }): ReactNode {
  return (
    <div className="flex items-end gap-2 px-2" style={{ height }} aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="flex-1 animate-pulse rounded-t-md bg-surface" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
      ))}
    </div>
  );
}
