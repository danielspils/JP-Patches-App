// Pure logic shared by the lending-library automation scripts
// (publish-lend.mjs + withdraw-lend.mjs). No I/O, no env, no GitHub —
// everything here is deterministic on its inputs, which is what makes
// it unit-testable (test/lend-publish-lib.test.js). The scripts keep
// the side-effectful pipeline (fetch issue, write files, git, close).
//
// This module is the TRUST BOUNDARY of auto-publish: validatePayload
// decides what strangers' submissions are allowed to land in the
// catalog, yamlQuote is the YAML-injection guard, and contentHash is
// the dedup identity. Changes here deserve a test first.

import { createHash } from 'node:crypto';

const isScalar = (v) =>
  v === null || ['number', 'string', 'boolean'].includes(typeof v);

// Pragmatic-strict payload validation. The payload is pure data — this
// doesn't replicate jx3p's full schema, but bounds every dimension so
// nothing structurally weird or bloated can land in the catalog.
// Returns null when valid, else a human-readable reason string.
export function validatePayload(kind, payload) {
  if (!payload || typeof payload !== 'object') return 'payload is not an object';
  if (payload.format_version !== '1.0') return 'format_version must be "1.0"';
  if (kind === 'tones') {
    const banks = payload.banks;
    if (!Array.isArray(banks) || banks.length !== 2) return 'banks must be 2 arrays';
    for (const bank of banks) {
      if (!Array.isArray(bank) || bank.length !== 16) return 'each bank must hold 16 patches';
      for (const patch of bank) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'each patch must be an object';
        const keys = Object.keys(patch);
        if (keys.length < 16 || keys.length > 48) return `patch has ${keys.length} params (expected ~32)`;
        for (const [k, v] of Object.entries(patch)) {
          if (k.length > 40 || !isScalar(v)) return `patch param ${k} has a non-scalar value`;
          if (typeof v === 'string' && v.length > 64) return `patch param ${k} value too long`;
        }
      }
    }
  } else {
    if (payload.kind !== 'sequence') return 'sequence payload missing kind:"sequence"';
    const pages = payload.pages;
    if (!Array.isArray(pages) || pages.length !== 8) return 'pages must be an array of 8';
    if (JSON.stringify(pages).length > 200000) return 'sequence data implausibly large';
  }
  return null;
}

// Hash CONTENT identity only — banks/pages, not the name metadata — so
// renaming a previously published file doesn't beat the dedup.
export const contentHash = (kind, payload) =>
  createHash('sha256')
    .update(JSON.stringify(kind === 'tones' ? payload.banks : payload.pages))
    .digest('hex');

export const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'lent';

// Strip control chars (incl. newlines — they'd break the single-quoted
// YAML scalar yamlQuote emits), trim, cap length.
export const cleanText = (v, max) =>
  String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

// Single-quoted YAML scalar: the only escape is '' for a literal quote,
// so doubling is a complete injection guard — provided the input has no
// newlines, which cleanText guarantees upstream.
export const yamlQuote = (v) => `'${String(v).replace(/'/g, "''")}'`;

// ── issue-body parsing (publish side) ────────────────────────────────

export const extractMeta = (body, label) => {
  const m = String(body || '').match(new RegExp(`\\*\\*${label}:\\*\\* (.+)`));
  return m ? m[1].trim() : '';
};

export const extractToken = (body) => {
  const m = String(body || '').match(/<!-- lend-token: (.+?) -->/);
  return m ? m[1].trim() : null;
};

export const extractJsonFence = (body) => {
  const m = String(body || '').match(/```json\n([\s\S]*?)\n```/);
  return m ? m[1] : null;
};

// Unique id: the slug, suffixed -2, -3, ... on collision.
export function uniqueId(name, takenIds) {
  const base = slugify(name);
  let id = base;
  for (let n = 2; takenIds.has(id); n++) id = `${base}-${n}`;
  return id;
}

// ── catalog matching (withdraw side) ─────────────────────────────────

// Find the "- id: ..." YAML block carrying a given token_hash. Returns
// { id, block } or null. The block is verbatim text so the caller can
// splice it out of the file with a plain string replace.
export function findEntryByTokenHash(yamlText, hash) {
  const blocks = String(yamlText || '').split(/^(?=- id: )/m);
  for (const block of blocks) {
    if (block.includes(`token_hash: ${hash}`)) {
      const idM = block.match(/^- id: (.+)$/m);
      if (idM) return { id: idM[1].trim(), block };
    }
  }
  return null;
}
