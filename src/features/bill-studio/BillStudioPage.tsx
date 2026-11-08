import { Check, ChefHat, Copy, Eye, LayoutTemplate, MoreHorizontal, Palette, PenTool, Plus, Printer, RotateCcw, Save, Star, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { timeAgo } from '@/lib/format';
import { printElement } from '@/lib/share';
import { cn, uid } from '@/lib/utils';
import { KOT_PAGES } from '@/features/restaurant/kotDesign';
import { usePageAccess } from '@/hooks/usePageAccess';
import { Editor } from './Editor';
import { InvoiceRenderer } from './InvoiceRenderer';
import { KotDesigner } from './KotDesigner';
import { PAPER, makeElement, type InvoiceTemplate } from './model';
import { UploadMapper } from './UploadMapper';
import { useTemplates } from './useTemplates';

type View = 'gallery' | 'editor' | 'upload' | 'kot';

function Thumbnail({ template }: { template: InvoiceTemplate }) {
  const w = PAPER[template.paper].width;
  const scale = 220 / Math.max(w, 300);
  return (
    <div className="flex h-[260px] items-start justify-center overflow-hidden bg-surface/70 pt-5" aria-hidden>
      <div style={{ zoom: scale }} className="pointer-events-none select-none">
        <InvoiceRenderer template={template} />
      </div>
    </div>
  );
}

export function BillStudioPage() {
  const [params, setParams] = useSearchParams();
  const { templates, save, remove, setDefault, resetAll } = useTemplates();
  const view = (params.get('view') as View) ?? 'gallery';
  const setView = (v: View) => setParams(v === 'gallery' ? {} : { view: v, ...(v === 'editor' && draft ? { id: draft.id } : {}) }, { replace: true });
  const editingId = params.get('id');
  const [draft, setDraft] = useState<InvoiceTemplate | null>(null);
  const [previewing, setPreviewing] = useState<InvoiceTemplate | null>(null);
  const [deleting, setDeleting] = useState<InvoiceTemplate | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const { can } = usePageAccess();
  // KOT design is only for people who work with KOTs (Orders & KOT or Kitchen Display).
  const hasKot = KOT_PAGES.some(can);
  const tabs: [View, string, LucideIcon][] = [
    ['gallery', 'Templates', LayoutTemplate],
    ['editor', 'Editor', PenTool],
    ['upload', 'Use existing', Upload],
    ...(hasKot ? [['kot', 'KOT ticket', ChefHat] as [View, string, LucideIcon]] : []),
  ];

  useEffect(() => {
    if (view === 'editor' && !draft) {
      const t = templates.find((x) => x.id === editingId) ?? templates.find((x) => x.isDefault) ?? templates[0];
      if (t) setDraft(structuredClone(t));
    }
  }, [view, editingId, templates, draft]);

  const saved = useMemo(() => templates.find((t) => t.id === draft?.id), [templates, draft?.id]);
  const dirty = !!draft && JSON.stringify({ ...draft, updatedAt: '' }) !== JSON.stringify({ ...saved, updatedAt: '' });

  const edit = (t: InvoiceTemplate) => {
    setDraft(structuredClone(t));
    setParams({ view: 'editor', id: t.id }, { replace: true });
  };

  const duplicate = async (t: InvoiceTemplate) => {
    const copy: InvoiceTemplate = { ...structuredClone(t), id: uid('tpl'), name: `${t.name} (Copy)`, isDefault: false };
    if (await save(copy)) toast.success(`Duplicated “${t.name}”`);
    return copy;
  };

  const printPreview = () => {
    const el = previewRef.current?.firstElementChild as HTMLElement | null;
    if (el && previewing && !printElement(el, previewing.name)) toast.error('Allow pop-ups for this site to print.');
  };

  const createNew = async () => {
    const t: InvoiceTemplate = {
      id: uid('tpl'),
      name: 'Untitled template',
      paper: 'A4',
      accent: '#6D3DE8',
      font: 'sans',
      watermark: '',
      isDefault: false,
      updatedAt: new Date().toISOString(),
      elements: (['businessName', 'title', 'invoiceMeta', 'customer', 'itemsTable', 'totals'] as const).map((type) => makeElement(type)),
    };
    if (await save(t)) edit(t);
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (await save(draft)) toast.success(`“${draft.name}” saved`, { description: draft.isDefault ? 'Your invoices now print with this template.' : 'Set it as default to print invoices with it.' });
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="flex flex-col gap-3 border-b border-border bg-card px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-primary"><Palette className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sahasra Bill Studio</h1>
            <p className="text-xs text-muted-foreground">{hasKot ? 'Design your invoices and kitchen tickets (KOT).' : 'Design invoices that look exactly like your brand.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="Bill Studio sections">
            {tabs.map(([v, label, Icon]) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium', view === v ? 'bg-card text-primary shadow-card' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          {view === 'editor' && draft && (
            <>
              <Button variant="secondary" onClick={() => setPreviewing(draft)}><Eye /> Preview</Button>
              <Button variant="secondary" onClick={async () => { if (await save({ ...draft, isDefault: true })) { setDraft({ ...draft, isDefault: true }); toast.success(`“${draft.name}” is now your default template`); } }} disabled={saved?.isDefault}>
                <Star /> {saved?.isDefault ? 'Default' : 'Set default'}
              </Button>
              <Button onClick={saveDraft} disabled={!dirty}><Save /> {dirty ? 'Save template' : 'Saved'}</Button>
            </>
          )}
          {view === 'gallery' && <Button onClick={createNew}><Plus /> New template</Button>}
        </div>
      </div>

      {view === 'gallery' && (
        <div className="p-4 md:p-6">
          <div className="stagger grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <button type="button" onClick={createNew} className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/25 bg-card text-center transition-colors hover:border-primary/60 hover:bg-primary-soft">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-primary"><Plus className="h-6 w-6" /></span>
              <span className="mt-3 text-[14px] font-semibold">Create new template</span>
              <span className="mt-1 text-xs text-muted-foreground">Start from a clean canvas</span>
            </button>
            <button type="button" onClick={() => setView('upload')} className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card text-center transition-colors hover:border-primary/60 hover:bg-primary-soft">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-primary"><Upload className="h-6 w-6" /></span>
              <span className="mt-3 text-[14px] font-semibold">Use your existing invoice</span>
              <span className="mt-1 max-w-[200px] text-xs text-muted-foreground">Upload a PDF or photo and map its fields</span>
            </button>
            {templates.map((t) => (
              <Card key={t.id} className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-pop/40">
                <button type="button" onClick={() => edit(t)} className="block w-full text-left" aria-label={`Edit ${t.name}`}>
                  <Thumbnail template={t} />
                </button>
                <div className="flex items-center gap-2 border-t border-border p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold">{t.name}{t.isDefault && <Badge tone="primary"><Check /> Default</Badge>}</p>
                    <p className="text-2xs text-muted-foreground">{PAPER[t.paper].label} · edited {timeAgo(t.updatedAt)}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${t.name} actions`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => edit(t)}><PenTool /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPreviewing(t)}><Eye /> Preview</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => duplicate(t)}><Copy /> Duplicate</DropdownMenuItem>
                      <DropdownMenuItem onSelect={async () => { await setDefault(t.id); toast.success(`“${t.name}” is now your default template`); }} disabled={t.isDefault}><Star /> Set as default</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive disabled={t.isDefault || templates.length <= 1} onSelect={() => setDeleting(t)}><Trash2 /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button variant="ghost" size="sm" onClick={async () => { await resetAll(); toast.success('Sahasra templates restored', { description: 'Your own templates were kept.' }); }}><RotateCcw /> Restore default templates</Button>
          </div>
        </div>
      )}

      {view === 'editor' && draft && <Editor template={draft} onChange={setDraft} />}

      {view === 'kot' && hasKot && <KotDesigner />}

      {view === 'upload' && (
        <UploadMapper
          onCreate={async (base) => {
            const t: InvoiceTemplate = { ...base, id: uid('tpl'), updatedAt: new Date().toISOString() };
            if (!(await save(t))) return;
            toast.success('Template created from your invoice', { description: 'Fine-tune it in the editor.' });
            edit(t);
          }}
        />
      )}

      <Modal
        open={!!previewing}
        onOpenChange={(o) => !o && setPreviewing(null)}
        title={previewing?.name ?? ''}
        description="Preview with placeholder content — printed invoices use your real sale data"
        size="xl"
        footer={<Button onClick={printPreview}><Printer /> Print test page / save PDF</Button>}
      >
        {previewing && (
          <div className="flex justify-center overflow-auto rounded-xl bg-surface p-6">
            <div ref={previewRef} style={{ zoom: previewing.paper === 'A4' ? 0.75 : 1 }}>
              <InvoiceRenderer template={previewing} />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="Invoices already printed are not affected. This template will no longer be available."
        confirmLabel="Delete template"
        destructive
        onConfirm={() => {
          if (deleting) {
            remove(deleting.id);
            toast.success('Template deleted');
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
