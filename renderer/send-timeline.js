// Timeline math for the Send-to-JX modal.
//
// Pure functions extracted from app.js's showSendToJxFlow — the inline
// closures `computeSegDurations` and `updateIndicator` (the latter
// split into the pure `computeIndicatorPosition` plus the inline DOM
// mutation that consumes it). Tests-of-record for the segment-duration
// math and the indicator/active-segment selection.
//
// Loaded via <script> in renderer/index.html before app.js so the
// globals (computeSegDurations, computeIndicatorPosition,
// SEND_PILOT_SEC) are visible at app.js execution time.

(function () {
  'use strict';

  // Pilot segments are EXACTLY this long, regardless of the total WAV
  // duration: 4096 bits × 50 samples/bit ÷ 44100 Hz = 4.6440 s.
  // Both ends of the JX-3P tape format encode the pilot as a fixed
  // bit pattern at a fixed sample rate; the math is deterministic.
  // Non-pilot data segments share whatever's left over from the total.
  const SEND_PILOT_SEC = 4096 * 50 / 44100;

  // Given the WAV's total duration in seconds + the modal's segment
  // definitions (array with { pilot: boolean } per element), return an
  // array of per-segment durations parallel to `segments`. Pilots are
  // exact (SEND_PILOT_SEC each); the remainder is divided equally
  // among non-pilot segments. Negative remainders (total < pilots'
  // share, only happens on malformed WAVs) are clamped to 0 per data
  // segment — pilots still consume their fixed duration, the data
  // segments just collapse visually.
  /**
   * @typedef {Object} SendSegment
   * @property {boolean} pilot True for pilot-tone segments (fixed
   *   duration); false for data segments (share the remainder)
   */

  /**
   * Compute per-segment durations for the Send-to-JX timeline. Pilots
   * are exact ({@link SEND_PILOT_SEC}); data segments share the
   * remainder of `totalSec` equally. Negative remainders clamp data
   * segments to 0.
   *
   * @param {number} totalSec Total WAV duration in seconds
   * @param {SendSegment[]} segments Modal's segment definitions
   * @returns {number[]} Durations parallel to `segments`
   */
  function computeSegDurations(totalSec, segments) {
    if (!Array.isArray(segments) || segments.length === 0) return [];
    const numPilots = segments.filter((s) => s.pilot).length;
    const numData   = segments.length - numPilots;
    const pilotTotal = numPilots * SEND_PILOT_SEC;
    const dataEach   = numData > 0 ? Math.max(0, (totalSec - pilotTotal) / numData) : 0;
    return segments.map((s) => (s.pilot ? SEND_PILOT_SEC : dataEach));
  }

  // Given the current playback time + per-segment durations, return
  // the indicator's horizontal position (as percent of total, capped
  // at 100) plus which segment index the playhead is currently inside.
  // Used by the raf-loop equivalent (a setInterval, in this case) to
  // drive the timeline indicator's style.left and the active-segment
  // highlight class.
  //
  // Active-segment selection: walk the segments in order, accumulating
  // their durations; the first one whose accumulated end is past the
  // playhead is the active one. If the playhead is past the end of
  // every segment (shouldn't happen unless the WAV is longer than the
  // sum of segments), the last segment stays active.
  /**
   * Compute the timeline indicator's position + which segment is
   * currently active given the playhead position. Active-segment
   * selection: first segment whose accumulated end is past the
   * playhead; falls back to last segment if past everything.
   *
   * @param {number} currentSec Current playback time in seconds
   * @param {number[]} segDurations Per-segment durations from
   *   {@link computeSegDurations}
   * @returns {{pct: number, activeIdx: number}}
   *   pct = indicator's horizontal position (0–100, capped);
   *   activeIdx = which segment the playhead is inside
   */
  function computeIndicatorPosition(currentSec, segDurations) {
    if (!Array.isArray(segDurations) || segDurations.length === 0) {
      return { pct: 0, activeIdx: 0 };
    }
    const total = segDurations.reduce((a, b) => a + b, 0);
    const pct = total > 0 ? Math.min(100, (currentSec / total) * 100) : 0;
    let acc = 0;
    let activeIdx = segDurations.length - 1;   // default to last (past-end fallback)
    for (let i = 0; i < segDurations.length; i++) {
      acc += segDurations[i];
      if (currentSec < acc) { activeIdx = i; break; }
    }
    return { pct, activeIdx };
  }

  // Module API.
  if (typeof window !== 'undefined') {
    window.SEND_PILOT_SEC          = SEND_PILOT_SEC;
    window.computeSegDurations     = computeSegDurations;
    window.computeIndicatorPosition = computeIndicatorPosition;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SEND_PILOT_SEC, computeSegDurations, computeIndicatorPosition };
  }
})();
