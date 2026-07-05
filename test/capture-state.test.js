'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  liveThresholdsFor,
  makeInitialCaptureState,
  updateCaptureState,
  END_OF_DUMP_SILENCE_MS,
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
  assert.equal(s.runningPeak,         0);
  assert.equal(s.fskPeak,             0);
  assert.equal(s.totalSignalMs,       0);
  assert.equal(s.fskStartMs,          null);
  assert.equal(s.firstSignalMs,       null);
  assert.equal(s.activeMs,            0);
  assert.equal(s.consecSilenceMs,     0);
  assert.equal(s.consecBelowSignalMs, 0);
  assert.equal(s.lastTickMs,          null);
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

test('updateCaptureState — silence-after-signal auto-stop after 5s signal + 1s below-signal', () => {
  // The trigger now reads consecBelowSignalMs (looser than the old
  // consecSilenceMs check) so a quiet-but-not-silent JX post-dump
  // tone won't block end-of-dump detection. Setup: 5s signal seen,
  // 1.1s of consec ticks below signal, then one more sub-signal tick.
  let s = makeInitialCaptureState();
  s = { ...s, totalSignalMs: 6000, consecBelowSignalMs: END_OF_DUMP_SILENCE_MS + 100, lastTickMs: 9000 };
  const out = updateCaptureState(s, tick({ peak: 0.01, now: 9100 }));
  assert.equal(out.events.autoStop, 'silence-after-signal');
});

