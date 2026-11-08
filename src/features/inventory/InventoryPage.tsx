import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Boxes, CalendarClock, IndianRupee, PackageMinus, PackageX, Plus, SlidersHorizontal, Truck, Warehouse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/ui/avatar';
import { PartyFormDrawer } from '@/features/customers/PartyFormDrawer';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AreaTrendChart, BarsChart, ChartLegend } from '@/components/charts/Charts';
import { ChartCard } from '@/components/charts/ChartCard';
import { useChartTheme } from '@/components/charts/useChartTheme';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DEFAULT_WAREHOUSE } from '@/app/config/constants';
import { qk, useAppMutation, useVendors } from '@/hooks/queries';
import { formatDate, formatDateTime, formatINR, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { inventoryService } from '@/services';
import type { Product, StockMovement, VendorSupply } from '@/types';

const adjustSchema = z.object({
  productId: z.string().min(1, 'Choose a product'),
  direction: z.enum(['add', 'remove']),
  qty: z.coerce.number().positive('Enter a quantity'),
  reason: z.string().min(1),
  warehouse: z.string().min(1),
  vendorId: z.string(),
});
type AdjustValues = z.infer<typeof adjustSchema>;

const REMOVE_REASONS = ['Damaged', 'Expired', 'Stock count correction', 'Theft / loss', 'Free sample'];
const ADD_REASONS = ['Received from vendor', 'Opening stock', 'Stock count correction', 'Returned by customer'];

function AdjustModal({ open, onOpenChange, products, defaultProductId, defaultDirection }: { open: boolean; onOpenChange: (o: boolean) => void; products: Product[]; defaultProductId?: string; defaultDirection: 'add' | 'remove' }) {
  const form = useForm<AdjustValues>({ resolver: zodResolver(adjustSchema) });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = form;
  const { data: vendors } = useVendors();
  const [addingVendor, setAddingVendor] = useState(false);
  useEffect(() => {
    if (open) reset({ productId: defaultProductId ?? '', direction: defaultDirection, qty: 1, reason: defaultDirection === 'add' ? ADD_REASONS[0] : REMOVE_REASONS[0], warehouse: 'Main Store', vendorId: '' });
  }, [open, reset, defaultProductId, defaultDirection]);
  const product = products.find((p) => p.id === watch('productId'));
  const adding = watch('direction') === 'add';
  // The reason list depends on the direction; start each direction on its usual reason.
  useEffect(() => {
    if (open) setValue('reason', adding ? ADD_REASONS[0] : REMOVE_REASONS[0]);
  }, [open, adding, setValue]);
  const save = useAppMutation(
    (v: AdjustValues) => {
      if (!product?.allowDecimalQty && !Number.isInteger(v.qty)) throw new Error(`${product?.name ?? 'This item'} is counted in whole numbers.`);
      return inventoryService.adjust({ productId: v.productId, qty: v.direction === 'add' ? v.qty : -v.qty, reason: v.reason, warehouse: v.warehouse, vendorId: v.direction === 'add' && v.vendorId ? v.vendorId : null });
    },
    { invalidate: [qk.inventory, qk.products, qk.movements, qk.vendors, ['inventory', 'vendors'], ['dashboard']], success: (p) => `Stock updated — ${p.name} now at ${p.stock}`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={adding ? 'Add stock' : 'Stock adjustment'}
        description={adding ? 'Record stock that came in — and, if you like, which vendor supplied it.' : 'Correct stock for damage, expiry, counts or other reasons. Every change is logged.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>{adding ? 'Add stock' : 'Save adjustment'}</Button>
          </>
        }
      >
        <form className="grid gap-4 pb-2 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          <FormField label="Product" error={errors.productId?.message} required className="sm:col-span-2" hint={product ? `Current stock: ${product.stock} ${product.unit}` : undefined}>
            <NativeSelect {...register('productId')}>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock})</option>)}
            </NativeSelect>
          </FormField>
          <FormField label="Adjustment">
            <NativeSelect {...register('direction')}>
              <option value="add">Increase stock</option>
              <option value="remove">Reduce stock</option>
            </NativeSelect>
          </FormField>
          <FormField label="Quantity" error={errors.qty?.message} required>
            <Input {...register('qty')} inputMode="decimal" />
          </FormField>
          {adding && (
            <FormField label="Vendor (optional)" hint="Who supplied this stock" className="sm:col-span-2">
              <div className="flex gap-2">
                <NativeSelect {...register('vendorId')} className="flex-1">
                  <option value="">No vendor</option>
                  {(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}{v.category ? ` · ${v.category}` : ''}</option>)}
                </NativeSelect>
                <Button type="button" variant="secondary" onClick={() => setAddingVendor(true)}><Plus /> New</Button>
              </div>
            </FormField>
          )}
          <FormField label="Reason">
            <NativeSelect {...register('reason')}>{(adding ? ADD_REASONS : REMOVE_REASONS).map((r) => <option key={r}>{r}</option>)}</NativeSelect>
          </FormField>
          <FormField label="Warehouse">
            <NativeSelect {...register('warehouse')}>{Array.from(new Set([DEFAULT_WAREHOUSE, ...products.map((p) => p.warehouse)])).map((w) => <option key={w}>{w}</option>)}</NativeSelect>
          </FormField>
        </form>
      </Modal>
      <PartyFormDrawer kind="vendor" open={addingVendor} onOpenChange={setAddingVendor} onCreated={(id) => setValue('vendorId', id)} />
    </>
  );
}

