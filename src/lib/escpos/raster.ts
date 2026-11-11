import type { Alignment, Bitmap } from './builder';

/** How dark the printout is: where grey turns into a black dot. */
export type Density = 'light' | 'normal' | 'dark';
const THRESHOLD: Record<Density, number> = { light: 120, normal: 160, dark: 200 };

function blankCanvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.max(1, Math.ceil(height));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  return { c, ctx };
}

/**
 * Converts a canvas (already `width` dots wide) to a 1-bit bitmap. Pictures (logos) are
 * dithered so shades survive; text and codes use a sharp threshold.
 */
export function canvasToBitmap(canvas: HTMLCanvasElement, density: Density = 'normal', dither = false): Bitmap {
  const width = Math.ceil(canvas.width / 8) * 8;
  const height = canvas.height;
  const src = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, height).data;
  const lum = new Float32Array(width * height).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const a = src[i + 3] / 255;
      // Transparent areas are paper.
      lum[y * width + x] = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) * a + 255 * (1 - a);
    }
  }
  const t = THRESHOLD[density];
  const data = new Uint8Array((width / 8) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = lum[i];
      const black = old < t;
      if (black) data[y * (width / 8) + (x >> 3)] |= 0x80 >> (x & 7);
      if (dither) {
        // Floyd–Steinberg error diffusion.
        const err = old - (black ? 0 : 255);
        if (x + 1 < width) lum[i + 1] += (err * 7) / 16;
        if (y + 1 < height) {
          if (x > 0) lum[i + width - 1] += (err * 3) / 16;
          lum[i + width] += (err * 5) / 16;
          if (x + 1 < width) lum[i + width + 1] += err / 16;
        }
      }
    }
  }
  return { width, height, data };
}

/** Places a picture of `w`×`h` dots on a full-width strip with the given alignment. */
function placed(source: CanvasImageSource, w: number, h: number, paperDots: number, align: Alignment) {
  const { c, ctx } = blankCanvas(paperDots, h);
  const x = align === 'center' ? Math.round((paperDots - w) / 2) : align === 'right' ? paperDots - w : 0;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, x, 0, w, h);
  return c;
}

/**
 * Text as a picture, for lines in scripts the printer has no font for (Hindi, Bengali, Tamil…)
 * or symbols such as ₹. Wrapped to the paper width.
 */
export function textToBitmap(
  text: string,
  opts: { paperDots: number; align: Alignment; px: number; bold?: boolean; density?: Density; font?: string },
): Bitmap {
  const font = `${opts.bold ? '700' : '400'} ${opts.px}px ${opts.font ?? 'system-ui, "Noto Sans", Arial, sans-serif'}`;
  const measure = blankCanvas(1, 1).ctx;
  measure.font = font;
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/(\s+)/)) {
      const next = cur + word;
      if (measure.measureText(next).width <= opts.paperDots || !cur.trim()) cur = next;
      else {
        lines.push(cur.trimEnd());
        cur = word.trimStart();
      }
    }
    lines.push(cur.trimEnd());
  }
  const lineH = Math.ceil(opts.px * 1.3);
  const { c, ctx } = blankCanvas(opts.paperDots, lineH * lines.length);
  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.textAlign = opts.align === 'center' ? 'center' : opts.align === 'right' ? 'right' : 'left';
  const x = opts.align === 'center' ? opts.paperDots / 2 : opts.align === 'right' ? opts.paperDots : 0;
  lines.forEach((l, i) => ctx.fillText(l, x, i * lineH + lineH / 2));
  return canvasToBitmap(c, opts.density ?? 'normal');
}

/** Two texts on one line, left and right, as a picture (when either needs a font the printer lacks). */
export function rowToBitmap(left: string, right: string, opts: { paperDots: number; px: number; bold?: boolean; density?: Density }): Bitmap {
  const font = `${opts.bold ? '700' : '400'} ${opts.px}px system-ui, "Noto Sans", Arial, sans-serif`;
  const lineH = Math.ceil(opts.px * 1.3);
  const { c, ctx } = blankCanvas(opts.paperDots, lineH);
  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const rightW = ctx.measureText(right).width;
  ctx.fillText(right, opts.paperDots, lineH / 2);
  ctx.textAlign = 'left';
  // The left text is cut short rather than running into the amount.
  let l = left;
  while (l.length > 1 && ctx.measureText(l).width > opts.paperDots - rightW - 12) l = l.slice(0, -1);
  ctx.fillText(l === left ? l : `${l.slice(0, -1)}…`, 0, lineH / 2);
  return canvasToBitmap(c, opts.density ?? 'normal');
}

/** Loads a picture (the business logo) with the signed-in session. Null when it can't be loaded. */
export async function loadImage(url: string): Promise<CanvasImageSource | null> {
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol === 'data:') return await createImageBitmap(await (await fetch(u)).blob());
    if (u.origin !== window.location.origin) return null;
    const res = await fetch(u, { credentials: 'same-origin' });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

export function pictureToBitmap(img: CanvasImageSource & { width: number; height: number }, opts: { maxDots: number; paperDots: number; align: Alignment; density?: Density }): Bitmap {
  const scale = Math.min(1, opts.maxDots / img.width, opts.maxDots / img.height) || 1;
  const w = Math.max(8, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  return canvasToBitmap(placed(img, w, h, opts.paperDots, opts.align), opts.density ?? 'normal', true);
}

/** QR code as a picture (works on printers without built-in QR support). */
export async function qrToBitmap(value: string, opts: { sizeDots: number; paperDots: number; align: Alignment }): Promise<Bitmap> {
  const { default: QRCode } = await import('qrcode');
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, value, { margin: 1, errorCorrectionLevel: 'M', width: opts.sizeDots });
  return canvasToBitmap(placed(qr, qr.width, qr.height, opts.paperDots, opts.align));
}

/** CODE128 barcode as a picture. */
export async function barcodeToBitmap(value: string, opts: { paperDots: number; align: Alignment }): Promise<Bitmap | null> {
  const { default: JsBarcode } = await import('jsbarcode');
  const bc = document.createElement('canvas');
  try {
    JsBarcode(bc, value, { format: 'CODE128', height: 60, width: 2, fontSize: 18, margin: 4, background: '#ffffff', lineColor: '#000000' });
  } catch {
    return null;
  }
  const w = Math.min(bc.width, opts.paperDots);
  const h = Math.round((bc.height * w) / bc.width);
  return canvasToBitmap(placed(bc, w, h, opts.paperDots, opts.align));
}

/**
 * A rendered bill (exactly as designed in Bill Studio) as one picture the width of the paper.
 * Slower to send than text, but identical to the on-screen design.
 */
export async function elementToBitmap(el: HTMLElement, paperDots: number, density: Density): Promise<Bitmap> {
  const { default: html2canvas } = await import('html2canvas');
  await document.fonts?.ready;
  await Promise.race([
    Promise.all(Array.from(el.querySelectorAll('img')).map((img) => (img.complete ? null : img.decode().catch(() => null)))),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  const scale = paperDots / el.offsetWidth;
  const canvas = await html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const { c, ctx } = blankCanvas(paperDots, Math.round((canvas.height * paperDots) / canvas.width));
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return canvasToBitmap(c, density);
}
