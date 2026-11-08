import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, format, isSameMonth, isToday, parseISO, subMonths } from 'date-fns';
import { CalendarCheck, CheckCheck, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { qk } from '@/hooks/queries';
import { cn, downloadTextFile, toCsv } from '@/lib/utils';
import { employeesService, type AttendanceRow } from '@/services';
import type { AttendanceStatus } from '@/types';
import { ATTENDANCE_META, ATTENDANCE_ORDER } from './attendanceMeta';

export function AttendancePage() {
  const [month, setMonth] = useState(() => new Date());
  const key = format(month, 'yyyy-MM');
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: qk.attendance(key), queryFn: () => employeesService.attendance(month) });

  const todayIndex = isSameMonth(month, new Date()) ? new Date().getDate() - 1 : -1;
  const totals = useMemo(() => {
    const t: Record<AttendanceStatus, number> = { present: 0, absent: 0, 'half-day': 0, late: 0, leave: 0, holiday: 0 };
    if (todayIndex >= 0) data?.forEach((r) => { const s = r.days[todayIndex]?.status; if (s) t[s] += 1; });
    return t;
  }, [data, todayIndex]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['attendance'] });
    qc.invalidateQueries({ queryKey: qk.employees });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const mark = async (row: AttendanceRow, dayIdx: number, status: AttendanceStatus) => {
    try {
      await employeesService.setAttendance(row.employee.id, parseISO(row.days[dayIdx].date), status);
      refresh();
      toast.success(`${row.employee.name} marked ${ATTENDANCE_META[status].label.toLowerCase()}`, { description: format(parseISO(row.days[dayIdx].date), 'EEEE, d MMMM') });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save attendance.');
    }
  };

  const markAllPresent = async () => {
    const ids = (data ?? []).filter((r) => r.employee.status !== 'inactive').map((r) => r.employee.id);
    if (!ids.length || todayIndex < 0) return;
    try {
      // Keeps existing marks (leave, half-day…) and only fills unmarked or absent staff.
      const { updated } = await employeesService.setAttendance(ids, new Date(), 'present', true);
      refresh();
      toast.success(updated ? `${updated} marked present today` : 'Everyone is already marked for today');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save attendance.');
    }
  };

  const exportCsv = () => {
    if (!data?.length) return;
    const rows = data.map((r) => ({
      Employee: r.employee.name,
      Code: r.employee.code,
      ...Object.fromEntries(r.days.map((d) => [format(parseISO(d.date), 'dd'), d.status ? ATTENDANCE_META[d.status].label : ''])),
      ...Object.fromEntries(ATTENDANCE_ORDER.map((s) => [ATTENDANCE_META[s].label, r.summary[s]])),
    }));
    downloadTextFile(`attendance-${key}.csv`, toCsv(rows), 'text/csv');
  };

  const days = data?.[0]?.days ?? [];

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Mark and review daily attendance for your whole team."
        back={{ to: '/employees', label: 'Employees' }}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!data?.length}><Download /> Export CSV</Button>
            <Button onClick={markAllPresent} disabled={todayIndex < 0}><CheckCheck /> Mark today present</Button>
          </>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {ATTENDANCE_ORDER.map((s) => (
          <Card key={s} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{ATTENDANCE_META[s].label}</span>
              <span className={cn('h-2 w-2 rounded-full', ATTENDANCE_META[s].dot)} />
            </div>
            <p className="tabular mt-1.5 text-2xl font-semibold">{isLoading ? '–' : totals[s]}</p>
            <p className="text-2xs text-subtle">today</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon-sm" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month"><ChevronLeft /></Button>
            <h2 className="min-w-[140px] text-center text-[15px] font-semibold" aria-live="polite">{format(month, 'MMMM yyyy')}</h2>
            <Button variant="secondary" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))} disabled={isSameMonth(month, new Date())} aria-label="Next month"><ChevronRight /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ATTENDANCE_ORDER.map((s) => (
              <span key={s} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold', ATTENDANCE_META[s].cell)}>
                {ATTENDANCE_META[s].short} <span className="font-medium">{ATTENDANCE_META[s].label}</span>
              </span>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !data?.length ? (
          <EmptyState icon={CalendarCheck} title="No employees yet." description="Add your team first — then mark their attendance here every day." secondary={<Button asChild><Link to="/employees">Add employees</Link></Button>} />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-[200px] border-b border-border bg-card px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-subtle">Employee</th>
                  {days.map((d, i) => {
                    const date = parseISO(d.date);
                    return (
                      <th key={d.date} scope="col" className={cn('min-w-[34px] border-b border-border px-0.5 py-2 text-center font-medium', i === todayIndex ? 'text-primary' : 'text-subtle')}>
                        <span className="block text-[9px] uppercase">{format(date, 'EEEEE')}</span>
                        <span className={cn('mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full', isToday(date) && 'bg-primary text-white')}>{date.getDate()}</span>
                      </th>
                    );
                  })}
                  <th scope="col" className="border-b border-border px-3 py-2.5 text-right text-2xs font-semibold uppercase tracking-wider text-subtle">Present</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((row) => (
                  <tr key={row.employee.id} className="group">
                    <td className="sticky left-0 z-10 border-b border-border bg-card px-4 py-2 group-hover:bg-primary-soft">
                      <Link to={`/employees/${row.employee.id}`} className="flex items-center gap-2.5">
                        <Avatar name={row.employee.name} size="xs" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{row.employee.name}</span>
                          <span className="block truncate text-2xs text-subtle">{row.employee.designation}</span>
                        </span>
                      </Link>
                    </td>
                    {row.days.map((d, i) => {
                      const meta = d.status ? ATTENDANCE_META[d.status] : null;
                      const future = parseISO(d.date) > new Date();
                      if (future) return <td key={d.date} className="border-b border-border px-0.5 py-2 text-center text-subtle/40">·</td>;
                      return (
                        <td key={d.date} className="border-b border-border px-0.5 py-2 text-center group-hover:bg-primary-soft/50">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={cn('mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold transition-transform hover:scale-110', meta ? meta.cell : 'border border-dashed border-border text-subtle hover:border-primary/50 hover:text-primary', i === todayIndex && 'ring-2 ring-primary/30')}
                                aria-label={`${row.employee.name}, ${format(parseISO(d.date), 'd MMM')}: ${meta?.label ?? 'not marked'}. ${meta ? 'Change' : 'Mark'}`}
                              >
                                {meta?.short ?? '+'}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-40">
                              <DropdownMenuLabel>{format(parseISO(d.date), 'EEE, d MMM')}</DropdownMenuLabel>
                              {ATTENDANCE_ORDER.map((s) => (
                                <DropdownMenuItem key={s} onSelect={() => mark(row, i, s)}>
                                  <span className={cn('h-2 w-2 rounded-full', ATTENDANCE_META[s].dot)} /> {ATTENDANCE_META[s].label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      );
                    })}
                    <td className="tabular border-b border-border px-3 py-2 text-right text-[13px] font-semibold">{row.summary.present + row.summary.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-5 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary"><CalendarCheck className="h-4 w-4" /></span>
          <div className="flex-1">
            <p className="text-[13px] font-semibold">Today's exceptions</p>
            <p className="text-xs text-muted-foreground">Staff who are absent, late or on leave today.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {todayIndex >= 0 && data?.filter((r) => ['absent', 'late', 'leave', 'half-day'].includes(r.days[todayIndex]?.status ?? '')).map((r) => (
            <span key={r.employee.id} className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3">
              <Avatar name={r.employee.name} size="xs" />
              <span className="text-xs font-medium">{r.employee.name}</span>
              <StatusBadge status={r.days[todayIndex].status!} />
            </span>
          ))}
        </div>
      </Card>
    </>
  );
}
