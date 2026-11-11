import { useSyncExternalStore } from 'react';
import { toast } from '@/components/ui/toast';
import type { PrinterEncoding } from '@/lib/escpos/encoding';
import type { Density } from '@/lib/escpos/raster';
import type { ReceiptOptions } from '@/lib/escpos/receipt';
import { bytesToBase64, inNativeApp, nativeCall, NativeError, onNativeEvent, type NativeDevice } from './native';
import { chooseWebBleDevice, rememberedWebBleDevice, WebBleConnection, webBleSupported, type BtDevice } from './webBle';

/**
 * Bluetooth receipt printers saved on THIS device (phone, tablet or computer). Like the
 * computer printers, each device keeps its own list: Bluetooth addresses never leave the device.
 *
 *  - classic: Bluetooth Classic (SPP) through the SAHAASRA Android app — most handheld printers.
 *  - le:      Bluetooth Low Energy through the SAHAASRA Android app.
 *  - web-le:  Bluetooth Low Energy straight from Chrome (no app).
 */
export type BtProtocol = 'classic' | 'le' | 'web-le';

export interface SavedPrinter {
  id: string;
  name: string;
  protocol: BtProtocol;
  /** Android app: Bluetooth address. */
  address?: string;
  /** Chrome: the browser's id for the device. */
  webId?: string;
  paper: 58 | 80;
  /** Printable dots per line (58 mm: 384; 80 mm: 576, some models 512). */
  dots: number;
  /** text: fast and sharp, laid out from the Bill Studio design. image: an exact picture of the design. */
  style: 'text' | 'image';
  density: Density;
  encoding: PrinterEncoding;
  codes: 'image' | 'printer';
  cut: boolean;
  autoReconnect: boolean;
  /** Slower, acknowledged transfer for printers that skip lines. */
  safeMode: boolean;
  addedAt: string;
  /** Settings version (2 = exact-design style by default). */
  v?: number;
}

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'printing' | 'error';
export interface PrinterConn {
  state: ConnState;
  message?: string;
}

export const PROTOCOL_LABEL: Record<BtProtocol, string> = {
  classic: 'Bluetooth Classic (SPP)',
  le: 'Bluetooth LE',
  'web-le': 'Bluetooth LE (browser)',
};

export const DOTS_FOR: Record<58 | 80, number> = { 58: 384, 80: 576 };

const KEY = 'sahaasra:bt-printers';

/** Where Bluetooth printing works on this device. */
export type BluetoothMode = 'native' | 'web' | 'none';
export const bluetoothMode = (): BluetoothMode => (inNativeApp() ? 'native' : webBleSupported() ? 'web' : 'none');

/** Shows only the end of a Bluetooth address, e.g. "••:3F:A2". */
export const safeId = (p: SavedPrinter) => (p.address ? `••:${p.address.split(':').slice(-2).join(':')}` : p.webId ? `Browser device ${p.webId.slice(0, 6)}` : '');

export function receiptOptions(p: SavedPrinter): ReceiptOptions {
  return { paperDots: p.dots, encoding: p.encoding, density: p.density, codes: p.codes, cut: p.cut };
}

/* ───────────────────────── store ───────────────────────── */

function load(): SavedPrinter[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedPrinter[];
    if (!Array.isArray(raw)) return [];
    return (
      raw
        .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
        // Printers added before v2 used the text style; they now print the exact design too.
        .map((p) => (p.v === 2 ? p : { ...p, style: 'image' as const, v: 2 }))
    );
  } catch {
    return [];
  }
}

let printers: SavedPrinter[] = typeof window === 'undefined' ? [] : load();
let conns: Record<string, PrinterConn> = {};
let snapshot = { printers, conns };
const subs = new Set<() => void>();

function emit() {
  snapshot = { printers, conns };
  for (const s of subs) s();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(printers));
  } catch {
    /* private window: kept for this session */
  }
  emit();
}

function setConn(id: string, c: PrinterConn) {
  conns = { ...conns, [id]: c };
  emit();
}

export const getPrinters = () => printers;
export const getPrinter = (id: string) => printers.find((p) => p.id === id) ?? null;
export const connOf = (id: string): PrinterConn => conns[id] ?? { state: 'disconnected' };

export function useBluetoothPrinters() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => snapshot,
    () => snapshot,
  );
}

const baseSettings = (paper: 58 | 80 = 58) => ({
  paper,
  dots: DOTS_FOR[paper],
  // Prints exactly what Bill Studio shows (logo, fonts, layout).
  style: 'image' as const,
  v: 2,
  density: 'normal' as const,
  encoding: 'pc437' as const,
  codes: 'image' as const,
  cut: false,
  autoReconnect: true,
  safeMode: false,
});

