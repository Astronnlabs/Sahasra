import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { AlertTriangle, CalendarX, PackageMinus, Pill, Plus, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Drawer } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppMutation } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { pharmacyService } from '@/services';
import type { Medicine } from '@/types';

const KEY = ['pharmacy', 'medicines'];
const days = (m: Medicine) => differenceInCalendarDays(parseISO(m.expiry), new Date());

const schema = z.object({
  name: z.string().trim().min(2, 'Brand name is required'),
  generic: z.string().trim().min(2, 'Composition is required'),
  manufacturer: z.string().trim().min(2, 'Manufacturer is required'),
  batch: z.string().trim().min(3, 'Batch number is required').max(20),
  expiry: z.string().min(1, 'Expiry is required'),
  schedule: z.enum(['OTC', 'H', 'H1', 'X']),
  pack: z.string().trim().min(2),
  stock: z.coerce.number().int().min(0),
  minStock: z.coerce.number().int().min(0),
  mrp: z.coerce.number().positive('Enter MRP'),
  rack: z.string().trim().max(10),
});
type Values = z.infer<typeof schema>;

function AddMedicine({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) reset({ name: '', generic: '', manufacturer: '', batch: '', expiry: '', schedule: 'OTC', pack: 'Strip of 10', stock: 0, minStock: 20, mrp: 0, rack: '' });
  }, [open, reset]);
  const save = useAppMutation(
    (v: Values) => pharmacyService.medicines.create({ ...v, name: sanitizeText(v.name, 60), expiry: new Date(v.expiry).toISOString(), rate: Math.round(v.mrp * 0.78), gstRate: 12 }),
    { invalidate: [KEY], success: (m) => `${m.name} (batch ${m.batch}) added`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Add medicine batch"
      description="Each batch is tracked separately for expiry."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>Add batch</Button></>}
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Brand name" error={errors.name?.message} required><Input {...register('name')} autoFocus placeholder="Dolo 650" /></FormField>
        <FormField label="Composition" error={errors.generic?.message} required><Input {...register('generic')} placeholder="Paracetamol 650mg" /></FormField>
        <FormField label="Manufacturer" error={errors.manufacturer?.message} required><Input {...register('manufacturer')} /></FormField>
        <FormField label="Pack"><Input {...register('pack')} /></FormField>
        <FormField label="Batch no." error={errors.batch?.message} required><Input {...register('batch')} className="uppercase" /></FormField>
        <FormField label="Expiry" error={errors.expiry?.message} required><DatePicker value={watch('expiry')} onChange={(d) => setValue('expiry', d, { shouldValidate: true })} /></FormField>
        <FormField label="Schedule"><NativeSelect {...register('schedule')}>{['OTC', 'H', 'H1', 'X'].map((s) => <option key={s}>{s}</option>)}</NativeSelect></FormField>
        <FormField label="Rack"><Input {...register('rack')} placeholder="R2-B3" /></FormField>
        <FormField label="Stock"><Input {...register('stock')} inputMode="numeric" /></FormField>
        <FormField label="Minimum stock"><Input {...register('minStock')} inputMode="numeric" /></FormField>
        <FormField label="MRP (₹)" error={errors.mrp?.message} required><Input {...register('mrp')} inputMode="decimal" /></FormField>
      </form>
    </Drawer>
  );
}

