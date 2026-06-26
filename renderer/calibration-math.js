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

  /**
   * Map slider position (0–100) to gain multiplier on the 0.1×–30× log
   * scale used by the Record-from-JX modal's INPUT GAIN slider.
   * @param {number} s Slider position, expected 0–100 (no clamping applied)
   * @returns {number} Gain multiplier (~0.1 at s=0, ~30 at s=100)
   */
  const sliderToGain = (s) =>
    0.1 * Math.pow(300, s / 100);

  /**
   * Inverse of {@link sliderToGain}: map a gain value back to slider
   * position. Result is clamped to [0, 100] and rounded for direct
   * assignment to an HTML range input's `value`.
   * @param {number} g Gain multiplier (any positive number; clamped internally)
   * @returns {number} Slider position, integer 0–100
   */
  const gainToSlider = (g) =>
    Math.max(0, Math.min(100,
      Math.round(Math.log(Math.max(g, 0.001) / 0.1) / Math.log(300) * 100)
    ));    // clamp g ≥ 0.001 to avoid Math.log(negative) = NaN crash

  /**
   * Format a gain multiplier for display in modal labels. Precision
   * matches what the user can actually read off the meter: "1×" gets
   * one decimal, "0.5×" gets two, "30×" gets none.
   * @param {number} g Gain multiplier
   * @returns {string} Formatted as e.g. "0.50×", "1.7×", "13×"
   */
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

  /**
   * Map gain multiplier to knob rotation angle in degrees. Same log
   * scale as {@link sliderToGain} but parameterized to the knob's
   * −135° (bottom-left, "0" label) → +135° (bottom-right, "10" label)
   * rotation range. 270° of total rotation covers the full 0.1×–30×
   * dynamic range.
   * @param {number} g Gain multiplier (clamped to [0.1, 30])
   * @returns {number} Rotation angle in degrees, in [-135, 135]
   */
  const gainToAngle = (g) => {
    const clamped = Math.max(0.1, Math.min(30, g));
    const k = Math.log(clamped / 0.1) / Math.log(300) * 10;
    return -135 + k * 27;
  };

  /**
   * Inverse of {@link gainToAngle}: map a knob rotation angle to its
   * gain multiplier. Used when the user drags the knob and we need to
   * update the saved-gain value live.
   * @param {number} a Rotation angle in degrees (clamped to [-135, 135])
   * @returns {number} Gain multiplier in [0.1, 30]
   */
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

  /**
   * Decode-failure heuristic. Returns true when every patch in the
   * decoded result has `vca_level === 0` — a strong signal the decoder
   * returned default-constructed `JX3PPatch()` instances because every
   * checksum failed. Used to trigger the recalibrate prompt instead of
   * silently importing 32 empty patches.
   *
   * @param {{ banks?: any[] } | null | undefined} data
   *   The decoded JSON from `jx3p wav-to-json`. Banks may be missing
   *   (returns false), null (returns false), or arrays with null patches
   *   inside (skipped).
   * @returns {boolean}
   *   true if at least one patch was inspected AND every inspected patch
   *   had vca_level=0. false otherwise (including the no-patches and
   *   any-real-VCA-level cases).
   */
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

  // (computeTrimThresholds removed from this module 2026-05-26 —
  // record-trim.js exports the authoritative version with a falsy-
  // guard on currentGain. The two were near-identical and the
  // record-trim version was already winning the global override at
  // runtime because index.html loads it after calibration-math.js.
  // ESLint's JSDoc-pass + manual cross-check surfaced the duplicate.)

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

  /**
   * Compute the gain to save after a calibration pass.
   *
   * The math: `newGain = currentGain × TARGET / measurePeak` — normalize
   * the saved gain so the next capture's peak lands at TARGET regardless
   * of where the user dialed during pass 1. Both inputs are defensively
   * clamped: measurePeak ≤ 0.95 to avoid clipping transients dragging
   * the saved gain too low; result clamped to [0.5, 30] for the slider's
   * usable range.
   *
   * @param {number} currentGain Software gain in effect during pass 1
   * @param {number} measurePeak Observed FSK peak in [0, 1]
   * @param {number} [TARGET_PEAK=0.45] Desired peak for pass 2; defaults
   *   to 0.45 (lowered from 0.78 in v0.8.6 — the decode-time boost lifts quiet
   *   captures, so a hot target only risks over-driving the gain) if not positive
   * @returns {number} New gain to save, clamped to [0.5, 30]
   */
  const computeCalibratedGain = (currentGain, measurePeak, TARGET_PEAK) => {
    if (typeof TARGET_PEAK !== 'number' || TARGET_PEAK <= 0) TARGET_PEAK = 0.45;
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
    computeCalibratedGain,
  };
});
