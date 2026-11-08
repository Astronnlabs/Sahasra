import { useQuery } from '@tanstack/react-query';
import { Archive, Boxes, Copy, Download, Eye, FlaskConical, IndianRupee, Package, PackageCheck, PackageX, Pencil, Plus, Scale, ShoppingBag, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DetailList, MiniStat } from '@/components/common/DetailList';
import { Barcode } from '@/components/common/Codes';
import { StatCard } from '@/components/common/StatCard';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { qk, useAppMutation, useProducts } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import { cn, downloadTextFile, toCsv } from '@/lib/utils';
import { catalogServicesService, productsService } from '@/services';
import type { Product } from '@/types';
import { industryConfig } from '@/app/config/industry';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { attributeText } from './AttributeFields';
import { ProductFormDrawer } from './ProductFormDrawer';
import { InHouseStockModal } from './InHouseStockModal';
import { ProductThumb } from './ProductImagePicker';

export function stockStatus(p: Product) {
  if (p.status === 'archived') return 'archived';
  if (p.soldOut) return 'Out of stock';
  // Made-to-order items (dishes) are always available.
  if (p.isSelfProduct) return 'Available';
  if (p.stock <= 0) return 'Out of stock';
  if (p.stock <= p.minStock) return 'Low stock';
  return 'In stock';
}

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const { data: all, isLoading } = useProducts();
  const { businessType } = useWorkspace();
  const cfg = industryConfig(businessType).goods;
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [viewing, setViewing] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [counting, setCounting] = useState<Product | null>(null);

  // Salons: products they sell vs products used inside the salon.
  const inHouseTab = !!cfg.features.inHouse && params.get('tab') === 'in-house';
  const setTab = (t: 'retail' | 'in-house') => {
    if (t === 'in-house') params.set('tab', 'in-house');
    else params.delete('tab');
    setParams(params, { replace: true });
    setStockFilter('');
  };
  // Tapping "Low stock" / "Out of stock" lists just those items.
  const [stockFilter, setStockFilter] = useState<'' | 'Low stock' | 'Out of stock'>('');
  const toggleStock = (f: 'Low stock' | 'Out of stock') => setStockFilter((cur) => (cur === f ? '' : f));
  /** Low / out counts for one kind (for sale or in-house), as the table's Status column shows them. */
  const stockCounts = (inHouse: boolean) => {
    const list = (all ?? []).filter((p) => p.status !== 'archived' && !!p.inHouse === inHouse);
    return { low: list.filter((p) => stockStatus(p) === 'Low stock').length, out: list.filter((p) => stockStatus(p) === 'Out of stock').length };
  };
  const data = useMemo(() => all?.filter((p) => !!p.inHouse === inHouseTab), [all, inHouseTab]);
  const services = useQuery({ queryKey: qk.services, queryFn: catalogServicesService.list, enabled: !!cfg.features.inHouse });
  const usedBy = (p: Product) => (services.data ?? []).filter((s) => s.consumables?.some((c) => c.productId === p.id));

  const categories = useMemo(() => Array.from(new Set((data ?? []).map((p) => p.category))).sort(), [data]);
  const stats = useMemo(() => {
    const list = (data ?? []).filter((p) => p.status !== 'archived');
    const stocked = list.filter((p) => !p.isSelfProduct);
    return {
      total: list.length,
      value: stocked.reduce((s, p) => s + Math.max(0, p.stock) * p.purchasePrice, 0),
      low: list.filter((p) => stockStatus(p) === 'Low stock').length,
      out: list.filter((p) => stockStatus(p) === 'Out of stock').length,
    };
  }, [data]);

  const duplicate = useAppMutation((id: string) => productsService.duplicate(id), { invalidate: [qk.products], success: (p) => `Created “${p.name}” as a draft` });
  const archive = useAppMutation((id: string) => productsService.archive(id), {
    invalidate: [qk.products],
    success: (p) => `${p.name} archived`,
    onSuccess: () => setArchiving(null),
  });

  const soldOut = useAppMutation(({ id, value }: { id: string; value: boolean }) => productsService.setSoldOut(id, value), {
    invalidate: [qk.products, ['restaurant']],
    success: (p) => (p.soldOut ? `${p.name} marked out of stock` : `${p.name} is available again`),
    onSuccess: (p) => setViewing((v) => (v?.id === p.id ? p : v)),
  });

  const del = useDeleteAction<Product>({
    page: 'products',
    name: (p) => p.name,
    remove: (p) => productsService.remove(p.id),
    invalidate: [qk.products, qk.inventory, qk.packages, ['restaurant']],
    description: () => 'Past bills and purchases keep its name. To only hide it from billing, archive it instead.',
    onDeleted: () => setViewing(null),
  });

  const openForm = (p: Product | null) => {
    setEditing(p);
    setFormOpen(true);
  };

  const closeForm = (open: boolean) => {
    setFormOpen(open);
    if (!open && params.get('new')) {
      params.delete('new');
      setParams(params, { replace: true });
    }
  };

  const exportCsv = () => {
    downloadTextFile(
      `sahasra-products-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv((data ?? []).map((p) => ({ Name: p.name, SKU: p.sku, Category: p.category, Stock: p.stock, 'Purchase Price': p.purchasePrice, 'Selling Price': p.sellingPrice, GST: `${p.gstRate}%`, HSN: p.hsn }))),
      'text/csv',
    );
    toast.success('Products exported', { description: `${data?.length ?? 0} rows saved as CSV.` });
  };

  const columns: Column<Product>[] = [
    {
      id: 'product',
      header: 'Product',
      hideable: false,
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <ProductThumb image={p.image} name={p.name.replace(/[^A-Za-z ]/g, '')} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="max-w-[260px] truncate font-medium">{p.name}</p>
            <p className="text-2xs text-subtle">{[p.brand, p.unit].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      ),
    },
    ...cfg.fields.filter((f) => f.column).map<Column<Product>>((f) => ({ id: `attr_${f.key}`, header: f.label, sortValue: (p) => String(p.attributes?.[f.key] ?? ''), cell: (p) => <span className="text-muted-foreground">{attributeText(p.attributes?.[f.key])}</span> })),
    { id: 'sku', header: 'SKU', sortValue: (p) => p.sku, cell: (p) => <span className="font-mono text-xs text-muted-foreground">{p.sku}</span> },
    { id: 'category', header: 'Category', sortValue: (p) => p.category, cell: (p) => p.category },
    {
      id: 'stock',
      header: 'Stock',
      align: 'right',
      sortValue: (p) => p.stock,
      cell: (p) => p.isSelfProduct ? <span className="text-xs text-subtle">Not tracked</span> : (
        <span className={p.stock <= 0 ? 'font-semibold text-danger' : p.stock <= p.minStock ? 'font-semibold text-warning' : ''}>
          {formatNumber(p.stock)} <span className="text-xs font-normal text-subtle">{p.unit}</span>
        </span>
      ),
    },
    { id: 'purchase', header: 'Purchase Price', align: 'right', sortValue: (p) => p.purchasePrice, cell: (p) => formatINR(p.purchasePrice) },
    { id: 'selling', header: 'Selling Price', align: 'right', sortValue: (p) => p.sellingPrice, cell: (p) => <span className="font-semibold">{formatINR(p.sellingPrice)}</span> },
    { id: 'gst', header: 'GST', align: 'right', sortValue: (p) => p.gstRate, cell: (p) => `${p.gstRate}%` },
    { id: 'hsn', header: 'HSN', defaultHidden: true, cell: (p) => p.hsn },
    { id: 'status', header: 'Status', cell: (p) => <StatusBadge status={stockStatus(p)} /> },
    {
      id: 'available',
      header: 'Available',
      align: 'center',
      sortValue: (p) => (p.soldOut ? 0 : 1),
      cell: (p) =>
        p.status === 'archived' ? null : (
          // The row opens the item; the switch only flips availability.
          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
            <Switch
              checked={!p.soldOut}
              disabled={soldOut.isPending && soldOut.variables?.id === p.id}
              onCheckedChange={(on) => soldOut.mutate({ id: p.id, value: !on })}
              aria-label={p.soldOut ? `Mark ${p.name} available` : `Mark ${p.name} out of stock`}
              title={p.soldOut ? 'Out of stock — turn on to sell again' : 'Turn off to mark out of stock'}
            />
          </span>
        ),
    },
  ];

  const inHouseColumns: Column<Product>[] = [
    columns[0],
    { id: 'category', header: 'Category', sortValue: (p) => p.category, cell: (p) => p.category },
    {
      id: 'left',
      header: 'Left',
      align: 'right',
      sortValue: (p) => p.stock,
      cell: (p) => (
        <span className={p.stock <= 0 ? 'font-semibold text-danger' : p.stock <= p.minStock ? 'font-semibold text-warning' : 'font-semibold'}>
          {formatNumber(p.stock)} <span className="text-xs font-normal text-subtle">{p.unit}</span>
        </span>
      ),
    },
    { id: 'min', header: 'Alert at', align: 'right', sortValue: (p) => p.minStock, cell: (p) => <span className="text-muted-foreground">{p.minStock ? `${formatNumber(p.minStock)} ${p.unit}` : '—'}</span> },
    { id: 'cost', header: 'Cost', align: 'right', sortValue: (p) => p.purchasePrice, cell: (p) => (p.purchasePrice ? <span>{formatINR(p.purchasePrice)}<span className="text-xs text-subtle"> /{p.unit}</span></span> : <span className="text-subtle">—</span>) },
    {
      id: 'used',
      header: 'Used in',
      cell: (p) => {
        const list = usedBy(p);
        return list.length ? <span className="line-clamp-1 max-w-[220px] text-muted-foreground" title={list.map((s) => s.name).join(', ')}>{list.map((s) => s.name).join(', ')}</span> : <span className="text-subtle">No service yet</span>;
      },
    },
    { id: 'status', header: 'Status', cell: (p) => <StatusBadge status={stockStatus(p)} /> },
  ];

  return (
    <>
      <PageHeader
        title={inHouseTab ? 'In-house Products' : cfg.title}
        description={inHouseTab ? 'Products your salon uses — shampoo, wax, creams. Services use them up automatically as you bill.' : cfg.description}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!data?.length}>
              <Download /> Export
            </Button>
            <Button onClick={() => openForm(null)}>
              <Plus /> Add {inHouseTab ? 'in-house product' : cfg.singular}
            </Button>
          </>
        }
      />

      {cfg.features.inHouse && (
        <div className="mb-5 inline-flex rounded-xl border border-border bg-card p-1" role="tablist" aria-label="Product type">
          {([['retail', 'For sale', ShoppingBag], ['in-house', 'In-house use', FlaskConical]] as const).map(([t, label, Icon]) => {
            const count = (all ?? []).filter((p) => p.status !== 'archived' && !!p.inHouse === (t === 'in-house')).length;
            const on = (t === 'in-house') === inHouseTab;
            const c = stockCounts(t === 'in-house');
            return (
              <button key={t} type="button" role="tab" aria-selected={on} onClick={() => setTab(t)} className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors', on ? 'bg-primary text-white shadow-primary' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" /> {label}
                <span className={cn('rounded-full px-1.5 text-2xs', on ? 'bg-white/20' : 'bg-surface')}>{count}</span>
                {c.low > 0 && <span className="rounded-full bg-warning px-1.5 text-2xs font-semibold text-white" title={`${c.low} low stock`}>{c.low} low</span>}
                {c.out > 0 && <span className="rounded-full bg-danger px-1.5 text-2xs font-semibold text-white" title={`${c.out} out of stock`}>{c.out} out</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label={inHouseTab ? 'In-house products' : `Active ${cfg.title.toLowerCase()}`} value={formatNumber(stats.total)} icon={Package} loading={isLoading} hint={`${categories.length} categories`} />
        <StatCard label={inHouseTab ? 'Value in hand' : 'Inventory value'} value={formatINR(stats.value)} icon={IndianRupee} loading={isLoading} hint="at purchase price" />
        <StatCard
          label={inHouseTab ? 'Running low' : 'Low stock'}
          value={stats.low}
          icon={TriangleAlert}
          loading={isLoading}
          tone={stats.low ? 'warning' : undefined}
          hint={stockFilter === 'Low stock' ? 'Showing these · tap to clear' : stats.low ? 'at or below minimum · tap to see' : 'at or below minimum'}
          onClick={stats.low || stockFilter === 'Low stock' ? () => toggleStock('Low stock') : undefined}
          active={stockFilter === 'Low stock'}
        />
        <StatCard
          label={inHouseTab ? 'Finished' : 'Out of stock'}
          value={stats.out}
          icon={PackageX}
          loading={isLoading}
          tone={stats.out ? 'danger' : undefined}
          hint={stockFilter === 'Out of stock' ? 'Showing these · tap to clear' : stats.out ? 'need reorder · tap to see' : 'need reorder'}
          onClick={stats.out || stockFilter === 'Out of stock' ? () => toggleStock('Out of stock') : undefined}
          active={stockFilter === 'Out of stock'}
        />
      </div>

      <DataTable
        key={inHouseTab ? 'in-house' : 'retail'}
        data={data}
        isLoading={isLoading}
        columns={inHouseTab ? inHouseColumns : columns}
        getRowId={(p) => p.id}
        searchText={(p) => `${p.name} ${p.sku} ${p.barcode} ${p.brand}`}
        searchPlaceholder="Search name, SKU or barcode"
        initialSearch={params.get('q') ?? ''}
        initialFilters={{ status: stockFilter || '__all' }}
        onRowClick={setViewing}
        filters={[
          { id: 'category', label: 'Categories', options: categories.map((c) => ({ value: c, label: c })), predicate: (p, v) => p.category === v },
          {
            id: 'status',
            label: 'Statuses',
            options: ['In stock', 'Low stock', 'Out of stock', 'Available', 'archived'].map((s) => ({ value: s, label: s === 'archived' ? 'Archived' : s })),
            predicate: (p, v) => stockStatus(p) === v,
          },
        ]}
        rowActions={[
          { label: 'View', icon: Eye, onSelect: setViewing },
          { label: 'Update stock', icon: Scale, onSelect: setCounting, hidden: (p) => !p.inHouse },
          { label: 'Edit', icon: Pencil, onSelect: (p) => openForm(p) },
          { label: 'Mark out of stock', icon: PackageX, onSelect: (p) => soldOut.mutate({ id: p.id, value: true }), hidden: (p) => !!p.inHouse || p.soldOut || p.status === 'archived' },
          { label: 'Mark available', icon: PackageCheck, onSelect: (p) => soldOut.mutate({ id: p.id, value: false }), hidden: (p) => !!p.inHouse || !p.soldOut },
          { label: 'Duplicate', icon: Copy, onSelect: (p) => duplicate.mutate(p.id) },
          { label: 'Archive', icon: Archive, onSelect: setArchiving, hidden: (p) => p.status === 'archived' },
          del.action,
        ]}
        empty={
          inHouseTab ? (
            <EmptyState icon={FlaskConical} title="No in-house products yet." description="Add what your salon uses — shampoo, wax, facial cream — then set how much each service uses." actionLabel="Add in-house product" onAction={() => openForm(null)} />
          ) : (
            <EmptyState icon={Boxes} title={`No ${cfg.title.toLowerCase()} yet.`} description={cfg.emptyText} actionLabel={`Add ${cfg.singular}`} onAction={() => openForm(null)} />
          )
        }
      />

      <ProductFormDrawer open={formOpen} onOpenChange={closeForm} product={editing} categories={categories} inHouse={inHouseTab} />
      <InHouseStockModal product={counting} onClose={() => setCounting(null)} />

      <Drawer
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.name ?? ''}
        description={viewing ? `${viewing.sku} · ${viewing.category}` : undefined}
        footer={
          viewing && (
            <>
              {del.can(viewing) && (
                <Button variant="ghost" size="icon-sm" className="mr-auto text-danger hover:bg-danger-soft hover:text-danger" onClick={() => del.ask(viewing)} aria-label={`Delete ${viewing.name}`} title="Delete">
                  <Trash2 />
                </Button>
              )}
              {viewing.inHouse ? (
                <Button variant="secondary" size="sm" onClick={() => { setCounting(viewing); setViewing(null); }}><Scale /> Update stock</Button>
              ) : (
                <Button variant="secondary" size="sm" loading={soldOut.isPending} onClick={() => soldOut.mutate({ id: viewing.id, value: !viewing.soldOut })}>
                  {viewing.soldOut ? <><PackageCheck /> Available</> : <><PackageX /> Out of stock</>}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => duplicate.mutate(viewing.id)}><Copy /> Duplicate</Button>
              <Button size="sm" onClick={() => { const p = viewing; setViewing(null); openForm(p); }}><Pencil /> Edit</Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-6">
            {viewing.image && <img src={viewing.image} alt="" className="mx-auto h-40 w-40 rounded-2xl object-cover" />}
            <div className="flex items-center justify-between">
              <StatusBadge status={stockStatus(viewing)} />
              {viewing.barcode && <Barcode value={viewing.barcode} />}
            </div>
            {viewing.inHouse ? (
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Left" value={`${formatNumber(viewing.stock)} ${viewing.unit}`} tone={viewing.stock <= viewing.minStock ? 'danger' : 'primary'} />
                <MiniStat label="Cost" value={`${formatINR(viewing.purchasePrice)}/${viewing.unit}`} />
                <MiniStat label="Used in" value={`${usedBy(viewing).length} services`} />
              </div>
            ) : (
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Selling" value={formatINR(viewing.sellingPrice)} tone="primary" />
              <MiniStat label="Margin" value={`${(((viewing.sellingPrice - viewing.purchasePrice) / viewing.sellingPrice) * 100).toFixed(1)}%`} tone="success" />
              <MiniStat label="In stock" value={viewing.isSelfProduct ? 'Not tracked' : formatNumber(viewing.stock)} tone={!viewing.isSelfProduct && viewing.stock <= viewing.minStock ? 'danger' : undefined} />
            </div>
            )}
            {viewing.inHouse && usedBy(viewing).length > 0 && (
              <div className="rounded-xl border border-border p-3">
                <p className="mb-1.5 text-xs font-medium">Used per service</p>
                <ul className="space-y-1 text-[13px]">
                  {usedBy(viewing).map((s) => <li key={s.id} className="flex justify-between"><span>{s.name}</span><span className="text-muted-foreground">{formatNumber(s.consumables!.find((c) => c.productId === viewing.id)!.qty)} {viewing.unit}</span></li>)}
                </ul>
              </div>
            )}
            <DetailList
              items={[
                ['Brand', viewing.brand],
                ['Unit', viewing.unit],
                ['Purchase price', formatINR(viewing.purchasePrice)],
                ['MRP', formatINR(viewing.mrp)],
                ['GST rate', `${viewing.gstRate}%`],
                ['HSN code', viewing.hsn],
                ['Minimum stock', formatNumber(viewing.minStock)],
                ['Warehouse', viewing.warehouse],
                ['Supplier', viewing.supplier || '—'],
                ['Expiry', viewing.expiryDate ? formatDate(viewing.expiryDate) : 'Not applicable'],
                ...(viewing.tradePrice > 0 ? [['Trade price', formatINR(viewing.tradePrice)] as [string, string]] : []),
                ...cfg.fields.filter((f) => viewing.attributes?.[f.key] != null).map((f) => [f.label, attributeText(viewing.attributes[f.key])] as [string, string]),
                ...(viewing.options.length ? [[cfg.features.options?.label ?? 'Sell as', viewing.options.map((o) => `${o.name} ${formatINR(o.price)}`).join(' · ')] as [string, string]] : []),
                ...(viewing.addons.length ? [['Add-ons', viewing.addons.map((a) => `${a.name} +${formatINR(a.price)}`).join(' · ')] as [string, string]] : []),
              ]}
            />
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archive ${archiving?.name}?`}
        description="Archived products are hidden from POS and stock alerts. You can restore them later from the Archived filter."
        confirmLabel="Archive product"
        destructive
        loading={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving.id)}
      />
      {del.dialog}
    </>
  );
}
