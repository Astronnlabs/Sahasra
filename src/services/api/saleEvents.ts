import type { Sale } from '@/types';

/** Fired whenever a bill is saved (POS, restaurant settle, job card delivery). */
export const SALE_CREATED_EVENT = 'sahaasra:sale-created';

export function announceSale<T extends Sale>(sale: T): T {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<Sale>(SALE_CREATED_EVENT, { detail: sale }));
  return sale;
}
