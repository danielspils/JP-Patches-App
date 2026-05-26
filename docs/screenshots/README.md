# Screenshots for the README

This directory holds the README's images. The README references these
paths directly, so dropping a PNG here with the right name immediately
renders it.

## What to capture

Quality over quantity — four well-framed shots beat a dozen mediocre
ones. README readers on GitHub typically look at the hero, scroll a
little, and decide whether to dig in. The hero shot earns its keep.

Capture at the default 1140×710 (or 100% zoom — Cmd+0) so the panel
proportions match what users will see. Mac screenshots (Cmd+Shift+4,
or Cmd+Shift+5 → "Capture Selected Window") produce 2× retina PNGs at
roughly 2280×1420 — perfect resolution for GitHub.

### Required (in priority order)

#### 1. `hero.png` — the panel in its glory
- Full window, ideally with a recognizable patch loaded (Spils Sounds
  `C1: Square Pants` is a good default — it has knobs at varied
  positions so the panel doesn't look static).
- Make sure the left bank list is showing — that's the in-app library
  affordance and it carries half the UI's identity.
- Don't hide the title bar (Cmd+Shift+5 with the "Show Window
  Background" option **off** captures cleanly).

#### 2. `tape-memory.png` — Record-from-JX modal mid-capture
- Open Tape Memory → Tone → Save from JX-3P → Record from JX-3P, with
  a saved calibration on file (so it opens in Step 2 capture mode, not
  Step 1 calibration).
- Capture while the level meter is showing real signal — convey
  "transmission live."
- The JP-logo cause→effect row is the visual centerpiece here.

#### 3. `library.png` — Library tab with sequences
- Click Library → Sequences. Have at least 3–4 saved sequences listed
  (your "Test Sequence", "gnarly-test-sequence", "Bass Sequence", etc.
  are perfect).
- The ⓘ info icon on hover is worth capturing visible — convey that
  rows are interactive.

#### 4. `custom-banks.png` — Custom Bank Builder with patches staged
- Click Create Custom Banks. Stage ~16–24 patches across the C + D
  buckets (doesn't need to be 16/16 — the partial state shows the
  staging-area affordance better than a completed grid).
- Make sure the origin labels are readable (`C8 from Daniel's Patches`
  etc.) — those convey that the builder is cherry-picking across
  library packages.

### Nice-to-have (only if you're feeling it)

- `sequence-visualizer.png` — Library → Sequences with a sequence
  selected, showing the piano-roll visualizer below the panel. Hover
  over a tied cell so the "tie" tooltip is visible.
- `recalibrate-prompt.png` — the failure-prompt modal with three
  buttons (Cancel / Recalibrate / Try Again) — shows the safety-net
  UX. (Only if you happen to hit the prompt during normal use; not
  worth provoking.)

## Naming + format

- Use lowercase, hyphen-separated names: `hero.png`, `tape-memory.png`.
- PNG, no JPEG (text rendering, sharp edges).
- 2× retina resolution is fine — GitHub serves them at 1× and the
  high-res versions look crisp on retina displays.
- Don't crop too tight — small breathing room around the window
  reads better than edge-to-edge.

## After adding a screenshot

Just commit the PNG. The README already references each path; the
image will appear inline. No README edits needed unless you want to
tweak the alt text or caption.
