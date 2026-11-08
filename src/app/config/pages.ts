import type { BusinessType } from '@/types';

/** Every page a business workspace can be given access to. */
export interface PageDef {
  id: string;
  label: string;
  group: 'Core' | 'People' | 'Finance' | 'Industry' | 'Administration';
  description: string;
  /** Route prefixes this page covers (longest match wins). */
  paths: string[];
  /** Always available — cannot be switched off. */
  locked?: boolean;
}

export const PAGE_CATALOG: PageDef[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Core', description: 'Overview of the business', paths: ['/dashboard'], locked: true },
  { id: 'pos', label: 'POS Billing', group: 'Core', description: 'Counter billing and payments', paths: ['/pos'] },
  { id: 'sales', label: 'Sales', group: 'Core', description: 'Invoices, refunds and returns', paths: ['/sales'] },
  { id: 'purchases', label: 'Purchases', group: 'Core', description: 'Vendor bills and stock in', paths: ['/purchases'] },
  { id: 'inventory', label: 'Inventory', group: 'Core', description: 'Stock levels and adjustments', paths: ['/inventory'] },
  { id: 'products', label: 'Products', group: 'Core', description: 'Product catalogue and pricing', paths: ['/products'] },
  { id: 'services', label: 'Services', group: 'Core', description: 'Service catalogue', paths: ['/services'] },
  { id: 'packages', label: 'Packages & Combos', group: 'Core', description: 'Bundles sold at one price', paths: ['/packages'] },
  { id: 'job-cards', label: 'Job Cards', group: 'Core', description: 'Repairs, tailoring and custom orders', paths: ['/job-cards'] },
  { id: 'customers', label: 'Customers', group: 'Core', description: 'Customer profiles and dues', paths: ['/customers'] },
  { id: 'vendors', label: 'Vendors', group: 'Core', description: 'Suppliers and payables', paths: ['/vendors'] },
  { id: 'expenses', label: 'Expenses', group: 'Core', description: 'Operating costs', paths: ['/expenses'] },

  { id: 'employees', label: 'Employees', group: 'People', description: 'Staff records', paths: ['/employees'] },
  { id: 'attendance', label: 'Attendance', group: 'People', description: 'Daily attendance', paths: ['/employees/attendance'] },
  { id: 'payroll', label: 'Payroll', group: 'People', description: 'Salaries and advances', paths: ['/payroll'] },

  { id: 'gst', label: 'GST', group: 'Finance', description: 'Tax registers and returns', paths: ['/gst'] },
  { id: 'reports', label: 'Reports', group: 'Finance', description: 'Analytics and exports', paths: ['/reports'] },
  { id: 'bill-studio', label: 'Bill Studio', group: 'Finance', description: 'Invoice template designer', paths: ['/bill-studio'] },

  { id: 'restaurant-tables', label: 'Restaurant · Tables', group: 'Industry', description: 'Floor plan and table orders', paths: ['/restaurant/tables', '/restaurant'] },
  { id: 'restaurant-orders', label: 'Restaurant · Orders & KOT', group: 'Industry', description: 'Running orders and KOTs', paths: ['/restaurant/orders'] },
  { id: 'restaurant-kitchen', label: 'Restaurant · Kitchen Display', group: 'Industry', description: 'Kitchen order screen', paths: ['/restaurant/kitchen'] },
  { id: 'hotel-rooms', label: 'Hotel · Rooms', group: 'Industry', description: 'Room board and housekeeping', paths: ['/hotel/rooms'] },
  { id: 'hotel-reservations', label: 'Hotel · Reservations', group: 'Industry', description: 'Bookings and check-ins', paths: ['/hotel/reservations'] },
  { id: 'appointments', label: 'Appointments', group: 'Industry', description: 'Salon & service bookings', paths: ['/salon/appointments'] },
  { id: 'jewellery', label: 'Jewellery', group: 'Industry', description: 'Metal rates, items, repairs', paths: ['/jewellery'] },
  { id: 'pharmacy', label: 'Pharmacy', group: 'Industry', description: 'Medicines, batches and expiry', paths: ['/pharmacy'] },

  { id: 'users', label: 'Users', group: 'Administration', description: 'Staff logins', paths: ['/users'] },
  { id: 'roles', label: 'Roles & Permissions', group: 'Administration', description: 'Role-based access', paths: ['/roles'] },
  { id: 'notifications', label: 'Notifications', group: 'Administration', description: 'Alerts', paths: ['/notifications'] },
  { id: 'audit-logs', label: 'Audit Logs', group: 'Administration', description: 'Change history', paths: ['/audit-logs'] },
  { id: 'settings', label: 'Settings', group: 'Administration', description: 'Business and app settings', paths: ['/settings'] },
  { id: 'support', label: 'Help & Support', group: 'Administration', description: 'Contact Sahasra support', paths: ['/support'], locked: true },
];

/** Role-permission module that governs each page (mirrors the server). `null` = every signed-in user. */
export const PAGE_MODULE: Record<string, string | null> = {
  dashboard: 'Dashboard', pos: 'POS', sales: 'Sales', purchases: 'Purchases', inventory: 'Inventory', products: 'Products', services: 'Products', packages: 'Products', 'job-cards': 'Sales',
  customers: 'Customers', vendors: 'Vendors', expenses: 'Expenses', employees: 'Employees', attendance: 'Employees', payroll: 'Payroll',
  gst: 'GST', reports: 'Reports', 'bill-studio': 'Settings', 'restaurant-tables': 'POS', 'restaurant-orders': 'POS', 'restaurant-kitchen': 'POS',
  'hotel-rooms': 'POS', 'hotel-reservations': 'POS', appointments: 'POS', jewellery: 'POS', pharmacy: 'Inventory',
  users: 'Settings', roles: 'Settings', notifications: null, 'audit-logs': 'Settings', settings: 'Settings', support: null,
};

export const PAGE_GROUPS =['Core', 'People', 'Finance', 'Industry', 'Administration'] as const;
export const LOCKED_PAGES = PAGE_CATALOG.filter((p) => p.locked).map((p) => p.id);
export const ALL_PAGE_IDS = PAGE_CATALOG.map((p) => p.id);

const COMMON = ['dashboard', 'sales', 'customers', 'expenses', 'reports', 'gst', 'settings', 'support', 'notifications', 'users', 'roles'];

const STAFF = ['employees', 'attendance', 'payroll'];
const STOCK = ['products', 'inventory', 'purchases', 'vendors'];
const BY_TYPE: Partial<Record<BusinessType, string[]>> = {
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
/** Sensible default page set for a new business of this industry. */
export function recommendedPages(type: BusinessType): string[] {
  return Array.from(new Set([...COMMON, ...(BY_TYPE[type] ?? BY_TYPE.other!)])).filter((p) => ALL_PAGE_IDS.includes(p));
}

/** Always include locked pages in any access list. */
export function withLocked(pages: string[]): string[] {
  return Array.from(new Set([...LOCKED_PAGES, ...pages.filter((p) => ALL_PAGE_IDS.includes(p))]));
}

/** Which page a route belongs to (longest matching prefix), or null for unmanaged routes. */
export function pageForPath(pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const page of PAGE_CATALOG) {
    for (const p of page.paths) {
      if ((pathname === p || pathname.startsWith(`${p}/`)) && (!best || p.length > best.len)) best = { id: page.id, len: p.length };
    }
  }
  return best?.id ?? null;
}

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];
