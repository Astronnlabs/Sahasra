import { useQuery } from '@tanstack/react-query';
import { BedDouble, CalendarClock, DoorOpen, LogIn, LogOut, Percent, Plus, Sparkles, Trash2, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { sanitizeText } from '@/lib/sanitize';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppMutation } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { hotelService } from '@/services';
import type { Room, RoomStatus } from '@/types';

const ROOM_STYLE: Record<RoomStatus, { label: string; card: string; dot: string }> = {
  available: { label: 'Available', card: 'border-success/30 bg-success-soft/40', dot: 'bg-success' },
  occupied: { label: 'Occupied', card: 'border-primary/40 bg-primary-light/60', dot: 'bg-primary' },
  reserved: { label: 'Reserved', card: 'border-warning/40 bg-warning-soft/50', dot: 'bg-warning' },
  cleaning: { label: 'Cleaning', card: 'border-info/30 bg-info-soft/50', dot: 'bg-info' },
  maintenance: { label: 'Maintenance', card: 'border-danger/30 bg-danger-soft/40', dot: 'bg-danger' },
};

const ROOMS_KEY = ['hotel', 'rooms'];
const ROOM_TYPES: Room['type'][] = ['Standard', 'Deluxe', 'Executive', 'Suite'];

function AddRoomModal({ open, onOpenChange, rooms }: { open: boolean; onOpenChange: (o: boolean) => void; rooms: Room[] }) {
  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('1');
  const [roomType, setRoomType] = useState<Room['type']>('Standard');
  const [rate, setRate] = useState('');
  useEffect(() => {
    if (open) {
      setNumber('');
      setRate('');
    }
  }, [open]);
  const duplicate = rooms.some((r) => r.number === number.trim());
  const save = useAppMutation(
    () => hotelService.rooms.create({ number: sanitizeText(number, 8), floor: Math.max(0, Number(floor) || 0), type: roomType, rate: Number(rate), status: 'available' }),
    { invalidate: [ROOMS_KEY], success: (r) => `Room ${r.number} added`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add room"
      size="sm"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!number.trim() || duplicate || !(Number(rate) > 0)}>Add room</Button></>}
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        <FormField label="Room number" required error={duplicate ? 'This room number already exists' : undefined}><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="101" maxLength={8} autoFocus /></FormField>
        <FormField label="Floor"><Input value={floor} onChange={(e) => setFloor(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></FormField>
        <FormField label="Room type"><NativeSelect value={roomType} onChange={(e) => setRoomType(e.target.value as Room['type'])}>{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</NativeSelect></FormField>
        <FormField label="Rate per night (₹)" required><Input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></FormField>
      </div>
    </Modal>
  );
}

export function RoomsPage() {
  const { data, isLoading } = useQuery({ queryKey: ROOMS_KEY, queryFn: hotelService.rooms.list });
  const [type, setType] = useState('All');
  const [adding, setAdding] = useState(false);
  const update = useAppMutation(({ id, patch }: { id: string; patch: Partial<Room> }) => hotelService.rooms.update(id, patch), {
    invalidate: [ROOMS_KEY],
    success: (r) => `Room ${r.number} · ${ROOM_STYLE[r.status].label.toLowerCase()}`,
  });
  const del = useDeleteAction<Room>({
    page: 'hotel-rooms',
    name: (r) => `Room ${r.number}`,
    remove: (r) => hotelService.rooms.remove(r.id),
    invalidate: [ROOMS_KEY],
    description: (r) => `${r.type} room on floor ${r.floor}. Past bookings keep the room number.`,
  });

  const stats = useMemo(() => {
    const list = data ?? [];
    const occ = list.filter((r) => r.status === 'occupied');
    return {
      occupancy: list.length ? Math.round((occ.length / list.length) * 100) : 0,
      available: list.filter((r) => r.status === 'available').length,
      adr: occ.length ? Math.round(occ.reduce((s, r) => s + r.rate, 0) / occ.length) : 0,
      revenue: occ.reduce((s, r) => s + r.rate, 0),
      checkouts: occ.filter((r) => r.checkOut && new Date(r.checkOut).toDateString() === new Date().toDateString()).length,
    };
  }, [data]);

  const floors = useMemo(() => {
    const map = new Map<number, Room[]>();
    (data ?? []).filter((r) => type === 'All' || r.type === type).forEach((r) => map.set(r.floor, [...(map.get(r.floor) ?? []), r]));
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [data, type]);

  const actionsFor = (r: Room) => {
    switch (r.status) {
      case 'available':
        return [{ label: 'Check in walk-in guest', icon: LogIn, patch: { status: 'occupied' as const, guest: 'Walk-in Guest' } }, { label: 'Block for maintenance', icon: Wrench, patch: { status: 'maintenance' as const } }];
      case 'reserved':
        return [{ label: `Check in ${r.guest}`, icon: LogIn, patch: { status: 'occupied' as const } }];
      case 'occupied':
        return [{ label: 'Check out', icon: LogOut, patch: { status: 'cleaning' as const, guest: undefined, checkOut: undefined } }];
      case 'cleaning':
      case 'maintenance':
        return [{ label: 'Mark ready', icon: Sparkles, patch: { status: 'available' as const } }];
    }
  };

  return (
    <>
      <PageHeader
        title="Rooms"
        description="Live room board with housekeeping status."
        actions={
          <>
            <Button variant="secondary" asChild><Link to="/hotel/reservations"><CalendarClock /> Reservations</Link></Button>
            <Button onClick={() => setAdding(true)}><Plus /> Add room</Button>
          </>
        }
      />
      <AddRoomModal open={adding} onOpenChange={setAdding} rooms={data ?? []} />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Occupancy" value={`${stats.occupancy}%`} icon={Percent} loading={isLoading} accent />
        <StatCard label="Rooms available" value={stats.available} icon={DoorOpen} loading={isLoading} hint={`of ${data?.length ?? 0}`} />
        <StatCard label="Average daily rate" value={formatINR(stats.adr)} icon={BedDouble} loading={isLoading} />
        <StatCard label="Room revenue tonight" value={formatINR(stats.revenue)} icon={LogOut} loading={isLoading} hint={`${stats.checkouts} check-outs today`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="Room type">
          {['All', 'Standard', 'Deluxe', 'Executive', 'Suite'].map((t) => (
            <button key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)} className={cn('rounded-md px-3 py-1.5 text-xs font-medium', type === t ? 'bg-card text-primary shadow-card' : 'text-muted-foreground')}>{t}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(Object.keys(ROOM_STYLE) as RoomStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', ROOM_STYLE[s].dot)} />{ROOM_STYLE[s].label}</span>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !data?.length ? (
        <Card><EmptyState icon={BedDouble} title="No rooms yet." description="Add your rooms with their type and nightly rate to start taking reservations." actionLabel="Add room" onAction={() => setAdding(true)} /></Card>
      ) : (
        <div className="space-y-5">
          {floors.map(([floor, rooms]) => (
            <Card key={floor} className="p-5">
              <p className="section-label mb-3">Floor {floor}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
                {rooms.map((r) => {
                  const s = ROOM_STYLE[r.status];
                  return (
                    <DropdownMenu key={r.id}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className={cn('flex min-h-[112px] flex-col rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-card', s.card)} aria-label={`Room ${r.number}, ${r.type}, ${s.label}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-semibold">{r.number}</span>
                            <span className={cn('h-2 w-2 rounded-full', s.dot)} />
                          </div>
                          <span className="text-2xs text-muted-foreground">{r.type} · {formatINR(r.rate)}</span>
                          <span className="mt-auto truncate pt-2 text-xs font-medium">{r.guest ?? s.label}</span>
                          {r.checkOut && <span className="text-2xs text-subtle">Out {formatDate(r.checkOut)}</span>}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel>Room {r.number} · {s.label}</DropdownMenuLabel>
                        {actionsFor(r).map((a) => (
                          <DropdownMenuItem key={a.label} onSelect={() => update.mutate({ id: r.id, patch: a.patch })}>
                            <a.icon /> {a.label}
                          </DropdownMenuItem>
                        ))}
                        {r.status !== 'occupied' && del.can(r) && (
                          <DropdownMenuItem destructive onSelect={() => del.ask(r)}>
                            <Trash2 /> Delete room
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
      {del.dialog}
    </>
  );
}
