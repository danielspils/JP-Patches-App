'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Library math — pure helpers shared by app.js and unit tests.
//
// Extracted so they can be:
//   1. Unit-tested in Node (see test/library-math.test.js)
//   2. Re-used across call sites in app.js without duplication
//   3. Documented + reasoned about independently of the renderer globals
//
// Loaded both in the browser (via <script> tag in index.html, attaches to
// window) and Node (via require, exports an object). Same factory pattern
// as renderer/calibration-math.js.
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  } else {
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ── paramsFingerprint ───────────────────────────────────────────────────
  //
  // Patch identity = its parameters. We canonicalize a params object into a
  // stable JSON string keyed on its sorted keys so it can be used as the key
  // in library.history (fingerprint → { name, origin, ts }).
  //
  // This is what makes name restoration work across a tape roundtrip:
  //   1. User names a patch → recordToHistory writes (fp → name).
  //   2. Patch goes out to JX-3P as a WAV tape dump (no name field).
  //   3. User records the tape dump back into the app.
  //   4. paramsFingerprint produces the same key → lookupInHistory hits
  //      → the original name is restored.
  //
  // Returns null for null / non-object / empty params so callers can no-op
  // cleanly on missing data.
  /**
   * Canonicalize a patch's parameter object into a stable JSON string
   * suitable as a history-table key.
   *
   * @param {Object<string, any> | null | undefined} params
   *   The 32-key patch params object (see jx3p/patch.py for canonical
   *   types). Sorted-key serialization makes the output insensitive to
   *   property-insertion order across roundtrips.
   * @returns {string | null}
   *   Stable JSON-encoded `[[key, value], ...]` array. Returns null when
   *   `params` is null/undefined, not a plain object, or empty — callers
   *   should treat null as "no fingerprint available, skip".
   */
  function paramsFingerprint(params) {
    if (!params || typeof params !== 'object') return null;
    const keys = Object.keys(params).sort();
    if (keys.length === 0) return null;
    const norm = keys.map((k) => [k, params[k]]);
    return JSON.stringify(norm);
  }

  // ── computeReorderIdx ───────────────────────────────────────────────────
  //
  // Off-by-one fix (2026-05-24): the drop indicator (bold line at TOP of
  // the hovered row) visually means "insert between slot toIdx-1 and slot
  // toIdx". When moving DOWN (fromIdx < toIdx), the array.splice(fromIdx, 1)
  // step removes the source and shifts everything after it up by one — so
  // the post-removal insertion index that lands the patch at the indicator's
  // visual position is toIdx - 1, NOT toIdx.
  //
  // When moving UP (fromIdx > toIdx), splice removal doesn't move anything
  // before fromIdx, so toIdx is already correct.
  //
  // Used by all three reorder paths: bank slots (C/D), library packages,
  // library sequences. Same logic, same bug class — extracted to one place.
  //
  //   computeReorderIdx(2, 5) → 4   (down-move: shift target up by 1)
  //   computeReorderIdx(5, 2) → 2   (up-move: target unchanged)
  //   computeReorderIdx(3, 3) → 3   (no-op; caller should early-return)
  //   computeReorderIdx(3, 4) → 3   (adjacent down-move = no-op)
  /**
   * Adjust a drop-target index for the splice-removes-source semantics
   * shared by all three drag-reorder paths (bank slots, library packages,
   * sequences). See the comment above for the off-by-one rationale.
   *
   * @param {number} fromIdx Source index (where the drag started)
   * @param {number} toIdx   Drop-indicator-relative target index
   * @returns {number}       Post-removal insertion index. Pass to
   *                         `arr.splice(returned, 0, removedItem)` after
   *                         doing `arr.splice(fromIdx, 1)` first.
   */
  function computeReorderIdx(fromIdx, toIdx) {
    return fromIdx < toIdx ? toIdx - 1 : toIdx;
  }

  // ── allPatchesIdentical ─────────────────────────────────────────────────
  //
  // Detect the "sequence WAV misrouted to Tones sub-tab" case (v0.7.2).
  // When jx3p's bank decoder runs on a sequence WAV, the sequence's
  // paired-patch metadata is read as bank data + duplicated into every
  // C/D slot — so the decoded banks contain 32 identical patches.
  // Legitimate bank exports virtually never have 32 identical patches
  // (a brand-new defaults-only bank would be the theoretical exception,
  // but users don't export those). Returns true when every patch's
  // fingerprint matches the first patch's, false otherwise (including
  // shape-invalid inputs).
  //
  // Reuses paramsFingerprint above so the equality test is order-
  // insensitive (jx3p's output object property order isn't guaranteed
  // stable across schema versions).
  /**
   * @param {Array<Array<Object>> | any} banks
   *   Expected: a two-element array of 16-patch arrays (what jx3p
   *   wav-to-json returns). Anything else returns false (handler
   *   bails to normal import path).
   * @returns {boolean}
   *   true when every patch across both banks has the same parameter
   *   fingerprint as the first patch.
   */
  function allPatchesIdentical(banks) {
    if (!Array.isArray(banks) || banks.length < 2) return false;
    const flat = [];
    for (const bank of banks) {
      if (!Array.isArray(bank)) return false;
      for (const patch of bank) flat.push(patch);
    }
    if (flat.length < 32) return false;
    const firstFp = paramsFingerprint(flat[0]);
    if (firstFp === null) return false;
    for (let i = 1; i < flat.length; i++) {
      if (paramsFingerprint(flat[i]) !== firstFp) return false;
    }
    return true;
  }

  // ── Index remapping for index-keyed tracking structures ────────────────
  //
  // dirtySequences (Set of indices) and originalSequenceSnapshots (Map of
  // idx → snapshot) in app.js are keyed by position in library.sequences.
  // Any splice of that array — delete, undo-of-delete, drag-reorder,
  // create-new (unshift) — silently invalidates those keys unless they're
  // remapped in the same operation. Bug class hit 2026-06-10: create new
  // sequence (dirty idx 0) → delete it via hover-trash → Danny's Bass
  // Sequence inherits idx 0 AND its stale dirty flag → nav-away modal
  // accuses the wrong sequence; SAVE mints a junk "(edited)" copy.
  //
  // Each function maps ONE old index to its new home. Callers apply it
  // across whole Sets/Maps (see remapSequenceTracking in app.js).

  /**
   * Where does index `idx` land after removing the element at
   * `removedIdx`?
   *
   * @param {number} idx        Index under tracking (pre-removal)
   * @param {number} removedIdx Index that was spliced out
   * @returns {number | null}   New index, or null if `idx` WAS the
   *                            removed element (tracking entry should
   *                            be dropped).
   */
  function remapIndexAfterRemoval(idx, removedIdx) {
    if (idx === removedIdx) return null;
    return idx > removedIdx ? idx - 1 : idx;
  }

  /**
   * Where does index `idx` land after inserting an element at
   * `insertedIdx`? (unshift = insertion at 0)
   *
   * @param {number} idx         Index under tracking (pre-insertion)
   * @param {number} insertedIdx Index the new element was spliced into
   * @returns {number}           New index (never null — insertion
   *                             displaces, never removes).
   */
  function remapIndexAfterInsertion(idx, insertedIdx) {
    return idx >= insertedIdx ? idx + 1 : idx;
  }

  /**
   * Where does index `idx` land after moving the element at `fromIdx`
   * to `toIdx`? `toIdx` is the POST-REMOVAL insertion index — i.e. the
   * output of computeReorderIdx, matching the selSequence adjustment
   * logic in reorderSequence.
   *
   * @param {number} idx     Index under tracking (pre-move)
   * @param {number} fromIdx Source index of the moved element
   * @param {number} toIdx   Post-removal insertion index
   * @returns {number}       New index.
   */
  function remapIndexAfterReorder(idx, fromIdx, toIdx) {
    if (idx === fromIdx) return toIdx;
    if (fromIdx < idx && toIdx >= idx) return idx - 1;
    if (fromIdx > idx && toIdx <= idx) return idx + 1;
    return idx;
  }

  // ── latestLendingEntries ────────────────────────────────────────────
  //
  // Pick the N most recent lending-library manifest entries for the
  // explore modal. Sorts by addedAt descending (ISO YYYY-MM-DD strings
  // sort lexicographically; full ISO timestamps too). Entries missing
  // addedAt sort last. Does not mutate the input. Invalid input → [].
  /**
   * @param {Array<{addedAt?: string}> | any} entries Manifest entries
   * @param {number} n Max entries to return
   * @returns {Array} Up to n entries, newest first
   */
  function latestLendingEntries(entries, n) {
    if (!Array.isArray(entries) || !(n > 0)) return [];
    return entries
      .slice()
      .sort((a, b) => {
        const aa = (a && a.addedAt) || '';
        const bb = (b && b.addedAt) || '';
        return bb < aa ? -1 : bb > aa ? 1 : 0;
      })
      .slice(0, n);
  }

  // ── Bank-to-package fingerprint matching (Phase 3A) ───────────────────
  //
  // Recognize a round-trip: when banks imported from the JX-3P
  // fingerprint-match an existing library package, the caller reuses that
  // package's name instead of a generic dated one. "banks" here is the
  // jx3p shape — a two-element array [ [16 patches], [16 patches] ] (C, D).

  /**
   * Count how many of the 32 C/D slots share a parameter fingerprint
   * between two bank sets. Order-stable via paramsFingerprint; a null
   * fingerprint (missing/invalid slot) never counts as a match.
   *
   * @param {Array<Array<Object>>} banksA
   * @param {Array<Array<Object>>} banksB
   * @returns {{matched: number, total: number, perSlot: boolean[][]}}
   */
  function countBankFingerprintMatches(banksA, banksB) {
    const perSlot = [[], []];
    let matched = 0;
    let total = 0;
    for (let bankIdx = 0; bankIdx < 2; bankIdx++) {
      const arrA = (banksA && banksA[bankIdx]) || [];
      const arrB = (banksB && banksB[bankIdx]) || [];
      for (let s = 0; s < 16; s++) {
        total++;
        const fa = paramsFingerprint(arrA[s]);
        const ok = fa !== null && fa === paramsFingerprint(arrB[s]);
        perSlot[bankIdx][s] = ok;
        if (ok) matched++;
      }
    }
    return { matched, total, perSlot };
  }

  /**
   * Find the library package whose banks best match the given active
   * banks by fingerprint. Ties resolve to the earliest (top-of-list,
   * highest-priority) package. Returns null when nothing matches at all.
   *
   * @param {Array<Array<Object>>} activeBanks
   * @param {Array<{banks?: Array}>} packages  library.packages
   * @returns {{index: number, matched: number, total: number, perSlot: boolean[][]} | null}
   */
  function bestPackageMatch(activeBanks, packages) {
    if (!Array.isArray(packages)) return null;
    let best = null;
    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      if (!pkg || !Array.isArray(pkg.banks)) continue;
      const r = countBankFingerprintMatches(activeBanks, pkg.banks);
      if (r.matched > 0 && (!best || r.matched > best.matched)) {
        best = { index: i, matched: r.matched, total: r.total, perSlot: r.perSlot };
      }
    }
    return best;
  }

  /**
   * Decide the suggested name for an imported bank set given its best
   * package match. The package name is reused verbatim on a full (32/32)
   * match, or tagged "(edited)" when at least `threshold` of slots match.
   * Below the threshold returns null and the caller uses a generic name.
   *
   * @param {string} pkgName     Matched package's display name
   * @param {number} matched     Matching slot count
   * @param {number} total       Slots compared (typically 32)
   * @param {number} [threshold] Fraction (0..1) of slots required to read
   *                             as an edited round-trip. Default 0.5.
   * @returns {{name: string, edited: boolean} | null}
   */
  function suggestBankName(pkgName, matched, total, threshold = 0.5) {
    if (!pkgName || !(total > 0)) return null;
    if (matched >= total) return { name: pkgName, edited: false };
    if (matched / total >= threshold) return { name: pkgName + ' (edited)', edited: true };
    return null;
  }

  return {
    paramsFingerprint,
    computeReorderIdx,
    allPatchesIdentical,
    remapIndexAfterRemoval,
    remapIndexAfterInsertion,
    remapIndexAfterReorder,
    latestLendingEntries,
    countBankFingerprintMatches,
    bestPackageMatch,
    suggestBankName,
  };
});
