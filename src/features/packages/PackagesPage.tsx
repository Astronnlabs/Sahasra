import { useQuery } from '@tanstack/react-query';
import { Gift, Minus, Package as PackageIcon, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { industryConfig } from '@/app/config/industry';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { qk, useAppMutation, useProducts } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { catalogServicesService, packagesService } from '@/services';
import type { Package, PackageItem } from '@/types';

interface Part extends PackageItem {
  /** Current single price (for the "bought separately" value). */
  unitPrice: number;
}

function useCatalog() {
  const { data: products } = useProducts();
  const { data: services } = useQuery({ queryKey: qk.services, queryFn: catalogServicesService.list });
  return useMemo(
    () => [
      ...(products ?? []).filter((p) => p.status === 'active').map((p) => ({ kind: 'product' as const, refId: p.id, name: p.name, price: p.sellingPrice, hint: p.category })),
      ...(services ?? []).filter((s) => s.status === 'active').map((s) => ({ kind: 'service' as const, refId: s.id, name: s.name, price: s.price, hint: s.category })),
    ],
    [products, services],
  );
}

function PackageDrawer({ open, onOpenChange, pkg }: { open: boolean; onOpenChange: (o: boolean) => void; pkg: Package | null }) {
  const { businessType } = useWorkspace();
  const cfg = industryConfig(businessType);
  const catalog = useCatalog();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [validity, setValidity] = useState('');
  const [active, setActive] = useState(true);
  const [parts, setParts] = useState<Part[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(pkg?.name ?? '');
    setCategory(pkg?.category ?? cfg.packages.title);
    setDescription(pkg?.description ?? '');
    setPrice(pkg ? String(pkg.price) : '');
    setValidity(pkg?.validityDays ? String(pkg.validityDays) : '');
    setActive(pkg ? pkg.status === 'active' : true);
    setParts((pkg?.items ?? []).map((i) => ({ ...i, unitPrice: catalog.find((c) => c.refId === i.refId)?.price ?? 0 })));
    setQ('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg]);

  const matches = q.trim() ? catalog.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()) && !parts.some((p) => p.refId === c.refId)).slice(0, 8) : [];
  const worth = parts.reduce((s, p) => s + p.unitPrice * p.qty, 0);
  const priceNum = Number(price) || 0;
  const saving = worth - priceNum;

  const save = useAppMutation(
    () => {
      if (sanitizeText(name, 80).length < 2) throw new Error('Enter a name.');
      if (!parts.length) throw new Error('Add at least one item.');
      if (!(priceNum > 0)) throw new Error('Enter the package price.');
      const data = {
        name: sanitizeText(name, 80),
        category: sanitizeText(category, 60) || cfg.packages.title,
        description: sanitizeText(description, 300),
        price: priceNum,
        items: parts.map((p) => ({ kind: p.kind, refId: p.refId, qty: p.qty })),
        validityDays: validity ? Number(validity) : null,
        status: active ? ('active' as const) : ('inactive' as const),
      };
      return pkg ? packagesService.update(pkg.id, data) : packagesService.create(data);
    },
    { invalidate: [qk.packages], success: (p) => `${p.name} saved`, onSuccess: () => onOpenChange(false) },
  );

  const singular = cfg.packages.singular.toLowerCase();
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={pkg ? `Edit ${singular}` : `New ${singular}`}
      description={cfg.packages.description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>Save</Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormField label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={cfg.packages.namePlaceholder} autoFocus />
        </FormField>

        <section>
          <p className="mb-2 text-xs font-medium">What's included</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${cfg.goods.title.toLowerCase()} or ${cfg.services.title.toLowerCase()} to add`} className="pl-9" />
            {matches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-pop">
                {matches.map((m) => (
                  <li key={m.refId}>
                    <button
                      type="button"
                      onClick={() => {
                        setParts((list) => [...list, { kind: m.kind, refId: m.refId, name: m.name, qty: 1, unitPrice: m.price }]);
                        setQ('');
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface"
                    >
                      {m.kind === 'service' ? <Sparkles className="h-4 w-4 text-primary" /> : <PackageIcon className="h-4 w-4 text-primary" />}
                      <span className="min-w-0 flex-1 truncate">{m.name} <span className="text-2xs text-subtle">· {m.hint}</span></span>
                      <span className="tabular text-muted-foreground">{formatINR(m.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {catalog.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Add {cfg.goods.title.toLowerCase()} or {cfg.services.title.toLowerCase()} first, then bundle them here.</p>}
          <ul className="mt-3 space-y-2">
            {parts.map((p, i) => (
              <li key={p.refId} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                {p.kind === 'service' ? <Sparkles className="h-4 w-4 shrink-0 text-primary" /> : <PackageIcon className="h-4 w-4 shrink-0 text-primary" />}
                <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
                <span className="flex items-center rounded-lg border border-border">
                  <button type="button" className="p-1.5 text-subtle hover:text-foreground" onClick={() => setParts((l) => l.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} aria-label="Less"><Minus className="h-3.5 w-3.5" /></button>
                  <span className="tabular w-7 text-center text-[13px]">{p.qty}</span>
                  <button type="button" className="p-1.5 text-subtle hover:text-foreground" onClick={() => setParts((l) => l.map((x, j) => (j === i ? { ...x, qty: Math.min(999, x.qty + 1) } : x)))} aria-label="More"><Plus className="h-3.5 w-3.5" /></button>
                </span>
                <span className="tabular w-20 text-right text-xs text-muted-foreground">{formatINR(p.unitPrice * p.qty)}</span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setParts((l) => l.filter((_, j) => j !== i))} aria-label={`Remove ${p.name}`}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Package price (₹, before GST)" required hint={worth > 0 ? `Bought separately: ${formatINR(worth)}` : undefined}>
            <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
          </FormField>
          <FormField label="Category">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </FormField>
        </div>
        {worth > 0 && priceNum > 0 && (
          <p className={cn('rounded-xl px-4 py-2.5 text-[13px]', saving >= 0 ? 'bg-success-soft text-success' : 'bg-warning-soft')}>
            {saving > 0 ? `Customer saves ${formatINR(saving)} (${((saving / worth) * 100).toFixed(0)}%).` : saving === 0 ? 'Same as buying separately.' : `This costs ${formatINR(-saving)} more than buying separately.`}
          </p>
        )}
        <FormField label="Description" hint="Shown to staff in POS.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </FormField>
        <FormField label="Valid for (days)" hint="Optional — for packages used over several visits." className="sm:max-w-xs">
          <Input value={validity} onChange={(e) => setValidity(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="No limit" />
        </FormField>
        <label className="flex items-center justify-between rounded-xl border border-border p-3.5">
          <span>
            <span className="block text-[13px] font-medium">Available</span>
            <span className="block text-xs text-muted-foreground">Unavailable packages are hidden from POS.</span>
          </span>
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
        <p className="text-xs text-muted-foreground">When billed, the bill shows the package, and each item inside still updates stock, reports and GST at its own rate.</p>
      </div>
    </Drawer>
  );
}

export function PackagesPage() {
  const { businessType } = useWorkspace();
  const cfg = industryConfig(businessType).packages;
  const catalog = useCatalog();
  const { data, isLoading } = useQuery({ queryKey: qk.packages, queryFn: packagesService.list });
  const [editing, setEditing] = useState<Package | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Package | null>(null);
  const remove = useAppMutation((id: string) => packagesService.remove(id), { invalidate: [qk.packages], success: 'Deleted', onSuccess: () => setDeleting(null) });
  const worth = (p: Package) => p.items.reduce((s, i) => s + (catalog.find((c) => c.refId === i.refId)?.price ?? 0) * i.qty, 0);

  const columns: Column<Package>[] = [
    {
      id: 'name',
      header: cfg.singular,
      hideable: false,
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary"><Gift className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="font-medium">{p.name}</p>
            <p className="max-w-[360px] truncate text-2xs text-subtle">{p.items.map((i) => (i.qty > 1 ? `${i.name} × ${i.qty}` : i.name)).join(' + ')}</p>
          </div>
        </div>
      ),
    },
    { id: 'category', header: 'Category', cell: (p) => p.category },
    { id: 'worth', header: 'Separately', align: 'right', cell: (p) => <span className="text-muted-foreground line-through">{formatINR(worth(p))}</span> },
    { id: 'price', header: 'Package price', align: 'right', sortValue: (p) => p.price, cell: (p) => <span className="font-semibold">{formatINR(p.price)}</span> },
    { id: 'validity', header: 'Validity', cell: (p) => (p.validityDays ? `${p.validityDays} days` : '—') },
    { id: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
  ];

  const add = () => {
    setEditing(null);
    setOpen(true);
  };

  return (
    <>
      <PageHeader title={cfg.title} description={cfg.description} actions={<Button onClick={add}><Plus /> New {cfg.singular}</Button>} />
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(p) => p.id}
        searchText={(p) => `${p.name} ${p.category} ${p.items.map((i) => i.name).join(' ')}`}
        searchPlaceholder={`Search ${cfg.title.toLowerCase()}`}
        onRowClick={(p) => { setEditing(p); setOpen(true); }}
        rowActions={[
          { label: 'Edit', icon: Pencil, onSelect: (p) => { setEditing(p); setOpen(true); } },
          { label: 'Delete', icon: Trash2, destructive: true, onSelect: setDeleting },
        ]}
        empty={<EmptyState icon={Gift} title={`No ${cfg.title.toLowerCase()} yet.`} description={cfg.emptyText} actionLabel={`New ${cfg.singular}`} onAction={add} />}
      />
      <PackageDrawer open={open} onOpenChange={setOpen} pkg={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Past invoices keep it. It will no longer be available for new bills."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
