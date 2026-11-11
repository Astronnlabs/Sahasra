import { cn } from '@/lib/utils';

/** Geometric "S" built from two offset arcs — the Sahaasra mark. */
export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('h-9 w-9', className)} role="img" aria-label="Sahaasra">
      <rect width="40" height="40" rx="11" className={inverted ? 'fill-white' : 'fill-primary'} />
      <path
        d="M27 13.2c-1.6-1.9-4-3-6.9-3-4.2 0-7 2.2-7 5.4 0 3.4 2.9 4.4 6.5 5.1l1.5.3c2.6.5 3.9 1.2 3.9 2.7 0 1.6-1.7 2.6-4.3 2.6-2.4 0-4.3-.9-5.6-2.5"
        fill="none"
        className={inverted ? 'stroke-primary' : 'stroke-white'}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="28.4" cy="28.6" r="2.1" className={inverted ? 'fill-primary/50' : 'fill-white/55'} />
    </svg>
  );
}

export function Logo({ className, collapsed, inverted }: { className?: string; collapsed?: boolean; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark inverted={inverted} />
      {!collapsed && (
        <span className={cn('text-[17px] font-bold tracking-[0.14em]', inverted ? 'text-white' : 'text-foreground')}>
          SAHAASRA
        </span>
      )}
    </span>
  );
}
