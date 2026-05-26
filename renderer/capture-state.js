// Capture state-machine helpers for the Record-from-JX raf loop.
//
// Pure functions extracted from app.js's tickMeter (the per-frame
// raf callback inside showRecordFromJxModal) so the state transitions
// + auto-stop conditions are unit-testable in isolation. The modal
// still owns the raf scheduling and all DOM mutations — this module
// just answers "given the previous state + the latest tick, what's
// the new state and what UI events should fire?"
//
// State diagram (high level):
//
//   silence (peak < silenceThreshold)
//     ↓ accumulates consecSilenceMs
//   signal (peak > signalThreshold)
//     ↓ accumulates totalSignalMs
//     ↓ if consecSilenceMs ≥ 500ms first → fskJustStarted event
//     ↓ updates fskPeak, activeMs
//
// Auto-stop triggers (priority order, returned in `events.autoStop`):
//   silence-after-signal  totalSignalMs ≥ 5s AND consecSilenceMs ≥ 1s
//   dump-timeout          firstSignalMs set AND elapsed since ≥ EXP+500
//   total-signal          totalSignalMs ≥ EXP
//   safety-timeout        elapsed since recordStart ≥ EXP+6000
//
// EXP = expectedSignalMs (passed in by caller, varies by tone/sequence kind).

