const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Pin the userData directory name to "jp-patches" (lowercase) so dev runs
// (`npm start`) and packaged DMG builds always share the same library.json.
// The shipped v0.5.9 DMG already writes to ~/Library/Application Support/
// jp-patches/, so we keep that path canonical going forward. Without this
// call, modern Electron in dev mode resolves to "JP Patches" (productName,
// with space) — a different directory, a different library — while older
// packaged builds remain on lowercase. Must be called before any
// app.getPath('userData') lookup.
app.setName('jp-patches');

const REPO_URL     = 'https://github.com/danielspils/JP-Patches-App';

// When the app is packaged into a .dmg, vendor/jx3p and vendor/uv/uv are
// copied into Contents/Resources/ via electron-builder extraResources. In dev
// (npm start), fall back to the user's local clone of Bruce's tool at
// ~/JP-Patches/ and the system `uv` on PATH.
const JX3P_REPO = app.isPackaged
  ? path.join(process.resourcesPath, 'jx3p')
  : path.join(os.homedir(), 'JP-Patches');
const UV_BIN = app.isPackaged
  ? path.join(process.resourcesPath, 'uv', 'uv')
  : 'uv';

const PATCHES_PATH   = path.join(os.homedir(), 'Desktop', 'patches.json');
const PANEL_SVG_PATH = path.join(__dirname, 'renderer', 'panel.svg');

// Window base size matches the locked panel SVG's design dimensions.
// Zoom presets scale both the renderer content and the window itself
// proportionally so the panel never gets clipped.
const BASE_WIDTH  = 1140;
const BASE_HEIGHT = 710;

// First-run seed data — bundled with the app so a brand-new user lands on
// "Spils Sounds" in the active C/D banks and sees "Spils Sounds" + "Spils
// Sequence" in the Library, instead of an empty state. Only used when the
// user's own files don't exist yet; once they make their first change, the
// app writes their library.json to userData and the seed is no longer read.
const SEED_PATCHES_PATH = path.join(__dirname, 'renderer', 'seed', 'patches.json');
const SEED_LIBRARY_PATH = path.join(__dirname, 'renderer', 'seed', 'library.json');

function getLibraryPath() {
  return path.join(app.getPath('userData'), 'library.json');
}

function readJsonOrNull(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// Suggest a filesystem-safe .wav filename for the Save WAV dialog. If the
// renderer passed a human name (e.g., a library package title), slugify it
// (spaces → dashes, strip anything outside [A-Za-z0-9-]); otherwise fall
// back to the supplied default base. Always appends .wav.
function slugForWav(name, defaultBase) {
  const base = (typeof name === 'string' && name.trim())
    ? name.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-]/g, '')
    : defaultBase;
  return `${base || defaultBase}.wav`;
}

// Read the user's last-chosen zoom factor from library.json. Clamped to
// [0.5, 2.0]; falls back to 1.0 (Actual Size) if unset or out of range.
function readZoomPref() {
  const lib = readJsonOrNull(getLibraryPath());
  const z = lib && typeof lib.zoomFactor === 'number' ? lib.zoomFactor : 1.0;
  return z >= 0.5 && z <= 2.0 ? z : 1.0;
}

// Apply a zoom factor: scale both renderer content AND the window itself,
// so the locked panel SVG stays fully visible at any preset. Also updates
// minimum-size constraints to match — Electron blocks programmatic resize
// below minimumSize, so it has to move in lockstep with the window.
function applyZoomToWindow(win, factor) {
  if (!win) return;
  const w = Math.round(BASE_WIDTH  * factor);
  const h = Math.round(BASE_HEIGHT * factor);
  win.setMinimumSize(w, h);
  win.setContentSize(w, h);
  if (win.webContents) win.webContents.setZoomFactor(factor);
}

// Menu-driven zoom: apply to the focused window AND notify the renderer
// so it can persist the new value into library.json for the next launch.
function setZoomFromMenu(factor) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) return;
  applyZoomToWindow(win, factor);
  if (win.webContents) win.webContents.send('zoom-changed', factor);
}

// Helper: call a webContents method on the focused window's contents.
// Used for Edit menu items so we don't go through Electron `role:` strings
// (those map to NSMenuItem selectors like `cut:` / `paste:`, which macOS
// uses as a signal to auto-inject Writing Tools / AutoFill / Start
// Dictation / Emoji & Symbols into our Edit menu).
function focusedWebContentsAction(method) {
  const win = BrowserWindow.getFocusedWindow();
  if (win && win.webContents && typeof win.webContents[method] === 'function') {
    win.webContents[method]();
  }
}

