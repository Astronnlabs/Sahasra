import {
  BarChart3,
  BedDouble,
  Bell,
  Boxes,
  CalendarCheck,
  CalendarClock,
  ChefHat,
  ClipboardList,
  Gem,
  Gift,
  History,
  LayoutDashboard,
  Landmark,
  LifeBuoy,
  Package,
  Palette,
  Pill,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Truck,
  UserCog,
  Users,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  Banknote,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { BusinessType } from '@/types';
import { industryConfig, jobsConfig } from './industry';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Page id from the page catalogue — controls access. */
  page: string;
  end?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const CORE: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, page: 'dashboard' },
  { label: 'POS', to: '/pos', icon: ShoppingCart, page: 'pos' },
  { label: 'Sales', to: '/sales', icon: ReceiptText, page: 'sales' },
  { label: 'Purchases', to: '/purchases', icon: ShoppingBag, page: 'purchases' },
  { label: 'Inventory', to: '/inventory', icon: Boxes, page: 'inventory' },
  { label: 'Products', to: '/products', icon: Package, page: 'products' },
  { label: 'Services', to: '/services', icon: Sparkles, page: 'services' },
  { label: 'Packages', to: '/packages', icon: Gift, page: 'packages' },
  { label: 'Job Cards', to: '/job-cards', icon: Wrench, page: 'job-cards' },
  { label: 'Customers', to: '/customers', icon: Users, page: 'customers' },
  { label: 'Vendors', to: '/vendors', icon: Truck, page: 'vendors' },
  { label: 'Expenses', to: '/expenses', icon: Wallet, page: 'expenses' },
];

const PEOPLE: NavItem[] = [
  { label: 'Employees', to: '/employees', icon: UsersRound, page: 'employees', end: true },
  { label: 'Attendance', to: '/employees/attendance', icon: CalendarCheck, page: 'attendance' },
  { label: 'Payroll', to: '/payroll', icon: Banknote, page: 'payroll' },
];

const FINANCE: NavItem[] = [
  { label: 'GST', to: '/gst', icon: Landmark, page: 'gst' },
  { label: 'Reports', to: '/reports', icon: BarChart3, page: 'reports' },
  { label: 'Bill Studio', to: '/bill-studio', icon: Palette, page: 'bill-studio' },
];

const INDUSTRY_ITEMS: NavItem[] = [
  { label: 'Tables', to: '/restaurant/tables', icon: UtensilsCrossed, page: 'restaurant-tables' },
  { label: 'Orders & KOT', to: '/restaurant/orders', icon: ClipboardList, page: 'restaurant-orders' },
  { label: 'Kitchen Display', to: '/restaurant/kitchen', icon: ChefHat, page: 'restaurant-kitchen' },
  { label: 'Rooms', to: '/hotel/rooms', icon: BedDouble, page: 'hotel-rooms' },
  { label: 'Reservations', to: '/hotel/reservations', icon: CalendarClock, page: 'hotel-reservations' },
  { label: 'Appointments', to: '/salon/appointments', icon: CalendarClock, page: 'appointments' },
  { label: 'Jewellery', to: '/jewellery/items', icon: Gem, page: 'jewellery' },
  { label: 'Pharmacy', to: '/pharmacy/medicines', icon: Pill, page: 'pharmacy' },
];

/** Industry pages shown by default when no explicit access list is set. */
const DEFAULT_INDUSTRY: Partial<Record<BusinessType, string[]>> = {
  restaurant: ['restaurant-tables', 'restaurant-orders', 'restaurant-kitchen'],
  hotel: ['hotel-rooms', 'hotel-reservations'],
  salon: ['appointments'],
  service: ['appointments'],
  jewellery: ['jewellery'],
  pharmacy: ['pharmacy'],
  other: [],
};

const ADMIN: NavItem[] = [
  { label: 'Users', to: '/users', icon: UserCog, page: 'users' },
  { label: 'Roles & Permissions', to: '/roles', icon: ShieldCheck, page: 'roles' },
  { label: 'Notifications', to: '/notifications', icon: Bell, page: 'notifications' },
  { label: 'Audit Logs', to: '/audit-logs', icon: History, page: 'audit-logs' },
  { label: 'Settings', to: '/settings', icon: Settings, page: 'settings' },
  { label: 'Help & Support', to: '/support', icon: LifeBuoy, page: 'support' },
];

/**
 * Builds the sidebar. `access` is the set of pages granted by the Super Admin;
 * `null` means unrestricted (industry pages then follow the business type).
 */
export function buildNavigation(type: BusinessType, access: Set<string> | null): NavGroup[] {
  const allowed = (i: NavItem) => !access || access.has(i.page);
  const industry = INDUSTRY_ITEMS.filter((i) => (access ? access.has(i.page) : (DEFAULT_INDUSTRY[type] ?? []).includes(i.page)));
  // Catalogue pages are named for the industry, e.g. Menu / Catering & Events / Combos & Thalis.
  const cfg = industryConfig(type);
  const label: Record<string, string> = { products: cfg.goods.title, services: cfg.services.title, packages: cfg.packages.title, 'job-cards': jobsConfig(type).title };
  const core = CORE.filter(allowed).map((i) => (label[i.page] ? { ...i, label: label[i.page] } : i));
  const groups: NavGroup[] = [];
  const leadWithIndustry = industry.length > 0 && type !== 'other' && core[0]?.page === 'dashboard';
  if (leadWithIndustry) {
    const [dashboard, ...rest] = core;
    groups.push({ id: 'industry', label: 'Industry', items: [dashboard, ...industry] }, { id: 'main', label: 'Business', items: rest });
  } else {
    groups.push({ id: 'main', label: 'Main', items: core });
    if (industry.length) groups.push({ id: 'industry', label: 'Industry', items: industry });
  }
  groups.push(
    { id: 'people', label: 'People', items: PEOPLE.filter(allowed) },
    { id: 'finance', label: 'Finance', items: FINANCE.filter(allowed) },
    { id: 'admin', label: 'Administration', items: ADMIN.filter(allowed) },
  );
  return groups.filter((g) => g.items.length > 0);
}

/** Flat list used by global search for page navigation. */
export const ALL_PAGES: NavItem[] = [...CORE, ...PEOPLE, ...FINANCE, ...INDUSTRY_ITEMS, ...ADMIN];
