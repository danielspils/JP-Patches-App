'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  SEND_PILOT_SEC,
  computeSegDurations,
  computeIndicatorPosition,
} = require('../renderer/send-timeline.js');

// ── SEND_PILOT_SEC ─────────────────────────────────────────────────

test('SEND_PILOT_SEC — matches the JX-3P tape-format math', () => {
  // 4096 bits × 50 samples/bit ÷ 44100 Hz = 4.64399... s
  assert.ok(Math.abs(SEND_PILOT_SEC - (4096 * 50 / 44100)) < 1e-9);
});

// ── computeSegDurations ────────────────────────────────────────────

test('computeSegDurations — empty segments returns empty array', () => {
  assert.deepEqual(computeSegDurations(30, []), []);
});

test('computeSegDurations — handles non-array gracefully', () => {
  assert.deepEqual(computeSegDurations(30, null), []);
  assert.deepEqual(computeSegDurations(30, undefined), []);
});

test('computeSegDurations — all pilots return exact pilot durations', () => {
  const segs = [{ pilot: true }, { pilot: true }];
  const out  = computeSegDurations(30, segs);
  assert.equal(out.length, 2);
  assert.equal(out[0], SEND_PILOT_SEC);
  assert.equal(out[1], SEND_PILOT_SEC);
});

test('computeSegDurations — data segments share the non-pilot remainder equally', () => {
  // Sequence: init (pilot) + sequence (data). Total = 30 s.
  // Pilot = SEND_PILOT_SEC ≈ 4.644
  // Data share = 30 - 4.644 ≈ 25.356 (one data segment, gets the whole remainder)
  const segs = [{ pilot: true }, { pilot: false }];
  const out  = computeSegDurations(30, segs);
  assert.equal(out[0], SEND_PILOT_SEC);
  assert.ok(Math.abs(out[1] - (30 - SEND_PILOT_SEC)) < 1e-9);
});

test('computeSegDurations — patch-style 4-segment layout', () => {
  // Patches: init (pilot) + bank-c (data) + divider (pilot) + bank-d (data). Total = 30 s.
  // Pilots = 2 × SEND_PILOT_SEC ≈ 9.288
  // Data each = (30 - 9.288) / 2 ≈ 10.356
  const segs = [
    { pilot: true },
    { pilot: false },
    { pilot: true },
    { pilot: false },
  ];
  const out = computeSegDurations(30, segs);
  assert.equal(out[0], SEND_PILOT_SEC);
  assert.equal(out[2], SEND_PILOT_SEC);
  const expectedData = (30 - 2 * SEND_PILOT_SEC) / 2;
  assert.ok(Math.abs(out[1] - expectedData) < 1e-9);
  assert.ok(Math.abs(out[3] - expectedData) < 1e-9);
});

test('computeSegDurations — total durations sum to input total when no clamping', () => {
  const segs = [{ pilot: true }, { pilot: false }, { pilot: true }, { pilot: false }];
  const out  = computeSegDurations(40, segs);
  const sum  = out.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 40) < 1e-9);
});

test('computeSegDurations — total shorter than pilots clamps data to 0', () => {
  // Total = 1 s, pilots eat 4.644 s alone — data segments collapse to 0.
  const segs = [{ pilot: true }, { pilot: false }];
  const out  = computeSegDurations(1, segs);
  assert.equal(out[0], SEND_PILOT_SEC);
  assert.equal(out[1], 0);
});

test('computeSegDurations — all-data (no pilots) divides total equally', () => {
  const segs = [{ pilot: false }, { pilot: false }, { pilot: false }];
  const out  = computeSegDurations(30, segs);
  assert.equal(out[0], 10);
  assert.equal(out[1], 10);
  assert.equal(out[2], 10);
});

// ── computeIndicatorPosition ───────────────────────────────────────

test('computeIndicatorPosition — empty durations returns 0/0', () => {
  const out = computeIndicatorPosition(5, []);
  assert.equal(out.pct, 0);
  assert.equal(out.activeIdx, 0);
});

test('computeIndicatorPosition — zero total duration returns pct=0', () => {
  const out = computeIndicatorPosition(5, [0, 0]);
  assert.equal(out.pct, 0);
});

test('computeIndicatorPosition — playhead before any segment ends → activeIdx=0', () => {
  const out = computeIndicatorPosition(1, [10, 20, 30]);
  assert.equal(out.activeIdx, 0);
});

test('computeIndicatorPosition — playhead inside second segment → activeIdx=1', () => {
  const out = computeIndicatorPosition(15, [10, 20, 30]);
  assert.equal(out.activeIdx, 1);
});

test('computeIndicatorPosition — playhead at segment boundary → next segment active', () => {
  // currentSec === acc means we're AT the boundary; the loop's
  // `currentSec < acc` check picks the NEXT segment.
  const out = computeIndicatorPosition(10, [10, 20, 30]);
  assert.equal(out.activeIdx, 1);
});

test('computeIndicatorPosition — playhead past total → last segment stays active', () => {
  const out = computeIndicatorPosition(100, [10, 20, 30]);
  assert.equal(out.activeIdx, 2);
});

test('computeIndicatorPosition — pct = (current / total) * 100, capped at 100', () => {
  // Total = 60
  assert.equal(computeIndicatorPosition(0,   [10, 20, 30]).pct, 0);
  assert.equal(computeIndicatorPosition(15,  [10, 20, 30]).pct, 25);
  assert.equal(computeIndicatorPosition(30,  [10, 20, 30]).pct, 50);
  assert.equal(computeIndicatorPosition(60,  [10, 20, 30]).pct, 100);
  assert.equal(computeIndicatorPosition(120, [10, 20, 30]).pct, 100);  // capped
});
