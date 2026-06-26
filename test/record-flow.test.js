'use strict';

// Tests for renderer/record-flow.js — the auto-calibration branch's two new
// decision points, pulled out of the (DOM-coupled, manual-QA) Record-from-JX
// modal so the risky logic is pinned: the capture-gain choice and the
// decode-failure response ladder (incl. the clipping step-down cap).

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  chooseCaptureGain, planDecodeFailureResponse, planImportReroute, describeUnsupportedImport,
  summarizeCaptureAudio,
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

test('unsupported — title is the fixed header; body names the type + convert guidance', () => {
  const m4a = describeUnsupportedImport('/Users/d/Desktop/patches.m4a');
  assert.equal(m4a.title, 'This is not a WAV or JSON');
  assert.equal(m4a.body, 'This looks like an M4A file. Convert it to a WAV or JSON file and try again!');
  assert.match(describeUnsupportedImport('/x/clip.mp4').body, /an MP4/);
});

test('unsupported — article baked in per type (vowel sound = "an")', () => {
  assert.match(describeUnsupportedImport('/x/a.mp3').body, /an MP3/);
  assert.match(describeUnsupportedImport('/x/a.aiff').body, /an AIFF/);
  assert.match(describeUnsupportedImport('/x/a.flac').body, /a FLAC/);
  assert.match(describeUnsupportedImport('/x/a.wma').body, /a WMA/);
});

test('unsupported — unknown extension / none still rejects with the header + generic body', () => {
  for (const f of ['/x/notes.txt', '/x/noext', null]) {
    const r = describeUnsupportedImport(f);
    assert.equal(r.title, 'This is not a WAV or JSON');
    assert.equal(r.body, 'Convert it to a WAV or JSON file and try again!');
  }
});

// ── summarizeCaptureAudio (capture-stream DSP telemetry, pitfall #26) ───

test('summarizeCaptureAudio — clean stream: all DSP off → processingActive false', () => {
  const r = summarizeCaptureAudio({
    settings: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 44100 },
    usedFallback: false,
  });
  assert.equal(r.processingActive, false);
  assert.equal(r.usedFallback, false);
  assert.equal(r.sampleRate, 44100);
  assert.equal(r.noiseSuppression, false);
});

test('summarizeCaptureAudio — ANY DSP flag on → processingActive true (the smoking gun)', () => {
  assert.equal(summarizeCaptureAudio({ settings: { noiseSuppression: true } }).processingActive, true);
  assert.equal(summarizeCaptureAudio({ settings: { autoGainControl: true } }).processingActive, true);
  assert.equal(summarizeCaptureAudio({ settings: { echoCancellation: true } }).processingActive, true);
});

test('summarizeCaptureAudio — soft fallback is recorded even with flags off', () => {
  const r = summarizeCaptureAudio({
    settings: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    usedFallback: true,
  });
  assert.equal(r.usedFallback, true);
  assert.equal(r.processingActive, false);   // device honored the soft prefs this time
});

test('summarizeCaptureAudio — missing/partial settings coerce to null, never throw', () => {
  const r = summarizeCaptureAudio({});
  assert.equal(r.echoCancellation, null);
  assert.equal(r.noiseSuppression, null);
  assert.equal(r.autoGainControl, null);
  assert.equal(r.sampleRate, null);
  assert.equal(r.usedFallback, false);
  assert.equal(r.processingActive, false);
  // a getSettings() that omits the audio-processing keys (some drivers do)
  const partial = summarizeCaptureAudio({ settings: { sampleRate: 48000 } });
  assert.equal(partial.sampleRate, 48000);
  assert.equal(partial.noiseSuppression, null);
  assert.equal(partial.processingActive, false);
});

test('summarizeCaptureAudio — no args at all → safe defaults', () => {
  const r = summarizeCaptureAudio();
  assert.equal(r.processingActive, false);
  assert.equal(r.usedFallback, false);
});
