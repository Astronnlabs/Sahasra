'use strict';
// Builds SahasraPrinter.exe — one file, no Node.js needed on the shop computer.
// Usage (from this folder):  npm run build
// Set SAHASRA_APP_ORIGINS="https://app.example.in" to allow your hosted Sahasra address.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const dist = path.join(dir, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(path.join(dir, 'vendor'), { recursive: true });

// SumatraPDF (GPLv3, https://www.sumatrapdfreader.org) prints PDFs silently; it is bundled in the .exe.
const sumatra = path.join(dir, 'vendor', 'SumatraPDF.exe');
if (!fs.existsSync(sumatra)) {
  const from = path.join(dir, 'node_modules', 'pdf-to-printer', 'dist', 'SumatraPDF-3.4.6-32.exe');
  if (!fs.existsSync(from)) throw new Error('Run "npm install" in print-helper first.');
  fs.copyFileSync(from, sumatra);
}

const origins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4000', 'http://127.0.0.1:4000', ...(process.env.SAHASRA_APP_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)];
fs.writeFileSync(path.join(dist, 'bundle.cjs'), `const BUILD_ORIGINS = ${JSON.stringify(origins)};\n${fs.readFileSync(path.join(dir, 'service.cjs'), 'utf8').replace(/^'use strict';/, '')}`);
fs.writeFileSync(
  path.join(dist, 'sea-config.json'),
  JSON.stringify({ main: path.join(dist, 'bundle.cjs'), output: path.join(dist, 'sea.blob'), disableExperimentalSEAWarning: true, useCodeCache: false, assets: { sumatra } }, null, 2),
);
execFileSync(process.execPath, ['--experimental-sea-config', path.join(dist, 'sea-config.json')], { stdio: 'inherit' });

const exe = path.join(dist, 'SahasraPrinter.exe');
fs.copyFileSync(process.execPath, exe);
execFileSync(process.execPath, [require.resolve('postject/dist/cli.js'), exe, 'NODE_SEA_BLOB', path.join(dist, 'sea.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit' });

// The web app offers it for download from Settings → Printer.
const publicCopy = path.join(dir, '..', 'public', 'downloads', 'SahasraPrinter.exe');
fs.mkdirSync(path.dirname(publicCopy), { recursive: true });
fs.copyFileSync(exe, publicCopy);
console.log(`Built ${exe} (${(fs.statSync(exe).size / 1048576).toFixed(1)} MB) and copied it to public/downloads.`);
