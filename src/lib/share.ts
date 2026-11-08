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
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((n) => n.outerHTML)
    .join('\n');
  const safeTitle = title.replace(/[<>&"]/g, '');
  // <base> lets the logo and pictures load in the blank window. The app's own print rule hides
  // everything except `.print-area`; in this window the bill is the only content, so show it all.
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>${safeTitle}</title>${styles}<style>html,body{background:#fff!important;margin:0}body{padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:8mm}@media print{body{padding:0}body *{visibility:visible!important}.print-area{position:static!important}body>*{box-shadow:none!important;border-radius:0!important;margin:0 auto!important}}</style></head><body>${el.outerHTML}</body></html>`,
  );
  w.document.close();
  const go = () => {
    w.focus();
    w.print();
  };
  // Wait for stylesheets and images to load before printing.
  if (w.document.readyState === 'complete') setTimeout(go, 300);
  else w.addEventListener('load', () => setTimeout(go, 150));
  return true;
}
