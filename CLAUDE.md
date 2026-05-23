# JP Patches — Claude Code project memory

Free, open-source macOS Electron app for the Roland JX-3P synthesizer. Author: Daniel Spils (GitHub: `danielspils`). First-time programmer; vibe-coded with Claude Code.

This file is the cold-start summary. Pair it with:

- **[`docs/library-and-midi-spec.md`](docs/library-and-midi-spec.md)** — authoritative design spec for Phases 1–4. Phase 2 has an "As-shipped summary" noting where the actual implementation diverged from the original design.
- **[`docs/future-features.md`](docs/future-features.md)** — parking lot for ideas not yet on the roadmap (screenshots refresh, signing, Windows port, adaptive sizing, sound samples, WAV name-embedding, app-level Undo/Redo, etc.).
- **[`README.md`](README.md)** — end-user docs (install, first run, Tape Memory reference, Library, Custom Banks, Roadmap).
- **GitHub Releases — [github.com/danielspils/JP-Patches-App/releases](https://github.com/danielspils/JP-Patches-App/releases)** — every shipped version has detailed user-facing release notes. The best chronological record of recent UX and behavior changes. `gh release list` and `gh api repos/danielspils/JP-Patches-App/releases --paginate -q '.[].body'` to pull locally.

## Status

Current version: **0.5.10** (May 22, 2026). 22 public releases since v0.1.0 on May 19.

- **Phase 1** ✅ shipped — panel UI + patch editing
- **Phase 2** ✅ shipped — Library (Tones + Sequences with paired-patch model), Custom Bank Builder, drag-and-drop WAV import, sequencer codec, sequence-send-to-JX
- **Phase 3** ⏳ blocked — MIDI integration, deferred until the Series Circuits JX-3P MIDI Upgrade Kit is installed. CC map and architecture already drafted in the spec doc §Phase 3.
- **Phase 4** 🚧 in progress — distribution. `.dmg` builds work via `electron-builder` (unsigned). Apple Developer ID + notarization is the open work item (logged in `docs/future-features.md`).

**System requirement**: macOS 12+ on **Apple Silicon (arm64) only**. Intel Macs are not supported by the published DMGs.

## File map

```
~/JP-Patches-App/
├── main.js                       Electron main process — 13 IPC handlers, app menu, zoom persistence
├── preload.js                    contextBridge → window.api.* (incl. webUtils.getPathForFile)
├── package.json                  electron@^35 + electron-builder@^25 (dev only)
├── package-lock.json
├── .gitignore                    node_modules/, dist/, vendor/, build/
├── README.md                     end-user readme
├── ROADMAP.md                    pointer file (see README + docs/library-and-midi-spec.md)
├── LICENSE                       MIT, © 2026 Daniel Spils
├── docs/
│   ├── library-and-midi-spec.md  authoritative design spec (Phases 1–4)
│   └── future-features.md        parking lot beyond the formal roadmap
├── scripts/
│   └── setup-vendor.sh           populates vendor/ before `npm run dist`
├── build/
│   ├── icon.png                  1024×1024 source for the app icon
│   └── entitlements.mac.plist    macOS hardened-runtime entitlements
├── vendor/                       gitignored; populated by setup-vendor.sh
│   ├── uv/uv                     uv binary, macOS arm64
│   └── jx3p/                     rsynced copy of ~/JP-Patches (Bruce's toolkit)
├── dist/                         gitignored; electron-builder output (.dmg, .app)
└── renderer/
    ├── index.html                shell — left panel + #panel-host
    ├── style.css                 vintage cream hardware aesthetic (~1,200 lines)
    ├── app.js                    all UI logic — ~3,700 lines
    ├── panel.svg                 locked PG-200 panel artwork (1050×620 viewBox)
    ├── panel_locked_v2..v6.svg   historical snapshots (v6 is current canonical reference)
    ├── seed/
    │   ├── library.json          first-run Spils Sounds + Spils Sequence
    │   └── patches.json          first-run active C/D banks
    └── assets/jp-logo.png        chrome JP logo embedded in panel
```

## External runtime dependencies

- **`uv`** — Python package runner. From source: `brew install uv`. In packaged DMG: bundled at `vendor/uv/uv` and copied to `extraResources/uv/uv`.
- **`jx3p`** Python toolkit — Bruce Oberg's tool at `bruceoberg/jx-3p-patches`. Used for WAV ↔ JSON conversion of both **patches** and **sequences** (sequencer codec is shipped upstream; datatype=1; round-trip lossless). From source: expected cloned to `~/JP-Patches/`. In packaged DMG: rsynced to `vendor/jx3p/` then copied to `extraResources/jx3p/`.
  - **`~/JP-Patches/` is Daniel's fork** (`origin = danielspils/JP-Patches`, with `bruceoberg` as upstream remote), **not a clean clone of Bruce's repo**. It carries a local divergence: a quiet-recording auto-boost inside `_load_wav_mono_float` (`jx3p/codec.py`, `AUTO_BOOST_TARGET = 0.7`). See the pitfalls section for the rationale. If pulling from `bruceoberg` upstream, preserve the local patch or re-apply it.
- **`~/Library/Application Support/jp-patches/library.json`** — user state (patch names, library packages, sequences, custom bank buckets, zoom factor, tape-memory mode, future MIDI prefs). If absent on first launch, app seeds from `renderer/seed/`.
- **`~/Desktop/patches.json`** — legacy boot-time patch source. No longer fatal if absent (first-run empty state handles it).

## How to run / build

```
cd ~/JP-Patches-App
npm install                   # first time only
npm start                     # opens the Electron window

npm run setup-vendor          # populate vendor/ from ~/JP-Patches (or $JX3P_SRC)
npm run dist:unsigned         # build DMG without code signing
npm run dist                  # build DMG with Apple Developer ID (not set up yet)
```

Window opens at **1140×710** (sized for Daniel's logical screen of 1147×719) and is non-resizable in v1 — but the View menu zoom presets (75% / 100%) scale window + renderer together, so 75% (855×532) works on smaller laptops. Fullscreen toggle via the green ⛶ button or Cmd+Ctrl+F.

## What works (current state)

### Panel UI (Phase 1)
- 16-slot patch list per bank (C1–C16, D1–D16) in the left panel. Click-to-name; names persist via `slotMeta` (separate `customName` + `defaultName`).
- Drag-reorder within a bank; cross-bank swap via the ⇄ hover icon (slot-anchored swap animation).
- Hover (i) info icon shows patch lineage: current slot, name, origin slot, origin library.
- Full PG-200 panel rendered from `panel.svg`, injected at startup.
- **24 knobs**:
  - 6 snap knobs (`SNAP_ANGLES`): click cycles to next enum. Params: `dco1_range`, `dco1_waveform`, `dco2_range`, `dco2_waveform`, `dco2_crossmod`, `lfo_waveform`.
  - 18 smooth knobs: vertical drag, 2°/1px sensitivity, range −140° to +140°.
- 8 toggle switches (canonical 3-segment white/grey/dark; click anywhere on body cycles state).
- 4 panel buttons: Save / Load / Manual / Write. Write is the in-app clone-to-slot affordance (arms a slot-picker; click any C/D slot → confirmation modal → clone current patch params into that slot).

### Tape Memory (Phase 1 + 2)
JX-3P-faithful nomenclature: **Save = import from synth**, **Load = export to synth**.
- Tape Memory dropdown header (Tape Memory / MIDI Memory — MIDI mode logs "not implemented" until Phase 3).
- Two columns (Tone / Sequencer), each with Save / Load buttons. Greyed out when their action would be a no-op.
- Tone Save / Load: `.wav` ↔ JSON via `jx3p wav-to-json` / `json-to-wav`.
- Sequencer Save / Load: same, with paired-patch + RATE slider + note metadata.
- **Send to JX-3P** (v0.5.7): in-app guided two-step modal — setup instructions → timeline visualization (Init / Bank C / Divider / Bank D for patches; Init / Sequence for sequencer) → ▶ Play. Pilot tone durations exact (4096 bits × 50 samples/bit / 44100 Hz = 4.644 s per pilot).
- "Save WAV file" file-export fallback still available.

### Library tab (Phase 2)
- Two sub-tabs: **Tones** (C+D snapshots) and **Sequences** (paired patch + sequence data + RATE % + note).
- Auto-default names (`C/D banks May 18, 2026`, `Sequence May 18, 2026 at 12:23 PM`) with editable custom-name overrides. Pencil-icon affordance for unnamed items.
- Each row: hover-LOAD button (inline single-row load), hover-trash, relative timestamp subtitle.
- Drag-reorder within a sub-tab.
- Shift-click range select (within a single bank) — drag the range as a multi-patch payload into the Custom Banks builder.
- Drag-and-drop WAV/JSON onto sub-tabs: dropped file's name becomes the new package name.

### Custom Bank Builder (Phase 2)
- Below the panel, opens via the **Create Custom Banks** key. 4×8 grid (C left in Roland green, D right in Roland blue) under a JX-3P-style red header.
- Drag patches from active bank list into bucket slots; bucket entries show origin (e.g. `C8 from Daniel's Patches`).
- Save gate: SAVE label only appears when both buckets are **16/16** (forces a deliberate end state).
- Save commits as a new Library Tones package, auto-loads as active C/D, closes the builder.
- CLEAR ↔ UNDO (one-shot restore until next drop voids the snapshot).
- Buckets survive cross-tab navigation **and** app restart, so multi-library cherry-picking works across sessions.

### First-run + drag-and-drop
- Empty `library.json` → seeds from `renderer/seed/` (Spils Sounds active banks + Spils Sounds/Sequence in Library). Once user makes any change, their own file takes over; seed never read again. Deletions stick.
- Drop a `.wav` from Finder anywhere in the window — routed by active tab: Library Sequences → save modal; Library Tones → non-destructive new package; Bank C/D → "Quick check" confirm + safety snapshot + import.
- File path obtained via `webUtils.getPathForFile` (Electron 32+; the old `File.path` was removed upstream).

### App menu
- **JP Patches**: About / Check for Updates… (opens Releases page) / Hide / Hide Others / Quit.
- **File**: Close Window (Cmd+W).
- **Edit**: Cut / Copy / Paste / Select All only — manually wired with click handlers to prevent macOS auto-injecting Substitutions, Speech, Writing Tools, AutoFill, Dictation, and Emoji & Symbols.
- **View**: Actual Size (Cmd+0), 75% (Cmd+−), Reload, Toggle DevTools, Toggle Fullscreen. Zoom factor persists across launches.
- **Help**: GitHub link.

## What's next

**Phase 3 (MIDI)** — blocked on Series Circuits kit install. Concrete CC map ready in spec §3.2. Library: `easymidi`. Architecture: main-process owns MIDI, IPC pattern matches existing handlers. Sub-phasing in spec §3.8.

**Phase 4 (Distribution)** — `npm run dist:unsigned` works today. Open work items, in priority order:
1. Apple Developer ID + notarization (drops the "damaged" Gatekeeper dialog). $99/yr.
2. README screenshots refresh (current shots predate vintage cream + Custom Banks redesign).
3. Mac App Store publish (after signing).
4. Adaptive window sizing + 125/150/200% zoom presets (need screen-bound clamp first).
5. Windows port (waiting for a Windows-using JX-3P owner to volunteer testing).

Other parking-lot items in `docs/future-features.md`.

## Conventions

1. **Plain JS only.** No TypeScript, no React/Vue/Svelte. Direct DOM manipulation in `app.js`.
2. **Don't modify `panel.svg`** unless the change is essential and unavoidable. `panel_locked_v6.svg` is the current canonical reference snapshot. Functional changes happen in `app.js` (tagging, event handling) without touching the SVG.
3. **Window stays at 1140×710** (`resizable: false`) — until adaptive sizing lands. The View menu zoom presets (75% / 100%) are the only sanctioned size variants. Daniel's screen is 1147×719 — anything wider than 1140 will be clipped.
4. **CSP**: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`. Update the meta tag in `index.html` if external resources or `eval`-style features become needed.
5. **macOS-only for v1.** Code freely uses `~/`, `pkill`, etc.
6. **Color palette**: Roland red `#b94a2e`, vintage cream `#f7f1e6`. Reuse these constants rather than inventing siblings.
7. **Commit messages** prefixed with `feat:`, `fix:`, `chore:`, `docs:`, `Spec:`, etc. See `git log --oneline` for the style.
8. **Co-author trailer** on commits: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
9. **Release notes are user-facing prose** — see Releases on GitHub for the established voice. Mirror that style for new releases.

## Architecture

### IPC surface (`preload.js` → `window.api.*`)

13 handlers, all defined in `main.js`. New handlers should follow the same pattern.

```js
// File I/O
loadPatches:         ()              → load ~/Desktop/patches.json (legacy boot source)
loadLibrary:         ()              → load ~/Library/.../jp-patches/library.json (or seed)
saveLibrary:         (data)          → write same
loadPanelSvg:        ()              → read renderer/panel.svg
getPathForFile:      (File)          → on-disk path of a dropped File (Electron 32+)

// Tape Memory — patches
tapeSave:            ()              → file-dialog → write JSON
tapeLoad:            (data)          → file-dialog → read .wav (jx3p decode) OR .json
tapeSaveFromPath:    (path)          → import a known-path WAV (drag-drop flow)
tapeEncodeToTemp:    (data)          → encode JSON to temp WAV for the Send modal's <audio>
tapeCleanupTemp:     (path)          → delete that temp WAV on modal close

// Tape Memory — sequences
seqTapeSave:         ()              → file-dialog → write sequence JSON
seqTapeLoad:         (data)          → file-dialog → read .wav (jx3p seq decode) OR .json
seqTapeSaveFromPath: (path)          → import a known-path sequence WAV
seqTapeEncodeToTemp: (data)          → encode sequence to temp WAV for the Send modal

// Zoom persistence
onZoomChanged:       (cb)            → main → renderer push when View menu zoom changes
```

### `library.json` shape (current)

```jsonc
{
  "version": "...",
  "names":     { /* legacy: bank slot → custom name */ },
  "slotMeta":  { /* per-slot { customName, defaultName, originSlot, originLibrary, ... } */ },
  "packages":  [ /* Tones snapshots: { name, customName, createdAt, banks: {C: [...], D: [...]} } */ ],
  "sequences": [ /* Sequences:       { name, customName, createdAt, tape: {...}, app: {pairedPatch, patchNote} } */ ],
  "customBanks": { /* persistent Custom Bank Builder buckets across restarts */ },
  "tapeMode":  "tape" | "midi",
  "zoom":      1.0,           // last View-menu zoom factor
  "lastBankSelection": { /* C/D + slot, for cross-tab context (e.g. sequence pairing from Library) */ },
  "midi":      { /* Phase 3 — input, output, channel, sendPC, followPC */ }
}
```

### Key tables in `app.js`

- `DISCRETE` — enum values per discrete param (mirrors upstream `jx3p/patch.py`).
- `SNAP_ANGLES` — visual marker angles for snap knobs; overrides default −140°/+140° spread in `paramToAngle`.
- `SNAP_CYCLE` — overrides DISCRETE for click-cycle on knobs with fewer visual markers than enum values (currently only `lfo_waveform`: skips `fast random`).
- `KNOB_REGISTRY` — maps SVG location (circle cx/cy or `<g translate(...)>`) to param name.
- `SWITCH_REGISTRY` — 8 switches with body selector + type.
- `BUTTON_REGISTRY` — 4 buttons with body selector + LED color.

## Patch data shape (32 params per slot)

See `jx3p/patch.py` upstream for canonical types. Key gotchas:

- `dco2_waveform` has 4 values incl. `"noise"` — but the Series Circuits MIDI kit can't transmit noise (kit only defines Saw=0, Pulse=32, Square=64 for DCO-2 wave). WAV import remains the only way `dco2_waveform = "noise"` can land in the app once MIDI ships.
- `mystery` (uint8 0–15) is preserved on disk for round-trip integrity but never sent over MIDI.
- Continuous params are uint8 (0–255). The MIDI kit transmits 7-bit, so a round-trip loses the bottom bit.

**Patch identity by parameters**: in the app's mental model a patch's identity is its 32 params, not its name. So if you name a patch in the app, export to the synth, move it around on the JX, and import the tape dump back, the app recognizes the patch and restores the name automatically. Edit knobs on the JX → identity changes → name resets. By design.

## Recent themes

`git log --oneline` and the GitHub Releases page are authoritative — releases especially, since each has a thorough user-facing changelog. Themes from the May 19–22 burst:

- App menu cleanup + View zoom presets (v0.5.10)
- Shift-click range select, inline LOAD, modal polish (v0.5.9)
- Patch history modal + per-package createdAt + origin tracking
- Send-to-JX-3P from inside the app (v0.5.7)
- First-run seed content — Spils Sounds + Spils Sequence (v0.5.5–v0.5.6)
- Fullscreen toggle + UI polish pass (v0.5.4)
- Vintage cream palette + JX-3P key tabs (v0.5.2–v0.5.3)
- Custom Bank Builder + Custom Banks redesign (v0.5.0–v0.5.2)
- Drag-and-drop WAV import (v0.4.0) + Electron 32+ fix (v0.4.2)
- Sequencer save/load (v0.3.0) — sequencer codec shipped upstream in `jx3p`
- App icon + animation polish (v0.2.0)
- First public build (v0.1.0)

## Common pitfalls

1. **`node_modules/` symlinks can vanish** after some npm operations. If `npm start` fails with `electron: command not found`, run `npm install` to restore the `.bin/` symlinks.
2. **`~/Desktop/patches.json` is a legacy boot source.** Absence is no longer fatal — first-run empty state + seed handle it gracefully — but the hard-coded path is still in `main.js`.
3. **The `jx3p` Python tool path is hard-coded** to `~/JP-Patches/` when running from source. In packaged DMGs, `extraResources/jx3p/` is used. From-source clones need `~/JP-Patches/` present (or `JX3P_SRC=/path` for `setup-vendor.sh`).
4. **macOS filesystem is case-insensitive.** `~/JP-Patches` and `~/jp-patches` are the same directory. Don't try to create a sibling clone with only-case differences.
5. **Don't commit `node_modules/`, `vendor/`, `dist/`, or `build/` outputs.** The first commit in repo history did include node_modules and required a `git filter-branch` rewrite to undo (GitHub rejected the push due to Electron Framework being >100 MB). `.gitignore` handles this now but stay vigilant.
6. **Window can't grow past 1140×710** on Daniel's machine — his logical display is 1147×719. Anything wider will be partially offscreen. The View menu 75% preset is the workaround for tighter screens until adaptive sizing lands.
7. **Knobs cap at ±140° rotation.** The `paramToAngle` math expects continuous params in 0–255 and discrete params indexed into `DISCRETE[param]`. Always clamp before applying.
8. **Loop suppression matters in Phase 3.** When MIDI lands, inbound CC must not trigger outbound CC. See spec §3.5.1.
9. **Apple Silicon arm64 only.** `electron-builder` is configured for `--mac --arm64`. Intel build target intentionally not shipped.
10. **macOS auto-injects items into the Edit menu** when it detects standard text-editing `role:` strings. Manual click handlers (current approach) prevent it. Don't switch back to `role:` unless you also want Substitutions/Speech/Writing Tools/Dictation back.
11. **Quiet-recording auto-boost lives in our `jx3p` fork.** `_load_wav_mono_float` in `~/JP-Patches/jx3p/codec.py` scales any WAV whose peak amplitude is below `AUTO_BOOST_TARGET = 0.7` so the post-load peak hits the target. This rescues tape dumps recorded with too little Mac/interface input gain — without it, the FSK detector's `QUIESCENCE_THRESHOLD = 0.15` Schmitt-trigger band swallows the whole signal and every record decodes to None. Loud-enough recordings (peak ≥ 0.7) are untouched; pure digital silence (peak = 0) is left alone. If a real-world recording ever decodes as garbage rather than empty, suspect the boost amplified the noise floor enough to look like FSK to the demodulator — temporarily lower `AUTO_BOOST_TARGET` (e.g. 0.5) or gate the boost behind a peak floor (e.g. only boost when 0.02 < peak < 0.7) to isolate. Bug history: introduced May 2026 after Daniel's "Sequence 2" recording at peak 0.053 decoded to 8 None pages despite containing real notes.

## When in doubt

- Read the spec doc before designing a new feature.
- Skim recent Releases on GitHub before changing user-visible behavior — the established voice and the established invariants both live there.
- Ask Daniel before making destructive changes (force-push, history rewrite, file deletes).
- Don't touch `panel.svg` for cosmetic-only changes — it's locked.
- Verify visual changes in the running app, not just by file inspection — the SVG injection + JS tagging at runtime can hide subtle issues.
