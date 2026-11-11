import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { errorHandler, HttpError, notFound } from './lib/http.js';
import { PAYU_FORM_HOSTS, planLocked } from './lib/subscription.js';
import { payuReturn, subscriptionRouter } from './routes/subscription.js';
import { csrfGuard, loadAuth, requireAuth } from './middleware/auth.js';
import { adminRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { ebillingRouter } from './routes/ebilling.js';
import { industryRouter } from './routes/industry.js';
import { jobsRouter } from './routes/jobs.js';
import { peopleRouter } from './routes/people.js';
import { platformRouter } from './routes/platform.js';
import { referralsRouter } from './routes/referrals.js';
import { importMoreRouter } from './routes/importMore.js';
import { transactionsRouter } from './routes/transactions.js';
import { workspaceRouter } from './routes/workspace.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind Render's load balancer in production, trust the first proxy hop so
  // req.ip (rate limiting) and req.secure reflect the real client.
  app.set('trust proxy', config.isProd ? 1 : 'loopback');
  app.use(
    helmet({
      // Default policy, plus permission to post the checkout form to PayU's hosted payment page.
      contentSecurityPolicy: config.isProd ? { directives: { formAction: ["'self'", ...PAYU_FORM_HOSTS] } } : false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  // PayU posts the payment result here as a normal form (no app header, no session needed).
  app.post('/api/payments/payu/return', express.urlencoded({ extended: false, limit: '64kb' }), (req, res, next) => {
    payuReturn(req, res).catch(next);
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  api.use(csrfGuard);
  api.use(loadAuth);
  api.use('/auth', authRouter);
  // Everything below needs a signed-in user.
  api.use(requireAuth);
  // Plan page and payments stay reachable while the plan is unpaid.
  api.use(subscriptionRouter);
  api.use((req, _res, next) => {
    const a = req.auth!;
    if (a.tenant && !a.isSuperAdmin && planLocked(a.tenant)) throw new HttpError(402, 'Your SAHASRA plan is not active. Buy or renew the plan to continue.', { code: 'PLAN_REQUIRED' });
    next();
  });
  api.use(referralsRouter);
  api.use(importMoreRouter);
  api.use(platformRouter);
  api.use(workspaceRouter);
  api.use(catalogRouter);
  api.use(transactionsRouter);
  api.use(peopleRouter);
  api.use(industryRouter);
  api.use(jobsRouter);
  api.use(adminRouter);
  api.use(analyticsRouter);
  api.use(ebillingRouter);
  api.use(() => {
    throw notFound('API route');
  });
  app.use('/api', api);

  // In production the API also serves the built web app.
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
  if (config.isProd && fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