/** Inventory → Vendors: suppliers and the stock each has supplied. */
function VendorsTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['inventory', 'vendors'], queryFn: inventoryService.vendors });
  const [adding, setAdding] = useState(false);
  const columns: Column<VendorSupply>[] = [
    {
      id: 'name',
      header: 'Vendor',
      hideable: false,
      sortValue: (v) => v.name,
      cell: (v) => (
        <div className="flex items-center gap-3">
          <Avatar name={v.name} size="sm" />
          <div className="min-w-0">
            <p className="font-medium">{v.name}</p>
            <p className="text-2xs text-subtle">{[v.category, v.city].filter(Boolean).join(' · ') || '—'}</p>
          </div>
        </div>
      ),
    },
    { id: 'phone', header: 'Phone', cell: (v) => <span className="text-muted-foreground">{v.phone}</span> },
    { id: 'supplies', header: 'Stock supplied', sortValue: (v) => v.supplies, cell: (v) => (v.supplies ? <div><p>{v.supplies} {v.supplies === 1 ? 'time' : 'times'} · {v.products} {v.products === 1 ? 'item' : 'items'}</p><p className="max-w-[260px] truncate text-2xs text-subtle">{v.topProducts.join(', ')}</p></div> : <span className="text-subtle">Nothing yet</span>) },
    { id: 'last', header: 'Last supplied', sortValue: (v) => v.lastSupplied ?? '', cell: (v) => <span className="text-muted-foreground">{v.lastSupplied ? formatDate(v.lastSupplied) : '—'}</span> },
    { id: 'payable', header: 'You owe', align: 'right', sortValue: (v) => v.payable, cell: (v) => (v.payable ? <span className="font-semibold text-danger">{formatINR(v.payable)}</span> : <span className="text-subtle">—</span>) },
  ];
  return (
    <>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(v) => v.id}
        searchText={(v) => `${v.name} ${v.phone} ${v.category} ${v.topProducts.join(' ')}`}
        searchPlaceholder="Search vendor, phone or item"
        onRowClick={(v) => navigate(`/vendors/${v.id}`)}
        toolbar={<Button size="sm" onClick={() => setAdding(true)}><Plus /> Add vendor</Button>}
        empty={<EmptyState icon={Truck} title="No vendors yet." description="Add the suppliers you buy stock from." actionLabel="Add vendor" onAction={() => setAdding(true)} />}
      />
      <PartyFormDrawer kind="vendor" open={adding} onOpenChange={setAdding} onCreated={() => qc.invalidateQueries({ queryKey: ['inventory', 'vendors'] })} />
    </>
  );
}

const MOVE_META: Record<StockMovement['type'], { label: string; icon: typeof ArrowUpRight; tone: string }> = {
  in: { label: 'Stock in', icon: ArrowDownLeft, tone: 'bg-success-soft text-success' },
  out: { label: 'Sale', icon: ArrowUpRight, tone: 'bg-primary-light text-primary' },
  adjustment: { label: 'Adjustment', icon: SlidersHorizontal, tone: 'bg-warning-soft text-warning' },
  transfer: { label: 'Transfer', icon: ArrowLeftRight, tone: 'bg-info-soft text-info' },
};

