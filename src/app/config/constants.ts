import type { Permission, Plan } from '@/types';

/** Product configuration shared across the app (not business data). */

export const PERMISSIONS: { id: Permission; label: string }[] = [
  { id: 'view', label: 'View' },
  { id: 'create', label: 'Create' },
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
  { id: 'approve', label: 'Approve' },
  { id: 'export', label: 'Export' },
  { id: 'refund', label: 'Refund' },
  { id: 'discount', label: 'Discount' },
  { id: 'viewProfit', label: 'View Profit' },
];

export const PERMISSION_MODULES = [
  'Dashboard', 'POS', 'Sales', 'Purchases', 'Inventory', 'Products', 'Customers', 'Vendors',
  'Expenses', 'Employees', 'Payroll', 'GST', 'Reports', 'Settings',
];

/** Subscription plans. */
export const PLAN_PRICE: Record<Plan, number> = { trial: 0, starter: 799, growth: 1999, enterprise: 4999, astron_labs: 0 };
export const PLAN_LABEL: Record<Plan, string> = { trial: 'Free trial', starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise', astron_labs: 'Astron Labs Services' };

/** Suggestions for city fields (free text is also accepted). */
export const CITIES = ['Mumbai', 'Pune', 'Bengaluru', 'Hyderabad', 'Chennai', 'Ahmedabad', 'Jaipur', 'Kochi', 'Lucknow', 'Indore', 'Nagpur', 'Delhi', 'Surat', 'Kolkata', 'Bhopal', 'Coimbatore'];

export const BRANCHES = [{ id: 'br_main', name: 'Main Branch', city: '' }];

/** Default stock location for new products and adjustments. */
export const DEFAULT_WAREHOUSE = 'Main Store';
