import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface WidgetCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  link?: { to: string; label?: string };
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function WidgetCard({ title, description, icon, link, actions, children, className, bodyClassName }: WidgetCardProps) {
  return (
    <Card className={cn('flex h-full flex-col', className)}>
      <CardHeader
        title={title}
        description={description}
        icon={icon}
        actions={
          actions ??
          (link && (
            <Link to={link.to} className="inline-flex items-center gap-0.5 rounded-md text-xs font-medium text-primary hover:underline">
              {link.label ?? 'View all'} <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ))
        }
      />
      <div className={cn('flex-1 p-5 pt-4', bodyClassName)}>{children}</div>
    </Card>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
