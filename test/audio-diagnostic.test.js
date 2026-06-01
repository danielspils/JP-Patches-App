'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  categorizeAudioDiagnostic,
  buildAudioDiagnosticIssueUrl,
} = require('../renderer/audio-diagnostic.js');
const { MAC_SPEAKER_LABEL_RE } = require('../renderer/transmission-sounds.js');

// Convenience: build a device entry. Defaults to audiooutput + a generated id.
const out = (label, deviceId = 'id-' + label, kind = 'audiooutput') =>
  ({ kind, label, deviceId });

// ── 'ok' status: at least one device matches the allowlist ───────

test('categorize → ok when MacBook Pro Speakers (Built-in) present alongside the cable', () => {
  const r = categorizeAudioDiagnostic([
    out('MacBook Pro Speakers (Built-in)'),
    out('KT USB Audio (31b2:2024)'),
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'ok');
  assert.equal(r.speakerMatch.label, 'MacBook Pro Speakers (Built-in)');
  assert.equal(r.audioOutputs.length, 2);
});

test('categorize → ok when the match is the only device', () => {
  const r = categorizeAudioDiagnostic([out('Mac Studio Speakers')], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'ok');
  assert.equal(r.speakerMatch.label, 'Mac Studio Speakers');
});

test('categorize → ok preserves the order from enumerateDevices (first match wins)', () => {
  // If macOS ever returned two matching speakers, we pick the first.
  const r = categorizeAudioDiagnostic([
    out('iMac Speakers',            'id-1'),
    out('MacBook Pro Speakers',     'id-2'),
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'ok');
  assert.equal(r.speakerMatch.deviceId, 'id-1');
});

// ── 'no-match' status: outputs exist + are labeled + none match ──

test('categorize → no-match when only external/USB devices present', () => {
  const r = categorizeAudioDiagnostic([
    out('KT USB Audio (31b2:2024)'),
    out('Studio Display'),                // not "Studio Display Speakers"
    out('BenQ Monitor'),
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'no-match');
  assert.equal(r.speakerMatch, null);
  assert.equal(r.audioOutputs.length, 3);
});

test('categorize → no-match when only the "Default - …" alias is the candidate', () => {
  // The Default- alias is intentionally excluded from the regex so we
  // never resolve routing to the ambiguous 'default' sink.
  const r = categorizeAudioDiagnostic([
    out('Default - MacBook Pro Speakers (Built-in)', 'default'),
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'no-match');
  assert.equal(r.speakerMatch, null);
});

test('categorize → no-match when allowlist regex format hypothetically changes', () => {
  // Simulating macOS changing the format to e.g. "(Internal)" instead of
  // "(Built-in)" — exactly the regression this diagnostic is designed
  // to surface. Status flips to 'no-match' even though a "speaker" is
  // there, so the user sees the inline notice.
  const r = categorizeAudioDiagnostic([
    out('MacBook Pro Speakers (Internal)'),
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'no-match');
});

// ── 'no-outputs' status: no audiooutput devices at all ───────────

test('categorize → no-outputs when the array is empty', () => {
  const r = categorizeAudioDiagnostic([], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'no-outputs');
  assert.equal(r.audioOutputs.length, 0);
  assert.equal(r.speakerMatch, null);
});

test('categorize → no-outputs when only audioinput devices present', () => {
  const r = categorizeAudioDiagnostic([
    out('KT USB Audio (31b2:2024)', 'mic-id', 'audioinput'),
    out('MacBook Pro Microphone',   'mic2',   'audioinput'),
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'no-outputs');
  assert.equal(r.audioOutputs.length, 0);
});

test('categorize → no-outputs for null/undefined/non-array inputs', () => {
  assert.equal(categorizeAudioDiagnostic(null,        MAC_SPEAKER_LABEL_RE).status, 'no-outputs');
  assert.equal(categorizeAudioDiagnostic(undefined,   MAC_SPEAKER_LABEL_RE).status, 'no-outputs');
  assert.equal(categorizeAudioDiagnostic('not array', MAC_SPEAKER_LABEL_RE).status, 'no-outputs');
});

// ── 'empty-labels' status: outputs present but ALL labels are blank ─

test('categorize → empty-labels when mic perm not granted (labels all blank)', () => {
  // Pre-permission Chromium state: enumerateDevices returns audiooutput
  // entries with empty deviceIds AND empty labels. After mic permission
  // is granted once, labels reveal permanently.
  const r = categorizeAudioDiagnostic([
    { kind: 'audiooutput', label: '', deviceId: '' },
    { kind: 'audiooutput', label: '', deviceId: '' },
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'empty-labels');
  assert.equal(r.audioOutputs.length, 2);
  assert.equal(r.speakerMatch, null);
});

test('categorize → ok if ANY label is non-empty + matches (mixed empties + real label)', () => {
  // Hybrid edge: most labels blank but at least one populated and matches.
  // Speaker match wins; status is 'ok', not 'empty-labels'.
  const r = categorizeAudioDiagnostic([
    { kind: 'audiooutput', label: '', deviceId: 'a' },
    out('MacBook Pro Speakers (Built-in)'),
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'ok');
});

// ── degenerate / safety ─────────────────────────────────────────

test('categorize → no-match when regex param is null', () => {
  // The browser wrapper falls back to null when window globals are
  // missing; the pure function should treat it as "nothing matches."
  const r = categorizeAudioDiagnostic([out('MacBook Pro Speakers')], null);
  assert.equal(r.status, 'no-match');
  assert.equal(r.speakerMatch, null);
});

test('categorize → no-match if a "match" candidate is missing deviceId', () => {
  // speakerMatch requires routable deviceId, so a label-matching device
  // with empty deviceId can't be the match. The other device (KT cable)
  // also doesn't match, so status is 'no-match'.
  const r = categorizeAudioDiagnostic([
    { kind: 'audiooutput', label: 'MacBook Pro Speakers', deviceId: '' },
    out('KT USB Audio (31b2:2024)'),
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'no-match');
  assert.equal(r.audioOutputs.length, 2);   // both still surface in the list
});

test('categorize → tolerates null/undefined entries inside the array', () => {
  const r = categorizeAudioDiagnostic([
    null,
    undefined,
    out('MacBook Pro Speakers (Built-in)'),
  ], MAC_SPEAKER_LABEL_RE);
  assert.equal(r.status, 'ok');
});

// ── buildAudioDiagnosticIssueUrl: GitHub Issue pre-fill URL ──────

test('buildAudioDiagnosticIssueUrl → returns the JP Patches repo issue URL by default', () => {
  const url = buildAudioDiagnosticIssueUrl({
    diag: { audioOutputs: [], speakerMatch: null, status: 'no-outputs' },
  });
  assert.ok(url.startsWith('https://github.com/danielspils/JP-Patches-App/issues/new?'));
});

test('buildAudioDiagnosticIssueUrl → URL-encodes title containing the status', () => {
  const url = buildAudioDiagnosticIssueUrl({
    diag: { audioOutputs: [], speakerMatch: null, status: 'no-match' },
  });
  // URLSearchParams round-trips title back to the original
  const params = new URL(url).searchParams;
  assert.match(params.get('title'), /Tape Dump Sounds.*built-in speakers not detected.*no-match/);
});

test('buildAudioDiagnosticIssueUrl → body includes app version, macOS, regex, status', () => {
  const url = buildAudioDiagnosticIssueUrl({
    diag: { audioOutputs: [], speakerMatch: null, status: 'no-match' },
    appVersion:   '0.6.4',
    macOsRelease: '14.5 (Sonoma)',
    regexSource:  MAC_SPEAKER_LABEL_RE.source,
  });
  const body = new URL(url).searchParams.get('body');
  assert.match(body, /JP Patches version:\*\*\s*0\.6\.4/);
  assert.match(body, /macOS:\*\*\s*14\.5 \(Sonoma\)/);
  assert.match(body, /Diagnostic status:\*\*\s*`no-match`/);
  assert.match(body, /\(MacBook\(/);                   // the regex's first capture group leaked in
});

test('buildAudioDiagnosticIssueUrl → body lists each device with MATCH marker on the matched one', () => {
  const speakers = out('MacBook Pro Speakers (Built-in)', 'spk-1');
  const cable    = out('KT USB Audio (31b2:2024)', 'cbl-1');
  const url = buildAudioDiagnosticIssueUrl({
    diag: {
      audioOutputs: [speakers, cable],
      speakerMatch: speakers,
      status: 'ok',
    },
  });
  const body = new URL(url).searchParams.get('body');
  assert.match(body, /✅ MATCH.*MacBook Pro Speakers \(Built-in\).*spk-1/);
  assert.match(body, /·.*KT USB Audio \(31b2:2024\).*cbl-1/);
});

test('buildAudioDiagnosticIssueUrl → handles devices with empty labels (mic perm not granted)', () => {
  const url = buildAudioDiagnosticIssueUrl({
    diag: {
      audioOutputs: [{ kind: 'audiooutput', label: '', deviceId: 'x' }],
      speakerMatch: null,
      status: 'empty-labels',
    },
  });
  const body = new URL(url).searchParams.get('body');
  assert.match(body, /label hidden — mic permission not granted/);
});

test('buildAudioDiagnosticIssueUrl → body shows "(none)" when no audio outputs', () => {
  const url = buildAudioDiagnosticIssueUrl({
    diag: { audioOutputs: [], speakerMatch: null, status: 'no-outputs' },
  });
  const body = new URL(url).searchParams.get('body');
  assert.match(body, /Audio outputs reported by the OS[\s\S]*\(none\)/);
});

test('buildAudioDiagnosticIssueUrl → labels include "audio,bug"', () => {
  const url = buildAudioDiagnosticIssueUrl({
    diag: { audioOutputs: [], speakerMatch: null, status: 'no-outputs' },
  });
  assert.equal(new URL(url).searchParams.get('labels'), 'audio,bug');
});

test('buildAudioDiagnosticIssueUrl → defaults unknown fields gracefully (no opts at all)', () => {
  const url = buildAudioDiagnosticIssueUrl();
  // Doesn't throw, still produces a valid URL with unknown fields
  const body = new URL(url).searchParams.get('body');
  assert.match(body, /JP Patches version:\*\*\s*unknown/);
  assert.match(body, /macOS:\*\*\s*unknown/);
});

test('buildAudioDiagnosticIssueUrl → custom repoUrl is honored', () => {
  const url = buildAudioDiagnosticIssueUrl({
    diag: { audioOutputs: [], speakerMatch: null, status: 'no-outputs' },
    repoUrl: 'https://github.com/example/test-repo',
  });
  assert.ok(url.startsWith('https://github.com/example/test-repo/issues/new?'));
});
