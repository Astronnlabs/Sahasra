import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCheck, CheckCircle2, Clock3, Link2, MessageCircle, RefreshCw, Send, Unplug, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { FormField } from '@/components/forms/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAppMutation } from '@/hooks/queries';
import { formatDateTime, formatINR } from '@/lib/format';
import { ebillingService, type BillMessageRow, type EBillingState, type TemplateStatus } from '@/services';
import { Section, useSaveSettings } from './SettingsSections';

export const EBILLING_KEY = ['ebilling'] as const;

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; hint: string }> = {
  APPROVED: { label: 'Approved', tone: 'success', hint: 'Bills can be sent.' },
  PENDING: { label: 'In review', tone: 'warning', hint: 'WhatsApp is reviewing the bill template. This usually takes a few minutes.' },
  IN_APPEAL: { label: 'In review', tone: 'warning', hint: 'WhatsApp is reviewing the template again.' },
  REJECTED: { label: 'Rejected', tone: 'danger', hint: 'WhatsApp rejected the bill template. Contact support.' },
  PAUSED: { label: 'Paused', tone: 'danger', hint: 'WhatsApp paused the template because customers reported or blocked messages.' },
  DISABLED: { label: 'Disabled', tone: 'danger', hint: 'WhatsApp disabled the template.' },
  NOT_CREATED: { label: 'Not created', tone: 'neutral', hint: 'Press “Check status” to create it.' },
  ERROR: { label: 'Error', tone: 'danger', hint: 'VAAHAK could not read the template from WhatsApp.' },
};
const statusOf = (s: TemplateStatus) => STATUS[s] ?? { label: s, tone: 'neutral' as const, hint: '' };

const DEFAULT_BODY = 'Hi {{1}}, thank you for your purchase at {{2}}!\n\nBill no: {{3}}\nAmount: Rs. {{4}}\nDate: {{5}}\n\nPlease keep this message for your records.';

export function EBillingSection() {
  const qc = useQueryClient();
  const { settings } = useWorkspace();
  const state = useQuery({ queryKey: EBILLING_KEY, queryFn: () => ebillingService.get() });
  const set = (data: EBillingState) => qc.setQueryData(EBILLING_KEY, data);

  if (state.isLoading) return <Section title="E-Billing on WhatsApp"><p className="text-[13px] text-muted-foreground">Loading… (VAAHAK can take up to a minute to wake up)</p></Section>;
  if (!state.data) return <Section title="E-Billing on WhatsApp"><p className="text-[13px] text-danger">Could not load e-billing settings. Refresh the page to try again.</p></Section>;
  const s = state.data;
  const a = s.account;
  const ready = !!a && a.whatsapp.connected && a.template.status === 'APPROVED';
  const enabled = settings.eBillingEnabled === true;
  const lowWallet = !!a && a.wallet.balance < a.wallet.pricePerBill * 20;

  return (
    <div className="space-y-5">
      <Section title="E-Billing on WhatsApp" description="Every bill is sent to your customer’s WhatsApp automatically, from your WhatsApp number connected in VAAHAK.">
        {!s.serverReady && <Notice tone="danger" icon={AlertTriangle}>E-billing is not switched on for SAHAASRA yet. Please contact Sahaasra support.</Notice>}
        <EnableRow enabled={enabled} canEnable={!!s.link && ready} />
        {s.link && lowWallet && (
          <Notice tone="warning" icon={AlertTriangle}>
            {a!.wallet.balance < a!.wallet.pricePerBill ? 'Your VAAHAK wallet is empty, so bills are not being sent.' : 'Your VAAHAK wallet is running low.'} Recharge it in VAAHAK → Wallet &amp; e-bills.
          </Notice>
        )}
        <p className="text-xs text-muted-foreground">
          The cost of each bill sent is deducted from your VAAHAK wallet. Bills go only to customers saved with a mobile number. Walk-in bills are not sent.
        </p>
      </Section>

      {s.link ? <Connected state={s} onChange={set} /> : <ConnectForm disabled={!s.serverReady} onChange={set} />}

      <TemplatePreview body={a?.template.body ?? DEFAULT_BODY} footer={a?.template.footer ?? 'Sent via VAAHAK'} />
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

function EnableRow({ enabled, canEnable }: { enabled: boolean; canEnable: boolean }) {
  const save = useSaveSettings('E-billing');
  const blocked = !enabled && !canEnable;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface/40 p-4">
      <div>
        <p className="text-[14px] font-semibold">Send bills on WhatsApp automatically</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {blocked ? 'Connect VAAHAK below. Once your WhatsApp number is connected in VAAHAK and the bill template is approved, turn this on.' : enabled ? 'On. Each bill is sent as soon as it is saved.' : 'Off. Bills are not sent on WhatsApp.'}
        </p>
      </div>
      <Switch checked={enabled} disabled={blocked || save.isPending} onCheckedChange={(v) => save.mutate({ eBillingEnabled: v })} aria-label="Send bills on WhatsApp automatically" />
    </div>
  );
}

function ConnectForm({ disabled, onChange }: { disabled: boolean; onChange: (s: EBillingState) => void }) {
  const [f, setF] = useState({ accountId: '', key: '' });
  const connect = useAppMutation(ebillingService.connect, { invalidate: [], success: 'VAAHAK connected', onSuccess: onChange });
  const valid = f.accountId.trim().length >= 10 && f.key.trim().startsWith('vk_live_');
  return (
    <Section
      title="Connect VAAHAK"
      description="VAAHAK sends the bills on your WhatsApp number and takes the cost from your VAAHAK wallet."
      footer={<Button disabled={disabled || !valid} loading={connect.isPending} onClick={() => connect.mutate({ accountId: f.accountId.trim(), key: f.key.trim() })}><Link2 /> Connect VAAHAK</Button>}
    >
      <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
        <li>Sign in to <b>VAAHAK</b> and connect your WhatsApp Business number (Integrations).</li>
        <li>Open <b>Wallet &amp; e-bills</b>, copy your <b>Account ID</b> and press <b>Create key</b>.</li>
        <li>Paste both here and press <b>Connect VAAHAK</b>.</li>
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="VAAHAK Account ID"><Input value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value.trim() })} autoComplete="off" placeholder="e.g. cmuis6kra0004f0v7yenitb5r" /></FormField>
        <FormField label="Connection key" hint="Starts with vk_live_. SAHAASRA keeps it encrypted.">
          <Input type="password" autoComplete="off" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.trim() })} placeholder="vk_live_…" />
        </FormField>
      </div>
    </Section>
  );
}

