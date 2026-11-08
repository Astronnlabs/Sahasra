import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ChartSkeleton } from './Charts';

interface ChartCardProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  loading?: boolean;
  height?: number;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}

export function ChartCard({ title, description, actions, loading, height = 300, children, className, footer }: ChartCardProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={title} description={description} actions={actions} />
      <CardContent className="flex-1 pt-4">{loading ? <ChartSkeleton height={height} /> : children}</CardContent>
      {footer}
    </Card>
  );
}
