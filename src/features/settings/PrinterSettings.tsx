import { ChefHat, Download, Printer, ReceiptText, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useKotPrinter } from '@/features/restaurant/useKotPrinter';
import { useInvoicePrinter } from '@/features/sales/useInvoicePrinter';
import type { SavedPrinter } from '@/lib/bluetooth/printers';
import {
  bluetoothChoice,
  bluetoothIdOf,
  isMobileDevice,
  isPrintable,
  PRINTER_STATE_LABEL,
  SAHAASRA_PRINTER_DOWNLOAD,
  savePrinterSettings,
  usePrinterStatus,
  type JobPrinter,
  type LocalPrinter,
  type PrinterLevel,
  type PrintJob,
} from '@/lib/printer';
import { cn } from '@/lib/utils';
import type { BusinessType, Kot, Sale } from '@/types';
import { BluetoothPrinters } from './BluetoothPrinters';
import { PrintHistory } from './PrintHistory';
import { Section } from './SettingsSections';

/** Businesses that send kitchen order tickets. */
const KOT_BUSINESSES: BusinessType[] = ['restaurant', 'hotel'];

const testSale = (): Sale => ({
  id: 'test',
  invoiceNo: 'TEST-PRINT',
  customerName: 'Printer test',
  date: new Date().toISOString(),
  branch: 'Main Branch',
  items: [{ id: 't1', name: 'Test item', sku: '', hsn: '', qty: 1, rate: 100, discount: 0, gstRate: 5 }],
  subtotal: 100,
  discount: 0,
  tax: 5,
  total: 105,
  paid: 105,
  payment: 'cash',
  status: 'paid',
  cashier: 'Sahaasra',
});
const testKot = (): Kot => ({ id: 'test', number: 'KOT-TEST', orderId: 'test', table: 'Table 1', type: 'dine-in', items: [{ name: 'Test dish', qty: 2, note: 'Less spicy' }, { name: 'Soft drink', qty: 1 }], createdAt: new Date().toISOString(), status: 'new' });

const DOT = { ok: 'bg-success', warn: 'bg-warning', error: 'bg-danger', unknown: 'bg-subtle' } as const;
const dotFor = (p: LocalPrinter) => (!isPrintable(p.status) ? 'bg-danger' : p.virtual || p.status === 'low-paper' || p.status === 'low-toner' ? 'bg-warning' : 'bg-success');

function JobCard({
  icon,
  title,
  autoLabel,
  value,
  onChange,
  printers,
  connected,
  find,
  onTest,
  testing,
  btPrinters,
  status,
}: {
  icon: ReactNode;
  title: string;
  autoLabel: string;
  value: JobPrinter;
  onChange: (patch: Partial<JobPrinter>) => void;
  printers: LocalPrinter[];
  connected: boolean;
  find: (name: string) => LocalPrinter | null;
  onTest: () => void;
  testing: boolean;
  btPrinters: SavedPrinter[];
  status: { level: PrinterLevel; message: string };
}) {
  void find;
  const { level } = status;
  const defaultName = printers.find((p) => p.isDefault)?.name;
  const btId = bluetoothIdOf(value.printer);
  const usable = connected || btPrinters.length > 0;
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">{title}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[level])} /> {status.message}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onTest} loading={testing}><Printer /> Test</Button>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">Printer</span>
            <NativeSelect value={usable || btId ? value.printer : ''} disabled={!usable && !btId} onChange={(e) => onChange({ printer: e.target.value })}>
              <option value="">{connected ? `Computer’s default${defaultName ? ` (${defaultName})` : ''}` : 'Print window — choose each time'}</option>
              {btPrinters.length > 0 && (
                <optgroup label="Bluetooth printers">
                  {btPrinters.map((p) => (
                    <option key={p.id} value={bluetoothChoice(p.id)}>
                      {p.name} (Bluetooth, {p.paper} mm)
                    </option>
                  ))}
                </optgroup>
              )}
              {btId && !btPrinters.some((p) => p.id === btId) && <option value={value.printer}>Removed Bluetooth printer</option>}
              {connected && (
                <optgroup label="This computer">
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}{p.virtual ? ' (not paper)' : ''}</option>
                  ))}
                </optgroup>
              )}
              {connected && value.printer && !btId && !printers.some((p) => p.name === value.printer) && <option value={value.printer}>{value.printer} (not connected)</option>}
            </NativeSelect>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">Copies</span>
            <NativeSelect value={String(value.copies)} onChange={(e) => onChange({ copies: Number(e.target.value) })}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </NativeSelect>
          </label>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span className="text-[13px]">{autoLabel}</span>
          <Switch checked={value.auto} onCheckedChange={(v) => onChange({ auto: v })} aria-label={autoLabel} />
        </label>
      </div>
    </div>
  );
}

