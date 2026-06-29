const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Electron 32+ removed the non-standard File.path property from the renderer
  // process. webUtils.getPathForFile is the supported replacement for getting
  // the on-disk path of a File obtained via drag-and-drop or <input type=file>.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  loadPatches:  ()     => ipcRenderer.invoke('load-patches'),
  loadLibrary:  ()     => ipcRenderer.invoke('load-library'),
  saveLibrary:  (data) => ipcRenderer.invoke('save-library', data),
  // Synchronous save — renderer flush-on-quit only (beforeunload can't
  // await an async invoke before teardown). Blocks until the write lands.
  saveLibrarySync: (data) => ipcRenderer.sendSync('save-library-sync', data),
  loadPanelSvg: ()     => ipcRenderer.invoke('load-panel-svg'),
  tapeSave:            ()        => ipcRenderer.invoke('tape-save'),
  tapeLoad:            (data)    => ipcRenderer.invoke('tape-load', data),
  tapeSaveFromPath:    (path)    => ipcRenderer.invoke('tape-save-from-path', path),
  tapeSaveWavToPath:   (data, p) => ipcRenderer.invoke('tape-save-wav-to-path', data, p),
  tapeEncodeToTemp:    (data)    => ipcRenderer.invoke('tape-encode-to-temp', data),
  tapeCleanupTemp:     (path)    => ipcRenderer.invoke('tape-cleanup-temp', path),
  // Record-from-JX flow: captured PCM samples (16-bit signed LE) from Web
  // Audio + sampleRate + channelCount → temp WAV path. The renderer then
  // hands the path to tapeSaveFromPath / seqTapeSaveFromPath for decoding.
  recordToWav:         (payload)  => ipcRenderer.invoke('record-to-wav', payload),
  // CoreAudio-level audio-input device query (system_profiler). Used by
  // the Record-from-JX modal to detect sample-rate mismatches BEFORE
  // capture, bypassing Chromium's cached-stream behavior that defeats
  // Web Audio-based probes. Returns the device's CURRENT native rate,
  // always fresh, never cached. See main.js for shape and rationale.
  audioInputRates:     ()        => ipcRenderer.invoke('audio-input-rates'),
  seqTapeEncodeToTemp: (data)    => ipcRenderer.invoke('seq-tape-encode-to-temp', data),
  seqTapeSave:         ()        => ipcRenderer.invoke('seq-tape-save'),
  seqTapeLoad:         (data)    => ipcRenderer.invoke('seq-tape-load', data),
  seqTapeSaveFromPath: (path)    => ipcRenderer.invoke('seq-tape-save-from-path', path),
  seqTapeSaveWavToPath:(data, p) => ipcRenderer.invoke('seq-tape-save-wav-to-path', data, p),
  // View > zoom presets. Main owns the window and applies the zoom; this
  // callback lets the renderer persist the new value into library.json
  // so the next launch opens at the same size.
  onZoomChanged: (cb) => ipcRenderer.on('zoom-changed', (_, factor) => cb(factor)),
  // View > Button Sounds. Renderer reports its saved preference on launch
  // (so the menu checkbox matches), and listens for menu toggles to apply
  // + persist the new value into library.json.
  setButtonSoundsInitial: (enabled) => ipcRenderer.send('button-sounds-initial', enabled),
  onButtonSoundsChanged: (cb) => ipcRenderer.on('button-sounds-changed', (_, enabled) => cb(enabled)),
  // View > Tape dump sounds. Same init/toggle handshake as button
  // sounds — persisted in library.json under transmissionSounds.enabled.
  setTapeDumpSoundsInitial: (enabled) => ipcRenderer.send('tape-dump-sounds-initial', enabled),
  onTapeDumpSoundsChanged: (cb) => ipcRenderer.on('tape-dump-sounds-changed', (_, enabled) => cb(enabled)),
  // Help > Audio Diagnostics. Main fires this when the menu item is
  // clicked; renderer opens showAudioDiagnosticsModal(). One-way push,
  // no payload needed.
  onAudioDiagnosticsOpen: (cb) => ipcRenderer.on('audio-diagnostics-open', () => cb()),
  // Open an external URL via the OS default browser. Main-side handler
  // is allowlisted to the JP Patches GitHub repo + jx-3p.com (callers:
  // Audio Diagnostics "Report this bug", lending-library "explore
  // more"). Returns {ok, reason?}.
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // User lending library (community). Manifest fetch + payload download
  // — both main-side, hardlocked to https://jx-3p.com/. Download writes
  // a temp .json named after the entry and returns its path; renderer
  // routes it through the same import handlers as drag-and-drop.
  communityFetchManifest:  ()                  => ipcRenderer.invoke('community-fetch-manifest'),
  communityDownloadToTemp: (url, displayName, entryId) => ipcRenderer.invoke('community-download-to-temp', url, displayName, entryId),
  // One-click lend via the relay (relay/README.md). Renderer falls back
  // to the clipboard + GitHub-form flow when this returns ok: false.
  communityLend:           (submission)        => ipcRenderer.invoke('community-lend', submission),
  // Heart counts for explore-modal entries (display-only in-app).
  communityFetchHearts:    (ids)               => ipcRenderer.invoke('community-fetch-hearts', ids),
  // Withdraw a lent item (secret token → relay → workflow removes it).
  communityWithdraw:       (token)             => ipcRenderer.invoke('community-withdraw', token),
  // App + OS metadata for diagnostic bug-report URLs.
  // Returns { appVersion, platform, macOsRelease }.
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
});
