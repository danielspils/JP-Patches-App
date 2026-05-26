'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyCaptureWarning,
  CAPTURE_WARN_COPY,
  CAPTURE_WARN_COLOR,
  CAPTURE_WARN_THRESHOLDS,
} = require('../renderer/capture-warnings.js');

// Convenience: clean baseline metrics (everything healthy, no warning).
const ok = { peak: 0.5, runningPeak: 0.5, elapsedMs: 30000, totalSignalMs: 20000 };

// ── classifier ─────────────────────────────────────────────────────

test('classifyCaptureWarning — healthy metrics produce no warning', () => {
  assert.equal(classifyCaptureWarning(ok), null);
});

test('classifyCaptureWarning — clipping fires immediately, no settle period', () => {
  // Even at 0 ms elapsed, clipping should fire.
  const out = classifyCaptureWarning({ ...ok, peak: 0.96, elapsedMs: 100 });
  assert.equal(out, 'clipping');
});

test('classifyCaptureWarning — clipping pre-empts no-signal-escalated', () => {
  // Both conditions met — clipping wins (priority order).
  const out = classifyCaptureWarning({
    peak: 0.99, runningPeak: 0, elapsedMs: 25000, totalSignalMs: 0,
  });
  assert.equal(out, 'clipping');
});

test('classifyCaptureWarning — no-signal-escalated after 20s + ~zero signal', () => {
  const out = classifyCaptureWarning({
    peak: 0.005, runningPeak: 0.005, elapsedMs: 22000, totalSignalMs: 150,
  });
  assert.equal(out, 'no-signal-escalated');
});

test('classifyCaptureWarning — no-signal-escalated does NOT fire if total signal > 200ms', () => {
  const out = classifyCaptureWarning({
    peak: 0.005, runningPeak: 0.025, elapsedMs: 22000, totalSignalMs: 250,
  });
  // Should fall through to no-signal (runningPeak 0.025 < 0.03)
  assert.equal(out, 'no-signal');
});

test('classifyCaptureWarning — no-signal after 8s + zero peak', () => {
  const out = classifyCaptureWarning({
    peak: 0.01, runningPeak: 0.01, elapsedMs: 9000, totalSignalMs: 0,
  });
  assert.equal(out, 'no-signal');
});

test('classifyCaptureWarning — no-signal does NOT fire if runningPeak ≥ 0.03', () => {
  const out = classifyCaptureWarning({
    peak: 0.05, runningPeak: 0.05, elapsedMs: 9000, totalSignalMs: 0,
  });
  // Should fall through to quiet (runningPeak 0.05 < 0.15)
  assert.equal(out, 'quiet');
});

test('classifyCaptureWarning — quiet after 6s + low peak', () => {
  const out = classifyCaptureWarning({
    peak: 0.10, runningPeak: 0.10, elapsedMs: 7000, totalSignalMs: 1000,
  });
  assert.equal(out, 'quiet');
});

test('classifyCaptureWarning — quiet does NOT fire if runningPeak ≥ 0.15', () => {
  const out = classifyCaptureWarning({
    peak: 0.20, runningPeak: 0.20, elapsedMs: 7000, totalSignalMs: 1000,
  });
  assert.equal(out, null);
});

test('classifyCaptureWarning — no warning during the first ~6 seconds even with low signal', () => {
  // Below all elapsed thresholds → no warning, regardless of peak/runningPeak.
  const out = classifyCaptureWarning({
    peak: 0.005, runningPeak: 0.005, elapsedMs: 5000, totalSignalMs: 0,
  });
  assert.equal(out, null);
});

test('classifyCaptureWarning — priority: no-signal-escalated > no-signal > quiet', () => {
  // All three time-based conditions met; pick the most-escalated.
  const out = classifyCaptureWarning({
    peak: 0.01, runningPeak: 0.01, elapsedMs: 22000, totalSignalMs: 100,
  });
  assert.equal(out, 'no-signal-escalated');
});

// ── copy + color tables ─────────────────────────────────────────────

test('CAPTURE_WARN_COPY has an entry for every classifier output', () => {
  for (const key of ['clipping', 'no-signal-escalated', 'no-signal', 'quiet']) {
    assert.ok(CAPTURE_WARN_COPY[key], `missing copy for ${key}`);
    assert.ok(CAPTURE_WARN_COPY[key].length > 0);
  }
});

test('CAPTURE_WARN_COLOR has an entry for every classifier output', () => {
  for (const key of ['clipping', 'no-signal-escalated', 'no-signal', 'quiet']) {
    assert.ok(CAPTURE_WARN_COLOR[key], `missing color for ${key}`);
    assert.match(CAPTURE_WARN_COLOR[key], /^#[0-9a-fA-F]{6}$/);
  }
});

test('CAPTURE_WARN_COLOR uses Roland-red for severe states, amber for informational', () => {
  assert.equal(CAPTURE_WARN_COLOR['clipping'],            '#b94a2e');
  assert.equal(CAPTURE_WARN_COLOR['no-signal-escalated'], '#b94a2e');
  assert.equal(CAPTURE_WARN_COLOR['no-signal'],           '#c39a3a');
  assert.equal(CAPTURE_WARN_COLOR['quiet'],               '#c39a3a');
});

// ── thresholds ──────────────────────────────────────────────────────

test('CAPTURE_WARN_THRESHOLDS — values match the inline numbers we replaced', () => {
  // Regression guard against accidental future tweaks.
  assert.equal(CAPTURE_WARN_THRESHOLDS.CLIPPING_PEAK,                  0.95);
  assert.equal(CAPTURE_WARN_THRESHOLDS.NO_SIGNAL_ESCALATED_ELAPSED_MS, 20000);
  assert.equal(CAPTURE_WARN_THRESHOLDS.NO_SIGNAL_ESCALATED_TOTAL_MS,   200);
  assert.equal(CAPTURE_WARN_THRESHOLDS.NO_SIGNAL_ELAPSED_MS,           8000);
  assert.equal(CAPTURE_WARN_THRESHOLDS.NO_SIGNAL_RUNNING_PEAK,         0.03);
  assert.equal(CAPTURE_WARN_THRESHOLDS.QUIET_ELAPSED_MS,               6000);
  assert.equal(CAPTURE_WARN_THRESHOLDS.QUIET_RUNNING_PEAK,             0.15);
});

test('CAPTURE_WARN_THRESHOLDS — frozen so accidental mutation throws', () => {
  assert.throws(() => { CAPTURE_WARN_THRESHOLDS.CLIPPING_PEAK = 999; });
});
