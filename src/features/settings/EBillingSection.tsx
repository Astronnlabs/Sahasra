import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, MessageCircle, RefreshCw, Send, Unplug, Wallet, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { FormField } from '@/components/forms/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAppMutation } from '@/hooks/queries';
import { formatDateTime, formatINR } from '@/lib/format';
import { ebillingService, type EBillingState, type TemplateStatus } from '@/services';
import { Section, useSaveSettings } from './SettingsSections';

export const EBILLING_KEY = ['ebilling'] as const;

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; hint: string }> = {
  APPROVED: { label: 'Approved', tone: 'success', hint: 'Bills can be sent.' },
  PENDING: { label: 'In review', tone: 'warning', hint: 'WhatsApp is reviewing the template. This usually takes a few minutes, sometimes up to a day.' },
  IN_APPEAL: { label: 'In review', tone: 'warning', hint: 'WhatsApp is reviewing the template again.' },
  REJECTED: { label: 'Rejected', tone: 'danger', hint: 'WhatsApp rejected the template. Contact Sahasra support.' },
  PAUSED: { label: 'Paused', tone: 'danger', hint: 'WhatsApp paused the template because customers reported or blocked messages.' },
  DISABLED: { label: 'Disabled', tone: 'danger', hint: 'WhatsApp disabled the template.' },
  NOT_CREATED: { label: 'Not created', tone: 'neutral', hint: 'Press “Check status” to create it.' },
};
const statusOf = (s: TemplateStatus) => STATUS[s] ?? { label: s, tone: 'neutral' as const, hint: '' };

export function EBillingSection() {
  const qc = useQueryClient();
  const { settings } = useWorkspace();
  const state = useQuery({ queryKey: EBILLING_KEY, queryFn: ebillingService.get });
  const set = (data: EBillingState) => qc.setQueryData(EBILLING_KEY, data);

  if (state.isLoading) return <Section title="E-Billing on WhatsApp"><p className="text-[13px] text-muted-foreground">Loading…</p></Section>;
  if (!state.data) return <Section title="E-Billing on WhatsApp"><p className="text-[13px] text-danger">Could not load e-billing settings. Refresh the page to try again.</p></Section>;
  const s = state.data;
  const approved = s.setup?.templateStatus === 'APPROVED';
  const enabled = settings.eBillingEnabled === true;

  return (
    <div className="space-y-5">
      <Section title="E-Billing on WhatsApp" description="Send every bill to your customer’s WhatsApp automatically, from your own WhatsApp Business number.">
        {!s.serverReady && (
          <Notice tone="danger" icon={AlertTriangle}>E-billing is not switched on for SAHASRA yet. Please contact Sahasra support.</Notice>
        )}
        <EnableRow enabled={enabled} canEnable={!!s.setup && approved} price={s.price} />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" /> {formatINR(s.price, true)} is taken from your <Link to="/settings?section=wallet" className="font-medium text-primary hover:underline">wallet</Link> for each bill sent. Bills go only to customers saved with a mobile number. Walk-in bills are not sent.
        </p>
      </Section>

      {s.setup ? <Connected state={s} onChange={set} /> : <ConnectForm disabled={!s.serverReady} onChange={set} />}

      <TemplatePreview state={s} />
      <MessageLog />
    </div>
  );
}

function Notice({ tone, icon: Icon, children }: { tone: 'danger' | 'warning' | 'info'; icon: typeof AlertTriangle; children: ReactNode }) {
  const cls = tone === 'danger' ? 'border-danger/30 bg-danger-soft text-danger' : tone === 'warning' ? 'border-warning/30 bg-warning-soft text-[#8a5f07] dark:text-warning' : 'border-primary/20 bg-primary-light text-primary';
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function EnableRow({ enabled, canEnable, price }: { enabled: boolean; canEnable: boolean; price: number }) {
  const save = useSaveSettings('E-billing');
  const blocked = !enabled && !canEnable;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface/40 p-4">
      <div>
        <p className="text-[14px] font-semibold">Send bills on WhatsApp automatically</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {blocked ? 'Connect your WhatsApp number below and wait for the bill template to be approved, then turn this on.' : enabled ? `On. Each bill is sent as soon as it is saved (${formatINR(price, true)} per bill).` : 'Off. Bills are not sent on WhatsApp.'}
        </p>
      </div>
      <Switch checked={enabled} disabled={blocked || save.isPending} onCheckedChange={(v) => save.mutate({ eBillingEnabled: v })} aria-label="Send bills on WhatsApp automatically" />
    </div>
  );
}

function ConnectForm({ disabled, onChange }: { disabled: boolean; onChange: (s: EBillingState) => void }) {
  const [f, setF] = useState({ phoneNumberId: '', wabaId: '', accessToken: '' });
  const connect = useAppMutation(ebillingService.connect, { invalidate: [], success: 'WhatsApp connected', onSuccess: onChange });
  const valid = /^\d{6,25}$/.test(f.phoneNumberId.trim()) && /^\d{6,25}$/.test(f.wabaId.trim()) && f.accessToken.trim().length >= 20;
  return (
    <Section
      title="Connect your WhatsApp Business number"
      description="Uses the official WhatsApp Business Platform (Cloud API). Your access token is stored encrypted and is never shown again."
      footer={<Button disabled={disabled || !valid} loading={connect.isPending} onClick={() => connect.mutate({ phoneNumberId: f.phoneNumberId.trim(), wabaId: f.wabaId.trim(), accessToken: f.accessToken.trim() })}>Connect WhatsApp</Button>}
    >
      <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
        <li>Open <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">WhatsApp Manager <ExternalLink className="h-3 w-3" /></a> and copy your <b>WhatsApp Business Account ID</b>.</li>
        <li>In the Meta app’s <b>WhatsApp → API setup</b>, copy the <b>Phone number ID</b> of the number customers should receive bills from.</li>
        <li>In <b>Business settings → System users</b>, generate a <b>permanent token</b> with <i>whatsapp_business_messaging</i> and <i>whatsapp_business_management</i>.</li>
        <li>Make sure a payment method is added in WhatsApp Manager. WhatsApp charges for each message.</li>
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Phone number ID"><Input value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="e.g. 123456789012345" /></FormField>
        <FormField label="WhatsApp Business Account ID"><Input value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="e.g. 102345678901234" /></FormField>
      </div>
      <FormField label="Permanent access token" hint="Starts with EAA… Paste it once; SAHASRA keeps it encrypted.">
        <Input type="password" autoComplete="off" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} placeholder="EAA…" />
      </FormField>
    </Section>
  );
}

