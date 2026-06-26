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
  /**
   * Scale FSK silence/signal thresholds against current software gain.
   * See module header + CLAUDE.md pitfall #12 for the rationale.
   *
   * NB: There's a slightly-different copy of this function in
   * calibration-math.js (loaded earlier, without the falsy guard).
   * This one wins the global override; calibration-math's is dead.
   * Should be consolidated — tracked as cleanup.
   *
   * @param {number} currentGain Software gain (1× = unity). Falsy
   *   inputs (0, null, undefined, NaN) clamp to 1×.
   * @returns {{SIGNAL_THRESHOLD: number, SILENCE_THRESHOLD: number}}
   *   Both thresholds in [0, 1] for direct comparison against peak.
   */
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
  /**
   * Classify each ~200 ms window of a capture buffer as signal/silence/
   * between based on its peak amplitude vs. the given thresholds.
   * Exposed for tests; production callers go through {@link computeFskTrim}.
   *
   * @param {Float32Array | number[]} samples PCM samples in [-1, 1]
   * @param {number} sampleRate Hz (typically 44100)
   * @param {{SIGNAL_THRESHOLD: number, SILENCE_THRESHOLD: number}} thresholds
   *   From {@link computeTrimThresholds}.
   * @returns {Array<'signal' | 'silence' | 'between'>}
   *   Length = floor(samples.length / winSize). Trailing partial window
   *   is dropped.
   */
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
  /**
   * @typedef {Object} FskTrimResult
   * @property {number} trimStart Sample index to trim BEFORE
   *   (0 = no trim). Pass to `samples.subarray(trimStart)`.
   * @property {number} numWindows Count of full windows that fit
   *   in the buffer (trailing partial dropped).
   * @property {boolean} foundSilenceGap True if pass 1 succeeded —
   *   clean silence→sustained-signal pattern found.
   * @property {boolean} usedFallback True if pass 2 ran — longest-
   *   signal-run fallback was needed because pass 1 found no
   *   qualifying silence gap.
   */

  /**
   * Find where the real FSK transmission starts inside a captured
   * buffer. See module header for the algorithm.
   *
   * @param {Float32Array} samples Captured PCM in [-1, 1]
   * @param {number} sampleRate Hz (typically 44100)
   * @param {number} currentGain Software gain at capture time, for
   *   threshold scaling. 1× = unity; falsy clamps to 1×.
   * @returns {FskTrimResult}
   */
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

  // ── Frequency-aware FSK start detection ──────────────────────────────
  // The amplitude trim above can only find the dump start when the JX's idle
  // tone is quieter than the FSK (a silence gap to anchor on). On a loud-idle
  // capture — high gain, or a unit whose idle hum is as loud as the dump —
  // there IS no silence gap: the whole buffer reads as 'signal', pass 1 fails,
  // the longest-run fallback keeps everything, and the leading idle wrecks the
  // demodulator's calibration (CLAUDE.md pitfall #26; the user's "only decodes
  // well below the yellow target" was them turning the idle down under the
  // silence threshold so this trim could fire).
  //
  // This pass is amplitude-INDEPENDENT: it finds the dump by FREQUENCY. Real
  // FSK data carries short (bit-0) cycles; idle and pilot tones are single low
  // frequencies with none. Boost a copy so crossings clear the detector band,
  // count short cycles per window, take the first window with clear data, and
  // back up ~1 s to keep the pilot the demodulator needs to lock long_width.
  // Verified on a real failing capture: trims to 3.50 s, decodes 30/32 patches
  // where the full buffer decoded 0.
  const FREQ_BOOST_TARGET   = 0.92;   // mirror jx3p codec AUTO_BOOST_TARGET
  const FREQ_QUIESCENCE     = 0.15;   // mirror jx3p codec QUIESCENCE_THRESHOLD
  const FREQ_WIN_SEC        = 0.5;
  const SHORT_MIN_SAMPLES   = 4;      // bit-0 crossing-interval lower bound @44.1k
  const SHORT_MAX_SAMPLES   = 12;     // bit-0 crossing-interval upper bound
  const MIN_PEAK_SHORT      = 30;     // peak window must hold ≥ this many short cycles, else "no clear FSK"
  const MIN_DATA_SHORT      = 15;     // absolute floor for the per-window data threshold
  const DATA_SHORT_FRACTION = 0.25;   // a data window = short count > this × the peak window's count
  const PILOT_BACKOFF_SEC   = 1.0;    // keep ~1 s of pilot ahead of the first data window

  // Count short (bit-0) crossing cycles in samples[lo, hi), applying `scale`
  // (the boost) inline. Schmitt trigger: phase sticks at ±1 once the signal
  // passes ±FREQ_QUIESCENCE; a crossing is a phase flip; tally flips whose
  // interval since the previous flip lands in the bit-0 sample range.
  function countShortCycles(samples, lo, hi, scale) {
    let phase = 0, lastCross = -1, shortCount = 0;
    for (let i = lo; i < hi; i++) {
      const v = samples[i] * scale;
      let next = phase;
      if (v > FREQ_QUIESCENCE) next = 1;
      else if (v < -FREQ_QUIESCENCE) next = -1;
      if (next !== 0 && next !== phase) {
        if (phase !== 0 && lastCross >= 0) {
          const iv = i - lastCross;
          if (iv >= SHORT_MIN_SAMPLES && iv < SHORT_MAX_SAMPLES) shortCount += 1;
        }
        lastCross = i;
        phase = next;
      }
    }
    return shortCount;
  }

  /**
   * Find the FSK dump start by its bit-0 frequency content — works regardless
   * of capture level, where {@link computeFskTrim}'s amplitude pass can't.
   * See the block comment above for the algorithm + rationale.
   *
   * @param {Float32Array | number[]} samples Captured PCM in [-1, 1]
   * @param {number} sampleRate Hz (typically 44100)
   * @returns {number} Sample index to trim BEFORE (≥ 0), or -1 if no clear FSK
   *   data is present (caller should fall back to {@link computeFskTrim}).
   */
  function findFskStartByFreq(samples, sampleRate) {
    const n = samples.length;
    if (n === 0 || !sampleRate) return -1;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const a = samples[i] < 0 ? -samples[i] : samples[i];
      if (a > peak) peak = a;
    }
    if (peak === 0) return -1;
    const scale = peak < FREQ_BOOST_TARGET ? FREQ_BOOST_TARGET / peak : 1;
    const win = Math.floor(FREQ_WIN_SEC * sampleRate);
    if (win <= 0) return -1;
    const numWindows = Math.floor(n / win);
    const counts = new Array(numWindows);
    let maxShort = 0;
    for (let w = 0; w < numWindows; w++) {
      const c = countShortCycles(samples, w * win, w * win + win, scale);
      counts[w] = c;
      if (c > maxShort) maxShort = c;
    }
    if (maxShort < MIN_PEAK_SHORT) return -1;   // no clear FSK data anywhere
    const dataThresh = Math.max(MIN_DATA_SHORT, DATA_SHORT_FRACTION * maxShort);
    let firstData = -1;
    for (let w = 0; w < numWindows; w++) {
      if (counts[w] > dataThresh) { firstData = w; break; }
    }
    if (firstData < 0) return -1;
    const backoff = Math.floor(PILOT_BACKOFF_SEC * sampleRate);
    return Math.max(0, firstData * win - backoff);
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
  /**
   * @typedef {Object} FloatToInt16Result
   * @property {ArrayBuffer} pcm Little-endian 16-bit signed PCM bytes
   *   (length = samples.length × 2), drop into a WAV data chunk.
   * @property {number} peakAmp Max |sample| seen, in [0, 1].
   */

  /**
   * Convert a Float32 sample buffer to little-endian 16-bit signed PCM
   * while measuring the peak amplitude in a single pass. Samples
   * outside [-1, 1] are clamped before scaling.
   *
   * @param {Float32Array} samples Mono PCM samples
   * @returns {FloatToInt16Result}
   */
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
    window.findFskStartByFreq     = findFskStartByFreq;
    window.classifyWindows        = classifyWindows;
    window.computeTrimThresholds  = computeTrimThresholds;
    window.floatToInt16WithPeak   = floatToInt16WithPeak;
  }
  // Also support Node's require() so the unit tests can import.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      computeFskTrim,
      findFskStartByFreq,
      classifyWindows,
      computeTrimThresholds,
      floatToInt16WithPeak,
    };
  }
})();
