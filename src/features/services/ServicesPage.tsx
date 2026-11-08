import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Clock, Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { industryConfig, PRICE_UNIT_LABEL } from '@/app/config/industry';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { libraryFor } from '@/app/config/pictureLibraries';
import { AttributeFields, attributeText, type Attributes } from '@/features/products/AttributeFields';
import { ProductImagePicker, ProductThumb } from '@/features/products/ProductImagePicker';
import { qk, useAppMutation, useEmployees, useProducts } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { catalogServicesService } from '@/services';
import type { ServiceItem } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  category: z.string().trim().min(2, 'Category is required'),
  price: z.coerce.number().positive('Enter a price'),
  priceUnit: z.string(),
  durationMins: z.coerce.number().int('Whole minutes only').min(0).max(1440),
  gstRate: z.coerce.number(),
  sac: z.string().trim().regex(/^(\d{4,6})?$/, 'SAC should be 4–6 digits'),
  commissionPct: z.coerce.number().min(0).max(100, 'Max 100%'),
  active: z.boolean(),
});
type Values = z.infer<typeof schema>;

function ServiceDrawer({ open, onOpenChange, service, categories }: { open: boolean; onOpenChange: (o: boolean) => void; service: ServiceItem | null; categories: string[] }) {
  const { businessType } = useWorkspace();
  const cfg = industryConfig(businessType).services;
  const { data: employees } = useEmployees();
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = form;
  const [staff, setStaff] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<Attributes>({});
  const [image, setImage] = useState('');
  const [consumables, setConsumables] = useState<{ productId: string; qty: number }[]>([]);
  const { data: products } = useProducts();
  const inHouseProducts = (products ?? []).filter((p) => p.inHouse && p.status !== 'archived');

  useEffect(() => {
    if (!open) return;
    reset({
      name: service?.name ?? '',
      category: service?.category ?? '',
      price: service?.price ?? (undefined as unknown as number),
      priceUnit: service?.priceUnit ?? cfg.priceUnits[0].value,
      durationMins: service?.durationMins ?? (cfg.showDuration ? 30 : 0),
      gstRate: service?.gstRate ?? cfg.defaultGst,
      sac: service?.sac ?? cfg.defaultSac,
      commissionPct: service?.commissionPct ?? 0,
      active: service ? service.status === 'active' : true,
    });
    setStaff(service?.staff ?? []);
    setAttributes(service?.attributes ?? {});
    setImage(service?.image ?? '');
    setConsumables(service?.consumables ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service, reset]);

  const save = useAppMutation(
    ({ active, ...v }: Values) => {
      const data = {
        ...v,
        name: sanitizeText(v.name, 80),
        category: sanitizeText(v.category, 60),
        gstRate: Number(v.gstRate),
        durationMins: cfg.showDuration ? v.durationMins : 0,
        commissionPct: cfg.showCommission ? v.commissionPct : 0,
        staff: cfg.showStaff ? staff : [],
        attributes,
        image,
        consumables: cfg.staffOnBill ? consumables.filter((c) => c.productId) : [],
        status: active ? ('active' as const) : ('inactive' as const),
      };
      if (data.consumables.some((c) => !(c.qty > 0))) throw new Error('Enter how much of each product the service uses.');
      return service ? catalogServicesService.update(service.id, data) : catalogServicesService.create(data);
    },
    { invalidate: [qk.services], success: (s) => `${s.name} saved`, onSuccess: () => onOpenChange(false) },
  );

  // Staff come only from your Employees list.
  const activeStaff = (employees ?? []).filter((e) => e.status !== 'inactive').map((e) => e.name);
  const staffOptions = Array.from(new Set([...activeStaff, ...staff]));
  const units = cfg.priceUnits.some((u) => u.value === watch('priceUnit')) ? cfg.priceUnits : [...cfg.priceUnits, { value: watch('priceUnit'), label: PRICE_UNIT_LABEL[watch('priceUnit')] ?? watch('priceUnit') }];
  const singular = cfg.singular.toLowerCase();

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={service ? `Edit ${singular}` : `Add ${singular}`}
      description={cfg.description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>Save</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Name" error={errors.name?.message} required>
          <Input {...register('name')} placeholder={cfg.namePlaceholder} autoFocus />
        </FormField>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Picture <span className="font-normal text-subtle">(optional)</span></p>
          <ProductImagePicker value={image} onChange={setImage} name={watch('name') ?? ''} library={libraryFor(businessType)} hint="Shown on POS and the services list." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Category" error={errors.category?.message} required>
            <Input {...register('category')} list="service-categories" placeholder={cfg.categoryPlaceholder} />
          </FormField>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <FormField label="Price (₹)" error={errors.price?.message} required>
              <Input {...register('price')} inputMode="decimal" />
            </FormField>
            <FormField label="Charged">
              <NativeSelect {...register('priceUnit')} className="w-32">{units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</NativeSelect>
            </FormField>
          </div>
          {cfg.showDuration && (
            <FormField label="Duration (minutes)" error={errors.durationMins?.message}>
              <Input {...register('durationMins')} inputMode="numeric" />
            </FormField>
          )}
          <FormField label="GST rate">
            <NativeSelect {...register('gstRate')}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</NativeSelect>
          </FormField>
          <FormField label="SAC code" error={errors.sac?.message}>
            <Input {...register('sac')} inputMode="numeric" placeholder="Optional" />
          </FormField>
          {cfg.showCommission && (
            <FormField label="Staff commission (%)" error={errors.commissionPct?.message}>
              <Input {...register('commissionPct')} inputMode="decimal" />
            </FormField>
          )}
        </div>
        <datalist id="service-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        {cfg.fields.length > 0 && <AttributeFields fields={cfg.fields} value={attributes} onChange={setAttributes} />}
        {cfg.staffOnBill && (
          <fieldset className="rounded-xl border border-border p-3.5">
            <legend className="px-1 text-xs font-medium">Products used each time <span className="font-normal text-subtle">(optional)</span></legend>
            <p className="mb-2.5 text-xs text-muted-foreground">Billing this service takes these amounts out of your in-house stock automatically.</p>
            {inHouseProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No in-house products yet. <Link to="/products?tab=in-house" className="font-medium text-primary hover:underline">Add in-house products</Link> like shampoo or wax first.
              </p>
            ) : (
              <div className="space-y-2">
                {consumables.map((c, i) => {
                  const p = inHouseProducts.find((x) => x.id === c.productId);
                  const set = (patch: Partial<typeof c>) => setConsumables(consumables.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <NativeSelect value={c.productId} onChange={(e) => set({ productId: e.target.value })} className="flex-1" aria-label="Product used">
                        <option value="">Choose product</option>
                        {inHouseProducts.filter((x) => x.id === c.productId || !consumables.some((y) => y.productId === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </NativeSelect>
                      <div className="flex w-36 items-center rounded-lg border border-border bg-card focus-within:border-primary/50">
                        <input value={c.qty || ''} onChange={(e) => set({ qty: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} inputMode="decimal" placeholder="Amount" aria-label="Amount used" className="h-9 w-full min-w-0 bg-transparent px-2.5 text-[13px] outline-none" />
                        <span className="pr-2.5 text-xs text-subtle">{p?.unit ?? ''}</span>
                      </div>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setConsumables(consumables.filter((_, j) => j !== i))} aria-label="Remove product"><Trash2 /></Button>
                    </div>
                  );
                })}
                {consumables.length < inHouseProducts.length && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setConsumables([...consumables, { productId: '', qty: 0 }])}><Plus /> Add product used</Button>
                )}
              </div>
            )}
          </fieldset>
        )}
        {cfg.showStaff && (
          <fieldset>
            <legend className="text-xs font-medium">Staff who do this <span className="font-normal text-subtle">(optional)</span></legend>
            {staffOptions.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No employees yet. <Link to="/employees" className="font-medium text-primary hover:underline">Add employees</Link> to assign them here.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {staffOptions.map((name) => {
                  const on = staff.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setStaff(on ? staff.filter((s) => s !== name) : [...staff, name])}
                      className={on ? 'rounded-full border border-primary bg-primary-light px-3 py-1 text-xs font-medium text-primary' : 'rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/40'}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        )}
        <label className="flex items-center justify-between rounded-xl border border-border p-3.5">
          <span>
            <span className="block text-[13px] font-medium">Available</span>
            <span className="block text-xs text-muted-foreground">Unavailable items are hidden from POS.</span>
          </span>
          <Switch checked={watch('active')} onCheckedChange={(c) => setValue('active', c)} />
        </label>
      </form>
    </Drawer>
  );
}

export function ServicesPage() {
  const { businessType } = useWorkspace();
  const cfg = industryConfig(businessType).services;
  const { data, isLoading } = useQuery({ queryKey: qk.services, queryFn: catalogServicesService.list });
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<ServiceItem | null>(null);
  const categories = useMemo(() => Array.from(new Set((data ?? []).map((s) => s.category))), [data]);
  const remove = useAppMutation((id: string) => catalogServicesService.remove(id), { invalidate: [qk.services], success: 'Deleted', onSuccess: () => setDeleting(null) });

  const columns: Column<ServiceItem>[] = [
    {
      id: 'name',
      header: cfg.singular,
      hideable: false,
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="flex items-center gap-3">
          {s.image ? <ProductThumb image={s.image} name={s.name} className="h-9 w-9" /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary"><Sparkles className="h-4 w-4" /></span>}
          <div>
            <p className="font-medium">{s.name}</p>
            <p className="text-2xs text-subtle">{s.sac ? `SAC ${s.sac}` : s.category}</p>
          </div>
        </div>
      ),
    },
    { id: 'category', header: 'Category', sortValue: (s) => s.category, cell: (s) => s.category },
    ...cfg.fields.filter((f) => f.column).map<Column<ServiceItem>>((f) => ({ id: `attr_${f.key}`, header: f.label, cell: (s) => <span className="text-muted-foreground">{attributeText(s.attributes?.[f.key])}</span> })),
    {
      id: 'price',
      header: 'Price',
      align: 'right',
      sortValue: (s) => s.price,
      cell: (s) => (
        <span>
          <span className="font-semibold">{formatINR(s.price)}</span>
          {s.priceUnit !== 'service' && <span className="ml-1 text-xs text-subtle">{PRICE_UNIT_LABEL[s.priceUnit] ?? ''}</span>}
        </span>
      ),
    },
    ...(cfg.showDuration ? [{ id: 'duration', header: 'Duration', sortValue: (s: ServiceItem) => s.durationMins, cell: (s: ServiceItem) => (s.durationMins ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" />{s.durationMins} min</span> : '—') }] : []),
    { id: 'gst', header: 'GST', align: 'right', cell: (s) => `${s.gstRate}%` },
    ...(cfg.showStaff
      ? [{
          id: 'staff',
          header: 'Staff',
          cell: (s: ServiceItem) =>
            s.staff.length ? (
              <div className="flex items-center -space-x-1.5">
                {s.staff.slice(0, 3).map((n) => <Avatar key={n} name={n} size="xs" className="ring-2 ring-card" />)}
                <span className="pl-3 text-xs text-muted-foreground">{s.staff.length === 1 ? s.staff[0] : `${s.staff.length} staff`}</span>
              </div>
            ) : <span className="text-subtle">Any</span>,
        }]
      : []),
    ...(cfg.showCommission ? [{ id: 'commission', header: 'Commission', align: 'right' as const, sortValue: (s: ServiceItem) => s.commissionPct, cell: (s: ServiceItem) => `${s.commissionPct}%` }] : []),
    { id: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
  ];

  const add = () => {
    setEditing(null);
    setOpen(true);
  };

  return (
    <>
      <PageHeader title={cfg.title} description={cfg.description} actions={<Button onClick={add}><Plus /> Add {cfg.singular}</Button>} />
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(s) => s.id}
        searchText={(s) => `${s.name} ${s.category} ${s.staff.join(' ')}`}
        searchPlaceholder={`Search ${cfg.title.toLowerCase()}`}
        filters={[{ id: 'category', label: 'Categories', options: categories.map((c) => ({ value: c, label: c })), predicate: (s, v) => s.category === v }]}
        onRowClick={(s) => { setEditing(s); setOpen(true); }}
        rowActions={[
          { label: 'Edit', icon: Pencil, onSelect: (s) => { setEditing(s); setOpen(true); } },
          { label: 'Delete', icon: Trash2, destructive: true, onSelect: setDeleting },
        ]}
        empty={<EmptyState icon={Users} title={`No ${cfg.title.toLowerCase()} yet.`} description={cfg.emptyText} actionLabel={`Add ${cfg.singular}`} onAction={add} />}
      />
      <ServiceDrawer open={open} onOpenChange={setOpen} service={editing} categories={categories} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Past invoices keep it. It will no longer be available for new bills or bookings."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
