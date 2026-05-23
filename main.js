const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
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

const RELEASES_URL = 'https://github.com/danielspils/JP-Patches-App/releases';
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
          click: () => shell.openExternal(RELEASES_URL),
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
          click: () => shell.openExternal(RELEASES_URL),
        },
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

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('load-patches', () => {
  return readJsonOrNull(PATCHES_PATH) || readJsonOrNull(SEED_PATCHES_PATH);
});
ipcMain.handle('load-library', () => {
  return readJsonOrNull(getLibraryPath())
    || readJsonOrNull(SEED_LIBRARY_PATH)
    || { version: '1.0', names: {} };
});
ipcMain.handle('save-library', (_e, data) => {
  fs.writeFileSync(getLibraryPath(), JSON.stringify(data, null, 2), 'utf8');
  return true;
});
ipcMain.handle('load-panel-svg', () => fs.readFileSync(PANEL_SVG_PATH, 'utf8'));

// tape-save: SAVE on the JX-3P dumps patch memory OUT of the synth as audio.
// The app is on the receiving side: this handler imports a WAV recorded from
// the synth (decoded via `jx3p wav-to-json`) or a previously-exported JSON.
async function decodeTapeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') {
    const outputPath = path.join(os.tmpdir(), `jp_patches_import_${Date.now()}.json`);
    try {
      const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p wav-to-json "${filePath}" "${outputPath}"`;
      await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      return { loaded: true, kind: 'wav', data, path: filePath };
    } finally {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
  const txt = fs.readFileSync(filePath, 'utf8');
  return { loaded: true, kind: 'json', data: JSON.parse(txt), path: filePath };
}

ipcMain.handle('tape-save', async (e) => {
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
  try {
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
  const win = BrowserWindow.fromWebContents(e.sender);
  const dlg = await dialog.showSaveDialog(win, {
    title: 'Load — export tape dump for JX-3P',
    defaultPath: slugForWav(suggestedName, 'jp-patches-tape'),
    filters: [{ name: 'WAV tape dump', extensions: ['wav'] }],
  });
  if (dlg.canceled || !dlg.filePath) return { saved: false };

  const tempJson = path.join(os.tmpdir(), `jp_patches_export_${Date.now()}.json`);
  try {
    fs.writeFileSync(tempJson, JSON.stringify(data, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p json-to-wav "${tempJson}" "${dlg.filePath}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    return { saved: true, path: dlg.filePath };
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
  try {
    fs.writeFileSync(tempJson, JSON.stringify(data, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p json-to-wav "${tempJson}" "${tempWav}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
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
ipcMain.handle('seq-tape-encode-to-temp', async (_e, data) => {
  const tempJson = path.join(os.tmpdir(), `jp_seq_export_${Date.now()}.json`);
  const tempWav  = path.join(os.tmpdir(), `jp_seq_export_${Date.now()}.wav`);
  try {
    fs.writeFileSync(tempJson, JSON.stringify(data, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p seq-json-to-wav "${tempJson}" "${tempWav}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, path: tempWav };
  } catch (err) {
    try { fs.unlinkSync(tempWav); } catch {}
    return { ok: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
});

async function decodeSeqFile(filePath) {
  const outputPath = path.join(os.tmpdir(), `jp_seq_import_${Date.now()}.json`);
  try {
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p wav-to-seq-json "${filePath}" "${outputPath}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return { loaded: true, data, path: filePath };
  } finally {
    try { fs.unlinkSync(outputPath); } catch {}
  }
}

// seq-tape-save: SAVE on the JX-3P writes sequencer data OUT to audio. The app
// is on the receiving side: import a sequencer-dump WAV produced by the synth
// and decode it via `jx3p wav-to-seq-json`.
ipcMain.handle('seq-tape-save', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Save — import sequencer dump from JX-3P',
    properties: ['openFile'],
    filters: [{ name: 'WAV tape dump', extensions: ['wav'] }],
  });
  if (result.canceled || !result.filePaths.length) return { loaded: false };
  try {
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
  const win = BrowserWindow.fromWebContents(e.sender);
  const dlg = await dialog.showSaveDialog(win, {
    title: 'Load — export sequencer dump for JX-3P',
    defaultPath: slugForWav(suggestedName, 'jp-patches-sequence'),
    filters: [{ name: 'WAV tape dump', extensions: ['wav'] }],
  });
  if (dlg.canceled || !dlg.filePath) return { saved: false };

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
    return { saved: true, path: dlg.filePath };
  } catch (err) {
    return { saved: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
});
