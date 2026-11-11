import { Bluetooth, BluetoothSearching, Download, Loader2, Plus, Printer, RefreshCw, Settings2, Smartphone, Trash2, Unplug } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { inNativeApp, onNativeEvent, type NativeDevice } from '@/lib/bluetooth/native';
import {
  addNativePrinter,
  addWebPrinter,
  bluetoothMode,
  connectPrinter,
  disconnectPrinter,
  DOTS_FOR,
  nativePairedDevices,
  nativeScan,
  nativeStopScan,
  NeedsTapError,
  prepareNativeBluetooth,
  PROTOCOL_LABEL,
  receiptOptions,
  removePrinter,
  reselectWebPrinter,
  safeId,
  updatePrinter,
  useBluetoothPrinters,
  type ConnState,
  type SavedPrinter,
} from '@/lib/bluetooth/printers';
import { ENCODINGS, type PrinterEncoding } from '@/lib/escpos/encoding';
import { testPageToEscPos } from '@/lib/escpos/receipt';
import { bluetoothChoice, isMobileDevice, SAHAASRA_ANDROID_APP, savePrinterSettings, type PrinterSettings, type PrintJob } from '@/lib/printer';
import { DuplicateJobError, printOnBluetooth } from '@/lib/printJobs';
import { cn } from '@/lib/utils';

const DOT: Record<ConnState, string> = { connected: 'bg-success', printing: 'bg-primary animate-pulse', connecting: 'bg-warning animate-pulse', disconnected: 'bg-subtle', error: 'bg-danger' };
const STATE_TEXT: Record<ConnState, string> = { connected: 'Connected', printing: 'Printing…', connecting: 'Connecting…', disconnected: 'Not connected', error: 'Not connected' };
const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/** Sends the test page to a Bluetooth printer. */
async function testPrint(p: SavedPrinter) {
  try {
    const r = await printOnBluetooth({
      kind: 'test',
      reference: `TEST-${p.id}`,
      printerId: p.id,
      copies: 1,
      build: () => testPageToEscPos(p.name, receiptOptions(p), `${p.paper} mm · ${p.dots} dots`),
    });
    if (r.status === 'printed') toast.success(`Test page sent to ${p.name}`, { description: 'Check the ruler reaches the right edge. If not, change the paper size in the printer’s settings.' });
    else if (r.status === 'failed') toast.error(`Test print failed: ${r.error}`);
  } catch (e) {
    if (e instanceof DuplicateJobError) toast.info('The test page is already printing.');
    else toast.error(e instanceof Error ? e.message : 'Test print failed.');
  }
}

