# Future features

Single source of truth for features that aren't on the formal roadmap (`library-and-midi-spec.md`) yet. Move items into the spec when they're scoped enough to schedule.

## Recently shipped (pointer)

- **Capture-pipeline reliability sweep + internal refactor** (v0.5.13, May 25–26, 2026). 18-commit two-day sweep: fixed ~30 silent-failure bugs across Record-from-JX (scope errors, leaked listeners, unhandled rejections, IPC contract mismatches), added a global error banner + per-capture telemetry as permanent visibility scaffolding, refactored the two biggest modals into 6 pure-logic modules with 77 new unit tests (50→127→122 after cleanup), shipped ESLint+CI+JSDoc as three pre-runtime correctness layers, and corrected pitfall #16 (REST and TIE wire encodings ARE distinguishable via voice[1] new-attack signature — earlier "indistinguishable" conclusion based on incomplete test data). See [`release-notes-0.5.13.md`](release-notes-0.5.13.md) for the user-facing summary and [`session-handoff-2026-05-26.md`](session-handoff-2026-05-26.md) for the open-threads pickup state.

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

- **Sequencer editor (read-only piano-roll visualizer already shipped).** The Library Sequences tab now shows each sequence as a piano-roll visualization (vertical pitches × horizontal time, colored cells: red new-attack, green held, blue rest, blue TIE). Shipped in v0.5.13. Edit capability is the future work.

  **Layout decision (2026-05-26):** stick with the existing piano-roll (the "piano" view shipped in v0.5.13) — don't pursue alternative layouts. Musical-notation view cut entirely (would need VexFlow ~250-500 KB; time-signature interpretation is ambiguous from JX data because the sequencer's "step" doesn't map to a fixed note duration without user input on tempo/meter; read-only by nature so doesn't help editor flows).

  **Paired-patch tie-in:**
  - The sequencer's audible result depends entirely on which patch is loaded — same sequence sounds completely different through a bass patch vs. a pad. Each Library Sequence carries `app.pairedPatch.{bank, slot, params, patchName}` (set at save time, preserved across all roundtrips today).
  - In the visualization: header shows "playing through: C5 / Warm Pad" with a one-click "Load paired patch to active C/D" action (replacing the in-app Load action that was removed 2026-05-25 specifically because it was confusing in isolation — but in this context, where the user is visualizing a sequence and wants to hear it, the action has clear purpose).

  **Editor side** — minimum viable:
  - Click an empty step → add a note (defaults to selected pitch or last-edited)
  - Click an existing note → cycle through voice slots, or context menu (delete, transpose, tie to previous)
  - Drag a note vertically → transpose
  - Save → write back into `library.sequences[i].tape.pages`

  **Open question — orphaned rests/ties after a transpose** (raised 2026-05-26 during drag-pitch shipping): per pitfall #16, a REST press encodes as `voice[0] tied to previous pitch`, and a TIE press encodes as `voice[0] tied to previous pitch + voice[1] new attack at same pitch`. Both REST and TIE entries thus carry the PREVIOUS note's pitch as their tied-to reference. When the user drags a note to a new pitch, any subsequent REST / TIE entries that referenced the moved note are now "orphaned" — they're tied to a pitch that's no longer there in their step's voice[0] continuation chain.
  - **Current behavior (2026-05-26):** nothing. The drag only mutates the dragged cell's voice(s). Downstream rest/tie entries keep their original tied-pitch value. Visually they still render in the same row as before the drag.
  - **Possible future behaviors:**
    1. **Do nothing** (current). User manually fixes any orphans they care about. Lowest implementation cost; user agency at the cost of musical-correctness defaults.
    2. **Auto-cascade.** When dragging note at step N from pitch X to pitch Y, walk forward from N+1 until you hit either a new attack on any voice OR a fully-empty step, updating any voice with `note === X, tied === true` to `note === Y`. Catches the common "I just transposed a held phrase" intent.
    3. **Detect + offer.** After drag, scan for orphans, show a small inline "Also move N tied notes?" prompt with Yes/No.
  - **Recommendation:** start with (1) — match what we just shipped — and only build (2) or (3) if users actually request it. The pattern is unusual enough that most musical sequences won't have long held continuations to worry about.

  **Effort:** 1-2 weekend days for a read-only step grid; 2-3 days for a usable editor; +3-4 days each for piano roll layout and musical notation if added later.

  **Why parked:** v1 ships fine without it. The paired-patch data is already collected, so when this lands the historical data is ready to use. Build when sequencer manipulation feels like a real user request rather than a "nice to have."

