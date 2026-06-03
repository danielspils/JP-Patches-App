'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Main-process filename utilities — pure helpers used by IPC handlers
// in main.js that compose user-facing default filenames for Save dialogs.
//
// Extracted so they can be unit-tested in Node without spinning Electron.
// See test/main-filename-util.test.js.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * sanitizeWavFilename — turn a user-supplied display name (package
 * customName / defaultName, sequence label, etc.) into a safe basename
 * for a Save dialog's `defaultPath`. Strips path separators, drops a
 * trailing `.wav` if present, restricts to a safe character set, trims
 * surrounding whitespace, falls back to a generic name on empty, then
 * re-appends `.wav`.
 *
 * Safe character set: ASCII letters, digits, spaces, `_`, `-`, `(`, `)`,
 * `.`. Anything else (Unicode, symbols, OS-reserved chars) is dropped.
 *
 * @param {string | null | undefined} filename
 *   Raw display name. May contain anything; this function makes no
 *   assumptions about its format.
 * @returns {string}
 *   A safe basename with `.wav` suffix. Always a non-empty string —
 *   falls back to `"JP Patches export.wav"` if input is empty / null /
 *   all-stripped.
 */
function sanitizeWavFilename(filename) {
  // Order matters: trim() first so a trailing-whitespace ".wav" still
  // matches the strip regex (test caught this — "Patch.wav   " was
  // returning "Patch.wav.wav" because the $ anchor didn't match with
  // trailing spaces, leaving .wav in the basename, then re-adding it).
  const safe = String(filename || 'JP Patches export')
    .trim()
    .replace(/[\\/]/g, '_')
    .replace(/\.wav$/i, '')
    .replace(/[^A-Za-z0-9 _\-().]/g, '')
    .trim()
    || 'JP Patches export';
  return safe + '.wav';
}

module.exports = { sanitizeWavFilename };
