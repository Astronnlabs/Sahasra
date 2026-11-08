import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Check, Copy, Eye, EyeOff, GripVertical, Minus, MousePointerClick, Plus, Trash2 } from 'lucide-react';
import { useState, type DragEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ElementView, Paper } from './InvoiceRenderer';
import {
  ACCENTS,
  ELEMENT_LIBRARY,
  ELEMENT_META,
  PAPER,
  makeElement,
  type Align,
  type ElementProps,
  type ElementType,
  type InvoiceTemplate,
  type PaperSize,
  type TableColumns,
} from './model';

interface EditorProps {
  template: InvoiceTemplate;
  onChange: (t: InvoiceTemplate) => void;
}

const DRAG_NEW = 'application/x-sahasra-new';
const DRAG_MOVE = 'application/x-sahasra-move';

export function Editor({ template, onChange }: EditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(template.paper === 'A4' ? 0.8 : 1);
  const selected = template.elements.find((e) => e.id === selectedId) ?? null;
  const present = new Set(template.elements.map((e) => e.type));

  const setElements = (elements: InvoiceTemplate['elements']) => onChange({ ...template, elements });

  const insert = (type: ElementType, index = template.elements.length) => {
    const el = makeElement(type, template.paper);
    const next = template.elements.slice();
    next.splice(index, 0, el);
    setElements(next);
    setSelectedId(el.id);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to > template.elements.length) return;
    const next = template.elements.slice();
    const [item] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, item);
    setElements(next);
  };

  const updateProps = (patch: Partial<ElementProps>) => {
    if (!selected) return;
    setElements(template.elements.map((e) => (e.id === selected.id ? { ...e, props: { ...e.props, ...patch } } : e)));
  };

  const remove = (id: string) => {
    setElements(template.elements.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicate = (id: string) => {
    const idx = template.elements.findIndex((e) => e.id === id);
    const src = template.elements[idx];
    const copy = { ...src, id: `${src.type}_${Math.random().toString(36).slice(2, 8)}`, props: { ...src.props } };
    const next = template.elements.slice();
    next.splice(idx + 1, 0, copy);
    setElements(next);
    setSelectedId(copy.id);
  };

  const onDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    const newType = e.dataTransfer.getData(DRAG_NEW) as ElementType;
    const moveFrom = e.dataTransfer.getData(DRAG_MOVE);
    if (newType) insert(newType, index);
    else if (moveFrom !== '') move(Number(moveFrom), index);
    setDropIndex(null);
  };

  const DropZone = ({ index }: { index: number }) => (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDropIndex(index);
      }}
      onDragLeave={() => setDropIndex((d) => (d === index ? null : d))}
      onDrop={(e) => onDrop(e, index)}
      className={cn('-my-1 h-2 rounded-full transition-all', dropIndex === index && 'my-1 h-1 bg-primary')}
      aria-hidden
    />
  );

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[248px_1fr_300px]">
      {/* Elements */}
      <aside className="scrollbar-thin hidden overflow-y-auto border-r border-border bg-card p-4 lg:block" aria-label="Elements">
        <p className="text-[13px] font-semibold">Elements</p>
        <p className="mb-4 text-2xs text-muted-foreground">Drag onto the invoice, or click to add.</p>
        {ELEMENT_LIBRARY.map((g) => (
          <div key={g.group} className="mb-4">
            <p className="section-label mb-1.5">{g.group}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {g.items.map((item) => {
                const used = present.has(item.type) && !item.repeatable;
                return (
                  <button
                    key={item.type}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(DRAG_NEW, item.type)}
                    onClick={() => insert(item.type)}
                    className={cn(
                      'relative flex cursor-grab flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left text-2xs font-medium leading-tight transition-colors active:cursor-grabbing',
                      used ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border hover:border-primary/40 hover:bg-primary-soft/60',
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    {used && <Check className="absolute right-1.5 top-1.5 h-3 w-3" aria-label="On invoice" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* Canvas */}
      <section className="relative flex min-h-[70vh] min-w-0 flex-col bg-surface/70 dot-grid" aria-label="Invoice canvas" onClick={() => setSelectedId(null)}>
        <div className="flex items-center justify-between gap-2 border-b border-border bg-card/80 px-4 py-2 backdrop-blur">
          <span className="text-xs text-muted-foreground">{PAPER[template.paper].label} · {PAPER[template.paper].note} · {template.elements.length} elements</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(1))); }} aria-label="Zoom out"><Minus /></Button>
            <span className="tabular w-11 text-center text-xs font-medium">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1))); }} aria-label="Zoom in"><Plus /></Button>
          </div>
        </div>
        <div className="scrollbar-thin flex-1 overflow-auto p-6 lg:p-10">
          <div className="mx-auto w-fit" style={{ zoom }}>
            <Paper template={template}>
              <DropZone index={0} />
              {template.elements.map((el, i) => {
                const isSel = el.id === selectedId;
                return (
                  <div key={el.id}>
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData(DRAG_MOVE, String(i));
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(el.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelectedId(el.id);
                        if (e.key === 'Delete' && isSel) remove(el.id);
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`${ELEMENT_META[el.type].label} element`}
                      aria-pressed={isSel}
                      className={cn(
                        'group relative -mx-2 cursor-pointer rounded px-2 outline-none transition-shadow',
                        isSel ? 'ring-2 ring-[#6D3DE8]' : 'hover:ring-1 hover:ring-[#6D3DE8]/40 focus-visible:ring-2 focus-visible:ring-[#6D3DE8]/60',
                      )}
                    >
                      <ElementView el={el} template={template} />
                      {isSel && (
                        <div className="absolute -top-3 right-1 z-10 flex items-center gap-0.5 rounded-md bg-[#6D3DE8] px-1 py-0.5 text-white shadow" onClick={(e) => e.stopPropagation()}>
                          <span className="flex items-center px-1 text-[10px] font-medium"><GripVertical className="h-3 w-3" />{ELEMENT_META[el.type].label}</span>
                          <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="rounded p-0.5 hover:bg-white/20 disabled:opacity-40" aria-label="Move up"><ArrowUp className="h-3 w-3" /></button>
                          <button type="button" onClick={() => move(i, i + 2)} disabled={i === template.elements.length - 1} className="rounded p-0.5 hover:bg-white/20 disabled:opacity-40" aria-label="Move down"><ArrowDown className="h-3 w-3" /></button>
                          <button type="button" onClick={() => duplicate(el.id)} className="rounded p-0.5 hover:bg-white/20" aria-label="Duplicate"><Copy className="h-3 w-3" /></button>
                          <button type="button" onClick={() => remove(el.id)} className="rounded p-0.5 hover:bg-white/20" aria-label="Remove"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      )}
                    </div>
                    <DropZone index={i + 1} />
                  </div>
                );
              })}
              {template.elements.length === 0 && (
                <div className="flex h-60 flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#E9E5F2] text-center text-sm text-[#9A96A5]" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, 0)}>
                  <MousePointerClick className="mb-2 h-6 w-6" /> Drag elements here to start designing
                </div>
              )}
            </Paper>
          </div>
        </div>
        {/* mobile add */}
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto border-t border-border bg-card p-3 lg:hidden">
          {ELEMENT_LIBRARY.flatMap((g) => g.items).map((item) => (
            <button key={item.type} type="button" onClick={(e) => { e.stopPropagation(); insert(item.type); }} className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs">
              <item.icon className="h-3.5 w-3.5" /> {item.label}
            </button>
          ))}
        </div>
      </section>

      {/* Properties */}
      <aside className="scrollbar-thin overflow-y-auto border-t border-border bg-card p-4 lg:border-l lg:border-t-0" aria-label="Properties">
        {selected ? (
          <ElementProperties
            key={selected.id}
            type={selected.type}
            props={selected.props}
            onChange={updateProps}
            onRemove={() => remove(selected.id)}
            onDone={() => setSelectedId(null)}
          />
        ) : (
          <TemplateProperties template={template} onChange={onChange} onPaper={(p) => setZoom(p === 'A4' ? 0.8 : 1)} />
        )}
      </aside>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; aria?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-lg border border-border bg-surface p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.aria} onClick={() => onChange(o.value)} className={cn('flex flex-1 items-center justify-center rounded-md py-1.5 text-xs font-medium', value === o.value ? 'bg-card text-primary shadow-card' : 'text-muted-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><Label>{label}</Label>{hint && <span className="tabular text-2xs text-subtle">{hint}</span>}</div>
      {children}
    </div>
  );
}

