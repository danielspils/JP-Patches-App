'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for the lending-library auto-publish trust boundary
// (scripts/lend-publish-lib.mjs).
//
// These functions decide what a STRANGER'S submission is allowed to do
// to the repo: validatePayload bounds the data, yamlQuote blocks YAML
// injection into the catalog, cleanText blocks newline smuggling past
// yamlQuote, contentHash is the dedup identity, and findEntryByTokenHash
// is what lets a withdraw request delete a catalog entry. Every rule
// pinned here is one a hostile submission would probe.
//
// The lib is ESM; this suite (like the rest of test/) is CJS — bridge
// via dynamic import resolved once and awaited inside each test.
//
// Run with:    node --test test/lend-publish-lib.test.js
// ═══════════════════════════════════════════════════════════════════════════

const test   = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const libP = import('../scripts/lend-publish-lib.mjs');

// ── fixtures ──────────────────────────────────────────────────────────

const validPatch = () => {
  const p = {};
  for (let i = 0; i < 32; i++) p[`param_${i}`] = i;
  return p;
};
const validTones = () => ({
  format_version: '1.0',
  banks: [
    Array.from({ length: 16 }, validPatch),
    Array.from({ length: 16 }, validPatch),
  ],
});
const validSequence = () => ({
  format_version: '1.0',
  kind: 'sequence',
  pages: Array.from({ length: 8 }, () => ({ steps: [1, 2, 3] })),
});

// ── validatePayload — tones ───────────────────────────────────────────

test('validatePayload accepts a well-formed tones payload', async () => {
  const { validatePayload } = await libP;
  assert.equal(validatePayload('tones', validTones()), null);
});

test('validatePayload rejects non-object / wrong format_version', async () => {
  const { validatePayload } = await libP;
  assert.match(validatePayload('tones', null), /not an object/);
  assert.match(validatePayload('tones', 'hi'), /not an object/);
  assert.match(validatePayload('tones', { format_version: '2.0', banks: [] }), /format_version/);
  assert.match(validatePayload('tones', { banks: [[], []] }), /format_version/);
});

test('validatePayload rejects wrong bank/patch counts', async () => {
  const { validatePayload } = await libP;
  const oneBank = validTones();
  oneBank.banks.pop();
  assert.match(validatePayload('tones', oneBank), /2 arrays/);

  const shortBank = validTones();
  shortBank.banks[1].pop();
  assert.match(validatePayload('tones', shortBank), /16 patches/);
});

test('validatePayload rejects structurally hostile patches', async () => {
  const { validatePayload } = await libP;

  const arrayPatch = validTones();
  arrayPatch.banks[0][3] = [1, 2, 3];
  assert.match(validatePayload('tones', arrayPatch), /must be an object/);

  const fewParams = validTones();
  fewParams.banks[0][0] = { a: 1 };
  assert.match(validatePayload('tones', fewParams), /params/);

  const manyParams = validTones();
  manyParams.banks[0][0] = Object.fromEntries(
    Array.from({ length: 49 }, (_, i) => [`k${i}`, 1]));
  assert.match(validatePayload('tones', manyParams), /params/);

  const nested = validTones();
  nested.banks[0][0].dco1_range = { evil: 'payload' };
  assert.match(validatePayload('tones', nested), /non-scalar/);

  const longKey = validTones();
  longKey.banks[0][0]['k'.repeat(41)] = 1;
  assert.match(validatePayload('tones', longKey), /non-scalar/);

  const longVal = validTones();
  longVal.banks[0][0].param_0 = 'x'.repeat(65);
  assert.match(validatePayload('tones', longVal), /too long/);
});

test('validatePayload allows null + boolean + short-string scalars', async () => {
  const { validatePayload } = await libP;
  const t = validTones();
  t.banks[0][0].param_0 = null;
  t.banks[0][0].param_1 = true;
  t.banks[0][0].param_2 = 'square';
  assert.equal(validatePayload('tones', t), null);
});

// ── validatePayload — sequences ───────────────────────────────────────

test('validatePayload accepts a well-formed sequence payload', async () => {
  const { validatePayload } = await libP;
  assert.equal(validatePayload('sequences', validSequence()), null);
});

test('validatePayload rejects malformed sequences', async () => {
  const { validatePayload } = await libP;

  const noKind = validSequence();
  delete noKind.kind;
  assert.match(validatePayload('sequences', noKind), /kind/);

  const sevenPages = validSequence();
  sevenPages.pages.pop();
  assert.match(validatePayload('sequences', sevenPages), /8/);

  const bloated = validSequence();
  bloated.pages[0] = { steps: 'x'.repeat(200001) };
  assert.match(validatePayload('sequences', bloated), /implausibly large/);
});

// ── contentHash — dedup identity ──────────────────────────────────────

test('contentHash ignores metadata, sees only banks/pages', async () => {
  const { contentHash } = await libP;
  const a = validTones();
  const b = validTones();
  b.extra_metadata = 'renamed by a sneaky resubmitter';
  assert.equal(contentHash('tones', a), contentHash('tones', b));

  const c = validTones();
  c.banks[1][15].param_5 = 999;
  assert.notEqual(contentHash('tones', a), contentHash('tones', c));

  const s1 = validSequence();
  const s2 = validSequence();
  s2.pages[7].steps.push(4);
  assert.notEqual(contentHash('sequences', s1), contentHash('sequences', s2));
});

