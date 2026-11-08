import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { toast } from '@/components/ui/toast';
import type { Tenant } from '@/types';

/** Opens a business workspace as that business sees it, with a visible support-mode banner. */
export function useSupportMode() {
  const { startImpersonation } = useAuth();
  const navigate = useNavigate();
  return async (tenant: Pick<Tenant, 'id' | 'name' | 'type'>) => {
    try {
      await startImpersonation(tenant.id);
      toast.success(`Support mode: ${tenant.name}`, { description: 'You are viewing this workspace as its owner. All actions are logged.' });
      navigate('/dashboard');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open support mode.');
    }
  };
}
