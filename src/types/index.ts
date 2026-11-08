export type ID = string;
export type ISODate = string;

/** The 10 supported industries plus 'other'. 'retail', 'service' and 'wholesale' are older ids kept for existing businesses. */
export type BusinessType =
  | 'restaurant'
  | 'hotel'
  | 'salon'
  | 'grocery'
  | 'stationery'
  | 'mobile'
  | 'pharmacy'
  | 'jewellery'
  | 'clothing'
  | 'hardware'
  | 'other'
  | 'retail'
  | 'service'
  | 'wholesale';

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank' | 'credit' | 'split';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral';

export interface SessionUser {
  id: ID;
  name: string;
  email: string;
  role: RoleName | 'Super Admin';
  avatarColor?: string;
  /** Business the user belongs to, when they were created on the platform. */
  tenantId?: ID;
}

// ---------- Platform (Super Admin) ----------
export type Plan = 'trial' | 'starter' | 'growth' | 'enterprise' | 'astron_labs';
export type TenantStatus = 'active' | 'trial' | 'suspended' | 'churned';

/** Device-captured position of the business premises. */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  /** Metres above sea level — many devices cannot report this. */
  altitude: number | null;
  /** Horizontal accuracy in metres. */
  accuracy: number | null;
  capturedAt: ISODate;
  source: 'device' | 'manual';
}

/** A business (customer account) on the Sahasra platform. */
export interface Tenant {
  id: ID;
  name: string;
  /** Logo uploaded by the business, if any. */
  logo?: string;
  legalName?: string;
  type: BusinessType;
  gstin?: string;
  pan?: string;
  businessPhone?: string;
  businessEmail?: string;
  website?: string;
  addressLine?: string;
  city: string;
  state?: string;
  pincode?: string;
  location?: GeoLocation;
  ownerName: string;
  ownerEmail: string;
  /** Owner's mobile — also used to sign in. */
  phone: string;
  ownerAltPhone?: string;
  ownerPan?: string;
  /** Page ids this business may use. Undefined = every page. */
  access?: string[];
  notes?: string;
  plan: Plan;
  status: TenantStatus;
  users: number;
  mrr: number;
  createdAt: ISODate;
  lastActive: ISODate;
  trialEndsAt?: ISODate;
  /** Astron Labs digital marketing service — free billing within validity. */
  astronLabsService?: boolean;
  planValidFrom?: ISODate;
  planValidTo?: ISODate;
}

export interface PlatformUser {
  id: ID;
  name: string;
  email: string;
  phone: string;
  tenantId: ID;
  tenantName: string;
  role: string;
  status: 'active' | 'invited' | 'suspended';
  createdAt: ISODate;
  lastLogin?: ISODate;
}

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'billing' | 'technical' | 'gst' | 'account' | 'feature';

export interface TicketMessage {
  id: ID;
  from: 'customer' | 'agent' | 'note';
  author: string;
  text: string;
  at: ISODate;
}

export interface SupportTicket {
  id: ID;
  number: string;
  tenantId: ID;
  tenantName: string;
  requester: string;
  email: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignee?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  messages: TicketMessage[];
}

export interface Branch {
  id: ID;
  name: string;
  city: string;
}

export interface Business {
  id: ID;
  name: string;
  type: BusinessType;
  gstin: string;
  phone: string;
  email: string;
  address: string;
}

// ---------- Catalogue ----------
export type ProductStatus = 'active' | 'archived' | 'draft';

export interface Product {
  id: ID;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  gstRate: number;
  hsn: string;
  stock: number;
  minStock: number;
  supplier: string;
  status: ProductStatus;
  expiryDate?: ISODate;
  warehouse: string;
  /** True for made-to-order items (dishes) that don't track stock. */
  isSelfProduct: boolean;
  /** Can be sold in fractions (1.5 kg, 2.25 m). */
  allowDecimalQty: boolean;
  /** Contractor / wholesale price; 0 = same as selling price. */
  tradePrice: number;
  /** Ways to sell: Half / Full, Box of 10 (factor = base units used). */
  options: SellOption[];
  addons: Addon[];
  /** Industry-specific details (veg mark, IMEI tracking, composition, size, colour...). */
  attributes: Record<string, string | number | boolean | null>;
  variantGroup?: string;
  /** Photo URL: an uploaded file or a built-in picture; '' for none. */
  image: string;
  /** Marked out of stock by hand (e.g. finished for the day). */
  soldOut: boolean;
  /** Used inside the business (salon shampoo, wax), never sold. */
  inHouse?: boolean;
}

