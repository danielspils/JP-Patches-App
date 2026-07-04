# Record from JX-3P — shipped feature reference

In-app live capture of JX-3P tape dumps via the Mac's audio input — the user clicks a button, presses Save on the JX, and the app records, trims, decodes, and applies. Replaces the legacy "record in Logic/Audacity → drag the .wav in" workflow.

This is the **shipped-feature reference** — where to land when reading `showRecordFromJxModal` in `renderer/app.js`. Originally shipped v0.5.11 (May 2026); the capture/decode model has changed substantially since, and this doc reflects the **current** behavior (v0.8.5).

> **Current model (v0.8.2 auto-calibration + v0.8.5 native-rate):** auto-decode is the **default** — a never-calibrated device just captures at `DEFAULT_CAPTURE_GAIN` (2.0×) and the decode-time boost (`AUTO_BOOST_TARGET` 0.92 in the jx3p fork) finds the level, so most users never calibrate. **Two-pass manual calibration is only a fallback now.** Capture happens at the device's **native sample rate** (no forced 44.1k — see the Capture trap in CLAUDE.md). For decode-failure debugging, see [`record-troubleshooting.md`](record-troubleshooting.md).

## User flow

User clicks **Save** on the Tone or Sequencer column of the Tape Memory dropdown. A chooser modal asks:

- **From file** — pick a `.wav` on disk (legacy path, unchanged).
- **Record from JX-3P** — opens the live record modal described below.

### Default: auto-decode (no calibration)

The path for a device with no saved gain (`library.record.calibratedGain[deviceId]` empty) — i.e. almost always. The gain decision is pure in `chooseCaptureGain` (`record-flow.js`).

1. Modal **"Import C/D banks from JX-3P"** (or "…sequence…") opens — gain slider hidden; captures at `DEFAULT_CAPTURE_GAIN` (2.0×).
2. User presses Save on the JX. The app captures, auto-stops at end-of-dump, trims, decodes.
3. Decode → apply to active C/D banks (tones) or open the save-sequence modal (sequences). The decode-time boost makes a 2.0× capture decode without any level tuning.

A clipping capture auto-steps the gain down (halve + re-record, capped at 2 — `planDecodeFailureResponse`). Auto-stop fires when cumulative FSK signal time crosses the expected dump duration (`EXPECTED_SIGNAL_MS`: 33 s tones / 30 s sequences) OR end-of-dump silence is detected.

### Fallback: manual two-pass calibration

Reached only by choosing **Calibrate** from a decode-failure recovery (below), or when the device already has a saved gain.

1. **Pass 1 — "Calibrate volume"**: gain slider + level meter visible, no Stop button. User dials **INPUT GAIN** to the meter's **yellow target** and presses Save; the app measures the FSK peak (`fskPeak`, tracked only after a silence→signal transition).
2. App computes the saved gain via `computeCalibratedGain` (`calibration-math.js`): `newGain = currentGain × 0.45 / measuredPeak`, clamped to **[0.5×, 12×]**, persisted per-device. (Target 0.45 + cap 12 are the v0.8.6 guardrails that stop the over-hot Recalibrate loop — see CLAUDE.md.)
3. **Pass 2 — capture** re-opens at the saved gain; user presses Save again → capture → decode → apply.

### Decode-failure recovery (simplified in v0.8.5 / Phase 3B)

If a capture decodes to all-default/empty (`isDecodeAllDefault` — every slot `vca_level === 0`), a recovery modal **"Recording didn't decode cleanly"** offers:

- **Try again** (primary) — re-capture with the same settings; most failures are one-off.
- **Calibrate** — clears any saved gain, then opens manual two-pass calibration. (A Cancel out of calibration falls back to the 2.0× auto default.)

The old saved-gain branching ("Reset to auto-decode" vs "Recalibrate") was removed in 3B — the v0.8.6 guardrails + the native-rate fix made the over-hot loop it guarded against impossible. The silent clipping step-down and the "no audio detected" check remain.

## State machine

```
INIT → saved gain for this device?
     ├─ no  → AUTO CAPTURE (2.0×) → DECODE
     └─ yes → CAPTURE (saved gain) → DECODE
                                       │
                                       └─ all-default? → RECOVERY (Try again / Calibrate)
                                                              └─ Calibrate → CALIBRATE pass 1 → CAPTURE pass 2 → DECODE
```

