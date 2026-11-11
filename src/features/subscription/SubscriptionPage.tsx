import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCircle2, Clock, CreditCard, LogOut, Moon, RefreshCw, ShieldCheck, Sun, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ME_KEY, useAuth } from '@/app/providers/AuthProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { FullScreenLoader } from '@/components/feedback/PageSkeleton';
import { Logo } from '@/components/layout/Logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/lib/format';
import { goToPayU, subscriptionService, type PlanPaymentRow, type PlanPeriod } from '@/services';
import { PLAN_CHOICE_KEY } from '@/features/auth/SignupPage';

const KEY = ['subscription'] as const;

const PERIOD_NOTE: Record<PlanPeriod, string> = {
  monthly: 'Billed every month',
  quarterly: 'Billed every 3 months',
  yearly: 'Billed every 12 months',
};

const FEATURES = ['POS billing with GST invoices', 'Inventory, purchases and vendors', 'Customers, credit and dues', 'Staff, attendance and payroll', 'Reports and GST registers', 'Industry screens for your business type'];

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function PaymentBadge({ status }: { status: PlanPaymentRow['status'] }) {
  if (status === 'success') return <Badge tone="success">Paid</Badge>;
  if (status === 'failed') return <Badge tone="danger">Failed</Badge>;
  return <Badge tone="warning">Pending</Badge>;
}