function ElementProperties({ type, props, onChange, onRemove, onDone }: { type: ElementType; props: ElementProps; onChange: (p: Partial<ElementProps>) => void; onRemove: () => void; onDone: () => void }) {
  const meta = ELEMENT_META[type];
  const hasText = ['title', 'terms', 'footer', 'customText'].includes(type);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary"><meta.icon className="h-4 w-4" /></span>
        <div className="flex-1"><p className="text-[13px] font-semibold">{meta.label}</p><p className="text-2xs text-muted-foreground">Element properties</p></div>
        <Tooltip content="Remove element"><Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove element"><Trash2 /></Button></Tooltip>
      </div>

      {hasText && (
        <Field label="Text">
          {type === 'title' ? <Input value={props.text ?? ''} onChange={(e) => onChange({ text: e.target.value.slice(0, 60) })} /> : <Textarea rows={4} value={props.text ?? ''} onChange={(e) => onChange({ text: e.target.value.slice(0, 600) })} />}
        </Field>
      )}

      {type !== 'divider' && (
        <>
          <Field label="Alignment">
            <Segmented<Align>
              label="Alignment"
              value={props.align}
              onChange={(align) => onChange({ align })}
              options={[
                { value: 'left', label: <AlignLeft className="h-4 w-4" />, aria: 'Left' },
                { value: 'center', label: <AlignCenter className="h-4 w-4" />, aria: 'Center' },
                { value: 'right', label: <AlignRight className="h-4 w-4" />, aria: 'Right' },
              ]}
            />
          </Field>
          <Field label="Font size" hint={`${props.fontSize}px`}>
            <input type="range" min={8} max={36} value={props.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} className="w-full accent-[rgb(var(--primary))]" aria-label="Font size" />
          </Field>
          <Field label="Weight">
            <NativeSelect value={props.fontWeight} onChange={(e) => onChange({ fontWeight: Number(e.target.value) as ElementProps['fontWeight'] })}>
              <option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>Semibold</option><option value={700}>Bold</option>
            </NativeSelect>
          </Field>
          <Field label="Text colour">
            <div className="flex flex-wrap gap-1.5">
              {[undefined, ...ACCENTS].map((c) => (
                <button key={c ?? 'auto'} type="button" onClick={() => onChange({ color: c })} aria-label={c ?? 'Default colour'} className={cn('h-7 w-7 rounded-full border-2 transition-transform hover:scale-110', props.color === c ? 'border-primary ring-2 ring-primary/20' : 'border-border')} style={{ background: c ?? 'conic-gradient(#171522 0 50%, #fff 0)' }} />
              ))}
            </div>
          </Field>
        </>
      )}

      <Field label="Spacing above" hint={`${props.marginTop}px`}>
        <input type="range" min={0} max={48} value={props.marginTop} onChange={(e) => onChange({ marginTop: Number(e.target.value) })} className="w-full accent-[rgb(var(--primary))]" aria-label="Spacing above" />
      </Field>

      {type === 'itemsTable' && props.columns && (
        <Field label="Table columns">
          <div className="space-y-2 rounded-xl border border-border p-3">
            {(Object.keys(props.columns) as (keyof TableColumns)[]).map((k) => (
              <label key={k} className="flex items-center justify-between text-[13px]">
                <span>{{ sku: 'SKU', hsn: 'HSN/SAC', qty: 'Quantity', rate: 'Rate', discount: 'Discount', tax: 'Tax %' }[k]}</span>
                <Switch checked={props.columns![k]} onCheckedChange={(c) => onChange({ columns: { ...props.columns!, [k]: c } })} />
              </label>
            ))}
          </div>
        </Field>
      )}

      {type === 'taxSummary' && (
        <Field label="Tax type">
          <Segmented label="Tax type" value={props.taxMode ?? 'intra'} onChange={(taxMode) => onChange({ taxMode })} options={[{ value: 'intra', label: 'CGST + SGST' }, { value: 'inter', label: 'IGST' }]} />
        </Field>
      )}

      <Button variant="secondary" className="w-full" onClick={onDone}>Done</Button>
    </div>
  );
}

