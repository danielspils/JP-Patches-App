'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for renderer/library-math.js
//
// Run with:    node --test test/library-math.test.js
// Or all:      node --test test/
//
// Uses node:test (Node 18+) — zero dependencies.
// ═══════════════════════════════════════════════════════════════════════════

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  paramsFingerprint,
  computeReorderIdx,
  allPatchesIdentical,
} = require('../renderer/library-math.js');

// ─── paramsFingerprint ──────────────────────────────────────────────────────

test('paramsFingerprint — returns null for null/undefined', () => {
  assert.equal(paramsFingerprint(null),      null);
  assert.equal(paramsFingerprint(undefined), null);
});

test('paramsFingerprint — returns null for non-object input', () => {
  assert.equal(paramsFingerprint('not an object'), null);
  assert.equal(paramsFingerprint(42),              null);
});

test('paramsFingerprint — returns null for empty object', () => {
  assert.equal(paramsFingerprint({}), null);
});

test('paramsFingerprint — produces same string for same params regardless of key order', () => {
  // This is THE critical property — name restoration on tape roundtrip
  // depends on the fingerprint being key-order-independent. JX-3P emits
  // params in its own order; library.history was populated in JS object
  // order. They must collide.
  const a = { dco1_range: "8'", dco1_waveform: 'saw', vca_level: 100 };
  const b = { vca_level: 100, dco1_waveform: 'saw', dco1_range: "8'" };
  assert.equal(paramsFingerprint(a), paramsFingerprint(b));
});

test('paramsFingerprint — different values produce different fingerprints', () => {
  const a = { vca_level: 100, dco1_range: "8'" };
  const b = { vca_level: 101, dco1_range: "8'" };  // one byte different
  assert.notEqual(paramsFingerprint(a), paramsFingerprint(b));
});

test('paramsFingerprint — preserves value types (string vs number)', () => {
  const a = { vca_level: 100 };
  const b = { vca_level: '100' };
  assert.notEqual(paramsFingerprint(a), paramsFingerprint(b),
    "100 and '100' must NOT collide — type information is part of identity");
});

test('paramsFingerprint — survives a JSON-roundtrip (the real-world tape path)', () => {
  // What actually happens in production: params get serialized to a tape
  // dump as JSON, decoded back from the WAV's jx3p output, and re-fingerprinted.
  // JSON survives this losslessly for our value types (string + integer).
  const original  = { dco1_range: "8'", vca_level: 100, mystery: 0 };
  const roundtrip = JSON.parse(JSON.stringify(original));
  assert.equal(paramsFingerprint(original), paramsFingerprint(roundtrip));
});

// ─── computeReorderIdx ──────────────────────────────────────────────────────

test('computeReorderIdx — down-move shifts target up by 1', () => {
  assert.equal(computeReorderIdx(2, 5), 4, 'dragging slot 2 to slot 5 (downward) lands at index 4 after splice');
  assert.equal(computeReorderIdx(0, 15), 14, 'top-to-bottom drag shifts');
});

test('computeReorderIdx — up-move uses target unchanged', () => {
  assert.equal(computeReorderIdx(5, 2), 2, 'dragging slot 5 to slot 2 (upward) lands at index 2');
  assert.equal(computeReorderIdx(15, 0), 0, 'bottom-to-top drag unchanged');
});

test('computeReorderIdx — same slot produces no-op (fromIdx === effectiveToIdx)', () => {
  assert.equal(computeReorderIdx(5, 5), 5, 'dropping on origin slot is no-op');
});

test('computeReorderIdx — adjacent down-move produces no-op', () => {
  // Indicator at top of slot 4 while item is at slot 3 = "insert between
  // slot 3 and slot 4" = same position the item already occupies. Should
  // yield effectiveToIdx === fromIdx so the caller early-returns.
  assert.equal(computeReorderIdx(3, 4), 3, 'down-move to adjacent slot is no-op');
});

test('computeReorderIdx — adjacent up-move is NOT a no-op', () => {
  // Indicator at top of slot 3 while item is at slot 4 = "move slot 4 to
  // be above slot 3". This IS a real move (slots 3 and 4 swap).
  assert.equal(computeReorderIdx(4, 3), 3, 'up-move to adjacent slot is a real move');
});

test('computeReorderIdx — round-trip via the undo path returns to fromIdx', () => {
  // Real-world undo: reorderBankSlot(bank, fromIdx, toIdx) records its
  // post-move position (effectiveToIdx) and pushes an undo that calls
  // reorderBankSlot(bank, effectiveToIdx, fromIdx). Verify the undo arg
  // pair maps back to the original.
  const fromIdx = 2;
  const toIdx   = 7;
  const eff     = computeReorderIdx(fromIdx, toIdx);   // 6 (down-move)
  // Undo call: source = eff, target = fromIdx — which is now an up-move
  // (eff=6 > fromIdx=2), so effectiveToIdx === fromIdx unchanged.
  assert.equal(computeReorderIdx(eff, fromIdx), fromIdx);
});

