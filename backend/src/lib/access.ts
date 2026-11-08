/**
 * Server-side source of truth for page access and role permissions.
 * Page ids match the web app's page catalogue.
 */
export const PAGE_IDS = [
  'dashboard', 'pos', 'sales', 'purchases', 'inventory', 'products', 'services', 'packages', 'job-cards', 'customers', 'vendors', 'expenses',
  'employees', 'attendance', 'payroll', 'gst', 'reports', 'bill-studio',
  'restaurant-tables', 'restaurant-orders', 'restaurant-kitchen', 'hotel-rooms', 'hotel-reservations', 'appointments', 'jewellery', 'pharmacy',
  'users', 'roles', 'notifications', 'audit-logs', 'settings', 'support',
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/** Always available to every business. */
export const LOCKED_PAGES: PageId[] = ['dashboard', 'support'];

export const PERMISSION_MODULES = [
  'Dashboard', 'POS', 'Sales', 'Purchases', 'Inventory', 'Products', 'Customers', 'Vendors',
  'Expenses', 'Employees', 'Payroll', 'GST', 'Reports', 'Settings',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];
export const PERMISSIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'refund', 'discount', 'viewProfit'] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Which role-permission module governs each page. `null` = available to every signed-in user. */
export const PAGE_MODULE: Record<PageId, PermissionModule | null> = {
  dashboard: 'Dashboard',
  pos: 'POS',
  sales: 'Sales',
  purchases: 'Purchases',
  inventory: 'Inventory',
  products: 'Products',
  services: 'Products',
  packages: 'Products',
  'job-cards': 'Sales',
  customers: 'Customers',
  vendors: 'Vendors',
  expenses: 'Expenses',
  employees: 'Employees',
  attendance: 'Employees',
  payroll: 'Payroll',
  gst: 'GST',
  reports: 'Reports',
  'bill-studio': 'Settings',
  'restaurant-tables': 'POS',
  'restaurant-orders': 'POS',
  'restaurant-kitchen': 'POS',
  'hotel-rooms': 'POS',
  'hotel-reservations': 'POS',
  appointments: 'POS',
  jewellery: 'POS',
  pharmacy: 'Inventory',
  users: 'Settings',
  roles: 'Settings',
  notifications: null,
  'audit-logs': 'Settings',
  settings: 'Settings',
  support: null,
};

/** Normalises a stored access list: valid ids only, locked pages always included. */
export function normaliseAccess(pages: unknown): PageId[] {
  const list = Array.isArray(pages) ? pages.filter((p): p is PageId => PAGE_IDS.includes(p as PageId)) : [];
  // Users and Roles go together: a business that defines roles must be able to give them to people.
  const team: PageId[] = list.some((p) => p === 'users' || p === 'roles') ? ['users', 'roles'] : [];
  return Array.from(new Set([...LOCKED_PAGES, ...list, ...team]));
}

const ALL: Permission[] = [...PERMISSIONS];
const grant = (modules: readonly string[], perms: Permission[]) => Object.fromEntries(modules.map((m) => [m, perms]));
const everything = grant(PERMISSION_MODULES, ALL);

/** Built-in roles created for every new business (product configuration, not business data). */
export const SYSTEM_ROLES: { name: string; description: string; permissions: Record<string, Permission[]> }[] = [
  { name: 'Owner', description: 'Full access to every module, setting and report.', permissions: everything },
  { name: 'Admin', description: 'Manages the workspace, users and configuration.', permissions: everything },
  {
    name: 'Manager',
    description: 'Runs daily operations across sales, stock and staff.',
    permissions: { ...grant(PERMISSION_MODULES, ['view', 'create', 'edit', 'approve', 'export', 'discount']), Settings: ['view'], Payroll: ['view'] },
  },
  {
    name: 'Cashier',
    description: 'Bills customers at the counter and takes payments.',
    permissions: { POS: ['view', 'create', 'discount'], Sales: ['view', 'create'], Customers: ['view', 'create'], Products: ['view'], Dashboard: ['view'] },
  },
  {
    name: 'Accountant',
    description: 'Handles books, GST, expenses and reports.',
    permissions: { ...grant(['Sales', 'Purchases', 'Expenses', 'GST', 'Reports', 'Vendors', 'Customers'], ['view', 'create', 'edit', 'export', 'viewProfit']), Dashboard: ['view', 'viewProfit'] },
  },
  { name: 'HR', description: 'Manages employees, attendance and payroll.', permissions: grant(['Employees', 'Payroll', 'Dashboard'], ['view', 'create', 'edit', 'approve', 'export']) },
  { name: 'Inventory Manager', description: 'Controls stock, purchases and warehouses.', permissions: grant(['Inventory', 'Products', 'Purchases', 'Vendors', 'Dashboard'], ['view', 'create', 'edit', 'approve', 'export']) },
  { name: 'Waiter', description: 'Takes table orders and sends KOTs.', permissions: { POS: ['view', 'create'], Products: ['view'], Dashboard: ['view'] } },
  { name: 'Kitchen Staff', description: 'Views and updates kitchen order tickets.', permissions: { POS: ['view', 'edit'], Dashboard: ['view'] } },
];

