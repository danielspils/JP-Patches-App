const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadPatches:  ()     => ipcRenderer.invoke('load-patches'),
  loadLibrary:  ()     => ipcRenderer.invoke('load-library'),
  saveLibrary:  (data) => ipcRenderer.invoke('save-library', data),
  loadPanelSvg: ()     => ipcRenderer.invoke('load-panel-svg'),
  tapeSave:     (data) => ipcRenderer.invoke('tape-save', data),
  tapeLoad:     ()     => ipcRenderer.invoke('tape-load'),
});
