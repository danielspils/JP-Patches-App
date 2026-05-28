# Screenshots for the README + jx-3p.com site

This directory holds images that feed **two** consumers:

1. The repo's `README.md` — references images via `docs/screenshots/jx-*.png`
2. The Pages site at **jx-3p.com** — uses the same files via `screenshots/jx-*.png` (since the Pages source is `/docs`)

So one PNG = both surfaces. No duplication.

## Naming convention

`jx-` prefixed, lowercase, hyphen-separated:

- `jx-hero.png`
- `jx-save-to-app.png`
- `jx-save-to-synth.png`
- `jx-custom-patch-banks.png`
- `jx-sequencer.png`
- `jx-cable.png`

PNG only (text rendering, sharp edges). 2× retina is fine — GitHub serves at 1× and the high-res versions look crisp on retina displays.

## What to capture

Quality over quantity — six well-framed shots beat a dozen mediocre ones. Visitors typically look at the hero, scroll a little, and decide whether to dig in. The hero shot earns its keep.

Capture at the default 1140×710 (or 100% zoom — Cmd+0) so the panel proportions match what users will see. Mac screenshots (Cmd+Shift+4, or Cmd+Shift+5 → "Capture Selected Window") produce 2× retina PNGs at roughly 2280×1420 — perfect resolution.

### Currently in this folder

#### `jx-hero.png` — the panel in its glory
Full window, ideally with a recognizable patch loaded (Spils Sounds `C1: Square Pants` is a good default — it has knobs at varied positions so the panel doesn't look static). Make sure the left bank list is showing — that's the in-app library affordance and it carries half the UI's identity.

#### `jx-save-to-app.png` — Record-from-JX modal mid-capture
Open Tape Memory → Tone → Save from JX-3P → Record from JX-3P, with a saved calibration on file (so it opens in Step 2 capture mode, not Step 1 calibration). Capture while the level meter is showing real signal — convey "transmission live." The JP-logo cause→effect row is the visual centerpiece.

#### `jx-save-to-synth.png` — Send-to-JX modal in play state
The Send-to-JX-3P flow with the timeline + Play button visible. Conveys the reverse direction (JP → JX) of the same tape-based transfer.

#### `jx-custom-patch-banks.png` — Custom Bank Builder with patches staged
Click Create Custom Banks. Stage ~16–24 patches across the C + D buckets (doesn't need to be 16/16 — partial state shows the staging affordance better than a completed grid). Make sure origin labels are readable (`C8 from Daniel's Patches` etc.) so it's clear the builder cherry-picks across library packages.

#### `jx-sequencer.png` — Library Sequences with the visualizer
Click Library → Sequences, click a sequence with content. Single-page view (zoom into one of the 8 pages) reads better than the 8-page overview. Conveys the editor surface — piano-roll + page nav + playback.

#### `jx-cable.png` — hardware setup
Photo (or rendering) of the USB-to-1/4" cable used to connect the Mac to the JX-3P's Tape Memory jacks. Useful in the "HOW DOES IT WORK?" section of the site so first-time users see what they need.

### Nice-to-have (optional, future)

- `jx-recalibrate-prompt.png` — the failure-prompt modal with three buttons (Cancel / Recalibrate / Try Again). Shows the safety-net UX. Only if you happen to hit the prompt during normal use; not worth provoking.

## After adding/replacing a screenshot

- The README and site already reference each path by name; the image appears inline after a refresh.
- GitHub Pages caches aggressively (~10 min). If you push an updated image with the same filename, hard-refresh (Cmd+Shift+R) or wait for cache expiry to see the new version.
- No README edits needed unless you want to tweak alt text or add a new shot to a new section.