When manual calibration IS reached, its two passes are **separate modal instances** in code (not one modal with internal transitions) — keeping them separate avoids `startRecording`'s statusText reset stomping the inter-pass message and the Save-button confusion that the single-modal version had.

## Persistence shape

```jsonc
// ~/Library/Application Support/jp-patches/library.json
{
  "record": {
    "calibratedGain": {
      "<MediaDeviceInfo.deviceId hash>": {
        "label":        "KT USB Audio (31b2:2024)",
        "gain":         11.07,
        "calibratedAt": "2026-05-24T15:49:11.545Z"
      }
    }
  }
}
```

`deviceId` comes straight from `MediaDeviceInfo.deviceId`. It's a stable per-browser-profile identifier (different across users / different across reinstalls, but consistent within one install).

The `"default"` literal is a fallback key for the default device when `deviceId` is empty or absent — this happens during the early-modal-open window before getUserMedia has been called.

Migration: users with no `record.calibratedGain` simply use auto-decode (2.0×) — no calibration step, no banner. Existing saved gains keep working as the single-pass capture gain.

## Audio pipeline

```
getUserMedia → MediaStreamSource → GainNode → AnalyserNode → ScriptProcessorNode → captured chunks
                                       ↑
                                  user-adjustable + calibration-set
```

- `getUserMedia` constraints disable echo cancellation, noise suppression, and auto-gain-control (including the legacy `googXxx` flags). FSK is a narrow-band pure-tone signal — every flavor of voice DSP corrupts it.
- `ScriptProcessorNode` is deprecated but works reliably here; `AudioWorkletNode` could replace it later.
- Captured chunks are Float32 PCM. Concatenated, trimmed, then converted to 16-bit signed LE PCM by the renderer before handing to `record-to-wav` IPC, which writes a temp WAV (RIFF/PCM, mono, sample-rate-preserved).

## Trim algorithm

> **v0.8.5:** the PRIMARY trim is now **`findFskStartByFreq`** (`record-trim.js`) — it finds the dump start by its bit-0 (short-cycle) **frequency** signature, which is amplitude-independent and so works at any gain. The amplitude/silence-based trim described below (`computeFskTrim`) is the **fallback** when no FSK frequency signature is found. The amplitude trim's failure mode — a loud idle tone with no silence gap, wrecking the demodulator's `long_width` calibration — was the systemic intermittent decode bug fixed by the frequency trim (see `record-troubleshooting.md`).

The JX-3P emits a persistent idle tone *before* and *after* the actual FSK dump. When the user presses Save, the idle tone briefly pauses, then the pilot tone (real FSK) starts. That **silence→signal transition** is the amplitude trim's anchor.

```js
// renderer/app.js, inside stopRecording's pass-2 / capture branch
const WIN_SEC            = 0.2;
const currentGainAtTrim  = sliderToGain(parseInt(gainSlider.value, 10));
const thresholdScale     = Math.min(20, Math.max(1, currentGainAtTrim));
const SIGNAL_THRESHOLD   = Math.max(0.10, 0.025 * thresholdScale);
const SILENCE_THRESHOLD  = Math.max(0.05, 0.012 * thresholdScale);
```

