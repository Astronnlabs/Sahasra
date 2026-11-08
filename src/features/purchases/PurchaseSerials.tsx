import { FormField } from '@/components/forms/FormField';
import { Textarea } from '@/components/ui/input';
import type { Product } from '@/types';

export const parseSerials = (text: string) => Array.from(new Set(text.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)));

/** Tracked products on a bill and how many pieces of each are coming in. */
export function serialNeeds(lines: { productId?: string; qty: number | string }[], products: Product[] | undefined) {
  const needs = new Map<string, { product: Product; qty: number }>();
  for (const l of lines) {
    const p = products?.find((x) => x.id === l.productId);
    if (!p || p.attributes?.imeiTracking !== true) continue;
    const cur = needs.get(p.id) ?? { product: p, qty: 0 };
    cur.qty += Number(l.qty) || 0;
    needs.set(p.id, cur);
  }
  return [...needs.values()];
}

/** Checks the counts and returns the numbers by product, ready for the API. */
export function collectSerials(needs: { product: Product; qty: number }[], text: Record<string, string>) {
  const out: Record<string, string[]> = {};
  for (const { product, qty } of needs) {
    const list = parseSerials(text[product.id] ?? '');
    if (list.length !== qty) throw new Error(`Enter ${qty} IMEI / serial number${qty === 1 ? '' : 's'} for ${product.name} (${list.length} entered).`);
    out[product.id] = list;
  }
  return out;
}

/** One box per IMEI-tracked product: the numbers of the pieces received. */
export function PurchaseSerials({ needs, value, onChange }: { needs: { product: Product; qty: number }[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  if (!needs.length) return null;
  return (
    <div className="space-y-3">
      {needs.map(({ product, qty }) => {
        const count = parseSerials(value[product.id] ?? '').length;
        return (
          <FormField
            key={product.id}
            label={`IMEI / serial numbers · ${product.name}`}
            hint={`${count} of ${qty} entered · one per line, or scan each piece`}
          >
            <Textarea
              aria-invalid={count !== qty}
              value={value[product.id] ?? ''}
              onChange={(e) => onChange({ ...value, [product.id]: e.target.value.toUpperCase() })}
              rows={Math.min(6, Math.max(2, qty))}
              className="font-mono"
              placeholder="356789012345678"
            />
          </FormField>
        );
      })}
    </div>
  );
}
