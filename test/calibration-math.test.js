'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for renderer/calibration-math.js
//
// Run with:    node --test test/calibration-math.test.js
// Or all:      node --test test/
//
// Uses node:test (Node 18+) — zero dependencies. No need to add to
// package.json or install anything.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sliderToGain,
  gainToSlider,
  formatGain,
  gainToAngle,
  angleToGain,
  isDecodeAllDefault,
  computeCalibratedGain,
} = require('../renderer/calibration-math.js');

// Tiny float-compare helper — most of our math involves transcendentals
// (log/pow) so we tolerate sub-ulp drift.
const approx = (actual, expected, eps = 1e-9, message) =>
  assert.ok(Math.abs(actual - expected) < eps,
    message || `expected ~${expected}, got ${actual} (diff=${Math.abs(actual - expected)})`);

// ─── sliderToGain / gainToSlider ────────────────────────────────────────────

test('sliderToGain — boundary values', () => {
  approx(sliderToGain(0),   0.1,  1e-9, 'slider 0 should map to 0.1× gain');
  approx(sliderToGain(100), 30,   1e-9, 'slider 100 should map to 30× gain');
});

test('sliderToGain — geometric midpoint', () => {
  // slider 50 should land at geometric mean of 0.1 and 30 = √3 ≈ 1.732
  approx(sliderToGain(50), Math.sqrt(3), 1e-9, 'slider 50 should be geometric mean');
});

test('sliderToGain — monotonically increasing', () => {
  for (let s = 0; s < 100; s++) {
    assert.ok(sliderToGain(s) < sliderToGain(s + 1),
      `gain should strictly increase from slider ${s} → ${s + 1}`);
  }
});

test('gainToSlider — boundary values', () => {
  assert.equal(gainToSlider(0.1), 0,   'gain 0.1× should be slider 0');
  assert.equal(gainToSlider(30),  100, 'gain 30× should be slider 100');
});

test('gainToSlider — clamps below/above the range', () => {
  assert.equal(gainToSlider(0.001), 0,   'gain below 0.1 should clamp to slider 0');
  assert.equal(gainToSlider(100),   100, 'gain above 30 should clamp to slider 100');
  assert.equal(gainToSlider(-5),    0,   'negative gain should clamp to slider 0');
});

test('round-trip: sliderToGain → gainToSlider stable', () => {
  for (const s of [0, 10, 25, 50, 75, 90, 100]) {
    const round = gainToSlider(sliderToGain(s));
    assert.equal(round, s, `round-trip should preserve slider ${s}`);
  }
});

test('round-trip: gainToSlider → sliderToGain stable (within rounding)', () => {
  for (const g of [0.1, 0.5, 1.0, 1.732, 5, 10, 15, 30]) {
    const round = sliderToGain(gainToSlider(g));
    // gainToSlider rounds to integer, so up to 1.7% error from one round trip
    // (log step at slider boundary = ln(300)/100 ≈ 0.057, so e^0.057 ≈ 1.058).
    assert.ok(Math.abs(round - g) / g < 0.03,
      `round-trip should approximately preserve gain ${g} (got ${round})`);
  }
});

// ─── formatGain ─────────────────────────────────────────────────────────────

test('formatGain — precision varies by magnitude', () => {
  assert.equal(formatGain(0.5),   '0.50×', 'sub-1× gets 2 decimals');
  assert.equal(formatGain(0.123), '0.12×', 'rounds to 2 decimals');
  assert.equal(formatGain(1.0),   '1.0×',  '1×–10× gets 1 decimal');
  assert.equal(formatGain(1.732), '1.7×',  'rounds 1 decimal');
  // JS toFixed uses banker's rounding — 9.95 rounds DOWN to 9.9. This
  // is unintuitive but is the spec behavior; documenting it via assertion
  // so we notice if the format function ever switches to a different
  // rounding strategy.
  assert.equal(formatGain(9.95),  '9.9×',  'banker rounding: 9.95 → 9.9');
  assert.equal(formatGain(9.96),  '10.0×', '9.96 rounds up normally');
  assert.equal(formatGain(10),    '10×',   '10×+ gets 0 decimals');
  assert.equal(formatGain(15.6),  '16×',   'rounds at integer precision');
  assert.equal(formatGain(30),    '30×',   'max value');
});

// ─── gainToAngle / angleToGain ──────────────────────────────────────────────

test('gainToAngle — boundary values', () => {
  approx(gainToAngle(0.1), -135, 1e-9, 'gain 0.1 → knob pointing at "0"');
  approx(gainToAngle(30),  135,  1e-9, 'gain 30 → knob pointing at "10"');
});

test('gainToAngle — geometric midpoint at top of dial', () => {
  // gain ≈ 1.732 (√(0.1 × 30)) should land at 0° (knob pointing at "5")
  approx(gainToAngle(Math.sqrt(3)), 0, 1e-9, 'mid-gain knob points straight up');
});

test('gainToAngle — clamps outside 0.1–30 range', () => {
  approx(gainToAngle(0.001), -135, 1e-9, 'below 0.1 clamps to leftmost');
  approx(gainToAngle(100),   135,  1e-9, 'above 30 clamps to rightmost');
});

test('angleToGain — boundary values', () => {
  approx(angleToGain(-135), 0.1, 1e-9, 'leftmost angle → 0.1×');
  approx(angleToGain(135),  30,  1e-9, 'rightmost angle → 30×');
});

