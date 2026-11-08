import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { qk } from '@/hooks/queries';
import { dashboardService } from '@/services';
import type { Tone } from '@/types';
import { WidgetCard } from './WidgetCard';

function tone(score: number): Tone {
  return score >= 85 ? 'success' : score >= 70 ? 'primary' : score >= 50 ? 'warning' : 'danger';
}

function Gauge({ score }: { score: number }) {
  const r = 52;
  const circ = Math.PI * r; // half circle
  const offset = circ * (1 - score / 100);
  return (
    <svg viewBox="0 0 132 76" className="w-[200px]" role="img" aria-label={`Business health ${score} out of 100`}>
      <path d={`M 14 70 A ${r} ${r} 0 0 1 118 70`} fill="none" className="stroke-primary-light" strokeWidth="11" strokeLinecap="round" />
      <path
        d={`M 14 70 A ${r} ${r} 0 0 1 118 70`}
        fill="none"
        className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-out"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export function HealthWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('health'), queryFn: dashboardService.health });
  return (
    <WidgetCard title="Business Health" description="Based on the last 30 days" icon={<Activity />}>
      {!isLoading && data === null ? (
        <EmptyState compact icon={Activity} title="Not enough data yet" description="Your health score appears after your first sales are recorded." />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="mx-auto h-24 w-48 rounded-t-full" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center">
            <div className="relative">
              <Gauge score={data.score} />
              <p className="tabular absolute inset-x-0 bottom-1 text-center text-[28px] font-semibold leading-none tracking-tight">
                {data.score}
                <span className="text-sm font-medium text-subtle"> / 100</span>
              </p>
            </div>
            <span className={`mt-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${data.score >= 70 ? 'bg-success-soft text-success' : data.score >= 50 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'}`}>{data.label}</span>
          </div>
          <ul className="mt-6 space-y-3">
            {data.breakdown.map((b) => (
              <li key={b.label}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="tabular font-semibold">{b.score}</span>
                </div>
                <Progress value={b.score} tone={tone(b.score)} label={b.label} />
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetCard>
  );
}
