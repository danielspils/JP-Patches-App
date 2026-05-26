'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  liveThresholdsFor,
  makeInitialCaptureState,
  updateCaptureState,
} = require('../renderer/capture-state.js');

// readAnalyserPeak is browser-only (requires AnalyserNode); not unit-
// tested here. Its logic is trivially "max of abs(byte - 128) / 128"
// and the input is supplied by Web Audio in the live path.

// ── liveThresholdsFor ──────────────────────────────────────────────

test('liveThresholdsFor — gain 1× returns floor thresholds', () => {
  const t = liveThresholdsFor(1);
  assert.equal(t.silence, 0.03);
  assert.equal(t.signal,  0.10);
});

test('liveThresholdsFor — gain 5× scales both above their floors', () => {
  const t = liveThresholdsFor(5);
  // silence: max(0.03, 0.012 * 5) = max(0.03, 0.06) = 0.06
  assert.ok(Math.abs(t.silence - 0.06)  < 1e-9);
  // signal:  max(0.10, 0.025 * 5) = max(0.10, 0.125) = 0.125
  assert.ok(Math.abs(t.signal  - 0.125) < 1e-9);
});

test('liveThresholdsFor — clamped above 20×', () => {
  const cap  = liveThresholdsFor(20);
  const over = liveThresholdsFor(50);
  assert.equal(over.silence, cap.silence);
  assert.equal(over.signal,  cap.signal);
});

test('liveThresholdsFor — null/0/NaN gain clamps to 1×', () => {
  const unity = liveThresholdsFor(1);
  for (const g of [null, 0, NaN, undefined]) {
    const t = liveThresholdsFor(g);
    assert.equal(t.silence, unity.silence);
    assert.equal(t.signal,  unity.signal);
  }
});

// ── makeInitialCaptureState ────────────────────────────────────────

test('makeInitialCaptureState — all counters at 0, all timestamps null', () => {
  const s = makeInitialCaptureState();
  assert.equal(s.runningPeak,     0);
  assert.equal(s.fskPeak,         0);
  assert.equal(s.totalSignalMs,   0);
  assert.equal(s.fskStartMs,      null);
  assert.equal(s.firstSignalMs,   null);
  assert.equal(s.activeMs,        0);
  assert.equal(s.consecSilenceMs, 0);
  assert.equal(s.lastTickMs,      null);
});

// ── updateCaptureState ─────────────────────────────────────────────

// Build a tick object with sensible defaults; override what each test cares about.
function tick(overrides) {
  return Object.assign({
    peak: 0,
    now: 1000,
    silenceThreshold: 0.05,
    signalThreshold:  0.10,
    recordStartMs:    0,
    expectedSignalMs: 30000,
  }, overrides);
}

test('updateCaptureState — first tick sets lastTickMs but accumulates no time', () => {
  const { state, events } = updateCaptureState(makeInitialCaptureState(), tick({ peak: 0.5, now: 2000 }));
  assert.equal(state.lastTickMs, 2000);
  // dtMs is 0 on the first tick (lastTickMs was null), so totalSignalMs
  // doesn't advance even though peak is above signalThreshold
  assert.equal(state.totalSignalMs, 0);
  assert.equal(state.runningPeak, 0.5);
  assert.equal(events.fskJustStarted, false);
});

test('updateCaptureState — silence accumulates consecSilenceMs', () => {
  let s = makeInitialCaptureState();
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1000 })).state;
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1100 })).state;
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1300 })).state;
  // Two real intervals: 100 + 200 = 300 ms
  assert.equal(s.consecSilenceMs, 300);
});

test('updateCaptureState — signal resets consecSilenceMs and accumulates totalSignalMs', () => {
  let s = makeInitialCaptureState();
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1000 })).state;
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1500 })).state;
  // consecSilenceMs = 500 now
  s = updateCaptureState(s, tick({ peak: 0.5, now: 1700 })).state;
  // Signal resets consecSilenceMs and adds dtMs (200) to totalSignalMs
  assert.equal(s.consecSilenceMs, 0);
  assert.equal(s.totalSignalMs,   200);
});

