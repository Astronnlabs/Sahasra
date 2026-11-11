import { useSyncExternalStore } from 'react';
import { inNativeApp } from '@/lib/bluetooth/native';
import { getPrinter, sendToPrinter, type BtProtocol } from '@/lib/bluetooth/printers';
import { printJobsService, type PrintJobRecord } from '@/services';

/**
 * Print queue and history for this device.
 *
 *  - Jobs print one at a time, in order, so two bills never mix on the printer.
 *  - Receipts are built on the device from data it already has, so printing works without
 *    internet; the history is sent to the server when the connection is back.
 *  - A job that was cut off while sending (app closed, phone switched off) is marked
 *    "interrupted" and is NEVER sent again by itself — it may have printed already.
 *    Printing it again is always the user's choice ("Print again").
 *  - The same bill can't be queued twice while it is still waiting or printing.
 */
export type PrintKind = 'bill' | 'kot' | 'test';
export type JobStatus = 'queued' | 'sending' | 'printed' | 'failed' | 'cancelled' | 'interrupted';
export type JobConnection = 'bluetooth-classic' | 'bluetooth-le' | 'windows';

export interface LocalPrintJob {
  id: string;
  kind: PrintKind;
  /** Invoice or KOT number (no customer details are kept). */
  reference: string;
  printerId?: string;
  printer: string;
  connection: JobConnection;
  device: string;
  copies: number;
  status: JobStatus;
  error?: string;
  reprint: boolean;
  createdAt: string;
  finishedAt?: string;
  /** The receipt as sent (base64), kept for the last few jobs so they can be printed again. */
  data?: string;
  synced: boolean;
}

export interface ActiveJob {
  id: string;
  reference: string;
  printer: string;
  sent: number;
  total: number;
}

const KEY = 'sahaasra:print-jobs';
const MAX_JOBS = 60;
const KEEP_DATA = 10;

export class DuplicateJobError extends Error {}

const connectionOf = (p: BtProtocol): JobConnection => (p === 'classic' ? 'bluetooth-classic' : 'bluetooth-le');

export const deviceLabel = () => {
  if (inNativeApp()) return 'Android app';
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'computer';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
};

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

function load(): LocalPrintJob[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as LocalPrintJob[];
    if (!Array.isArray(raw)) return [];
    // Jobs left unfinished by an earlier session: never resent automatically.
    return raw.map((j) =>
      j.status === 'sending' || j.status === 'queued'
        ? { ...j, status: 'interrupted' as const, error: 'The app was closed or reloaded while this was printing. Check the paper, then print again if needed.', finishedAt: j.finishedAt ?? new Date().toISOString(), synced: false }
        : j,
    );
  } catch {
    return [];
  }
}

let jobs: LocalPrintJob[] = typeof window === 'undefined' ? [] : load();
let active: ActiveJob | null = null;
let snap: { jobs: LocalPrintJob[]; active: ActiveJob | null } = { jobs, active };
const subs = new Set<() => void>();
const controllers = new Map<string, AbortController>();
let chain: Promise<unknown> = Promise.resolve();

function emit() {
  snap = { jobs, active };
  for (const s of subs) s();
}

function persist() {
  jobs = jobs.slice(0, MAX_JOBS).map((j, i) => (i >= KEEP_DATA && j.data ? { ...j, data: undefined } : j));
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs));
  } catch {
    // Storage full: drop the saved receipts, keep the history.
    jobs = jobs.map((j) => ({ ...j, data: undefined }));
    try {
      localStorage.setItem(KEY, JSON.stringify(jobs));
    } catch {
      /* private window */
    }
  }
  emit();
}

function patch(id: string, p: Partial<LocalPrintJob>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j));
  persist();
}

export function usePrintJobs() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => snap,
    () => snap,
  );
}

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Prints on a saved Bluetooth printer. `build` makes the receipt (ESC/POS) on this device.
 * Resolves with the finished job; rejects only for a duplicate request.
 */
