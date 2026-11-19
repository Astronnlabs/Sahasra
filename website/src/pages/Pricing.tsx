import { Check, ChevronDown } from 'lucide-react';
import { usePageTitle } from '../components/Layout';
import { SectionHead } from '../components/Section';
import { PLANS, signupUrl } from '../config';

const BASE = ['POS billing with GST invoices', 'WhatsApp e-bills with the bill PDF', 'Online booking link for customers', 'Inventory, purchases and vendors', 'Staff, attendance and payroll', 'Reports and GST registers'];
const MORE = (months: number) => ['Everything in the Build plan', `${months} months of access`, 'WhatsApp e-bills with the bill PDF', 'Online booking link for customers', 'Bill Studio: your own bill design', 'Industry screens for your business'];

const FAQ = [
  ['Is the 7-day free trial really free?', 'Yes. Sign up and use every feature for 7 days — no payment and no card needed. Buy a plan only if you want to continue; if you buy during the trial, your paid plan starts after the trial ends.'],
  ['How do I buy the plan?', 'Inside the software, open the plan page and choose monthly, quarterly or yearly. You’ll pay on PayU’s secure page and come straight back to SAHAASRA with your plan active.'],
  ['How does the online booking link work?', 'In Appointments, press Booking link to create your link (for example app.sahaasra.in/book/your-shop) and share it. Customers pick a service and a free time; the booking appears in your appointments instantly.'],
  ['I already have an account. How do I renew?', 'Log in and open Settings → Subscription & Billing → Renew plan. The new time is added on top of the days you have left.'],
  ['What happens when my plan ends?', 'Your data stays safe. You’ll see the plan page when you log in, and everything opens again as soon as you renew.'],
  ['Which payment methods can I use?', 'UPI, debit and credit cards, and net banking, through PayU.'],
  ['How do WhatsApp e-bills work?', 'Connect your VAAHAK account in SAHAASRA (Settings → E-Billing). Each bill is then sent to your customer on WhatsApp from your own business number, and charged to your VAAHAK wallet.'],
];

export function PricingPage() {
  usePageTitle('SAHAASRA Pricing');
  const monthly = PLANS.find((p) => p.period === 'monthly')?.price ?? 0;

  return (
    <>
      <section className="py-14 sm:py-20">
        <div className="container-x">
          {/* Free trial, big */}
          <div className="relative mx-auto mb-12 max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-fuchsia-600 px-6 py-8 text-center text-white sm:px-10 sm:py-10">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_100%_0%,rgba(255,255,255,0.2),transparent)]" />
            <p className="relative text-sm font-bold uppercase tracking-[0.2em] text-white/80">Try before you pay</p>
            <p className="relative mt-1 text-4xl font-black tracking-tight sm:text-6xl">7 DAYS FREE TRIAL</p>
            <p className="relative mx-auto mt-3 max-w-2xl text-[16px] text-white/90">
              Every feature, free for 7 days — GST billing, WhatsApp e-bills with the bill PDF, your online booking link, stock, staff and reports. No payment and no card to start.
            </p>
            <a className="btn relative mt-6 bg-white px-7 py-3.5 text-base text-brand-700 hover:bg-brand-50" href={signupUrl()}>
              Start my free trial
            </a>
          </div>

          <SectionHead eyebrow="After your free trial" title="Simple pricing. Pay the way you like.">
            One plan with every feature. Choose monthly, quarterly or yearly — a plan bought during the trial starts after it ends.
          </SectionHead>

          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
            {PLANS.map((p) => {
              const save = p.months > 1 && monthly > 0 ? Math.round((1 - p.price / (monthly * p.months)) * 100) : 0;
              const items = p.months === 1 ? BASE : MORE(p.months);
              return (
                <article
                  key={p.period}
                  className={`card relative flex flex-col p-6 ${p.best ? 'border-brand-500 ring-2 ring-brand-500/20 dark:border-brand-400' : ''}`}
                >
                  {p.best && <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Best value</span>}
                  <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">Build</span>
                  <h3 className="mt-1 text-xl font-bold">{p.label}</h3>
                  <p className="mt-4 flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold tracking-tight">₹{p.price.toLocaleString('en-IN')}</span>
                    <span className="muted text-sm">{p.note}</span>
                  </p>
                  <p className="mt-1 h-5 text-sm font-medium text-emerald-600 dark:text-emerald-400">{save > 0 ? `Save ${save}% compared with monthly` : ''}</p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
                    {items.map((i) => (
                      <li key={i} className="flex gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                  <a className={`btn mt-6 w-full ${p.best ? 'btn-primary' : 'btn-outline'}`} href={signupUrl(p.period)}>
                    Start 7-day free trial
                  </a>
                </article>
              );
            })}
          </div>

          <p className="muted mx-auto mt-8 max-w-3xl text-center text-sm">
            Prices are the full amount you pay. Payment is taken securely by PayU (UPI, cards, net banking). WhatsApp e-bills are charged separately from your VAAHAK wallet.
          </p>
        </div>
      </section>

      <section className="bg-slate-50 py-16 sm:py-20 dark:bg-white/[0.02]">
        <div className="container-x">
          <SectionHead title="Questions" />
          <div className="mx-auto max-w-3xl space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {q}
                  <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="muted mt-3 leading-7">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
