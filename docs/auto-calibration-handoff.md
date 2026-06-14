# Auto-calibration — branch handoff (2026-06-12)

Built autonomously on branch **`feature/auto-calibration`** (both repos:
`~/JP-Patches-App` and the `~/JP-Patches` fork). **Nothing pushed to main,
nothing released.** This doc is the review + next-steps.

## TL;DR

The **codec backend is built, tested, and safe** — a decode-time normalization
sweep that auto-finds the right level on already-captured audio, so the manual
calibration step can become optional. But an honest finding changed the shape
of the work: **v0.8.1's peak-boost bump (0.7 → 0.92) already rescues every
failure I could synthesize.** The elaborate limiter sweep is *incremental*
robustness, not the hero. So before rewriting the Record-from-JX UX, we should
validate against a **real failing recording from your downstairs JX** — which I
don't have, and which my synthetic models can't faithfully stand in for.

## What's built (fork: `~/JP-Patches`, branch `feature/auto-calibration`)

`jx3p/codec.py`:
- Split the loader: `_load_wav_raw` (no normalization) + `_normalize_for_decode`
  (one-way boost below target; limiter — normalize + hard-clip — above 1.0).
- `_decode_sweep(samples, decode_fn, max_count)` — walks the rung ladder
  `_SWEEP_TARGETS = (0.92, 1.4, 2.2, 3.5, 6.0)`, decodes at each, **merges
  checksum-valid records across rungs** (first valid per position wins), stops
  once every position is recovered.
- `read_wav` / `read_seq_wav` now route through the sweep.
- **Safety guarantee, by construction:** rung 0 *is* the legacy path, and later
  rungs only ADD checksum-validated records — so the sweep can never decode
  fewer records than before. Clean dumps decode fully at rung 0 and
  short-circuit (zero added cost).

`tests/test_auto_calibration.py` — 6 tests, all green (full fork suite: 22
passed, 2 skipped):
- normalization regimes (boost-only vs limiter+clip),
- clean dump decodes at rung 0 and short-circuits,
- **sweep never decodes fewer records than legacy** (the core safety property),
- sweep recovers extra records under noise (aggregated over seeds),
- clean sequence round-trips through the sweep.

## The honest finding (why this matters)

I tried hard to synthesize a dump that fails the legacy path but the limiter
rescues. What I learned:
- **Uniformly quiet** capture → rung 0's boost lifts it → decodes. (This is the
  v0.8.1 fix. No sweep needed.)
- **Rounded / band-limited** tone → still decodes after boost.
- **Isolated loud transient + quiet body** → desyncs the demodulator for
  reasons unrelated to amplitude; not a faithful model.
- **Noise** → the limiter rungs recover *some* extra records, but broadband
  noise can't be clipped away, and real cable captures are low-noise.

Conclusion: the peak-boost does the heavy lifting; the limiter is a modest
safety net. **Your real downstairs-unit recording is the missing piece** — it
will tell us (a) whether v0.8.1 alone already fixed you, and (b) if not, what
the real failure looks like so we can tune the ladder against truth instead of
my guesses.

### Please capture a fixture
Next time you're at the downstairs JX: do a sequence Save, and **save the raw
WAV** (the "Save WAV file" path, or grab the temp capture). One failing dump as
`~/JP-Patches/tests/fixtures/quiet-unit-seq.wav` lets me convert the noise test
into a real-recording regression test and tune `_SWEEP_TARGETS` for real.
(Ironically v0.8.1 may make this hard to reproduce now — if so, that's the
answer: it's fixed.)

## App-side — SCOPED, NOT BUILT (needs your UX calls + the fixture)

"Full auto-calibration" on the app side means rewriting the Record-from-JX flow
so manual gain calibration is no longer mandatory. I did NOT do this blind — it
touches ~1,200 lines of stateful modal (`isCalibrating` threads through
`tickMeter`, `stopRecording`, the timeline, and the recalibrate prompt) and
hinges on decisions that are yours. The plan:

1. **Capture at one conservative fixed gain** that won't clip line inputs
   (cable or interface). The sweep auto-converges at decode, so the capture
   gain only has to avoid clipping. (`showRecordFromJxModal`, the
   `isCalibrating`/two-pass branch around lines 7900–8320 / 8700–8760.)
2. **Default path = capture → auto-decode.** Drop the mandatory two-pass
   calibration. Keep the live level meter purely as feedback.
3. **Keep a clipping detector** → "turn down your interface" (the one thing
   software can't undo — capture clipping is unrecoverable).
4. **Simplified self-calibration as an optional fallback** (you're open to
   this): a one-tap "having trouble? calibrate" that runs the old two-pass, for
   the rare pathological input.

**Open decisions for you:**
- Does the INPUT GAIN knob stay (as advanced) or disappear?
- What's the default fixed capture gain? (Pick from your two-unit range once we
  have the fixture — needs to not clip the hottest interface.)
- Does "calibrate" become a small link/menu item, or vanish entirely?

## Recommended next step

1. You grab one real failing recording (or confirm v0.8.1 fixed it).
2. We decide together: is the limiter sweep worth shipping into Bruce's shared
   codec, or is the v0.8.1 boost + app-side "auto-decode default" enough?
3. Then I build the app-side with your UX answers, validated against the
   fixture + a `docs/smoke-test.md` §3 pass before merge.

Branches are clean and isolated. Merge the fork branch only after the fixture
validation; the app-side isn't started, so there's nothing app-side to merge yet.
