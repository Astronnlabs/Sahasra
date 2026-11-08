import { useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInMinutes, parseISO } from 'date-fns';
import { Bike, ChefHat, Clock, Link2, Plus, ShoppingBag, Sparkles, Users, UtensilsCrossed } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { qk, useAppMutation } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { restaurantService } from '@/services';
import type { RestaurantOrder, RestaurantTable, TableStatus } from '@/types';
import { OrderDrawer } from './OrderDrawer';

export const TABLE_STYLES: Record<TableStatus, { label: string; card: string; dot: string }> = {
  available: { label: 'Available', card: 'border-success/30 bg-success-soft/40 hover:border-success/60', dot: 'bg-success' },
  occupied: { label: 'Occupied', card: 'border-primary/40 bg-primary-light/60 hover:border-primary', dot: 'bg-primary' },
  reserved: { label: 'Reserved', card: 'border-warning/40 bg-warning-soft/50 hover:border-warning', dot: 'bg-warning' },
  cleaning: { label: 'Cleaning', card: 'border-info/30 bg-info-soft/50 hover:border-info/60', dot: 'bg-info' },
};

const AREAS = ['All areas', 'Ground Floor', 'First Floor', 'Terrace'] as const;

function AddTableModal({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing: number }) {
  const [label, setLabel] = useState('');
  const [seats, setSeats] = useState('4');
  const [area, setArea] = useState<RestaurantTable['area']>('Ground Floor');
  useEffect(() => {
    if (open) {
      setLabel(`T${String(existing + 1).padStart(2, '0')}`);
      setSeats('4');
    }
  }, [open, existing]);
  const save = useAppMutation(() => restaurantService.addTable({ label: sanitizeText(label, 10).toUpperCase(), seats: Math.max(1, Number(seats) || 1), area }), {
    invalidate: [['restaurant']],
    success: (t) => `Table ${t.label} added`,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add table"
      size="sm"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!label.trim()}>Add table</Button></>}
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        <FormField label="Table name" required><Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={10} autoFocus /></FormField>
        <FormField label="Seats"><Input value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></FormField>
        <FormField label="Area" className="sm:col-span-2">
          <NativeSelect value={area} onChange={(e) => setArea(e.target.value as RestaurantTable['area'])}>{AREAS.slice(1).map((a) => <option key={a}>{a}</option>)}</NativeSelect>
        </FormField>
      </div>
    </Modal>
  );
}

