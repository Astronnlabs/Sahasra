import { Lock, RotateCcw, Sparkles, SquareCheckBig, SquareDashed } from 'lucide-react';
import { BUSINESS_TYPE_MAP } from '@/app/config/business';
import { ALL_PAGE_IDS, LOCKED_PAGES, PAGE_CATALOG, PAGE_GROUPS, recommendedPages, withLocked } from '@/app/config/pages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { BusinessType } from '@/types';

const TEAM_PAGES = ['users', 'roles'];

interface Props {
  value: string[];
  onChange: (pages: string[]) => void;
  businessType: BusinessType;
  /** Pages currently saved — highlights what will be added or removed. */
  saved?: string[];
}

export function PageAccessEditor({ value, onChange, businessType, saved }: Props) {
  const selected = new Set(withLocked(value));
  const savedSet = saved ? new Set(withLocked(saved)) : null;
  const set = (pages: Iterable<string>) => onChange(withLocked(Array.from(pages)));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    // Users and Roles & Permissions are granted together (the server does the same).
    const ids = TEAM_PAGES.includes(id) ? TEAM_PAGES : [id];
    ids.forEach((p) => (on ? next.add(p) : next.delete(p)));
    set(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl bg-primary-soft px-4 py-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-[13px]">
          <span className="font-semibold">{selected.size} of {ALL_PAGE_IDS.length} pages</span>{' '}
          <span className="text-muted-foreground">enabled. Dashboard and Help & Support are always available.</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={() => set(recommendedPages(businessType))}><Sparkles /> Recommended for {BUSINESS_TYPE_MAP[businessType].label}</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => set(ALL_PAGE_IDS)}><SquareCheckBig /> All pages</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => set(LOCKED_PAGES)}><SquareDashed /> Clear</Button>
          {saved && <Button type="button" size="sm" variant="ghost" onClick={() => set(saved)}><RotateCcw /> Undo changes</Button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PAGE_GROUPS.map((group) => {
          const pages = PAGE_CATALOG.filter((p) => p.group === group);
          const editable = pages.filter((p) => !p.locked);
          const on = editable.filter((p) => selected.has(p.id)).length;
          return (
            <fieldset key={group} className="rounded-2xl border border-border bg-card">
              <legend className="sr-only">{group}</legend>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <Checkbox
                    checked={on === editable.length ? true : on ? 'indeterminate' : false}
                    onCheckedChange={(c) => {
                      const next = new Set(selected);
                      editable.forEach((p) => (c === true ? next.add(p.id) : next.delete(p.id)));
                      set(next);
                    }}
                    aria-label={`Toggle all ${group} pages`}
                  />
                  <span className="text-[13px] font-semibold">{group}</span>
                </label>
                <span className="text-2xs text-subtle">{on + pages.filter((p) => p.locked).length} / {pages.length}</span>
              </div>
              <ul className="divide-y divide-border">
                {pages.map((p) => {
                  const isOn = selected.has(p.id);
                  const change = savedSet && !p.locked ? (isOn && !savedSet.has(p.id) ? 'added' : !isOn && savedSet.has(p.id) ? 'removed' : null) : null;
                  return (
                    <li key={p.id}>
                      <label className={cn('flex items-center gap-3 px-4 py-2.5', p.locked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-surface/60')}>
                        <Checkbox checked={isOn} disabled={p.locked} onCheckedChange={(c) => toggle(p.id, c === true)} aria-label={p.label} />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-[13px] font-medium', !isOn && 'text-muted-foreground')}>{p.label}</span>
                          <span className="block truncate text-2xs text-subtle">{p.description}</span>
                        </span>
                        {p.locked && <Lock className="h-3.5 w-3.5 text-subtle" aria-label="Always on" />}
                        {change === 'added' && <Badge tone="success">Adding</Badge>}
                        {change === 'removed' && <Badge tone="danger">Removing</Badge>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
