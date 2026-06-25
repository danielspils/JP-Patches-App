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

  /**
   * Decide what a WAV-import handler does when its decoder produced a
   * result that looks like it belongs to the OTHER sub-tab (a tones decode
   * that came back as all-identical patches, or a sequence decode with no
   * populated pages):
   *   'import'     — looks valid for this handler; proceed.
   *   'reroute'    — looks misrouted; hand off to the other handler ONCE.
   *   'unreadable' — already rerouted once and STILL looks wrong → the WAV
   *                  is neither format. Show an error; do NOT reroute again.
   *
   * The `rerouted` guard is what prevents the infinite tones↔sequence
   * ping-pong on a WAV that decodes as neither format (e.g. an MP3-derived
   * file whose FSK timing is destroyed). Bug hit 2026-06-14; latent since
   * the v0.7.2 auto-reroute landed.
   */
  function planImportReroute({ looksMisrouted, rerouted }) {
    if (!looksMisrouted) return 'import';
    return rerouted ? 'unreadable' : 'reroute';
  }

  // JP imports patch banks / sequences from uncompressed WAV (a JX-3P tape
  // dump) or a .json export. Anything else can't work — and a lossy audio
  // file (MP3/MP4/etc.) is the common mistake: it still SOUNDS like a tape
  // dump but the FSK timing the decoder needs is gone. Name the type so the
  // user knows to convert, rather than hitting a generic "couldn't decode".
  const IMPORTABLE_EXTS = ['.wav', '.json'];
  const KNOWN_UNSUPPORTED = Object.freeze({
    '.mp3': 'MP3', '.mp4': 'MP4', '.m4a': 'M4A', '.aac': 'AAC',
    '.ogg': 'OGG', '.opus': 'Opus', '.flac': 'FLAC', '.wma': 'WMA',
    '.aif': 'AIFF', '.aiff': 'AIFF', '.mov': 'MOV', '.caf': 'CAF',
  });

  /**
   * Decide whether a to-be-imported file is an unsupported type, by
   * extension. Returns a user-facing rejection message, or null if the file
   * is importable (.wav / .json). Known media types are named specifically
   * ("This looks like an MP3…"); anything else gets a generic message.
   * Extension-based by design — a mislabeled file (e.g. an MP3 saved as
   * .wav) still passes here but is caught downstream by the decode guard.
   */
  function describeUnsupportedImport(filePath) {
    const lower = String(filePath || '').toLowerCase();
    if (IMPORTABLE_EXTS.some((e) => lower.endsWith(e))) return null;
    const dot = lower.lastIndexOf('.');
    const ext = dot >= 0 ? lower.slice(dot) : '';
    const type = KNOWN_UNSUPPORTED[ext];
    if (type) {
      return `This looks like ${/^[AEIOU]/.test(type) ? 'an' : 'a'} ${type} file, which JP Patches can't read. ` +
        'A tape dump has to be an uncompressed WAV (or a JSON export) — convert it and try again.';
    }
    return 'Only .wav and .json files can be imported here.';
  }

  return {
    chooseCaptureGain, planDecodeFailureResponse, planImportReroute,
    describeUnsupportedImport, FAILURE_DEFAULTS,
  };
});
