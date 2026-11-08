import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, ChefHat, Merge, Minus, Plus, Search, Split, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { qk } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { restaurantService } from '@/services';
import type { MenuItem, OrderLine, RestaurantOrder, RestaurantTable } from '@/types';
import { getPrinterSettings } from '@/lib/printer';
import { useKotPrinter } from './useKotPrinter';

/** Quick inline form so a restaurant can build its menu while taking orders. */
function AddMenuItem({ categories, onAdded }: { categories: string[]; onAdded: (id: string) => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [veg, setVeg] = useState(true);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 2 && Number(price) > 0;
  const add = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const item = await restaurantService.addMenuItem({ name: sanitizeText(name, 60), price: Number(price), category: sanitizeText(category, 30) || 'Main Course', veg, gstRate: 5 });
      toast.success(`${item.name} added to menu`);
      setName('');
      setPrice('');
      onAdded(item.id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 rounded-xl border border-dashed border-border p-3">
      <p className="mb-2 text-xs font-semibold">Add item to menu</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dish name" aria-label="Dish name" maxLength={60} />
        <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="₹ Price" aria-label="Price" inputMode="decimal" />
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g. Starters)" aria-label="Category" list="menu-categories" maxLength={30} />
        <NativeSelect value={veg ? 'veg' : 'non'} onChange={(e) => setVeg(e.target.value === 'veg')} aria-label="Veg or non-veg">
          <option value="veg">Veg</option><option value="non">Non-veg</option>
        </NativeSelect>
      </div>
      <datalist id="menu-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <Button size="sm" className="mt-2" onClick={add} disabled={!valid} loading={busy}><Plus /> Add & order</Button>
    </div>
  );
}

interface Props {
  order: RestaurantOrder | null;
  table?: RestaurantTable;
  tables: RestaurantTable[];
  onOpenChange: (open: boolean) => void;
}

function VegMark({ veg }: { veg: boolean }) {
  return (
    <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border', veg ? 'border-success' : 'border-danger')} aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}>
      <span className={cn('h-1.5 w-1.5 rounded-full', veg ? 'bg-success' : 'bg-danger')} />
    </span>
  );
}