export interface SellOption {
  name: string;
  price: number;
  factor: number;
}

export interface Addon {
  name: string;
  /** Price charged for the extra. */
  price: number;
  /** What the extra costs you (for profit). */
  cost?: number;
  /** Set when the extra is an existing menu item — it is billed as its own line and uses that item's stock. */
  productId?: string;
}

export interface PackageItem {
  kind: 'product' | 'service';
  refId: ID;
  name: string;
  qty: number;
}

/** A bundle of products and/or services sold at one price. */
export interface Package {
  id: ID;
  name: string;
  category: string;
  description: string;
  price: number;
  items: PackageItem[];
  validityDays?: number | null;
  status: 'active' | 'inactive';
}

/** One phone / appliance unit identified by its IMEI or serial number. */
export interface ProductSerial {
  id: ID;
  serial: string;
  status: 'in_stock' | 'sold' | 'removed';
  invoiceNo?: string;
  customerName?: string;
  soldAt?: ISODate;
  warrantyUntil?: ISODate;
  note?: string;
  addedAt: ISODate;
}

export interface SerialLookup extends ProductSerial {
  productId?: ID;
  productName: string;
  underWarranty: boolean;
}

export type JobStatus = 'received' | 'in_progress' | 'ready' | 'delivered' | 'cancelled';

/** Parts, labour or charges to bill when the job is delivered. */
export interface JobLine {
  kind: 'product' | 'service' | 'custom';
  refId?: ID;
  name: string;
  qty: number;
  /** Custom lines only; catalogue items are billed at their current price. */
  rate?: number;
  gstRate?: number;
}

/** A repair, tailoring or custom order taken in and delivered later. */
export interface JobCard {
  id: ID;
  number: string;
  kind: 'repair' | 'tailoring' | 'custom' | 'service';
  customerId?: ID;
  customerName: string;
  phone: string;
  item: string;
  identifier: string;
  problem: string;
  details: Record<string, string>;
  estimate: number;
  advance: number;
  advanceMethod?: 'cash' | 'upi' | 'card' | 'bank';
  balance: number;
  status: JobStatus;
  assignedTo: string;
  promisedAt?: ISODate;
  lines: JobLine[];
  saleId?: ID;
  invoiceNo?: string;
  deliveredAt?: ISODate;
  notes: string;
  createdBy: string;
  createdAt: ISODate;
}

export interface ServiceItem {
  id: ID;
  name: string;
  category: string;
  price: number;
  durationMins: number;
  gstRate: number;
  staff: string[];
  commissionPct: number;
  status: 'active' | 'inactive';
  sac: string;
  /** What the price is for: service, page, plate, day... */
  priceUnit: string;
  attributes: Record<string, string | number | boolean | null>;
  /** Uploaded photo or a built-in picture (/salon/<key>.svg). */
  image?: string;
  /** In-house products used each time, in the product's unit. */
  consumables?: { productId: ID; qty: number }[];
}

// ---------- Parties ----------
export type PartyStatus = 'active' | 'inactive' | 'overdue';

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email: string;
  city: string;
  gstin?: string;
  orders: number;
  totalSpend: number;
  outstanding: number;
  dueDate?: ISODate;
  lastPurchase: ISODate;
  status: PartyStatus;
  tags: string[];
  createdAt: ISODate;
}

export interface Vendor {
  id: ID;
  name: string;
  contact: string;
  phone: string;
  email: string;
  city: string;
  gstin: string;
  purchases: number;
  totalPurchased: number;
  payable: number;
  dueDate?: ISODate;
  lastPurchase: ISODate;
  status: PartyStatus;
  category: string;
}

// ---------- Transactions ----------
export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue' | 'refunded' | 'returned' | 'draft';

export interface LineItem {
  id: ID;
  productId?: ID;
  serviceId?: ID;
  /** Set on every part of a package sold as one line. */
  packageId?: ID;
  packageName?: string;
  name: string;
  sku?: string;
  hsn?: string;
  qty: number;
  rate: number;
  discount: number;
  gstRate: number;
  /** Staff member who gave this service (salons). */
  staff?: string;
}

