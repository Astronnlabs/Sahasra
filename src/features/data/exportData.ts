import { workspaceService } from '@/services';

/** The tables in a Sahasra export, in the order they appear in the workbook. */
export const EXPORT_DATASETS = [
  { key: 'products', label: 'Products' },
  { key: 'services', label: 'Services' },
  { key: 'customers', label: 'Customers' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'sales', label: 'Sales' },
  { key: 'saleItems', label: 'Sale items' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'purchaseItems', label: 'Purchase items' },
  { key: 'payments', label: 'Payments' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'employees', label: 'Staff' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'advances', label: 'Advances' },
  { key: 'stockMovements', label: 'Stock history' },
] as const;
export type DatasetKey = (typeof EXPORT_DATASETS)[number]['key'];

type Row = Record<string, unknown>;
/** Internal columns that mean nothing outside Sahasra. */
const HIDDEN = new Set(['tenantId', 'passwordHash', 'phoneKey']);

/** "sellingPrice" → "Selling Price": readable headers that also import back cleanly. */
export const humanize = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase()).replace(/\bId\b/g, 'ID').replace(/\bGstin\b/i, 'GSTIN').replace(/\bSku\b/i, 'SKU').replace(/\bHsn\b/i, 'HSN');

const cell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.every((x) => typeof x !== 'object') ? v.join(', ') : JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number | boolean;
};
const flat = (rows: Row[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => [humanize(k), cell(v)])));

/** Fetches the business's data and shapes it into one table per dataset (line items get their own table). */
export async function loadExportTables() {
  const data = await workspaceService.exportData();
  const list = (k: string) => (Array.isArray(data[k]) ? (data[k] as Row[]) : []);
  const withoutItems = (rows: Row[]) => rows.map(({ items: _i, ...r }) => (void _i, r));
  const itemsOf = (rows: Row[], ref: string) => rows.flatMap((r) => (Array.isArray(r.items) ? (r.items as Row[]).map((it) => ({ [ref]: r[ref] ?? r.billNo ?? r.id, ...it })) : []));
  const tables: Record<DatasetKey, Row[]> = {
    products: list('products'),
    services: list('services'),
    customers: list('customers'),
    vendors: list('vendors'),
    sales: withoutItems(list('sales')),
    saleItems: itemsOf(list('sales'), 'invoiceNo'),
    purchases: withoutItems(list('purchases')),
    purchaseItems: itemsOf(list('purchases'), 'billNo'),
    payments: list('payments'),
    expenses: list('expenses'),
    employees: list('employees'),
    attendance: list('attendance'),
    advances: list('advances'),
    stockMovements: list('stockMovements'),
  };
  return Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, flat(rows)])) as Record<DatasetKey, Row[]>;
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** One Excel workbook, one sheet per dataset. */
export async function downloadExcel() {
  const [XLSX, tables] = await Promise.all([import('xlsx'), loadExportTables()]);
  const wb = XLSX.utils.book_new();
  for (const d of EXPORT_DATASETS) {
    const rows = tables[d.key];
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['No records yet']]);
    XLSX.utils.book_append_sheet(wb, ws, d.label.slice(0, 31));
  }
  XLSX.writeFile(wb, `sahasra-data-${stamp()}.xlsx`, { compression: true });
}

/** One dataset as CSV (UTF-8 with BOM so Excel shows ₹ and Indian names correctly). */
export async function downloadCsv(key: DatasetKey) {
  const [XLSX, tables] = await Promise.all([import('xlsx'), loadExportTables()]);
  const rows = tables[key];
  const csv = rows.length ? XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)) : '';
  const label = EXPORT_DATASETS.find((d) => d.key === key)!.label.toLowerCase().replace(/\s+/g, '-');
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `sahasra-${label}-${stamp()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return rows.length;
}
