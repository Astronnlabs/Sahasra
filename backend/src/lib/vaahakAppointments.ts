import { db } from '../db.js';
import { notify } from './audit.js';
import { bookableServices } from './booking.js';
import { HttpError } from './http.js';
import { open } from './secretBox.js';
import { vaahakAppointments } from './vaahak.js';

/**
 * Appointments forwarded from VAAHAK (booked on WhatsApp by VAAHAK's AI agent, or added there) are
 * copied into SAHAASRA Appointments. Uses the VAAHAK connection already set up for e-bills; VAAHAK
 * decides what is forwarded ("Forward to SAHAASRA" in VAAHAK → Appointments). Each VAAHAK
 * appointment becomes one SAHAASRA appointment, updated (never duplicated) when it changes there.
 */

const STATUS: Record<string, string> = { CONFIRMED: 'booked', COMPLETED: 'completed', CANCELLED: 'cancelled', NO_SHOW: 'no-show' };

/** 91XXXXXXXXXX → XXXXXXXXXX (as typed at the counter). */
const localPhone = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d || '—';
};

/** One sync per business at a time; a request during a sync runs once more right after it. */
const inFlight = new Map<string, Promise<{ imported: number; updated: number }>>();
const again = new Set<string>();

export function syncVaahakAppointments(tenantId: string): Promise<{ imported: number; updated: number }> {
  const running = inFlight.get(tenantId);
  if (running) {
    again.add(tenantId);
    return running;
  }
  const p = syncOnce(tenantId).finally(() => {
    inFlight.delete(tenantId);
    if (again.delete(tenantId)) void syncVaahakAppointments(tenantId).catch(() => undefined);
  });
  inFlight.set(tenantId, p);
  return p;
}

/** VAAHAK says appointments changed for this account: fetch them now (it sends no data itself). */
export async function vaahakAppointmentsChanged(accountId: string) {
  const links = await db.vaahakLink.findMany({ where: { accountId }, select: { tenantId: true } });
  for (const l of links) void syncVaahakAppointments(l.tenantId).catch(() => undefined);
  return links.length;
}

async function syncOnce(tenantId: string) {
  const link = await db.vaahakLink.findUnique({ where: { tenantId } });
  if (!link) return { imported: 0, updated: 0 };
  let imported = 0;
  let updated = 0;
  try {
    const since = link.appointmentsCursor ?? new Date(0);
    const { appointments, serverTime } = await vaahakAppointments({ accountId: link.accountId, key: open(link.keyEnc) }, since);
    const services = appointments.length ? await bookableServices(tenantId) : [];
    for (const a of appointments) {
      const svc = services.find((s) => s.name.toLowerCase() === (a.service ?? '').trim().toLowerCase());
      const existing = await db.appointment.findFirst({ where: { tenantId, externalId: a.id } });
      const data = {
        customer: (a.customerName || 'WhatsApp customer').slice(0, 60),
        phone: localPhone(a.contactPhone || a.customerPhone),
        service: (a.service || 'Appointment').slice(0, 80),
        start: new Date(a.startsAt),
        durationMins: Math.min(Math.max(a.durationMinutes || svc?.durationMins || 30, 5), 720),
        status: STATUS[a.status] ?? 'booked',
        notes: (a.notes ?? '').slice(0, 300),
      };
      if (existing) {
        // Keep the staff member and price chosen in SAHAASRA; a started/finished visit keeps its status.
        const keepStatus = ['in-progress', 'completed'].includes(existing.status) && data.status === 'booked';
        await db.appointment.update({ where: { id: existing.id }, data: { ...data, status: keepStatus ? existing.status : data.status } });
        updated++;
      } else {
        await db.appointment.create({ data: { tenantId, ...data, staff: 'Unassigned', price: svc?.price ?? 0, source: 'vaahak', externalId: a.id } });
        imported++;
      }
    }
    await db.vaahakLink.update({ where: { tenantId }, data: { appointmentsCursor: new Date(serverTime), appointmentsSyncedAt: new Date(), appointmentsError: null } });
    if (imported) await notify(tenantId, 'booking', `${imported} new appointment${imported === 1 ? '' : 's'} from VAAHAK`, 'Booked on WhatsApp. Assign a staff member in Appointments.', '/appointments');
  } catch (e) {
    const message = e instanceof HttpError && e.status === 404 ? 'VAAHAK needs an update to forward appointments.' : e instanceof Error ? e.message : 'Could not reach VAAHAK';
    await db.vaahakLink.update({ where: { tenantId }, data: { appointmentsError: message.slice(0, 200) } }).catch(() => undefined);
    throw e;
  }
  return { imported, updated };
}

let running = false;
/** Every minute: copies new and changed VAAHAK appointments for every business connected to VAAHAK. */
export function startVaahakAppointmentSync() {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const links = await db.vaahakLink.findMany({ select: { tenantId: true } });
      for (const l of links) await syncVaahakAppointments(l.tenantId).catch(() => undefined);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 20_000);
  setInterval(() => void tick(), 60_000);
}
