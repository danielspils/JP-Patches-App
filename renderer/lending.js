'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Lending — pure helpers for the user lending library, shared by app.js
// and unit tests (test/lending.test.js).
//
// Same UMD factory pattern as renderer/library-math.js: loaded in the
// browser via <script> tag (attaches to window) and in Node via require.
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  } else {
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ── buildLendPayload ────────────────────────────────────────────────
  //
  // The lend payload for one library item — EXACTLY the shapes the
  // download/export paths emit, so a lent file is indistinguishable
  // from a downloaded one (and round-trips through borrow identically):
  //   tones:     { format_version, banks, _slotMeta? }
  //   sequences: { format_version, kind: 'sequence', pages, _sequenceMeta }
  //
  // `sequenceMeta` is passed in (built by app.js's
  // buildSequenceMetaForExport) so this stays pure and testable.
  /**
   * @param {'tones'|'sequences'} kind
   * @param {object} item          Library package (tones) or sequence
   * @param {object|null} [sequenceMeta] Pre-built _sequenceMeta (sequences only)
   * @returns {object} The .json payload object
   */
  function buildLendPayload(kind, item, sequenceMeta) {
    if (kind === 'tones') {
      const payload = { format_version: '1.0', banks: item.banks };
      if (item.slotMeta) payload._slotMeta = item.slotMeta;
      return payload;
    }
    return {
      format_version: '1.0',
      kind: 'sequence',
      pages: item.tape && item.tape.pages,
      _sequenceMeta: sequenceMeta || null,
    };
  }

  // ── buildLendIssueUrl ───────────────────────────────────────────────
  //
  // Pre-filled GitHub issue-form URL — the lend fallback path when the
  // relay is unreachable. Query keys must match the field ids in
  // .github/ISSUE_TEMPLATE/share-tones.yml / share-sequence.yml.
  // URLSearchParams handles all encoding (apostrophes, ampersands,
  // unicode); empty hometown/notes are omitted entirely so the form
  // shows its placeholder hints instead of blank prefills.
  /**
   * @param {'tones'|'sequences'} kind
   * @param {string} displayName Catalog name for the lent item
   * @param {string} name        Sharer's name (form field: author)
   * @param {string} [hometown]
   * @param {string} [notes]
   * @returns {string} Absolute github.com URL
   */
  function buildLendIssueUrl(kind, displayName, name, hometown, notes) {
    const isTones = kind === 'tones';
    const params = new URLSearchParams();
    params.set('template', isTones ? 'share-tones.yml' : 'share-sequence.yml');
    params.set('title', `[Lend ${isTones ? 'Tones' : 'Sequence'}] ${displayName}`);
    params.set(isTones ? 'package-name' : 'sequence-name', displayName);
    params.set('author', name);
    if (hometown) params.set('hometown', hometown);
    if (notes) params.set('notes', notes);
    return `https://github.com/danielspils/JP-Patches-App/issues/new?${params.toString()}`;
  }

  return {
    buildLendPayload,
    buildLendIssueUrl,
  };
});
