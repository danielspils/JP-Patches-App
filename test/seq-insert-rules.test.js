'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  STEPS_PER_PAGE,
  MAX_POLYPHONY,
  previousColumnAttackPitches,
  insertNoteIntoStep,
  insertRestIntoStep,
  insertTieIntoStep,
  computeInsertEligibility,
} = require('../renderer/seq-insert-rules.js');

// ── Small builders to keep the tests readable ──────────────────────
//
// A JX-3P step is `{voices: Array(7), byte7: number}` where each voice
// is either null or {note, tied}. Tests construct steps inline via
// these helpers so the JX vocabulary stays visible at every call site.

const emptyVoices = () => [null, null, null, null, null, null, null];
const emptyStep   = () => ({ voices: emptyVoices(), byte7: 127 });
const attack      = (note) => ({ note, tied: false });
const tied        = (note) => ({ note, tied: true });

// Build a page of 16 steps with one specific step pre-populated. Used
// by previousColumnAttackPitches tests to set up a "prev column" with
// known voice contents.
function pageWithStep(stepIdx, voices) {
  const page = [];
  for (let i = 0; i < STEPS_PER_PAGE; i++) {
    page.push(i === stepIdx
      ? { voices, byte7: 1 }
      : { voices: emptyVoices(), byte7: 127 });
  }
  return page;
}

// ═══════════════════════════════════════════════════════════════════
// previousColumnAttackPitches — pure lookup of new attacks in absStep-1
// ═══════════════════════════════════════════════════════════════════

test('previousColumnAttackPitches — absStep ≤ 0 returns []', () => {
  // No "previous column" exists before step 0.
  assert.deepEqual(previousColumnAttackPitches(0, [[]]), []);
  assert.deepEqual(previousColumnAttackPitches(-1, [[]]), []);
});

test('previousColumnAttackPitches — missing pages returns []', () => {
  // Defensive: codec or fresh-sequence edge cases may produce null/
  // undefined / non-array pages. Should not throw, should return [].
  assert.deepEqual(previousColumnAttackPitches(5, null), []);
  assert.deepEqual(previousColumnAttackPitches(5, undefined), []);
  assert.deepEqual(previousColumnAttackPitches(5, []), []);
});

test('previousColumnAttackPitches — prev step missing returns []', () => {
  // pages[0] exists but the specific step is null (sparse page after
  // on-demand init may have unwritten step indices in theory).
  const sparsePage = [null, null, null, null, null, null, null, null,
                      null, null, null, null, null, null, null, null];
  assert.deepEqual(previousColumnAttackPitches(5, [sparsePage]), []);
});

test('previousColumnAttackPitches — empty prev step returns []', () => {
  // All voices null → no attacks to reference.
  const pages = [pageWithStep(4, emptyVoices())];
  assert.deepEqual(previousColumnAttackPitches(5, pages), []);
});

test('previousColumnAttackPitches — only tied voices returns []', () => {
  // A REST or tied continuation in the prev step doesn't count as
  // an attack — REST/TIE want to chain off NEW attacks specifically.
  const pages = [pageWithStep(4, [tied(60), tied(64), null, null, null, null, null])];
  assert.deepEqual(previousColumnAttackPitches(5, pages), []);
});

test('previousColumnAttackPitches — returns new-attack pitches in slot order', () => {
  // Three-note chord in prev step. Slot order should be preserved so
  // REST/TIE writes back in the same slot order.
  const pages = [pageWithStep(4, [attack(60), attack(64), attack(67), null, null, null, null])];
  assert.deepEqual(previousColumnAttackPitches(5, pages), [60, 64, 67]);
});

test('previousColumnAttackPitches — mixed attacks + tied filters to attacks only', () => {
  // Canonical single-voice TIE step (tied + attack at same pitch).
  // previousColumnAttackPitches returns only the new attack.
  const pages = [pageWithStep(4, [tied(60), attack(60), null, null, null, null, null])];
  assert.deepEqual(previousColumnAttackPitches(5, pages), [60]);
});

