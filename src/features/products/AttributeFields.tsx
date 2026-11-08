import type { FieldSpec } from '@/app/config/industry';
import { FormField } from '@/components/forms/FormField';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { sanitizeText } from '@/lib/sanitize';

export type Attributes = Record<string, string | number | boolean | null>;

/** Renders an industry's extra fields (veg mark, composition, RAM, size…) stored in `attributes`. */
export function AttributeFields({ fields, value, onChange }: { fields: FieldSpec[]; value: Attributes; onChange: (next: Attributes) => void }) {
  const set = (key: string, v: string | number | boolean | null) => {
    const next = { ...value };
    if (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v))) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  const toggles = fields.filter((f) => f.type === 'boolean');
  const inputs = fields.filter((f) => f.type !== 'boolean');
  return (
    <div className="space-y-4">
      {inputs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {inputs.map((f) => {
            const current = value[f.key];
            return (
              <FormField key={f.key} label={f.label} hint={f.hint}>
                {f.type === 'select' ? (
                  <NativeSelect value={current == null ? '' : String(current)} onChange={(e) => set(f.key, e.target.value)}>
                    {(f.options ?? []).includes('') ? null : <option value="">—</option>}
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o || '—'}</option>)}
                  </NativeSelect>
                ) : f.type === 'number' ? (
                  <Input value={current == null ? '' : String(current)} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value.replace(/[^\d.]/g, '')))} inputMode="decimal" placeholder={f.placeholder} />
                ) : (
                  <Input value={current == null ? '' : String(current)} onChange={(e) => set(f.key, sanitizeText(e.target.value, 300))} placeholder={f.placeholder} />
                )}
              </FormField>
            );
          })}
        </div>
      )}
      {toggles.map((f) => (
        <label key={f.key} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-3.5">
          <span>
            <span className="block text-[13px] font-medium">{f.label}</span>
            {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
          </span>
          <Switch checked={value[f.key] === true} onCheckedChange={(c) => set(f.key, c ? true : null)} aria-label={f.label} />
        </label>
      ))}
    </div>
  );
}

/** Short text for an attribute in a table cell. */
export function attributeText(v: unknown) {
  if (v === true) return 'Yes';
  if (v === false || v == null || v === '') return '—';
  return String(v);
}
