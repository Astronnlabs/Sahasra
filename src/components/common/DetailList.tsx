import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Label/value grid used in drawers and profile pages. */
export function DetailList({ items, columns = 2, className }: { items: [string, ReactNode][]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3', className)}>
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-2xs font-medium uppercase tracking-wider text-subtle">{label}</dt>
          <dd className="mt-1 break-words text-[13px] font-medium">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MiniStat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' | 'success' | 'primary' }) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 px-4 py-3">
      <p className="text-2xs font-medium uppercase tracking-wider text-subtle">{label}</p>
      <p className={cn('tabular mt-1 text-lg font-semibold tracking-tight', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success', tone === 'primary' && 'text-primary')}>
        {value}
      </p>
    </div>
  );
}
