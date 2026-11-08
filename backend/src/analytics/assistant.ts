import { differenceInCalendarDays, subDays } from 'date-fns';
import { costOf, counted, isLowStock, loadCustomers, loadExpenses, loadProducts, loadSales, sum } from './data.js';

export interface AssistantReply {
  text: string;
  bullets?: string[];
  link?: { label: string; href: string };
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Rule-based answers computed from the business's own data. No external AI service is called. */
export async function ask(tenantId: string, question: string): Promise<AssistantReply> {
  const q = question.toLowerCase();
  const now = new Date();

  if (/(sale|revenue|today)/.test(q) && !/profit/.test(q)) {
    const todays = (await loadSales(tenantId, subDays(now, 1))).filter((s) => counted(s) && differenceInCalendarDays(now, s.date) === 0);
    if (!todays.length) return { text: 'No sales have been recorded today yet. Bills you create in POS will show up here.', link: { label: 'Open POS', href: '/pos' } };
    const total = sum(todays, (s) => s.total);
    return {
      text: `Today's sales are ${inr(total)} across ${todays.length} ${plural(todays.length, 'invoice', 'invoices')}.`,
      bullets: [`Collected: ${inr(sum(todays, (s) => s.paid))}`, `Average bill: ${inr(total / todays.length)}`],
      link: { label: 'Open sales', href: '/sales' },
    };
  }
  if (/(stock|inventory|run out)/.test(q)) {
    const all = await loadProducts(tenantId);
    if (!all.length) return { text: 'You have not added any products yet.', link: { label: 'Add products', href: '/products?new=1' } };
    const low = all.filter(isLowStock);
    if (!low.length) return { text: 'All products are above their minimum stock level.' };
    return { text: `${low.length} ${plural(low.length, 'product is', 'products are')} at or below minimum stock.`, bullets: low.slice(0, 5).map((p) => `${p.name} — ${p.stock} left (min ${p.minStock})`), link: { label: 'Review inventory', href: '/inventory' } };
  }
  if (/(owe|due|outstanding|receivable)/.test(q)) {
    const dues = (await loadCustomers(tenantId)).filter((c) => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
    if (!dues.length) return { text: 'No customer has any outstanding balance.' };
    return { text: `${dues.length} ${plural(dues.length, 'customer owes', 'customers owe')} you ${inr(sum(dues, (c) => c.outstanding))} in total.`, bullets: dues.slice(0, 5).map((c) => `${c.name} — ${inr(c.outstanding)}`), link: { label: 'View customers', href: '/customers' } };
  }
  if (/profit/.test(q)) {
    const from = subDays(now, 30);
    const [sales, expenses] = await Promise.all([loadSales(tenantId, from), loadExpenses(tenantId, from)]);
    const valid = sales.filter(counted);
    const revenue = sum(valid, (s) => s.total);
    const cost = costOf(valid);
    const exp = sum(expenses, (e) => e.amount);
    if (!revenue && !exp) return { text: 'There are no sales or expenses in the last 30 days to calculate profit from yet.' };
    const net = revenue - cost - exp;
    return { text: `In the last 30 days you made a net ${net >= 0 ? 'profit' : 'loss'} of ${inr(Math.abs(net))} on revenue of ${inr(revenue)}.`, bullets: [`Cost of goods: ${inr(cost)}`, `Expenses: ${inr(exp)}`], link: { label: 'Open profit report', href: '/reports' } };
  }
  if (/(return|haven|inactive|lost)/.test(q)) {
    const all = await loadCustomers(tenantId);
    if (!all.length) return { text: 'You have no customers yet.', link: { label: 'Add a customer', href: '/customers?new=1' } };
    const inactive = all.filter((c) => differenceInCalendarDays(now, new Date(c.lastPurchase)) > 45);
    if (!inactive.length) return { text: 'Every customer has purchased within the last 45 days.' };
    return {
      text: `${inactive.length} ${plural(inactive.length, 'customer has', 'customers have')} not purchased in over 45 days.`,
      bullets: inactive.slice(0, 5).map((c) => `${c.name} — last visit ${differenceInCalendarDays(now, new Date(c.lastPurchase))} days ago`),
      link: { label: 'Open customers', href: '/customers' },
    };
  }
  return { text: 'I can help with sales, stock, dues, profit and customer activity. Try one of the suggestions below.' };
}
