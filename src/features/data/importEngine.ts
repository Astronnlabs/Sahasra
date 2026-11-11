/**
 * Data import ("data retrieval"): reads a spreadsheet or SQL dump, finds the header row, works out what
 * each column holds — from its name and from the values in it — and turns rows into Sahaasra records.
 */

import { parseSqlDump } from './sqlDump';

/** `inhouse` = salon products used inside the business (saved as products marked in-house). */
export type ImportTarget = 'products' | 'inhouse' | 'services' | 'customers' | 'vendors' | 'employees' | 'sales' | 'appointments' | 'attendance';
export type ImportEndpoint = Exclude<ImportTarget, 'inhouse'>;
/** Server endpoint each kind of record is imported through. */
export const ENDPOINT: Record<ImportTarget, ImportEndpoint> = {
  products: 'products', inhouse: 'products', services: 'services', customers: 'customers', vendors: 'vendors',
  employees: 'employees', sales: 'sales', appointments: 'appointments', attendance: 'attendance',
};
/** Import order: what later records refer to goes in first (staff and services before bills that name them). */
export const IMPORT_ORDER: ImportTarget[] = ['vendors', 'products', 'inhouse', 'services', 'employees', 'customers', 'sales', 'appointments', 'attendance'];
type Kind = 'text' | 'phone' | 'email' | 'number' | 'gst' | 'gstin' | 'date' | 'digits' | 'code' | 'list' | 'json' | 'usage';

export interface FieldDef {
  key: string;
  label: string;
  kind: Kind;
  required?: boolean;
  /** Other names people use for this column (any case, spaces and symbols ignored). */
  names: string[];
}

