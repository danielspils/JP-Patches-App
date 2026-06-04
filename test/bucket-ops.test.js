'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// bucket-ops.test.js — comprehensive coverage for the Create Custom Banks
// (CCB) data layer.
//
// CCB previously had ZERO test coverage — every mutation lived in app.js
// tangled with DOM + IPC, so a regression in (say) cross-bank swap or the
// SAVE empty-slot fill could ship without a single failing test. This file
// exercises every pure transform that the builder relies on:
//   - place / reorder / swap-cross-bank / clear / rename
//   - bulk (range) place via repeated placeBucketEntry calls
//   - SAVE-time silent-default fill + slot-meta build
//   - round-trip identity (place → reorder → swap → save preserves params)
//
// Plus a regression test for v0.7.4's empty-fill change (was: inherit from
// active bank; now: silent default — WYSIWYG).
//
// Run with:    node --test test/bucket-ops.test.js
// Or all:      npm test
// ═══════════════════════════════════════════════════════════════════════════

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  silentDefaultPatch,
  isSilentDefaultPatch,
  placeBucketEntry,
  swapBucketEntries,
  clearBucketEntry,
  setBucketEntryName,
  buildSavedBuckets,
  buildSavedBucketSlotMeta,
  decodeBucketDropAction,
} = require('../renderer/bucket-ops.js');

// ── Test fixtures ──────────────────────────────────────────────────────────

// Fresh, empty buckets state. Use this in every test that mutates so tests
// don't bleed into each other. Mirrors the shape ensureCustomBucketsShape()
// produces in app.js.
function freshBuckets() {
  return {
    active: false,
    C: new Array(16).fill(null),
    D: new Array(16).fill(null),
  };
}

// A representative filled entry — params + custom name + origin + source.
// "Bass 1" came from C8 of the "Spils Sounds" library. Used everywhere a
// realistic entry is needed. Each call returns a fresh deep copy so tests
// can mutate without polluting siblings.
function sampleEntry(overrides = {}) {
  return {
    params: {
      ...silentDefaultPatch(),
      dco1_waveform: 'pulse',
      vcf_cutoff: 60,
      vca_level: 100,
    },
    name:        'Bass 1',
    origin:      'C8',
    sourceLabel: 'Spils Sounds',
    ...overrides,
  };
}

