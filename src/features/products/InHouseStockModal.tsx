import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { qk, useAppMutation } from '@/hooks/queries';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { productsService } from '@/services';
import type { Product } from '@/types';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** In-house stock: set how much is left after a count, or add what was bought. */
export function InHouseStockModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [mode, setMode] = useState<'left' | 'add'>('left');
  const [value, setValue] = useState('');
  useEffect(() => {
    if (product) {
      setMode('left');
      setValue(String(product.stock));
    }
  }, [product]);

  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= 0 && (mode === 'left' || n > 0);
  const next = product ? round3(mode === 'left' ? n : product.stock + n) : 0;
  const save = useAppMutation((p: Product) => productsService.update(p.id, { stock: next }), {
    invalidate: [qk.products, qk.inventory, qk.movements],
    success: (p) => `${p.name}: ${formatNumber(p.stock)} ${p.unit} left`,
    onSuccess: onClose,
  });

  return (
    <Modal
      open={!!product}
      onOpenChange={(o) => !o && onClose()}
      title={product ? `Update ${product.name}` : ''}
      description={product ? `Now ${formatNumber(product.stock)} ${product.unit} left. Every change is kept in stock history.` : undefined}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid || next === product?.stock} loading={save.isPending} onClick={() => product && save.mutate(product)}>Save</Button></>}
    >
      {product && (
        <div className="space-y-4 pb-2">
          <div className="flex rounded-lg border border-border bg-surface p-0.5">
            {([['left', 'Set amount left'], ['add', 'Add new stock']] as const).map(([m, label]) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setValue(m === 'left' ? String(product.stock) : ''); }} className={cn('flex-1 rounded-md py-1.5 text-xs font-medium', mode === m ? 'bg-card text-primary shadow-card' : 'text-muted-foreground')}>
                {label}
              </button>
            ))}
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">{mode === 'left' ? `How much is left (${product.unit})` : `How much you got (${product.unit})`}</span>
            <Input value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" autoFocus />
          </label>
          {valid && <p className="text-xs text-muted-foreground">New stock: <b className="text-foreground">{formatNumber(next)} {product.unit}</b>{next < product.stock ? ` (${formatNumber(round3(product.stock - next))} used or lost)` : next > product.stock ? ` (+${formatNumber(round3(next - product.stock))})` : ''}</p>}
        </div>
      )}
    </Modal>
  );
}
