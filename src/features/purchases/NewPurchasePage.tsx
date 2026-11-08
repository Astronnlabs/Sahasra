import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { qk, useAppMutation, useProducts, useVendors } from '@/hooks/queries';
import { amountInWords, formatINR } from '@/lib/format';
import { purchasesService } from '@/services';
import { collectSerials, PurchaseSerials, serialNeeds } from './PurchaseSerials';

const lineSchema = z.object({
  productId: z.string().min(1, 'Choose a product'),
  qty: z.coerce.number().positive('Qty > 0'),
  rate: z.coerce.number().min(0),
  gstRate: z.coerce.number(),
  discount: z.coerce.number().min(0),
});

const schema = z.object({
  vendorId: z.string().min(1, 'Choose a vendor'),
  billNo: z.string().trim().min(2, 'Enter the vendor invoice number').max(30),
  date: z.string().min(1, 'Pick a date'),
  status: z.enum(['received', 'ordered']),
  lines: z.array(lineSchema).min(1, 'Add at least one item'),
  notes: z.string().max(300).optional(),
});
type Values = z.infer<typeof schema>;

const blankLine = { productId: '', qty: 1, rate: 0, gstRate: 18, discount: 0 };

export function NewPurchasePage() {
  const navigate = useNavigate();
  const { data: vendors } = useVendors();
  const { data: products } = useProducts();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { vendorId: '', billNo: '', date: new Date().toISOString().slice(0, 10), status: 'received', lines: [blankLine], notes: '' },
  });
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = watch('lines');
  const [serialText, setSerialText] = useState<Record<string, string>>({});
  const needs = serialNeeds(lines, products);

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    lines.forEach((l) => {
      const gross = (Number(l.qty) || 0) * (Number(l.rate) || 0);
      const d = Number(l.discount) || 0;
      subtotal += gross;
      discount += d;
      tax += ((gross - d) * (Number(l.gstRate) || 0)) / 100;
    });
    return { subtotal, discount, tax, total: Math.round(subtotal - discount + tax) };
  }, [lines]);

  const save = useAppMutation(
    (v: Values) => {
      const items = v.lines.map((l) => {
        const p = products?.find((x) => x.id === l.productId);
        return { productId: l.productId, name: p?.name ?? 'Item', sku: p?.sku, hsn: p?.hsn, qty: l.qty, rate: l.rate, discount: l.discount, gstRate: l.gstRate };
      });
      const serials = v.status === 'received' ? collectSerials(needs, serialText) : {};
      // Totals are recomputed on the server; stock and payables update when goods are received.
      return purchasesService.record({
        serials,
        billNo: v.billNo,
        vendorId: v.vendorId,
        date: new Date(v.date).toISOString(),
        items,
        status: v.status,
        notes: v.notes || undefined,
      });
    },
    { invalidate: [qk.purchases, qk.vendors, qk.products, qk.inventory, ['dashboard']], success: (p) => `Purchase ${p.billNo} saved`, onSuccess: () => navigate('/purchases') },
  );

  const pickProduct = (index: number, productId: string) => {
    const p = products?.find((x) => x.id === productId);
    setValue(`lines.${index}.productId`, productId, { shouldValidate: true });
    if (p) {
      setValue(`lines.${index}.rate`, p.purchasePrice);
      setValue(`lines.${index}.gstRate`, p.gstRate);
    }
  };

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
      <PageHeader
        title="New purchase"
        description="Record a vendor bill. Stock updates when goods are received."
        back={{ to: '/purchases', label: 'Purchases' }}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/purchases')}>Cancel</Button>
            <Button type="submit" loading={save.isPending}><Save /> Save purchase</Button>
          </>
        }
      />

      {vendors && products && (vendors.length === 0 || products.length === 0) && (
        <div className="mb-5 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-[13px]">
          Before recording a purchase, add {vendors.length === 0 && <Link to="/vendors" className="font-semibold text-primary underline">a vendor</Link>}
          {vendors.length === 0 && products.length === 0 && ' and '}
          {products.length === 0 && <Link to="/products?new=1" className="font-semibold text-primary underline">your products</Link>}.
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Bill details" />
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Vendor" error={errors.vendorId?.message} required className="lg:col-span-2">
                <NativeSelect {...register('vendorId')}>
                  <option value="">Select vendor</option>
                  {vendors?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </NativeSelect>
              </FormField>
              <FormField label="Invoice number" error={errors.billNo?.message} required>
                <Input {...register('billNo')} placeholder="PB/26-0613" />
              </FormField>
              <FormField label="Date" error={errors.date?.message} required>
                <DatePicker value={watch('date')} onChange={(d) => setValue('date', d)} />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Items" description={errors.lines?.message ?? errors.lines?.root?.message} />
            <CardContent className="space-y-3">
              <div className="hidden grid-cols-[1fr_80px_110px_90px_100px_110px_36px] gap-2 px-1 text-2xs font-semibold uppercase tracking-wider text-subtle lg:grid">
                <span>Product</span><span className="text-right">Qty</span><span className="text-right">Rate (₹)</span><span>GST</span><span className="text-right">Discount</span><span className="text-right">Total</span><span />
              </div>
              {fields.map((field, i) => {
                const l = lines[i];
                const lineTotal = l ? ((Number(l.qty) || 0) * (Number(l.rate) || 0) - (Number(l.discount) || 0)) * (1 + (Number(l.gstRate) || 0) / 100) : 0;
                const err = errors.lines?.[i];
                return (
                  <div key={field.id} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 lg:grid-cols-[1fr_80px_110px_90px_100px_110px_36px] lg:items-start lg:border-0 lg:p-0">
                    <div className="col-span-2 lg:col-span-1">
                      <NativeSelect value={l?.productId ?? ''} onChange={(e) => pickProduct(i, e.target.value)} aria-label="Product" aria-invalid={!!err?.productId}>
                        <option value="">Select product</option>
                        {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </NativeSelect>
                      {err?.productId && <p className="mt-1 text-xs text-danger">{err.productId.message}</p>}
                    </div>
                    <Input {...register(`lines.${i}.qty`)} inputMode="decimal" className="tabular text-right" aria-label="Quantity" aria-invalid={!!err?.qty} />
                    <Input {...register(`lines.${i}.rate`)} inputMode="decimal" className="tabular text-right" aria-label="Rate" />
                    <NativeSelect {...register(`lines.${i}.gstRate`)} aria-label="GST rate">
                      {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
                    </NativeSelect>
                    <Input {...register(`lines.${i}.discount`)} inputMode="decimal" className="tabular text-right" aria-label="Discount amount" />
                    <span className="tabular flex h-9 items-center justify-end text-[13px] font-semibold">{formatINR(lineTotal, true)}</span>
                    <Button variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length === 1} aria-label="Remove line">
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
              <Button variant="soft" size="sm" onClick={() => append(blankLine)}>
                <Plus /> Add item
              </Button>
            </CardContent>
          </Card>

          {needs.length > 0 && watch('status') === 'received' && (
            <Card>
              <CardHeader title="IMEI / serial numbers" description="Each piece received enters stock by its number." />
              <CardContent>
                <PurchaseSerials needs={needs} value={serialText} onChange={setSerialText} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="xl:sticky xl:top-24">
            <CardHeader title="Summary" />
            <CardContent className="space-y-4">
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{formatINR(totals.subtotal, true)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular text-success">− {formatINR(totals.discount, true)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">GST (input credit)</dt><dd className="tabular">{formatINR(totals.tax, true)}</dd></div>
                <div className="flex justify-between border-t border-dashed border-border pt-2.5 text-base font-semibold"><dt>Total</dt><dd className="tabular text-primary">{formatINR(totals.total)}</dd></div>
              </dl>
              <p className="rounded-lg bg-surface px-3 py-2 text-2xs text-muted-foreground">{amountInWords(totals.total)}</p>
              <FormField label="Status">
                <NativeSelect {...register('status')}>
                  <option value="received">Goods received — update stock now</option>
                  <option value="ordered">Ordered — awaiting delivery</option>
                </NativeSelect>
              </FormField>
              <FormField label="Notes">
                <Textarea {...register('notes')} rows={3} placeholder="Transport, terms, remarks…" />
              </FormField>
              <Button type="submit" className="w-full" loading={save.isPending}><Save /> Save purchase</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