// A second distinguishable entry — different params + name. Used when
// tests need TWO non-identical entries to verify swap / overwrite paths.
function leadEntry(overrides = {}) {
  return {
    params: {
      ...silentDefaultPatch(),
      dco2_waveform: 'square',
      vcf_resonance: 80,
      vca_level: 120,
    },
    name:        'Lead 1',
    origin:      'D4',
    sourceLabel: 'Factory',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// silentDefaultPatch
// ═══════════════════════════════════════════════════════════════════════════

test('silentDefaultPatch — returns a 33-key patch object', () => {
  // 33 keys = the JX-3P canonical schema (32 documented params + the
  // "mystery" byte we preserve verbatim through round-trips).
  const p = silentDefaultPatch();
  assert.equal(typeof p, 'object');
  assert.equal(Object.keys(p).length, 33);
});

test('silentDefaultPatch — vca_level is 0 (the "silent" bit)', () => {
  assert.equal(silentDefaultPatch().vca_level, 0);
});

test('silentDefaultPatch — returns a fresh object each call (no shared mutable state)', () => {
  const a = silentDefaultPatch();
  const b = silentDefaultPatch();
  assert.notStrictEqual(a, b);
  // Mutating one must not affect the other.
  a.vca_level = 200;
  assert.equal(b.vca_level, 0);
});

test('silentDefaultPatch — has all the JX-3P canonical param keys', () => {
  const expected = [
    'dco1_range', 'dco1_waveform', 'dco1_fmod_lfo', 'dco1_fmod_env',
    'dco2_range', 'dco2_waveform', 'dco2_crossmod', 'dco2_tune',
    'dco2_fine_tune', 'dco2_fmod_lfo', 'dco2_fmod_env',
    'dco_lfo_amount', 'dco_env_amount', 'dco_env_polarity',
    'vcf_mix', 'vcf_hpf', 'vcf_cutoff', 'vcf_lfo_mod', 'vcf_pitch_follow',
    'vcf_resonance', 'vcf_env_mod', 'vcf_env_polarity',
    'vca_mode', 'vca_level', 'chorus',
    'lfo_waveform', 'lfo_delay', 'lfo_rate',
    'env_attack', 'env_decay', 'env_sustain', 'env_release',
    'mystery',
  ];
  const got = Object.keys(silentDefaultPatch()).sort();
  assert.deepEqual(got, expected.slice().sort());
});

// ═══════════════════════════════════════════════════════════════════════════
// isSilentDefaultPatch — "is this a blank filler?" detection
// ═══════════════════════════════════════════════════════════════════════════

test('isSilentDefaultPatch — a fresh silentDefaultPatch reads as blank', () => {
  assert.equal(isSilentDefaultPatch(silentDefaultPatch()), true);
});

test('isSilentDefaultPatch — a real patch (vca_level > 0) is NOT blank', () => {
  assert.equal(isSilentDefaultPatch(sampleEntry().params), false);
});

test('isSilentDefaultPatch — strict: silent vca but non-default oscillator is NOT blank', () => {
  // A sound-design WIP muted to vca_level 0 but with a tweaked waveform
  // must NOT be mislabeled "blank" — only the exact filler matches.
  const wip = { ...silentDefaultPatch(), dco1_waveform: 'pulse' };
  assert.equal(isSilentDefaultPatch(wip), false);
});

test('isSilentDefaultPatch — extra or missing keys → not blank', () => {
  const extra = { ...silentDefaultPatch(), bonus: 1 };
  assert.equal(isSilentDefaultPatch(extra), false);
  const missing = { ...silentDefaultPatch() };
  delete missing.mystery;
  assert.equal(isSilentDefaultPatch(missing), false);
});

test('isSilentDefaultPatch — null / non-object → false', () => {
  assert.equal(isSilentDefaultPatch(null), false);
  assert.equal(isSilentDefaultPatch(undefined), false);
  assert.equal(isSilentDefaultPatch('x'), false);
  assert.equal(isSilentDefaultPatch(42), false);
});

test('isSilentDefaultPatch — the params buildSavedBuckets writes for empties read as blank', () => {
  // End-to-end: an empty bucket → buildSavedBuckets fills it silent →
  // that exact params object must read as blank (this is what the display
  // layer relies on to show "blank").
  const b = freshBuckets();
  const [bankC] = buildSavedBuckets(b);
  assert.equal(isSilentDefaultPatch(bankC[0]), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// placeBucketEntry
// ═══════════════════════════════════════════════════════════════════════════

test('placeBucketEntry — fills empty slot, returns null (no prior entry)', () => {
  const b = freshBuckets();
  const e = sampleEntry();
  const prev = placeBucketEntry(b, 'C', 5, e);
  assert.equal(prev, null);
  assert.strictEqual(b.C[5], e);
});

test('placeBucketEntry — overwrites filled slot, returns the previous entry', () => {
  const b = freshBuckets();
  const e1 = sampleEntry();
  const e2 = leadEntry();
  placeBucketEntry(b, 'C', 5, e1);
  const prev = placeBucketEntry(b, 'C', 5, e2);
  assert.strictEqual(prev, e1);
  assert.strictEqual(b.C[5], e2);
});

test('placeBucketEntry — null clears the slot, returns previous entry', () => {
  const b = freshBuckets();
  const e = sampleEntry();
  placeBucketEntry(b, 'C', 5, e);
  const prev = placeBucketEntry(b, 'C', 5, null);
  assert.strictEqual(prev, e);
  assert.equal(b.C[5], null);
});

test('placeBucketEntry — works on both C and D banks', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 0, sampleEntry());
  placeBucketEntry(b, 'D', 0, leadEntry());
  assert.equal(b.C[0].name, 'Bass 1');
  assert.equal(b.D[0].name, 'Lead 1');
});

test('placeBucketEntry — other slots untouched', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry());
  for (let i = 0; i < 16; i++) {
    if (i === 5) continue;
    assert.equal(b.C[i], null, `C[${i}] should still be null`);
    assert.equal(b.D[i], null, `D[${i}] should still be null`);
  }
});

test('placeBucketEntry — invalid bank returns null + no mutation', () => {
  const b = freshBuckets();
  const before = JSON.stringify(b);
  assert.equal(placeBucketEntry(b, 'X', 5, sampleEntry()), null);
  assert.equal(JSON.stringify(b), before);
});

test('placeBucketEntry — idx -1 / 16 / 1.5 returns null + no mutation', () => {
  const b = freshBuckets();
  const before = JSON.stringify(b);
  assert.equal(placeBucketEntry(b, 'C', -1,  sampleEntry()), null);
  assert.equal(placeBucketEntry(b, 'C',  16, sampleEntry()), null);
  assert.equal(placeBucketEntry(b, 'C', 1.5, sampleEntry()), null);
  assert.equal(placeBucketEntry(b, 'C', NaN, sampleEntry()), null);
  assert.equal(JSON.stringify(b), before);
});

test('placeBucketEntry — null buckets returns null safely', () => {
  assert.equal(placeBucketEntry(null,      'C', 5, sampleEntry()), null);
  assert.equal(placeBucketEntry(undefined, 'C', 5, sampleEntry()), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// swapBucketEntries — the unified swap model (v0.7.4)
//
// Replaces the old insert-reorder. Dragging slot A onto slot B trades their
// contents and NOTHING else moves. Works within a bank (C→C) or across
// banks (C↔D). This killed the "strange shift that creates another empty
// slot" — on a sparse bucket, insert-reorder used to slide the empties
// around; swap touches exactly two slots.
// ═══════════════════════════════════════════════════════════════════════════

// ── within-bank swaps ──

test('swapBucketEntries — within-bank C10 ↔ C9 trades the two (the user-reported case)', () => {
  // C9 = index 8, C10 = index 9. Dragging C10 onto C9 should put C10's
  // patch in C9 and C9's patch in C10. Nothing else moves.
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 8, sampleEntry({ name: 'C9-patch' }));
  placeBucketEntry(b, 'C', 9, sampleEntry({ name: 'C10-patch' }));
  const ok = swapBucketEntries(b, 'C', 9, 'C', 8); // drag C10(idx9) onto C9(idx8)
  assert.equal(ok, true);
  assert.equal(b.C[8].name, 'C10-patch'); // C9 now shows C10's patch ✓
  assert.equal(b.C[9].name, 'C9-patch');  // C10 holds C9's old patch
});

test('swapBucketEntries — within-bank filled → empty is a clean move, no cascade', () => {
  // The sparse-bucket case that motivated the change. C15 (filled) dragged
  // onto C9 (empty): C9 gets C15s patch, C15 becomes empty. The slots in
  // between (C10-C14) DO NOT MOVE — that was the old insert-reorder bug.
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 0, sampleEntry({ name: 'C1' }));   // anchor
  placeBucketEntry(b, 'C', 14, sampleEntry({ name: 'C15-patch' }));
  const ok = swapBucketEntries(b, 'C', 14, 'C', 8); // C15(idx14) → C9(idx8)
  assert.equal(ok, true);
  assert.equal(b.C[8].name, 'C15-patch'); // landed at C9
  assert.equal(b.C[14], null);            // C15 vacated
  assert.equal(b.C[0].name, 'C1');        // anchor untouched
  // The gap between (C10-C14, idx 9-13) stayed empty — no shuffle.
  for (const idx of [9, 10, 11, 12, 13]) assert.equal(b.C[idx], null);
});

test('swapBucketEntries — within-bank same index is a no-op (dropped on self)', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry());
  const before = JSON.stringify(b);
  assert.equal(swapBucketEntries(b, 'C', 5, 'C', 5), false);
  assert.equal(JSON.stringify(b), before);
});

