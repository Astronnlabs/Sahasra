import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db.js';
import { notify } from '../lib/audit.js';
import { bookableServices, bookableStaff, bookingSettingsOf, freeSlots, istInstant, staffPool } from '../lib/booking.js';
import { badRequest, notFound } from '../lib/http.js';
import { phone } from '../lib/validate.js';
import { vaahakAppointmentsChanged } from '../lib/vaahakAppointments.js';

/**
 * Public online booking (no login): app.sahaasra.in/book/<slug>. Shows only what a customer
 * needs — the business name, services with prices and free times — never other customers' details.
 */
export const publicBookingRouter = Router();

const readLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Please wait a minute.' } });
const bookLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many bookings from this network. Please call the business instead.' } });

async function businessBySlug(slug: string) {
  const t = await db.tenant.findUnique({
    where: { bookingSlug: slug.slice(0, 60) },
    select: { id: true, name: true, type: true, settings: true, status: true, addressLine: true, city: true, businessPhone: true, ownerPhone: true, logoUploadId: true },
  });
  if (!t || t.status === 'suspended' || t.status === 'churned') throw notFound('Booking page');
  const settings = bookingSettingsOf(t.settings);
  if (!settings.enabled) throw notFound('Booking page');
  return { t, settings };
}

/**
 * VAAHAK calls this the moment an appointment is booked or changed there. It carries no
 * appointment data: SAHAASRA then fetches the changes from VAAHAK with its own connection key,
 * so a fake call can do nothing but trigger a harmless check.
 */
const pingLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests.' } });
publicBookingRouter.post('/vaahak/appointments-changed', pingLimiter, async (req, res) => {
  const { accountId } = z.object({ accountId: z.string().trim().min(10).max(60) }).parse(req.body);
  await vaahakAppointmentsChanged(accountId);
  res.json({ ok: true });
});

publicBookingRouter.get('/booking/:slug', readLimiter, async (req, res) => {
  const { t, settings } = await businessBySlug(String(req.params.slug));
  const [services, staff] = await Promise.all([bookableServices(t.id), bookableStaff(t.id)]);
  res.json({
    business: {
      name: t.name,
      address: [t.addressLine, t.city].filter(Boolean).join(', '),
      phone: t.businessPhone || t.ownerPhone || '',
      logo: t.logoUploadId ? `/api/public/booking/${encodeURIComponent(String(req.params.slug))}/logo` : null,
    },
    services: services.map(({ id, name, durationMins, price, category, staff: s }) => ({ id, name, durationMins, price, category, staff: s.filter((x) => staff.includes(x)) })),
    staff,
    hours: { open: settings.open, close: settings.close, days: settings.days, daysAhead: settings.daysAhead },
  });
});

publicBookingRouter.get('/booking/:slug/logo', readLimiter, async (req, res) => {
  const { t } = await businessBySlug(String(req.params.slug));
  const row = t.logoUploadId ? await db.upload.findFirst({ where: { id: t.logoUploadId, tenantId: t.id } }) : null;
  if (!row || !row.mimeType.startsWith('image/')) throw notFound('Logo');
  res.setHeader('Content-Type', row.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(row.path);
});

publicBookingRouter.get('/booking/:slug/slots', readLimiter, async (req, res) => {
  const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), serviceId: z.string().min(1).max(40), staff: z.string().max(60).optional() }).parse(req.query);
  const { t, settings } = await businessBySlug(String(req.params.slug));
  const [services, team] = await Promise.all([bookableServices(t.id), bookableStaff(t.id)]);
  const svc = services.find((s) => s.id === q.serviceId);
  if (!svc) throw notFound('Service');
  if (q.staff && !team.includes(q.staff)) throw badRequest('Choose a staff member from the list.');
  const slots = await freeSlots(t.id, settings, q.date, svc.durationMins, staffPool(team, svc.staff, q.staff || undefined));
  // Only the times are shown to the public, not who is free.
  res.json(slots.map((s) => s.time));
});

publicBookingRouter.post('/booking/:slug', bookLimiter, async (req, res) => {
  const b = z
    .object({
      serviceId: z.string().min(1).max(40),
      staff: z.string().max(60).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      name: z.string().trim().min(2, 'Enter your name').max(60),
      phone,
      notes: z.string().trim().max(300).default(''),
    })
    .parse(req.body);
  const { t, settings } = await businessBySlug(String(req.params.slug));
  const [services, team] = await Promise.all([bookableServices(t.id), bookableStaff(t.id)]);
  const svc = services.find((s) => s.id === b.serviceId);
  if (!svc) throw notFound('Service');
  if (b.staff && !team.includes(b.staff)) throw badRequest('Choose a staff member from the list.');

  // The time is checked again at the moment of booking, so two people can't take the same slot.
  const slot = (await freeSlots(t.id, settings, b.date, svc.durationMins, staffPool(team, svc.staff, b.staff || undefined))).find((s) => s.time === b.time);
  if (!slot) throw badRequest('Sorry, that time was just taken. Please pick another time.');

  const start = istInstant(b.date, b.time);
  const appt = await db.appointment.create({
    data: {
      tenantId: t.id,
      customer: b.name.replace(/[<>]/g, ''),
      phone: b.phone,
      service: svc.name,
      staff: slot.staff[0],
      start,
      durationMins: svc.durationMins,
      price: svc.price,
      status: 'booked',
      source: 'online',
      notes: b.notes.replace(/[<>]/g, ''),
    },
  });
  const when = start.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  await notify(t.id, 'booking', 'New online booking', `${appt.customer} booked ${svc.name} with ${appt.staff} on ${when}.`, '/appointments');
  res.status(201).json({ id: appt.id, business: t.name, service: svc.name, staff: appt.staff, start: start.toISOString(), durationMins: svc.durationMins, price: svc.price });
});