/** Buy or renew the SAHAASRA plan with PayU (hosted checkout). */
export function SubscriptionPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { logout, me } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState<PlanPeriod>('yearly');
  const payment = params.get('payment');

  const { data, isPending, refetch, isFetching } = useQuery({
    queryKey: KEY,
    queryFn: subscriptionService.get,
    // While a payment is being confirmed, keep checking.
    refetchInterval: (q) => (q.state.data?.payments.some((p) => p.status === 'pending' && Date.now() - new Date(p.createdAt).getTime() < 30 * 60_000) ? 8000 : false),
  });

  // Plan chosen on the website before sign-up.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PLAN_CHOICE_KEY);
      if (raw) {
        const c = JSON.parse(raw) as { period?: PlanPeriod };
        if (c.period && c.period in PERIOD_NOTE) setPeriod(c.period);
        sessionStorage.removeItem(PLAN_CHOICE_KEY);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Coming back from PayU.
  const shown = useRef(false);
  useEffect(() => {
    if (!payment || shown.current) return;
    shown.current = true;
    if (payment === 'success') toast.success('Payment received. Your plan is active.');
    else if (payment === 'failed') toast.error('The payment did not go through. No money was taken for the plan — you can try again.');
    else toast.info('Payment is being confirmed by PayU. This page updates automatically.');
    qc.invalidateQueries({ queryKey: ME_KEY });
    setParams({}, { replace: true });
  }, [payment, qc, setParams]);

  // The plan became active: refresh the session so the software unlocks.
  const wasActive = useRef<boolean | null>(null);
  useEffect(() => {
    if (!data) return;
    if (wasActive.current === false && data.state.active) {
      qc.invalidateQueries({ queryKey: ME_KEY });
      toast.success('Your plan is active.');
    }
    wasActive.current = data.state.active;
  }, [data, qc]);

  const checkout = useMutation({
    mutationFn: () => subscriptionService.checkout(data!.plans[0].id, period),
    onSuccess: (form) => goToPayU(form),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not start the payment'),
  });

  const check = useMutation({
    mutationFn: (id: string) => subscriptionService.check(id),
    onSuccess: (r) => {
      qc.setQueryData(KEY, r);
      qc.invalidateQueries({ queryKey: ME_KEY });
      if (r.status === 'success') toast.success('Payment confirmed. Your plan is active.');
      else if (r.status === 'failed') toast.error('PayU reports this payment as failed.');
      else toast.info('PayU has not confirmed this payment yet.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not check the payment'),
  });

  const plan = data?.plans[0];
  const option = useMemo(() => plan?.options.find((o) => o.period === period), [plan, period]);
  const monthlyPrice = plan?.options.find((o) => o.period === 'monthly')?.price ?? 0;

  if (isPending || !data || !plan) return <FullScreenLoader />;
  const s = data.state;
  const locked = me?.workspace?.subscription?.locked ?? s.locked;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-1">
            {!locked && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft /> Dashboard
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              <LogOut /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <p className="text-[13px] text-muted-foreground">{data.businessName}</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{locked ? 'Choose your plan to start' : 'Plan & billing'}</h1>
          {locked && <p className="mt-1.5 max-w-2xl text-[13.5px] text-muted-foreground">Your account is ready. Buy the {plan.name} plan to start billing with SAHAASRA. Payment is taken securely on PayU’s page (UPI, cards, net banking).</p>}
        </div>

        {/* Current status */}
        <section className={cn('flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5', s.active ? 'border-success/30 bg-success-soft/40' : 'border-border bg-card')}>
          <div className="flex items-center gap-3">
            <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', s.active ? 'bg-success text-white' : 'bg-surface text-muted-foreground')}>
              {s.active ? <ShieldCheck className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-[15px] font-semibold">
                {s.active ? `${plan.name} plan · active` : s.required ? 'No active plan' : `Current plan: ${s.plan}`}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {s.active && s.validTo
                  ? `Valid until ${formatDate(s.validTo)} · ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left${s.period ? ` · ${s.period}` : ''}`
                  : s.validTo
                    ? `Expired on ${formatDate(s.validTo)}`
                    : 'Buy a plan below to unlock the software.'}
              </p>
            </div>
          </div>
          {s.active && <p className="text-xs text-muted-foreground">Buying again adds time on top of your current validity.</p>}
        </section>

        {/* Plan */}
        <section className="grid gap-6 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-7 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <Badge tone="primary">{plan.name} plan</Badge>
            <h2 className="mt-3 text-xl font-semibold">Everything you need to run billing</h2>
            <ul className="mt-4 space-y-2.5">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-medium">Choose how you pay</p>
            <div className="space-y-3" role="radiogroup" aria-label="Billing period">
              {plan.options.map((o) => {
                const full = monthlyPrice * o.months;
                const save = full > o.price ? Math.round(((full - o.price) / full) * 100) : 0;
                const selected = o.period === period;
                return (
                  <button
                    key={o.period}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPeriod(o.period)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors',
                      selected ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'border-border hover:border-primary/40',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', selected ? 'border-primary bg-primary' : 'border-border')}>
                        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                      <span>
                        <span className="flex items-center gap-2 text-[14px] font-semibold">
                          {o.label}
                          {save > 0 && <Badge tone="success">Save {save}%</Badge>}
                        </span>
                        <span className="block text-xs text-muted-foreground">{PERIOD_NOTE[o.period]}</span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-lg font-semibold tabular-nums">{rupees(o.price)}</span>
                      <span className="block text-2xs text-subtle">{o.months === 1 ? 'per month' : `for ${o.months} months`}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {data.canBuy ? (
              <Button size="lg" className="mt-5 w-full" loading={checkout.isPending} disabled={!data.canPay || !option} onClick={() => checkout.mutate()}>
                Pay {option ? rupees(option.price) : ''} with PayU
              </Button>
            ) : (
              <p className="mt-5 rounded-lg bg-surface p-3 text-[13px] text-muted-foreground">Only the business owner or an admin can buy the plan. Ask them to sign in and pay.</p>
            )}
            {!data.canPay && <p className="mt-2 text-xs text-danger">Online payment is not set up on the server yet. Please contact Sahaasra support.</p>}
            <p className="mt-3 text-center text-2xs text-subtle">You’ll be taken to PayU’s secure page and brought back here after paying.</p>
          </div>
        </section>

        {/* Payments */}
        <section className="rounded-2xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <h2 className="text-[14px] font-semibold">Payments</h2>
            <Button variant="ghost" size="sm" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw /> Refresh
            </Button>
          </div>
          {data.payments.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    {p.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-success" /> : p.status === 'failed' ? <XCircle className="h-4 w-4 text-danger" /> : <Clock className="h-4 w-4 text-warning" />}
                    <div>
                      <p className="text-[13.5px] font-medium">
                        {p.planName} · {p.period} · {rupees(p.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(p.createdAt)}
                        {p.mode ? ` · ${p.mode}` : ''}
                        {p.validTo && p.status === 'success' ? ` · valid until ${formatDate(p.validTo)}` : ''}
                        {p.error && p.status === 'failed' ? ` · ${p.error}` : ''}
                      </p>
                      <p className="text-2xs text-subtle">Ref {p.txnid}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <PaymentBadge status={p.status} />
                    {p.status === 'pending' && (
                      <Button variant="secondary" size="sm" loading={check.isPending && check.variables === p.id} onClick={() => check.mutate(p.id)}>
                        Check status
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