test('swapBucketEntries — within-bank both-empty is a no-op', () => {
  const b = freshBuckets();
  const before = JSON.stringify(b);
  assert.equal(swapBucketEntries(b, 'C', 4, 'C', 9), false);
  assert.equal(JSON.stringify(b), before);
});

test('swapBucketEntries — within-bank D bank untouched when swapping in C', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 0, sampleEntry({ name: 'C0' }));
  placeBucketEntry(b, 'C', 8, sampleEntry({ name: 'C8' }));
  placeBucketEntry(b, 'D', 5, leadEntry({ name: 'Dthing' }));
  swapBucketEntries(b, 'C', 0, 'C', 8);
  assert.equal(b.D[5].name, 'Dthing');
  for (let i = 0; i < 16; i++) { if (i === 5) continue; assert.equal(b.D[i], null); }
});

// ── cross-bank swaps ──

test('swapBucketEntries — cross-bank filled C5 ↔ filled D3 trades all fields', () => {
  const b = freshBuckets();
  const eC = sampleEntry();
  const eD = leadEntry();
  placeBucketEntry(b, 'C', 5, eC);
  placeBucketEntry(b, 'D', 3, eD);
  const ok = swapBucketEntries(b, 'C', 5, 'D', 3);
  assert.equal(ok, true);
  assert.strictEqual(b.C[5], eD);   // by-reference trade — same object
  assert.strictEqual(b.D[3], eC);
});

test('swapBucketEntries — cross-bank filled C5 → empty D3 is a clean move', () => {
  const b = freshBuckets();
  const eC = sampleEntry();
  placeBucketEntry(b, 'C', 5, eC);
  const ok = swapBucketEntries(b, 'C', 5, 'D', 3);
  assert.equal(ok, true);
  assert.equal(b.C[5], null);
  assert.strictEqual(b.D[3], eC);
});

test('swapBucketEntries — cross-bank empty C5 → filled D3 is a reverse-clean move', () => {
  const b = freshBuckets();
  const eD = leadEntry();
  placeBucketEntry(b, 'D', 3, eD);
  const ok = swapBucketEntries(b, 'C', 5, 'D', 3);
  assert.equal(ok, true);
  assert.strictEqual(b.C[5], eD);
  assert.equal(b.D[3], null);
});

test('swapBucketEntries — cross-bank empty ↔ empty returns false, no mutation', () => {
  const b = freshBuckets();
  const before = JSON.stringify(b);
  assert.equal(swapBucketEntries(b, 'C', 5, 'D', 3), false);
  assert.equal(JSON.stringify(b), before);
});

// ── input validation ──

