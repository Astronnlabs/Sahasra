import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { num } from './serialize.js';

/**
 * Online booking: a business shares app.sahaasra.in/book/<slug>; customers pick a service, an
 * optional staff member and a free time, and the appointment appears in Appointments (confirmed,
 * never double-booked). Times are Indian Standard Time.
 */

export const bookingSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Opening and closing time, "HH:mm". */
  open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  /** Days open: 0 = Sunday … 6 = Saturday. */
  days: z.array(z.number().int().min(0).max(6)).max(7),
  /** Minutes between start times offered. */
  step: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  /** How many days ahead customers can book. */
  daysAhead: z.number().int().min(1).max(90),
  /** Bookings one time slot can take: 0 = one per staff member, otherwise this many in total. */
  perSlot: z.number().int().min(0).max(20),
});
export type BookingSettings = z.infer<typeof bookingSettingsSchema>;

export const DEFAULT_BOOKING: BookingSettings = { enabled: true, open: '10:00', close: '21:00', days: [0, 1, 2, 3, 4, 5, 6], step: 30, daysAhead: 30, perSlot: 0 };

export function bookingSettingsOf(settings: unknown): BookingSettings {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).onlineBooking : undefined;
  const parsed = bookingSettingsSchema.partial().safeParse(raw ?? {});
  return { ...DEFAULT_BOOKING, ...(parsed.success ? parsed.data : {}) };
}

/** A short, unguessable link name made from the business name, e.g. "taylo-gang-k3f9". */
export function newBookingSlug(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '') || 'book';
  return `${base}-${randomBytes(3).toString('hex').slice(0, 4)}`;
}

const IST = '+05:30';
/** "2026-11-16" + "10:30" in India → the instant. */
export const istInstant = (date: string, time: string) => new Date(`${date}T${time}:00${IST}`);
/** Day of the week (0 = Sunday) of a calendar date. */
export const dayOfWeek = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
/** Today's date in India, "YYYY-MM-DD". */
export const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Staff who take bookings: active employees (or one "Unassigned" column when there are none). */
export async function bookableStaff(tenantId: string) {
  const rows = await db.employee.findMany({ where: { tenantId, status: { not: 'inactive' } }, select: { name: true }, orderBy: { name: 'asc' } });
  return rows.map((r) => r.name);
}

export async function bookableServices(tenantId: string) {
  const rows = await db.serviceItem.findMany({ where: { tenantId, status: 'active' }, orderBy: { name: 'asc' } });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    durationMins: s.durationMins || 30,
    price: num(s.price),
    category: s.category ?? '',
    /** Staff who do this service (empty = anyone). */
    staff: Array.isArray(s.staff) ? (s.staff as unknown[]).filter((x): x is string => typeof x === 'string') : [],
  }));
}

/** Who can be booked for a service: the chosen person, else the service's own staff, else everyone. */
export function staffPool(team: string[], serviceStaff: string[], chosen?: string) {
  if (chosen) return [chosen];
  const own = serviceStaff.filter((s) => team.includes(s));
  return own.length ? own : team.length ? team : ['Unassigned'];
}

/**
 * Free start times on a day for a service: inside opening hours, not in the past, and with the
 * chosen staff member (or at least one staff member) free for the whole service.
 */
export async function freeSlots(tenantId: string, settings: BookingSettings, date: string, durationMins: number, people: string[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const today = istToday();
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + settings.daysAhead * 864e5).toISOString().slice(0, 10);
  if (date < today || date > last || !settings.days.includes(dayOfWeek(date))) return [];

  const dayStart = istInstant(date, '00:00');
  const dayEnd = new Date(dayStart.getTime() + 864e5);
  const booked = await db.appointment.findMany({
    where: { tenantId, start: { gte: new Date(dayStart.getTime() - 12 * 3600e3), lt: dayEnd }, status: { notIn: ['cancelled', 'no-show'] } },
    select: { staff: true, start: true, durationMins: true },
  });
  const overlapping = (from: number, to: number, who?: string) =>
    booked.filter((b) => (!who || b.staff === who) && b.start.getTime() < to && b.start.getTime() + b.durationMins * 60_000 > from).length;

  const earliest = Date.now() + 15 * 60_000;
  const out: { time: string; staff: string[] }[] = [];
  for (let m = toMinutes(settings.open); m + durationMins <= toMinutes(settings.close); m += settings.step) {
    const from = istInstant(date, toTime(m)).getTime();
    if (from < earliest) continue;
    const to = from + durationMins * 60_000;
    if (settings.perSlot > 0) {
      // A set number of bookings per slot (whole business); each goes to the least busy person.
      if (overlapping(from, to) >= settings.perSlot) continue;
      out.push({ time: toTime(m), staff: [...people].sort((a, b) => overlapping(from, to, a) - overlapping(from, to, b)) });
    } else {
      // One booking per staff member at a time.
      const free = people.filter((p) => overlapping(from, to, p) === 0);
      if (free.length) out.push({ time: toTime(m), staff: free });
    }
  }
  return out;
}