function Connected({ state, onChange }: { state: EBillingState; onChange: (s: EBillingState) => void }) {
  const link = state.link!;
  const a = state.account;
  const st = statusOf(a?.template.status ?? 'NOT_CREATED');
  const refresh = useAppMutation(() => ebillingService.get(true), { invalidate: [], onSuccess: onChange });
  const disconnect = useAppMutation(() => ebillingService.disconnect(), { invalidate: [], success: 'VAAHAK disconnected. E-billing is off.', onSuccess: onChange });
  // Disconnecting also turns e-billing off on the server; reload the session so the switch shows it.
  const { refresh: reloadSession } = useAuth();
  const [phone, setPhone] = useState('');
  const test = useAppMutation((p: string) => ebillingService.sendTest(p), { invalidate: [['ebilling', 'messages']], success: (r) => `Test bill sent on WhatsApp (${formatINR(r.charged, true)} from your VAAHAK wallet).` });
  const ready = !!a && a.whatsapp.connected && a.template.status === 'APPROVED';

  return (
    <Section
      title="VAAHAK"
      description="Bills are sent through this VAAHAK account."
      footer={
        <Button
          variant="ghost"
          className="text-danger hover:text-danger"
          loading={disconnect.isPending}
          onClick={async () => {
            if (!window.confirm('Disconnect VAAHAK? E-billing will be turned off.')) return;
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
          <p className="text-[14px] font-semibold">{a?.businessName || link.businessName || 'VAAHAK'}</p>
          <p className="text-xs text-muted-foreground">
            {a ? (a.whatsapp.connected ? `WhatsApp ${a.whatsapp.phone}${a.whatsapp.verifiedName ? ` · ${a.whatsapp.verifiedName}` : ''}` : 'No WhatsApp number connected in VAAHAK yet') : 'Account'} · Key {link.keyPrefix}…
          </p>
        </div>
        {state.accountError ? <Badge tone="danger" dot>Not reachable</Badge> : <Badge tone="success" dot>Connected</Badge>}
      </div>

      {state.accountError && <Notice tone="danger" icon={AlertTriangle}>{state.accountError}</Notice>}
      {a && !a.whatsapp.connected && <Notice tone="warning" icon={AlertTriangle}>Connect your WhatsApp Business number in VAAHAK → Integrations. VAAHAK then creates the bill template on it.</Notice>}

      {a?.whatsapp.connected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[13px] font-medium">
              Bill template <code className="rounded bg-surface px-1.5 py-0.5 text-2xs">{a.template.name}</code>
              <Badge tone={st.tone}>{st.label}</Badge>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{st.hint}{a.template.reason ? ` ${a.template.reason}` : ''}</p>
            {a.pdfTemplate && (
              <>
                <p className="mt-2.5 flex items-center gap-2 text-[13px] font-medium">
                  Bill PDF attached <code className="rounded bg-surface px-1.5 py-0.5 text-2xs">{a.pdfTemplate.name}</code>
                  <Badge tone={statusOf(a.pdfTemplate.status).tone}>{statusOf(a.pdfTemplate.status).label}</Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.pdfTemplate.status === 'APPROVED'
                    ? 'Customers get the bill PDF with the message.'
                    : 'Same message with the bill PDF attached. Until WhatsApp approves it, bills are sent as the message only.'}
                  {a.pdfTemplate.reason ? ` ${a.pdfTemplate.reason}` : ''}
                </p>
              </>
            )}
          </div>
          <Button variant="secondary" size="sm" loading={refresh.isPending} onClick={() => refresh.mutate(undefined)}><RefreshCw /> Check status</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <FormField label="Send a test bill" hint={ready ? 'Sends a real sample bill to this number on WhatsApp.' : 'Available once WhatsApp is connected in VAAHAK and the template is approved.'}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))} inputMode="tel" maxLength={13} placeholder="10-digit mobile number" disabled={!ready} />
        </FormField>
        <Button variant="secondary" disabled={!ready || phone.replace(/\D/g, '').length < 10} loading={test.isPending} onClick={() => test.mutate(phone)}><Send /> Send test</Button>
      </div>
    </Section>
  );
}