function TemplateProperties({ template, onChange, onPaper }: { template: InvoiceTemplate; onChange: (t: InvoiceTemplate) => void; onPaper: (p: PaperSize) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-semibold">Template settings</p>
        <p className="text-2xs text-muted-foreground">Select an element on the invoice to edit it.</p>
      </div>
      <Field label="Template name"><Input value={template.name} onChange={(e) => onChange({ ...template, name: e.target.value.slice(0, 40) })} /></Field>
      <Field label="Paper size">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(PAPER) as PaperSize[]).map((p) => (
            <button key={p} type="button" onClick={() => { onChange({ ...template, paper: p }); onPaper(p); }} className={cn('rounded-xl border px-2.5 py-2 text-left', template.paper === p ? 'border-primary bg-primary-light' : 'border-border hover:border-primary/40')}>
              <span className={cn('block text-xs font-semibold', template.paper === p && 'text-primary')}>{PAPER[p].label}</span>
              <span className="block text-2xs text-muted-foreground">{PAPER[p].note}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Accent colour">
        <div className="flex flex-wrap gap-1.5">
          {ACCENTS.map((c) => (
            <button key={c} type="button" onClick={() => onChange({ ...template, accent: c })} aria-label={`Accent ${c}`} className={cn('h-8 w-8 rounded-full border-2 transition-transform hover:scale-110', template.accent === c ? 'border-card ring-2 ring-primary' : 'border-transparent')} style={{ background: c }} />
          ))}
        </div>
      </Field>
      <Field label="Font">
        <Segmented label="Font" value={template.font} onChange={(font) => onChange({ ...template, font })} options={[{ value: 'sans', label: 'Sans' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Mono' }]} />
      </Field>
      <Field label="Watermark">
        <div className="flex items-center gap-2">
          <Input value={template.watermark} onChange={(e) => onChange({ ...template, watermark: e.target.value.slice(0, 20) })} placeholder="e.g. PAID or ORIGINAL" />
          <Tooltip content={template.watermark ? 'Remove watermark' : 'Add PAID watermark'}>
            <Button variant="secondary" size="icon" onClick={() => onChange({ ...template, watermark: template.watermark ? '' : 'PAID' })} aria-label="Toggle watermark">
              {template.watermark ? <EyeOff /> : <Eye />}
            </Button>
          </Tooltip>
        </div>
      </Field>
    </div>
  );
}