export const TARGETS: Record<ImportTarget, { label: string; page: string; hint: string; fields: FieldDef[]; words: string[] }> = {
  products: {
    label: 'Products / menu items',
    page: 'products',
    hint: 'Items you sell, with prices, GST and stock',
    words: ['product', 'item', 'menu', 'stock', 'inventory', 'dish', 'catalog', 'price list', 'sku'],
    fields: [
      { key: 'name', label: 'Item name', kind: 'text', required: true, names: ['product', 'product name', 'item', 'item name', 'name', 'dish', 'dish name', 'particulars', 'description', 'title', 'article', 'medicine', 'menu item', 'goods'] },
      { key: 'sellingPrice', label: 'Selling price', kind: 'number', required: true, names: ['selling price', 'sale price', 'sp', 'price', 'rate', 'sales rate', 'sell price', 'retail price', 'unit price', 'amount', 'menu price', 'mrp rate', 'sale rate'] },
      { key: 'purchasePrice', label: 'Purchase price (cost)', kind: 'number', names: ['purchase price', 'cost', 'cost price', 'cp', 'buying price', 'purchase rate', 'buy price', 'landing cost', 'pp'] },
      { key: 'mrp', label: 'MRP', kind: 'number', names: ['mrp', 'max retail price', 'maximum retail price', 'list price'] },
      { key: 'category', label: 'Category', kind: 'text', names: ['category', 'group', 'type', 'department', 'section', 'item group', 'cat', 'menu category'] },
      // Not plain "id": in database exports that's the row number, not an item code.
      { key: 'sku', label: 'SKU / item code', kind: 'code', names: ['sku', 'item code', 'code', 'product code', 'part no', 'part number', 'article no', 'item no'] },
      { key: 'barcode', label: 'Barcode', kind: 'code', names: ['barcode', 'bar code', 'ean', 'upc', 'gtin', 'ean code'] },
      { key: 'gstRate', label: 'GST %', kind: 'gst', names: ['gst', 'gst rate', 'gst %', 'tax', 'tax rate', 'tax %', 'igst', 'vat', 'gst percent'] },
      { key: 'hsn', label: 'HSN code', kind: 'digits', names: ['hsn', 'hsn code', 'hsn sac', 'sac', 'hsn/sac'] },
      { key: 'stock', label: 'Stock in hand', kind: 'number', names: ['stock', 'qty', 'quantity', 'opening stock', 'current stock', 'closing stock', 'in stock', 'available', 'balance qty', 'stock qty', 'on hand'] },
      { key: 'minStock', label: 'Low-stock alert at', kind: 'number', names: ['min stock', 'minimum stock', 'reorder level', 'reorder', 'min qty', 'alert qty', 'low stock'] },
      { key: 'unit', label: 'Unit', kind: 'text', names: ['unit', 'uom', 'units', 'measure', 'unit of measure'] },
      { key: 'brand', label: 'Brand', kind: 'text', names: ['brand', 'make', 'manufacturer', 'company', 'mfr', 'company name'] },
      { key: 'supplier', label: 'Supplier', kind: 'text', names: ['supplier', 'vendor', 'distributor', 'supplier name'] },
      { key: 'warehouse', label: 'Store / godown', kind: 'text', names: ['warehouse', 'godown', 'store', 'location', 'rack', 'bin'] },
      { key: 'expiryDate', label: 'Expiry date', kind: 'date', names: ['expiry', 'expiry date', 'exp', 'exp date', 'expires', 'best before', 'use before'] },
      // e.g. usage_type = sell / salon_use — salon-use rows become in-house products.
      { key: 'usage', label: 'For sale or in-house use', kind: 'usage', names: ['usage type', 'usage', 'use type', 'use', 'in house', 'salon use', 'item type', 'for sale', 'consumable'] },
    ],
  },
  services: {
    label: 'Services',
    page: 'services',
    hint: 'Haircut, facial, spa… with price and time',
    words: ['service', 'services', 'treatment', 'treatments', 'rate card', 'ratecard'],
    fields: [
      { key: 'name', label: 'Service name', kind: 'text', required: true, names: ['service', 'service name', 'name', 'treatment', 'title'] },
      { key: 'price', label: 'Price', kind: 'number', required: true, names: ['price', 'rate', 'charge', 'amount', 'fee', 'service price', 'mrp'] },
      { key: 'category', label: 'Category', kind: 'text', names: ['category', 'group', 'type', 'department', 'section'] },
      { key: 'durationMins', label: 'Duration (minutes)', kind: 'number', names: ['duration', 'duration mins', 'minutes', 'mins', 'time', 'time taken'] },
      { key: 'gender', label: 'For (men / women)', kind: 'text', names: ['gender', 'target gender', 'for', 'customer type', 'men women'] },
      { key: 'commissionPct', label: 'Staff commission %', kind: 'number', names: ['commission', 'commission rate', 'commission %', 'incentive'] },
      { key: 'gstRate', label: 'GST %', kind: 'gst', names: ['gst', 'gst rate', 'tax', 'tax rate'] },
      { key: 'sac', label: 'SAC code', kind: 'digits', names: ['sac', 'sac code', 'hsn sac'] },
      { key: 'status', label: 'Active / inactive', kind: 'text', names: ['status', 'active', 'enabled'] },
    ],
  },
  employees: {
    label: 'Staff / employees',
    page: 'employees',
    hint: 'Stylists and team, with role and salary',
    words: ['staff', 'employee', 'employees', 'team', 'stylist', 'stylists', 'worker', 'workers', 'beautician'],
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, names: ['name', 'staff name', 'employee', 'employee name', 'full name'] },
      { key: 'phone', label: 'Mobile', kind: 'phone', required: true, names: ['phone', 'mobile', 'mobile no', 'contact', 'contact no', 'phone number'] },
      { key: 'email', label: 'Email', kind: 'email', names: ['email', 'email id', 'mail'] },
      { key: 'designation', label: 'Role / designation', kind: 'text', names: ['role', 'designation', 'position', 'title', 'job'] },
      { key: 'salary', label: 'Monthly salary', kind: 'number', names: ['salary', 'monthly salary', 'basic', 'pay', 'wage', 'ctc'] },
      { key: 'joinDate', label: 'Joining date', kind: 'date', names: ['join date', 'joining date', 'doj', 'joined', 'date of joining', 'start date'] },
      { key: 'department', label: 'Department', kind: 'text', names: ['department', 'dept', 'section'] },
      { key: 'status', label: 'Active / left', kind: 'text', names: ['status', 'active'] },
      { key: 'address', label: 'Address', kind: 'text', names: ['address'] },
    ],
  },
  sales: {
    label: 'Past bills (sales)',
    page: 'sales',
    hint: 'Old invoices with items, staff and payment',
    words: ['invoice', 'invoices', 'bill', 'bills', 'billing', 'sale', 'sales', 'receipt', 'receipts', 'order', 'orders'],
    fields: [
      { key: 'invoiceNo', label: 'Bill number', kind: 'code', required: true, names: ['invoice no', 'invoice number', 'invoice', 'bill no', 'bill number', 'receipt no', 'order no', 'voucher no'] },
      { key: 'date', label: 'Bill date', kind: 'date', required: true, names: ['date', 'invoice date', 'bill date', 'created at', 'sale date'] },
      { key: 'total', label: 'Bill total', kind: 'number', required: true, names: ['total', 'grand total', 'net amount', 'amount', 'bill amount', 'invoice total'] },
      { key: 'customerName', label: 'Customer name', kind: 'text', names: ['customer name', 'customer', 'party', 'client', 'name', 'customer name from customers'] },
      { key: 'customerPhone', label: 'Customer mobile', kind: 'phone', names: ['customer phone', 'customer mobile', 'phone', 'mobile', 'contact', 'customer phone from customers'] },
      { key: 'items', label: 'Items on the bill', kind: 'json', names: ['items', 'line items', 'products', 'services', 'details', 'cart'] },
      { key: 'subtotal', label: 'Subtotal', kind: 'number', names: ['subtotal', 'sub total', 'gross', 'gross amount'] },
      { key: 'discount', label: 'Discount', kind: 'number', names: ['discount', 'discount amount'] },
      { key: 'discountType', label: 'Discount type (% or ₹)', kind: 'text', names: ['discount type', 'disc type'] },
      { key: 'tax', label: 'Tax / GST amount', kind: 'number', names: ['tax', 'gst', 'tax amount', 'gst amount'] },
      { key: 'paymentMethod', label: 'Payment mode', kind: 'text', names: ['payment method', 'payment mode', 'mode', 'paid by', 'payment type'] },
      { key: 'paymentStatus', label: 'Paid / unpaid', kind: 'text', names: ['payment status', 'status', 'paid'] },
      { key: 'staff', label: 'Done by (staff)', kind: 'text', names: ['staff', 'staff name', 'stylist', 'staff name from staff', 'employee', 'sold by'] },
      { key: 'notes', label: 'Notes', kind: 'text', names: ['notes', 'note', 'remarks', 'comment'] },
    ],
  },
  appointments: {
    label: 'Appointments',
    page: 'appointments',
    hint: 'Bookings with date, time, service and staff',
    words: ['appointment', 'appointments', 'booking', 'bookings', 'schedule', 'reservation'],
    fields: [
      { key: 'customer', label: 'Customer', kind: 'text', required: true, names: ['customer', 'customer name', 'client', 'name', 'customer name from customers'] },
      { key: 'date', label: 'Date', kind: 'date', required: true, names: ['date', 'appointment date', 'booking date', 'day'] },
      { key: 'time', label: 'Time', kind: 'text', names: ['time', 'slot', 'start time', 'appointment time'] },
      { key: 'phone', label: 'Mobile', kind: 'phone', names: ['phone', 'mobile', 'customer phone', 'customer phone from customers'] },
      { key: 'service', label: 'Service', kind: 'text', names: ['service', 'services', 'treatment', 'services name from services', 'service name from services'] },
      { key: 'staff', label: 'Staff', kind: 'text', names: ['staff', 'stylist', 'staff name from staff', 'employee'] },
      { key: 'durationMins', label: 'Duration (minutes)', kind: 'number', names: ['duration', 'minutes', 'mins'] },
      { key: 'price', label: 'Price', kind: 'number', names: ['price', 'amount', 'rate'] },
      { key: 'status', label: 'Status', kind: 'text', names: ['status', 'state'] },
    ],
  },
  attendance: {
    label: 'Attendance',
    page: 'attendance',
    hint: 'Who came in on which day',
    words: ['attendance', 'check in', 'checkin', 'punch', 'present'],
    fields: [
      { key: 'employee', label: 'Employee name', kind: 'text', required: true, names: ['employee', 'employee name', 'staff', 'staff name', 'user name', 'name', 'user name from users', 'user id name from users'] },
      { key: 'date', label: 'Date', kind: 'date', required: true, names: ['date', 'day', 'attendance date'] },
      { key: 'status', label: 'Status', kind: 'text', names: ['status', 'attendance', 'present'] },
    ],
  },
  inhouse: {
    label: 'In-house products',
    page: 'products',
    hint: 'What your salon uses — shampoo, wax, creams — and how much is left',
    words: ['in house', 'inhouse', 'consumable', 'consumables', 'salon use', 'backbar', 'back bar', 'supplies', 'usage', 'material', 'raw material', 'internal'],
    fields: [
      { key: 'name', label: 'Product name', kind: 'text', required: true, names: ['product', 'product name', 'item', 'item name', 'name', 'material', 'consumable', 'description', 'particulars'] },
      { key: 'stock', label: 'Amount left', kind: 'number', names: ['stock', 'qty', 'quantity', 'left', 'balance', 'in hand', 'on hand', 'available', 'remaining', 'current stock', 'closing stock', 'opening stock'] },
      { key: 'unit', label: 'Unit (ml, gram…)', kind: 'text', names: ['unit', 'uom', 'units', 'measure', 'unit of measure'] },
      { key: 'purchasePrice', label: 'Cost per unit', kind: 'number', names: ['cost', 'cost price', 'purchase price', 'rate', 'price', 'unit cost', 'cost per unit', 'buying price', 'cp'] },
      { key: 'minStock', label: 'Alert when below', kind: 'number', names: ['min stock', 'minimum', 'reorder level', 'reorder', 'min qty', 'alert', 'low stock'] },
      { key: 'category', label: 'Category', kind: 'text', names: ['category', 'group', 'type', 'department', 'section'] },
      { key: 'brand', label: 'Brand', kind: 'text', names: ['brand', 'make', 'company', 'manufacturer'] },
      { key: 'supplier', label: 'Supplier', kind: 'text', names: ['supplier', 'vendor', 'distributor'] },
      { key: 'sku', label: 'Item code', kind: 'code', names: ['sku', 'item code', 'code', 'product code'] },
      { key: 'expiryDate', label: 'Expiry date', kind: 'date', names: ['expiry', 'expiry date', 'exp', 'exp date', 'best before'] },
    ],
  },
  customers: {
    label: 'Customers',
    page: 'customers',
    hint: 'People and businesses who buy from you',
    words: ['customer', 'client', 'buyer', 'guest', 'party', 'debtor', 'patient', 'member', 'contact'],
    fields: [
      { key: 'name', label: 'Customer name', kind: 'text', required: true, names: ['name', 'customer', 'customer name', 'client', 'client name', 'full name', 'user', 'user name', 'username', 'party', 'party name', 'buyer', 'guest', 'guest name', 'contact name', 'patient', 'member', 'cust name'] },
      { key: 'phone', label: 'Mobile', kind: 'phone', required: true, names: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone number', 'contact', 'contact no', 'contact number', 'cell', 'whatsapp', 'mob', 'mob no', 'ph', 'ph no', 'tel', 'telephone'] },
      { key: 'email', label: 'Email', kind: 'email', names: ['email', 'email id', 'e mail', 'mail', 'email address'] },
      // Not "address": a full address in the City field reads badly on bills.
      { key: 'city', label: 'City', kind: 'text', names: ['city', 'town', 'place', 'location', 'area', 'district'] },
      { key: 'gstin', label: 'GSTIN', kind: 'gstin', names: ['gstin', 'gst no', 'gst number', 'gstin no', 'gst', 'tax id', 'gstin uin'] },
      { key: 'tags', label: 'Tags', kind: 'list', names: ['tags', 'tag', 'group', 'segment', 'type', 'category', 'labels'] },
    ],
  },
  vendors: {
    label: 'Vendors / suppliers',
    page: 'vendors',
    hint: 'Businesses you buy stock from',
    words: ['vendor', 'supplier', 'distributor', 'creditor', 'wholesaler', 'dealer', 'manufacturer'],
    fields: [
      { key: 'name', label: 'Business name', kind: 'text', required: true, names: ['name', 'vendor', 'vendor name', 'supplier', 'supplier name', 'business', 'business name', 'company', 'company name', 'firm', 'firm name', 'party', 'party name', 'distributor', 'dealer'] },
      { key: 'contact', label: 'Contact person', kind: 'text', names: ['contact person', 'contact name', 'person', 'owner', 'owner name', 'representative', 'salesman', 'attention'] },
      { key: 'phone', label: 'Mobile', kind: 'phone', required: true, names: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone number', 'contact', 'contact no', 'contact number', 'cell', 'whatsapp', 'mob', 'mob no', 'ph', 'tel'] },
      { key: 'email', label: 'Email', kind: 'email', names: ['email', 'email id', 'e mail', 'mail'] },
      { key: 'city', label: 'City', kind: 'text', names: ['city', 'town', 'place', 'location', 'area'] },
      { key: 'gstin', label: 'GSTIN', kind: 'gstin', names: ['gstin', 'gst no', 'gst number', 'gstin no', 'gst', 'tax id'] },
      { key: 'category', label: 'Supplies', kind: 'text', names: ['category', 'type', 'supplies', 'products', 'group', 'segment'] },
    ],
  },
};

// ── Reading files ──
export interface Sheet {
  name: string;
  headers: string[];
  rows: unknown[][];
  /** Spreadsheet row number of the header (1-based), so problems can point at the real row. */
  headerRow: number;
}
export const ACCEPTED = '.xlsx,.xls,.xlsm,.xlsb,.csv,.tsv,.txt,.ods,.json,.sql';
const MAX_BYTES = 25 * 1024 * 1024;

/** Reads every sheet of a workbook, every table of a SQL dump, or a CSV / JSON file into header + rows. */
export async function readFile(file: File): Promise<Sheet[]> {
  if (file.size > MAX_BYTES) throw new Error('The file is larger than 25 MB. Split it and import in parts.');
  if (/\.sql$/i.test(file.name)) {
    const tables = parseSqlDump(await file.text());
    if (!tables.some((t) => t.rows.length)) throw new Error('No table data found in this SQL file. It needs INSERT … VALUES or COPY rows.');
    return linkTables(tables.map((t) => ({ name: t.name, headers: t.columns, rows: t.rows, headerRow: 0 })));
  }
  if (/\.json$/i.test(file.name)) {
    const parsed = JSON.parse(await file.text()) as unknown;
    const arrays = Array.isArray(parsed) ? { [file.name]: parsed } : Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => Array.isArray(v)));
    return Object.entries(arrays)
      .map(([name, list]) => {
        const objs = (list as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
        const headers = Array.from(new Set(objs.flatMap((o) => Object.keys(o))));
        return { name, headers, rows: objs.map((o) => headers.map((h) => o[h])), headerRow: 0 };
      })
      .filter((s) => s.rows.length);
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true, dense: true });
  return wb.SheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '', raw: true, blankrows: false });
    // Skip title rows ("ABC Traders — Stock list 2026"): the header is the first row with 2+ text cells.
    const at = Math.max(0, grid.slice(0, 15).findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim()).length >= 2));
    const headers = (grid[at] ?? []).map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
    const rows = grid.slice(at + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
    return { name, headers, rows, headerRow: at + 1 };
  }).filter((s) => s.rows.length);
}

