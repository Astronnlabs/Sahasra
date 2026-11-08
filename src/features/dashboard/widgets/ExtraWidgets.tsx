import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Landmark, PieChart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DonutChart } from '@/components/charts/Charts';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { qk } from '@/hooks/queries';
import { formatINR, formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboardService } from '@/services';
import { ListSkeleton, WidgetCard } from './WidgetCard';

export function GstSummaryWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('gst'), queryFn: dashboardService.gstSummary });
  return (
    <WidgetCard title="GST Summary" description={data?.period} icon={<Landmark />} link={{ to: '/gst', label: 'Open GST' }}>
      {isLoading || !data ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          <dl className="space-y-3 text-[13px]">
            {[
              ['Output GST', data.output],
              ['Input GST', data.input],
              ['ITC available', data.itc],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular font-medium">{formatINR(value as number)}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-dashed border-border pt-3">
              <dt className="font-semibold">Net GST liability</dt>
              <dd className="tabular text-base font-semibold text-primary">{formatINR(data.liability)}</dd>
            </div>
          </dl>
          <Link to="/gst" className="mt-4 flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-xs font-medium text-[#8a5d07] dark:text-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" /> GSTR-1 due in {data.dueInDays} days — review outward supplies
          </Link>
        </>
      )}
    </WidgetCard>
  );
}

const ATTENDANCE_ROWS = [
  { key: 'present', label: 'Present', color: 'bg-success' },
  { key: 'late', label: 'Late', color: 'bg-info' },
  { key: 'half-day', label: 'Half day', color: 'bg-warning' },
  { key: 'leave', label: 'On leave', color: 'bg-primary' },
  { key: 'absent', label: 'Absent', color: 'bg-danger' },
  { key: 'unmarked', label: 'Not marked', color: 'bg-border' },
] as const;

export function AttendanceWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('attendance'), queryFn: dashboardService.attendanceToday });
  return (
    <WidgetCard title="Employee Attendance" description="Today" icon={<CalendarCheck />} link={{ to: '/employees/attendance' }}>
      {isLoading || !data ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : data.total === 0 ? (
        <EmptyState compact icon={CalendarCheck} title="No employees yet" description="Add your team to track daily attendance." />
      ) : (
        <>
          <div className="flex items-end gap-2">
            <span className="tabular text-[28px] font-semibold leading-none">{data.present + data.late}</span>
            <span className="pb-0.5 text-[13px] text-muted-foreground">of {data.total} staff checked in</span>
          </div>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface">
            {ATTENDANCE_ROWS.map((r) => (
              <div key={r.key} className={cn('h-full transition-all', r.color)} style={{ width: `${(data[r.key] / Math.max(1, data.total)) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
            {ATTENDANCE_ROWS.map((r) => (
              <li key={r.key} className="flex items-center gap-2 text-[13px]">
                <span className={cn('h-2 w-2 rounded-full', r.color)} />
                <span className="text-muted-foreground">{r.label}</span>
                <span className="tabular ml-auto font-semibold">{data[r.key]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetCard>
  );
}

export function ExpenseBreakdownWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('expense-breakdown'), queryFn: dashboardService.expenseBreakdown });
  const total = data?.reduce((s, d) => s + d.value, 0) ?? 0;
  return (
    <WidgetCard title="Expense Breakdown" description="Last 30 days" icon={<PieChart />} link={{ to: '/expenses' }}>
      {isLoading || !data ? (
        <Skeleton className="h-52 w-full rounded-xl" />
      ) : data.length === 0 ? (
        <EmptyState compact icon={PieChart} title="No expenses recorded" description="Expenses from the last 30 days will be broken down here." />
      ) : (
        <DonutChart data={data.slice(0, 5)} height={190} center={{ label: 'Total', value: formatINRCompact(total) }} />
      )}
    </WidgetCard>
  );
}
