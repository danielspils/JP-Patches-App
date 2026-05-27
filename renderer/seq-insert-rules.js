'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Sequencer insert rules — pure logic.
//
// The renderer's sequence editor (renderer/app.js) lets the user click an
// empty step to pop a NOTE / REST / TIE insert tooltip. The rules for what's
// allowed, and how each insert mutates the step's voice slots, live HERE so
// they're testable without a DOM, an Electron runtime, or a real JX-3P.
//
// Why a separate module:
//   - The insert rules are load-bearing for "data we eventually send back to
//     a real JX." A regression here could produce wire data that the JX
//     misinterprets on tape-load. Regression tests are cheap insurance.
//   - The polyphonic REST/TIE behavior (and the NOTE-vs-tied gate) was
//     reverse-engineered empirically from Daniel's JX recordings
//     (CLAUDE.md pitfall #16). Pinning the rules in tests guards against
//     "future me edits this and breaks the JX-match property."
//   - The renderer code that ALSO needs library lookup, snapshot capture,
//     dirty tracking, and re-renders stays in app.js as thin wrappers that
//     call these pure mutators.
//
// JX-3P facts encoded here (see CLAUDE.md pitfall #16 for full context):
//   - Each step has 7 voice slots (`voices[0..6]`); JX-3P plays 6 voices max.
//   - A voice is `null` (empty) or `{note: midiPitch, tied: boolean}`.
//   - NEW ATTACK = `{note, tied: false}`. TIE/REST CONTINUATION = `{note,
//     tied: true}` (carries the prev-step pitch forward).
//   - REST press on the JX ties EVERY prev-column attack into the next step
//     (5-voice chord + REST → 5 tied voices, not 1).
//   - TIE press on the JX writes `{tied:true} + {tied:false}` pairs per
//     pitch (canonical), which only fits up to N=3 in the 7-slot budget.
//     For N≥4 the JX firmware falls back to fresh-attacks-only —
//     indistinguishable from a chord re-strike at the wire level.
//   - REST and TIE are WHOLE-STEP events on the JX panel: a step cannot
//     mix a note attack with a rest/tie continuation. NOTE insert is
//     therefore blocked when the column has any tied voice.
//
// Module API (browser): `window.{previousColumnAttackPitches,
//   insertNoteIntoStep, insertRestIntoStep, insertTieIntoStep,
//   computeInsertEligibility, MAX_POLYPHONY, STEPS_PER_PAGE}`
// Module API (Node):    `const {...} = require('./seq-insert-rules');`
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  } else {
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const STEPS_PER_PAGE = 16;
  const MAX_POLYPHONY  = 6;    // JX-3P plays 6 voices max (wire format has 7 slots)

  // ── previousColumnAttackPitches ───────────────────────────────────
  /**
   * Return the array of MIDI pitches that are NEW ATTACKS (tied=false)
   * in the column immediately before `absStep`. Used by REST/TIE
   * inserts to know what pitches to continue / re-attack, and by the
   * tooltip's eligibility math (rest/tie need something to reference).
   *
   * Order preserved: voices are scanned in slot order, so the returned
   * array matches voice-slot order in the source step.
   *
   * @param {number}                       absStep  Step we're inserting AT (0..127)
   * @param {Array<Array<object>>|null}    pages    library.sequences[i].tape.pages
   * @returns {number[]}  Pitches from prev column (empty if absStep≤0,
   *                      pages missing/empty, prev step missing, or
   *                      prev step has no new attacks)
   */
  function previousColumnAttackPitches(absStep, pages) {
    if (absStep <= 0) return [];
    if (!Array.isArray(pages)) return [];
    const prevStep = absStep - 1;
    const page = pages[Math.floor(prevStep / STEPS_PER_PAGE)];
    const step = page && page[prevStep % STEPS_PER_PAGE];
    if (!step || !Array.isArray(step.voices)) return [];
    return step.voices
      .filter((v) => v && typeof v.note === 'number' && v.tied === false)
      .map((v) => v.note);
  }

  // ── insertNoteIntoStep ────────────────────────────────────────────
  /**
   * Write `{note: pitch, tied: false}` into the first empty voice slot
   * of `step`. Returns false (and leaves `step` untouched) if:
   *   - step has any TIED voice (REST or canonical TIE present —
   *     the JX-3P can't mix note attacks with rest/tie continuations,
   *     so neither does the editor; see pitfall #16)
   *   - step already has MAX_POLYPHONY populated voices (chord cap)
   *   - no empty slot is available (defensive — should be covered by
   *     the count check above)
   *
   * On success, also flips `step.byte7` from the 127 "never written"
   * sentinel to 1 so the codec round-trips the new attack (see
   * pitfall #16).
   *
   * @param {{voices: Array, byte7?: number}} step   Step object to mutate
   * @param {number}                          pitch  MIDI pitch to insert
   * @returns {boolean}  True if the note was inserted
   */
  function insertNoteIntoStep(step, pitch) {
    if (!step || !Array.isArray(step.voices)) return false;
    if (step.voices.some((v) => v && v.tied === true)) return false;
    const populatedCount = step.voices.filter((v) => v != null).length;
    if (populatedCount >= MAX_POLYPHONY) return false;
    const emptyIdx = step.voices.findIndex((v) => v === null || v === undefined);
    if (emptyIdx === -1) return false;
    step.voices[emptyIdx] = { note: pitch, tied: false };
    step.byte7 = 1;
    return true;
  }

  // ── insertRestIntoStep ────────────────────────────────────────────
  /**
   * Write a REST: tie EVERY pitch in `prevPitches` into this step as
   * `{note: pitch, tied: true}`. Matches the JX firmware's polyphonic
   * REST behavior (5-voice chord + REST = 5 tied voices in next step).
   *
   * Returns false (and leaves `step` untouched) if:
   *   - step is non-empty (REST is a whole-step event on the JX, can't
   *     coexist with other voices in the same step)
   *   - prevPitches is empty (nothing to continue)
   *
   * Cap at MAX_POLYPHONY: if prevPitches is longer (shouldn't be —
   * prev column is also capped — but defensive), only the first 6 are
   * written.
   *
   * @param {{voices: Array, byte7?: number}} step         Step object to mutate
   * @param {number[]}                        prevPitches  Pitches to tie
   * @returns {boolean}  True if the rest was inserted
   */
  function insertRestIntoStep(step, prevPitches) {
    if (!step || !Array.isArray(step.voices)) return false;
    if (step.voices.some((v) => v != null)) return false;
    if (!Array.isArray(prevPitches) || prevPitches.length === 0) return false;
    const pitches = prevPitches.slice(0, MAX_POLYPHONY);
    pitches.forEach((pitch, i) => {
      step.voices[i] = { note: pitch, tied: true };
    });
    step.byte7 = 1;
    return true;
  }

  // ── insertTieIntoStep ─────────────────────────────────────────────
  /**
   * Write a TIE: re-articulate every pitch in `prevPitches`. Two
   * encoding strategies depending on N = prevPitches.length:
   *   - N×2 ≤ 6 (canonical): write {tied:true} + {tied:false} pairs
   *     per pitch. Renders BLUE in the visualizer (single-voice TIE
   *     signature). Used when 1-3 voices fit.
   *   - N×2 > 6 (fallback): write fresh attacks only (no tied voices).
   *     Indistinguishable from chord re-strike at the wire level —
   *     matches the JX firmware's observed polyphonic-TIE fallback
   *     for N≥4 (pitfall #16). Renders RED, but the tooltip detects
   *     it via the same-attacks-as-prev-column heuristic.
   *
   * Same step-must-be-empty + prev-must-have-attacks gates as REST.
   *
   * @param {{voices: Array, byte7?: number}} step         Step object to mutate
   * @param {number[]}                        prevPitches  Pitches to re-attack
   * @returns {boolean}  True if the tie was inserted
   */
  function insertTieIntoStep(step, prevPitches) {
    if (!step || !Array.isArray(step.voices)) return false;
    if (step.voices.some((v) => v != null)) return false;
    if (!Array.isArray(prevPitches) || prevPitches.length === 0) return false;
    const pitches = prevPitches.slice(0, MAX_POLYPHONY);
    const canFitCanonical = pitches.length * 2 <= MAX_POLYPHONY;
    if (canFitCanonical) {
      let slotIdx = 0;
      pitches.forEach((pitch) => {
        step.voices[slotIdx++] = { note: pitch, tied: true };
        step.voices[slotIdx++] = { note: pitch, tied: false };
      });
    } else {
      pitches.forEach((pitch, i) => {
        step.voices[i] = { note: pitch, tied: false };
      });
    }
    step.byte7 = 1;
    return true;
  }

  // ── computeInsertEligibility ──────────────────────────────────────
  /**
   * Compute whether NOTE/REST/TIE are insertable at a step given its
   * current voice array and the number of prev-column attacks.
   * Single source of truth for both the insert-tooltip button-disable
   * logic AND the underlying insert*IntoStep mutators (both share the
   * same rules — see CLAUDE.md pitfall #16).
   *
   * Rules:
   *   - noteAvailable: step has no tied voice AND populated count < 6
   *   - restAvailable: step is empty AND prev column has any new attack
   *   - tieAvailable:  same as restAvailable (the gating is identical;
   *                    the only difference is what each writes)
   *
   * @param {Array}    voices             The step's voices array (length 7)
   * @param {number}   prevAttackCount    `previousColumnAttackPitches(...).length`
   * @returns {{noteAvailable: boolean, restAvailable: boolean,
   *            tieAvailable: boolean}}
   */
  function computeInsertEligibility(voices, prevAttackCount) {
    const safeVoices = Array.isArray(voices) ? voices : [];
    const stepIsEmpty = safeVoices.every((v) => v == null);
    const stepHasTied = safeVoices.some((v) => v && v.tied === true);
    const populatedCount = safeVoices.filter((v) => v != null).length;
    const canContinue = prevAttackCount > 0;
    return {
      noteAvailable: !stepHasTied && populatedCount < MAX_POLYPHONY,
      restAvailable: stepIsEmpty && canContinue,
      tieAvailable:  stepIsEmpty && canContinue,
    };
  }

  return {
    STEPS_PER_PAGE,
    MAX_POLYPHONY,
    previousColumnAttackPitches,
    insertNoteIntoStep,
    insertRestIntoStep,
    insertTieIntoStep,
    computeInsertEligibility,
  };
});
