import { ImageIcon, ImagePlus, LayoutGrid, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { suggestPictures, type PictureLibrary } from '@/app/config/pictureLibraries';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { uploadsService } from '@/services';

/** Shrinks a photo to at most 800px so menus load fast; keeps PNG transparency as WebP. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('That file is not a picture we can read. Use a JPG, PNG or WebP photo.');
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, type === 'image/webp' ? '.webp' : '.jpg'), { type });
}

/** Square product picture with a placeholder. */
export function ProductThumb({ image, name, className }: { image?: string; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (image && !broken) return <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} className={cn('shrink-0 rounded-lg object-cover', className)} />;
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return <span className={cn('flex shrink-0 items-center justify-center rounded-lg bg-primary-light text-xs font-semibold text-primary', className)}>{initials || <ImageIcon className="h-4 w-4" />}</span>;
}

function LibraryModal({ open, onOpenChange, name, onPick, lib }: { open: boolean; onOpenChange: (o: boolean) => void; name: string; onPick: (url: string) => void; lib: PictureLibrary }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Suggested');
  const suggested = useMemo(() => suggestPictures(lib, name, 12), [lib, name]);
  const tabs = [...(suggested.length ? ['Suggested'] : []), 'All', ...lib.categories];
  const active = tabs.includes(cat) ? cat : tabs[0];
  const needle = q.trim().toLowerCase();
  const list = needle
    ? lib.images.filter((d) => d.label.toLowerCase().includes(needle) || d.tags.some((t) => t.includes(needle)))
    : active === 'Suggested'
      ? suggested
      : active === 'All'
        ? lib.images
        : lib.images.filter((d) => d.category === active);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Picture library" description="Pick a ready-made picture. You can upload your own photo any time." size="lg">
      <div className="space-y-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lib.searchHint} className="pl-9" autoFocus />
        </div>
        {!needle && (
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-1">
            {tabs.map((t) => (
              <button key={t} type="button" onClick={() => setCat(t)} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors', active === t ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground hover:border-primary/40')}>
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="grid max-h-[52vh] grid-cols-3 gap-2.5 overflow-y-auto sm:grid-cols-5">
          {list.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => {
                onPick(lib.url(d.key));
                onOpenChange(false);
              }}
              className="group rounded-xl border border-border p-1.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-card"
            >
              <img src={lib.url(d.key)} alt="" loading="lazy" className="aspect-square w-full rounded-lg" />
              <span className="mt-1 block truncate px-0.5 text-2xs font-medium group-hover:text-primary">{d.label}</span>
            </button>
          ))}
          {!list.length && <p className="col-span-full py-8 text-center text-[13px] text-muted-foreground">No pictures match “{q}”. Try another word or upload a photo.</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Photo for a product or service: upload your own or pick a built-in picture (food and salon businesses). */
export function ProductImagePicker({ value, onChange, name, library, hint = 'Shown on POS, the menu and the product list.' }: { value: string; onChange: (url: string) => void; name: string; library: PictureLibrary | null; hint?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const suggestions = library && !value ? suggestPictures(library, name, 4) : [];

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error('Choose a JPG, PNG or WebP photo.');
      return;
    }
    setBusy(true);
    try {
      const small = await shrink(file);
      if (small.size > 5 * 1024 * 1024) throw new Error('This photo is too large. Choose one under 5 MB.');
      const up = await uploadsService.upload(small, 'image');
      onChange(up.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload the photo.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-dashed border-border bg-surface">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-2xs text-subtle">
            <ImagePlus className="h-6 w-6" /> No picture
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => fileRef.current?.click()}>
            <Upload /> {value?.startsWith('/api/uploads/') ? 'Change photo' : 'Upload photo'}
          </Button>
          {library && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setLibraryOpen(true)}>
              <LayoutGrid /> Choose from library
            </Button>
          )}
          {value && (
            <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => onChange('')}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG or WebP. {hint}</p>
        {suggestions.length > 0 && (
          <div>
            <p className="mb-1.5 text-2xs font-medium text-subtle">Suggested for “{name.trim()}”</p>
            <div className="flex gap-2">
              {suggestions.map((d) => (
                <button key={d.key} type="button" title={d.label} onClick={() => onChange(library!.url(d.key))} className="h-14 w-14 overflow-hidden rounded-lg border border-border transition-all hover:-translate-y-0.5 hover:border-primary">
                  <img src={library!.url(d.key)} alt={d.label} className="h-full w-full" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {library && <LibraryModal open={libraryOpen} onOpenChange={setLibraryOpen} name={name} onPick={onChange} lib={library} />}
    </div>
  );
}
