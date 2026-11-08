import { useCallback, useMemo } from 'react';
import { PAGE_MODULE } from '@/app/config/pages';
import { useAuth } from '@/app/providers/AuthProvider';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';

/**
 * What the signed-in user may open: pages the Super Admin granted to the business,
 * narrowed by the user's role permissions. The server enforces the same rules.
 * `allowed === null` means the business has no page restrictions.
 */
export function usePageAccess() {
  const { access, status, businessName } = useWorkspace();
  const { hasPermission } = useAuth();
  const allowed = useMemo(() => (access ? new Set(access) : null), [access]);
  const blocked = status === 'suspended' || status === 'churned';
  const can = useCallback(
    (page: string | null) => {
      if (!page) return true;
      if (allowed && !allowed.has(page)) return false;
      const module = PAGE_MODULE[page];
      return !module || hasPermission(module, 'view');
    },
    [allowed, hasPermission],
  );
  return { tenant: { name: businessName }, allowed, blocked, can };
}
