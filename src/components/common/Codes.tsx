import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Scannable QR code rendered as inline SVG. */
export function QrCode({ value, className, label = 'QR code' }: { value: string; className?: string; label?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#171522', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('h-24 w-24 rounded bg-white [&>svg]:h-full [&>svg]:w-full', className)}
      // The SVG markup is produced locally by the qrcode library from `value`.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** UPI payment link understood by every Indian UPI app. */
export function upiLink(upiId: string, payee: string, amount?: number, note?: string) {
  const qs = new URLSearchParams({ pa: upiId, pn: payee, cu: 'INR' });
  if (amount && amount > 0) qs.set('am', amount.toFixed(2));
  if (note) qs.set('tn', note.slice(0, 50));
  return `upi://pay?${qs.toString()}`;
}

export const UPI_ID_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

/** Scannable Code 128 barcode. */
export function Barcode({ value, className }: { value: string; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', height: 40, width: 1.4, fontSize: 11, margin: 0, background: 'transparent', lineColor: '#171522' });
    } catch {
      ref.current.innerHTML = '';
    }
  }, [value]);
  return <svg ref={ref} className={cn('h-12 w-auto max-w-full', className)} role="img" aria-label={`Barcode ${value}`} />;
}
