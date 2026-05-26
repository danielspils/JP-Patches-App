// FSK trim logic for Record-from-JX captures.
//
// Pure functions extracted from app.js's showRecordFromJxModal so they
// can be unit-tested in isolation. The runtime caller still passes the
// captured Float32 buffer in; this module decides where the real FSK
// transmission starts so the WAV we hand to jx3p's demodulator doesn't
// contain pre-FSK idle tone (which contaminates demodulator calibration
// and breaks every checksum).
//
// Loaded via a plain <script> tag in renderer/index.html, BEFORE app.js,
// so the globals exported here (computeFskTrim, classifyWindows,
// computeTrimThresholds) are visible at app.js execution time.
//
// Algorithm (see computeFskTrim for the implementation):
//   1. Slice the buffer into ~200 ms windows.
//   2. Classify each as 'signal' (peak > SIGNAL), 'silence' (< SILENCE),
//      or 'between'. Thresholds scale with current software gain so
//      the JX's pre-gain idle tone doesn't cross the silence threshold
//      at high calibrated gain values. See CLAUDE.md pitfall #12.
//   3. Find the LATEST silence→sustained-signal transition (≥ 300 ms
//      silence followed by ≥ 5 s signal). That's where real FSK
//      starts; trim everything before.
//   4. Fallback: longest signal run if no clean silence→signal pattern.
//   5. Apply a small backoff (~50 ms) so we don't clip the very start
//      of the FSK pilot.

