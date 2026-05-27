'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Square-wave note preview.
//
// Used by the sequencer visualizer: clicking a real note (new attack OR
// TIE event) plays a short square-wave preview at that pitch — pure
// audio-feedback affordance to help the user identify what each step
// sounds like without firing up the JX.
//
// Design notes:
//   - Lazy AudioContext: first preview call creates it; subsequent calls
//     reuse it. Avoids the autoplay-policy quirks of constructing an
//     AudioContext outside a user gesture (we're always called from a
//     click handler, so the context resumes cleanly on first use).
//   - Triangle wave (was square through 2026-05-26 morning, switched to
//     triangle that evening at Daniel's request for "less bright" tone).
//     Triangle has only odd harmonics rolling off at 1/n^2 (much faster
//     than square's 1/n), giving a softer flute-like timbre that's
//     easier on the ear during rapid drag-scrub previews. Pure sine
//     would be even softer but harder to identify pitch in a quick
//     150ms preview.
//   - Tiny attack/release envelopes (~5 ms each): plain start/stop on a
//     square wave produces audible clicks from the discontinuity. The
//     envelope ramps eliminate them while staying short enough to feel
//     instantaneous.
//   - No polyphony management: rapid clicks just stack oscillators. Each
//     auto-stops after duration + release. Sounds like piano polyphony,
//     which is fine for preview UX.
//   - Modest gain (peak 0.12): preview should be audible at normal system
//     volume without startling someone in a quiet room. Tested informally
//     against the JX-3P output level for parity.
//
// Module API (browser): `window.previewNote(midiPitch, durationMs)`
// Module API (Node):    `const { previewNote } = require('./synth-preview');`
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  } else {
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Module-scope cache: the AudioContext is reused across all preview
  // calls within a session. AudioContexts are expensive (each one spins
  // up a real audio graph) and there's a small per-domain cap, so reuse
  // matters.
  let cachedCtx = null;

  function getOrCreateCtx() {
    if (cachedCtx) return cachedCtx;
    // Browser/Electron only — this code never runs in Node test contexts
    // (the tests import the module to verify the math but don't trigger
    // AudioContext construction).
    const AC = (typeof window !== 'undefined')
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AC) return null;
    cachedCtx = new AC();
    return cachedCtx;
  }

  /**
   * Convert a MIDI pitch number (0-127) to its frequency in Hz.
   * Standard formula: A4 (MIDI 69) = 440 Hz, semitones are
   * equal-tempered with a 2^(1/12) ratio.
   *
   * @param {number} midi  MIDI pitch number, e.g. 60 for middle C
   * @returns {number}     Frequency in Hz
   */
  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Play a brief triangle-wave preview at the given MIDI pitch. No-op
   * if the Web Audio API isn't available (Node test contexts, very old
   * browsers).
   *
   * @param {number} midiPitch         MIDI note number (e.g. 60 = C4)
   * @param {number} [durationMs=180]  Sustain duration in ms (excludes
   *                                   the ~5 ms attack / 50 ms release
   *                                   ramps)
   * @param {number} [gainScale=1]     Multiplier on the peak gain
   *                                   (0..1). Used to play softer
   *                                   previews during a drag gesture
   *                                   (0.1 = scrub volume); drop/click
   *                                   previews stay at full (1.0).
   * @returns {void}
   */
  function previewNote(midiPitch, durationMs = 180, gainScale = 1) {
    const ctx = getOrCreateCtx();
    if (!ctx) return;
    // Resume from suspended if the browser parked it (some Chromium
    // versions suspend AudioContext after a tab regains focus). Safe
    // to call repeatedly; no-op when already running.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const ATTACK_S  = 0.005;
    const RELEASE_S = 0.050;
    const SUSTAIN_S = Math.max(0.01, durationMs / 1000);
    // Clamp gainScale to [0, 1] so callers can't accidentally cause
    // clipping by passing >1 (the underlying peak is already near
    // the comfortable max for a square wave).
    const clampedScale = Math.max(0, Math.min(1, gainScale));
    const PEAK_GAIN = 0.12 * clampedScale;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToHz(midiPitch);

    // Envelope: ramp up → hold → ramp down. Avoids click artifacts
    // from instantaneous start/stop on a square wave.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, now + ATTACK_S);
    gain.gain.setValueAtTime(PEAK_GAIN, now + ATTACK_S + SUSTAIN_S);
    gain.gain.linearRampToValueAtTime(0, now + ATTACK_S + SUSTAIN_S + RELEASE_S);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + ATTACK_S + SUSTAIN_S + RELEASE_S + 0.01);

    // GC hint: explicit disconnect after stop. Without this, finished
    // oscillators linger in the audio graph until GC, which on rapid
    // repeated previews can accumulate noticeably.
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    };
  }

  return { previewNote, midiToHz };
});
