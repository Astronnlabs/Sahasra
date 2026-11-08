'use strict';
// Sahasra Printer — a small Windows program for the shop computer.
// Double-click SahasraPrinter.exe once: it installs itself, runs hidden in the background
// and starts with Windows. Sahasra (in the browser) then lists this computer's printers,
// shows their status and prints bills and KOTs on them without a print dialog.
// It only listens on this computer (127.0.0.1) and only answers the Sahasra app.
const { execFile, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const VERSION = '1.1.1';
const PORT = 17777;
const isSea = (() => {
  try {
    return require('node:sea').isSea();
  } catch {
    return false;
  }
})();
const HOME = path.join(process.env.LOCALAPPDATA || os.homedir(), 'SahasraPrinter');
const INSTALLED_EXE = path.join(HOME, 'SahasraPrinter.exe');
const STARTUP_LINK = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Sahasra Printer.lnk');
/* global BUILD_ORIGINS */
const DEFAULT_ORIGINS = typeof BUILD_ORIGINS !== 'undefined' ? BUILD_ORIGINS : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4000', 'http://127.0.0.1:4000'];

// ── helpers ──
function run(file, args, timeout = 20000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
  });
}
const powershell = (command) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command]);
const log = (msg) => {
  const line = `${new Date().toISOString()}  ${msg}\n`;
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.appendFileSync(path.join(HOME, 'service.log'), line);
  } catch {
    /* logging must never stop printing */
  }
};

function config() {
  const file = path.join(HOME, 'config.json');
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { allowedOrigins: Array.from(new Set([...DEFAULT_ORIGINS, ...(Array.isArray(c.allowedOrigins) ? c.allowedOrigins : [])])) };
  } catch {
    return { allowedOrigins: DEFAULT_ORIGINS };
  }
}

/** SumatraPDF does the actual silent printing. Bundled inside the .exe. */
function sumatraPath() {
  if (!isSea) return path.join(__dirname, 'vendor', 'SumatraPDF.exe');
  const p = path.join(HOME, 'SumatraPDF.exe');
  if (!fs.existsSync(p)) {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(p, Buffer.from(require('node:sea').getAsset('sumatra')));
  }
  return p;
}

// ── printers ──
const ERROR_STATE = { 3: 'low-paper', 4: 'no-paper', 5: 'low-toner', 6: 'no-toner', 7: 'door-open', 8: 'jammed', 9: 'offline', 10: 'needs-service', 11: 'output-full' };
let cache = { at: 0, printers: [] };

async function listPrinters() {
  if (Date.now() - cache.at < 4000) return cache.printers;
  const out = await powershell('Get-CimInstance Win32_Printer | Select-Object Name,Default,PrinterStatus,WorkOffline,DetectedErrorState,PortName,DriverName | ConvertTo-Json -Compress');
  const rows = out.trim() ? [].concat(JSON.parse(out)) : [];
  const printers = rows.map((p) => {
    const problem = ERROR_STATE[p.DetectedErrorState];
    const offline = p.WorkOffline === true || p.PrinterStatus === 7 || problem === 'offline';
    const status = offline ? 'offline' : problem || (p.PrinterStatus === 4 ? 'printing' : 'ready');
    // "Print to PDF", OneNote, XPS and Fax save files instead of printing on paper.
    const virtual = /^(PORTPROMPT:|nul:|FILE:|XPSPort:|SHRFAX:)$/i.test(p.PortName || '') || /pdf|onenote|xps|fax/i.test(`${p.Name} ${p.DriverName}`);
    return { name: p.Name, isDefault: !!p.Default, status, virtual };
  });
  cache = { at: Date.now(), printers };
  return printers;
}

async function printFile(file, printer, copies, thermal) {
  const settings = `${thermal ? 'noscale' : 'fit'},${copies}x`;
  const target = printer ? ['-print-to', printer] : ['-print-to-default'];
  await run(sumatraPath(), [...target, '-print-settings', settings, '-silent', '-exit-on-print', file], 90000);
}

// ── web server ──
function send(res, code, body, origin) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
  res.writeHead(code, headers);
  res.end(JSON.stringify(body));
}

