import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, CreditCard, KeyRound, MapPin, Save, Sparkles, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { BUSINESS_TYPE_MAP, BUSINESS_TYPES } from '@/app/config/business';
import { INDIAN_STATES, recommendedPages, withLocked } from '@/app/config/pages';
import { TempPasswordDialog, type TempLogin } from '@/components/common/TempPasswordDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CITIES } from '@/app/config/constants';
import { PLAN_LABEL, PLAN_PRICE } from '@/app/config/constants';
import { useAppMutation } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { tenantsService, type OwnerLogin } from '@/services';
import type { BusinessType, GeoLocation, Plan, Tenant } from '@/types';
import { LocationCapture } from './LocationCapture';
import { PageAccessEditor } from './PageAccessEditor';
import { PK } from './platformKeys';

const PHONE = /^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const optional = (re: RegExp, msg: string) => z.string().trim().toUpperCase().refine((v) => v === '' || re.test(v), msg);
const optionalPhone = z.string().trim().refine((v) => v === '' || PHONE.test(v), 'Enter a valid 10-digit mobile number');
const PLANS: Plan[] = ['trial', 'starter', 'growth', 'enterprise', 'astron_labs'];

const schema = z.object({
  name: z.string().trim().min(2, 'Business name is required').max(80),
  legalName: z.string().trim().max(120),
  type: z.enum(['restaurant', 'hotel', 'salon', 'grocery', 'stationery', 'mobile', 'pharmacy', 'jewellery', 'clothing', 'hardware', 'other', 'retail', 'service', 'wholesale']),
  gstin: optional(GSTIN, 'GSTIN should look like 27ABCDE1234F1Z5'),
  pan: optional(PAN, 'PAN should look like ABCDE1234F'),
  businessPhone: optionalPhone,
  businessEmail: z.string().trim().email('Enter a valid email').or(z.literal('')),
  website: z.string().trim().max(120).refine((v) => v === '' || /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(v), 'Enter a valid website'),
  addressLine: z.string().trim().min(5, 'Enter the shop / building and street').max(200),
  city: z.string().trim().min(2, 'City is required').max(60),
  state: z.string().min(1, 'Choose a state'),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  ownerName: z.string().trim().min(2, 'Owner name is required').max(60),
  phone: z.string().trim().regex(PHONE, 'Enter a valid 10-digit mobile number'),
  ownerAltPhone: optionalPhone,
  ownerEmail: z.string().trim().email('Enter a valid email'),
  ownerPan: optional(PAN, 'PAN should look like ABCDE1234F'),
  plan: z.enum(['trial', 'starter', 'growth', 'enterprise', 'astron_labs']),
  astronLabsService: z.boolean().optional(),
  planValidityDuration: z.string().optional(),
  planValidFrom: z.string().optional(),
  planValidTo: z.string().optional(),
  notes: z.string().trim().max(500),
});
type Values = z.infer<typeof schema>;

const SECTIONS = [
  { id: 'business', label: 'Business details', icon: Building2 },
  { id: 'location', label: 'Address & location', icon: MapPin },
  { id: 'owner', label: 'Owner details', icon: UserRound },
  { id: 'plan', label: 'Plan & Validity', icon: CreditCard },
  { id: 'access', label: 'Page access', icon: KeyRound },
];

function toValues(t?: Tenant | null): Values {
  const today = new Date().toISOString().slice(0, 10);
  const oneYearLater = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  return {
    name: t?.name ?? '',
    legalName: t?.legalName ?? '',
    type: t?.type ?? 'restaurant',
    gstin: t?.gstin ?? '',
    pan: t?.pan ?? '',
    businessPhone: t?.businessPhone ?? '',
    businessEmail: t?.businessEmail ?? '',
    website: t?.website ?? '',
    addressLine: t?.addressLine ?? '',
    city: t?.city ?? '',
    state: t?.state ?? '',
    pincode: t?.pincode ?? '',
    ownerName: t?.ownerName ?? '',
    phone: t?.phone ?? '',
    ownerAltPhone: t?.ownerAltPhone ?? '',
    ownerEmail: t?.ownerEmail ?? '',
    ownerPan: t?.ownerPan ?? '',
    plan: t?.plan ?? 'trial',
    astronLabsService: t?.astronLabsService ?? (t?.plan === 'astron_labs'),
    planValidityDuration: '1year',
    planValidFrom: t?.planValidFrom ? t.planValidFrom.slice(0, 10) : today,
    planValidTo: t?.planValidTo ? t.planValidTo.slice(0, 10) : oneYearLater,
    notes: t?.notes ?? '',
  };
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 p-6">
      <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
      <p className="mb-5 mt-0.5 text-[13px] text-muted-foreground">{description}</p>
      {children}
    </Card>
  );
}

