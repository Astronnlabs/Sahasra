import { BarChart3, Boxes, Landmark, LockKeyhole, ReceiptText, UsersRound } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

const FEATURES = [
  { icon: ReceiptText, title: 'Fast POS billing', text: 'GST invoices, UPI QR, credit and split payments' },
  { icon: Boxes, title: 'Live inventory', text: 'Stock updates with every sale and purchase' },
  { icon: Landmark, title: 'GST ready', text: 'Sales & purchase registers, HSN summary, notes' },
  { icon: UsersRound, title: 'Staff & payroll', text: 'Attendance, advances and monthly salaries' },
  { icon: BarChart3, title: 'Reports', text: 'Profit, dues, expenses and tax at a glance' },
];

/** Branded left panel for auth screens. */
export function AuthShowcase() {
  return (
    <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col">
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        aria-hidden
      />
      <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-white/[0.06]" aria-hidden />
      <div className="absolute -bottom-52 -left-32 h-[480px] w-[480px] rounded-full bg-primary-dark/60" aria-hidden />

      <div className="relative flex flex-1 flex-col p-12 xl:p-16">
        <Logo inverted />

        <div className="mt-auto max-w-lg">
          <h2 className="text-[38px] font-semibold leading-[1.1] tracking-[-0.03em] text-white xl:text-[44px]">
            Everything your business needs. In one place.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
            Billing, inventory, GST, staff and insights — one calm, fast workspace for every Indian business.
          </p>
        </div>

        <ul className="mt-10 grid max-w-lg gap-2.5">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              className="flex animate-fade-up items-center gap-3 rounded-xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/10"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-white">{title}</span>
                <span className="block truncate text-xs text-white/70">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-8 flex items-center gap-1.5 text-[13px] text-white/75">
          <LockKeyhole className="h-4 w-4" /> Passwords are encrypted and sessions are secured server-side.
        </p>
      </div>
    </div>
  );
}
