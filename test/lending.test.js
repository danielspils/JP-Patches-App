'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for renderer/lending.js
//
// Run with:    node --test test/lending.test.js
// Or all:      node --test test/
// ═══════════════════════════════════════════════════════════════════════════

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLendPayload,
  buildLendIssueUrl,
} = require('../renderer/lending.js');

// ─── buildLendPayload ────────────────────────────────────────────────────────

test('buildLendPayload — tones: download-path shape with _slotMeta', () => {
  const pkg = { banks: [['p1'], ['p2']], slotMeta: { C: [], D: [] } };
  const out = buildLendPayload('tones', pkg);
  assert.deepEqual(out, {
    format_version: '1.0',
    banks: [['p1'], ['p2']],
    _slotMeta: { C: [], D: [] },
  });
});

test('buildLendPayload — tones: _slotMeta omitted when the package has none', () => {
  const out = buildLendPayload('tones', { banks: [[], []] });
  assert.equal('_slotMeta' in out, false);
});

test('buildLendPayload — sequences: export shape with passed-in meta', () => {
  const seq = { tape: { pages: [null, null] } };
  const meta = { customName: 'Friday Morning', app: {} };
  const out = buildLendPayload('sequences', seq, meta);
  assert.deepEqual(out, {
    format_version: '1.0',
    kind: 'sequence',
    pages: [null, null],
    _sequenceMeta: { customName: 'Friday Morning', app: {} },
  });
});

test('buildLendPayload — sequences: missing meta lands as null, not undefined', () => {
  const out = buildLendPayload('sequences', { tape: { pages: [] } });
  assert.equal(out._sequenceMeta, null);
  // JSON round-trip keeps the key (undefined would drop it)
  assert.ok(JSON.parse(JSON.stringify(out))._sequenceMeta === null);
});

// ─── buildLendIssueUrl ───────────────────────────────────────────────────────

const parseUrl = (url) => {
  const u = new URL(url);
  return { base: u.origin + u.pathname, params: u.searchParams };
};

test('buildLendIssueUrl — tones: template, title, field ids match the issue form', () => {
  const { base, params } = parseUrl(
    buildLendIssueUrl('tones', 'Warm Pads', 'Daniel', 'Anchorage, AK', 'nice pads'));
  assert.equal(base, 'https://github.com/danielspils/JP-Patches-App/issues/new');
  assert.equal(params.get('template'), 'share-tones.yml');
  assert.equal(params.get('title'), '[Lend Tones] Warm Pads');
  assert.equal(params.get('package-name'), 'Warm Pads');
  assert.equal(params.get('author'), 'Daniel');
  assert.equal(params.get('hometown'), 'Anchorage, AK');
  assert.equal(params.get('notes'), 'nice pads');
});

test('buildLendIssueUrl — sequences: sequence-name field id + template', () => {
  const { params } = parseUrl(
    buildLendIssueUrl('sequences', 'Friday Morning', 'Daniel'));
  assert.equal(params.get('template'), 'share-sequence.yml');
  assert.equal(params.get('title'), '[Lend Sequence] Friday Morning');
  assert.equal(params.get('sequence-name'), 'Friday Morning');
  assert.equal(params.get('package-name'), null);
});

test('buildLendIssueUrl — empty hometown/notes are omitted entirely', () => {
  const { params } = parseUrl(buildLendIssueUrl('tones', 'X', 'Y', '', ''));
  assert.equal(params.has('hometown'), false);
  assert.equal(params.has('notes'), false);
});

test("buildLendIssueUrl — apostrophes, ampersands, and unicode survive the round-trip", () => {
  const name = "Snail sounds & '80s pads";
  const author = "J.P. Pätches";
  const { params } = parseUrl(buildLendIssueUrl('tones', name, author));
  // URLSearchParams round-trips exactly — what the form receives is what
  // the user typed, regardless of &, ', or non-ASCII.
  assert.equal(params.get('package-name'), name);
  assert.equal(params.get('title'), `[Lend Tones] ${name}`);
  assert.equal(params.get('author'), author);
});

test('buildLendIssueUrl — ampersand in a value does not bleed into other params', () => {
  const { params } = parseUrl(
    buildLendIssueUrl('tones', 'A & B', 'C', 'D', 'notes=fake&author=evil'));
  assert.equal(params.get('package-name'), 'A & B');
  assert.equal(params.get('author'), 'C');           // not 'evil'
  assert.equal(params.get('notes'), 'notes=fake&author=evil');
});
