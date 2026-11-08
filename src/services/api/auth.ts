import type { BusinessType, Permission, Plan, SessionUser, TenantStatus } from '@/types';
import { api } from './client';

export interface LoginInput {
  identifier: string;
  password: string;
  remember?: boolean;
}

/** Business profile and settings as the signed-in user's workspace sees them. */
export interface ServerWorkspace {
  tenantId: string;
  businessName: string;
  businessType: BusinessType;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  logo?: string;
  status: TenantStatus;
  plan: Plan;
  astronLabsService?: boolean;
  planValidFrom?: string | null;
  planValidTo?: string | null;
  billingLabel?: string;
  /** Page ids this business may use; null = every page. */
  access: string[] | null;
  settings: Record<string, unknown>;
}

export interface MePayload {
  user: SessionUser & { phone: string };
  impersonating: { tenantId: string; tenantName: string } | null;
  workspace: ServerWorkspace | null;
  permissions: 'all' | Record<string, Permission[]>;
}

export interface SessionInfo {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export const authService = {
  setupStatus: () => api.get<{ needsSetup: boolean }>('/auth/setup'),
  setup: (input: { name: string; email: string; password: string }) => api.post<{ ok: true }>('/auth/setup', input),
  login: (input: LoginInput) => api.post<{ ok: true }>('/auth/login', input),
  logout: () => api.post<{ ok: true }>('/auth/logout'),
  me: () => api.get<MePayload>('/auth/me'),
  changePassword: (current: string, next: string) => api.post<{ ok: true }>('/auth/change-password', { current, next }),
  sessions: () => api.get<SessionInfo[]>('/auth/sessions'),
  revokeSession: (id: string) => api.del<{ ok: true }>(`/auth/sessions/${id}`),
};
