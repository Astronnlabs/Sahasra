import { Check, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';
import type { CartLine } from './usePosCart';

type NewLine = Omit<CartLine, 'key' | 'qty' | 'discountPct' | 'price'>;

/** Choose a portion / pack size and add-ons before adding an item to the bill. */
export function OptionPicker({ product, optionLabel, onClose, onAdd }: { product: Product | null; optionLabel: string; onClose: () => void; onAdd: (line: NewLine) => void }) {
  // '' = the item's regular price (no option).
  const [option, setOption] = useState('');
  const [addons, setAddons] = useState<string[]>([]);

  useEffect(() => {
    if (!product) return;
    setOption(product.options[0]?.name ?? '');
    setAddons([]);
  }, [product]);

  if (!product) return <Modal open={false} onOpenChange={() => onClose()} title="" />;

  const chosen = product.options.find((o) => o.name === option);
  const addonTotal = product.addons.filter((a) => addons.includes(a.name)).reduce((s, a) => s + a.price, 0);
  const base = chosen ? chosen.price : product.sellingPrice;
  const price = base + addonTotal;
  const name = `${product.name}${chosen ? ` (${chosen.name})` : ''}${addons.length ? ` + ${addons.join(', ')}` : ''}`;

  const add = () =>
    onAdd({
      refId: product.id,
      kind: 'product',
      name,
      sku: product.sku,
      hsn: product.hsn,
      retailPrice: price,
      // Trade price applies only to the item's regular unit.
      tradePrice: !chosen && product.tradePrice > 0 ? product.tradePrice + addonTotal : 0,
      gstRate: product.gstRate,
      stock: product.isSelfProduct ? undefined : product.stock,
      stockFactor: chosen?.factor || 1,
      allowDecimal: product.allowDecimalQty && !chosen,
      option: chosen?.name,
      addons,
    });

  const choices = [
    // Keep the regular price as a choice unless every way of selling it is an option (e.g. Half / Full).
    ...(product.options.length && product.attributes?.foodType ? [] : [{ name: '', label: `Regular (${product.unit})`, price: product.sellingPrice }]),
    ...product.options.map((o) => ({ name: o.name, label: o.name, price: o.price })),
  ];

  return (
    <Modal
      open={!!product}
      onOpenChange={(o) => !o && onClose()}
      title={product.name}
      description={product.category}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={add}><Plus /> Add · {formatINR(price)}</Button>
        </>
      }
    >
      <div className="space-y-5 pb-2">
        {choices.length > 1 && (
          <section>
            <p className="mb-2 text-xs font-medium">{optionLabel}</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={optionLabel}>
              {choices.map((c) => {
                const on = option === c.name;
                return (
                  <button
                    key={c.name || 'regular'}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setOption(c.name)}
                    className={cn('flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors', on ? 'border-primary bg-primary-light text-primary' : 'border-border hover:border-primary/40')}
                  >
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular">{formatINR(c.price)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {product.addons.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-medium">Add-ons</p>
            <div className="space-y-1.5">
              {product.addons.map((a) => {
                const on = addons.includes(a.name);
                return (
                  <button
                    key={a.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAddons((list) => (on ? list.filter((x) => x !== a.name) : [...list, a.name]))}
                    className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-[13px]', on ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface')}
                  >
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-white' : 'border-border')}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="flex-1">{a.name}</span>
                    <span className="tabular text-muted-foreground">+{formatINR(a.price)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
