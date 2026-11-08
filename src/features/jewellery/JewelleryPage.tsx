import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Coins, Gem, Hammer, PackageCheck, Pencil, Plus, Scale, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppMutation } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { jewelleryService } from '@/services';
import type { JewelleryItem, MetalRate, RepairJob } from '@/types';

const RATES_KEY = ['jewellery', 'rates'];
const PURITY_FACTOR: Record<string, number> = { '24K': 0.999, '22K': 0.916, '20K': 0.833, '18K': 0.75, '14K': 0.585 };

function priceOf(item: JewelleryItem, rates: MetalRate[]) {
  const rate = rates.find((r) => r.metal === item.metal && r.purity === item.purity)?.ratePerGram ?? 0;
  const metal = item.netWeight * rate;
  const making = item.netWeight * item.makingPerGram;
  const subtotal = metal + making + item.stoneValue;
  return { metal, making, gst: subtotal * 0.03, total: Math.round(subtotal * 1.03) };
}

function RateEditor({ rate, onClose }: { rate: MetalRate | null; onClose: () => void }) {
  const [value, setValue] = useState('');
  const save = useAppMutation((v: number) => jewelleryService.rates.update(rate!.id, { ratePerGram: v }), {
    invalidate: [RATES_KEY],
    success: (r) => `${r.label} updated to ${formatINR(r.ratePerGram)}/g`,
    onSuccess: onClose,
  });
  return (
    <Modal
      open={!!rate}
      onOpenChange={(o) => !o && onClose()}
      title={`Update ${rate?.label} rate`}
      description="Prices of all items in this purity update instantly."
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!(Number(value) > 0)} loading={save.isPending} onClick={() => save.mutate(Number(value))}>Save rate</Button></>}
    >
      <FormField label="Rate per gram (₹)" hint={rate ? `Current: ${formatINR(rate.ratePerGram)}` : undefined}>
        <Input value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={String(rate?.ratePerGram ?? '')} autoFocus />
      </FormField>
    </Modal>
  );
}

const PURITIES: Record<JewelleryItem['metal'], JewelleryItem['purity'][]> = { Gold: ['24K', '22K', '18K'], Silver: ['925'], Platinum: ['950'] };

function AddItemModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [f, setF] = useState({ name: '', category: '', metal: 'Gold' as JewelleryItem['metal'], purity: '22K' as JewelleryItem['purity'], gross: '', net: '', making: '', stone: '', huid: '' });
  useEffect(() => {
    if (open) setF({ name: '', category: '', metal: 'Gold', purity: '22K', gross: '', net: '', making: '', stone: '', huid: '' });
  }, [open]);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const num = (v: string) => v.replace(/[^\d.]/g, '');
  const gross = Number(f.gross);
  const net = Number(f.net || f.gross);
  const valid = f.name.trim().length >= 2 && gross > 0 && net > 0 && net <= gross;
  const save = useAppMutation(
    () =>
      jewelleryService.items.create({
        name: sanitizeText(f.name, 60),
        metal: f.metal,
        purity: f.purity,
        grossWeight: gross,
        netWeight: net,
        makingPerGram: Number(f.making) || 0,
        stoneValue: Number(f.stone) || 0,
        huid: sanitizeText(f.huid, 10).toUpperCase() || '—',
        category: sanitizeText(f.category, 30) || 'Ornament',
        status: 'in-stock',
      }),
    { invalidate: [['jewellery', 'items']], success: (i) => `${i.name} added to stock`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add jewellery item"
      description="Price is calculated live from today's metal rate, making charge and stones."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>Add item</Button></>}
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        <FormField label="Item name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Temple Necklace" autoFocus /></FormField>
        <FormField label="Category"><Input value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Necklace, Ring…" /></FormField>
        <FormField label="HUID"><Input value={f.huid} onChange={(e) => set('huid', e.target.value)} className="uppercase" maxLength={10} /></FormField>
        <FormField label="Metal">
          <NativeSelect value={f.metal} onChange={(e) => { const m = e.target.value as JewelleryItem['metal']; setF((s) => ({ ...s, metal: m, purity: PURITIES[m][0] })); }}>
            {(['Gold', 'Silver', 'Platinum'] as const).map((m) => <option key={m}>{m}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label="Purity">
          <NativeSelect value={f.purity} onChange={(e) => set('purity', e.target.value)}>{PURITIES[f.metal].map((p) => <option key={p}>{p}</option>)}</NativeSelect>
        </FormField>
        <FormField label="Gross weight (g)" required><Input value={f.gross} onChange={(e) => set('gross', num(e.target.value))} inputMode="decimal" /></FormField>
        <FormField label="Net weight (g)" hint="Leave blank if same as gross" error={net > gross ? 'Net weight cannot exceed gross weight' : undefined}><Input value={f.net} onChange={(e) => set('net', num(e.target.value))} inputMode="decimal" /></FormField>
        <FormField label="Making charge (₹/g)"><Input value={f.making} onChange={(e) => set('making', num(e.target.value))} inputMode="decimal" /></FormField>
        <FormField label="Stone value (₹)"><Input value={f.stone} onChange={(e) => set('stone', num(e.target.value))} inputMode="decimal" /></FormField>
      </div>
    </Modal>
  );
}

function AddRepairModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [f, setF] = useState({ customer: '', item: '', work: '', days: '3', estimate: '' });
  useEffect(() => {
    if (open) setF({ customer: '', item: '', work: '', days: '3', estimate: '' });
  }, [open]);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.customer.trim().length >= 2 && f.item.trim().length >= 2 && f.work.trim().length >= 2;
  const save = useAppMutation(
    () =>
      jewelleryService.repairs.create({
        customer: sanitizeText(f.customer, 60),
        item: sanitizeText(f.item, 60),
        work: sanitizeText(f.work, 120),
        promised: new Date(Date.now() + (Number(f.days) || 0) * 864e5).toISOString(),
        estimate: Number(f.estimate) || 0,
        status: 'received',
      }),
    { invalidate: [['jewellery', 'repairs']], success: (r) => `Repair ${r.ticket} created`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New repair job"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>Create job</Button></>}
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        <FormField label="Customer" required><Input value={f.customer} onChange={(e) => set('customer', e.target.value)} autoFocus /></FormField>
        <FormField label="Item" required><Input value={f.item} onChange={(e) => set('item', e.target.value)} placeholder="Gold chain 22K" /></FormField>
        <FormField label="Work to be done" required className="sm:col-span-2"><Input value={f.work} onChange={(e) => set('work', e.target.value)} placeholder="Clasp replacement & polish" /></FormField>
        <FormField label="Ready in (days)"><Input value={f.days} onChange={(e) => set('days', e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></FormField>
        <FormField label="Estimate (₹)"><Input value={f.estimate} onChange={(e) => set('estimate', e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></FormField>
      </div>
    </Modal>
  );
}

function OldGoldCalculator({ rates }: { rates: MetalRate[] }) {
  const [weight, setWeight] = useState('10');
  const [purity, setPurity] = useState('22K');
  const [wastage, setWastage] = useState('2');
  const base = rates.find((r) => r.purity === '24K')?.ratePerGram ?? 0;
  const w = Number(weight) || 0;
  const net = w * (1 - (Number(wastage) || 0) / 100);
  const fine = net * (PURITY_FACTOR[purity] ?? 0.916);
  const value = Math.round(fine * base);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Old gold exchange" description="Estimate exchange value at today's 24K rate" icon={<Scale />} />
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField label="Gross weight (g)"><Input value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></FormField>
          <FormField label="Tested purity">
            <NativeSelect value={purity} onChange={(e) => setPurity(e.target.value)}>{Object.keys(PURITY_FACTOR).map((p) => <option key={p}>{p}</option>)}</NativeSelect>
          </FormField>
          <FormField label="Melting loss (%)"><Input value={wastage} onChange={(e) => setWastage(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></FormField>
        </CardContent>
      </Card>
      <Card className="flex flex-col justify-between bg-gradient-to-br from-primary to-primary-dark p-6 text-white">
        <div>
          <p className="text-[13px] text-white/75">Exchange value</p>
          <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{formatINR(value)}</p>
        </div>
        <dl className="mt-6 grid grid-cols-3 gap-3 text-[13px]">
          <div><dt className="text-white/70">Net weight</dt><dd className="tabular font-semibold">{net.toFixed(2)} g</dd></div>
          <div><dt className="text-white/70">Fine gold</dt><dd className="tabular font-semibold">{fine.toFixed(3)} g</dd></div>
          <div><dt className="text-white/70">24K rate</dt><dd className="tabular font-semibold">{formatINR(base)}</dd></div>
        </dl>
        <p className="mt-6 text-xs text-white/70">Estimate only — confirm purity with a tested certificate before exchange.</p>
      </Card>
    </div>
  );
}

export function JewelleryPage() {
  const rates = useQuery({ queryKey: RATES_KEY, queryFn: jewelleryService.rates.list });
  const items = useQuery({ queryKey: ['jewellery', 'items'], queryFn: jewelleryService.items.list });
  const repairs = useQuery({ queryKey: ['jewellery', 'repairs'], queryFn: jewelleryService.repairs.list });
  const [editingRate, setEditingRate] = useState<MetalRate | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [addingRepair, setAddingRepair] = useState(false);
  const advanceRepair = useAppMutation(
    (r: RepairJob) => jewelleryService.repairs.update(r.id, { status: r.status === 'received' ? 'in-progress' : r.status === 'in-progress' ? 'ready' : 'delivered' }),
    { invalidate: [['jewellery', 'repairs']], success: (r) => `${r.ticket} · ${r.status.replace('-', ' ')}` },
  );

  const markSold = useAppMutation((i: JewelleryItem) => jewelleryService.items.update(i.id, { status: 'sold' }), {
    invalidate: [['jewellery', 'items']],
    success: (i) => `${i.name} marked as sold`,
  });

  const delItem = useDeleteAction<JewelleryItem>({
    page: 'jewellery',
    name: (i) => i.name,
    remove: (i) => jewelleryService.items.remove(i.id),
    invalidate: [['jewellery', 'items']],
    description: (i) => `${i.sku} · ${i.metal} ${i.purity}, ${i.netWeight.toFixed(2)} g.`,
  });
  const delRepair = useDeleteAction<RepairJob>({
    page: 'jewellery',
    name: (x) => `repair ${x.ticket}`,
    remove: (x) => jewelleryService.repairs.remove(x.id),
    invalidate: [['jewellery', 'repairs']],
    description: (x) => `${x.item} for ${x.customer}.`,
  });

  const r = rates.data ?? [];
  const stockValue = useMemo(() => (items.data ?? []).filter((i) => i.status !== 'sold').reduce((s, i) => s + priceOf(i, r).total, 0), [items.data, r]);
  const goldWeight = (items.data ?? []).filter((i) => i.metal === 'Gold' && i.status !== 'sold').reduce((s, i) => s + i.netWeight, 0);

  return (
    <>
      <PageHeader title="Jewellery" description="Live metal rates, stock by weight, old gold and repairs." actions={<><Button variant="secondary" onClick={() => setAddingRepair(true)}><Wrench /> New repair</Button><Button onClick={() => setAddingItem(true)}><Plus /> Add item</Button></>} />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {rates.isLoading
          ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : r.map((rate) => (
              <Card key={rate.id} className="group relative p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Coins className={cn('h-3.5 w-3.5', rate.metal === 'Gold' ? 'text-warning' : 'text-subtle')} /> {rate.label}</span>
                  <button type="button" onClick={() => setEditingRate(rate)} className="rounded-md p-1 text-subtle opacity-0 transition-opacity hover:bg-surface hover:text-primary focus:opacity-100 group-hover:opacity-100" aria-label={`Edit ${rate.label} rate`}><Pencil className="h-3.5 w-3.5" /></button>
                </div>
                <p className="tabular mt-2 text-xl font-semibold tracking-tight">{formatINR(rate.ratePerGram)}<span className="text-xs font-normal text-subtle">/g</span></p>
                {rate.ratePerGram === 0 ? (
                  <button type="button" onClick={() => setEditingRate(rate)} className="mt-1 text-xs font-semibold text-primary hover:underline">Set today’s rate</button>
                ) : rate.change === 0 ? (
                  <span className="mt-1 block text-xs text-subtle">No change</span>
                ) : (
                  <span className={cn('mt-1 inline-flex items-center gap-0.5 text-xs font-semibold', rate.change > 0 ? 'text-success' : 'text-danger')}>
                    {rate.change > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(rate.change)}% from last rate
                  </span>
                )}
              </Card>
            ))}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard label="Stock value (today's rate)" value={formatINR(stockValue)} icon={Gem} loading={items.isLoading} accent />
        <StatCard label="Gold in stock" value={`${goldWeight.toFixed(1)} g`} icon={Scale} loading={items.isLoading} />
        <StatCard label="Open repairs" value={repairs.data?.filter((x) => x.status !== 'delivered').length ?? 0} icon={Wrench} loading={repairs.isLoading} className="col-span-2 xl:col-span-1" />
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="old-gold">Old Gold</TabsTrigger>
          <TabsTrigger value="repairs">Repairs</TabsTrigger>
        </TabsList>
        <TabsContent value="items">
          <DataTable
            data={items.data}
            isLoading={items.isLoading || rates.isLoading}
            getRowId={(i) => i.id}
            searchText={(i) => `${i.name} ${i.sku} ${i.huid} ${i.category}`}
            searchPlaceholder="Search item, SKU or HUID"
            filters={[
              { id: 'metal', label: 'Metals', options: ['Gold', 'Silver', 'Platinum'].map((m) => ({ value: m, label: m })), predicate: (i, v) => i.metal === v },
              { id: 'status', label: 'Statuses', options: [{ value: 'in-stock', label: 'In stock' }, { value: 'sold', label: 'Sold' }, { value: 'on-approval', label: 'On approval' }], predicate: (i, v) => i.status === v },
            ]}
            columns={[
              { id: 'name', header: 'Item', hideable: false, sortValue: (i) => i.name, cell: (i) => <div><p className="font-medium">{i.name}</p><p className="text-2xs text-subtle">{i.sku} · HUID {i.huid}</p></div> },
              { id: 'metal', header: 'Metal', cell: (i) => <Badge tone={i.metal === 'Gold' ? 'warning' : 'neutral'}>{i.metal} {i.purity}</Badge> },
              { id: 'weight', header: 'Net wt.', align: 'right', sortValue: (i) => i.netWeight, cell: (i) => `${i.netWeight.toFixed(2)} g` },
              { id: 'making', header: 'Making/g', align: 'right', cell: (i) => formatINR(i.makingPerGram) },
              { id: 'stone', header: 'Stones', align: 'right', defaultHidden: true, cell: (i) => (i.stoneValue ? formatINR(i.stoneValue) : '—') },
              { id: 'price', header: 'Price (incl. 3% GST)', align: 'right', sortValue: (i) => priceOf(i, r).total, cell: (i) => <span className="font-semibold">{formatINR(priceOf(i, r).total)}</span> },
              { id: 'status', header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
            ]}
            rowActions={[{ label: 'Mark as sold', icon: PackageCheck, onSelect: (i) => markSold.mutate(i), hidden: (i) => i.status === 'sold' }, delItem.action]}
            empty={<EmptyState icon={Gem} title="No jewellery items yet." description="Add ornaments with weight and purity to price them live." actionLabel="Add item" onAction={() => setAddingItem(true)} />}
          />
        </TabsContent>
        <TabsContent value="old-gold">
          <OldGoldCalculator rates={r} />
        </TabsContent>
        <TabsContent value="repairs">
          <DataTable
            data={repairs.data}
            isLoading={repairs.isLoading}
            getRowId={(x) => x.id}
            searchText={(x) => `${x.ticket} ${x.customer} ${x.item}`}
            columns={[
              { id: 'ticket', header: 'Ticket', hideable: false, cell: (x) => <span className="font-semibold">{x.ticket}</span> },
              { id: 'customer', header: 'Customer', cell: (x) => x.customer },
              { id: 'item', header: 'Item', cell: (x) => <div><p>{x.item}</p><p className="text-2xs text-subtle">{x.work}</p></div> },
              { id: 'received', header: 'Received', cell: (x) => formatDate(x.received) },
              { id: 'promised', header: 'Promised', cell: (x) => formatDate(x.promised) },
              { id: 'estimate', header: 'Estimate', align: 'right', cell: (x) => formatINR(x.estimate) },
              { id: 'status', header: 'Status', cell: (x) => <StatusBadge status={x.status} /> },
            ]}
            rowActions={[{ label: 'Move to next stage', icon: Hammer, onSelect: (x) => advanceRepair.mutate(x), hidden: (x) => x.status === 'delivered' }, delRepair.action]}
            empty={<EmptyState icon={Wrench} title="No repair jobs." description="Track repairs from receipt to delivery." actionLabel="New repair" onAction={() => setAddingRepair(true)} />}
          />
        </TabsContent>
      </Tabs>

      <RateEditor rate={editingRate} onClose={() => setEditingRate(null)} />
      <AddItemModal open={addingItem} onOpenChange={setAddingItem} />
      <AddRepairModal open={addingRepair} onOpenChange={setAddingRepair} />
      {delItem.dialog}
      {delRepair.dialog}
    </>
  );
}
