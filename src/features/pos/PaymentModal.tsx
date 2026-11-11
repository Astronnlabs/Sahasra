import { Banknote, Building2, CheckCircle2, CreditCard, Download, HandCoins, MessageCircle, Plus, Printer, RotateCcw, Share2, Smartphone, Split, Trash2, X, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { QrCode, upiLink } from '@/components/common/Codes';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { useInvoicePrinter } from '@/features/sales/useInvoicePrinter';
import { formatINR } from '@/lib/format';
import { getPrinterSettings } from '@/lib/printer';
import { cancelPrintJob, usePrintJobs, type ActiveJob, type LocalPrintJob } from '@/lib/printJobs';
import { openWhatsApp } from '@/lib/share';
import { cn } from '@/lib/utils';
import type { PaymentMethod, Sale } from '@/types';
import type { CartCustomer } from './usePosCart';

const METHODS: { id: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'upi', label: 'UPI', icon: Smartphone },
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'bank', label: 'Bank', icon: Building2 },
  { id: 'credit', label: 'Credit', icon: HandCoins },
  { id: 'split', label: 'Split Payment', icon: Split },
];

/** Where the bill's Bluetooth print has got to. */
function PrintJobStatus({ job, sending }: { job: LocalPrintJob; sending: ActiveJob | null }) {
  const pct = sending && sending.total ? Math.round((sending.sent / sending.total) * 100) : 0;
  if (job.status === 'queued' || job.status === 'sending') {
    return (
      <div className="mt-2 flex w-full items-center gap-3 rounded-xl bg-primary-soft px-3 py-2 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            {sending ? `Printing on ${job.printer} · ${pct}%` : `Preparing for ${job.printer}…`}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card">
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => cancelPrintJob(job.id)}>
          <X /> Cancel
        </Button>
      </div>
    );
  }
  const tone = job.status === 'printed' ? 'text-success' : job.status === 'cancelled' ? 'text-muted-foreground' : 'text-danger';
  const text =
    job.status === 'printed' ? `Printed on ${job.printer}${job.reprint ? ' (reprint)' : ''}` : job.status === 'cancelled' ? 'Printing cancelled' : `Didn’t print: ${job.error ?? 'printer error'}`;
  return <p className={cn('mt-2 w-full text-xs font-medium', tone)}>{text}</p>;
}

interface SplitRow {
  id: number;
  method: Exclude<PaymentMethod, 'split'>;
  amount: number;
}

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  customer: CartCustomer;
  onComplete: (method: PaymentMethod, paid: number) => Promise<Sale>;
  onNewBill: () => void;
}

