import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/FormField';
import { Input, NativeSelect } from '@/components/ui/input';
import { PLAN_LABEL, PLAN_PRICE } from '@/app/config/constants';
import { useAppMutation } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { tenantsService } from '@/services';
import type { Plan, Tenant } from '@/types';
import { PK } from './platformKeys';

const PLANS: Plan[] = ['trial', 'starter', 'growth', 'enterprise', 'astron_labs'];

export function PlanModal({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const [plan, setPlan] = useState<Plan>('starter');
  const [duration, setDuration] = useState('1year');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');

  useEffect(() => {
    if (tenant) {
      setPlan(tenant.plan === 'trial' ? 'starter' : tenant.plan);
      const today = new Date().toISOString().slice(0, 10);
      const oneYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
      setValidFrom(tenant.planValidFrom ? tenant.planValidFrom.slice(0, 10) : today);
      setValidTo(tenant.planValidTo ? tenant.planValidTo.slice(0, 10) : oneYear);
      setDuration('1year');
    }
  }, [tenant]);

  const handleDurationChange = (dur: string) => {
    setDuration(dur);
    const from = validFrom ? new Date(validFrom) : new Date();
    const to = new Date(from);
    if (dur === '1month') to.setMonth(to.getMonth() + 1);
    else if (dur === '3months') to.setMonth(to.getMonth() + 3);
    else if (dur === '6months') to.setMonth(to.getMonth() + 6);
    else if (dur === '1year') to.setFullYear(to.getFullYear() + 1);
    else if (dur === '2years') to.setFullYear(to.getFullYear() + 2);
    if (dur !== 'custom') {
      setValidTo(to.toISOString().slice(0, 10));
    }
  };

  const handleFromChange = (fromStr: string) => {
    setValidFrom(fromStr);
    if (duration !== 'custom' && fromStr) {
      const from = new Date(fromStr);
      const to = new Date(from);
      if (duration === '1month') to.setMonth(to.getMonth() + 1);
      else if (duration === '3months') to.setMonth(to.getMonth() + 3);
      else if (duration === '6months') to.setMonth(to.getMonth() + 6);
      else if (duration === '1year') to.setFullYear(to.getFullYear() + 1);
      else if (duration === '2years') to.setFullYear(to.getFullYear() + 2);
      setValidTo(to.toISOString().slice(0, 10));
    }
  };

  const save = useAppMutation(
    () =>
      tenantsService.changePlan(tenant!.id, plan, {
        astronLabsService: plan === 'astron_labs',
        planValidFrom: validFrom ? new Date(validFrom).toISOString() : undefined,
        planValidTo: validTo ? new Date(validTo).toISOString() : undefined,
      }),
    {
      invalidate: [PK.all],
      success: (t) => `${t.name} moved to ${PLAN_LABEL[t.plan]}`,
      onSuccess: onClose,
    },
  );

  const isChanged =
    plan !== tenant?.plan ||
    (plan === 'astron_labs' && (validFrom !== tenant?.planValidFrom?.slice(0, 10) || validTo !== tenant?.planValidTo?.slice(0, 10)));

  return (
    <Modal
      open={!!tenant}
      onOpenChange={(o) => !o && onClose()}
      title={`Change plan · ${tenant?.name}`}
      description={tenant ? `Currently on ${PLAN_LABEL[tenant.plan]}${tenant.astronLabsService ? ' (Astron Labs Services)' : ''}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!isChanged}>
            Apply plan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Plan">
          {PLANS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={plan === p}
              onClick={() => setPlan(p)}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                plan === p ? 'border-primary bg-primary-soft ring-2 ring-primary/15' : 'border-border hover:border-primary/40',
              )}
            >
              <p className="text-[13px] font-semibold">{PLAN_LABEL[p]}</p>
              <p className="tabular mt-1 text-lg font-semibold">
                {PLAN_PRICE[p] ? formatINR(PLAN_PRICE[p]) : 'Free'}
                <span className="text-xs font-normal text-subtle">
                  {p === 'astron_labs' ? ' · Astron Labs' : PLAN_PRICE[p] ? '/month' : ' · 14 days'}
                </span>
              </p>
            </button>
          ))}
        </div>

        {plan === 'astron_labs' && (
          <div className="rounded-xl border border-primary/20 bg-primary-soft/40 p-4">
            <div className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground">Astron Labs Digital Marketing Services</p>
                <p className="text-xs text-muted-foreground">
                  Billing is ₹0 (free) for this business until the service validity date.
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <FormField label="Validity duration">
                    <NativeSelect value={duration} onChange={(e) => handleDurationChange(e.target.value)}>
                      <option value="1month">1 Month</option>
                      <option value="3months">3 Months</option>
                      <option value="6months">6 Months</option>
                      <option value="1year">1 Year</option>
                      <option value="2years">2 Years</option>
                      <option value="custom">Custom</option>
                    </NativeSelect>
                  </FormField>

                  <FormField label="Valid from">
                    <Input type="date" value={validFrom} onChange={(e) => handleFromChange(e.target.value)} />
                  </FormField>

                  <FormField label="Valid until (Expiry)">
                    <Input
                      type="date"
                      value={validTo}
                      onChange={(e) => {
                        setValidTo(e.target.value);
                        setDuration('custom');
                      }}
                    />
                  </FormField>
                </div>

                <p className="mt-2 text-2xs text-subtle">
                  * Validity will expire after {validTo || 'the expiry date'} and billing will become due.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
