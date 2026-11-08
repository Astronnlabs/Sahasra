import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ProfileHeaderProps {
  name?: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  meta?: { icon: ReactNode; label: ReactNode }[];
  actions?: ReactNode;
  stats?: { label: string; value: ReactNode; tone?: string }[];
  loading?: boolean;
}

export function ProfileHeader({ name, subtitle, badges, meta, actions, stats, loading }: ProfileHeaderProps) {
  if (loading || !name) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="h-16 bg-gradient-to-r from-primary-light via-primary-soft to-transparent" aria-hidden />
      <div className="-mt-8 px-6 pb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-4">
            <Avatar name={name} size="xl" className="ring-4 ring-card" />
            <div className="pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
                {badges}
              </div>
              {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {meta && (
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            {meta.map((m, i) => (
              <li key={i} className="flex items-center gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-subtle">
                {m.icon}
                {m.label}
              </li>
            ))}
          </ul>
        )}
        {stats && (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-surface/50 px-4 py-3">
                <p className="text-2xs font-medium uppercase tracking-wider text-subtle">{s.label}</p>
                <p className={`tabular mt-1 text-lg font-semibold tracking-tight ${s.tone ?? ''}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
