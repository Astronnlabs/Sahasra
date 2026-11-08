import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { industryConfig } from '@/app/config/industry';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { FormField, FormSection } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Drawer } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { qk, useAppMutation, useVendors } from '@/hooks/queries';
import { formatDate, formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { productsService, type ProductInput } from '@/services';
import type { Addon, Product, SellOption } from '@/types';
import { AddonsEditor } from './AddonsEditor';
import { AttributeFields, type Attributes } from './AttributeFields';
import { ProductImagePicker } from './ProductImagePicker';
import { libraryFor } from '@/app/config/pictureLibraries';

const money = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative');
const qty = z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0, 'Cannot be negative');

/** In-house items (salon shampoo, wax) are never sold, so they need no selling price. */
const makeSchema = (inHouse: boolean) => z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(120),
    sku: z.string().trim().max(40),
    barcode: z.string().trim().regex(/^[0-9A-Za-z-]{0,20}$/, 'Up to 20 letters or digits'),
    category: z.string().trim().min(2, 'Choose or type a category'),
    brand: z.string().trim().max(60),
    unit: z.string().min(1),
    purchasePrice: money,
    sellingPrice: inHouse ? money : money.refine((v) => v > 0, 'Selling price must be greater than 0'),
    mrp: money,
    tradePrice: money,
    gstRate: z.coerce.number(),
    hsn: z.string().trim().regex(/^(\d{4,8})?$/, 'HSN should be 4–8 digits'),
    stock: qty,
    minStock: qty,
    supplier: z.string(),
    expiryDate: z.string(),
  })
  .refine((v) => v.mrp === 0 || v.sellingPrice <= v.mrp, { path: ['sellingPrice'], message: 'Selling price cannot exceed MRP' });

type Values = z.infer<ReturnType<typeof makeSchema>>;
const GST_RATES = [0, 3, 5, 12, 18, 28, 40];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  categories: string[];
  /** New item is for in-house use (salons); an existing item keeps its own setting. */
  inHouse?: boolean;
}

