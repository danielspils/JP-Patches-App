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

  return {
    paramsFingerprint,
    computeReorderIdx,
  };
});
