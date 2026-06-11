'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Consistency checks for the lending-library catalog data
// (docs/_data/patches.yml + sequences.yml ↔ docs/library/ payloads).
//
// The curation workflow is manual: approving a lending request means
// hand-editing the YAML and dropping a payload file. These tests turn
// the easy mistakes — typo'd path, missing field, stale size_bytes,
// duplicate id, malformed payload — into CI failures instead of broken
// borrow buttons on the live site / in the app's lending modal.
//
// Run with:    node --test test/community-catalog.test.js
// ═══════════════════════════════════════════════════════════════════════════

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const yaml   = require('js-yaml');

const DOCS = path.join(__dirname, '..', 'docs');

const CATALOGS = [
  { kind: 'patches',   dataFile: '_data/patches.yml',   payloadKey: 'banks' },
  { kind: 'sequences', dataFile: '_data/sequences.yml', payloadKey: 'pages' },
];

// yaml.load returns null/undefined for a comments-only file — an EMPTY
// catalog is legitimate now that withdraw exists, so normalize to [].
const load = (rel) => yaml.load(fs.readFileSync(path.join(DOCS, rel), 'utf8')) || [];

for (const { kind, dataFile, payloadKey } of CATALOGS) {
  test(`catalog ${kind} — entries carry every required field`, () => {
    const entries = load(dataFile);
    assert.ok(Array.isArray(entries), `${dataFile} parses to a list`);
    for (const e of entries) {
      for (const field of ['id', 'name', 'author', 'description', 'added', 'file', 'size_bytes']) {
        assert.ok(e[field] !== undefined && e[field] !== null && e[field] !== '',
          `${kind}/${e.id || '(no id)'}: missing ${field}`);
      }
      assert.match(e.id, /^[a-z0-9-]+$/, `${kind}/${e.id}: id must be a kebab-case slug`);
      assert.ok(Array.isArray(e.tags), `${kind}/${e.id}: tags must be a list (use [])`);
      // js-yaml parses bare 2026-06-10 as a Date; quoted stays a string.
      // Accept both, reject anything else.
      const added = e.added instanceof Date ? e.added : new Date(`${e.added}T00:00:00Z`);
      assert.ok(!Number.isNaN(added.getTime()), `${kind}/${e.id}: added must be YYYY-MM-DD`);
    }
  });

  test(`catalog ${kind} — ids are unique`, () => {
    const entries = load(dataFile);
    const ids = entries.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate id in ${dataFile}`);
  });

  test(`catalog ${kind} — payload files exist, sizes match, JSON parses with the right shape`, () => {
    for (const e of load(dataFile)) {
      assert.ok(e.file.startsWith('/library/'), `${kind}/${e.id}: file must live under /library/`);
      const onDisk = path.join(DOCS, e.file);
      assert.ok(fs.existsSync(onDisk), `${kind}/${e.id}: payload missing at docs${e.file}`);
      const stat = fs.statSync(onDisk);
      assert.equal(stat.size, e.size_bytes,
        `${kind}/${e.id}: size_bytes (${e.size_bytes}) != actual (${stat.size}) — update the YAML`);
      const payload = JSON.parse(fs.readFileSync(onDisk, 'utf8'));
      assert.equal(payload.format_version, '1.0', `${kind}/${e.id}: payload format_version`);
      assert.ok(Array.isArray(payload[payloadKey]),
        `${kind}/${e.id}: payload missing ${payloadKey} array`);
    }
  });
}
