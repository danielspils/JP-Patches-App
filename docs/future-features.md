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

- **Adaptive app sizing.** Window is currently locked at 1140×710 with `resizable: false`. On big displays the app appears as a small fixed window with dark space around it; on Macs smaller than 1140 wide, content gets clipped offscreen. Drop the resize lock, set a sensible `minWidth`/`minHeight` floor, add a max-width / aspect-ratio constraint so the panel SVG doesn't stretch on giant monitors. Most of the existing CSS uses `100vw`-based calcs that are mathematically correct at any width, but visually unverified at sizes other than 1140 — expect 2-4 hours of testing + tweaking at a few intermediate breakpoints. The bucket grid in the Custom Banks builder is the highest-risk area to re-verify.

## Blocked

- **MIDI integration (v2).** Full bidirectional CC sync with the JX-3P. Blocked on installing the Series Circuits JX-3P MIDI Upgrade Kit. CC map and architecture are already in the spec doc — see `library-and-midi-spec.md` §Phase 3.

## Data interchange

- **Embed patch names in exported WAV (v1.x).** The JX-3P tape format only carries the 32 patch parameter bytes per slot — no name field — so names are lost when a bank round-trips through WAV. WAV is a RIFF container that allows custom metadata chunks alongside the PCM audio; the JX ignores everything except PCM so adding a chunk doesn't break tape loading. Approach: on export, append a `LIST/INFO`-style chunk containing the bank's `slotMeta` JSON; on import, read it back if present. Result: round-trip via WAV preserves names within the app while remaining a valid JX tape dump. Either implement in the renderer's main-process IPC handler (post-process the WAV after `jx3p json-to-wav` writes it) or push upstream into Bruce's `jx3p` tool with an opt-in flag.

## Smaller polish

- **(Add new items here as they come up.)**
