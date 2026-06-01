'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  selectTapeDumpSpeaker,
  isBuiltInSpeakerOutput,
  MAC_SPEAKER_LABEL_RE,
} = require('../renderer/transmission-sounds.js');

// Convenience builder for an audiooutput device entry.
const out = (label, deviceId = 'id-' + label) => ({ kind: 'audiooutput', label, deviceId });

const CABLE = out('KT USB Audio (31b2:2024)', 'cable-id');

// ── allowlist: every current-lineup Mac built-in speaker label matches ──

const SPEAKER_LABELS = [
  'MacBook Pro Speakers',
  'MacBook Air Speakers',
  'MacBook Speakers',
  'iMac Speakers',
  'Mac mini Speakers',
  'Mac Studio Speakers',
  'Studio Display Speakers',
];

for (const label of SPEAKER_LABELS) {
  test(`selectTapeDumpSpeaker — matches bare "${label}"`, () => {
    const picked = selectTapeDumpSpeaker([CABLE, out(label)], CABLE.deviceId);
    assert.ok(picked, 'should pick a speaker');
    assert.equal(picked.label, label);
  });

  test(`MAC_SPEAKER_LABEL_RE — accepts bare "${label}"`, () => {
    assert.equal(MAC_SPEAKER_LABEL_RE.test(label), true);
  });

  // The REAL Chromium enumerateDevices label carries a " (Built-in)"
  // transport suffix — this is what we actually receive at runtime.
  const builtIn = `${label} (Built-in)`;
  test(`selectTapeDumpSpeaker — matches real label "${builtIn}"`, () => {
    const picked = selectTapeDumpSpeaker([CABLE, out(builtIn)], CABLE.deviceId);
    assert.ok(picked, 'should pick the (Built-in) speaker');
    assert.equal(picked.label, builtIn);
  });

  test(`MAC_SPEAKER_LABEL_RE — accepts "${builtIn}"`, () => {
    assert.equal(MAC_SPEAKER_LABEL_RE.test(builtIn), true);
  });
}

test('MAC_SPEAKER_LABEL_RE — rejects non-Built-in transport suffixes', () => {
  // Only "(Built-in)" is allowed; other transports must not slip through.
  assert.equal(MAC_SPEAKER_LABEL_RE.test('MacBook Pro Speakers (Virtual)'), false);
  assert.equal(MAC_SPEAKER_LABEL_RE.test('MacBook Pro Speakers (USB)'), false);
  assert.equal(MAC_SPEAKER_LABEL_RE.test('Studio Display Speakers (USB)'), false);
});

// ── allowlist: things that must NOT match ──

test('selectTapeDumpSpeaker — cable (USB audio) is never eligible', () => {
  assert.equal(selectTapeDumpSpeaker([CABLE], CABLE.deviceId), null);
});

test('selectTapeDumpSpeaker — "Default - …" duplicate is rejected (no default fallback)', () => {
  // enumerateDevices returns a "Default - MacBook Pro Speakers" alias; the
  // anchored regex must exclude it so we never resolve to the 'default'
  // sink (ambiguous routing).
  const devices = [out('Default - MacBook Pro Speakers', 'default')];
  assert.equal(selectTapeDumpSpeaker(devices, CABLE.deviceId), null);
});

test('selectTapeDumpSpeaker — arbitrary external output is rejected', () => {
  const devices = [out('Studio Display'), out('External Headphones'), out('BenQ Monitor')];
  assert.equal(selectTapeDumpSpeaker(devices, CABLE.deviceId), null);
});

test('selectTapeDumpSpeaker — substring/spoofed speaker labels are rejected', () => {
  // Anchored regex: leading/trailing junk must not slip through.
  const devices = [
    out('My MacBook Pro Speakers'),     // leading text
    out('MacBook Pro Speakers (2)'),    // trailing text
    out('macbook pro speakers'),        // wrong case
    out('MacBook Pro Speaker'),         // singular
  ];
  assert.equal(selectTapeDumpSpeaker(devices, CABLE.deviceId), null);
});

// ── cable-exclusion guard ──

test('selectTapeDumpSpeaker — excludes a matching label if it IS the cable', () => {
  // Pathological: cable somehow labeled like a Mac speaker. deviceId match
  // must still exclude it (guard 2 beats the allowlist).
  const spoofCable = out('MacBook Pro Speakers', 'cable-id');
  assert.equal(selectTapeDumpSpeaker([spoofCable], 'cable-id'), null);
});

test('selectTapeDumpSpeaker — picks the OTHER speaker when one is the cable', () => {
  const spoofCable = out('MacBook Pro Speakers', 'cable-id');
  const realSpeaker = out('MacBook Pro Speakers', 'speaker-id');
  const picked = selectTapeDumpSpeaker([spoofCable, realSpeaker], 'cable-id');
  assert.ok(picked);
  assert.equal(picked.deviceId, 'speaker-id');
});

