import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Database, FileSpreadsheet, Sparkles, Upload, Wand2 } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { industryConfig } from '@/app/config/industry';
import { PAGE_MODULE } from '@/app/config/pages';
import { useAuth } from '@/app/providers/AuthProvider';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { usePageAccess } from '@/hooks/usePageAccess';
import { cn } from '@/lib/utils';
import { importService, type ImportResult } from '@/services';
import { ACCEPTED, buildRecords, detectTarget, ENDPOINT, IMPORT_ORDER, missingRequired, planColumns, readFile, tableNote, TARGETS, type ColumnPlan, type ImportTarget, type Sheet, type TableNote } from './importEngine';

type Step = 'file' | 'map' | 'done';
const CONFIDENCE = { high: { label: 'Sure', tone: 'success' }, medium: { label: 'Likely', tone: 'info' }, low: { label: 'Check', tone: 'warning' }, none: { label: 'Not used', tone: 'neutral' } } as const;
/** Rows sent per request (the server takes up to 5,000). */
const BATCH = 2000;

/** One sheet / table of the file and how it will be imported. */
interface TablePlan {
  sheet: Sheet;
  target: ImportTarget | null;
  plan: ColumnPlan[];
  check?: ImportResult;
  /** Why the table isn't imported (passwords, empty, logins…). */
  note?: TableNote | null;
}

/** How existing records are recognised, per kind. */
const MATCHED_BY: Record<ImportTarget, string> = {
  products: 'Existing items are matched by code or name. Rows marked salon use become in-house products.',
  inhouse: 'Existing items are matched by code or name.',
  services: 'Existing services are matched by name, “for” and price.',
  customers: 'Existing records are matched by mobile number.',
  vendors: 'Existing records are matched by mobile number.',
  employees: 'Existing staff are matched by mobile number.',
  sales: 'Bills already in Sahasra (same bill number) are skipped. Old bills don’t change today’s stock.',
  appointments: 'Bookings for the same customer and time are matched.',
  attendance: 'Staff are matched by name; one mark per person per day.',
};

const sumResults = (list: ImportResult[]): ImportResult => ({
  created: list.reduce((s, r) => s + r.created, 0),
  updated: list.reduce((s, r) => s + r.updated, 0),
  skipped: list.reduce((s, r) => s + r.skipped, 0),
  failed: list.reduce((s, r) => s + r.failed, 0),
  dryRun: list[0]?.dryRun ?? true,
  rows: list.flatMap((r) => r.rows),
});

