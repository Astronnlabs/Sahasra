/** Opens WhatsApp (app or web) with a pre-filled message. The user presses Send themselves. */
export function openWhatsApp(phone: string | undefined, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  const to = digits.length === 10 ? `91${digits}` : digits.length > 10 ? digits : '';
  const url = `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Prints an element in a separate window using the app's own styles.
 * The browser's print dialog can also save it as PDF.
 */
export function printElement(el: HTMLElement, title: string) {
  // Open the window straight away (before any await) so pop-up blockers allow it.
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((n) => n.outerHTML)
    .join('\n');
  const safeTitle = title.replace(/[<>&"]/g, '');

  void (async () => {
    const html = await withEmbeddedImages(el);
    if (w.closed) return;
    // <base> lets anything not embedded still load. The app's own print rule hides everything
    // except `.print-area`; in this window the bill is the only content, so show it all.
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>${safeTitle}</title>${styles}<style>html,body{background:#fff!important;margin:0}body{padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:8mm}@media print{body{padding:0}body *{visibility:visible!important}.print-area{position:static!important}body>*{box-shadow:none!important;border-radius:0!important;margin:0 auto!important}}</style></head><body>${html}</body></html>`,
    );
    w.document.close();
    // Print only once stylesheets and every picture have finished (or given up) loading.
    await new Promise<void>((resolve) => (w.document.readyState === 'complete' ? resolve() : w.addEventListener('load', () => resolve(), { once: true })));
    await Promise.race([
      Promise.all(
        Array.from(w.document.images).map((img) =>
          img.complete
            ? null
            : new Promise((r) => {
                img.addEventListener('load', r);
                img.addEventListener('error', r);
              }),
        ),
      ),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    setTimeout(() => {
      w.focus();
      w.print();
    }, 150);
  })();
  return true;
}

/**
 * Copies the element with its pictures (the business logo, product photos) embedded as data,
 * so the print window has nothing left to download. Uploaded files need the signed-in session
 * and are never cached, so loading them again in the print window could miss the print.
 * A logo that cannot be loaded is replaced by its fallback text (the business name), or left out.
 */
async function withEmbeddedImages(el: HTMLElement): Promise<string> {
  const copy = el.cloneNode(true) as HTMLElement;
  await Promise.all(
    Array.from(copy.querySelectorAll('img')).map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      try {
        const url = new URL(src, window.location.href);
        if (url.origin !== window.location.origin) return;
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        img.src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch {
        if (!img.hasAttribute('data-fallback-text')) return;
        const text = img.getAttribute('data-fallback-text');
        if (text) {
          const name = document.createElement('div');
          name.textContent = text;
          const size = parseFloat(img.style.height) / 3.6 || 12;
          name.style.cssText = `font-size:${size * 1.6}px;font-weight:700;line-height:1.15`;
          img.replaceWith(name);
        } else {
          img.remove();
        }
      }
    }),
  );
  return copy.outerHTML;
}
