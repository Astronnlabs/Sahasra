import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, CreditCard, Hourglass, MessageCircle, RotateCcw, ShieldCheck, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { FormField } from '@/components/forms/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useAppMutation } from '@/hooks/queries';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { goToPayU, walletService, type WalletTxnRow } from '@/services';
import { Section } from './SettingsSections';

export const WALLET_KEY = ['wallet'] as const;
const QUICK = [100, 250, 500, 1000];

export const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)) : 0);

export function WalletSection() {
  const wallet = useQuery({ queryKey: WALLET_KEY, queryFn: walletService.get });
  const { impersonating } = useAuth();
  usePaymentResult(() => void wallet.refetch());

  if (wallet.isLoading) return <Section title="Wallet"><p className="text-[13px] text-muted-foreground">Loading…</p></Section>;
  if (!wallet.data) return <Section title="Wallet"><p className="text-[13px] text-danger">Could not load your wallet. Refresh the page to try again.</p></Section>;
  const w = wallet.data;
  const left = daysLeft(w.expiresAt);
  const billsLeft = Math.floor(w.balance / w.price);

  return (
    <div className="space-y-5">
      <Section title="Wallet" description={`Pays for bills sent on WhatsApp (${formatINR(w.price, true)} each). The whole balance is valid for ${w.validDays} days after your last recharge.`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-hover p-5 text-primary-foreground shadow-primary sm:col-span-1">
            <p className="flex items-center gap-1.5 text-xs font-medium opacity-85"><Wallet className="h-4 w-4" /> Balance</p>
            <p className="mt-2 text-3xl font-semibold tabular tracking-tight">{formatINR(w.balance, true)}</p>
            <p className="mt-1 text-xs opacity-85">≈ {billsLeft.toLocaleString('en-IN')} bills</p>
          </div>
          <Stat
            icon={CalendarClock}
            label="Valid until"
            value={w.expiresAt ? formatDate(w.expiresAt) : '—'}
            note={w.expiresAt ? (left <= 5 ? `Only ${left} day${left === 1 ? '' : 's'} left. Recharge to keep your balance.` : `${left} days left`) : 'Recharge to start'}
            warn={!!w.expiresAt && left <= 5}
          />
          <Stat icon={MessageCircle} label="This month" value={formatINR(w.thisMonth.spent, true)} note={`${w.thisMonth.messages} bill${w.thisMonth.messages === 1 ? '' : 's'} sent on WhatsApp`} />
        </div>
      </Section>

      <Recharge canRecharge={w.canRecharge} validDays={w.validDays} />
      {impersonating && <SupportCredit />}
      <History txns={w.txns} />
    </div>
  );
}

function Stat({ icon: Icon, label, value, note, warn }: { icon: typeof Wallet; label: string; value: string; note: string; warn?: boolean }) {
  return (
    <div className={cn('rounded-2xl border p-5', warn ? 'border-warning/40 bg-warning-soft/50' : 'border-border')}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="h-4 w-4" /> {label}</p>
      <p className="mt-2 text-xl font-semibold tabular">{value}</p>
      <p className={cn('mt-1 text-xs', warn ? 'font-medium text-[#8a5f07] dark:text-warning' : 'text-muted-foreground')}>{note}</p>
    </div>
  );
}

/** Shows the result when PayU sends the user back (…?section=wallet&payment=success). */
function usePaymentResult(onDone: () => void) {
  const [params, setParams] = useSearchParams();
  const payment = params.get('payment');
  useEffect(() => {
    if (!payment) return;
    if (payment === 'success') toast.success('Payment received', { description: 'Your wallet has been recharged.' });
    else if (payment === 'pending') toast.info('Payment is being confirmed', { description: 'Your wallet will update in a minute. Refresh this page to check.' });
    else toast.error('Payment was not completed', { description: 'No money was added. If money was taken from your account, PayU returns it automatically.' });
    onDone();
    setParams({ section: 'wallet' }, { replace: true });
  }, [payment, onDone, setParams]);
}

function Recharge({ canRecharge, validDays }: { canRecharge: boolean; validDays: number }) {
  const [amount, setAmount] = useState('500');
  const n = Number(amount);
  const valid = Number.isInteger(n) && n >= 100 && n <= 50000;
  const pay = useAppMutation((a: number) => walletService.startTopup(a), { invalidate: [], onSuccess: goToPayU });
  return (
    <Section
      title="Recharge wallet"
      description={`Recharging renews the ${validDays}-day validity of your whole balance.`}
      footer={
        <Button disabled={!canRecharge || !valid} loading={pay.isPending} onClick={() => pay.mutate(n)}>
          <CreditCard /> Pay {valid ? formatINR(n) : ''} with PayU
        </Button>
      }
    >
      {!canRecharge && <p className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-[#8a5f07] dark:text-warning">Online recharge is not switched on yet. Contact Sahasra support to add credit.</p>}
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setAmount(String(q))}
            className={cn('rounded-xl border px-4 py-2 text-[13px] font-semibold tabular transition-colors', n === q ? 'border-primary bg-primary-light text-primary' : 'border-border hover:border-primary/40')}
          >
            {formatINR(q)}
          </button>
        ))}
      </div>
      <FormField label="Amount (₹)" hint="₹100 to ₹50,000. Pay by UPI, card, net banking or wallet on PayU’s secure page." error={amount && !valid ? 'Enter a whole amount from ₹100 to ₹50,000' : undefined}>
        <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="sm:max-w-[200px]" />
      </FormField>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-success" /> Money is added only after PayU confirms the payment.</p>
    </Section>
  );
}

