import { Fragment } from 'react';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { LogoMark } from '@/components/layout/Logo';
import { QrCode, upiLink } from '@/components/common/Codes';
import { amountInWords, formatDate, formatINR } from '@/lib/format';
import type { Sale } from '@/types';
import { PAYMENT_LABELS } from './salesMeta';

/** Compact A4-style rendering of a sale used in drawers and print. */
export function InvoicePreview({ sale }: { sale: Sale }) {
  const ws = useWorkspace();
  const taxable = sale.subtotal - sale.discount;
  const due = Math.max(0, sale.total - sale.paid);
  const upiId = typeof ws.settings.upiId === 'string' ? ws.settings.upiId : '';
  return (
    <article className="print-area rounded-xl border border-border bg-white p-6 text-[12px] text-[#171522] shadow-card">
      <header className="flex items-start justify-between gap-4 border-b border-[#E9E5F2] pb-4">
        <div className="flex items-start gap-3">
          {ws.logo ? <img src={ws.logo} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <LogoMark className="h-10 w-10" />}
          <div>
            <p className="text-sm font-bold">{ws.businessName}</p>
            <p className="max-w-[240px] text-[11px] leading-snug text-[#6F6B78]">{ws.address}</p>
            {ws.gstin && <p className="mt-0.5 text-[11px] text-[#6F6B78]">GSTIN: {ws.gstin}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#6D3DE8]">TAX INVOICE</p>
          <p className="mt-1 font-semibold">{sale.invoiceNo}</p>
          <p className="text-[11px] text-[#6F6B78]">{formatDate(sale.date)}</p>
        </div>
      </header>
      <div className="flex justify-between gap-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9A96A5]">Bill to</p>
          <p className="mt-0.5 font-semibold">{sale.customerName}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9A96A5]">Branch</p>
          <p className="mt-0.5">{sale.branch}</p>
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-[#F7F4FF] text-left text-[10px] uppercase tracking-wider text-[#6F6B78]">
            <th className="px-2 py-1.5 font-semibold">Item</th>
            <th className="px-2 py-1.5 font-semibold">HSN</th>
            <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
            <th className="px-2 py-1.5 text-right font-semibold">Rate</th>
            <th className="px-2 py-1.5 text-right font-semibold">GST</th>
            <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it, i) => (
            <Fragment key={it.id}>
              {/* Parts of a package are listed under the package name. */}
              {it.packageName && it.packageId !== sale.items[i - 1]?.packageId && (
                <tr className="bg-[#FAF8FF]">
                  <td colSpan={6} className="px-2 pt-1.5 text-[11px] font-semibold">
                    {it.packageName}
                    <span className="ml-2 font-normal text-[#6F6B78]">package</span>
                  </td>
                </tr>
              )}
            <tr className="border-b border-[#F0EDF6]">
              <td className={it.packageName ? 'py-1.5 pl-5 pr-2' : 'px-2 py-1.5'}>
                {it.name}
                {it.staff && <span className="block text-[10px] text-[#6F6B78]">by {it.staff}</span>}
              </td>
              <td className="px-2 py-1.5 text-[#6F6B78]">{it.hsn}</td>
              <td className="px-2 py-1.5 text-right">{it.qty}</td>
              <td className="px-2 py-1.5 text-right">{formatINR(it.rate)}</td>
              <td className="px-2 py-1.5 text-right">{it.gstRate}%</td>
              <td className="px-2 py-1.5 text-right font-medium">{formatINR(it.qty * it.rate - it.discount)}</td>
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-end justify-between gap-6">
        <div className="flex items-end gap-3">
          {upiId && due > 0 && <QrCode value={upiLink(upiId, ws.businessName, due, sale.invoiceNo)} className="h-16 w-16" label={`Scan to pay ${formatINR(due)} by UPI`} />}
          <p className="max-w-[180px] text-[10px] text-[#6F6B78]">{amountInWords(sale.total)}</p>
        </div>
        <dl className="w-48 space-y-1">
          <div className="flex justify-between"><dt className="text-[#6F6B78]">Subtotal</dt><dd>{formatINR(sale.subtotal)}</dd></div>
          {sale.discount > 0 && <div className="flex justify-between"><dt className="text-[#6F6B78]">Discount</dt><dd>− {formatINR(sale.discount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-[#6F6B78]">Taxable</dt><dd>{formatINR(taxable)}</dd></div>
          <div className="flex justify-between"><dt className="text-[#6F6B78]">CGST</dt><dd>{formatINR(sale.tax / 2)}</dd></div>
          <div className="flex justify-between"><dt className="text-[#6F6B78]">SGST</dt><dd>{formatINR(sale.tax / 2)}</dd></div>
          <div className="flex justify-between border-t border-[#E9E5F2] pt-1.5 text-[13px] font-bold"><dt>Grand Total</dt><dd className="text-[#6D3DE8]">{formatINR(sale.total)}</dd></div>
          <div className="flex justify-between text-[11px]"><dt className="text-[#6F6B78]">Paid via {PAYMENT_LABELS[sale.payment]}</dt><dd>{formatINR(sale.paid)}</dd></div>
        </dl>
      </div>
      <p className="mt-4 border-t border-[#E9E5F2] pt-3 text-center text-[10px] text-[#9A96A5]">Thank you for shopping with us · Generated by SAHAASRA</p>
    </article>
  );
}
