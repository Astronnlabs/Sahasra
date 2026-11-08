import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';

/** Business workspace. A Super Admin may enter only in support mode. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSuperAdmin, impersonating, exitTo } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (isSuperAdmin && !impersonating) return <Navigate to={exitTo} replace />;
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