(function () {
  'use strict';

  // ── Threshold scaling ─────────────────────────────────────────────
  //
  // The analyser sees POST-gain audio (sourceNode → gainNode →
  // analyserNode). At higher software gain values, the JX-3P's idle
  // tone (constant ~0.005–0.010 pre-gain) lands above the static 0.10
  // signal floor, which would make firstSignalMs trip immediately on
  // modal open and totalSignalMs accumulate the entire pre-Save idle
  // period — eventually firing the total-signal auto-stop DURING the
  // dump. Symptom (2026-05-25 sequence bug): "Recording didn't decode
  // cleanly" recalibrate prompt for sequences specifically.
  //
  // Fix: scale both thresholds with current gain (same scaling factor
  // as the trim thresholds in record-trim.js's computeTrimThresholds).
  // Capped at 20× so the signal threshold doesn't approach the FSK
  // peak target. See CLAUDE.md pitfall #12 for the parallel-scaling
  // contract between this module and record-trim.js.
  function liveThresholdsFor(gain) {
    const scale = Math.min(20, Math.max(1, gain || 1));
    return {
      silence: Math.max(0.03, 0.012 * scale),
      signal:  Math.max(0.10, 0.025 * scale),
    };
  }

  // ── Peak extraction ───────────────────────────────────────────────
  //
  // Reads the analyser's time-domain bytes and returns the peak in
  // [0, 1]. The buffer is reused across ticks (allocated once in the
  // modal's startRecording) to avoid per-frame allocation pressure.
  // Bytes are 0..255 with 128 = silence; we shift to [-128..127],
  // take abs, normalize to [0..1].
  function readAnalyserPeak(analyserNode, buffer) {
    analyserNode.getByteTimeDomainData(buffer);
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.abs(buffer[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return peak;
  }

  // ── State factory ─────────────────────────────────────────────────
  //
  // Initial state for a fresh capture session. All counters at zero,
  // all timestamps null. Modal calls this at the start of each
  // startRecording invocation; the returned object is the input to
  // the first updateCaptureState call.
  function makeInitialCaptureState() {
    return {
      runningPeak:     0,      // max peak seen across the entire session
      fskPeak:         0,      // max peak DURING FSK (after fskStartMs fires)
      totalSignalMs:   0,      // cumulative ms where peak > signalThreshold
      fskStartMs:      null,   // wall-clock when silence→signal pattern detected
      firstSignalMs:   null,   // wall-clock when peak first crossed signalThreshold
      activeMs:        0,      // accumulated ms inside FSK transmission
      consecSilenceMs: 0,      // current consecutive silence streak
      lastTickMs:      null,   // wall-clock of previous tick (for dt computation)
    };
  }

  // ── State machine update ──────────────────────────────────────────
  //
  // Pure. Given the previous state + the current tick, returns the
  // next state and a small `events` object describing transitions
  // the caller may want to react to (typically DOM updates).
  //
  // Tick shape:
  //   {
  //     peak:             number 0..1, current frame's peak amplitude
  //     now:              Date.now() at this tick
  //     silenceThreshold: number 0..1, current live silence threshold
  //     signalThreshold:  number 0..1, current live signal threshold
  //     recordStartMs:    Date.now() when recording began (for elapsed)
  //     expectedSignalMs: ms budget for this dump kind (auto-stop math)
  //   }
  //
  // Events shape:
  //   {
  //     fskJustStarted:  bool — fskStartMs transitioned from null to a value
  //     progressPct:     number 0..100 OR null — calibration progress
  //                      (computed only when firstSignalMs is set)
  //     autoStop:        null OR one of: 'silence-after-signal',
  //                      'dump-timeout', 'total-signal', 'safety-timeout'
  //     elapsedTotal:    ms since recordStartMs (saves caller a Date.now)
  //   }
  function updateCaptureState(prev, tick) {
    const { peak, now, silenceThreshold, signalThreshold, recordStartMs, expectedSignalMs } = tick;
    const dtMs = prev.lastTickMs !== null ? (now - prev.lastTickMs) : 0;

    const runningPeak   = peak > prev.runningPeak ? peak : prev.runningPeak;
    let fskPeak         = prev.fskPeak;
    let totalSignalMs   = prev.totalSignalMs;
    let fskStartMs      = prev.fskStartMs;
    let firstSignalMs   = prev.firstSignalMs;
    let activeMs        = prev.activeMs;
    let consecSilenceMs = prev.consecSilenceMs;
    let fskJustStarted  = false;

    if (peak < silenceThreshold) {
      // Sustained-silence accumulation; signal-side resets the streak.
      consecSilenceMs += dtMs;
    } else {
      if (peak > signalThreshold) {
        totalSignalMs += dtMs;
        if (firstSignalMs === null) firstSignalMs = now;
        // Detect the silence→signal "Save press" pattern. Requires
        // ≥ 500 ms of prior silence to filter brief idle dips.
        if (fskStartMs === null && consecSilenceMs >= 500) {
          fskStartMs = now;
          fskJustStarted = true;
        }
        if (fskStartMs !== null) {
          activeMs += dtMs;
          if (peak > fskPeak) fskPeak = peak;
        }
      }
      consecSilenceMs = 0;
    }

    // Calibration-mode progress: wall-clock since first signal vs the
    // expected dump duration. Caller decides whether to apply this to
    // the UI (only meaningful in calibration mode).
    const progressPct = firstSignalMs !== null
      ? Math.min(100, ((now - firstSignalMs) / expectedSignalMs) * 100)
      : null;

    // Auto-stop ladder. Priority order matches the inline original.
    const elapsedTotal    = now - recordStartMs;
    const signalElapsed   = firstSignalMs !== null ? (now - firstSignalMs) : 0;
    const DUMP_TIMEOUT_MS   = expectedSignalMs + 500;
    const SAFETY_TIMEOUT_MS = expectedSignalMs + 6000;

    let autoStop = null;
    if (totalSignalMs >= 5000 && consecSilenceMs >= 1000)             autoStop = 'silence-after-signal';
    else if (firstSignalMs !== null && signalElapsed >= DUMP_TIMEOUT_MS) autoStop = 'dump-timeout';
    else if (totalSignalMs >= expectedSignalMs)                       autoStop = 'total-signal';
    else if (elapsedTotal >= SAFETY_TIMEOUT_MS)                       autoStop = 'safety-timeout';

    return {
      state: {
        runningPeak, fskPeak, totalSignalMs,
        fskStartMs, firstSignalMs, activeMs,
        consecSilenceMs,
        lastTickMs: now,
      },
      events: { fskJustStarted, progressPct, autoStop, elapsedTotal },
    };
  }

  // Module API.
  if (typeof window !== 'undefined') {
    window.liveThresholdsFor       = liveThresholdsFor;
    window.readAnalyserPeak        = readAnalyserPeak;
    window.makeInitialCaptureState = makeInitialCaptureState;
    window.updateCaptureState      = updateCaptureState;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      liveThresholdsFor,
      readAnalyserPeak,
      makeInitialCaptureState,
      updateCaptureState,
    };
  }
})();
