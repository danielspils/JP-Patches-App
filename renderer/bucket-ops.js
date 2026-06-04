'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// bucket-ops.js — pure state-mutation helpers for the Create Custom Banks
// (CCB) feature.
//
// Extracted from app.js for unit-testability + reuse. All mutations are
// IN-PLACE: callers pass a buckets state object ({active, C: [...], D: [...]})
// and the helpers modify its C/D arrays directly. Return values carry
// metadata (e.g., the previous entry, useful for undo capture).
//
// Bucket entry shape:
//   - filled: { params: {...32 keys}, name: string|null, origin: string,
//               sourceLabel: string|null }
//   - empty:  null
// Each bank array is always length 16. The helpers preserve that invariant.
//
// Loaded both in the browser (script tag in index.html, attaches names to
// window) and Node (via require, exports an object). Same UMD-ish factory
// pattern as renderer/library-math.js.
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  } else {
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ── silentDefaultPatch ─────────────────────────────────────────────────
  //
  // Returns a fresh JX-3P patch with all parameters at their silent
  // defaults: vca_level=0 means the patch produces no sound regardless of
  // what oscillators / envelopes look like. Used as the fill for empty
  // CCB slots when saving — gives WYSIWYG behavior (empty in builder =
  // silent in saved bank). Returns a NEW object each call so mutations on
  // one slot don't leak into others.
  function silentDefaultPatch() {
    return {
      dco1_range: "16'",
      dco1_waveform: 'saw',
      dco1_fmod_lfo: false,
      dco1_fmod_env: false,
      dco2_range: "16'",
      dco2_waveform: 'saw',
      dco2_crossmod: 'off',
      dco2_tune: 0,
      dco2_fine_tune: 0,
      dco2_fmod_lfo: false,
      dco2_fmod_env: false,
      dco_lfo_amount: 0,
      dco_env_amount: 0,
      dco_env_polarity: 'pos',
      vcf_mix: 0,
      vcf_hpf: 0,
      vcf_cutoff: 0,
      vcf_lfo_mod: 0,
      vcf_pitch_follow: 0,
      vcf_resonance: 0,
      vcf_env_mod: 0,
      vcf_env_polarity: 'pos',
      vca_mode: 'env',
      vca_level: 0,            // ← the silent bit
      chorus: false,
      lfo_waveform: 'sine',
      lfo_delay: 0,
      lfo_rate: 0,
      env_attack: 0,
      env_decay: 0,
      env_sustain: 0,
      env_release: 0,
      mystery: 0,
    };
  }

  // ── isSilentDefaultPatch ───────────────────────────────────────────────
  //
  // True when `params` is structurally identical to silentDefaultPatch() —
  // i.e. this slot is one of the "blank" fillers we write into empty CCB
  // slots on SAVE. The display layer uses this to label such slots "blank"
  // instead of the misleading "imported as Cn from <library>" placeholder
  // (which is meant for real-but-unnamed patches).
  //
  // Strict, key-for-key match (all values are primitives — strings,
  // numbers, booleans — so === per key is exact). Deliberately strict:
  // only OUR blank placeholder reads as "blank", never a user's real
  // patch that merely happens to be silent (e.g. a sound-design WIP at
  // vca_level 0 with non-default oscillators).
  function isSilentDefaultPatch(params) {
    if (!params || typeof params !== 'object') return false;
    const ref = silentDefaultPatch();
    const refKeys = Object.keys(ref);
    if (Object.keys(params).length !== refKeys.length) return false;
    for (const k of refKeys) {
      if (params[k] !== ref[k]) return false;
    }
    return true;
  }

  // ── placeBucketEntry ───────────────────────────────────────────────────
  //
  // Assign an entry into a bucket slot. Pass null/undefined to clear the
  // slot (equivalent to clearBucketEntry but doesn't surface the cleared
  // value). Returns the PREVIOUS entry at that slot (filled or null), so
  // callers can capture for undo. Returns null when bank doesn't exist or
  // idx is out of [0, 15] — safe to ignore; no mutation occurs.
  function placeBucketEntry(buckets, destBank, destIdx, entry) {
    if (!buckets) return null;
    const arr = buckets[destBank];
    if (!Array.isArray(arr)) return null;
    if (!Number.isInteger(destIdx) || destIdx < 0 || destIdx > 15) return null;
    const prev = arr[destIdx] || null;
    arr[destIdx] = entry || null;
    return prev;
  }

  // ── swapBucketEntries ──────────────────────────────────────────────────
  //
  // Swap two slots — works WITHIN one bank (C→C, D→D) or ACROSS banks
  // (C↔D). This is the single model behind ALL bucket drags as of v0.7.4:
  // dragging slot A onto slot B trades their contents, and NOTHING else
  // moves. We deliberately dropped the old within-bank insert-reorder
  // (splice + shift everything between) because on a sparse bucket it
  // shuffled the empty slots around — users read that as "it created
  // another empty slot." Swap touches exactly two slots, so the result
  // always matches the gesture: "A populates B."
  //
  // No-ops (return false, no mutation):
  //   - same bank AND same index (dropped on itself)
  //   - both slots empty (nothing to trade)
  //   - invalid bank / index
  // Otherwise swaps (either side may be null → effectively a move) and
  // returns true.
  function swapBucketEntries(buckets, bankA, idxA, bankB, idxB) {
    if (!buckets) return false;
    const arrA = buckets[bankA];
    const arrB = buckets[bankB];
    if (!Array.isArray(arrA) || !Array.isArray(arrB)) return false;
    if (!Number.isInteger(idxA) || idxA < 0 || idxA > 15) return false;
    if (!Number.isInteger(idxB) || idxB < 0 || idxB > 15) return false;
    if (bankA === bankB && idxA === idxB) return false;       // dropped on self
    if (!arrA[idxA] && !arrB[idxB]) return false;             // both empty
    const tmp = arrA[idxA];
    arrA[idxA] = arrB[idxB];
    arrB[idxB] = tmp;
    return true;
  }

  // ── clearBucketEntry ───────────────────────────────────────────────────
  //
  // Remove the entry at a slot (sets to null). Returns the removed entry
  // for undo capture, or null if the slot was already empty / inputs
  // invalid. Other slots untouched.
  function clearBucketEntry(buckets, bank, idx) {
    const arr = buckets && buckets[bank];
    if (!Array.isArray(arr)) return null;
    if (!Number.isInteger(idx) || idx < 0 || idx > 15) return null;
    const removed = arr[idx];
    if (!removed) return null;
    arr[idx] = null;
    return removed;
  }

  // ── setBucketEntryName ─────────────────────────────────────────────────
  //
  // Rename the entry at a slot. Pass null or '' to clear the custom name
  // (entry.name → null). Returns the PREVIOUS name (string or null) for
  // undo capture. Returns null when the slot is empty (no entry to
  // rename) or inputs invalid. Other entry fields (params, origin,
  // sourceLabel) are NOT touched.
  function setBucketEntryName(buckets, bank, idx, newName) {
    const arr = buckets && buckets[bank];
    if (!Array.isArray(arr)) return null;
    if (!Number.isInteger(idx) || idx < 0 || idx > 15) return null;
    const entry = arr[idx];
    if (!entry) return null;
    const oldName = entry.name || null;
    entry.name = newName || null;
    return oldName;
  }

  // ── buildSavedBuckets ──────────────────────────────────────────────────
  //
  // Build the patch-data half of a saved package from a buckets state.
  // Empty slots are filled with silentDefaultPatch (WYSIWYG: empty in
  // builder = silent in saved bank). Filled slots use a DEEP COPY of the
  // entry's params — so subsequent mutations on the buckets state don't
  // bleed into already-saved packages.
  //
  // Returns [bankC_patches, bankD_patches], each length 16. Both banks
  // always saved at full length even when only one had entries.
  function buildSavedBuckets(buckets) {
    const fillBank = (bucket) => {
      const out = [];
      for (let i = 0; i < 16; i++) {
        const entry = bucket && bucket[i];
        if (entry && entry.params) {
          out.push(JSON.parse(JSON.stringify(entry.params)));
        } else {
          out.push(silentDefaultPatch());
        }
      }
      return out;
    };
    const C = (buckets && Array.isArray(buckets.C)) ? buckets.C : [];
    const D = (buckets && Array.isArray(buckets.D)) ? buckets.D : [];
    return [fillBank(C), fillBank(D)];
  }

  // ── buildSavedBucketSlotMeta ───────────────────────────────────────────
  //
  // Build the metadata half of a saved package: per-slot { name, origin,
  // sourceLabel } plus DEEP PROVENANCE (originLibrary, originalName,
  // createdAt) when the entry carries it. Filled slots carry the entry's
  // metadata (with fallback origin = "C5"-style if the entry's origin is
  // missing). Empty slots get { name: null, origin: 'C5', sourceLabel: null }
  // — consistent with the silent-default fill (the saved slot has no source;
  // its identity is just its JX position).
  //
  // v0.7.5: the deep-provenance fields are preserved so building a custom
  // bank from patches that already live in another library (e.g. dragging
  // Spils Sounds patches into a new "Okay Dokay" bank) doesn't re-root their
  // lineage to the new bank. Without these, the load-time enrichment in
  // app.js stamps originLibrary with the NEW bank's name + date, hiding the
  // patch's true origin in the Patch-history modal. Fields are only emitted
  // when present, so packages built from patches with no prior provenance
  // stay byte-identical to the old shape.
  function buildSavedBucketSlotMeta(buckets) {
    const meta = { C: [], D: [] };
    ['C', 'D'].forEach((bank) => {
      const arr = (buckets && buckets[bank]) || [];
      for (let i = 0; i < 16; i++) {
        const entry = arr[i];
        if (entry) {
          const m = {
            name:        entry.name || null,
            origin:      entry.origin || (bank + (i + 1)),
            sourceLabel: entry.sourceLabel || null,
          };
          // Carry deep provenance forward only when the source patch had it.
          if (entry.originLibrary) m.originLibrary = entry.originLibrary;
          if (entry.originalName)  m.originalName  = entry.originalName;
          if (entry.createdAt)     m.createdAt     = entry.createdAt;
          meta[bank][i] = m;
        } else {
          meta[bank][i] = {
            name:        null,
            origin:      bank + (i + 1),
            sourceLabel: null,
          };
        }
      }
    });
    return meta;
  }

  // ── decodeBucketDropAction ─────────────────────────────────────────────
  //
  // Given the three possible MIME payloads a CCB drop can carry + the
  // target slot info, decide what mutation to perform. Pure decoder —
  // returns a discriminated-union "action" object that the caller
  // executes via the bucket-ops mutators. No DOM access, no state read.
  //
  // Why this lives here: the drop-handler dispatch in app.js is small but
  // has had bugs (e.g., the cross-bank reject silently dropped C→D moves
  // for months). Pulled out so unit tests can pin the contract between
  // drag payloads + mutation calls.
  //
  // Input:
  //   payloads: {
  //     bucketJson: string|null,   // 'application/x-jp-bucket-source'  → {bank, idx}
  //     rangeJson:  string|null,   // 'application/x-jp-patch-range'    → {bank, start, end}
  //     patchJson:  string|null,   // 'application/x-jp-patch-source'   → {bank, slot}
  //   }
  //   target: { bank: 'C'|'D', idx: 0..15 }
  //     - bank/idx = the .cb-slot that received the drop
  //
  // Returns one of:
  //   { kind: 'bucket-swap',    srcBank, srcIdx, dstBank, dstIdx }
  //     bucket→bucket drag (within OR across banks); pass to
  //     swapBucketEntries. As of v0.7.4 there's no within-vs-cross
  //     distinction — every bucket drag is a slot-for-slot swap, so the
  //     target's top/bottom half no longer matters (was only needed for
  //     the old insert-reorder's "insert after last row" sentinel).
  //   { kind: 'range-place',    srcBank, srcStart, dstBank, dstStartIdx, rangeSize }
  //     shift-selected patch-list range drop; caller loops placeBucketEntry
  //   { kind: 'range-too-big',  rangeSize, available }
  //     range wouldn't fit — caller should bail (no partial drops)
  //   { kind: 'patch-place',    srcBank, srcSlot, dstBank, dstIdx }
  //     single patch-list drop; pass to placeBucketEntry
  //   { kind: 'invalid' }   — payload JSON was malformed
  //   { kind: 'none' }      — no recognized payload present
  //
  // The bucketJson check is FIRST + has highest priority. If both a
  // bucket payload and a patch/range payload are set (shouldn't happen in
  // practice — only one MIME is written per dragstart), the bucket
  // payload wins. This matches app.js's pre-extraction precedence.
  function decodeBucketDropAction(payloads, target) {
    const p = payloads || {};
    const dst = target || {};

    if (p.bucketJson) {
      let src;
      try { src = JSON.parse(p.bucketJson); } catch { return { kind: 'invalid' }; }
      if (!src || typeof src !== 'object') return { kind: 'invalid' };
      // Within OR cross bank — both are swaps. swapBucketEntries treats a
      // same-bank/same-idx drop as a no-op, so no guard needed here.
      return {
        kind:    'bucket-swap',
        srcBank: src.bank,
        srcIdx:  src.idx,
        dstBank: dst.bank,
        dstIdx:  dst.idx,
      };
    }

    if (p.rangeJson) {
      let r;
      try { r = JSON.parse(p.rangeJson); } catch { return { kind: 'invalid' }; }
      if (!r || typeof r !== 'object') return { kind: 'invalid' };
      const rangeSize = (r.end - r.start) + 1;
      const available = 16 - dst.idx;
      if (rangeSize > available) {
        // Range wouldn't fit at this position — partial drops aren't
        // allowed; the user should drop higher up.
        return { kind: 'range-too-big', rangeSize, available };
      }
      return {
        kind:        'range-place',
        srcBank:     r.bank,
        srcStart:    r.start,
        dstBank:     dst.bank,
        dstStartIdx: dst.idx,
        rangeSize,
      };
    }

    if (p.patchJson) {
      let src;
      try { src = JSON.parse(p.patchJson); } catch { return { kind: 'invalid' }; }
      if (!src || typeof src !== 'object') return { kind: 'invalid' };
      return {
        kind:    'patch-place',
        srcBank: src.bank,
        srcSlot: src.slot,
        dstBank: dst.bank,
        dstIdx:  dst.idx,
      };
    }

    return { kind: 'none' };
  }

  return {
    silentDefaultPatch,
    isSilentDefaultPatch,
    placeBucketEntry,
    swapBucketEntries,
    clearBucketEntry,
    setBucketEntryName,
    buildSavedBuckets,
    buildSavedBucketSlotMeta,
    decodeBucketDropAction,
  };
});
