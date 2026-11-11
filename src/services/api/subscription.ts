import { api } from './client';
import type { PlanPeriod, SubscriptionState } from './auth';

export interface PlanOption {
  period: PlanPeriod;
  label: string;
  months: number;
  price: number;
}

export interface BuyablePlan {
  id: string;
  name: string;
  options: PlanOption[];
}

export interface PlanPaymentRow {
  id: string;
  txnid: string;
  plan: string;
  planName: string;
  period: PlanPeriod;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  mode: string | null;
  error: string | null;
  validTo: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface SubscriptionOverview {
  businessName: string;
  state: SubscriptionState;
  plans: BuyablePlan[];
  /** PayU is configured on the server. */
  canPay: boolean;
  /** The signed-in user may pay (owner or admin, not support mode). */
  canBuy: boolean;
  payments: PlanPaymentRow[];
}

export interface PayuForm {
  action: string;
  fields: Record<string, string>;
}

export const subscriptionService = {
  get: () => api.get<SubscriptionOverview>('/subscription'),
  checkout: (plan: string, period: PlanPeriod) => api.post<PayuForm>('/subscription/checkout', { plan, period }),
  check: (id: string) => api.post<SubscriptionOverview & { status: PlanPaymentRow['status'] }>(`/subscription/payments/${id}/check`),
};

/** Sends the browser to PayU's hosted payment page with the signed form. */
export function goToPayU(form: PayuForm) {
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = form.action;
  for (const [name, value] of Object.entries(form.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    f.appendChild(input);
  }
  document.body.appendChild(f);
  f.submit();
}