export function PaymentModal({ open, onOpenChange, total, customer, onComplete, onNewBill }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [split, setSplit] = useState<SplitRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState<Sale | null>(null);
  const { settings, businessName } = useWorkspace();
  const upiId = typeof settings.upiId === 'string' ? settings.upiId : '';
  const printer = useInvoicePrinter();
  const { jobs, active } = usePrintJobs();
  // The latest Bluetooth print of this bill (printing status, cancel, print again).
  const printJob = completed ? jobs.find((j) => j.kind === 'bill' && j.reference === completed.invoiceNo) : undefined;

  useEffect(() => {
    if (open) {
      setMethod('upi');
      setTendered('');
      setReference('');
      setCompleted(null);
      setSplit([
        { id: 1, method: 'cash', amount: Math.round(total / 2) },
        { id: 2, method: 'upi', amount: total - Math.round(total / 2) },
      ]);
    }
  }, [open, total]);

  const splitTotal = useMemo(() => split.reduce((s, r) => s + (r.amount || 0), 0), [split]);
  const cashGiven = Number(tendered) || 0;
  const change = method === 'cash' ? Math.max(0, cashGiven - total) : 0;
  const isWalkIn = !customer.id;

  const canComplete =
    !processing &&
    (method === 'cash' ? cashGiven === 0 || cashGiven >= total : true) &&
    (method === 'split' ? splitTotal === total : true) &&
    (method === 'credit' ? !isWalkIn : true);

  const complete = async () => {
    setProcessing(true);
    try {
      const sale = await onComplete(method, method === 'credit' ? 0 : total);
      setCompleted(sale);
      // Auto-print (Settings → Printer): the bill goes to the printer as soon as payment is confirmed.
      if (getPrinterSettings().bill.auto) printer.print(sale);
    } finally {
      setProcessing(false);
    }
  };

  if (completed) {
    return (
      <Modal open={open} onOpenChange={onOpenChange} title="Payment successful" size="sm">
        <div className="flex flex-col items-center pb-4 pt-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success animate-fade-up">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <p className="tabular mt-4 text-3xl font-semibold tracking-tight">{formatINR(completed.total)}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {completed.invoiceNo} · {completed.customerName}
          </p>
          {change > 0 && (
            <p className="mt-3 rounded-lg bg-warning-soft px-3 py-1.5 text-[13px] font-medium">Return change: {formatINR(change)}</p>
          )}
          <Button
            variant="secondary"
            size="lg"
            className="mt-6 h-12 w-full text-[15px]"
            loading={printer.printing || printJob?.status === 'queued' || printJob?.status === 'sending'}
            onClick={() => (printJob ? printer.printAgain(completed) : printer.print(completed))}
          >
            <Printer /> {printJob ? 'Print again' : 'Print receipt'}
          </Button>
          {printJob && <PrintJobStatus job={printJob} sending={active?.id === printJob.id ? active : null} />}
          <div className="mt-2 grid w-full grid-cols-3 gap-2">
            <Button variant="secondary" loading={printer.downloading} onClick={() => printer.download(completed)}>
              <Download /> PDF
            </Button>
            <Button variant="secondary" loading={printer.sharing} onClick={() => printer.share(completed)}>
              <Share2 /> Share
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                openWhatsApp(
                  customer.phone,
                  `Thank you for shopping at ${businessName}!\nInvoice ${completed.invoiceNo}\nAmount: ${formatINR(completed.total)}${completed.paid < completed.total ? `\nDue: ${formatINR(completed.total - completed.paid)}` : ''}`,
                )
              }
            >
              <MessageCircle /> WhatsApp
            </Button>
          </div>
          {printer.failed && (
            <div className="mt-3 w-full rounded-xl bg-danger-soft px-3 py-2.5 text-left text-[13px]">
              <p className="font-medium text-danger">Bill didn’t print: {printer.failed.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => printer.print(printer.failed!.sale)}><RotateCcw /> Try again</Button>
                <Button size="sm" variant="secondary" onClick={() => printer.printWithDialog(printer.failed!.sale)}><Printer /> Print window</Button>
                <Button size="sm" variant="secondary" asChild><Link to="/settings?section=printer">Printer settings</Link></Button>
              </div>
            </div>
          )}
          {printer.element}
          <Button
            className="mt-2 w-full"
            size="lg"
            onClick={() => {
              onNewBill();
              onOpenChange(false);
            }}
          >
            <Plus /> New bill
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Complete payment"
      description={`Billing ${customer.name}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Back to bill
          </Button>
          <Button onClick={complete} loading={processing} disabled={!canComplete} className="min-w-[160px]">
            {method === 'credit' ? 'Save on credit' : `Confirm ${formatINR(total)}`}
          </Button>
        </>
      }
    >
      <div className="rounded-2xl bg-primary-soft p-4 text-center">
        <p className="text-xs font-medium text-muted-foreground">Amount payable</p>
        <p className="tabular mt-1 text-[32px] font-semibold tracking-tight text-primary">{formatINR(total)}</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={method === m.id}
            onClick={() => setMethod(m.id)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-all',
              method === m.id ? 'border-primary bg-primary-light text-primary ring-2 ring-primary/15' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            <m.icon className="h-5 w-5" />
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-[132px] pb-1">
        {method === 'cash' && (
          <div className="space-y-3">
            <Input value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Cash received (optional)" inputMode="decimal" aria-label="Cash received" autoFocus />
            <div className="flex flex-wrap gap-1.5">
              {[total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 2000) * 2000]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((v) => (
                  <button key={v} type="button" onClick={() => setTendered(String(v))} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary">
                    {formatINR(v)}
                  </button>
                ))}
            </div>
            {cashGiven > 0 && (
              <p className={cn('text-[13px] font-medium', cashGiven >= total ? 'text-success' : 'text-danger')}>
                {cashGiven >= total ? `Change to return: ${formatINR(change)}` : `Short by ${formatINR(total - cashGiven)}`}
              </p>
            )}
          </div>
        )}

        {method === 'upi' && (
          upiId ? (
            <div className="flex items-center gap-4">
              <QrCode value={upiLink(upiId, businessName, total)} className="h-28 w-28 shrink-0 border border-border p-1.5" label={`UPI QR for ${formatINR(total)}`} />
              <div className="text-[13px]">
                <p className="font-semibold">Scan to pay with any UPI app</p>
                <p className="mt-1 text-muted-foreground">Pays {formatINR(total)} to {upiId}</p>
                <p className="mt-3 text-xs text-muted-foreground">Confirm once the payment shows in your UPI app, then press Confirm.</p>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-surface px-4 py-3 text-[13px] text-muted-foreground">
              Add your UPI ID in <Link to="/settings?section=payments" className="font-medium text-primary hover:underline">Settings → Payments</Link> to show a scannable QR code here.
            </p>
          )
        )}

        {(method === 'card' || method === 'bank') && (
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value.slice(0, 24))}
            placeholder={method === 'card' ? 'Card last 4 digits / approval code' : 'UTR / transaction reference'}
            aria-label="Payment reference"
          />
        )}

        {method === 'credit' &&
          (isWalkIn ? (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger">Select a customer on the bill to sell on credit.</p>
          ) : (
            <div className="rounded-xl border border-border p-4 text-[13px]">
              <p>
                <span className="font-semibold">{formatINR(total)}</span> will be added to {customer.name}’s account.
              </p>
              {customer.outstanding ? <p className="mt-1 text-muted-foreground">Existing outstanding: {formatINR(customer.outstanding)}</p> : null}
              <p className="mt-1 text-muted-foreground">Credit period: {Number(settings.creditDays ?? 15)} days</p>
            </div>
          ))}

        {method === 'split' && (
          <div className="space-y-2">
            {split.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <NativeSelect
                  value={row.method}
                  onChange={(e) => setSplit((s) => s.map((r) => (r.id === row.id ? { ...r, method: e.target.value as SplitRow['method'] } : r)))}
                  className="w-36"
                  aria-label="Split method"
                >
                  {METHODS.filter((m) => m.id !== 'split' && m.id !== 'credit').map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </NativeSelect>
                <Input
                  value={row.amount || ''}
                  onChange={(e) => setSplit((s) => s.map((r) => (r.id === row.id ? { ...r, amount: Number(e.target.value.replace(/\D/g, '')) || 0 } : r)))}
                  inputMode="numeric"
                  aria-label="Split amount"
                  className="tabular"
                />
                <Button variant="ghost" size="icon-sm" onClick={() => setSplit((s) => s.filter((r) => r.id !== row.id))} disabled={split.length <= 2} aria-label="Remove split">
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={() => setSplit((s) => [...s, { id: Date.now(), method: 'card', amount: Math.max(0, total - splitTotal) }])}>
                <Plus /> Add method
              </Button>
              <span className={cn('text-xs font-medium', splitTotal === total ? 'text-success' : 'text-danger')}>
                {splitTotal === total ? 'Fully allocated' : `${splitTotal > total ? 'Over' : 'Remaining'} ${formatINR(Math.abs(total - splitTotal))}`}
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
