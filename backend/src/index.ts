import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { sweepStockAlerts } from './lib/stockAlerts.js';
import { startVaahakAppointmentSync } from './lib/vaahakAppointments.js';

const app = createApp();

await db.$connect();
const server = app.listen(config.PORT, () => {
  console.log(`SAHAASRA API listening on http://localhost:${config.PORT}`);
});

// Housekeeping: remove expired sessions every hour.
const sweep = setInterval(() => {
  db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch((e) => console.error('session sweep failed', e));
}, 3600_000);

// Items still low or out of stock get a reminder (at most once a day each) — checked now and every 3 hours.
const remindStock = () => sweepStockAlerts().catch((e) => console.error('stock alert sweep failed', e));
const stockTimer = setTimeout(remindStock, 15_000);
const stockSweep = setInterval(remindStock, 3 * 3600_000);

// Appointments forwarded from VAAHAK are copied in every minute.
startVaahakAppointmentSync();

// VAAHAK on free hosting falls asleep when idle and then needs ~30 s to answer the next bill.
// A light ping every 4 minutes keeps it awake, so WhatsApp bills go out in seconds.
const wakeVaahak = () => {
  fetch(`${config.VAAHAK_API_URL.replace(/\/+$/, '')}/api/health`, { signal: AbortSignal.timeout(60_000) }).catch(() => undefined);
};
const vaahakAwake = setInterval(wakeVaahak, 4 * 60_000);
setTimeout(wakeVaahak, 5_000);

const shutdown = () => {
  clearInterval(sweep);
  clearTimeout(stockTimer);
  clearInterval(stockSweep);
  clearInterval(vaahakAwake);
  server.close(() => {
    db.$disconnect().finally(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
