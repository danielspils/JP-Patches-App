# Future features

Single source of truth for features that aren't on the formal roadmap (`library-and-midi-spec.md`) yet. Move items into the spec when they're scoped enough to schedule.

> **Reconciled 2026-06-14.** Many items below had shipped but were still listed as "to build." Everything verified against the code and moved to "Recently shipped" (pointers) if done. What remains under the other headings is genuinely open. The authoritative shipped record is the GitHub Releases page + `CLAUDE.md`.

## Recently shipped (pointer)

- **Auto-calibration — "Calibration Celebration"** (v0.8.2, June 14, 2026). No mandatory Record-from-JX volume calibration; capture at `DEFAULT_CAPTURE_GAIN` + decode-time boost. Root cause + the rejected-sweep lesson live in CLAUDE.md's "Calibration Celebration" theme; decision logic in `renderer/record-flow.js`.
- **User Lending Library** (v0.8.0, June 10–11, 2026) — *was "Community library Phases 1+2".* Borrow + lend patches/sequences in-app and on jx-3p.com, Cloudflare Worker relay, auto-publish + withdraw, hearts/borrow counts. The whole Phase 1 (site) + Phase 2 (in-app browser) + share/lend vision shipped. See CLAUDE.md "User Lending Library".
- **Preserve names/dates across cross-user WAV sharing + paired-patch auto-load** (v0.6.5) — *was "Data interchange".* jPpS chunk v:2 (slotMeta + sequenceMeta, originalName + createdAt); paired-patch auto-loads onto the PG-200 as a non-destructive preview, Write commits it.
- **Audio routing — cable device-pinning + Audio Settings modal** (v0.7.0–v0.7.1) — *was "Audio routing".* `setSinkId` pins transmission; Audio Settings modal is the single source of truth for routing; ghost-device handling; Audio Diagnostics folded in.
- **Sequencer editor** (visualizer v0.5.13, full editing v0.6.0). Piano-roll visualizer + click-to-insert NOTE/REST/TIE, vertical pitch-drag, marquee multi-select, keyboard delete, save-as-new-copy.
- **Cmd+Z / Cmd+Shift+Z in the sequencer editor** (v0.6.0). Every editor mutation snapshots onto the app-wide undo stack (`applySeqUndoOrRedo`, `cloneSeq`, `originalSequenceSnapshots`).
- **▶ Play button — audition a sequence in-app** (v0.6.x). `seqPlayState` step engine with rate control + `:||` repeat toggle in the editor.
- **Record Step-2 two-state animation** (v0.6.4). Capture mode centers the JX-key diagram, then shifts as signal arrives (`.capture-mode` CSS).
- **Library schema versioning + migrations** (`renderer/library-schema.js`). `schemaVersion` + a migration chain that runs at load; the v1→v2 provenance repair is live.
- **Apple Developer ID + notarization** (May 29, 2026). Signed + notarized DMGs ship via `scripts/release.sh`; auto-update works.
- **Capture-pipeline reliability sweep + internal refactor** (v0.5.13). 6 pure-logic modules, global error banner, per-capture telemetry, ESLint+CI+JSDoc. See `release-notes-0.5.13.md`.
- **Record from JX-3P + (then-two-pass) auto-calibration** (v0.5.11) — see `record-from-jx.md` (predates v0.8.2 auto-calibration; the auto-decode flow supersedes its mandatory-calibration default).
- **Record/Send modal hardening + sequence library-send simplification + README audio-setup guidance** (May 24–25, 2026). Live-threshold scaling, per-kind dump budgets, meter hysteresis, shimmer label; the "truncation not jitter" diagnosis (10/10 bit-perfect KT captures); README Option A/B + 44.1/48 kHz guidance.

## Ready to build

- **README screenshots refresh.** Current screenshots predate the vintage cream palette and the Custom Banks redesign. Capture fresh screenshots and embed in the README.

- **Visible DUMP PROGRESS bar during *capture*.** *Partial — auto-stop in capture mode shipped; the calibration-mode red gradient progress bar isn't reflected in capture.* Capture has the segmented timeline + elapsed counter but no dynamic "dump is N% complete" bar like calibration. Re-parent / show the existing `calProgressSection` in capture mode and drive it from `totalSignalMs`. ~30 min.

