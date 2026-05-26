'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// Set up a global JSDOM environment ONCE so all the modal-builders
// have a `document` to construct against. The renderer expects a
// browser environment; we synthesize the minimum it needs.
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window   = dom.window;
global.document = dom.window.document;
global.HTMLElement   = dom.window.HTMLElement;
global.HTMLButtonElement = dom.window.HTMLButtonElement;

// Now require the module. It detects `typeof module !== 'undefined'`
// and exports via CommonJS in Node, while still attaching to window
// in the browser path.
const {
  buildRecordTimelineSection,
  buildRecordActions,
  buildSendActions,
  buildSendStatusSection,
} = require('../renderer/modal-builders.js');


// ── buildRecordTimelineSection ─────────────────────────────────────

test('buildRecordTimelineSection — sequence kind: 2 segments (init + sequence)', () => {
  const { timelineSection, timeline, segs, indicator } = buildRecordTimelineSection('sequence');
  assert.ok(timelineSection);
  assert.equal(timelineSection.className, 'record-jx-section');
  assert.equal(segs.length, 2);
  assert.equal(segs[0].kind, 'init');
  assert.equal(segs[0].pilot, true);
  assert.equal(segs[1].kind, 'sequence');
  assert.equal(segs[1].pilot, false);
  assert.equal(indicator.className, 'send-jx-indicator');
  assert.equal(timeline.querySelectorAll('.send-jx-seg').length, 2);
});

test('buildRecordTimelineSection — tone kind: 4 segments (init + bank-c + divider + bank-d)', () => {
  const { segs } = buildRecordTimelineSection('tone');
  assert.equal(segs.length, 4);
  assert.deepEqual(segs.map((s) => s.kind), ['init', 'bank-c', 'divider', 'bank-d']);
  assert.deepEqual(segs.map((s) => s.pilot), [true, false, true, false]);
});

test('buildRecordTimelineSection — pilot durations are exactly 4.64 s', () => {
  const { segs } = buildRecordTimelineSection('tone');
  const pilots = segs.filter((s) => s.pilot);
  assert.equal(pilots.length, 2);
  pilots.forEach((p) => assert.equal(p.estSec, 4.64));
});

test('buildRecordTimelineSection — segment labels are uppercased in DOM', () => {
  const { timeline } = buildRecordTimelineSection('tone');
  const labels = [...timeline.querySelectorAll('.send-jx-seg-label')].map((el) => el.textContent);
  assert.deepEqual(labels, ['INIT', 'BANK C', 'DIVIDER', 'BANK D']);
});

test('buildRecordTimelineSection — flexGrow on each segment matches estSec', () => {
  const { segs } = buildRecordTimelineSection('sequence');
  segs.forEach((s) => {
    assert.equal(s.el.style.flexGrow, String(s.estSec));
  });
});

test('buildRecordTimelineSection — indicator starts at left:0%', () => {
  const { indicator } = buildRecordTimelineSection('sequence');
  assert.equal(indicator.style.left, '0%');
});

test('buildRecordTimelineSection — each seg has a className like "send-jx-seg send-jx-seg-<kind>"', () => {
  const { segs } = buildRecordTimelineSection('tone');
  segs.forEach((s) => {
    assert.ok(s.el.className.includes('send-jx-seg'));
    assert.ok(s.el.className.includes(`send-jx-seg-${s.kind}`));
  });
});

// ── buildRecordActions ─────────────────────────────────────────────

test('buildRecordActions — returns Cancel + Stop buttons in that order', () => {
  const { actions, cancelBtn, stopBtn } = buildRecordActions();
  assert.equal(actions.className, 'modal-actions');
  assert.equal(actions.children[0], cancelBtn);
  assert.equal(actions.children[1], stopBtn);
  assert.equal(cancelBtn.textContent, 'Cancel');
  assert.equal(stopBtn.textContent, '■ Stop');
});

test('buildRecordActions — Stop is disabled by default (enabled after getUserMedia resolves)', () => {
  const { stopBtn } = buildRecordActions();
  assert.equal(stopBtn.disabled, true);
});

test('buildRecordActions — Cancel is not disabled', () => {
  const { cancelBtn } = buildRecordActions();
  assert.equal(cancelBtn.disabled, false);
});

test('buildRecordActions — buttons use the brand-aligned button classes', () => {
  const { cancelBtn, stopBtn } = buildRecordActions();
  assert.ok(cancelBtn.className.includes('modal-btn-cancel'));
  assert.ok(stopBtn.className.includes('modal-btn-confirm'));
});

// ── buildSendActions ───────────────────────────────────────────────

test('buildSendActions — returns Cancel + Save + Send in that order', () => {
  const { actions, cancelBtn, saveBtn, primaryBtn } = buildSendActions();
  assert.equal(actions.children[0], cancelBtn);
  assert.equal(actions.children[1], saveBtn);
  assert.equal(actions.children[2], primaryBtn);
});

test('buildSendActions — Save WAV uses the Roland-blue alt style; Send is Roland-green confirm', () => {
  const { saveBtn, primaryBtn } = buildSendActions();
  assert.ok(saveBtn.className.includes('modal-btn-alt'));
  assert.ok(primaryBtn.className.includes('modal-btn-confirm'));
});

test('buildSendActions — primary button starts in "Send to JX-3P" state', () => {
  const { primaryBtn } = buildSendActions();
  assert.equal(primaryBtn.textContent, 'Send to JX-3P');
});

test('buildSendActions — Save button has a tooltip explaining the file alternative', () => {
  const { saveBtn } = buildSendActions();
  assert.match(saveBtn.title, /file instead/i);
});

// ── buildSendStatusSection ─────────────────────────────────────────

test('buildSendStatusSection — empty segments array yields zero segs but valid skeleton', () => {
  const { status, timeline, segs, indicator, statusText } = buildSendStatusSection([]);
  assert.ok(status);
  assert.equal(segs.length, 0);
  assert.equal(indicator.className, 'send-jx-indicator');
  assert.equal(statusText.className, 'send-jx-status-text');
  assert.equal(statusText.textContent, '');
  assert.equal(timeline.style.display, 'none');  // hidden until step 2
});

test('buildSendStatusSection — segment shape is preserved + el is the corresponding DOM node', () => {
  const segments = [
    { kind: 'init', label: 'Init', pilot: true },
    { kind: 'data', label: 'Data', pilot: false },
  ];
  const { segs, timeline } = buildSendStatusSection(segments);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].kind,  'init');
  assert.equal(segs[0].pilot, true);
  assert.equal(segs[1].kind,  'data');
  assert.equal(segs[1].pilot, false);
  assert.ok(segs[0].el);
  assert.ok(segs[1].el);
  assert.equal(timeline.querySelectorAll('.send-jx-seg').length, 2);
});

test('buildSendStatusSection — labels are uppercased', () => {
  const { timeline } = buildSendStatusSection([
    { kind: 'init',     label: 'init pilot' },
    { kind: 'sequence', label: 'sequence body' },
  ]);
  const labels = [...timeline.querySelectorAll('.send-jx-seg-label')].map((el) => el.textContent);
  assert.deepEqual(labels, ['INIT PILOT', 'SEQUENCE BODY']);
});

test('buildSendStatusSection — indicator is the LAST child of timeline (so segs render below it stacking-wise)', () => {
  const { timeline, indicator } = buildSendStatusSection([
    { kind: 'init', label: 'Init' },
    { kind: 'data', label: 'Data' },
  ]);
  assert.equal(timeline.lastElementChild, indicator);
});
