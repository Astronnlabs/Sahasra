import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat('en-IN');

/** ₹1,24,500 */
export function formatINR(value: number, precise = false) {
  return (precise ? inrPrecise : inr).format(value);
}

/** ₹1.2L / ₹3.4Cr for compact chart axes */
export function formatINRCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `₹${Math.round(value)}`;
}

export function formatNumber(value: number) {
  return num.format(value);
}

export function formatPercent(value: number, digits = 1) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

function toDate(value: string | Date) {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return isValid(d) ? d : new Date();
}

/** 04 Oct 2026 */
export function formatDate(value: string | Date) {
  const d = toDate(value);
  return isValid(d) ? format(d, 'dd MMM yyyy') : '—';
}

export function formatDateTime(value: string | Date) {
  const d = toDate(value);
  return isValid(d) ? format(d, 'dd MMM yyyy, h:mm a') : '—';
}

export function formatTime(value: string | Date) {
  const d = toDate(value);
  return isValid(d) ? format(d, 'h:mm a') : '—';
}

export function timeAgo(value: string | Date) {
  const d = toDate(value);
  return isValid(d) ? `${formatDistanceToNowStrict(d)} ago` : '—';
}

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number) {
  if (n < 20) return ones[n];
  return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
}

function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ones[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

/** Indian numbering system: "Rupees One Lakh Twenty Four Thousand Five Hundred Only" */
export function amountInWords(amount: number) {
  let n = Math.floor(Math.abs(amount));
  if (n === 0) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  const paise = Math.round((Math.abs(amount) % 1) * 100);
  return `Rupees ${parts.join(' ')}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
}
