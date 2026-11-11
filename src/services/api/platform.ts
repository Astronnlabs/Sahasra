import type { Plan, PlatformUser, SupportTicket, Tenant, TicketPriority, TicketStatus } from '@/types';
import type { MePayload } from './auth';
import { api } from './client';

/** Everything captured when a business is created; status, revenue and dates are set by the platform. */
export type NewTenantInput = Omit<Tenant, 'id' | 'status' | 'users' | 'mrr' | 'createdAt' | 'lastActive' | 'trialEndsAt'> & { password?: string };
export type TenantDetailsInput = Omit<NewTenantInput, 'plan' | 'access' | 'password'>;

export interface OwnerLogin {
  email: string;
  phone: string;
  /** Only present when the platform generated the password. */
  tempPassword?: string;
}

export const tenantsService = {
  list: () => api.get<Tenant[]>('/platform/tenants'),
  get: (id: string) => api.get<Tenant>(`/platform/tenants/${id}`),
  /** Creates the business and its owner login together. */
  register: (input: NewTenantInput) => api.post<{ tenant: Tenant; ownerLogin: OwnerLogin }>('/platform/tenants', input),
  updateDetails: (id: string, input: TenantDetailsInput) => api.put<Tenant>(`/platform/tenants/${id}`, input),
  /** Grants exactly these pages (locked pages are always kept); null removes every restriction. */
  setAccess: (id: string, pages: string[] | null) => api.put<Tenant>(`/platform/tenants/${id}/access`, { pages }),
  changePlan: (id: string, plan: Plan, options?: { astronLabsService?: boolean; planValidFrom?: string; planValidTo?: string }) =>
    api.post<Tenant>(`/platform/tenants/${id}/plan`, { plan, ...options }),
  setStatus: (id: string, status: Tenant['status']) => api.post<Tenant>(`/platform/tenants/${id}/status`, { status }),
  extendTrial: (id: string, days: number) => api.post<Tenant>(`/platform/tenants/${id}/extend-trial`, { days }),
  resetOwnerPassword: (id: string) => api.post<OwnerLogin & { tempPassword: string }>(`/platform/tenants/${id}/reset-owner-password`),
  /** Permanently erases the business; `confirm` must be its exact name. */
  remove: (id: string, confirm: string) => api.del<{ id: string }>(`/platform/tenants/${id}`, { confirm }),
  startSupport: (tenantId: string) => api.post<MePayload>('/platform/support-mode', { tenantId }),
  stopSupport: () => api.del<MePayload>('/platform/support-mode'),
};

export const platformUsersService = {
  list: () => api.get<PlatformUser[]>('/platform/users'),
  byTenant: (tenantId: string) => api.get<PlatformUser[]>('/platform/users', { tenantId }),
  invite: (input: Pick<PlatformUser, 'tenantId' | 'name' | 'email' | 'phone' | 'role'>) => api.post<PlatformUser & { tempPassword: string }>('/platform/users', input),
  setStatus: (id: string, status: 'active' | 'suspended') => api.put<PlatformUser>(`/platform/users/${id}`, { status }),
  resetPassword: (id: string) => api.post<{ tempPassword: string }>(`/platform/users/${id}/reset-password`),
  /** Name, login email / mobile and (optionally) a new password chosen by the Super Admin. */
  updateLogin: (id: string, input: { name: string; email: string; phone: string; password?: string }) => api.put<PlatformUser>(`/platform/users/${id}/login`, input),
  remove: (id: string) => api.del<{ id: string }>(`/platform/users/${id}`),
};

export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'invited' | 'suspended';
  createdAt: string;
  lastLogin?: string;
}

export const platformAdminsService = {
  list: () => api.get<PlatformAdmin[]>('/platform/admins'),
  create: (input: { name: string; email: string }) => api.post<PlatformAdmin & { tempPassword: string }>('/platform/admins', input),
  setStatus: (id: string, status: 'active' | 'suspended') => api.put<PlatformAdmin>(`/platform/admins/${id}`, { status }),
};

/** Support inbox for the Sahaasra team. */
export const platformTicketsService = {
  list: () => api.get<SupportTicket[]>('/platform/tickets'),
  byTenant: (tenantId: string) => api.get<SupportTicket[]>('/platform/tickets', { tenantId }),
  get: (id: string) => api.get<SupportTicket>(`/platform/tickets/${id}`),
  reply: (id: string, input: { text: string; from: 'agent' | 'note'; status?: TicketStatus }) => api.post<SupportTicket>(`/platform/tickets/${id}/reply`, input),
  update: (id: string, patch: { status?: TicketStatus; priority?: TicketPriority; assignee?: string }) => api.patch<SupportTicket>(`/platform/tickets/${id}`, patch),
};

export type GrowthRange = '7d' | '30d' | '90d' | '12m';

export interface PlatformOverview {
  totalBusinesses: number;
  liveBusinesses: number;
  totalUsers: number;
  activeUsers: number;
  newToday: number;
  newUsersToday: number;
  new7: number;
  new30: number;
  newChange: number;
  mrr: number;
  trials: number;
  conversion: number;
  openTickets: number;
  urgentTickets: number;
}

export const platformStatsService = {
  overview: () => api.get<PlatformOverview>('/platform/stats/overview'),
  signups: (range: GrowthRange) => api.get<{ label: string; businesses: number; users: number }[]>('/platform/stats/signups', { range }),
};
