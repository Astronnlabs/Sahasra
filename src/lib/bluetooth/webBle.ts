/**
 * Bluetooth Low Energy printing straight from Chrome (Android, Windows, Mac — no app needed).
 * Web Bluetooth can only reach BLE printers; printers that only speak Bluetooth Classic (SPP)
 * need the SAHAASRA Android app.
 */

/* Minimal Web Bluetooth types (not part of TypeScript's DOM library). */
interface BtCharacteristic {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?(v: BufferSource): Promise<void>;
  writeValueWithoutResponse?(v: BufferSource): Promise<void>;
  writeValue(v: BufferSource): Promise<void>;
}
interface BtService {
  uuid: string;
  getCharacteristics(): Promise<BtCharacteristic[]>;
}
interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryServices(): Promise<BtService[]>;
}
export interface BtDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BtServer;
}
interface BluetoothApi {
  getAvailability?(): Promise<boolean>;
  requestDevice(o: { acceptAllDevices?: boolean; filters?: unknown[]; optionalServices?: string[] }): Promise<BtDevice>;
  getDevices?(): Promise<BtDevice[]>;
}

const bt = () => (typeof navigator !== 'undefined' ? (navigator as unknown as { bluetooth?: BluetoothApi }).bluetooth : undefined);

/**
 * Printer services used by common BLE thermal printers. Web Bluetooth only lets a page use
 * services it names in advance; the writable characteristic is then found automatically.
 * (Services of "cat" label printers, which do not use ESC/POS, are deliberately not listed.)
 */
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ffb0-0000-1000-8000-00805f9b34fb',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
];

export const webBleSupported = () => !!bt();

/**
 * Whether Chrome remembers chosen printers across page reloads (getDevices). It is off by default
 * and turned on with chrome://flags/#enable-web-bluetooth-new-permissions-backend; with it,
 * printers reconnect by themselves after a refresh.
 */
export const webBleRemembers = () => typeof bt()?.getDevices === 'function';
export const CHROME_BT_FLAG = 'chrome://flags/#enable-web-bluetooth-new-permissions-backend';

export async function webBleAvailable() {
  const b = bt();
  if (!b) return false;
  try {
    return b.getAvailability ? await b.getAvailability() : true;
  } catch {
    return false;
  }
}

export class WebBleError extends Error {}

/** Opens Chrome's device chooser (must be called from a tap). */
export async function chooseWebBleDevice(): Promise<BtDevice> {
  const b = bt();
  if (!b) throw new WebBleError('This browser cannot use Bluetooth. Use Chrome, or the SAHAASRA Android app.');
  try {
    return await b.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') throw new WebBleError('No printer was chosen.');
    if (e instanceof DOMException && e.name === 'SecurityError') throw new WebBleError('Bluetooth is blocked for this site. Allow it in the browser’s site settings.');
    throw new WebBleError(e instanceof Error ? e.message : 'Bluetooth is not available.');
  }
}

/** A device chosen earlier, if the browser remembers it (Chrome keeps the permission per site). */
export async function rememberedWebBleDevice(id: string): Promise<BtDevice | null> {
  const b = bt();
  if (!b?.getDevices) return null;
  try {
    return (await b.getDevices()).find((d) => d.id === id) ?? null;
  } catch {
    return null;
  }
}

/** An open connection to a BLE printer. */
export class WebBleConnection {
  private char: BtCharacteristic | null = null;
  private closedByUs = false;
  onDisconnect: (() => void) | null = null;

  constructor(readonly device: BtDevice) {
    device.addEventListener('gattserverdisconnected', () => {
      this.char = null;
      if (!this.closedByUs) this.onDisconnect?.();
    });
  }

  get connected() {
    return !!this.char && !!this.device.gatt?.connected;
  }

  async connect() {
    if (this.connected) return;
    const gatt = this.device.gatt;
    if (!gatt) throw new WebBleError('This device does not support Bluetooth Low Energy.');
    this.closedByUs = false;
    let server: BtServer;
    try {
      server = await withTimeout(gatt.connect(), 15000, 'The printer did not answer. Check it is switched on and nearby.');
    } catch (e) {
      throw e instanceof WebBleError ? e : new WebBleError('Could not connect. Check the printer is switched on, nearby and not connected to another phone.');
    }
    let services: BtService[] = [];
    try {
      services = await server.getPrimaryServices();
    } catch {
      /* none of the printer services */
    }
    for (const s of services) {
      if (!PRINTER_SERVICES.includes(s.uuid)) continue;
      for (const c of await s.getCharacteristics().catch(() => [] as BtCharacteristic[])) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          this.char = c;
          return;
        }
      }
    }
    gatt.disconnect();
    throw new WebBleError(
      'This device has no Bluetooth LE printing service. It may be a Bluetooth Classic printer — use the SAHAASRA Android app to print to it.',
    );
  }

  /**
   * Sends data in small pieces. "safe" uses acknowledged writes of 20 bytes for printers that
   * drop data when sent faster.
   */
  async write(data: Uint8Array, opts: { safe: boolean; signal?: AbortSignal; onProgress?: (sent: number) => void }) {
    const c = this.char;
    if (!c || !this.connected) throw new WebBleError('The printer is not connected.');
    const noResponse = !opts.safe && c.properties.writeWithoutResponse && !!c.writeValueWithoutResponse;
    const chunk = opts.safe ? 20 : 180;
    for (let i = 0; i < data.length; i += chunk) {
      if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (!this.connected) throw new WebBleError('The printer disconnected while printing.');
      const part = data.slice(i, i + chunk);
      if (noResponse) await c.writeValueWithoutResponse!(part);
      else if (c.writeValueWithResponse && c.properties.write) await c.writeValueWithResponse(part);
      else await c.writeValue(part);
      // A short pause every few KB lets the printer's buffer drain.
      if (noResponse && i % 2048 < chunk) await new Promise((r) => setTimeout(r, 12));
      opts.onProgress?.(Math.min(i + chunk, data.length));
    }
  }

  disconnect() {
    this.closedByUs = true;
    this.char = null;
    this.device.gatt?.disconnect();
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new WebBleError(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
