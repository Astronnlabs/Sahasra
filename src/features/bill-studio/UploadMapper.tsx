import { FileText, FileUp, RotateCcw, Wand2 } from 'lucide-react';
import { useEffect, useState, type DragEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { isSafeImageFile } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { PAPER, makeElement, type ElementType, type InvoiceTemplate, type PaperSize } from './model';

/** Parts of a bill, in the order they are laid out on the new template. */
const PARTS: { type: ElementType; label: string; hint: string }[] = [
  { type: 'logo', label: 'Logo', hint: 'Your brand mark at the top' },
  { type: 'businessName', label: 'Business name', hint: 'Large heading' },
  { type: 'businessAddress', label: 'Address & contact', hint: 'Address, phone, email' },
  { type: 'gstin', label: 'GSTIN', hint: 'Your GST number' },
  { type: 'title', label: 'Title', hint: '“Tax Invoice”, “Bill of Supply”…' },
  { type: 'invoiceMeta', label: 'Invoice number & date', hint: 'Usually top right' },
  { type: 'customer', label: 'Customer details', hint: 'Bill to: name, GSTIN' },
  { type: 'itemsTable', label: 'Items table', hint: 'Items, HSN, qty, rate, amount' },
  { type: 'taxSummary', label: 'Tax breakup', hint: 'CGST / SGST / IGST' },
  { type: 'totals', label: 'Totals', hint: 'Subtotal, discount, grand total' },
  { type: 'amountInWords', label: 'Amount in words', hint: '“Rupees … Only”' },
  { type: 'paymentQr', label: 'UPI payment QR', hint: 'Scan to pay' },
  { type: 'bankDetails', label: 'Bank details', hint: 'Account number & IFSC' },
  { type: 'terms', label: 'Terms & conditions', hint: 'Return policy, notes' },
  { type: 'signature', label: 'Signature', hint: 'Authorised signatory' },
  { type: 'footer', label: 'Footer note', hint: '“Thank you for your business”' },
];

const DEFAULT_ON = new Set<ElementType>(['businessName', 'businessAddress', 'gstin', 'title', 'invoiceMeta', 'customer', 'itemsTable', 'taxSummary', 'totals', 'amountInWords', 'signature']);

/**
 * Recreate an existing bill layout: the uploaded file is shown as a reference
 * while the user ticks the parts it contains. Nothing is uploaded or read automatically.
 */
export function UploadMapper({ onCreate }: { onCreate: (tpl: Omit<InvoiceTemplate, 'id' | 'updatedAt'>) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parts, setParts] = useState<Set<ElementType>>(() => new Set(DEFAULT_ON));
  const [paper, setPaper] = useState<PaperSize>('A4');
  const [accent, setAccent] = useState('#171522');

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const accept = (f: File | undefined) => {
    if (!f) return;
    if (!isSafeImageFile(f, 10 * 1024 * 1024) || f.type === 'image/webp') {
      toast.error('Upload a PDF, PNG or JPG under 10 MB.');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  const toggle = (t: ElementType, on: boolean) =>
    setParts((s) => {
      const next = new Set(s);
      if (on) next.add(t);
      else next.delete(t);
      return next;
    });

  const create = () => {
    const elements = PARTS.filter((p) => parts.has(p.type)).map((p) => makeElement(p.type, paper));
    onCreate({ name: `From ${file?.name.replace(/\.[^.]+$/, '').slice(0, 24) ?? 'my bill'}`, paper, accent, font: 'sans', watermark: '', elements, isDefault: false });
  };

  if (!file) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-primary"><Wand2 className="h-6 w-6" /></span>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">Use your existing invoice</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-muted-foreground">Open a bill you already use as a reference, tick the parts it has, and Sahasra builds a matching template you can fine-tune.</p>
        </div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('mt-8 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors', dragging ? 'border-primary bg-primary-soft' : 'border-primary/25 bg-card hover:border-primary/50 hover:bg-primary-soft/50')}
        >
          <FileUp className="h-8 w-8 text-primary" />
          <span className="mt-3 text-[15px] font-semibold">Open your existing bill</span>
          <span className="mt-1 text-[13px] text-muted-foreground">Drag & drop or click to browse</span>
          <span className="mt-4 flex gap-1.5">{['PDF', 'PNG', 'JPG'].map((f) => <Badge key={f} tone="neutral">{f}</Badge>)}</span>
          <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => accept(e.target.files?.[0])} />
        </label>
        <p className="mt-4 text-center text-xs text-subtle">The file is only shown on your screen — it isn’t uploaded.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[1fr_440px]">
      <Card className="overflow-hidden">
        <CardHeader title={file.name} description={`${(file.size / 1024).toFixed(0)} KB · reference only`} icon={<FileText />} actions={<Button variant="ghost" size="sm" onClick={() => { setFile(null); setPreview(null); }}><RotateCcw /> Replace</Button>} />
        <CardContent>
          <div className="relative mx-auto aspect-[1/1.414] w-full max-w-[560px] overflow-hidden rounded-lg border border-border bg-white">
            {preview && (file.type === 'application/pdf' ? (
              <object data={preview} type="application/pdf" className="absolute inset-0 h-full w-full" aria-label="Your existing invoice">
                <p className="p-6 text-center text-[13px] text-muted-foreground">This browser can’t preview PDFs. Open the file side by side while you tick the parts.</p>
              </object>
            ) : (
              <img src={preview} alt="Your existing invoice" className="absolute inset-0 h-full w-full object-contain" />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title="Which parts does your bill have?" description="Tick what you see on your current bill." />
        <CardContent className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto">
          {PARTS.map((p) => (
            <label key={p.type} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors', parts.has(p.type) ? 'border-primary/40 bg-primary-soft' : 'border-border hover:bg-surface')}>
              <Checkbox checked={parts.has(p.type)} onCheckedChange={(c) => toggle(p.type, c === true)} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{p.label}</span>
                <span className="block truncate text-2xs text-muted-foreground">{p.hint}</span>
              </span>
            </label>
          ))}
          <div className="grid grid-cols-2 gap-3 pt-3">
            <label className="space-y-1.5 text-xs font-medium">
              Paper size
              <NativeSelect value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)} className="h-9">
                {(Object.keys(PAPER) as PaperSize[]).map((k) => <option key={k} value={k}>{PAPER[k].label}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1.5 text-xs font-medium">
              Main colour
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="block h-9 w-full cursor-pointer rounded-lg border border-border bg-card p-1" />
            </label>
          </div>
        </CardContent>
        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">{parts.size} parts selected</p>
          <Button onClick={create} disabled={!parts.has('itemsTable')}><Wand2 /> Create template</Button>
        </div>
      </Card>
    </div>
  );
}
