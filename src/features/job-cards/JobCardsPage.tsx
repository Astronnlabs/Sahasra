import { useQuery } from '@tanstack/react-query';
import { Ban, CheckCircle2, MessageCircle, Package as PackageIcon, Pencil, Play, Plus, Printer, ReceiptText, Search, ShieldCheck, Sparkles, Trash2, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { industryConfig, jobsConfig, type JobsConfig } from '@/app/config/industry';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Drawer, Modal } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttributeFields, type Attributes } from '@/features/products/AttributeFields';
import { useInvoicePrinter } from '@/features/sales/useInvoicePrinter';
import { qk, useAppMutation, useCustomers, useEmployees, useProducts } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { openWhatsApp, printHtml } from '@/lib/share';
import { cn } from '@/lib/utils';
import { catalogServicesService, jobCardsService, productsService } from '@/services';
import type { JobCard, JobLine, JobStatus, Product, Tone } from '@/types';

const TONE: Record<JobStatus, Tone> = { received: 'info', in_progress: 'warning', ready: 'success', delivered: 'neutral', cancelled: 'danger' };
const OPEN: JobStatus[] = ['received', 'in_progress', 'ready'];
const PAY_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
] as const;
type PayMethod = (typeof PAY_METHODS)[number]['value'];

const isTracked = (p?: Product) => (p?.attributes as Record<string, unknown> | undefined)?.imeiTracking === true;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function JobStatusBadge({ status, cfg }: { status: JobStatus; cfg: JobsConfig }) {
  return <Badge tone={TONE[status]} dot>{cfg.statusLabels[status]}</Badge>;
}

/** Products and services that can go on a job, with their current price and GST. */
function useCatalog() {
  const { data: products } = useProducts();
  const { data: services } = useQuery({ queryKey: qk.services, queryFn: catalogServicesService.list });
  return useMemo(
    () => [
      ...(products ?? []).filter((p) => p.status === 'active').map((p) => ({ kind: 'product' as const, refId: p.id, name: p.name, price: p.sellingPrice, gstRate: p.gstRate, hint: p.category, product: p })),
      ...(services ?? []).filter((s) => s.status === 'active').map((s) => ({ kind: 'service' as const, refId: s.id, name: s.name, price: s.price, gstRate: s.gstRate, hint: s.category, product: undefined })),
    ],
    [products, services],
  );
}
type CatalogEntry = ReturnType<typeof useCatalog>[number];

/** Approximate bill for the lines at today's prices (the server prices the final invoice). */
function estimateLines(lines: JobLine[], catalog: CatalogEntry[]) {
  let taxable = 0;
  let tax = 0;
  for (const l of lines) {
    const c = l.refId ? catalog.find((x) => x.refId === l.refId) : undefined;
    const rate = l.kind === 'custom' ? (l.rate ?? 0) : (c?.price ?? 0);
    const gst = l.kind === 'custom' ? (l.gstRate ?? 0) : (c?.gstRate ?? 0);
    taxable += rate * l.qty;
    tax += (rate * l.qty * gst) / 100;
  }
  return { taxable, total: Math.round((taxable + tax) * 100) / 100 };
}

