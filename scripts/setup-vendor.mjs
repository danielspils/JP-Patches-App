#!/usr/bin/env node
// Populate vendor/ for `npm run dist` / `npm run dist:win`:
//   - vendor/uv/uv  (or uv.exe on Windows)  — the uv binary, host platform
//   - vendor/jx3p/                          — the jx3p Python project
//
// Cross-platform replacement for the old setup-vendor.sh (bash + curl + rsync,
// macOS-only). Uses Node's built-in fetch + fs.cpSync + the host's `tar` /
// PowerShell so it runs unchanged on macOS and Windows. Both outputs are
// gitignored; run this once after `git clone`, or to refresh upstream.
//
// IMPORTANT: JX3P_SRC must be the danielspils/JP-Patches FORK (it carries the
// quiet-recording auto-boost, AUTO_BOOST_TARGET = 0.92, that the app relies on
// for decode). A clean bruceoberg/jx-3p-patches checkout will NOT decode quiet
// captures correctly. Override the location with JX3P_SRC=/path if needed.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const JX3P_SRC = process.env.JX3P_SRC || path.join(os.homedir(), 'JP-Patches');

// uv release asset per host platform/arch. The macOS/Linux tarballs wrap their
// binaries in a single top-level dir (stripped on extract); the Windows zip
// holds uv.exe / uvx.exe at the root.
const UV_BASE = 'https://github.com/astral-sh/uv/releases/latest/download';
const UV_ASSETS = {
  'darwin-arm64': { asset: 'uv-aarch64-apple-darwin.tar.gz',   kind: 'tar.gz', bin: 'uv' },
  'darwin-x64':   { asset: 'uv-x86_64-apple-darwin.tar.gz',    kind: 'tar.gz', bin: 'uv' },
  'win32-x64':    { asset: 'uv-x86_64-pc-windows-msvc.zip',    kind: 'zip',    bin: 'uv.exe' },
  'linux-x64':    { asset: 'uv-x86_64-unknown-linux-gnu.tar.gz', kind: 'tar.gz', bin: 'uv' },
};

const JX3P_EXCLUDE_DIRS = new Set([
  '.git', '.venv', '__pycache__', '.pytest_cache', '.mypy_cache', 'node_modules',
]);

async function download(url, destFile) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed (${res.status} ${res.statusText}): ${url}`);
  fs.writeFileSync(destFile, Buffer.from(await res.arrayBuffer()));
}

function extractTarGz(file, destDir) {
  // --strip-components=1 drops the uv-<triple>/ wrapper dir so the binary lands
  // directly at vendor/uv/uv. `tar` is present on macOS, Linux, and Win10+.
  execFileSync('tar', ['-xzf', file, '-C', destDir, '--strip-components=1'], { stdio: 'inherit' });
}

function extractZip(file, destDir) {
  // The Windows uv zip has no wrapper dir — uv.exe / uvx.exe land at destDir.
  execFileSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath ${JSON.stringify(file)} -DestinationPath ${JSON.stringify(destDir)} -Force`,
  ], { stdio: 'inherit' });
}

async function setupUv() {
  const key = `${process.platform}-${process.arch}`;
  const spec = UV_ASSETS[key];
  if (!spec) {
    throw new Error(`Unsupported host platform "${key}" — no uv asset mapped. ` +
      `Supported: ${Object.keys(UV_ASSETS).join(', ')}.`);
  }
  const uvDir = path.join(VENDOR, 'uv');
  fs.mkdirSync(uvDir, { recursive: true });
  const binPath = path.join(uvDir, spec.bin);
  if (fs.existsSync(binPath)) {
    console.log(`uv already present (${spec.bin}); skipping download.`);
    return;
  }
  console.log(`Downloading uv (${key}) ...`);
  const tmp = path.join(os.tmpdir(), `jp-uv-${process.pid}-${spec.asset}`);
  try {
    await download(`${UV_BASE}/${spec.asset}`, tmp);
    if (spec.kind === 'zip') extractZip(tmp, uvDir);
    else extractTarGz(tmp, uvDir);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
  if (!fs.existsSync(binPath)) {
    throw new Error(`uv extraction did not produce ${binPath}`);
  }
  if (process.platform !== 'win32') {
    try { fs.chmodSync(binPath, 0o755); } catch {}
  }
}

function setupJx3p() {
  if (!fs.existsSync(JX3P_SRC)) {
    throw new Error(
      `JX3P_SRC not found: ${JX3P_SRC}\n` +
      `Clone the danielspils/JP-Patches FORK there (NOT bruceoberg upstream — ` +
      `the fork carries AUTO_BOOST_TARGET=0.92, required for decode), or set ` +
      `JX3P_SRC=/path/to/your/clone.`
    );
  }
  const dest = path.join(VENDOR, 'jx3p');
  console.log(`Copying jx3p source from ${JX3P_SRC} ...`);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(JX3P_SRC, dest, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      if (JX3P_EXCLUDE_DIRS.has(base)) return false;
      if (base.endsWith('.pyc')) return false;
      return true;
    },
  });
}

async function main() {
  await setupUv();
  setupJx3p();
  console.log('vendor/ ready:');
  for (const sub of ['uv', 'jx3p']) {
    console.log(`  vendor/${sub} — ${fs.existsSync(path.join(VENDOR, sub)) ? 'ok' : 'MISSING'}`);
  }
}

main().catch((err) => {
  console.error('setup-vendor failed:', err.message);
  process.exit(1);
});
