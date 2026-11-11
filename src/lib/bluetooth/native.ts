/**
 * Talks to the SAHAASRA Android app. The app shows this website and adds a native channel
 * (`SahaasraNative`) for Bluetooth printing, saving files and the system print dialog.
 * The channel is injected by Android only into pages from the app's own address
 * (https://app.sahaasra.in), only in the main frame, and only accepts the operations listed
 * in the app — it is never available to other websites.
 */
interface NativePort {
  postMessage(message: string): void;
  onmessage: ((e: { data: string }) => void) | null;
  addEventListener?(type: 'message', fn: (e: { data: string }) => void): void;
}

declare global {
  interface Window {
    SahaasraNative?: NativePort;
  }
}

export interface NativeDevice {
  /** Bluetooth address — kept on this phone only. */
  address: string;
  name: string;
  /** classic = Bluetooth Classic (SPP), le = Bluetooth Low Energy, dual = both. */
  type: 'classic' | 'le' | 'dual' | 'unknown';
  paired: boolean;
  /** Announces itself as a printer (imaging device class). */
  printer: boolean;
}

export interface NativeInfo {
  app: string;
  version: string;
  sdk: number;
  bluetooth: { supported: boolean; enabled: boolean };
  permissions: boolean;
}

export type NativeEvent =
  | { event: 'device-found'; data: NativeDevice }
  | { event: 'connection'; data: { address: string; connected: boolean; protocol?: string; reason?: string } }
  | { event: 'progress'; data: { jobId: string; sent: number; total: number } }
  | { event: 'bluetooth'; data: { enabled: boolean } }
  | { event: 'print-finished'; data: Record<string, never> };

export class NativeError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<number, Pending>();
const listeners = new Set<(e: NativeEvent) => void>();
let seq = 0;
let wired = false;

const port = () => (typeof window !== 'undefined' ? window.SahaasraNative : undefined);

/** True inside the SAHAASRA Android app. */
export const inNativeApp = () => !!port();

function wire() {
  const p = port();
  if (!p || wired) return;
  wired = true;
  const onMessage = (e: { data: string }) => {
    let msg: { id?: number; ok?: boolean; result?: unknown; error?: string; code?: string; event?: string; data?: unknown };
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (typeof msg.id === 'number') {
      const w = pending.get(msg.id);
      if (!w) return;
      pending.delete(msg.id);
      clearTimeout(w.timer);
      if (msg.ok) w.resolve(msg.result);
      else w.reject(new NativeError(msg.error || 'The printer app reported an error.', msg.code || 'error'));
    } else if (msg.event) {
      for (const l of listeners) l(msg as NativeEvent);
    }
  };
  if (p.addEventListener) p.addEventListener('message', onMessage);
  else p.onmessage = onMessage;
}

/** Calls an operation in the Android app. */
export function nativeCall<T>(op: string, args: Record<string, unknown> = {}, timeoutMs = 20000): Promise<T> {
  const p = port();
  if (!p) return Promise.reject(new NativeError('Open SAHAASRA in the Android app to use this.', 'no-app'));
  wire();
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new NativeError('The printer app did not answer in time.', 'timeout'));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    p.postMessage(JSON.stringify({ id, op, args }));
  });
}

export function onNativeEvent(fn: (e: NativeEvent) => void) {
  wire();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function bytesToBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function blobToBase64(blob: Blob) {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

/** Saves a file to the phone's Downloads folder (the app has no browser download manager). */
export async function nativeSaveFile(blob: Blob, name: string) {
  return nativeCall<{ saved: boolean; location: string }>('saveFile', { name, mime: blob.type || 'application/octet-stream', data: await blobToBase64(blob) }, 60000);
}

/** Opens Android's share sheet with the file (WhatsApp, email, Drive…). */
export async function nativeShareFile(blob: Blob, name: string, text = '') {
  return nativeCall<{ shared: boolean }>('shareFile', { name, mime: blob.type || 'application/octet-stream', data: await blobToBase64(blob), text }, 60000);
}

/** Opens Android's print dialog for the current page (window.print() does nothing inside an app). */
export const nativeSystemPrint = (title: string) => nativeCall<{ started: boolean }>('systemPrint', { title });

/**
 * Inside the app, files the website "downloads" (PDFs, Excel exports) are handed to the app,
 * which saves them in Downloads. Installed once at start-up; does nothing in a normal browser.
 */
export function installNativeDownloads() {
  if (!inNativeApp() || (window as unknown as { __sahaasraDl?: boolean }).__sahaasraDl) return;
  (window as unknown as { __sahaasraDl?: boolean }).__sahaasraDl = true;
  const handle = (a: HTMLAnchorElement) => {
    const href = a.href;
    if (!a.hasAttribute('download') || !(href.startsWith('blob:') || href.startsWith('data:'))) return false;
    const name = a.getAttribute('download') || 'download';
    void (async () => {
      try {
        const blob = await (await fetch(href)).blob();
        await nativeSaveFile(blob, name);
      } catch {
        /* the app shows its own message when saving fails */
      }
    })();
    return true;
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (!handle(this)) click.call(this);
  };
  const dispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (this: HTMLAnchorElement, ev: Event) {
    if (ev.type === 'click' && handle(this)) return false;
    return dispatch.call(this, ev);
  };
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a');
      if (a && handle(a as HTMLAnchorElement)) e.preventDefault();
    },
    true,
  );
}
