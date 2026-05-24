# Future features

Single source of truth for features that aren't on the formal roadmap (`library-and-midi-spec.md`) yet. Move items into the spec when they're scoped enough to schedule.

## Ready to build

- **README screenshots refresh.** Current screenshots predate the vintage cream palette and the Custom Banks redesign. Capture fresh screenshots and embed in the README.

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

- **Auto-stop on FSK trailer detection.** The in-app *Record from JX-3P* modal currently requires a manual ■ Stop click after the tape transmission finishes. A more elegant version would watch the captured audio stream for the JX's end-of-data trailer (a sustained run of 1-bits at the FSK long-cycle width) and stop the recording automatically. Sketch: feed the AnalyserNode output through a small FSK envelope detector in JS; when ~200 ms of contiguous long-cycle activity is followed by silence/quiet, trigger Stop. Avoids accidentally truncating the transmission mid-data and prevents over-long recordings that bloat the temp WAV. Estimate ~2 hours.

- **Auto-calibrated Record from JX-3P (per-device gain memory + failure-triggered recalibration).** Removes the entire class of "I set the gain by eye but it was wrong" Record-from-JX failures. First-time use on a device is a two-pass workflow: a calibration pass measures the actual FSK peak amplitude and auto-sets the input gain; a second pass does the real capture. The calibrated gain is persisted per-input-device, so every subsequent record on the same setup is single-pass. If a future capture decodes empty, the modal offers a one-click recalibrate that loops back to the two-pass flow.

  **State machine** (record-from-JX session):

  ```
  INIT → device calibration exists?
       ├─ no  → CALIBRATING → CALIBRATED → CAPTURING → DECODE
       └─ yes →                              CAPTURING → DECODE
                                                          │
                                                          └─ empty patches  → RECALIBRATE_PROMPT → (user) → CALIBRATING
  ```

  - **INIT** (modal opens): look up `library.record.calibratedGain[deviceId]`. If present → restore gain, transition to CAPTURING. If absent → set gain to 1.0×, transition to CALIBRATING with copy: *"First-time setup: you'll do two tape dumps. The first sets your input level. The second captures your patches. Press Save on the JX-3P now to begin calibration."*

  - **CALIBRATING**: capture with live meter + FSK PEAK badge running. Peak measurement starts ONLY after the silence-then-signal marker fires (so we measure FSK, not idle tone). Auto-stop after ≥2 s of confirmed FSK has been captured. Compute `targetGain = currentGain × 0.6 / measuredPeak` (lands peak mid-target-zone). Transition to CALIBRATED.

  - **CALIBRATED**: display *"Calibration done ✓ — gain set to N×. Saving this level for future imports. Press Save on the JX-3P again for the real capture."* Write `library.record.calibratedGain[deviceId] = { gain: N, label: deviceLabel, calibratedAt: ISO timestamp }`. Update gain slider live.

  - **CAPTURING**: standard record flow. On Stop → DECODE.

  - **DECODE**: trim, call jx3p, get banks. If all 32 slots are JX3PPatch defaults → transition to RECALIBRATE_PROMPT. Otherwise apply normally (active-bank for tones, save-sequence modal for sequences) and close.

  - **RECALIBRATE_PROMPT**: modal — *"This recording didn't decode cleanly. The most common cause is the input level being off. Want to recalibrate?"* [Recalibrate] clears this device's calibration entry and transitions back to INIT. [Cancel] closes.

  **Persistence shape** in `library.json`:
  ```jsonc
  { "record": { "calibratedGain": {
      "<MediaDeviceInfo.deviceId hash>": {
        "label":        "KT USB Audio (31b2:2024)",
        "gain":         12.4,
        "calibratedAt": "2026-05-24T07:30:00.000Z"
      }
  } } }
  ```

  **Manual recalibrate** affordance: small "Recalibrate" link in the record modal near the gain slider, for users whose setup changed deliberately.

  **Edge cases / open questions still to resolve before implementation**:

  1. *Calibration never sees FSK* (cable off, wrong device, JX off, user never presses Save). Auto-stop never fires; modal hangs. **Need**: 60 s timeout in CALIBRATING (and CAPTURING) with a friendly error — *"No FSK signal detected in 60 s. Check your cable + that you pressed Save on the JX-3P."*

  2. *Decode-failure threshold for RECALIBRATE_PROMPT* — all-default-only, or also < N/32 partial decodes? Leaning all-default; partial decodes get a softer non-blocking toast.

  3. *Hardware-level clipping* (user's interface gain physically too high). Software attenuation can't undo distortion. **Need**: during CALIBRATING, detect raw input peak (before software gain) — if rawPeak ≥ 0.95, surface *"Your hardware input gain is too high — lower it on your interface"* instead of computing a sub-1.0 multiplier.

  4. *Wrong-device-picked* (Daniel's AirPods bug). Recalibration won't fix it — same wrong source. **Need**: during CALIBRATING, if < 100 FSK-frequency crossings in 30 s, surface *"No audio signal detected from this input device. Is the right device selected?"* (distinct from "level is off but signal is real").

  5. *Tone vs sequencer*: same audio source, same FSK encoding, one calibration entry per device covers both. ✅

  6. *Sequencer save-modal ordering*: for sequence captures, RECALIBRATE_PROMPT must fire BEFORE the save-sequence modal opens (currently empty `tape.pages` would still get a name+notes prompt for nothing).

  7. *Cancel mid-calibration*: standard modal cancel; no calibration saved.

  8. *Migration*: users upgrading from a build that already had Record-from-JX (v0.5.12+) have no calibration entries. First record post-upgrade triggers the calibration pass automatically. A one-time banner explaining "We've improved Record-from-JX with auto-calibration" is optional polish.

  Estimate: **~4 hours** total. Cost trade-off: first-time use per device requires two physical JX dumps (~1.5 min); every subsequent capture is one dump with near-certain success.

## Library metadata

- **Per-patch event log (Patch history v2).** Today the Patch history modal shows two static lines: current slot + library, and a single origin line with the upload date. A richer version would carry a chronological event trail on each patch — created, library renamed, copied into another library, edited (with which params changed), renamed. Modal would render each event as one dated row, so the patch's full story is visible at a glance. Shape sketch: each slotMeta entry grows an `events: []` array; saves diff against prior state and append entries with `{ when, kind, detail }`. Edits log only at save time, not per knob twist, to keep the trail readable. Migration: existing patches start with one synthetic `Snapshot recorded …` entry using the current snapshot date — the real first-upload date is unrecoverable for libraries that predate the event log. Estimated 2–3 hours including diff logic, schema, migration, and modal redesign. Data cost is small (≈80 bytes per event; a heavy user with 10 libraries × 20 events per patch is still under 1 MB).

## Smaller polish

- **App-level Undo/Redo.** The macOS Edit menu's Undo/Redo items are currently omitted because they would only undo text edits inside name fields — not the much more interesting "undo the last knob twist / patch load / custom-bank reorder". A real Undo/Redo would require an action-history stack: push an inverse operation each time the user does something with persistent effect (knob change, switch toggle, slot rename, patch load, custom-bank slot edit, package save/delete, sequence save/delete). Add the items back to the Edit menu and bind Cmd+Z / Cmd+Shift+Z. Estimate: small-to-medium — the history infrastructure is straightforward but the universe of "undoable actions" is wide (~15 entry points) and each one needs an inverse defined and tested. Worth doing once the v1 surface stops changing weekly.

- **(Add new items here as they come up.)**
