'use strict';
// renderer/ping-gate.js — the usage ping's gate, and the new-install flag.
//
// The flag is the reason these exist. It is sent once per install, ever, and
// there is no identifier behind it: if an install sends `first` twice, or an
// existing user sends it at all, nothing downstream can tell. So the rules
// that decide it are the ones worth pinning.
const test = require('node:test');
const assert = require('node:assert');
const { isCounted, planPing, afterSuccess, pingBody } = require('../renderer/ping-gate.js');

const TODAY = '2026-11-25';
const seen = (extra) => ({ noticeSeen: true, enabled: true, ...extra });

test('a fresh install sends first:true, once, and never again', () => {
  const t = seen();
  const plan = planPing(t, TODAY, false);
  assert.deepEqual(plan, { send: true, first: true });

  // the send is confirmed, so the flag is consumed
  Object.assign(t, afterSuccess(TODAY));
  assert.equal(t.installCounted, true);
  assert.equal(t.lastPing, TODAY);

  // later the same day: nothing at all
  assert.deepEqual(planPing(t, TODAY, false), { send: false });
  // the next day: a ping, but no longer a first one
  assert.deepEqual(planPing(t, '2026-11-26', false), { send: true, first: false });
});

test('a library that has ever pinged is never reported as a new install', () => {
  // Every install out there predates installCounted. A lastPing is the proof
  // the app ran before new-install counting existed, so it is not new — this
  // is the derivation that replaces a schema migration.
  const t = seen({ lastPing: '2026-08-01' });
  assert.equal(t.installCounted, undefined);
  assert.equal(isCounted(t), true);
  assert.deepEqual(planPing(t, TODAY, false), { send: true, first: false });
});

test('opting out and back in does not resend first', () => {
  const t = seen();
  Object.assign(t, afterSuccess(TODAY));

  t.enabled = false;
  assert.deepEqual(planPing(t, '2026-11-26', false), { send: false });

  t.enabled = true;
  assert.deepEqual(planPing(t, '2026-11-26', false), { send: true, first: false });
});

test('a failed send leaves the install uncounted, so it retries as first', () => {
  const t = seen();
  assert.equal(planPing(t, TODAY, false).first, true);
  // nothing is written on failure — afterSuccess is simply never applied
  assert.equal(t.installCounted, undefined);
  assert.equal(t.lastPing, undefined);
  assert.deepEqual(planPing(t, TODAY, false), { send: true, first: true });
});

test('nothing is sent before the notice, or after an opt-out', () => {
  assert.deepEqual(planPing({ enabled: true }, TODAY, false), { send: false });
  assert.deepEqual(planPing(seen({ enabled: false }), TODAY, false), { send: false });
  assert.deepEqual(planPing(undefined, TODAY, false), { send: false });
});

test('one attempt at a time', () => {
  assert.deepEqual(planPing(seen(), TODAY, true), { send: false });
});

test('the body carries first ONLY for a literal true', () => {
  const base = { platform: 'mac', version: '0.9.0' };
  assert.deepEqual(pingBody('mac', '0.9.0', { first: true }), { ...base, first: true });

  // Anything truthy-but-not-true is a bug, and a bug that inflated the install
  // count would be invisible. Each of these must produce the OLD body exactly.
  for (const bad of ['true', 'yes', 1, {}, [], 'false']) {
    assert.deepEqual(pingBody('mac', '0.9.0', { first: bad }), base, `first: ${JSON.stringify(bad)}`);
  }
  for (const noOpts of [undefined, null, {}, { first: false }]) {
    assert.deepEqual(pingBody('mac', '0.9.0', noOpts), base);
  }
});
