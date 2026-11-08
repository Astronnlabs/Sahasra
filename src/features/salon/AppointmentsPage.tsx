import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, setHours, setMinutes, startOfDay } from 'date-fns';
import { CalendarClock, CheckCircle2, Clock, IndianRupee, LayoutList, Play, Plus, Trash2, UserX, XCircle, Columns3 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Drawer } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { qk, useAppMutation, useEmployees } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatINR, formatTime } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { catalogServicesService, salonService } from '@/services';
import type { Appointment } from '@/types';

const KEY = ['salon', 'appointments'];
const START_HOUR = 9;
const END_HOUR = 20;
const HOUR_PX = 64;

const STATUS_STYLE: Record<Appointment['status'], string> = {
  booked: 'border-l-primary bg-primary-light/80',
  'in-progress': 'border-l-warning bg-warning-soft',
  completed: 'border-l-success bg-success-soft',
  cancelled: 'border-l-subtle bg-surface opacity-60 line-through',
  'no-show': 'border-l-danger bg-danger-soft opacity-70',
};

const schema = z.object({
  customer: z.string().trim().min(2, 'Customer name is required').max(60),
  phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/, 'Enter a valid mobile number'),
  service: z.string().min(1),
  staff: z.string().min(1),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time'),
});
type Values = z.infer<typeof schema>;

/** Staff come from Employees and bookable services from the Services catalogue. */
function useSalonSetup() {
  const employees = useEmployees();
  const services = useQuery({ queryKey: qk.services, queryFn: catalogServicesService.list });
  return {
    staff: (employees.data ?? []).filter((e) => e.status !== 'inactive').map((e) => e.name),
    services: (services.data ?? []).filter((s) => s.status === 'active').map((s) => ({ name: s.name, duration: s.durationMins, price: s.price })),
    loading: employees.isLoading || services.isLoading,
  };
}

function BookDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { staff, services } = useSalonSetup();
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) reset({ customer: '', phone: '', service: services[0]?.name ?? '', staff: staff[0] ?? '', time: '15:30' });
  }, [open, reset]); // eslint-disable-line react-hooks/exhaustive-deps
  const svc = services.find((s) => s.name === watch('service'));
  const ready = staff.length > 0 && services.length > 0;
  const save = useAppMutation(
    (v: Values) => {
      const [h, m] = v.time.split(':').map(Number);
      return salonService.appointments.create({
        customer: sanitizeText(v.customer, 60),
        phone: v.phone,
        service: v.service,
        staff: v.staff,
        start: setMinutes(setHours(startOfDay(new Date()), h), m).toISOString(),
        durationMins: svc?.duration ?? 30,
        price: svc?.price ?? 0,
        status: 'booked',
      });
    },
    { invalidate: [KEY], success: (a) => `${a.customer} booked with ${a.staff} at ${formatTime(a.start)}`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Book appointment"
      description={svc ? `${svc.duration} min · ${formatINR(svc.price)}` : undefined}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending} disabled={!ready}>Book</Button></>}
    >
      {!ready && (
        <div className="mb-4 rounded-xl bg-warning-soft p-4 text-[13px]">
          To book appointments, first add {staff.length === 0 && <Link to="/employees" className="font-semibold text-primary underline">staff in Employees</Link>}
          {staff.length === 0 && services.length === 0 && ' and '}
          {services.length === 0 && <Link to="/services" className="font-semibold text-primary underline">services in Services</Link>}.
        </div>
      )}
      <form className="space-y-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Customer" error={errors.customer?.message} required><Input {...register('customer')} autoFocus /></FormField>
        <FormField label="Mobile" error={errors.phone?.message} required><Input {...register('phone')} inputMode="tel" /></FormField>
        <FormField label="Service"><NativeSelect {...register('service')}>{services.map((s) => <option key={s.name} value={s.name}>{s.name} · {formatINR(s.price)}</option>)}</NativeSelect></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Staff"><NativeSelect {...register('staff')}>{staff.map((s) => <option key={s}>{s}</option>)}</NativeSelect></FormField>
          <FormField label="Time (today)" error={errors.time?.message}><Input {...register('time')} type="time" min="09:00" max="20:00" step={900} /></FormField>
        </div>
      </form>
    </Drawer>
  );
}