export function updatePrinter(id: string, patch: Partial<SavedPrinter>) {
  printers = printers.map((p) => (p.id === id ? { ...p, ...patch, id: p.id, protocol: p.protocol, address: p.address, webId: p.webId } : p));
  persist();
}

export async function removePrinter(id: string) {
  await disconnectPrinter(id).catch(() => undefined);
  printers = printers.filter((p) => p.id !== id);
  const { [id]: _gone, ...rest } = conns;
  void _gone;
  conns = rest;
  persist();
}

/* ───────────────────────── connections ───────────────────────── */

const webConns = new Map<string, WebBleConnection>();
const webDevices = new Map<string, BtDevice>();
const connecting = new Map<string, Promise<void>>();
const userClosed = new Set<string>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export class NeedsTapError extends Error {}

function friendly(e: unknown) {
  if (e instanceof NativeError) {
    if (e.code === 'bluetooth-off') return 'Bluetooth is off. Turn it on and try again.';
    if (e.code === 'permission') return 'Allow “Nearby devices” for SAHAASRA to use Bluetooth printers.';
  }
  return e instanceof Error ? e.message : 'Could not reach the printer.';
}

/** The active native connection (the app keeps one printer connection at a time). */
let nativeActive: string | null = null;

let nativeWired = false;
function wireNative() {
  if (nativeWired || !inNativeApp()) return;
  nativeWired = true;
  onNativeEvent((e) => {
    if (e.event === 'connection') {
      const p = printers.find((x) => x.address === e.data.address && x.protocol !== 'web-le');
      if (!p) return;
      if (e.data.connected) {
        nativeActive = p.id;
        setConn(p.id, { state: 'connected' });
      } else {
        if (nativeActive === p.id) nativeActive = null;
        setConn(p.id, { state: 'disconnected', message: e.data.reason });
        scheduleReconnect(p.id);
      }
    } else if (e.event === 'bluetooth' && !e.data.enabled) {
      nativeActive = null;
      for (const p of printers) if (p.protocol !== 'web-le') setConn(p.id, { state: 'disconnected', message: 'Bluetooth is off' });
    } else if (e.event === 'bluetooth' && e.data.enabled) {
      for (const p of printers) if (p.protocol !== 'web-le') scheduleReconnect(p.id, 2000);
    }
  });
}

/** Message shown while a saved printer is off or out of range. */
const WAITING = 'Waiting for the printer — connects by itself when it is switched on';

/** One quick reconnect attempt soon after a printer drops out (the watcher keeps trying after that). */
function scheduleReconnect(id: string, delay = 3000) {
  const p = getPrinter(id);
  if (!p?.autoReconnect || userClosed.has(id)) return;
  clearTimeout(retryTimers.get(id));
  retryTimers.set(id, setTimeout(() => void tryReconnect(id), delay));
}

/** Printers the browser can no longer reach without a tap (Chrome after a page reload). */
const needsTap = new Set<string>();

async function tryReconnect(id: string) {
  const p = getPrinter(id);
  if (!p?.autoReconnect || userClosed.has(id) || needsTap.has(id) || connecting.has(id)) return;
  const c = connOf(id).state;
  if (c === 'connected' || c === 'printing' || c === 'connecting') return;
  const mode = bluetoothMode();
  if (p.protocol === 'web-le' ? mode === 'none' : mode !== 'native') return;
  // In the app only one printer is connected at a time; don't take the connection from another one.
  if (p.protocol !== 'web-le' && nativeActive && nativeActive !== id) return;
  try {
    await connectPrinter(id, { quiet: true });
  } catch (e) {
    if (e instanceof NeedsTapError) {
      needsTap.add(id);
      // Chrome only lets a website reconnect after a page reload once the user taps (its rule).
      toast(`Reconnect ${p.name}?`, {
        description: 'Chrome needs one tap after the page is reloaded. (The SAHAASRA Android app reconnects by itself.)',
        duration: 30000,
        action: {
          label: 'Reconnect',
          onClick: () => {
            reselectWebPrinter(id).then(
              () => toast.success(`${p.name} connected`),
              (err) => toast.error(err instanceof Error ? err.message : 'Could not connect.'),
            );
          },
        },
      });
    }
  }
}

let watcher: ReturnType<typeof setInterval> | null = null;

/**
 * Keeps saved printers connected: every few seconds a printer that is off or out of range is
 * tried again, so it reconnects by itself as soon as it is switched on. The printers chosen for
 * bills / KOT come first. A printer the user disconnected is left alone until Connect is tapped.
 */