/** Settings → Your data → Import: upload a spreadsheet or SQL dump, review how Sahasra understood it, then save. */
export function ImportWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { can } = usePageAccess();
  const { hasPermission } = useAuth();
  const { businessType } = useWorkspace();
  const hasInHouse = !!industryConfig(businessType).goods.features.inHouse;
  const allowed = (Object.keys(TARGETS) as ImportTarget[]).filter((t) => (t !== 'inhouse' || hasInHouse) && can(TARGETS[t].page) && hasPermission(PAGE_MODULE[TARGETS[t].page] ?? '', 'create'));

  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [tables, setTables] = useState<TablePlan[]>([]);
  const [active, setActive] = useState(0);
  // Newer data in the file replaces what's saved (e.g. today's stock and prices from your old software).
  const [existing, setExisting] = useState<'skip' | 'update'>('update');
  const [result, setResult] = useState<{ total: ImportResult; byTable: { name: string; target: ImportTarget; r: ImportResult }[] } | null>(null);
  const [busy, setBusy] = useState<'' | 'reading' | 'checking' | 'importing'>('');
  const [dragging, setDragging] = useState(false);

  const many = tables.length > 1;
  const current = tables[active];
  const included = tables.filter((t) => t.target);
  const problems = (t: TablePlan) => (t.target ? missingRequired(t.target, t.plan) : []);
  const blocked = included.filter((t) => problems(t).length);
  const checked = included.length > 0 && included.every((t) => t.check);
  const toSave = included.reduce((s, t) => s + (t.check ? t.check.created + t.check.updated : 0), 0);
  const totalRows = included.reduce((s, t) => s + t.sheet.rows.length, 0);

  const reset = () => {
    setStep('file');
    setTables([]);
    setActive(0);
    setResult(null);
    setFileName('');
  };
  const close = (o: boolean) => {
    if (!o && busy) return;
    onOpenChange(o);
    if (!o) setTimeout(reset, 200);
  };

  const updateTable = (i: number, patch: Partial<TablePlan>) => setTables((list) => list.map((t, j) => (j === i ? { ...t, ...patch, check: undefined } : t)));
  const setTarget = (i: number, target: ImportTarget | null) => updateTable(i, { target, plan: target ? planColumns(tables[i].sheet, target) : [] });
  const setField = (index: number, field: string) =>
    updateTable(active, { plan: current.plan.map((c) => (c.index === index ? { ...c, field, confidence: field ? 'high' : 'none' } : field && c.field === field ? { ...c, field: '', confidence: 'none' } : c)) });
  const setExistingAll = (v: 'skip' | 'update') => {
    setExisting(v);
    setTables((list) => list.map((t) => ({ ...t, check: undefined })));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy('reading');
    try {
      const list = await readFile(file);
      if (!list.length) throw new Error('No rows found in this file.');
      const strict = list.length > 1;
      const planned = list.map<TablePlan>((sheet) => {
        // Passwords, logins, empty tables… are listed with the reason they're left out.
        const note = strict ? tableNote(sheet) : null;
        // With many tables (a database dump), only tables that clearly hold our kind of data are picked.
        const target = note ? null : (detectTarget(sheet, file.name, allowed, strict) ?? (strict ? null : allowed[0]));
        return { sheet, target, plan: target ? planColumns(sheet, target) : [], note };
      });
      setFileName(file.name);
      setTables(planned);
      setActive(Math.max(0, planned.findIndex((t) => t.target)));
      setStep('map');
      if (strict && !planned.some((t) => t.target)) toast.info('No table looked like products, customers or vendors. Choose what each table holds.');
    } catch (e) {
      toast.error(e instanceof Error && !/Unexpected|JSON/.test(e.message) ? e.message : 'Could not read this file. Use Excel (.xlsx, .xls), CSV, ODS, JSON or a .sql dump.');
    } finally {
      setBusy('');
    }
  };

  /** Sends one table in batches; problem rows point at the real row in the file, with readable field names. */
  const runTable = async (t: TablePlan, dryRun: boolean) => {
    const target = t.target!;
    const records = buildRecords(t.sheet, target, t.plan, { inHouse: hasInHouse });
    const labels = new Map(TARGETS[target].fields.map((f) => [f.key, f.label]));
    const parts: ImportResult[] = [];
    // A check doesn't save staff yet; tell attendance which names the staff table in this file will add.
    const pendingStaff =
      dryRun && target === 'attendance'
        ? included.filter((x) => x.target === 'employees').flatMap((x) => buildRecords(x.sheet, 'employees', x.plan).map((r) => String(r.name ?? '')).filter(Boolean))
        : [];
    for (let at = 0; at < records.length; at += BATCH) {
      const res = await importService.run(ENDPOINT[target], records.slice(at, at + BATCH), existing, dryRun, pendingStaff);
      parts.push({ ...res, rows: res.rows.map((x) => ({ ...x, row: x.row + at + t.sheet.headerRow, field: x.field ? labels.get(x.field) ?? x.field : undefined })) });
    }
    return sumResults(parts);
  };

  const checkAll = async () => {
    setBusy('checking');
    try {
      const next = [...tables];
      for (const [i, t] of tables.entries()) if (t.target && !problems(t).length) next[i] = { ...t, check: await runTable(t, true) };
      setTables(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not check the data');
    } finally {
      setBusy('');
    }
  };

  const importAll = async () => {
    setBusy('importing');
    const byTable: { name: string; target: ImportTarget; r: ImportResult }[] = [];
    try {
      // What later records refer to goes in first: staff and services before the bills that name them.
      for (const t of [...included].sort((a, b) => IMPORT_ORDER.indexOf(a.target!) - IMPORT_ORDER.indexOf(b.target!))) {
        byTable.push({ name: t.sheet.name, target: t.target!, r: await runTable(t, false) });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import stopped');
    } finally {
      setBusy('');
      if (byTable.length) {
        const total = sumResults(byTable.map((x) => x.r));
        setResult({ total, byTable });
        setStep('done');
        for (const k of ['products', 'customers', 'vendors', 'inventory', 'services', 'employees', 'sales', 'appointments', 'attendance', 'dashboard', 'salon']) qc.invalidateQueries({ queryKey: [k] });
        if (total.created + total.updated) toast.success(`${total.created + total.updated} records saved`);
      }
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFile(e.dataTransfer.files?.[0]);
  };

  const missing = current ? problems(current) : [];
  const matched = useMemo(() => current?.plan.filter((p) => p.field).length ?? 0, [current]);

  return (
    <Modal
      open={open}
      onOpenChange={close}
      size="xl"
      title={step === 'done' ? 'Import finished' : 'Import data'}
      description={
        step === 'file'
          ? 'Upload a file — Sahasra reads every table and column, works out what it is and adds it to your records.'
          : step === 'map'
            ? `${fileName} · ${many ? `${tables.length} tables, ${included.length} to import · ` : ''}${totalRows.toLocaleString('en-IN')} row${totalRows === 1 ? '' : 's'}`
            : undefined
      }
      footer={
        step === 'map' ? (
          <>
            <Button variant="ghost" onClick={reset} disabled={!!busy}><ArrowLeft /> Another file</Button>
            <span className="flex-1" />
            <Button variant="secondary" onClick={checkAll} disabled={!included.length || blocked.length > 0 || !!busy} loading={busy === 'checking'}>Check data</Button>
            <Button onClick={importAll} disabled={!checked || toSave === 0 || !!busy} loading={busy === 'importing'}>
              <Upload /> Import {checked ? toSave.toLocaleString('en-IN') : ''} {checked ? 'records' : ''}
            </Button>
          </>
        ) : step === 'done' ? (
          <>
            <Button variant="secondary" onClick={reset}>Import another file</Button>
            <Button onClick={() => close(false)}>Done</Button>
          </>
        ) : undefined
      }
    >
      {step === 'file' && (
        allowed.length ? (
          <div className="space-y-4">
            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
              className={cn('flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors', dragging ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/50 hover:bg-surface')}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-primary"><FileSpreadsheet className="h-6 w-6" /></span>
              <span className="mt-3 text-[14px] font-semibold">{busy === 'reading' ? 'Reading your file…' : 'Drop your file here or click to choose'}</span>
              <span className="mt-1 text-xs text-muted-foreground">Excel (.xlsx, .xls), CSV, ODS, JSON or a SQL database dump (.sql) · up to 25 MB</span>
              <input type="file" accept={ACCEPTED} className="sr-only" disabled={!!busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {allowed.map((t) => (
                <div key={t} className="rounded-xl border border-border p-3">
                  <p className="text-[13px] font-semibold">{TARGETS[t].label}</p>
                  <p className="text-2xs text-muted-foreground">{TARGETS[t].hint}</p>
                </div>
              ))}
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Column names don’t need to match. “Cust Name”, “User” or “Party” become the customer name, “Mob No” becomes the mobile, “Rate” becomes the price — and so on.</p>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> From another software? Export its database as a .sql file — Sahasra reads every table in it and only takes the data. Nothing in the file is run.</p>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Your role can’t add products, customers or vendors, so there’s nothing you can import.</p>
        )
      )}

      {step === 'map' && current && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium">If a record already exists</p>
              <NativeSelect value={existing} onChange={(e) => setExistingAll(e.target.value as 'skip' | 'update')} className="w-72">
                <option value="update">Update it with the file (newest data)</option>
                <option value="skip">Keep mine, skip the row</option>
              </NativeSelect>
            </div>
            {!many && (
              <div className="space-y-1">
                <p className="text-xs font-medium">This file has</p>
                <NativeSelect value={current.target ?? ''} onChange={(e) => setTarget(0, (e.target.value || null) as ImportTarget | null)} className="w-56">
                  {allowed.map((t) => <option key={t} value={t}>{TARGETS[t].label}</option>)}
                </NativeSelect>
              </div>
            )}
          </div>

          {many && (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-[13px]">
                <thead className="bg-surface text-left text-2xs uppercase tracking-wide text-subtle">
                  <tr><th className="px-3 py-2">{/\.sql$/i.test(fileName) ? 'Table' : 'Sheet'}</th><th className="px-3 py-2 text-right">Rows</th><th className="px-3 py-2">Import as</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tables.map((t, i) => {
                    const miss = problems(t);
                    return (
                      <tr key={`${t.sheet.name}-${i}`} className={cn(i === active && 'bg-primary-soft/60', !t.target && 'text-muted-foreground')}>
                        <td className="max-w-[200px] truncate px-3 py-2 font-medium">{t.sheet.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.sheet.rows.length.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2">
                          <NativeSelect value={t.target ?? ''} disabled={!!t.note?.locked || !t.sheet.rows.length} onChange={(e) => { setTarget(i, (e.target.value || null) as ImportTarget | null); setActive(i); }} className="h-8 min-w-[170px] text-xs" aria-label={`Import ${t.sheet.name} as`}>
                            <option value="">Don’t import</option>
                            {allowed.map((x) => <option key={x} value={x}>{TARGETS[x].label}</option>)}
                          </NativeSelect>
                        </td>
                        <td className="max-w-[260px] px-3 py-2 text-xs">
                          {!t.target ? <span className={cn(t.note?.locked && 'text-warning')}>{t.note?.reason ?? 'Not recognised — choose what it holds, or leave it out'}</span> : miss.length ? <span className="text-danger">Needs {miss.map((f) => f.label).join(', ')}</span> : t.check ? <span className="text-success">{t.check.created} new · {t.check.updated} update{t.check.failed ? <span className="text-danger"> · {t.check.failed} {t.check.failed === 1 ? 'problem' : 'problems'}</span> : ''}</span> : `${t.plan.filter((p) => p.field).length} of ${t.plan.length} columns matched`}
                        </td>
                        <td className="px-3 py-2 text-right">{t.target && <Button variant={i === active ? 'secondary' : 'ghost'} size="sm" onClick={() => setActive(i)}>Columns</Button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {current.target ? (
            <>
              <div className="flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2.5 text-[13px]">
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  {many && <b>{current.sheet.name}: </b>}Sahasra matched <b>{matched}</b> of {current.plan.length} columns as <b>{TARGETS[current.target].label.toLowerCase()}</b>. Change any match that’s wrong.
                  {' '}{MATCHED_BY[current.target]}
                </span>
              </div>
              <div className="max-h-[300px] overflow-auto rounded-xl border border-border">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-surface text-left text-2xs uppercase tracking-wide text-subtle">
                    <tr><th className="px-3 py-2">Your column</th><th className="px-3 py-2">Sample values</th><th className="px-3 py-2">Goes into</th><th className="px-3 py-2" /></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {current.plan.map((c) => (
                      <tr key={c.index} className={cn(!c.field && 'text-muted-foreground')}>
                        <td className="px-3 py-2 font-medium">{c.header}</td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground">{c.samples.join(' · ') || '—'}</td>
                        <td className="px-3 py-2">
                          <NativeSelect value={c.field} onChange={(e) => setField(c.index, e.target.value)} className="h-8 min-w-[180px] text-xs" aria-label={`Field for ${c.header}`}>
                            <option value="">Don’t import</option>
                            {TARGETS[current.target!].fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>)}
                          </NativeSelect>
                        </td>
                        <td className="px-3 py-2 text-right"><Badge tone={CONFIDENCE[c.confidence].tone}>{CONFIDENCE[c.confidence].label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {missing.length > 0 && <p className="flex items-center gap-1.5 text-[13px] text-danger"><AlertTriangle className="h-4 w-4" /> Choose a column for: {missing.map((f) => f.label).join(', ')}.</p>}
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">Nothing selected to import. Choose what a table holds above.</p>
          )}

          {checked ? <CheckSummary r={sumResults(included.map((t) => t.check!))} /> : included.length > 0 && !blocked.length && <p className="text-xs text-muted-foreground">Press <b>Check data</b> — nothing is saved until you press Import.</p>}
          {blocked.length > 0 && many && <p className="text-xs text-danger">Fix or skip: {blocked.map((t) => t.sheet.name).join(', ')}.</p>}
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-success/10 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <p className="text-[13px]"><b>{result.total.created}</b> added, <b>{result.total.updated}</b> updated, {result.total.skipped} skipped{result.total.failed ? <>, <b className="text-danger">{result.total.failed}</b> not imported</> : ''}.</p>
          </div>
          {result.byTable.length > 1 && (
            <ul className="divide-y divide-border rounded-xl border border-border text-[13px]">
              {result.byTable.map((x) => (
                <li key={x.name} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="font-medium">{x.name} <span className="font-normal text-muted-foreground">→ {TARGETS[x.target].label}</span></span>
                  <span className="text-xs text-muted-foreground">{x.r.created} added · {x.r.updated} updated{x.r.failed ? <span className="text-danger"> · {x.r.failed} not imported</span> : ''}</span>
                </li>
              ))}
            </ul>
          )}
          {result.total.failed > 0 && <Problems r={result.total} />}
        </div>
      )}
    </Modal>
  );
}

function CheckSummary({ r }: { r: ImportResult }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['New', r.created, 'text-success'], ['Will update', r.updated, 'text-info'], ['Skipped', r.skipped, 'text-muted-foreground'], ['Problems', r.failed, r.failed ? 'text-danger' : 'text-muted-foreground']].map(([label, n, cls]) => (
          <div key={label as string} className="rounded-xl border border-border px-3 py-2">
            <p className={cn('text-lg font-bold', cls as string)}>{(n as number).toLocaleString('en-IN')}</p>
            <p className="text-2xs text-muted-foreground">{label as string}</p>
          </div>
        ))}
      </div>
      {r.failed > 0 && <Problems r={r} />}
      {r.failed > 0 && <p className="text-xs text-muted-foreground">Rows with problems are left out. Fix them in your file and import again, or import the rest now.</p>}
    </div>
  );
}

function Problems({ r }: { r: ImportResult }) {
  const errors = r.rows.filter((x) => x.action === 'error');
  return (
    <ul className="max-h-40 divide-y divide-border overflow-auto rounded-xl border border-danger/30 text-xs">
      {errors.slice(0, 100).map((e, i) => (
        <li key={i} className="flex gap-3 px-3 py-1.5">
          <span className="w-16 shrink-0 font-medium">{e.row ? `Row ${e.row}` : 'Record'}</span>
          <span className="text-muted-foreground">{e.field ? `${e.field}: ` : ''}{e.message}</span>
        </li>
      ))}
      {errors.length > 100 && <li className="px-3 py-1.5 text-muted-foreground">…and {errors.length - 100} more</li>}
    </ul>
  );
}
