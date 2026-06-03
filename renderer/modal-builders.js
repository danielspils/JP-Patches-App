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
   *   timelineHeader:  HTMLElement,
   *   timeline:        HTMLElement,
   *   segs:            RecordTimelineSegment[],
   *   indicator:       HTMLElement,
   * }}
   * `timelineHeader` is a flex row containing the section label on
   * the left, with room on the right for the caller to drop in an
   * inline status node (e.g. the Record modal's "Recording — Ns
   * elapsed" counter). Layout via .record-jx-timeline-header in CSS.
   */
  function buildRecordTimelineSection(kind) {
    const timelineSection = document.createElement('div');
    timelineSection.className = 'record-jx-section';
    const timelineHeader = document.createElement('div');
    timelineHeader.className = 'record-jx-timeline-header';
    const timelineLabel = document.createElement('label');
    timelineLabel.textContent = 'WHAT THE JX-3P SENDS:';
    timelineHeader.appendChild(timelineLabel);
    const timeline = document.createElement('div');
    timeline.className = 'send-jx-timeline';

    // Final 'processing' segment represents the post-dump phase: WAV
    // encode → jx3p decode → active-bank update. NOT a pilot, NOT
    // driven by activeMs (the other segments are advanced by cumulative
    // FSK signal time). App.js manually activates this segment when
    // state transitions to 'processing', and snaps the indicator into
    // its midpoint — see the state-transition handler in showRecordFromJxModal.
    const segs = (kind === 'sequence'
      ? [
          { kind: 'init',       label: 'Init',       pilot: true  },
          { kind: 'sequence',   label: 'Sequence',   pilot: false },
          { kind: 'processing', label: 'Processing', pilot: false },
        ]
      : [
          { kind: 'init',       label: 'Init',       pilot: true  },
          { kind: 'bank-c',     label: 'Bank C',     pilot: false },
          { kind: 'divider',    label: 'Divider',    pilot: true  },
          { kind: 'bank-d',     label: 'Bank D',     pilot: false },
          { kind: 'processing', label: 'Processing', pilot: false },
        ]
    ).map((cfg) => {
      const seg = document.createElement('div');
      seg.className = `send-jx-seg send-jx-seg-${cfg.kind}`;
      // Approximate per-segment durations (seconds) used for both visual
      // proportions (flexGrow) AND indicator pace (activeMs / totalEst).
      // Pilots are 4096 bits × 50 samples/bit ÷ 44100 Hz ≈ 4.64 s exactly.
      // Data sections depend on bit content (ONE=50 samples vs ZERO=11
      // samples — 4.5× asymmetry) so are calibrated empirically:
      //   - Sequence: 22 s   (Spils Sequence 3/8 populated = 27.65 s total
      //                       wall-clock incl. 4.64 s pilot → 23 s data)
      //   - Tone bank: 8 s   (calibrated 2026-05-26 against ~25 s tone
      //                       dumps — was 16 s previously, which made the
      //                       indicator lag visibly behind the JX, only
      //                       catching up at end-of-dump. Heavier banks
      //                       can push real bank time toward 12–15 s,
      //                       but the auto-stop ladder handles overruns
      //                       gracefully so it's better to err small.)
      // Auto-stop is governed by EXPECTED_SIGNAL_MS + silence-detection
      // regardless, so a wrong estSec only hurts visual pace.
      //
      // The 'processing' segment is a fixed 4 s. Real decode time
      // varies (WAV encode + jx3p subprocess + JSON parse + library
      // write), but typically lands under 3 s. 4 s gives the user a
      // visible "I'm working" beat without padding the visual bar
      // disproportionately.
      if (cfg.kind === 'processing') {
        cfg.estSec = 4.0;
      } else {
        cfg.estSec = cfg.pilot
          ? 4.64
          : kind === 'sequence' ? 22.0 : 8.0;
      }
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
    timelineSection.appendChild(timelineHeader);
    timelineSection.appendChild(timeline);

    return { timelineSection, timelineHeader, timeline, segs, indicator };
  }

  // ── Record-from-JX actions row ────────────────────────────────────────────
  //
  // Stop button only. Cancel was removed 2026-05-26 in favour of a
  // close X in the modal's upper-right corner (the X is mounted at
  // modal level in app.js, not here). Stop itself is hidden in both
  // calibration and capture modes — the modal is fully hands-free,
  // auto-stop fires when the JX dump completes. Kept in the DOM as
  // invisible chrome so the legacy state-management toggles
  // (`stopBtn.disabled = true/false`) in app.js don't need to be
  // ripped out alongside the Cancel removal.
  //
  // Pre-disabled (enabled after getUserMedia resolves so a too-fast
  // Stop click — if ever re-surfaced — doesn't fire into a half-
  // initialized state).

  /**
   * @returns {{
   *   actions: HTMLElement,
   *   stopBtn: HTMLButtonElement,
   * }}
   */
  function buildRecordActions() {
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const stopBtn = document.createElement('button');
    stopBtn.className = 'modal-btn modal-btn-confirm';
    stopBtn.textContent = '■ Stop';
    stopBtn.disabled = true;
    actions.appendChild(stopBtn);
    return { actions, stopBtn };
  }

  // ── Send-to-JX actions row ────────────────────────────────────────────────
  //
  // Three-button row: Cancel (cream) + Save WAV (Roland blue alt) +
  // Send to JX-3P (Roland green primary). The primary button cycles
  // through label states ("Send to JX-3P" → "▶ Play" → "Done") as the
  // flow progresses; modal wires those state changes.

  /**
   * v0.7.2: `saveBtn` is retained in the return shape as a harmless
   * detached stub (never appended to the DOM) so existing callers that
   * destructure { saveBtn } don't need to be rewritten + can still
   * call .disabled = true / .style.display = 'none' without throwing.
   * The Save-WAV-file action moved to a per-library-row download icon
   * (see buildDownloadWavIcon in app.js) so users pick what to
   * download where they browse, not buried inside the transfer flow.
   *
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
    // Detached stub — see JSDoc above. Not appended to DOM.
    const saveBtn = document.createElement('button');
    saveBtn.style.display = 'none';
    const primaryBtn = document.createElement('button');
    primaryBtn.className = 'modal-btn modal-btn-confirm';
    primaryBtn.textContent = 'Send to JX-3P';
    actions.appendChild(cancelBtn);
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