export function AppointmentsPage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: salonService.appointments.list });
  const [view, setView] = useState<'schedule' | 'list'>('schedule');
  const [open, setOpen] = useState(false);
  const setup = useSalonSetup();
  // Staff columns: current employees plus anyone who already has a booking.
  const staffList = Array.from(new Set([...setup.staff, ...(data ?? []).map((a) => a.staff)]));
  const setStatus = useAppMutation(({ id, status }: { id: string; status: Appointment['status'] }) => salonService.appointments.update(id, { status }), {
    invalidate: [KEY],
    success: (a) => `${a.customer} · ${a.status.replace('-', ' ')}`,
  });

  const del = useDeleteAction<Appointment>({
    page: 'appointments',
    name: (a) => `${a.customer}'s appointment`,
    remove: (a) => salonService.appointments.remove(a.id),
    invalidate: [KEY],
    description: (a) => `${a.service} with ${a.staff} at ${formatTime(a.start)}.`,
  });

  const stats = useMemo(() => {
    const list = (data ?? []).filter((a) => a.status !== 'cancelled');
    return {
      total: list.length,
      done: list.filter((a) => a.status === 'completed').length,
      upcoming: list.filter((a) => a.status === 'booked').length,
      revenue: list.reduce((s, a) => s + a.price, 0),
    };
  }, [data]);

  const nowTop = ((new Date().getHours() + new Date().getMinutes() / 60 - START_HOUR) * HOUR_PX);

  const actionMenu = (a: Appointment) => (
    <>
      <DropdownMenuLabel>{a.customer} · {formatTime(a.start)}</DropdownMenuLabel>
      {a.status === 'booked' && <DropdownMenuItem onSelect={() => setStatus.mutate({ id: a.id, status: 'in-progress' })}><Play /> Start service</DropdownMenuItem>}
      {['booked', 'in-progress'].includes(a.status) && <DropdownMenuItem onSelect={() => setStatus.mutate({ id: a.id, status: 'completed' })}><CheckCircle2 /> Complete & bill</DropdownMenuItem>}
      {a.status === 'booked' && <DropdownMenuItem onSelect={() => setStatus.mutate({ id: a.id, status: 'no-show' })}><UserX /> Mark no-show</DropdownMenuItem>}
      {a.status === 'booked' && <DropdownMenuItem destructive onSelect={() => setStatus.mutate({ id: a.id, status: 'cancelled' })}><XCircle /> Cancel</DropdownMenuItem>}
      {del.can(a) && <DropdownMenuItem destructive onSelect={() => del.ask(a)}><Trash2 /> Delete</DropdownMenuItem>}
    </>
  );

  return (
    <>
      <PageHeader
        title="Appointments"
        description={`Today · ${format(new Date(), 'EEEE, d MMMM')}`}
        actions={
          <>
            <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="View">
              <button role="tab" aria-selected={view === 'schedule'} onClick={() => setView('schedule')} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium', view === 'schedule' ? 'bg-card text-primary shadow-card' : 'text-muted-foreground')}><Columns3 className="h-3.5 w-3.5" /> Schedule</button>
              <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium', view === 'list' ? 'bg-card text-primary shadow-card' : 'text-muted-foreground')}><LayoutList className="h-3.5 w-3.5" /> List</button>
            </div>
            <Button onClick={() => setOpen(true)}><Plus /> Book appointment</Button>
          </>
        }
      />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Appointments today" value={stats.total} icon={CalendarClock} loading={isLoading} />
        <StatCard label="Completed" value={stats.done} icon={CheckCircle2} loading={isLoading} />
        <StatCard label="Upcoming" value={stats.upcoming} icon={Clock} loading={isLoading} />
        <StatCard label="Expected revenue" value={formatINR(stats.revenue)} icon={IndianRupee} loading={isLoading} />
      </div>

      {isLoading || setup.loading ? (
        <Skeleton className="h-[520px] rounded-2xl" />
      ) : view === 'schedule' && staffList.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No appointments yet."
            description="Add your staff in Employees and your services in Services, then start booking appointments."
            actionLabel="Book appointment"
            onAction={() => setOpen(true)}
          />
        </Card>
      ) : view === 'schedule' ? (
        <Card className="overflow-hidden">
          <div className="scrollbar-thin overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid border-b border-border" style={{ gridTemplateColumns: `64px repeat(${staffList.length}, 1fr)` }}>
                <div />
                {staffList.map((s) => (
                  <div key={s} className="flex items-center gap-2 border-l border-border px-3 py-3">
                    <Avatar name={s} size="sm" />
                    <div className="min-w-0"><p className="truncate text-[13px] font-semibold">{s}</p><p className="text-2xs text-subtle">{data?.filter((a) => a.staff === s && a.status !== 'cancelled').length} bookings</p></div>
                  </div>
                ))}
              </div>
              <div className="relative grid" style={{ gridTemplateColumns: `64px repeat(${staffList.length}, 1fr)`, height: (END_HOUR - START_HOUR) * HOUR_PX }}>
                <div className="relative">
                  {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                    <span key={i} className="absolute right-2 -translate-y-1/2 text-2xs text-subtle" style={{ top: i * HOUR_PX }}>{i === 0 ? '' : format(setHours(new Date(), START_HOUR + i), 'h a')}</span>
                  ))}
                </div>
                {staffList.map((staff) => (
                  <div key={staff} className="relative border-l border-border">
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ top: i * HOUR_PX }} />)}
                    {data?.filter((a) => a.staff === staff).map((a) => {
                      const d = parseISO(a.start);
                      const top = (d.getHours() + d.getMinutes() / 60 - START_HOUR) * HOUR_PX;
                      const height = Math.max(28, (a.durationMins / 60) * HOUR_PX - 4);
                      return (
                        <DropdownMenu key={a.id}>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className={cn('absolute inset-x-1.5 overflow-hidden rounded-lg border-l-[3px] px-2.5 py-1.5 text-left transition-shadow hover:shadow-card', STATUS_STYLE[a.status])} style={{ top: top + 2, height }}>
                              <p className="truncate text-xs font-semibold">{a.customer}</p>
                              {height > 40 && <p className="truncate text-2xs text-muted-foreground">{a.service}</p>}
                              {height > 56 && <p className="text-2xs text-subtle">{formatTime(a.start)} · {a.durationMins}m</p>}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-52">{actionMenu(a)}</DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })}
                  </div>
                ))}
                {nowTop > 0 && nowTop < (END_HOUR - START_HOUR) * HOUR_PX && (
                  <div className="pointer-events-none absolute left-16 right-0 z-[1] flex items-center" style={{ top: nowTop }} aria-hidden>
                    <span className="-ml-1 h-2 w-2 rounded-full bg-danger" />
                    <span className="h-px flex-1 bg-danger" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <DataTable
          data={data}
          getRowId={(a) => a.id}
          searchText={(a) => `${a.customer} ${a.service} ${a.staff}`}
          searchPlaceholder="Search appointments"
          initialSort={{ id: 'time', dir: 'asc' }}
          filters={[{ id: 'staff', label: 'Staff', options: staffList.map((s) => ({ value: s, label: s })), predicate: (a, v) => a.staff === v }]}
          columns={[
            { id: 'time', header: 'Time', sortValue: (a) => a.start, cell: (a) => <span className="font-semibold">{formatTime(a.start)}</span> },
            { id: 'customer', header: 'Customer', hideable: false, cell: (a) => <div><p className="font-medium">{a.customer}</p><p className="text-2xs text-subtle">{a.phone}</p></div> },
            { id: 'service', header: 'Service', cell: (a) => a.service },
            { id: 'staff', header: 'Staff', cell: (a) => a.staff },
            { id: 'duration', header: 'Duration', cell: (a) => `${a.durationMins} min` },
            { id: 'price', header: 'Price', align: 'right', cell: (a) => formatINR(a.price) },
            { id: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
          ]}
          rowActions={[
            { label: 'Start service', icon: Play, onSelect: (a) => setStatus.mutate({ id: a.id, status: 'in-progress' }), hidden: (a) => a.status !== 'booked' },
            { label: 'Complete', icon: CheckCircle2, onSelect: (a) => setStatus.mutate({ id: a.id, status: 'completed' }), hidden: (a) => !['booked', 'in-progress'].includes(a.status) },
            { label: 'Cancel', icon: XCircle, destructive: true, onSelect: (a) => setStatus.mutate({ id: a.id, status: 'cancelled' }), hidden: (a) => a.status !== 'booked' },
            del.action,
          ]}
          empty={<EmptyState icon={CalendarClock} title="No appointments today." description="Book your first appointment to fill the schedule." actionLabel="Book appointment" onAction={() => setOpen(true)} />}
        />
      )}
      <BookDrawer open={open} onOpenChange={setOpen} />
      {del.dialog}
    </>
  );
}
