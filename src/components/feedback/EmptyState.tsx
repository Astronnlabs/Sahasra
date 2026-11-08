import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondary?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, secondary, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center', compact ? 'py-10' : 'py-16', className)}>
      <div className="relative mb-5">
        <div className="dot-grid absolute -inset-6 rounded-full opacity-70 [mask-image:radial-gradient(circle,black,transparent_70%)]" aria-hidden />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary-light text-primary shadow-card">
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </div>
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {(actionLabel || secondary) && (
        <div className="mt-5 flex items-center gap-2">
          {actionLabel && onAction && (
            <Button onClick={onAction}>
              <Plus /> {actionLabel}
            </Button>
          )}
          {secondary}
        </div>
      )}
    </div>
  );
}
