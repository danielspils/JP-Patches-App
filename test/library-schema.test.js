'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  CURRENT_SCHEMA_VERSION,
  migrations,
  migrateLibraryToCurrent,
} = require('../renderer/library-schema.js');

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
