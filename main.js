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

function getLibraryPath() {
  return path.join(app.getPath('userData'), 'library.json');
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
    resizable: false,
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
  try { return JSON.parse(fs.readFileSync(PATCHES_PATH, 'utf8')); } catch { return null; }
});
ipcMain.handle('load-library', () => {
  try { return JSON.parse(fs.readFileSync(getLibraryPath(), 'utf8')); }
  catch { return { version: '1.0', names: {} }; }
});
ipcMain.handle('save-library', (_e, data) => {
  fs.writeFileSync(getLibraryPath(), JSON.stringify(data, null, 2), 'utf8');
  return true;
});
ipcMain.handle('load-panel-svg', () => fs.readFileSync(PANEL_SVG_PATH, 'utf8'));

// tape-save: SAVE on the JX-3P dumps patch memory OUT of the synth as audio.
// The app is on the receiving side: this handler imports a WAV recorded from
// the synth (decoded via `jx3p wav-to-json`) or a previously-exported JSON.
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
  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.wav') {
      const outputPath = '/tmp/jp_patches_import.json';
      const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p wav-to-json "${filePath}" "${outputPath}"`;
      await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      return { loaded: true, kind: 'wav', data, path: filePath };
    }
    const txt = fs.readFileSync(filePath, 'utf8');
    return { loaded: true, kind: 'json', data: JSON.parse(txt), path: filePath };
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
  const filePath = result.filePaths[0];
  const outputPath = path.join(os.tmpdir(), `jp_seq_import_${Date.now()}.json`);
  try {
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p wav-to-seq-json "${filePath}" "${outputPath}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return { loaded: true, data, path: filePath };
  } catch (err) {
    return { loaded: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(outputPath); } catch {}
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
    fs.writeFileSync(tempJson, JSON.stringify(data, null, 2), 'utf8');
    const cmd = `"${UV_BIN}" run --directory "${JX3P_REPO}" jx3p seq-json-to-wav "${tempJson}" "${dlg.filePath}"`;
    await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    return { saved: true, path: dlg.filePath };
  } catch (err) {
    return { saved: false, error: err.stderr || err.message };
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
});
