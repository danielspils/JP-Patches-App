const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const JX3P_REPO = path.join(os.homedir(), 'JP-Patches');

const PATCHES_PATH   = path.join(os.homedir(), 'Desktop', 'patches.json');
const PANEL_SVG_PATH = path.join(__dirname, 'renderer', 'panel.svg');

function getLibraryPath() {
  return path.join(app.getPath('userData'), 'library.json');
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

app.whenReady().then(createWindow);
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

ipcMain.handle('tape-save', async (e, data) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Save Patch Library',
    defaultPath: 'patches-library.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
  return { saved: true, path: result.filePath };
});

ipcMain.handle('tape-load', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Load Patch Library or Tape Dump',
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
      const cmd = `uv run --directory "${JX3P_REPO}" jx3p wav-to-json "${filePath}" "${outputPath}"`;
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
