import { Printer, RotateCcw, Save } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_KOT_DESIGN, KOT_DESIGN_KEY, sampleKot, useKotDesign } from '@/features/restaurant/kotDesign';
import { KotTicket, useKotPrinter } from '@/features/restaurant/useKotPrinter';
import { useAppMutation } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { kotDesignService, type KotDesign } from '@/services';

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-border bg-surface p-0.5">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={cn('flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium', value === v ? 'bg-card text-primary shadow-card' : 'text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const TOGGLES: [keyof KotDesign, string][] = [
  ['showBusiness', 'Business name'],
  ['showKotNumber', 'KOT number'],
  ['showOrderType', 'Order type (dine-in, takeaway…)'],
  ['showTime', 'Date and time'],
  ['showNotes', 'Item notes (less spicy…)'],
  ['showItemCount', 'Total item count'],
];

/** Bill Studio → KOT ticket: how kitchen tickets look when they print. */
export function KotDesigner() {
  const { businessName } = useWorkspace();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('Settings', 'edit');
  const { design: current, isLoading } = useKotDesign();
  const [d, setD] = useState<KotDesign>(current);
  const printer = useKotPrinter(d);
  const set = (patch: Partial<KotDesign>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    // Start from the saved design once it has loaded.
    if (!isLoading) setD(current);
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(d) !== JSON.stringify(current);
  const save = useAppMutation(kotDesignService.save, { invalidate: [KOT_DESIGN_KEY], success: () => 'KOT design saved — new KOTs print with it' });

  return (
    <div className="grid flex-1 gap-5 p-4 md:p-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Card className="space-y-5 p-5">
        <div>
          <h2 className="text-[15px] font-semibold">KOT ticket</h2>
          <p className="text-xs text-muted-foreground">The ticket the kitchen gets when an order is sent. Keep it big and simple.</p>
        </div>
        <Row label="Roll size">
          <Segmented value={d.paper} options={[['thermal80', '80 mm'], ['thermal58', '58 mm']]} onChange={(paper) => set({ paper })} />
        </Row>
        <Row label="Item text size">
          <Segmented value={d.itemSize} options={[['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']]} onChange={(itemSize) => set({ itemSize })} />
        </Row>
        <Row label="Font">
          <Segmented value={d.font} options={[['mono', 'Receipt'], ['sans', 'Clean']]} onChange={(font) => set({ font })} />
        </Row>
        <Row label="Heading">
          <Input value={d.title} maxLength={20} placeholder="KOT" onChange={(e) => set({ title: e.target.value })} />
        </Row>
        <Row label="Line above heading (optional)">
          <Input value={d.header} maxLength={60} placeholder="e.g. Kitchen copy" onChange={(e) => set({ header: e.target.value })} />
        </Row>
        <Row label="Bottom note (optional)">
          <Input value={d.footer} maxLength={80} placeholder="e.g. Serve within 15 minutes" onChange={(e) => set({ footer: e.target.value })} />
        </Row>
        <div className="space-y-2.5">
          <Label>Show on ticket</Label>
          {TOGGLES.map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
              {label}
              <Switch checked={d[key] as boolean} onCheckedChange={(v) => set({ [key]: v })} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button onClick={() => save.mutate(d)} disabled={!dirty || !canEdit} loading={save.isPending}><Save /> {dirty ? 'Save design' : 'Saved'}</Button>
          <Button variant="secondary" onClick={() => printer.print(sampleKot())} loading={printer.printing}><Printer /> Test print</Button>
          <Button variant="ghost" onClick={() => setD(DEFAULT_KOT_DESIGN)}><RotateCcw /> Reset</Button>
        </div>
        {!canEdit && <p className="text-xs text-muted-foreground">Your role can view this design but not change it.</p>}
      </Card>

      <div className="flex items-start justify-center rounded-2xl bg-surface p-6">
        <div className="rounded-sm shadow-card">
          <KotTicket kot={sampleKot()} business={businessName} design={d} />
        </div>
      </div>
      {printer.element}
    </div>
  );
}
