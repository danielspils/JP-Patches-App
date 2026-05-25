# Future features

Single source of truth for features that aren't on the formal roadmap (`library-and-midi-spec.md`) yet. Move items into the spec when they're scoped enough to schedule.

## Recently shipped (pointer)

- **Record from JX-3P + two-pass auto-calibration** (v0.5.11, May 23–24, 2026) — see [`record-from-jx.md`](record-from-jx.md) for the shipped-feature reference. Per-device gain memory, failure-triggered recalibrate prompt, panel-style JX-3P key-sequence diagrams in both Record and Send modals.

- **Record / Send modal hardening + package-label shimmer animation** (post-v0.5.11, May 24, 2026). Several capture-reliability bugs surfaced during real-world testing of Record-from-JX and were fixed in a single sweep:
  - **Single source of truth for Send-to-JX** — Tone Load button now always sends the active C/D banks (not a library package directly). Library packages must be loaded into active banks first (one click on hover-LOAD), which is now undoable. Eliminated the dual-source ambiguity that was overwriting recent imports with old library data.
  - **Live-threshold scaling** — `tickMeter`'s SILENCE/SIGNAL classifier now scales with current gain (same math as the trim classifier in `stopRecording`). Without this, at calibrated gain > ~4× the JX's between-dumps idle tone was being counted as signal, inflating `totalSignalMs` and firing the auto-stop mid-dump for sequences.
  - **Per-kind dump-duration budgets corrected** — `EXPECTED_SIGNAL_MS` was 21000 ms for sequences and 33000 ms for patches, both based on incorrect estimates. JX-3P FSK dumps are content-variable: ONE bit = 50 samples, ZERO bit = 11 samples (4.5× wall-clock asymmetry). Real ranges: patches 25–58 s, sequences 6–28 s. New budgets: patches 60000, sequences 30000 — sized above the absolute worst case so the silence-after-signal trigger reliably wins for normal captures.
  - **Meter hysteresis + falling-edge debounce** — the SVG vertical level meter (`buildVerticalLevelMeter`) had no hysteresis, so the bottom segment flickered between cream and blue on mic noise at the 0.02 threshold. Added 25% hysteresis and a 6-tick (≈100 ms) debounce on falling edges to suppress the JX's varying-amplitude post-dump noise tone.
  - **Kind-aware recalibrate prompt copy** — the failure-decode prompt was hard-coded with "empty patches" / "active C/D banks will not be modified". Now reads "empty sequence (no pages decoded)" / "existing sequences will not be modified" when triggered from a sequence capture.
  - **Send modal Step 1 stripped to header + buttons** — removed the 3-step setup instructions and the sequence-only paired-patch / notes display from Step 1. Modal width 420 px in Step 1, expands to 560 px in Step 2 (timeline + sendRow). Dead code path `buildSequenceIntro` removed.
  - **"Saving: …" / "Loading: …" label below the logo** — each modal variant now shows what package is being captured (auto-default name preview) or sent (sourceLabel). Cream-secondary verb + italic vintage-cream name per the design system.
  - **Shimmer-through-text animation on the package label** — when transmission/capture is active (parent row `.playing`), the package name gets a subtle left-to-right brightness wave through the text — the text analog of the arrow's marching-dash animation. Freezes to solid when Send-modal playback ends (`.complete` class on the label), matching the arrow's freeze pattern.

  **CLOSED — was truncation, not jitter:** initial diagnosis was that sequence captures decoded 0/8 or 1/8 records due to phase jitter in the KT USB Audio path. Empirical re-test (May 25, 2026) after the budget fix shipped: **10 of 10 consecutive sequence captures on the same KT cable decoded bit-perfect against a gnarly 8-of-8-page-populated source**, despite zero-crossing-interval outliers ranging 0.65–1.08 % per capture (8–10 × the jitter rate that "failed" Spils Sequence). The original failure was almost entirely truncation — pre-fix the 21000 ms budget chopped Spils dumps short (real length ~27 s), leaving the decoder with incomplete bits; page 3 just happened to land before the cut-off. The decoder + the protocol's built-in 2× per-page redundancy absorb the jitter level produced by cheap USB cables without issue.

- **Sequence library-send simplification** (May 24, 2026). The "Send sequence to JX-3P" modal (Step 1) was carrying a paired-patch read-only field, a notes read-only field, and a 3-step setup checklist. All removed. Modal is now header + 3 action buttons (Cancel · Save WAV file · Send to JX-3P). Paired-patch context is still visible via the Library row's hover-info icon.

