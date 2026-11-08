import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: ReactNode;
  change?: number;
  /** For costs, a decrease is good news. */
  invertTrend?: boolean;
  icon?: LucideIcon;
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
  accent?: boolean;
  /** Makes the card a button (e.g. filter the list below to these items). */
  onClick?: () => void;
  /** Shown as selected (its filter is on). */
  active?: boolean;
  /** Colour of the number: warning (low stock) or danger (out of stock) when above zero. */
  tone?: 'warning' | 'danger';
}

export function StatCard({ label, value, change, invertTrend, icon: Icon, hint, loading, className, accent, onClick, active, tone }: StatCardProps) {
  if (loading) {
    return (
      <Card className={cn('p-5', className)}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-8 w-36" />
        <Skeleton className="mt-3 h-3.5 w-24" />
      </Card>
    );
  }
  const positive = change !== undefined && (invertTrend ? change < 0 : change >= 0);
  return (
    <Card
      className={cn('group relative overflow-hidden p-5 transition-shadow duration-200 hover:shadow-pop/40', onClick && 'cursor-pointer text-left hover:border-primary/40', active && 'border-primary ring-2 ring-primary/15', className)}
      {...(onClick ? { role: 'button', tabIndex: 0, 'aria-pressed': !!active, onClick, onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) } : {})}
    >
      {accent && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/[0.06]" aria-hidden />}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105', tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-primary-light text-primary')}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={cn('tabular mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em]', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning')}>{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {change !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
              positive ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
            )}
          >
            {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {formatPercent(change)}
          </span>
        )}
        {hint && <span className="text-subtle">{hint}</span>}
      </div>
    </Card>
  );
}