test('swapBucketEntries — invalid bank returns false', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry());
  const before = JSON.stringify(b);
  assert.equal(swapBucketEntries(b, 'X', 5, 'D', 3), false);
  assert.equal(swapBucketEntries(b, 'C', 5, 'X', 3), false);
  assert.equal(JSON.stringify(b), before);
});

test('swapBucketEntries — invalid idx returns false', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry());
  const before = JSON.stringify(b);
  assert.equal(swapBucketEntries(b, 'C', -1, 'D',  3), false);
  assert.equal(swapBucketEntries(b, 'C', 16, 'D',  3), false);
  assert.equal(swapBucketEntries(b, 'C',  5, 'D', -1), false);
  assert.equal(swapBucketEntries(b, 'C',  5, 'D', 16), false);
  assert.equal(JSON.stringify(b), before);
});

test('swapBucketEntries — null buckets returns false safely', () => {
  assert.equal(swapBucketEntries(null, 'C', 5, 'D', 3), false);
});

test('swapBucketEntries — other slots in both banks untouched (cross-bank)', () => {
  const b = freshBuckets();
  // Fill some context: C0, C5, C10 and D2, D3, D8.
  placeBucketEntry(b, 'C',  0, sampleEntry({ name: 'C0' }));
  placeBucketEntry(b, 'C',  5, sampleEntry({ name: 'C5' }));
  placeBucketEntry(b, 'C', 10, sampleEntry({ name: 'C10' }));
  placeBucketEntry(b, 'D',  2, leadEntry({ name: 'D2' }));
  placeBucketEntry(b, 'D',  3, leadEntry({ name: 'D3' }));
  placeBucketEntry(b, 'D',  8, leadEntry({ name: 'D8' }));
  swapBucketEntries(b, 'C', 5, 'D', 3);
  assert.equal(b.C[0].name, 'C0');
  assert.equal(b.C[10].name, 'C10');
  assert.equal(b.D[2].name, 'D2');
  assert.equal(b.D[8].name, 'D8');
  // The swap pair landed correctly:
  assert.equal(b.C[5].name, 'D3');
  assert.equal(b.D[3].name, 'C5');
});

test('swapBucketEntries — swap is its own inverse (undo correctness)', () => {
  // The undo path swaps back. Verify A→B then B→A restores the original.
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ name: 'C5' }));
  placeBucketEntry(b, 'D', 3, leadEntry({ name: 'D3' }));
  const snapshot = JSON.stringify(b);
  swapBucketEntries(b, 'C', 5, 'D', 3);      // do
  swapBucketEntries(b, 'D', 3, 'C', 5);      // undo (reverse args)
  assert.equal(JSON.stringify(b), snapshot);
});

// ═══════════════════════════════════════════════════════════════════════════
// clearBucketEntry
// ═══════════════════════════════════════════════════════════════════════════

test('clearBucketEntry — filled slot becomes null, returns the entry', () => {
  const b = freshBuckets();
  const e = sampleEntry();
  placeBucketEntry(b, 'C', 5, e);
  const removed = clearBucketEntry(b, 'C', 5);
  assert.strictEqual(removed, e);
  assert.equal(b.C[5], null);
});

test('clearBucketEntry — empty slot returns null, no mutation', () => {
  const b = freshBuckets();
  const before = JSON.stringify(b);
  assert.equal(clearBucketEntry(b, 'C', 5), null);
  assert.equal(JSON.stringify(b), before);
});

test('clearBucketEntry — invalid bank/idx returns null safely', () => {
  const b = freshBuckets();
  assert.equal(clearBucketEntry(b, 'X', 5),  null);
  assert.equal(clearBucketEntry(b, 'C', -1), null);
  assert.equal(clearBucketEntry(b, 'C', 16), null);
});

test('clearBucketEntry — D bank untouched when clearing C', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry());
  placeBucketEntry(b, 'D', 5, leadEntry({ name: 'Dthing' }));
  clearBucketEntry(b, 'C', 5);
  assert.equal(b.D[5].name, 'Dthing');
});

// ═══════════════════════════════════════════════════════════════════════════
// setBucketEntryName
// ═══════════════════════════════════════════════════════════════════════════

test('setBucketEntryName — assigns new name, returns previous name', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ name: 'Old' }));
  const prev = setBucketEntryName(b, 'C', 5, 'New');
  assert.equal(prev, 'Old');
  assert.equal(b.C[5].name, 'New');
});

test('setBucketEntryName — empty string clears the name (entry.name → null)', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ name: 'Old' }));
  setBucketEntryName(b, 'C', 5, '');
  assert.equal(b.C[5].name, null);
});

test('setBucketEntryName — null also clears', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ name: 'Old' }));
  setBucketEntryName(b, 'C', 5, null);
  assert.equal(b.C[5].name, null);
});