- **Library sync across machines** (Daniel, 2026-06-14). Daniel runs JP Patches on two Macs (upstairs MacBook/JX, downstairs Mac Mini/JX) and wants his library — patches, sequences, custom banks, names — in sync. State lives in `~/Library/Application Support/jp-patches/library.json`. Three approaches, increasing effort/safety:
  - **(a) Cloud-symlink (no code, today).** Point both Macs' `library.json` at a file in iCloud Drive / Dropbox. **Works for *sequential* use** — use one Mac at a time, quit the app, let the cloud sync, then open on the other. **Risk:** running both at once → last-writer clobbers (the app loads the file into memory at launch and writes on change; it doesn't watch for external edits). Also `record.calibratedGain` is per-device (per-machine KT deviceId/gain) — syncing it could carry a wrong gain across machines, though post-v0.8.2 auto-calibration that barely matters. Document the "quit before switching" discipline.
  - **(b) Explicit Export / Import library (small feature, ~1–2 hr, SAFE).** A "File → Export Library…" that writes one portable JSON (optionally excluding device-specific `record`/`zoom`), and "Import Library…" that merges or replaces. Deliberate, no race, carry it via AirDrop/USB/cloud. Recommended first step — gives Daniel sync today without the clobber risk, and is a real user feature.
  - **(c) True background sync (project).** Watch the file, merge on conflict (per-entry, by id + timestamp), handle the device-specific fields. Real work + conflict UX. Only if (b) proves too manual.
  - **Recommendation:** ship (b); it's the safe, low-effort win and useful to all users, not just two-machine owners.

- **Multi-capture reliability mode for Record** (design ready, build only if real-world failures appear). The 10-of-10 KT bit-perfect test showed Record is deterministic with current software, so not needed for v1 — but fully designed. Do 3 (or N) back-to-back captures, merge at the page level (keep the first checksum-valid copy of each page across captures). Merged success after N captures = 1 − (1−p)^N. Toggle in Settings, default off; half-day build, mostly the modal state machine. Ship only if a user reports persistent flakiness on hardware we can't access.

## User manual content

When JP Patches gets a real user manual (README, in-app help, or `USER_MANUAL.md`), document these sequencer-visualizer nuances so users aren't surprised:

- **REST vs TIE — what the colors and tooltips mean.** From CLAUDE.md pitfall #16 + empirical JX-3P testing. RED = new attack; GREEN = held/tied continuation (REST or polyphonic carry-over); BLUE = single-voice TIE (same pitch tied + re-struck); faint-blue full-column tint = silent step. Polyphonic TIE renders RED but the tooltip reads `tie` (the wire data can't distinguish it from re-playing the chord). Single-voice TIE re-articulates smoothly; polyphonic TIE is a cleaner chord re-strike.
- **6-voice polyphony per step.** The data format has 7 voice slots; the synth plays 6. The editor caps inserts at 6.
- **REST and TIE are "whole-step" events.** Can't add them to a column with other notes — they need an empty step. To rest an existing step, delete its notes first.
- **8 pages × 16 steps = 128 steps max.** Unprogrammed pages render as faint blue tinted columns; the library treats null pages as 16 rests for display.

## Distribution

- **Mac App Store publish.** Paid distribution of the same code-signed/notarized app with auto-updates; listing points users to the free GitHub build. (Developer ID is already done.)

## Audio

- **Patch sound samples.** Record a short fixed-note sample per patch so users can preview without selecting on the synth. Open questions: capture method (manual? auto at save?), storage (base64 in `library.json`? sidecar files?), playback affordance. Probably v2-era — reliable capture wants MIDI to drive the synth.

## Platform

- **Windows port.** ~1–2 days of code (swap `titleBarStyle`, ship Windows `uv.exe`, add `--win` target). Real blocker is testing — no Windows hardware on hand. Worth doing when a Windows-using JX-3P owner volunteers to smoke-test.

- **Adaptive app sizing + larger zoom presets (125/150/200%).** Window is locked at 1140×710, `resizable: false`. Drop the lock, set `minWidth`/`minHeight` + a max-width/aspect constraint so the panel SVG doesn't stretch on big monitors. The larger zoom presets need a screen-bound check + graceful clamp (at 150% on Daniel's 1147×719 screen the 1710×1065 window overflows) and re-center on the active screen. Most CSS uses `100vw` calcs that are correct but visually unverified off 1140 — 2–4 hr of breakpoint testing; the Custom Banks bucket grid is the highest-risk area.

