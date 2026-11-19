import {
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  Landmark,
  Link2,
  Lock,
  MessageCircle,
  PenTool,
  Printer,
  Receipt,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../components/Layout';
import { Eyebrow, SectionHead } from '../components/Section';
import { AstronLabsLogo } from '../components/AstronLabs';
import { COMPANY, loginUrl, lowestPrice, signupUrl } from '../config';

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Receipt, title: 'Fast POS billing', text: 'GST invoices in seconds with barcode search, discounts, UPI QR, cash, card, credit and split payments. Print on any thermal or A4 printer.' },
  { icon: Boxes, title: 'Live inventory', text: 'Stock goes down with every sale and up with every purchase. Low-stock alerts, batches and expiry, serial numbers and stock adjustments.' },
  { icon: Landmark, title: 'GST ready', text: 'Sales and purchase registers, HSN summary, credit and debit notes, and tax reports ready for your accountant.' },
  { icon: Users, title: 'Customers and vendors', text: 'Customer history, credit sales and dues. Purchases, vendor bills and payments in one place.' },
  { icon: CalendarCheck, title: 'Staff and payroll', text: 'Attendance, advances and monthly salaries. Give each staff member a login with only the screens they need.' },
  { icon: BarChart3, title: 'Reports', text: 'Today’s sales, profit, expenses, dues and top items on one dashboard. Export to Excel any time.' },
  { icon: MessageCircle, title: 'WhatsApp e-bills', text: 'Every bill PDF goes to your customer on WhatsApp automatically, from your own business number (through VAAHAK).' },
  { icon: Link2, title: 'Online booking link', text: 'Share your link — customers book a service and a free time themselves. WhatsApp bookings arrive in the same calendar.' },
  { icon: Printer, title: 'Print from your phone', text: 'Bluetooth thermal printers print straight from your phone with the SAHAASRA Android app. No extra app, no ads on your bill.' },
  { icon: PenTool, title: 'Bill Studio', text: 'Design your own bill with your logo, address, terms and UPI QR, for thermal or A4 printers.' },
  { icon: Lock, title: 'Safe and backed up', text: 'Your data is stored securely with nightly backups, role-based access and a full log of who changed what.' },
];

const INDUSTRIES = [
  ['Restaurant & café', 'Tables, KOT, kitchen'],
  ['Hotel & lodge', 'Rooms, reservations'],
  ['Salon & spa', 'Services, packages, appointments'],
  ['Grocery & supermarket', 'Fast barcode billing'],
  ['Pharmacy', 'Batches and expiry'],
  ['Jewellery', 'Metal rates, making charges'],
  ['Mobile & electronics', 'Serials, repairs'],
  ['Clothing & footwear', 'Sizes and colours'],
  ['Hardware', 'Units and bulk rates'],
  ['Stationery', 'Quick counter sales'],
  ['Any other shop', 'Set it up your way'],
];

const STEPS = [
  ['Sign up in 1 minute', 'Your business name, type and mobile number. No payment, no card.'],
  ['Use everything free for 7 days', 'Billing, WhatsApp e-bills, booking link, stock, staff — the full software.'],
  ['Keep going from ₹999/month', 'Love it? Pick monthly, quarterly or yearly and pay with UPI, card or net banking.'],
];

