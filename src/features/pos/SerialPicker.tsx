import { useQuery } from '@tanstack/react-query';
import { Check, Plus, ScanBarcode } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { qk } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { productsService } from '@/services';
import type { Product } from '@/types';
import type { CartLine } from './usePosCart';

type NewLine = Omit<CartLine, 'key' | 'qty' | 'discountPct' | 'price'>;

export const isSerialTracked = (p?: Product | null) => p?.attributes?.imeiTracking === true;

/** A cart line for one identified unit of a tracked product. */
export const serialLine = (p: Product, serial: string): NewLine => ({
  refId: p.id,
  kind: 'product',
  name: p.name,
  sku: p.sku,
  hsn: p.hsn,
  retailPrice: p.sellingPrice,
  tradePrice: p.tradePrice,
  gstRate: p.gstRate,
  stockFactor: 1,
  serial,
});

/** Pick which phones / units (by IMEI or serial) are being sold. */
export function SerialPicker({ product, taken, onClose, onAdd }: { product: Product | null; taken: string[]; onClose: () => void; onAdd: (lines: NewLine[]) => void }) {
  const { data, isLoading } = useQuery({ queryKey: qk.serials(product?.id ?? ''), queryFn: () => productsService.serials(product!.id, 'in_stock'), enabled: !!product });
  const [chosen, setChosen] = useState<string[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    setChosen([]);
    setQ('');
  }, [product]);

  const available = (data ?? []).filter((s) => !taken.includes(s.serial));
  const needle = q.trim().toUpperCase();
  const shown = needle ? available.filter((s) => s.serial.includes(needle)) : available;
  const toggle = (serial: string) => setChosen((c) => (c.includes(serial) ? c.filter((x) => x !== serial) : [...c, serial]));

  return (
    <Modal
      open={!!product}
      onOpenChange={(o) => !o && onClose()}
      title={product?.name ?? ''}
      description="Choose the IMEI / serial of each piece being sold."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!chosen.length} onClick={() => product && onAdd(chosen.map((s) => serialLine(product, s)))}>
            <Plus /> Add {chosen.length || ''} · {formatINR((product?.sellingPrice ?? 0) * chosen.length)}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, ''))}
          onKeyDown={(e) => {
            // A scanner types the full number and presses Enter.
            if (e.key === 'Enter' && shown.length === 1) {
              toggle(shown[0].serial);
              setQ('');
            }
          }}
          leftIcon={<ScanBarcode />}
          placeholder="Scan or type IMEI / serial"
          autoFocus
          className="font-mono"
        />
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {shown.map((s) => {
            const on = chosen.includes(s.serial);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.serial)}
                  className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-[13px]', on ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface')}
                >
                  <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-white' : 'border-border')}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="flex-1 font-mono">{s.serial}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {!isLoading && !available.length && <p className="text-xs text-muted-foreground">No pieces in stock. Add IMEI numbers in the product or receive a purchase first.</p>}
        {!isLoading && available.length > 0 && !shown.length && <p className="text-xs text-muted-foreground">No piece in stock with that number.</p>}
      </div>
    </Modal>
  );
}