// ── Links between tables (database dumps) ──
const asIds = (v: unknown): string[] | null => {
  if (Array.isArray(v)) return v.map(String);
  const s = String(v ?? '').trim();
  if (s.startsWith('[')) {
    try {
      const a = JSON.parse(s) as unknown;
      return Array.isArray(a) && a.every((x) => typeof x !== 'object') ? a.map(String) : null;
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Databases store links as ids: appointments.customer_id = "c_178…", services = ["srv_…"]. For every column
 * whose values are ids of another table, adds readable columns from that table — "customer name (from
 * customers)", "customer phone (from customers)" — so bookings and bills can be matched by name and phone.
 */
export function linkTables(sheets: Sheet[]): Sheet[] {
  const idIndex = sheets
    .map((s) => {
      const idCol = s.headers.findIndex((h) => /^id$/i.test(h));
      if (idCol < 0 || !s.rows.length) return null;
      const nameCol = s.headers.findIndex((h) => /^(name|full_?name|title|user_?name)$/i.test(h));
      const phoneCol = s.headers.findIndex((h) => /^(phone|mobile|phone_?no|mobile_?no|contact)$/i.test(h));
      if (nameCol < 0) return null;
      return { sheet: s, map: new Map(s.rows.map((r) => [String(r[idCol]), r])), nameCol, phoneCol };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  return sheets.map((s) => {
    const extra: { header: string; values: unknown[] }[] = [];
    s.headers.forEach((h, col) => {
      if (/^id$/i.test(h)) return;
      const values = s.rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
      if (!values.length) return;
      for (const ix of idIndex) {
        if (ix.sheet === s) continue;
        const lists = values.map(asIds);
        const isList = lists.every((l) => l !== null);
        const flat = isList ? (lists as string[][]).flat() : values.map(String);
        if (!flat.length || flat.filter((v) => ix.map.has(v)).length / flat.length < 0.7) continue;
        const base = h.replace(/_?ids?$/i, '').replace(/_/g, ' ').trim() || ix.sheet.name;
        const pick = (r: unknown[], c: number) => (c < 0 ? null : (ix.map.get(String(r[col]))?.[c] ?? null));
        const pickList = (r: unknown[], c: number) => (asIds(r[col]) ?? []).map((id) => ix.map.get(id)?.[c]).filter((x) => x != null).join(', ') || null;
        extra.push({ header: `${base} name (from ${ix.sheet.name})`, values: s.rows.map((r) => (isList ? pickList(r, ix.nameCol) : pick(r, ix.nameCol))) });
        if (ix.phoneCol >= 0 && !isList) extra.push({ header: `${base} phone (from ${ix.sheet.name})`, values: s.rows.map((r) => pick(r, ix.phoneCol)) });
        break;
      }
    });
    if (!extra.length) return s;
    return { ...s, headers: [...s.headers, ...extra.map((e) => e.header)], rows: s.rows.map((r, i) => [...r, ...extra.map((e) => e.values[i])]) };
  });
}

// ── Tables that are never imported, and why ──
export interface TableNote {
  reason: string;
  /** Can't be imported at all (passwords). */
  locked?: boolean;
}
const has = (s: Sheet, re: RegExp) => s.headers.some((h) => re.test(h));
/** Explains tables Sahaasra doesn't take, so every table in the file is accounted for. */
export function tableNote(s: Sheet): TableNote | null {
  const n = s.name.toLowerCase();
  if (has(s, /^(password|passwd|pass|password_?hash|pin|secret|token|api_?key)$/i) || /credential|password|secret|token|session/.test(n)) {
    return { reason: 'Login passwords — never imported, to keep accounts safe', locked: true };
  }
  if (!s.rows.length) return { reason: 'Empty — no rows' };
  if (/^(users?|accounts?|logins?|admins?)$/.test(n)) return { reason: 'App logins — add staff logins in Users instead' };
  if (/permission|^roles?$|role_/.test(n)) return { reason: 'Access rules — set them in Roles & Permissions' };
  if (/branch|outlet|store_?location|^locations?$/.test(n)) return { reason: 'Branches are set up by the Sahaasra team' };
  if (/categor/.test(n) && s.headers.length <= 5) return { reason: 'Category names — they come in with products and services' };
  if (/^(migrations?|schema|settings?|config|logs?|audit|jobs?|cache|failed_jobs)$/.test(n)) return { reason: 'App settings and logs — not business records' };
  return null;
}

// ── Understanding columns ──
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
const squash = (s: string) => norm(s).replace(/\s+/g, '');

function similarity(a: string, b: string) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}

/** 0–1: how well a column name matches one of our fields. */
function headerScore(header: string, f: FieldDef) {
  const h = squash(header);
  const hw = new Set(norm(header).split(' ').filter(Boolean));
  if (!h) return 0;
  let best = 0;
  for (const name of [f.key, f.label, ...f.names]) {
    const s = squash(name);
    if (h === s) return 1;
    if (s.length >= 3 && (h.includes(s) || s.includes(h)) && Math.min(h.length, s.length) >= 3) best = Math.max(best, 0.82 * (Math.min(h.length, s.length) / Math.max(h.length, s.length)) + 0.12);
    const words = norm(name).split(' ').filter(Boolean);
    const overlap = words.filter((w) => hw.has(w)).length / Math.max(words.length, hw.size);
    best = Math.max(best, overlap * 0.75, similarity(h, s) >= 0.8 ? similarity(h, s) * 0.85 : 0);
  }
  return best;
}

const PHONE = (v: string) => /^(\+?91[\s-]?|0)?[6-9]\d{9}$/.test(v.replace(/[\s()-]/g, ''));
const EMAIL = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const GSTIN = (v: string) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(v.replace(/\s/g, ''));
export const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/(rs\.?|inr|₹|,|\s|\/-)/gi, '').replace(/%$/, '');
  return s && /^-?\d*\.?\d+$/.test(s) ? Number(s) : null;
};
const isDate = (v: unknown) => v instanceof Date || (typeof v === 'string' && /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(v.trim()));

/** 0–1: how well a column's values fit a field's kind. */
function valueScore(values: unknown[], f: FieldDef) {
  const vals = values.map((v) => (v instanceof Date ? v : String(v ?? '').trim())).filter((v) => v !== '');
  if (!vals.length) return 0;
  const share = (test: (v: unknown) => boolean) => vals.filter(test).length / vals.length;
  switch (f.kind) {
    case 'phone': return share((v) => PHONE(String(v)));
    case 'email': return share((v) => EMAIL(String(v)));
    case 'gstin': return share((v) => GSTIN(String(v)));
    case 'number': return share((v) => toNumber(v) !== null);
    case 'gst': return share((v) => { const n = toNumber(v); return n !== null && ([0, 0.25, 1.5, 3, 5, 12, 18, 28, 40].includes(n) || [0.05, 0.12, 0.18, 0.28].includes(n)); });
    case 'date': return share(isDate);
    case 'digits': return share((v) => /^\d{4,8}$/.test(String(v)));
    case 'code': return share((v) => /^[\w/-]{1,40}$/.test(String(v)));
    case 'json': return share((v) => /^\s*\[\s*\{/.test(String(v)));
    case 'usage': return share((v) => /^(sell|sale|retail|for sale|salon[_ ]?use|in[- _]?house|internal|consumable|own use|use)$/i.test(String(v).trim()));
    default: {
      // Names and categories are words, not numbers / phones / emails.
      return share((v) => typeof v === 'string' && /[a-z]/i.test(v) && !EMAIL(v) && !PHONE(v));
    }
  }
}
/** Kinds whose values are distinctive enough to map a column even when its name says nothing. */
const DISTINCT: Kind[] = ['phone', 'email', 'gstin'];

export interface ColumnPlan {
  index: number;
  header: string;
  samples: string[];
  /** Our field this column goes into, or '' to leave it out. */
  field: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
}

const sample = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim());

/** Decides, for each column, which field it is — each field used at most once, best matches first. */
export function planColumns(sheet: Sheet, target: ImportTarget): ColumnPlan[] {
  const fields = TARGETS[target].fields;
  const columnValues = sheet.headers.map((_, i) => sheet.rows.slice(0, 200).map((r) => r[i]));
  const candidates: { col: number; field: string; score: number }[] = [];
  sheet.headers.forEach((h, col) => {
    for (const f of fields) {
      const hs = headerScore(h, f);
      const vs = valueScore(columnValues[col], f);
      let score = hs > 0.3 ? hs * 0.7 + vs * 0.3 : DISTINCT.includes(f.kind) && vs >= 0.7 ? vs * 0.6 : 0;
      // A column named like a field but with clearly wrong values (e.g. "Contact" holding names) is less likely.
      if (hs > 0.3 && vs < 0.3 && f.kind !== 'text' && f.kind !== 'list') score *= 0.55;
      if (score >= 0.42) candidates.push({ col, field: f.key, score });
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  const byCol = new Map<number, { field: string; score: number }>();
  const used = new Set<string>();
  for (const c of candidates) {
    if (byCol.has(c.col) || used.has(c.field)) continue;
    byCol.set(c.col, c);
    used.add(c.field);
  }
  return sheet.headers.map((header, index) => {
    const m = byCol.get(index);
    const samples = columnValues[index].map(sample).filter(Boolean).slice(0, 3);
    return { index, header, samples, field: m?.field ?? '', confidence: !m ? 'none' : m.score >= 0.8 ? 'high' : m.score >= 0.6 ? 'medium' : 'low' };
  });
}

/** Tables of transactions and app internals — never products, customers, vendors, services or staff. */
const NOT_MASTER_DATA = /\b(order|orders|invoice|invoices|bill|bills|sale|sales|payment|payments|transaction|transactions|txn|log|logs|session|sessions|migration|migrations|cart|carts|token|tokens|audit|history|line|lines|detail|details|setting|settings|permission|permissions|role|roles|job|jobs|cache|password|failed|appointment|appointments|booking|bookings|attendance|membership|memberships)\b/;
/** Kinds that are themselves transactions or logs, allowed for tables named like that. */
const EVENT_TARGETS: ImportTarget[] = ['sales', 'appointments', 'attendance'];

/**
 * Which kind of records a sheet or table most likely holds, from its column names, values and
 * sheet / table / file name. `strict` (database dumps with many tables) returns null for tables
 * that don't clearly hold one kind, so they are left out unless chosen by hand.
 */
export function detectTarget(sheet: Sheet, fileName: string, allowed: ImportTarget[], strict = false): ImportTarget | null {
  let best: { t: ImportTarget; score: number } | null = null;
  const own = norm(sheet.name.replace(/[_-]+/g, ' '));
  const context = norm(`${sheet.name.replace(/[_-]+/g, ' ')} ${strict ? '' : fileName}`);
  if (!sheet.rows.length) return null;
  const eventTable = NOT_MASTER_DATA.test(own);
  for (const t of allowed) {
    // An "orders" table is never products; a "customers" table is never bills.
    if (strict && eventTable !== EVENT_TARGETS.includes(t)) continue;
    const plan = planColumns(sheet, t);
    const mapped = plan.filter((p) => p.field);
    const required = TARGETS[t].fields.filter((f) => f.required).every((f) => mapped.some((p) => p.field === f.key));
    let score = mapped.reduce((s, p) => s + (p.confidence === 'high' ? 1 : p.confidence === 'medium' ? 0.7 : 0.4), 0) + (required ? 2 : -3);
    const named = TARGETS[t].words.some((w) => context.includes(w));
    if (named) score += 2.5;
    // In-house supplies look like products; only call them that when the sheet says so.
    if (t === 'inhouse' && !named) score -= 2;
    // Prices and stock point to items; mobile numbers point to people.
    if (t === 'products' && mapped.some((p) => p.field === 'sellingPrice')) score += 1;
    if ((t === 'customers' || t === 'vendors') && mapped.some((p) => p.field === 'phone')) score += 1;
    if (!best || score > best.score) best = { t, score };
  }
  if (strict && (!best || best.score < 2)) return null;
  return best?.t ?? null;
}

// ── Building records ──
const GST_FIX: Record<number, number> = { 0.05: 5, 0.12: 12, 0.18: 18, 0.28: 28, 0.03: 3, 0.4: 40 };

function convert(v: unknown, kind: Kind): string | number | null {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return null;
  switch (kind) {
    case 'phone': {
      const d = String(v).replace(/\D/g, '');
      return d.length >= 10 ? d.slice(-10) : String(v).trim();
    }
    case 'email': return String(v).trim().toLowerCase();
    case 'gstin': return String(v).replace(/\s/g, '').toUpperCase();
    case 'number': return toNumber(v) ?? String(v).trim();
    case 'gst': {
      const n = toNumber(v);
      return n === null ? String(v).trim() : (GST_FIX[n] ?? n);
    }
    case 'digits': return String(v).replace(/\D/g, '');
    case 'code': return String(typeof v === 'number' ? Math.round(v) : v).trim();
    case 'json': return typeof v === 'string' ? v : JSON.stringify(v);
    case 'usage': return String(v).trim().toLowerCase();
    case 'date': {
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v).trim();
      const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/); // Indian style: DD-MM-YYYY
      if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return s;
    }
    default: return String(v instanceof Date ? v.toISOString().slice(0, 10) : v).trim();
  }
}

const IN_HOUSE_USE = /salon[_ ]?use|in[- _]?house|internal|consumable|own use|^use$|back ?bar/;

/**
 * Turns spreadsheet rows into records with our field names, ready to send to the server.
 * `inHouse`: the business keeps in-house stock (salons) — rows marked "salon use" become in-house products.
 */
export function buildRecords(sheet: Sheet, target: ImportTarget, plan: ColumnPlan[], opts: { inHouse?: boolean } = {}) {
  const fields = new Map(TARGETS[target].fields.map((f) => [f.key, f]));
  const used = plan.filter((p) => p.field && fields.has(p.field));
  /** Item codes some software reuses for different items (TG-AB-001 for three facewashes). */
  const codeOwner = new Map<string, string>();
  return sheet.rows.map((r) => {
    const rec: Record<string, string | number | boolean | null> = {};
    for (const p of used) rec[p.field] = convert(r[p.index], fields.get(p.field)!.kind);
    if (target === 'products' || target === 'inhouse') {
      // Each item needs its own code: a code already used by another item is dropped and Sahaasra makes a new one.
      const code = typeof rec.sku === 'string' ? rec.sku.toUpperCase() : '';
      const name = String(rec.name ?? '').trim().toLowerCase();
      if (code && codeOwner.has(code) && codeOwner.get(code) !== name) delete rec.sku;
      else if (code) codeOwner.set(code, name);
    }
    if (target === 'products') {
      const usage = rec.usage;
      delete rec.usage;
      if (opts.inHouse && typeof usage === 'string' && IN_HOUSE_USE.test(usage)) {
        rec.inHouse = true;
        rec.allowDecimalQty = true;
      }
    }
    // 2.5 kg of rice: items with part quantities are sold loose.
    if (target === 'products' && [rec.stock, rec.minStock].some((n) => typeof n === 'number' && n % 1 !== 0)) rec.allowDecimalQty = true;
    // In-house supplies: never sold, counted in any amount (450 ml left).
    if (target === 'inhouse') {
      rec.inHouse = true;
      rec.allowDecimalQty = true;
      rec.sellingPrice = 0;
      if (rec.category == null || rec.category === '') rec.category = 'In-house use';
    }
    return rec;
  });
}

export const missingRequired = (target: ImportTarget, plan: ColumnPlan[]) => TARGETS[target].fields.filter((f) => f.required && !plan.some((p) => p.field === f.key));
