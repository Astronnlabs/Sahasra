import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, CheckCircle2, Clock, Loader2, MapPin, Phone, Scissors, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ApiError, publicBookingService } from '@/services';

/** Calendar date in India, "YYYY-MM-DD", `offset` days from today. */
const istDate = (offset = 0) => new Date(Date.now() + 330 * 60_000 + offset * 864e5).toISOString().slice(0, 10);
const dateLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const dayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const time12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};
const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/;

/**
 * Online booking page a business shares with customers (app.sahaasra.in/book/<link>).
 * No login: the customer picks a service, an optional staff member, a day and a free time.
 */
export function BookPage() {
  const { slug = '' } = useParams();
  const info = useQuery({ queryKey: ['public-booking', slug], queryFn: () => publicBookingService.get(slug), retry: false });
  const [serviceId, setServiceId] = useState('');
  const [staff, setStaff] = useState('');
  const [date, setDate] = useState(istDate());
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { service: string; staff: string; start: string; durationMins: number; price: number; business: string }>(null);

  const data = info.data;
  const service = data?.services.find((s) => s.id === serviceId);
  const staffChoices = service ? (service.staff.length ? service.staff : data?.staff ?? []) : [];

  useEffect(() => {
    document.title = data ? `Book at ${data.business.name}` : 'Book an appointment';
  }, [data]);
  useEffect(() => setTime(''), [serviceId, staff, date]);
  useEffect(() => {
    if (staff && !staffChoices.includes(staff)) setStaff('');
  }, [staffChoices, staff]);

  const days = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: Math.min(data.hours.daysAhead, 30) + 1 }, (_, i) => istDate(i)).map((d) => ({ d, open: data.hours.days.includes(dayOf(d)) }));
  }, [data]);
  useEffect(() => {
    // Start on the first open day.
    if (days.length && !days.find((x) => x.d === date)?.open) {
      const first = days.find((x) => x.open);
      if (first) setDate(first.d);
    }
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const slots = useQuery({
    queryKey: ['public-slots', slug, serviceId, staff, date],
    queryFn: () => publicBookingService.slots(slug, { date, serviceId, staff: staff || undefined }),
    enabled: !!serviceId && !!date,
  });

  const phoneOk = PHONE_RE.test(phone.trim());
  const canBook = !!service && !!time && name.trim().length >= 2 && phoneOk && !submitting;

  const book = async () => {
    if (!service) return;
    setSubmitting(true);
    setError('');
    try {
      const r = await publicBookingService.book(slug, { serviceId: service.id, staff: staff || undefined, date, time, name: name.trim(), phone: phone.trim(), notes: notes.trim() || undefined });
      setDone(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not book. Please try again.');
      void slots.refetch();
    } finally {
      setSubmitting(false);
    }
  };

  if (info.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!data) {
    const missing = info.error instanceof ApiError && info.error.status === 404;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <CalendarCheck2 className="mx-auto h-10 w-10 text-subtle" />
          <h1 className="mt-4 text-lg font-semibold">{missing ? 'This booking link is not active' : 'Could not open the booking page'}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{missing ? 'Please ask the business for their current booking link.' : 'Check your internet connection and try again.'}</p>
        </div>
      </div>
    );
  }

  const b = data.business;
  if (done) {
    const when = new Date(done.start).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">You’re booked!</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{done.business} has your appointment.</p>
          <dl className="mt-5 space-y-2 rounded-xl bg-surface p-4 text-left text-[13px]">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Service</dt><dd className="font-medium">{done.service}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">When</dt><dd className="text-right font-medium">{when}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">With</dt><dd className="font-medium">{done.staff === 'Unassigned' ? 'Our team' : done.staff}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Duration</dt><dd className="font-medium">{done.durationMins} min</dd></div>
            {done.price > 0 && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Price</dt><dd className="font-medium">{formatINR(done.price)}</dd></div>}
          </dl>
          {b.phone && (
            <p className="mt-4 text-xs text-muted-foreground">
              Need to change it? Call <a className="font-medium text-primary" href={`tel:${b.phone.replace(/\s/g, '')}`}>{b.phone}</a>.
            </p>
          )}
          <Button variant="secondary" className="mt-5 w-full" onClick={() => { setDone(null); setTime(''); }}>Book another appointment</Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          {b.logo ? (
            <img src={b.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-border bg-white object-contain" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">{b.name.charAt(0)}</span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold">{b.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              {b.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {b.address}</span>}
              {b.phone && <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="flex items-center gap-1 text-primary"><Phone className="h-3 w-3" /> {b.phone}</a>}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <h2 className="text-xl font-semibold tracking-tight">Book an appointment</h2>

        <Step n={1} title="Choose a service">
          {data.services.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all', serviceId === s.id ? 'border-primary bg-primary-light ring-2 ring-primary/15' : 'border-border bg-card hover:border-primary/40')}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', serviceId === s.id ? 'bg-primary text-white' : 'bg-surface text-primary')}>
                    <Scissors className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{s.name}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> {s.durationMins} min</span>
                  </span>
                  {s.price > 0 && <span className="text-[13px] font-semibold">{formatINR(s.price)}</span>}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">This business hasn’t listed its services yet. Please call them to book.</p>
          )}
        </Step>

        {service && staffChoices.length > 0 && (
          <Step n={2} title="Choose a person (optional)">
            <div className="flex flex-wrap gap-2">
              <Chip active={!staff} onClick={() => setStaff('')}>Anyone available</Chip>
              {staffChoices.map((s) => (
                <Chip key={s} active={staff === s} onClick={() => setStaff(s)}>
                  <UserRound className="h-3.5 w-3.5" /> {s}
                </Chip>
              ))}
            </div>
          </Step>
        )}

        {service && (
          <Step n={staffChoices.length ? 3 : 2} title="Pick a day and time">
            <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {days.map(({ d, open }) => (
                <button
                  key={d}
                  type="button"
                  disabled={!open}
                  onClick={() => setDate(d)}
                  className={cn(
                    'flex w-[68px] shrink-0 flex-col items-center rounded-xl border px-2 py-2 text-xs transition-all',
                    date === d ? 'border-primary bg-primary text-white' : open ? 'border-border bg-card hover:border-primary/40' : 'border-border bg-surface text-subtle line-through opacity-60',
                  )}
                >
                  <span>{d === istDate() ? 'Today' : d === istDate(1) ? 'Tomorrow' : dateLabel(d).split(' ')[0]}</span>
                  <span className="text-base font-semibold">{Number(d.slice(8))}</span>
                  <span>{dateLabel(d).split(' ').slice(-1)[0]}</span>
                </button>
              ))}
            </div>
            <div className="mt-3">
              {slots.isLoading ? (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Finding free times…</p>
              ) : slots.data?.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.data.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTime(t)}
                      className={cn('rounded-lg border py-2 text-[13px] font-medium transition-all', time === t ? 'border-primary bg-primary text-white' : 'border-border bg-card hover:border-primary/40')}
                    >
                      {time12(t)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-surface p-3 text-[13px] text-muted-foreground">No free times on {dateLabel(date)}. Please pick another day.</p>
              )}
            </div>
          </Step>
        )}

        {service && time && (
          <Step n={staffChoices.length ? 4 : 3} title="Your details">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Your name</span>
                <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} autoComplete="name" placeholder="Full name" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Mobile number</span>
                <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 16))} inputMode="tel" autoComplete="tel" placeholder="98200 11223" />
                {phone && !phoneOk && <span className="mt-1 block text-xs text-danger">Enter a valid 10-digit mobile number.</span>}
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium">Anything we should know? (optional)</span>
                <Input value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 300))} placeholder="e.g. first visit" />
              </label>
            </div>
          </Step>
        )}

        {error && <p className="rounded-xl bg-danger-soft p-3 text-[13px] text-danger">{error}</p>}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {service ? (
              <>
                <p className="truncate text-[13px] font-semibold text-foreground">{service.name}{service.price > 0 ? ` · ${formatINR(service.price)}` : ''}</p>
                <p className="truncate">{time ? `${dateLabel(date)} · ${time12(time)}${staff ? ` · ${staff}` : ''}` : 'Pick a time'}</p>
              </>
            ) : (
              'Choose a service to start'
            )}
          </div>
          <Button size="lg" disabled={!canBook} loading={submitting} onClick={book}>
            <CalendarCheck2 /> Book
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 flex items-center gap-2 text-[14px] font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-white">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all', active ? 'border-primary bg-primary text-white' : 'border-border bg-card hover:border-primary/40')}
    >
      {children}
    </button>
  );
}

function Footer() {
  return (
    <p className="py-6 text-center text-xs text-subtle">
      Online booking by{' '}
      <a href="https://sahaasra.in" className="font-semibold text-primary" target="_blank" rel="noreferrer">
        SAHAASRA
      </a>
    </p>
  );
}
