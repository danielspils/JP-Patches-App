'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Calibration math — pure helpers for the Record-from-JX-3P flow.
//
// Extracted from showRecordFromJxModal's inline closures so they can be:
//   1. Unit-tested in Node (see test/calibration-math.test.js)
//   2. Re-used across multiple call sites in app.js without duplication
//   3. Documented + reasoned about independently of the modal lifecycle
//
// Loaded both in the browser (via <script> tag in index.html, attaches to
// window) and Node (via require, exports an object). Factory pattern below
// handles both environments.
//
// Currently the helpers are ALSO defined inline inside showRecordFromJxModal
// in app.js. That duplication is intentional during the transition: the
// inline versions will be removed in a future cleanup once we've verified
// the global versions work identically across all call sites. The tests
// in test/calibration-math.test.js exercise the canonical versions in
// this file — if app.js's inline versions ever drift, behavior may differ
// and the user-visible bug should surface.
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    // Node (test runner)
    module.exports = exports;
  } else {
    // Browser — attach each export to window so app.js can access via
    // window.X or the bare name (since renderer scripts share the global).
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ── Gain ↔ slider mapping ───────────────────────────────────────────────
  //
  // Log-scale: slider 0–100 maps to gain 0.1×–30× (300× range).
  //   sliderToGain(0)    = 0.1
  //   sliderToGain(50)   ≈ 1.732  (geometric mean of 0.1 and 30)
  //   sliderToGain(100)  = 30
  // gainToSlider is the inverse, clamped to 0–100 and rounded.

  const sliderToGain = (s) =>
    0.1 * Math.pow(300, s / 100);

  const gainToSlider = (g) =>
    Math.max(0, Math.min(100,
      Math.round(Math.log(Math.max(g, 0.001) / 0.1) / Math.log(300) * 100)
    ));    // clamp g ≥ 0.001 to avoid Math.log(negative) = NaN crash

  // Format a gain value for display in modal labels. "1×" gets one decimal,
  // "0.5×" gets two, "30×" gets none — matches the precision the user
  // can actually read off the meter.
  const formatGain = (g) =>
    g >= 10 ? `${g.toFixed(0)}×`
    : g >= 1 ? `${g.toFixed(1)}×`
    :          `${g.toFixed(2)}×`;

  // ── Gain ↔ knob angle mapping ───────────────────────────────────────────
  //
  // Same log scale as the slider, but parameterized to the knob's rotation
  // range. -135° (knob pointing at the "0" label, bottom-left) → +135°
  // (knob pointing at "10", bottom-right). 270° total rotation = 27° per
  // unit on the 0–10 dial.
  //
  //   gainToAngle(0.1)   = -135
  //   gainToAngle(~1.73) =    0  (12 o'clock, mid-dial)
  //   gainToAngle(30)    = +135

  const gainToAngle = (g) => {
    const clamped = Math.max(0.1, Math.min(30, g));
    const k = Math.log(clamped / 0.1) / Math.log(300) * 10;
    return -135 + k * 27;
  };

  const angleToGain = (a) => {
    const clampedA = Math.max(-135, Math.min(135, a));
    const k = (clampedA + 135) / 27;
    return 0.1 * Math.pow(300, k / 10);
  };

  // ── Decode-failure heuristic ────────────────────────────────────────────
  //
  // After a capture decodes, this returns true if EVERY patch in the
  // result has vca_level === 0. Real patches almost always have non-zero
  // VCA Level (otherwise they're inaudible), so 32-of-32 zeros is a
  // near-certain signal that the decode failed and the result is just
  // default-constructed JX3PPatch instances. Used to trigger the
  // RECALIBRATE_PROMPT flow instead of silently importing empty banks.

  const isDecodeAllDefault = (data) => {
    if (!data || !Array.isArray(data.banks)) return false;
    let any = false;
    for (let bi = 0; bi < data.banks.length; bi++) {
      const bank = data.banks[bi] || [];
      for (let s = 0; s < bank.length; s++) {
        const p = bank[s];
        if (!p) continue;
        any = true;
        if (typeof p.vca_level === 'number' && p.vca_level !== 0) return false;
      }
    }
    return any;
  };

  // ── Trim-threshold scaling ──────────────────────────────────────────────
  //
  // The JX's between-dumps idle tone is a roughly fixed pre-gain
  // amplitude (~0.005–0.010). After applying software gain g, it lands at
  // ~0.005g–0.010g. At low gain (≤4×) idle stays under the default 0.05
  // silence threshold; at higher gain it crosses and the silence detector
  // misfires. Scaling both thresholds with current gain (capped at 20× so
  // SIGNAL doesn't approach the calibrated FSK peak target of ~0.78)
  // restores correct trim behavior at any saved gain.
  //
  // Used in stopRecording's trim algorithm in app.js. See CLAUDE.md
  // pitfall #12 for the bug-history that motivated this.

  const computeTrimThresholds = (currentGain) => {
    const thresholdScale  = Math.min(20, Math.max(1, currentGain));
    return {
      SIGNAL_THRESHOLD:  Math.max(0.10, 0.025 * thresholdScale),
      SILENCE_THRESHOLD: Math.max(0.05, 0.012 * thresholdScale),
    };
  };

  // ── Calibration peak → saved gain ───────────────────────────────────────
  //
  // Given the gain the user dialed in during pass 1 AND the peak we
  // observed on the input meter, compute the gain to save (and use for
  // pass 2). The math normalizes so pass 2 peak lands at TARGET_PEAK
  // regardless of where the user dialed.
  //
  // Inputs are clamped: measurePeak capped at 0.95 to avoid clipping
  // transients dragging the saved gain too low; result clamped to
  // 0.5×–30× to cover the slider's full sane range.

  const computeCalibratedGain = (currentGain, measurePeak, TARGET_PEAK) => {
    if (typeof TARGET_PEAK !== 'number' || TARGET_PEAK <= 0) TARGET_PEAK = 0.78;
    const cappedMeasurePeak = Math.min(0.95, Math.max(0.001, measurePeak));
    const rawNewGain  = currentGain * TARGET_PEAK / cappedMeasurePeak;
    return Math.max(0.5, Math.min(30, rawNewGain));
  };

  return {
    sliderToGain,
    gainToSlider,
    formatGain,
    gainToAngle,
    angleToGain,
    isDecodeAllDefault,
    computeTrimThresholds,
    computeCalibratedGain,
  };
});
