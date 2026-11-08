import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, isSameMonth, parseISO } from 'date-fns';
import { CalendarClock, CheckCircle2, FileUp, Hourglass, Paperclip, Pencil, Plus, Receipt, Repeat, Trash2, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { DonutChart } from '@/components/charts/Charts';
import { ChartCard } from '@/components/charts/ChartCard';
import { StatCard } from '@/components/common/StatCard';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { qk, useAppMutation } from '@/hooks/queries';
import { formatDate, formatINR, formatINRCompact } from '@/lib/format';
import { isSafeImageFile, sanitizeText } from '@/lib/sanitize';
import { EXPENSE_CATEGORIES, expensesService, uploadsService } from '@/services';
import type { Expense } from '@/types';
import { PAYMENT_LABELS } from '@/features/sales/salesMeta';

const schema = z.object({
  title: z.string().trim().min(2, 'Describe the expense').max(100),
  category: z.enum(EXPENSE_CATEGORIES as [Expense['category'], ...Expense['category'][]]),
  amount: z.coerce.number().positive('Enter an amount'),
  date: z.string().min(1),
  paidTo: z.string().trim().min(2, 'Who was paid?').max(80),
  method: z.enum(['cash', 'upi', 'card', 'bank']),
  status: z.enum(['paid', 'pending']),
  recurring: z.boolean(),
  notes: z.string().max(300).optional(),
});
type Values = z.infer<typeof schema>;

function ExpenseModal({ open, onOpenChange, expense }: { open: boolean; onOpenChange: (o: boolean) => void; expense: Expense | null }) {
  const [receipt, setReceipt] = useState<File | null>(null);
  const [removedReceipt, setRemovedReceipt] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = form;

  useEffect(() => {
    if (!open) return;
    setReceipt(null);
    setRemovedReceipt(false);
    reset({
      title: expense?.title ?? '',
      category: expense?.category ?? 'Miscellaneous',
      amount: expense?.amount ?? 0,
      date: (expense?.date ?? new Date().toISOString()).slice(0, 10),
      paidTo: expense?.paidTo ?? '',
      method: (expense?.method as Values['method']) ?? 'upi',
      status: expense?.status ?? 'paid',
      recurring: expense?.recurring ?? false,
      notes: expense?.notes ?? '',
    });
  }, [open, expense, reset]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!isSafeImageFile(f)) {
      toast.error('Upload a PDF, PNG or JPG under 5 MB.');
      return;
    }
    setReceipt(f);
  };

  const save = useAppMutation(
    async (v: Values) => {
      // Upload the receipt file first, then link it to the expense.
      const receiptUploadId = receipt ? (await uploadsService.upload(receipt, 'receipt')).id : removedReceipt ? null : undefined;
      const data = { ...v, title: sanitizeText(v.title, 100), paidTo: sanitizeText(v.paidTo, 80), notes: v.notes ? sanitizeText(v.notes, 300) : undefined, date: new Date(v.date).toISOString(), receiptUploadId };
      return expense ? expensesService.update(expense.id, data) : expensesService.create(data);
    },
    { invalidate: [qk.expenses, ['dashboard']], success: (e) => `${e.title} saved`, onSuccess: () => onOpenChange(false) },
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={expense ? 'Edit expense' : 'Add expense'}
      description="Track every rupee going out of the business."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>Save expense</Button>
        </>
      }
    >
      <form className="grid gap-4 pb-2 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Expense" error={errors.title?.message} required className="sm:col-span-2">
          <Input {...register('title')} placeholder="e.g. Shop rent — October" autoFocus />
        </FormField>
        <FormField label="Category">
          <NativeSelect {...register('category')}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
        </FormField>
        <FormField label="Amount (₹)" error={errors.amount?.message} required>
          <Input {...register('amount')} inputMode="decimal" />
        </FormField>
        <FormField label="Date">
          <DatePicker value={watch('date')} onChange={(d) => setValue('date', d)} />
        </FormField>
        <FormField label="Paid to" error={errors.paidTo?.message} required>
          <Input {...register('paidTo')} placeholder="Vendor or person" />
        </FormField>
        <FormField label="Payment method">
          <NativeSelect {...register('method')}>{(['cash', 'upi', 'card', 'bank'] as const).map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}</NativeSelect>
        </FormField>
        <FormField label="Status">
          <NativeSelect {...register('status')}><option value="paid">Paid</option><option value="pending">Pending approval</option></NativeSelect>
        </FormField>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-xs font-medium">Receipt</p>
          {receipt || (expense?.receipt && !removedReceipt) ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/50 px-3.5 py-3">
              <Paperclip className="h-4 w-4 text-primary" />
              {!receipt && expense?.receiptUrl ? <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-[13px] text-primary hover:underline">{expense.receipt}</a> : <span className="flex-1 truncate text-[13px]">{receipt?.name ?? expense?.receipt}</span>}
              {receipt && <span className="text-2xs text-subtle">{(receipt.size / 1024).toFixed(0)} KB</span>}
              <button type="button" onClick={() => { setReceipt(null); setRemovedReceipt(true); }} className="rounded p-1 text-subtle hover:text-danger" aria-label="Remove receipt"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-primary/30 bg-primary-soft/60 px-4 py-6 text-center transition-colors hover:border-primary/60">
              <FileUp className="h-6 w-6 text-primary" />
              <span className="mt-2 text-[13px] font-medium">Upload receipt</span>
              <span className="text-xs text-muted-foreground">PDF, PNG or JPG · up to 5 MB</span>
              <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={onFile} />
            </label>
          )}
        </div>
        <FormField label="Notes" className="sm:col-span-2">
          <Textarea {...register('notes')} rows={2} placeholder="Optional details" />
        </FormField>
        <label className="flex items-center justify-between rounded-xl border border-border p-3.5 sm:col-span-2">
          <span>
            <span className="block text-[13px] font-medium">Recurring expense</span>
            <span className="block text-xs text-muted-foreground">A regular monthly cost — shown separately in expense reports.</span>
          </span>
          <Switch checked={watch('recurring')} onCheckedChange={(c) => setValue('recurring', c)} />
        </label>
      </form>
    </Modal>
  );
}

