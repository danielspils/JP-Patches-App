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

- **In-app capture of JX tape dumps (receive side).** Mirror image of the *Send to JX-3P* modal flow, for the receive direction. Today the user records the JX's tape-out audio externally (QuickTime, Audacity, phone) and then drops the WAV into the app; this future feature would capture audio directly from the Mac's input. Sketch: open a modal with setup instructions (connect JX audio-out → Mac input, arm JX with Tape Memory → Tone → Save), pick the Mac input device, click *Record from JX*, app uses `navigator.mediaDevices.getUserMedia({audio: true})` + Web Audio to capture raw PCM at 44.1 kHz, writes a temp WAV, runs through existing `jx3p wav-to-json` pipeline. Done state shows the imported patches the same way the file-drop flow does today. Requires `NSMicrophoneUsageDescription` in Info.plist (electron-builder build config), input device picker, optional auto-stop on FSK trailer detection. Sequence version is the same shape with `jx3p wav-to-seq-json`. Estimate ~4–6 hours of focused work for the full flow including level meter + error states. Until then, the file-drop import flow stays as-is.

## Library metadata

- **Per-patch event log (Patch history v2).** Today the Patch history modal shows two static lines: current slot + library, and a single origin line with the upload date. A richer version would carry a chronological event trail on each patch — created, library renamed, copied into another library, edited (with which params changed), renamed. Modal would render each event as one dated row, so the patch's full story is visible at a glance. Shape sketch: each slotMeta entry grows an `events: []` array; saves diff against prior state and append entries with `{ when, kind, detail }`. Edits log only at save time, not per knob twist, to keep the trail readable. Migration: existing patches start with one synthetic `Snapshot recorded …` entry using the current snapshot date — the real first-upload date is unrecoverable for libraries that predate the event log. Estimated 2–3 hours including diff logic, schema, migration, and modal redesign. Data cost is small (≈80 bytes per event; a heavy user with 10 libraries × 20 events per patch is still under 1 MB).

## Smaller polish

- **App-level Undo/Redo.** The macOS Edit menu's Undo/Redo items are currently omitted because they would only undo text edits inside name fields — not the much more interesting "undo the last knob twist / patch load / custom-bank reorder". A real Undo/Redo would require an action-history stack: push an inverse operation each time the user does something with persistent effect (knob change, switch toggle, slot rename, patch load, custom-bank slot edit, package save/delete, sequence save/delete). Add the items back to the Edit menu and bind Cmd+Z / Cmd+Shift+Z. Estimate: small-to-medium — the history infrastructure is straightforward but the universe of "undoable actions" is wide (~15 entry points) and each one needs an inverse defined and tested. Worth doing once the v1 surface stops changing weekly.

- **(Add new items here as they come up.)**
