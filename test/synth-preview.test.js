'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const { midiToHz, previewNote } = require('../renderer/synth-preview.js');

// ── midiToHz ───────────────────────────────────────────────────────
// Pitch reference points everyone agrees on:
//   MIDI 69 = A4 = 440 Hz  (concert pitch anchor)
//   MIDI 60 = C4 ≈ 261.626 Hz
//   MIDI 57 = A3 = 220 Hz  (octave below)
//   MIDI 81 = A5 = 880 Hz  (octave above)

test('midiToHz — A4 (MIDI 69) is exactly 440 Hz', () => {
  assert.equal(midiToHz(69), 440);
});

test('midiToHz — C4 (MIDI 60) is ~261.626 Hz', () => {
  // Standard equal-temperament: 261.6255653... Hz
  assert.ok(Math.abs(midiToHz(60) - 261.6255653) < 0.001);
});

test('midiToHz — octave intervals double the frequency', () => {
  assert.ok(Math.abs(midiToHz(57) - 220) < 1e-9);
  assert.ok(Math.abs(midiToHz(81) - 880) < 1e-9);
});

test('midiToHz — semitone ratio is exactly 2^(1/12)', () => {
  const ratio = midiToHz(70) / midiToHz(69);
  assert.ok(Math.abs(ratio - Math.pow(2, 1/12)) < 1e-12);
});

test('midiToHz — JX-3P pitch range (MIDI 36-84) returns finite positive Hz', () => {
  for (let m = 36; m <= 84; m++) {
    const hz = midiToHz(m);
    assert.ok(Number.isFinite(hz));
    assert.ok(hz > 0);
  }
});

// ── previewNote ────────────────────────────────────────────────────
// In Node (no Web Audio), previewNote must be a no-op rather than
// throwing — the module is loaded by tests for the math, but the
// audio path only runs in the renderer. Verifying the safe-degrade
// behavior keeps any future Node-side caller (e.g. a CLI tool that
// requires() this module for midiToHz) from crashing.

test('previewNote — no-op when AudioContext is unavailable (Node test context)', () => {
  // Should not throw; returns void. Smoke test only — actual audio
  // behavior is browser-only and tested manually. Third arg is the
  // gainScale (0..1) added 2026-05-26 for drag-scrub previews.
  assert.doesNotThrow(() => previewNote(60));
  assert.doesNotThrow(() => previewNote(60, 100));
  assert.doesNotThrow(() => previewNote(60, 180, 0.1));
});