(function () {
  'use strict';

  // Window size for the silence/signal classification pass. 200 ms is
  // a balance: small enough to localize the silence→signal transition
  // tightly (avoid trimming too much actual FSK), large enough to
  // smooth over single-sample transients that would falsely flip the
  // classifier. Don't change without re-running the regression dataset
  // — both pass 1 (silence→signal) and pass 2 (longest run) tune their
  // count thresholds against this window size.
  const WIN_SEC = 0.2;

  // Minimum silence run (windows) that qualifies as "pre-FSK gap":
  // ≥ 300 ms ÷ 200 ms = 2 windows. Lower would false-trigger on idle-
  // tone dips; higher would miss tight user timing (Save pressed
  // immediately after Record).
  const MIN_SILENCE_WINDOWS = Math.ceil(0.30 / WIN_SEC);

  // Minimum sustained signal run after that silence to count it as
  // "real FSK starts here": ≥ 5 s. JX sequence dumps are ~6–28 s, so
  // 5 s is a comfortable lower bound — anything shorter is a transient
  // (cable bump, brief signal spike) and shouldn't anchor the trim.
  const MIN_SIGNAL_WINDOWS = Math.ceil(5.00 / WIN_SEC);

  // Backoff applied to the chosen trim window so we don't clip the
  // very first samples of the FSK pilot tone. The window boundary is
  // approximate; ~50 ms upstream is safe and well below any actual
  // FSK signal we'd want to discard.
  const BACKOFF_SEC = 0.05;

  // Threshold scaling: the JX's between-dumps idle tone has constant
  // pre-gain amplitude (~0.005–0.010), so after applying software gain
  // g it lands at ~0.005g–0.010g. At low gain (≤4×) idle stays under
  // the default 0.05 silence threshold; at higher gain it crosses, the
  // silence detector finds no pre-FSK gap, trim falls through to the
  // longest-signal-run fallback, and jx3p's demodulator calibrates
  // against idle-tone cycle widths instead of FSK — every checksum
  // fails. Scale both thresholds with current gain (capped at 20× so
  // the signal threshold doesn't approach the FSK peak target of ~0.6).
  //
  // MIRROR: tickMeter in app.js uses parallel scaling for its LIVE
  // classifier. Keep the two in sync (CLAUDE.md pitfall #12).
  function computeTrimThresholds(currentGain) {
    const thresholdScale = Math.min(20, Math.max(1, currentGain || 1));
    return {
      SIGNAL_THRESHOLD:  Math.max(0.10, 0.025 * thresholdScale),
      SILENCE_THRESHOLD: Math.max(0.05, 0.012 * thresholdScale),
    };
  }

  // Classify each WIN_SEC window of the buffer as 'signal' | 'silence'
  // | 'between'. Returns the classification array (length = number of
  // full windows that fit in the buffer; trailing partial window is
  // dropped). Exported so tests can verify classification independently
  // of the trim-selection logic.
  function classifyWindows(samples, sampleRate, thresholds) {
    const winSize    = Math.floor(WIN_SEC * sampleRate);
    const numWindows = Math.floor(samples.length / winSize);
    const klass = new Array(numWindows);
    for (let w = 0; w < numWindows; w++) {
      let peak = 0;
      const lo = w * winSize, hi = lo + winSize;
      for (let i = lo; i < hi; i++) {
        const v = Math.abs(samples[i]);
        if (v > peak) peak = v;
      }
      klass[w] = peak > thresholds.SIGNAL_THRESHOLD ? 'signal'
              : peak < thresholds.SILENCE_THRESHOLD ? 'silence'
              :                                       'between';
    }
    return klass;
  }

  // Main entry point. Returns the sample index to trim BEFORE — the
  // returned buffer slice (samples.subarray(trimStart)) is the buffer
  // to ship to jx3p. trimStart === 0 means no trim was applied
  // (typically because the recording was already clean).
  //
  // Inputs:
  //   samples:     Float32Array of mono PCM samples in [-1, 1]
  //   sampleRate:  Hz (typically 44100)
  //   currentGain: software gain at capture time (1.0 = unity). Used
  //                only for threshold scaling.
  //
  // Returns:
  //   {
  //     trimStart:        int sample index (0 = no trim)
  //     numWindows:       int (number of full windows the buffer held)
  //     foundSilenceGap:  bool (pass 1 succeeded — clean silence→signal)
  //     usedFallback:     bool (pass 2 ran — longest-run fallback)
  //   }
  //
  // The diagnostic flags let callers log telemetry without re-running
  // the algorithm.
  function computeFskTrim(samples, sampleRate, currentGain) {
    const thresholds = computeTrimThresholds(currentGain);
    const winSize    = Math.floor(WIN_SEC * sampleRate);
    const klass      = classifyWindows(samples, sampleRate, thresholds);
    const numWindows = klass.length;

    // Pass 1: silence ≥ MIN_SILENCE_WINDOWS, then signal that sustains
    // for ≥ MIN_SIGNAL_WINDOWS. Pick the LATEST matching transition —
    // recordings can contain multiple silence→signal patterns (e.g.
    // idle tone briefly hiccupping before Save), and the real FSK is
    // always the last sustained signal run.
    let trimWindow = -1;
    let silenceLen = 0;
    for (let w = 0; w < numWindows; w++) {
      if (klass[w] === 'silence') {
        silenceLen += 1;
      } else if (klass[w] === 'signal' && silenceLen >= MIN_SILENCE_WINDOWS) {
        let signalRun = 0;
        for (let v = w; v < numWindows && klass[v] !== 'silence'; v++) {
          if (klass[v] === 'signal') signalRun += 1;
        }
        if (signalRun >= MIN_SIGNAL_WINDOWS) {
          trimWindow = w;   // keep looking — we want the latest match
        }
        silenceLen = 0;
      } else {
        if (klass[w] === 'signal') silenceLen = 0;
      }
    }
    const foundSilenceGap = trimWindow >= 0;

    // Pass 2 (fallback): longest signal run.
    let usedFallback = false;
    if (!foundSilenceGap) {
      let bestStart = 0, bestLen = 0, curStart = -1, curLen = 0;
      for (let w = 0; w < numWindows; w++) {
        if (klass[w] === 'signal') {
          if (curStart < 0) curStart = w;
          curLen += 1;
          if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
        } else {
          curStart = -1;
          curLen   = 0;
        }
      }
      if (bestLen > 0) {
        trimWindow = bestStart;
        usedFallback = true;
      }
    }

    const backoff   = Math.floor(BACKOFF_SEC * sampleRate);
    const trimStart = trimWindow > 0
      ? Math.max(0, trimWindow * winSize - backoff)
      : 0;

    return { trimStart, numWindows, foundSilenceGap, usedFallback };
  }

  // Convert a Float32 sample buffer to signed-16-bit PCM bytes while
  // simultaneously measuring the peak amplitude in one pass. The two
  // operations were fused inline in stopRecording for a small perf
  // win (avoids a second buffer-length loop just to read the peak);
  // fused here for the same reason, and exposed as a single pure
  // function so the conversion arithmetic + peak measurement is
  // testable in isolation. Mono input → mono output, no interleaving.
  //
  // Returns:
  //   {
  //     pcm:     ArrayBuffer of (samples.length * 2) bytes, little-endian
  //              16-bit signed PCM, suitable to drop straight into the
  //              data portion of a RIFF/WAVE file at the source rate
  //     peakAmp: max |sample| seen, in [0, 1]
  //   }
  function floatToInt16WithPeak(samples) {
    const n = samples.length;
    const pcm  = new ArrayBuffer(n * 2);
    const view = new DataView(pcm);
    let peakAmp = 0;
    for (let i = 0; i < n; i++) {
      // Clamp into [-1, 1] before scaling. Samples can legitimately
      // exceed this if a previous gain stage drove things into the
      // red — without clamp, the multiplication below would wrap.
      const s = Math.max(-1, Math.min(1, samples[i]));
      const absV = Math.abs(s);
      if (absV > peakAmp) peakAmp = absV;
      // Asymmetric Int16 range: negative side uses 0x8000 (-32768),
      // positive side uses 0x7FFF (32767). Matches Web Audio's de-facto
      // float→int convention.
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return { pcm, peakAmp };
  }

  // Module API — exposed as window globals so app.js sees them after
  // index.html loads this file before app.js.
  if (typeof window !== 'undefined') {
    window.computeFskTrim         = computeFskTrim;
    window.classifyWindows        = classifyWindows;
    window.computeTrimThresholds  = computeTrimThresholds;
    window.floatToInt16WithPeak   = floatToInt16WithPeak;
  }
  // Also support Node's require() so the unit tests can import.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      computeFskTrim,
      classifyWindows,
      computeTrimThresholds,
      floatToInt16WithPeak,
    };
  }
})();