function Connected({ state, onChange }: { state: EBillingState; onChange: (s: EBillingState) => void }) {
  const setup = state.setup!;
  const st = statusOf(setup.templateStatus);
  const refresh = useAppMutation(() => ebillingService.refreshTemplate(), { invalidate: [], onSuccess: onChange });
  const disconnect = useAppMutation(() => ebillingService.disconnect(), { invalidate: [], success: 'WhatsApp disconnected. E-billing is off.', onSuccess: onChange });
  // Disconnecting also turns e-billing off on the server; reload the session so the switch shows it.
  const { refresh: reloadSession } = useAuth();
  const [phone, setPhone] = useState('');
  const test = useAppMutation((p: string) => ebillingService.sendTest(p), { invalidate: [['wallet']], success: (r) => `Test bill sent. ${formatINR(r.charged, true)} taken from your wallet.` });
  const approved = setup.templateStatus === 'APPROVED';

  return (
    <Section
      title="WhatsApp number"
      description="Bills are sent from this number."
      footer={
        <Button
          variant="ghost"
          className="text-danger hover:text-danger"
          loading={disconnect.isPending}
          onClick={async () => {
            if (!window.confirm('Disconnect this WhatsApp number? E-billing will be turned off.')) return;
            await disconnect.mutateAsync(undefined);
            await reloadSession();
          }}
        >
          <Unplug /> Disconnect
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#128C7E]"><MessageCircle className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{setup.verifiedName || 'WhatsApp Business'}</p>
          <p className="text-xs text-muted-foreground">{setup.displayPhone || setup.phoneNumberId} · Account {setup.wabaId}</p>
        </div>
        <Badge tone="success" dot>Connected</Badge>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium">
            Bill template <code className="rounded bg-surface px-1.5 py-0.5 text-2xs">{state.template.name}</code>
            <Badge tone={st.tone}>{st.label}</Badge>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{st.hint}{setup.templateReason ? ` Reason: ${setup.templateReason}.` : ''}</p>
        </div>
        <Button variant="secondary" size="sm" loading={refresh.isPending} onClick={() => refresh.mutate(undefined)}><RefreshCw /> Check status</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <FormField label="Send a test bill" hint={approved ? `Sends a sample bill to this number (${formatINR(state.price, true)} from your wallet).` : 'Available once the template is approved.'}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))} inputMode="tel" maxLength={13} placeholder="10-digit mobile number" disabled={!approved} />
        </FormField>
        <Button variant="secondary" disabled={!approved || phone.replace(/\D/g, '').length < 10} loading={test.isPending} onClick={() => test.mutate(phone)}><Send /> Send test</Button>
      </div>
    </Section>
  );
}

function TemplatePreview({ state }: { state: EBillingState }) {
  const { businessName } = useWorkspace();
  const values = [...state.template.example];
  values[1] = businessName || values[1];
  const text = state.template.preview.replace(/\{\{(\d)\}\}/g, (_, n) => values[Number(n) - 1] ?? '');
  return (
    <Section title="What your customer receives" description="WhatsApp shows this message from your business number. The details change for every bill.">
      <div className="rounded-2xl bg-[#e5ddd5] p-4 dark:bg-[#0b141a]">
        <div className="max-w-sm whitespace-pre-line rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
          {text}
          <p className="mt-1 text-2xs text-[#667781] dark:text-[#8696a0]">{state.template.footer}</p>
        </div>
      </div>
    </Section>
  );
}

const MSG_STATUS = {
  sent: { label: 'Sent', tone: 'success', icon: CheckCircle2 },
  sending: { label: 'Sending', tone: 'warning', icon: Clock3 },
  failed: { label: 'Failed', tone: 'danger', icon: XCircle },
  skipped: { label: 'Not sent', tone: 'neutral', icon: AlertTriangle },
} as const;

function MessageLog() {
  const q = useQuery({ queryKey: ['ebilling', 'messages'], queryFn: ebillingService.messages, refetchInterval: 30000 });
  const rows = q.data ?? [];
  return (
    <Section title="Recent bills on WhatsApp" description="The last 100 bills and whether they were sent.">
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No bills sent yet.</p>
      ) : (
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-2xs uppercase tracking-wider text-subtle">
                <th className="px-6 py-2 font-medium">Bill</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-6 py-2 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const st = MSG_STATUS[m.status] ?? MSG_STATUS.skipped;
                return (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-2.5 font-medium">{m.invoiceNo}</td>
                    <td className="px-3 py-2.5">
                      <span className="block">{m.customer}</span>
                      <span className="block text-2xs text-muted-foreground">{m.to ? `+${m.to}` : '—'}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {m.error && <span className="mt-0.5 block max-w-[260px] text-2xs text-muted-foreground">{m.error}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{m.charged ? formatINR(m.charged, true) : '—'}</td>
                    <td className="px-6 py-2.5 text-right text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</td>
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