test('setBucketEntryName — empty slot returns null, no mutation', () => {
  const b = freshBuckets();
  const before = JSON.stringify(b);
  assert.equal(setBucketEntryName(b, 'C', 5, 'New'), null);
  assert.equal(JSON.stringify(b), before);
});

test('setBucketEntryName — params / origin / sourceLabel untouched', () => {
  const b = freshBuckets();
  const original = sampleEntry();
  const snapshotParams = JSON.parse(JSON.stringify(original.params));
  placeBucketEntry(b, 'C', 5, original);
  setBucketEntryName(b, 'C', 5, 'Renamed');
  assert.deepEqual(b.C[5].params, snapshotParams);
  assert.equal(b.C[5].origin, 'C8');
  assert.equal(b.C[5].sourceLabel, 'Spils Sounds');
});

// ═══════════════════════════════════════════════════════════════════════════
// buildSavedBuckets — SAVE-time patch fill
// ═══════════════════════════════════════════════════════════════════════════

test('buildSavedBuckets — all-empty buckets produce 32 silent patches', () => {
  const b = freshBuckets();
  const [bankC, bankD] = buildSavedBuckets(b);
  assert.equal(bankC.length, 16);
  assert.equal(bankD.length, 16);
  for (let i = 0; i < 16; i++) {
    assert.equal(bankC[i].vca_level, 0, `C[${i}].vca_level should be 0 (silent)`);
    assert.equal(bankD[i].vca_level, 0, `D[${i}].vca_level should be 0 (silent)`);
  }
});

test('buildSavedBuckets — filled slot returns the entry\'s params (deep copy)', () => {
  const b = freshBuckets();
  const e = sampleEntry();
  placeBucketEntry(b, 'C', 5, e);
  const [bankC] = buildSavedBuckets(b);
  assert.deepEqual(bankC[5], e.params);
  // Mutating the saved output must NOT bleed back into the bucket entry.
  bankC[5].vca_level = 999;
  assert.equal(b.C[5].params.vca_level, 100, 'bucket entry was mutated — deep copy is broken');
});

test('buildSavedBuckets — mixed buckets: filled at right slots, silent elsewhere', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C',  0, sampleEntry({ params: { ...silentDefaultPatch(), vca_level: 50 } }));
  placeBucketEntry(b, 'C', 15, sampleEntry({ params: { ...silentDefaultPatch(), vca_level: 75 } }));
  placeBucketEntry(b, 'D',  8, leadEntry({  params: { ...silentDefaultPatch(), vca_level: 99 } }));
  const [bankC, bankD] = buildSavedBuckets(b);
  assert.equal(bankC[0].vca_level,  50);
  assert.equal(bankC[15].vca_level, 75);
  assert.equal(bankD[8].vca_level,  99);
  // Spot-check a few middle empties are silent.
  assert.equal(bankC[5].vca_level, 0);
  assert.equal(bankD[0].vca_level, 0);
});

test('buildSavedBuckets — REGRESSION: empty slots do NOT inherit from active C/D banks', () => {
  // Pre-v0.7.4 behavior: empty bucket slots were filled with patches from
  // the active C/D banks at the same position. v0.7.4 flipped this — empty
  // in builder = silent in saved bank, period. This test guards the new
  // behavior so a future "convenience" patch can't silently re-introduce
  // inheritance without flipping this assertion.
  const b = freshBuckets();
  // Only the function arguments matter — it doesn't read any active-bank
  // state. Even passing one wouldn't change the output.
  const [bankC] = buildSavedBuckets(b);
  for (let i = 0; i < 16; i++) {
    assert.equal(bankC[i].vca_level, 0,
      `regression: C[${i}] should be silent (inheritance was removed in v0.7.4)`);
  }
});

test('buildSavedBuckets — handles null buckets without throwing', () => {
  const [bankC, bankD] = buildSavedBuckets(null);
  assert.equal(bankC.length, 16);
  assert.equal(bankD.length, 16);
  assert.equal(bankC[0].vca_level, 0);
});

test('buildSavedBuckets — handles entry with missing params field (returns silent for that slot)', () => {
  const b = freshBuckets();
  b.C[5] = { name: 'Broken', origin: 'C5', sourceLabel: null }; // no params
  const [bankC] = buildSavedBuckets(b);
  assert.equal(bankC[5].vca_level, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// buildSavedBucketSlotMeta — SAVE-time metadata fill
// ═══════════════════════════════════════════════════════════════════════════

test('buildSavedBucketSlotMeta — filled slot copies name/origin/sourceLabel from entry', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry());
  const m = buildSavedBucketSlotMeta(b);
  assert.equal(m.C[5].name,        'Bass 1');
  assert.equal(m.C[5].origin,      'C8');
  assert.equal(m.C[5].sourceLabel, 'Spils Sounds');
});

test('buildSavedBucketSlotMeta — empty slot returns null name + slot-label origin + null source', () => {
  const m = buildSavedBucketSlotMeta(freshBuckets());
  for (let i = 0; i < 16; i++) {
    assert.deepEqual(m.C[i], { name: null, origin: `C${i + 1}`, sourceLabel: null });
    assert.deepEqual(m.D[i], { name: null, origin: `D${i + 1}`, sourceLabel: null });
  }
});

test('buildSavedBucketSlotMeta — missing entry.name → null', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ name: undefined }));
  const m = buildSavedBucketSlotMeta(b);
  assert.equal(m.C[5].name, null);
});

