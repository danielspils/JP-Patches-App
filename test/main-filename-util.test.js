'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for main-filename-util.js
//
// Pins the sanitize-for-Save-dialog default-filename helper that the
// download-WAV IPC handlers (tape-save-wav-to-path + seq-tape-save-wav-
// to-path) use to pre-fill the user's native macOS Save dialog. A bug
// here surfaces as a weird default filename — the user can still edit
// it, but the defaults should look clean.
//
// Run with:    node --test test/main-filename-util.test.js
// Or all:      node --test test/
// ═══════════════════════════════════════════════════════════════════════════

const test   = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeWavFilename } = require('../main-filename-util.js');

test('sanitizeWavFilename — happy path: plain ASCII name gets .wav suffix', () => {
  assert.equal(sanitizeWavFilename('Spils Sounds'), 'Spils Sounds.wav');
});

test('sanitizeWavFilename — strips an existing .wav extension before re-adding', () => {
  assert.equal(sanitizeWavFilename('Spils Sounds.wav'), 'Spils Sounds.wav');
});

test('sanitizeWavFilename — case-insensitive .wav stripping', () => {
  assert.equal(sanitizeWavFilename('Spils Sounds.WAV'), 'Spils Sounds.wav');
  assert.equal(sanitizeWavFilename('Spils Sounds.Wav'), 'Spils Sounds.wav');
});

test('sanitizeWavFilename — strips path separators (slash + backslash)', () => {
  assert.equal(sanitizeWavFilename('a/b/c'),   'a_b_c.wav');
  assert.equal(sanitizeWavFilename('a\\b\\c'), 'a_b_c.wav');
  assert.equal(sanitizeWavFilename('../etc/passwd'),
    '.._etc_passwd.wav');   // dots survive, separators don\'t
});

test('sanitizeWavFilename — drops non-safe characters', () => {
  // Safe set: A-Z a-z 0-9 space _ - ( ) .
  assert.equal(sanitizeWavFilename('Patch #1 [draft]'),    'Patch 1 draft.wav');
  assert.equal(sanitizeWavFilename('Bass: Pluck!'),         'Bass Pluck.wav');
  assert.equal(sanitizeWavFilename('100% awesome'),         '100 awesome.wav');
});

test('sanitizeWavFilename — keeps the safe punctuation: _ - ( ) .', () => {
  assert.equal(sanitizeWavFilename('Banks_C-D (v2)'),
    'Banks_C-D (v2).wav');
});

test('sanitizeWavFilename — drops Unicode / emoji / non-ASCII', () => {
  assert.equal(sanitizeWavFilename('Café 🎹 résumé'), 'Caf  rsum.wav');
  // Multi-byte chars get dropped; spaces between them survive. Strict
  // sanitizer matches the v0.7.2 implementation's conservative ASCII-only
  // ruleset.
});

test('sanitizeWavFilename — trims surrounding whitespace before suffix', () => {
  assert.equal(sanitizeWavFilename('   Spils Sounds   '), 'Spils Sounds.wav');
});

test('sanitizeWavFilename — falls back to "JP Patches export" on empty', () => {
  assert.equal(sanitizeWavFilename(''),          'JP Patches export.wav');
  assert.equal(sanitizeWavFilename(null),        'JP Patches export.wav');
  assert.equal(sanitizeWavFilename(undefined),   'JP Patches export.wav');
});

test('sanitizeWavFilename — falls back when input is all-stripped', () => {
  // Input is non-empty but contains only chars that get dropped.
  assert.equal(sanitizeWavFilename('!!!@@@###'), 'JP Patches export.wav');
});

test('sanitizeWavFilename — coerces non-string input to string before sanitizing', () => {
  // String(42) === "42"; sanitization should keep digits.
  assert.equal(sanitizeWavFilename(42),    '42.wav');
  assert.equal(sanitizeWavFilename(true),  'true.wav');
});

test('sanitizeWavFilename — strips .wav even when followed by trailing whitespace', () => {
  assert.equal(sanitizeWavFilename('Patch.wav   '), 'Patch.wav');
});

test('sanitizeWavFilename — preserves multiple dots within the name', () => {
  // "C/D banks May 18, 2026" → comma drops, dots survive
  assert.equal(sanitizeWavFilename('C.D.banks'), 'C.D.banks.wav');
});
