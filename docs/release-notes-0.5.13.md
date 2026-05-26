# v0.5.13 — Capture-pipeline reliability sweep + internal refactor

This release is a deep cleanup of the **Record-from-JX-3P** flow. The
visible UX is mostly unchanged, but a dozen+ bugs that produced silent
failures, stuck modals, and confusing recalibration loops are now
fixed — plus the renderer has visibility scaffolding so future
failures of the same shape become diagnosable instead of mysterious.

## What's improved

### Capture-from-JX-3P silent failures eliminated

Several bugs in the Record-from-JX flow could leave you staring at a
closed modal with nothing in your library and no error message. All
now fixed:

- A scope error in the post-capture handoff (`runningPeak`) silently
  swallowed every clean capture's handoff — modal closed, no save
  prompt appeared. Affected captures back to v0.5.12. **Fixed.**
- A stale-variable reference (`recordBtn`) crashed the modal whenever
  the Record-from-JX button was clicked. **Fixed.**
- The device-change handler tore down in-flight captures whenever
  Chromium emitted a spurious `devicechange` event (which happens for
  innocuous reasons like sample-rate adjustments), corrupting the FSK
  decode. Now only acts when the *selected* device actually changes.
- Multiple `addEventListener` and `setTimeout` callbacks could swallow
  errors. Wrapped in surface-the-error helpers.

### Recalibrate now preserves your prior gain

Previously, clicking **Recalibrate** in the failure prompt reset the
gain knob to 1.0× — making the level meter look dead and forcing you
to manually re-find the ballpark before pass 1 could measure anything
useful. The flow now seeds the new calibration session with your
last-known-good gain, so pass 1 starts at a useful level and usually
converges in one shot.

### Sample-rate-mismatch notice (advisory)

When the Record-from-JX modal opens, JP now queries CoreAudio
directly (via `system_profiler`) for the selected input device's
native sample rate. If it's not 44.1 kHz, an amber advisory notice
appears next to the device picker explaining that Chromium will
resample on the fly. The notice is informational — most modern
interfaces survive the resample cleanly — but if a capture ever
decodes empty with good gain, the notice points you at the likely
fix in Audio MIDI Setup.

A **Re-check** button under the notice forces an immediate re-probe.

### Global error surface

Any unhandled error or rejected promise in the renderer now shows as
a red banner at the bottom of the viewport. Click to dismiss; auto-
fades after 30 s; stacks if multiple arrive close together. Means
silent failures of any kind become visible immediately — no more
"modal closed and nothing happened."

### Library save failures now surface

A disk-write failure (full disk, permission denied) during the
debounced library save used to vanish silently — you'd think your
edits were persisted when they weren't. Now caught and surfaced via
the global error banner.

### Sequence visualizer: REST vs TIE

The piano-roll visualizer now distinguishes between REST and TIE
button presses on the JX-3P:

- **Roland-blue cells** at full opacity now indicate a TIE event
  (note held + TIE pressed). Distinct from the column-wide blue
  tint used for fully-empty rest columns.
- **Hover tooltip** now reads "tie" / "rest" / pitch name based on
  the per-step voice data instead of the previous catch-all "hold".

The data was always there — we just weren't decoding the voice[1]
"new attack at same pitch" signature that distinguishes TIE from
REST. See `CLAUDE.md` pitfall #16 for the full encoding details.

## Internal changes

This release also includes a substantial refactor of the two biggest
modals (`showRecordFromJxModal` and `showSendToJxFlow`). The visible
behavior is identical; the internals are now unit-testable.

- **6 new modules** alongside `app.js`:
  - `record-trim.js` — FSK trim algorithm + PCM converter
  - `capture-warnings.js` — 4-state live warning ladder
  - `capture-state.js` — capture state machine + auto-stop ladder
  - `audio-capture.js` — getUserMedia constraint fallback + node graph
  - `send-timeline.js` — pilot/data segment math
  - (plus the pre-existing `calibration-math.js` and `library-math.js`)
- **77 new unit tests** (50 → 127 total, all passing)
- Three IPC handlers (`save-library`, `tape-save`, `seq-tape-save`,
  etc.) wrapped to return shaped errors instead of throwing
- Capture telemetry logged to `library.captureLog` (last 30 entries)
  + console `JP:CAPTURE` lines for diagnostic analysis

## Install

Download the DMG below. macOS will flag it as "damaged" — that's a
Gatekeeper warning, not real damage. To open: right-click the app →
Open → Open. (Apple Developer ID notarization is on the roadmap for
a future release.)

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