function printSlip(j: JobCard, cfg: JobsConfig, business: string, phone: string) {
  const row = (label: string, value: string) => (value ? `<tr><td class="muted">${esc(label)}</td><td>${esc(value)}</td></tr>` : '');
  const details = cfg.details
    .map((f) => (j.details[f.key] ? `<td><span class="muted">${esc(f.label)}</span><br><b>${esc(j.details[f.key])}</b></td>` : ''))
    .filter(Boolean);
  const grid: string[] = [];
  for (let i = 0; i < details.length; i += 4) grid.push(`<tr>${details.slice(i, i + 4).join('')}</tr>`);
  // Printed from this page (no pop-up), so it also works on phones and in the Android app.
  printHtml(
    `<h1>${esc(business)}</h1><p class="muted">${esc(phone)}</p>
<p>${esc(cfg.singular)} <span class="no">${esc(j.number)}</span><br><span class="muted">Received ${esc(formatDate(j.createdAt))}${j.promisedAt ? ` · Promised ${esc(formatDate(j.promisedAt))}` : ''}</span></p>
<table>${row('Customer', `${j.customerName}${j.phone ? ` · ${j.phone}` : ''}`)}${row(cfg.itemLabel, j.item)}${row(cfg.identifierLabel, j.identifier)}${row(cfg.problemLabel, j.problem)}${row('Estimate', j.estimate ? formatINR(j.estimate) : '')}${row('Advance paid', j.advance ? formatINR(j.advance) : '')}${row('Balance (approx.)', j.estimate ? formatINR(j.balance) : '')}</table>
${grid.length ? `<h2>${esc(cfg.detailsTitle)}</h2><table>${grid.join('')}</table>` : ''}
<div class="box">Please bring this slip when collecting. The estimate may change after inspection; we will call you before doing extra work. Items not collected within 60 days of the promised date are not our responsibility.</div>
<p style="margin-top:36px" class="muted">Customer signature ____________________ &nbsp;&nbsp; For ${esc(business)} ____________________</p>`,
    '.print-doc{font-family:system-ui,sans-serif;color:#171522;padding:28px;max-width:680px;margin:auto;background:#fff}.print-doc h1{font-size:20px;margin:0}.print-doc h2{font-size:14px;margin:20px 0 6px}.print-doc table{width:100%;border-collapse:collapse}.print-doc td{padding:6px 4px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top}.print-doc .muted{color:#6F6B78;font-size:12px}.print-doc .no{font-size:22px;font-weight:700;color:#6D3DE8}.print-doc .box{border:1px dashed #bbb;border-radius:8px;padding:10px;margin-top:16px;font-size:12px}',
    j.number,
  );
}

