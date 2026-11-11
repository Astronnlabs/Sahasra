import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Download, FileSpreadsheet, FileText, ImagePlus, KeyRound, Laptop, LogOut, Moon, Smartphone, Sparkles, Store, CreditCard, Sun, Upload } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { BUSINESS_TYPE_MAP } from '@/app/config/business';
import { PLAN_LABEL, PLAN_PRICE } from '@/app/config/constants';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useWorkspace, type WorkspaceSettings } from '@/app/providers/WorkspaceProvider';
import { UPI_ID_RE } from '@/components/common/Codes';
import { FormField } from '@/components/forms/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { downloadCsv, downloadExcel, EXPORT_DATASETS } from '@/features/data/exportData';
import { ImportWizard } from '@/features/data/ImportWizard';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useAppMutation } from '@/hooks/queries';
import { formatDate, timeAgo } from '@/lib/format';
import { isSafeImageFile, sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { authService, workspaceService } from '@/services';
import { passwordSchema } from './passwordSchema';

export function Section({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="animate-fade-in">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-5 px-6 py-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
    </Card>
  );
}

function SwitchRow({ title, description, checked, onChange }: { title: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
      <span>
        <span className="block text-[13px] font-medium">{title}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </label>
  );
}

/** Saves business settings on the server, then reloads the session so every screen sees them. */
export function useSaveSettings(label: string) {
  const { refresh } = useAuth();
  return useAppMutation(async (patch: Record<string, string | number | boolean | null>) => {
    await workspaceService.updateSettings(patch);
    await refresh();
    return patch;
  }, { invalidate: [], success: `${label} saved` });
}

// ── Business profile ──
const profileSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required').max(80),
  phone: z.string().trim().refine((v) => v === '' || /^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/.test(v), 'Enter a valid 10-digit mobile number'),
  email: z.string().trim().refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email'),
  gstin: z.string().trim().toUpperCase().refine((v) => v === '' || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), 'GSTIN should look like 27ABCDE1234F1Z5'),
  addressLine: z.string().trim().max(200),
  city: z.string().trim().max(60),
  state: z.string().trim().max(60),
  pincode: z.string().trim().refine((v) => v === '' || /^\d{6}$/.test(v), 'PIN code must be 6 digits'),
});
type ProfileValues = z.infer<typeof profileSchema>;

