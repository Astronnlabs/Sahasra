import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center px-6 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light text-primary">
        <Compass className="h-6 w-6" />
      </div>
      <p className="mt-6 text-sm font-semibold text-primary">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">This page isn’t part of your workspace</h1>
      <p className="mt-2 max-w-sm text-[13px] text-muted-foreground">The link may be outdated, or the module isn’t enabled for this business.</p>
      <Button asChild className="mt-6">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
