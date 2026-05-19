const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadPatches:  ()     => ipcRenderer.invoke('load-patches'),
  loadLibrary:  ()     => ipcRenderer.invoke('load-library'),
  saveLibrary:  (data) => ipcRenderer.invoke('save-library', data),
  loadPanelSvg: ()     => ipcRenderer.invoke('load-panel-svg'),
  tapeSave:            ()        => ipcRenderer.invoke('tape-save'),
  tapeLoad:            (data)    => ipcRenderer.invoke('tape-load', data),
  tapeSaveFromPath:    (path)    => ipcRenderer.invoke('tape-save-from-path', path),
  seqTapeSave:         ()        => ipcRenderer.invoke('seq-tape-save'),
  seqTapeLoad:         (data)    => ipcRenderer.invoke('seq-tape-load', data),
  seqTapeSaveFromPath: (path)    => ipcRenderer.invoke('seq-tape-save-from-path', path),
});
