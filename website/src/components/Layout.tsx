import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { COMPANY, loginUrl, signupUrl } from '../config';
import { Logo } from './Logo';

const NAV = [
  { to: '/#features', label: 'Features' },
  { to: '/#industries', label: 'Industries' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/contact', label: 'Contact' },
];

/** Page title for the browser tab. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export function Layout() {
  const { pathname, hash } = useLocation();
  const [open, setOpen] = useState(false);

  // New page: start at the top, or at the #section the link points to.
  useEffect(() => {
    setOpen(false);
    if (hash) {
      requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }));
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur dark:border-white/10 dark:bg-[#0d0b16]/85">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 text-[17px] font-extrabold tracking-wide" aria-label="SAHAASRA home">
            <Logo className="h-8 w-8" />
            SAHAASRA
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:text-brand-600 dark:hover:text-brand-300 ${isActive && !n.to.includes('#') ? 'text-brand-600 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <div className="ml-3 flex items-center gap-2">
              <a className="btn btn-outline btn-sm" href={loginUrl()}>Login</a>
              <a className="btn btn-primary btn-sm" href={signupUrl()}>Sign up</a>
            </div>
          </nav>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 md:hidden dark:border-white/15"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <nav className="container-x space-y-1 border-t border-slate-200/70 pb-4 pt-2 md:hidden dark:border-white/10" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="block rounded-lg px-2 py-2.5 text-[15px] font-medium text-slate-700 dark:text-slate-200">
                {n.label}
              </Link>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <a className="btn btn-outline" href={loginUrl()}>Login</a>
              <a className="btn btn-primary" href={signupUrl()}>Sign up</a>
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200/70 py-10 dark:border-white/10">
        <div className="container-x flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-extrabold tracking-wide">
              <Logo className="h-6 w-6" /> SAHAASRA
            </div>
            <p className="muted mt-2 text-sm">GST billing and business software for Indian shops.</p>
            <p className="muted mt-1 text-sm">© {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved.</p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Footer">
            {[
              ['/pricing', 'Pricing'],
              ['/contact', 'Contact'],
              ['/terms', 'Terms'],
              ['/privacy', 'Privacy'],
              ['/refund', 'Refund & cancellation'],
            ].map(([to, label]) => (
              <Link key={to} to={to} className="muted hover:text-brand-600 dark:hover:text-brand-300">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
