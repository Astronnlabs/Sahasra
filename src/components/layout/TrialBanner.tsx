import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/button';

/** During the 7-day free trial: days left and a way to buy the plan (only for owners/admins). */
export function TrialBanner() {
  const { me, impersonating } = useAuth();
  const s = me?.workspace?.subscription;
  if (!s?.trial || impersonating) return null;
  return (
    <div role="status" className="flex items-center gap-3 bg-primary px-4 py-2 text-[13px] font-medium text-white">
      <Sparkles className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Free trial — <b>{s.daysLeft} day{s.daysLeft === 1 ? '' : 's'} left</b>. Buy a plan any time; it starts after your trial.
      </span>
      <Button size="sm" variant="secondary" className="border-transparent bg-white text-primary hover:bg-white/90" asChild>
        <Link to="/subscription">Choose plan</Link>
      </Button>
    </div>
  );
}
