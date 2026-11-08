import type { PaymentMethod } from '@/types';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank Transfer',
  credit: 'Credit',
  split: 'Split',
};

export const PAYMENT_OPTIONS = (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((value) => ({ value, label: PAYMENT_LABELS[value] }));
