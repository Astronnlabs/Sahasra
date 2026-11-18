import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, MessageCircle, RefreshCw, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { timeAgo } from '@/lib/format';
import { openWhatsApp } from '@/lib/share';
import { cn } from '@/lib/utils';
import { salonService, type BookingSettings } from '@/services';

export const BOOKING_KEY = ['salon', 'booking'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The business's online booking link: make it, share it (copy / WhatsApp / share sheet), set
 * opening hours, and see appointments coming in from VAAHAK.
 */
export function BookingLinkModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { businessName } = useWorkspace();
  const q = useQuery({ queryKey: BOOKING_KEY, queryFn: salonService.booking, enabled: open });
  const [s, setS] = useState<BookingSettings | null>(null);
  const [busy, setBusy] = useState<'' | 'save' | 'new' | 'sync'>('');
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    if (q.data) setS(q.data.settings);
  }, [q.data]);
  useEffect(() => {
    if (!open) setConfirmNew(false);
  }, [open]);

  const state = q.data;
  const url = state?.url;
  const dirty = !!state && !!s && JSON.stringify(s) !== JSON.stringify(state.settings);

  const run = async (kind: 'save' | 'new' | 'sync', fn: () => Promise<unknown>, done: string) => {
    setBusy(kind);
    try {
      const r = (await fn()) as { imported?: number };
      await qc.invalidateQueries({ queryKey: BOOKING_KEY });
      if (kind === 'sync') await qc.invalidateQueries({ queryKey: ['salon', 'appointments'] });
      toast.success(kind === 'sync' ? `${done}${r?.imported ? ` · ${r.imported} new` : ''}` : done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy('');
    }
  };

  const message = url ? `Book your appointment at ${businessName} online: ${url}` : '';
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Booking link copied');
    } catch {
      toast.info(url);
    }
  };
  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Book at ${businessName}`, text: message, url });
      } catch {
        /* closed */
      }
    } else void copy();
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Online booking link" description="Customers open it on their phone, pick a service and a free time, and the booking appears here." size="md">
      {!state || !s ? (
        <p className="pb-6 text-[13px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5 pb-4">
          {url ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{url}</span>
                <Badge tone={state.settings.enabled ? 'success' : 'neutral'}>{state.settings.enabled ? 'Live' : 'Off'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button variant="secondary" size="sm" onClick={copy}><Copy /> Copy</Button>
                <Button variant="secondary" size="sm" onClick={() => openWhatsApp(undefined, message)}><MessageCircle /> WhatsApp</Button>
                <Button variant="secondary" size="sm" onClick={share}><Share2 /> Share</Button>
                <Button variant="secondary" size="sm" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-primary-soft p-4 text-[13px]">
              <p className="font-medium">No booking link yet.</p>
              <p className="mt-0.5 text-muted-foreground">Check the opening hours below, then press <b>Generate link</b>.</p>
              <Button className="mt-3" loading={busy === 'save'} onClick={() => run('save', () => salonService.saveBooking({ ...s, enabled: true }), 'Booking link ready')}>
                Generate link
              </Button>
            </div>
          )}

          <div className="space-y-4 rounded-xl border border-border p-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-[13px] font-medium">Accept online bookings</span>
                <span className="block text-xs text-muted-foreground">Off: the link shows “not active”.</span>
              </span>
              <Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} aria-label="Accept online bookings" />
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Opens</span>
                <Input type="time" value={s.open} onChange={(e) => setS({ ...s, open: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Closes</span>
                <Input type="time" value={s.close} onChange={(e) => setS({ ...s, close: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Start times every</span>
                <NativeSelect value={String(s.step)} onChange={(e) => setS({ ...s, step: Number(e.target.value) as BookingSettings['step'] })}>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="60">1 hour</option>
                </NativeSelect>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Book up to</span>
                <NativeSelect value={String(s.daysAhead)} onChange={(e) => setS({ ...s, daysAhead: Number(e.target.value) })}>
                  {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days ahead</option>)}
                </NativeSelect>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Bookings per time slot</span>
              <NativeSelect value={String(s.perSlot ?? 0)} onChange={(e) => setS({ ...s, perSlot: Number(e.target.value) })}>
                <option value="0">One per staff member (each person takes one customer at a time)</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} booking{n === 1 ? '' : 's'} at the same time
                  </option>
                ))}
              </NativeSelect>
              <span className="mt-1 block text-xs text-muted-foreground">
                {s.perSlot
                  ? `Up to ${s.perSlot} customer${s.perSlot === 1 ? '' : 's'} can book the same time; each goes to the least busy staff member (or the one they choose).`
                  : 'A time is free while at least one staff member is free.'}
              </span>
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-medium">Open on</span>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => {
                  const on = s.days.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setS({ ...s, days: on ? s.days.filter((x) => x !== i) : [...s.days, i].sort() })}
                      className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium', on ? 'border-primary bg-primary-light text-primary' : 'border-border text-muted-foreground')}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Customers see only free times: each service’s length and every staff member’s bookings are checked, so nobody is double-booked. Services and prices come from
              Services; staff from Employees.
            </p>
            {url && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!dirty} loading={busy === 'save'} onClick={() => run('save', () => salonService.saveBooking(s), 'Booking settings saved')}>
                  Save
                </Button>
                {confirmNew ? (
                  <Button size="sm" variant="danger-soft" loading={busy === 'new'} onClick={() => run('new', salonService.newBookingLink, 'New link made — the old link no longer works')}>
                    Yes, make a new link
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmNew(true)}>Make a new link</Button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <MessageCircle className="h-4 w-4 text-success" />
              <p className="flex-1 text-[13px] font-medium">Appointments from VAAHAK (WhatsApp)</p>
              {state.vaahak.linked && (
                <Button size="sm" variant="ghost" loading={busy === 'sync'} onClick={() => run('sync', salonService.syncVaahak, 'Checked VAAHAK')}>
                  <RefreshCw /> Sync now
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {state.vaahak.linked
                ? state.vaahak.error
                  ? `Not syncing: ${state.vaahak.error}`
                  : `Connected. In VAAHAK → Appointments, turn on “Forward to SAHAASRA” (or forward one appointment). They appear here within a minute${state.vaahak.syncedAt ? ` · last checked ${timeAgo(state.vaahak.syncedAt)}` : ''}.`
                : 'Connect VAAHAK in Settings → E-Billing first. The same connection brings appointments booked on WhatsApp into this page.'}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
