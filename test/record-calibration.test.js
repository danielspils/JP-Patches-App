'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// record-calibration.test.js
//
// Pins the v0.7.5 fix for "the app forgets my Record-from-JX input gain when
// I update the software." Root cause: calibration was keyed AND looked up by
// MediaDeviceInfo.deviceId, which is a salted hash that rotates across app
// updates / USB replug / default-switch. The fix falls back to matching by
// the stable device LABEL (carries USB VID:PID).
//
// Run:  node --test test/record-calibration.test.js
// ═══════════════════════════════════════════════════════════════════════════

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeDeviceLabel,
  resolveCalibratedGain,
  staleCalibrationKeys,
} = require('../renderer/record-calibration.js');

// A KT cable calibrated once. deviceId is a typical Chromium hash.
function ktMap() {
  return {
    f7279c36eb473eb3aaaa: {
      label: 'KT USB Audio (31b2:2024)',
      gain: 9.34,
      calibratedAt: '2026-06-02T13:42:42.398Z',
    },
  };
}

// ── normalizeDeviceLabel ──

test('normalizeDeviceLabel — strips Chromium "Default - " prefix', () => {
  assert.equal(
    normalizeDeviceLabel('Default - KT USB Audio (31b2:2024)'),
    'KT USB Audio (31b2:2024)'
  );
});

test('normalizeDeviceLabel — leaves a bare label untouched', () => {
  assert.equal(normalizeDeviceLabel('KT USB Audio (31b2:2024)'), 'KT USB Audio (31b2:2024)');
});

test('normalizeDeviceLabel — trims surrounding whitespace', () => {
  assert.equal(normalizeDeviceLabel('  KT USB Audio  '), 'KT USB Audio');
});

test('normalizeDeviceLabel — null / undefined / non-string → empty string', () => {
  assert.equal(normalizeDeviceLabel(null), '');
  assert.equal(normalizeDeviceLabel(undefined), '');
  assert.equal(normalizeDeviceLabel(42), '42');
});

test('normalizeDeviceLabel — only strips a LEADING "Default - "', () => {
  // A device literally named with "Default - " mid-string shouldn't lose it.
  assert.equal(normalizeDeviceLabel('My Default - Box'), 'My Default - Box');
});

// ── resolveCalibratedGain: fast path ──

test('resolveCalibratedGain — exact deviceId hit returns that entry', () => {
  const map = ktMap();
  const got = resolveCalibratedGain(map, 'f7279c36eb473eb3aaaa', 'KT USB Audio (31b2:2024)');
  assert.equal(got.gain, 9.34);
});

// ── resolveCalibratedGain: the actual bug — deviceId rotated ──

test('resolveCalibratedGain — deviceId rotated (update): recovers gain by label', () => {
  const map = ktMap();
  // After an app update the SAME cable enumerates under a brand-new hash.
  const got = resolveCalibratedGain(map, 'BRAND_NEW_HASH_after_update', 'KT USB Audio (31b2:2024)');
  assert.ok(got, 'should find the entry by label despite the new deviceId');
  assert.equal(got.gain, 9.34);
});

test('resolveCalibratedGain — "Default - " label matches the bare-label entry', () => {
  const map = ktMap();
  // Device is now the system default, so Chromium prefixes "Default - ".
  const got = resolveCalibratedGain(map, 'default', 'Default - KT USB Audio (31b2:2024)');
  assert.ok(got);
  assert.equal(got.gain, 9.34);
});

test('resolveCalibratedGain — bare label matches a stored "Default - " entry', () => {
  const map = {
    default: { label: 'Default - KT USB Audio (31b2:2024)', gain: 12.42, calibratedAt: '2026-06-01T21:03:29.685Z' },
  };
  const got = resolveCalibratedGain(map, 'some_new_hash', 'KT USB Audio (31b2:2024)');
  assert.equal(got.gain, 12.42);
});

test('resolveCalibratedGain — multiple label matches: most recent wins (Daniel\'s real data)', () => {
  // Exactly the duplicate found in the live library: same KT cable under two
  // keys with diverging gains. The later calibration should win.
  const map = {
    default:               { label: 'Default - KT USB Audio (31b2:2024)', gain: 12.42, calibratedAt: '2026-06-01T21:03:29.685Z' },
    f7279c36eb473eb3aaaa:  { label: 'KT USB Audio (31b2:2024)',           gain: 9.34,  calibratedAt: '2026-06-02T13:42:42.398Z' },
  };
  const got = resolveCalibratedGain(map, 'yet_another_new_hash', 'KT USB Audio (31b2:2024)');
  assert.equal(got.gain, 9.34, 'June 2 calibration is newer than June 1');
});

// ── resolveCalibratedGain: misses + guards ──

test('resolveCalibratedGain — unknown device (no id, no label match) → null', () => {
  const map = ktMap();
  assert.equal(resolveCalibratedGain(map, 'unknown_hash', 'Some Other Interface'), null);
});

test('resolveCalibratedGain — deviceId miss + empty label → null (no false match)', () => {
  const map = ktMap();
  assert.equal(resolveCalibratedGain(map, 'unknown_hash', ''), null);
  assert.equal(resolveCalibratedGain(map, 'unknown_hash', null), null);
});

test('resolveCalibratedGain — entries with invalid gain are ignored', () => {
  const map = {
    a: { label: 'KT USB Audio (31b2:2024)', gain: 0,    calibratedAt: '2026-06-03T00:00:00Z' },
    b: { label: 'KT USB Audio (31b2:2024)', gain: -5,   calibratedAt: '2026-06-03T00:00:00Z' },
    c: { label: 'KT USB Audio (31b2:2024)', gain: NaN,  calibratedAt: '2026-06-03T00:00:00Z' },
    d: { label: 'KT USB Audio (31b2:2024)', gain: 'x',  calibratedAt: '2026-06-03T00:00:00Z' },
  };
  assert.equal(resolveCalibratedGain(map, 'whatever', 'KT USB Audio (31b2:2024)'), null);
});

