import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage } from '@/lib/storage';

export type WidgetId =
  | 'kpi-sales'
  | 'kpi-collection'
  | 'kpi-expenses'
  | 'kpi-profit'
  | 'sales-chart'
  | 'health'
  | 'top-products'
  | 'insights'
  | 'transactions'
  | 'low-stock'
  | 'customer-dues'
  | 'vendor-dues'
  | 'gst-summary'
  | 'attendance'
  | 'expense-breakdown';

export interface WidgetMeta {
  id: WidgetId;
  label: string;
  description: string;
  /** Tailwind column span classes on the 12-column dashboard grid. */
  span: string;
}

export const WIDGETS: WidgetMeta[] = [
  { id: 'kpi-sales', label: "Today's Sales", description: 'Revenue billed today', span: 'sm:col-span-6 xl:col-span-3' },
  { id: 'kpi-collection', label: "Today's Collection", description: 'Payments received today', span: 'sm:col-span-6 xl:col-span-3' },
  { id: 'kpi-expenses', label: 'Expenses', description: 'Money spent today', span: 'sm:col-span-6 xl:col-span-3' },
  { id: 'kpi-profit', label: 'Profit', description: 'Estimated profit today', span: 'sm:col-span-6 xl:col-span-3' },
  { id: 'sales-chart', label: 'Sales Chart', description: 'Sales overview with comparisons', span: 'xl:col-span-8' },
  { id: 'health', label: 'Business Health', description: 'Overall score and breakdown', span: 'md:col-span-6 xl:col-span-4' },
  { id: 'top-products', label: 'Top Products', description: 'Best sellers by revenue', span: 'md:col-span-6 xl:col-span-6' },
  { id: 'insights', label: 'Smart Insights', description: 'Automatic business observations', span: 'xl:col-span-6' },
  { id: 'transactions', label: 'Recent Transactions', description: 'Latest invoices', span: 'xl:col-span-8' },
  { id: 'low-stock', label: 'Low Stock', description: 'Items below minimum level', span: 'md:col-span-6 xl:col-span-4' },
  { id: 'customer-dues', label: 'Customer Dues', description: 'Outstanding receivables', span: 'md:col-span-6 xl:col-span-4' },
  { id: 'vendor-dues', label: 'Vendor Dues', description: 'Outstanding payables', span: 'md:col-span-6 xl:col-span-4' },
  { id: 'gst-summary', label: 'GST Summary', description: 'This period’s tax position', span: 'md:col-span-6 xl:col-span-4' },
  { id: 'attendance', label: 'Employee Attendance', description: 'Who is in today', span: 'md:col-span-6 xl:col-span-6' },
  { id: 'expense-breakdown', label: 'Expense Breakdown', description: 'Spend by category', span: 'md:col-span-6 xl:col-span-6' },
];

const DEFAULT_ORDER = WIDGETS.map((w) => w.id);
const DEFAULT_HIDDEN: WidgetId[] = ['vendor-dues', 'attendance'];

interface Layout {
  order: WidgetId[];
  hidden: WidgetId[];
}

function load(): Layout {
  const saved = readStorage<Layout | null>('dashboard.layout', null);
  if (!saved) return { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN };
  // keep forward-compatible with widgets added later
  const known = saved.order.filter((id) => DEFAULT_ORDER.includes(id));
  const missing = DEFAULT_ORDER.filter((id) => !known.includes(id));
  return { order: [...known, ...missing], hidden: saved.hidden.filter((id) => DEFAULT_ORDER.includes(id)) };
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState<Layout>(load);

  useEffect(() => writeStorage('dashboard.layout', layout), [layout]);

  const toggle = useCallback((id: WidgetId) => {
    setLayout((l) => ({ ...l, hidden: l.hidden.includes(id) ? l.hidden.filter((x) => x !== id) : [...l.hidden, id] }));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setLayout((l) => {
      if (to < 0 || to >= l.order.length) return l;
      const order = l.order.slice();
      const [item] = order.splice(from, 1);
      order.splice(to, 0, item);
      return { ...l, order };
    });
  }, []);

  const reset = useCallback(() => setLayout({ order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN }), []);

  return { ...layout, toggle, move, reset, visible: layout.order.filter((id) => !layout.hidden.includes(id)) };
}
