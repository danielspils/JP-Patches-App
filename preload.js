const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Electron 32+ removed the non-standard File.path property from the renderer
  // process. webUtils.getPathForFile is the supported replacement for getting
  // the on-disk path of a File obtained via drag-and-drop or <input type=file>.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  loadPatches:  ()     => ipcRenderer.invoke('load-patches'),
  loadLibrary:  ()     => ipcRenderer.invoke('load-library'),
  saveLibrary:  (data) => ipcRenderer.invoke('save-library', data),
  loadPanelSvg: ()     => ipcRenderer.invoke('load-panel-svg'),
  tapeSave:            ()        => ipcRenderer.invoke('tape-save'),
  tapeLoad:            (data)    => ipcRenderer.invoke('tape-load', data),
  tapeSaveFromPath:    (path)    => ipcRenderer.invoke('tape-save-from-path', path),
  tapeEncodeToTemp:    (data)    => ipcRenderer.invoke('tape-encode-to-temp', data),
  tapeCleanupTemp:     (path)    => ipcRenderer.invoke('tape-cleanup-temp', path),
  // Record-from-JX flow: captured PCM samples (16-bit signed LE) from Web
  // Audio + sampleRate + channelCount → temp WAV path. The renderer then
  // hands the path to tapeSaveFromPath / seqTapeSaveFromPath for decoding.
  recordToWav:         (payload)  => ipcRenderer.invoke('record-to-wav', payload),
  seqTapeEncodeToTemp: (data)    => ipcRenderer.invoke('seq-tape-encode-to-temp', data),
  seqTapeSave:         ()        => ipcRenderer.invoke('seq-tape-save'),
  seqTapeLoad:         (data)    => ipcRenderer.invoke('seq-tape-load', data),
  seqTapeSaveFromPath: (path)    => ipcRenderer.invoke('seq-tape-save-from-path', path),
  // View > zoom presets. Main owns the window and applies the zoom; this
  // callback lets the renderer persist the new value into library.json
  // so the next launch opens at the same size.
  onZoomChanged: (cb) => ipcRenderer.on('zoom-changed', (_, factor) => cb(factor)),
});