// v0.7.0: button-sound + tape-dump-sound state vars retained only for
// the *-initial IPC handlers below — the renderer's Audio Settings
// modal still pushes setButtonSoundsInitial / setTapeDumpSoundsInitial
// on toggle. No menu items consume the state anymore (moved to the
// gear modal); leaving the IPC plumbing in place means re-adding a
// menu item later requires zero handshake rewiring.
let buttonSoundsChecked = true;
let tapeDumpSoundsChecked = false;

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  // Explicit submenus for Edit and View — using `role: 'editMenu'` or
  // `role: 'viewMenu'` would let macOS auto-inject items that have no
  // meaning in this app (Substitutions, Speech, Writing Tools, AutoFill,
  // Start Dictation, Emoji & Symbols on Edit; Force Reload, Zoom In/Out,
  // Actual Size on View). We list only the items that actually do
  // something in JP Patches.
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates({ manual: true }),
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { role: 'close' },  // Cmd+W — closes the window (app stays in dock)
      ],
    },
    {
      // Cut/Copy/Paste/Select All work in text fields (patch name editing,
      // custom-library name field, sequence notes textarea). We bind these
      // via manual click handlers instead of Electron's `role:` strings so
      // macOS doesn't recognize this as a "system text-editing menu" and
      // auto-inject Writing Tools / AutoFill / Start Dictation / Emoji &
      // Symbols underneath. Undo/Redo are intentionally omitted — they
      // would only undo text edits, not knob twists or patch loads.
      label: 'Edit',
      submenu: [
        { label: 'Cut',        accelerator: 'CmdOrCtrl+X', click: () => focusedWebContentsAction('cut') },
        { label: 'Copy',       accelerator: 'CmdOrCtrl+C', click: () => focusedWebContentsAction('copy') },
        { label: 'Paste',      accelerator: 'CmdOrCtrl+V', click: () => focusedWebContentsAction('paste') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => focusedWebContentsAction('selectAll') },
      ],
    },
    {
      // Reload + DevTools for development; zoom presets for fitting the
      // app on smaller screens; Fullscreen for end users (also bound to
      // the green traffic-light button and Cmd+Ctrl+F).
      // Only 75% / 100% for now — larger presets (125 / 150 / 200%) wait
      // on the broader Adaptive Sizing work (see docs/future-features.md).
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => setZoomFromMenu(1.0)  },
        { label: '75%',         accelerator: 'CmdOrCtrl+-', click: () => setZoomFromMenu(0.75) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // v0.7.0: "Button && switch sounds" + "Tape dump sounds"
        // checkboxes moved to the Audio Settings modal (gear icon in
        // the panel's red header strip). The renderer-side IPC plumbing
        // for those (state vars + setters above, plus the *Initial /
        // *Changed channels) stays as harmless dead code — the modal
        // still calls setTapeDumpSoundsInitial/setButtonSoundsInitial
        // on toggle for forward-compat (no-op today; would re-light a
        // menu checkbox if we ever bring one back).
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'JP Patches on GitHub',
          click: () => shell.openExternal(REPO_URL),
        },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates({ manual: true }),
        },
        // v0.7.1: "Audio Diagnostics…" menu item removed. Canary status
        // (the macOS-label-regression check) is now inline in the gear-
        // icon Audio Settings modal. The IPC handler in app.js stays
        // (harmless dead code) in case we ever bring this back.
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  // Start at the user's last-saved zoom factor so the window opens at
  // the right physical size (no flash of 100% before resizing down).
  const zoom = readZoomPref();
  const w = Math.round(BASE_WIDTH  * zoom);
  const h = Math.round(BASE_HEIGHT * zoom);
  const win = new BrowserWindow({
    width:  w,
    height: h,
    minWidth:  w,
    minHeight: h,
    // Drag-to-resize stays disabled — the locked SVG panel artwork was
    // sized for 1140×710 — but the green ⛶ traffic-light button can
    // now toggle macOS fullscreen so the app fills the user's display
    // on larger monitors. Cmd+Ctrl+F also works. View > 75% scales both
    // the renderer and the window proportionally for smaller screens.
    resizable: false,
    fullscreenable: true,
    maximizable: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Apply the renderer-side zoomFactor once content is ready, otherwise
  // the panel SVG would render at 100% inside a 75%-sized window.
  win.webContents.once('did-finish-load', () => {
    if (zoom !== 1.0) win.webContents.setZoomFactor(zoom);
  });
  win.loadFile('renderer/index.html');
}

// ── Auto-update (electron-updater + GitHub Releases) ─────────────
// Industry-standard macOS flow: on launch, silently check GitHub for a
// newer release and download it in the background; when the download is
// ready, prompt the user to restart now or later. The "Check for
// Updates…" menu items run the same check but with visible feedback
// (up-to-date / error). Updates only work in the packaged, signed app;
// in dev (npm start) the calls no-op (or explain, for a manual check).
let manualUpdateCheck = false;

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-not-available', () => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: 'info',
      message: 'You’re up to date',
      detail: `JP Patches ${app.getVersion()} is the latest version.`,
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: 'info',
      message: 'Update ready to install',
      detail: `JP Patches ${info && info.version ? info.version : ''} has been `
        + 'downloaded. Restart now to finish updating?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    // Background errors (offline, rate-limited, etc.) stay silent so we
    // never nag. Surface only when the user explicitly asked.
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: 'error',
      message: 'Update check failed',
      detail: String((err && err.message) || err),
      buttons: ['OK'],
    });
  });
}

function checkForUpdates({ manual = false } = {}) {
  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox({
        type: 'info',
        message: 'Updates unavailable in development',
        detail: 'Auto-update only works in the installed (packaged) app.',
        buttons: ['OK'],
      });
    }
    return;
  }
  manualUpdateCheck = manual;
  autoUpdater.checkForUpdates().catch(() => { /* surfaced via the error handler */ });
}

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();
  setupAutoUpdater();
  checkForUpdates();   // silent background check on launch
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Renderer reports its saved button-sound preference on launch so the View
// menu checkbox matches library.json (the menu is built before the renderer
// has loaded the library).
ipcMain.on('button-sounds-initial', (_e, enabled) => {
  buttonSoundsChecked = !!enabled;
  const menu = Menu.getApplicationMenu();
  const item = menu && menu.getMenuItemById('button-sounds');
  if (item) item.checked = buttonSoundsChecked;
});

// Same launch-time sync for the tape-dump-sounds checkbox.
ipcMain.on('tape-dump-sounds-initial', (_e, enabled) => {
  tapeDumpSoundsChecked = !!enabled;
  const menu = Menu.getApplicationMenu();
  const item = menu && menu.getMenuItemById('tape-dump-sounds');
  if (item) item.checked = tapeDumpSoundsChecked;
});

// Renderer-readable app + OS metadata for diagnostic bug-report URLs.
// Currently only the Audio Diagnostics "Report this bug" flow uses this;
// kept generic so other diagnostic surfaces can reuse. Darwin kernel
// version (os.release()) is what gets reported — more accurate than
// navigator.userAgent which is capped at "Mac OS X 10_15_7" since
// Catalina (Chromium pins it for compat).
ipcMain.handle('get-app-info', () => {
  return {
    appVersion: app.getVersion(),
    platform: process.platform,                          // 'darwin' on Mac
    macOsRelease: process.platform === 'darwin' ? os.release() : null,
  };
});