export function ExpensesPage() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: qk.expenses, queryFn: expensesService.list });
  const [editing, setEditing] = useState<Expense | null>(null);
  const [open, setOpen] = useState(params.get('new') === '1');
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const remove = useAppMutation((id: string) => expensesService.remove(id), { invalidate: [qk.expenses], success: 'Expense deleted', onSuccess: () => setDeleting(null) });
  const approve = useAppMutation((id: string) => expensesService.update(id, { status: 'paid' }), { invalidate: [qk.expenses], success: (e) => `${e.title} approved` });

  const stats = useMemo(() => {
    const list = data ?? [];
    const now = new Date();
    return {
      total: list.reduce((s, e) => s + e.amount, 0),
      month: list.filter((e) => isSameMonth(parseISO(e.date), now)).reduce((s, e) => s + e.amount, 0),
      pending: list.filter((e) => e.status === 'pending'),
      recurring: list.filter((e) => e.recurring),
      byCategory: EXPENSE_CATEGORIES.map((c) => ({ name: c, value: list.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
    };
  }, [data]);

  const openForm = (e: Expense | null) => {
    setEditing(e);
    setOpen(true);
  };

  const columns: Column<Expense>[] = [
    {
      id: 'title',
      header: 'Expense',
      hideable: false,
      sortValue: (e) => e.title,
      cell: (e) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary"><Receipt className="h-4 w-4" /></span>
          <div>
            <p className="flex items-center gap-1.5 font-medium">{e.title}{e.recurring && <Repeat className="h-3 w-3 text-subtle" aria-label="Recurring" />}</p>
            <p className="text-2xs text-subtle">{e.paidTo}</p>
          </div>
        </div>
      ),
    },
    { id: 'category', header: 'Category', sortValue: (e) => e.category, cell: (e) => <Badge tone="neutral">{e.category}</Badge> },
    { id: 'date', header: 'Date', sortValue: (e) => e.date, cell: (e) => <span className="text-muted-foreground">{formatDate(e.date)}</span> },
    { id: 'method', header: 'Method', cell: (e) => PAYMENT_LABELS[e.method] },
    { id: 'amount', header: 'Amount', align: 'right', sortValue: (e) => e.amount, cell: (e) => <span className="font-semibold">{formatINR(e.amount)}</span> },
    { id: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
  ];

  return (
    <>
      <PageHeader title="Expenses" description="Rent, salaries, utilities and every operating cost." actions={<Button onClick={() => openForm(null)}><Plus /> Add Expense</Button>} />

      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Expenses" value={formatINR(stats.total)} icon={Wallet} loading={isLoading} invertTrend />
        <StatCard label="This Month" value={formatINR(stats.month)} icon={CalendarClock} loading={isLoading} />
        <StatCard label="Pending" value={formatINR(stats.pending.reduce((s, e) => s + e.amount, 0))} icon={Hourglass} loading={isLoading} hint={`${stats.pending.length} awaiting approval`} />
        <StatCard label="Recurring" value={formatINR(stats.recurring.reduce((s, e) => s + e.amount, 0))} icon={Repeat} loading={isLoading} hint={`${stats.recurring.length} monthly`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <DataTable
          data={data}
          isLoading={isLoading}
          columns={columns}
          getRowId={(e) => e.id}
          searchText={(e) => `${e.title} ${e.paidTo} ${e.category}`}
          searchPlaceholder="Search expenses"
          initialSort={{ id: 'date', dir: 'desc' }}
          onRowClick={openForm}
          filters={[
            { id: 'category', label: 'Categories', options: EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })), predicate: (e, v) => e.category === v },
            { id: 'status', label: 'Statuses', options: [{ value: 'paid', label: 'Paid' }, { value: 'pending', label: 'Pending' }], predicate: (e, v) => e.status === v },
            { id: 'age', label: 'Periods', options: [{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }], predicate: (e, v) => differenceInCalendarDays(new Date(), parseISO(e.date)) <= Number(v) },
          ]}
          rowActions={[
            { label: 'Approve', icon: CheckCircle2, onSelect: (e) => approve.mutate(e.id), hidden: (e) => e.status !== 'pending' },
            { label: 'Edit', icon: Pencil, onSelect: openForm },
            { label: 'Delete', icon: Trash2, destructive: true, onSelect: setDeleting },
          ]}
          empty={<EmptyState icon={Wallet} title="No expenses yet." description="Record rent, salaries and bills to see your true profit." actionLabel="Add Expense" onAction={() => openForm(null)} />}
        />
        <ChartCard title="By category" description="All recorded expenses" loading={isLoading} height={220} className="h-fit">
          <DonutChart data={stats.byCategory} height={200} center={{ label: 'Total', value: formatINRCompact(stats.total) }} />
        </ChartCard>
      </div>

      <ExpenseModal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && params.get('new')) setParams({}, { replace: true });
        }}
        expense={editing}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.title}”?`}
        description="This removes the expense from reports. This can't be undone."
        confirmLabel="Delete expense"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
