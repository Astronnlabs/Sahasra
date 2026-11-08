import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { sweepStockAlerts } from './lib/stockAlerts.js';

const app = createApp();

await db.$connect();
const server = app.listen(config.PORT, () => {
  console.log(`SAHASRA API listening on http://localhost:${config.PORT}`);
});

// Housekeeping: remove expired sessions every hour.
const sweep = setInterval(() => {
  db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch((e) => console.error('session sweep failed', e));
}, 3600_000);

// Items still low or out of stock get a reminder (at most once a day each) — checked now and every 3 hours.
const remindStock = () => sweepStockAlerts().catch((e) => console.error('stock alert sweep failed', e));
const stockTimer = setTimeout(remindStock, 15_000);
const stockSweep = setInterval(remindStock, 3 * 3600_000);

const shutdown = () => {
  clearInterval(sweep);
  clearTimeout(stockTimer);
  clearInterval(stockSweep);
  server.close(() => {
    db.$disconnect().finally(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