export function ProductFormDrawer({ open, onOpenChange, product, categories, inHouse: newInHouse = false }: Props) {
  const { businessType } = useWorkspace();
  const cfg = industryConfig(businessType).goods;
  const f = cfg.features;
  const inHouse = !!f.inHouse && (product ? !!product.inHouse : newInHouse);
  const schema = makeSchema(inHouse);
  const { data: vendors } = useVendors();

  const defaults = (p?: Product | null): Values => ({
    name: p?.name ?? '',
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    category: p?.category ?? '',
    brand: p?.brand ?? '',
    unit: p?.unit ?? cfg.defaultUnit,
    purchasePrice: p?.purchasePrice ?? 0,
    sellingPrice: p?.sellingPrice ?? 0,
    mrp: p?.mrp ?? 0,
    tradePrice: p?.tradePrice ?? 0,
    gstRate: p?.gstRate ?? cfg.defaultGst,
    hsn: p?.hsn ?? cfg.defaultHsn,
    stock: p?.stock ?? 0,
    minStock: p?.minStock ?? 0,
    supplier: p?.supplier ?? '',
    expiryDate: p?.expiryDate?.slice(0, 10) ?? '',
  });

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(product) });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = form;
  const [noStock, setNoStock] = useState(cfg.noStockDefault);
  const [loose, setLoose] = useState(false);
  const [options, setOptions] = useState<SellOption[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [attributes, setAttributes] = useState<Attributes>({});
  const [sizes, setSizes] = useState('');
  const [colours, setColours] = useState('');
  const [serialText, setSerialText] = useState('');
  const [image, setImage] = useState('');
  const tracked = attributes.imeiTracking === true;
  const wasTracked = product?.attributes?.imeiTracking === true;

  useEffect(() => {
    if (!open) return;
    reset(defaults(product));
    setNoStock(product ? product.isSelfProduct : cfg.noStockDefault);
    setLoose(product?.allowDecimalQty ?? inHouse);
    setOptions(product?.options ?? []);
    setAddons(product?.addons ?? []);
    setAttributes(product?.attributes ?? {});
    setSizes('');
    setColours('');
    setSerialText('');
    setImage(product?.image ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product, reset]);

  const list = (text: string) => Array.from(new Set(text.split(',').map((x) => sanitizeText(x, 30)).filter(Boolean)));
  const [sizeCount, colourCount] = [list(sizes).length, list(colours).length];
  const variantCount = f.variants && !product && (sizeCount || colourCount) ? Math.max(sizeCount, 1) * Math.max(colourCount, 1) : 0;

  const save = useAppMutation(
    (v: Values) => {
      const cleanOptions = options.filter((o) => o.name.trim()).map((o) => ({ name: sanitizeText(o.name, 40), price: Number(o.price) || 0, factor: f.options?.withFactor ? Number(o.factor) || 1 : 1 }));
      const cleanAddons = addons
        .filter((a) => a.productId || a.name.trim())
        .map((a) => ({ name: sanitizeText(a.name, 40), price: Number(a.price) || 0, cost: Number(a.cost) || 0, ...(a.productId ? { productId: a.productId } : {}) }));
      if (cleanAddons.some((a) => a.price <= 0)) throw new Error('Give each add-on a price.');
      if (cleanOptions.some((o) => o.price <= 0)) throw new Error(`Each ${f.options?.label.toLowerCase() ?? 'option'} needs a price.`);
      if (!loose && !inHouse && (v.stock % 1 !== 0 || v.minStock % 1 !== 0)) throw new Error('Stock must be a whole number unless the item is sold loose.');
      const data: ProductInput = {
        name: sanitizeText(v.name, 120),
        sku: v.sku.toUpperCase(),
        barcode: v.barcode,
        category: sanitizeText(v.category, 60),
        brand: sanitizeText(v.brand, 60),
        unit: v.unit,
        purchasePrice: v.purchasePrice,
        sellingPrice: inHouse ? 0 : v.sellingPrice,
        mrp: f.mrp && !inHouse ? v.mrp : 0,
        tradePrice: f.tradePrice && !inHouse ? v.tradePrice : 0,
        gstRate: Number(v.gstRate),
        hsn: v.hsn,
        stock: noStock && !tracked && !inHouse ? 0 : v.stock,
        minStock: noStock && !tracked && !inHouse ? 0 : v.minStock,
        supplier: v.supplier,
        expiryDate: f.expiry && v.expiryDate ? new Date(v.expiryDate).toISOString() : undefined,
        // In-house items always track stock, in any amount (20 ml, 0.5 kg).
        isSelfProduct: noStock && !tracked && !inHouse,
        allowDecimalQty: (loose || inHouse) && !tracked,
        inHouse,
        options: cleanOptions,
        addons: f.addons ? cleanAddons : [],
        attributes,
        image,
        soldOut: product?.soldOut ?? false,
        status: product?.status ?? 'active',
        warehouse: product?.warehouse ?? 'Main Store',
      };
      const serials = tracked ? parseSerials(serialText) : [];
      if (serials.some((s) => !/^[A-Z0-9/-]{4,30}$/.test(s))) throw new Error('Each IMEI / serial should be 4–30 letters or digits.');
      // Stock of tracked items is the list of IMEI numbers, added once the item is saved.
      const withSerials = (p: Product) => (serials.length ? productsService.addSerials(p.id, serials).then(() => [p]) : Promise.resolve([p]));
      if (product) return productsService.update(product.id, data).then(withSerials);
      if (variantCount > 0) {
        if (tracked) throw new Error('Add IMEI-tracked phones one model at a time, without sizes and colours.');
        return productsService.createVariants({ ...data, sizes: list(sizes), colours: list(colours) });
      }
      return productsService.create(data).then(withSerials);
    },
    {
      invalidate: [qk.products, qk.inventory, ['restaurant'], ...(product ? [qk.serials(product.id)] : [])],
      success: (rows) => (product ? `${rows[0].name} updated` : rows.length > 1 ? `${rows.length} variants added` : `${rows[0].name} added`),
      onSuccess: () => onOpenChange(false),
    },
  );

  const [pp, sp] = [Number(watch('purchasePrice')) || 0, Number(watch('sellingPrice')) || 0];
  const margin = sp > 0 && pp > 0 ? ((sp - pp) / sp) * 100 : null;
  const unit = watch('unit');
  const units = Array.from(new Set([...cfg.units, unit].filter(Boolean)));
  const singular = inHouse ? 'in-house product' : cfg.singular.toLowerCase();

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={product ? `Edit ${singular}` : `Add ${singular}`}
      description={product ? product.sku : inHouse ? 'Used in your salon, not sold — e.g. shampoo for hair wash, wax, facial cream. Services use it up as they are billed.' : cfg.description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
            {product ? 'Save changes' : variantCount > 1 ? `Add ${variantCount} variants` : `Add ${singular}`}
          </Button>
        </>
      }
    >
      <form className="space-y-7" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormSection title="Basic details">
          <FormField label={inHouse ? 'Product name' : `${cfg.singular} name`} error={errors.name?.message} required>
            <Input {...register('name')} placeholder={inHouse ? 'e.g. Salon Shampoo 5L, Rica Wax, Facial Cream' : cfg.namePlaceholder} autoFocus />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category" error={errors.category?.message} required>
              <Input {...register('category')} list="product-categories" placeholder={cfg.categoryPlaceholder} />
            </FormField>
            <FormField label="Unit">
              <NativeSelect {...register('unit')}>{units.map((u) => <option key={u}>{u}</option>)}</NativeSelect>
            </FormField>
            <FormField label="SKU / item code" error={errors.sku?.message} hint={product ? undefined : 'Leave blank to create one automatically.'}>
              <Input {...register('sku')} className="uppercase" placeholder="Auto" />
            </FormField>
            <FormField label="Barcode" error={errors.barcode?.message}>
              <Input {...register('barcode')} placeholder="Scan or type" />
            </FormField>
            <FormField label="Brand">
              <Input {...register('brand')} placeholder="Brand name" />
            </FormField>
            <FormField label="Supplier">
              <NativeSelect {...register('supplier')}>
                <option value="">No default supplier</option>
                {vendors?.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
              </NativeSelect>
            </FormField>
          </div>
          <datalist id="product-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </FormSection>

        <FormSection title={`${cfg.singular} picture`}>
          <ProductImagePicker value={image} onChange={setImage} name={watch('name') ?? ''} library={libraryFor(businessType)} />
        </FormSection>

        {cfg.fields.length > 0 && (
          <FormSection title="Details">
            <AttributeFields fields={cfg.fields} value={attributes} onChange={setAttributes} />
          </FormSection>
        )}

        {inHouse ? (
          <FormSection title="Cost" description={`What one ${unit.toLowerCase()} costs you. Used to work out what each service costs in products.`}>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label={`Cost per ${unit} (₹)`} error={errors.purchasePrice?.message}>
                <Input {...register('purchasePrice')} inputMode="decimal" />
              </FormField>
            </div>
          </FormSection>
        ) : (
        <FormSection title="Pricing & tax" description={margin !== null ? `Margin ${margin.toFixed(1)}% · ${formatINR(sp - pp)} per ${unit.toLowerCase()}` : 'Prices are before GST.'}>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Selling price (₹)" error={errors.sellingPrice?.message} required>
              <Input {...register('sellingPrice')} inputMode="decimal" />
            </FormField>
            <FormField label="Purchase / cost price (₹)" error={errors.purchasePrice?.message}>
              <Input {...register('purchasePrice')} inputMode="decimal" />
            </FormField>
            {f.mrp && (
              <FormField label="MRP (₹)" error={errors.mrp?.message}>
                <Input {...register('mrp')} inputMode="decimal" />
              </FormField>
            )}
            {f.tradePrice && (
              <FormField label="Trade price (₹)" error={errors.tradePrice?.message} hint="For contractors / wholesale bills. 0 = same as selling price.">
                <Input {...register('tradePrice')} inputMode="decimal" />
              </FormField>
            )}
            <FormField label="GST rate">
              <NativeSelect {...register('gstRate')}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</NativeSelect>
            </FormField>
            <FormField label="HSN / SAC code" error={errors.hsn?.message}>
              <Input {...register('hsn')} inputMode="numeric" placeholder="Optional" />
            </FormField>
          </div>
        </FormSection>
        )}

        {f.options && !inHouse && (
          <FormSection title={f.options.label} description={f.options.hint}>
            <RowsEditor
              rows={options}
              onChange={setOptions}
              blank={{ name: '', price: 0, factor: 1 }}
              addLabel={`Add ${f.options.label.toLowerCase().replace(/s$/, '')}`}
              render={(row, set) => (
                <>
                  <Input value={row.name} onChange={(e) => set({ ...row, name: e.target.value })} placeholder={f.options!.namePlaceholder} aria-label="Name" />
                  <Input value={row.price || ''} onChange={(e) => set({ ...row, price: Number(e.target.value.replace(/[^\d.]/g, '')) })} placeholder="Price ₹" inputMode="decimal" aria-label="Price" className="w-28" />
                  {f.options!.withFactor && (
                    <Input value={row.factor || ''} onChange={(e) => set({ ...row, factor: Number(e.target.value.replace(/[^\d.]/g, '')) })} placeholder={`${unit} used`} inputMode="decimal" aria-label={`${unit} used from stock`} className="w-28" title={`How many ${unit} this uses from stock`} />
                  )}
                </>
              )}
            />
          </FormSection>
        )}

        {f.addons && (
          <FormSection title="Add-ons" description="Extras customers can add — type your own (extra chicken) or pick from your menu (Coke).">
            <AddonsEditor value={addons} onChange={setAddons} productId={product?.id} />
          </FormSection>
        )}

        {f.variants && !product && (
          <FormSection title="Sizes & colours" description="Creates one item per size × colour, each with its own stock and barcode. Leave empty for a single item.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Sizes" hint="Comma separated, e.g. S, M, L, XL">
                <Input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" />
              </FormField>
              <FormField label="Colours" hint="Comma separated, e.g. Red, Blue">
                <Input value={colours} onChange={(e) => setColours(e.target.value)} placeholder="Red, Blue" />
              </FormField>
            </div>
            {variantCount > 1 && <p className="text-xs text-muted-foreground">{variantCount} items will be created. Opening stock below applies to each.</p>}
          </FormSection>
        )}

        {tracked ? (
          <FormSection
            title="IMEI / serial numbers"
            description={
              product && !wasTracked && product.stock > 0
                ? `Stock will follow the IMEI list. Enter the numbers of the ${product.stock} pieces you have now.`
                : 'Stock is the number of IMEI / serial numbers in stock. Purchases add them on receipt; each sale records which unit was sold.'
            }
          >
            {product && wasTracked && <SerialsList product={product} />}
            <FormField label={product ? 'Add pieces' : 'Opening stock'} hint={`One per line or comma separated · ${parseSerials(serialText).length} entered`}>
              <Textarea value={serialText} onChange={(e) => setSerialText(e.target.value.toUpperCase())} rows={3} placeholder={'356789012345678\n356789012345679'} className="font-mono" />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={`Minimum stock (${unit})`} error={errors.minStock?.message} hint="You'll get a low stock alert at this level.">
                <Input {...register('minStock')} inputMode="numeric" />
              </FormField>
            </div>
          </FormSection>
        ) : (
        <FormSection title="Stock" description={inHouse ? `Tip: use a small unit like ml or gram so services can say exactly how much they use.` : undefined}>
          {!inHouse && (
            <SwitchRow
              title="Don't track stock"
              description={businessType === 'restaurant' ? 'For dishes made to order. Stock items like bottled drinks should keep tracking on.' : 'For items made to order or always available.'}
              checked={noStock}
              onChange={setNoStock}
            />
          )}
          {f.looseSale && !inHouse && <SwitchRow title="Sold loose" description={`Allow quantities like 1.5 or 0.25 ${unit.toLowerCase()}.`} checked={loose} onChange={setLoose} />}
          {(!noStock || inHouse) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={product ? `${inHouse ? 'Amount left' : 'Current stock'} (${unit})` : `${inHouse ? 'Amount you have' : 'Opening stock'} (${unit})`} error={errors.stock?.message}>
                <Input {...register('stock')} inputMode="decimal" />
              </FormField>
              <FormField label={`Minimum stock (${unit})`} error={errors.minStock?.message} hint="You'll get a low stock alert at this level.">
                <Input {...register('minStock')} inputMode="decimal" />
              </FormField>
            </div>
          )}
          {f.expiry && (
            <FormField label="Expiry date" className="sm:max-w-xs">
              <DatePicker value={watch('expiryDate')} onChange={(d) => setValue('expiryDate', d)} />
            </FormField>
          )}
        </FormSection>
        )}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

const parseSerials = (text: string) => Array.from(new Set(text.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)));

/** Units of an IMEI-tracked product: what's in stock (removable) and what was sold. */
function SerialsList({ product }: { product: Product }) {
  const { data, isLoading } = useQuery({ queryKey: qk.serials(product.id), queryFn: () => productsService.serials(product.id) });
  const remove = useAppMutation((serialId: string) => productsService.removeSerial(product.id, serialId), {
    invalidate: [qk.serials(product.id), qk.products, qk.inventory],
    success: 'Removed from stock',
  });
  const inStock = (data ?? []).filter((s) => s.status === 'in_stock');
  const sold = (data ?? []).filter((s) => s.status === 'sold');
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading IMEI numbers…</p>;
  return (
    <div className="rounded-xl border border-border">
      <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">{inStock.length} in stock · {sold.length} sold</p>
      <ul className="max-h-56 divide-y divide-border overflow-y-auto text-[13px]">
        {inStock.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className="flex-1 font-mono">{s.serial}</span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove.mutate(s.id)} aria-label={`Remove ${s.serial} from stock`} title="Remove from stock (damaged, lost, returned)"><Trash2 /></Button>
          </li>
        ))}
        {sold.slice(0, 50).map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground">
            <span className="flex-1 font-mono">{s.serial}</span>
            <span className="text-2xs">{s.invoiceNo} · {s.customerName}{s.warrantyUntil ? ` · warranty till ${formatDate(s.warrantyUntil)}` : ''}</span>
          </li>
        ))}
        {!data?.length && <li className="px-3 py-2 text-xs text-muted-foreground">No numbers yet.</li>}
      </ul>
    </div>
  );
}

function SwitchRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-3.5">
      <span>
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </label>
  );
}

function RowsEditor<T>({ rows, onChange, blank, addLabel, render }: { rows: T[]; onChange: (rows: T[]) => void; blank: T; addLabel: string; render: (row: T, set: (row: T) => void) => ReactNode }) {
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          {render(row, (next) => onChange(rows.map((r, j) => (j === i ? next : r))))}
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove">
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="soft" size="sm" onClick={() => (rows.length >= 20 ? toast.error('Up to 20 rows') : onChange([...rows, { ...blank }]))}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}