export function InventoryPage() {
  const c = useChartTheme();
  const overview = useQuery({ queryKey: qk.inventory, queryFn: inventoryService.overview });
  const movements = useQuery({ queryKey: qk.movements, queryFn: inventoryService.movements });
  const warehouses = useQuery({ queryKey: qk.warehouses, queryFn: inventoryService.warehouses });
  const [adjusting, setAdjusting] = useState<{ productId?: string; direction?: 'add' | 'remove' } | null>(null);
  const o = overview.data;

  const stockColumns: Column<Product>[] = [
    { id: 'name', header: 'Product', hideable: false, sortValue: (p) => p.name, cell: (p) => <div><p className="font-medium">{p.name}</p><p className="text-2xs text-subtle">{p.sku}</p></div> },
    { id: 'warehouse', header: 'Warehouse', cell: (p) => p.warehouse },
    { id: 'stock', header: 'Current stock', align: 'right', sortValue: (p) => p.stock, cell: (p) => <span className="font-semibold">{formatNumber(p.stock)}</span> },
    { id: 'min', header: 'Minimum stock', align: 'right', cell: (p) => formatNumber(p.minStock) },
    { id: 'level', header: 'Level', cell: (p) => <Progress value={p.stock} max={Math.max(p.minStock * 3, 1)} tone={p.stock === 0 ? 'danger' : p.stock <= p.minStock ? 'warning' : 'success'} className="w-28" label={`${p.name} stock level`} /> },
    { id: 'value', header: 'Value', align: 'right', sortValue: (p) => p.stock * p.purchasePrice, cell: (p) => formatINR(p.stock * p.purchasePrice) },
    { id: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.stock === 0 ? 'Out of stock' : p.stock <= p.minStock ? 'Low stock' : 'In stock'} /> },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock levels, movements, expiry and warehouses at a glance."
        actions={
          <>
            <Button variant="secondary" onClick={() => setAdjusting({ direction: 'remove' })}><SlidersHorizontal /> Stock adjustment</Button>
            <Button onClick={() => setAdjusting({ direction: 'add' })}><Plus /> Add stock</Button>
          </>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Inventory Value" value={o ? formatINR(o.totalValue) : '—'} icon={IndianRupee} loading={overview.isLoading} accent />
        <StatCard label="Low Stock" value={o?.low.length ?? 0} icon={PackageMinus} loading={overview.isLoading} hint="below minimum" />
        <StatCard label="Out of Stock" value={o?.out.length ?? 0} icon={PackageX} loading={overview.isLoading} hint="reorder now" />
        <StatCard label="Expiring Soon" value={o?.expiring.length ?? 0} icon={CalendarClock} loading={overview.isLoading} hint="within 30 days" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="low">Low stock {o && o.low.length + o.out.length > 0 && <Badge tone="warning">{o.low.length + o.out.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="expiring">Expiring</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-5 xl:grid-cols-5">
            <ChartCard
              title="Stock flow"
              description="Units in vs out · last 14 days"
              loading={overview.isLoading}
              className="xl:col-span-3"
              height={280}
              actions={<ChartLegend items={[{ label: 'Inward', color: c.primary }, { label: 'Outward', color: c.secondary, dashed: true }]} />}
            >
              {o && <AreaTrendChart data={o.flow} xKey="label" height={280} format="number" series={[{ key: 'inward', label: 'Inward' }, { key: 'outward', label: 'Outward' }]} />}
            </ChartCard>
            <ChartCard title="Value by category" description="At purchase price" loading={overview.isLoading} className="xl:col-span-2" height={280}>
              {o && <BarsChart data={o.byCategory.slice(0, 7)} xKey="category" layout="vertical" height={280} series={[{ key: 'value', label: 'Stock value' }]} />}
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="stock">
          <DataTable
            data={o?.items}
            isLoading={overview.isLoading}
            columns={stockColumns}
            getRowId={(p) => p.id}
            searchText={(p) => `${p.name} ${p.sku}`}
            searchPlaceholder="Search stock"
            filters={[{ id: 'wh', label: 'Warehouses', options: (warehouses.data ?? []).map((w) => ({ value: w.name, label: w.name })), predicate: (p, v) => p.warehouse === v }]}
            rowActions={[{ label: 'Adjust stock', icon: SlidersHorizontal, onSelect: (p) => setAdjusting({ productId: p.id }) }]}
            empty={<EmptyState icon={Boxes} title="No stock yet." description="Add products or record a purchase to build inventory." />}
          />
        </TabsContent>

        <TabsContent value="movements">
          <DataTable
            data={movements.data}
            isLoading={movements.isLoading}
            getRowId={(m) => m.id}
            searchText={(m) => `${m.product} ${m.sku} ${m.reference} ${m.vendor ?? ''}`}
            searchPlaceholder="Search movements"
            filters={[{ id: 'type', label: 'Types', options: (Object.keys(MOVE_META) as StockMovement['type'][]).map((t) => ({ value: t, label: MOVE_META[t].label })), predicate: (m, v) => m.type === v }]}
            columns={[
              {
                id: 'type',
                header: 'Type',
                hideable: false,
                cell: (m) => {
                  const meta = MOVE_META[m.type];
                  return (
                    <span className="flex items-center gap-2.5">
                      <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', meta.tone)}><meta.icon className="h-4 w-4" /></span>
                      <span className="font-medium">{meta.label}</span>
                    </span>
                  );
                },
              },
              { id: 'product', header: 'Product', cell: (m) => <div><p>{m.product}</p><p className="text-2xs text-subtle">{m.sku}</p></div> },
              { id: 'qty', header: 'Quantity', align: 'right', cell: (m) => <span className={cn('font-semibold', m.type === 'in' || m.qty > 0 && m.type === 'adjustment' ? 'text-success' : m.type === 'out' || m.qty < 0 ? 'text-danger' : '')}>{m.type === 'in' ? '+' : m.type === 'out' ? '−' : m.qty > 0 ? '+' : ''}{Math.abs(m.qty)}</span> },
              { id: 'ref', header: 'Reference', cell: (m) => <span className="text-muted-foreground">{m.reference}</span> },
              { id: 'vendor', header: 'Vendor', sortValue: (m) => m.vendor ?? '', cell: (m) => (m.vendor ? <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-subtle" />{m.vendor}</span> : <span className="text-subtle">—</span>) },
              { id: 'wh', header: 'Warehouse', cell: (m) => m.warehouse },
              { id: 'date', header: 'Date', sortValue: (m) => m.date, cell: (m) => <span className="text-muted-foreground">{formatDateTime(m.date)}</span> },
              { id: 'by', header: 'By', defaultHidden: true, cell: (m) => m.by },
            ]}
            empty={<EmptyState icon={ArrowLeftRight} title="No stock movements." description="Sales, purchases and adjustments will be logged here." />}
          />
        </TabsContent>

        <TabsContent value="low">
          <DataTable
            data={o ? [...o.out, ...o.low] : undefined}
            isLoading={overview.isLoading}
            columns={stockColumns}
            getRowId={(p) => p.id}
            rowActions={[{ label: 'Adjust stock', icon: SlidersHorizontal, onSelect: (p) => setAdjusting({ productId: p.id }) }]}
            empty={<EmptyState icon={PackageMinus} title="Stock levels look healthy" description="No products are below their minimum stock level." />}
          />
        </TabsContent>

        <TabsContent value="expiring">
          <DataTable
            data={o?.expiring}
            isLoading={overview.isLoading}
            getRowId={(p) => p.id}
            columns={[
              { id: 'name', header: 'Product', cell: (p) => <span className="font-medium">{p.name}</span> },
              { id: 'stock', header: 'Stock', align: 'right', cell: (p) => p.stock },
              { id: 'expiry', header: 'Expiry date', sortValue: (p) => p.expiryDate ?? '', cell: (p) => formatDate(p.expiryDate!) },
              {
                id: 'days',
                header: 'Expires in',
                sortValue: (p) => differenceInCalendarDays(parseISO(p.expiryDate!), new Date()),
                cell: (p) => {
                  const d = differenceInCalendarDays(parseISO(p.expiryDate!), new Date());
                  return <StatusBadge status={d < 0 ? 'expired' : 'expiring'} tone={d <= 7 ? 'danger' : 'warning'} className="normal-case" />;
                },
              },
              { id: 'left', header: 'Days left', align: 'right', cell: (p) => `${differenceInCalendarDays(parseISO(p.expiryDate!), new Date())} days` },
              { id: 'value', header: 'Value at risk', align: 'right', cell: (p) => formatINR(p.stock * p.purchasePrice) },
            ]}
            empty={<EmptyState icon={CalendarClock} title="Nothing expiring soon" description="No products expire in the next 30 days." />}
          />
        </TabsContent>

        <TabsContent value="warehouses">
          <div className="grid gap-4 md:grid-cols-3">
            {warehouses.isLoading
              ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)
              : warehouses.data?.map((w) => (
                  <Card key={w.id} className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary"><Warehouse className="h-5 w-5" /></span>
                    </div>
                    <p className="mt-4 font-semibold">{w.name}</p>
                    <p className="text-xs text-muted-foreground">Stock location</p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                      <div><p className="text-2xs uppercase tracking-wider text-subtle">Units in stock</p><p className="tabular font-semibold">{formatNumber(w.items)}</p></div>
                      <div><p className="text-2xs uppercase tracking-wider text-subtle">Value</p><p className="tabular font-semibold">{formatINR(w.value)}</p></div>
                    </div>
                  </Card>
                ))}
          </div>
        </TabsContent>

        <TabsContent value="vendors">
          <VendorsTab />
        </TabsContent>
      </Tabs>

      {o && <AdjustModal open={!!adjusting} onOpenChange={(v) => !v && setAdjusting(null)} products={o.items} defaultProductId={adjusting?.productId} defaultDirection={adjusting?.direction ?? 'add'} />}
    </>
  );
}