- **Cmd+Z undo for sequencer mutations.** The app-wide undo/redo infrastructure (`pushUndo` / `performUndo` / `performRedo`, with Cmd+Z / Cmd+Shift+Z wired at the top of `renderer/app.js`) already exists and covers bank reorders, renames, package deletes, etc. Sequencer mutations (drag-pitch, delete-note, insert NOTE/REST/TIE) are NOT yet pushed onto that stack — Cmd+Z works everywhere else but not in the sequencer editor.

  **Why parked (2026-05-26):** small effort but stable v1 ships fine without it; the SAVE-as-new-copy flow already guarantees the on-disk original is never destroyed, so worst-case the user can switch sequences to discard an unwanted edit. Pick up when sequencer editing becomes a daily-driver workflow.

  **Implementation sketch (~30–90 min):**
  - Add `captureSeqState(idx)` helper → returns `{seq: clone, dirty: bool, snapshot: clone | null}`. Captures the whole state needed to reverse a mutation.
  - Add `pushSeqUndo(idx, before, after)` wrapper → builds undo/redo closures around `applySeqState` (restore data + dirty flag + edit-snapshot all three).
  - Call from each mutation site: drag-pitch mouseup, `deleteNoteAtStep`, `insertNoteAtStep`, `insertRestAtStep`, `insertTieAtStep`. Capture `before` at top of each, run mutation, capture `after` at bottom, call `pushSeqUndo`.
  - Memory: ~few KB per undo entry × MAX_UNDO_DEPTH (50) = under 1 MB. Negligible.

  **Edge case to address:** save/discard interactions. After a SAVE creates a new "(edited)" copy + restores original, an undo entry from before-save would try to revert the (already-saved-and-restored) state. Bulletproof handling: clear the undo stack on save/discard for the affected sequence. Quick & dirty: just push-undo only for in-session edits and accept that post-save undo may look weird.

  **Edge case noted (not a regression):** the undo stack is shared app-wide — Cmd+Z on the sequencer view would undo the LAST mutation across the whole app, which could be a non-sequencer action (rename, bank reorder). This matches existing behavior elsewhere and is the standard model.