test('computeReorderIdx — simulated splice produces correct array', () => {
  // Behavior test: prove the formula actually puts the item where the
  // visual drop indicator suggested.
  const arr = ['a', 'b', 'c', 'd', 'e'];   // indices 0–4
  // Drag 'a' (idx 0) to "between 'd' and 'e'" — drop indicator at top of 'e' = toIdx 4.
  // Expected result: ['b', 'c', 'd', 'a', 'e']  — 'a' lands just before 'e'.
  const fromIdx = 0;
  const toIdx   = 4;
  const eff     = computeReorderIdx(fromIdx, toIdx);
  const [moved] = arr.splice(fromIdx, 1);
  arr.splice(eff, 0, moved);
  assert.deepEqual(arr, ['b', 'c', 'd', 'a', 'e']);
});

test('computeReorderIdx — simulated upward splice', () => {
  // Drag 'e' (idx 4) to "above 'b'" — drop indicator at top of 'b' = toIdx 1.
  // Expected: ['a', 'e', 'b', 'c', 'd']
  const arr = ['a', 'b', 'c', 'd', 'e'];
  const fromIdx = 4;
  const toIdx   = 1;
  const eff     = computeReorderIdx(fromIdx, toIdx);
  const [moved] = arr.splice(fromIdx, 1);
  arr.splice(eff, 0, moved);
  assert.deepEqual(arr, ['a', 'e', 'b', 'c', 'd']);
});

// ─── allPatchesIdentical ────────────────────────────────────────────────────
//
// Drives the v0.7.2 WAV-type auto-route. Pins the truth table so we don't
// accidentally start mis-detecting (false-positive routes a Tones import
// to Sequences and the user wonders where their import went).

// Tiny patch factory — 32-key shape doesn't matter for fingerprint equality
// (paramsFingerprint sorts keys + JSON-encodes), so any unique-per-call
// param object suffices.
function makePatch(seed) {
  return { dco1_range: seed, vcf_cutoff: 128, env_attack: 64 };
}
function fillBank(patch) {
  return Array.from({ length: 16 }, () => patch);
}

test('allPatchesIdentical — true when all 32 patches share the same params', () => {
  const same = makePatch(8);
  const banks = [fillBank(same), fillBank(same)];
  assert.equal(allPatchesIdentical(banks), true);
});

test('allPatchesIdentical — true even when reference is different but params match', () => {
  // Sequence-WAV-misroute case: jx3p produces 32 distinct objects whose
  // fields happen to be identical. Fingerprint-based equality (sorted-
  // key JSON) should hit, even though the JS references differ.
  const banks = [
    Array.from({ length: 16 }, () => makePatch(8)),
    Array.from({ length: 16 }, () => makePatch(8)),
  ];
  assert.notStrictEqual(banks[0][0], banks[0][1], 'sanity: separate refs');
  assert.equal(allPatchesIdentical(banks), true);
});

test('allPatchesIdentical — false when even one patch differs', () => {
  const banks = [fillBank(makePatch(8)), fillBank(makePatch(8))];
  banks[1][7] = makePatch(99);   // one patch differs
  assert.equal(allPatchesIdentical(banks), false);
});

test('allPatchesIdentical — false on non-array input', () => {
  assert.equal(allPatchesIdentical(null),       false);
  assert.equal(allPatchesIdentical(undefined),  false);
  assert.equal(allPatchesIdentical({}),         false);
  assert.equal(allPatchesIdentical('banks'),    false);
  assert.equal(allPatchesIdentical(42),         false);
});

test('allPatchesIdentical — false when banks array < 2 entries', () => {
  assert.equal(allPatchesIdentical([]),                       false);
  assert.equal(allPatchesIdentical([fillBank(makePatch(8))]), false);
});

test('allPatchesIdentical — false when an inner element is not an array', () => {
  assert.equal(allPatchesIdentical([fillBank(makePatch(8)), 'not-a-bank']), false);
});

test('allPatchesIdentical — false when total patches < 32', () => {
  // jx3p shape is always 16-per-bank, but defend against a malformed
  // payload that happens to pass the outer shape check.
  const short = Array.from({ length: 10 }, () => makePatch(8));
  assert.equal(allPatchesIdentical([short, short]), false);
});

test('allPatchesIdentical — false when first patch has no fingerprint (empty/null params)', () => {
  // paramsFingerprint returns null for empty objects; allPatchesIdentical
  // should treat that as "can't determine identity" → false.
  const banks = [
    Array.from({ length: 16 }, () => ({})),
    Array.from({ length: 16 }, () => ({})),
  ];
  assert.equal(allPatchesIdentical(banks), false);
});

test('allPatchesIdentical — fingerprint is order-insensitive (key order varies)', () => {
  // Same params, different property insertion order. The misroute-detection
  // shouldn't care about the JSON serialization order of jx3p's output.
  const banks = [
    fillBank({ dco1_range: 8, vcf_cutoff: 128, env_attack: 64 }),
    fillBank({ env_attack: 64, dco1_range: 8, vcf_cutoff: 128 }),
  ];
  assert.equal(allPatchesIdentical(banks), true);
});