function TemplatePreview({ body, footer }: { body: string; footer: string }) {
  const { businessName } = useWorkspace();
  const values = ['Rahul', businessName || 'Your business', 'INV-0042', '1,250', '08 Nov 2026, 1:15 pm'];
  const text = body.replace(/\{\{(\d)\}\}/g, (_, n) => values[Number(n) - 1] ?? '');
  return (
    <Section title="What your customer receives" description="WhatsApp shows this message from your business number. The details change for every bill.">
      <div className="rounded-2xl bg-[#e5ddd5] p-4 dark:bg-[#0b141a]">
        <div className="max-w-sm whitespace-pre-line rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
          {text}
          <p className="mt-1 text-2xs text-[#667781] dark:text-[#8696a0]">{footer}</p>
        </div>
      </div>
    </Section>
  );
}

function statusBadge(m: BillMessageRow) {
  if (m.status === 'failed') return <Badge tone="danger"><XCircle className="h-3 w-3" /> Failed</Badge>;
  if (m.status === 'skipped') return <Badge tone="neutral"><AlertTriangle className="h-3 w-3" /> Not sent</Badge>;
  if (m.status === 'sending') return <Badge tone="warning"><Clock3 className="h-3 w-3" /> Sending</Badge>;
  if (m.delivery === 'read') return <Badge tone="info"><CheckCheck className="h-3 w-3" /> Read</Badge>;
  if (m.delivery === 'delivered') return <Badge tone="success"><CheckCheck className="h-3 w-3" /> Delivered</Badge>;
  return <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Sent</Badge>;
}

function MessageLog() {
  const q = useQuery({ queryKey: ['ebilling', 'messages'], queryFn: ebillingService.messages, refetchInterval: 20000 });
  const rows = q.data ?? [];
  return (
    <Section title="Recent bills on WhatsApp" description="The last 100 bills. Updates live: sent → delivered → read.">
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
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-2.5 font-medium">{m.invoiceNo}</td>
                  <td className="px-3 py-2.5">
                    <span className="block">{m.customer}</span>
                    <span className="block text-2xs text-muted-foreground">{m.to ? `+${m.to}` : '—'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {statusBadge(m)}
                    {m.error && m.status !== 'sent' && <span className="mt-0.5 block max-w-[260px] text-2xs text-muted-foreground">{m.error}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{m.charged ? formatINR(m.charged, true) : '—'}</td>
                  <td className="px-6 py-2.5 text-right text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
