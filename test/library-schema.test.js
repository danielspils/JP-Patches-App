'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  CURRENT_SCHEMA_VERSION,
  migrations,
  migrateLibraryToCurrent,
  repairProvenance,
} = require('../renderer/library-schema.js');
const { paramsFingerprint }    = require('../renderer/library-math.js');
const { isSilentDefaultPatch, silentDefaultPatch } = require('../renderer/bucket-ops.js');

// ── Public-API contract: CURRENT_SCHEMA_VERSION ────────────────────

test('CURRENT_SCHEMA_VERSION is a positive integer', () => {
  assert.equal(typeof CURRENT_SCHEMA_VERSION, 'number');
  assert.ok(Number.isInteger(CURRENT_SCHEMA_VERSION));
  assert.ok(CURRENT_SCHEMA_VERSION >= 1);
});

// ── migrations array shape ─────────────────────────────────────────

test('migrations is a contiguous chain ending at CURRENT_SCHEMA_VERSION', () => {
  // Each migration's `from` is the previous one's `to`, and the last
  // migration's `to` matches CURRENT_SCHEMA_VERSION. If empty, the
  // current version is reached without migrations (the "pre-versioned
  // libraries get stamped with the current version" path).
  if (migrations.length === 0) {
    // Empty list is valid — no schema changes yet beyond the initial.
    return;
  }
  let expectedFrom = 0;
  for (const m of migrations) {
    assert.equal(m.from, expectedFrom, `migration ${m.note} has wrong from`);
    assert.equal(m.to, m.from + 1, `migration ${m.note} should go from N to N+1`);
    assert.equal(typeof m.migrate, 'function');
    assert.equal(typeof m.note, 'string');
    expectedFrom = m.to;
  }
  assert.equal(expectedFrom, CURRENT_SCHEMA_VERSION,
    'migrations list ends at version ≠ CURRENT_SCHEMA_VERSION');
});

// ── migrateLibraryToCurrent ────────────────────────────────────────

test('migrateLibraryToCurrent — null input returns a fresh library at current version', () => {
  const out = migrateLibraryToCurrent(null);
  assert.deepEqual(out, { schemaVersion: CURRENT_SCHEMA_VERSION });
});

test('migrateLibraryToCurrent — undefined input returns a fresh library at current version', () => {
  const out = migrateLibraryToCurrent(undefined);
  assert.deepEqual(out, { schemaVersion: CURRENT_SCHEMA_VERSION });
});

test('migrateLibraryToCurrent — non-object input returns a fresh library', () => {
  const out = migrateLibraryToCurrent('not a library');
  assert.deepEqual(out, { schemaVersion: CURRENT_SCHEMA_VERSION });
});