export function BusinessProfile() {
  const ws = useWorkspace();
  const { refresh, hasPermission, me } = useAuth();
  const sub = me?.workspace?.subscription;
  const canEdit = hasPermission('Settings', 'edit');
  const details = useQuery({ queryKey: ['workspace', 'details'], queryFn: workspaceService.get });
  const { register, handleSubmit, formState: { errors, isDirty }, reset } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema) });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const d = details.data;
    if (d) reset({ businessName: d.businessName, phone: d.phone ?? '', email: d.email ?? '', gstin: d.gstin ?? '', addressLine: d.addressLine, city: d.city, state: d.state, pincode: d.pincode });
  }, [details.data, reset]);

  const save = useAppMutation(
    async (v: ProfileValues) => {
      await workspaceService.updateProfile({
        businessName: sanitizeText(v.businessName, 80),
        phone: v.phone || undefined,
        email: v.email || undefined,
        gstin: v.gstin || undefined,
        addressLine: sanitizeText(v.addressLine, 200) || undefined,
        city: sanitizeText(v.city, 60) || undefined,
        state: sanitizeText(v.state, 60) || undefined,
        pincode: v.pincode || undefined,
      });
      await refresh();
      return v;
    },
    { invalidate: [['workspace', 'details']], success: 'Business profile saved', onSuccess: (v) => reset(v) },
  );

  const type = BUSINESS_TYPE_MAP[ws.businessType];
  const TypeIcon = type?.icon ?? Store;

  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isSafeImageFile(file, 2 * 1024 * 1024) || file.type === 'application/pdf') {
      toast.error('Upload a PNG, JPG or WebP image under 2 MB.');
      return;
    }
    setUploading(true);
    try {
      await workspaceService.uploadLogo(file);
      await refresh();
      toast.success('Logo updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Logo upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Section
        title="Business Profile"
        description="Shown on invoices, receipts and customer messages."
        footer={canEdit && <Button onClick={handleSubmit((v) => save.mutate(v))} disabled={!isDirty} loading={save.isPending}>Save changes</Button>}
      >
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface">
            {ws.logo ? <img src={ws.logo} alt="Business logo" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-subtle" />}
          </span>
          {canEdit && (
            <label className={cn('cursor-pointer', uploading && 'pointer-events-none opacity-60')}>
              <span className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-surface">{uploading ? 'Uploading…' : ws.logo ? 'Change logo' : 'Upload logo'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onLogo} />
            </label>
          )}
        </div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          <fieldset disabled={!canEdit || details.isLoading} className="contents">
            <FormField label="Business name" error={errors.businessName?.message} required><Input {...register('businessName')} /></FormField>
            <FormField label="GSTIN" error={errors.gstin?.message}><Input {...register('gstin')} className="uppercase" maxLength={15} /></FormField>
            <FormField label="Business phone" error={errors.phone?.message}><Input {...register('phone')} inputMode="tel" /></FormField>
            <FormField label="Business email" error={errors.email?.message}><Input {...register('email')} type="email" /></FormField>
            <FormField label="Address" error={errors.addressLine?.message} className="sm:col-span-2">
              <Input {...register('addressLine')} placeholder="Shop no., building, street, area" />
            </FormField>
            <FormField label="City"><Input {...register('city')} /></FormField>
            <FormField label="State"><Input {...register('state')} /></FormField>
            <FormField label="PIN code" error={errors.pincode?.message}><Input {...register('pincode')} inputMode="numeric" maxLength={6} /></FormField>
          </fieldset>
        </form>
      </Section>

      <Section
        title="Subscription & Billing"
        description="Your current Sahasra plan and service billing details."
      >
        {ws.astronLabsService || ws.plan === 'astron_labs' ? (
          <div className="rounded-2xl border border-primary/25 bg-primary-soft/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-foreground">Astron Labs Digital Marketing Services</h3>
                    <Badge tone="primary" className="font-semibold">Free Billing (₹0/mo)</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-xl">
                    Your business platform subscription is completely free, covered under Astron Labs Digital Marketing Services. No subscription charges apply during your validity period.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border/60 pt-4 text-[13px]">
              <div className="rounded-lg bg-surface/60 p-3">
                <span className="block text-2xs uppercase tracking-wider text-subtle font-medium">Billed Under</span>
                <span className="mt-0.5 block font-semibold text-foreground">Astron Labs Services</span>
              </div>
              <div className="rounded-lg bg-surface/60 p-3">
                <span className="block text-2xs uppercase tracking-wider text-subtle font-medium">Monthly Charge</span>
                <span className="mt-0.5 block font-semibold text-emerald-600 dark:text-emerald-400">₹0 / Free</span>
              </div>
              <div className="rounded-lg bg-surface/60 p-3">
                <span className="block text-2xs uppercase tracking-wider text-subtle font-medium">Service Validity</span>
                <span className="mt-0.5 block font-semibold text-foreground">
                  {ws.planValidTo
                    ? `${ws.planValidFrom ? formatDate(ws.planValidFrom) + ' to ' : ''}${formatDate(ws.planValidTo)}`
                    : 'Active / Ongoing'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface/40 p-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <div>
                <p className="text-[14px] font-medium text-foreground">
                  {ws.plan ? PLAN_LABEL[ws.plan] : 'Free'} Plan
                  {ws.plan && PLAN_PRICE[ws.plan] ? ` · ₹${PLAN_PRICE[ws.plan]}/month` : ' · Free'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sub?.validTo ? `${sub.active ? 'Valid until' : 'Expired on'} ${formatDate(sub.validTo)}` : 'Standard subscription'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="neutral">{ws.status === 'active' ? 'Active' : ws.status}</Badge>
              <Button asChild size="sm" variant="secondary">
                <Link to="/subscription">{sub?.active ? 'Renew plan' : 'Buy plan'}</Link>
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Business type" description="Sahasra adapts navigation and screens to your industry.">
        {/* Set by Sahasra when the business is created — not changeable here. */}
        <div className="flex items-center gap-3 rounded-xl border border-primary bg-primary-soft p-3 sm:max-w-sm">
          <TypeIcon className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-medium">{type?.label ?? 'Other / General'}</span>
        </div>
        <p className="text-xs text-muted-foreground">Your business type and the pages you can use are managed by Sahasra. Need a change or another module? Ask from Help &amp; Support.</p>
      </Section>
    </div>
  );
}

// ── Invoice numbering ──
export function InvoiceSettings() {
  const { settings } = useWorkspace();
  const save = useSaveSettings('Invoice settings');
  const [prefix, setPrefix] = useState(String(settings.invoicePrefix ?? 'INV-'));
  const [start, setStart] = useState(String(settings.invoiceStartAt ?? 1));
  const validPrefix = /^[A-Za-z0-9/_-]{0,12}$/.test(prefix);
  const validStart = /^\d{1,7}$/.test(start) && Number(start) >= 1;
  return (
    <Section
      title="Invoice Settings"
      description="How new invoice numbers are generated."
      footer={<Button disabled={!validPrefix || !validStart} loading={save.isPending} onClick={() => save.mutate({ invoicePrefix: prefix, invoiceStartAt: Number(start) })}>Save changes</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Invoice prefix" error={validPrefix ? undefined : 'Letters, numbers, / - _ only (max 12)'}><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={12} /></FormField>
        <FormField label="Start numbering at" error={validStart ? undefined : 'Enter a whole number'} hint="Use this when moving from another billing system."><Input value={start} onChange={(e) => setStart(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></FormField>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Next invoices look like <b className="text-foreground">{prefix}{String(Math.max(1, Number(start) || 1)).padStart(4, '0')}</b>. Numbers never repeat, even if you change these settings.
      </p>
      <div className="flex items-center justify-between rounded-xl bg-primary-soft p-4">
        <div><p className="text-[13px] font-semibold">Invoice design</p><p className="text-xs text-muted-foreground">Invoices print with your default Bill Studio template.</p></div>
        <Button variant="secondary" asChild><Link to="/bill-studio">Open Bill Studio</Link></Button>
      </div>
    </Section>
  );
}

// ── POS & credit ──
export function PosSettings() {
  const { settings } = useWorkspace();
  const save = useSaveSettings('Billing settings');
  const [maxDiscount, setMaxDiscount] = useState(String(settings.maxDiscountPct ?? 100));
  const [creditDays, setCreditDays] = useState(String(settings.creditDays ?? 15));
  const [vendorDays, setVendorDays] = useState(String(settings.vendorCreditDays ?? 30));
  const [negative, setNegative] = useState(settings.allowNegativeStock !== false);
  const num = (v: string, max: number) => /^\d+$/.test(v) && Number(v) <= max;
  const valid = num(maxDiscount, 100) && num(creditDays, 365) && num(vendorDays, 365);
  return (
    <Section
      title="Billing & POS"
      description="Rules the server applies to every bill."
      footer={<Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate({ maxDiscountPct: Number(maxDiscount), creditDays: Number(creditDays), vendorCreditDays: Number(vendorDays), allowNegativeStock: negative })}>Save changes</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Max discount for staff (%)" hint="Owners and admins are not limited." error={num(maxDiscount, 100) ? undefined : '0–100'}><Input value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></FormField>
        <FormField label="Customer credit period (days)" error={num(creditDays, 365) ? undefined : '0–365'}><Input value={creditDays} onChange={(e) => setCreditDays(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></FormField>
        <FormField label="Vendor credit period (days)" error={num(vendorDays, 365) ? undefined : '0–365'}><Input value={vendorDays} onChange={(e) => setVendorDays(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></FormField>
      </div>
      <SwitchRow title="Allow selling below zero stock" description="When off, a bill is blocked if an item doesn’t have enough stock." checked={negative} onChange={setNegative} />
    </Section>
  );
}

// ── Payments: UPI & bank ──
export function PaymentMethods() {
  const { settings } = useWorkspace();
  const save = useSaveSettings('Payment details');
  const s = (k: keyof WorkspaceSettings) => (typeof settings[k] === 'string' ? (settings[k] as string) : '');
  const [f, setF] = useState({ upiId: s('upiId'), bankName: s('bankName'), bankAccount: s('bankAccount'), bankIfsc: s('bankIfsc'), bankBranch: s('bankBranch') });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const upiOk = !f.upiId || UPI_ID_RE.test(f.upiId.trim());
  const ifscOk = !f.bankIfsc || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.bankIfsc.trim().toUpperCase());
  const accOk = !f.bankAccount || /^\d{9,18}$/.test(f.bankAccount.trim());
  return (
    <Section
      title="Payments"
      description="Used for UPI QR codes at the counter and bank details on invoices."
      footer={
        <Button
          disabled={!upiOk || !ifscOk || !accOk}
          loading={save.isPending}
          onClick={() => save.mutate({ upiId: f.upiId.trim(), bankName: sanitizeText(f.bankName, 60), bankAccount: f.bankAccount.trim(), bankIfsc: f.bankIfsc.trim().toUpperCase(), bankBranch: sanitizeText(f.bankBranch, 60) })}
        >
          Save changes
        </Button>
      }
    >
      <FormField label="UPI ID" hint="e.g. yourshop@okhdfcbank — customers pay this ID when they scan your QR." error={upiOk ? undefined : 'Enter a valid UPI ID like name@bank'}>
        <Input value={f.upiId} onChange={(e) => set('upiId', e.target.value)} placeholder="yourshop@upi" className="sm:max-w-sm" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Bank name"><Input value={f.bankName} onChange={(e) => set('bankName', e.target.value)} /></FormField>
        <FormField label="Branch"><Input value={f.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} /></FormField>
        <FormField label="Account number" error={accOk ? undefined : '9–18 digits'}><Input value={f.bankAccount} onChange={(e) => set('bankAccount', e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></FormField>
        <FormField label="IFSC" error={ifscOk ? undefined : 'IFSC looks like HDFC0001234'}><Input value={f.bankIfsc} onChange={(e) => set('bankIfsc', e.target.value.toUpperCase())} maxLength={11} className="uppercase" /></FormField>
      </div>
    </Section>
  );
}

// ── Notifications ──
export function NotificationSettings() {
  const { settings } = useWorkspace();
  const save = useSaveSettings('Notification settings');
  return (
    <Section title="Notifications" description="In-app alerts for your business.">
      <SwitchRow title="Low stock alerts" description="When a sale takes an item to or below its minimum stock." checked={settings.notifyLowStock !== false} onChange={(v) => save.mutate({ notifyLowStock: v })} />
      <p className="text-xs text-muted-foreground">Purchase receipts and replies from Sahasra support always notify you.</p>
    </Section>
  );
}


// ── Security ──

export function Security() {
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['auth', 'sessions'], queryFn: authService.sessions });
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { current: '', next: '', confirm: '' } });
  const { errors } = form.formState;
  const change = useAppMutation((v: z.infer<typeof passwordSchema>) => authService.changePassword(v.current, v.next), {
    invalidate: [['auth', 'sessions']],
    success: 'Password changed. Other devices were signed out.',
    onSuccess: () => form.reset(),
  });
  const revoke = useAppMutation((id: string) => authService.revokeSession(id), { invalidate: [['auth', 'sessions']], success: 'Device signed out' });
  const deviceIcon = (ua: string) => (/Mobi|Android|iPhone/i.test(ua) ? Smartphone : Laptop);
  const deviceName = (ua: string) => {
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return [browser, os].filter(Boolean).join(' on ');
  };
  return (
    <div className="space-y-5">
      <Section
        title="Change password"
        description="Changing your password signs you out on every other device."
        footer={<Button onClick={form.handleSubmit((v) => change.mutate(v))} loading={change.isPending}><KeyRound /> Update password</Button>}
      >
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={form.handleSubmit((v) => change.mutate(v))} noValidate>
          <FormField label="Current password" error={errors.current?.message}><Input {...form.register('current')} type="password" autoComplete="current-password" /></FormField>
          <FormField label="New password" error={errors.next?.message}><Input {...form.register('next')} type="password" autoComplete="new-password" /></FormField>
          <FormField label="Confirm new password" error={errors.confirm?.message}><Input {...form.register('confirm')} type="password" autoComplete="new-password" /></FormField>
        </form>
      </Section>
      <Section title="Signed-in devices" description="Sign out any device you don’t recognise.">
        <ul className="space-y-2">
          {(sessions.data ?? []).map((s) => {
            const Icon = deviceIcon(s.userAgent);
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <Icon className="h-5 w-5 text-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{deviceName(s.userAgent)}</p>
                  <p className="text-2xs text-muted-foreground">{s.current ? 'This device' : `Active ${timeAgo(s.lastSeenAt)}`}{s.ip ? ` · ${s.ip}` : ''}</p>
                </div>
                {s.current ? (
                  <Badge tone="success">Current</Badge>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)}><LogOut /> Sign out</Button>
                )}
              </li>
            );
          })}
          {sessions.isLoading && <li className="text-[13px] text-muted-foreground">Loading devices…</li>}
        </ul>
        {!!sessions.data?.length && sessions.data.length > 1 && (
          <Button variant="link" className="px-0" onClick={async () => { for (const s of sessions.data!.filter((x) => !x.current)) await authService.revokeSession(s.id); qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }); toast.success('Signed out of all other devices'); }}>
            Sign out all other devices
          </Button>
        )}
      </Section>
    </div>
  );
}

// ── Appearance (this device) ──
export function Appearance() {
  const { theme, setTheme } = useTheme();
  const { sidebarCollapsed, update } = useWorkspace();
  return (
    <Section title="Appearance" description="Personalise how Sahasra looks on this device.">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        {([['light', 'Light', Sun], ['dark', 'Dark', Moon]] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setTheme(value)} aria-pressed={theme === value} className={cn('overflow-hidden rounded-xl border-2 text-left transition-colors', theme === value ? 'border-primary' : 'border-border hover:border-primary/40')}>
            <div className={cn('flex h-20 gap-1.5 p-2', value === 'dark' ? 'bg-[#13111C]' : 'bg-[#FAF9FD]')}>
              <div className={cn('w-5 rounded', value === 'dark' ? 'bg-[#1B1827]' : 'bg-white')} />
              <div className="flex-1 space-y-1.5"><div className="h-3 w-2/3 rounded bg-[#6D3DE8]/70" /><div className={cn('h-8 rounded', value === 'dark' ? 'bg-[#1B1827]' : 'bg-white')} /></div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium"><Icon className="h-4 w-4" /> {label}{theme === value && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}</div>
          </button>
        ))}
      </div>
      <SwitchRow title="Compact sidebar" description="Icon-only navigation with tooltips." checked={sidebarCollapsed} onChange={(c) => update({ sidebarCollapsed: c })} />
    </Section>
  );
}

// ── Data export ──
export function Backup() {
  const { hasPermission } = useAuth();
  const [busy, setBusy] = useState<'' | 'excel' | 'csv' | 'json'>('');
  const [importing, setImporting] = useState(false);
  const canExport = hasPermission('Settings', 'export');
  const runExport = async (kind: 'excel' | 'csv' | 'json', job: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      await job();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy('');
    }
  };
  return (
    <Section title="Your data" description="Your records are stored securely on the Sahasra server. Download them any time, or bring in data from another app.">
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4 lg:flex-row lg:items-center">
        <div className="flex-1">
          <p className="text-[13px] font-semibold">Download your data</p>
          <p className="text-xs text-muted-foreground">Products, customers, vendors, sales, purchases, payments, expenses, staff and stock history.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!canExport || !!busy} loading={busy === 'excel'} onClick={() => runExport('excel', downloadExcel)}><FileSpreadsheet /> Excel</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" disabled={!canExport || !!busy} loading={busy === 'csv'}><FileText /> CSV <ChevronDown /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-auto">
              {EXPORT_DATASETS.map((d) => (
                <DropdownMenuItem key={d.key} onSelect={() => runExport('csv', async () => { const n = await downloadCsv(d.key); if (!n) toast.info(`No ${d.label.toLowerCase()} yet — the file is empty.`); })}>{d.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" disabled={!canExport || !!busy} loading={busy === 'json'} onClick={() => runExport('json', workspaceService.exportAll)}><Download /> JSON backup</Button>
        </div>
      </div>
      {!canExport && <p className="text-xs text-muted-foreground">Your role doesn’t allow downloading data.</p>}

      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-[13px] font-semibold">Import data</p>
          <p className="text-xs text-muted-foreground">Bring in products, in-house stock, customers or vendors from Excel, CSV or another software’s database (.sql). Column names don’t need to match — Sahasra works them out, updates what you already have and shows you everything before saving.</p>
        </div>
        <Button onClick={() => setImporting(true)}><Upload /> Import file</Button>
      </div>
      <ImportWizard open={importing} onOpenChange={setImporting} />
    </Section>
  );
}