- **Audio setup hardware recommendations in README** (May 24, 2026; revised twice on May 25). Added an "Audio setup (Tape Memory hardware path)" section between the Tape Memory quick reference and the Library section. **Initial v1 wording (May 24)** was too pessimistic about USB cable adapters based on the (since-debunked) jitter hypothesis. **First revision (May 25 AM)** documented two equivalently-reliable paths. **Second revision (May 25 PM)** further softened the sample-rate guidance after empirical testing:
  - **Option A** — Single USB-C → 1/4" TS audio cable (KT, J&D, Tisino, ART TConnect, etc.). Caveat: single jack → physical swap workflow between Send and Record.
  - **Option B** — Dedicated USB audio interface with separate I/O (UA Volt 2, Focusrite Scarlett 2i2). Same reliability; nicer ergonomics (no swap).
  - **Sample rate:** 44.1 kHz preferred when configurable. **48 kHz also tested working** on both directions (KT input locked at 48 + KT output toggled to 48 + JP decoder = all transfers successful: tone, sequence-sparse, sequence-gnarly). The JX-3P's analog tape input is tolerant to OS resampling artifacts because it's a 1983 cassette circuit with very loose timing requirements; the decoder absorbs Record-side jitter via the protocol's 2× per-page redundancy.

  Both options + both sample rate configs validated empirically against gnarly content on Daniel's setup. Once a real interface gets bench-tested too, swap "etc." in the Option B list for named, confirmed products.

## Ready to build

- **README screenshots refresh.** Current screenshots predate the vintage cream palette and the Custom Banks redesign. Capture fresh screenshots and embed in the README.

- **Sequencer visualization + editor (with paired-patch tie-in).** Today the Library Sequences tab shows each sequence as a single row — name, save date, paired-patch reference via the ⓘ icon. No way to SEE the actual notes inside, no way to edit them in JP. The JX-3P sequencer's data is structured (8 pages × 16 steps × 7 voices) and we already preserve every byte on roundtrip, so a visualization layer is buildable.

  **Two layout options worth prototyping:**

  - **Step grid** (closest to how the JX-3P internally represents data): 16-column × 7-row grid per page, each cell showing the note name (e.g. "C4") or empty. Page selector switches between pages 0-7. Tied notes get a subtle horizontal connector to the previous step. Pure HTML grid, easy to build (~3-4 hours), most "honest" to the hardware model — but reads more like a spreadsheet than music.

  - **Piano roll** (MIDI-style horizontal pitch grid): vertical axis = pitch (MIDI 36-84, the JX keyboard range), horizontal axis = time (16 steps × 8 pages = 128 columns). Each note rendered as a colored bar; tied notes are elongated bars spanning multiple steps. Voice density at any step shown by stacked bars. More musically intuitive, requires SVG (~6-8 hours).

  - **Musical notation** (standard staves with note durations) — discussed and parked. HARD: requires a music engraving library (VexFlow, OpenSheetMusicDisplay, ~250-500 KB), time-signature interpretation is ambiguous from JX data (the sequencer's "step" doesn't map to a fixed note duration without user input on tempo/meter), and standard notation is read-only by nature so doesn't help with the editor side. Could be added as a third VIEW option on top of the step grid or piano roll, but only after the primary editor lands.

  **Paired-patch tie-in:**
  - The sequencer's audible result depends entirely on which patch is loaded — same sequence sounds completely different through a bass patch vs. a pad. Each Library Sequence carries `app.pairedPatch.{bank, slot, params, patchName}` (set at save time, preserved across all roundtrips today).
  - In the visualization: header shows "playing through: C5 / Warm Pad" with a one-click "Load paired patch to active C/D" action (replacing the in-app Load action that was removed 2026-05-25 specifically because it was confusing in isolation — but in this context, where the user is visualizing a sequence and wants to hear it, the action has clear purpose).

  **Editor side** — minimum viable:
  - Click an empty step → add a note (defaults to selected pitch or last-edited)
  - Click an existing note → cycle through voice slots, or context menu (delete, transpose, tie to previous)
  - Drag a note vertically → transpose
  - Save → write back into `library.sequences[i].tape.pages`

  **Effort:** 1-2 weekend days for a read-only step grid; 2-3 days for a usable editor; +3-4 days each for piano roll layout and musical notation if added later.

  **Why parked:** v1 ships fine without it. The paired-patch data is already collected, so when this lands the historical data is ready to use. Build when sequencer manipulation feels like a real user request rather than a "nice to have."

