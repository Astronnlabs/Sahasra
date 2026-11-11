import {
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  Landmark,
  Lock,
  MessageCircle,
  PenTool,
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
  { icon: MessageCircle, title: 'WhatsApp e-bills', text: 'Send every bill to your customer on WhatsApp automatically by connecting your VAAHAK account.' },
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
  ['Sign up', 'Create your account with your business name, type and mobile number. It takes a minute.'],
  ['Choose your plan', 'Pick monthly, quarterly or yearly and pay securely with UPI, card or net banking through PayU.'],
  ['Start billing', 'Add your products, set up your bill, and make your first GST invoice.'],
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
            <Eyebrow>GST billing for Indian businesses</Eyebrow>
            <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-[56px]">
              Billing, stock and staff. <span className="text-brand-600 dark:text-brand-300">All in one place.</span>
            </h1>
            <p className="muted mt-5 max-w-xl text-lg leading-8">
              SAHAASRA is the billing software for your counter. Make GST bills in seconds, keep stock up to date with every sale, and see your profit, dues and tax at a glance.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a className="btn btn-primary" href={signupUrl()}>
                Create your account <ArrowRight className="h-4 w-4" />
              </a>
              <Link className="btn btn-outline" to="/pricing">See pricing</Link>
            </div>
            <p className="muted mt-5 flex items-center gap-2 text-sm">
              <Smartphone className="h-4 w-4 text-brand-600 dark:text-brand-300" />
              Plans from <strong className="text-slate-900 dark:text-white">₹{lowestPrice()}</strong>. Works on computer, tablet and phone.
            </p>
          </div>

          <ExampleBill />
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
            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Ready to bill smarter?</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-[17px] text-white/85">Create your SAHAASRA account today. Plans start at ₹{lowestPrice()}.</p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a className="btn bg-white text-brand-700 hover:bg-brand-50" href={signupUrl()}>Sign up</a>
              <a className="btn border border-white/40 text-white hover:bg-white/10" href={loginUrl()}>Login</a>
            </div>
          </div>
        </div>
      </section>
    </>
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
