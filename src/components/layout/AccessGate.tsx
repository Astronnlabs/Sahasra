import { Ban, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PAGE_CATALOG, pageForPath } from '@/app/config/pages';
import { Button } from '@/components/ui/button';
import { usePageAccess } from '@/hooks/usePageAccess';

/** Blocks pages the Super Admin has not granted, and the whole workspace when suspended. */
export function AccessGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { can, blocked, tenant } = usePageAccess();
  const page = pageForPath(pathname);

  if (blocked) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger"><Ban className="h-6 w-6" /></span>
        <h1 className="mt-5 text-xl font-semibold">{tenant?.name} is suspended</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">Access to this workspace has been paused by Sahasra. Your data is safe. Please contact Sahasra support to restore access.</p>
      </div>
    );
  }
  if (!can(page)) {
    const label = PAGE_CATALOG.find((p) => p.id === page)?.label ?? 'This page';
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light text-primary"><Lock className="h-6 w-6" /></span>
        <h1 className="mt-5 text-xl font-semibold">{label} isn’t enabled for your business</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">Your Sahasra plan doesn’t include access to this page yet. Raise a support request to have it switched on.</p>
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" asChild><Link to="/dashboard">Back to dashboard</Link></Button>
          <Button asChild><Link to="/support">Request access</Link></Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