- **Multi-capture reliability mode for Record (design ready, build only if real-world failures appear).** Conceived May 25, 2026 when sequence Record was suspected to be probabilistic on cheap USB cables. The 10-of-10 KT bit-perfect test the same day showed Record is now deterministic with current software, so this isn't needed for v1 — but the design is fully worked out and worth shipping IF future user reports surface intermittent Record failures on hardware we can't anticipate.

  **Idea:** instead of one ~28 s sequence capture, do 3 (or N) back-to-back, then merge at the page level — for each page, keep the first capture where that page passed checksum from EITHER of its two internal JX-3P transmissions. Final result: one Library entry assembled from the best fragments across N captures.

  **Math:** if single-capture per-page success is p, then merged success after N captures = 1 − (1−p)^N. So even at p=0.4, N=3 gets you 92 %; at p=0.8, N=3 gets 99.2 %.

  **UX:**
  - Toggle in Settings: "High-reliability Record (3× capture)" — default off.
  - When on, the Save-from-JX modal walks the user through 3 sequential captures with a "page X of 8 confirmed across captures" progress indicator after each one.
  - User has to press Tape Memory + Save on the JX once per capture (~1.5 min total wall-clock instead of ~30 s).

  **Implementation:**
  - JS: a multi-capture controller wraps the existing single-capture path; collects N captures into an array; calls a page-merge function after the Nth.
  - Page-merge: re-runs the decoder on each captured WAV (or threads decoded `pages` arrays from each), iterates pages 0–7, picks the first non-null entry.
  - Estimated effort: half-day. Most of it is the modal state machine / UX, not the merge logic.

  **Why parked:** at the current per-capture success rate (~100 % on KT after May 25 fixes), this is over-engineering. Ship only if a user reports persistent flakiness on hardware we don't have access to.

- **Modal animation: two-state Record-from-JX Step 2.** Today the capture modal (Step 2 of 2: Data dump from JX-3P) shows a static layout: `[JX key diagram] [arrow] [JP logo] [level meter]`. Once the user presses Save on the JX and FSK signal starts arriving, the diagram is no longer informational (the user has already done their part) and the JP logo isn't carrying its weight (it's just there). A cleaner two-state design would shift focus as the transfer progresses:

  - **State A — waiting**: `[JX key diagram visible] [arrow] [level meter]`. JP logo hidden. Emphasizes "press these keys on the JX."
  - **State B — receiving**: `[JP logo fades in / diagram fades out, same slot] [arrow] [level meter]`. Emphasizes "transfer is happening, JP is receiving."

  **Trigger**: `firstSignalMs` becomes non-null in `tickMeter` (i.e. peak first crosses `SIGNAL_THRESHOLD_LIVE`). Already wired for other things — adding a CSS class toggle is one line.

  **Implementation** (Option B from the 2026-05-24 design discussion):
  - Wrap `jxKeyDiagram` and `record-jx-jp-logo` in a shared `record-jx-leftstage` div (`position: relative; width: 180px`).
  - Both children get `position: absolute; inset: 0; transition: opacity 0.5s ease`.
  - Default: diagram opacity 1, logo opacity 0.
  - When `calRow.classList.add('transmitting')` fires, opacities swap.
  - Level meter and arrow are NOT in the stage — they stay physically anchored so the user's eye stays focused on the live meter during the actual transfer.

  **Edge cases**:
  - Cancel mid-transmission: next modal open resets to State A (fresh DOM).
  - Pre-roll noise crossing threshold before Save: gate the `.transmitting` toggle on `fskStartMs !== null` (silence-then-signal pattern) rather than `firstSignalMs` alone, so loose noise doesn't fire the transition prematurely.
  - Sequencer captures: same component, same animation — no kind-specific changes needed.

  **Effort**: ~30–45 min. Most of the cost is restructuring the left-slot DOM + CSS; the trigger wiring is trivial.

  **Why deferred**: nice polish but not blocking — the current 4-element layout already works, just isn't telling a story about transfer progress. Pick up alongside any other Record-from-JX UX work.

## Distribution

- **Apple Developer ID + notarization.** Drop the "damaged" Gatekeeper dialog on download. $99/yr, one-time setup of signing/notarization in `electron-builder` + Apple's `notarytool`. After setup, every release auto-signs.
- **Mac App Store publish.** Paid distribution of the same app, code-signed and notarized, with auto-updates. App Store listing would point users to the free open-source GitHub build. Depends on the Developer ID being set up first.

## Audio

