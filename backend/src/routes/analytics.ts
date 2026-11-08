import { Router } from 'express';
import { z } from 'zod';
import * as assistant from '../analytics/assistant.js';
import * as dash from '../analytics/dashboard.js';
import * as details from '../analytics/details.js';
import * as gst from '../analytics/gst.js';
import { buildReport, REPORT_CATEGORIES, REPORT_PAGES } from '../analytics/reports.js';
import { search } from '../analytics/search.js';
import { saleOut } from '../lib/mappers.js';
import { plain } from '../lib/serialize.js';
import { requiredText } from '../lib/validate.js';
import { can, guard, requireTenant, tid } from '../middleware/auth.js';

export const analyticsRouter = Router();

const RANGES = ['today', 'yesterday', '7d', '30d', 'month', 'quarter', 'year'] as const;
const SERIES = ['today', '7d', '30d', '3m', '1y'] as const;
const rangeOf = (v: unknown) => z.enum(RANGES).catch('today').parse(v);
const branchOf = (v: unknown) => z.string().max(60).catch('all').parse(v ?? 'all');

const D = [requireTenant, guard('dashboard')];

analyticsRouter.get('/dashboard/kpis', ...D, async (req, res) => {
  const list = await dash.kpis(tid(req), rangeOf(req.query.range), branchOf(req.query.branch));
  res.json(can(req.auth!, 'dashboard', 'viewProfit') ? list : list.filter((k) => k.id !== 'profit'));
});
/** What's behind each dashboard card: bills, payments by mode, expenses, profit after cost. */
analyticsRouter.get('/dashboard/details/:kind', ...D, async (req, res) => {
  const kind = z.enum(['sales', 'collection', 'expenses', 'profit']).parse(req.params.kind);
  const range = rangeOf(req.query.range);
  const branch = branchOf(req.query.branch);
  if (kind === 'profit' && !can(req.auth!, 'dashboard', 'viewProfit')) {
    res.status(403).json({ error: 'Your role is not allowed to view profit.' });
    return;
  }
  const t = tid(req);
  res.json(
    kind === 'sales' ? await details.salesDetail(t, range, branch)
    : kind === 'collection' ? await details.collectionDetail(t, range, branch)
    : kind === 'expenses' ? await details.expensesDetail(t, range)
    : await details.profitDetail(t, range, branch),
  );
});
analyticsRouter.get('/dashboard/sales-series', ...D, async (req, res) => {
  res.json(await dash.salesSeries(tid(req), z.enum(SERIES).catch('7d').parse(req.query.range)));
});
analyticsRouter.get('/dashboard/health', ...D, async (req, res) => {
  res.json(await dash.health(tid(req)));
});
analyticsRouter.get('/dashboard/top-products', ...D, async (req, res) => {
  res.json(await dash.topProducts(tid(req)));
});
analyticsRouter.get('/dashboard/insights', ...D, async (req, res) => {
  res.json(await dash.insights(tid(req)));
});
analyticsRouter.get('/dashboard/gst-summary', ...D, async (req, res) => {
  res.json(await dash.gstSummary(tid(req)));
});
analyticsRouter.get('/dashboard/attendance-today', ...D, async (req, res) => {
  res.json(await dash.attendanceToday(tid(req)));
});
analyticsRouter.get('/dashboard/expense-breakdown', ...D, async (req, res) => {
  res.json(await dash.expenseBreakdown(tid(req)));
});
analyticsRouter.get('/dashboard/lists', ...D, async (req, res) => {
  const l = await dash.lists(tid(req));
  res.json({ recent: l.recent.map(saleOut), lowStock: plain(l.lowStock), customerDues: l.customerDues, vendorDues: l.vendorDues });
});

analyticsRouter.get('/reports/:category', requireTenant, guard('reports'), async (req, res) => {
  const category = z.enum(REPORT_CATEGORIES).parse(req.params.category);
  // Reports follow page access: no GST page → no GST report, and so on.
  if (!REPORT_PAGES[category].some((page) => can(req.auth!, page))) {
    res.status(403).json({ error: 'This report isn’t available for your business or role.' });
    return;
  }
  if (category === 'profit' && !can(req.auth!, 'reports', 'viewProfit')) {
    res.status(403).json({ error: 'Your role is not allowed to view profit.' });
    return;
  }
  res.json(await buildReport(tid(req), category, rangeOf(req.query.range ?? '30d'), branchOf(req.query.branch)));
});

const G = [requireTenant, guard('gst')];
analyticsRouter.get('/gst/summary', ...G, async (req, res) => res.json(await gst.summary(tid(req))));
analyticsRouter.get('/gst/sales-register', ...G, async (req, res) => res.json(await gst.salesRegister(tid(req))));
analyticsRouter.get('/gst/purchase-register', ...G, async (req, res) => res.json(await gst.purchaseRegister(tid(req))));
analyticsRouter.get('/gst/hsn', ...G, async (req, res) => res.json(await gst.hsnSummary(tid(req))));
analyticsRouter.get('/gst/rates', ...G, async (req, res) => res.json(await gst.rateBreakdown(tid(req))));
analyticsRouter.get('/gst/notes', ...G, async (req, res) => res.json(await gst.notes(tid(req))));

analyticsRouter.post('/assistant', ...D, async (req, res) => {
  const { question } = z.object({ question: requiredText('Question', 300) }).parse(req.body);
  res.json(await assistant.ask(tid(req), question));
});

analyticsRouter.get('/search', requireTenant, async (req, res) => {
  const q = z.string().max(80).catch('').parse(req.query.q ?? '');
  res.json(await search(tid(req), q, (page) => can(req.auth!, page)));
});
