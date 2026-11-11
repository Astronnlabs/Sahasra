import { bluetoothIdOf, getPrinterSettings } from '@/lib/printer';
import { inNativeApp, installNativeDownloads, onNativeEvent } from './native';
import { startAutoReconnect } from './printers';

/**
 * Runs once when the app starts:
 *  - inside the Android app, file downloads and the print dialog go through the app;
 *  - the Bluetooth printer chosen for bills (or KOTs) reconnects by itself, so the first bill
 *    prints without waiting.
 */
export function startPrinting() {
  if (inNativeApp()) {
    installNativeDownloads();
    // Android's print dialog has closed: tidy up like a browser's "afterprint".
    onNativeEvent((e) => {
      if (e.event === 'print-finished') window.dispatchEvent(new Event('afterprint'));
    });
  }
  // Saved printers reconnect by themselves whenever they are switched on (bill printer first).
  startAutoReconnect(() => {
    const s = getPrinterSettings();
    return [bluetoothIdOf(s.bill.printer), bluetoothIdOf(s.kot.printer)].filter((x): x is string => !!x);
  });
}