test('previousColumnAttackPitches — crosses page boundary correctly', () => {
  // absStep = 16 means prev step is step 15 of page 0 (not step 0 of page 1).
  const pages = [
    pageWithStep(15, [attack(72), null, null, null, null, null, null]),
    pageWithStep(0,  [attack(48), null, null, null, null, null, null]),
  ];
  assert.deepEqual(previousColumnAttackPitches(16, pages), [72]);
});

// ═══════════════════════════════════════════════════════════════════
// insertNoteIntoStep — chord stacking + the JX-match rest/tie gate
// ═══════════════════════════════════════════════════════════════════

test('insertNoteIntoStep — empty step accepts note in slot 0, flips byte7', () => {
  const step = emptyStep();
  const ok = insertNoteIntoStep(step, 60);
  assert.equal(ok, true);
  assert.deepEqual(step.voices[0], attack(60));
  assert.equal(step.voices[1], null);
  // byte7 transitions 127 ("never written") → 1 (populated) per pitfall #16.
  assert.equal(step.byte7, 1);
});

test('insertNoteIntoStep — second note lands in slot 1 (chord stacking)', () => {
  const step = { voices: [attack(60), null, null, null, null, null, null], byte7: 1 };
  const ok = insertNoteIntoStep(step, 64);
  assert.equal(ok, true);
  assert.deepEqual(step.voices[0], attack(60));
  assert.deepEqual(step.voices[1], attack(64));
});

test('insertNoteIntoStep — fills first EMPTY slot, not first slot', () => {
  // Slot 0 occupied, slot 1 empty → new note goes to slot 1, not 0.
  const step = { voices: [attack(60), null, attack(67), null, null, null, null], byte7: 1 };
  insertNoteIntoStep(step, 64);
  assert.deepEqual(step.voices[1], attack(64));
  assert.deepEqual(step.voices[0], attack(60));   // unchanged
  assert.deepEqual(step.voices[2], attack(67));   // unchanged
});

test('insertNoteIntoStep — rejects when 6 voices already populated (polyphony cap)', () => {
  // JX-3P plays max 6 voices. Even with a 7th slot available, the editor
  // shouldn't write past 6.
  const step = {
    voices: [attack(60), attack(62), attack(64), attack(65), attack(67), attack(69), null],
    byte7: 1,
  };
  const ok = insertNoteIntoStep(step, 71);
  assert.equal(ok, false);
  assert.equal(step.voices[6], null);   // unchanged
});

test('insertNoteIntoStep — rejects when column has a tied voice (REST signature)', () => {
  // The JX-match rule: NOTE can't be added to a step that has a
  // rest/tie continuation. REST inserts a tied voice[0].
  const step = { voices: [tied(60), null, null, null, null, null, null], byte7: 1 };
  const ok = insertNoteIntoStep(step, 67);
  assert.equal(ok, false);
  assert.equal(step.voices[1], null);   // unchanged
});

test('insertNoteIntoStep — rejects when column has canonical TIE (tied + attack pair)', () => {
  // Canonical single-voice TIE leaves voice[0]={tied:true} + voice[1]=
  // {tied:false} at same pitch. The tied voice still trips the gate.
  const step = { voices: [tied(60), attack(60), null, null, null, null, null], byte7: 1 };
  const ok = insertNoteIntoStep(step, 67);
  assert.equal(ok, false);
  assert.equal(step.voices[2], null);   // unchanged
});

test('insertNoteIntoStep — rejects on malformed step (defensive)', () => {
  assert.equal(insertNoteIntoStep(null, 60), false);
  assert.equal(insertNoteIntoStep({}, 60), false);
  assert.equal(insertNoteIntoStep({ voices: null }, 60), false);
});

// ═══════════════════════════════════════════════════════════════════
// insertRestIntoStep — polyphonic continuation of every prev attack
// ═══════════════════════════════════════════════════════════════════

test('insertRestIntoStep — empty step + one prev pitch writes one tied voice', () => {
  const step = emptyStep();
  const ok = insertRestIntoStep(step, [60]);
  assert.equal(ok, true);
  assert.deepEqual(step.voices[0], tied(60));
  assert.equal(step.voices[1], null);
  assert.equal(step.byte7, 1);
});

