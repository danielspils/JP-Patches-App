const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
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
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
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
  const win = new BrowserWindow({
    width: 1140,
    height: 710,
    minWidth: 1140,
    minHeight: 710,
    // Drag-to-resize stays disabled — the locked SVG panel artwork was
    // sized for 1140×710 — but the green ⛶ traffic-light button can
    // now toggle macOS fullscreen so the app fills the user's display
    // on larger monitors. Cmd+Ctrl+F also works.
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
ipcMain.handle('tape-load', async (e, data) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const dlg = await dialog.showSaveDialog(win, {
    title: 'Load — export tape dump for JX-3P',
    defaultPath: 'jp-patches-tape.wav',
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
ipcMain.handle('seq-tape-load', async (e, data) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const dlg = await dialog.showSaveDialog(win, {
    title: 'Load — export sequencer dump for JX-3P',
    defaultPath: 'jp-patches-sequence.wav',
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