// Open an external URL in the user's default browser. Hardlocked to the
// danielspils/JP-Patches-App repo on github.com + the jx-3p.com site so
// a renderer-side bug can't be turned into "open arbitrary URLs" (e.g.
// file://, javascript:, phishing). Callers: Audio Diagnostics "Report
// this bug" (GitHub) and the lending-library modal's "explore more"
// (jx-3p.com).
ipcMain.handle('open-external', async (_e, url) => {
  if (typeof url !== 'string') return { ok: false, reason: 'not-a-string' };
  const allowed =
    url.startsWith('https://github.com/danielspils/JP-Patches-App/') ||
    url.startsWith('https://jx-3p.com/');
  if (!allowed) {
    return { ok: false, reason: 'not-allowlisted' };
  }
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || 'open-failed' };
  }
});

// ── User lending library (community) ─────────────────────────────────
// The app's only outbound network surface besides auto-update. Both
// handlers are hardlocked to https://jx-3p.com/ — the manifest URL is a
// constant and download URLs are validated against the origin, so a
// renderer-side bug can't turn these into arbitrary fetchers. Network
// lives main-side on purpose: the renderer stays network-free (no CSP
// connect-src widening) and the IPC shape matches every other handler.
const LENDING_ORIGIN = 'https://jx-3p.com/';
const LENDING_MANIFEST_URL = 'https://jx-3p.com/library/index.json';
// The lending relay (relay/ in this repo — a Cloudflare Worker that
// files lending submissions as GitHub issues so users need no GitHub
// account). lend.jx-3p.com is the custom-domain route; if the Worker
// is deployed on its *.workers.dev URL instead, update this constant
// (see relay/README.md). The renderer falls back to the clipboard +
// GitHub-form flow whenever this endpoint is unreachable.
const LENDING_RELAY_URL = 'https://lend.jx-3p.com/lend';
const LENDING_FETCH_TIMEOUT_MS = 10000;
const LENDING_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;  // payloads are ~15-35KB; 5MB = generous ceiling

async function lendingFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LENDING_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > LENDING_MAX_PAYLOAD_BYTES) throw new Error('payload too large');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// Fetch + parse the lending-library manifest. Returns {ok, manifest} or
// {ok: false, error} — renderer decides whether to fall back to its
// cached copy in library.json.
ipcMain.handle('community-fetch-manifest', async () => {
  try {
    const manifest = JSON.parse(await lendingFetch(LENDING_MANIFEST_URL));
    if (!manifest || !Array.isArray(manifest.patches) || !Array.isArray(manifest.sequences)) {
      return { ok: false, error: 'manifest shape invalid' };
    }
    return { ok: true, manifest };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'fetch failed' };
  }
});

// Download one lending-library payload to a temp .json file and return
// the path. The renderer then routes the path through the SAME import
// handlers as drag-and-drop (handleTonesDropImport /
// handleSequenceDropImport) — so schema handling, name restoration via
// _slotMeta/_sequenceMeta, and misroute detection all come for free.
// The temp file is named after the entry (sanitized) because the import
// path derives the new library entry's display label from the filename.
ipcMain.handle('community-download-to-temp', async (_e, url, displayName, entryId) => {
  if (typeof url !== 'string' || !url.startsWith(LENDING_ORIGIN)) {
    return { ok: false, error: 'url not allowlisted' };
  }
  try {
    const text = await lendingFetch(url);
    // Count the borrow (fire-and-forget — decorative data). Same
    // endpoint the site uses, so the tally combines both surfaces;
    // the relay dedupes one-per-IP-per-entry.
    if (typeof entryId === 'string' && /^[a-z0-9-]{1,64}$/.test(entryId)) {
      fetch('https://lend.jx-3p.com/borrow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: entryId }),
      }).catch(() => {});
    }
    JSON.parse(text);  // validate before writing — garbage never reaches the import path
    // sanitizeWavFilename APPENDS .wav (it's the WAV-export helper) —
    // strip it back off or the borrowed entry's label reads
    // "Spils Sounds.wav" (temp file "….wav.json" → labelFromPath only
    // removes the outer extension). Daniel hit this 2026-06-10.
    const base = sanitizeWavFilename(String(displayName || 'borrowed'))
      .replace(/\.wav$/i, '') || 'borrowed';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp_lend_'));
    const filePath = path.join(dir, `${base}.json`);
    fs.writeFileSync(filePath, text, 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'download failed' };
  }
});

// Submit a lending request through the relay (relay/worker.js → GitHub
// issue). Body is validated server-side too; this handler just ferries
// it and shapes errors. A non-ok result (relay not deployed, offline,
// 4xx/5xx) makes the renderer fall back to the clipboard + GitHub-form
// flow — the relay being down never blocks lending entirely.
ipcMain.handle('community-lend', async (_e, submission) => {
  if (!submission || typeof submission !== 'object') {
    return { ok: false, error: 'invalid submission' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LENDING_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(LENDING_RELAY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submission),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      return {
        ok: false,
        code: (data && data.code) || null,
        error: (data && data.error) || `relay HTTP ${res.status}`,
      };
    }
    return { ok: true, issueUrl: data.issueUrl || null };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'relay unreachable' };
  } finally {
    clearTimeout(timer);
  }
});

// Withdraw a lent item from the lending library. Sends the SECRET
// lend-token (persisted on the item at submit time) to the relay,
// which files a withdraw request carrying only the token's hash; the
// lending-withdraw workflow matches it against the catalog and removes
// the entry. Removal is async (~2 min end to end).
ipcMain.handle('community-withdraw', async (_e, token) => {
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, error: 'invalid token' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LENDING_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://lend.jx-3p.com/withdraw', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token.trim() }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      return { ok: false, error: (data && data.error) || `relay HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'relay unreachable' };
  } finally {
    clearTimeout(timer);
  }
});

