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

// Stub for buildJxKeyDiagram (defined in app.js; modal-builders.js's
// buildSendRow references it as a global at call time). The actual
// diagram is a complex SVG composition; for unit-test purposes we
// just need SOMETHING DOM-shaped to verify buildSendRow incorporates
// it correctly.
global.buildJxKeyDiagram = ({ action, kind }) => {
  const div = global.document.createElement('div');
  div.className = `jx-key-diagram-stub ${action} ${kind}`;
  div.setAttribute('data-stub', `${action}-${kind}`);
  return div;
};

// Now require the module. It detects `typeof module !== 'undefined'`
// and exports via CommonJS in Node, while still attaching to window
// in the browser path.
const {
  buildRecordTimelineSection,
  buildRecordActions,
  buildSendRow,
  buildSendActions,
  buildSendStatusSection,
} = require('../renderer/modal-builders.js');


// ── buildRecordTimelineSection ─────────────────────────────────────

test('buildRecordTimelineSection — sequence kind: 3 segments (init + sequence + processing)', () => {
  const { timelineSection, timeline, segs, indicator } = buildRecordTimelineSection('sequence');
  assert.ok(timelineSection);
  assert.equal(timelineSection.className, 'record-jx-section');
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map((s) => s.kind),  ['init', 'sequence', 'processing']);
  assert.deepEqual(segs.map((s) => s.pilot), [true,   false,      false]);
  assert.equal(indicator.className, 'send-jx-indicator');
  assert.equal(timeline.querySelectorAll('.send-jx-seg').length, 3);
});

test('buildRecordTimelineSection — tone kind: 5 segments (init + bank-c + divider + bank-d + processing)', () => {
  const { segs } = buildRecordTimelineSection('tone');
  assert.equal(segs.length, 5);
  assert.deepEqual(segs.map((s) => s.kind),  ['init', 'bank-c', 'divider', 'bank-d', 'processing']);
  assert.deepEqual(segs.map((s) => s.pilot), [true,   false,    true,      false,    false]);
});

test('buildRecordTimelineSection — pilot durations are exactly 4.64 s', () => {
  const { segs } = buildRecordTimelineSection('tone');
  const pilots = segs.filter((s) => s.pilot);
  assert.equal(pilots.length, 2);
  pilots.forEach((p) => assert.equal(p.estSec, 4.64));
});

test('buildRecordTimelineSection — processing segment has its fixed estSec (4.0)', () => {
  const tone = buildRecordTimelineSection('tone');
  const seq  = buildRecordTimelineSection('sequence');
  assert.equal(tone.segs.find((s) => s.kind === 'processing').estSec, 4.0);
  assert.equal(seq.segs.find((s) => s.kind === 'processing').estSec,  4.0);
});

test('buildRecordTimelineSection — segment labels are uppercased in DOM', () => {
  const { timeline } = buildRecordTimelineSection('tone');
  const labels = [...timeline.querySelectorAll('.send-jx-seg-label')].map((el) => el.textContent);
  assert.deepEqual(labels, ['INIT', 'BANK C', 'DIVIDER', 'BANK D', 'PROCESSING']);
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

test('buildRecordActions — returns just the Stop button (Cancel replaced by the close-X at modal level)', () => {
  const { actions, stopBtn } = buildRecordActions();
  assert.equal(actions.className, 'modal-actions');
  assert.equal(actions.children.length, 1);
  assert.equal(actions.children[0], stopBtn);
  assert.equal(stopBtn.textContent, '■ Stop');
});

test('buildRecordActions — Stop is disabled by default (enabled after getUserMedia resolves)', () => {
  const { stopBtn } = buildRecordActions();
  assert.equal(stopBtn.disabled, true);
});

test('buildRecordActions — Stop uses the brand-aligned confirm class', () => {
  const { stopBtn } = buildRecordActions();
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

// ── buildSendRow ───────────────────────────────────────────────────

test('buildSendRow — returns sendRow + sendArrow + sendJxLogo + jxKeyDiagram', () => {
  const { sendRow, sendArrow, sendJxLogo, jxKeyDiagram } = buildSendRow('tone', 'Spils Sounds');
  assert.ok(sendRow);
  assert.ok(sendArrow);
  assert.ok(sendJxLogo);
  assert.ok(jxKeyDiagram);
});

test('buildSendRow — row uses capture-mode class (no gain knob) + hidden by default', () => {
  const { sendRow } = buildSendRow('tone', null);
  assert.ok(sendRow.className.includes('record-jx-cal-row'));
  assert.ok(sendRow.className.includes('capture-mode'));
  assert.equal(sendRow.style.display, 'none');
});

test('buildSendRow — sourceLabel populates the "loading: X" label', () => {
  const { sendJxLogo } = buildSendRow('tone', 'Spils Sounds');
  const labelName = sendJxLogo.querySelector('.record-jx-package-label-name');
  assert.ok(labelName, 'package-label-name element should exist when sourceLabel is set');
  assert.equal(labelName.textContent, 'Spils Sounds');
});

test('buildSendRow — null sourceLabel omits the label block entirely', () => {
  const { sendJxLogo } = buildSendRow('tone', null);
  assert.equal(sendJxLogo.querySelector('.record-jx-package-label-name'), null);
});

test('buildSendRow — XSS-safe: uses textContent for the source label', () => {
  // Daniel calls his packages whatever he wants. If a label ever
  // contained HTML (e.g. someone named a package <img onerror=alert(1)>),
  // it must NOT execute. textContent is the right primitive for this.
  const malicious = '<img src=x onerror="alert(1)">';
  const { sendJxLogo } = buildSendRow('tone', malicious);
  const labelName = sendJxLogo.querySelector('.record-jx-package-label-name');
  // The text reads back as the literal string with the angle brackets,
  // not as an interpreted IMG element.
  assert.equal(labelName.textContent, malicious);
  // And the dangerous fragment was NOT injected as actual DOM:
  assert.equal(sendJxLogo.querySelectorAll('img').length, 1);   // just the JX logo
});

test('buildSendRow — DOM order: jxKeyDiagram, arrow, jxLogo (cause→effect L→R)', () => {
  const { sendRow, jxKeyDiagram, sendArrow, sendJxLogo } = buildSendRow('tone', null);
  assert.equal(sendRow.children[0], jxKeyDiagram);
  assert.equal(sendRow.children[1], sendArrow);
  assert.equal(sendRow.children[2], sendJxLogo);
});

test('buildSendRow — kind=sequence passes through to jxKeyDiagram (via stub data attr)', () => {
  const { jxKeyDiagram } = buildSendRow('sequence', null);
  // Our test stub writes data-stub="<action>-<kind>" so we can verify
  // buildSendRow forwarded the kind correctly without depending on the
  // real diagram's internals.
  assert.equal(jxKeyDiagram.getAttribute('data-stub'), 'load-sequence');
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