export function printOnBluetooth(input: { kind: PrintKind; reference: string; printerId: string; copies: number; reprint?: boolean; build: () => Promise<Uint8Array> }): Promise<LocalPrintJob> {
  const printer = getPrinter(input.printerId);
  if (!printer) return Promise.reject(new Error('This Bluetooth printer is no longer saved. Choose a printer in Settings → Printer.'));
  if (jobs.some((j) => j.kind === input.kind && j.reference === input.reference && (j.status === 'queued' || j.status === 'sending'))) {
    return Promise.reject(new DuplicateJobError(`${input.reference} is already printing.`));
  }
  const job: LocalPrintJob = {
    id: uuid(),
    kind: input.kind,
    reference: input.reference,
    printerId: printer.id,
    printer: printer.name,
    connection: connectionOf(printer.protocol),
    device: deviceLabel(),
    copies: Math.min(Math.max(input.copies, 1), 5),
    status: 'queued',
    reprint: !!input.reprint,
    createdAt: new Date().toISOString(),
    synced: false,
  };
  jobs = [job, ...jobs];
  persist();
  const ctrl = new AbortController();
  controllers.set(job.id, ctrl);

  const run = async (): Promise<LocalPrintJob> => {
    if (ctrl.signal.aborted) return finish(job.id, { status: 'cancelled' });
    let bytes: Uint8Array;
    try {
      const one = await input.build();
      bytes = new Uint8Array(one.length * job.copies);
      for (let c = 0; c < job.copies; c++) bytes.set(one, c * one.length);
    } catch (e) {
      return finish(job.id, { status: 'failed', error: e instanceof Error ? `Could not prepare the receipt: ${e.message}` : 'Could not prepare the receipt.' });
    }
    if (ctrl.signal.aborted) return finish(job.id, { status: 'cancelled' });
    patch(job.id, { status: 'sending', data: toBase64(bytes) });
    active = { id: job.id, reference: job.reference, printer: job.printer, sent: 0, total: bytes.length };
    emit();
    try {
      await sendToPrinter(printer.id, bytes, {
        jobId: job.id,
        signal: ctrl.signal,
        onProgress: (sent, total) => {
          if (active?.id === job.id) {
            active = { ...active, sent, total };
            emit();
          }
        },
      });
      return finish(job.id, { status: 'printed' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return finish(job.id, { status: 'cancelled', error: 'Cancelled while printing — part of the receipt may have printed.' });
      return finish(job.id, { status: 'failed', error: e instanceof Error ? e.message : 'The printer did not print.' });
    } finally {
      if (active?.id === job.id) active = null;
      emit();
    }
  };
  const result = chain.then(run, run);
  chain = result.catch(() => undefined);
  return result;
}

function finish(id: string, p: Pick<LocalPrintJob, 'status'> & Partial<LocalPrintJob>) {
  controllers.delete(id);
  // Test prints stay on this device only.
  patch(id, { ...p, finishedAt: new Date().toISOString(), synced: jobs.find((j) => j.id === id)?.kind === 'test' });
  void syncPrintJobs();
  return jobs.find((j) => j.id === id)!;
}

/** Cancels a waiting or printing job. */
export function cancelPrintJob(id: string) {
  controllers.get(id)?.abort();
}

/** Prints a finished job again, exactly as it was sent (the user asked for it). */
export function printJobAgain(id: string) {
  const j = jobs.find((x) => x.id === id);
  if (!j?.data || !j.printerId) return Promise.reject(new Error('This receipt is no longer stored on this device. Print it again from the bill.'));
  const data = fromBase64(j.data);
  const perCopy = data.length / j.copies;
  return printOnBluetooth({ kind: j.kind, reference: j.reference, printerId: j.printerId, copies: 1, reprint: true, build: async () => (Number.isInteger(perCopy) ? data.slice(0, perCopy) : data) });
}

/** Records a print on a computer printer (Sahaasra Printer for Windows) in the history. */
export function logComputerPrint(input: { kind: PrintKind; reference: string; printer: string; copies: number; ok: boolean; error?: string }) {
  const now = new Date().toISOString();
  jobs = [
    { id: uuid(), kind: input.kind, reference: input.reference, printer: input.printer, connection: 'windows', device: deviceLabel(), copies: input.copies, status: input.ok ? 'printed' : 'failed', error: input.error, reprint: false, createdAt: now, finishedAt: now, synced: false },
    ...jobs,
  ];
  persist();
  void syncPrintJobs();
}

export function clearFinishedJobs() {
  jobs = jobs.filter((j) => j.status === 'queued' || j.status === 'sending' || !j.synced);
  persist();
}

/* ───────────── history sync (when online) ───────────── */

let syncing = false;
export async function syncPrintJobs() {
  if (syncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const todo = jobs.filter((j) => !j.synced && j.finishedAt && j.kind !== 'test').slice(0, 50);
  if (!todo.length) return;
  syncing = true;
  try {
    const records: PrintJobRecord[] = todo.map((j) => ({
      id: j.id,
      kind: j.kind as 'bill' | 'kot',
      reference: j.reference.slice(0, 40),
      printer: j.printer.slice(0, 80),
      connection: j.connection,
      device: j.device.slice(0, 60),
      copies: Math.min(j.copies, 5),
      status: j.status as PrintJobRecord['status'],
      error: j.error ? j.error.slice(0, 300) : null,
      reprint: j.reprint,
      createdAt: j.createdAt,
      finishedAt: j.finishedAt ?? null,
    }));
    await printJobsService.sync(records);
    const done = new Set(todo.map((j) => j.id));
    jobs = jobs.map((j) => (done.has(j.id) ? { ...j, synced: true } : j));
    persist();
  } catch {
    /* offline or signed out: tried again later */
  } finally {
    syncing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void syncPrintJobs());
  // Test prints are never sent to the server.
  jobs = jobs.map((j) => (j.kind === 'test' ? { ...j, synced: true } : j));
  if (jobs.some((j) => j.status === 'interrupted' && !j.synced)) persist();
  setTimeout(() => void syncPrintJobs(), 5000);
}