test('updateCaptureState — fskJustStarted fires when ≥500ms silence precedes signal', () => {
  let s = makeInitialCaptureState();
  // Build up 500ms of silence
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1000 })).state;
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1500 })).state;
  // First signal tick should now trigger fskJustStarted
  const out = updateCaptureState(s, tick({ peak: 0.5, now: 1700 }));
  assert.equal(out.events.fskJustStarted, true);
  assert.equal(out.state.fskStartMs,      1700);
});

test('updateCaptureState — fskJustStarted does NOT fire without 500ms silence', () => {
  let s = makeInitialCaptureState();
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1000 })).state;
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1100 })).state;   // only 100ms silence
  const out = updateCaptureState(s, tick({ peak: 0.5, now: 1300 }));
  assert.equal(out.events.fskJustStarted, false);
  assert.equal(out.state.fskStartMs,      null);
});

test('updateCaptureState — after fskStartMs set, activeMs and fskPeak track signal', () => {
  let s = makeInitialCaptureState();
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1000 })).state;   // silence, dt=0
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1500 })).state;   // silence, dt=500
  s = updateCaptureState(s, tick({ peak: 0.5,  now: 1700 })).state;   // signal, dt=200, fskStartMs=1700, activeMs += 200 = 200
  s = updateCaptureState(s, tick({ peak: 0.7,  now: 1900 })).state;   // signal, dt=200, activeMs += 200 = 400
  s = updateCaptureState(s, tick({ peak: 0.6,  now: 2000 })).state;   // signal, dt=100, activeMs += 100 = 500
  assert.equal(s.activeMs, 500);
  assert.equal(s.fskPeak,  0.7);   // max of 0.5, 0.7, 0.6
});

test('updateCaptureState — fskJustStarted only fires ONCE per session', () => {
  let s = makeInitialCaptureState();
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1000 })).state;
  s = updateCaptureState(s, tick({ peak: 0.01, now: 1500 })).state;
  const firstSignal = updateCaptureState(s, tick({ peak: 0.5, now: 1700 }));
  assert.equal(firstSignal.events.fskJustStarted, true);
  // Subsequent silence + signal should NOT re-fire fskJustStarted
  let s2 = firstSignal.state;
  s2 = updateCaptureState(s2, tick({ peak: 0.01, now: 2300 })).state;   // 600ms silence
  s2 = updateCaptureState(s2, tick({ peak: 0.01, now: 2900 })).state;
  const secondSignal = updateCaptureState(s2, tick({ peak: 0.5, now: 3100 }));
  assert.equal(secondSignal.events.fskJustStarted, false);
});

// ── progressPct ────────────────────────────────────────────────────

test('updateCaptureState — progressPct null until firstSignalMs is set', () => {
  const out = updateCaptureState(makeInitialCaptureState(), tick({ peak: 0.01, now: 1000 }));
  assert.equal(out.events.progressPct, null);
});

test('updateCaptureState — progressPct grows from 0 to 100 over expectedSignalMs', () => {
  let s = makeInitialCaptureState();
  // First signal tick — firstSignalMs = 1000
  s = updateCaptureState(s, tick({ peak: 0.5, now: 1000 })).state;
  // 50% point: 15000ms after first signal (expectedSignalMs=30000)
  const half = updateCaptureState(s, tick({ peak: 0.5, now: 16000, expectedSignalMs: 30000 }));
  assert.ok(Math.abs(half.events.progressPct - 50) < 0.1);
  // 100% point: 30000ms after first signal
  const full = updateCaptureState(s, tick({ peak: 0.5, now: 31000, expectedSignalMs: 30000 }));
  assert.equal(full.events.progressPct, 100);
});

test('updateCaptureState — progressPct caps at 100, never exceeds', () => {
  let s = makeInitialCaptureState();
  s = updateCaptureState(s, tick({ peak: 0.5, now: 1000 })).state;
  const out = updateCaptureState(s, tick({ peak: 0.5, now: 100000, expectedSignalMs: 30000 }));
  assert.equal(out.events.progressPct, 100);
});

