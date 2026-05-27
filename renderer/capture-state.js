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
//   silence-after-signal  totalSignalMs ≥ 5s AND consecBelowSignalMs ≥ 1s
//   dump-timeout          firstSignalMs set AND elapsed since ≥ EXP+500
//   total-signal          totalSignalMs ≥ EXP
//   safety-timeout        firstSignalMs set AND elapsed since recordStart ≥ EXP+6000
//
// EXP = expectedSignalMs (passed in by caller, varies by tone/sequence kind).
//
// All four triggers REQUIRE a signal to have been detected at some
// point — none fire if the user opens the modal and just sits there.
// That's deliberate: previously safety-timeout fired purely on wall-
// clock elapsed (≈36 s after modal open for sequences), so a user who
// hadn't yet pressed Tape Memory → Save on the JX would get the
// "Recording didn't decode cleanly" prompt against an empty buffer.
// The modal now waits idly until the JX actually transmits OR the
// user clicks Cancel.
//
// Trade-off: while idling, the capture loop still buffers audio into
// `captured` (~176 KB/s at 44.1 kHz × Float32 mono). A 5-minute idle
// is ~50 MB — not a real concern in practice but worth flagging.

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
  /**
   * Live silence/signal thresholds scaled against current software
   * gain. Same scaling factor as record-trim.js's computeTrimThresholds
   * (CLAUDE.md pitfall #12 — keep in sync).
   *
   * @param {number} gain Software gain (1× = unity). Falsy clamps to 1×.
   * @returns {{silence: number, signal: number}}
   */
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
  /**
   * Read the analyser's time-domain bytes and return the peak in
   * [0, 1]. The `buffer` is reused across ticks (allocated once in
   * the modal's startRecording) to avoid per-frame allocation.
   *
   * @param {AnalyserNode} analyserNode Web Audio analyser node
   * @param {Uint8Array} buffer Reusable buffer sized to analyserNode.fftSize
   * @returns {number} Peak amplitude in [0, 1]
   */
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
  /**
   * @typedef {Object} CaptureState
   * @property {number} runningPeak     Max peak across the session, [0, 1]
   * @property {number} fskPeak         Max peak DURING FSK (after
   *                                    fskStartMs fires), [0, 1]
   * @property {number} totalSignalMs   Cumulative ms where peak > signalThreshold
   * @property {number | null} fskStartMs    Wall-clock when silence→signal
   *                                          pattern detected, or null
   * @property {number | null} firstSignalMs Wall-clock when peak first
   *                                          crossed signalThreshold, or null
   * @property {number} activeMs        Accumulated ms inside FSK transmission
   * @property {number} consecSilenceMs Current consecutive ms below
   *                                    silenceThreshold (used to gate
   *                                    fskStartMs detection — requires
   *                                    ≥500 ms of true-silence before
   *                                    accepting a signal as "Save press")
   * @property {number} consecBelowSignalMs Current consecutive ms below
   *                                        signalThreshold. Looser than
   *                                        consecSilenceMs — counts any
   *                                        "not actively transmitting"
   *                                        time, including a quiet idle
   *                                        tone that's above silence
   *                                        floor. Drives silence-after-
   *                                        signal auto-stop.
   * @property {number | null} lastTickMs Wall-clock of previous tick
   */

  /**
   * Factory for a fresh capture-session state object. Call at the
   * start of each `startRecording` invocation; pass the result to
   * the first {@link updateCaptureState} call.
   *
   * @returns {CaptureState}
   */
  function makeInitialCaptureState() {
    return {
      runningPeak:        0,    // max peak seen across the entire session
      fskPeak:            0,    // max peak DURING FSK (after fskStartMs fires)
      totalSignalMs:      0,    // cumulative ms where peak > signalThreshold
      fskStartMs:         null, // wall-clock when silence→signal pattern detected
      firstSignalMs:      null, // wall-clock when peak first crossed signalThreshold
      activeMs:           0,    // accumulated ms inside FSK transmission
      consecSilenceMs:    0,    // consecutive ms below silenceThreshold (gates fskStartMs)
      consecBelowSignalMs:0,    // consecutive ms below signalThreshold (drives silence-after-signal)
      lastTickMs:         null, // wall-clock of previous tick (for dt computation)
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
  /**
   * @typedef {Object} CaptureTick
   * @property {number} peak            Current frame peak in [0, 1]
   * @property {number} now             Date.now() at this tick
   * @property {number} silenceThreshold Live silence threshold
   * @property {number} signalThreshold  Live signal threshold
   * @property {number} recordStartMs   Date.now() when recording began
   * @property {number} expectedSignalMs Ms budget for this dump kind
   *                                     (auto-stop math; tone ~60000,
   *                                     sequence ~30000)
   */

  /**
   * @typedef {Object} CaptureEvents
   * @property {boolean} fskJustStarted  fskStartMs transitioned from
   *                                     null to a value THIS tick
   * @property {number | null} progressPct  Calibration progress 0–100,
   *                                        or null if firstSignalMs not set
   * @property {'silence-after-signal' | 'dump-timeout' | 'total-signal' | 'safety-timeout' | null} autoStop
   *   Which auto-stop trigger fired (or null = none yet)
   * @property {number} elapsedTotal     Ms since recordStartMs
   */

  /**
   * Pure state-machine update. Given the previous state + the current
   * tick, returns the next state plus an events object describing
   * transitions the caller may want to react to (typically DOM updates).
   *
   * @param {CaptureState} prev
   * @param {CaptureTick} tick
   * @returns {{state: CaptureState, events: CaptureEvents}}
   */
  function updateCaptureState(prev, tick) {
    const { peak, now, silenceThreshold, signalThreshold, recordStartMs, expectedSignalMs } = tick;
    const dtMs = prev.lastTickMs !== null ? (now - prev.lastTickMs) : 0;

    const runningPeak      = peak > prev.runningPeak ? peak : prev.runningPeak;
    let fskPeak            = prev.fskPeak;
    let totalSignalMs      = prev.totalSignalMs;
    let fskStartMs         = prev.fskStartMs;
    let firstSignalMs      = prev.firstSignalMs;
    let activeMs           = prev.activeMs;
    let consecSilenceMs    = prev.consecSilenceMs;
    let consecBelowSignalMs = prev.consecBelowSignalMs || 0;   // || 0 for prev states from before this counter existed
    let fskJustStarted     = false;

    // consecBelowSignalMs: accumulates whenever we're NOT actively
    // transmitting signal (peak below signalThreshold). Looser than
    // consecSilenceMs — counts the JX's post-dump idle tone even if
    // it's loud enough to land above silenceThreshold. The end-of-
    // dump auto-stop reads this so we don't have to wait for true
    // silence, which the JX may never produce post-dump on some
    // hardware/gain combos (bug observed 2026-05-26: 25 s real dump,
    // modal stayed open 58 s while consecSilenceMs never reached 1 s).
    if (peak < signalThreshold) consecBelowSignalMs += dtMs;
    else                        consecBelowSignalMs = 0;

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
    // silence-after-signal uses consecBelowSignalMs (looser than
    // consecSilenceMs) so a quiet-but-not-truly-silent JX post-dump
    // idle tone — observed on Daniel's KT USB Audio at 15× gain on
    // 2026-05-26 — doesn't block this trigger from ever firing.
    if (totalSignalMs >= 5000 && consecBelowSignalMs >= 1000)           autoStop = 'silence-after-signal';
    else if (firstSignalMs !== null && signalElapsed >= DUMP_TIMEOUT_MS) autoStop = 'dump-timeout';
    else if (totalSignalMs >= expectedSignalMs)                         autoStop = 'total-signal';
    // safety-timeout: gated on firstSignalMs so a user who opens the
    // modal and hasn't yet pressed Tape Memory → Save doesn't get
    // an auto-stop firing into an empty buffer (which then yields the
    // "Recording didn't decode cleanly" prompt). Once signal HAS been
    // detected, this remains a backstop for runaway dumps that somehow
    // escape the other three triggers.
    else if (firstSignalMs !== null && elapsedTotal >= SAFETY_TIMEOUT_MS) autoStop = 'safety-timeout';

    return {
      state: {
        runningPeak, fskPeak, totalSignalMs,
        fskStartMs, firstSignalMs, activeMs,
        consecSilenceMs, consecBelowSignalMs,
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
