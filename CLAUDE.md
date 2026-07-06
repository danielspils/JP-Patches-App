# JP Patches — Claude Code project memory

Free, open-source **macOS Electron app** for the Roland **JX-3P** synth. Author: Daniel Spils (`danielspils`) — first-time programmer, vibe-coded with Claude Code. **macOS 12+, Apple Silicon (arm64) only.**

This file is the cold-start **map + trap list** — where things live and what bites. It links the deep docs rather than duplicating them; anything that grew past a few lines has been moved to a linked doc. Project *history* lives in git + GitHub Releases + the Notes blog, not here.

**Companion docs** (read the relevant one before diving in):
- [`docs/design-system.md`](docs/design-system.md) — **binding** UI guide (color tokens, typography, SVG button/knob/switch primitives, layout, anti-patterns). Consult before building any UI component, modal, or visual.
- [`docs/library-and-midi-spec.md`](docs/library-and-midi-spec.md) — design spec for Phases 1–4 (the Phase 3 MIDI CC map + architecture live here).
- [`docs/record-from-jx.md`](docs/record-from-jx.md) — tape-capture feature reference + state machine. ⚠ predates auto-calibration (v0.8.2); see the Capture trap below.
- [`docs/record-troubleshooting.md`](docs/record-troubleshooting.md) — **capture won't decode?** Data-first diagnostic toolkit + the 4-way failure triage + dead-ends-don't-re-chase.
- [`docs/site-architecture.md`](docs/site-architecture.md) — how jx-3p.com is built (no-theme Jekyll, the Notes blog, the lending catalog, **deploys-from-`main`-only**).
- [`docs/smoke-test.md`](docs/smoke-test.md) — pre-release manual QA checklist.
- [`README.md`](README.md) — end-user docs. **[GitHub Releases](https://github.com/danielspils/JP-Patches-App/releases)** — the authoritative per-version changelog.

## Status

**v0.8.6** shipped (July 2026); **main is ahead** with two unreleased, Windows-hardware-validated features awaiting the next cut: **frequency-aware capture** (trap #36) and **Windows app-audio routing** (Task #21 — trap #33). 25+ releases since v0.1.0. Site live at [jx-3p.com](https://jx-3p.com); releases cut via `scripts/release.sh` (signed + notarized DMG, electron-updater auto-update). A Windows preview (CI-built NSIS, tagged `vX.Y.Z-win-preview`, prerelease) is kept in sync with every Mac release.

- **Phase 1–2** ✅ shipped — panel UI + patch editing; Library (Tones/Sequences, paired-patch model), Custom Bank Builder, sequencer codec + editor, drag-drop import, send-to-JX.
- **Phase 3 (MIDI)** ⏳ blocked on the Series Circuits JX-3P MIDI kit install. CC map + architecture drafted in the spec doc.
- **Phase 4 (distribution)** 🚧 signed/notarized DMGs + site live. Open: README screenshots refresh, Mac App Store, adaptive window sizing, Windows port (needs a Windows-using JX-3P tester).
- **User Lending Library** ✅ v0.8.0 — in-app borrow/lend backed by the `relay/` Cloudflare Worker at lend.jx-3p.com; submissions auto-publish (~3 min), hearts + borrow counts, 5/day rate limit.
- **Windows port** 🚧 **merged to `main`** — full JX↔JP round-trip (tones + sequences) confirmed on real hardware at DEFAULT gain (July 2026): execFile jx3p (trap #31), frequency-aware quiet-input capture (trap #36), and app-audio routing (trap #33 / Task #21). Runs from source (`npm start`) against `C:\Users\<user>\JP-Patches`. **Requires Windows 10 (64-bit)+** — Win7/8/8.1 are a hard Electron floor (Electron dropped them in v23; we ship 35), and launch there aborts with a misleading *"is not a valid Win32 application"*. Remaining open port items: in-app auto-update, ~30 s first-Send hang (venv pre-warm), screen-size auto-zoom, Record progress-timeline re-sync (`docs/future-features.md`). Don't downgrade Electron to chase Win7.

## How to run / build

```
npm install            # first time only
npm start              # opens the Electron window
npm run setup-vendor   # populate vendor/ from ~/JP-Patches (or $JX3P_SRC)
npm run dist:unsigned  # build DMG without signing
npm run dist           # signed+notarized DMG (what release.sh runs)
npm test               # 499 unit tests across 20 pure-logic suites
```

Window is **1140×710**, non-resizable (Daniel's logical screen is 1147×719 — anything wider clips). View-menu zoom (75% / 100%) + fullscreen (green ⛶ button / Cmd+Ctrl+F) are the only sanctioned size variants until adaptive sizing lands.

## File map

```
~/JP-Patches-App/
├── main.js              Electron main — 24 ipcMain.handle channels, app menu, zoom persistence,
│                        the jPpS WAV-chunk embed/read, the system_profiler sample-rate probe
├── preload.js           contextBridge → window.api.* (incl. webUtils.getPathForFile)
├── package.json         electron@^35 + electron-builder@^25 (dev only); build.win = NSIS x64 on the windows-port branch
├── docs/                GitHub Pages source for jx-3p.com (custom no-theme Jekyll) — see docs/site-architecture.md
│   ├── _layouts/        default.html (page skeleton + nav), post.html (Notes posts)
│   ├── _posts/          the Notes blog
│   ├── _data/ library/  lending catalog YAML + payload .json + the Liquid index.json manifest
│   ├── index.md         landing page (download CTAs → /releases/latest)
│   ├── *.md             design-system, library-and-midi-spec, record-from-jx, record-troubleshooting,
│   │                    smoke-test, site-architecture, future-features, RELEASE, release-notes-*
│   └── assets/          style.css (Roland tokens), site.js (lightbox + tracking-stripper), jp-logo.png, favicons
├── relay/               Cloudflare Worker @ lend.jx-3p.com — POST /lend (→ GitHub issue, 10/IP/day) ·
│                        /heart · /borrow · /withdraw · GET /hearts (KV-backed). PAT expires ~June 2027.
├── scripts/             setup-vendor.sh · release.sh · lend-publish-lib.mjs (auto-publish trust boundary, tested)
│                        · publish-lend.mjs / withdraw-lend.mjs (CI pipelines) · remove-lend.sh (manual takedown)
├── .github/workflows/   build-windows.yml (NSIS on windows-latest) · lending-{publish,withdraw,notify}.yml
├── build/               icon.png (1024²) · entitlements.mac.plist
├── vendor/  (gitignored) uv/uv (arm64) + jx3p/ (rsynced from ~/JP-Patches) — populated by setup-vendor.sh
└── renderer/
    ├── index.html       shell — loads the pure-logic modules as <script> tags BEFORE app.js (order matters)
    ├── app.js           ALL UI logic — ~12,200 lines, heavily commented
    ├── style.css        vintage-cream hardware aesthetic — ~3,500 lines
    ├── panel.svg        locked PG-200 panel artwork (panel_locked_v6.svg = canonical snapshot)
    └── *.js (pure logic, each unit-tested):
        calibration-math · library-math · lending · library-schema · record-trim · capture-warnings
        capture-state · record-flow · audio-capture · send-timeline · modal-builders · synth-preview
        seq-insert-rules · transmission-sounds · audio-diagnostic
```

## External runtime dependencies

- **`uv`** — Python runner. From source: `brew install uv`. In the DMG: bundled at `vendor/uv/uv`.
- **`jx3p`** Python toolkit — WAV ↔ JSON for patches AND sequences (round-trip lossless, datatype=1). **`~/JP-Patches/` is Daniel's FORK** (`origin = danielspils/JP-Patches`, `bruceoberg` upstream), gitignored & separate from this repo, vendored into the DMG at build time by `setup-vendor.sh`. It carries one local divergence: a quiet-recording **auto-boost** in `_load_wav_mono_float` (`jx3p/codec.py`, `AUTO_BOOST_TARGET = 0.92`). If you pull from upstream, preserve that patch.
- **`~/Library/Application Support/jp-patches/library.json`** — all user state (patch names, packages, sequences, custom banks, prefs, `record.calibratedGain`, `captureLog`). Absent on first launch → seeds from `renderer/seed/`.

## Architecture

**IPC surface** (`preload.js` → `window.api.*`): 24 `ipcMain.handle` channels in `main.js`. Groups: File I/O (load/save library, panel SVG, `getPathForFile`); Tape Memory patches + sequences (`tapeSave/Load`, `*FromPath`, `*EncodeToTemp`, save-WAV-to-path); `recordToWav`; `audioInputRates` (CoreAudio sample-rate probe); zoom push; lending (`communityFetchManifest/DownloadToTemp/Lend/FetchHearts`, all outbound network hardlocked to jx-3p.com + lend.jx-3p.com); `openExternal` (allowlisted). New handlers follow the same pattern.

**`library.json` shape**: `version`, `slotMeta` (per-slot `{customName, defaultName, originLibrary, ...}`), `packages` (Tones snapshots `{name, customName, createdAt, banks, slotMeta, derivedFrom?, editedCount?}`), `sequences`, `customBanks`, `history` (fingerprint → `{name, origin}` — the name-restore table), `lineage` (fingerprint → `{derivedFrom, derivedFromLibrary, sourceTs}` — Phase 3A provenance, separate from history so renames don't erase it), `community`/`lending` (lending state), `record.calibratedGain` (per-deviceId), `captureLog`, `zoom`, `tapeMode`, `midi`.

**Key tables in `app.js`**: `DISCRETE` (enum values per param), `SNAP_ANGLES`/`SNAP_CYCLE` (knob marker overrides), `KNOB_REGISTRY`/`SWITCH_REGISTRY`/`BUTTON_REGISTRY` (SVG location → param/control).

## Patch data shape

32 params per slot (canonical types in `jx3p/patch.py`). `dco2_waveform` includes `"noise"` (WAV-only — MIDI kit can't send it); `mystery` (uint8 0–15) is round-trip-only; continuous params are uint8 (MIDI is 7-bit → loses the bottom bit).

**Identity = the 32 params, not the name.** Name a patch, send it out, move it on the JX, record it back → the app re-recognizes it by fingerprint and restores the name. Edit a knob on the JX → identity changes → name resets. By design. Backed by `library.history` (fingerprint → name) + `paramsFingerprint` in `library-math.js`.

**`jPpS` RIFF chunk** (name preservation across shared WAVs): `main.js` appends a custom chunk after `jx3p json-to-wav` carrying `slotMeta`/`sequenceMeta` (the JX tape format has no name field). v:1 = patches; v:2 (v0.6.5) adds sequences + the full `pairedPatch`. Renderer sends `_slotMeta`/`_sequenceMeta` underscore-prefixed; `main.js` strips them before jx3p, embeds after. Unified pair: `embedJpMetaInWav` / `readJpMetaFromWav`. On import, local fingerprint-history wins over the chunk (your renames aren't clobbered).

## What's built — feature → owner map

*Where each feature lives. UX mechanics are in the code + the spec/design docs; only non-obvious invariants are noted here.*

- **PG-200 panel** — rendered from `panel.svg`, wired in `app.js` via the `*_REGISTRY` tables. 24 knobs (6 snap / 18 smooth, ±140° cap), 8 switches, 4 buttons (Save/Load/Manual/**Write**=in-app clone-to-slot).
- **Tape Memory** — *Save = import from synth, Load = export to synth* (JX-faithful). `.wav` ↔ JSON via the jx3p CLI. `buildJxKeyDiagram({action, kind})` draws the JX key-press hints (keys differ by kind — see trap #13).
- **Send to JX-3P** (`showSendToJxFlow`) — guided modal → real-time timeline driven by the temp-WAV `<audio>.currentTime` (`send-timeline.js`). Pilot = 4096 bits × 50 samples / 44100 Hz = 4.644 s.
- **Record from JX-3P** (`showRecordFromJxModal`) — live capture → trim → jx3p decode. Auto-decode by default; manual calibration is the fallback. Decision logic is pure in `record-flow.js`. See the Capture/Decode traps + `docs/record-troubleshooting.md`.
- **Library tab** — Tones (C+D snapshots) + Sequences (paired patch + RATE + note). Round-trip name recognition + the Source→Current provenance in the (i) box (Phase 3A): `bestPackageMatch` in `library-math.js`, `provenanceBlock` + `showPatchInfo`/`showPackageInfo` in app.js.
- **Sequencer editor** (`seq-insert-rules.js` + `showSeq*` in app.js) — piano-roll editor; **the 8-page overview is read-only by design**, editing only in single-page view. Insert rules are JX-firmware-faithful (trap #16). Undo via the app-wide `pushUndo` stack.
- **Custom Bank Builder** — 4×8 grid; SAVE gates on both buckets 16/16; buckets persist across restart.
- **Tape Dump Sounds** (`transmission-sounds.js`) — plays the FSK out the Mac speakers in parallel (off by default). Strict speaker allowlist + cable-exclusion + mandatory `setSinkId` (see trap #22).
- **Audio Diagnostics** (`audio-diagnostic.js`) — folded into the Audio Settings modal; detects the macOS-label-regression that breaks the speaker allowlist, pre-fills a bug-report issue.
- **First-run / drag-drop** — empty `library.json` seeds from `renderer/seed/`; dropped `.wav` routes by active tab (Library → new package; Bank C/D → import to active banks via `applyWavData`). File path via `webUtils.getPathForFile` (Electron 32+).
- **User Lending Library** — borrow/lend in-app; `relay/` Worker files GitHub issues with Daniel's PAT; auto-publish + withdraw pipelines in `scripts/`; site catalog from `docs/_data`. Payload = banks + slotMeta only (provenance fields are local, never shared).
- **Site** — jx-3p.com from `docs/`; 4 download CTAs all point at `/releases/latest`. See `docs/site-architecture.md`.
- **Release automation** — `scripts/release.sh X.Y.Z` (preflight → version bump → tests → signed DMG → tag → GitHub release + auto-update feed). Companion: `docs/RELEASE.md`.

## Conventions

1. **Plain JS only** — no TS, no frameworks; direct DOM manipulation in `app.js`. Pure logic → its own `renderer/*.js` module with unit tests.
2. **Don't edit `panel.svg`** for cosmetics — it's locked (`panel_locked_v6.svg` = reference). New panel-style artwork copies SVG primitives inline; functional changes go in `app.js`.
3. **CSP**: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`. Update the `index.html` meta tag if external resources become needed.
4. **macOS-only for v1** — code freely uses `~/`, `pkill`, etc.
5. **Design language** — see `docs/design-system.md`. Don't introduce off-palette colors or framework-default components without a deliberate reason.
6. **Commits**: `feat:`/`fix:`/`chore:`/`docs:`/`Spec:` prefixes + the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
7. **Release notes**: succinct, user-facing prose — **always show Daniel the final notes before cutting** a release (he curates the voice).
8. **Site pushes ship independently of app releases.** Any `docs/` change affecting jx-3p.com commits + pushes on its own (Pages deploys in ~30–60 s) — don't bundle with app code or hold for a release. Internal docs (this file, smoke-test, release-notes) MAY ride app commits.

## Design language — north star

**The app is an extension of the JX-3P.** When building anything new, ask: *what would this look like if Roland had shipped it on the 1983 panel?* Generic web-app components should feel out of place. **`docs/design-system.md` is the binding reference** (color tokens, SVG primitives, layout patterns, anti-patterns). Quick palette: Roland red `#b94a2e` (warnings), green `#1f6e5b` (good/Tones/Bank C), blue `#33508f` (info/Sequences/Bank D), amber `#c39a3a` (approaching-limit); vintage cream `#f7f1e6` (labels); modal `#1a1a1a`, app-bg `#0a0a0a`. Font: Helvetica.

## Test hardware (Daniel's setup)

Two JX-3P units: **upstairs** (MacBook, most testing) and **downstairs** (Mac mini). **They have different tape-dump output levels — the downstairs unit is quieter. Never cross-compare gain/calibration values between rigs.** When a capture bug only reproduces "sometimes," suspect a unit/level/`library.json` difference before a code regression.

## Traps & gotchas

*Numbers are stable (referenced from code comments + historical docs). Grouped by area.*

### Build / platform
1. **`node_modules/` symlinks can vanish** after some npm ops. `electron: command not found` → `npm install` restores `.bin/`.
4. **macOS filesystem is case-insensitive** — `~/JP-Patches` == `~/jp-patches`. Don't make a case-only sibling.
5. **Never commit `node_modules/`, `vendor/`, `dist/`, `build/`.** The first commit included node_modules and needed a `filter-branch` rewrite (Electron Framework >100 MB).
6. **Window can't grow past 1140×710** on Daniel's display. 75% zoom is the workaround until adaptive sizing.
9. **arm64 only** — `electron-builder --mac --arm64`; no Intel target.
10. **macOS auto-injects Edit-menu items** (Substitutions/Speech/Dictation/…) when it sees standard text-editing `role:` strings. We use manual click handlers instead — don't switch back to `role:`.

### Capture / decode  *(deep debugging → `docs/record-troubleshooting.md`)*
2. **`~/Desktop/patches.json` is a legacy boot source** — absence is no longer fatal (seed handles it), but the hard-coded path is still in `main.js`.
3. **The `jx3p` path is hard-coded to `~/JP-Patches/`** when running from source (DMGs use `extraResources/jx3p/`). From-source clones need it present (or `JX3P_SRC=…`).
11. **Quiet-recording auto-boost lives in the `jx3p` fork** (`AUTO_BOOST_TARGET = 0.92` in `codec.py`) — scales any sub-target WAV up so the FSK detector's `QUIESCENCE_THRESHOLD = 0.15` band doesn't swallow it. If a real capture decodes as *garbage* (not empty), suspect the boost amplified the noise floor — gate it behind a peak floor to isolate.
12. **Record thresholds scale with current gain, at TWO sites** that must stay in sync: `stopRecording`'s trim classifier and `tickMeter`'s live classifier (`liveThresholdsFor`). Hardcoding `0.05`/`0.10` anywhere is a smell — the JX's between-dumps idle tone crosses fixed thresholds at high gain.
15. **Sequence dumps are content-variable in duration** (~6 s dense → ~28 s sparse; empty pages encode as many slow 1-bits). `EXPECTED_SIGNAL_MS` (30 s seq / 33 s tones) sizes the auto-stop budget for the long end; too-low truncates mid-dump → 0 pages.
17. **Chromium caches `getUserMedia` streams per `deviceId`** — a probe returns the SAME negotiated sampleRate even after the user changes it in Audio MIDI Setup. Read device rates from **CoreAudio** instead (`system_profiler SPAudioDataType -json`, the `audioInputRates` IPC); match the picker label by name-substring. Same path for any other live device property.
26. **Capture "didn't decode cleanly" → `docs/record-troubleshooting.md`.** Data-first: grab the temp WAV + `captureLog` + `library.json`; run the 4-way failure triage; **never blame the cable** (it failed across two rigs and was software both times). Both root causes shipped fixes (loud-idle trim + native rate, v0.8.5).
27. **Capture at the device's NATIVE sample rate.** macOS + Chromium default `getUserMedia`/`AudioContext` to 44.1k *regardless of constraints*; forcing 44.1k real-time-resampled the KT's 48k input and ~doubled FSK timing jitter → dropped dense sequence pages (the bug that "worked for months" because patches tolerate it). Fixed v0.8.5 by requesting native rate + reading `audioContext.sampleRate` in the trim's bit-math. **Decode ground-truth: always use the `jx3p` CLI** (`wav-to-json`) — hand-rolled REPL framing lies.
28. **Name-restore can MASK a decode failure.** Fingerprint-history re-attaches patch names even when the decoded data is empty/junk, so a bad capture can *look* fine. Verify a decode by the DATA (populated pages / non-identical patches), never by whether names appeared. (`isDecodeAllDefault` / `allPatchesIdentical` are the real guards.)
- **Calibration is the fallback** (auto-decode is primary): manual two-pass aims the level meter's **yellow target** (`TARGET_PEAK = 0.45`, gain cap 12× — the v0.8.6 guardrails that stop the over-hot loop). One recovery on failure: **Try again** / **Calibrate** (the old "Reset to auto-decode" branch was removed in v0.8.5). ⚠ the `0.45`/`12` live inline in `app.js`; `calibration-math.js` still defaults `0.45`/cap **30** (not mirrored — Phase-1 cleanup item).

### Sequencer
13. **Tone vs Sequencer use different JX keys.** Tone = 14/15/16 (Save/Verify/Load); Sequencer = 11/12/13. `buildJxKeyDiagram({kind})` swaps them — never hardcode "14/15/16".
14. **The calibration modal hides its Stop button** — auto-stop fires from `tickMeter`; exposing Stop made users truncate the measurement.
16. **JX-3P REST / TIE / NOTE encoding (the editor must match the firmware).** Full rules + the cell-color/tooltip logic are commented at `seq-insert-rules.js` and the `insert*AtStep` functions. Essentials: REST → all prev-column attacks become tied voices; TIE → canonical `{tied,attack}` pairs when ≤3 voices fit, else fresh-attacks-only (polyphonic TIE is data-identical to a chord re-strike); NOTE is blocked on any column that has a tied voice; fully-empty step = `byte7 = 127`.

### Patch data / code organization
7. **Knobs cap at ±140°.** `paramToAngle` expects continuous 0–255 or `DISCRETE[param]` index — clamp first.
18. **Shadow-bug class: two-file global override.** Pure-logic modules publish via `Object.assign(window, exports)` in `<script>`-tag load order, so the same export name defined in two files silently overrides (ESLint `no-redeclare` won't catch it — it's IIFE-scoped). When adding an export, grep the name project-wide first.
24. **`sanitizeWavFilename` APPENDS `.wav`** — it's the WAV-export helper. Using it on a non-WAV name gives `Name.wav.json`. Strip the suffix or extract a base sanitizer.
25. **A WAV that decodes to nothing must be REJECTED, never applied or re-routed in a loop.** Tones⇄Sequence auto-reroute is one-shot (`planImportReroute`); every apply-to-active-banks path runs the all-default/identical guard before snapshotting. Gate new import entry points with `describeUnsupportedImport` (names MP3/MP4/etc.) AND `describeOversizedImport` (100 MB WAV / 25 MB JSON ceiling — a real dump is a few MB; both pure + tested in `record-flow.js`). *(Junk = anything whose FSK timing is gone — lossy re-encode, a baked-in metronome click, etc.)*
30. **The quit-flush MUST stay synchronous.** `saveLibraryDebounced` writes 500 ms after the last edit; a rename/reorder made just before quit would die with the unfired timer (silent revert on next launch). `flushLibrarySave` on `beforeunload` (app.js) flushes it — via `saveLibrarySync`/`ipcRenderer.sendSync` (the `save-library-sync` channel in main.js), NOT an async `invoke`. Electron does **not** await async work begun in a beforeunload handler, so an invoke races the teardown and drops the write. Don't "simplify" the sync path back to invoke. (Verified live by stretching the debounce to 10 min: disk stays stale while running, flips only at quit.)

### Audio routing
21. **JX-3P Memory Protect silently discards tape-load writes.** Switch ON → the JX accepts the audio, completes the load, reports nothing, saves nothing. Undetectable in tape mode (no return channel). Surfaced via a Send-modal sub-line. MIDI (Phase 3) sidesteps it entirely.
22. **macOS CoreAudio "dormancy" can make `setSinkId` silently no-op** (returns resolved, routes nothing) after a macOS update / renderer reload / idle. User workaround: System Settings → Sound → click built-in speakers, then the USB device, to wake the routing graph. Below the layer JP can fix.

### Lending / site / release
8. **Loop suppression matters in Phase 3 (MIDI)** — inbound CC must not trigger outbound CC. Spec §3.5.1.
19. **The logo lives in TWO files** — `renderer/assets/jp-logo.png` (panel) and `docs/assets/img/jp-logo.png` (site). Update both + regenerate favicons via `sips`.
20. **The site's download CTAs all point at `/releases/latest`** — never hardcode a version. The PC (beta) button is the one exception (points at the current `vX.Y.Z-win-preview` tag).
23. **Relay-filed lending issues are authored by Daniel's own PAT** — GitHub never notifies you of your own activity, so `lending-notify.yml` @mentions him (a mention from another actor *does* email). Don't remove it. The Worker PAT (`jp-patches-lend-relay`, Issues-only) expires ~June 2027 → renew + `wrangler secret put GITHUB_TOKEN`.
29. **The win-preview `.exe` is ~107 MB** — `gh release create … <exe>` can time out the upload and leave the release a **DRAFT** (no git tag → the site button 404s). Upload the exe in a separate backgrounded step and verify `gh release view --json isDraft` is `false`; publish a stuck draft with `gh release edit … --draft=false`.

### Windows port  *(round-trip verified on real HW 2026-07-04; hard-won lessons)*
31. **jx3p MUST run via `runJx3p`/`execFile` (argv array), never a shell string.** `cmd.exe` mangles the quoted `uv run … "path"` command, so jx3p reads the wrong/empty input and returns **32 default patches with `decode:"success"`** — a silent empty decode, NOT an error. This cost hours (a shell-string decode looked fine but imported nothing). Verify a Windows decode by DATA (`patches.banks[0][0]` params changed) or the jx3p CLI — never by "it said success."
32. **Windows input runs QUIETER than the Mac rigs** (~0.04 raw ≈ 0.086 at the 2× default — under the old 0.10 amplitude floor). **RESOLVED by frequency-aware live detection (trap #36, July 2026):** the live loop now detects the dump by bit-0 FREQUENCY, amplitude-independently, so a quiet dump decodes at the default gain with NO calibration (verified: full 32/32 tones + sequence round-trips on Windows). Calibrate remains a fallback but is rarely needed. Don't lower the Mac defaults to compensate.
33. **Windows labels USB *outputs* "Speakers (…)" / "Headphones (…)"** → collided with the speaker-detection regex. (a) a saved USB cable got flagged "routed to speakers" (fixed — trust an explicitly-saved device); (b) the tape-dump-sound **record MONITOR grabbed the cable itself and truncated sends** → was gated off on win32. **BOTH RESOLVED (Task #21, July 2026):** narrowed `WIN_SPEAKER_RE` + cable-exclusion by device GROUP (`selectSoundOutputDevice`), and — the robust fix — all app audio (button sounds, sequencer preview, record monitor) now shares ONE resolved sink that excludes the actual **capture-input device** by groupId, so it works for any interface + any speaker name. Monitor is **re-enabled on Windows**. Preview also needed a startup `setPreviewSink` call (it only ran on device-change before → silent on a fresh launch).
34. **Windows exposes ONE physical device under multiple deviceIds** ("default" / "communications" / raw hash). Exact-id matching (cable exclusion, per-device `calibratedGain`) can miss a sibling id of the same device — match by group/label instead.
35. **Capture dead-ends already ruled out — don't re-chase.** AudioContext is `'running'` on Windows (NOT suspended). Windows **Sound Recorder** proved cable + capture are fine — use the jx3p CLI as decode ground-truth. The JX-3P flashing keys **11–16 at end-of-load = its tape-load ERROR** (incomplete/bad data), NOT a hardware fault; here it meant our send was truncated — never blame the 40-year-old synth.
36. **Live capture detects the dump by FREQUENCY, not loudness (July 2026).** `record-trim.js`'s bit-0 detector (`fskPresentInWindow`/`fskShortCycleRate`) runs live in `audio-capture.js` (rolling ~0.5 s window, every 120 ms) and feeds an `fskLive` gate into `updateCaptureState` — replacing the amplitude signal test (falls back to amplitude when the gate is absent, so the old unit tests still hold). This is what fixed quiet-input Windows capture (trap #32) AND stopped the JX idle buzz from false-triggering the progress. **Threshold `FSK_LIVE_SHORT_PER_SEC = 120`** sits between the boosted idle buzz (~30–84/s measured) and real FSK (150–500+/s). **Dump structure (sourced: phaysis.com decoder + the jx3p codec):** a tone dump is `[4096-bit pilot ≈4.6s][bank C][4096-bit pilot][bank D]` — the inter-bank "divider" is a *second pilot tone* (all binary-1 at 882 Hz → reads as no-FSK). So `END_OF_DUMP_SILENCE_MS = 7000` (in `capture-state.js`) MUST stay above that ~4.6 s pilot or the capture truncates to bank C only (16 patches, bank D all-default). Sequences have no long inter-bank pilot (48-bit separators) so they're lower-risk. **Known follow-up:** the Record progress *timeline* is now out of sync with these gate timings — see `docs/future-features.md`.

## When in doubt

- Read the spec/design doc before building a new feature; skim recent Releases before changing user-visible behavior.
- **Ask Daniel before destructive changes** (force-push, history rewrite, file deletes).
- **Verify visual + capture changes in the running app**, not just by file inspection — SVG injection + runtime tagging, and the capture pipeline, hide subtle issues. (Drive the dev build, which runs as "Electron" — distinct from the installed "JP Patches".)