/** Full-page form to create a business or edit its details. */
export function BusinessFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const existing = useQuery({ queryKey: [...PK.tenants, id], queryFn: () => tenantsService.get(id!), enabled: editing });
  const [location, setLocation] = useState<GeoLocation | undefined>();
  const [access, setAccess] = useState<string[]>(recommendedPages('restaurant'));
  const [accessTouched, setAccessTouched] = useState(false);

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues() });
  const { register, handleSubmit, reset, watch, formState: { errors, submitCount } } = form;
  const type = watch('type') as BusinessType;
  const plan = watch('plan');
  const name = watch('name');

  useEffect(() => {
    if (existing.data) {
      reset(toValues(existing.data));
      setLocation(existing.data.location);
      // Deep links like …/edit#location jump to that section once loaded.
      const hash = window.location.hash.slice(1);
      if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [existing.data, reset]);

  // Follow the industry's recommended pages until the admin edits access by hand.
  useEffect(() => {
    if (!editing && !accessTouched) setAccess(recommendedPages(type));
  }, [type, editing, accessTouched]);

  const save = useAppMutation(
    (v: Values): Promise<{ tenant: Tenant; ownerLogin?: OwnerLogin }> => {
      const clean = {
        ...v,
        name: sanitizeText(v.name, 80),
        legalName: sanitizeText(v.legalName, 120) || undefined,
        gstin: v.gstin || undefined,
        pan: v.pan || undefined,
        businessPhone: v.businessPhone || undefined,
        businessEmail: v.businessEmail || undefined,
        website: v.website || undefined,
        addressLine: sanitizeText(v.addressLine, 200),
        city: sanitizeText(v.city, 60),
        ownerName: sanitizeText(v.ownerName, 60),
        ownerAltPhone: v.ownerAltPhone || undefined,
        ownerPan: v.ownerPan || undefined,
        notes: sanitizeText(v.notes, 500) || undefined,
        location,
        astronLabsService: v.plan === 'astron_labs' || v.astronLabsService || false,
        planValidFrom: v.planValidFrom ? new Date(v.planValidFrom).toISOString() : undefined,
        planValidTo: v.planValidTo ? new Date(v.planValidTo).toISOString() : undefined,
      };
      if (editing) {
        const { plan: _plan, ...details } = clean;
        void _plan;
        return tenantsService.updateDetails(id!, details).then((tenant) => ({ tenant, ownerLogin: undefined }));
      }
      return tenantsService.register({ ...clean, access: withLocked(access) });
    },
    {
      invalidate: [PK.all],
      success: ({ tenant }) => (editing ? `${tenant.name} updated` : `${tenant.name} created`),
      onSuccess: ({ tenant, ownerLogin }) => {
        if (ownerLogin?.tempPassword) {
          // Show the owner's first password before leaving the page.
          setCreated({ id: tenant.id, login: { name: tenant.ownerName, login: `${ownerLogin.email} or ${ownerLogin.phone}`, password: ownerLogin.tempPassword } });
        } else navigate(`/superadmin/businesses/${tenant.id}`, { replace: true });
      },
    },
  );
  const [created, setCreated] = useState<{ id: string; login: TempLogin } | null>(null);

  const submit = handleSubmit((v) => save.mutate(v), () => {
    // Jump to the first section that has an error.
    setTimeout(() => document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  });

  const sectionHasError = (sid: string) => {
    if (!submitCount) return false;
    const keys: Record<string, (keyof Values)[]> = {
      business: ['name', 'legalName', 'gstin', 'pan', 'businessPhone', 'businessEmail', 'website'],
      location: ['addressLine', 'city', 'state', 'pincode'],
      owner: ['ownerName', 'phone', 'ownerAltPhone', 'ownerEmail', 'ownerPan'],
      plan: ['plan'],
      access: [],
    };
    return keys[sid].some((k) => errors[k]);
  };

  if (editing && existing.isError) {
    return <Card><EmptyState icon={Building2} title="Business not found" description="It may have been removed." secondary={<Button asChild variant="secondary"><Link to="/superadmin/businesses">Back to businesses</Link></Button>} /></Card>;
  }
  if (editing && existing.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 rounded-2xl" /></div>;

  const sections = editing ? SECTIONS.filter((s) => s.id !== 'plan' && s.id !== 'access') : SECTIONS;

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title={editing ? `Edit ${existing.data?.name}` : 'Add business'}
        description={editing ? 'Update business, address, location and owner details.' : 'Create a customer business, its owner login and the pages it can use.'}
        back={editing ? { to: `/superadmin/businesses/${id}`, label: existing.data?.name ?? 'Business' } : { to: '/superadmin/businesses', label: 'Businesses' }}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}><Save /> {editing ? 'Save changes' : 'Create business'}</Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_300px] 2xl:grid-cols-[200px_1fr_300px]">
        <nav className="hidden 2xl:block" aria-label="Form sections">
          <ol className="sticky top-24 space-y-1">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground', sectionHasError(s.id) && 'text-danger')}>
                  <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-2xs font-semibold', sectionHasError(s.id) ? 'bg-danger-soft text-danger' : 'bg-primary-light text-primary')}>{i + 1}</span>
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-5">
          <Section id="business" title="Business details" description="Shown on the business's invoices and in your records.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Business / brand name" error={errors.name?.message} required><Input {...register('name')} placeholder="Shop or brand name" autoFocus={!editing} /></FormField>
              <FormField label="Legal / registered name" error={errors.legalName?.message} hint="As on GST certificate"><Input {...register('legalName')} /></FormField>
              <FormField label="Industry" required>
                <NativeSelect {...register('type')}>{BUSINESS_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</NativeSelect>
              </FormField>
              <FormField label="GSTIN" error={errors.gstin?.message}><Input {...register('gstin')} className="uppercase" maxLength={15} placeholder="27ABCDE1234F1Z5" /></FormField>
              <FormField label="Business PAN" error={errors.pan?.message}><Input {...register('pan')} className="uppercase" maxLength={10} placeholder="ABCDE1234F" /></FormField>
              <FormField label="Business phone" error={errors.businessPhone?.message}><Input {...register('businessPhone')} inputMode="tel" placeholder="+91 …" /></FormField>
              <FormField label="Business email" error={errors.businessEmail?.message}><Input {...register('businessEmail')} type="email" /></FormField>
              <FormField label="Website" error={errors.website?.message}><Input {...register('website')} placeholder="www.example.in" /></FormField>
            </div>
          </Section>

          <Section id="location" title="Address & live location" description="Capture the location while at the business premises for accurate on-ground verification.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Shop / building, street, area" error={errors.addressLine?.message} required className="sm:col-span-2">
                <Textarea {...register('addressLine')} rows={2} placeholder="Shop no., building, street, area" />
              </FormField>
              <FormField label="City" error={errors.city?.message} required><Input {...register('city')} list="city-list" /></FormField>
              <FormField label="State" error={errors.state?.message} required>
                <NativeSelect {...register('state')}><option value="">Select state</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</NativeSelect>
              </FormField>
              <FormField label="PIN code" error={errors.pincode?.message} required><Input {...register('pincode')} inputMode="numeric" maxLength={6} /></FormField>
            </div>
            <datalist id="city-list">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
            <div className="mt-5">
              <LocationCapture value={location} onChange={setLocation} />
            </div>
          </Section>

          <Section id="owner" title="Owner details" description="The owner signs in with this email or mobile number.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Owner full name" error={errors.ownerName?.message} required><Input {...register('ownerName')} autoComplete="off" /></FormField>
              <FormField label="Owner email (login)" error={errors.ownerEmail?.message} required><Input {...register('ownerEmail')} type="email" autoComplete="off" /></FormField>
              <FormField label="Owner mobile (login)" error={errors.phone?.message} required><Input {...register('phone')} inputMode="tel" placeholder="+91 …" /></FormField>
              <FormField label="Alternate mobile" error={errors.ownerAltPhone?.message}><Input {...register('ownerAltPhone')} inputMode="tel" /></FormField>
              <FormField label="Owner PAN" error={errors.ownerPan?.message}><Input {...register('ownerPan')} className="uppercase" maxLength={10} /></FormField>
              <FormField label="Internal notes" error={errors.notes?.message} hint="Only visible to Super Admins" className="sm:col-span-2"><Textarea {...register('notes')} rows={2} /></FormField>
            </div>
          </Section>

          {!editing && (
            <Section id="plan" title="Plan & Validity" description="Choose a subscription plan or assign under Astron Labs Services.">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="Plan">
                {PLANS.map((p) => (
                  <label key={p} className={cn('cursor-pointer rounded-xl border p-4 transition-colors', plan === p ? 'border-primary bg-primary-soft ring-2 ring-primary/15' : 'border-border hover:border-primary/40')}>
                    <input type="radio" value={p} {...register('plan')} className="sr-only" />
                    <span className="flex items-center justify-between text-[13px] font-semibold">{PLAN_LABEL[p]}{plan === p && <Check className="h-4 w-4 text-primary" />}</span>
                    <span className="tabular mt-1 block text-lg font-semibold">{PLAN_PRICE[p] ? formatINR(PLAN_PRICE[p]) : 'Free'}<span className="text-xs font-normal text-subtle">{p === 'astron_labs' ? ' · Astron Labs' : PLAN_PRICE[p] ? '/month' : ' · 14 days'}</span></span>
                  </label>
                ))}
              </div>

              {(plan === 'astron_labs' || watch('astronLabsService')) && (
                <div className="mt-4 rounded-xl border border-primary/20 bg-primary-soft/40 p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-foreground">Under Astron Labs Digital Marketing Services</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Billing is completely free for this business during the service validity period. Platform access will remain active with ₹0 monthly subscription fees.
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <FormField label="Validity preset duration">
                          <NativeSelect
                            value={watch('planValidityDuration')}
                            onChange={(e) => {
                              const dur = e.target.value;
                              form.setValue('planValidityDuration', dur);
                              const validFrom = watch('planValidFrom');
                              const fromDate = validFrom ? new Date(validFrom) : new Date();
                              const to = new Date(fromDate);
                              if (dur === '1month') to.setMonth(to.getMonth() + 1);
                              else if (dur === '3months') to.setMonth(to.getMonth() + 3);
                              else if (dur === '6months') to.setMonth(to.getMonth() + 6);
                              else if (dur === '1year') to.setFullYear(to.getFullYear() + 1);
                              else if (dur === '2years') to.setFullYear(to.getFullYear() + 2);
                              if (dur !== 'custom') {
                                form.setValue('planValidTo', to.toISOString().slice(0, 10));
                              }
                            }}
                          >
                            <option value="1month">1 Month</option>
                            <option value="3months">3 Months</option>
                            <option value="6months">6 Months</option>
                            <option value="1year">1 Year (Recommended)</option>
                            <option value="2years">2 Years</option>
                            <option value="custom">Custom Date Range</option>
                          </NativeSelect>
                        </FormField>

                        <FormField label="Valid from (Start Date)">
                          <Input
                            type="date"
                            {...register('planValidFrom')}
                            onChange={(e) => {
                              form.setValue('planValidFrom', e.target.value);
                              const dur = watch('planValidityDuration');
                              if (dur && dur !== 'custom' && e.target.value) {
                                const from = new Date(e.target.value);
                                const to = new Date(from);
                                if (dur === '1month') to.setMonth(to.getMonth() + 1);
                                else if (dur === '3months') to.setMonth(to.getMonth() + 3);
                                else if (dur === '6months') to.setMonth(to.getMonth() + 6);
                                else if (dur === '1year') to.setFullYear(to.getFullYear() + 1);
                                else if (dur === '2years') to.setFullYear(to.getFullYear() + 2);
                                form.setValue('planValidTo', to.toISOString().slice(0, 10));
                              }
                            }}
                          />
                        </FormField>

                        <FormField label="Valid to (Expiry Date)" hint="Validity expires after this date">
                          <Input
                            type="date"
                            {...register('planValidTo')}
                            onChange={(e) => {
                              form.setValue('planValidTo', e.target.value);
                              form.setValue('planValidityDuration', 'custom');
                            }}
                          />
                        </FormField>
                      </div>

                      <p className="mt-2 text-2xs text-subtle">
                        * After {watch('planValidTo') || 'the validity date'}, the free digital marketing service validity will expire and billing becomes due.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </Section>
          )}

          {!editing && (
            <Section id="access" title="Page access" description="Choose exactly which pages this business can open. You can add or remove pages later.">
              <PageAccessEditor value={access} onChange={(p) => { setAccessTouched(true); setAccess(p); }} businessType={type} />
            </Section>
          )}
        </div>

        <aside className="xl:sticky xl:top-24 xl:h-fit">
          <Card className="p-5">
            <p className="section-label">Summary</p>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Business</dt><dd className="truncate font-medium">{name || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Industry</dt><dd className="font-medium">{BUSINESS_TYPE_MAP[type]?.label}</dd></div>
              {!editing && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Plan</dt><dd className="font-medium">{PLAN_LABEL[plan]}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Location</dt><dd className={cn('font-medium', location ? 'text-success' : 'text-subtle')}>{location ? 'Captured' : 'Not captured'}</dd></div>
              {!editing && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Pages</dt><dd className="font-medium">{withLocked(access).length} enabled</dd></div>}
            </dl>
            <Button type="submit" className="mt-5 w-full" loading={save.isPending}><Save /> {editing ? 'Save changes' : 'Create business'}</Button>
            {Object.keys(errors).length > 0 && <p className="mt-2 text-center text-xs text-danger">Please fix the highlighted fields.</p>}
          </Card>
        </aside>
      </div>
      <TempPasswordDialog value={created?.login ?? null} onClose={() => created && navigate(`/superadmin/businesses/${created.id}`, { replace: true })} />
    </form>
  );
}
