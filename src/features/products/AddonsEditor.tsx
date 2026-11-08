import { Link2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useProducts } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import type { Addon } from '@/types';

const MAX = 30;
const amount = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0;

/**
 * Extras for an item. Type your own (Extra chicken — price and what it costs you),
 * or pick something already on the menu (Coke) — it is then billed as its own line
 * and uses that item's stock.
 */
export function AddonsEditor({ value, onChange, productId }: { value: Addon[]; onChange: (rows: Addon[]) => void; productId?: string }) {
  const { data: products } = useProducts();
  const menu = (products ?? []).filter((p) => p.status === 'active' && p.id !== productId);
  const set = (i: number, patch: Partial<Addon>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = (row: Addon) => (value.length >= MAX ? toast.error(`Up to ${MAX} add-ons`) : onChange([...value, row]));
  const available = menu.filter((p) => !value.some((a) => a.productId === p.id));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="hidden grid-cols-[1fr_96px_96px_32px] gap-2 px-0.5 text-2xs font-semibold uppercase tracking-wider text-subtle sm:grid">
          <span>Add-on</span>
          <span>Price ₹</span>
          <span>Cost ₹</span>
          <span />
        </div>
      )}
      {value.map((row, i) => {
        const linked = row.productId ? (products ?? []).find((p) => p.id === row.productId) : undefined;
        return (
          <div key={i} className="rounded-xl border border-border p-2 sm:border-0 sm:p-0">
            <div className="grid grid-cols-[1fr_96px_96px_32px] items-center gap-2">
              {row.productId ? (
                <span className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-3 text-[13px]" title="From your menu">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">{linked?.name ?? row.name}</span>
                </span>
              ) : (
                <Input value={row.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Extra chicken" aria-label="Add-on name" />
              )}
              <Input value={row.price || ''} onChange={(e) => set(i, { price: amount(e.target.value) })} placeholder="Price" inputMode="decimal" aria-label="Add-on price" />
              {/* Left empty for a menu item, its purchase price is used. */}
              <Input value={row.cost || ''} onChange={(e) => set(i, { cost: amount(e.target.value) })} placeholder={linked?.purchasePrice ? String(linked.purchasePrice) : 'Cost'} inputMode="decimal" aria-label="What the add-on costs you" />
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove add-on">
                <Trash2 />
              </Button>
            </div>
            {row.productId && (
              <p className="mt-1 px-0.5 text-2xs text-muted-foreground">
                From your menu · billed as its own line
                {linked ? (linked.isSelfProduct ? '' : ` · uses its stock (${Number(linked.stock.toFixed(2))} ${linked.unit.toLowerCase()} left)`) : ' · no longer on the menu'}
                {linked && linked.sellingPrice !== row.price ? ` · menu price ${formatINR(linked.sellingPrice)}` : ''}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" variant="soft" size="sm" onClick={() => add({ name: '', price: 0, cost: 0 })}>
          <Plus /> Add your own
        </Button>
        {available.length > 0 && (
          <NativeSelect
            value=""
            onChange={(e) => {
              const p = menu.find((x) => x.id === e.target.value);
              if (p) add({ name: p.name.slice(0, 40), price: p.sellingPrice, cost: p.purchasePrice, productId: p.id });
            }}
            className="h-8 w-56 text-[13px]"
            aria-label="Add an item from your menu as an add-on"
          >
            <option value="">+ Add from menu…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatINR(p.sellingPrice)}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Cost is what the extra costs you — used to work out your profit.</p>
    </div>
  );
}
