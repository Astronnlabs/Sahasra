import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Download, Eye, IndianRupee, MessageCircle, Plus, Printer, ReceiptText, RotateCcw, Undo2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { StatCard } from '@/components/common/StatCard';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { BRANCHES } from '@/app/config/constants';
import { qk, useAppMutation, useCustomers, useSales } from '@/hooks/queries';
import { openWhatsApp } from '@/lib/share';
import { formatDate, formatINR, formatTime } from '@/lib/format';
import { salesService } from '@/services';
import type { ReturnRecord, Sale } from '@/types';
import { InvoicePreview } from './InvoicePreview';
import { PAYMENT_LABELS, PAYMENT_OPTIONS } from './salesMeta';
import { useInvoicePrinter } from './useInvoicePrinter';

const DATE_FILTER = [
  { value: '0', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];
const AMOUNT_FILTER = [
  { value: '0-1000', label: 'Under ₹1,000' },
  { value: '1000-5000', label: '₹1,000 – ₹5,000' },
  { value: '5000-999999999', label: 'Above ₹5,000' },
];

export function returnColumns(partyLabel: string): Column<ReturnRecord>[] {
  return [
    { id: 'ref', header: 'Return no.', hideable: false, cell: (r) => <span className="font-semibold">{r.ref}</span> },
    { id: 'against', header: 'Against', cell: (r) => r.against },
    { id: 'party', header: partyLabel, cell: (r) => r.party },
    { id: 'date', header: 'Date', sortValue: (r) => r.date, cell: (r) => formatDate(r.date) },
    { id: 'reason', header: 'Reason', cell: (r) => <span className="text-muted-foreground">{r.reason}</span> },
    { id: 'amount', header: 'Amount', align: 'right', sortValue: (r) => r.amount, cell: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  ];
}

export function SalesPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { businessName } = useWorkspace();
  const { data, isLoading } = useSales();
  const returns = useQuery({ queryKey: qk.salesReturns, queryFn: salesService.returns });
  const [confirm, setConfirm] = useState<{ sale: Sale; kind: 'refund' | 'return' } | null>(null);

  const invoiceParam = params.get('invoice');
  const viewing = invoiceParam ? data?.find((s) => s.invoiceNo === invoiceParam) ?? null : null;
  const setViewing = (s: Sale | null) => setParams(s ? { invoice: s.invoiceNo } : {}, { replace: true });

  const stats = useMemo(() => {
    const list = (data ?? []).filter((s) => differenceInCalendarDays(new Date(), parseISO(s.date)) <= 30);
    const total = list.reduce((s, x) => s + x.total, 0);
    return {
      total,
      count: list.length,
      avg: list.length ? Math.round(total / list.length) : 0,
      due: (data ?? []).reduce((s, x) => s + (['unpaid', 'partial', 'overdue'].includes(x.status) ? x.total - x.paid : 0), 0),
    };
  }, [data]);

  const act = useAppMutation(
    ({ sale, kind }: { sale: Sale; kind: 'refund' | 'return' }) => (kind === 'refund' ? salesService.refund(sale.id) : salesService.markReturned(sale.id)),
    {
      invalidate: [qk.sales, qk.salesReturns, qk.products, qk.customers, qk.inventory, ['dashboard'], ['reports'], ['gst']],
      success: (s) => `${s.invoiceNo} marked as ${s.status}`,
      onSuccess: () => setConfirm(null),
    },
  );

  const printer = useInvoicePrinter();
  const { data: customers } = useCustomers();
  // Bills are rebuilt from the saved invoice, with the business details and design it was issued with.
  const print = (s: Sale) => printer.print(s);
  const download = (s: Sale) => printer.download(s);
  const share = (s: Sale) => {
    const due = s.total - s.paid;
    openWhatsApp(
      customers?.find((c) => c.id === s.customerId)?.phone,
      `Invoice ${s.invoiceNo} from ${businessName}\nDate: ${formatDate(s.date)}\nAmount: ${formatINR(s.total)}${due > 0 ? `\nBalance due: ${formatINR(due)}` : '\nPaid in full — thank you!'}`,
    );
  };

  const columns: Column<Sale>[] = [
    { id: 'invoice', header: 'Invoice', hideable: false, sortValue: (s) => s.invoiceNo, cell: (s) => <span className="font-semibold text-primary">{s.invoiceNo}</span> },
    {
      id: 'customer',
      header: 'Customer',
      sortValue: (s) => s.customerName,
      cell: (s) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={s.customerName} size="xs" />
          <span className="max-w-[180px] truncate">{s.customerName}</span>
        </div>
      ),
    },
    { id: 'date', header: 'Date', sortValue: (s) => s.date, cell: (s) => <span className="text-muted-foreground">{formatDate(s.date)} · {formatTime(s.date)}</span> },
    { id: 'branch', header: 'Branch', defaultHidden: true, cell: (s) => s.branch },
    { id: 'items', header: 'Items', align: 'right', defaultHidden: true, cell: (s) => s.items.reduce((n, i) => n + i.qty, 0) },
    { id: 'amount', header: 'Amount', align: 'right', sortValue: (s) => s.total, cell: (s) => <span className="font-semibold">{formatINR(s.total)}</span> },
    { id: 'payment', header: 'Payment', cell: (s) => PAYMENT_LABELS[s.payment] },
    { id: 'cashier', header: 'Cashier', defaultHidden: true, cell: (s) => s.cashier },
    { id: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Sales"
        description="Every invoice, payment and return in one place."
        actions={
          <Button asChild>
            <Link to="/pos"><Plus /> New Sale</Link>
          </Button>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Sales · 30 days" value={formatINR(stats.total)} icon={IndianRupee} loading={isLoading} />
        <StatCard label="Invoices" value={stats.count} icon={ReceiptText} loading={isLoading} />
        <StatCard label="Average bill" value={formatINR(stats.avg)} icon={Wallet} loading={isLoading} />
        <StatCard label="Pending collection" value={formatINR(stats.due)} icon={RotateCcw} loading={isLoading} hint="credit & partial" />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="returns">Sales returns</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <DataTable
            data={data}
            isLoading={isLoading}
            columns={columns}
            getRowId={(s) => s.id}
            searchText={(s) => `${s.invoiceNo} ${s.customerName}`}
            searchPlaceholder="Search invoice or customer"
            onRowClick={setViewing}
            initialSort={{ id: 'date', dir: 'desc' }}
            filters={[
              { id: 'date', label: 'Dates', options: DATE_FILTER, predicate: (s, v) => differenceInCalendarDays(new Date(), parseISO(s.date)) <= Number(v) },
              { id: 'payment', label: 'Payments', options: PAYMENT_OPTIONS, predicate: (s, v) => s.payment === v },
              {
                id: 'status',
                label: 'Statuses',
                options: ['paid', 'partial', 'unpaid', 'overdue', 'refunded', 'returned'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })),
                predicate: (s, v) => s.status === v,
              },
              { id: 'branch', label: 'Branches', options: BRANCHES.map((b) => ({ value: b.name, label: b.name })), predicate: (s, v) => s.branch === v },
              {
                id: 'amount',
                label: 'Amounts',
                options: AMOUNT_FILTER,
                predicate: (s, v) => {
                  const [min, max] = v.split('-').map(Number);
                  return s.total >= min && s.total < max;
                },
              },
            ]}
            rowActions={[
              { label: 'View', icon: Eye, onSelect: setViewing },
              { label: 'Download PDF', icon: Download, onSelect: download },
              { label: 'Print', icon: Printer, onSelect: print },
              { label: 'Share on WhatsApp', icon: MessageCircle, onSelect: share },
              { label: 'Return', icon: Undo2, onSelect: (sale) => setConfirm({ sale, kind: 'return' }), hidden: (s) => ['refunded', 'returned'].includes(s.status) },
              { label: 'Refund', icon: RotateCcw, destructive: true, onSelect: (sale) => setConfirm({ sale, kind: 'refund' }), hidden: (s) => ['refunded', 'returned', 'unpaid'].includes(s.status) },
            ]}
            empty={<EmptyState icon={ReceiptText} title="No sales yet." description="Bills created from POS will appear here instantly." actionLabel="Start billing" onAction={() => navigate('/pos')} />}
          />
        </TabsContent>
        <TabsContent value="returns">
          <DataTable
            data={returns.data}
            isLoading={returns.isLoading}
            columns={returnColumns('Customer')}
            getRowId={(r) => r.id}
            searchText={(r) => `${r.ref} ${r.against} ${r.party}`}
            searchPlaceholder="Search returns"
            empty={<EmptyState icon={Undo2} title="No sales returns." description="Returns and exchanges against invoices will be listed here." />}
          />
        </TabsContent>
      </Tabs>

      <Drawer
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        width="lg"
        title={viewing ? `Invoice ${viewing.invoiceNo}` : ''}
        description={viewing ? `${viewing.customerName} · ${formatDate(viewing.date)}` : undefined}
        footer={
          viewing && (
            <>
              <Button variant="secondary" onClick={() => share(viewing)}>WhatsApp</Button>
              <Button variant="secondary" onClick={() => print(viewing)} loading={printer.printing}><Printer /> Print</Button>
              <Button onClick={() => download(viewing)} loading={printer.downloading}><Download /> Download PDF</Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={viewing.status} />
              <span className="text-xs text-muted-foreground">Billed by {viewing.cashier} · {viewing.branch}</span>
            </div>
            <InvoicePreview sale={viewing} />
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === 'refund' ? `Refund ${confirm?.sale.invoiceNo}?` : `Record return for ${confirm?.sale.invoiceNo}?`}
        description={
          confirm?.kind === 'refund'
            ? `${formatINR(confirm.sale.paid)} will be refunded via ${PAYMENT_LABELS[confirm.sale.payment]} and stock restored.`
            : 'Items will be added back to stock and a credit note will be created.'
        }
        confirmLabel={confirm?.kind === 'refund' ? 'Issue refund' : 'Record return'}
        destructive={confirm?.kind === 'refund'}
        loading={act.isPending}
        onConfirm={() => confirm && act.mutate(confirm)}
      />
      {printer.element}
    </>
  );
}