function LinesEditor({ lines, onChange, catalog }: { lines: JobLine[]; onChange: (l: JobLine[]) => void; catalog: CatalogEntry[] }) {
  const { businessType } = useWorkspace();
  const ind = industryConfig(businessType);
  const [q, setQ] = useState('');
  const matches = q.trim() ? catalog.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const set = (i: number, patch: Partial<JobLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <section>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Add from ${ind.goods.title.toLowerCase()} or ${ind.services.title.toLowerCase()}`} className="pl-9" />
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-pop">
              {matches.map((m) => (
                <li key={m.refId}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...lines, { kind: m.kind, refId: m.refId, name: m.name, qty: 1 }]);
                      setQ('');
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface"
                  >
                    {m.kind === 'service' ? <Sparkles className="h-4 w-4 text-primary" /> : <PackageIcon className="h-4 w-4 text-primary" />}
                    <span className="min-w-0 flex-1 truncate">{m.name} <span className="text-2xs text-subtle">· {m.hint}</span></span>
                    <span className="tabular text-muted-foreground">{formatINR(m.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="button" variant="secondary" onClick={() => onChange([...lines, { kind: 'custom', name: '', qty: 1, rate: 0, gstRate: 18 }])}>
          <Plus /> Custom charge
        </Button>
      </div>
      <ul className="mt-3 space-y-2">
        {lines.map((l, i) => {
          const c = l.refId ? catalog.find((x) => x.refId === l.refId) : undefined;
          return (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2">
              {l.kind === 'service' ? <Sparkles className="h-4 w-4 shrink-0 text-primary" /> : l.kind === 'product' ? <PackageIcon className="h-4 w-4 shrink-0 text-primary" /> : <Wrench className="h-4 w-4 shrink-0 text-primary" />}
              {l.kind === 'custom' ? (
                <Input value={l.name} onChange={(e) => set(i, { name: sanitizeText(e.target.value, 120) })} placeholder="e.g. Labour charge" className="h-8 min-w-[140px] flex-1" aria-label="Charge name" />
              ) : (
                <span className="min-w-0 flex-1 truncate text-[13px]">{l.name}</span>
              )}
              <Input value={String(l.qty)} onChange={(e) => set(i, { qty: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} inputMode="decimal" className="h-8 w-16 text-center" aria-label="Quantity" />
              {l.kind === 'custom' ? (
                <>
                  <Input value={l.rate ? String(l.rate) : ''} onChange={(e) => set(i, { rate: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} inputMode="decimal" placeholder="₹" className="h-8 w-24 text-right" aria-label="Price" />
                  <NativeSelect value={String(l.gstRate ?? 18)} onChange={(e) => set(i, { gstRate: Number(e.target.value) })} className="h-8 w-24" aria-label="GST">
                    {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>GST {g}%</option>)}
                  </NativeSelect>
                </>
              ) : (
                <span className="tabular w-24 text-right text-xs text-muted-foreground">{formatINR((c?.price ?? 0) * l.qty)}</span>
              )}
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Lookup by IMEI / serial: shows when and to whom a unit was sold, and its warranty. */
function SerialHint({ value }: { value: string }) {
  const q = value.trim().toUpperCase();
  const { data } = useQuery({ queryKey: ['serial-lookup', q], queryFn: () => productsService.lookupSerial(q), enabled: q.length >= 6, staleTime: 60_000 });
  if (!data) return null;
  return (
    <p className={cn('mt-1.5 rounded-lg px-3 py-2 text-xs', data.underWarranty ? 'bg-success-soft text-success' : 'bg-surface text-muted-foreground')}>
      <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
      {data.productName}
      {data.invoiceNo ? ` · sold on ${data.invoiceNo}${data.soldAt ? ` (${formatDate(data.soldAt)})` : ''}${data.customerName ? ` to ${data.customerName}` : ''}` : ' · in stock'}
      {data.warrantyUntil ? ` · ${data.underWarranty ? 'under warranty till' : 'warranty ended'} ${formatDate(data.warrantyUntil)}` : ''}
    </p>
  );
}

const toAttrs = (d: Record<string, string>): Attributes => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === 'Yes' ? true : v]));
const fromAttrs = (a: Attributes): Record<string, string> =>
  Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null && v !== '' && v !== false).map(([k, v]) => [k, v === true ? 'Yes' : String(v)]));

function JobDrawer({ open, onOpenChange, job, cfg }: { open: boolean; onOpenChange: (o: boolean) => void; job: JobCard | null; cfg: JobsConfig }) {
  const catalog = useCatalog();
  const { data: customers } = useCustomers();
  const { data: employees } = useEmployees();
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [item, setItem] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [problem, setProblem] = useState('');
  const [details, setDetails] = useState<Attributes>({});
  const [estimate, setEstimate] = useState('');
  const [advance, setAdvance] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<PayMethod>('cash');
  const [assignedTo, setAssignedTo] = useState('');
  const [promisedAt, setPromisedAt] = useState('');
  const [lines, setLines] = useState<JobLine[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setCustomerName(job?.customerName ?? '');
    setPhone(job?.phone ?? '');
    setItem(job?.item ?? '');
    setIdentifier(job?.identifier ?? '');
    setProblem(job?.problem ?? '');
    setDetails(toAttrs(job?.details ?? {}));
    setEstimate(job?.estimate ? String(job.estimate) : '');
    setAdvance('');
    setAdvanceMethod('cash');
    setAssignedTo(job?.assignedTo ?? '');
    setPromisedAt(job?.promisedAt ? job.promisedAt.slice(0, 10) : '');
    setLines(job?.lines ?? []);
    setNotes(job?.notes ?? '');
  }, [open, job]);

  const digits = phone.replace(/\D/g, '').slice(-10);
  const linked = digits.length === 10 ? customers?.find((c) => c.phone.replace(/\D/g, '').slice(-10) === digits) : undefined;
  const partsTotal = estimateLines(lines, catalog).total;

  const save = useAppMutation(
    () => {
      if (sanitizeText(customerName, 80).length < 2) throw new Error('Enter the customer name.');
      if (sanitizeText(item, 120).length < 2) throw new Error(`Enter the ${cfg.itemLabel.toLowerCase()}.`);
      if (lines.some((l) => l.kind === 'custom' && (!l.name.trim() || !(l.rate! > 0)))) throw new Error('Give each custom charge a name and price.');
      if (lines.some((l) => !(l.qty > 0))) throw new Error('Quantities must be more than 0.');
      const data = {
        kind: cfg.kind,
        customerId: linked?.id ?? null,
        customerName: sanitizeText(customerName, 80),
        phone: digits,
        item: sanitizeText(item, 120),
        identifier: sanitizeText(identifier, 40),
        problem: sanitizeText(problem, 1000),
        details: fromAttrs(details),
        estimate: Number(estimate) || 0,
        assignedTo,
        promisedAt: promisedAt || null,
        lines,
        notes: sanitizeText(notes, 1000),
      };
      return job ? jobCardsService.update(job.id, data) : jobCardsService.create({ ...data, advance: Number(advance) || 0, advanceMethod });
    },
    { invalidate: [qk.jobCards], success: (j) => (job ? `${j.number} saved` : `${j.number} created`), onSuccess: () => onOpenChange(false) },
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={job ? `Edit ${job.number}` : `New ${cfg.singular.toLowerCase()}`}
      description={cfg.description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>Save</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Customer name" required>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoFocus />
          </FormField>
          <FormField label="Phone" hint={linked ? `Linked to saved customer ${linked.name}` : undefined}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))} inputMode="tel" placeholder="10-digit mobile" />
          </FormField>
          <FormField label={cfg.itemLabel} required>
            <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder={cfg.itemPlaceholder} />
          </FormField>
          <FormField label={cfg.identifierLabel}>
            <div>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              {cfg.kind === 'repair' && <SerialHint value={identifier} />}
            </div>
          </FormField>
        </div>
        <FormField label={cfg.problemLabel}>
          <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={2} placeholder={cfg.problemPlaceholder} />
        </FormField>

        {cfg.details.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-medium">{cfg.detailsTitle}</p>
            <AttributeFields fields={cfg.details} value={details} onChange={setDetails} />
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Promised date">
            <DatePicker value={promisedAt} onChange={setPromisedAt} placeholder="Not set" />
          </FormField>
          <FormField label="Assigned to">
            <NativeSelect value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Not assigned</option>
              {(employees ?? []).filter((e) => e.status !== 'inactive').map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
            </NativeSelect>
          </FormField>
          <FormField label="Estimate (₹)" hint={partsTotal > 0 ? `Items below come to about ${formatINR(partsTotal)} incl. GST` : 'What you told the customer'}>
            <Input value={estimate} onChange={(e) => setEstimate(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
          </FormField>
          {!job && (
            <FormField label="Advance received (₹)">
              <div className="flex gap-2">
                <Input value={advance} onChange={(e) => setAdvance(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="0" />
                <NativeSelect value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value as PayMethod)} className="w-32" aria-label="Advance paid by">
                  {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </NativeSelect>
              </div>
            </FormField>
          )}
        </div>

        <section>
          <p className="mb-1 text-xs font-medium">Parts & labour to bill</p>
          <p className="mb-2 text-xs text-muted-foreground">Add these now or when the work is done. They become the invoice on delivery.</p>
          <LinesEditor lines={lines} onChange={setLines} catalog={catalog} />
        </section>

        <FormField label="Internal notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </FormField>
      </div>
    </Drawer>
  );
}

function DeliverModal({ job, onOpenChange, cfg }: { job: JobCard | null; onOpenChange: (o: boolean) => void; cfg: JobsConfig }) {
  const catalog = useCatalog();
  const printer = useInvoicePrinter();
  const [payment, setPayment] = useState<PayMethod | 'credit'>('cash');
  const [discount, setDiscount] = useState('');
  const [serials, setSerials] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setPayment('cash');
    setDiscount('');
    setSerials({});
  }, [job]);

  const tracked = (job?.lines ?? []).filter((l) => l.kind === 'product' && isTracked(catalog.find((c) => c.refId === l.refId)?.product));
  const { total } = estimateLines(job?.lines ?? [], catalog);
  const approx = Math.max(0, total - (Number(discount) || 0));
  const balance = Math.max(0, approx - (job?.advance ?? 0));

  const deliver = useAppMutation(
    () => {
      for (const l of tracked) {
        const list = (serials[l.refId!] ?? []).map((s) => s.trim()).filter(Boolean);
        if (list.length !== l.qty) throw new Error(`Enter ${l.qty} IMEI / serial number${l.qty === 1 ? '' : 's'} for ${l.name}.`);
      }
      return jobCardsService.deliver(job!.id, { payment, discount: Number(discount) || 0, serials });
    },
    {
      invalidate: [qk.jobCards, qk.sales, qk.products, qk.customers, qk.inventory],
      success: (r) => `Delivered · invoice ${r.sale.invoiceNo}`,
      onSuccess: (r) => {
        onOpenChange(false);
        printer.print(r.sale);
      },
    },
  );

  return (
    <>
      <Modal
        open={!!job}
        onOpenChange={onOpenChange}
        title={job ? `Deliver ${job.number}` : ''}
        description="Creates the invoice for the parts and labour on this card."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => deliver.mutate(undefined)} loading={deliver.isPending}><ReceiptText /> Deliver & bill</Button>
          </>
        }
      >
        {job && (
          <div className="space-y-4">
            <ul className="divide-y divide-border rounded-xl border border-border text-[13px]">
              {job.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 px-3 py-2">
                  <span className="truncate">{l.name} {l.qty !== 1 && <span className="text-muted-foreground">× {l.qty}</span>}</span>
                </li>
              ))}
            </ul>
            {tracked.map((l) => (
              <SerialInputs key={l.refId} line={l} value={serials[l.refId!] ?? []} onChange={(v) => setSerials((s) => ({ ...s, [l.refId!]: v }))} />
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Discount (₹)">
                <Input value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="0" />
              </FormField>
              <FormField label="Balance paid by">
                <NativeSelect value={payment} onChange={(e) => setPayment(e.target.value as PayMethod | 'credit')}>
                  {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  {job.customerId && <option value="credit">Credit (customer owes)</option>}
                </NativeSelect>
              </FormField>
            </div>
            <dl className="space-y-1 rounded-xl bg-surface px-4 py-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">Bill (approx., incl. GST)</dt><dd className="tabular">{formatINR(approx)}</dd></div>
              {job.advance > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Advance already paid</dt><dd className="tabular">− {formatINR(job.advance)}</dd></div>}
              <div className="flex justify-between font-semibold"><dt>{payment === 'credit' ? 'Added to customer dues' : 'Collect now'}</dt><dd className="tabular">{formatINR(balance)}</dd></div>
              {job.advance > approx && <p className="pt-1 text-xs text-warning">The advance is more than the bill — {formatINR(job.advance - approx)} will be recorded as returned to the customer.</p>}
            </dl>
            <p className="text-xs text-muted-foreground">{cfg.statusLabels.delivered} jobs can't be edited. Prices are taken from your catalogue at billing time.</p>
          </div>
        )}
      </Modal>
      {printer.element}
    </>
  );
}

function SerialInputs({ line, value, onChange }: { line: JobLine; value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useQuery({ queryKey: qk.serials(line.refId!), queryFn: () => productsService.serials(line.refId!, 'in_stock') });
  const count = Math.max(1, Math.round(line.qty));
  const listId = `serials-${line.refId}`;
  return (
    <FormField label={`IMEI / serial for ${line.name}`} hint={data ? `${data.length} in stock` : undefined}>
      <div className="space-y-2">
        {Array.from({ length: count }, (_, i) => (
          <Input
            key={i}
            list={listId}
            value={value[i] ?? ''}
            onChange={(e) => {
              const next = [...value];
              next[i] = e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, '');
              onChange(next);
            }}
            placeholder={`Unit ${i + 1}`}
          />
        ))}
        <datalist id={listId}>{(data ?? []).map((s) => <option key={s.id} value={s.serial} />)}</datalist>
      </div>
    </FormField>
  );
}

function JobView({ job, onClose, cfg, onEdit, onDeliver, onCancel }: { job: JobCard | null; onClose: () => void; cfg: JobsConfig; onEdit: (j: JobCard) => void; onDeliver: (j: JobCard) => void; onCancel: (j: JobCard) => void }) {
  const { businessName, phone } = useWorkspace();
  const setStatus = useAppMutation(({ id, status }: { id: string; status: 'received' | 'in_progress' | 'ready' }) => jobCardsService.setStatus(id, status), {
    invalidate: [qk.jobCards],
    success: (j) => `${j.number}: ${cfg.statusLabels[j.status]}`,
    onSuccess: onClose,
  });
  const open = !!job && OPEN.includes(job.status);
  const notifyReady = (j: JobCard) =>
    openWhatsApp(j.phone, `Hello ${j.customerName}, your ${j.item} (${j.number}) is ready for pickup at ${businessName}.${j.estimate ? ` Balance: ${formatINR(j.balance)}.` : ''} Thank you!`);

  return (
    <Drawer
      open={!!job}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={job ? `${job.number} · ${job.item}` : ''}
      description={job ? `${job.customerName}${job.phone ? ` · ${job.phone}` : ''}` : undefined}
      footer={
        job && (
          <>
            <Button variant="secondary" onClick={() => printSlip(job, cfg, businessName, phone)}><Printer /> Slip</Button>
            {job.phone && job.status === 'ready' && <Button variant="secondary" onClick={() => notifyReady(job)}><MessageCircle /> Tell customer</Button>}
            {job.status === 'received' && <Button variant="secondary" onClick={() => setStatus.mutate({ id: job.id, status: 'in_progress' })} loading={setStatus.isPending}><Play /> Start work</Button>}
            {job.status === 'in_progress' && <Button variant="secondary" onClick={() => setStatus.mutate({ id: job.id, status: 'ready' })} loading={setStatus.isPending}><CheckCircle2 /> Mark {cfg.statusLabels.ready.toLowerCase()}</Button>}
            {open && <Button onClick={() => onDeliver(job)}><ReceiptText /> Deliver & bill</Button>}
          </>
        )
      }
    >
      {job && (
        <div className="space-y-5 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} cfg={cfg} />
            {job.invoiceNo && <Badge tone="neutral">Invoice {job.invoiceNo}</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">Received {formatDate(job.createdAt)} by {job.createdBy}</span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {job.identifier && <Item label={cfg.identifierLabel} value={job.identifier} />}
            {job.promisedAt && <Item label="Promised" value={formatDate(job.promisedAt)} />}
            {job.assignedTo && <Item label="Assigned to" value={job.assignedTo} />}
            {job.estimate > 0 && <Item label="Estimate" value={formatINR(job.estimate)} />}
            {job.advance > 0 && <Item label="Advance" value={`${formatINR(job.advance)}${job.advanceMethod ? ` · ${job.advanceMethod.toUpperCase()}` : ''}`} />}
            {job.deliveredAt && <Item label="Delivered" value={formatDate(job.deliveredAt)} />}
          </dl>
          {job.problem && <Item label={cfg.problemLabel} value={job.problem} />}
          {cfg.kind === 'repair' && job.identifier && <SerialHint value={job.identifier} />}
          {Object.keys(job.details).length > 0 && (
            <section>
              <p className="mb-2 text-xs font-medium">{cfg.detailsTitle}</p>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(job.details).map(([k, v]) => (
                  <Item key={k} label={cfg.details.find((f) => f.key === k)?.label ?? k} value={v} />
                ))}
              </dl>
            </section>
          )}
          <section>
            <p className="mb-2 text-xs font-medium">Parts & labour</p>
            {job.lines.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {job.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 px-3 py-2">
                    <span className="truncate">{l.name}{l.qty !== 1 && <span className="text-muted-foreground"> × {l.qty}</span>}</span>
                    {l.kind === 'custom' && <span className="tabular text-muted-foreground">{formatINR((l.rate ?? 0) * l.qty)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing added yet. Edit the card to add parts and labour before delivery.</p>
            )}
          </section>
          {job.notes && <Item label="Notes" value={job.notes} />}
          {open && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="secondary" size="sm" onClick={() => onEdit(job)}><Pencil /> Edit</Button>
              {job.status !== 'received' && <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: job.id, status: job.status === 'ready' ? 'in_progress' : 'received' })}>Move back</Button>}
              <Button variant="ghost" size="sm" className="ml-auto text-danger" onClick={() => onCancel(job)}><Ban /> Cancel job</Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs text-subtle">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

export function JobCardsPage() {
  const { businessType } = useWorkspace();
  const cfg = jobsConfig(businessType);
  const { data, isLoading } = useQuery({ queryKey: qk.jobCards, queryFn: jobCardsService.list });
  const [tab, setTab] = useState<'open' | 'ready' | 'delivered' | 'cancelled' | 'all'>('open');
  const [editing, setEditing] = useState<JobCard | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<JobCard | null>(null);
  const [delivering, setDelivering] = useState<JobCard | null>(null);
  const [cancelling, setCancelling] = useState<JobCard | null>(null);
  const cancel = useAppMutation((id: string) => jobCardsService.setStatus(id, 'cancelled'), {
    invalidate: [qk.jobCards],
    success: (j) => `${j.number} cancelled`,
    onSuccess: () => {
      setCancelling(null);
      setViewing(null);
    },
  });

  // Delivered jobs have an invoice; jobs holding an advance are cancelled first (records the refund).
  const del = useDeleteAction<JobCard>({
    page: 'job-cards',
    name: (j) => j.number,
    remove: (j) => jobCardsService.remove(j.id),
    invalidate: [qk.jobCards],
    hidden: (j) => j.status === 'delivered' || (j.status !== 'cancelled' && j.advance > 0),
    description: (j) => `${j.item} for ${j.customerName}.`,
    onDeleted: () => setViewing(null),
  });

  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []).filter((j) => (tab === 'all' ? true : tab === 'open' ? OPEN.includes(j.status) : j.status === tab));
  const count = (s: typeof tab) => (data ?? []).filter((j) => (s === 'open' ? OPEN.includes(j.status) : j.status === s)).length;

  const columns: Column<JobCard>[] = [
    {
      id: 'number',
      header: cfg.singular,
      hideable: false,
      sortValue: (j) => j.number,
      cell: (j) => (
        <div className="min-w-0">
          <p className="font-medium">{j.number} · {j.item}</p>
          <p className="max-w-[320px] truncate text-2xs text-subtle">{j.problem || j.identifier || '—'}</p>
        </div>
      ),
    },
    { id: 'customer', header: 'Customer', sortValue: (j) => j.customerName, cell: (j) => <div><p>{j.customerName}</p>{j.phone && <p className="text-2xs text-subtle">{j.phone}</p>}</div> },
    {
      id: 'promised',
      header: 'Promised',
      sortValue: (j) => j.promisedAt ?? '9999',
      cell: (j) => (j.promisedAt ? <span className={cn(OPEN.includes(j.status) && j.promisedAt.slice(0, 10) < today && 'font-medium text-danger')}>{formatDate(j.promisedAt)}</span> : '—'),
    },
    { id: 'assigned', header: 'Assigned', hideOnMobile: true, cell: (j) => j.assignedTo || '—' },
    { id: 'advance', header: 'Advance', align: 'right', hideOnMobile: true, cell: (j) => (j.advance ? formatINR(j.advance) : '—') },
    { id: 'status', header: 'Status', cell: (j) => <JobStatusBadge status={j.status} cfg={cfg} /> },
  ];

  const add = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const edit = (j: JobCard) => {
    setViewing(null);
    setEditing(j);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader title={cfg.title} description={cfg.description} actions={<Button onClick={add}><Plus /> New {cfg.singular.toLowerCase()}</Button>} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="open">Open ({count('open')})</TabsTrigger>
          <TabsTrigger value="ready">{cfg.statusLabels.ready} ({count('ready')})</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable
        data={data ? rows : undefined}
        isLoading={isLoading}
        columns={columns}
        getRowId={(j) => j.id}
        searchText={(j) => `${j.number} ${j.item} ${j.identifier} ${j.customerName} ${j.phone} ${j.problem}`}
        searchPlaceholder={`Search by number, customer, phone or ${cfg.identifierLabel.toLowerCase()}`}
        onRowClick={setViewing}
        rowActions={[
          { label: 'Open', icon: Wrench, onSelect: setViewing },
          { label: 'Edit', icon: Pencil, onSelect: edit, hidden: (j) => !OPEN.includes(j.status) },
          { label: 'Deliver & bill', icon: ReceiptText, onSelect: setDelivering, hidden: (j) => !OPEN.includes(j.status) },
          del.action,
        ]}
        empty={<EmptyState icon={Wrench} title={tab === 'open' ? 'No open jobs.' : 'Nothing here.'} description={`Create a ${cfg.singular.toLowerCase()} when a customer hands over work.`} actionLabel={`New ${cfg.singular.toLowerCase()}`} onAction={add} />}
      />
      <JobDrawer open={formOpen} onOpenChange={setFormOpen} job={editing} cfg={cfg} />
      <JobView
        job={viewing}
        onClose={() => setViewing(null)}
        cfg={cfg}
        onEdit={edit}
        onDeliver={(j) => {
          setViewing(null);
          setDelivering(j);
        }}
        onCancel={setCancelling}
      />
      <DeliverModal job={delivering} onOpenChange={(o) => !o && setDelivering(null)} cfg={cfg} />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={`Cancel ${cancelling?.number}?`}
        description={cancelling?.advance ? `The advance of ${formatINR(cancelling.advance)} will be recorded as refunded to ${cancelling.customerName}.` : 'The job will be closed without a bill.'}
        confirmLabel="Cancel job"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
      />
      {del.dialog}
    </>
  );
}
