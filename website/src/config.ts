/**
 * SAHAASRA website settings — edit this one file.
 *
 * APP_URL: where the SAHAASRA software runs. Login, Sign up and Get started open it.
 * COMPANY: business details shown on the Contact and policy pages (PayU checks these).
 * PLANS:   prices shown on the website. Keep them the same as the software
 *          (backend/src/lib/subscription.ts), which is what customers are actually charged.
 */
export const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/+$/, '') || 'https://app.sahaasra.in';

export const COMPANY = {
  name: 'SAHAASRA',
  /** The company that owns and runs SAHAASRA. */
  legalName: 'Astron Labs',
  parent: 'Astron Labs',
  parentTagline: 'Precision in every Astra',
  address: 'Add your registered address here',
  email: 'astronnlabs@gmail.com',
  phone: '+91 62908 54388',
  gstin: '',
  hours: 'Monday to Saturday, 10 am to 7 pm',
};

export type Period = 'monthly' | 'quarterly' | 'yearly';

export const PLANS: { period: Period; label: string; price: number; months: number; note: string; best?: boolean }[] = [
  { period: 'monthly', label: 'Monthly', price: 1, months: 1, note: 'per month' },
  { period: 'quarterly', label: 'Quarterly', price: 2, months: 3, note: 'for 3 months' },
  { period: 'yearly', label: 'Yearly', price: 3, months: 12, note: 'for 12 months', best: true },
];

export const loginUrl = () => `${APP_URL}/login`;
export const signupUrl = (period?: Period) => `${APP_URL}/signup${period ? `?plan=build&period=${period}` : ''}`;
export const lowestPrice = () => Math.min(...PLANS.map((p) => p.price));
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
