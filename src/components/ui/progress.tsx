import { cn } from '@/lib/utils';
import type { Tone } from '@/types';

const TONES: Record<Tone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-subtle',
};

interface ProgressProps {
  value: number;
  max?: number;
  tone?: Tone;
  className?: string;
  label?: string;
}

export function Progress({ value, max = 100, tone = 'primary', className, label }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-border/60', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', TONES[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