export function OrderDrawer({ order, table, tables, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { data: menu } = useQuery({ queryKey: qk.restaurant('menu'), queryFn: restaurantService.menu, staleTime: Infinity });
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [category, setCategory] = useState('All');
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<'transfer' | 'merge' | 'split' | 'settle' | null>(null);
  const [busy, setBusy] = useState(false);
  const kotPrinter = useKotPrinter();

  useEffect(() => {
    setLines(order?.lines ?? []);
    setCategory('All');
    setQ('');
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => qc.invalidateQueries({ queryKey: ['restaurant'] });

  const update = (next: OrderLine[]) => {
    setLines(next);
    if (order) restaurantService.saveLines(order.id, next).catch((e) => toast.error(e instanceof Error ? e.message : 'Could not save the order.'));
  };

  const addItem = (id: string) => addItemById(id);

  function addItemById(id: string, list = qc.getQueryData<MenuItem[]>(qk.restaurant('menu')) ?? menu) {
    const item = list?.find((m) => m.id === id);
    if (!item) return;
    const pending = lines.find((l) => l.menuItemId === id && !l.sentToKitchen);
    update(pending ? lines.map((l) => (l === pending ? { ...l, qty: l.qty + 1 } : l)) : [...lines, { id: `ol_${Date.now()}`, menuItemId: id, name: item.name, qty: 1, price: item.price, sentToKitchen: false }]);
  }

  const setQty = (line: OrderLine, qty: number) => update(qty <= 0 ? lines.filter((l) => l.id !== line.id) : lines.map((l) => (l.id === line.id ? { ...l, qty } : l)));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;
  const pendingCount = lines.filter((l) => !l.sentToKitchen).length;

  const categories = useMemo(() => ['All', ...Array.from(new Set(menu?.map((m) => m.category) ?? []))], [menu]);
  const visibleMenu = (menu ?? []).filter((m) => (category === 'All' || m.category === category) && m.name.toLowerCase().includes(q.toLowerCase()));

  const sendKot = async () => {
    if (!order) return;
    setBusy(true);
    const kot = await restaurantService.sendKot(order.id);
    setBusy(false);
    setLines((ls) => ls.map((l) => ({ ...l, sentToKitchen: true })));
    refresh();
    if (kot) {
      toast.success(`${kot.number} sent to kitchen`, { description: `${kot.items.length} items for ${kot.table}` });
      // Settings → Printer: print the ticket on the kitchen (KOT) printer straight away.
      if (getPrinterSettings().kot.auto) kotPrinter.print(kot);
    }
  };

  const title = order ? (table ? `Table ${table.label}` : order.type === 'takeaway' ? 'Takeaway order' : 'Delivery order') : '';

  return (
    <>
      <Drawer
        open={!!order}
        onOpenChange={onOpenChange}
        width="xl"
        title={title}
        description={order ? `${order.number}${table ? ` · ${table.area} · ${table.seats} seats` : order.customer ? ` · ${order.customer}` : ''}` : undefined}
        footer={
          order && (
            <div className="flex w-full flex-wrap items-center gap-2">
              {table && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setDialog('transfer')}><ArrowLeftRight /> Transfer</Button>
                  <Button variant="secondary" size="sm" onClick={() => setDialog('merge')}><Merge /> Merge</Button>
                </>
              )}
              <Button variant="secondary" size="sm" onClick={() => setDialog('split')} disabled={!lines.length}><Split /> Split bill</Button>
              <div className="flex-1" />
              <Button variant="secondary" onClick={sendKot} disabled={!pendingCount} loading={busy}><ChefHat /> Send KOT {pendingCount > 0 && `(${pendingCount})`}</Button>
              <Button onClick={() => setDialog('settle')} disabled={!lines.length}><Wallet /> Bill {formatINR(total)}</Button>
            </div>
          )
        }
      >
        {order && (
          <div className="grid gap-5 md:grid-cols-[1fr_300px]">
            <section aria-label="Menu" className="min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search menu" aria-label="Search menu" className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-[13px] outline-none focus:border-primary/50" />
              </div>
              <div className="scrollbar-none mt-3 flex gap-1.5 overflow-x-auto">
                {categories.map((c) => (
                  <button key={c} onClick={() => setCategory(c)} className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium', category === c ? 'bg-primary text-white' : 'bg-surface text-muted-foreground hover:text-foreground')}>{c}</button>
                ))}
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {visibleMenu.map((m) => (
                  <li key={m.id}>
                    <button type="button" disabled={m.soldOut} onClick={() => addItem(m.id)} className="flex w-full items-center gap-2.5 rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale disabled:hover:bg-transparent">
                      {m.image ? <img src={m.image} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : null}
                      <VegMark veg={m.veg} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{m.name}</span>
                      {m.soldOut ? <span className="text-2xs font-semibold text-danger">Out of stock</span> : <span className="tabular text-[13px] font-semibold">{formatINR(m.price)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {(menu?.length ?? 0) === 0 && <p className="mt-3 rounded-xl bg-surface px-4 py-6 text-center text-xs text-muted-foreground">Your menu is empty. Add your first dish below.</p>}
              <AddMenuItem categories={categories.slice(1)} onAdded={(id) => { qc.invalidateQueries({ queryKey: qk.restaurant('menu') }).then(() => addItemById(id)); }} />
            </section>

            <section aria-label="Order" className="flex flex-col rounded-2xl border border-border bg-surface/40">
              <p className="border-b border-border px-4 py-3 text-[13px] font-semibold">Order items</p>
              <ul className="flex-1 divide-y divide-border">
                {lines.length === 0 && <li className="px-4 py-10 text-center text-xs text-muted-foreground">Tap menu items to add them to this order.</li>}
                {lines.map((l) => (
                  <li key={l.id} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium">{l.name}</p>
                      <span className="tabular text-[13px]">{formatINR(l.qty * l.price)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className={cn('text-2xs font-medium', l.sentToKitchen ? 'text-success' : 'text-warning')}>{l.sentToKitchen ? 'Sent to kitchen' : 'Not sent'}</span>
                      <div className="flex items-center rounded-lg border border-border bg-card">
                        <button type="button" onClick={() => setQty(l, l.qty - 1)} className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-primary" aria-label={`Decrease ${l.name}`}><Minus className="h-3 w-3" /></button>
                        <span className="tabular w-6 text-center text-xs font-semibold">{l.qty}</span>
                        <button type="button" onClick={() => setQty(l, l.qty + 1)} className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-primary" aria-label={`Increase ${l.name}`}><Plus className="h-3 w-3" /></button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1 border-t border-border px-4 py-3 text-[13px]">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{formatINR(subtotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">GST 5%</dt><dd className="tabular">{formatINR(tax)}</dd></div>
                <div className="flex justify-between pt-1 text-[15px] font-semibold"><dt>Total</dt><dd className="tabular text-primary">{formatINR(total)}</dd></div>
              </dl>
            </section>
          </div>
        )}
      </Drawer>

      {order && (
        <TableActions
          kind={dialog}
          onClose={() => setDialog(null)}
          order={order}
          table={table}
          tables={tables}
          total={total}
          onDone={() => {
            refresh();
            setDialog(null);
          }}
          onSettled={() => {
            refresh();
            // Settling creates a real invoice.
            qc.invalidateQueries({ queryKey: qk.sales });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            setDialog(null);
            onOpenChange(false);
          }}
        />
      )}
      {kotPrinter.element}
    </>
  );
}

function TableActions({
  kind,
  onClose,
  order,
  table,
  tables,
  total,
  onDone,
  onSettled,
}: {
  kind: 'transfer' | 'merge' | 'split' | 'settle' | null;
  onClose: () => void;
  order: RestaurantOrder;
  table?: RestaurantTable;
  tables: RestaurantTable[];
  total: number;
  onDone: () => void;
  onSettled: () => void;
}) {
  const [target, setTarget] = useState('');
  const [merge, setMerge] = useState<string[]>([]);
  const [ways, setWays] = useState(2);
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);
  const available = tables.filter((t) => t.status === 'available');
  const occupied = tables.filter((t) => t.status === 'occupied' && t.id !== table?.id && t.orderId !== order.id);

  useEffect(() => {
    setTarget('');
    setMerge([]);
    setWays(2);
  }, [kind]);

  const run = async (fn: () => Promise<unknown>, message: string, settle = false) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      if (settle) onSettled();
      else onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={kind === 'transfer'}
        onOpenChange={(o) => !o && onClose()}
        title={`Transfer ${table?.label}`}
        description="Move this order and its guests to another table."
        size="sm"
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!target} loading={busy} onClick={() => table && run(() => restaurantService.transfer(table.id, target), `Order moved to ${tables.find((t) => t.id === target)?.label}`, true)}>Transfer</Button></>}
      >
        <div className="grid grid-cols-4 gap-2 pb-2">
          {available.map((t) => (
            <button key={t.id} onClick={() => setTarget(t.id)} className={cn('rounded-xl border py-3 text-center text-[13px] font-semibold', target === t.id ? 'border-primary bg-primary-light text-primary' : 'border-border hover:border-primary/40')}>
              {t.label}
              <span className="block text-2xs font-normal text-subtle">{t.seats} seats</span>
            </button>
          ))}
          {available.length === 0 && <p className="col-span-4 py-6 text-center text-xs text-muted-foreground">No free tables right now.</p>}
        </div>
      </Modal>

      <Modal
        open={kind === 'merge'}
        onOpenChange={(o) => !o && onClose()}
        title={`Merge into ${table?.label}`}
        description="Combine orders from other occupied tables into this bill."
        size="sm"
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!merge.length} loading={busy} onClick={() => table && run(() => restaurantService.merge(table.id, merge), `${merge.length} table(s) merged into ${table.label}`)}>Merge tables</Button></>}
      >
        <ul className="space-y-1.5 pb-2">
          {occupied.map((t) => (
            <li key={t.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-surface">
                <Checkbox checked={merge.includes(t.id)} onCheckedChange={(c) => setMerge((m) => (c ? [...m, t.id] : m.filter((x) => x !== t.id)))} />
                <span className="flex-1 text-[13px] font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.area} · {t.guests} guests</span>
              </label>
            </li>
          ))}
          {occupied.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">No other occupied tables to merge.</li>}
        </ul>
      </Modal>

      <Modal
        open={kind === 'split'}
        onOpenChange={(o) => !o && onClose()}
        title="Split bill"
        description={`Total ${formatINR(total)}`}
        size="sm"
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="flex items-center justify-center gap-4 py-2">
          <Button variant="secondary" size="icon" onClick={() => setWays((w) => Math.max(2, w - 1))} aria-label="Fewer splits"><Minus /></Button>
          <span className="tabular w-16 text-center text-3xl font-semibold">{ways}</span>
          <Button variant="secondary" size="icon" onClick={() => setWays((w) => Math.min(12, w + 1))} aria-label="More splits"><Plus /></Button>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 pb-2">
          {Array.from({ length: ways }, (_, i) => (
            <li key={i} className="rounded-xl bg-surface px-3 py-2.5 text-[13px]">
              <span className="text-muted-foreground">Guest {i + 1}</span>
              <span className="tabular float-right font-semibold">{formatINR(i === ways - 1 ? total - Math.ceil(total / ways) * (ways - 1) : Math.ceil(total / ways))}</span>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={kind === 'settle'}
        onOpenChange={(o) => !o && onClose()}
        title="Settle bill"
        description={`${order.number} · ${table ? `Table ${table.label}` : order.type}`}
        size="sm"
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => run(() => restaurantService.settle(order.id, method as 'cash' | 'upi' | 'card'), `${order.number} settled · ${formatINR(total)}`, true)}>Settle {formatINR(total)}</Button></>}
      >
        <div className="space-y-3 pb-2">
          <div className="rounded-xl bg-primary-soft p-4 text-center">
            <p className="text-xs text-muted-foreground">Amount payable</p>
            <p className="tabular text-2xl font-semibold text-primary">{formatINR(total)}</p>
          </div>
          <NativeSelect value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
            <option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">The table will be marked for cleaning after settlement.</p>
        </div>
      </Modal>
    </>
  );
}
