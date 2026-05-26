// 4-state warning ladder for the Record-from-JX capture loop.
//
// Pure thresholds + messages + classifier extracted from app.js's
// tickMeter so they're trivially unit-testable in isolation. The
// runtime caller (tickMeter) still owns the level-meter raf loop and
// the statusText DOM mutation; this module just answers the question
// "given these live metrics, what warning state should we be in?"
//
// Loaded via <script> in renderer/index.html before app.js so the
// global helpers (classifyCaptureWarning, CAPTURE_WARN_COPY, etc.)
// are visible at app.js execution time.
//
// State machine (priority order, highest first):
//
//   clipping              live peak ≥ 0.95
//                         → "lower INPUT GAIN" (Roland red)
//   no-signal-escalated   elapsedMs > 20000 && totalSignalMs < 200
//                         → "check device + cable + JX is on" (Roland red)
//   no-signal             elapsedMs > 8000  && runningPeak < 0.03
//                         → "press Save on the JX" (amber)
//   quiet                 elapsedMs > 6000  && runningPeak < 0.15
//                         → "raise INPUT GAIN" (amber)
//   null                  otherwise — no warning
//
// Each state auto-clears as soon as the underlying condition resolves
// (the classifier is pure; the raf loop calls it every frame and
// compares to the previous state to decide whether to update the DOM).

(function () {
  'use strict';

  // Numeric thresholds — exposed so tests can reference them and
  // future tweaks have a single source of truth.
  const CAPTURE_WARN_THRESHOLDS = Object.freeze({
    CLIPPING_PEAK:                  0.95,
    NO_SIGNAL_ESCALATED_ELAPSED_MS: 20000,
    NO_SIGNAL_ESCALATED_TOTAL_MS:   200,
    NO_SIGNAL_ELAPSED_MS:           8000,
    NO_SIGNAL_RUNNING_PEAK:         0.03,
    QUIET_ELAPSED_MS:               6000,
    QUIET_RUNNING_PEAK:             0.15,
  });

  // User-facing message for each state. Keep wording aligned with the
  // design-system doc's tone (concrete actionable instructions, not
  // jargon).
  const CAPTURE_WARN_COPY = Object.freeze({
    'clipping':            '⚠ CLIPPING — lower INPUT GAIN immediately or capture will decode as noise.',
    'no-signal-escalated': '⚠ No audio detected after 20 s. Check that the right INPUT DEVICE is selected, your cable is connected, and the JX is on. Click Cancel to try again.',
    'no-signal':           '⚠ No audio detected yet. Press Save on the JX-3P, or check your cable / input device selection above.',
    'quiet':               '⚠ Signal is very low. Raise INPUT GAIN until the level reaches the target notch (the yellow segment).',
  });

  // Color for each state. Roland red = severe (action required now),
  // amber = informational (worth fixing but not yet ruining the capture).
  const CAPTURE_WARN_COLOR = Object.freeze({
    'clipping':            '#b94a2e',
    'no-signal-escalated': '#b94a2e',
    'no-signal':           '#c39a3a',
    'quiet':               '#c39a3a',
  });

  // Pure classifier — given the live capture metrics, returns the
  // warning state key (or null for "no warning"). Pure function;
  // safe to call from the raf loop every frame.
  //
  //   peak         current live peak (0..1) of the most recent meter sample
  //   runningPeak  modal-scoped max-of-all-peaks (0..1)
  //   elapsedMs    ms since startRecording() began
  //   totalSignalMs cumulative ms where peak > SIGNAL_THRESHOLD_LIVE
  //
  // Returns one of: 'clipping' | 'no-signal-escalated' | 'no-signal' | 'quiet' | null
  /**
   * @typedef {'clipping' | 'no-signal-escalated' | 'no-signal' | 'quiet'} CaptureWarn
   */

  /**
   * Classify the current capture state into one of four warning levels
   * (or null = no warning). Pure — safe to call every raf frame. See
   * module header for the priority ladder.
   *
   * @param {Object} args
   * @param {number} args.peak           Current frame peak in [0, 1]
   * @param {number} args.runningPeak    Modal-scoped max-of-all-peaks in [0, 1]
   * @param {number} args.elapsedMs      Ms since startRecording() began
   * @param {number} args.totalSignalMs  Cumulative ms above signalThreshold
   * @returns {CaptureWarn | null}
   */
  function classifyCaptureWarning({ peak, runningPeak, elapsedMs, totalSignalMs }) {
    const t = CAPTURE_WARN_THRESHOLDS;
    if (peak >= t.CLIPPING_PEAK)                              return 'clipping';
    if (elapsedMs > t.NO_SIGNAL_ESCALATED_ELAPSED_MS
        && totalSignalMs < t.NO_SIGNAL_ESCALATED_TOTAL_MS)    return 'no-signal-escalated';
    if (elapsedMs > t.NO_SIGNAL_ELAPSED_MS
        && runningPeak < t.NO_SIGNAL_RUNNING_PEAK)            return 'no-signal';
    if (elapsedMs > t.QUIET_ELAPSED_MS
        && runningPeak < t.QUIET_RUNNING_PEAK)                return 'quiet';
    return null;
  }

  // Module API — exposed as window globals (browser) and module.exports
  // (Node, for tests).
  if (typeof window !== 'undefined') {
    window.classifyCaptureWarning   = classifyCaptureWarning;
    window.CAPTURE_WARN_COPY        = CAPTURE_WARN_COPY;
    window.CAPTURE_WARN_COLOR       = CAPTURE_WARN_COLOR;
    window.CAPTURE_WARN_THRESHOLDS  = CAPTURE_WARN_THRESHOLDS;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      classifyCaptureWarning,
      CAPTURE_WARN_COPY,
      CAPTURE_WARN_COLOR,
      CAPTURE_WARN_THRESHOLDS,
    };
  }
})();
