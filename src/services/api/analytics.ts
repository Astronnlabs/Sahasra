import type { AppNotification, Customer, Product, Sale, SearchResult, Vendor } from '@/types';
import { api } from './client';

// ── Dashboard ──
export type SalesRange = 'today' | '7d' | '30d' | '3m' | '1y';

export interface SeriesPoint {
  label: string;
  sales: number;
  previous: number;
}

export interface Kpi {
  id: 'sales' | 'collection' | 'expenses' | 'profit';
  label: string;
  value: number;
  change?: number;
}

interface DashboardLists {
  recent: Sale[];
  lowStock: Product[];
  customerDues: Customer[];
  vendorDues: Vendor[];
}

export interface Bucket {
  label: string;
  amount: number;
  count: number;
}
export interface Group {
  name: string;
  amount: number;
  count: number;
  qty: number;
}
export interface SalesDetail {
  summary: { total: number; bills: number; average: number; itemsSold: number; beforeGst: number; gst: number; discount: number };
  timeline: Bucket[];
  byCategory: Group[];
  byItem: Group[];
  bills: { id: string; invoiceNo: string; date: string; customerName: string; items: string; itemCount: number; total: number; paid: number; payment: string; status: string }[];
}
export interface CollectionDetail {
  summary: { net: number; received: number; refunds: number; payments: number };
  byMode: Group[];
  byKind: Group[];
  timeline: Bucket[];
  entries: { id: string; date: string; method: string; amount: number; kind: string; reference: string; customerName: string }[];
}
export interface ExpensesDetail {
  summary: { total: number; count: number; pending: number };
  byCategory: Group[];
  byMode: Group[];
  timeline: Bucket[];
  entries: { id: string; date: string; title: string; category: string; paidTo: string; method: string; amount: number; status: string }[];
}
export interface ProfitRow {
  name: string;
  qty: number;
  sales: number;
  cost: number;
  profit: number;
  margin: number;
  noCost: boolean;
}
export interface ProfitDetail {
  summary: { salesInclGst: number; gst: number; netSales: number; cost: number; grossProfit: number; grossMargin: number; expenses: number; netProfit: number; netMargin: number; itemsWithoutCost: number };
  byCategory: ProfitRow[];
  byItem: ProfitRow[];
}
export interface DetailMap {
  sales: SalesDetail;
  collection: CollectionDetail;
  expenses: ExpensesDetail;
  profit: ProfitDetail;
}

export const dashboardService = {
  kpis: (range = 'today', branch = 'all') => api.get<Kpi[]>('/dashboard/kpis', { range, branch }),
  /** Everything behind one dashboard card for the chosen period and branch. */
  details: <K extends keyof DetailMap>(kind: K, range: string, branch: string) => api.get<DetailMap[K]>(`/dashboard/details/${kind}`, { range, branch }),
  salesSeries: (range: SalesRange) => api.get<SeriesPoint[]>('/dashboard/sales-series', { range }),
  health: () => api.get<{ score: number; label: string; breakdown: { label: string; score: number }[] } | null>('/dashboard/health'),
  topProducts: () => api.get<{ id: string; name: string; category: string; units: number; revenue: number; trend?: number }[]>('/dashboard/top-products'),
  insights: () => api.get<{ id: string; tone: 'success' | 'warning' | 'danger' | 'primary'; title: string; text: string; href: string }[]>('/dashboard/insights'),
  lists: () => api.get<DashboardLists>('/dashboard/lists'),
  recentTransactions: async () => (await api.get<DashboardLists>('/dashboard/lists')).recent,
  lowStock: async () => (await api.get<DashboardLists>('/dashboard/lists')).lowStock,
  customerDues: async () => (await api.get<DashboardLists>('/dashboard/lists')).customerDues,
  vendorDues: async () => (await api.get<DashboardLists>('/dashboard/lists')).vendorDues,
  gstSummary: () => api.get<{ output: number; input: number; liability: number; itc: number; dueInDays: number; period: string }>('/dashboard/gst-summary'),
  attendanceToday: () => api.get<{ total: number; present: number; late: number; absent: number; leave: number; 'half-day': number; holiday: number; unmarked: number }>('/dashboard/attendance-today'),
  expenseBreakdown: () => api.get<{ name: string; value: number }[]>('/dashboard/expense-breakdown'),
};

// ── Reports ──
export type ReportCategory = 'sales' | 'profit' | 'inventory' | 'customers' | 'vendors' | 'expenses' | 'employees' | 'gst' | 'payments';
export type CellFormat = 'currency' | 'number' | 'percent' | 'text';

export interface ReportData {
  kpis: { label: string; value: number; format: CellFormat; change?: number }[];
  chart: {
    type: 'area' | 'bar' | 'donut';
    title: string;
    data: { label: string; value: number; value2?: number }[];
    series: [string] | [string, string];
  };
  table: {
    title: string;
    columns: { key: string; label: string; format: CellFormat }[];
    rows: Record<string, string | number>[];
  };
}

export const reportsService = {
  get: (category: ReportCategory, range: string, branch: string) => api.get<ReportData>(`/reports/${category}`, { range, branch }),
};

// ── GST ──
export interface GstInvoiceRow {
  id: string;
  number: string;
  party: string;
  gstin: string;
  date: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  type: 'B2B' | 'B2C';
}

interface NoteRow {
  id: string;
  number: string;
  party: string;
  against: string;
  date: string;
  taxable: number;
  tax: number;
  reason: string;
}

export const gstService = {
  summary: () =>
    api.get<{
      output: number;
      input: number;
      liability: number;
      itc: number;
      period: string;
      returns: { id: string; label: string; description: string; due: string; status: 'not-started' | 'filed' }[];
    }>('/gst/summary'),
  salesRegister: () => api.get<GstInvoiceRow[]>('/gst/sales-register'),
  purchaseRegister: () => api.get<GstInvoiceRow[]>('/gst/purchase-register'),
  hsnSummary: () => api.get<{ hsn: string; description: string; qty: number; taxable: number; rate: number; tax: number }[]>('/gst/hsn'),
  rateBreakdown: () => api.get<{ label: string; value: number; value2: number }[]>('/gst/rates'),
  notes: () => api.get<{ credit: NoteRow[]; debit: NoteRow[] }>('/gst/notes'),
};

// ── Assistant & search ──
export interface AssistantReply {
  text: string;
  bullets?: string[];
  link?: { label: string; href: string };
}

export const ASSISTANT_SUGGESTIONS = [
  'How were sales today?',
  'Which products are low in stock?',
  'Who owes me money?',
  'What was my profit last month?',
  "Which customers haven't returned?",
];

export const assistantService = {
  ask: (question: string) => api.post<AssistantReply>('/assistant', { question }),
};

export const searchService = {
  query: (q: string) => (q.trim().length < 2 ? Promise.resolve([] as SearchResult[]) : api.get<SearchResult[]>('/search', { q: q.trim() })),
};

// ── Notifications ──
export const notificationsService = {
  list: () => api.get<AppNotification[]>('/notifications'),
  markRead: (id: string) => api.post<{ ok: true }>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ ok: true }>('/notifications/read-all'),
  remove: (id: string) => api.del<{ ok: true }>(`/notifications/${id}`),
};