test('buildSavedBucketSlotMeta — missing entry.origin → defaults to slot label', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ origin: undefined }));
  const m = buildSavedBucketSlotMeta(b);
  assert.equal(m.C[5].origin, 'C6'); // 0-indexed slot 5 → JX slot C6
});

test('buildSavedBucketSlotMeta — missing entry.sourceLabel → null', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ sourceLabel: undefined }));
  const m = buildSavedBucketSlotMeta(b);
  assert.equal(m.C[5].sourceLabel, null);
});

test('buildSavedBucketSlotMeta — returns {C: 16, D: 16}', () => {
  const m = buildSavedBucketSlotMeta(freshBuckets());
  assert.equal(m.C.length, 16);
  assert.equal(m.D.length, 16);
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration: realistic CCB flows end-to-end
// ═══════════════════════════════════════════════════════════════════════════

test('integration — bulk place (range drag): 5 patches land at consecutive slots, params preserved', () => {
  // Simulates the user shift-selecting library rows P0-P4 and dropping
  // them at C0. The range-drop handler in app.js loops placeBucketEntry,
  // so this exercises the bulk path's data correctness.
  const b = freshBuckets();
  const rangePatches = [];
  for (let i = 0; i < 5; i++) {
    rangePatches.push(sampleEntry({
      name: `Range${i}`,
      params: { ...silentDefaultPatch(), vca_level: 10 + i },
    }));
  }
  rangePatches.forEach((e, i) => placeBucketEntry(b, 'C', i, e));

  // Each slot has its corresponding patch — NOT shifted, NOT duplicated.
  for (let i = 0; i < 5; i++) {
    assert.equal(b.C[i].name, `Range${i}`);
    assert.equal(b.C[i].params.vca_level, 10 + i);
  }
  // Remaining slots untouched.
  for (let i = 5; i < 16; i++) {
    assert.equal(b.C[i], null);
  }
});

test('integration — round-trip place→swap→save preserves params exactly', () => {
  const b = freshBuckets();
  const original = sampleEntry({ params: { ...silentDefaultPatch(), vcf_cutoff: 77 } });
  const snapshotParams = JSON.parse(JSON.stringify(original.params));
  placeBucketEntry(b, 'C', 0, original);
  swapBucketEntries(b, 'C', 0, 'C', 7); // swap C0 (filled) with C7 (empty) → lands at C[7]
  const [bankC] = buildSavedBuckets(b);
  // The saved bank's slot 7 must match the original's params exactly.
  assert.deepEqual(bankC[7], snapshotParams);
  // And the slot it left from is now empty → silent in the saved bank.
  assert.equal(bankC[0].vca_level, 0);
});

test('integration — round-trip place→swap-cross-bank→save preserves params on both sides', () => {
  const b = freshBuckets();
  const eC = sampleEntry({ params: { ...silentDefaultPatch(), vcf_cutoff: 60 }, name: 'BassA' });
  const eD = leadEntry  ({ params: { ...silentDefaultPatch(), vcf_resonance: 90 }, name: 'LeadB' });
  placeBucketEntry(b, 'C', 5, eC);
  placeBucketEntry(b, 'D', 3, eD);
  swapBucketEntries(b, 'C', 5, 'D', 3);
  const [bankC, bankD] = buildSavedBuckets(b);
  // The patch that started at C5 now lives at D3 (params + meta).
  assert.equal(bankD[3].vcf_cutoff, 60);
  // And vice versa.
  assert.equal(bankC[5].vcf_resonance, 90);
  // Metadata too.
  const m = buildSavedBucketSlotMeta(b);
  assert.equal(m.D[3].name, 'BassA');
  assert.equal(m.C[5].name, 'LeadB');
});

test('integration — rename after place preserves params; save reflects new name', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ name: 'OldName' }));
  setBucketEntryName(b, 'C', 5, 'NewName');
  const m = buildSavedBucketSlotMeta(b);
  assert.equal(m.C[5].name, 'NewName');
  // Origin + source still inherited from the entry, unchanged by rename.
  assert.equal(m.C[5].origin,      'C8');
  assert.equal(m.C[5].sourceLabel, 'Spils Sounds');
});

test('integration — clear then re-place at same slot: new entry takes hold', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ name: 'First' }));
  clearBucketEntry(b, 'C', 5);
  placeBucketEntry(b, 'C', 5, leadEntry({ name: 'Second' }));
  assert.equal(b.C[5].name, 'Second');
});

