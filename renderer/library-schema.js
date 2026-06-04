'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Library schema versioning + migrations.
//
// Why this exists:
//   library.json has grown ~10 fields organically over the May releases —
//   slotMeta, packages, sequences, customBuckets, tapeMode, lastBankSelection,
//   midi, record.calibratedGain, activePatches, captureLog. Each field was
//   added piecemeal with implicit "if missing, default it" logic spread
//   across ensureLibraryShape + various accessor helpers.
//
//   That pattern works until the next time a field's SHAPE has to change.
//   When that happens, we need to KNOW the file was written by an older
//   version (so we can run the one-time transformation) — implicit defaults
//   can't distinguish "field never existed" from "field was renamed".
//
//   Formal schemaVersion + a migration list makes that explicit:
//     - Every library carries `schemaVersion: N` after first load
//     - Adding a new shape change = push a new migration to the list +
//       bump CURRENT_SCHEMA_VERSION
//     - On load, migrateLibraryToCurrent runs any pending migrations in
//       order. Idempotent: re-running on an up-to-date library is a no-op.
//
// Relationship to ensureLibraryShape:
//   ensureLibraryShape (in app.js) stays the per-load shape-invariant
//   ensurer — it handles "add defaults to anything missing" and runs every
//   load regardless of version. migrateLibraryToCurrent is for one-time
//   data transformations that should run ONCE per file, not every load.
//   The two work together:
//     library = await window.api.loadLibrary();
//     library = migrateLibraryToCurrent(library);  // version-stepped
//     ensureLibraryShape();                         // per-load invariants
//
// Today CURRENT_SCHEMA_VERSION = 1, migrations[] is empty. First load
// after this commit ships will set schemaVersion=1 on every library; from
// then on, future shape changes add a migration entry.
//
// Migration writing guide:
//   1. Define `(library) => library` that transforms in-place AND returns
//      the library (callers do `library = migrate(library)` — chainable).
//   2. The migration MUST be safe to re-run on partially-migrated data
//      (a save crash mid-migration shouldn't strand the file).
//   3. Don't modify schemaVersion inside the migration — migrateLibraryToCurrent
//      bumps it after each successful migration.
//   4. Add the migration to the `migrations` array at the END.
//   5. Bump CURRENT_SCHEMA_VERSION by 1.
//   6. Add a unit test covering both the pre-state → post-state transform
//      AND idempotence (run twice, second run is no-op).
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  } else {
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  /**
   * The schema version this code reads + writes. Bump by 1 every time a
   * migration is added. Stored in `library.schemaVersion` after the
   * first migrateLibraryToCurrent call on any file.
   */
  const CURRENT_SCHEMA_VERSION = 2;

  /**
   * @typedef {Object} LibraryMigration
   * @property {number} from   The schemaVersion this migration applies TO
   *                           (so a `from: 0` migration takes pre-versioned
   *                           libraries and brings them to version 1)
   * @property {number} to     The schemaVersion produced
   * @property {string} note   One-line description for logs + future-you
   * @property {(library: Object) => Object} migrate
   *                           Transforms the library in-place AND returns
   *                           it (chainable).
   */

  /**
   * Ordered list of migrations. Empty today. Add new entries at the END
   * when adding schema-changing features. Example shape:
   *
   *   {
   *     from: 1, to: 2,
   *     note: 'splice midiPrefs out of root and into library.midi',
   *     migrate(library) {
   *       if (library.midiPrefs) {
   *         library.midi = Object.assign({}, library.midi, library.midiPrefs);
   *         delete library.midiPrefs;
   *       }
   *       return library;
   *     },
   *   }
   *
   * @type {LibraryMigration[]}
   */
  // Resolve the two pure helpers repairProvenance needs, in whichever
  // environment we're running: window globals in the renderer, require() in
  // Node (tests / headless). Returns nulls if neither is available, in which
  // case the migration skips the repair gracefully rather than throwing.
  function resolveProvHelpers() {
    if (typeof window !== 'undefined' && window.paramsFingerprint && window.isSilentDefaultPatch) {
      return { fp: window.paramsFingerprint, isSilent: window.isSilentDefaultPatch };
    }
    if (typeof require === 'function') {
      try {
        return {
          fp:       require('./library-math.js').paramsFingerprint,
          isSilent: require('./bucket-ops.js').isSilentDefaultPatch,
        };
      } catch { /* fall through to nulls */ }
    }
    return { fp: null, isSilent: null };
  }

  const migrations = [
    {
      from: 0, to: 1,
      note: 'baseline — schemaVersion field introduced (no data change)',
      // Pre-versioned files used to jump straight to current via the stamp
      // path. Now that real migrations exist, we step v0 explicitly to v1 so
      // it continues through the v1→v2 repair below (otherwise a v0 library
      // would skip the repair). No-op transform.
      migrate(library) { return library; },
    },
    {
      from: 1, to: 2,
      note: 'repair custom-bank provenance (re-root originLibrary to the earliest library containing each patch)',
      migrate(library) {
        const { fp, isSilent } = resolveProvHelpers();
        if (fp && isSilent) repairProvenance(library, fp, isSilent);
        return library;
      },
    },
  ];

  /**
   * Apply any pending migrations to bring `library` to CURRENT_SCHEMA_VERSION.
   *
   * Safe to call on:
   *   - null/undefined         (returns a fresh empty library object stamped
   *                            with the current version)
   *   - pre-versioned libraries (treated as schemaVersion=0; all migrations
   *                            apply)
   *   - up-to-date libraries   (no-op; just confirms the version stamp)
   *
   * @param {Object | null | undefined} library
   * @returns {Object} The same library (or a freshly-created one for null
   *   input), guaranteed to have `schemaVersion === CURRENT_SCHEMA_VERSION`.
   */
  function migrateLibraryToCurrent(library) {
    // Null/undefined/non-object → fresh empty library at the current
    // version. Callers populate it normally; ensureLibraryShape (in
    // app.js) handles the rest of the invariants.
    if (!library || typeof library !== 'object') {
      return { schemaVersion: CURRENT_SCHEMA_VERSION };
    }

    let currentVersion = typeof library.schemaVersion === 'number'
      ? library.schemaVersion
      : 0;

    // At-or-past current — leave alone. This respects the future-proofing
    // case where a newer JP build wrote a higher schemaVersion to the
    // file and the user later runs an older build; we don't want to
    // downgrade. Stamp if the field was missing (defaulted from 0 →
    // matched current via empty migrations).
    if (currentVersion >= CURRENT_SCHEMA_VERSION) {
      if (typeof library.schemaVersion !== 'number') {
        library.schemaVersion = currentVersion;
      }
      return library;
    }

    // Below current — try to migrate up. Each migration must bring us
    // exactly to its `to` version.
    for (const m of migrations) {
      if (currentVersion >= CURRENT_SCHEMA_VERSION) break;
      if (m.from !== currentVersion) continue;
      try {
        library = m.migrate(library);
      } catch (err) {
        // Migration failure: stamp the last successful version so a
        // re-load doesn't re-run the migrations that already worked,
        // then return. The next load will retry the failing one —
        // migrations are required to be idempotent + tolerant of
        // partial state.
        console.error(`Library schema migration ${m.from}→${m.to} failed:`, err);
        library.schemaVersion = currentVersion;
        return library;
      }
      currentVersion = m.to;
      library.schemaVersion = currentVersion;
      console.log(`JP:LIBRARY-MIGRATION applied: ${m.from}→${m.to} (${m.note})`);
    }

    // Stamp final version. Two paths reach here:
    //   (a) The migrations list was empty + currentVersion was 0 — the
    //       "schemaVersion field is brand new and pre-versioned files
    //       just need a stamp" case. Correct to stamp.
    //   (b) A gap in the migrations list left us short of CURRENT.
    //       That would be a CODING BUG (caught by the migrations-chain
    //       unit test before shipping); stamping to CURRENT here is a
    //       best-effort "ship a usable library" choice.
    library.schemaVersion = CURRENT_SCHEMA_VERSION;
    return library;
  }

  // ── repairProvenance ───────────────────────────────────────────────────
  //
  // One-time data fix (schema v1→v2). Before the going-forward fix, building
  // a custom bank from existing-library patches re-rooted their lineage: the
  // saved package's load-time enrichment stamped originLibrary with the NEW
  // bank's name + date, so the Patch-history modal showed e.g. "Okay Dokay /
  // today" for a patch that's really from "Spils Sounds / weeks ago".
  //
  // This walks every package's slotMeta AND the active banks and, for each
  // non-blank patch, re-roots originLibrary / originalName / createdAt to the
  // EARLIEST library (by createdAt) that contains that exact patch — the true
  // deepest origin. Correct under the app's "identity = params" model.
  //
  // Safety / idempotence:
  //   - Skips silent-default fillers (they'd all collide on one fingerprint).
  //   - Only re-roots to a DIFFERENT, strictly-EARLIER origin — never to a
  //     later library, never to itself. Re-running is a no-op (originLibrary
  //     already points at the earliest match).
  //   - paramsFingerprint + isSilentDefaultPatch are injected so this stays
  //     pure + unit-testable.
  //
  // Returns the same library (mutated in place); sets library._provRepaired
  // to the number of slots changed (handy for logging / tests).
  function repairProvenance(library, paramsFingerprint, isSilentDefaultPatch) {
    if (!library || typeof library !== 'object') return library;
    if (typeof paramsFingerprint !== 'function' || typeof isSilentDefaultPatch !== 'function') return library;
    const pkgs = Array.isArray(library.packages) ? library.packages : [];
    const labelOf = (p) => p.customName || p.defaultName || null;

    // 1. Index: fingerprint → the earliest origin record seen for it.
    const byFp = new Map();
    for (const p of pkgs) {
      const created = p.createdAt || p.savedAt || null;
      ['C', 'D'].forEach((b, bi) => {
        const bank = p.banks && p.banks[bi];
        const meta = p.slotMeta && p.slotMeta[b];
        if (!Array.isArray(bank)) return;
        for (let i = 0; i < 16; i++) {
          const params = bank[i];
          if (!params || isSilentDefaultPatch(params)) continue;
          const fp = paramsFingerprint(params);
          if (!fp) continue;
          const m = (meta && meta[i]) || {};
          const rec = { label: labelOf(p), created, originalName: m.originalName || m.name || null };
          const cur = byFp.get(fp);
          if (!cur) { byFp.set(fp, rec); continue; }
          if (created && cur.created && created < cur.created) byFp.set(fp, rec);
        }
      });
    }

    // Re-root one slotMeta entry against the earliest-origin index.
    // ownerCreated = the createdAt of the thing that OWNS this slot (the
    // package, or a far-future sentinel for the live active banks so any
    // package origin counts as strictly earlier).
    const repairSlot = (params, metaEntry, ownerCreated) => {
      if (!params || !metaEntry || isSilentDefaultPatch(params)) return false;
      const fp = paramsFingerprint(params);
      if (!fp) return false;
      const earliest = byFp.get(fp);
      if (!earliest || !earliest.label) return false;
      const curOL = metaEntry.originLibrary || metaEntry.sourceLabel || null;
      if (earliest.label === curOL) return false;                          // already deepest
      if (!(earliest.created && ownerCreated && earliest.created < ownerCreated)) return false;
      metaEntry.originLibrary = earliest.label;
      if (earliest.originalName) metaEntry.originalName = earliest.originalName;
      if (earliest.created)      metaEntry.createdAt    = earliest.created;
      return true;
    };

    let changed = 0;

    // 2. Repair every package's stored slotMeta.
    for (const p of pkgs) {
      const created = p.createdAt || p.savedAt || null;
      ['C', 'D'].forEach((b, bi) => {
        const bank = p.banks && p.banks[bi];
        const meta = p.slotMeta && p.slotMeta[b];
        if (!Array.isArray(bank) || !Array.isArray(meta)) return;
        for (let i = 0; i < 16; i++) {
          if (repairSlot(bank[i], meta[i], created)) changed++;
        }
      });
    }

    // 3. Repair the currently-loaded active banks (library.slotMeta) so the
    //    fix shows in the live Patch-history modal without reloading a
    //    package. The active params aren't stored as a banks[] array on disk;
    //    instead each active slotMeta entry carries a `cleanParams` baseline
    //    (the patch loaded into that slot) — fingerprint THAT to identify it.
    //    Active state is "now" → sentinel date so any package origin counts
    //    as strictly earlier.
    const NOW_SENTINEL = '9999-12-31T23:59:59.999Z';
    if (library.slotMeta) {
      ['C', 'D'].forEach((b) => {
        const meta = library.slotMeta[b];
        if (!Array.isArray(meta)) return;
        for (let i = 0; i < 16; i++) {
          const m = meta[i];
          if (m && m.cleanParams && repairSlot(m.cleanParams, m, NOW_SENTINEL)) changed++;
        }
      });
    }

    library._provRepaired = changed;
    return library;
  }

  return {
    CURRENT_SCHEMA_VERSION,
    migrations,
    migrateLibraryToCurrent,
    repairProvenance,
  };
});