export interface Sale {
  id: ID;
  invoiceNo: string;
  customerId?: ID;
  customerName: string;
  date: ISODate;
  branch: string;
  items: LineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  payment: PaymentMethod;
  status: InvoiceStatus;
  cashier: string;
  notes?: string;
  /** Business details and bill design saved when the invoice was issued (older invoices have none). */
  seller?: import('@/features/bill-studio/model').SellerSnapshot;
}

export type PurchaseStatus = 'received' | 'ordered' | 'partial' | 'returned' | 'draft';

export interface Purchase {
  id: ID;
  billNo: string;
  vendorId: ID;
  vendorName: string;
  date: ISODate;
  items: LineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  status: PurchaseStatus;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
}

export interface ReturnRecord {
  id: ID;
  ref: string;
  against: string;
  party: string;
  date: ISODate;
  amount: number;
  reason: string;
  status: 'approved' | 'pending' | 'rejected';
}

export type ExpenseCategory =
  | 'Rent'
  | 'Salary'
  | 'Electricity'
  | 'Marketing'
  | 'Transport'
  | 'Maintenance'
  | 'Office'
  | 'Miscellaneous';

export interface Expense {
  id: ID;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: ISODate;
  paidTo: string;
  method: PaymentMethod;
  status: 'paid' | 'pending';
  recurring: boolean;
  notes?: string;
  receipt?: string;
  /** Link to the uploaded receipt file. */
  receiptUrl?: string;
}

// ---------- People ----------
export type AttendanceStatus = 'present' | 'absent' | 'half-day' | 'late' | 'leave' | 'holiday';

export interface Employee {
  id: ID;
  code: string;
  name: string;
  phone: string;
  email: string;
  designation: string;
  department: string;
  branch: string;
  joinDate: ISODate;
  salary: number;
  status: 'active' | 'on-leave' | 'inactive';
  dob: ISODate;
  address: string;
  bloodGroup: string;
  pan: string;
  bank: string;
}

export interface PayrollEntry {
  employeeId: ID;
  name: string;
  designation: string;
  gross: number;
  allowances: number;
  overtime: number;
  commission: number;
  advance: number;
  deductions: number;
  /** Each deduction (PF, ESI, professional tax, custom); missing on payrolls run before this existed. */
  breakdown?: { key: string; label: string; amount: number }[];
  net: number;
  status: 'paid' | 'pending' | 'processing';
}

/** Settings → Payroll: how salaries are cut each month. */
export interface PayrollSettings {
  pf: { enabled: boolean; pct: number; on: 'full' | 'basic'; basicPct: number; wageCap: number };
  esi: { enabled: boolean; pct: number; maxSalary: number };
  pt: { enabled: boolean; mode: 'fixed' | 'percent'; amount: number; pct: number; minSalary: number };
  custom: { id: string; name: string; mode: 'fixed' | 'percent'; value: number; enabled: boolean }[];
}

export interface EmployeeAdvance {
  id: ID;
  employeeId: ID;
  name: string;
  amount: number;
  recovered: number;
  date: ISODate;
  monthlyRecovery: number;
  reason: string;
}

// ---------- Inventory ----------
export interface StockMovement {
  id: ID;
  date: ISODate;
  product: string;
  sku: string;
  type: 'in' | 'out' | 'adjustment' | 'transfer';
  qty: number;
  reference: string;
  warehouse: string;
  by: string;
  /** Vendor who supplied stock added (purchases and stock added with a vendor). */
  vendorId?: string | null;
  vendor?: string;
}

/** A vendor with the stock they have supplied (Inventory → Vendors). */
export interface VendorSupply extends Vendor {
  supplies: number;
  products: number;
  topProducts: string[];
  lastSupplied?: ISODate;
}

export interface Warehouse {
  id: ID;
  name: string;
  city: string;
  manager: string;
  items: number;
  value: number;
  utilisation: number;
}

// ---------- Admin ----------
export type RoleName =
  | 'Owner'
  | 'Admin'
  | 'Manager'
  | 'Cashier'
  | 'Accountant'
  | 'HR'
  | 'Inventory Manager'
  | 'Waiter'
  | 'Kitchen Staff';

export type Permission =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'export'
  | 'refund'
  | 'discount'
  | 'viewProfit';

export interface Role {
  id: ID;
  name: string;
  description: string;
  system: boolean;
  members: number;
  permissions: Record<string, Permission[]>;
}

