import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Gift, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { BUSINESS_TYPES } from '@/app/config/business';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { FormField } from '@/components/forms/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { REFERRAL_REWARD, REFERRAL_STATUS } from '@/features/referrals/referralMeta';
import { useAppMutation } from '@/hooks/queries';
import { formatDate } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { openWhatsApp } from '@/lib/share';
import { referralsService } from '@/services';
import { Section } from './SettingsSections';

const REFERRALS_KEY = ['referrals'];

const schema = z.object({
  businessName: z.string().trim().min(2, 'Enter their business name').max(80),
  contactName: z.string().trim().min(2, 'Enter the owner or contact name').max(60),
  phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/, 'Enter a valid 10-digit mobile number'),
  city: z.string().trim().max(60).optional(),
  businessType: z.string().optional(),
  notes: z.string().trim().max(300).optional(),
});
type Values = z.infer<typeof schema>;
const EMPTY: Values = { businessName: '', contactName: '', phone: '', city: '', businessType: '', notes: '' };

/** Settings → Refer & Earn: refer another business; the Sahasra team follows up and rewards the referrer. */
export function ReferSection() {
  const { businessName } = useWorkspace();
  const list = useQuery({ queryKey: REFERRALS_KEY, queryFn: referralsService.list });
  const { register, handleSubmit, reset, getValues, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const send = useAppMutation(
    (v: Values) =>
      referralsService.create({
        businessName: sanitizeText(v.businessName, 80),
        contactName: sanitizeText(v.contactName, 60),
        phone: v.phone,
        city: v.city ? sanitizeText(v.city, 60) : undefined,
        businessType: v.businessType || undefined,
        notes: v.notes ? sanitizeText(v.notes, 300) : undefined,
      }),
    { invalidate: [REFERRALS_KEY], success: (r) => `Thanks! We’ll contact ${r.contactName} soon.`, onSuccess: () => reset(EMPTY) },
  );
  const rewards = (list.data ?? []).filter((r) => r.status === 'joined' || r.status === 'rewarded').length;
  const invite = () => {
    const { phone, contactName } = getValues();
    openWhatsApp(phone || undefined, `Hi${contactName ? ` ${contactName}` : ''}, we use Sahasra for billing, stock and GST at ${businessName} and it works really well. You should try it — I’ve asked the Sahasra team to call you.`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl bg-primary p-6 text-white sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><Gift className="h-6 w-6" /></span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Refer a business, get {REFERRAL_REWARD}</h2>
          <p className="mt-0.5 text-[13px] text-white/80">Know a shop, restaurant or salon that needs better billing? Send their details. When they join Sahasra, you get {REFERRAL_REWARD} on your plan — for every business that joins.</p>
        </div>
        <div className="rounded-xl bg-white/15 px-4 py-2 text-center">
          <p className="text-2xl font-bold">{rewards}</p>
          <p className="text-2xs text-white/80">{rewards === 1 ? 'reward earned' : 'rewards earned'}</p>
        </div>
      </div>

      <Section
        title="Refer a business"
        description="The Sahasra team will call them and set everything up."
        footer={
          <>
            <Button variant="secondary" onClick={invite}>Invite on WhatsApp</Button>
            <Button onClick={handleSubmit((v) => send.mutate(v))} loading={send.isPending}><Send /> Send referral</Button>
          </>
        }
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => send.mutate(v))} noValidate>
          <FormField label="Business name" error={errors.businessName?.message} required><Input {...register('businessName')} placeholder="e.g. Sri Sai Supermarket" /></FormField>
          <FormField label="Owner / contact name" error={errors.contactName?.message} required><Input {...register('contactName')} /></FormField>
          <FormField label="Mobile" error={errors.phone?.message} required><Input {...register('phone')} inputMode="tel" /></FormField>
          <FormField label="City"><Input {...register('city')} /></FormField>
          <FormField label="Type of business">
            <NativeSelect {...register('businessType')}>
              <option value="">Not sure</option>
              {BUSINESS_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </NativeSelect>
          </FormField>
          <FormField label="Note for Sahasra team" error={errors.notes?.message}><Textarea {...register('notes')} rows={2} className="min-h-[38px]" placeholder="Best time to call, what they need…" /></FormField>
        </form>
      </Section>

      <Section title="Your referrals" description="Track each business you referred.">
        {list.isLoading ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : !list.data?.length ? (
          <p className="text-[13px] text-muted-foreground">No referrals yet. Your first one could pay for next month.</p>
        ) : (
          <ul className="-my-2 divide-y divide-border">
            {list.data.map((r) => {
              const s = REFERRAL_STATUS[r.status];
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{r.businessName}</p>
                    <p className="truncate text-2xs text-muted-foreground">{r.contactName} · {r.phone}{r.city ? ` · ${r.city}` : ''} · {formatDate(r.createdAt)} by {r.referredBy}</p>
                  </div>
                  <div className="text-right">
                    <Badge tone={s.tone} dot>{s.label}</Badge>
                    <p className="mt-0.5 text-2xs text-subtle">{s.hint}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