export function MedicinesPage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: pharmacyService.medicines.list });
  const [open, setOpen] = useState(false);
  const del = useDeleteAction<Medicine>({
    page: 'pharmacy',
    name: (m) => `${m.name} (batch ${m.batch})`,
    remove: (m) => pharmacyService.medicines.remove(m.id),
    invalidate: [KEY],
    description: (m) => `${m.stock} in stock, expiry ${formatDate(m.expiry)}.`,
  });
  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      expiring: list.filter((m) => days(m) >= 0 && days(m) <= 60),
      expired: list.filter((m) => days(m) < 0),
      low: list.filter((m) => m.stock <= m.minStock),
      scheduled: list.filter((m) => m.schedule !== 'OTC').length,
    };
  }, [data]);

  const columns: Column<Medicine>[] = [
    { id: 'name', header: 'Medicine', hideable: false, sortValue: (m) => m.name, cell: (m) => <div><p className="font-medium">{m.name}</p><p className="max-w-[220px] truncate text-2xs text-subtle">{m.generic} · {m.manufacturer}</p></div> },
    { id: 'batch', header: 'Batch', cell: (m) => <span className="font-mono text-xs">{m.batch}</span> },
    {
      id: 'expiry',
      header: 'Expiry',
      sortValue: (m) => m.expiry,
      cell: (m) => {
        const d = days(m);
        return <span className={d < 0 ? 'font-semibold text-danger' : d <= 60 ? 'font-semibold text-warning' : ''}>{formatDate(m.expiry)}</span>;
      },
    },
    { id: 'schedule', header: 'Schedule', cell: (m) => <Badge tone={m.schedule === 'OTC' ? 'neutral' : m.schedule === 'H1' || m.schedule === 'X' ? 'danger' : 'warning'}>{m.schedule}</Badge> },
    { id: 'pack', header: 'Pack', defaultHidden: true, cell: (m) => m.pack },
    { id: 'rack', header: 'Rack', cell: (m) => m.rack },
    { id: 'stock', header: 'Stock', align: 'right', sortValue: (m) => m.stock, cell: (m) => <span className={m.stock <= m.minStock ? 'font-semibold text-warning' : ''}>{m.stock}</span> },
    { id: 'mrp', header: 'MRP', align: 'right', sortValue: (m) => m.mrp, cell: (m) => formatINR(m.mrp) },
    { id: 'status', header: 'Status', cell: (m) => <StatusBadge status={days(m) < 0 ? 'expired' : days(m) <= 60 ? 'expiring' : m.stock <= m.minStock ? 'Low stock' : 'In stock'} /> },
  ];

  return (
    <>
      <PageHeader title="Pharmacy" description="Medicines tracked by batch, expiry and schedule." actions={<Button onClick={() => setOpen(true)}><Plus /> Add batch</Button>} />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Medicine batches" value={stats.total} icon={Pill} loading={isLoading} />
        <StatCard label="Expiring in 60 days" value={stats.expiring.length} icon={AlertTriangle} loading={isLoading} />
        <StatCard label="Expired — remove from shelf" value={stats.expired.length} icon={CalendarX} loading={isLoading} />
        <StatCard label="Scheduled drugs" value={stats.scheduled} icon={ShieldAlert} loading={isLoading} hint="H / H1 / X — prescription required" />
      </div>
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All medicines</TabsTrigger>
          <TabsTrigger value="expiry">Expiry alerts {stats.expiring.length + stats.expired.length > 0 && <Badge tone="danger">{stats.expiring.length + stats.expired.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="low">Low stock</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <DataTable
            data={data}
            isLoading={isLoading}
            columns={columns}
            getRowId={(m) => m.id} rowActions={[del.action]}
            searchText={(m) => `${m.name} ${m.generic} ${m.batch} ${m.manufacturer}`}
            searchPlaceholder="Search brand, composition or batch"
            filters={[{ id: 'schedule', label: 'Schedules', options: ['OTC', 'H', 'H1', 'X'].map((s) => ({ value: s, label: `Schedule ${s}` })), predicate: (m, v) => m.schedule === v }]}
            empty={<EmptyState icon={Pill} title="No medicines yet." description="Add medicine batches to track expiry and stock." actionLabel="Add batch" onAction={() => setOpen(true)} />}
          />
        </TabsContent>
        <TabsContent value="expiry">
          <DataTable data={[...stats.expired, ...stats.expiring]} isLoading={isLoading} columns={columns} getRowId={(m) => m.id} rowActions={[del.action]} initialSort={{ id: 'expiry', dir: 'asc' }} empty={<EmptyState icon={CalendarX} title="No expiry alerts" description="No batches expire in the next 60 days." />} />
        </TabsContent>
        <TabsContent value="low">
          <DataTable data={stats.low} isLoading={isLoading} columns={columns} getRowId={(m) => m.id} rowActions={[del.action]} empty={<EmptyState icon={PackageMinus} title="Stock levels look healthy" description="No medicines are below minimum stock." />} />
        </TabsContent>
      </Tabs>
      <AddMedicine open={open} onOpenChange={setOpen} />
      {del.dialog}
    </>
  );
}
