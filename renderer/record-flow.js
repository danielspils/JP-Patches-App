'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Record-from-JX flow decisions — pure logic extracted from the modal so the
// auto-calibration branch's NEW decision points are unit-testable (the modal
// itself is Electron/DOM-coupled and stays manual-QA; see docs/smoke-test.md).
//
// Two decisions live here:
//   chooseCaptureGain          — what gain to capture at (or: run calibration)
//   planDecodeFailureResponse  — what to do when a decode comes back empty
//
// Loaded both in the browser (via <script> in index.html → attaches to
// window) and Node (via require, for tests). Factory pattern handles both.
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  } else {
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  /**
   * Decide the capture gain for a Record-from-JX session.
   *
   * Precedence:
   *   1. A device with a SAVED calibration → use that gain (proven path).
   *   2. Auto-decode default, no saved gain, not forced to calibrate →
   *      capture at `initialGain` if supplied (e.g. a clipping step-down
   *      handed one forward), else `defaultGain`. The decode-time boost
   *      finds the level, so this just needs to avoid clipping.
   *   3. Otherwise (auto-decode off, or explicitly forced) → null, meaning
   *      "run the two-pass manual calibration".
   *
   * @returns {number|null} gain to capture at, or null to calibrate.
   */
  function chooseCaptureGain({ savedGain, autoDecodeDefault, forceCalibrate, initialGain, defaultGain }) {
    if (typeof savedGain === 'number' && savedGain > 0) return savedGain;
    if (autoDecodeDefault && !forceCalibrate) {
      return (typeof initialGain === 'number' && initialGain > 0) ? initialGain : defaultGain;
    }
    return null;
  }

  // Defaults mirror the modal's thresholds + the meter's bottom segment.
  const FAILURE_DEFAULTS = Object.freeze({
    noSignalThreshold: 0.02,   // below this = effectively silent
    clippingThreshold: 0.95,   // above this = clipped at capture
    maxStepDowns:      2,       // auto gain-halvings before manual calibrate
    stepDownFactor:    0.5,     // halve the capture gain each step
  });

  /**
   * Decide how to respond to a FAILED decode (empty result), given the
   * capture's measured peak + the gain used. Pure — the modal renders the
   * matching prompt from the returned `kind`.
   *
   *   'no-signal'        capture was ~silent → check cable/device/JX
   *   'clipping-stepdown' clipped AND under the step-down cap → auto-lower
   *                       the gain (nextGain) and re-record; user just
   *                       presses Save again (the mirror of the boost)
   *   'retry'            anything else → Try again / Calibrate
   *
   * Clipping that has exhausted the step-down cap falls through to 'retry'
   * (→ manual Calibrate), so it can never loop forever.
   *
   * @returns {{kind:string, nextGain?:number, nextStepDownCount?:number}}
   */
  function planDecodeFailureResponse({ capturePeak, captureGain, stepDownCount, opts }) {
    const o = Object.assign({}, FAILURE_DEFAULTS, opts || {});
    const peak = typeof capturePeak === 'number' ? capturePeak : null;
    const steps = stepDownCount || 0;

    if (peak !== null && peak < o.noSignalThreshold) {
      return { kind: 'no-signal' };
    }
    if (peak !== null && peak > o.clippingThreshold
        && typeof captureGain === 'number' && captureGain > 0
        && steps < o.maxStepDowns) {
      return {
        kind: 'clipping-stepdown',
        nextGain: captureGain * o.stepDownFactor,
        nextStepDownCount: steps + 1,
      };
    }
    return { kind: 'retry' };
  }

  return { chooseCaptureGain, planDecodeFailureResponse, FAILURE_DEFAULTS };
});