function readBody(req, max = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        reject(new Error('The bill is too large to print.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serve() {
  const { allowedOrigins } = config();
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    // Sahasra opened on this same computer (any port), or a hosted Sahasra address from the build/config.
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin || '');
    const allowed = origin && (local || allowedOrigins.includes(origin)) ? origin : null;
    if (req.method === 'OPTIONS') {
      if (!allowed) return send(res, 403, { error: 'Not allowed' });
      res.writeHead(204, {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        // Lets Sahasra hosted online (https) reach this computer.
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      });
      return res.end();
    }
    if (!allowed) return send(res, 403, { error: `This website (${origin || 'unknown'}) is not allowed to use the printer.` });
    try {
      if (req.method === 'GET' && req.url === '/status') {
        return send(res, 200, { ok: true, version: VERSION, computer: os.hostname(), printers: await listPrinters() }, allowed);
      }
      if (req.method === 'POST' && req.url === '/print') {
        const body = JSON.parse(await readBody(req));
        const printers = await listPrinters();
        const target = body.printer ? printers.find((p) => p.name === body.printer) : printers.find((p) => p.isDefault);
        if (!target) return send(res, 404, { error: body.printer ? `Printer "${body.printer}" is not connected to this computer.` : 'This computer has no default printer.' }, allowed);
        if (typeof body.pdf !== 'string' || !body.pdf.startsWith('JVBER')) return send(res, 400, { error: 'Nothing to print.' }, allowed);
        const file = path.join(os.tmpdir(), `sahasra-${crypto.randomBytes(6).toString('hex')}.pdf`);
        fs.writeFileSync(file, Buffer.from(body.pdf, 'base64'));
        try {
          await printFile(file, target.name, Math.min(Math.max(Number(body.copies) || 1, 1), 5), String(body.paper || '').startsWith('thermal'));
        } finally {
          fs.rm(file, { force: true }, () => {});
        }
        cache.at = 0;
        log(`Printed ${body.title || 'document'} on ${target.name}`);
        return send(res, 200, { ok: true, printer: target.name, status: target.status }, allowed);
      }
      send(res, 404, { error: 'Not found' }, allowed);
    } catch (e) {
      log(`Error: ${e && e.message}`);
      send(res, 500, { error: (e && e.message) || 'Printing failed.' }, allowed);
    }
  });
  server.on('error', (e) => {
    log(e.code === 'EADDRINUSE' ? 'Already running.' : `Server error: ${e.message}`);
    process.exit(e.code === 'EADDRINUSE' ? 0 : 1);
  });
  server.listen(PORT, '127.0.0.1', () => log(`Sahasra Printer ${VERSION} started.`));
}

// ── install / uninstall (double-click) ──
function message(text) {
  // PowerShell single-quoted string: only ' needs escaping; line breaks are joined back with [char]10.
  const lines = text.split('\n').map((l) => `'${l.replace(/'/g, "''")}'`).join(', ');
  return powershell(`Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show((@(${lines}) -join [char]10), 'Sahasra Printer')`).catch(() => {});
}

async function stopRunning() {
  await powershell(`Get-CimInstance Win32_Process -Filter "Name='SahasraPrinter.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`).catch(() => {});
}

async function install() {
  fs.mkdirSync(HOME, { recursive: true });
  await stopRunning();
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(INSTALLED_EXE).toLowerCase()) fs.copyFileSync(process.execPath, INSTALLED_EXE);
  sumatraPath();
  // Starts hidden (no window) now and every time Windows starts.
  const vbs = path.join(HOME, 'start.vbs');
  fs.writeFileSync(vbs, `CreateObject("WScript.Shell").Run """${INSTALLED_EXE}"" --service", 0, False\r\n`);
  await powershell(
    `$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${JSON.stringify(STARTUP_LINK)}); $s.TargetPath='wscript.exe'; $s.Arguments='"${vbs}"'; $s.WorkingDirectory=${JSON.stringify(HOME)}; $s.Save()`,
  );
  // Listed in Windows "Apps & features" so it can be removed like any other program.
  await powershell(
    `$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SahasraPrinter'; New-Item -Path $k -Force | Out-Null; ` +
      `Set-ItemProperty $k DisplayName 'Sahasra Printer'; Set-ItemProperty $k DisplayVersion '${VERSION}'; Set-ItemProperty $k Publisher 'Sahasra'; ` +
      `Set-ItemProperty $k DisplayIcon ${JSON.stringify(INSTALLED_EXE)}; Set-ItemProperty $k UninstallString '"${INSTALLED_EXE}" --uninstall'; Set-ItemProperty $k NoModify 1; Set-ItemProperty $k NoRepair 1`,
  ).catch(() => {});
  spawn('wscript.exe', [vbs], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  log(`Installed ${VERSION}.`);
  await message('Sahasra Printer is installed and running.\n\nOpen Sahasra → Settings → Printer to choose your printers.');
}

async function uninstall() {
  await stopRunning();
  fs.rmSync(STARTUP_LINK, { force: true });
  await powershell("Remove-Item 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SahasraPrinter' -Recurse -Force -ErrorAction SilentlyContinue").catch(() => {});
  await message('Sahasra Printer has been removed from this computer.');
  // A running program can't delete itself, so a short-lived helper removes the folder after we exit.
  spawn('cmd.exe', ['/c', `timeout /t 2 /nobreak >nul & rmdir /s /q "${HOME}"`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const arg = process.argv.slice(2).find((a) => a.startsWith('--')) || '';
if (arg === '--service' || (!isSea && arg !== '--install' && arg !== '--uninstall')) serve();
else if (arg === '--uninstall') uninstall();
else install().catch(async (e) => {
  log(`Install failed: ${e.message}`);
  await message(`Sahasra Printer could not be installed:\n${e.message}`);
});
