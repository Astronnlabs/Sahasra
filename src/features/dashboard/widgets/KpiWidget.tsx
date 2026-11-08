import { useQuery } from '@tanstack/react-query';
import { ChevronRight, HandCoins, IndianRupee, PiggyBank, Wallet, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DATE_RANGES } from '@/app/providers/WorkspaceProvider';
import { StatCard } from '@/components/common/StatCard';
import { qk } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { dashboardService, type Kpi } from '@/services';

const ICONS: Record<Kpi['id'], LucideIcon> = {
  sales: IndianRupee,
  collection: HandCoins,
  expenses: Wallet,
  profit: PiggyBank,
};

const LABELS: Record<Kpi['id'], string> = {
  sales: 'Sales',
  collection: 'Collection',
  expenses: 'Expenses',
  profit: 'Profit',
};

export function useKpis(range: string, branch: string) {
  return useQuery({ queryKey: qk.dashboard('kpis', range, branch), queryFn: () => dashboardService.kpis(range, branch) });
}

export function KpiWidget({ id, range, branch }: { id: Kpi['id']; range: string; branch: string }) {
  const { data, isLoading } = useKpis(range, branch);
  const kpi = data?.find((k) => k.id === id);
  const rangeLabel = DATE_RANGES.find((r) => r.value === range)?.label ?? 'Today';
  const label = range === 'today' ? kpi?.label ?? '' : `${LABELS[id]} · ${rangeLabel}`;
  return (
    // The whole card opens the details behind the number.
    <Link to={`/dashboard/${id}`} className="group/kpi block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" aria-label={`${label}: view details`}>
      <StatCard
        label={label}
        value={kpi ? formatINR(kpi.value) : '—'}
        change={kpi?.change}
        invertTrend={id === 'expenses'}
        icon={ICONS[id]}
        hint={
          <span className="flex items-center gap-1">
            {kpi?.change === undefined ? (kpi && kpi.value === 0 ? 'No activity yet' : '') : range === 'today' ? 'vs yesterday' : 'vs previous period'}
            <span className="ml-1 inline-flex items-center gap-0.5 font-medium text-primary opacity-0 transition-opacity group-hover/kpi:opacity-100">
              View details <ChevronRight className="h-3 w-3" />
            </span>
          </span>
        }
        loading={isLoading}
        accent={id === 'sales'}
        className="h-full cursor-pointer transition-all group-hover/kpi:-translate-y-0.5 group-hover/kpi:border-primary/40"
      />
    </Link>
  );
}
