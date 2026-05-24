# Record from JX-3P — shipped feature reference

In-app live capture of JX-3P tape dumps via the Mac's audio input. Avoids the legacy "record in Logic / Audacity → drag the .wav into JP Patches" workflow — the user clicks a button, presses Save on the JX, the app records, decodes, and applies. Two-pass auto-calibration sets the right input gain on first use of any device and remembers it forever after.

This doc is the **shipped-feature reference**. It's the place to land when reading the code in `renderer/app.js` (search for `showRecordFromJxModal`) and wondering *why* the modal is structured this way.

Shipped in v0.5.11 (May 23–24, 2026). Builds on top of the patch-save WAV decode path that already existed (`tape-save-from-path` IPC → `jx3p wav-to-json`).

## User flow

User clicks **Save** on the Tone or Sequencer column of the Tape Memory dropdown. A chooser modal asks:

- **From file** — pick a `.wav` on disk (legacy path, unchanged).
- **Record from JX-3P** — opens the live record modal described below.

### First-time use on a device (two-pass calibration)

Triggered when `library.record.calibratedGain[deviceId]` has no entry for the currently-selected input device.

1. Modal opens titled **STEP 1 of 2: CALIBRATE VOLUME**.
   - Boxed instruction: *"Press Tone → Save on the JX-3P now and we'll calibrate the volume."*
   - JX-3P key-sequence diagram (see UI components below) shows the Tape Memory + key 14/Save + Tone pill.
   - Live LEVEL meter + INPUT GAIN slider visible.
   - DUMP PROGRESS bar visible (red gradient).
   - Stop button hidden — calibration is fully hands-free.
   - WHAT THE JX-3P SENDS timeline hidden (would misleadingly imply data is being captured).
2. User presses Save on the JX-3P.
3. App captures the entire dump while tracking FSK peak amplitude. Auto-stop fires when cumulative signal time crosses the expected dump duration (33 s for tones, 21 s for sequences) OR when ≥5 s of confirmed FSK has been seen followed by ≥1 s of silence (real end-of-dump trailer).
4. App computes `targetGain = currentGain × 0.6 / measuredPeak`, clamps to 0.5×–30×, persists per-device.
5. Modal closes, **"Calibration done"** confirm dialog opens: *"Input level calibrated for [device] — gain set to N×, saved for future imports. Click below to open the recorder again for the real capture. Press Save on the JX-3P when the next modal opens."*
6. User clicks **Continue to capture** → STEP 2 of 2 modal opens.
7. User presses Save on JX again. App captures the real dump at the calibrated gain.
8. User clicks **■ Stop** when the JX finishes transmitting.
9. Decode → apply to active C/D banks (tones) or open save-sequence modal (sequences).

### Subsequent use on the same device (single-pass)

Triggered when `library.record.calibratedGain[deviceId]` has an entry.

1. Modal opens titled **STEP 2 of 2: DATA DUMP FROM JX-3P** (the STEP-2 framing is intentional — it reinforces that calibration was a one-time prereq).
2. Gain slider pre-set to the saved value; slider section hidden by default since the user shouldn't need to touch it.
3. WHAT THE JX-3P SENDS segmented timeline visible.
4. Stop button enabled.
5. User presses Save on JX → recording → user clicks Stop → decode → apply.

### Failure recovery

If a capture decodes to **all-default empty patches** (heuristic: every slot has `vca_level === 0` — real patches are virtually never silent), the app fires a **Recalibrate prompt**:

- Modal: *"This recording didn't decode cleanly. Want to recalibrate the input gain and try again? Your active C/D banks will not be modified."*
- **Recalibrate** button clears the device's saved gain entry and re-opens the record modal in two-pass calibration mode.
- **Cancel** closes; no state changes.

This catches the class of failures where the user's setup changed (different cable, different interface, mic vs line) and the previously-calibrated gain no longer applies.

## State machine

```
INIT → device calibration exists?
     ├─ no  → CALIBRATING → CALIBRATED_CONFIRM → CAPTURING → DECODE
     └─ yes →                                    CAPTURING → DECODE
                                                              │
                                                              └─ all-default? → RECALIBRATE_PROMPT → (user choice) → INIT or close
```

The two passes are **separate modal instances** in code, not one modal with internal state transitions. This was a deliberate refactor (see v0.5.11 commit history): keeping both passes in one modal led to startRecording's statusText reset stomping the "Calibration done" message, and Save-button confusion in the calibration step. Two clean modal lifecycles + a confirm dialog between them is simpler and bug-free.

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

Migration: users upgrading from v0.5.10 or earlier have no `record.calibratedGain` at all. First record post-upgrade enters two-pass calibration automatically. No banner; the title bar's "STEP 1 of 2: CALIBRATE VOLUME" plus the explanatory body copy makes the change self-evident.

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

The JX-3P emits a persistent idle tone *before* and *after* the actual FSK dump. When the user presses Save, the idle tone briefly pauses, then the pilot tone (real FSK) starts. That **silence→signal transition** is our trim anchor.

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

Calibration formula:

```js
targetGain = currentGain × 0.6 / measuredPeak
```

`0.6` is mid-target-zone (the LEVEL meter has a shaded band 30%–95%; 60% sits comfortably in the middle). Clamping to 0.5×–30× covers the slider's full range while preventing absurd values from edge-case measurements.

If `fskPeak` is 0 at stop time (silence→signal never fired, common with very quiet inputs at unity gain), we fall back to the full-buffer max amplitude. The full buffer includes pre-FSK idle tone, which is typically similar in amplitude to the FSK transmission on a JX — close enough to give a usable calibration even in the fallback case.

## UI components

### Modal hierarchy

Both calibration and capture modals use the same structure, with sections appearing/hiding based on mode:

```
┌─────────────────────────────────────┐
│ STEP N of 2: TITLE                  │  (.record-jx-step-title)
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
| `showRecordFromJxModal` | Main modal entry point. ~600 lines covering both calibration and capture branches. |
| `configureForCurrentDevice` | Decides calibration vs capture mode on modal open + device-picker change. |
| `buildJxKeyDiagram` | Reusable JX-3P key-sequence visual. Used by Record + Send modals. |
| `isDecodeAllDefault` | Heuristic detecting an all-empty-patches decode (every `vca_level === 0`). |
| `showRecalibratePrompt` | Modal offering re-calibration after a failed decode. |
| `applyToneCapture` / `applySequencerCapture` | Wire the captured WAV through decode + apply, with `isDecodeAllDefault` check. |
| `ensureRecordCalibrationShape` / `getCalibratedGain` / `setCalibratedGain` / `clearCalibratedGain` | `library.json` persistence helpers. |
| `record-to-wav` IPC handler (`main.js`) | Writes the in-memory PCM buffer to a temp WAV with RIFF header. |
