import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStorage, writeStorage } from '@/lib/storage';
import type { BusinessType, Plan, TenantStatus } from '@/types';
import { useAuth } from './AuthProvider';

export type DateRangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'quarter' | 'year';

export const DATE_RANGES: { value: DateRangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This financial year' },
];

/** Business settings stored on the server (see Settings). */
export interface WorkspaceSettings {
  invoicePrefix?: string;
  invoiceStartAt?: number;
  creditDays?: number;
  vendorCreditDays?: number;
  maxDiscountPct?: number;
  allowNegativeStock?: boolean;
  notifyLowStock?: boolean;
  upiId?: string;
  invoiceTerms?: string;
  /** Which POS tab opens first (salons default to services). */
  posFirstTab?: 'product' | 'service' | 'package';
  /** Send each bill to the customer's WhatsApp (Settings → E-Billing). */
  eBillingEnabled?: boolean;
  [key: string]: unknown;
}

/** Business profile, from the server. */
export interface WorkspaceProfile {
  tenantId: string;
  businessName: string;
  businessType: BusinessType;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  logo?: string;
  status?: TenantStatus;
  plan?: Plan;
  astronLabsService?: boolean;
  planValidFrom?: string | null;
  planValidTo?: string | null;
  access: string[] | null;
  settings: WorkspaceSettings;
}

/** Per-device UI preferences. */
interface UiPrefs {
  branch: string;
  dateRange: DateRangeKey;
  sidebarCollapsed: boolean;
}

interface WorkspaceContextValue extends WorkspaceProfile, UiPrefs {
  update: (patch: Partial<UiPrefs>) => void;
}

const EMPTY_PROFILE: WorkspaceProfile = { tenantId: '', businessName: '', businessType: 'retail', phone: '', email: '', gstin: '', address: '', access: null, settings: {} };
const DEFAULT_PREFS: UiPrefs = { branch: 'all', dateRange: 'today', sidebarCollapsed: true };

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const PREFS_KEY = 'ui.prefs.v1';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [prefs, setPrefs] = useState<UiPrefs>(() => ({ ...DEFAULT_PREFS, ...readStorage<Partial<UiPrefs>>(PREFS_KEY, {}) }));

  useEffect(() => {
    writeStorage(PREFS_KEY, prefs);
  }, [prefs]);

  const update = useCallback((patch: Partial<UiPrefs>) => setPrefs((s) => ({ ...s, ...patch })), []);

  const workspace = me?.workspace;
  const profile = useMemo<WorkspaceProfile>(() => (workspace ? { ...workspace, settings: workspace.settings as WorkspaceSettings } : EMPTY_PROFILE), [workspace]);
  const value = useMemo(() => ({ ...profile, ...prefs, update }), [profile, prefs, update]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
