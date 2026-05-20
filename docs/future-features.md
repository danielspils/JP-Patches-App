# Future features

Single source of truth for features that aren't on the formal roadmap (`library-and-midi-spec.md`) yet. Move items into the spec when they're scoped enough to schedule.

## Ready to build

- **First-run seeding.** Ship the app with "Daniel's Patches" loaded into the active C/D banks plus a "Daniel's Sequence" entry in the Library, so a brand-new user sees content instead of an empty state. Source: Daniel's current `~/Desktop/patches.json` + library package + sequence. Seed only when the user's `library.json` is missing on first launch — never re-seed.
- **README screenshots refresh.** Current screenshots predate the vintage cream palette and the Custom Banks redesign. Capture fresh screenshots and embed in the README.

## Distribution

- **Apple Developer ID + notarization.** Drop the "damaged" Gatekeeper dialog on download. $99/yr, one-time setup of signing/notarization in `electron-builder` + Apple's `notarytool`. After setup, every release auto-signs.
- **Mac App Store publish.** Paid distribution of the same app, code-signed and notarized, with auto-updates. App Store listing would point users to the free open-source GitHub build. Depends on the Developer ID being set up first.

## Audio

- **Patch sound samples.** Record a short audio sample (a few seconds, fixed note + velocity) for each patch so users can preview a patch without selecting it on the synth. Open questions: where the audio is captured (manual record? auto-sample at save time?), where it's stored (per-patch in `library.json` as base64? sidecar files?), what playback affordance lives in the patch list. Probably v2-era since reliable capture wants MIDI to drive the synth.

## Platform

- **Windows port.** Electron makes this ~1-2 days of code work (swap `titleBarStyle`, ship Windows `uv.exe`, add `--win` target to `electron-builder`). Real blocker is testing — no Windows hardware on hand. Worth doing only when a Windows-using JX-3P owner volunteers to smoke-test, or after Mac notarization is done so it's not the highest-leverage next step.

## Blocked

- **MIDI integration (v2).** Full bidirectional CC sync with the JX-3P. Blocked on installing the Series Circuits JX-3P MIDI Upgrade Kit. CC map and architecture are already in the spec doc — see `library-and-midi-spec.md` §Phase 3.

## Smaller polish

- **Always-centered modal titles.** Currently only modals with no body get centered title + buttons. Could push to "centered title always, regardless of body" for visual consistency. Trade-off: loses the slight visual cue that body-having modals have more info.
- **(Add new items here as they come up.)**
