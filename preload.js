const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadPatches:  ()       => ipcRenderer.invoke('load-patches'),
  loadLibrary:  ()       => ipcRenderer.invoke('load-library'),
  saveLibrary:  (data)   => ipcRenderer.invoke('save-library', data),
});