// ── auto-stop ladder ───────────────────────────────────────────────

test('updateCaptureState — silence-after-signal auto-stop after 5s signal + 1s silence', () => {
  // Build state with 5s signal accumulated and 1s silence after.
  let s = makeInitialCaptureState();
  // Manually craft a state close to the trigger:
  s = { ...s, totalSignalMs: 6000, consecSilenceMs: 1100, lastTickMs: 9000 };
  const out = updateCaptureState(s, tick({ peak: 0.01, now: 9100 }));
  assert.equal(out.events.autoStop, 'silence-after-signal');
});

test('updateCaptureState — dump-timeout auto-stop after expectedSignalMs+500 from first signal', () => {
  let s = makeInitialCaptureState();
  s = { ...s, firstSignalMs: 1000, totalSignalMs: 100, lastTickMs: 31600 };
  const out = updateCaptureState(s, tick({
    peak: 0.5, now: 31700, expectedSignalMs: 30000,
  }));
  // signalElapsed = 31700 - 1000 = 30700 ≥ 30000 + 500 = 30500
  assert.equal(out.events.autoStop, 'dump-timeout');
});

test('updateCaptureState — total-signal auto-stop after totalSignalMs ≥ expectedSignalMs', () => {
  let s = makeInitialCaptureState();
  // Skip past the dump-timeout window by NOT setting firstSignalMs:
  // accumulate totalSignalMs purely through ticks where firstSignalMs
  // starts null. Trick: make peak above signalThreshold, which will
  // also set firstSignalMs on this very tick — so we manually pre-set
  // totalSignalMs to near-threshold and rely on the new tick's
  // contribution being the straw that breaks the camel.
  s = { ...s, totalSignalMs: 29950, firstSignalMs: 30000, lastTickMs: 30000 };
  const out = updateCaptureState(s, tick({
    peak: 0.5, now: 30100, expectedSignalMs: 30000,
  }));
  // totalSignalMs += 100 → 30050 ≥ 30000 → triggers total-signal
  // (dump-timeout would need signalElapsed ≥ 30500; we have 100 only)
  assert.equal(out.events.autoStop, 'total-signal');
});

test('updateCaptureState — safety-timeout auto-stop after expected + 6000 from recordStart', () => {
  let s = makeInitialCaptureState();
  s = { ...s, lastTickMs: 36100 };
  const out = updateCaptureState(s, tick({
    peak: 0.01, now: 36200, recordStartMs: 0, expectedSignalMs: 30000,
  }));
  // elapsedTotal = 36200 ≥ 30000 + 6000 = 36000
  assert.equal(out.events.autoStop, 'safety-timeout');
});

test('updateCaptureState — autoStop is null when no condition met', () => {
  const out = updateCaptureState(makeInitialCaptureState(), tick({ peak: 0.5, now: 1000 }));
  assert.equal(out.events.autoStop, null);
});

test('updateCaptureState — auto-stop priority: silence-after-signal beats others', () => {
  // Construct state where multiple conditions could trigger; expect
  // the first in the priority order.
  let s = makeInitialCaptureState();
  s = { ...s,
        totalSignalMs:  31000,    // ≥ expectedSignalMs
        consecSilenceMs: 1100,    // ≥ 1000
        firstSignalMs:   1000,    // signalElapsed will be ≥ DUMP_TIMEOUT
        lastTickMs:      31900,
      };
  const out = updateCaptureState(s, tick({
    peak: 0.01, now: 32000, recordStartMs: 0, expectedSignalMs: 30000,
  }));
  assert.equal(out.events.autoStop, 'silence-after-signal');
});

// ── elapsedTotal ───────────────────────────────────────────────────

test('updateCaptureState — events.elapsedTotal = now - recordStartMs', () => {
  const out = updateCaptureState(makeInitialCaptureState(), tick({
    peak: 0.01, now: 5000, recordStartMs: 1000,
  }));
  assert.equal(out.events.elapsedTotal, 4000);
});