## Blocked

- **MIDI integration (v2).** Full bidirectional CC sync with the JX-3P. Blocked on installing the Series Circuits JX-3P MIDI Upgrade Kit. CC map + architecture in `library-and-midi-spec.md` §Phase 3.

## Library metadata

- **Per-patch event log (Patch History v2).** The Patch History modal today shows static provenance rows (Name / Library / Created / Created by / Hometown / Lent-to-library / Origin — polished v0.8.x). A richer version would carry a chronological event trail per patch (created / renamed / copied / edited) as dated rows. Sketch: each slotMeta entry grows an `events: []`; saves diff against prior state and append `{ when, kind, detail }`; edits log at save time only. Migration seeds existing patches with one synthetic snapshot entry. ~2–3 hr. *Nice-to-have, not a gap — the static modal covers the common need well.*

## Community library

- **Audio previews per sequence** (deferred, decide after submissions land). 10-second MP3 captured at submission time, rendered inline on the site (`<audio>`) + surfaced via the manifest's `audioPreviewUrl` for the in-app explore modal. ~50 KB/file; lets users audition before borrowing.

## Smaller polish

- **Delete-confirm guard for lent items.** Deleting a library item that has a `lending` record also deletes its secret withdraw token — the only self-serve way to pull the published entry from the lending library (discovered 2026-06-11; the orphaned entry is then removable only via `scripts/remove-lend.sh`). Fix: when the trash confirm fires on an item with `item.lending`, add a line — "This also removes your ability to withdraw it from the lending library." ~15 min.

- **App-level Undo/Redo.** The macOS Edit menu's Undo/Redo are omitted because they'd only undo text edits in name fields — not "undo the last knob twist / patch load / custom-bank reorder". A real version needs an action-history stack with an inverse per persistent action (~15 entry points). The sequencer editor already has its own undo (shipped v0.6.0); this is the app-wide generalization. Small-to-medium; worth doing once the v1 surface stops changing weekly.

## Code quality / infrastructure

- **Integration tests for modal flows (JSDOM).** The 469 unit tests cover pure-logic modules; zero cover modal lifecycles. The 2026-05-25 silent-failure bugs (runningPeak/recordBtn ReferenceErrors, swallowed rejections) would have been caught by a thin JSDOM harness that mounts a modal, fakes IPC, simulates a click, and asserts the next state or a surfaced error. ~3–4 hr; highest-leverage missing safety net.

- **AudioWorklet migration.** `ScriptProcessor` (in `setupAudioGraph`, `audio-capture.js`) is deprecated; Chromium will remove it eventually. `AudioWorklet` is the replacement (lower latency, own thread). ~half day, mostly mechanical — but it processes in 128-sample blocks, so the `captured.push(...)` accumulation changes shape.

- **More `app.js` extractions.** `app.js` (~9,000+ lines) hot spots: `setupInteraction` (~280 lines of knob/switch/button wiring, untested); `renderPatchList` + family; the `showConfirmModal`/`showSaveSequenceModal`/`showSendToJxFlow` modal infrastructure (could share more builders — see the `record-flow.js` / `buildRecordTimelineSection` extraction pattern). 1–2 hr each; pick the most-edited or most-bug-prone.

- **Capture-lifecycle factory.** `showRecordFromJxModal`'s audio lifecycle is mostly delegated already; the remaining inline bit (~12 lines: AudioContext creation, raf-loop, node cleanup) could fold into a `createCaptureSession({onTick, onAutoStop})` factory. ~3 hr, medium risk (the callback API must surface every inline DOM mutation). Modest gain until `app.js` shrinks further.

- **Property-based testing on the pure-math modules.** `fast-check` random inputs asserting invariants (`gainToSlider(sliderToGain(x)) ≈ x`, `computeFskTrim` trimStart ≥ 0, `paramsFingerprint` order-independence). Catches edge cases hand-written tests miss. Do if a math bug ever escapes — not pre-emptively.

- **(Add new items here as they come up.)**
