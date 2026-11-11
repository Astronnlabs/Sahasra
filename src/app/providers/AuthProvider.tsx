import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FullScreenLoader } from '@/components/feedback/PageSkeleton';
import { ApiError, authService, PLAN_REQUIRED_EVENT, SESSION_EXPIRED_EVENT, tenantsService, type LoginInput, type MePayload, type SignupInput } from '@/services';
import type { Permission, SessionUser } from '@/types';

/** Set while a Super Admin is working inside a business in support mode. */
export interface Impersonation {
  tenantId: string;
  tenantName: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  me: MePayload | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  impersonating: Impersonation | null;
  login: (input: LoginInput & { remember: boolean }) => Promise<MePayload>;
  /** Creates a business and its owner login, then signs in. */
  signup: (input: SignupInput) => Promise<MePayload>;
  /** Re-reads the session from the server (after sign-up, profile edits…). */
  refresh: () => Promise<MePayload | null>;
  logout: () => Promise<void>;
  startImpersonation: (tenantId: string) => Promise<MePayload>;
  /** Leaves support mode; the business-route guard then redirects to `returnTo`. */
  stopImpersonation: (returnTo?: string) => Promise<void>;
  /** Role permission check for a module (owners, admins and support mode have everything). */
  hasPermission: (module: string, permission: Permission) => boolean;
  exitTo: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const ME_KEY = ['me'] as const;

async function fetchMe(): Promise<MePayload | null> {
  try {
    return await authService.me();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: me = null, isPending, isError, refetch } = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, refetchOnWindowFocus: true, retry: 2 });
  const [exitTo, setExitTo] = useState('/superadmin');

  /** Drops every cached business record so nothing leaks between accounts or businesses. */
  const resetData = useCallback(() => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
  }, [qc]);

  const setMe = useCallback(
    (next: MePayload | null) => {
      resetData();
      qc.setQueryData(ME_KEY, next);
    },
    [qc, resetData],
  );

  useEffect(() => {
    const onExpired = () => setMe(null);
    const onPlanRequired = () => void refetch();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener(PLAN_REQUIRED_EVENT, onPlanRequired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener(PLAN_REQUIRED_EVENT, onPlanRequired);
    };
  }, [setMe, refetch]);

  const refresh = useCallback(async () => (await refetch()).data ?? null, [refetch]);

  const login = useCallback(
    async (input: LoginInput & { remember: boolean }) => {
      await authService.login(input);
      const next = await authService.me();
      setMe(next);
      return next;
    },
    [setMe],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      await authService.signup(input);
      const next = await authService.me();
      setMe(next);
      return next;
    },
    [setMe],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setMe(null);
    }
  }, [setMe]);

  const startImpersonation = useCallback(
    async (tenantId: string) => {
      const next = await tenantsService.startSupport(tenantId);
      setMe(next);
      return next;
    },
    [setMe],
  );

  const stopImpersonation = useCallback(
    async (returnTo = '/superadmin') => {
      setExitTo(returnTo);
      setMe(await tenantsService.stopSupport());
    },
    [setMe],
  );

  const hasPermission = useCallback(
    (module: string, permission: Permission) => !!me && (me.permissions === 'all' || (me.permissions[module] ?? []).includes(permission)),
    [me],
  );

  const user = me?.user ?? null;
  const isSuperAdmin = user?.role === 'Super Admin';
  const value = useMemo<AuthContextValue>(
    () => ({ user, me, isAuthenticated: !!user, isSuperAdmin, impersonating: isSuperAdmin ? me?.impersonating ?? null : null, login, signup, refresh, logout, startImpersonation, stopImpersonation, hasPermission, exitTo }),
    [user, me, isSuperAdmin, login, signup, refresh, logout, startImpersonation, stopImpersonation, hasPermission, exitTo],
  );

  if (isPending) return <FullScreenLoader />;
  if (isError && !me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-base font-semibold">Can’t reach the SAHAASRA server</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">Check your internet connection. If you run SAHAASRA yourself, make sure the API server is started.</p>
        <button type="button" className="mt-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-white" onClick={() => refetch()}>
          Try again
        </button>
      </div>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
