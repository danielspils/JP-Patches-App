const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PATCHES_PATH = path.join(os.homedir(), 'Desktop', 'patches.json');

function getLibraryPath() {
  return path.join(app.getPath('userData'), 'library.json');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1650,
    height: 860,
    minWidth: 1400,
    minHeight: 760,
    backgroundColor: '#1c1c1c',
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('load-patches', () => {
  try {
    return JSON.parse(fs.readFileSync(PATCHES_PATH, 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('load-library', () => {
  try {
    return JSON.parse(fs.readFileSync(getLibraryPath(), 'utf8'));
  } catch {
    return { version: '1.0', names: {} };
  }
});

ipcMain.handle('save-library', (_e, data) => {
  fs.writeFileSync(getLibraryPath(), JSON.stringify(data, null, 2), 'utf8');
  return true;
});
