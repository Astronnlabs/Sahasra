/** Opens WhatsApp (app or web) with a pre-filled message. The user presses Send themselves. */
export function openWhatsApp(phone: string | undefined, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  const to = digits.length === 10 ? `91${digits}` : digits.length > 10 ? digits : '';
  const url = `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

const PRINT_ROOT = 'sahasra-print-root';
const PRINT_STYLE = `
#${PRINT_ROOT}{display:none}
@media print{
  @page{margin:6mm}
  html,body{background:#fff!important;height:auto!important;overflow:visible!important;margin:0!important;padding:0!important}
  body.sahasra-printing>*:not(#${PRINT_ROOT}){display:none!important}
  body.sahasra-printing #${PRINT_ROOT}{display:block!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #${PRINT_ROOT},#${PRINT_ROOT} *{visibility:visible!important}
  #${PRINT_ROOT} .print-area{position:static!important}
  #${PRINT_ROOT}>*{box-shadow:none!important;border-radius:0!important;margin:0 auto!important}
}`;

/**
 * Prints an element with the browser's print dialog (which can also save it as PDF).
 * The bill is printed from this same page rather than a pop-up window, so it works on phones
 * and tablets (Android and iPhone print to any printer the phone can reach, or to PDF)
 * and is never stopped by a pop-up blocker.
 */
export function printElement(el: HTMLElement, title: string) {
  void (async () => {
    const html = await withEmbeddedImages(el);

    let style = document.getElementById(`${PRINT_ROOT}-style`);
    if (!style) {
      style = document.createElement('style');
      style.id = `${PRINT_ROOT}-style`;
      style.textContent = PRINT_STYLE;
      document.head.appendChild(style);
    }
    document.getElementById(PRINT_ROOT)?.remove();
    const root = document.createElement('div');
    root.id = PRINT_ROOT;
    root.innerHTML = html;
    document.body.appendChild(root);

    // Print only once every picture has finished (or given up) loading.
    await Promise.race([
      Promise.all(
        Array.from(root.querySelectorAll('img')).map((img) =>
          img.complete
            ? null
            : new Promise((r) => {
                img.addEventListener('load', r, { once: true });
                img.addEventListener('error', r, { once: true });
              }),
        ),
      ),
      new Promise((r) => setTimeout(r, 5000)),
    ]);

    // The page title becomes the PDF's file name.
    const oldTitle = document.title;
    document.title = title.replace(/[<>&"]/g, '');
    document.body.classList.add('sahasra-printing');
    let done = false;
    const cleanup = () => {
      if (done || !root.isConnected) return;
      done = true;
      document.title = oldTitle;
      document.body.classList.remove('sahasra-printing');
      root.remove();
    };
    window.addEventListener('afterprint', () => setTimeout(cleanup, 300), { once: true });
    setTimeout(() => {
      window.print();
      // Phones may return from print() before the dialog closes; the bill stays hidden on screen,
      // so it is simply removed later (or replaced by the next print).
      setTimeout(cleanup, 60_000);
    }, 100);
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
