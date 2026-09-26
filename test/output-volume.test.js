'use strict';

// Unit tests for the Send modal's low-output warning logic
// (renderer/output-volume.js — the trap #39 detector). Pure: probe device
// list + picked label in, warning decision out.

const test = require('node:test');
const assert = require('node:assert/strict');

const { pickOutputDevice, describeLowOutput, FULL_ENOUGH } = require('../renderer/output-volume.js');

const KT = { name: 'KT USB Audio 2', volume: 0.757, db: -6.5, muted: false };

test('pickOutputDevice matches probe names against Chromium labels by containment', () => {
  const devices = [
    { name: 'MacBook Pro Speakers', volume: 0.875, muted: false },
    { name: 'KT USB Audio', volume: 1.0, muted: false },
    KT,
  ];
  // Chromium label contains the probe name — longest name wins, so the
  // output half ("KT USB Audio 2") beats the bare "KT USB Audio".
  assert.equal(pickOutputDevice(devices, 'KT USB Audio 2 (31b2:2024)'), KT);
  // Probe name contains the label works too.
  assert.equal(pickOutputDevice(devices, 'KT USB Audio 2').name, 'KT USB Audio 2');
  // No match → null, never a guess.
  assert.equal(pickOutputDevice(devices, 'Scarlett 2i2'), null);
  assert.equal(pickOutputDevice(devices, ''), null);
  assert.equal(pickOutputDevice(null, 'KT USB Audio 2'), null);
});

test('describeLowOutput: the real 2026-09-24 reading warns with % and dB', () => {
  const w = describeLowOutput(KT);
  assert.equal(w.level, 'low');
  assert.match(w.text, /76%/);
  // CoreAudio's own dB figure — matches what Audio MIDI Setup shows, NOT
  // 20*log10(0.757) = -2.4 (the scalar-to-dB curve is device-specific).
  assert.match(w.text, /-6\.5 dB/);
  assert.match(w.text, /Audio MIDI Setup/);
  // Daniel's approved copy (2026-09-26), pinned verbatim.
  assert.equal(w.text,
    'The cable’s output volume is turned down in macOS (76%, -6.5 dB) '
    + '— your JX may reject the send. Increase to 0 dB in Audio MIDI Setup (Output tab).');
});

test('describeLowOutput: full, no-control, and missing devices warn about nothing', () => {
  assert.equal(describeLowOutput({ name: 'KT', volume: 1.0, muted: false }), null);
  // A hair under full is a maxed slider on some drivers, not a user turning
  // it down — below FULL_ENOUGH warns, at or above does not.
  assert.equal(describeLowOutput({ name: 'KT', volume: FULL_ENOUGH, muted: false }), null);
  assert.notEqual(describeLowOutput({ name: 'KT', volume: FULL_ENOUGH - 0.01, muted: false }), null);
  // volume null = the device has no volume control — nothing can be low.
  assert.equal(describeLowOutput({ name: 'Pro Tools Audio Bridge', volume: null, muted: false }), null);
  assert.equal(describeLowOutput(null), null);
});

test('describeLowOutput: mute outranks volume and says the JX gets nothing', () => {
  const w = describeLowOutput({ name: 'KT', volume: 1.0, muted: true });
  assert.equal(w.level, 'muted');
  assert.match(w.text, /MUTED/);
  assert.match(w.text, /receive nothing/);
});
