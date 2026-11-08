import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { BedDouble, CalendarCheck, CalendarClock, IndianRupee, LogIn, LogOut, Plus, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Drawer } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAppMutation } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { hotelService } from '@/services';
import type { Reservation } from '@/types';

const KEY = ['hotel', 'reservations'];

const schema = z
  .object({
    guest: z.string().trim().min(2, 'Guest name is required').max(60),
    phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/, 'Enter a valid mobile number'),
    roomNumber: z.string().min(1, 'Choose a room'),
    checkIn: z.string().min(1),
    checkOut: z.string().min(1),
    guests: z.coerce.number().int().min(1).max(6),
    advance: z.coerce.number().min(0),
    source: z.enum(['Walk-in', 'Website', 'Phone', 'OTA']),
  })
  .refine((v) => v.checkOut > v.checkIn, { path: ['checkOut'], message: 'Check-out must be after check-in' });
type Values = z.infer<typeof schema>;

function NewReservation({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const rooms = useQuery({ queryKey: ['hotel', 'rooms'], queryFn: hotelService.rooms.list });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    const d = new Date();
    const out = new Date(Date.now() + 864e5);
    if (open) reset({ guest: '', phone: '', roomNumber: '', checkIn: d.toISOString().slice(0, 10), checkOut: out.toISOString().slice(0, 10), guests: 2, advance: 0, source: 'Phone' });
  }, [open, reset]);
  const room = rooms.data?.find((r) => r.number === watch('roomNumber'));
  const nights = Math.max(1, differenceInCalendarDays(parseISO(watch('checkOut') || new Date().toISOString()), parseISO(watch('checkIn') || new Date().toISOString())));
  const amount = (room?.rate ?? 0) * nights;
  const save = useAppMutation(
    (v: Values) =>
      hotelService.reservations.create({
        ...v,
        guest: sanitizeText(v.guest, 60),
        checkIn: new Date(v.checkIn).toISOString(),
        checkOut: new Date(v.checkOut).toISOString(),
      }),
    { invalidate: [KEY], success: (r) => `Reservation ${r.code} confirmed for ${r.guest}`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New reservation"
      description={room ? `${nights} night${nights > 1 ? 's' : ''} · ${formatINR(amount)}` : 'Book a room for a guest.'}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>Confirm booking</Button></>}
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Guest name" error={errors.guest?.message} required className="sm:col-span-2"><Input {...register('guest')} autoFocus /></FormField>
        <FormField label="Mobile" error={errors.phone?.message} required><Input {...register('phone')} inputMode="tel" /></FormField>
        <FormField label="Guests"><Input {...register('guests')} inputMode="numeric" /></FormField>
        <FormField label="Check-in"><DatePicker value={watch('checkIn')} onChange={(d) => setValue('checkIn', d, { shouldValidate: true })} /></FormField>
        <FormField label="Check-out" error={errors.checkOut?.message}><DatePicker value={watch('checkOut')} onChange={(d) => setValue('checkOut', d, { shouldValidate: true })} /></FormField>
        <FormField label="Room" error={errors.roomNumber?.message} required className="sm:col-span-2">
          <NativeSelect {...register('roomNumber')}>
            <option value="">Select an available room</option>
            {rooms.data?.filter((r) => r.status === 'available').map((r) => <option key={r.id} value={r.number}>Room {r.number} · {r.type} · {formatINR(r.rate)}/night</option>)}
          </NativeSelect>
        </FormField>
        <FormField label="Advance received (₹)"><Input {...register('advance')} inputMode="numeric" /></FormField>
        <FormField label="Source"><NativeSelect {...register('source')}>{['Walk-in', 'Website', 'Phone', 'OTA'].map((s) => <option key={s}>{s}</option>)}</NativeSelect></FormField>
      </form>
    </Drawer>
  );
}