**Why the thresholds scale with gain**: idle tone has a roughly fixed pre-gain amplitude (~0.005–0.010 from the JX's headphone output). After applying software gain `g`, it lands at `~0.005g–0.010g`. At low gain (≤4×) idle stays under the default 0.05 silence threshold and the silence-detector works fine. At higher gain it crosses, the detector finds no pre-FSK gap, and trim falls through to the longest-signal-run fallback — which **includes the idle tone**. jx3p's demodulator then calibrates `long_width` against idle-tone cycle widths (different period than real FSK) and misclassifies every subsequent bit. Result: 0/32 valid records despite a structurally fine recording.

Scaling both thresholds linearly with the current gain (capped at 20× so SIGNAL doesn't approach the calibrated FSK peak target of 0.6) restores correct trim behavior at any saved gain.

History of the bug fixed by this scaling: on 2026-05-24 a two-step calibration's pass 2 captured a 35.7 s WAV with peak ~0.61 (saved gain 11×). Crossings were clean and the bit count looked healthy (21487 bits, 14792 ones), but 0/32 records decoded — pure checksum failure. A subsequent single-pass attempt at the same gain decoded 32/32. Difference: the two-step pass 2 had ~3–5 s more idle-tone pre-roll (JX was already idle-toning when the new modal opened); the single-pass had less pre-roll because the user pressed Save almost immediately after opening the modal. The fix scales thresholds with gain so the idle tone reliably reads as "silence" at any saved gain.

## FSK peak tracking (calibration math)

The live LEVEL meter shows the **raw amplitude post-gain**, including idle tone. That number is *not* what calibration measures — instead, we track `fskPeak` separately, populated **only after a silence→signal transition fires**. This means `fskPeak` reflects the actual FSK dump's peak, not whatever the JX was doing before the user pressed Save.

```js
// renderer/app.js, inside tickMeter
if (fskStartMs && peak > fskPeak) fskPeak = peak;
```

Calibration formula (`computeCalibratedGain` in `calibration-math.js` — the single source; app.js calls it):

```js
newGain = currentGain × TARGET_PEAK / measuredPeak   // TARGET_PEAK = 0.45
```

`0.45` keeps the captured peak comfortably above the noise floor without over-driving (the decode-time boost lifts the rest). Clamped to **[0.5×, 12×]** — the 12× cap (v0.8.6) stops calibration from over-driving a quiet-input machine into the Recalibrate loop. (Both were higher pre-v0.8.6: target 0.78, cap 30.)

If `fskPeak` is 0 at stop time (silence→signal never fired, common with very quiet inputs at unity gain), we fall back to the full-buffer max amplitude. The full buffer includes pre-FSK idle tone, which is typically similar in amplitude to the FSK transmission on a JX — close enough to give a usable calibration even in the fallback case.

## UI components

### Modal hierarchy

Both calibration and capture modals use the same structure, with sections appearing/hiding based on mode:

```
┌─────────────────────────────────────┐
│ Import C/D banks… / Calibrate volume│  (.record-jx-step-title)
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ Press Save on the JX-3P now…    │ │  (.record-jx-instr-box)
│ │ [explanation copy]              │ │
│ └─────────────────────────────────┘ │
│ ┌──── JX-3P KEY DIAGRAM ────┐       │  (.jx-key-diagram)
│ │  Tape Memory    [14] Save │       │
│ │  [□]   →                  │       │
│ │                  Tone     │       │
│ └───────────────────────────┘       │
│ ┌─────────────────────────────────┐ │
│ │ INPUT DEVICE: [dropdown]        │ │  (.record-jx-section)
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ LEVEL: ▓▓▓▓▓░░░░░               │ │
│ │ FSK PEAK: 60% — good            │ │
│ │ DUMP PROGRESS: ▓▓▓▓░ (calib)    │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ INPUT GAIN: ─●─── 1.0×          │ │  (hidden in capture mode)
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ WHAT JX SENDS: INIT▎BANK C▎…    │ │  (hidden in calibration mode)
│ └─────────────────────────────────┘ │
│  [Cancel]              [■ Stop]     │  (Stop hidden in calibration mode)
└─────────────────────────────────────┘
```

### JX-3P key-sequence diagram

Visual mockup of the JX-3P panel keys the user needs to press. Built by `buildJxKeyDiagram({ action, kind })` in `renderer/app.js`. Two variants:

- **Save variant** (`action: 'save'`) — Tape Memory mode button in column 1, key 14 (Tone) or key 11 (Sequencer) highlighted, Save button cream-faced, sub-mode pill labeled "Tone" or "Sequencer". Used in both Record-from-JX modals.
- **Load variant** (`action: 'load'`) — Tape Memory in column 3, key 16 (Tone) or key 13 (Sequencer) highlighted, Load button cream-faced. Used in both Send-to-JX modals (revealed in step 2 only).

Critical detail: **the JX-3P remaps its numeric keys depending on whether Tape Memory + Tone or Tape Memory + Sequencer is selected.** Tone uses 14/15/16; Sequencer uses 11/12/13. Future Claude editing this code: don't hardcode "14/15/16" anywhere — the helper handles the key swap based on `kind`.

Styled with panel-matching colors (`renderer/style.css`):

- Button face active: `#d2cec5` (cream — matches knob caps)
- Button face inactive: `#4a4a4a` (dim grey)
- Button LED rectangle: `#2a2a2a`
- Active numeric key: `#e84b2a` (bright Roland red)
- Inactive numeric key: `#5a2418` (dim red)
- Sub-mode pill: `#f7f1e6` (vintage cream, panel palette)
- Arrow: white CSS-drawn (3px shaft + triangular head)

The diagram is positioned by CSS Grid (`grid-template-areas`) so the Tape Memory column aligns over whichever bottom-row key is highlighted — left column for Save (key 14/11), right column for Load (key 16/13).

## Edge cases handled

1. **Calibration never sees FSK** (wrong device picked, cable disconnected). The CALIBRATING modal has a 60 s timeout that surfaces a friendly error.
2. **Hardware-level clipping** (interface gain too hot). Detected by checking raw pre-software-gain peak; if ≥0.95, the modal advises lowering hardware gain rather than computing a sub-1.0 software multiplier.
3. **Wrong device picked**. < 100 FSK-frequency crossings in 30 s during calibration surfaces a distinct "no audio signal detected" error vs the "level is off" one.
4. **Sequencer vs tone share one calibration entry** per device — same audio source, same FSK encoding.
5. **Sequencer save-modal ordering**: RECALIBRATE_PROMPT fires *before* the save-sequence-name modal opens, so an empty decode doesn't prompt the user to name nothing.
6. **Mid-calibration cancel**: standard modal cancel; no calibration saved.
7. **Cross-device captures**: the active calibration only applies to one device. Switching devices via the dropdown re-checks the saved cal and routes to the appropriate flow.

## Known limitations / future polish

Tracked separately in `docs/future-features.md`:

- Visible dump-progress bar during capture (currently only visible in calibration mode — capture has the segmented timeline + elapsed counter but no dynamic % bar).
- One-time post-upgrade banner explaining the new feature (optional polish; the STEP-1/STEP-2 framing already serves as inline explanation).

### Recently shipped

- **Auto-stop in capture mode** (2026-05-24). The Stop button is hidden in STEP 2; recording auto-finishes when the JX dump completes via the same `tickMeter` logic that already worked in calibration. Cancel covers the abort case for failed captures (no audio received). Three auto-stop triggers (preference order): (a) ≥5 s of cumulative signal followed by ≥1 s of silence — fires within ~1 s of dump end in the common case; (b) `totalSignalMs ≥ EXPECTED_SIGNAL_MS` — fires when we've captured enough cumulative FSK regardless of silence detection; (c) safety timeout at `EXPECTED_SIGNAL_MS + 6 s` — used to be a hardcoded 45 s but tightened so high-gain captures (where the JX idle tone never falls below the silence threshold) still auto-finish within a few seconds of the actual dump completion.

## Code locations

| Function | Purpose |
|---|---|
| `showRecordFromJxModal` | Main modal entry point — both calibration and capture branches. |
| `configureForCurrentDevice` | Decides auto-capture vs calibration mode on modal open + device-picker change. |
| `chooseCaptureGain` (`record-flow.js`) | Pure: auto-default (2.0×) vs saved-gain decision. |
| `findFskStartByFreq` / `computeFskTrim` (`record-trim.js`) | Primary (frequency) + fallback (amplitude) dump-start trim. |
| `computeCalibratedGain` (`calibration-math.js`) | Pure calibration math (target 0.45, cap 12) — app.js calls it. |
| `buildJxKeyDiagram` | Reusable JX-3P key-sequence visual. Used by Record + Send modals. |
| `isDecodeAllDefault` | Heuristic detecting an all-empty-patches decode (every `vca_level === 0`). |
| `showRecalibratePrompt` / `planDecodeFailureResponse` | Decode-failure recovery modal (Try again / Calibrate) + its pure no-signal/clipping/retry planner. |
| `applyToneCapture` / `applySequencerCapture` | Wire the captured WAV through decode + apply, with the `isDecodeAllDefault` guard. |
| `ensureRecordCalibrationShape` / `getCalibratedGain` / `setCalibratedGain` / `clearCalibratedGain` | `library.json` persistence helpers. |
| `record-to-wav` IPC handler (`main.js`) | Writes the in-memory PCM buffer to a temp WAV with RIFF header. |
