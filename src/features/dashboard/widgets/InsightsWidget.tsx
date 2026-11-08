import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, CalendarRange, PackageMinus, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { qk } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { dashboardService } from '@/services';
import { WidgetCard } from './WidgetCard';

const ICON: Record<string, LucideIcon> = { momentum: TrendingUp, stock: PackageMinus, dues: AlertTriangle, credit: CalendarRange };
const TONE: Record<string, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  primary: 'bg-primary-light text-primary',
};

export function InsightsWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('insights'), queryFn: dashboardService.insights });
  return (
    <WidgetCard title="Smart Business Insights" description="Generated from your activity" icon={<Sparkles />}>
      {data && data.length === 0 ? (
        <EmptyState compact icon={Sparkles} title="No insights yet" description="As you bill, stock up and collect payments, Sahasra will point out what needs attention." />
      ) : (
      <div className="grid gap-3 sm:grid-cols-2">
        {isLoading || !data
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
          : data.map((insight) => {
              const Icon = ICON[insight.id] ?? Sparkles;
              return (
                <Link
                  key={insight.id}
                  to={insight.href}
                  className="group flex flex-col rounded-xl border border-border bg-gradient-to-b from-primary-soft/60 to-transparent p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', TONE[insight.tone])}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-subtle transition-colors group-hover:text-primary" />
                  </div>
                  <p className="mt-3 text-2xs font-semibold uppercase tracking-wider text-subtle">{insight.title}</p>
                  <p className="mt-1 text-[13px] font-medium leading-snug">{insight.text}</p>
                </Link>
              );
            })}
      </div>
      )}
    </WidgetCard>
  );
}
