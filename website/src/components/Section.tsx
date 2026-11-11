import type { ReactNode } from 'react';

export function SectionHead({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="muted mt-3 text-[17px] leading-7">{children}</p>}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-400/30 dark:bg-brand-400/10 dark:text-brand-200">
      {children}
    </span>
  );
}

/** Heading block for the contact and policy pages. */
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="border-b border-slate-200/70 bg-gradient-to-b from-brand-50/70 to-transparent py-12 sm:py-16 dark:border-white/10 dark:from-brand-500/10">
      <div className="container-x">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {children && <p className="muted mt-3 max-w-2xl text-[17px]">{children}</p>}
      </div>
    </section>
  );
}
