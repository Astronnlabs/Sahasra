import {
  BedDouble,
  Gem,
  Hammer,
  NotebookPen,
  Pill,
  Scissors,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Store,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { BusinessType } from '@/types';

export interface BusinessTypeMeta {
  id: BusinessType;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Industry-specific modules surfaced in navigation. */
  focus: string[];
}

/** The 10 supported industries plus a general setup, in the order shown in pickers. */
export const BUSINESS_TYPES: BusinessTypeMeta[] = [
  { id: 'restaurant', label: 'Restaurant & Café', description: 'Menu, tables, KOT, catering', icon: UtensilsCrossed, focus: ['Menu', 'Tables', 'KOT'] },
  { id: 'hotel', label: 'Hotel & Lodge', description: 'Rooms, reservations, guest services', icon: BedDouble, focus: ['Rooms', 'Reservations', 'Guest services'] },
  { id: 'salon', label: 'Salon & Spa', description: 'Services, packages, appointments', icon: Scissors, focus: ['Services', 'Packages', 'Appointments'] },
  { id: 'grocery', label: 'Grocery & Supermarket', description: 'Packed and loose items, offers', icon: ShoppingBasket, focus: ['Products', 'Loose items', 'Offers'] },
  { id: 'stationery', label: 'Stationery & Books', description: 'Books, stationery, print & xerox', icon: NotebookPen, focus: ['Products', 'Print & Xerox', 'School kits'] },
  { id: 'mobile', label: 'Mobile & Electronics', description: 'Phones, accessories, repairs', icon: Smartphone, focus: ['Phones', 'Repairs', 'Combos'] },
  { id: 'pharmacy', label: 'Pharmacy & Medical', description: 'Medicines, batches, expiry', icon: Pill, focus: ['Medicines', 'Batch', 'Expiry'] },
  { id: 'jewellery', label: 'Jewellery', description: 'Gold rates, ornaments, repairs', icon: Gem, focus: ['Gold Rates', 'Ornaments', 'Repairs'] },
  { id: 'clothing', label: 'Clothing & Footwear', description: 'Sizes, colours, tailoring', icon: Shirt, focus: ['Sizes & colours', 'Tailoring'] },
  { id: 'hardware', label: 'Hardware & Building Materials', description: 'Units, trade prices, fitting', icon: Hammer, focus: ['Units', 'Trade price', 'Installation'] },
  { id: 'other', label: 'Other / General', description: 'A flexible general setup', icon: Store, focus: ['Products', 'Services', 'Packages'] },
];

/** Older type ids kept for existing businesses; they use the general setup. */
const LEGACY: BusinessTypeMeta[] = [
  { id: 'retail', label: 'Retail', description: 'General retail', icon: Store, focus: ['Products'] },
  { id: 'service', label: 'Service Business', description: 'General services', icon: Store, focus: ['Services'] },
  { id: 'wholesale', label: 'Wholesale', description: 'General wholesale', icon: Store, focus: ['Products'] },
];

export const BUSINESS_TYPE_MAP = Object.fromEntries([...BUSINESS_TYPES, ...LEGACY].map((b) => [b.id, b])) as Record<BusinessType, BusinessTypeMeta>;

export const ALL_MODULES = [
  { id: 'pos', label: 'POS Billing', description: 'Fast counter billing with barcode support' },
  { id: 'inventory', label: 'Inventory', description: 'Stock, warehouses, adjustments' },
  { id: 'purchases', label: 'Purchases', description: 'Vendor bills and purchase returns' },
  { id: 'customers', label: 'Customers & CRM', description: 'Profiles, dues and history' },
  { id: 'expenses', label: 'Expenses', description: 'Track every rupee going out' },
  { id: 'employees', label: 'Employees & Attendance', description: 'Staff records and daily attendance' },
  { id: 'payroll', label: 'Payroll', description: 'Salaries, advances and payslips' },
  { id: 'gst', label: 'GST', description: 'Tax summaries and return preparation' },
  { id: 'reports', label: 'Reports & Analytics', description: 'Business insights and exports' },
  { id: 'bill-studio', label: 'Bill Studio', description: 'Design your own invoice templates' },
] as const;
