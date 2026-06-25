'use strict';

// Tests for renderer/record-flow.js — the auto-calibration branch's two new
// decision points, pulled out of the (DOM-coupled, manual-QA) Record-from-JX
// modal so the risky logic is pinned: the capture-gain choice and the
// decode-failure response ladder (incl. the clipping step-down cap).

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  chooseCaptureGain, planDecodeFailureResponse, planImportReroute, describeUnsupportedImport,
} = require('../renderer/record-flow.js');

// ── chooseCaptureGain ──────────────────────────────────────────────────

test('chooseCaptureGain — a saved calibration wins', () => {
  assert.equal(chooseCaptureGain({
    savedGain: 11.2, autoDecodeDefault: true, forceCalibrate: false,
    initialGain: null, defaultGain: 2.0,
  }), 11.2);
});

test('chooseCaptureGain — first-use auto path uses the default gain', () => {
  assert.equal(chooseCaptureGain({
    savedGain: null, autoDecodeDefault: true, forceCalibrate: false,
    initialGain: null, defaultGain: 2.0,
  }), 2.0);
});

test('chooseCaptureGain — a handed-forward initialGain (step-down) overrides the default', () => {
  assert.equal(chooseCaptureGain({
    savedGain: null, autoDecodeDefault: true, forceCalibrate: false,
    initialGain: 1.0, defaultGain: 2.0,
  }), 1.0);
});

test('chooseCaptureGain — null (→ calibrate) when auto-decode is off and no saved gain', () => {
  assert.equal(chooseCaptureGain({
    savedGain: null, autoDecodeDefault: false, forceCalibrate: false,
    initialGain: null, defaultGain: 2.0,
  }), null);
});

test('chooseCaptureGain — forceCalibrate overrides auto-decode → null', () => {
  assert.equal(chooseCaptureGain({
    savedGain: null, autoDecodeDefault: true, forceCalibrate: true,
    initialGain: 5.0, defaultGain: 2.0,
  }), null);
});

test('chooseCaptureGain — invalid saved gain (0/negative) falls through', () => {
  assert.equal(chooseCaptureGain({
    savedGain: 0, autoDecodeDefault: true, forceCalibrate: false,
    initialGain: null, defaultGain: 2.0,
  }), 2.0);
});

// ── planDecodeFailureResponse ──────────────────────────────────────────

test('plan — ~silent capture → no-signal', () => {
  const p = planDecodeFailureResponse({ capturePeak: 0.005, captureGain: 2.0, stepDownCount: 0 });
  assert.equal(p.kind, 'no-signal');
});

test('plan — clipping under the cap → step down (halve gain, bump count)', () => {
  const p = planDecodeFailureResponse({ capturePeak: 0.99, captureGain: 4.0, stepDownCount: 0 });
  assert.equal(p.kind, 'clipping-stepdown');
  assert.equal(p.nextGain, 2.0);
  assert.equal(p.nextStepDownCount, 1);
});

test('plan — clipping again steps down further', () => {
  const p = planDecodeFailureResponse({ capturePeak: 0.99, captureGain: 2.0, stepDownCount: 1 });
  assert.equal(p.kind, 'clipping-stepdown');
  assert.equal(p.nextGain, 1.0);
  assert.equal(p.nextStepDownCount, 2);
});

test('plan — clipping at the step-down cap falls through to retry (→ manual calibrate)', () => {
  const p = planDecodeFailureResponse({ capturePeak: 0.99, captureGain: 1.0, stepDownCount: 2 });
  assert.equal(p.kind, 'retry');
});

test('plan — clipping with no known capture gain cannot step down → retry', () => {
  const p = planDecodeFailureResponse({ capturePeak: 0.99, captureGain: null, stepDownCount: 0 });
  assert.equal(p.kind, 'retry');
});

test('plan — an ordinary failed decode → retry', () => {
  const p = planDecodeFailureResponse({ capturePeak: 0.45, captureGain: 2.0, stepDownCount: 0 });
  assert.equal(p.kind, 'retry');
});

test('plan — unknown peak (null) → retry, never no-signal/step-down', () => {
  const p = planDecodeFailureResponse({ capturePeak: null, captureGain: 2.0, stepDownCount: 0 });
  assert.equal(p.kind, 'retry');
});

test('plan — custom opts (thresholds + factor) are honored', () => {
  const p = planDecodeFailureResponse({
    capturePeak: 0.9, captureGain: 6.0, stepDownCount: 0,
    opts: { clippingThreshold: 0.85, stepDownFactor: 0.25, maxStepDowns: 1 },
  });
  assert.equal(p.kind, 'clipping-stepdown');
  assert.equal(p.nextGain, 1.5);
});

// ── planImportReroute (the tones↔sequence loop guard) ──────────────────

test('reroute — a valid-looking decode imports', () => {
  assert.equal(planImportReroute({ looksMisrouted: false, rerouted: false }), 'import');
  assert.equal(planImportReroute({ looksMisrouted: false, rerouted: true }), 'import');
});

test('reroute — first misrouted look reroutes to the other handler', () => {
  assert.equal(planImportReroute({ looksMisrouted: true, rerouted: false }), 'reroute');
});

test('reroute — REGRESSION: a misrouted look AFTER a reroute is unreadable, never loops', () => {
  // The 2026-06-14 bug: a WAV with a metronome click mixed in decoded as
  // neither format, so both handlers kept rerouting to each other forever.
  // The guard must return 'unreadable' (→ error) the second time, not
  // 'reroute' again.
  assert.equal(planImportReroute({ looksMisrouted: true, rerouted: true }), 'unreadable');
});

// ── describeUnsupportedImport (file-type sniff) ────────────────────────

test('unsupported — importable types pass (null), case-insensitive', () => {
  assert.equal(describeUnsupportedImport('/x/dump.wav'), null);
  assert.equal(describeUnsupportedImport('/x/bank.JSON'), null);
  assert.equal(describeUnsupportedImport('/x/My Patches.WAV'), null);
});

test('unsupported — MP3/MP4 are named specifically with convert guidance', () => {
  const mp3 = describeUnsupportedImport('/Users/d/Desktop/patches.mp3');
  assert.match(mp3, /MP3/);
  assert.match(mp3, /convert/i);
  assert.match(describeUnsupportedImport('/x/clip.mp4'), /MP4/);
});

test('unsupported — other known media types named (incl. correct a/an)', () => {
  assert.match(describeUnsupportedImport('/x/a.flac'), /FLAC/);
  assert.match(describeUnsupportedImport('/x/a.m4a'), /M4A/);
  assert.match(describeUnsupportedImport('/x/a.aiff'), /an AIFF/);   // vowel → "an"
  assert.match(describeUnsupportedImport('/x/a.mp3'), /a MP3/);      // consonant sound → "a"
});

test('unsupported — unknown extension / none falls back to the generic message', () => {
  assert.match(describeUnsupportedImport('/x/notes.txt'), /Only \.wav and \.json/);
  assert.match(describeUnsupportedImport('/x/noext'), /Only \.wav and \.json/);
  assert.match(describeUnsupportedImport(null), /Only \.wav and \.json/);
});