export function startAutoReconnect(preferred: () => string[]) {
  if (watcher || typeof window === 'undefined') return;
  if (inNativeApp()) wireNative();
  const tick = () => {
    if (document.visibilityState === 'hidden' && !inNativeApp()) return;
    const order = [...new Set([...preferred(), ...printers.map((p) => p.id)])];
    // The app holds one Bluetooth connection: only the most important printer is kept connected.
    const candidates = order.map(getPrinter).filter((p): p is SavedPrinter => !!p && p.autoReconnect);
    const native = candidates.filter((p) => p.protocol !== 'web-le');
    const web = candidates.filter((p) => p.protocol === 'web-le');
    if (native[0] && !nativeActive) void tryReconnect(native[0].id);
    for (const p of web) void tryReconnect(p.id);
  };
  setTimeout(tick, 1500);
  // A Classic connect attempt to a switched-off printer takes ~15 s, so the app checks less often.
  watcher = setInterval(tick, inNativeApp() ? 20000 : 8000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

/**
 * Connects to a saved printer. Concurrent calls share one attempt (no duplicate connections),
 * and a printer is shown as connected only once the connection really works.
 */
export function connectPrinter(id: string, opts: { quiet?: boolean } = {}): Promise<void> {
  const existing = connecting.get(id);
  if (existing) return existing;
  const p = getPrinter(id);
  if (!p) return Promise.reject(new Error('This printer is no longer saved.'));
  userClosed.delete(id);
  if (!opts.quiet) needsTap.delete(id);
  const run = (async () => {
    // Background attempts don't flash "Connecting…" every few seconds.
    if (!opts.quiet) setConn(id, { state: 'connecting' });
    try {
      if (p.protocol === 'web-le') {
        let conn = webConns.get(id);
        if (!conn?.connected) {
          if (!conn) {
            const device = webDevices.get(id) ?? (p.webId ? await rememberedWebBleDevice(p.webId) : null);
            if (!device) throw new NeedsTapError('Tap Connect once to reconnect (the browser asks again after the page is reloaded).');
            webDevices.set(id, device);
            conn = new WebBleConnection(device);
            conn.onDisconnect = () => {
              setConn(id, { state: 'disconnected', message: WAITING });
              scheduleReconnect(id);
            };
            webConns.set(id, conn);
          }
          await conn.connect();
        }
      } else {
        wireNative();
        if (!inNativeApp()) throw new Error('Open SAHAASRA in the Android app to use this printer.');
        if (nativeActive && nativeActive !== id) setConn(nativeActive, { state: 'disconnected', message: 'Switched to another printer' });
        await nativeCall('connect', { address: p.address, protocol: p.protocol }, 30000);
        nativeActive = id;
      }
      setConn(id, { state: 'connected' });
    } catch (e) {
      if (e instanceof NeedsTapError) setConn(id, { state: 'disconnected', message: e.message });
      // A background attempt failing just means the printer is still off: keep waiting quietly.
      else if (opts.quiet) setConn(id, { state: 'disconnected', message: p.autoReconnect ? WAITING : 'Not connected' });
      else setConn(id, { state: 'error', message: friendly(e) });
      throw e instanceof NeedsTapError ? e : new Error(friendly(e));
    }
  })().finally(() => connecting.delete(id));
  connecting.set(id, run);
  return run;
}

export async function disconnectPrinter(id: string) {
  userClosed.add(id);
  clearTimeout(retryTimers.get(id));
  const p = getPrinter(id);
  if (!p) return;
  if (p.protocol === 'web-le') webConns.get(id)?.disconnect();
  else if (inNativeApp() && nativeActive === id) {
    await nativeCall('disconnect').catch(() => undefined);
    nativeActive = null;
  }
  setConn(id, { state: 'disconnected' });
}

async function isConnected(p: SavedPrinter) {
  if (p.protocol === 'web-le') return !!webConns.get(p.id)?.connected;
  if (!inNativeApp()) return false;
  const s = await nativeCall<{ connected: boolean; address?: string }>('status').catch(() => ({ connected: false, address: undefined }));
  return s.connected && s.address === p.address;
}

/**
 * Sends ready-made ESC/POS data to a printer, connecting first when needed.
 * Cancelling stops sending at once (lines already sent may still print).
 */
export async function sendToPrinter(id: string, data: Uint8Array, opts: { jobId: string; signal?: AbortSignal; onProgress?: (sent: number, total: number) => void }) {
  const p = getPrinter(id);
  if (!p) throw new Error('This printer is no longer saved. Choose a printer in Settings → Printer.');
  if (!(await isConnected(p))) await connectPrinter(id);
  setConn(id, { state: 'printing' });
  try {
    if (p.protocol === 'web-le') {
      const conn = webConns.get(id);
      if (!conn) throw new Error('The printer is not connected.');
      await conn.write(data, { safe: p.safeMode, signal: opts.signal, onProgress: (s) => opts.onProgress?.(s, data.length) });
    } else {
      const off = onNativeEvent((e) => {
        if (e.event === 'progress' && e.data.jobId === opts.jobId) opts.onProgress?.(e.data.sent, e.data.total);
      });
      const abort = () => void nativeCall('cancel', { jobId: opts.jobId }).catch(() => undefined);
      opts.signal?.addEventListener('abort', abort, { once: true });
      try {
        // About 2 KB/s is the slowest printers manage; allow for that plus connection time.
        await nativeCall('write', { jobId: opts.jobId, data: bytesToBase64(data), safe: p.safeMode }, 30000 + data.length / 2);
      } finally {
        off();
        opts.signal?.removeEventListener('abort', abort);
      }
    }
    setConn(id, { state: 'connected' });
  } catch (e) {
    const cancelled = opts.signal?.aborted || (e instanceof NativeError && e.code === 'cancelled') || (e instanceof DOMException && e.name === 'AbortError');
    const still = await isConnected(p).catch(() => false);
    setConn(id, still ? { state: 'connected' } : { state: 'error', message: cancelled ? 'Cancelled' : friendly(e) });
    if (cancelled) throw new DOMException('Cancelled', 'AbortError');
    throw new Error(friendly(e));
  }
}

/* ───────────────────────── adding printers ───────────────────────── */

/** Android app: makes sure Bluetooth permissions are granted and Bluetooth is on. */
export async function prepareNativeBluetooth() {
  wireNative();
  const info = await nativeCall<{ bluetooth: { supported: boolean; enabled: boolean }; permissions: boolean }>('info');
  if (!info.bluetooth.supported) throw new Error('This phone has no Bluetooth.');
  if (!info.permissions) {
    const r = await nativeCall<{ granted: boolean }>('permissions', {}, 120000);
    if (!r.granted) throw new Error('Allow “Nearby devices” (Bluetooth) for SAHAASRA in the phone’s settings to find printers.');
  }
  if (!info.bluetooth.enabled) {
    const r = await nativeCall<{ enabled: boolean }>('enableBluetooth', {}, 120000);
    if (!r.enabled) throw new Error('Turn on Bluetooth to use the printer.');
  }
}

export const nativePairedDevices = () => nativeCall<NativeDevice[]>('paired');
export const nativeScan = (seconds = 12) => nativeCall<NativeDevice[]>('scan', { seconds }, (seconds + 10) * 1000);
export const nativeStopScan = () => nativeCall('stopScan').catch(() => undefined);

function makeId(prefix: string, raw: string) {
  return `${prefix}:${raw}`;
}

/** Saves a printer found by the Android app and connects to it. */
export async function addNativePrinter(d: NativeDevice, protocol: 'classic' | 'le', paper: 58 | 80) {
  const id = makeId(protocol === 'classic' ? 'spp' : 'ble', d.address);
  if (!getPrinter(id)) {
    printers = [...printers, { id, name: d.name || 'Bluetooth printer', protocol, address: d.address, ...baseSettings(paper), addedAt: new Date().toISOString() }];
    persist();
  }
  await connectPrinter(id);
  return getPrinter(id)!;
}

/** Chrome: opens the browser's chooser, connects and saves the printer. Must be called from a tap. */
export async function addWebPrinter(paper: 58 | 80) {
  const device = await chooseWebBleDevice();
  const id = makeId('web', device.id);
  webDevices.set(id, device);
  if (!getPrinter(id)) {
    printers = [...printers, { id, name: device.name || 'Bluetooth printer', protocol: 'web-le', webId: device.id, ...baseSettings(paper), addedAt: new Date().toISOString() }];
    persist();
  }
  try {
    await connectPrinter(id);
  } catch (e) {
    // Not a BLE printer: don't keep it in the list.
    if (connOf(id).state === 'error' && !(e instanceof NeedsTapError)) {
      printers = printers.filter((p) => p.id !== id);
      persist();
    }
    throw e;
  }
  return getPrinter(id)!;
}

/** Chrome after a page reload: the user taps Connect and picks the same printer again. */
export async function reselectWebPrinter(id: string) {
  const device = await chooseWebBleDevice();
  const p = getPrinter(id);
  if (!p) return;
  webConns.get(id)?.disconnect();
  webConns.delete(id);
  webDevices.set(id, device);
  if (device.id !== p.webId) updatePrinter(id, { webId: device.id });
  await connectPrinter(id);
}