test('insertRestIntoStep — empty step + 3-voice chord writes 3 tied voices', () => {
  // Polyphonic REST: ALL prev attacks get tied (pitfall #16 finding).
  const step = emptyStep();
  insertRestIntoStep(step, [60, 64, 67]);
  assert.deepEqual(step.voices[0], tied(60));
  assert.deepEqual(step.voices[1], tied(64));
  assert.deepEqual(step.voices[2], tied(67));
  assert.equal(step.voices[3], null);
});

test('insertRestIntoStep — empty step + 5-voice chord writes 5 tied voices', () => {
  // The empirically-verified case from Daniel's JX recording test.
  const step = emptyStep();
  insertRestIntoStep(step, [48, 55, 60, 64, 67]);
  for (let i = 0; i < 5; i++) {
    assert.equal(step.voices[i].tied, true);
    assert.equal(step.voices[i].note, [48, 55, 60, 64, 67][i]);
  }
  assert.equal(step.voices[5], null);
});

test('insertRestIntoStep — caps at 6 voices even if given more (defensive)', () => {
  // Prev column shouldn't exceed 6 — but if it did, the cap still holds.
  const step = emptyStep();
  insertRestIntoStep(step, [60, 62, 64, 65, 67, 69, 71]);
  assert.equal(step.voices.filter((v) => v != null).length, MAX_POLYPHONY);
  assert.equal(step.voices[6], null);   // 7th slot never populated
});

test('insertRestIntoStep — rejects empty step with empty prevPitches', () => {
  // Nothing to continue → no-op (UI should also disable the REST button).
  const step = emptyStep();
  const ok = insertRestIntoStep(step, []);
  assert.equal(ok, false);
  assert.equal(step.byte7, 127);   // byte7 stays at "never written"
});

test('insertRestIntoStep — rejects non-empty step (REST is whole-step on JX)', () => {
  // The JX itself can't record REST in a step that has notes.
  const step = { voices: [attack(60), null, null, null, null, null, null], byte7: 1 };
  const ok = insertRestIntoStep(step, [67]);
  assert.equal(ok, false);
  // Step unchanged.
  assert.deepEqual(step.voices[0], attack(60));
  assert.equal(step.voices[1], null);
});

// ═══════════════════════════════════════════════════════════════════
// insertTieIntoStep — canonical vs polyphonic-fallback branch
// ═══════════════════════════════════════════════════════════════════

test('insertTieIntoStep — N=1: canonical {tied, attack} pair in 2 slots', () => {
  // Single-voice TIE is the BLUE rendering case: voice[0] tied to prev
  // pitch, voice[1] new attack at same pitch.
  const step = emptyStep();
  const ok = insertTieIntoStep(step, [60]);
  assert.equal(ok, true);
  assert.deepEqual(step.voices[0], tied(60));
  assert.deepEqual(step.voices[1], attack(60));
  assert.equal(step.voices[2], null);
});

test('insertTieIntoStep — N=3: canonical fills 6 slots (3 tied+attack pairs)', () => {
  // The boundary case: 3 pitches × 2 voices = 6 = MAX_POLYPHONY.
  // Still canonical.
  const step = emptyStep();
  insertTieIntoStep(step, [60, 64, 67]);
  assert.deepEqual(step.voices[0], tied(60));
  assert.deepEqual(step.voices[1], attack(60));
  assert.deepEqual(step.voices[2], tied(64));
  assert.deepEqual(step.voices[3], attack(64));
  assert.deepEqual(step.voices[4], tied(67));
  assert.deepEqual(step.voices[5], attack(67));
  assert.equal(step.voices[6], null);
});

test('insertTieIntoStep — N=4: fallback to fresh-attacks-only (no tied voices)', () => {
  // 4 × 2 = 8 > 6 → fallback. Matches JX firmware's observed behavior
  // for polyphonic TIE (pitfall #16).
  const step = emptyStep();
  insertTieIntoStep(step, [60, 64, 67, 71]);
  assert.deepEqual(step.voices[0], attack(60));
  assert.deepEqual(step.voices[1], attack(64));
  assert.deepEqual(step.voices[2], attack(67));
  assert.deepEqual(step.voices[3], attack(71));
  assert.equal(step.voices[4], null);
  // Critical: no tied voices in fallback path — data is indistinguishable
  // from a chord re-strike at the wire level.
  assert.equal(step.voices.some((v) => v && v.tied === true), false);
});