- **Patch sound samples.** Record a short audio sample (a few seconds, fixed note + velocity) for each patch so users can preview a patch without selecting it on the synth. Open questions: where the audio is captured (manual record? auto-sample at save time?), where it's stored (per-patch in `library.json` as base64? sidecar files?), what playback affordance lives in the patch list. Probably v2-era since reliable capture wants MIDI to drive the synth.

## Platform

- **Windows port.** Electron makes this ~1-2 days of code work (swap `titleBarStyle`, ship Windows `uv.exe`, add `--win` target to `electron-builder`). Real blocker is testing — no Windows hardware on hand. Worth doing only when a Windows-using JX-3P owner volunteers to smoke-test, or after Mac notarization is done so it's not the highest-leverage next step.

- **Adaptive app sizing + larger zoom presets.** Window is currently locked at 1140×710 with `resizable: false`. On big displays the app appears as a small fixed window with dark space around it; on Macs smaller than 1140 wide, content gets clipped offscreen. Drop the resize lock, set a sensible `minWidth`/`minHeight` floor, add a max-width / aspect-ratio constraint so the panel SVG doesn't stretch on giant monitors. The View menu already ships **75%** and **100%** presets (both scale the window AND the renderer together, no clipping). The corresponding larger presets — **125%**, **150%**, and **200%** — are deferred until the resize lock is fully dropped: at 150% on Daniel's 1147×719 logical screen, the resulting 1710×1065 window would overflow off the right and bottom of the display, so the resize call needs a screen-bound check and graceful clamp (and the window should re-center on the active screen). 125/150/200% are the standard scale set for audio/synth apps (Logic Pro, Ableton, Native Instruments) — keep that exact ladder when shipping. Most of the existing CSS uses `100vw`-based calcs that are mathematically correct at any width, but visually unverified at sizes other than 1140 — expect 2-4 hours of testing + tweaking at a few intermediate breakpoints, plus the 4 zoom presets above and below. The bucket grid in the Custom Banks builder is the highest-risk area to re-verify.

## Blocked

- **MIDI integration (v2).** Full bidirectional CC sync with the JX-3P. Blocked on installing the Series Circuits JX-3P MIDI Upgrade Kit. CC map and architecture are already in the spec doc — see `library-and-midi-spec.md` §Phase 3.

## Data interchange

- **Visible DUMP PROGRESS bar during *capture***. *Partial — auto-stop in capture mode shipped 2026-05-24; the calibration-mode red gradient progress bar isn't yet reflected in capture.* In capture, the user has the segmented WHAT THE JX-3P SENDS timeline (structural) and the elapsed-time counter, but no dynamic "the dump is N% complete" bar like calibration has. Adding the same `.record-jx-cal-progress-*` bar to capture would give clearer "wait, the JX is still transmitting" feedback. Estimate ~30 min — re-parent / show the existing `calProgressSection` in capture mode and drive it from `totalSignalMs` like calibration already does.

## Library metadata

- **Per-patch event log (Patch history v2).** Today the Patch history modal shows two static lines: current slot + library, and a single origin line with the upload date. A richer version would carry a chronological event trail on each patch — created, library renamed, copied into another library, edited (with which params changed), renamed. Modal would render each event as one dated row, so the patch's full story is visible at a glance. Shape sketch: each slotMeta entry grows an `events: []` array; saves diff against prior state and append entries with `{ when, kind, detail }`. Edits log only at save time, not per knob twist, to keep the trail readable. Migration: existing patches start with one synthetic `Snapshot recorded …` entry using the current snapshot date — the real first-upload date is unrecoverable for libraries that predate the event log. Estimated 2–3 hours including diff logic, schema, migration, and modal redesign. Data cost is small (≈80 bytes per event; a heavy user with 10 libraries × 20 events per patch is still under 1 MB).

## Smaller polish

- **App-level Undo/Redo.** The macOS Edit menu's Undo/Redo items are currently omitted because they would only undo text edits inside name fields — not the much more interesting "undo the last knob twist / patch load / custom-bank reorder". A real Undo/Redo would require an action-history stack: push an inverse operation each time the user does something with persistent effect (knob change, switch toggle, slot rename, patch load, custom-bank slot edit, package save/delete, sequence save/delete). Add the items back to the Edit menu and bind Cmd+Z / Cmd+Shift+Z. Estimate: small-to-medium — the history infrastructure is straightforward but the universe of "undoable actions" is wide (~15 entry points) and each one needs an inverse defined and tested. Worth doing once the v1 surface stops changing weekly.

- **(Add new items here as they come up.)**
