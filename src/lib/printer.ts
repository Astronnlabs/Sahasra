import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/**
 * Printer setup for THIS computer (each counter has its own printer), kept in the browser.
 * When the Sahaasra printer service is installed on the computer, bills print straight to the
 * chosen printer; otherwise the browser's print window opens. Users never pick a "mode".
 */
/** What is being printed: customer bills, or kitchen order tickets (KOT). */
export type PrintJob = 'bill' | 'kot';

export interface JobPrinter {
  /** Printer name as Windows knows it ('' = the computer's default printer). */
  printer: string;
  copies: number;
  /** Bill: print as soon as a payment is confirmed. KOT: print as soon as it is sent to the kitchen. */
  auto: boolean;
}

export type PrinterSettings = Record<PrintJob, JobPrinter>;

const KEY = 'sahaasra:printer';
const EVENT = 'sahaasra:printer-settings';
const SERVICE_URL = 'http://127.0.0.1:17777';
export const SAHAASRA_PRINTER_DOWNLOAD = '/downloads/SahasraPrinter.exe';
const DEFAULTS: PrinterSettings = { bill: { printer: '', copies: 1, auto: false }, kot: { printer: '', copies: 1, auto: true } };

const clean = (j: Partial<JobPrinter> | undefined, d: JobPrinter): JobPrinter => ({
  printer: typeof j?.printer === 'string' ? j.printer : d.printer,
  copies: Math.min(Math.max(Number(j?.copies) || d.copies, 1), 3),
  auto: typeof j?.auto === 'boolean' ? j.auto : d.auto,
});

export function getPrinterSettings(): PrinterSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const s = JSON.parse(raw) as Partial<PrinterSettings> & { printer?: string; autoPrint?: boolean; copies?: number };
    // Earlier versions saved a single printer for bills.
    const bill = s.bill ?? (s.printer !== undefined || s.autoPrint !== undefined ? { printer: s.printer, copies: s.copies, auto: s.autoPrint } : undefined);
    return { bill: clean(bill, DEFAULTS.bill), kot: clean(s.kot, DEFAULTS.kot) };
  } catch {
    return DEFAULTS;
  }
}

export function savePrinterSettings(next: PrinterSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private window: settings last for this session only */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function usePrinterSettings() {
  const [settings, setSettings] = useState(getPrinterSettings);
  useEffect(() => {
    const sync = () => setSettings(getPrinterSettings());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return settings;
}

export type PrinterState = 'ready' | 'printing' | 'offline' | 'low-paper' | 'no-paper' | 'low-toner' | 'no-toner' | 'door-open' | 'jammed' | 'needs-service' | 'output-full';

export interface LocalPrinter {
  name: string;
  isDefault: boolean;
  status: PrinterState;
  /** Saves a file instead of printing on paper (Print to PDF, OneNote…). */
  virtual: boolean;
}

interface ServiceStatus {
  ok: true;
  printers: LocalPrinter[];
}

export const PRINTER_STATE_LABEL: Record<PrinterState, string> = {
  ready: 'Ready',
  printing: 'Printing',
  offline: 'Offline — check power and cable',
  'low-paper': 'Paper running low',
  'no-paper': 'Out of paper',
  'low-toner': 'Ink / toner low',
  'no-toner': 'Out of ink / toner',
  'door-open': 'Cover open',
  jammed: 'Paper jam',
  'needs-service': 'Needs attention',
  'output-full': 'Output tray full',
};
/** States where printing still works. */
export const isPrintable = (s: PrinterState) => s === 'ready' || s === 'printing' || s === 'low-paper' || s === 'low-toner';

/** Thrown when the computer has no printer service, so callers quietly use the print window. */
export class NoPrinterService extends Error {}

/** Phones and tablets: the Print Helper is a computer program, so they always use the print dialog. */
export const isMobileDevice = () =>
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

async function serviceFetch<T>(path: string, init?: RequestInit, timeoutMs = 3000): Promise<T> {
  if (isMobileDevice()) throw new NoPrinterService('Printer not connected');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${SERVICE_URL}${path}`, { ...init, signal: ctrl.signal });
  } catch {
    throw new NoPrinterService('Printer not connected');
  } finally {
    clearTimeout(t);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? 'The printer could not print this bill.');
  return data as T;
}

/** Printers on this computer, or throws NoPrinterService. */
export const localPrinters = () => serviceFetch<ServiceStatus>('/status').then((s) => s.printers);

/** Sends a PDF straight to the printer (no dialog). */
export async function printPdf(pdf: Blob, opts: { printer: string; copies: number; paper: string; title: string }) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read the bill.'));
    r.readAsDataURL(pdf);
  });
  return serviceFetch<{ ok: true; printer: string }>('/print', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...opts, pdf: base64 }) }, 60000);
}

export const PRINTER_STATUS_KEY = ['printer', 'status'];

export type PrinterLevel = 'unknown' | 'ok' | 'warn' | 'error';

/** How ready a printer is for a job: no service → unknown (print window is used). */
export function printerLevel(connected: boolean, printer: LocalPrinter | null): PrinterLevel {
  if (!connected) return 'unknown';
  if (!printer || !isPrintable(printer.status)) return 'error';
  // A "Print to PDF" style printer works, but nothing comes out on paper.
  return printer.virtual || printer.status === 'low-paper' || printer.status === 'low-toner' ? 'warn' : 'ok';
}

export function printerMessage(connected: boolean, printer: LocalPrinter | null, chosen: string) {
  if (!connected) return 'Uses the print window';
  if (!printer) return chosen ? `${chosen} — not connected` : 'No printer selected';
  return `${printer.name} — ${printer.virtual && isPrintable(printer.status) ? 'not a paper printer' : PRINTER_STATE_LABEL[printer.status]}`;
}

/** Live printer status for this computer (checked every 30 seconds). */
export function usePrinterStatus(job: PrintJob = 'bill') {
  const all = usePrinterSettings();
  const settings = all[job];
  const q = useQuery({
    queryKey: PRINTER_STATUS_KEY,
    // "null" = no printer service on this computer (bills use the print window).
    queryFn: () => localPrinters().catch((e) => (e instanceof NoPrinterService ? null : Promise.reject(e))),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 10_000,
  });
  const printers = q.data ?? [];
  const connected = q.data !== null && q.data !== undefined;
  const find = (name: string) => (connected ? (printers.find((p) => (name ? p.name === name : p.isDefault)) ?? null) : null);
  const printer = find(settings.printer);
  const level: PrinterLevel = q.isLoading ? 'unknown' : printerLevel(connected, printer);
  const message = q.isLoading ? 'Checking printer…' : printerMessage(connected, printer, settings.printer);
  return { all, settings, connected, printers, printer, find, level, message, refresh: q.refetch, isFetching: q.isFetching, isLoading: q.isLoading };
}
