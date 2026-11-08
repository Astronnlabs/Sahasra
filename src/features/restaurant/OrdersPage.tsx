import { useQuery } from '@tanstack/react-query';
import { Bike, ChefHat, ClipboardList, ShoppingBag, Utensils } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { qk } from '@/hooks/queries';
import { formatINR, formatTime, timeAgo } from '@/lib/format';
import { restaurantService } from '@/services';
import type { OrderType, RestaurantOrder } from '@/types';
import { OrderDrawer } from './OrderDrawer';

const TYPE_ICON: Record<OrderType, typeof Utensils> = { 'dine-in': Utensils, takeaway: ShoppingBag, delivery: Bike };

export function OrdersPage() {
  const orders = useQuery({ queryKey: qk.restaurant('orders'), queryFn: restaurantService.orders });
  const kots = useQuery({ queryKey: qk.restaurant('kots'), queryFn: restaurantService.kots, refetchInterval: 15_000 });
  const tables = useQuery({ queryKey: qk.restaurant('tables'), queryFn: restaurantService.tables });
  const [active, setActive] = useState<RestaurantOrder | null>(null);
  const open = (orders.data ?? []).filter((o) => o.status === 'open');
  const tableLabel = (o: RestaurantOrder) => tables.data?.find((t) => t.id === o.tableId)?.label;
  const value = (o: RestaurantOrder) => Math.round(o.lines.reduce((s, l) => s + l.qty * l.price, 0) * 1.05);

  return (
    <>
      <PageHeader
        title="Orders & KOT"
        description="All running orders across dine-in, takeaway and delivery."
        actions={<Button asChild><Link to="/restaurant/kitchen"><ChefHat /> Kitchen display</Link></Button>}
      />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Running orders" value={open.length} icon={ClipboardList} loading={orders.isLoading} />
        <StatCard label="Dine-in" value={open.filter((o) => o.type === 'dine-in').length} icon={Utensils} loading={orders.isLoading} />
        <StatCard label="Takeaway & delivery" value={open.filter((o) => o.type !== 'dine-in').length} icon={Bike} loading={orders.isLoading} />
        <StatCard label="Open order value" value={formatINR(open.reduce((s, o) => s + value(o), 0))} icon={ShoppingBag} loading={orders.isLoading} />
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="kots">KOTs {kots.data && <Badge tone="primary">{kots.data.filter((k) => k.status !== 'served').length}</Badge>}</TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          <DataTable
            data={orders.data}
            isLoading={orders.isLoading}
            getRowId={(o) => o.id}
            searchText={(o) => `${o.number} ${o.customer ?? ''} ${tableLabel(o) ?? ''}`}
            searchPlaceholder="Search orders"
            onRowClick={(o) => o.status === 'open' && setActive(o)}
            filters={[{ id: 'type', label: 'Order types', options: [{ value: 'dine-in', label: 'Dine-in' }, { value: 'takeaway', label: 'Takeaway' }, { value: 'delivery', label: 'Delivery' }], predicate: (o, v) => o.type === v }]}
            columns={[
              { id: 'num', header: 'Order', hideable: false, cell: (o) => <span className="font-semibold">{o.number}</span> },
              {
                id: 'type',
                header: 'Type',
                cell: (o) => {
                  const I = TYPE_ICON[o.type];
                  return <span className="inline-flex items-center gap-1.5 capitalize"><I className="h-3.5 w-3.5 text-subtle" />{o.type}</span>;
                },
              },
              { id: 'where', header: 'Table / Customer', cell: (o) => tableLabel(o) ?? o.customer ?? '—' },
              { id: 'items', header: 'Items', align: 'right', cell: (o) => o.lines.reduce((s, l) => s + l.qty, 0) },
              { id: 'time', header: 'Started', sortValue: (o) => o.createdAt, cell: (o) => <span className="text-muted-foreground">{formatTime(o.createdAt)} · {timeAgo(o.createdAt)}</span> },
              { id: 'value', header: 'Value', align: 'right', cell: (o) => <span className="font-semibold">{formatINR(value(o))}</span> },
              { id: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
            ]}
            empty={<EmptyState icon={ClipboardList} title="No orders yet." description="Orders from tables, takeaway and delivery will appear here." />}
          />
        </TabsContent>
        <TabsContent value="kots">
          <DataTable
            data={kots.data}
            isLoading={kots.isLoading}
            getRowId={(k) => k.id}
            searchText={(k) => `${k.number} ${k.table}`}
            columns={[
              { id: 'num', header: 'KOT', hideable: false, cell: (k) => <span className="font-semibold">{k.number}</span> },
              { id: 'table', header: 'Table', cell: (k) => k.table },
              { id: 'items', header: 'Items', cell: (k) => <span className="text-muted-foreground">{k.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span> },
              { id: 'time', header: 'Sent', cell: (k) => timeAgo(k.createdAt) },
              { id: 'status', header: 'Status', cell: (k) => <StatusBadge status={k.status} /> },
            ]}
            empty={<EmptyState icon={ChefHat} title="No KOTs yet." description="Send items to the kitchen from an order to create a KOT." />}
          />
        </TabsContent>
      </Tabs>

      <OrderDrawer order={active} table={tables.data?.find((t) => t.id === active?.tableId)} tables={tables.data ?? []} onOpenChange={(o) => !o && setActive(null)} />
    </>
  );
}