export function BluetoothPrinters({ settings, hasKot, computerConnected }: { settings: PrinterSettings; hasKot: boolean; computerConnected: boolean }) {
  const { printers, conns } = useBluetoothPrinters();
  const [mode] = useState(bluetoothMode);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SavedPrinter | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const usedFor = (id: string, job: PrintJob) => settings[job].printer === bluetoothChoice(id);
  const useFor = (id: string, job: PrintJob) => {
    savePrinterSettings({ ...settings, [job]: { ...settings[job], printer: bluetoothChoice(id) } });
    toast.success(job === 'bill' ? 'Bills will print on this printer (POS and auto-print).' : 'KOTs will print on this printer.');
  };

  const connect = async (p: SavedPrinter) => {
    setBusy(p.id);
    try {
      if (p.protocol === 'web-le') {
        try {
          await connectPrinter(p.id);
        } catch (e) {
          // After a page reload Chrome needs the printer picked again (this tap allows it).
          if (e instanceof NeedsTapError) await reselectWebPrinter(p.id);
          else throw e;
        }
      } else await connectPrinter(p.id);
      toast.success(`${p.name} connected`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setBusy(null);
    }
  };

  /** A newly added printer becomes the bill printer when this device has none (e.g. a phone). */
  const onAdded = (p: SavedPrinter) => {
    setAdding(false);
    // Not when a computer printer (SAHAASRA Printer for Windows) already prints the bills.
    const noBillPrinter = !settings.bill.printer && (isMobileDevice() || inNativeApp() || !computerConnected);
    if (noBillPrinter) {
      savePrinterSettings({ ...settings, bill: { ...settings.bill, printer: bluetoothChoice(p.id) } });
      toast.success(`${p.name} added and set as the bill printer`, { description: 'Print a test page to check the paper width.' });
    } else toast.success(`${p.name} added`, { description: 'Choose “Use for bills” to print bills on it.' });
  };

  return (
    <div className="rounded-xl border border-border">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <Bluetooth className="h-4 w-4 text-primary" />
        <p className="flex-1 text-[13px] font-semibold">Bluetooth printers on this device</p>
        <Badge tone={mode === 'none' ? 'neutral' : 'primary'}>{mode === 'native' ? 'SAHAASRA app' : mode === 'web' ? 'Chrome · BLE' : 'Not available here'}</Badge>
        {mode !== 'none' && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add printer
          </Button>
        )}
      </div>

      {mode === 'none' && (
        <div className="space-y-3 px-4 py-4 text-[13px] text-muted-foreground">
          <p>
            This browser can’t use Bluetooth. To print receipts from an Android phone or tablet, install the <b className="text-foreground">SAHAASRA Android app</b> — it prints on
            Bluetooth thermal printers (58 mm and 80 mm) directly, without the printer maker’s app and without their advertisements.
          </p>
          <p className="text-xs">On iPhone/iPad, print with the print window (AirPrint printers) or share the bill as a PDF.</p>
          <AppDownload />
        </div>
      )}
      {mode === 'web' && (
        <div className="flex flex-col gap-3 border-b border-border bg-surface/50 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p className="flex-1">
            Chrome can print on <b className="text-foreground">Bluetooth LE</b> printers. Most handheld receipt printers use <b className="text-foreground">Bluetooth Classic</b> — for
            those{isAndroid() ? ', install the SAHAASRA Android app' : ', use the SAHAASRA Android app on a phone'}.
          </p>
          {isAndroid() && <AppDownload small />}
        </div>
      )}

      {printers.length > 0 ? (
        <ul className="divide-y divide-border">
          {printers.map((p) => {
            const c = conns[p.id] ?? { state: 'disconnected' as const };
            const live = c.state === 'connected' || c.state === 'printing';
            const reachable = p.protocol === 'web-le' ? mode !== 'none' : mode === 'native';
            return (
              <li key={p.id} className="space-y-3 px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT[c.state])} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                      {p.name}
                      {usedFor(p.id, 'bill') && <Badge tone="primary">Bills · default</Badge>}
                      {hasKot && usedFor(p.id, 'kot') && <Badge tone="warning">KOT</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {PROTOCOL_LABEL[p.protocol]} · {p.paper} mm · {safeId(p)}
                    </p>
                    <p className={cn('text-xs', c.state === 'error' ? 'text-danger' : 'text-muted-foreground')}>
                      {reachable ? (c.state === 'error' || c.state === 'disconnected') && c.message ? `${STATE_TEXT[c.state]} — ${c.message}` : STATE_TEXT[c.state] : 'Open SAHAASRA in the Android app to use this printer'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-5">
                  {reachable &&
                    (live ? (
                      <Button variant="secondary" size="sm" onClick={() => disconnectPrinter(p.id)} disabled={c.state === 'printing'}>
                        <Unplug /> Disconnect
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => connect(p)} loading={busy === p.id || c.state === 'connecting'}>
                        <Bluetooth /> Connect
                      </Button>
                    ))}
                  {reachable && (
                    <Button variant="secondary" size="sm" onClick={() => testPrint(p)} disabled={c.state === 'printing'}>
                      <Printer /> Test print
                    </Button>
                  )}
                  {!usedFor(p.id, 'bill') && (
                    <Button variant="secondary" size="sm" onClick={() => useFor(p.id, 'bill')}>
                      Use for bills
                    </Button>
                  )}
                  {hasKot && !usedFor(p.id, 'kot') && (
                    <Button variant="secondary" size="sm" onClick={() => useFor(p.id, 'kot')}>
                      Use for KOT
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                    <Settings2 /> Settings
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        mode !== 'none' && (
          <p className="px-4 py-4 text-[13px] text-muted-foreground">
            No Bluetooth printer yet. Switch the printer on, then press <b className="text-foreground">Add printer</b>.
          </p>
        )
      )}

      {adding && <AddPrinterModal mode={mode} onClose={() => setAdding(false)} onAdded={onAdded} />}
      {editing && (
        <PrinterSettingsModal
          printer={printers.find((x) => x.id === editing.id) ?? editing}
          onClose={() => setEditing(null)}
          onRemove={async () => {
            const id = editing.id;
            setEditing(null);
            await removePrinter(id);
            // Jobs that used it go back to the print window.
            const next = { ...settings };
            (['bill', 'kot'] as const).forEach((j) => {
              if (next[j].printer === bluetoothChoice(id)) next[j] = { ...next[j], printer: '' };
            });
            savePrinterSettings(next);
            toast.success('Printer removed');
          }}
        />
      )}
    </div>
  );
}

function AppDownload({ small }: { small?: boolean }) {
  return (
    <Button asChild size={small ? 'sm' : 'md'} variant={small ? 'secondary' : 'primary'}>
      <a href={SAHAASRA_ANDROID_APP} download="SAHAASRA.apk">
        <Download /> Download Android app
      </a>
    </Button>
  );
}

/* ───────────────────────── add printer ───────────────────────── */

const TYPE_LABEL: Record<NativeDevice['type'], string> = { classic: 'Bluetooth Classic', le: 'Bluetooth LE', dual: 'Classic + LE', unknown: 'Bluetooth' };

function AddPrinterModal({ mode, onClose, onAdded }: { mode: 'native' | 'web' | 'none'; onClose: () => void; onAdded: (p: SavedPrinter) => void }) {
  const [paper, setPaper] = useState<58 | 80>(58);
  const [ready, setReady] = useState(mode === 'web');
  const [problem, setProblem] = useState<string | null>(null);
  const [paired, setPaired] = useState<NativeDevice[]>([]);
  const [found, setFound] = useState<NativeDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const prepare = async () => {
    setProblem(null);
    try {
      await prepareNativeBluetooth();
      setPaired(await nativePairedDevices());
      setReady(true);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Bluetooth is not available.');
    }
  };

  useEffect(() => {
    if (mode !== 'native') return;
    void prepare();
    const off = onNativeEvent((e) => {
      if (e.event === 'device-found') setFound((list) => (list.some((d) => d.address === e.data.address) ? list : [...list, e.data]));
    });
    return () => {
      off();
      void nativeStopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const scan = async () => {
    setFound([]);
    setScanning(true);
    try {
      await nativeScan(12);
      setPaired(await nativePairedDevices());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setScanning(false);
    }
  };

  const add = async (d: NativeDevice, protocol: 'classic' | 'le') => {
    setConnecting(d.address + protocol);
    try {
      await nativeStopScan();
      onAdded(await addNativePrinter(d, protocol, paper));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not connect.', {
        description: protocol === 'classic' && d.type === 'dual' ? 'You can also try connecting with Bluetooth LE.' : 'Check the printer is on, nearby and not connected to another phone.',
      });
    } finally {
      setConnecting(null);
    }
  };

  const addWeb = async () => {
    setConnecting('web');
    try {
      onAdded(await addWebPrinter(paper));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setConnecting(null);
    }
  };

  const others = found.filter((d) => !paired.some((p) => p.address === d.address));
  const sortPrinters = (l: NativeDevice[]) => [...l].sort((a, b) => Number(b.printer) - Number(a.printer) || a.name.localeCompare(b.name));

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Add Bluetooth printer" description="Switch the printer on and keep it near this device." size="md">
      <div className="space-y-5 pb-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Paper width</span>
          <div className="grid grid-cols-2 gap-2">
            {([58, 80] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setPaper(w)}
                className={cn('rounded-xl border px-3 py-3 text-[13px] font-medium transition-all', paper === w ? 'border-primary bg-primary-light text-primary ring-2 ring-primary/15' : 'border-border hover:border-primary/40')}
              >
                {w} mm{w === 58 ? ' (2 inch)' : ' (3 inch)'}
              </button>
            ))}
          </div>
        </label>

        {mode === 'web' && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">Chrome will list nearby Bluetooth devices. Pick your printer from the list.</p>
            <Button size="lg" className="w-full" onClick={addWeb} loading={connecting === 'web'}>
              <BluetoothSearching /> Choose printer
            </Button>
            <p className="text-xs text-muted-foreground">Printer not in the list or “no printing service”? It is probably a Bluetooth Classic printer — use the SAHAASRA Android app.</p>
          </div>
        )}

        {mode === 'native' && problem && (
          <div className="rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger">
            <p>{problem}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={prepare}>
              <RefreshCw /> Try again
            </Button>
          </div>
        )}

        {mode === 'native' && !problem && !ready && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking Bluetooth…
          </p>
        )}

        {mode === 'native' && ready && (
          <>
            <DeviceList title="Paired printers" empty="No paired devices. Search below, or pair the printer in the phone’s Bluetooth settings (PIN is usually 0000 or 1234)." devices={sortPrinters(paired)} connecting={connecting} onAdd={add} />
            <div>
              <Button variant="secondary" className="w-full" onClick={scan} loading={scanning}>
                <BluetoothSearching /> {scanning ? 'Searching nearby…' : 'Search for printers'}
              </Button>
            </div>
            {(scanning || others.length > 0) && (
              <DeviceList title="Found nearby" empty="Searching… make sure the printer is switched on." devices={sortPrinters(others)} connecting={connecting} onAdd={add} />
            )}
            <p className="text-xs text-muted-foreground">If Android asks for a PIN when connecting, try 0000 or 1234 (see the printer’s manual).</p>
          </>
        )}
      </div>
    </Modal>
  );
}

function DeviceList({ title, empty, devices, connecting, onAdd }: { title: string; empty: string; devices: NativeDevice[]; connecting: string | null; onAdd: (d: NativeDevice, p: 'classic' | 'le') => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {devices.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {devices.map((d) => (
            <li key={d.address} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', d.printer ? 'bg-primary-light text-primary' : 'bg-surface text-subtle')}>
                {d.printer ? <Printer className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{d.name || 'Unnamed device'}</p>
                <p className="text-xs text-muted-foreground">
                  {TYPE_LABEL[d.type]} · ••:{d.address.split(':').slice(-2).join(':')}
                  {d.printer ? ' · printer' : ''}
                </p>
              </div>
              <div className="flex gap-1.5">
                {d.type !== 'le' && (
                  <Button size="sm" onClick={() => onAdd(d, 'classic')} loading={connecting === d.address + 'classic'} disabled={!!connecting}>
                    Connect
                  </Button>
                )}
                {(d.type === 'le' || d.type === 'dual') && (
                  <Button size="sm" variant={d.type === 'le' ? 'primary' : 'ghost'} onClick={() => onAdd(d, 'le')} loading={connecting === d.address + 'le'} disabled={!!connecting}>
                    {d.type === 'le' ? 'Connect' : 'Use LE'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

/* ───────────────────────── printer settings ───────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function PrinterSettingsModal({ printer: p, onClose, onRemove }: { printer: SavedPrinter; onClose: () => void; onRemove: () => void }) {
  const [name, setName] = useState(p.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = (patch: Partial<SavedPrinter>) => updatePrinter(p.id, patch);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Printer settings"
      description={`${PROTOCOL_LABEL[p.protocol]} · ${safeId(p)}`}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {confirmRemove ? (
            <Button variant="danger" onClick={onRemove}>
              <Trash2 /> Yes, remove
            </Button>
          ) : (
            <Button variant="danger-soft" onClick={() => setConfirmRemove(true)}>
              <Trash2 /> Remove printer
            </Button>
          )}
          <Button variant="secondary" className="ml-auto" onClick={() => testPrint(p)}>
            <Printer /> Test print
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div className="space-y-4 pb-4">
        <Field label="Name">
          <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && set({ name: name.trim() })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paper width">
            <NativeSelect value={String(p.paper)} onChange={(e) => { const paper = Number(e.target.value) as 58 | 80; set({ paper, dots: DOTS_FOR[paper] }); }}>
              <option value="58">58 mm (2 inch)</option>
              <option value="80">80 mm (3 inch)</option>
            </NativeSelect>
          </Field>
          <Field label="Print width" hint="Use the test page ruler to check.">
            <NativeSelect value={String(p.dots)} onChange={(e) => set({ dots: Number(e.target.value) })}>
              {p.paper === 58 ? (
                <>
                  <option value="384">384 dots — standard (32 characters)</option>
                  <option value="360">360 dots — narrow (30 characters)</option>
                </>
              ) : (
                <>
                  <option value="576">576 dots — standard (48 characters)</option>
                  <option value="512">512 dots — narrow (42 characters)</option>
                </>
              )}
            </NativeSelect>
          </Field>
          <Field label="Receipt style" hint={p.style === 'text' ? 'Prints instantly. Same layout and logo as Bill Studio, in the printer’s own font.' : 'A picture of the Bill Studio design, fonts included. Takes a few seconds per bill.'}>
            <NativeSelect value={p.style} onChange={(e) => set({ style: e.target.value as SavedPrinter['style'] })}>
              <option value="text">Instant (recommended)</option>
              <option value="image">Exact picture (slower)</option>
            </NativeSelect>
          </Field>
          <Field label="Print density">
            <NativeSelect value={p.density} onChange={(e) => set({ density: e.target.value as SavedPrinter['density'] })}>
              <option value="light">Light</option>
              <option value="normal">Normal</option>
              <option value="dark">Dark</option>
            </NativeSelect>
          </Field>
          <Field label="Character set" hint="Hindi and other scripts always print correctly (as a picture).">
            <NativeSelect value={p.encoding} onChange={(e) => set({ encoding: e.target.value as PrinterEncoding })}>
              {(Object.keys(ENCODINGS) as PrinterEncoding[]).map((k) => (
                <option key={k} value={k}>
                  {ENCODINGS[k].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="QR codes and barcodes">
            <NativeSelect value={p.codes} onChange={(e) => set({ codes: e.target.value as SavedPrinter['codes'] })}>
              <option value="image">As pictures (works on every printer)</option>
              <option value="printer">Printer’s own (sharper, newer printers)</option>
            </NativeSelect>
          </Field>
        </div>
        <div className="space-y-4 rounded-xl border border-border p-4">
          <ToggleRow label="Auto reconnect" hint="Reconnects when the app opens and after the printer drops out." checked={p.autoReconnect} onChange={(v) => set({ autoReconnect: v })} />
          <ToggleRow label="Cut paper" hint="Only for printers with an automatic cutter." checked={p.cut} onChange={(v) => set({ cut: v })} />
          <ToggleRow label="Slow, safe transfer" hint="Turn on if receipts print with missing lines or garbage." checked={p.safeMode} onChange={(v) => set({ safeMode: v })} />
        </div>
        <p className="text-xs text-muted-foreground">
          Copies are set under Bill printer / KOT printer below. Receipts contain only what your Bill Studio design shows — nothing is added. (A few printers add their own
          text from their firmware; that can only be turned off with the printer maker’s settings tool.)
        </p>
      </div>
    </Modal>
  );
}
