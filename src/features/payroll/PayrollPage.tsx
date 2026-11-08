import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Banknote, Download, Eye, HandCoins, IndianRupee, Plus, Send, Timer, TrendingUp, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StatCard } from '@/components/common/StatCard';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Drawer, Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { qk, useAppMutation, useEmployees } from '@/hooks/queries';
import { formatDate, formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { employeesService } from '@/services';
import type { PayrollEntry } from '@/types';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Opens a printable payslip (the browser's print dialog can save it as PDF). */
function printPayslip(p: PayrollEntry, period: string, business: string) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) {
    toast.error('Allow pop-ups to print payslips.');
    return;
  }
  const row = (label: string, value: number, minus = false) => `<tr><td>${esc(label)}</td><td style="text-align:right">${minus ? '− ' : ''}${esc(formatINR(value))}</td></tr>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(p.name)} ${esc(period)}</title>
<style>body{font-family:system-ui,sans-serif;color:#171522;padding:32px;max-width:640px;margin:auto}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 0;border-bottom:1px solid #eee;font-size:14px}.net{font-size:22px;font-weight:700;color:#6D3DE8}.muted{color:#6F6B78;font-size:13px}</style></head>
<body><h1>${esc(business || 'Payslip')}</h1><p class="muted">Payslip for ${esc(period)}</p>
<p><b>${esc(p.name)}</b><br><span class="muted">${esc(p.designation)}</span></p>
<table>${row('Gross salary', p.gross)}${row('Allowances', p.allowances)}${row('Overtime', p.overtime)}${row('Commission', p.commission)}${row('PF & professional tax', p.deductions, true)}${row('Advance recovery', p.advance, true)}</table>
<p class="muted" style="margin-top:20px">Net salary</p><p class="net">${esc(formatINR(p.net))}</p>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

function AdvanceModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: employees } = useEmployees();
  const schema = z.object({
    employeeId: z.string().min(1, 'Choose an employee'),
    amount: z.coerce.number().positive('Enter an amount').max(100000),
    monthlyRecovery: z.coerce.number().positive('Enter monthly recovery'),
    reason: z.string().trim().min(3, 'Add a short reason').max(80),
  });
  type V = z.infer<typeof schema>;
  const { register, handleSubmit, reset, formState: { errors } } = useForm<V>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) reset({ employeeId: '', amount: undefined as unknown as number, monthlyRecovery: undefined as unknown as number, reason: '' });
  }, [open, reset]);
  const save = useAppMutation(
    (v: V) => employeesService.advances.create({ ...v, reason: sanitizeText(v.reason, 80) }),
    { invalidate: [qk.advances, qk.payroll], success: (a) => `Advance of ${formatINR(a.amount)} recorded for ${a.name}`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Give salary advance"
      description="Advances are recovered automatically from upcoming payroll."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>Record advance</Button></>}
    >
      <form className="grid gap-4 pb-2 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Employee" error={errors.employeeId?.message} required className="sm:col-span-2">
          <NativeSelect {...register('employeeId')}><option value="">Select employee</option>{employees?.filter((e) => e.status !== 'inactive').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</NativeSelect>
        </FormField>
        <FormField label="Advance amount (₹)" error={errors.amount?.message} required><Input {...register('amount')} inputMode="numeric" /></FormField>
        <FormField label="Monthly recovery (₹)" error={errors.monthlyRecovery?.message} required><Input {...register('monthlyRecovery')} inputMode="numeric" /></FormField>
        <FormField label="Reason" error={errors.reason?.message} required className="sm:col-span-2"><Input {...register('reason')} placeholder="Medical emergency" /></FormField>
      </form>
    </Modal>
  );
}

export function PayrollPage() {
  const payroll = useQuery({ queryKey: qk.payroll, queryFn: employeesService.payroll });
  const advances = useQuery({ queryKey: qk.advances, queryFn: employeesService.advances.list });
  const [slip, setSlip] = useState<PayrollEntry | null>(null);
  const [running, setRunning] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const period = format(new Date(), 'MMMM yyyy');
  const { businessName } = useWorkspace();
  const run = useAppMutation(() => employeesService.runPayroll(), {
    invalidate: [qk.payroll, qk.advances, qk.expenses, ['dashboard']],
    success: (r) => `Payroll for ${r.employees} employees recorded (${formatINR(r.total)})`,
    onSuccess: () => setRunning(false),
  });

  const t = useMemo(() => {
    const list = payroll.data ?? [];
    const s = (k: keyof PayrollEntry) => list.reduce((sum, p) => sum + (p[k] as number), 0);
    return { gross: s('gross'), allowances: s('allowances'), overtime: s('overtime'), commission: s('commission'), advance: s('advance'), deductions: s('deductions'), net: s('net'), pending: list.filter((p) => p.status !== 'paid').length };
  }, [payroll.data]);

  const columns: Column<PayrollEntry>[] = [
    { id: 'name', header: 'Employee', hideable: false, sortValue: (p) => p.name, cell: (p) => <div className="flex items-center gap-2.5"><Avatar name={p.name} size="sm" /><div><p className="font-medium">{p.name}</p><p className="text-2xs text-subtle">{p.designation}</p></div></div> },
    { id: 'gross', header: 'Gross Salary', align: 'right', sortValue: (p) => p.gross, cell: (p) => formatINR(p.gross) },
    { id: 'allowances', header: 'Allowances', align: 'right', cell: (p) => formatINR(p.allowances) },
    { id: 'overtime', header: 'Overtime', align: 'right', cell: (p) => (p.overtime ? formatINR(p.overtime) : <span className="text-subtle">—</span>) },
    { id: 'commission', header: 'Commission', align: 'right', cell: (p) => (p.commission ? formatINR(p.commission) : <span className="text-subtle">—</span>) },
    { id: 'advance', header: 'Advance', align: 'right', cell: (p) => (p.advance ? <span className="text-danger">− {formatINR(p.advance)}</span> : <span className="text-subtle">—</span>) },
    { id: 'deductions', header: 'Deductions', align: 'right', cell: (p) => <span className="text-danger">− {formatINR(p.deductions)}</span> },
    { id: 'net', header: 'Net Salary', align: 'right', sortValue: (p) => p.net, cell: (p) => <span className="font-semibold text-primary">{formatINR(p.net)}</span> },
    { id: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Payroll"
        description={`Salary processing for ${period}.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAdvanceOpen(true)}><HandCoins /> Give advance</Button>
            <Button onClick={() => setRunning(true)} disabled={!t.pending}><Send /> Run payroll</Button>
          </>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Gross Salary" value={formatINR(t.gross)} icon={IndianRupee} loading={payroll.isLoading} />
        <StatCard label="Allowances + Overtime" value={formatINR(t.allowances + t.overtime)} icon={Timer} loading={payroll.isLoading} />
        <StatCard label="Commission" value={formatINR(t.commission)} icon={TrendingUp} loading={payroll.isLoading} />
        <StatCard label="Net Payable" value={formatINR(t.net)} icon={Wallet} loading={payroll.isLoading} hint={`${t.pending} pending`} accent />
      </div>

      <Tabs defaultValue="payroll">
        <TabsList>
          <TabsTrigger value="payroll">Employee payroll</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
        </TabsList>
        <TabsContent value="payroll">
          <DataTable
            data={payroll.data}
            isLoading={payroll.isLoading}
            columns={columns}
            getRowId={(p) => p.employeeId}
            searchText={(p) => p.name}
            searchPlaceholder="Search employee"
            onRowClick={setSlip}
            filters={[{ id: 'status', label: 'Statuses', options: ['paid', 'processing', 'pending'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), predicate: (p, v) => p.status === v }]}
            rowActions={[
              { label: 'View payslip', icon: Eye, onSelect: setSlip },
              { label: 'Print payslip', icon: Download, onSelect: (p) => printPayslip(p, period, businessName) },
            ]}
            empty={<EmptyState icon={Banknote} title="No payroll yet." description="Add employees with salaries to start running payroll." />}
          />
          <Card className="mt-4 grid grid-cols-2 gap-4 p-5 text-[13px] sm:grid-cols-4">
            <div><p className="text-2xs uppercase tracking-wider text-subtle">Advance recovery</p><p className="tabular mt-1 font-semibold text-danger">− {formatINR(t.advance)}</p></div>
            <div><p className="text-2xs uppercase tracking-wider text-subtle">Statutory deductions</p><p className="tabular mt-1 font-semibold text-danger">− {formatINR(t.deductions)}</p></div>
            <div><p className="text-2xs uppercase tracking-wider text-subtle">Employer cost</p><p className="tabular mt-1 font-semibold">{formatINR(t.gross + t.allowances + t.overtime + t.commission)}</p></div>
            <div><p className="text-2xs uppercase tracking-wider text-subtle">Net to bank</p><p className="tabular mt-1 font-semibold text-primary">{formatINR(t.net)}</p></div>
          </Card>
        </TabsContent>
        <TabsContent value="advances">
          {advances.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
          ) : advances.data?.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {advances.data.map((a) => (
                <Card key={a.id} className="p-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={a.name} size="sm" />
                    <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{a.name}</p><p className="truncate text-2xs text-subtle">{a.reason} · {formatDate(a.date)}</p></div>
                    <StatusBadge status={a.recovered >= a.amount ? 'completed' : 'active'} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div><p className="text-2xs uppercase text-subtle">Advance</p><p className="tabular text-[15px] font-semibold">{formatINR(a.amount)}</p></div>
                    <div><p className="text-2xs uppercase text-subtle">Recovered</p><p className="tabular text-[15px] font-semibold text-success">{formatINR(a.recovered)}</p></div>
                    <div><p className="text-2xs uppercase text-subtle">Remaining</p><p className="tabular text-[15px] font-semibold text-danger">{formatINR(a.amount - a.recovered)}</p></div>
                  </div>
                  <Progress className="mt-3" value={a.recovered} max={a.amount} tone="success" label={`${a.name} advance recovered`} />
                  <p className="mt-2 text-2xs text-subtle">Recovering {formatINR(a.monthlyRecovery)} per month</p>
                </Card>
              ))}
              <button type="button" onClick={() => setAdvanceOpen(true)} className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 text-[13px] font-medium text-primary transition-colors hover:bg-primary-soft">
                <Plus className="mb-1 h-5 w-5" /> New advance
              </button>
            </div>
          ) : (
            <Card><EmptyState icon={HandCoins} title="No advances" description="Salary advances given to staff will be tracked here." actionLabel="Give advance" onAction={() => setAdvanceOpen(true)} /></Card>
          )}
        </TabsContent>
      </Tabs>

      <Drawer
        open={!!slip}
        onOpenChange={(o) => !o && setSlip(null)}
        title={slip ? `Payslip · ${slip.name}` : ''}
        description={period}
        footer={slip && <Button onClick={() => printPayslip(slip, period, businessName)}><Download /> Print / save as PDF</Button>}
      >
        {slip && (
          <div className="space-y-5 text-[13px]">
            <div className="rounded-2xl bg-primary-soft p-5 text-center">
              <p className="text-xs text-muted-foreground">Net salary</p>
              <p className="tabular mt-1 text-3xl font-semibold text-primary">{formatINR(slip.net)}</p>
              <div className="mt-2"><StatusBadge status={slip.status} /></div>
            </div>
            <section>
              <p className="section-label mb-2">Earnings</p>
              {[['Gross salary', slip.gross], ['Allowances', slip.allowances], ['Overtime', slip.overtime], ['Commission', slip.commission]].map(([l, v]) => (
                <div key={l as string} className="flex justify-between border-b border-border py-2"><span className="text-muted-foreground">{l}</span><span className="tabular">{formatINR(v as number)}</span></div>
              ))}
            </section>
            <section>
              <p className="section-label mb-2">Deductions</p>
              {[['PF & professional tax', slip.deductions], ['Advance recovery', slip.advance]].map(([l, v]) => (
                <div key={l as string} className="flex justify-between border-b border-border py-2"><span className="text-muted-foreground">{l}</span><span className="tabular text-danger">− {formatINR(v as number)}</span></div>
              ))}
            </section>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={running}
        onOpenChange={setRunning}
        title={`Run payroll for ${period}?`}
        description={`${t.pending} employees, ${formatINR(t.net)} net. Advance instalments are recovered and the total is recorded as a Salary expense. Pay your staff from your bank as usual.`}
        confirmLabel="Run payroll"
        onConfirm={() => run.mutate(undefined)}
      />
      <AdvanceModal open={advanceOpen} onOpenChange={setAdvanceOpen} />
    </>
  );
}
