import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TimelineItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  time: ReactNode;
  icon?: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

const TONES = {
  primary: 'bg-primary-light text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface text-muted-foreground',
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative">
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-4 pb-6 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[15px] top-9 h-[calc(100%-28px)] w-px bg-border" aria-hidden />}
          <span className={cn('relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card [&_svg]:h-3.5 [&_svg]:w-3.5', TONES[item.tone ?? 'primary'])}>
            {item.icon ?? <span className="h-2 w-2 rounded-full bg-current" />}
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <p className="text-[13px] font-medium leading-snug">{item.title}</p>
              <span className="shrink-0 text-xs text-subtle">{item.time}</span>
            </div>
            {item.description && <div className="mt-1 text-xs text-muted-foreground">{item.description}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