export function ReservationsPage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: hotelService.reservations.list });
  const [open, setOpen] = useState(false);
  const setStatus = useAppMutation(({ id, status }: { id: string; status: Reservation['status'] }) => hotelService.reservations.update(id, { status }), {
    invalidate: [KEY, ['hotel', 'rooms']],
    success: (r) => `${r.guest} · ${r.status.replace('-', ' ')}`,
  });
  const del = useDeleteAction<Reservation>({
    page: 'hotel-reservations',
    name: (r) => `booking ${r.code}`,
    remove: (r) => hotelService.reservations.remove(r.id),
    invalidate: [KEY, ['hotel', 'rooms']],
    hidden: (r) => r.status === 'checked-in',
    description: (r) => `${r.guest} · Room ${r.roomNumber}, ${formatDate(r.checkIn)} – ${formatDate(r.checkOut)}.${r.advance > 0 ? ` Settle the ${formatINR(r.advance)} advance with the guest separately.` : ''}`,
  });
  const stats = useMemo(() => {
    const list = data ?? [];
    const today = new Date().toDateString();
    return {
      arrivals: list.filter((r) => new Date(r.checkIn).toDateString() === today && r.status !== 'cancelled').length,
      departures: list.filter((r) => new Date(r.checkOut).toDateString() === today).length,
      inHouse: list.filter((r) => r.status === 'checked-in').length,
      revenue: list.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + r.amount, 0),
    };
  }, [data]);

  return (
    <>
      <PageHeader title="Reservations" description="Bookings, arrivals and departures." actions={<Button onClick={() => setOpen(true)}><Plus /> New reservation</Button>} />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Arrivals today" value={stats.arrivals} icon={LogIn} loading={isLoading} />
        <StatCard label="Departures today" value={stats.departures} icon={LogOut} loading={isLoading} />
        <StatCard label="Guests in house" value={stats.inHouse} icon={BedDouble} loading={isLoading} />
        <StatCard label="Booked revenue" value={formatINR(stats.revenue)} icon={IndianRupee} loading={isLoading} />
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.code} ${r.guest} ${r.phone} ${r.roomNumber}`}
        searchPlaceholder="Search guest, booking or room"
        initialSort={{ id: 'in', dir: 'asc' }}
        filters={[
          { id: 'status', label: 'Statuses', options: ['confirmed', 'pending', 'checked-in', 'checked-out', 'cancelled'].map((s) => ({ value: s, label: s.replace('-', ' ').replace(/^\w/, (c) => c.toUpperCase()) })), predicate: (r, v) => r.status === v },
          { id: 'source', label: 'Sources', options: ['Walk-in', 'Website', 'Phone', 'OTA'].map((s) => ({ value: s, label: s })), predicate: (r, v) => r.source === v },
        ]}
        columns={[
          { id: 'guest', header: 'Guest', hideable: false, sortValue: (r) => r.guest, cell: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.guest} size="sm" /><div><p className="font-medium">{r.guest}</p><p className="text-2xs text-subtle">{r.code} · {r.source}</p></div></div> },
          { id: 'room', header: 'Room', cell: (r) => <span>{r.roomNumber} <span className="text-xs text-subtle">· {r.roomType}</span></span> },
          { id: 'in', header: 'Check-in', sortValue: (r) => r.checkIn, cell: (r) => formatDate(r.checkIn) },
          { id: 'out', header: 'Check-out', sortValue: (r) => r.checkOut, cell: (r) => formatDate(r.checkOut) },
          { id: 'guests', header: 'Guests', align: 'right', cell: (r) => r.guests },
          { id: 'amount', header: 'Amount', align: 'right', sortValue: (r) => r.amount, cell: (r) => <div><p className="font-semibold">{formatINR(r.amount)}</p>{r.advance > 0 && <p className="text-2xs text-success">{formatINR(r.advance)} advance</p>}</div> },
          { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
        ]}
        rowActions={[
          { label: 'Check in', icon: LogIn, onSelect: (r) => setStatus.mutate({ id: r.id, status: 'checked-in' }), hidden: (r) => !['confirmed', 'pending'].includes(r.status) },
          { label: 'Check out', icon: LogOut, onSelect: (r) => setStatus.mutate({ id: r.id, status: 'checked-out' }), hidden: (r) => r.status !== 'checked-in' },
          { label: 'Confirm', icon: CalendarCheck, onSelect: (r) => setStatus.mutate({ id: r.id, status: 'confirmed' }), hidden: (r) => r.status !== 'pending' },
          { label: 'Cancel booking', icon: XCircle, destructive: true, onSelect: (r) => setStatus.mutate({ id: r.id, status: 'cancelled' }), hidden: (r) => ['cancelled', 'checked-out', 'checked-in'].includes(r.status) },
          del.action,
        ]}
        empty={<EmptyState icon={CalendarClock} title="No reservations yet." description="Create your first booking to start filling rooms." actionLabel="New reservation" onAction={() => setOpen(true)} />}
      />
      <NewReservation open={open} onOpenChange={setOpen} />
      {del.dialog}
    </>
  );
}