// ── slugify + uniqueId ────────────────────────────────────────────────

test('slugify produces clean kebab-case ids', async () => {
  const { slugify } = await libP;
  assert.equal(slugify("Martin Crane's DUMBO Sounds!"), 'martin-crane-s-dumbo-sounds');
  assert.equal(slugify('  --Weird   input--  '), 'weird-input');
  assert.equal(slugify('日本語のみ'), 'lent');          // nothing survivable → fallback
  assert.equal(slugify('x'.repeat(100)).length, 48);   // hard cap
});

test('uniqueId suffixes on collision', async () => {
  const { uniqueId } = await libP;
  const taken = new Set(['spils-sounds', 'spils-sounds-2']);
  assert.equal(uniqueId('Spils Sounds', new Set()), 'spils-sounds');
  assert.equal(uniqueId('Spils Sounds', taken), 'spils-sounds-3');
});

// ── cleanText + yamlQuote — the YAML injection guard ──────────────────

test('cleanText strips control chars, trims, caps length', async () => {
  const { cleanText } = await libP;
  assert.equal(cleanText('  hi\u0000the\u001fre\u007f  ', 80), 'hi the re');
  assert.equal(cleanText('abcdef', 3), 'abc');
  assert.equal(cleanText(null, 80), '');
  assert.equal(cleanText(undefined, 80), '');
});

test('yamlQuote doubles single quotes (injection-safe scalar)', async () => {
  const { yamlQuote } = await libP;
  assert.equal(yamlQuote("Marty's"), "'Marty''s'");
  assert.equal(yamlQuote(''), "''");
});

test('cleanText + yamlQuote defeats a newline-based YAML injection', async () => {
  const { cleanText, yamlQuote } = await libP;
  // A hostile "name" tries to terminate the scalar and inject a new
  // catalog field. cleanText flattens the newline before yamlQuote
  // wraps it — the output must stay a single line.
  const hostile = "innocent'\n  file: /etc/passwd\n  evil: 'yes";
  const quoted = yamlQuote(cleanText(hostile, 80));
  assert.ok(!quoted.includes('\n'), 'quoted scalar must be single-line');
  assert.ok(quoted.startsWith("'") && quoted.endsWith("'"));
});

// ── issue-body parsing ────────────────────────────────────────────────

test('extractMeta / extractToken / extractJsonFence parse a relay issue body', async () => {
  const { extractMeta, extractToken, extractJsonFence } = await libP;
  const body = [
    '**Package name:** Spils Sounds',
    '**Author:** Daniel Spils',
    '**Hometown:** Seattle, WA',
    '',
    '<!-- lend-token: abc123XYZ -->',
    '',
    '```json',
    '{"format_version":"1.0"}',
    '```',
  ].join('\n');
  assert.equal(extractMeta(body, 'Package name'), 'Spils Sounds');
  assert.equal(extractMeta(body, 'Author'), 'Daniel Spils');
  assert.equal(extractMeta(body, 'Notes'), '');
  assert.equal(extractToken(body), 'abc123XYZ');
  assert.deepEqual(JSON.parse(extractJsonFence(body)), { format_version: '1.0' });
});

test('parsers return empty/null on absent pieces (never throw)', async () => {
  const { extractMeta, extractToken, extractJsonFence } = await libP;
  assert.equal(extractMeta('', 'Author'), '');
  assert.equal(extractMeta(null, 'Author'), '');
  assert.equal(extractToken('no token here'), null);
  assert.equal(extractJsonFence('no fence'), null);
});

// ── findEntryByTokenHash — the withdraw matcher ───────────────────────

const sampleYaml = (hash) => `# Community library — shared Tones.
#
- id: first-entry
  name: 'First'
  token_hash: ${'0'.repeat(64)}
- id: target-entry
  name: 'Target'
  token_hash: ${hash}
- id: no-token-entry
  name: 'Legacy (pre-withdraw)'
`;

test('findEntryByTokenHash finds the right block', async () => {
  const { findEntryByTokenHash } = await libP;
  const hash = createHash('sha256').update('secret-token').digest('hex');
  const text = sampleYaml(hash);
  const found = findEntryByTokenHash(text, hash);
  assert.ok(found, 'entry should be found');
  assert.equal(found.id, 'target-entry');
  assert.ok(found.block.includes("name: 'Target'"));
  assert.ok(!found.block.includes('first-entry'), 'block must not bleed into neighbors');
  assert.ok(!found.block.includes('no-token-entry'));
  // The caller splices with replace() — block must be verbatim text.
  assert.ok(text.includes(found.block));
});

test('findEntryByTokenHash returns null when nothing matches', async () => {
  const { findEntryByTokenHash } = await libP;
  const text = sampleYaml('f'.repeat(64));
  assert.equal(findEntryByTokenHash(text, 'a'.repeat(64)), null);
  assert.equal(findEntryByTokenHash('', 'a'.repeat(64)), null);
  assert.equal(findEntryByTokenHash(null, 'a'.repeat(64)), null);
});