/** Daily rate cards for jewellery businesses; start at ₹0 until the jeweller sets them. */
export const DEFAULT_METAL_RATES = [
  { label: 'Gold 24K', metal: 'Gold', purity: '24K' },
  { label: 'Gold 22K', metal: 'Gold', purity: '22K' },
  { label: 'Gold 18K', metal: 'Gold', purity: '18K' },
  { label: 'Silver 925', metal: 'Silver', purity: '925' },
  { label: 'Platinum 950', metal: 'Platinum', purity: '950' },
];

const COMMON: PageId[] = ['dashboard', 'sales', 'customers', 'expenses', 'reports', 'gst', 'settings', 'support', 'notifications', 'users', 'roles'];
const STAFF: PageId[] = ['employees', 'attendance', 'payroll'];
const STOCK: PageId[] = ['products', 'inventory', 'purchases', 'vendors'];
const BY_TYPE: Record<string, PageId[]> = {
  restaurant: ['pos', ...STOCK, 'services', 'packages', ...STAFF, 'restaurant-tables', 'restaurant-orders', 'restaurant-kitchen', 'bill-studio'],
  hotel: ['pos', 'products', 'services', 'packages', ...STAFF, 'hotel-rooms', 'hotel-reservations', 'bill-studio'],
  salon: ['pos', 'products', 'inventory', 'services', 'packages', ...STAFF, 'appointments', 'bill-studio'],
  grocery: ['pos', ...STOCK, 'packages', ...STAFF, 'bill-studio'],
  stationery: ['pos', ...STOCK, 'services', 'packages', ...STAFF, 'bill-studio'],
  mobile: ['pos', ...STOCK, 'services', 'packages', 'job-cards', ...STAFF, 'bill-studio'],
  pharmacy: ['pos', ...STOCK, 'services', ...STAFF, 'pharmacy', 'bill-studio'],
  jewellery: ['pos', ...STOCK, 'services', ...STAFF, 'jewellery', 'bill-studio'],
  clothing: ['pos', ...STOCK, 'services', 'packages', 'job-cards', ...STAFF, 'bill-studio'],
  hardware: ['pos', ...STOCK, 'services', 'packages', ...STAFF, 'bill-studio'],
  other: ['pos', ...STOCK, 'services', 'packages', 'job-cards', ...STAFF, 'bill-studio'],
};
export const recommendedPages = (type: string): PageId[] => normaliseAccess([...COMMON, ...(BY_TYPE[type] ?? BY_TYPE.other)]);

/** The 10 supported industries plus a general setup. */
export const BUSINESS_TYPES = ['restaurant', 'hotel', 'salon', 'grocery', 'stationery', 'mobile', 'pharmacy', 'jewellery', 'clothing', 'hardware', 'other'] as const;
/** Older type ids still stored for some businesses; they use the general setup. */
export const LEGACY_BUSINESS_TYPES = ['retail', 'service', 'wholesale'] as const;
export const ANY_BUSINESS_TYPE = [...BUSINESS_TYPES, ...LEGACY_BUSINESS_TYPES] as const;
export const PLAN_PRICE: Record<string, number> = { trial: 0, starter: 799, growth: 1999, enterprise: 4999, astron_labs: 0 };
export const PLANS = ['trial', 'starter', 'growth', 'enterprise', 'astron_labs'] as const;