function SupportCredit() {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const add = useAppMutation(() => walletService.addCredit(Number(amount), note.trim()), {
    invalidate: [WALLET_KEY],
    success: 'Credit added',
    onSuccess: () => {
      setAmount('');
      setNote('');
    },
  });
  const ok = Number(amount) > 0 && note.trim().length >= 3;
  return (
    <Section title="Add credit (Sahasra support)" description="For payments received outside PayU, e.g. cash or bank transfer. This also renews the validity." footer={<Button disabled={!ok} loading={add.isPending} onClick={() => add.mutate(undefined)}>Add credit</Button>}>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <FormField label="Amount (₹)"><Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></FormField>
        <FormField label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paid in cash on 8 Nov" maxLength={120} /></FormField>
      </div>
    </Section>
  );
}

const KIND: Record<WalletTxnRow['kind'], { label: string; icon: typeof Wallet; tone: 'success' | 'neutral' | 'danger' | 'primary' }> = {
  topup: { label: 'Recharge', icon: ArrowDownLeft, tone: 'success' },
  adjustment: { label: 'Credit', icon: ArrowDownLeft, tone: 'success' },
  charge: { label: 'Bill sent', icon: ArrowUpRight, tone: 'neutral' },
  refund: { label: 'Refund', icon: RotateCcw, tone: 'primary' },
  expired: { label: 'Expired', icon: Hourglass, tone: 'danger' },
};

function History({ txns }: { txns: WalletTxnRow[] }) {
  return (
    <Section title="Wallet history" description="Every recharge and every deduction, newest first.">
      {txns.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-2xs uppercase tracking-wider text-subtle">
                <th className="px-6 py-2 font-medium">Activity</th>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-6 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const k = KIND[t.kind] ?? KIND.charge;
                return (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-2.5">
                      <span className="flex items-center gap-2">
                        <Badge tone={k.tone}><k.icon className="h-3 w-3" /> {k.label}</Badge>
                        <span className="text-muted-foreground">{t.description}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</td>
                    <td className={cn('px-3 py-2.5 text-right font-medium tabular', t.amount > 0 ? 'text-success' : 'text-foreground')}>
                      {t.amount > 0 ? '+' : '−'}
                      {formatINR(Math.abs(t.amount), true)}
                    </td>
                    <td className="px-6 py-2.5 text-right tabular text-muted-foreground">{formatINR(t.balanceAfter, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