// ═══════════════════════════════════════════════════════════════════════════
// decodeBucketDropAction — drag-payload → mutation-call dispatch contract
//
// This is the layer where the cross-bank-reject bug lived (a single
// `if (src.bank === bank)` check that silently dropped C→D moves). As of
// v0.7.4 every bucket drag is a swap, so within-bank and cross-bank both
// decode to a single 'bucket-swap' action — no branch left to drop on.
// The decoder is pure + tested, so any drift in the drag MIME payload
// shape OR the dispatch logic surfaces here first.
// ═══════════════════════════════════════════════════════════════════════════

test('decodeBucketDropAction — within-bank bucket-source → bucket-swap action', () => {
  const action = decodeBucketDropAction(
    { bucketJson: JSON.stringify({ bank: 'C', idx: 5 }) },
    { bank: 'C', idx: 2 },
  );
  assert.deepEqual(action, {
    kind: 'bucket-swap', srcBank: 'C', srcIdx: 5, dstBank: 'C', dstIdx: 2,
  });
});

test('decodeBucketDropAction — cross-bank bucket-source → bucket-swap action', () => {
  // REGRESSION GUARD: the pre-v0.7.4 wireup had `if (src.bank === bank)`
  // around the reorder branch, with no else — cross-bank drops silently
  // returned without firing any mutation. Now both within + cross decode
  // to bucket-swap, so there's no silent-drop branch to regress into.
  const action = decodeBucketDropAction(
    { bucketJson: JSON.stringify({ bank: 'C', idx: 5 }) },
    { bank: 'D', idx: 3 },
  );
  assert.deepEqual(action, {
    kind: 'bucket-swap', srcBank: 'C', srcIdx: 5, dstBank: 'D', dstIdx: 3,
  });
});

test('decodeBucketDropAction — range payload that fits → range-place action', () => {
  // P3-P7 (5 patches) dropped at slot 0 → fits cleanly.
  const action = decodeBucketDropAction(
    { rangeJson: JSON.stringify({ bank: 'C', start: 3, end: 7 }) },
    { bank: 'D', idx: 0 },
  );
  assert.deepEqual(action, {
    kind: 'range-place', srcBank: 'C', srcStart: 3, dstBank: 'D', dstStartIdx: 0, rangeSize: 5,
  });
});

test('decodeBucketDropAction — range payload that overflows → range-too-big (no partial drop)', () => {
  // 5-patch range starting at slot 14 needs slots 14-18, but max is 15.
  // Partial drops aren't allowed — caller should bail.
  const action = decodeBucketDropAction(
    { rangeJson: JSON.stringify({ bank: 'C', start: 0, end: 4 }) },
    { bank: 'D', idx: 14 },
  );
  assert.deepEqual(action, { kind: 'range-too-big', rangeSize: 5, available: 2 });
});

test('decodeBucketDropAction — range that exactly fills available slots → range-place', () => {
  // Boundary: 2-patch range at slot 14 needs slots 14-15. Just fits.
  const action = decodeBucketDropAction(
    { rangeJson: JSON.stringify({ bank: 'C', start: 0, end: 1 }) },
    { bank: 'D', idx: 14 },
  );
  assert.equal(action.kind, 'range-place');
  assert.equal(action.rangeSize, 2);
});

test('decodeBucketDropAction — patch-source → patch-place action', () => {
  const action = decodeBucketDropAction(
    { patchJson: JSON.stringify({ bank: 'C', slot: 7 }) },
    { bank: 'D', idx: 4 },
  );
  assert.deepEqual(action, {
    kind: 'patch-place', srcBank: 'C', srcSlot: 7, dstBank: 'D', dstIdx: 4,
  });
});

test('decodeBucketDropAction — bucket payload wins over range + patch payloads', () => {
  // Precedence guard: if multiple MIMEs are set (shouldn't happen in
  // practice but might if a third-party tries to drop combined data),
  // bucket-source takes priority. Matches the pre-extraction order.
  const action = decodeBucketDropAction(
    {
      bucketJson: JSON.stringify({ bank: 'C', idx: 5 }),
      rangeJson:  JSON.stringify({ bank: 'C', start: 0, end: 3 }),
      patchJson:  JSON.stringify({ bank: 'C', slot: 0 }),
    },
    { bank: 'D', idx: 0 },
  );
  assert.equal(action.kind, 'bucket-swap');
});

test('decodeBucketDropAction — malformed JSON → invalid', () => {
  const action = decodeBucketDropAction(
    { bucketJson: 'not valid json' },
    { bank: 'D', idx: 0 },
  );
  assert.equal(action.kind, 'invalid');
});

test('decodeBucketDropAction — no payloads → none', () => {
  const action = decodeBucketDropAction({}, { bank: 'D', idx: 0 });
  assert.equal(action.kind, 'none');
});

