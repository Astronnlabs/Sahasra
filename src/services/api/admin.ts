import type { AppUser, AuditLog, Role, SupportTicket, TicketCategory, TicketPriority } from '@/types';
import type { ServerWorkspace } from './auth';
import { api } from './client';

type UserInput = Pick<AppUser, 'name' | 'email' | 'phone' | 'role' | 'branch'> & { password?: string };

export const usersService = {
  list: () => api.get<AppUser[]>('/users'),
  /** Returns a one-time temporary password when none was set. */
  create: (input: UserInput) => api.post<AppUser & { tempPassword?: string }>('/users', input),
  update: (id: string, patch: Partial<Omit<UserInput, 'password'>> & { status?: 'active' | 'suspended' }) => api.put<AppUser>(`/users/${id}`, patch),
  resetPassword: (id: string) => api.post<{ tempPassword: string }>(`/users/${id}/reset-password`),
  /** Owner only: sets the new password directly, no current password needed. */
  setPassword: (id: string, password: string) => api.post<{ ok: true }>(`/users/${id}/set-password`, { password }),
  remove: (id: string) => api.del<{ id: string }>(`/users/${id}`),
};

export const rolesService = {
  list: () => api.get<Role[]>('/roles'),
  create: (input: Pick<Role, 'name' | 'description' | 'permissions'>) => api.post<Role>('/roles', input),
  update: (id: string, patch: Pick<Role, 'permissions'>) => api.put<Role>(`/roles/${id}`, patch),
  remove: (id: string) => api.del<{ id: string }>(`/roles/${id}`),
};

export const auditService = {
  list: () => api.get<AuditLog[]>('/audit-logs'),
};

/** Support tickets raised by the signed-in business. */
export const ticketsService = {
  list: () => api.get<SupportTicket[]>('/support/tickets'),
  open: (input: { subject: string; category: TicketCategory; priority: TicketPriority; text: string }) => api.post<SupportTicket>('/support/tickets', input),
  reply: (id: string, text: string) => api.post<SupportTicket>(`/support/tickets/${id}/reply`, { text }),
};

export interface WorkspaceDetails extends ServerWorkspace {
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
}

export interface ProfileInput {
  businessName: string;
  businessType?: ServerWorkspace['businessType'];
  phone?: string;
  email?: string;
  gstin?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export const workspaceService = {
  get: () => api.get<WorkspaceDetails>('/workspace'),
  updateProfile: (input: ProfileInput) => api.put<ServerWorkspace>('/workspace/profile', input),
  updateSettings: (patch: Record<string, string | number | boolean | null>) => api.put<Record<string, unknown>>('/workspace/settings', patch),
  uploadLogo: (file: File) => api.upload<{ id: string; url: string }>('/uploads', file, { purpose: 'logo' }),
  /** The full backup as data, for Excel / CSV downloads. */
  async exportData() {
    const res = await fetch('/api/export', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Export failed. You may not have permission to export data.');
    return (await res.json()) as Record<string, unknown>;
  },
  /** Downloads a full JSON backup of the business's data. */
  async exportAll() {
    const res = await fetch('/api/export', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Export failed. You may not have permission to export data.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sahasra-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const preferencesService = {
  get: () => api.get<Record<string, unknown>>('/me/preferences'),
  update: (patch: Record<string, unknown>) => api.put<Record<string, unknown>>('/me/preferences', patch),
};

export interface StoredTemplate {
  id: string;
  name: string;
  paper: 'A4' | 'A5' | 'thermal80' | 'thermal58';
  accent: string;
  font: 'sans' | 'serif' | 'mono';
  watermark: string;
  elements: Record<string, unknown>[];
  isDefault: boolean;
  updatedAt: string;
}

export const billTemplatesService = {
  list: () => api.get<StoredTemplate[]>('/bill-templates'),
  save: (t: Omit<StoredTemplate, 'updatedAt'>) => api.put<StoredTemplate>(`/bill-templates/${t.id}`, t),
  setDefault: (id: string) => api.post<{ ok: true }>(`/bill-templates/${id}/default`),
  remove: (id: string) => api.del<{ id: string }>(`/bill-templates/${id}`),
};

export interface KotDesign {
  paper: 'thermal80' | 'thermal58';
  font: 'mono' | 'sans';
  title: string;
  itemSize: 'normal' | 'large' | 'xl';
  showBusiness: boolean;
  showOrderType: boolean;
  showTime: boolean;
  showNotes: boolean;
  showItemCount: boolean;
  showKotNumber: boolean;
  header: string;
  footer: string;
}

export const kotDesignService = {
  get: () => api.get<{ design: KotDesign | null }>('/kot-design'),
  save: (d: KotDesign) => api.put<{ design: KotDesign }>('/kot-design', d),
};

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  /** Rows that were skipped or have a problem (1-based, as in the file after the header). */
  rows: { row: number; action: 'skip' | 'error'; message?: string; field?: string }[];
}

export const importService = {
  run: (target: 'products' | 'services' | 'customers' | 'vendors' | 'employees' | 'sales' | 'appointments' | 'attendance', rows: Record<string, string | number | boolean | null>[], existing: 'skip' | 'update', dryRun: boolean, pendingStaff: string[] = []) =>
    api.post<ImportResult>(`/import/${target}`, { rows, existing, dryRun, pendingStaff }),
};

export type ReferralStatus = 'new' | 'contacted' | 'joined' | 'rewarded' | 'declined';
export interface Referral {
  id: string;
  referredBy: string;
  businessName: string;
  contactName: string;
  phone: string;
  city: string;
  businessType?: string | null;
  notes?: string | null;
  status: ReferralStatus;
  createdAt: string;
  updatedAt: string;
  /** Platform list only: the business that sent it. */
  referrer?: { id: string; name: string; ownerName: string; ownerPhone: string };
}
export type ReferralInput = Pick<Referral, 'businessName' | 'contactName' | 'phone'> & { city?: string; businessType?: string; notes?: string };

export const referralsService = {
  list: () => api.get<Referral[]>('/referrals'),
  create: (input: ReferralInput) => api.post<Referral>('/referrals', input),
  platformList: () => api.get<Referral[]>('/platform/referrals'),
  setStatus: (id: string, status: ReferralStatus) => api.patch<Referral>(`/platform/referrals/${id}`, { status }),
};

export interface HeldBill<T = Record<string, unknown>> {
  id: string;
  label: string;
  state: T;
  heldAt: string;
}

export const heldBillsService = {
  list: <T>() => api.get<HeldBill<T>[]>('/pos/held'),
  hold: <T>(label: string, state: T) => api.post<HeldBill<T>>('/pos/held', { label, state }),
  remove: (id: string) => api.del<{ ok: true }>(`/pos/held/${id}`),
};