/** Printer setup for this computer: which printer prints bills and which prints KOTs. */
export function PrinterSettings() {
  const { businessType } = useWorkspace();
  const s = usePrinterStatus();
  const bill = useInvoicePrinter();
  const kot = useKotPrinter();
  const hasKot = KOT_BUSINESSES.includes(businessType);
  const set = (job: PrintJob, patch: Partial<JobPrinter>) => savePrinterSettings({ ...s.all, [job]: { ...s.all[job], ...patch } });
  const usedFor = (name: string, job: PrintJob) => (s.all[job].printer ? s.all[job].printer === name : !!s.printers.find((p) => p.name === name)?.isDefault);
  // Phones and tablets have no Windows printer service: Bluetooth printers come first there.
  const mobile = isMobileDevice();
  const bluetooth = <BluetoothPrinters settings={s.all} hasKot={hasKot} computerConnected={s.connected} />;

  return (
    <Section title="Printer" description="Choose which printer prints what on this device. Each billing counter, phone or tablet can have its own printers.">
      {mobile && bluetooth}
      {/* Printers on this computer */}
      <div className={cn('rounded-xl border border-border', mobile && !s.connected && 'hidden')}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Printer className="h-4 w-4 text-primary" />
          <p className="flex-1 text-[13px] font-semibold">Printers on this computer</p>
          <Button variant="ghost" size="sm" onClick={() => s.refresh()} loading={s.isFetching}><RefreshCw /> Refresh</Button>
        </div>
        {s.isLoading ? (
          <p className="px-4 py-4 text-[13px] text-muted-foreground">Looking for printers…</p>
        ) : s.connected ? (
          s.printers.length ? (
            <ul className="divide-y divide-border">
              {s.printers.map((p) => (
                <li key={p.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotFor(p))} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                      {p.name}
                      {p.isDefault && <Badge tone="neutral">Default</Badge>}
                      {usedFor(p.name, 'bill') && <Badge tone="primary">Bills</Badge>}
                      {hasKot && usedFor(p.name, 'kot') && <Badge tone="warning">KOT</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.virtual ? 'Saves a file — not a paper printer' : PRINTER_STATE_LABEL[p.status]}</p>
                  </div>
                  {!usedFor(p.name, 'bill') && <Button variant="secondary" size="sm" onClick={() => set('bill', { printer: p.name })}>Use for bills</Button>}
                  {hasKot && !usedFor(p.name, 'kot') && <Button variant="secondary" size="sm" onClick={() => set('kot', { printer: p.name })}>Use for KOT</Button>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-[13px] text-muted-foreground">No printers are installed on this computer. Connect your printer, install its driver, then press Refresh.</p>
          )
        ) : (
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-[13px] text-muted-foreground">
              To see this computer’s printers and print without the print window, install <b className="text-foreground">SAHAASRA Printer for Windows</b> once on this computer, then press Refresh.
            </p>
            <Button asChild>
              <a href={SAHAASRA_PRINTER_DOWNLOAD} download="SahasraPrinter.exe"><Download /> Download for Windows</a>
            </Button>
          </div>
        )}
      </div>
      {!mobile && bluetooth}

      <div className={cn('grid gap-4', hasKot && 'xl:grid-cols-2')}>
        <JobCard
          icon={<ReceiptText className="h-4 w-4" />}
          title="Bill printer"
          autoLabel="Print the bill automatically after payment"
          value={s.all.bill}
          onChange={(patch) => set('bill', patch)}
          printers={s.printers}
          connected={s.connected}
          find={s.find}
          onTest={() => bill.print(testSale())}
          testing={bill.printing}
          btPrinters={s.bluetooth.printers}
          status={s.jobStatus('bill')}
        />
        {hasKot && (
          <JobCard
            icon={<ChefHat className="h-4 w-4" />}
            title="KOT printer (kitchen)"
            autoLabel="Print the KOT automatically when sent to the kitchen"
            value={s.all.kot}
            onChange={(patch) => set('kot', patch)}
            printers={s.printers}
            connected={s.connected}
            find={s.find}
            onTest={() => kot.print(testKot())}
            testing={kot.printing}
            btPrinters={s.bluetooth.printers}
            status={s.jobStatus('kot')}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Saved automatically for this device. Bill size follows your default design in Bill Studio (Bluetooth receipt printers use your 58/80 mm receipt design); KOT size and layout follow your KOT design in Bill Studio.
      </p>
      <PrintHistory />
      {bill.element}
      {kot.element}
    </Section>
  );
}