// ── kind filtering ──

test('selectTapeDumpSpeaker — an audioINPUT with a speaker label is ignored', () => {
  const micNamedLikeSpeaker = { kind: 'audioinput', label: 'MacBook Pro Speakers', deviceId: 'mic' };
  assert.equal(selectTapeDumpSpeaker([micNamedLikeSpeaker], CABLE.deviceId), null);
});

// ── ordering ──

test('selectTapeDumpSpeaker — returns the FIRST eligible match', () => {
  const a = out('MacBook Pro Speakers', 'a');
  const b = out('iMac Speakers', 'b');
  const picked = selectTapeDumpSpeaker([CABLE, a, b], CABLE.deviceId);
  assert.equal(picked.deviceId, 'a');
});

// ── defensive / degenerate inputs ──

test('selectTapeDumpSpeaker — empty labels (no mic permission yet) → null', () => {
  // Fresh install before any getUserMedia grant: labels come back ''.
  const devices = [{ kind: 'audiooutput', label: '', deviceId: 'x' }];
  assert.equal(selectTapeDumpSpeaker(devices, CABLE.deviceId), null);
});

test('selectTapeDumpSpeaker — device missing deviceId is skipped', () => {
  const devices = [{ kind: 'audiooutput', label: 'MacBook Pro Speakers' }];
  assert.equal(selectTapeDumpSpeaker(devices, CABLE.deviceId), null);
});

test('selectTapeDumpSpeaker — device with null deviceId never matches a null cableId', () => {
  // Guards against null === null routing the dump to a bogus sink.
  const devices = [{ kind: 'audiooutput', label: 'MacBook Pro Speakers', deviceId: null }];
  assert.equal(selectTapeDumpSpeaker(devices, null), null);
});

test('selectTapeDumpSpeaker — non-array / nullish input → null', () => {
  assert.equal(selectTapeDumpSpeaker(null, CABLE.deviceId), null);
  assert.equal(selectTapeDumpSpeaker(undefined, CABLE.deviceId), null);
  assert.equal(selectTapeDumpSpeaker('nope', CABLE.deviceId), null);
  assert.equal(selectTapeDumpSpeaker({}, CABLE.deviceId), null);
});

test('selectTapeDumpSpeaker — array with null/garbage entries is tolerated', () => {
  const devices = [null, undefined, 42, out('MacBook Pro Speakers', 'ok')];
  const picked = selectTapeDumpSpeaker(devices, CABLE.deviceId);
  assert.ok(picked);
  assert.equal(picked.deviceId, 'ok');
});

test('selectTapeDumpSpeaker — undefined cableDeviceId still returns a real speaker', () => {
  // If Send didn't pass a cable id, the allowlist alone still protects us;
  // a real speaker should still be eligible.
  const picked = selectTapeDumpSpeaker([out('MacBook Pro Speakers', 's')], undefined);
  assert.ok(picked);
  assert.equal(picked.deviceId, 's');
});

// ── isBuiltInSpeakerOutput (the Send-modal "output is your speakers" warning) ──

test('isBuiltInSpeakerOutput — "Default - …(Built-in)" alias is detected', () => {
  // The system default output is reported with a "Default - " prefix; the
  // helper must strip it so the warning fires.
  assert.equal(isBuiltInSpeakerOutput('Default - MacBook Pro Speakers (Built-in)'), true);
  assert.equal(isBuiltInSpeakerOutput('Default - iMac Speakers (Built-in)'), true);
});

test('isBuiltInSpeakerOutput — bare built-in speaker label is detected', () => {
  assert.equal(isBuiltInSpeakerOutput('MacBook Pro Speakers (Built-in)'), true);
  assert.equal(isBuiltInSpeakerOutput('MacBook Pro Speakers'), true);
});

test('isBuiltInSpeakerOutput — the cable / interfaces do NOT warn', () => {
  assert.equal(isBuiltInSpeakerOutput('Default - KT USB Audio (31b2:2024)'), false);
  assert.equal(isBuiltInSpeakerOutput('KT USB Audio (31b2:2024)'), false);
  assert.equal(isBuiltInSpeakerOutput('AirPods Pro'), false);
  assert.equal(isBuiltInSpeakerOutput('Studio Display Speakers (USB)'), false);  // non-Built-in transport
});

test('isBuiltInSpeakerOutput — empty / non-string input → false', () => {
  assert.equal(isBuiltInSpeakerOutput(''), false);
  assert.equal(isBuiltInSpeakerOutput(null), false);
  assert.equal(isBuiltInSpeakerOutput(undefined), false);
  assert.equal(isBuiltInSpeakerOutput(42), false);
});