export function TablesPage() {
  const qc = useQueryClient();
  const tables = useQuery({ queryKey: qk.restaurant('tables'), queryFn: restaurantService.tables, refetchInterval: 30_000 });
  const orders = useQuery({ queryKey: qk.restaurant('orders'), queryFn: restaurantService.orders });
  const [area, setArea] = useState<(typeof AREAS)[number]>('All areas');
  const [statusFilter, setStatusFilter] = useState<TableStatus | 'all'>('all');
  const [active, setActive] = useState<{ orderId: string; tableId?: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const orderMap = useMemo(() => new Map((orders.data ?? []).map((o) => [o.id, o])), [orders.data]);
  const counts = useMemo(() => {
    const c: Record<TableStatus, number> = { available: 0, occupied: 0, reserved: 0, cleaning: 0 };
    tables.data?.forEach((t) => (c[t.status] += 1));
    return c;
  }, [tables.data]);

  const visible = (tables.data ?? []).filter((t) => (area === 'All areas' || t.area === area) && (statusFilter === 'all' || t.status === statusFilter));
  const openOrder = active ? orderMap.get(active.orderId) ?? null : null;
  const activeTable = active?.tableId ? tables.data?.find((t) => t.id === active.tableId) : undefined;

  const refresh = () => qc.invalidateQueries({ queryKey: ['restaurant'] });

  const onTable = async (t: RestaurantTable) => {
    if (t.status === 'cleaning') {
      await restaurantService.setTableStatus(t.id, 'available');
      refresh();
      toast.success(`${t.label} is ready for guests`);
      return;
    }
    const order = t.orderId ? orderMap.get(t.orderId) : await restaurantService.openOrder(t.id, 'dine-in');
    if (!t.orderId) {
      await refresh();
      if (t.status === 'reserved') toast.success(`${t.reservedFor?.split(' · ')[0] ?? 'Guests'} seated at ${t.label}`);
    }
    if (order) setActive({ orderId: order.id, tableId: t.id });
  };

  const newOrder = async (type: 'takeaway' | 'delivery') => {
    const order = await restaurantService.openOrder(undefined, type, type === 'takeaway' ? 'Walk-in' : 'Online order');
    await refresh();
    setActive({ orderId: order.id });
  };

  const tableTotal = (o?: RestaurantOrder) => (o ? Math.round(o.lines.reduce((s, l) => s + l.qty * l.price, 0) * 1.05) : 0);

  return (
    <>
      <PageHeader
        title="Tables"
        description="Live floor view — tap a table to take or update an order."
        actions={
          <>
            <Button variant="secondary" asChild><Link to="/restaurant/kitchen"><ChefHat /> Kitchen</Link></Button>
            <Button variant="secondary" onClick={() => newOrder('delivery')}><Bike /> Delivery</Button>
            <Button variant="secondary" onClick={() => newOrder('takeaway')}><ShoppingBag /> Takeaway</Button>
            <Button onClick={() => setAdding(true)}><Plus /> Add table</Button>
          </>
        }
      />
      <AddTableModal open={adding} onOpenChange={setAdding} existing={tables.data?.length ?? 0} />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          <button onClick={() => setStatusFilter('all')} className={cn('shrink-0 rounded-xl border px-3.5 py-2 text-left', statusFilter === 'all' ? 'border-primary bg-card shadow-card' : 'border-border bg-card/60')}>
            <span className="block text-2xs text-muted-foreground">All tables</span>
            <span className="tabular text-lg font-semibold">{tables.data?.length ?? '–'}</span>
          </button>
          {(Object.keys(TABLE_STYLES) as TableStatus[]).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={cn('shrink-0 rounded-xl border px-3.5 py-2 text-left', statusFilter === s ? 'border-primary bg-card shadow-card' : 'border-border bg-card/60')}>
              <span className="flex items-center gap-1.5 text-2xs text-muted-foreground"><span className={cn('h-1.5 w-1.5 rounded-full', TABLE_STYLES[s].dot)} />{TABLE_STYLES[s].label}</span>
              <span className="tabular text-lg font-semibold">{counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="Area">
          {AREAS.map((a) => (
            <button key={a} role="tab" aria-selected={area === a} onClick={() => setArea(a)} className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium', area === a ? 'bg-card text-primary shadow-card' : 'text-muted-foreground')}>{a}</button>
          ))}
        </div>
      </div>

      {tables.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      ) : !tables.data?.length ? (
        <Card>
          <EmptyState icon={UtensilsCrossed} title="No tables yet." description="Add the tables in your restaurant to start taking dine-in orders. Takeaway and delivery work without tables." actionLabel="Add table" onAction={() => setAdding(true)} />
        </Card>
      ) : (
        <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {visible.map((t) => {
            const style = TABLE_STYLES[t.status];
            const order = t.orderId ? orderMap.get(t.orderId) : undefined;
            const mins = t.openedAt ? differenceInMinutes(new Date(), parseISO(t.openedAt)) : 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTable(t)}
                className={cn('group relative flex min-h-[140px] flex-col rounded-2xl border-2 p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card', style.card)}
                aria-label={`${t.label}, ${style.label}, ${t.seats} seats`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-xl font-semibold tracking-tight">{t.label}</span>
                  <span className="flex items-center gap-1 rounded-full bg-card/80 px-2 py-0.5 text-2xs font-medium">
                    <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} /> {style.label}
                  </span>
                </div>
                <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" /> {t.guests ? `${t.guests}/${t.seats}` : t.seats} seats</span>
                <div className="mt-auto pt-3 text-xs">
                  {t.status === 'occupied' && (
                    <div className="flex items-end justify-between">
                      <span className={cn('flex items-center gap-1', mins > 45 ? 'font-semibold text-danger' : 'text-muted-foreground')}><Clock className="h-3 w-3" /> {mins} min · {t.waiter}</span>
                      <span className="tabular text-[14px] font-semibold text-primary">{formatINR(tableTotal(order))}</span>
                    </div>
                  )}
                  {t.mergedWith?.length ? <span className="mt-1 flex items-center gap-1 text-2xs text-primary"><Link2 className="h-3 w-3" /> Merged</span> : null}
                  {t.status === 'reserved' && <span className="text-[#8a5d07] dark:text-warning">{t.reservedFor}</span>}
                  {t.status === 'cleaning' && <span className="flex items-center gap-1 text-info"><Sparkles className="h-3 w-3" /> Tap when ready</span>}
                  {t.status === 'available' && <span className="text-success opacity-0 transition-opacity group-hover:opacity-100">Tap to start order</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <OrderDrawer order={openOrder} table={activeTable} tables={tables.data ?? []} onOpenChange={(o) => !o && setActive(null)} />
    </>
  );
}