test('angleToGain — clamps outside ±135°', () => {
  approx(angleToGain(-200), 0.1, 1e-9, 'over-rotated CCW clamps to 0.1');
  approx(angleToGain(200),  30,  1e-9, 'over-rotated CW clamps to 30');
});

test('round-trip: gainToAngle → angleToGain stable', () => {
  for (const g of [0.1, 0.5, 1.0, 1.732, 5, 10, 15, 30]) {
    const round = angleToGain(gainToAngle(g));
    approx(round, g, 1e-9, `round-trip should preserve gain ${g}`);
  }
});

test('round-trip: angleToGain → gainToAngle stable', () => {
  for (const a of [-135, -90, -45, 0, 45, 90, 135]) {
    const round = gainToAngle(angleToGain(a));
    approx(round, a, 1e-9, `round-trip should preserve angle ${a}°`);
  }
});

// ─── isDecodeAllDefault ─────────────────────────────────────────────────────

const makePatch = (vcaLevel) => ({ vca_level: vcaLevel });
const makeBank = (vcaLevels) => vcaLevels.map(makePatch);
const allZero = () => ({ banks: [makeBank(new Array(16).fill(0)), makeBank(new Array(16).fill(0))] });

test('isDecodeAllDefault — all-zero VCA levels returns true', () => {
  assert.equal(isDecodeAllDefault(allZero()), true);
});

test('isDecodeAllDefault — single non-zero VCA level returns false', () => {
  const data = allZero();
  data.banks[0][5].vca_level = 1;
  assert.equal(isDecodeAllDefault(data), false);
});

test('isDecodeAllDefault — last slot of last bank with non-zero returns false', () => {
  const data = allZero();
  data.banks[1][15].vca_level = 200;
  assert.equal(isDecodeAllDefault(data), false);
});

test('isDecodeAllDefault — null input returns false', () => {
  assert.equal(isDecodeAllDefault(null), false);
  assert.equal(isDecodeAllDefault(undefined), false);
});

test('isDecodeAllDefault — missing banks returns false', () => {
  assert.equal(isDecodeAllDefault({}), false);
});

test('isDecodeAllDefault — empty banks (no patches) returns false', () => {
  assert.equal(isDecodeAllDefault({ banks: [[], []] }), false);
});

test('isDecodeAllDefault — null patches within banks are skipped', () => {
  const data = { banks: [[null, null, makePatch(0)], [makePatch(0)]] };
  assert.equal(isDecodeAllDefault(data), true);
});

test('isDecodeAllDefault — patch without vca_level field is treated as default-ish', () => {
  const data = { banks: [[{ dco1_range: '8\'' }], [{ dco1_range: '4\'' }]] };
  // Heuristic only checks vca_level. Missing field doesn't disqualify.
  assert.equal(isDecodeAllDefault(data), true);
});

// (computeTrimThresholds tests moved to record-trim.test.js where the
// authoritative function now lives. The calibration-math.js copy was
// dead code overridden at runtime by record-trim.js — removed
// 2026-05-26 along with its duplicate tests.)

// ─── computeCalibratedGain ──────────────────────────────────────────────────

test('computeCalibratedGain — normalizes measured peak to target', () => {
  // current gain 5×, measured peak 0.6, target 0.6 → saved gain 5× (no change)
  approx(computeCalibratedGain(5, 0.6, 0.6), 5, 1e-9);
});

test('computeCalibratedGain — peak below target → boost gain', () => {
  // current gain 1×, measured peak 0.3, target 0.6 → saved 2× (doubles)
  approx(computeCalibratedGain(1, 0.3, 0.6), 2, 1e-9);
});

test('computeCalibratedGain — peak above target → reduce gain', () => {
  // current gain 4×, measured peak 0.8, target 0.6 → 4 × 0.6 / 0.8 = 3
  approx(computeCalibratedGain(4, 0.8, 0.6), 3, 1e-9);
});

test('computeCalibratedGain — caps measurePeak at 0.95 to avoid clipping inflation', () => {
  // current gain 5×, measured peak 1.0 (clipping transient), target 0.6
  // Without cap: 5 × 0.6 / 1.0 = 3 (too low)
  // With cap at 0.95: 5 × 0.6 / 0.95 ≈ 3.158
  approx(computeCalibratedGain(5, 1.0, 0.6), 5 * 0.6 / 0.95, 1e-9);
});

test('computeCalibratedGain — clamps result to 0.5×–30×', () => {
  // Tiny peak → astronomically high gain; should clamp to 30
  approx(computeCalibratedGain(10, 0.01, 0.6), 30, 1e-9);
  // Loud peak with small target × low gain → tiny gain; should clamp to 0.5
  approx(computeCalibratedGain(0.1, 0.95, 0.6), 0.5, 1e-9);
});

test('computeCalibratedGain — defaults TARGET_PEAK to 0.78 when missing', () => {
  // current gain 5×, peak 0.6, default target 0.78 → 5 × 0.78 / 0.6 = 6.5
  approx(computeCalibratedGain(5, 0.6), 6.5, 1e-9);
  approx(computeCalibratedGain(5, 0.6, null), 6.5, 1e-9);
  approx(computeCalibratedGain(5, 0.6, 0), 6.5, 1e-9);
});

test('computeCalibratedGain — guards against zero peak (clamps to 0.001)', () => {
  // Doesn't crash on division by zero
  const result = computeCalibratedGain(5, 0, 0.6);
  assert.equal(result, 30, 'zero peak should clamp to max gain (30)');
});
