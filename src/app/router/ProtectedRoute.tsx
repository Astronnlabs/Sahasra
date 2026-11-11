import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';

/** Business workspace. A Super Admin may enter only in support mode. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSuperAdmin, impersonating, exitTo, me } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (isSuperAdmin && !impersonating) return <Navigate to={exitTo} replace />;
  // A business that signed up online must buy (or renew) its plan first.
  if (!isSuperAdmin && me?.workspace?.subscription?.locked) return <Navigate to="/subscription" replace />;
  return <>{children}</>;
}

/** The plan page: any signed-in business user (also while the plan is unpaid). */
export function PlanRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSuperAdmin, impersonating, me } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (isSuperAdmin && !impersonating) return <Navigate to="/superadmin" replace />;
  if (!me?.workspace) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Platform owner portal. */
export function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSuperAdmin } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSuperAdmin } = useAuth();
  if (isAuthenticated) return <Navigate to={isSuperAdmin ? '/superadmin' : '/dashboard'} replace />;
  return <>{children}</>;
}
