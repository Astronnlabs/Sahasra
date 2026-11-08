import type { PaperSize } from '@/features/bill-studio/model';

/** Paper width and page height in mm (thermal rolls have no fixed page height). */
const PAGE_MM: Record<PaperSize, { w: number; h: number | null }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  thermal80: { w: 80, h: null },
  thermal58: { w: 58, h: null },
};

/**
 * Turns an on-screen bill into a PDF. A4 / A5 bills are split across pages;
 * thermal receipts become one long strip the width of the roll.
 */
export async function elementToPdf(el: HTMLElement, paper: PaperSize) {
  // Loaded only when a bill is downloaded or printed, so the rest of the app stays light.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  await document.fonts?.ready;
  // The logo and photos must finish loading first, or they are missing from the PDF.
  await Promise.race([
    Promise.all(Array.from(el.querySelectorAll('img')).map((img) => (img.complete ? null : img.decode().catch(() => null)))),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const page = PAGE_MM[paper] ?? PAGE_MM.A4;
  const imageH = (canvas.height * page.w) / canvas.width;

  if (!page.h) {
    const pdf = new jsPDF({ unit: 'mm', format: [page.w, Math.max(imageH, 40)], orientation: 'portrait', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, page.w, imageH);
    return pdf;
  }

  const pdf = new jsPDF({ unit: 'mm', format: [page.w, page.h], orientation: 'portrait', compress: true });
  const slicePx = Math.floor((canvas.width * page.h) / page.w);
  // A few pixels of tolerance so a bill that just fits doesn't spill onto a blank page.
  const pages = Math.max(1, Math.ceil((canvas.height - 8) / slicePx));
  for (let i = 0; i < pages; i++) {
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = Math.min(slicePx, canvas.height - i * slicePx);
    const ctx = part.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, -i * slicePx);
    if (i > 0) pdf.addPage([page.w, page.h], 'portrait');
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, page.w, (part.height * page.w) / part.width);
  }
  return pdf;
}

/** Saves an on-screen bill as a PDF file, straight to the downloads folder. */
export async function downloadElementPdf(el: HTMLElement, fileName: string, paper: PaperSize) {
  (await elementToPdf(el, paper)).save(fileName);
}

/** The bill as a PDF file in memory, e.g. to send to the printer. */
export async function elementPdfBlob(el: HTMLElement, paper: PaperSize) {
  return (await elementToPdf(el, paper)).output('blob');
}