test('resolveCalibratedGain — exact-id hit is REJECTED when its label contradicts the device', () => {
  // The dangerous case: a reused "default" key was stored for the Scarlett,
  // but now the KT is the default. Looking up "default" with the KT label
  // must NOT return the Scarlett's gain — it should find the KT by label.
  const map = {
    default: { label: 'Default - Scarlett 2i2 USB', gain: 4.1, calibratedAt: '2026-06-01T00:00:00Z' },
    kthash:  { label: 'KT USB Audio (31b2:2024)',   gain: 9.34, calibratedAt: '2026-06-02T00:00:00Z' },
  };
  const got = resolveCalibratedGain(map, 'default', 'Default - KT USB Audio (31b2:2024)');
  assert.equal(got.gain, 9.34, 'must not hand the KT the Scarlett\'s gain');
});

test('resolveCalibratedGain — exact-id hit with contradicting label and no other match → null', () => {
  const map = {
    default: { label: 'Default - Scarlett 2i2 USB', gain: 4.1, calibratedAt: '2026-06-01T00:00:00Z' },
  };
  // KT is now default but was never calibrated → no false Scarlett match.
  assert.equal(resolveCalibratedGain(map, 'default', 'KT USB Audio (31b2:2024)'), null);
});

test('resolveCalibratedGain — exact-id hit trusted when NO label supplied (back-compat)', () => {
  const map = ktMap();
  const got = resolveCalibratedGain(map, 'f7279c36eb473eb3aaaa', null);
  assert.equal(got.gain, 9.34);
});

test('resolveCalibratedGain — exact deviceId hit with invalid gain falls through to label search', () => {
  const map = {
    badkey: { label: 'KT USB Audio (31b2:2024)', gain: 0,    calibratedAt: '2026-06-01T00:00:00Z' },
    good:   { label: 'KT USB Audio (31b2:2024)', gain: 7.5,  calibratedAt: '2026-06-02T00:00:00Z' },
  };
  const got = resolveCalibratedGain(map, 'badkey', 'KT USB Audio (31b2:2024)');
  assert.equal(got.gain, 7.5);
});

test('resolveCalibratedGain — null / non-object map → null', () => {
  assert.equal(resolveCalibratedGain(null, 'x', 'y'), null);
  assert.equal(resolveCalibratedGain(undefined, 'x', 'y'), null);
  assert.equal(resolveCalibratedGain('nope', 'x', 'y'), null);
});

test('resolveCalibratedGain — empty map → null', () => {
  assert.equal(resolveCalibratedGain({}, 'x', 'KT USB Audio (31b2:2024)'), null);
});

// ── staleCalibrationKeys ──

test('staleCalibrationKeys — finds the "default" alias for the same device', () => {
  const map = {
    default:    { label: 'Default - KT USB Audio (31b2:2024)', gain: 12.42, calibratedAt: '2026-06-01T21:03:29.685Z' },
    newhash123: { label: 'KT USB Audio (31b2:2024)',           gain: 9.34,  calibratedAt: '2026-06-02T13:42:42.398Z' },
  };
  // Recalibrating under newhash123 should flag "default" as stale.
  assert.deepEqual(staleCalibrationKeys(map, 'newhash123', 'KT USB Audio (31b2:2024)'), ['default']);
});

test('staleCalibrationKeys — never returns the current deviceId key', () => {
  const map = ktMap();
  assert.deepEqual(
    staleCalibrationKeys(map, 'f7279c36eb473eb3aaaa', 'KT USB Audio (31b2:2024)'),
    []
  );
});

test('staleCalibrationKeys — leaves OTHER devices alone', () => {
  const map = {
    kt:    { label: 'KT USB Audio (31b2:2024)', gain: 9.34, calibratedAt: '2026-06-02T00:00:00Z' },
    scarlett: { label: 'Scarlett 2i2 USB', gain: 4.1, calibratedAt: '2026-06-02T00:00:00Z' },
  };
  // Recalibrating the KT under a new hash must not flag the Scarlett.
  assert.deepEqual(staleCalibrationKeys(map, 'newkt', 'KT USB Audio (31b2:2024)'), ['kt']);
});

test('staleCalibrationKeys — empty label → [] (never prune blindly)', () => {
  const map = ktMap();
  assert.deepEqual(staleCalibrationKeys(map, 'x', ''), []);
  assert.deepEqual(staleCalibrationKeys(map, 'x', null), []);
});

test('staleCalibrationKeys — null map → []', () => {
  assert.deepEqual(staleCalibrationKeys(null, 'x', 'y'), []);
});

test('staleCalibrationKeys — collapses several orphans of the same device', () => {
  const map = {
    oldhashA: { label: 'KT USB Audio (31b2:2024)', gain: 8,  calibratedAt: '2026-05-01T00:00:00Z' },
    oldhashB: { label: 'Default - KT USB Audio (31b2:2024)', gain: 9, calibratedAt: '2026-05-15T00:00:00Z' },
    current:  { label: 'KT USB Audio (31b2:2024)', gain: 10, calibratedAt: '2026-06-02T00:00:00Z' },
  };
  const stale = staleCalibrationKeys(map, 'current', 'KT USB Audio (31b2:2024)').sort();
  assert.deepEqual(stale, ['oldhashA', 'oldhashB']);
});