test('insertTieIntoStep — N=5: fallback (5 fresh attacks)', () => {
  // The empirically-verified case (5-voice chord + TIE from Daniel's test).
  const step = emptyStep();
  insertTieIntoStep(step, [48, 55, 60, 64, 67]);
  for (let i = 0; i < 5; i++) {
    assert.equal(step.voices[i].tied, false);
    assert.equal(step.voices[i].note, [48, 55, 60, 64, 67][i]);
  }
  assert.equal(step.voices[5], null);
});

test('insertTieIntoStep — rejects non-empty step (TIE is whole-step on JX)', () => {
  const step = { voices: [attack(60), null, null, null, null, null, null], byte7: 1 };
  const ok = insertTieIntoStep(step, [67]);
  assert.equal(ok, false);
});

test('insertTieIntoStep — rejects empty prevPitches', () => {
  const step = emptyStep();
  assert.equal(insertTieIntoStep(step, []), false);
});

// ═══════════════════════════════════════════════════════════════════
// computeInsertEligibility — single source of truth for button-disable
// ═══════════════════════════════════════════════════════════════════

test('computeInsertEligibility — empty step + no prev attacks → only NOTE available', () => {
  // First step of the sequence, or a column with nothing before it.
  // REST and TIE both need a prev-column reference; NOTE doesn't.
  const elig = computeInsertEligibility(emptyVoices(), 0);
  assert.equal(elig.noteAvailable, true);
  assert.equal(elig.restAvailable, false);
  assert.equal(elig.tieAvailable,  false);
});

test('computeInsertEligibility — empty step + prev attacks → all three available', () => {
  const elig = computeInsertEligibility(emptyVoices(), 3);
  assert.equal(elig.noteAvailable, true);
  assert.equal(elig.restAvailable, true);
  assert.equal(elig.tieAvailable,  true);
});

test('computeInsertEligibility — chord step (notes, no tied) → NOTE allowed, REST/TIE blocked', () => {
  // Stacking notes onto a chord is fine (up to polyphony cap).
  // REST/TIE are whole-step events so they can't join a chord column.
  const voices = [attack(60), attack(64), null, null, null, null, null];
  const elig = computeInsertEligibility(voices, 2);
  assert.equal(elig.noteAvailable, true);
  assert.equal(elig.restAvailable, false);   // step not empty
  assert.equal(elig.tieAvailable,  false);   // step not empty
});

test('computeInsertEligibility — step has tied voice → all THREE blocked', () => {
  // The JX-match symmetric gate: NOTE also blocked when a tied voice
  // is present (can't mix attack with rest/tie continuation).
  const voices = [tied(60), null, null, null, null, null, null];
  const elig = computeInsertEligibility(voices, 1);
  assert.equal(elig.noteAvailable, false);
  assert.equal(elig.restAvailable, false);
  assert.equal(elig.tieAvailable,  false);
});

test('computeInsertEligibility — chord at polyphony cap (6 notes) → NOTE blocked', () => {
  const voices = [attack(60), attack(62), attack(64), attack(65), attack(67), attack(69), null];
  const elig = computeInsertEligibility(voices, 0);
  assert.equal(elig.noteAvailable, false);   // populated count == MAX_POLYPHONY
  assert.equal(elig.restAvailable, false);
  assert.equal(elig.tieAvailable,  false);
});

test('computeInsertEligibility — defensive: non-array voices treated as empty', () => {
  // Codec or migration edge case: treat malformed voices as empty
  // rather than crash. Then only NOTE is conditionally available
  // (REST/TIE still need prev attacks).
  const elig = computeInsertEligibility(null, 0);
  assert.equal(elig.noteAvailable, true);
  assert.equal(elig.restAvailable, false);
  assert.equal(elig.tieAvailable,  false);
});