test('decodeBucketDropAction — null payloads object → none', () => {
  const action = decodeBucketDropAction(null, { bank: 'D', idx: 0 });
  assert.equal(action.kind, 'none');
});

test('decodeBucketDropAction — null/non-object parsed payload → invalid', () => {
  // JSON.parse('null') is valid JSON but yields null — must not crash.
  assert.equal(
    decodeBucketDropAction({ bucketJson: 'null' }, { bank: 'D', idx: 0 }).kind,
    'invalid',
  );
  assert.equal(
    decodeBucketDropAction({ patchJson: '"a string"' }, { bank: 'D', idx: 0 }).kind,
    'invalid',
  );
});

// Integration: decode + execute → final state matches expectation. This is
// the closest we get to "test the actual production drop pipeline" without
// loading the full DOM + app.js.
test('integration — decode + execute: bucket-swap action mutates state correctly', () => {
  const b = freshBuckets();
  placeBucketEntry(b, 'C', 5, sampleEntry({ name: 'C5' }));
  placeBucketEntry(b, 'D', 3, leadEntry({  name: 'D3' }));
  const action = decodeBucketDropAction(
    { bucketJson: JSON.stringify({ bank: 'C', idx: 5 }) },
    { bank: 'D', idx: 3 },
  );
  assert.equal(action.kind, 'bucket-swap');
  swapBucketEntries(b, action.srcBank, action.srcIdx, action.dstBank, action.dstIdx);
  assert.equal(b.C[5].name, 'D3');
  assert.equal(b.D[3].name, 'C5');
});

test('integration — decode + execute: range-place action lays out patches in correct slots', () => {
  // This is the "bulk drag" path Daniel cares about. Verify the decoded
  // action's params + the loop that consumes them produce the right slots.
  const b = freshBuckets();
  const action = decodeBucketDropAction(
    { rangeJson: JSON.stringify({ bank: 'C', start: 2, end: 5 }) },
    { bank: 'D', idx: 8 },
  );
  assert.equal(action.kind, 'range-place');
  assert.equal(action.rangeSize, 4);
  // Caller loops: for k in 0..rangeSize → placeBucketEntry at dstStartIdx + k.
  for (let k = 0; k < action.rangeSize; k++) {
    placeBucketEntry(b, action.dstBank, action.dstStartIdx + k,
      sampleEntry({ name: `S${action.srcStart + k}` }));
  }
  // 4 patches at D8..D11, labeled S2..S5.
  assert.equal(b.D[8].name,  'S2');
  assert.equal(b.D[9].name,  'S3');
  assert.equal(b.D[10].name, 'S4');
  assert.equal(b.D[11].name, 'S5');
  // Other D slots untouched.
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15]) {
    assert.equal(b.D[i], null);
  }
});

test('integration — complex sequence: bulk place + within-bank swap + cross-bank swap', () => {
  // Mirrors a realistic user session. S_i has vca_level = 50 + i.
  const b = freshBuckets();
  // 1. Bulk place 4 patches into C0-C3 (S0=50, S1=51, S2=52, S3=53).
  for (let i = 0; i < 4; i++) {
    placeBucketEntry(b, 'C', i, sampleEntry({
      name: `S${i}`,
      params: { ...silentDefaultPatch(), vca_level: 50 + i },
    }));
  }
  // 2. Within-bank swap: drag C3 onto C0 → C0↔C3 trade (swap, not reorder).
  //    Result: C0=S3, C1=S1, C2=S2, C3=S0. Only C0 and C3 changed.
  swapBucketEntries(b, 'C', 3, 'C', 0);
  assert.equal(b.C[0].name, 'S3');
  assert.equal(b.C[1].name, 'S1'); // untouched (swap, not shift)
  assert.equal(b.C[2].name, 'S2'); // untouched
  assert.equal(b.C[3].name, 'S0'); // received C0's old patch
  // 3. Place a single patch into D5.
  placeBucketEntry(b, 'D', 5, leadEntry({
    name: 'DPick',
    params: { ...silentDefaultPatch(), vca_level: 88 },
  }));
  // 4. Cross-bank swap: C0 (now S3) ↔ D5 (DPick).
  swapBucketEntries(b, 'C', 0, 'D', 5);
  assert.equal(b.C[0].name, 'DPick');
  assert.equal(b.D[5].name, 'S3');
  // 5. SAVE — verify the saved package matches.
  const [bankC, bankD] = buildSavedBuckets(b);
  assert.equal(bankC[0].vca_level, 88); // DPick landed at C0
  assert.equal(bankD[5].vca_level, 53); // S3 landed at D5
  // C1=S1(51), C2=S2(52), C3=S0(50) — swap left the middle untouched.
  assert.equal(bankC[1].vca_level, 51);
  assert.equal(bankC[2].vca_level, 52);
  assert.equal(bankC[3].vca_level, 50);
  // Everything else silent.
  assert.equal(bankC[4].vca_level, 0);
  assert.equal(bankD[0].vca_level, 0);
});