test('migrateLibraryToCurrent — empty object gets stamped with current version', () => {
  const out = migrateLibraryToCurrent({});
  assert.equal(out.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('migrateLibraryToCurrent — already-current library is a no-op (modifies in place)', () => {
  const lib = { schemaVersion: CURRENT_SCHEMA_VERSION, packages: ['p1'], extra: 'preserved' };
  const out = migrateLibraryToCurrent(lib);
  assert.equal(out, lib);                          // same object
  assert.equal(out.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(out.packages, ['p1']);
  assert.equal(out.extra, 'preserved');
});

test('migrateLibraryToCurrent — pre-versioned library (no schemaVersion field) gets stamped', () => {
  // The "no migrations defined yet" case: an old library without a
  // schemaVersion field is treated as version 0; with empty migrations
  // it should just get stamped to current.
  const lib = { packages: ['p1', 'p2'], sequences: ['s1'] };
  const out = migrateLibraryToCurrent(lib);
  assert.equal(out.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(out.packages, ['p1', 'p2']);
  assert.deepEqual(out.sequences, ['s1']);
});

test('migrateLibraryToCurrent — idempotent: running twice gives the same result', () => {
  const lib = { packages: ['p1'] };
  const first  = migrateLibraryToCurrent(lib);
  const second = migrateLibraryToCurrent(first);
  assert.equal(second, first);                     // same object
  assert.equal(second.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('migrateLibraryToCurrent — library claiming a future schemaVersion is left alone', () => {
  // Future-proof: if a user runs an OLDER build of JP against a library
  // written by a NEWER build, we shouldn't downgrade or break anything.
  // Just respect the higher version and pass through.
  const lib = { schemaVersion: CURRENT_SCHEMA_VERSION + 5, futureField: 'unknown' };
  const out = migrateLibraryToCurrent(lib);
  assert.equal(out.schemaVersion, CURRENT_SCHEMA_VERSION + 5);
  assert.equal(out.futureField, 'unknown');
});

// Note on testing the migration ENGINE: the engine reads
// CURRENT_SCHEMA_VERSION as a module-level const, so synthetic
// migrations injected at test time can't easily exercise the
// "from N to N+1" transition path. When a real schema bump lands,
// add a test that covers that specific transition (input library
// at schemaVersion=N → output at N+1, with the expected field
// transform applied). The empty-list cases above already verify
// the engine's "no-op", "stamp", "future-version respect", and
// "idempotent" guarantees.

// ── repairProvenance (v1→v2 migration core) ────────────────────────
//
// Re-roots originLibrary/originalName/createdAt to the EARLIEST library
// containing each exact patch. Real paramsFingerprint + isSilentDefaultPatch
// are injected (same helpers the shipped migration resolves at runtime).

// Distinct, valid (non-silent) patches built off the canonical 33-key shape.
const patchA = () => ({ ...silentDefaultPatch(), vca_level: 100, vcf_cutoff: 60 });
const patchB = () => ({ ...silentDefaultPatch(), vca_level: 120, vcf_cutoff: 30 });

// A minimal package: one filled C-slot, the rest empty arrays of length 16.
function pkg({ name, created, slot0Params, slot0Meta }) {
  const C = new Array(16).fill(null); C[0] = slot0Params || null;
  const D = new Array(16).fill(null);
  const metaC = new Array(16).fill(null); metaC[0] = slot0Meta || null;
  const metaD = new Array(16).fill(null);
  return { customName: name, createdAt: created, savedAt: created, banks: [C, D], slotMeta: { C: metaC, D: metaD } };
}

test('repairProvenance — re-roots a derived bank to the earliest library', () => {
  const lib = { packages: [
    pkg({ name: 'Spils', created: '2026-05-21T00:00:00Z', slot0Params: patchA(),
          slot0Meta: { name: 'Bass', origin: 'C1', sourceLabel: 'Spils', originLibrary: 'Spils', originalName: 'Bass' } }),
    pkg({ name: 'Derived', created: '2026-06-04T00:00:00Z', slot0Params: patchA(),  // same patch, dragged in
          slot0Meta: { name: 'Bass', origin: 'C1', sourceLabel: 'Derived', originLibrary: 'Derived', originalName: 'Bass' } }),
  ]};
  repairProvenance(lib, paramsFingerprint, isSilentDefaultPatch);
  const derived = lib.packages[1].slotMeta.C[0];
  assert.equal(derived.originLibrary, 'Spils');
  assert.equal(derived.createdAt,     '2026-05-21T00:00:00Z');
  assert.equal(derived.originalName,  'Bass');
  // The earliest library itself is untouched.
  assert.equal(lib.packages[0].slotMeta.C[0].originLibrary, 'Spils');
  assert.equal(lib._provRepaired, 1);
});

test('repairProvenance — idempotent (second run changes nothing)', () => {
  const lib = { packages: [
    pkg({ name: 'Spils', created: '2026-05-21T00:00:00Z', slot0Params: patchA(),
          slot0Meta: { name: 'Bass', origin: 'C1', originLibrary: 'Spils', originalName: 'Bass' } }),
    pkg({ name: 'Derived', created: '2026-06-04T00:00:00Z', slot0Params: patchA(),
          slot0Meta: { name: 'Bass', origin: 'C1', originLibrary: 'Derived', originalName: 'Bass' } }),
  ]};
  repairProvenance(lib, paramsFingerprint, isSilentDefaultPatch);
  assert.equal(lib._provRepaired, 1);
  repairProvenance(lib, paramsFingerprint, isSilentDefaultPatch);
  assert.equal(lib._provRepaired, 0);  // already deepest → no change
});

test('repairProvenance — skips silent-default fillers', () => {
  const lib = { packages: [
    pkg({ name: 'Spils', created: '2026-05-21T00:00:00Z', slot0Params: silentDefaultPatch(),
          slot0Meta: { name: null, origin: 'C1', originLibrary: 'Spils' } }),
    pkg({ name: 'Derived', created: '2026-06-04T00:00:00Z', slot0Params: silentDefaultPatch(),
          slot0Meta: { name: null, origin: 'C1', originLibrary: 'Derived' } }),
  ]};
  repairProvenance(lib, paramsFingerprint, isSilentDefaultPatch);
  assert.equal(lib._provRepaired, 0);
  assert.equal(lib.packages[1].slotMeta.C[0].originLibrary, 'Derived'); // untouched
});

test('repairProvenance — never re-roots to a LATER library (patch unique to the later bank)', () => {
  const lib = { packages: [
    pkg({ name: 'Spils', created: '2026-05-21T00:00:00Z', slot0Params: patchA(),
          slot0Meta: { name: 'Bass', origin: 'C1', originLibrary: 'Spils' } }),
    pkg({ name: 'Derived', created: '2026-06-04T00:00:00Z', slot0Params: patchB(), // a DIFFERENT patch
          slot0Meta: { name: 'Lead', origin: 'C1', originLibrary: 'Derived' } }),
  ]};
  repairProvenance(lib, paramsFingerprint, isSilentDefaultPatch);
  assert.equal(lib._provRepaired, 0);
  assert.equal(lib.packages[1].slotMeta.C[0].originLibrary, 'Derived'); // its own earliest origin
});

test('repairProvenance — also repairs the active banks (via slotMeta cleanParams)', () => {
  // Active params live as `cleanParams` inside each active slotMeta entry,
  // not as a banks[] array — fingerprint that to re-root the live state.
  const lib = {
    packages: [
      pkg({ name: 'Spils', created: '2026-05-21T00:00:00Z', slot0Params: patchA(),
            slot0Meta: { name: 'Bass', origin: 'C1', originLibrary: 'Spils', originalName: 'Bass' } }),
    ],
    slotMeta: {
      C: (() => {
        const m = new Array(16).fill(null);
        m[0] = { name: 'Bass', origin: 'C1', originLibrary: 'Okay Dokay', cleanParams: patchA() };
        return m;
      })(),
      D: new Array(16).fill(null),
    },
  };
  repairProvenance(lib, paramsFingerprint, isSilentDefaultPatch);
  assert.equal(lib.slotMeta.C[0].originLibrary, 'Spils');     // active slot re-rooted
  assert.equal(lib.slotMeta.C[0].createdAt,     '2026-05-21T00:00:00Z');
});

test('repairProvenance — safe on null / missing inputs', () => {
  assert.equal(repairProvenance(null, paramsFingerprint, isSilentDefaultPatch), null);
  const lib = { packages: 'not-an-array' };
  assert.equal(repairProvenance(lib, paramsFingerprint, isSilentDefaultPatch), lib); // no throw
  // Missing helpers → returns library untouched.
  const lib2 = { packages: [] };
  assert.equal(repairProvenance(lib2, null, null), lib2);
});

test('migrateLibraryToCurrent — v1 library runs the provenance repair (1→2)', () => {
  const lib = {
    schemaVersion: 1,
    packages: [
      pkg({ name: 'Spils', created: '2026-05-21T00:00:00Z', slot0Params: patchA(),
            slot0Meta: { name: 'Bass', origin: 'C1', originLibrary: 'Spils', originalName: 'Bass' } }),
      pkg({ name: 'Derived', created: '2026-06-04T00:00:00Z', slot0Params: patchA(),
            slot0Meta: { name: 'Bass', origin: 'C1', originLibrary: 'Derived', originalName: 'Bass' } }),
    ],
  };
  const out = migrateLibraryToCurrent(lib);
  assert.equal(out.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(out.packages[1].slotMeta.C[0].originLibrary, 'Spils'); // repaired via the migration
});