test('updateCaptureState — silence-after-signal fires even when peak is BELOW signal but ABOVE silence (the loud-idle-tone case)', () => {
  // Regression for the 2026-05-26 bug: at 15× gain, silenceThreshold
  // = 0.18 and signalThreshold = 0.375. If post-dump idle tone sits
  // at e.g. 0.25 (above silence, below signal), the OLD trigger
  // (consecSilenceMs) never accumulated and modal stayed open 33+ s
  // past dump end. New trigger uses consecBelowSignalMs so 0.25
  // counts as "no longer transmitting" and the trigger fires.
  let s = makeInitialCaptureState();
  s = { ...s, totalSignalMs: 6000, consecBelowSignalMs: END_OF_DUMP_SILENCE_MS - 10, lastTickMs: 9000 };
  const out = updateCaptureState(s, tick({
    peak: 0.25, now: 9100,
    silenceThreshold: 0.18, signalThreshold: 0.375,
  }));
  // dt = 100ms → consecBelowSignalMs crosses END_OF_DUMP_SILENCE_MS → trigger fires
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

test('updateCaptureState — safety-timeout auto-stop fires after expected + 6000 ONLY once signal was detected', () => {
  // Safety-timeout fires only when no other trigger has caught the
  // capture. Construct a state where:
  //   - firstSignalMs is set (gating requirement)
  //   - signal was detected recently enough that DUMP_TIMEOUT_MS
  //     (signalElapsed ≥ EXP+500) hasn't tripped
  //   - totalSignalMs is below EXP (else total-signal fires first)
  //   - elapsedTotal ≥ EXP+6000 (the safety-timeout threshold)
  let s = makeInitialCaptureState();
  // recordStart=0, signal detected at t=30000, now=36100:
  //   elapsedTotal  = 36100 ≥ 36000 (safety threshold)  ✓
  //   signalElapsed = 6100  <  30500 (dump-timeout)     ✓
  //   totalSignalMs = 0     <  30000 (total-signal)     ✓
  s = { ...s, firstSignalMs: 30000, lastTickMs: 36000 };
  const out = updateCaptureState(s, tick({
    peak: 0.01, now: 36100, recordStartMs: 0, expectedSignalMs: 30000,
  }));
  assert.equal(out.events.autoStop, 'safety-timeout');
});

test('updateCaptureState — safety-timeout does NOT fire while idling (no signal ever detected)', () => {
  // Branch B: user opened the modal but never pressed Tape Memory →
  //   Save, so firstSignalMs stays null. Even past the safety-timeout
  //   wall-clock window, autoStop stays null — we wait for Cancel.
  //   (This was the false-positive that caused "Recording didn't
  //   decode cleanly" prompts against empty buffers pre-2026-05-26.)
  let s = makeInitialCaptureState();
  s = { ...s, lastTickMs: 36100 };
  const out = updateCaptureState(s, tick({
    peak: 0.01, now: 36200, recordStartMs: 0, expectedSignalMs: 30000,
  }));
  assert.equal(out.events.autoStop, null);
});

test('updateCaptureState — autoStop is null when no condition met', () => {
  const out = updateCaptureState(makeInitialCaptureState(), tick({ peak: 0.5, now: 1000 }));
  assert.equal(out.events.autoStop, null);
});

test('updateCaptureState — auto-stop priority: silence-after-signal beats others', () => {
  // Construct state where multiple conditions could trigger; expect
  // the first in the priority order.
  // (Note: the silence-after-signal trigger reads consecBelowSignalMs,
  // not consecSilenceMs, since the 2026-05-26 fix for the loud-idle-
  // tone case. Setting consecSilenceMs alone wouldn't drive it.)
  let s = makeInitialCaptureState();
  s = { ...s,
        totalSignalMs:       31000,  // ≥ expectedSignalMs (total-signal would fire)
        consecBelowSignalMs: END_OF_DUMP_SILENCE_MS + 100,  // silence-after-signal SHOULD win
        firstSignalMs:       1000,   // signalElapsed will be ≥ DUMP_TIMEOUT
        lastTickMs:          31900,
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

// ── Frequency gate (tick.fskLive) — the idle-buzz / quiet-dump fix ──────────
// When the caller supplies fskLive, it REPLACES the amplitude signal test.
// These verify both directions: a loud buzz with no FSK is NOT signal, and a
// quiet dump WITH FSK is. Omitting fskLive must leave the amplitude path
// byte-identical (the ~20 tests above never pass it and still pass).

test('updateCaptureState — fskLive gate: loud idle buzz (high peak, fskLive false) is NOT signal', () => {
  // The core idle-buzz bug: at high gain the buzz peak (0.9) clears any
  // amplitude floor, but fskLive:false ⇒ no premature start / no false signal.
  let s = makeInitialCaptureState();
  s = { ...s, lastTickMs: 1000 };
  const out = updateCaptureState(s, tick({ peak: 0.9, now: 1100, fskLive: false }));
  assert.equal(out.state.firstSignalMs, null);
  assert.equal(out.state.totalSignalMs, 0);
  assert.equal(out.state.fskStartMs, null);
  assert.equal(out.events.fskJustStarted, false);
  // ...and it correctly reads as "not transmitting" for end-of-dump math
  assert.equal(out.state.consecBelowSignalMs, 100);
});

test('updateCaptureState — fskLive gate: quiet dump (low peak, fskLive true) IS signal, fskJustStarted fires at once', () => {
  // The low-gain fix: peak 0.02 is below every amplitude floor, but fskLive
  // true ⇒ real signal, and the frequency gate needs no 500 ms prior silence.
  let s = makeInitialCaptureState();
  s = { ...s, lastTickMs: 1000 };
  const out = updateCaptureState(s, tick({ peak: 0.02, now: 1100, fskLive: true }));
  assert.equal(out.state.firstSignalMs, 1100);
  assert.equal(out.state.totalSignalMs, 100);
  assert.equal(out.state.fskStartMs, 1100);
  assert.equal(out.events.fskJustStarted, true);
  assert.equal(out.state.activeMs, 100);
});

test('updateCaptureState — fskLive gate: end-of-dump via fskLive false triggers silence-after-signal even under a loud idle tone', () => {
  // After the dump, the JX idle tone can be loud (peak 0.9). Amplitude alone
  // would keep counting it as signal; fskLive:false ends the capture cleanly.
  let s = makeInitialCaptureState();
  s = { ...s, totalSignalMs: 6000, consecBelowSignalMs: END_OF_DUMP_SILENCE_MS - 50, lastTickMs: 9000 };
  const out = updateCaptureState(s, tick({ peak: 0.9, now: 9100, fskLive: false }));
  assert.equal(out.events.autoStop, 'silence-after-signal');
});

test('updateCaptureState — no fskLive field ⇒ amplitude path unchanged', () => {
  let s = makeInitialCaptureState();
  s = { ...s, lastTickMs: 1000 };
  const out = updateCaptureState(s, tick({ peak: 0.5, now: 1100 }));  // fskLive omitted
  assert.equal(out.state.firstSignalMs, 1100);
  assert.equal(out.state.totalSignalMs, 100);
});
