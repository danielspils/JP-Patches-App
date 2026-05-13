# JP Patches — Phase 2 & 3 Design Spec

Status: design complete, not yet implemented.
Phasing: Library tab first (Phase 2), MIDI integration second (Phase 3).

---

## 0. Project context

**JP Patches** is a free, open-source macOS Electron desktop app for managing patches on the Roland JX-3P synthesizer. Author: Daniel Spils (GitHub: `danielspils`). Target users: the ~1,000 JX-3P owners worldwide. Distribution: GitHub Releases as `.dmg`. Mac-only for v1.

Phase 1 (librarian core, locked panel UI, knob/switch/button interaction, WAV import via Bruce Oberg's `jx3p` Python toolkit) is **done**.

## 0.1 Stack & repo

- **Electron**, plain JavaScript (no TypeScript), no frameworks.
- App lives at `~/JP-Patches-App/`. Local git repo, no remote yet.
- Window is fixed at **1140×710** (Daniel's logical screen is 1147×719); `resizable: false`.
- File structure:
  ```
  ~/JP-Patches-App/
  ├── main.js                       Electron main process + IPC handlers
  ├── preload.js                    context-bridge → window.api.*
  ├── package.json                  dependencies: electron only
  └── renderer/
      ├── index.html                shell — left panel + right panel host
      ├── style.css                 dark hardware aesthetic
      ├── app.js                    all UI logic (~700 lines)
      ├── panel.svg                 locked PG-200 panel artwork (1050×620 viewBox)
      ├── panel_locked_v4.svg       backup of the current locked panel
      └── assets/jp-logo.png        chrome JP logo embedded in panel
  ```
- Helper Python toolkit at `~/JP-Patches/` (Bruce Oberg's `jx3p`, MIT-licensed, used for WAV ↔ JSON conversion).

## 0.2 What already works (Phase 1)

- **Left panel**: 16-slot patch list (C1–C16 or D1–D16) with click-to-name. Names persist in `~/Library/Application Support/jp-patches/library.json`.
- **Right panel**: full PG-200 visual rendered from `panel.svg`. SVG is injected into a `#panel-host` div at startup via IPC `loadPanelSvg`.
- **Patch params**: 32 fields stored per slot in memory as `patches.banks[0|1][0..15][paramName]`. Loaded from `~/Desktop/patches.json` (output of `jx3p wav-to-json`).
- **Knob interaction** (24 knobs):
  - 6 **snap knobs** (in `SNAP_ANGLES` table): click cycles to next enum value. Cursor: `pointer`.
    Params: `dco1_range`, `dco1_waveform`, `dco2_range`, `dco2_waveform`, `dco2_crossmod`, `lfo_waveform`.
  - 18 **smooth knobs**: vertical drag, 2°/1px sensitivity (~140px = full sweep). Cursor: `ns-resize`. Range −140° to +140°.
- **Switches** (8): single click cycles state. White segment slides between top and bottom of a 3-segment body. Hit target is the entire body.
- **Buttons** (4): Save / Load / Manual / Write. LED dark by default, lights on mousedown.
  - **Save**: writes current library to a JSON file (file-dialog).
  - **Load**: reads `.wav` (decodes via `uv run jx3p wav-to-json …`) OR `.json` (direct).
  - **Manual / Write**: visual-only, no action yet.
- **All 32 patch params** reflected dynamically in the SVG when a patch is selected.
- **Event delegation**: single `mousedown` on the SVG dispatches by `data-control="knob|switch|button"`.

The 32 patch fields (mirrors `jx3p/patch.py` upstream):
```
dco1_range:       enum ["16'", "8'", "4'"]
dco1_waveform:    enum ["saw", "pulse", "square"]
dco1_fmod_lfo:    bool
dco1_fmod_env:    bool
dco2_range:       enum ["16'", "8'", "4'"]
dco2_waveform:    enum ["saw", "pulse", "square", "noise"]   ⚠ 'noise' has no MIDI CC value
dco2_crossmod:    enum ["off", "sync", "metal"]
dco2_tune:        uint8 (0-255)
dco2_fine_tune:   uint8
dco2_fmod_lfo:    bool
dco2_fmod_env:    bool
dco_lfo_amount:   uint8
dco_env_amount:   uint8
dco_env_polarity: enum {neg, pos}
vcf_mix:          uint8
vcf_hpf:          uint8
vcf_cutoff:       uint8
vcf_lfo_mod:      uint8
vcf_pitch_follow: uint8
vcf_resonance:    uint8
vcf_env_mod:      uint8
vcf_env_polarity: enum {neg, pos}
vca_mode:         enum {gate, env}
vca_level:        uint8
chorus:           bool
lfo_waveform:     enum ["sine", "square", "random", "fast random"]
lfo_delay:        uint8
lfo_rate:         uint8
env_attack:       uint8
env_decay:        uint8
env_sustain:      uint8
env_release:      uint8
mystery:          uint8 0-15  (preserve on disk; never sent over MIDI)
```

---

# Phase 2 — Library tab

## 2.1 Concept

- Banks **C** and **D** are **active edit slots** (16 patches each, 32 total).
- The **Library tab** is **cold storage** for saved C+D snapshots.
- Each Library entry contains a **full C+D pair** (32 patches) plus metadata.
- Users can have many named entries: "Daniel Sounds", "Jessica's Juicy JX-3P Patches", "2026-05-13", etc.

## 2.2 File structure

```
~/Library/Application Support/jp-patches/
├── library.json                 # app prefs + active bank slot names (existing)
└── collections/
    ├── 2026-05-13.json
    ├── Daniel_Sounds.json
    └── Jessica_Juicy_JX-3P_Patches.json
```

Each collection JSON:
```json
{
  "name": "Daniel Sounds",
  "created":  "2026-05-13T17:24:00Z",
  "modified": "2026-05-13T18:02:11Z",
  "banks": {
    "C": [ {...patch1}, {...patch2}, ... ],   // 16 patches
    "D": [ {...patch1}, ... ]                  // 16 patches
  }
}
```

Filename rules:
- **Default on save**: `YYYY-MM-DD.json` (suffix `_2`, `_3` if date collision).
- **User-renamed**: sanitize entered name (spaces → underscores, strip `/\?*`), append `.json`.
- **Display name** in tab list = the `.name` field. Filename is secondary (used only for storage).

## 2.3 Save workflow

- Button at bottom of left panel below C16/D16:
  > 💾 **Save C/D banks to Library**
- Click:
  1. Snapshot current C+D state.
  2. Write new collection JSON with default name (today's date).
  3. Insert entry into Library tab list.
  4. Switch focus to Library tab with the new entry in **inline-edit mode** for immediate rename.

## 2.4 Load workflow

- Click a Library row → modal:
  > Load **[Collection Name]** into C and D banks?
  > Your current C/D banks will be replaced.
  > Save them first if you want to keep them.
  >
  > **[Cancel] [Save current first…] [Load]**
- **Save current first…** triggers save workflow, then loads.
- **Load** overwrites C and D with the collection's contents.

## 2.5 Rename

- Single click on the name in Library tab → inline edit (same UX as C/D patch slot renaming).
- Updates both display name (`.name` field) and underlying filename.

## 2.6 Delete

- Select a Library row (highlight).
- Press **Delete** key (no on-screen button).
- Modal:
  > Delete **[Collection Name]**? This cannot be undone.
  >
  > **[Cancel] [Delete]**
- On confirm: remove JSON from `collections/`, remove from Library list.

## 2.7 Empty state

Tab shows:
> Save your current C and D banks to start a library.
> Use the **'Save C/D banks to Library'** button at the bottom of the left panel.

## 2.8 Open question

- **Tape Memory Save button**: keep as user-picks-file export, or repurpose as "Save to Library" shortcut?
  Decide before implementation.

---

# Phase 3 — MIDI integration

Triggered by Daniel installing the **Series Circuits JX-3P MIDI Upgrade Kit**, which adds CC-based parameter control to the JX-3P.

## 3.1 Series Circuits MIDI kit — key facts

- **CC-based only.** No SysEx (confirmed in the FAQ).
- **MIDI channel set by hardware switch at power-on** of the JX-3P:
  - Switch on PG-200 → Ch 1
  - Switch on PG-200 Protect → Ch 2
  - Switch on MIDI → Ch 3
- **7-bit values** (0–127). PG-200 internally is 8-bit, so round-tripping a 0–255 byte loses 1 bit of precision.
- **PG-200's "Manual" button** transmits all current CCs (broadcasts the synth's state).
- **CC 64 is Hold/Sustain pedal**, not a parameter.
- **Program Change 0–64** supported for patch selection (32 patches map to PC 0–31).
- **DCO-2 noise is NOT MIDI-addressable** — the kit only defines 3 CC values for DCO-2 wave (Saw=0, Pulse=32, Square=64). Noise can only be set from the JX-3P panel/PG-200, not over MIDI.

## 3.2 CC mapping table — paste into `cc-map.js`

```js
// Param → CC# (32 entries)
const PARAM_TO_CC = {
  // Continuous, CC 12–29
  dco2_fine_tune:   12,
  dco2_tune:        13,
  dco_env_amount:   14,
  dco_lfo_amount:   15,
  vcf_mix:          16,
  vcf_hpf:          17,
  vcf_resonance:    18,
  vcf_cutoff:       19,
  vcf_env_mod:      20,
  vcf_lfo_mod:      21,
  vcf_pitch_follow: 22,
  vca_level:        23,
  lfo_rate:         24,
  lfo_delay:        25,
  env_attack:       26,
  env_decay:        27,
  env_sustain:      28,
  env_release:      29,
  // Switches, CC 72–85
  dco1_range:       72,
  dco1_waveform:    73,
  dco2_range:       74,
  dco2_waveform:    75,
  dco2_crossmod:    76,
  vcf_env_polarity: 77,
  vca_mode:         78,
  dco2_fmod_env:    79,
  dco2_fmod_lfo:    80,
  dco1_fmod_env:    81,
  dco1_fmod_lfo:    82,
  lfo_waveform:     83,
  dco_env_polarity: 84,
  chorus:           85,
};

// Discrete value → CC value
const ENUM_TO_CC = {
  dco1_range:       { "16'": 0, "8'": 32, "4'": 64 },
  dco1_waveform:    { saw: 0, pulse: 32, square: 64 },
  dco2_range:       { "16'": 0, "8'": 32, "4'": 64 },
  dco2_waveform:    { saw: 0, pulse: 32, square: 64 },           // noise: skip
  dco2_crossmod:    { off: 0, sync: 32, metal: 64 },
  vcf_env_polarity: { neg: 0, pos: 64 },     // Inverted / Normal
  vca_mode:         { gate: 0, env: 64 },
  lfo_waveform:     { sine: 0, square: 32, random: 64, "fast random": 96 },
  dco_env_polarity: { neg: 0, pos: 64 },
};

// Booleans (fmod_*, chorus): false → 0, true → 64
// Continuous: cc = value >> 1   (outbound)
//             value = cc << 1   (inbound, loses bottom bit)
```

## 3.3 Architecture — main process owns MIDI

**Rationale**: Already using IPC for `loadPatches`, `loadLibrary`, `loadPanelSvg`, `tapeSave`, `tapeLoad`. MIDI fits the same pattern. Node MIDI bindings on macOS use CoreMIDI directly (battle-tested). Web MIDI in the renderer is doable but more brittle.

**Library**: `easymidi` (npm). It wraps `@julusian/midi` native bindings. Friendly CC/Note/Sysex/PC API. Active maintenance.

**New files**:
```
~/JP-Patches-App/
├── midi-host.js     NEW — main-process MIDI driver
├── cc-map.js        NEW — the table above (shared by main & renderer)
├── main.js          MODIFY — add midi-* IPC handlers
├── preload.js       MODIFY — expose window.api.midi*
└── renderer/
    ├── app.js       MODIFY — outbound hooks + inbound listener + settings UI logic
    └── index.html   MODIFY — settings UI shell
```

**IPC surface** to add to `preload.js`:
```js
midiListPorts:   ()                            => ipcRenderer.invoke('midi-list-ports'),
midiOpen:        (inputName, outputName, ch)   => ipcRenderer.invoke('midi-open', inputName, outputName, ch),
midiClose:       ()                            => ipcRenderer.invoke('midi-close'),
midiSend:        (param, value)                => ipcRenderer.invoke('midi-send', param, value),
midiSendPC:      (program)                     => ipcRenderer.invoke('midi-send-pc', program),
onMidiCC:        (handler)                     => ipcRenderer.on('midi-cc', (_e, p, v) => handler(p, v)),
onMidiStatus:    (handler)                     => ipcRenderer.on('midi-status', (_e, s) => handler(s)),
```

## 3.4 Data flow

**Outbound** (UI change → synth):
```
applyDragAngle / mouseup / handleSwitchClick / snap-knob click
   ↓ window.api.midiSend(param, value)
   ↓ IPC
main: midi-host.sendCC(PARAM_TO_CC[param], encodeValue(param, value))
   ↓ easymidi.Output.send('cc', { controller, value, channel })
   ↓ CoreMIDI → Series Circuits kit → JX-3P
```

Three hook points in `app.js`:
1. `applyDragAngle` — emit during drag, throttled to 30 Hz per param (`lastEmitTime` map).
2. Smooth-knob `mouseup` — always emit final value (bypass throttle).
3. `handleSwitchClick` + snap-knob mousedown — emit once per click.

**Inbound** (synth/PG-200 → UI):
```
Physical PG-200 knob moved (or external MIDI source)
   ↓ CC on the configured input port
main: easymidi.Input on('cc') → webContents.send('midi-cc', param, value)
   ↓ IPC
preload: ipcRenderer.on('midi-cc', handler)
   ↓
renderer: receiveCC(ccNum, ccValue)
   • lookup param via CC_TO_PARAM
   • decode value (cc<<1 for continuous, reverse ENUM_TO_CC for enums)
   • set patch[param] = decoded
   • call updateAllControls(patch) with suppressOutbound = true
```

## 3.5 Edge cases (must handle)

1. **Echo loop suppression.** Inbound CC → UI update → outbound CC → synth → inbound CC → ∞ loop.
   *Fix*: a `suppressOutbound` boolean checked by the drag/click hooks before they call `midiSend`. Set true at the start of `receiveCC`, false at the end.

2. **Drag throttling.** Without it, a fast drag floods the synth.
   *Fix*: per-param `lastEmitMs` map; only emit if `now - last > 33`. The `mouseup` always emits the final value, ignoring the throttle.

3. **Mid-drag inbound conflict.** If the user is dragging a smooth knob and the same param's CC arrives, the drag should win.
   *Fix*: in `receiveCC`, if `dragState?.param === incomingParam`, ignore the incoming CC.

4. **DCO-2 noise unreachable over MIDI.**
   - Outbound: if `dco2_waveform === "noise"`, don't emit. Optionally show a small "MIDI out of sync" indicator near the noise marker on the panel.
   - Inbound: never possible. WAV import remains the only way `dco2_waveform = "noise"` enters the app.

5. **Device disconnect.** Listen on the input's `'close'` event (or poll); push a `midi-status` event to the renderer; show a red dot in the settings panel.

6. **No device selected.** All `midiSend` calls silently no-op. App keeps working in offline mode.

7. **Program Change behavior.** Bidirectional, opt-in:
   - When user clicks a patch in the left list, optionally send `PC = bank*16 + slot`.
   - When the JX-3P fires a PC (e.g. user presses a patch button physically), optionally receive and select the matching slot in the left list.
   - Each direction toggled by a checkbox in the MIDI settings.

## 3.6 MIDI settings UI

**Location: TBD.** Library tab is **reserved for collections** (Phase 2) — NOT available for MIDI settings.

Candidate placements:
- **Gear icon** in panel chrome (top-right or drag-bar area), opens a modal
- **File → Preferences** (Cmd+,) via Electron application menu
- Other (e.g. a small **MIDI** button in the bottom-row of the panel)

**Decide before Phase 3 implementation.**

Settings content (wherever it lives):
```
MIDI
   Input:    [Series Circuits ▾]
   Output:   [Series Circuits ▾]
   Channel:  [1 ▾]
   Status:   ● Connected
   [Rescan]

Sync
   ☐ Send Program Change on patch select
   ☐ Follow synth Program Change
```

Persist to `library.json`:
```json
{
  "version": "1.0",
  "names": { ... },
  "midi": {
    "input":  "Series Circuits JX-3P",
    "output": "Series Circuits JX-3P",
    "channel": 1,
    "sendPC": false,
    "followPC": false
  }
}
```

## 3.7 Bottom-row button rewiring (post-MIDI)

Once MIDI is online, the four hardware buttons take on real meaning:

| Button | Action |
|---|---|
| **Save** | Unchanged. Writes library + params to a JSON file via file-dialog. Offline backup. (Or repurposed for Library — see Phase 2 open question.) |
| **Load** | Unchanged. Reads WAV (via jx3p) or JSON file via file-dialog. |
| **Write** | **NEW**: broadcasts all 32 CCs for the currently-selected patch to the synth. JX-3P now has it in its edit buffer; user presses the JX-3P's onboard save to commit. |
| **Manual** | **NEW**: arms a one-shot inbound listener for ~5 seconds. Pressing Manual on the physical PG-200 during that window dumps all 32 CCs; we capture them into `patches.banks[selBank][selSlot]`. Renderer shows a "Listening…" indicator on the button. |

## 3.8 Sub-phasing

**Phase 3.0 — pipe-clean smoke test** (~half day)
- `npm install easymidi`
- `midi-host.js`: `listPorts`, `open(inputName, outputName, channel)`, `sendCC(num, value)`, `on('cc', handler)`
- `cc-map.js` with the table above
- IPC plumbing (`midi-list-ports`, `midi-open`, `midi-send`)
- Hardcode a default port name in `main.js`, send CC for one knob (e.g. `vcf_cutoff`), verify the synth responds
- Inbound: `console.log` every CC received, no UI update yet

**Phase 3.1 — full bidirectional** (~1 day)
- Hook all three outbound points in `app.js` (drag-throttled, mouseup, switch/snap click)
- Inbound `receiveCC` with `CC_TO_PARAM`, value decode, `updateAllControls(patch, { suppressOutbound: true })`
- Loop-suppression flag
- Mid-drag conflict resolution
- Settings UI (device dropdowns, channel picker, status dot, Rescan button) — placement TBD
- Persisted device + channel selection in `library.json`

**Phase 3.2 — Write / Manual buttons**
- Write: iterate `patches.banks[…][selSlot]`, emit each CC (with noise-skip and throttle bypass)
- Manual: 5-second armed mode; visual "Listening…" indicator on the button; capture incoming CCs into the slot

**Phase 3.3 — polish**
- Optional Program Change send/receive
- "MIDI out of sync" indicator on the DCO-2 noise marker when applicable
- Hot-plug rescan (poll ports every few seconds OR a manual Rescan button)
- MIDI activity LED somewhere (blink on CC send/receive)
- Status messages → existing Tape Memory indicator LEDs (light red on send, green on receive)

---

## Constraints to honor

- **No TypeScript.** Plain JS only.
- **No React/Vue/Svelte.** Direct DOM manipulation in `app.js`.
- **Don't modify `panel.svg`** unless absolutely needed. The current panel is frozen as `panel_locked_v4.svg`.
- **Window stays at 1140×710**, not resizable. UI changes must fit.
- **CSP**: current renderer CSP is `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`. Update the `index.html` meta tag if MIDI port enumeration needs anything else.

## Sequencing

1. **Phase 2 (Library tab) first** — foundational for C/D bank lifecycle. Write/Manual in Phase 3 needs to know how patches save.
2. **Phase 3 (MIDI) second** — once collections exist as a storage model, MIDI Write becomes "push current edit slots", and Manual becomes "capture into current edit slot".

## Open decisions (resolve before each phase)

**Phase 2:**
1. Tape Memory Save button: keep as user-picks-file export, or repurpose as Library shortcut?

**Phase 3:**
1. MIDI settings UI location (gear icon vs File → Preferences vs other).
2. Throttle rate hardcoded at 30 Hz, or configurable?
3. Behavior when kit's port isn't connected at startup — silent + red status dot, or one-time toast?
4. Should clicking Write while offline show an error or silently no-op?

---

End of brief. The next Claude session should be able to start with Phase 2 from this alone.
