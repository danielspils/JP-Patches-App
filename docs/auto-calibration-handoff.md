# Auto-calibration — branch handoff (2026-06-12)

Built autonomously on branch **`feature/auto-calibration`** (both repos:
`~/JP-Patches-App` and the `~/JP-Patches` fork). **Nothing pushed to main,
nothing released.** This doc is the review + next-steps.

## STATUS (updated 2026-06-14): build complete, pending hardware QA + merge

Decision settled on **option C**. The exploratory decode-time *sweep/limiter*
was **reverted** — testing proved the plain peak-boost (shipped in v0.8.1)
decodes every real case, and the limiter rungs over-clip a clean FSK tone
(decode nothing). What's on the branch now:

- **Fork (`~/JP-Patches`):** codec back to v0.8.1 (boost only) + a real-hardware
  regression fixture (`quiet-unit-seq.wav`, an actual ~12% capture) and tests.
- **App (`~/JP-Patches-App`):** auto-decode-default flow — first-use captures at
  `DEFAULT_CAPTURE_GAIN` (2.0×), the boost decodes, no mandatory calibration. The
  pre-decode peak warning is gone (decode result is the source of truth). Failure
  handling: recovery prompt with peak-informed advice + a clipping auto-step-down.
  New decision logic extracted to `renderer/record-flow.js` (14 unit tests).
- **QA:** `docs/smoke-test.md` §6b rewritten for the new flow. App suite 469 green,
  fork 19 green, lint clean, dev app renders clean.

**Validated on real hardware (3×):** laptop+KT#1+downstairs (12% → decoded),
Mac Mini+KT#2 (recalibrate worked — the boost now fires on calibrated captures),
laptop+KT#1+upstairs ("Drunk Pony" → decoded). The original bug is already fixed
in shipped v0.8.1; this branch is the *UX* win (no manual calibration step).

**Still gates the merge:** a full `docs/smoke-test.md` §6 + §6b pass on hardware,
and the merge itself (squash the fork's sweep+revert commits). Nothing pushed to
main, nothing released.

---

### Original mid-build notes (2026-06-12), for the record

The codec backend was first built as a decode-time normalization *sweep* that
auto-finds the right level on already-captured audio. An honest finding changed
the shape of the work: **v0.8.1's peak-boost bump (0.7 → 0.92) already rescues
every failure I could synthesize.** The elaborate limiter sweep was *incremental*
robustness, not the hero — and a real 12% capture later confirmed the boost
alone decodes it (the limiter rungs decode nothing on a clean tone). Hence the
revert to option C above.

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

## App-side — DRAFT BUILT (minimal + reversible; needs your hardware test)

Built on the branch as a **minimal, proven-path-reusing** change (NOT the full
modal rewrite — that stays for after your UX calls). `renderer/app.js`:
- New flag `AUTO_DECODE_DEFAULT = true` + `DEFAULT_CAPTURE_GAIN = 2.0` (near
  `clearCalibratedGain`, ~line 2080).
- `configureForCurrentDevice`: a never-calibrated device now defaults into the
  **existing single-pass capture branch** at `DEFAULT_CAPTURE_GAIN` (via a new
  `effectiveGain = cal ? cal.gain : DEFAULT_CAPTURE_GAIN`) instead of forcing
  the two-pass calibration. So first-use = press Save → capture → the fork
  sweep decodes it. No mandatory calibration.
- **Fallback intact:** the two-pass calibration flow is unchanged and reachable
  via the recalibrate-on-failure prompt. Threaded a new `forceCalibrate` param
  so "Recalibrate" forces the two-pass flow even with the flag on (otherwise it
  would bounce back to auto). So the user is never worse off than today — worst
  case they spend one auto-attempt dump, then calibrate exactly as before.
- Verified: eslint clean, 455 app tests pass, dev app launches with no renderer
  errors. **NOT verified on hardware** (no JX here) — that's your gate.

**Why minimal, not the full rewrite:** I can't validate the capture path without
a real JX, and the deep UX calls below are yours. This draft delivers the core
"no mandatory calibration" behavior by reusing the proven capture-mode code,
and it's a ~20-line reversible diff (flip `AUTO_DECODE_DEFAULT = false` to fully
restore old behavior). The larger rewrite plan, for when you've decided:

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

**Open decisions for you (the draft picked conservative defaults — redirect freely):**
- **`DEFAULT_CAPTURE_GAIN = 2.0`** is a blind guess biased low for clip-safety
  (the sweep boosts quiet captures up). Your KT needed ~11× to read on the
  meter, so at 2× the live meter will look quiet during a first-use capture even
  though the sweep still decodes. Tune against your two units once a fixture
  exists; consider seeding from the user's mean existing calibration.
- The gain knob is **hidden** in this mode (matches normal capture mode). If
  first-use clips, the user only gets the knob via the recalibrate fallback —
  acceptable, but you may want the knob visible as a clip escape hatch.
- Does "calibrate" become a small link/menu item, or vanish entirely?

## Recommended next step

1. You grab one real failing recording (or confirm v0.8.1 fixed it).
2. We decide together: is the limiter sweep worth shipping into Bruce's shared
   codec, or is the v0.8.1 boost + app-side "auto-decode default" enough?
3. Then I build the app-side with your UX answers, validated against the
   fixture + a `docs/smoke-test.md` §3 pass before merge.

Branches are clean and isolated. Merge the fork branch only after the fixture
validation; the app-side isn't started, so there's nothing app-side to merge yet.
