import { zodResolver } from '@hookform/resolvers/zod';
import { Briefcase, CalendarCheck, Eye, LayoutGrid, List, Mail, Phone, Plus, UserPlus, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Drawer } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BRANCHES } from '@/app/config/constants';
import { qk, useAppMutation, useEmployees } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { employeesService } from '@/services';
import type { Employee } from '@/types';

const DEPARTMENTS = ['Operations', 'Sales', 'Warehouse', 'Finance', 'Logistics', 'Human Resources', 'Kitchen', 'Salon', 'Facilities'];

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(60),
  phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/, 'Enter a valid mobile number'),
  email: z.string().trim().email('Enter a valid email'),
  designation: z.string().trim().min(2, 'Designation is required'),
  department: z.string(),
  branch: z.string(),
  salary: z.coerce.number().positive('Enter monthly salary'),
  joinDate: z.string().min(1),
});
type Values = z.infer<typeof schema>;

function AddEmployeeDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = form;
  useEffect(() => {
    if (open) reset({ name: '', phone: '', email: '', designation: '', department: 'Sales', branch: 'Main Branch', salary: undefined as unknown as number, joinDate: new Date().toISOString().slice(0, 10) });
  }, [open, reset]);
  const save = useAppMutation(
    (v: Values) =>
      employeesService.create({
        ...v,
        name: sanitizeText(v.name, 60),
        designation: sanitizeText(v.designation, 60),
        joinDate: new Date(v.joinDate).toISOString(),
        status: 'active',
      }),
    { invalidate: [qk.employees, qk.payroll], success: (e) => `${e.name} added to your team`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Add employee"
      description="Create a staff record for attendance and payroll."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}><UserPlus /> Add employee</Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Full name" error={errors.name?.message} required className="sm:col-span-2"><Input {...register('name')} autoFocus /></FormField>
        <FormField label="Mobile" error={errors.phone?.message} required><Input {...register('phone')} inputMode="tel" /></FormField>
        <FormField label="Email" error={errors.email?.message} required><Input {...register('email')} type="email" /></FormField>
        <FormField label="Designation" error={errors.designation?.message} required><Input {...register('designation')} placeholder="Sales Associate" /></FormField>
        <FormField label="Department"><NativeSelect {...register('department')}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</NativeSelect></FormField>
        <FormField label="Branch"><NativeSelect {...register('branch')}>{BRANCHES.map((b) => <option key={b.id}>{b.name}</option>)}</NativeSelect></FormField>
        <FormField label="Monthly salary (₹)" error={errors.salary?.message} required><Input {...register('salary')} inputMode="numeric" /></FormField>
        <FormField label="Joining date" className="sm:col-span-2"><DatePicker value={watch('joinDate')} onChange={(d) => setValue('joinDate', d)} /></FormField>
      </form>
    </Drawer>
  );
}

export function EmployeesPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useEmployees();
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [open, setOpen] = useState(false);
  const [dept, setDept] = useState('All');
  const del = useDeleteAction<Employee>({
    page: 'employees',
    name: (e) => e.name,
    remove: (e) => employeesService.remove(e.id),
    invalidate: [qk.employees, qk.payroll, qk.advances, ['attendance']],
    description: () => 'Their attendance and advance records are deleted too. Past payroll runs keep their name.',
  });

  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      present: list.filter((e) => ['present', 'late'].includes(e.todayStatus ?? '')).length,
      onLeave: list.filter((e) => e.status === 'on-leave').length,
      payroll: list.reduce((s, e) => s + e.salary, 0),
    };
  }, [data]);

  const filtered = (data ?? []).filter((e) => dept === 'All' || e.department === dept);
  const departments = ['All', ...Array.from(new Set((data ?? []).map((e) => e.department)))];

  const columns: Column<Employee>[] = [
    { id: 'name', header: 'Employee', hideable: false, sortValue: (e) => e.name, cell: (e) => <div className="flex items-center gap-3"><Avatar name={e.name} size="sm" /><div><p className="font-medium">{e.name}</p><p className="text-2xs text-subtle">{e.code}</p></div></div> },
    { id: 'designation', header: 'Designation', sortValue: (e) => e.designation, cell: (e) => e.designation },
    { id: 'department', header: 'Department', cell: (e) => e.department },
    { id: 'branch', header: 'Branch', cell: (e) => e.branch },
    { id: 'phone', header: 'Phone', cell: (e) => <span className="text-muted-foreground">{e.phone}</span> },
    { id: 'joined', header: 'Joined', sortValue: (e) => e.joinDate, cell: (e) => formatDate(e.joinDate) },
    { id: 'salary', header: 'Salary', align: 'right', sortValue: (e) => e.salary, cell: (e) => formatINR(e.salary) },
    { id: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        description="Your team, their roles, attendance and pay."
        actions={
          <>
            <Button variant="secondary" asChild><Link to="/employees/attendance"><CalendarCheck /> Attendance</Link></Button>
            <Button onClick={() => setOpen(true)}><Plus /> Add Employee</Button>
          </>
        }
      />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Team size" value={stats.total} icon={UsersRound} loading={isLoading} />
        <StatCard label="Present today" value={`${stats.present} / ${stats.total}`} icon={CalendarCheck} loading={isLoading} />
        <StatCard label="On leave" value={stats.onLeave} icon={Briefcase} loading={isLoading} />
        <StatCard label="Monthly payroll" value={formatINR(stats.payroll)} icon={UsersRound} loading={isLoading} hint="gross" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
          {departments.map((d) => (
            <button key={d} onClick={() => setDept(d)} className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors', dept === d ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground hover:border-primary/40')}>
              {d}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="View">
          {(['cards', 'table'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} aria-label={v === 'cards' ? 'Card view' : 'Table view'} className={cn('rounded-md p-1.5', view === v ? 'bg-card text-primary shadow-card' : 'text-subtle')}>
              {v === 'cards' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>

      {view === 'cards' ? (
        isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
        ) : filtered.length === 0 ? (
          <Card><EmptyState icon={UsersRound} title="No employees yet." description="Add your team to track attendance and run payroll." actionLabel="Add Employee" onAction={() => setOpen(true)} /></Card>
        ) : (
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map((e) => {
              const today = e.todayStatus;
              return (
                <Card key={e.id} className="group cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-pop/40" onClick={() => navigate(`/employees/${e.id}`)}>
                  <div className="flex items-start justify-between">
                    <Avatar name={e.name} size="lg" />
                    <StatusBadge status={today ?? 'Not marked'} />
                  </div>
                  <p className="mt-4 font-semibold">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.designation} · {e.department}</p>
                  <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-subtle" /> {e.phone}</p>
                    <p className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 text-subtle" /> {e.email}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                    <span className="text-subtle">{e.code}</span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100"><Eye className="h-3.5 w-3.5" /> View profile</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <DataTable
          data={filtered}
          isLoading={isLoading}
          columns={columns}
          getRowId={(e) => e.id}
          searchText={(e) => `${e.name} ${e.code} ${e.designation}`}
          searchPlaceholder="Search employees"
          onRowClick={(e) => navigate(`/employees/${e.id}`)}
          rowActions={[{ label: 'View profile', icon: Eye, onSelect: (e) => navigate(`/employees/${e.id}`) }, del.action]}
          empty={<EmptyState icon={UsersRound} title="No employees yet." description="Add your team to track attendance and run payroll." actionLabel="Add Employee" onAction={() => setOpen(true)} />}
        />
      )}
      <AddEmployeeDrawer open={open} onOpenChange={setOpen} />
      {del.dialog}
    </>
  );
}