export function HomePage() {
  usePageTitle('SAHAASRA Billing Software');
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_0%,rgba(124,79,240,0.18),transparent),radial-gradient(40%_40%_at_0%_30%,rgba(124,79,240,0.10),transparent)]" />
        <div className="container-x relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            {/* The offer, big */}
            <a href={signupUrl()} className="group inline-flex items-center gap-3 rounded-2xl border-2 border-brand-500 bg-white px-4 py-2.5 shadow-lift dark:bg-white/5">
              <span className="rounded-xl bg-brand-600 px-3 py-1.5 text-2xl font-black leading-none tracking-tight text-white sm:text-3xl">7 DAYS</span>
              <span className="text-left">
                <span className="block text-xl font-black uppercase leading-none tracking-tight text-brand-700 sm:text-2xl dark:text-brand-200">Free trial</span>
                <span className="muted block text-xs font-medium">No payment · no card · every feature</span>
              </span>
              <ArrowRight className="h-5 w-5 text-brand-600 transition-transform group-hover:translate-x-1" />
            </a>
            <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[58px]">
              Bill in seconds. <span className="text-brand-600 dark:text-brand-300">Send it on WhatsApp.</span> Get booked online.
            </h1>
            <p className="muted mt-5 max-w-xl text-lg leading-8">
              SAHAASRA is the billing software for your counter: GST bills in seconds, the bill PDF on your customer’s WhatsApp automatically, and your own booking link so customers book
              themselves — plus stock, staff and reports in one place.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a className="btn btn-primary px-7 py-3.5 text-base" href={signupUrl()}>
                Start my 7-day free trial <ArrowRight className="h-4 w-4" />
              </a>
              <Link className="btn btn-outline" to="/pricing">See pricing</Link>
            </div>
            <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
              {['Free for 7 days — pay only if you love it', 'WhatsApp e-bills with the bill PDF', 'Online booking link for your customers', 'Works on computer, tablet and phone'].map((t) => (
                <li key={t} className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> {t}
                </li>
              ))}
            </ul>
            <p className="muted mt-4 flex items-center gap-2 text-sm">
              <Smartphone className="h-4 w-4 text-brand-600 dark:text-brand-300" />
              After the trial, plans from <strong className="text-slate-900 dark:text-white">₹{lowestPrice().toLocaleString('en-IN')}</strong>/month.
            </p>
          </div>

          <ExampleBill />
        </div>
      </section>

      {/* Spotlight: WhatsApp e-bills */}
      <section className="py-16 sm:py-24">
        <div className="container-x grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>WhatsApp e-billing</Eyebrow>
            <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight sm:text-[42px] sm:leading-[1.1]">
              Every bill lands on your customer’s <span className="text-emerald-600 dark:text-emerald-400">WhatsApp</span> — in seconds.
            </h2>
            <p className="muted mt-4 text-lg leading-8">
              Press <b className="text-slate-900 dark:text-white">Confirm payment</b> and SAHAASRA sends the bill PDF from <b className="text-slate-900 dark:text-white">your own business WhatsApp number</b>.
              No paper, no printing cost, and your name in front of the customer every time.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                ['Automatic', 'Sent the moment the bill is saved — you just start the next bill.'],
                ['Your bill design', 'The PDF looks exactly like your printed bill: logo, GST, UPI QR.'],
                ['Saves money', 'Less thermal paper, fewer reprints, and customers never lose a bill.'],
                ['Tracked', 'See every bill sent, delivered and read.'],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <span><b>{t}.</b> <span className="muted">{d}</span></span>
                </li>
              ))}
            </ul>
            <a className="btn btn-primary mt-8" href={signupUrl()}>
              Try WhatsApp e-bills free for 7 days <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <WhatsAppMock />
        </div>
      </section>

      {/* Spotlight: booking link */}
      <section className="bg-gradient-to-b from-brand-50 to-white py-16 sm:py-24 dark:from-brand-400/[0.06] dark:to-transparent">
        <div className="container-x grid items-center gap-12 lg:grid-cols-2">
          <BookingMock />
          <div className="lg:order-first">
            <Eyebrow>Online booking link</Eyebrow>
            <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight sm:text-[42px] sm:leading-[1.1]">
              Your own booking link. <span className="text-brand-600 dark:text-brand-300">Customers book themselves</span> — 24×7.
            </h2>
            <p className="muted mt-4 text-lg leading-8">
              Create your link in one click and share it on WhatsApp, Instagram and Google. Customers pick a service, a staff member and a free time — and the booking appears in your
              appointments instantly.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                ['One click to create', 'Your link like app.sahaasra.in/book/your-shop, ready to share.'],
                ['Only free times shown', 'Service length and every staff member’s bookings are checked — no double booking.'],
                ['WhatsApp AI bookings too', 'Appointments booked on WhatsApp through VAAHAK appear in the same calendar.'],
                ['Perfect for', 'Salons, spas, clinics, repair shops, studios — any business that takes appointments.'],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
                  <span><b>{t}.</b> <span className="muted">{d}</span></span>
                </li>
              ))}
            </ul>
            <a className="btn btn-primary mt-8" href={signupUrl()}>
              Create my booking link — free <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-slate-50 py-16 sm:py-24 dark:bg-white/[0.02]">
        <div className="container-x">
          <SectionHead title="What you get with SAHAASRA">Everything a shop owner needs every day, without spreadsheets or a paper register.</SectionHead>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="card p-6 transition-shadow hover:shadow-lift">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold">{f.title}</h3>
                <p className="muted mt-2 text-[15px] leading-6">{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="py-16 sm:py-24">
        <div className="container-x">
          <SectionHead title="Made for your kind of business">SAHAASRA changes its screens to fit how you work.</SectionHead>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map(([name, hint]) => (
              <div key={name} className="flex items-start gap-3 rounded-xl border border-slate-200/80 px-4 py-3.5 dark:border-white/10">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="muted text-sm">{hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="bg-slate-50 py-16 sm:py-24 dark:bg-white/[0.02]">
        <div className="container-x">
          <SectionHead title="Start in three steps" />
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="card p-6">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 text-[17px] font-semibold">{title}</h3>
                <p className="muted mt-2 text-[15px] leading-6">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Parent company */}
      <section className="py-16 sm:py-20">
        <div className="container-x">
          <div className="card grid items-center gap-8 p-8 sm:p-10 md:grid-cols-[1fr_1.1fr]">
            <AstronLabsLogo className="mx-auto h-auto max-h-28 max-w-full md:mx-0" />
            <div>
              <Eyebrow>Our company</Eyebrow>
              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">SAHAASRA is a product of {COMPANY.parent}</h2>
              <p className="muted mt-3 text-[16px] leading-7">
                {COMPANY.parent} builds software for Indian businesses. SAHAASRA brings billing, stock, staff and GST together, and {COMPANY.parent} develops, hosts and supports it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="py-16 sm:py-24">
        <div className="container-x">
          <div className="relative overflow-hidden rounded-3xl bg-brand-600 px-6 py-12 text-center text-white sm:px-12 sm:py-16">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_100%_0%,rgba(255,255,255,0.18),transparent)]" />
            <p className="relative text-sm font-bold uppercase tracking-[0.2em] text-white/80">Limited offer</p>
            <h2 className="relative mt-2 text-4xl font-black tracking-tight sm:text-6xl">7 DAYS FREE</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-[17px] text-white/85">
              Bills on WhatsApp, your own booking link, GST billing, stock and staff — try all of it free. After that, plans from ₹{lowestPrice().toLocaleString('en-IN')}/month.
            </p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a className="btn bg-white px-7 py-3.5 text-base text-brand-700 hover:bg-brand-50" href={signupUrl()}>Start my free trial</a>
              <a className="btn border border-white/40 text-white hover:bg-white/10" href={loginUrl()}>Login</a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/** A WhatsApp chat showing the bill message with the PDF. */
function WhatsAppMock() {
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[28px] border-8 border-slate-900 bg-[#efeae2] shadow-lift dark:border-slate-700" aria-label="Bill on WhatsApp">
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold">SG</span>
        <div>
          <p className="text-sm font-semibold">Sharma General Store</p>
          <p className="text-[11px] text-white/75">Business account</p>
        </div>
      </div>
      <div className="space-y-2 p-3">
        <div className="max-w-[88%] rounded-lg rounded-tl-none bg-white p-2 text-[13px] text-slate-900 shadow-sm">
          <div className="flex items-center gap-2.5 rounded-md bg-slate-100 p-2.5">
            <span className="flex h-10 w-8 items-center justify-center rounded bg-red-500 text-[10px] font-bold text-white">PDF</span>
            <div className="min-w-0">
              <p className="truncate font-medium">INV-0042.pdf</p>
              <p className="text-[11px] text-slate-500">1 page · 84 kB</p>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-line leading-snug">
            {'Hi Rahul, thank you for your purchase at Sharma General Store!\n\nBill no: INV-0042\nAmount: Rs. 995\nDate: 19 Nov 2026, 1:15 pm'}
          </p>
          <p className="mt-1 text-right text-[10px] text-slate-400">1:15 pm ✓✓</p>
        </div>
        <div className="ml-auto max-w-[60%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 text-[13px] text-slate-900 shadow-sm">
          Thank you! 🙏 <span className="ml-1 text-[10px] text-slate-400">1:16 pm</span>
        </div>
      </div>
    </div>
  );
}

/** The customer's booking page on a phone. */
function BookingMock() {
  const times = ['10:00 AM', '10:30 AM', '11:00 AM', '12:30 PM', '3:00 PM', '4:30 PM'];
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[28px] border-8 border-slate-900 bg-white shadow-lift dark:border-slate-700 dark:bg-[#15121f]" aria-label="Online booking page">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
        <p className="text-[11px] text-slate-400">app.sahaasra.in/book/glow-salon</p>
        <p className="mt-1 font-semibold">Glow Salon & Spa</p>
      </div>
      <div className="space-y-3 p-4 text-[13px]">
        <p className="font-semibold">1 · Choose a service</p>
        <div className="flex items-center justify-between rounded-xl border-2 border-brand-500 bg-brand-50 px-3 py-2.5 dark:bg-brand-400/10">
          <span><b>Hair spa</b><span className="block text-[11px] text-slate-500">45 min</span></span>
          <b>₹899</b>
        </div>
        <p className="pt-1 font-semibold">2 · Pick a free time · Tomorrow</p>
        <div className="grid grid-cols-3 gap-2">
          {times.map((t, i) => (
            <span key={t} className={`rounded-lg border py-1.5 text-center text-[12px] font-medium ${i === 2 ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 dark:border-white/10'}`}>
              {t}
            </span>
          ))}
        </div>
        <span className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 font-semibold text-white">
          <CalendarCheck className="h-4 w-4" /> Book · 11:00 AM
        </span>
        <p className="text-center text-[11px] text-emerald-600">✓ Appears in your appointments instantly</p>
      </div>
    </div>
  );
}

function ExampleBill() {
  const rows = [
    ['Basmati rice 5 kg', 'HSN 1006 · GST 5%', '₹520.00'],
    ['Sunflower oil 1 L × 2', 'HSN 1512 · GST 5%', '₹310.00'],
    ['Toor dal 1 kg', 'HSN 0713 · GST 0%', '₹165.00'],
  ];
  return (
    <div className="card mx-auto w-full max-w-md p-6 shadow-lift" aria-label="Example bill">
      <div className="flex items-start justify-between gap-3 border-b border-dashed border-slate-200 pb-4 dark:border-white/15">
        <div>
          <p className="font-semibold">Sharma General Store</p>
          <p className="muted text-xs">GSTIN 27ABCDE1234F1Z5</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">Paid · UPI</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-white/5">
        {rows.map(([name, meta, amount]) => (
          <div key={name} className="flex items-start justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-medium">{name}</p>
              <p className="muted text-xs">{meta}</p>
            </div>
            <span className="tabular-nums">{amount}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-lg font-bold dark:border-white/15">
        <span>Total</span>
        <span className="tabular-nums">₹995.00</span>
      </div>
      <p className="mt-4 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-700 dark:bg-brand-400/10 dark:text-brand-200">
        <MessageCircle className="h-4 w-4" /> Bill sent to the customer on WhatsApp
      </p>
    </div>
  );
}