export interface AppUser {
  id: ID;
  name: string;
  email: string;
  phone: string;
  role: string;
  branch: string;
  status: 'active' | 'invited' | 'suspended';
  lastActive: ISODate;
}

export type NotificationKind =
  | 'low-stock'
  | 'out-of-stock'
  | 'payment-overdue'
  | 'gst-reminder'
  | 'employee-absence'
  | 'invoice-created'
  | 'purchase-received'
  | 'system';

export interface AppNotification {
  id: ID;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: ISODate;
  read: boolean;
  href?: string;
}

export interface AuditLog {
  id: ID;
  user: string;
  action: 'created' | 'edited' | 'deleted' | 'approved' | 'exported' | 'logged in' | 'refunded';
  module: string;
  target: string;
  details: string;
  at: ISODate;
  ip: string;
}

// ---------- Industry ----------
export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';
export type OrderType = 'dine-in' | 'takeaway' | 'delivery';

export interface MenuItem {
  id: ID;
  name: string;
  category: string;
  price: number;
  veg: boolean;
  gstRate: number;
  image?: string;
  soldOut?: boolean;
}

export interface OrderLine {
  id: ID;
  menuItemId: ID;
  name: string;
  qty: number;
  price: number;
  note?: string;
  sentToKitchen: boolean;
}

export interface RestaurantTable {
  id: ID;
  label: string;
  seats: number;
  area: 'Ground Floor' | 'First Floor' | 'Terrace';
  status: TableStatus;
  guests?: number;
  waiter?: string;
  openedAt?: ISODate;
  orderId?: ID;
  mergedWith?: ID[];
  reservedFor?: string;
}

export interface RestaurantOrder {
  id: ID;
  number: string;
  type: OrderType;
  tableId?: ID;
  customer?: string;
  lines: OrderLine[];
  createdAt: ISODate;
  status: 'open' | 'billed' | 'closed';
}

export type KotStatus = 'new' | 'preparing' | 'ready' | 'served';

export interface Kot {
  id: ID;
  number: string;
  orderId: ID;
  table: string;
  type: OrderType;
  items: { name: string; qty: number; note?: string }[];
  createdAt: ISODate;
  status: KotStatus;
}

export type RoomStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance';

export interface Room {
  id: ID;
  number: string;
  floor: number;
  type: 'Standard' | 'Deluxe' | 'Executive' | 'Suite';
  rate: number;
  status: RoomStatus;
  guest?: string;
  checkOut?: ISODate;
}

export interface Reservation {
  id: ID;
  code: string;
  guest: string;
  phone: string;
  roomNumber: string;
  roomType: Room['type'];
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
  amount: number;
  advance: number;
  source: 'Walk-in' | 'Website' | 'Phone' | 'OTA';
  status: 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled' | 'pending';
}

export interface Appointment {
  id: ID;
  customer: string;
  phone: string;
  service: string;
  staff: string;
  start: ISODate;
  durationMins: number;
  price: number;
  status: 'booked' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
}

export interface JewelleryItem {
  id: ID;
  name: string;
  sku: string;
  metal: 'Gold' | 'Silver' | 'Platinum';
  purity: '24K' | '22K' | '18K' | '925' | '950';
  grossWeight: number;
  netWeight: number;
  makingPerGram: number;
  stoneValue: number;
  huid: string;
  category: string;
  status: 'in-stock' | 'sold' | 'on-approval';
}

export interface MetalRate {
  id: ID;
  label: string;
  metal: JewelleryItem['metal'];
  purity: JewelleryItem['purity'];
  ratePerGram: number;
  change: number;
}

export interface RepairJob {
  id: ID;
  ticket: string;
  customer: string;
  item: string;
  work: string;
  received: ISODate;
  promised: ISODate;
  estimate: number;
  status: 'received' | 'in-progress' | 'ready' | 'delivered';
}

export interface Medicine {
  id: ID;
  name: string;
  generic: string;
  manufacturer: string;
  batch: string;
  expiry: ISODate;
  schedule: 'OTC' | 'H' | 'H1' | 'X';
  pack: string;
  stock: number;
  minStock: number;
  mrp: number;
  rate: number;
  gstRate: number;
  rack: string;
}

// ---------- Search ----------
export interface SearchResult {
  id: ID;
  type: 'customer' | 'invoice' | 'product' | 'vendor' | 'employee' | 'service' | 'order' | 'page';
  title: string;
  subtitle: string;
  meta?: string;
  href: string;
}
