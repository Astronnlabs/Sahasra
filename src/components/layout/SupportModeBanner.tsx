import { LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/button';

/** Shown at the top of every page while a Super Admin is inside a business workspace. */
export function SupportModeBanner() {
  const { impersonating, stopImpersonation } = useAuth();
  if (!impersonating) return null;
  return (
    <div role="status" className="flex items-center gap-3 bg-warning px-4 py-2 text-[13px] font-medium text-[#3d2a03]">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Support mode — you are viewing <b>{impersonating.tenantName}</b> as its owner. Actions are logged.
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="border-transparent bg-white/90 text-[#3d2a03] hover:bg-white"
        onClick={() => stopImpersonation('/superadmin/businesses')}
      >
        <LogOut /> Exit support mode
      </Button>
    </div>
  );
}
