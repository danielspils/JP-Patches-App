const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadPatches:  ()     => ipcRenderer.invoke('load-patches'),
  loadLibrary:  ()     => ipcRenderer.invoke('load-library'),
  saveLibrary:  (data) => ipcRenderer.invoke('save-library', data),
  loadPanelSvg: ()     => ipcRenderer.invoke('load-panel-svg'),
  tapeSave:     ()     => ipcRenderer.invoke('tape-save'),
  tapeLoad:     (data) => ipcRenderer.invoke('tape-load', data),
});