// Heart counts for lending-library entries (display-only in the app;
// giving hearts is web-only — IP dedupe behaves oddly behind shared
// networks and the modal stays simpler). Same origin lock as the rest.
ipcMain.handle('community-fetch-hearts', async (_e, ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: 'no ids' };
  const safe = ids.filter((i) => typeof i === 'string' && /^[a-z0-9-]{1,64}$/.test(i)).slice(0, 60);
  if (safe.length === 0) return { ok: false, error: 'no valid ids' };
  try {
    const data = JSON.parse(await lendingFetch(
      `https://lend.jx-3p.com/hearts?ids=${safe.join(',')}`));
    if (!data || !data.ok) return { ok: false, error: 'bad response' };
    return { ok: true, counts: data.counts || {} };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'fetch failed' };
  }
});

ipcMain.handle('load-patches', () => {
  return readJsonOrNull(PATCHES_PATH) || readJsonOrNull(SEED_PATCHES_PATH);
});
ipcMain.handle('load-library', () => {
  return readJsonOrNull(getLibraryPath())
    || readJsonOrNull(SEED_LIBRARY_PATH)
    || { version: '1.0', names: {} };
});
ipcMain.handle('save-library', (_e, data) => {
  try {
    fs.writeFileSync(getLibraryPath(), JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
// Synchronous twin of save-library, used ONLY by the renderer's
// flush-on-quit path. Electron does not await async work (an invoke)
// started inside a `beforeunload` handler — the process tears the
// renderer down first — so a debounced save still pending at quit would
// be silently dropped. sendSync blocks the renderer until this write
// returns, guaranteeing the last edit lands before the window closes.
// The write itself is already synchronous, so this adds no new I/O risk.
ipcMain.on('save-library-sync', (e, data) => {
  try {
    fs.writeFileSync(getLibraryPath(), JSON.stringify(data, null, 2), 'utf8');
    e.returnValue = { ok: true };
  } catch (err) {
    e.returnValue = { ok: false, error: err.message };
  }
});
ipcMain.handle('load-panel-svg', () => {
  try {
    return fs.readFileSync(PANEL_SVG_PATH, 'utf8');
  } catch (err) {
    // The renderer calls await window.api.loadPanelSvg() during init and
    // proceeds to inject the result into the DOM. If readFileSync throws,
    // we return null instead — the renderer guards against null and shows
    // an "asset missing" empty state instead of crashing init.
    console.error('Failed to load panel SVG:', err.message);
    return null;
  }
});

// ── Record-from-JX: write captured PCM samples to a temp WAV ───────────────
//
// The renderer captures live audio from the Mac's input via Web Audio (mic
// permission required) and ships the raw 16-bit-signed PCM samples here as
// an ArrayBuffer along with sample-rate + channel-count metadata. We frame
// the samples in a minimal RIFF/WAVE container and return the path so the
// existing tape decode pipeline (`jx3p wav-to-json` etc.) can consume it.
//
// Output is a standard mono 44.1 kHz 16-bit WAV (matches the jx3p decoder's
// expectations exactly; no resampling needed on either side).
// audio-input-rates: query macOS's CoreAudio directly via system_profiler
// to get each audio input device's CURRENT native sample rate. This bypasses
// Chromium's getUserMedia stream-cache entirely, which made the renderer's
// own probe unreliable: once Chromium negotiated a stream for a given
// deviceId, subsequent probes returned the cached rate even after the user
// changed the device's Format in Audio MIDI Setup. system_profiler reads
// CoreAudio's live state, so it always reflects current reality.
//
// Returns: { ok: true, devices: [{ name: 'KT USB Audio', sampleRate: 44100, isDefaultInput: true }, ...] }
// On failure: { ok: false, error: '...' }
//
// Only input devices are returned (coreaudio_device_input > 0). Output-side
// duplicates of the same device (CoreAudio often lists USB interfaces twice,
// once as input and once as output, each with its own srate) are filtered out
// so the renderer doesn't have to deduplicate. Matched against Chromium's
// deviceId picker labels by substring (Chromium prepends "Default - " and
// appends VID:PID, e.g. "Default - KT USB Audio (31b2:2024)"; system_profiler
// returns the bare name "KT USB Audio").
ipcMain.handle('audio-input-rates', async () => {
  try {
    const { stdout } = await execAsync('system_profiler SPAudioDataType -json', { maxBuffer: 4 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    const items  = (parsed.SPAudioDataType && parsed.SPAudioDataType[0] && parsed.SPAudioDataType[0]._items) || [];
    const devices = items
      .filter((it) => (it.coreaudio_device_input || 0) > 0)
      .map((it) => ({
        name:           it._name || '(unknown)',
        sampleRate:     it.coreaudio_device_srate || null,
        isDefaultInput: it.coreaudio_default_audio_input_device === 'spaudio_yes',
      }));
    return { ok: true, devices };
  } catch (err) {
    return { ok: false, error: err.stderr || err.message };
  }
});

ipcMain.handle('record-to-wav', async (_e, { pcm, sampleRate = 44100, channels = 1, kind = 'tone' }) => {
  if (!pcm || (!Buffer.isBuffer(pcm) && !(pcm instanceof Uint8Array))) {
    return { ok: false, error: 'no PCM payload' };
  }
  const pcmBuf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
  const bitsPerSample = 16;
  const blockAlign    = channels * (bitsPerSample / 8);
  const byteRate      = sampleRate * blockAlign;
  const dataSize      = pcmBuf.length;
  // 12-byte RIFF/WAVE header + 24-byte fmt chunk + 8-byte data header + data.
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0, 4, 'ascii');
  hdr.writeUInt32LE(36 + dataSize, 4);
  hdr.write('WAVE', 8, 4, 'ascii');
  hdr.write('fmt ', 12, 4, 'ascii');
  hdr.writeUInt32LE(16, 16);              // fmt chunk size
  hdr.writeUInt16LE(1, 20);               // PCM
  hdr.writeUInt16LE(channels, 22);
  hdr.writeUInt32LE(sampleRate, 24);
  hdr.writeUInt32LE(byteRate, 28);
  hdr.writeUInt16LE(blockAlign, 32);
  hdr.writeUInt16LE(bitsPerSample, 34);
  hdr.write('data', 36, 4, 'ascii');
  hdr.writeUInt32LE(dataSize, 40);

  const stem    = kind === 'sequence' ? 'jp_seq_record_' : 'jp_patches_record_';
  const tempWav = path.join(os.tmpdir(), `${stem}${Date.now()}.wav`);
  try {
    fs.writeFileSync(tempWav, Buffer.concat([hdr, pcmBuf]));
    return { ok: true, path: tempWav };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Custom RIFF chunk for embedding slot metadata in exported WAVs ─────────
//
// The JX-3P tape format only carries the 32 patch parameter bytes per slot —
// no name field. So a WAV exported from JP Patches and shared with another
// user normally loses all the custom names the sender had given the patches.
//
// To preserve names across cross-user sharing, we tack a custom RIFF chunk
// onto the end of the WAV file after `jx3p json-to-wav` writes it. The chunk
// uses ID "jPpS" and contains a UTF-8 JSON payload with the bank's slotMeta.
// The JX-3P hardware (and Bruce's jx3p decoder) ignore any RIFF chunk they
// don't recognize, so the file remains a fully valid tape dump — the chunk
// is invisible unless another JP Patches instance is reading it.
//
// On import (`decodeTapeFile`), we scan the WAV for our chunk and, if found,
// surface the embedded slotMeta in the IPC result so the renderer can use
// the original names instead of falling back to blank slots.
const JP_CHUNK_ID = 'jPpS';

// jPpS chunk schema versions:
//   v:1 — { v: 1, app: 'JP Patches', slotMeta }       (patches only)
//   v:2 — { v: 2, app: 'JP Patches', slotMeta?,       (either or both fields populated)
//                                    sequenceMeta? }  (sequenceMeta added 2026-06-02 for v0.6.5)
// v:1 chunks parse correctly under v:2 readers (sequenceMeta just absent).
// v:2 chunks parse correctly under v:1 readers IF only slotMeta is populated;
//   readers from v0.6.4 and earlier ignore unknown fields like sequenceMeta.
const JP_CHUNK_SCHEMA_VERSION = 2;

// Embed a jPpS metadata chunk into a finished WAV file. Caller passes a
// `meta` object with optional slotMeta + sequenceMeta fields; only the
// populated ones land in the chunk. Returns silently with no chunk written
// when meta has nothing to embed (preserves the pre-v0.6.5 behaviour of
// embedSlotMetaInWav(null) → no-op).
function embedJpMetaInWav(wavPath, meta) {
  meta = meta || {};
  const hasSlot = meta.slotMeta && typeof meta.slotMeta === 'object'
                  && Object.keys(meta.slotMeta).length > 0;
  const hasSeq  = meta.sequenceMeta && typeof meta.sequenceMeta === 'object'
                  && Object.keys(meta.sequenceMeta).length > 0;
  if (!hasSlot && !hasSeq) return;

  const payloadObj = {
    v:   JP_CHUNK_SCHEMA_VERSION,
    app: 'JP Patches',
  };
  if (hasSlot) payloadObj.slotMeta     = meta.slotMeta;
  if (hasSeq)  payloadObj.sequenceMeta = meta.sequenceMeta;

  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const size = payload.length;
  // RIFF requires chunk sizes to be word-aligned; pad with one zero byte if odd.
  const padByte = size & 1 ? 1 : 0;

  const fd = fs.openSync(wavPath, 'r+');
  try {
    // Validate RIFF/WAVE header before mutating anything.
    const hdr = Buffer.alloc(12);
    fs.readSync(fd, hdr, 0, 12, 0);
    if (hdr.slice(0, 4).toString('ascii') !== 'RIFF' ||
        hdr.slice(8, 12).toString('ascii') !== 'WAVE') {
      throw new Error('not a valid WAVE file');
    }
    const oldMasterSize = hdr.readUInt32LE(4);
    const fileSize = fs.fstatSync(fd).size;

    // Append [4-byte ID]["jPpS"] + [4-byte size LE] + payload + optional pad.
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(JP_CHUNK_ID, 0, 4, 'ascii');
    chunkHeader.writeUInt32LE(size, 4);
    fs.writeSync(fd, chunkHeader, 0, 8, fileSize);
    fs.writeSync(fd, payload, 0, size, fileSize + 8);
    if (padByte) {
      fs.writeSync(fd, Buffer.alloc(1), 0, 1, fileSize + 8 + size);
    }

    // Update RIFF master size to cover the appended bytes.
    const newMasterSize = oldMasterSize + 8 + size + padByte;
    const newSizeBuf = Buffer.alloc(4);
    newSizeBuf.writeUInt32LE(newMasterSize, 0);
    fs.writeSync(fd, newSizeBuf, 0, 4, 4);
  } finally {
    fs.closeSync(fd);
  }
}

// Backward-compat alias preserving the pre-v0.6.5 signature for existing
// callers (and any external code that may have been written against it).
// Routes through the new embedJpMetaInWav.
function embedSlotMetaInWav(wavPath, slotMeta) {
  return embedJpMetaInWav(wavPath, { slotMeta });
}

// Read the full jPpS chunk from a WAV — returns { slotMeta?, sequenceMeta?,
// v } shape (or null if the chunk isn't present). Walks top-level RIFF
// chunks; tolerant of v:1 chunks (where sequenceMeta is absent).
function readJpMetaFromWav(wavPath) {
  let buf;
  try { buf = fs.readFileSync(wavPath); } catch { return null; }
  if (buf.length < 12) return null;
  if (buf.slice(0, 4).toString('ascii')  !== 'RIFF') return null;
  if (buf.slice(8, 12).toString('ascii') !== 'WAVE') return null;

  let off = 12;
  while (off + 8 <= buf.length) {
    const id   = buf.slice(off, off + 4).toString('ascii');
    const size = buf.readUInt32LE(off + 4);
    if (id === JP_CHUNK_ID) {
      try {
        const json   = buf.slice(off + 8, off + 8 + size).toString('utf8');
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== 'object') return null;
        const result = { v: (typeof parsed.v === 'number' ? parsed.v : 1) };
        if (parsed.slotMeta     && typeof parsed.slotMeta === 'object')     result.slotMeta = parsed.slotMeta;
        if (parsed.sequenceMeta && typeof parsed.sequenceMeta === 'object') result.sequenceMeta = parsed.sequenceMeta;
        return result;
      } catch { return null; }
    }
    // Skip to next chunk, honouring the trailing pad byte on odd-sized chunks.
    off += 8 + size + (size & 1);
  }
  return null;
}

// Backward-compat alias preserving the pre-v0.6.5 signature — returns just
// the slotMeta object (the only field v:1 chunks carried). Routes through
// readJpMetaFromWav and extracts the field. Returns null when no chunk
// exists OR when the chunk has only sequenceMeta and no slotMeta.
function readSlotMetaFromWav(wavPath) {
  const meta = readJpMetaFromWav(wavPath);
  return (meta && meta.slotMeta) || null;
}

// tape-save: SAVE on the JX-3P dumps patch memory OUT of the synth as audio.
// The app is on the receiving side: this handler imports a WAV recorded from
// the synth (decoded via `jx3p wav-to-json`) or a previously-exported JSON.
// If the WAV carries a "jPpS" chunk (embedded by another JP Patches export),
// the slotMeta inside it is surfaced alongside the decoded data so the
// renderer can restore the original custom names.
async function decodeTapeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') {
    const outputPath = path.join(os.tmpdir(), `jp_patches_import_${Date.now()}.json`);
    try {
      const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p wav-to-json "${filePath}" "${outputPath}"`;
      await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      const slotMeta = readSlotMetaFromWav(filePath);
      return { loaded: true, kind: 'wav', data, slotMeta, path: filePath };
    } finally {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
  // JSON file (app export / community-library download): the payload
  // carries `_slotMeta` inline — the same per-slot names a WAV export
  // embeds as a jPpS chunk. Strip it from the data and surface it on the
  // same `slotMeta` field the WAV path uses, so name restoration works
  // identically for both formats (renderer reads result.slotMeta).
  const txt = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(txt);
  const { _slotMeta, ...data } = parsed || {};
  return { loaded: true, kind: 'json', data, slotMeta: _slotMeta || null, path: filePath };
}

ipcMain.handle('tape-save', async (e) => {
  // Whole body wrapped in try/catch so a dialog failure (rare on macOS,
  // but possible — display detached, malformed filter spec) returns a
  // shaped error to the renderer instead of rejecting the IPC promise.
  // The renderer's `if (!result.loaded)` guards then surface a clean
  // import-error modal instead of a generic global-error banner.
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Save — import tape dump from JX-3P',
      properties: ['openFile'],
      filters: [
        { name: 'JX-3P files',    extensions: ['wav', 'json'] },
        { name: 'WAV tape dump',  extensions: ['wav'] },
        { name: 'JSON library',   extensions: ['json'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return { loaded: false };
    return await decodeTapeFile(result.filePaths[0]);
  } catch (err) {
    return { loaded: false, error: err.message };
  }
});

// Drag-and-drop entry point: same as tape-save but takes the file path directly.
ipcMain.handle('tape-save-from-path', async (_e, filePath) => {
  if (!filePath) return { loaded: false, error: 'no path provided' };
  try {
    return await decodeTapeFile(filePath);
  } catch (err) {
    return { loaded: false, error: err.message };
  }
});

// tape-load: LOAD on the JX-3P reads patch data IN to the synth from audio.
// The app is on the sending side: this handler exports a WAV the user plays
// into the synth's CMT input, encoded via `jx3p json-to-wav`.
ipcMain.handle('tape-load', async (e, data, suggestedName) => {
  // Whole body wrapped in try/catch — dialog failure outside the inner
  // try would have rejected the IPC promise. Renderer expects `{saved}`
  // shape, so we always return that even on edge-case failures.
  let dlg;
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    dlg = await dialog.showSaveDialog(win, {
      title: 'Load — export tape dump for JX-3P',
      defaultPath: slugForWav(suggestedName, 'jp-patches-tape'),
      filters: [{ name: 'WAV tape dump', extensions: ['wav'] }],
    });
  } catch (err) {
    return { saved: false, error: 'Could not open save dialog: ' + err.message };
  }
  if (dlg.canceled || !dlg.filePath) return { saved: false };

  // Renderer may attach `_slotMeta` to the export payload so we can preserve
  // custom names via a RIFF chunk. Strip it before passing to jx3p (whose
  // bank.schema.json doesn't know about it) and embed it after the WAV writes.
  const { _slotMeta, ...jx3pData } = data || {};
  const tempJson = path.join(os.tmpdir(), `jp_patches_export_${Date.now()}.json`);
  try {
    fs.writeFileSync(tempJson, JSON.stringify(jx3pData, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p json-to-wav "${tempJson}" "${dlg.filePath}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    try { embedSlotMetaInWav(dlg.filePath, _slotMeta); } catch (e2) {
      // Best-effort: a chunk failure shouldn't fail the whole export. The WAV
      // is still a valid tape dump without the embedded names.
      console.warn('embedSlotMetaInWav failed:', e2 && e2.message);
    }
    return { saved: true, path: dlg.filePath };
  } catch (err) {
    return { saved: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
});

// sanitizeWavFilename lives in main-filename-util.js (extracted v0.7.2
// for unit-testability — see test/main-filename-util.test.js).
const { sanitizeWavFilename } = require('./main-filename-util.js');

// tape-save-wav-to-path: same encoder pipeline as tape-load, but the Save
// dialog defaults to ~/Desktop with the package name pre-filled — so a
// single click saves to Desktop, or the user redirects to another folder.
// Powers the download icon on Library Tones rows. v0.7.2 originally
// silent-saved (Daniel asked for "click save to actually save it ... and
// you could choose a different location" — this is that.)
ipcMain.handle('tape-save-wav-to-path', async (e, data, filename) => {
  let dlg;
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    dlg = await dialog.showSaveDialog(win, {
      title: 'Download C/D bank as WAV',
      defaultPath: path.join(os.homedir(), 'Desktop', sanitizeWavFilename(filename)),
      filters: [{ name: 'WAV tape dump', extensions: ['wav'] }],
    });
  } catch (err) {
    return { saved: false, error: 'Could not open save dialog: ' + err.message };
  }
  if (dlg.canceled || !dlg.filePath) return { saved: false };

  const destPath = dlg.filePath;
  const { _slotMeta, ...jx3pData } = data || {};
  const tempJson = path.join(os.tmpdir(), `jp_patches_export_${Date.now()}.json`);
  try {
    fs.writeFileSync(tempJson, JSON.stringify(jx3pData, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p json-to-wav "${tempJson}" "${destPath}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    try { embedSlotMetaInWav(destPath, _slotMeta); } catch (e2) {
      console.warn('embedSlotMetaInWav failed:', e2 && e2.message);
    }
    return { saved: true, path: destPath };
  } catch (err) {
    return { saved: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
});

// tape-encode-to-temp: same encoder pipeline as tape-load, but writes the WAV
// to a temp path the renderer can play directly through the Mac audio output
// (so users don't have to find/play the file themselves). The renderer is
// expected to call tape-cleanup-temp when playback ends or is cancelled.
ipcMain.handle('tape-encode-to-temp', async (_e, data) => {
  const tempJson = path.join(os.tmpdir(), `jp_patches_export_${Date.now()}.json`);
  const tempWav  = path.join(os.tmpdir(), `jp_patches_export_${Date.now()}.wav`);
  // Strip _slotMeta before handing to jx3p, embed it after (same pattern as
  // tape-load). The chunk is harmless during in-app playback to the JX-3P,
  // but it also means a user who later does "Save WAV file" from the send
  // modal still gets a names-preserving WAV (since we're operating on the
  // same temp WAV that may be saved out).
  const { _slotMeta, ...jx3pData } = data || {};
  try {
    fs.writeFileSync(tempJson, JSON.stringify(jx3pData, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p json-to-wav "${tempJson}" "${tempWav}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    try { embedSlotMetaInWav(tempWav, _slotMeta); } catch (e2) {
      console.warn('embedSlotMetaInWav failed:', e2 && e2.message);
    }
    return { ok: true, path: tempWav };
  } catch (err) {
    try { fs.unlinkSync(tempWav); } catch {}
    return { ok: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
});

// tape-cleanup-temp: delete a temp WAV produced by tape-encode-to-temp
// or seq-tape-encode-to-temp. Safe-bounded to our jp_patches_ prefixes
// in os.tmpdir() so the renderer can't ask us to unlink an arbitrary path.
ipcMain.handle('tape-cleanup-temp', async (_e, filePath) => {
  if (typeof filePath !== 'string') return { ok: false };
  const okPrefix1 = path.join(os.tmpdir(), 'jp_patches_export_');
  const okPrefix2 = path.join(os.tmpdir(), 'jp_seq_export_');
  if (!filePath.startsWith(okPrefix1) && !filePath.startsWith(okPrefix2)) return { ok: false };
  try { fs.unlinkSync(filePath); return { ok: true }; }
  catch { return { ok: false }; }
});

// seq-tape-encode-to-temp: same flow as tape-encode-to-temp but for the
// sequencer dump WAV (jx3p seq-json-to-wav). Returns a temp WAV path the
// renderer plays directly to the JX.
//
// Renderer may attach `_sequenceMeta` to the export payload so we can
// preserve customName, originalName, createdAt, patchNote, pairedPatch
// reference across cross-user WAV sharing (mirrors the _slotMeta pattern
// for patches — see tape-load). Strip before passing to jx3p (whose
// sequence schema doesn't know about it), embed after the WAV writes via
// embedJpMetaInWav's v:2 sequenceMeta field. The chunk is invisible to
// the JX (ignores unrecognized RIFF chunks) and to non-JP decoders.
ipcMain.handle('seq-tape-encode-to-temp', async (_e, data) => {
  const tempJson = path.join(os.tmpdir(), `jp_seq_export_${Date.now()}.json`);
  const tempWav  = path.join(os.tmpdir(), `jp_seq_export_${Date.now()}.wav`);
  const { _sequenceMeta, ...jx3pData } = data || {};
  try {
    fs.writeFileSync(tempJson, JSON.stringify(jx3pData, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p seq-json-to-wav "${tempJson}" "${tempWav}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    try { embedJpMetaInWav(tempWav, { sequenceMeta: _sequenceMeta }); } catch (e2) {
      // Best-effort: chunk failure shouldn't break the export. The WAV is
      // still a valid sequence tape dump without the metadata chunk.
      console.warn('embedJpMetaInWav(sequenceMeta) failed:', e2 && e2.message);
    }
    return { ok: true, path: tempWav };
  } catch (err) {
    try { fs.unlinkSync(tempWav); } catch {}
    return { ok: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
});

async function decodeSeqFile(filePath) {
  // JSON sequence file (app export / community-library download): no jx3p
  // decode needed. The payload carries `_sequenceMeta` inline (the same
  // metadata a WAV export embeds as a jPpS v:2 chunk) — strip it from the
  // data and surface it on the same field the WAV path uses, so the
  // renderer's name/notes restoration works identically for both formats.
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.wav') {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const { _sequenceMeta, ...data } = parsed || {};
    return { loaded: true, data, sequenceMeta: _sequenceMeta || null, path: filePath };
  }
  const outputPath = path.join(os.tmpdir(), `jp_seq_import_${Date.now()}.json`);
  try {
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p wav-to-seq-json "${filePath}" "${outputPath}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    // If the WAV carries a jPpS v:2 chunk with sequenceMeta (embedded by
    // another JP Patches export), surface it alongside the decoded data
    // so the renderer can restore the original customName, originalName,
    // createdAt, patchNote, etc.
    const jpMeta = readJpMetaFromWav(filePath);
    const sequenceMeta = (jpMeta && jpMeta.sequenceMeta) || null;
    return { loaded: true, data, sequenceMeta, path: filePath };
  } finally {
    try { fs.unlinkSync(outputPath); } catch {}
  }
}

// seq-tape-save: SAVE on the JX-3P writes sequencer data OUT to audio. The app
// is on the receiving side: import a sequencer-dump WAV produced by the synth
// and decode it via `jx3p wav-to-seq-json`.
ipcMain.handle('seq-tape-save', async (e) => {
  // Whole body wrapped in try/catch — see tape-save above for rationale.
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Save — import sequencer dump from JX-3P',
      properties: ['openFile'],
      filters: [
        { name: 'JX-3P files',    extensions: ['wav', 'json'] },
        { name: 'WAV tape dump',  extensions: ['wav'] },
        { name: 'JSON sequence',  extensions: ['json'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return { loaded: false };
    return await decodeSeqFile(result.filePaths[0]);
  } catch (err) {
    return { loaded: false, error: err.stderr || err.message };
  }
});

// Drag-and-drop entry point: same as seq-tape-save but takes the file path directly.
ipcMain.handle('seq-tape-save-from-path', async (_e, filePath) => {
  if (!filePath) return { loaded: false, error: 'no path provided' };
  try {
    return await decodeSeqFile(filePath);
  } catch (err) {
    return { loaded: false, error: err.stderr || err.message };
  }
});

// seq-tape-load: LOAD on the JX-3P reads sequencer data IN from audio. The app
// is on the sending side: export a sequence as WAV via `jx3p seq-json-to-wav`.
ipcMain.handle('seq-tape-load', async (e, data, suggestedName) => {
  // Dialog acquisition isolated in its own try so a save-dialog failure
  // returns a shaped {saved:false, error} instead of rejecting the IPC.
  // See tape-load for rationale.
  let dlg;
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    dlg = await dialog.showSaveDialog(win, {
      title: 'Load — export sequencer dump for JX-3P',
      defaultPath: slugForWav(suggestedName, 'jp-patches-sequence'),
      filters: [{ name: 'WAV tape dump', extensions: ['wav'] }],
    });
  } catch (err) {
    return { saved: false, error: 'Could not open save dialog: ' + err.message };
  }
  if (dlg.canceled || !dlg.filePath) return { saved: false };

  // Renderer may attach `_sequenceMeta` for cross-user customName/
  // originalName/createdAt/etc. preservation — same pattern as tape-load
  // strips `_slotMeta` for patches. Embed it via jPpS v:2 chunk after the
  // jx3p encoder writes the WAV.
  const { _sequenceMeta } = data || {};
  const tempJson = path.join(os.tmpdir(), `jp_seq_export_${Date.now()}.json`);
  try {
    // jx3p seq-json-to-wav expects { kind: "sequence", format_version, pages: [...] }.
    // The renderer sends just seq.tape (= { pages }), so wrap here.
    const payload = {
      format_version: '1.0',
      kind: 'sequence',
      pages: (data && Array.isArray(data.pages)) ? data.pages : [],
    };
    fs.writeFileSync(tempJson, JSON.stringify(payload, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p seq-json-to-wav "${tempJson}" "${dlg.filePath}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    try { embedJpMetaInWav(dlg.filePath, { sequenceMeta: _sequenceMeta }); } catch (e2) {
      // Best-effort: chunk failure shouldn't fail the export. The WAV is
      // still a valid sequence tape dump without the embedded metadata.
      console.warn('embedJpMetaInWav(sequenceMeta) failed:', e2 && e2.message);
    }
    return { saved: true, path: dlg.filePath };
  } catch (err) {
    return { saved: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
});

// seq-tape-save-wav-to-path: same encoder pipeline as seq-tape-load, but
// the Save dialog defaults to ~/Desktop with the sequence name pre-filled.
// Powers the download icon on Library Sequences rows. Same dialog
// behavior as tape-save-wav-to-path above.
ipcMain.handle('seq-tape-save-wav-to-path', async (e, data, filename) => {
  let dlg;
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    dlg = await dialog.showSaveDialog(win, {
      title: 'Download sequence as WAV',
      defaultPath: path.join(os.homedir(), 'Desktop', sanitizeWavFilename(filename)),
      filters: [{ name: 'WAV tape dump', extensions: ['wav'] }],
    });
  } catch (err) {
    return { saved: false, error: 'Could not open save dialog: ' + err.message };
  }
  if (dlg.canceled || !dlg.filePath) return { saved: false };

  const destPath = dlg.filePath;
  const { _sequenceMeta } = data || {};
  const tempJson = path.join(os.tmpdir(), `jp_seq_export_${Date.now()}.json`);
  try {
    const payload = {
      format_version: '1.0',
      kind: 'sequence',
      pages: (data && Array.isArray(data.pages)) ? data.pages : [],
    };
    fs.writeFileSync(tempJson, JSON.stringify(payload, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p seq-json-to-wav "${tempJson}" "${destPath}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    try { embedJpMetaInWav(destPath, { sequenceMeta: _sequenceMeta }); } catch (e2) {
      console.warn('embedJpMetaInWav(sequenceMeta) failed:', e2 && e2.message);
    }
    return { saved: true, path: destPath };
  } catch (err) {
    return { saved: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
});