- **▶ Play button: hear the sequence at 50% rate.** Today the only way to audition a sequence's contents is to send it to the JX and play it from the synth, or to click individual notes via the synth-preview helper that landed 2026-05-26 (single-note tones; no rhythm, no timing). A "▶ Play" button at the top of the visualizer would walk the sequence step-by-step, emitting a synth-preview tone for each step's new attacks, at half the sequence's intended RATE (slow enough to follow musically while editing). Indicator (the same one used for tx-progress today) sweeps across the timeline in lockstep with playback so the user sees AND hears the position.
  - **Why 50%:** the JX sequencer's RATE control isn't directly transcribable to wall-clock without knowing how the user has it set; 50% gives a comfortable "I can hear what's happening" tempo regardless. Could surface a speed slider later (25%–100%–200%) if users want finer control.
  - **Implementation notes:** reuses `previewNote(midi, durMs)` from `renderer/synth-preview.js` — call it per attack, scheduled via `setTimeout` based on step interval. Skip rests and tied continuations (per CLAUDE.md pitfall #16 — only new attacks produce sound). Polyphony works for free because synth-preview already stacks oscillators per call. Need a "step interval" derivation from the sequence's RATE field (`tape.rate` or wherever the codec stashes it) × 2.
  - **Stop / pause:** click ▶ again to stop. Indicator returns to step 0.
  - **Loop mode:** optional toggle ("loop") to repeat. Default off.
  - **Effort:** ~2-3 hours. Most of the cost is the scheduling state machine + visual indicator sync; the audio path is already done.
  - **Why parked:** waiting for the sequencer editor to gel before adding more audio surface. Could ship before the editor as a standalone "audition" feature if user requests come in.

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

## User manual content

When JP Patches gets a real user manual (README, in-app help, or a separate `USER_MANUAL.md`), the following nuances need to be documented for end-users so they're not surprised by what they see in the sequencer visualizer:

- **REST vs TIE — what the colors and tooltips mean.** Pulled from CLAUDE.md pitfall #16 and the empirical JX-3P testing 2026-05-26.
  - **RED cell** = new attack (key pressed at this step).
  - **GREEN cell** = held / tied continuation (REST entry OR polyphonic note still sounding from prior step).
  - **BLUE cell** = single-voice TIE event (the JX-3P TIE-button signature: same pitch tied + re-struck).
  - **Faint blue full-column tint** = silent step (no voices populated; either user never wrote to this step, or page is entirely empty).
  - **Polyphonic TIE renders as RED cells** (multiple new attacks at the same pitches as the previous column), but the hover tooltip reads `tie`. This is because the JX-3P data format can't distinguish "polyphonic TIE" from "user re-played the same chord" — they're identical in the wire data. The JX firmware uses fresh re-attacks for polyphonic TIE because the canonical single-voice TIE encoding (tied + new-attack pair per pitch) doesn't fit a chord within the 7-voice budget.
  - **Audible result of TIE** depends on context: single-voice TIE produces a smoother re-articulation (the held note's release tail blends with the new attack); polyphonic TIE is a cleaner chord re-strike (every envelope restarts from zero). Both intentional JX-3P behavior, audible differences most apparent on long-release patches.
  - **REST after a chord** doesn't tie just voice[0] — it ties ALL chord voices into the next step (multiple green cells appear, one per held note). This matches real JX recording behavior and JP's `insertRestAtStep` produces the same shape via the polyphonic-aware encoding.

- **The JX-3P sequencer has 6-voice polyphony per step.** The data format has 7 voice slots but the synth only plays 6 simultaneously. JP's editor caps inserts at 6 voices to match.

- **REST and TIE are "whole-step" events on the JX-3P.** You can't add REST or TIE to a column that already has other notes — they require an empty step to insert. To turn an existing populated step into a rest, delete the notes first.

- **Sequences are 8 pages × 16 steps = 128 steps maximum.** Pages can be skipped (rendered as faint blue tinted columns) if the user never programmed them on the JX. JP's library treats null pages as 16 rests for display purposes.

## Distribution

- **Apple Developer ID + notarization.** Drop the "damaged" Gatekeeper dialog on download. $99/yr, one-time setup of signing/notarization in `electron-builder` + Apple's `notarytool`. After setup, every release auto-signs.
- **Mac App Store publish.** Paid distribution of the same app, code-signed and notarized, with auto-updates. App Store listing would point users to the free open-source GitHub build. Depends on the Developer ID being set up first.

## Audio

- **Patch sound samples.** Record a short audio sample (a few seconds, fixed note + velocity) for each patch so users can preview a patch without selecting it on the synth. Open questions: where the audio is captured (manual record? auto-sample at save time?), where it's stored (per-patch in `library.json` as base64? sidecar files?), what playback affordance lives in the patch list. Probably v2-era since reliable capture wants MIDI to drive the synth.

## Platform

- **Windows port.** Electron makes this ~1-2 days of code work (swap `titleBarStyle`, ship Windows `uv.exe`, add `--win` target to `electron-builder`). Real blocker is testing — no Windows hardware on hand. Worth doing only when a Windows-using JX-3P owner volunteers to smoke-test, or after Mac notarization is done so it's not the highest-leverage next step.

- **Adaptive app sizing + larger zoom presets.** Window is currently locked at 1140×710 with `resizable: false`. On big displays the app appears as a small fixed window with dark space around it; on Macs smaller than 1140 wide, content gets clipped offscreen. Drop the resize lock, set a sensible `minWidth`/`minHeight` floor, add a max-width / aspect-ratio constraint so the panel SVG doesn't stretch on giant monitors. The View menu already ships **75%** and **100%** presets (both scale the window AND the renderer together, no clipping). The corresponding larger presets — **125%**, **150%**, and **200%** — are deferred until the resize lock is fully dropped: at 150% on Daniel's 1147×719 logical screen, the resulting 1710×1065 window would overflow off the right and bottom of the display, so the resize call needs a screen-bound check and graceful clamp (and the window should re-center on the active screen). 125/150/200% are the standard scale set for audio/synth apps (Logic Pro, Ableton, Native Instruments) — keep that exact ladder when shipping. Most of the existing CSS uses `100vw`-based calcs that are mathematically correct at any width, but visually unverified at sizes other than 1140 — expect 2-4 hours of testing + tweaking at a few intermediate breakpoints, plus the 4 zoom presets above and below. The bucket grid in the Custom Banks builder is the highest-risk area to re-verify.

## Audio routing

- **Tape vs App Sound Picker — explicit cable device-pinning (v0.7.0).** Today's audio routing tangle: the macOS "system default" output is shared by BOTH the cable-transmission audio (JP↔JX, must reach the JX) AND every app sound (button/switch clicks, sequencer note previews, Tape Dump Sounds monitor — must reach the user's ears). The user has to pick ONE thing for both, and neither choice is good:
  - **System default = cable** (what tape-dump users do by necessity): app sounds vanish — they route to the JX, which has no speaker for them. User clicks a switch in the panel UI → silence.
  - **System default = built-in speakers**: app sounds work, but transmissions blast out the laptop speakers and the JX hears nothing → transfers silently fail.

  No setting today lets the user say "the cable is the cable, my speakers/headphones are where I listen to everything else."

  **The architectural fix — pin transmission via setSinkId (Tape Dump Sounds is the proof-of-concept):**

  We already do this for Tape Dump Sounds (the monitor that plays FSK out the built-in speakers in parallel with the cable). Instead of relying on system default, we explicitly call `setSinkId(builtInSpeakerDeviceId)` to force routing — works because of the allowlist + cable-exclusion guards in `transmission-sounds.js`.

  Mirror the pattern for the cable direction:
  - Add an explicit cable device-picker to the Send modal (and make the existing one in Record interactive — it's read-only today).
  - When user picks a device once, `setSinkId(cableDeviceId)` pins transmission to it.
  - System default can be anything else (speakers, headphones) — your normal listening setup.
  - App sounds + sequencer previews naturally route to system default → user's ears.
  - Tape Dump Sounds keeps its existing built-in-speaker routing.

  **User experience after fix:**
  - User opens Send modal → OUTPUT DEVICE block shows the pinned cable device (interactive picker, remembered across sessions).
  - System default stays on speakers/headphones — they get all the click/preview/monitor feedback they expect.
  - Tape Memory transfers always go through the cable, never accidentally through the speakers.
  - The current amber "that's your built-in speakers, not your cable!" warning in the Send modal becomes obsolete — the picker IS the answer.

  **Communication / UX considerations:**
  - The device-picker IS the primary communication: surface the routing prominently in Send + Record modals.
  - Maybe a small status bar / settings popover: "Transmission → KT USB Audio · App sounds → MacBook Pro Speakers (system default)" — answers "where is my audio going?" in one place.
  - The visible mute-icon idea (treat the symptom) was considered but rejected in favor of the device-picker (fix the disease). A mute icon could still appear for the user-toggled-off case (View menu's Tape Dump Sounds / Button & switch sounds disabled).

  **Implementation:**
  - Renderer: device-picker UI in Send modal (interactive `<select>` replacing the read-only `.send-jx-device-display`); persist selection in `library.json` under `cableOutputDeviceId`.
  - Audio playback path: wrap the existing `<audio>` element in a MediaElementSource → setSinkId(cableOutputDeviceId) on Play. Same isolation discipline as `maybePlayTapeDumpSound` — silent-fail with try/catch; bad routing can't corrupt the transfer because there IS no transfer if setSinkId fails (caller would see the failure and abort).
  - Remove the `.send-jx-output-warning` amber warning (no longer needed).
  - Audio Diagnostics modal: extend to surface "Transmission output: [selected device]" alongside the existing built-in-speaker check.
  - Tests: round-trip `setSinkId(cable) → play → JX receives` on real hardware.

  **Effort:** ~3–4 hours including the persistence + UI + tests. Audio-graph rewire is the trickiest part (need MediaElementSource which has historically broken transmission audio in this app — see comments in `startPlayback` about why we avoided AudioContext.destination routing).

  **Related items that this also unlocks:**
  - **Sequencer note previews** become audible regardless of cable being the default
  - **Button & switch click sounds** become audible (they're toggled off by default today partly because they're inaudible when cable is default — feature usage goes up if they're not silenced by routing)
  - **Tape Dump Sounds Record-side UI shared-builder extraction** (currently duplicated inline between Send and Record modals) — clean refactor opportunity when the cable picker lands
  - **OUTPUT DEVICE amber warning removal** — obsoleted by the picker

  **Why parked**: substantial UX + architectural change; one rev away (v0.7.0 target). v0.6.5 still focuses on jPpS sequence-customName preservation.

## Blocked

- **MIDI integration (v2).** Full bidirectional CC sync with the JX-3P. Blocked on installing the Series Circuits JX-3P MIDI Upgrade Kit. CC map and architecture are already in the spec doc — see `library-and-midi-spec.md` §Phase 3.

## Data interchange

- **Preserve original names + creation dates across cross-user WAV sharing — patches + sequences, plus paired-patch hint UI (v0.6.5 target, scope locked 2026-06-02).** Today the `jPpS` RIFF chunk preserves the current `customName` for patches only (`embedSlotMetaInWav` / `readSlotMetaFromWav` in `main.js`, schema v:1). Sequences have nothing equivalent. v0.6.5 extends both directions:
  - **Sequences get the chunk treatment for the first time** (so customName + patchNote land in the recipient's library).
  - **Both patches AND sequences also preserve the FIRST creator's original name + creation timestamp** — set once at first export, never overwritten by subsequent renames. Recipients click the 'i' icon and see: `Originally: Spils Sequence · Created: June 1, 2026`.

  **Why "original name only" and not a full rename chain?** Daniel and I evaluated a chain design (`Spils Sequence > Mary's > Sunday Funday`) and landed on original-only as better UX:
  - Captures the real signal — attribution to creator — without growing-chain edge cases (5+ trades make it ugly, easy to forge intermediate steps, more UI surface to design)
  - Single immutable field, never grows, never decays
  - Chain feature is a fine v0.7+ enhancement if community trading takes off and the storytelling becomes interesting

  **Schema bump** (backward compatible — v:1 chunks parse correctly under v:2 reader, just lack the new fields):
  ```jsonc
  {
    "v": 2,                                  // was 1
    "app": "JP Patches",
    "slotMeta": {                            // existing — EXTENDED with originalName + createdAt
      "C1": {
        "customName": "...",                 // existing
        "defaultName": "...",                // existing
        "originSlot": "C1",                  // existing
        "originLibrary": "...",              // existing
        "originalName": "Warm Pad",          // NEW — first creator's name, set once at first export
        "createdAt": "2026-06-01T15:30:00Z"  // NEW — first creation timestamp (from package createdAt at first export)
      }
    },
    "sequenceMeta": {                        // NEW (whole field — sequences had nothing before)
      "customName": "Sunday Funday",         // recipient sees this as the display name
      "originalName": "Spils Sequence",      // NEW — first creator's name, set once
      "createdAt": "2026-06-01T12:00:00Z",   // NEW — read from library.sequences[i].createdAt at first export
      "patchNote": "loose chord changes — for the basslines demo",
      "pairedPatch": {                       // OPEN QUESTION — embed full patch params or just name?
        "bank": "C",
        "slot": 5,
        "patchName": "Warm Pad",
        "params": { /* 32-byte patch */ }    // optional; only if we want recipient to hear it "as intended"
      }
    }
  }
  ```

  **Rules (uniform across patches + sequences):**
  - `originalName` + `createdAt`: set ONCE at first export (when chunk has no prior value for that field). Preserved unchanged on every subsequent export forever.
  - `customName`: refreshed on every export to reflect the current sender's name.
  - On import: chunk fields land on the library entry; 'i' icon displays current name + originalName (if different) + createdAt.

  **Implementation:**
  - `main.js`: extend `embedSlotMetaInWav` → `embedJpMetaInWav({ slotMeta, sequenceMeta })`; update `readSlotMetaFromWav` → `readJpMetaFromWav` returning both shapes.
  - `seqTapeEncodeToTemp` (sequence WAV export path): pass `sequenceMeta` derived from the library entry. If the entry has no `originalName` (came from a non-jPpS WAV or was just created), set `originalName` = current `customName` at export time.
  - `seqTapeLoad` (sequence WAV import path): surface the embedded `sequenceMeta` in the IPC result.
  - Patch export path (`tapeEncodeToTemp`): similarly populate `originalName` + `createdAt` per slot on first export. For patches `createdAt` is the package's createdAt at first export (slight imprecision — multiple slots in one package share the date — but accurate enough at the per-patch granularity we care about).
  - Renderer: prefer fingerprint-history (the recipient's own remembered names) over chunk `customName` — same precedence pattern slotMeta already uses. `originalName` + `createdAt` always populate from chunk if present (no local fallback needed — these are immutable historical facts about the file).
  - 'i' icon: extend the existing patch lineage popover; build the equivalent for sequences if it doesn't exist yet.
  - Bump chunk version: `v:1` → `v:2`. Old readers gracefully ignore the new fields; new readers handle both.

  **Open design questions:**
  - **Embed pairedPatch.params?** Full 32-byte patch data adds ~80 bytes to the chunk. Recipient could hear the sequence "as the sender intended". Otherwise paired-patch context is name-only. Recommend: embed params optionally, default off, surface a Settings toggle.
  - **Embed author?** A `{ author: "Daniel Spils" }` field would let recipients see who created it. Privacy implications. Recommend: separate Settings preference, default off. Defer entirely if no demand.

  **Test plan:**
  - Round-trip: export sequence/patch WAV from one library, import into another → confirm customName + originalName + createdAt land
  - Re-export from second user: their customName overrides; originalName + createdAt unchanged
  - Backward compat: existing v:1 tone WAVs still decode correctly after the schema bump
  - 'i' icon: confirms display order — current customName prominent, originalName + createdAt as secondary lineage info

  **Effort:** ~5 hours focused work including unit tests + UI updates. Breakdown:
  - Extend `embedSlotMetaInWav` → `embedJpMetaInWav` (both shapes): 30 min
  - Sequence WAV save/import IPC plumbing: 1 h
  - Renderer precedence (chunk > local fingerprint > default): 45 min
  - Patch schema: add `originalName` + `createdAt` to slotMeta: 30 min
  - Patch 'i' icon: extend existing lineage display: 30 min
  - Sequence 'i' icon: build if not present + display history: 45 min
  - Tests (round-trip + backward compat): 45 min
  - Smoke test rows + CLAUDE.md update: 30 min

  ### Paired-patch auto-load UI (locked 2026-06-02 design session, revised same session)

  v0.6.5 also adds in-app surfacing for paired-patch context. After walking through Options A→D + a hint-text variant (Option D + A), we landed on a cleaner auto-load design when Daniel asked "When a Sequence is loaded with its paired patch isn't the PG-200 automatically set to the paired patch parameters (another 3P!)?"

  **The user-facing surface:** when a Library sequence with a paired patch is selected, the PG-200 panel automatically displays the paired patch's params + name. A small "Preview" badge near the Patch parallelogram signals that the panel is showing a preview slot, not a real C/D slot. A small italicized hint text below the panel supports the affordance:

  > *"This sequence is paired with this patch — click Write to add it to your library."*

  Selecting any C/D slot exits the preview and the panel returns to normal slot display.

  **The Write button is unchanged** — it does what it always does (writes whatever's currently displayed on the panel to the chosen slot via the existing slot-picker + confirmation). Since the panel is showing the paired patch in preview mode, Write naturally writes the paired patch. No new "context-awareness" code needed.

  **What the user does:**
  1. Library → Sequences → click a sequence with paired-patch metadata
  2. PG-200 panel switches to show the paired patch (knobs, switches, name); "Preview" badge visible
  3. Click Write → arms slot picker (existing "Click a slot to write current patch" banner)
  4. Click any C/D slot → confirmation modal "Save this new patch to C7?"
  5. Confirm → paired patch lands in chosen slot, panel exits preview, displays the new slot's contents
  6. (Optional) Send Tones → JX gets the bank with paired patch
  7. (Optional) Send Sequence → JX plays sequence through the loaded paired patch

  **What the user does NOT need to do:**
  - No new modal to learn
  - No new button to discover (Write is where it always was)
  - No new explicit-toggle button (auto-load handles it)
  - No destructive auto-mutations (preview is overlay, not a real C/D write)

  **What we considered and rejected** (for design-trail clarity):
  - **Option A — minimal**: just preserve metadata, no paired-patch UI. Too thin — leaves paired-patch context as data that goes nowhere.
  - **Option C — full 2-stage send**: "Send Sequence & Paired Patch to JX" modal with multi-step orchestration. Too complex — the bank-dump nature of the JX tape format makes "send one patch" a misleading framing; user would need slot picker + Memory Protect dance + multi-step transmission UX. The auto-load version skips all this by letting the user drive the standard Write + Send-Tones + Send-Sequence flows separately, in their own time.
  - **Option D + A — hint text + context-aware Write** (originally locked, then revised): panel stayed unchanged; hint text drove the action; Write became context-aware (cloned paired-patch params even though they weren't on the panel). Cleaner-looking initially but added implementation complexity (context-aware Write + a special slot-picker banner) AND a less-natural mental model (user reads hint about Warm Pad but panel shows their existing C1). Daniel's "isn't the PG-200 automatically set?" question surfaced that auto-load is actually MORE elegant once you commit to a clear Preview badge.

  **Edge case — unsaved edits when selecting a sequence with paired patch:**
  - User had unsaved edits to C5 (modified-dot showing). Panel was on C5.
  - User clicks a sequence with paired patch.
  - Panel auto-loads paired patch (preview mode).
  - User's unsaved edits to C5 are NOT lost — they're still in library.slotMeta under C5's modified state. The modified-dot on C5 in the patch list still shows.
  - User clicks C5 → preview exits → panel returns to C5 with edits intact.
  - No guard modal needed; this isn't destructive.

  **Why this design is small implementation-wise:**
  - Preview-slot state in renderer: one new field (`currentPreviewPatch = {params, name, fromSequenceId}` or null)
  - PG-200 panel + Patch parallelogram render: check preview state first, fall back to active C/D slot
  - "Preview" badge: small visual cue near the Patch parallelogram (CSS-only)
  - Auto-set on sequence selection: one line in the sequence-row click handler
  - Auto-clear on C/D slot click: one line in the slot click handler
  - Write button stays untouched (winning bonus — no new code there)

  **MIDI future enhancement (Phase 3, not in v0.6.5):**
  - The same Write → load-paired-patch flow ports cleanly: instead of writing to JP library + tape-dumping later, the MIDI path sends the patch directly to the JX via SysEx Data Set
  - JX's permanent memory stays untouched (no slot overwrite needed)
  - "Preview with paired patch" becomes AUDIBLE because JP can drive the JX via MIDI program-change + note messages
  - The hint text could update to "click Write to send Warm Pad to your JX (no JX-memory overwrite)" in the MIDI world

  **Pre-MIDI honest limitation (worth surfacing in release notes):** JP Patches doesn't synthesize the JX-3P's sound. The paired-patch flow gets the patch INTO the user's library, but to actually HEAR the sequence with that patch, the user has to tape-dump both to the JX and play from the JX. Sequencer note previews in JP remain triangle-wave tones regardless of paired-patch context — they don't reflect patch character. This is an inherent constraint of the tape-only architecture, not a feature limitation.

  **Effort revised** with Option D + A:
  - Phase A: chunk extension (slotMeta + sequenceMeta, originalName + createdAt) + sequence WAV save/import IPC + pure-logic tests — ~2.5 hr
  - Phase B: 'i' icon for both patches + sequences (lineage display) + paired-patch hint UI + Write context-awareness — ~2.5 hr
  - Phase C: smoke-test rows + CLAUDE.md update + manual round-trip verification — ~1 hr
  - **Total: ~6 hr** (single focused session, or split across two)

  **Why parked**: ready for v0.6.5 — scope locked. Not blocking v0.6.4 release.

- **Visible DUMP PROGRESS bar during *capture***. *Partial — auto-stop in capture mode shipped 2026-05-24; the calibration-mode red gradient progress bar isn't yet reflected in capture.* In capture, the user has the segmented WHAT THE JX-3P SENDS timeline (structural) and the elapsed-time counter, but no dynamic "the dump is N% complete" bar like calibration has. Adding the same `.record-jx-cal-progress-*` bar to capture would give clearer "wait, the JX is still transmitting" feedback. Estimate ~30 min — re-parent / show the existing `calProgressSection` in capture mode and drive it from `totalSignalMs` like calibration already does.

## Library metadata

- **Per-patch event log (Patch history v2).** Today the Patch history modal shows two static lines: current slot + library, and a single origin line with the upload date. A richer version would carry a chronological event trail on each patch — created, library renamed, copied into another library, edited (with which params changed), renamed. Modal would render each event as one dated row, so the patch's full story is visible at a glance. Shape sketch: each slotMeta entry grows an `events: []` array; saves diff against prior state and append entries with `{ when, kind, detail }`. Edits log only at save time, not per knob twist, to keep the trail readable. Migration: existing patches start with one synthetic `Snapshot recorded …` entry using the current snapshot date — the real first-upload date is unrecoverable for libraries that predate the event log. Estimated 2–3 hours including diff logic, schema, migration, and modal redesign. Data cost is small (≈80 bytes per event; a heavy user with 10 libraries × 20 events per patch is still under 1 MB).

## Community library

Browsable / downloadable user-contributed patches and sequences. Multi-phase rollout — the site comes first, the in-app browser is the eventual payoff.

- **Phase 1 — Website pages at jx-3p.com** (in progress, May 29, 2026). `/patches/` and `/sequences/` index pages built from Jekyll YAML data files (`docs/_data/patches.yml`, `_data/sequences.yml`) with `.json`-only payloads in `docs/library/patches/` and `docs/library/sequences/`. Expected volume: ~25 patch banks + ~100 sequences. Submissions via GitHub Issue templates, manually curated by Daniel.
  - **Header nav tabs (Patches / Sequences) already shipped** to `docs/_layouts/default.html` + `docs/assets/css/style.css` (May 29) — `.cd-nav-tabs` block, right-anchored, same vertical band as the C/D swoops, square corners to read as tabs not parallelograms. Active-state CSS rule (`.cd-nav-tab.active`) defined but not wired yet — kicks in when the destination pages are built.
  - **Tape-dump users have full access** even though payloads are `.json` only — `tapeLoad` IPC handler accepts both `.wav` and `.json`, and Send-to-JX-3P synthesizes the WAV on the fly from the JSON for cable transmission. Downloading a community `.json` and sending it to a real JX takes the same number of clicks as loading a local library entry. See the Q&A trail in the May 29 session for the full reasoning.
  - **Next steps (still to build):** `docs/_data/` YAML schemas, `docs/library/` folders + seed JSON, `/patches/` and `/sequences/` Jekyll index templates, per-entry detail page template, GitHub Issue templates for submissions, mobile nav treatment (currently hidden under 540 px).

- **Phase 2 — In-app community browser.** Add a "Community" sub-tab inside JP Patches that fetches the same manifest used to render the site, displays the available patches/sequences, and lets the user one-click download into their Library Tones or Library Sequences. Tape-dump users would then Send-to-JX-3P from the Library row as usual — no browser visit required.

  **Why this matters:** the site path needs at least 3 user steps (visit jx-3p.com → download `.json` → drag into JP Patches), each with the risk that a non-technical user gives up. In-app browse-and-load is the Roland-grade UX: never leave the app. Probably doubles the practical adoption of the community library.

  **Implementation sketch:**
  - **Manifest endpoint**: `https://jx-3p.com/library/index.json` — single machine-readable file built from the same YAML data the site renders. Generated at Jekyll build time (a small Liquid template that emits JSON, or a `_plugins/library-manifest.rb` generator).
  - **Manifest shape**: `{patches: [...], sequences: [...]}` where each entry carries `{id, name, author, description, addedAt, downloadUrl, sizeBytes, tags?, audioPreviewUrl?}`. `downloadUrl` is the absolute URL to the raw `.json` payload.
  - **In-app fetch**: at app launch + on manual refresh; result cached in `library.json` under `community: {fetchedAt, patches: [...], sequences: [...]}` so the UI renders instantly on subsequent launches even when offline.
  - **UI**: new "Community" sub-tab under Library (alongside Tones and Sequences). Browse list with name + author + description + download button. On click, fetch the JSON file, validate against the schema, drop into Library Tones or Library Sequences with a `community: {author, id, addedAt}` marker so the user can see it's a community-sourced entry.
  - **Conflict handling**: if a user already has the same community entry, surface a "Re-download anyway?" prompt.
  - **CSP**: needs `connect-src 'self' https://jx-3p.com` added to the meta tag in `renderer/index.html`.

  **Why parked**: Phase 1 needs to ship and accumulate content before Phase 2 is worth building. Once there are 5–10 real entries, this becomes the clear next move.

- **In-app share + explore workflow (Daniel, 2026-06-10).** Daniel's envisioned user-facing shape for Phases 1+2 — refines (doesn't replace) the sketches above:
  - **Share**: a `share` hover button on Library rows (alongside hover-LOAD / trash). Click opens a confirmation + explanation modal; on approval the file is submitted to the JX-3P community tabs on jx-3p.com. Sharer can attach **optional notes and their name** — these map to the manifest's existing `description` + `author` fields.
  - **Share = submit, not instant-publish.** Under the curated zero-backend model, "share" lands in Daniel's review queue (GitHub Issue or similar); it appears on the community tabs after curation. The confirmation modal copy should set this expectation ("reviewed before it appears") — that keeps moderation = curation and requires no accounts/auth.
  - **Explore**: a button at the bottom of each Library sub-tab opening a modal with the **10 latest** community tones / sequences, each one-click portable into the user's local library. A "explore more" link deep-links to the jx-3p.com community tabs. The 10-cap is deliberate: in-app search/browse UX gets tricky beyond that, so browse-at-scale lives on the site. (The 10-latest list is just the first 10 entries of `index.json` sorted by `addedAt` — no extra endpoint needed.)
  - **Open question — submission transport.** With no backend, how does the app physically send the file on "share"? Candidates: (a) prefilled GitHub Issue URL with the JSON in the body (banks are a few KB; URL-length limits may pinch for sequences), (b) reuse the site's feedback-form mechanism, (c) write a temp file + instruct the user to attach it to a prefilled issue. Decide when building; (a) is the tentative pick for patches.
  - **Modal design v1 (Daniel mockup, 2026-06-10).** Single modal per sub-tab combining browse + share (replaces the separate share-hover-button idea):
    - Top: "Recent User Shared Tones" — list of latest community files, each with a Roland-red **borrow** button (one-click import into local library, with community marker + re-download conflict prompt).
    - Middle: "Share Your Tones" — two consent checkboxes ("I am sharing my own tones (no one else's)", "anybody can download and use these tones") gate the Roland-blue **share** buttons. Persist acceptance in library.json prefs after first check (don't re-ask every session). Packages carrying a community marker are excluded from the shareable list — structurally can't re-share someone else's files.
    - Share button states: share (blue) → shared (activated blue tone) → click again to unshare. Implement the change-your-mind window as an undo toast ("Shared — undo, 30s"), not a literal delayed send.
    - **Share-click confirm step (decided 2026-06-10):** clicking share opens a small confirm modal with three fields, then the actual Share commit. This is also where the undo toast lives after commit. One extra click, but it's what makes the community catalog readable. Fields + example placeholder copy (Daniel's):
      - **Name** — placeholder `J.P. Patches` → manifest `author`
      - **Notes** — placeholder `e.g. Snail sounds and '80s pads` → manifest `description`
      - **Hometown** — placeholder `Anchorage, AK` → manifest `hometown` (new field — add to the Phase 1 YAML/manifest schema NOW per the machine-consumable-from-day-one rule below)
      Remember name + hometown across shares (library.json prefs) so repeat sharers only type them once; notes are per-share.
    - Bottom: green "explore more tones on JX-3P.com" → deep-links to the site's community tab.
    - Sequences get the same modal with language swapped.
    - **Publish semantics (decided 2026-06-10): curated queue.** Third button state reads **"submitted"** — share lands in Daniel's review queue and appears on the community tabs after approval. Clicking "submitted" reverts to "share" and withdraws the submission. Two undo tiers:
      1. Within the undo toast window: nothing was sent yet — pure local revert.
      2. After submission: app sends a withdrawal carrying the package's **share-token** (secret UUID generated per submission, stored in library.json). Pre-review → dropped from queue; post-publish → takedown on next site push. Local button reverts immediately; catalog catches up at the next curation pass. Withdrawal can't claw back already-borrowed copies — modal copy should promise "removed from the catalog", nothing stronger.
      - **Transport implication:** programmatic submit + withdraw rules out the open-prefilled-GitHub-Issue-in-browser candidate. Minimal viable transport = a tiny relay endpoint Daniel controls (e.g. Cloudflare Worker holding a repo-scoped token that files/closes GitHub issues on the app's behalf). ~50 lines, free tier, no user accounts — but it IS a hosted component; deciding "submitted is undoable" commits to it.

- **Phase 1 design decision that needs to happen NOW (May 29, 2026):** the manifest format must be machine-consumable from day one, not just rendered to HTML. Practically, this means the YAML data files need to carry every field the in-app browser will eventually need (`id`, `author`, `addedAt`, `description`, `tags`, `audioPreviewUrl`) — not just the fields the site happens to render. Free if we set it up now; expensive retrofit if Phase 1 ships with a schema designed only for HTML and Phase 2 has to backfill or restructure all the entries.

- **Audio previews per sequence** (deferred, decide after first submissions land). 10-second MP3 captured by Daniel or contributors at submission time; rendered inline on the site (HTML `<audio>` tag) and surfaced via the manifest's `audioPreviewUrl` field for the in-app browser. ~50 KB per file; trivial storage; meaningful UX win since users can audition before downloading.

## Smaller polish

- **App-level Undo/Redo.** The macOS Edit menu's Undo/Redo items are currently omitted because they would only undo text edits inside name fields — not the much more interesting "undo the last knob twist / patch load / custom-bank reorder". A real Undo/Redo would require an action-history stack: push an inverse operation each time the user does something with persistent effect (knob change, switch toggle, slot rename, patch load, custom-bank slot edit, package save/delete, sequence save/delete). Add the items back to the Edit menu and bind Cmd+Z / Cmd+Shift+Z. Estimate: small-to-medium — the history infrastructure is straightforward but the universe of "undoable actions" is wide (~15 entry points) and each one needs an inverse defined and tested. Worth doing once the v1 surface stops changing weekly.

## Code quality / infrastructure

- **AudioWorklet migration.** `ScriptProcessor` (used in `setupAudioGraph` in `audio-capture.js`) is deprecated. Chromium will eventually remove it. `AudioWorklet` is the modern replacement: lower latency, runs on its own thread, won't block on main-thread jank. Future-proofs the capture pipeline and probably improves smoothness on slower Macs. ~half day; mostly mechanical (define a worklet processor, register it via `audioContext.audioWorklet.addModule`, swap `createScriptProcessor` for `new AudioWorkletNode`). Quirk to watch: AudioWorklet processes audio in 128-sample blocks, so the buffer-accumulation pattern in `captured.push(...)` changes shape.

- **Library schema versioning + migrations.** `library.json` has grown organically — `slotMeta`, `activePatches`, `record.calibratedGain`, `captureLog`, `customBuckets`, `record`, `zoomFactor` were all added piecemeal across releases. There's no `version` field and no migration scaffolding for when fields rename or change shape. Formalize: add a top-level `schemaVersion` integer + a migration list (`function migrate(library)`) that runs at load time. Next field add is then forced-infrastructure (define schemaVersion bump + a migration function) instead of improvised. ~2 hours. Build before Phase 3 (MIDI prefs storage will be the next field add) so MIDI work doesn't have to also do this.

- **Integration tests for modal flows (JSDOM).** Currently 122 unit tests cover the pure-logic modules; zero tests cover the modal lifecycles. The 2026-05-25 silent-failure bugs (runningPeak ReferenceError, recordBtn ReferenceError, onCaptured handoff swallowing rejections) would have been caught at test time with a thin JSDOM harness that opens a modal, simulates a click, and asserts either the next modal appears OR a known error surfaces. ~3-4 hours: install jsdom + happy-dom dev dep, build a `modal-test-harness.js` helper that mounts a modal, fakes the IPC layer, asserts post-click DOM state. Adds the highest-leverage missing safety net.

- **Capture-lifecycle factory (Step 3e — deferred from the 2026-05-25 refactor).** After Steps 1-4 + 3a/3b/3c/3d, `showRecordFromJxModal`'s audio lifecycle is mostly delegated (`acquireRawAudioStream`, `setupAudioGraph`, `updateCaptureState`, `classifyCaptureWarning` all extracted). The remaining inline lifecycle (~12 lines: AudioContext creation, raf-loop kick-off, stopCapture node cleanup) could fold into a single `createCaptureSession({onTick, onAutoStop, ...})` factory that owns the raf loop and exposes everything via callbacks. ~3 hours, medium risk because the raf-loop callback API needs to surface every DOM mutation the modal currently does inline. Worth doing if/when `app.js` shrinks enough that the modal's still-substantial DOM-update code becomes the dominant readability burden — until then, modest gain for the work.

- **More `app.js` extractions.** Three remaining hot spots in app.js (~7,400 lines): `setupInteraction` (~280 lines of knob/switch/button event wiring, currently untested); `renderPatchList` + family (large render code); the `showConfirmModal`/`showSaveSequenceModal`/`showSendToJxFlow` modal infrastructure (could share more common builders — see also the prior `buildRecordTimelineSection` / `buildRecordActions` extractions for the pattern). Each is a 1-2 hour session in the same shape as the 2026-05-25 refactor commits. Pick whichever is currently the most-edited or most-bug-prone.

- **Property-based testing on the pure-math modules.** Generate random inputs via `fast-check` and assert invariants (`gainToSlider(sliderToGain(x)) ≈ x`, `computeFskTrim` returns `trimStart >= 0`, `paramsFingerprint` is deterministic across re-orderings, etc.). Catches edge cases the hand-written tests don't. Worth doing if a math bug ever escapes — not pre-emptively. ~1-2 hours when prompted.

- **(Add new items here as they come up.)**
