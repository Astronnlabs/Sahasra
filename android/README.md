# SAHAASRA for Android — Bluetooth receipt printing

The Android app opens the SAHAASRA website (`https://app.sahaasra.in`) in a secure WebView and adds
what a website cannot do on a phone: print on **Bluetooth thermal receipt printers** (58 mm and 80 mm),
save bills to Downloads, share them, and open Android's print dialog. Billing, data and logins stay
on the website — updates to the website reach the app straight away, with no new APK.

## How printing works

```
SAHAASRA website (React)                     ← the bill is built here, from the Bill Studio design
  │  ESC/POS bytes (text, logo, QR, barcode)   src/lib/escpos/*
  ▼
Printing bridge (this app, Kotlin)           ← only for https://app.sahaasra.in, main frame only
  │  Bluetooth Classic SPP  or  Bluetooth LE GATT
  ▼
ESC/POS thermal printer
```

| Where                      | Bluetooth Classic (SPP) | Bluetooth LE | Code |
|----------------------------|:-----------------------:|:------------:|------|
| SAHAASRA Android app       | ✅                      | ✅           | `PrinterLink.kt`, `NativeBridge.kt` |
| Chrome (Android / desktop) | ❌ (browsers can't)     | ✅           | `src/lib/bluetooth/webBle.ts` |
| iPhone / iPad              | ❌                      | ❌           | print window (AirPrint) or share PDF |

Most cheap handheld printers are Bluetooth Classic, so phones should use the app. The website picks the
right path by itself: Settings → Printer → *Bluetooth printers on this device*.

- **No manufacturer app, no added text.** Receipts contain only what the business designed in Bill Studio.
  Nothing is appended. *Limitation:* a few printers add text from their own firmware; that cannot be
  changed by any app — it can only be turned off with the maker's configuration tool (or by choosing
  another printer). Firmware is never modified by SAHAASRA.
- **Receipt styles.** *Text* (default) — fast and sharp, laid out from the Bill Studio design.
  *Exact design* — a picture of the Bill Studio design. Characters a printer's code page lacks
  (₹ → "Rs.", Hindi/Bengali/Tamil…) are printed as pictures, never as "?".
- **Default printer.** "Use for bills" makes it the bill printer for POS, auto-print after payment, and
  Sales. "Use for KOT" does the same for kitchen tickets. On a phone the first printer added becomes the
  bill printer automatically.
- **Queue and duplicates.** One job at a time. A job cut off mid-print (app closed, phone off) is marked
  *Interrupted* and is never resent automatically; "Print again" is always the user's choice. The same
  bill can't be queued twice. Printing never changes the sale — a failed print can always be repeated.
- **Offline.** Receipts are built on the phone from data already loaded, so a bill on screen prints
  without internet. Print history is uploaded when the connection returns (`POST /api/print-jobs/sync`).

## Security

- The bridge is added with `WebViewCompat.addWebMessageListener` restricted to `https://app.sahaasra.in`
  and checked again for main-frame + origin on every message — other sites (or iframes) never see it.
- Only a fixed list of operations is accepted; print data is limited to 2 MB, files to 25 MB; Bluetooth
  addresses are validated; file names are cleaned; shared files live in the app's cache only.
- Receipt text is passed through the encoder, which removes control bytes, so bill content
  (item names, notes) can never inject printer commands.
- No passwords, database details or keys are in the app. Logins use the website's normal session.
- Bluetooth addresses stay on the phone (browser storage). The server stores only print history:
  bill/KOT number, printer name, status — no customer details.
- Other links (WhatsApp, UPI, phone) open in their own apps; `intent:` links can't start this app's
  components. Camera, microphone and location requests are refused (not needed).

## Permissions

| Android | Permission | Why |
|---------|------------|-----|
| 12+ (API 31+) | Nearby devices (`BLUETOOTH_SCAN` with `neverForLocation`, `BLUETOOTH_CONNECT`) | find and connect printers |
| 7–11 | Bluetooth (automatic), Location (`ACCESS_FINE_LOCATION`) | Android requires location to search for Bluetooth devices. Location services must be on while searching; paired printers work without it. |

## Build

Requirements: JDK 17, Android SDK (platform 35, build-tools 35.0.0), Gradle 8.9 — or Android Studio.

**On the server (normal way):**
```bash
bash /srv/sahaasra/app/deploy/vps/build-android.sh
```
Installs the tools once, creates the signing key once in `/srv/sahaasra/shared/android/`
(**back it up** — Android only accepts updates signed with the same key), builds, verifies the
signature and publishes `https://app.sahaasra.in/downloads/android/SAHAASRA.apk`.
Run it after a deploy that changed `android/`. Website-only changes need no new APK.

**On a computer:** open the `android/` folder in Android Studio and run, or
`gradle assembleDebug` (debug-signed). For a release build set `SAHAASRA_SIGNING` to a properties file
with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

Versions: `versionCode` = number of git commits (set by the build script), `versionName` = `1.0.<count>`.

## Install on a phone

1. On the phone open `https://app.sahaasra.in/downloads/android/SAHAASRA.apk` (or Settings → Printer →
   *Download Android app*) and allow "Install unknown apps" for the browser when asked.
2. Open SAHAASRA, sign in, go to Settings → Printer → **Add printer**, allow *Nearby devices*.
3. Pick the printer (PIN is usually 0000 or 1234), then **Test print**. The ruler on the test page should
   reach the right edge; if not, change *Print width* in the printer's settings.

## Testing checklist

Verified during development: ESC/POS output for 58 mm (32 columns) and 80 mm (48 columns) bills and KOTs,
GST lines, wrapping of long item names, code page tables (PC437, PC858), and that control characters in
item names can't reach the printer. **Must be checked on real hardware before relying on it** (no printer
or phone was available while building this):

- [ ] Android 12, 13, 14, 15+ — permission prompt, search, connect, print
- [ ] Bluetooth Classic (SPP) printer — 58 mm and 80 mm
- [ ] BLE printer — in the app and in Chrome
- [ ] SRA588 — confirm whether it is Classic, BLE or both, its print width (384/576 dots) and whether
      its firmware adds any text (do not assume until tested)
- [ ] Printer switched off / out of range during a print → job *Failed*, no automatic reprint
- [ ] Bluetooth turned off → clear message, reconnects after turning on
- [ ] No internet → bill on screen still prints; history uploads later
- [ ] Long receipts (50+ items), logo, UPI QR, barcode, Hindi item names, "Exact design" style
- [ ] Duplicate protection: tap Print twice quickly → one receipt
