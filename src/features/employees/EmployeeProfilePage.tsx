import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Briefcase, Building2, Download, FileText, Mail, MapPin, Phone, UsersRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { DetailList } from '@/components/common/DetailList';
import { ProfileHeader } from '@/components/common/ProfileHeader';
import { Timeline } from '@/components/common/Timeline';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { qk } from '@/hooks/queries';
import { formatDate, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { employeesService } from '@/services';
import { ATTENDANCE_META, ATTENDANCE_ORDER } from './attendanceMeta';

export function EmployeeProfilePage() {
  const { id = '' } = useParams();
  const emp = useQuery({ queryKey: qk.employee(id), queryFn: () => employeesService.get(id) });
  const month = format(new Date(), 'yyyy-MM');
  const attendance = useQuery({ queryKey: qk.attendance(month), queryFn: () => employeesService.attendance(new Date()) });
  const payroll = useQuery({ queryKey: qk.payroll, queryFn: employeesService.payroll });
  const advances = useQuery({ queryKey: qk.advances, queryFn: employeesService.advances.list });

  if (emp.isError) {
    return <Card><EmptyState icon={UsersRound} title="Employee not found" description="This record may have been removed." secondary={<Button asChild variant="secondary"><Link to="/employees">Back to employees</Link></Button>} /></Card>;
  }
  const e = emp.data;
  const row = attendance.data?.find((r) => r.employee.id === id);
  const pay = payroll.data?.find((p) => p.employeeId === id);
  const myAdvances = advances.data?.filter((a) => a.employeeId === id) ?? [];
  const worked = row ? row.summary.present + row.summary.late + row.summary['half-day'] * 0.5 : 0;
  const workingDays = row ? row.days.filter((d) => d.status && d.status !== 'holiday').length : 0;

  return (
    <>
      <PageHeader title="Employee profile" back={{ to: '/employees', label: 'Employees' }} className="mb-4" />
      <ProfileHeader
        loading={emp.isLoading}
        name={e?.name}
        subtitle={e ? `${e.designation} · ${e.code}` : undefined}
        badges={e && <StatusBadge status={e.status} />}
        meta={e && [
          { icon: <Phone />, label: e.phone },
          { icon: <Mail />, label: e.email },
          { icon: <Building2 />, label: e.branch },
          { icon: <Briefcase />, label: e.department },
        ]}
        actions={<Button variant="secondary" asChild><Link to="/payroll"><Download /> Payslips</Link></Button>}
        stats={e && [
          { label: 'Monthly salary', value: formatINR(e.salary) },
          { label: 'Attendance', value: workingDays ? `${Math.round((worked / workingDays) * 100)}%` : '—' },
          { label: 'Leaves taken', value: row?.summary.leave ?? 0 },
          { label: 'Tenure', value: `${Math.max(1, Math.round((Date.now() - new Date(e.joinDate).getTime()) / (365 * 864e5) * 10) / 10)} yrs` },
        ]}
      />

      {e && (
        <Tabs defaultValue="personal" className="mt-6">
          <TabsList variant="underline">
            {['personal', 'job', 'attendance', 'leave', 'salary', 'advances', 'activity'].map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">{t === 'personal' ? 'Personal details' : t === 'job' ? 'Job details' : t}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="personal">
            <Card className="p-6">
              <DetailList columns={3} items={[
                ['Full name', e.name], ['Date of birth', e.dob ? formatDate(e.dob) : '—'], ['Blood group', e.bloodGroup || '—'],
                ['Mobile', e.phone], ['Email', e.email || '—'], ['PAN', e.pan || '—'],
                ['Address', <span key="a" className="inline-flex items-start gap-1"><MapPin className="mt-0.5 h-3.5 w-3.5 text-subtle" />{e.address || '—'}</span>], ['Bank account', e.bank || '—'],
              ]} />
            </Card>
          </TabsContent>

          <TabsContent value="job">
            <Card className="p-6">
              <DetailList columns={3} items={[
                ['Employee code', e.code], ['Designation', e.designation], ['Department', e.department],
                ['Branch', e.branch], ['Date of joining', formatDate(e.joinDate)], ['Monthly salary', formatINR(e.salary)],
              ]} />
            </Card>
          </TabsContent>

          <TabsContent value="attendance">
            <Card>
              <CardHeader title={format(new Date(), 'MMMM yyyy')} description="Daily attendance this month" actions={<Button variant="secondary" size="sm" asChild><Link to="/employees/attendance">Team view</Link></Button>} />
              <CardContent>
                <div className="grid grid-cols-7 gap-1.5">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="text-center text-2xs font-medium text-subtle">{d}</span>)}
                  {row && Array.from({ length: (parseISO(row.days[0].date).getDay() + 6) % 7 }, (_, i) => <span key={`pad${i}`} />)}
                  {row?.days.map((d) => {
                    const meta = d.status ? ATTENDANCE_META[d.status] : null;
                    return (
                      <div key={d.date} className={cn('flex aspect-square flex-col items-center justify-center rounded-lg text-xs', meta ? meta.cell : 'bg-surface/40 text-subtle/60')} title={meta?.label}>
                        <span className="font-semibold">{parseISO(d.date).getDate()}</span>
                        {meta && <span className="text-[9px] font-semibold">{meta.short}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex flex-wrap gap-4">
                  {ATTENDANCE_ORDER.map((s) => (
                    <span key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn('h-2 w-2 rounded-full', ATTENDANCE_META[s].dot)} />{ATTENDANCE_META[s].label} <b className="text-foreground">{row?.summary[s] ?? 0}</b>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leave">
            <Card className="flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary"><FileText className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="text-[13px] font-semibold">Leave days this month</p>
                <p className="text-xs text-muted-foreground">Counted from attendance marked as Leave.</p>
              </div>
              <span className="tabular text-2xl font-semibold">{row?.summary.leave ?? 0}</span>
            </Card>
          </TabsContent>

          <TabsContent value="salary">
            {pay ? (
              <Card className="p-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <dl className="space-y-2.5 text-[13px]">
                    {[['Basic + DA', pay.gross], ['Allowances', pay.allowances], ['Overtime', pay.overtime], ['Commission', pay.commission]].map(([l, v]) => (
                      <div key={l as string} className="flex justify-between"><dt className="text-muted-foreground">{l}</dt><dd className="tabular">{formatINR(v as number)}</dd></div>
                    ))}
                  </dl>
                  <dl className="space-y-2.5 text-[13px]">
                    {[['PF & professional tax', pay.deductions], ['Advance recovery', pay.advance]].map(([l, v]) => (
                      <div key={l as string} className="flex justify-between"><dt className="text-muted-foreground">{l}</dt><dd className="tabular text-danger">− {formatINR(v as number)}</dd></div>
                    ))}
                    <div className="flex justify-between border-t border-dashed border-border pt-2.5 text-base font-semibold"><dt>Net salary</dt><dd className="tabular text-primary">{formatINR(pay.net)}</dd></div>
                  </dl>
                </div>
              </Card>
            ) : <Card><EmptyState icon={FileText} title="No payroll yet" description="Run payroll to see salary breakdowns." /></Card>}
          </TabsContent>

          <TabsContent value="advances">
            {myAdvances.length === 0 ? (
              <Card><EmptyState icon={FileText} title="No advances" description={`${e.name.split(' ')[0]} has no salary advances.`} /></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {myAdvances.map((a) => (
                  <Card key={a.id} className="p-5">
                    <div className="flex justify-between text-[13px]"><span className="font-medium">{a.reason}</span><span className="text-subtle">{formatDate(a.date)}</span></div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-[13px]">
                      <div><p className="text-2xs uppercase text-subtle">Advance</p><p className="tabular font-semibold">{formatINR(a.amount)}</p></div>
                      <div><p className="text-2xs uppercase text-subtle">Recovered</p><p className="tabular font-semibold text-success">{formatINR(a.recovered)}</p></div>
                      <div><p className="text-2xs uppercase text-subtle">Remaining</p><p className="tabular font-semibold text-danger">{formatINR(a.amount - a.recovered)}</p></div>
                    </div>
                    <Progress className="mt-3" value={a.recovered} max={a.amount} tone="success" label="Recovered" />
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity">
            <Card className="p-6">
              <Timeline items={[{ id: 'joined', title: `Joined ${e.branch} as ${e.designation}`, time: formatDate(e.joinDate), tone: 'neutral' }]} />
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
