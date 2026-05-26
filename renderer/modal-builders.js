'use strict';

/* global buildJxKeyDiagram */
// buildJxKeyDiagram is declared in app.js (which loads after this file)
// and used by buildSendRow below. The /* global */ directive tells
// ESLint the reference is intentional without making it a project-wide
// global (which would defeat the no-redeclare check that catches
// shadow-bug duplicates like isDecodeAllDefault). Tests stub via
// `global.buildJxKeyDiagram = ...` before requiring this module.

// ═══════════════════════════════════════════════════════════════════════════
// Modal-construction builders.
//
// Pure DOM-construction functions extracted from app.js so they can be
// unit-tested in isolation (under JSDOM in test/modal-builders.test.js).
// Each builder builds one self-contained chunk of a modal and returns
// the constructed elements; the modal-orchestrator code in app.js
// composes them + wires events.
//
// Loaded via <script> tag in renderer/index.html before app.js so the
// global helpers (buildRecordTimelineSection, etc.) are visible at
// app.js execution time. Also exported via module.exports for the
// JSDOM test harness.
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  } else {
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ── Record-from-JX timeline section ───────────────────────────────────────
  //
  // The "WHAT THE JX-3P SENDS:" segmented progress bar. Segment definitions
  // vary by kind (tone vs sequence) but the construction shape is identical.
  // The tickMeter raf loop advances the indicator + lights up the active
  // segment based on the returned segs array; the modal stores the
  // indicator/segs in scope for that.

  /**
   * @typedef {Object} RecordTimelineSegment
   * @property {string} kind   'init' | 'sequence' | 'bank-c' | 'divider' | 'bank-d'
   * @property {string} label  Display label (uppercased in DOM)
   * @property {boolean} pilot True for pilot-tone segments
   * @property {number} estSec Estimated duration in seconds
   * @property {HTMLElement} el The seg div element
   */

  /**
   * @param {'tone' | 'sequence'} kind Which timeline shape to build
   * @returns {{
   *   timelineSection: HTMLElement,
   *   timeline:        HTMLElement,
   *   segs:            RecordTimelineSegment[],
   *   indicator:       HTMLElement,
   * }}
   */
  function buildRecordTimelineSection(kind) {
    const timelineSection = document.createElement('div');
    timelineSection.className = 'record-jx-section';
    const timelineLabel = document.createElement('label');
    timelineLabel.textContent = 'WHAT THE JX-3P SENDS:';
    const timeline = document.createElement('div');
    timeline.className = 'send-jx-timeline';

    const segs = (kind === 'sequence'
      ? [
          { kind: 'init',     label: 'Init',     pilot: true  },
          { kind: 'sequence', label: 'Sequence', pilot: false },
        ]
      : [
          { kind: 'init',    label: 'Init',    pilot: true  },
          { kind: 'bank-c',  label: 'Bank C',  pilot: false },
          { kind: 'divider', label: 'Divider', pilot: true  },
          { kind: 'bank-d',  label: 'Bank D',  pilot: false },
        ]
    ).map((cfg) => {
      const seg = document.createElement('div');
      seg.className = `send-jx-seg send-jx-seg-${cfg.kind}`;
      // Approximate per-segment durations (seconds) derived from JX-3P
      // tape-format math: pilots are 4096 bits × 50 samples/bit ÷ 44100 Hz
      // ≈ 4.64 s; data sections depend on bit content (ONE=50 samples vs
      // ZERO=11 — 4.5× asymmetry). Used only for the progress bar's
      // visual proportions; auto-stop is governed by EXPECTED_SIGNAL_MS
      // and silence-detection regardless.
      cfg.estSec = cfg.pilot
        ? 4.64
        : kind === 'sequence' ? 22.0 : 16.0;
      seg.style.flexGrow = String(cfg.estSec);
      const label = document.createElement('span');
      label.className = 'send-jx-seg-label';
      label.textContent = cfg.label.toUpperCase();
      seg.appendChild(label);
      timeline.appendChild(seg);
      return Object.assign({}, cfg, { el: seg });
    });

    const indicator = document.createElement('div');
    indicator.className = 'send-jx-indicator';
    indicator.style.left = '0%';
    timeline.appendChild(indicator);
    timelineSection.appendChild(timelineLabel);
    timelineSection.appendChild(timeline);

    return { timelineSection, timeline, segs, indicator };
  }

  // ── Record-from-JX actions row ────────────────────────────────────────────
  //
  // Cancel + Stop buttons. Stop is pre-disabled (enabled after
  // getUserMedia resolves so a too-fast Stop click doesn't fire into a
  // half-initialized state).

  /**
   * @returns {{
   *   actions:   HTMLElement,
   *   cancelBtn: HTMLButtonElement,
   *   stopBtn:   HTMLButtonElement,
   * }}
   */
  function buildRecordActions() {
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    const stopBtn = document.createElement('button');
    stopBtn.className = 'modal-btn modal-btn-confirm';
    stopBtn.textContent = '■ Stop';
    stopBtn.disabled = true;
    actions.appendChild(cancelBtn);
    actions.appendChild(stopBtn);
    return { actions, cancelBtn, stopBtn };
  }

  // ── Send-to-JX actions row ────────────────────────────────────────────────
  //
  // Three-button row: Cancel (cream) + Save WAV (Roland blue alt) +
  // Send to JX-3P (Roland green primary). The primary button cycles
  // through label states ("Send to JX-3P" → "▶ Play" → "Done") as the
  // flow progresses; modal wires those state changes.

  /**
   * @returns {{
   *   actions:    HTMLElement,
   *   cancelBtn:  HTMLButtonElement,
   *   saveBtn:    HTMLButtonElement,
   *   primaryBtn: HTMLButtonElement,
   * }}
   */
  function buildSendActions() {
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn modal-btn-alt';
    saveBtn.textContent = 'Save WAV file';
    saveBtn.title = 'Export to a file instead of sending directly';
    const primaryBtn = document.createElement('button');
    primaryBtn.className = 'modal-btn modal-btn-confirm';
    primaryBtn.textContent = 'Send to JX-3P';
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(primaryBtn);
    return { actions, cancelBtn, saveBtn, primaryBtn };
  }

  // ── Send-to-JX cause→effect row ───────────────────────────────────────────
  //
  // Matches the Record-from-JX layout pattern (docs/design-system.md §4.3).
  // LEFT: JX-3P key diagram showing which key/sub-mode to arm. ARROW:
  // pulses while audio plays. RIGHT: JX-3P "destination" logo (with
  // optional "loading: {label}" caption underneath).
  //
  // Depends on the global `buildJxKeyDiagram` from app.js. The function
  // exists by the time buildSendRow is CALLED (script tag order: app.js
  // loads after modal-builders.js, but buildSendRow is called from
  // showSendToJxFlow which runs only on user action — well after app.js
  // has loaded). In Node tests, set `global.buildJxKeyDiagram` to a
  // stub before invoking — see test/modal-builders.test.js.

  /**
   * @param {'tone' | 'sequence'} kind   Used to pick the right JX key
   *   diagram (different keys for Tape Memory → Tone vs → Sequencer)
   * @param {string | null | undefined} sourceLabel
   *   Library package name to show under the JX logo. If falsy, the
   *   label block is omitted entirely.
   * @returns {{
   *   sendRow:      HTMLElement,
   *   sendArrow:    HTMLElement,
   *   sendJxLogo:   HTMLElement,
   *   jxKeyDiagram: HTMLElement,
   * }}
   */
  function buildSendRow(kind, sourceLabel) {
    const jxKeyDiagram = buildJxKeyDiagram({ action: 'load', kind });
    const sendRow = document.createElement('div');
    sendRow.className = 'record-jx-cal-row capture-mode';
    sendRow.style.display = 'none';
    const sendArrow = document.createElement('div');
    sendArrow.className = 'record-jx-cal-arrow';
    sendArrow.innerHTML =
      `<svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto;">` +
        `<line x1="4" y1="20" x2="62" y2="20" stroke="#ffffff" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round"/>` +
        `<polygon points="62,12 62,28 76,20" fill="#ffffff"/>` +
      `</svg>`;
    const sendJxLogo = document.createElement('div');
    sendJxLogo.className = 'record-jx-jx3p-logo';
    const sendLabelHtml = sourceLabel
      ? `<div class="record-jx-package-label">` +
          `<div class="record-jx-package-label-prefix">loading:</div>` +
          `<div class="record-jx-package-label-name"></div>` +
        `</div>`
      : '';
    sendJxLogo.innerHTML =
      `<img src="assets/jx3p-logo.png" alt="JX-3P" draggable="false"/>` +
      sendLabelHtml;
    if (sourceLabel) {
      // textContent so user-supplied labels can't inject HTML.
      sendJxLogo.querySelector('.record-jx-package-label-name').textContent = sourceLabel;
    }
    sendRow.appendChild(jxKeyDiagram);
    sendRow.appendChild(sendArrow);
    sendRow.appendChild(sendJxLogo);
    return { sendRow, sendArrow, sendJxLogo, jxKeyDiagram };
  }

  // ── Send-to-JX status section ─────────────────────────────────────────────
  //
  // Per-segment timeline + sweep indicator + status text line. Hidden
  // until step 2 (enterPlayState). Same structure as the record-side
  // timeline but with caller-provided segment definitions (the Send
  // modal accepts arbitrary segments via its `segments` opt).

  /**
   * @typedef {Object} SendSegmentInput
   * @property {string} kind   Segment kind, used in the className
   * @property {string} label  Display label
   * @property {boolean} pilot Whether this is a pilot segment
   */

  /**
   * @typedef {Object} SendSegmentOutput
   * @property {string} kind
   * @property {string} label
   * @property {boolean} pilot
   * @property {HTMLElement} el
   */

  /**
   * @param {SendSegmentInput[]} segments
   * @returns {{
   *   status:     HTMLElement,
   *   timeline:   HTMLElement,
   *   segs:       SendSegmentOutput[],
   *   indicator:  HTMLElement,
   *   statusText: HTMLElement,
   * }}
   */
  function buildSendStatusSection(segments) {
    const status = document.createElement('div');
    status.className = 'send-jx-status';
    const timeline = document.createElement('div');
    timeline.className = 'send-jx-timeline';
    timeline.style.display = 'none';
    const segs = segments.map((cfg) => {
      const seg = document.createElement('div');
      seg.className = `send-jx-seg send-jx-seg-${cfg.kind}`;
      const label = document.createElement('span');
      label.className = 'send-jx-seg-label';
      label.textContent = cfg.label.toUpperCase();
      seg.appendChild(label);
      timeline.appendChild(seg);
      return Object.assign({}, cfg, { el: seg });
    });
    const indicator = document.createElement('div');
    indicator.className = 'send-jx-indicator';
    timeline.appendChild(indicator);
    status.appendChild(timeline);
    const statusText = document.createElement('div');
    statusText.className = 'send-jx-status-text';
    status.appendChild(statusText);
    return { status, timeline, segs, indicator, statusText };
  }

  return {
    buildRecordTimelineSection,
    buildRecordActions,
    buildSendRow,
    buildSendActions,
    buildSendStatusSection,
  };
});
