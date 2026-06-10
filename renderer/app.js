'use strict';

// ═══════════════════════════════════════════════════════════════
// Global error surface — visible diagnostics for silent failures
// ═══════════════════════════════════════════════════════════════
//
// The renderer has many async paths (modals, setTimeout/setInterval
// callbacks, event handlers, IPC awaits) where an unhandled exception
// or rejected promise has no UI surface to land on. Before this
// handler, those failures were invisible: a modal would close
// silently, a button click would do nothing, and the user would have
// to open DevTools to even know something went wrong. We hit this
// pattern multiple times during the 2026-05-25 capture-flow debug
// session (runningPeak ReferenceError, recordBtn ReferenceError, etc.)
// — each one ate hours of guessing before someone thought to check
// the console.
//
// This handler catches both classes (synchronous throws via 'error',
// unhandled promise rejections via 'unhandledrejection') and surfaces
// them as a red banner anchored to the bottom of the viewport. Errors
// stack if multiple arrive close together; each auto-dismisses after
// 30 s or on click. Also logged to console with a clear prefix so
// the DevTools history stays useful.
(() => {
  const ensureContainer = () => {
    let c = document.getElementById('global-error-stack');
    if (!c) {
      c = document.createElement('div');
      c.id = 'global-error-stack';
      // Append to <body> when it exists; otherwise defer until DOMContentLoaded.
      if (document.body) {
        document.body.appendChild(c);
      } else {
        document.addEventListener('DOMContentLoaded', () => document.body.appendChild(c), { once: true });
      }
    }
    return c;
  };

  const showBanner = (kind, message, detail) => {
    console.error(`JP:ERROR [${kind}]`, message, detail || '');
    const c = ensureContainer();
    const row = document.createElement('div');
    row.className = 'global-error-row';
    row.innerHTML =
      `<span class="global-error-kind">${kind}</span>` +
      `<span class="global-error-message"></span>` +
      `<button class="global-error-dismiss" title="Dismiss">×</button>`;
    row.querySelector('.global-error-message').textContent = message || '(no message)';
    const dismiss = () => { try { row.remove(); } catch {} };
    row.querySelector('.global-error-dismiss').addEventListener('click', dismiss);
    row.addEventListener('click', dismiss);  // click anywhere on the row to dismiss
    setTimeout(dismiss, 30000);
    c.appendChild(row);
  };

  window.addEventListener('error', (e) => {
    // Skip resource-load errors (missing img, etc.) — not actionable.
    if (e && e.target && e.target !== window) return;
    const msg = e.message || (e.error && e.error.message) || 'Uncaught error';
    const loc = e.filename ? ` (${e.filename}:${e.lineno || '?'})` : '';
    showBanner('Error', msg + loc, e.error && e.error.stack);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const msg = (reason && (reason.message || String(reason))) || 'Unhandled promise rejection';
    showBanner('Promise', msg, reason && reason.stack);
  });
})();

// ═══════════════════════════════════════════════════════════════
// Discrete parameter tables (mirrors jx3p/patch.py)
// ═══════════════════════════════════════════════════════════════

const DISCRETE = {
  dco1_range:    ["16'", "8'", "4'"],
  dco1_waveform: ["saw", "pulse", "square"],
  dco2_range:    ["16'", "8'", "4'"],
  dco2_waveform: ["saw", "pulse", "square", "noise"],
  dco2_crossmod: ["off", "sync", "metal"],
  lfo_waveform:  ["sine", "square", "random", "fast random"],
};

// Override the default −140°…+140° even spread for knobs whose on-panel
// markers live at non-default angles. Used by both paramToAngle (display)
// and the SNAP click cycler (rotation target on each click).
const SNAP_ANGLES = {
  dco1_range:    [-60, 0, 60],
  dco1_waveform: [-60, 0, 60],
  dco2_range:    [-60, 0, 60],
  dco2_waveform: [-90, -30, 30, 90],
  dco2_crossmod: [-49, 0, 49],
  lfo_waveform:  [-60, 0, 60],
};

// When a knob's panel has fewer markers than DISCRETE values (e.g. LFO
// Waveform has 3 markers but 4 enum values), the SNAP click cycle uses
// this override list instead of DISCRETE. The 4th enum ("fast random")
// is preserved on disk but unreachable via the UI here.
const SNAP_CYCLE = {
  lfo_waveform: ['sine', 'square', 'random'],
};

// Knob registry: maps an SVG locator → patch param.
// Every knob lives inside <g transform="translate(X,Y)"><g class="knob">…</g></g>.
// The outer translate places the knob; the inner g rotates around (0,0).
const KNOB_REGISTRY = [
  // DCO-1 + DCO-2 (parent group <g transform="translate(0,24)">)
  { gTranslate: '70,84',   param: 'dco1_range' },
  { gTranslate: '70,196',  param: 'dco1_waveform' },
  { gTranslate: '218,84',  param: 'dco2_range' },
  { gTranslate: '338,84',  param: 'dco2_tune' },
  { gTranslate: '218,196', param: 'dco2_waveform' },
  { gTranslate: '338,196', param: 'dco2_fine_tune' },
  { gTranslate: '218,295', param: 'dco2_crossmod' },
  // DCO mod
  { gTranslate: '65,390',  param: 'dco_lfo_amount' },
  { gTranslate: '218,390', param: 'dco_env_amount' },
  // VCF / VCA (parent group <g transform="translate(430,24)">)
  { gTranslate: '55,84',   param: 'vcf_mix' },
  { gTranslate: '140,84',  param: 'vcf_hpf' },
  { gTranslate: '55,196',  param: 'vcf_cutoff' },
  { gTranslate: '140,196', param: 'vcf_resonance' },
  { gTranslate: '261,196', param: 'vca_level' },
  { gTranslate: '55,295',  param: 'vcf_lfo_mod' },
  { gTranslate: '140,295', param: 'vcf_env_mod' },
  { gTranslate: '55,390',  param: 'vcf_pitch_follow' },
  // Bottom row LFO + Envelope
  { gTranslate: '55,545',  param: 'lfo_waveform' },
  { gTranslate: '165,545', param: 'lfo_delay' },
  { gTranslate: '275,545', param: 'lfo_rate' },
  { gTranslate: '420,545', param: 'env_attack' },
  { gTranslate: '510,545', param: 'env_decay' },
  { gTranslate: '600,545', param: 'env_sustain' },
  { gTranslate: '690,545', param: 'env_release' },
];

// Switch registry. Body rect identifies each switch; segment rects (the
// coloured stripes) are siblings immediately following the body.
//   - tri-binary   : 3 segments (top/mid/bot), boolean param. true→top, false→bot
//   - tri-enum     : 3 segments, enum param.   vals[0]→top, vals[1]→bot
//   - duo-enum     : 2 gold segments (top/bot), enum param. vals[0]→top
const SWITCH_REGISTRY = [
  { type: 'tri-binary', param: 'dco1_fmod_lfo',     bodySel: 'rect[x="26"][y="271"]' },
  { type: 'tri-binary', param: 'dco1_fmod_env',     bodySel: 'rect[x="78"][y="271"]' },
  { type: 'tri-binary', param: 'dco2_fmod_lfo',     bodySel: 'rect[x="299"][y="271"]' },
  { type: 'tri-binary', param: 'dco2_fmod_env',     bodySel: 'rect[x="351"][y="271"]' },
  { type: 'tri-enum',   param: 'vca_mode', vals: ['env', 'gate'],
    bodySel: 'rect[x="248"][y="61"]' },
  { type: 'tri-binary', param: 'chorus',            bodySel: 'rect[x="248"][y="370"]' },
  { type: 'tri-enum',   param: 'dco_env_polarity', vals: ['pos', 'neg'],
    bodySel: 'rect[x="325"][y="370"]' },
  { type: 'tri-enum',   param: 'vcf_env_polarity', vals: ['pos', 'neg'],
    bodySel: 'rect[x="126"][y="370"]' },
];

// Tape Memory + Manual/Write hardware buttons.
// `id` is the internal identifier; `bodySel` finds the button rect; LED rect
// is the next-sibling small <rect> after the body.
// Save / Load were moved out of the SVG and are now HTML buttons below the
// left panel; see setupHwButtons. Only Manual / Write remain SVG-driven.
//
//   Manual — visual-only in v1. Phase 3 (MIDI) will send a "use current panel
//            state" message to the synth so it overrides recalled patch memory,
//            matching the hardware PG-200 behavior. No clean v1 analog because
//            the app already mutates patch data directly on knob drag (the app
//            has no separate "live panel state" distinct from the selected
//            patch).
//   Write  — v1 wiring pending: "save current knob positions to active slot".
const BUTTON_REGISTRY = [
  { id: 'manual', color: '#b94a2e', bodySel: 'rect[x="765"][y="516"][width="58"]' },
  { id: 'write',  color: '#b94a2e', bodySel: 'rect[x="843"][y="516"][width="58"]' },
];

const LED_OFF = '#333';

// ── Panel interaction sounds ────────────────────────────────────
// Recorded JX sounds played on panel interaction: a button click for the
// 6 panel buttons (Tone Save/Load, Sequencer Save/Load, Manual, Write) and
// a distinct switch click for the 8 toggle switches. Both share the same
// on/off state — toggled via View > Button Sounds, persisted to
// library.json (`buttonSounds`) and pushed from main on change.
let buttonSoundsEnabled = true;

// Tape Dump Sounds (View > Tape dump sounds). When on, the Send-to-JX
// flow plays the FSK quietly out the Mac speakers in parallel with the
// cable. Off by default; persisted to library.json (transmissionSounds
// .enabled) and pushed from main on change. The actual playback lives in
// renderer/transmission-sounds.js and is fully isolated from the transfer.
let tapeDumpSoundsEnabled = false;
// Tape-dump-sound playback volume (0..1), persisted in library.json. The
// Send modal's slider drives it (volume = sliderPos²); default 0.0025 puts
// the slider at ~5% of travel — just above silent, can't blast on first use.
let tapeDumpVolume = 0.0025;

// Cache one Audio element per sound (created lazily). Resetting currentTime
// before each play lets rapid presses retrigger the sound.
//
// v0.7.0: applies setSinkId(library.appSoundDeviceId) before play so app
// sounds route to the user's picked device (independent of macOS system
// default + the cable picker). Tracks the last-applied sinkId so we only
// re-call setSinkId when the user picks a different device — setSinkId
// is an async device handshake and shouldn't fire on every click. Silent-
// fail on rejection (device gone, etc.) — degrades to default routing.
function makeSoundPlayer(src, volume) {
  let audio = null;
  let lastAppliedSink = undefined;
  return () => {
    if (!buttonSoundsEnabled) return;
    try {
      if (!audio) {
        audio = new Audio(src);
        audio.volume = volume;
      }
      // Apply sinkId on-demand: only if changed since last play.
      const want = library && library.appSoundDeviceId;
      if (want !== lastAppliedSink && typeof audio.setSinkId === 'function') {
        lastAppliedSink = want;
        audio.setSinkId(want || '').catch(() => {});  // '' = default sink
      }
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* audio unavailable — silent no-op */ }
  };
}

const playButtonClick = makeSoundPlayer('assets/button-click.mp3', 0.6);
const playSwitchClick = makeSoundPlayer('assets/switch-click.mp3', 0.48);

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

let patches  = null;
let library  = null;
let selBank  = 'C';
let selSlot  = 0;
// Remembers the most recently active bank+slot so flows that need a "currently
// selected patch" (e.g. pairing a sequence import) still work when the user is
// looking at the Library tab — the panel still visibly shows that patch.
let lastBankSelection = { bank: 'C', slot: 0 };
// Range selection in the C/D patch list — shift-click extends from the
// most-recent single-click slot to the shift-clicked slot. The whole range
// is then draggable as one unit into the Custom Banks builder buckets, and
// each slot in the range renders with an `.in-range` highlight.
// Shape: { bank: 'C'|'D', start: int, end: int } | null
let selectedRange = null;
// Anchor slot for shift-click range — the most recent non-shift click.
// Persists per bank so flipping tabs doesn't lose the anchor.
let rangeAnchor = { bank: 'C', slot: 0 };
let selPackage = null;     // selected index in library.packages   (Tones sub-tab)
let selSequence = null;    // selected index in library.sequences  (Sequences sub-tab)
let selSeqVizPage = null;  // null = show all 8 pages overview; 0–7 = zoom into one page

// Paired-patch preview state (v0.6.5). When set, the PG-200 panel renders
// these params + name INSTEAD of the active C/D slot — a temporary view
// of a paired patch from a Library sequence. Cleared automatically when
// the user selects any C/D slot (selectPatch on bank C/D). Knob/switch
// edits in preview mode mutate currentPreviewPatch.params (ephemeral —
// lost on preview exit unless user clicks Write to commit to a C/D slot).
// The Patch parallelogram readout shows "Preview: {name}" + a small
// visual marker class on the SVG to communicate the non-slot state.
//
// Shape: { params: {...32-byte patch...}, name: 'Warm Pad',
//          sourceLabel: 'Sequence "Friday Morning"' } | null
let currentPreviewPatch = null;

// Drag-to-change-pitch state for the sequencer visualizer. seqDragState
// is non-null only while a drag is in progress (set by mousedown on a
// playable note in single-page view, cleared by mouseup). The document-
// level mousemove/mouseup listeners (wired ONCE inside setupSeqDragOnce
// below the visualizer fn) read this to advance / commit the gesture.
// seqDragSuppressClick is set true on mouseup if the drag actually moved
// the note, so the click handler — which fires after every mouseup —
// doesn't trigger a phantom preview at the dropped pitch.
let seqDragState         = null;
let seqDragSuppressClick = false;
// Ensures the document-level drag listeners are wired exactly once,
// regardless of how many times renderSequenceVisualizer runs.
let seqDragListenersWired = false;

// Note-selection state for keyboard-driven delete (replaces the
// Ctrl+click → delete tooltip flow, 2026-05-26). When a user plain-
// clicks a note, the cell is marked selected (visual outline) and
// pressing Delete / Backspace removes it. Cleared on: Escape, click
// outside any note, sequence navigation, or after any data mutation
// (the {pitch, step} key would be stale after a drag that moved the
// note). Module-scope so the document keydown handler can read it
// without per-render rewiring.
let selectedSeqNotes = [];      // {pitch, absStep}[] — empty when nothing selected
                                // (was scalar selectedSeqNote, expanded 2026-05-26
                                // to support column-constrained marquee multi-select)
let seqKeyListenerWired = false;

// Sequencer preview-playback state. Three logical states:
//
//   - IDLE     seqPlayState === null
//                (no playhead in DOM, button shows ▶)
//   - PLAYING  seqPlayState.timerId !== null
//                (timer ticking, playhead sweeping, button shows ⏸)
//   - PAUSED   seqPlayState !== null && seqPlayState.timerId === null
//                (timer cleared but state preserved — playhead stays
//                visible at the paused step, currentStep saved for
//                resume, button reverts to ▶)
//
// Single click cycles idle → playing → paused → playing → paused ...
// Double click in any state returns to idle (full stop + reset to
// beginning) via stopSeqPlayback. Module-scope so navigation
// handlers can call stopSeqPlayback() without per-render rewiring.
//
// Step interval is fixed at 250 ms — roughly half of the JX-3P's
// natural tempo at default RATE. The sequence data has no rate
// field today, so we don't try to match playback to the synth's
// actual speed; this is a "what does it sound like" preview.
let seqPlayState = null;

// Playhead-drag state. Non-null while the user is mid-drag scrubbing
// the playhead. Captures svgRect at mousedown (so mousemove doesn't
// re-measure) + tracks the last-played step so we don't re-fire
// previewNote for the same step on every pixel of cursor motion
// within a single step's column.
//
// dragSuppressClick: set true at mouseup if any drag actually
// happened, so the post-mouseup click event doesn't fire a phantom
// jump-to-click-position on top of the drop position.
let seqPlayheadDragState = null;
let seqPlayheadDragSuppressClick = false;

// Marquee-selection state (column-constrained, Daniel 2026-05-26).
// Non-null while the user is dragging within an empty area to
// select multiple notes within a single column. svgRect captured at
// mousedown; absStep is the column we're selecting in (fixed for
// the gesture); pitch range is updated by mousemove. There is NO
// visible marquee rect — the user sees the selection by watching
// the notes themselves highlight live as they drag.
// suppressClick prevents the post-mouseup click from clearing the
// just-formed selection.
let seqMarqueeState = null;
let seqMarqueeSuppressClick = false;

// Currently-shown insert-cell tooltip's dismiss function, or null.
// Tracked globally so a fresh showInsertCellTooltip can cleanly tear
// down the previous tip (element + outsideClick/escape listeners)
// before opening a new one. Also lets the rollSvg outsideClick path
// SKIP dismissing for empty-area clicks on the SVG in single-page
// view — those go through the click handler, which calls
// showInsertCellTooltip, which uses this to dispose the prior tip.
let activeInsertTipDismiss = null;

// Dirty-sequence tracking for the in-progress sequencer editor.
// A sequence index lands in this Set when the user mutates it
// (currently: drag-to-change-pitch). The visualizer header renders a
// SAVE button when the currently-selected sequence is in the set.
//
// Companion Map originalSequenceSnapshots holds a deep-clone of each
// dirty sequence's pre-edit state, captured before the first mutation.
// SAVE uses these snapshots to RESTORE each original in place + push
// a new "edited" copy to library.sequences — so the original is never
// destroyed, the edit is preserved as a new sequence, and the user
// can always return to the pre-edit master.
//
// This pair is the safety net the bare drag-pitch mechanic shipped
// without — Feature #6 in the sequencer-editor design list.
const dirtySequences = new Set();
const originalSequenceSnapshots = new Map();   // index → deep clone of the original

// Both structures above are INDEX-keyed into library.sequences — so any
// splice of that array (delete, undo-of-delete, drag-reorder) must remap
// them in the same operation, or the stale indices migrate onto innocent
// neighbors (2026-06-10 bug: deleted isNew sequence left idx 0 dirty;
// the next sequence inherited the flag + a bogus nav-away modal, and
// SAVE would mint a junk "(edited)" copy of it). `mapFn` is one of the
// pure remapIndexAfter* helpers from renderer/library-math.js; null
// from the mapper drops the entry (the tracked sequence itself was
// removed).
function remapSequenceTracking(mapFn) {
  const newDirty = [];
  dirtySequences.forEach((i) => {
    const n = mapFn(i);
    if (n !== null) newDirty.push(n);
  });
  dirtySequences.clear();
  newDirty.forEach((i) => dirtySequences.add(i));

  const newSnaps = [];
  originalSequenceSnapshots.forEach((snap, i) => {
    const n = mapFn(i);
    if (n !== null) newSnaps.push([n, snap]);
  });
  originalSequenceSnapshots.clear();
  newSnaps.forEach(([i, snap]) => originalSequenceSnapshots.set(i, snap));
}

// JSON deep-clone for sequence objects. Sequence shape is plain JSON
// (no Date instances, no functions, no circular refs) so JSON round-
// trip is the cheapest correct deep-clone.
function cloneSeq(seq) { return JSON.parse(JSON.stringify(seq)); }

/**
 * Pick the next "(edited)" / "(edited N)" name for a sequence about
 * to be saved as a new copy. Avoids `(edited) (edited)` stacking by
 * stripping any existing trailing edited-marker from the source
 * name, then looking across `allSequences` for the highest in-use
 * number with the same base.
 *
 * Naming convention (per Daniel 2026-05-26):
 *   Koehler Sequence                 (original)
 *   Koehler Sequence (edited)        (first edit)
 *   Koehler Sequence (edited 2)      (second edit)
 *   Koehler Sequence (edited 3)      (third edit)
 *   ...
 *
 * @param {string}  baseName        The current visible name (customName ?? defaultName)
 * @param {object[]} allSequences   library.sequences (read for collision detection)
 * @returns {string}                The new customName to assign to the edited copy
 */
function nextEditedSequenceName(baseName, allSequences) {
  // Strip any trailing "(edited)" or "(edited N)" from the source so
  // editing-an-edit picks up from the same base counter.
  const stripped = baseName.replace(/\s*\(edited(?:\s+\d+)?\)\s*$/i, '');
  // Match either "{stripped} (edited)" → counts as N=1
  //        or    "{stripped} (edited N)" → counts as N
  const escaped = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}\\s*\\(edited(?:\\s+(\\d+))?\\)$`, 'i');
  let maxN = 0;
  allSequences.forEach((s) => {
    const name = (s && (s.customName || s.defaultName)) || '';
    const m = name.match(re);
    if (m) {
      const n = m[1] ? parseInt(m[1], 10) : 1;
      if (n > maxN) maxN = n;
    }
  });
  const nextN = maxN + 1;
  return nextN === 1 ? `${stripped} (edited)` : `${stripped} (edited ${nextN})`;
}

/**
 * Is this displayed name a save-as-new edit copy? Pure pattern check
 * against the "(edited)" / "(edited N)" suffix produced by
 * nextEditedSequenceName. Used by renderSequencesList to mark these
 * entries visually (italic + dimmed) so the user can distinguish
 * originals from edits at a glance.
 *
 * Self-cleaning by design: if the user renames an edited copy to
 * something else via the pencil icon, this returns false and the
 * entry stops being marked. That's intentional — a renamed copy is
 * now a "real" sequence in the user's mental model, no longer an
 * edit artifact.
 *
 * @param {string} name  customName || defaultName
 * @returns {boolean}
 */
function isEditedSequenceName(name) {
  if (!name) return false;
  return /\s*\(edited(?:\s+\d+)?\)\s*$/i.test(name);
}

/**
 * Create a brand-new blank sequence and select it for editing. The
 * sequence is added to the library list but NOT immediately saved to
 * disk — it's marked dirty + isNew so:
 *   - SAVE button shows immediately (sequence has unsaved state)
 *   - SAVE writes in-place (no "(edited)" copy, since there's no
 *     prior version to protect)
 *   - The nav-away modal's DELETE removes the sequence entirely
 *     (rather than reverting to a non-existent snapshot)
 * After first SAVE, isNew is dropped and the sequence transitions
 * to the normal save-as-new-copy flow for subsequent edits.
 *
 * Wrapped in guardSeqNav: creating a new sequence navigates away from
 * whatever sequence is currently being edited, AND the unshift below
 * shifts every library.sequences index — both require the dirty set
 * to be resolved (saved/reverted) first, or stale dirty indices land
 * on the wrong rows (same bug class as delete-without-remap).
 */
function handleCreateNewSequence() {
  guardSeqNav(() => createNewSequenceUnguarded());
}

function createNewSequenceUnguarded() {
  const now = new Date();
  // Match the existing default-name pattern from seed sequences:
  // "Sequence May 18, 2026 at 12:23 PM"
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const defaultName = `Sequence ${dateStr} at ${timeStr}`;

  const blankSeq = {
    id: `seq-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    defaultName,
    customName: null,
    savedAt: now.toISOString(),
    createdAt: now.toISOString(),
    // tape.pages = 8 nulls → renderer treats each as 16 rests.
    // _prepStepForInsert will fill them in on first edit.
    tape: { pages: [null, null, null, null, null, null, null, null] },
    app: { pairedPatch: null, patchNote: null },
    isNew: true,
  };

  // Insert at the top of the library list (matches the save-as-new
  // unshift behavior — newest sequences land at index 0).
  if (!Array.isArray(library.sequences)) library.sequences = [];
  library.sequences.unshift(blankSeq);
  // Mark dirty so the SAVE button shows immediately. (NOT calling
  // saveLibraryDebounced — the sequence stays in-memory until SAVE
  // so DISCARD via nav modal can remove it cleanly.)
  dirtySequences.add(0);
  // No snapshot needed: isNew sequences don't restore-from-snapshot
  // (SAVE writes in place, DISCARD removes entirely).

  // Switch view to the new sequence in single-page mode (page 1)
  // so the user can start composing immediately.
  selBank = 'L';
  selLibTab = 'sequences';
  selSequence = 0;
  selSeqVizPage = 0;
  clearSequenceSelection();

  renderPatchList();
  renderCustomBuilder();   // triggers renderSequenceVisualizer
}

// ── Sequencer edit commit / discard / nav-guard helpers ───────────────────
//
// These three pure-ish helpers are the engine behind both the in-header
// SAVE button (manual commit) AND the nav-away SAVE/DELETE/CANCEL modal
// (interrupt-driven commit). Pulling them out of the SAVE handler means
// both code paths produce identical library state, and the nav guard
// doesn't have to duplicate the unshift / restore / re-render orchestration.

/**
 * Commit every dirty-tracked sequence to disk as a new "(edited N)"
 * copy. Originals are restored in-place from their snapshots so the
 * library's pre-edit master copies are preserved. The currently-
 * viewed sequence's new copy lands at index 0 (top of the list);
 * any other dirty sequences' copies unshift behind it.
 *
 * Post-conditions: dirtySequences + originalSequenceSnapshots both
 * empty, library written to disk, renderPatchList + visualizer
 * refreshed, selSequence pointing at the new copy of what was
 * being viewed (if applicable).
 *
 * Throws if the library save IPC call fails — callers should
 * catch and surface to the user (the SAVE button does this with
 * a 'SAVE FAILED — RETRY' label; the nav modal will let the
 * error propagate to the global error banner via showConfirmModal's
 * built-in async-callback wrapper).
 *
 * @returns {Promise<void>}
 */
async function commitDirtyEditsAsNewCopies() {
  if (dirtySequences.size === 0) return;
  const nowIso = new Date().toISOString();
  const newCopies = [];
  // Capture the currently-viewed sequence's IDENTITY (object ref)
  // before any mutations. For isNew sequences we follow the same
  // object (which gets edited in-place); for non-new we'll jump to
  // the unshifted copy.
  const currentSeqRef = (selSequence !== null) ? library.sequences[selSequence] : null;
  const currentWasNew = !!(currentSeqRef && currentSeqRef.isNew);

  dirtySequences.forEach((idx) => {
    const seq = library.sequences[idx];
    if (!seq) return;
    // isNew sequences: first-time save. No "(edited)" copy — the
    // user is composing from scratch, there's no prior version to
    // protect. Save in-place, drop the isNew flag so subsequent
    // edits use the standard save-as-new-copy flow.
    if (seq.isNew) {
      seq.savedAt = nowIso;
      delete seq.isNew;
      return;     // skip the newCopies/snapshot machinery below
    }
    const editedCopy = cloneSeq(seq);
    const baseName   = editedCopy.customName || editedCopy.defaultName || '(unnamed sequence)';
    editedCopy.customName = nextEditedSequenceName(baseName, library.sequences);
    editedCopy.savedAt    = nowIso;
    editedCopy.createdAt  = nowIso;
    newCopies.push({ origIdx: idx, copy: editedCopy });
  });

  // Restore originals from snapshots ONLY for sequences we pushed
  // copies for. isNew sequences skip BOTH the copy push (above)
  // AND this snapshot-restore (their snapshot is the blank starting
  // state — restoring would erase the user's work).
  const indicesWithCopies = new Set(newCopies.map((c) => c.origIdx));
  originalSequenceSnapshots.forEach((snapshot, idx) => {
    if (indicesWithCopies.has(idx)) {
      library.sequences[idx] = cloneSeq(snapshot);
    }
  });

  const otherCopies = newCopies.filter((c) => c.origIdx !== selSequence);
  const currentCopy = newCopies.find((c) => c.origIdx === selSequence);
  otherCopies.forEach(({ copy }) => library.sequences.unshift(copy));
  if (currentCopy) library.sequences.unshift(currentCopy.copy);

  // Resolve final selSequence:
  //   - isNew-and-current: follow the same object (which may have
  //     shifted index due to other unshifts).
  //   - currentCopy exists: jump to the unshifted copy at idx 0
  //     (user wants to see their just-edited version).
  //   - Otherwise: shift the current index forward by the number
  //     of new copies that landed before it.
  if (currentWasNew && currentSeqRef) {
    const newIdx = library.sequences.indexOf(currentSeqRef);
    if (newIdx !== -1) selSequence = newIdx;
  } else if (currentCopy) {
    selSequence = 0;
  } else if (selSequence !== null) {
    selSequence += newCopies.length;
  }

  await window.api.saveLibrary(library);
  dirtySequences.clear();
  originalSequenceSnapshots.clear();
  renderPatchList();
  renderSequenceVisualizer();
}

/**
 * Discard every dirty-tracked edit by restoring each sequence in
 * library.sequences from its snapshot, clearing the tracking maps,
 * and re-rendering the affected UIs. Synchronous — no disk write
 * needed (we're reverting the in-memory copy to what's already
 * on disk).
 *
 * @returns {void}
 */
function discardDirtyEdits() {
  if (dirtySequences.size === 0) return;
  // First: restore non-new dirty sequences from their snapshots.
  // This is the standard "revert in-memory to disk-state" path.
  originalSequenceSnapshots.forEach((snapshot, idx) => {
    const seq = library.sequences[idx];
    if (seq && seq.isNew) return;   // isNew handled below
    library.sequences[idx] = cloneSeq(snapshot);
  });
  // Second: for isNew sequences, remove from library entirely (no
  // disk version to revert to — DISCARD means "throw this away").
  // Iterate in descending index order so splices don't shift the
  // remaining indices we still need to remove.
  const newIndices = Array.from(dirtySequences).filter((idx) => {
    const seq = library.sequences[idx];
    return seq && seq.isNew;
  }).sort((a, b) => b - a);
  newIndices.forEach((idx) => {
    library.sequences.splice(idx, 1);
    if (selSequence === idx) selSequence = null;
    else if (selSequence !== null && selSequence > idx) selSequence -= 1;
  });
  dirtySequences.clear();
  originalSequenceSnapshots.clear();
  renderPatchList();
  renderSequenceVisualizer();
}

/**
 * Mutate-in-place: remove every voice at `pitch` in step `absStep`
 * of the currently-selected sequence. Captures a snapshot of the
 * sequence's pre-edit state on first mutation (matches the drag-
 * pitch handler's snapshot behavior — first mutation snapshots the
 * "true original" once), then marks the sequence dirty.
 *
 * For 'attack' cells this removes one voice (the new attack at that
 * pitch). For 'tie' cells this removes both — voice[0] tied + the
 * other voice's new attack at the same pitch — preserving the TIE
 * encoding's all-or-nothing semantic. For 'hold-rest' cells this
 * removes voice[0]'s tied continuation. Caller decides whether to
 * re-render (we don't, so we don't fight a parent that's already
 * scheduling one).
 *
 * @param {number} pitch    MIDI note number to remove
 * @param {number} absStep  Absolute step index (0..127)
 * @returns {boolean}       True if anything was actually removed.
 */
// `skipUndo` lets callers batch multiple deletes into a single undo
// entry (the keyboard handler uses this for multi-note Delete on a
// marquee selection). Default false → push one undo entry per call.
function deleteNoteAtStep(pitch, absStep, { skipUndo = false } = {}) {
  const STEPS_PER_PAGE = 16;
  const seq = library.sequences && library.sequences[selSequence];
  if (!seq) return false;
  const pages = (seq.tape && Array.isArray(seq.tape.pages)) ? seq.tape.pages : [];
  const pageIdx = Math.floor(absStep / STEPS_PER_PAGE);
  const stepIdx = absStep % STEPS_PER_PAGE;
  const page = pages[pageIdx];
  const step = page && page[stepIdx];
  if (!step || !Array.isArray(step.voices)) return false;

  // Snapshot before first mutation (idempotent — only the first call
  // per-sequence stores; subsequent edits reuse the same snapshot).
  if (!originalSequenceSnapshots.has(selSequence)) {
    originalSequenceSnapshots.set(selSequence, cloneSeq(library.sequences[selSequence]));
  }

  const beforeSeq = skipUndo ? null : cloneSeq(library.sequences[selSequence]);
  let removed = false;
  step.voices.forEach((voice, i) => {
    if (voice && voice.note === pitch) {
      step.voices[i] = null;
      removed = true;
    }
  });

  if (removed) {
    dirtySequences.add(selSequence);
    // If this delete restored the sequence to its pre-edit state
    // (rare for delete alone, but possible after a prior insert/delete
    // pair cancelled out), clear the dirty flag.
    maybeClearDirty(selSequence);
    if (!skipUndo) {
      pushSeqEditUndo(beforeSeq, cloneSeq(library.sequences[selSequence]));
    }
  }
  return removed;
}

// ── Sequencer preview-playback helpers ─────────────────────────────
//
// Plays the selected sequence step-by-step through synth-preview.js,
// driven by setInterval. Steps with new attacks (voice.tied === false)
// fire previewNote per voice; rests + tied continuations are silent
// (matches JX playback semantics — only new attacks produce sound).
// A faint cream playhead overlay sweeps across the visualizer in
// lockstep with the active step.
//
// Visible-range scope:
//   - Single-page view → plays just that page's 16 steps
//   - All-pages view   → plays all 128 steps
// Mirrors "play what I'm looking at" mental model.
//
// Termination: auto-stop at end of range (button reverts to ▶);
// click ⏸ button to stop manually; any navigation (seq change,
// page switch, tab switch) calls stopSeqPlayback().

// Rate slider's expanded/collapsed UI state. Default collapsed —
// the slider is the secondary "fast adjust" affordance; the number
// field is always visible. Click the chevron to slide-out / slide-in.
// Module-scope so it persists across visualizer re-renders within
// a session.
let seqRateSliderExpanded = false;

// (Sequential entry mode — NOTE/REST/TIE buttons + recording cursor +
// selected-pitch tracking — was removed 2026-05-26. The buttons added
// editor surface area without proving useful at the visualizer's
// scale; positional Ctrl+click insert remained the canonical add path.)

// Step interval is computed from seqPlayRatePct each tick.
//   100% rate → 125 ms/step (fastest, ≈ default JX sequencer tempo)
//    50% rate → 250 ms/step (the original hardcoded default)
//     1% rate → 12500 ms/step (slowest sane preview)
// Math: ms = 12500 / pct, so 12500/50 = 250 (matches the previous
// SEQ_STEP_MS constant). Module-scope so the rate input in the
// visualizer footer can mutate it from anywhere; persists for the
// session but not across reloads (could add to library later).
let seqPlayRatePct = 50;
function seqStepMs() {
  return Math.round(12500 / Math.max(1, seqPlayRatePct));
}

// Repeat toggle (the :|| transport control). When on, playback loops over
// the active range instead of stopping at the end. Session-scoped like
// seqPlayRatePct (resets on reload). Read live inside seqPlaybackTick so
// toggling mid-play takes effect at the next loop boundary.
let seqPlayRepeat = false;

// Compute the playback step range [start, endIncl] honoring (a) the JX
// "stop/loop after the last entry" boundary and (b) the current view scope:
//   - Single-page view  → loop within that page, capped at its last
//     populated step (whole page if the page itself is empty).
//   - ALL view          → the whole populated sequence (0 → last entry).
// Falls back to the full range for an empty sequence so play still does
// *something* visible. Inclusive end.
function seqPlayRange(pages) {
  const last = window.lastPopulatedStep ? window.lastPopulatedStep(pages) : -1;
  if (selSeqVizPage !== null && selSeqVizPage >= 0) {
    const pStart = selSeqVizPage * 16;
    const pEnd   = pStart + 15;
    if (last < pStart) return { start: pStart, endIncl: pEnd };   // page empty → sweep it
    return { start: pStart, endIncl: Math.min(last, pEnd) };
  }
  if (last < 0) return { start: 0, endIncl: 127 };                 // empty seq → old full range
  return { start: 0, endIncl: last };
}

// One playback step. Shared by the main timer and the rate hot-restart so
// the advance/loop/stop logic lives in exactly one place. At the boundary
// (one past the last in-range step): wrap to loopStart when repeat is on,
// else full stop.
function seqPlaybackTick(pages) {
  if (!seqPlayState) return;
  const next = seqPlayState.currentStep + 1;
  if (next >= seqPlayState.endStep) {
    if (!seqPlayRepeat) { stopSeqPlayback(); return; }
    seqPlayState.currentStep = seqPlayState.loopStart;
  } else {
    seqPlayState.currentStep = next;
  }
  playSeqStep(pages, seqPlayState.currentStep);
  seqPlayState.playheadEl.setAttribute('x', String(seqPlayState.currentStep));
}

/**
 * Start (or resume) sequence playback. Idempotent for the playing
 * state — already-playing calls no-op. If state is currently PAUSED,
 * resumes from the saved currentStep without rebuilding the playhead.
 * If IDLE, builds a fresh playhead at the start of the active range.
 */
function startSeqPlayback() {
  if (seqPlayState && seqPlayState.timerId !== null) return;   // already playing
  const seq = library.sequences && library.sequences[selSequence];
  if (!seq || !seq.tape || !Array.isArray(seq.tape.pages)) return;
  const pages = seq.tape.pages;

  if (!seqPlayState) {
    // IDLE → PLAYING: fresh start. Range honors the last-entry boundary +
    // view scope (see seqPlayRange). endStep is exclusive (one past the
    // last in-range step); loopStart is where repeat wraps back to.
    const range = seqPlayRange(pages);
    const startStep = range.start;
    const endStep   = range.endIncl + 1;

    const rollSvg = document.querySelector('.seq-viz-svg');
    if (!rollSvg) return;
    const playheadEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    playheadEl.setAttribute('class', 'seq-viz-playhead');
    playheadEl.setAttribute('x', String(startStep));
    playheadEl.setAttribute('y', '0');
    playheadEl.setAttribute('width', '1');
    playheadEl.setAttribute('height', '49');     // PITCH_RANGE
    rollSvg.appendChild(playheadEl);

    seqPlayState = { timerId: null, currentStep: startStep, loopStart: startStep, endStep, playheadEl };
  }
  // (Else: PAUSED → PLAYING. seqPlayState already has currentStep +
  // loopStart + endStep + playheadEl from the previous play session; we
  // just need to restart the timer below.)

  // Play the current step immediately so resume feels instantaneous.
  playSeqStep(pages, seqPlayState.currentStep);

  seqPlayState.timerId = setInterval(() => seqPlaybackTick(pages), seqStepMs());

  setSeqPlayButtonState(true);
}

/**
 * Apply a new rate percentage to seqPlayRatePct. If playback is
 * currently in flight, clear and restart the interval with the new
 * timing so the change is audible immediately rather than next
 * play. Clamps to [1, 100] — 0 would mean infinite step time, and
 * >100 is meaningless against our "100% = JX default" mapping.
 */
function setSeqPlayRatePct(pct) {
  const clamped = Math.max(1, Math.min(100, Math.round(pct)));
  if (clamped === seqPlayRatePct) return;
  seqPlayRatePct = clamped;
  // Hot-restart the interval so an in-flight playback picks up the
  // new timing without waiting for the next stop/play cycle.
  if (seqPlayState && seqPlayState.timerId !== null) {
    clearInterval(seqPlayState.timerId);
    const seq   = library.sequences && library.sequences[selSequence];
    const pages = (seq && seq.tape && Array.isArray(seq.tape.pages)) ? seq.tape.pages : [];
    seqPlayState.timerId = setInterval(() => seqPlaybackTick(pages), seqStepMs());
  }
}

/**
 * PLAYING → PAUSED: stop the timer but keep state + playhead visible
 * at the current step. Subsequent startSeqPlayback() resumes from
 * where we left off. Idempotent — no-op if not currently playing.
 */
function pauseSeqPlayback() {
  if (!seqPlayState || seqPlayState.timerId === null) return;
  clearInterval(seqPlayState.timerId);
  seqPlayState.timerId = null;
  setSeqPlayButtonState(false);   // button reverts to ▶ (means "resume")
}

/**
 * Any state → IDLE: full stop. Clears timer, removes playhead,
 * drops state entirely. Called by double-click on Play/Pause AND
 * by navigation handlers (sequence switch, page switch, tab switch).
 */
function stopSeqPlayback() {
  if (!seqPlayState) return;
  if (seqPlayState.timerId !== null) clearInterval(seqPlayState.timerId);
  if (seqPlayState.playheadEl && seqPlayState.playheadEl.parentNode) {
    seqPlayState.playheadEl.parentNode.removeChild(seqPlayState.playheadEl);
  }
  seqPlayState = null;
  setSeqPlayButtonState(false);
}

/**
 * Move the playhead to whatever step the given cursor X lands in,
 * clamped to the visible range. Optionally play the landed step's
 * notes (at reduced volume during drag scrub). Used by both the
 * click-to-jump handler AND the drag-scrub mousemove. Both rely
 * on seqPlayState + the saved svgRect being set by the caller —
 * for drag, captured at mousedown in seqPlayheadDragState; for
 * click, measured inline.
 *
 * @param {DOMRect} svgRect  Bounding box of the roll SVG
 * @param {number}  clientX  Cursor X (event.clientX)
 * @param {object}  [opts]
 * @param {boolean} [opts.playOnChange=false]  Fire playSeqStep when
 *   the cursor crosses into a new step. Used by drag; click skips
 *   this and handles its own play-on-click.
 * @param {number}  [opts.gainScale=1]  Volume scale for the
 *   play-on-change preview. Default 1 (full); drag passes 0.2.
 */
function scrubPlayheadTo(svgRect, clientX, opts = {}) {
  if (!seqPlayState) return;
  const xRatio = (clientX - svgRect.left) / svgRect.width;
  const STEPS_PER_PAGE = 16;
  const TOTAL_STEPS    = 128;
  let absStep;
  if (selSeqVizPage !== null) {
    absStep = Math.floor(xRatio * STEPS_PER_PAGE) + selSeqVizPage * STEPS_PER_PAGE;
    const min = selSeqVizPage * STEPS_PER_PAGE;
    const max = min + STEPS_PER_PAGE - 1;
    if (absStep < min) absStep = min;
    if (absStep > max) absStep = max;
  } else {
    absStep = Math.floor(xRatio * TOTAL_STEPS);
    if (absStep < 0) absStep = 0;
    if (absStep > TOTAL_STEPS - 1) absStep = TOTAL_STEPS - 1;
  }
  if (absStep === seqPlayState.currentStep) return;
  seqPlayState.currentStep = absStep;
  seqPlayState.playheadEl.setAttribute('x', String(absStep));
  if (opts.playOnChange) {
    const seq = library.sequences[selSequence];
    const pages = seq && seq.tape && seq.tape.pages;
    if (pages) playSeqStep(pages, absStep, opts.gainScale != null ? opts.gainScale : 1);
  }
}

function playSeqStep(pages, absStep, gainScale = 1) {
  const STEPS_PER_PAGE = 16;
  const pageIdx = Math.floor(absStep / STEPS_PER_PAGE);
  const stepIdx = absStep % STEPS_PER_PAGE;
  const page = pages[pageIdx];
  const step = page && page[stepIdx];
  if (!step || !Array.isArray(step.voices)) return;
  step.voices.forEach((v) => {
    // Only NEW ATTACKS produce sound — rests + tied continuations
    // are silent in JX playback semantics (and `previewNote` is a
    // one-shot envelope, no sustain across steps). gainScale lets
    // drag-scrub call us at reduced volume (0.2) so the rapid
    // notes during scrubbing don't drown out the user.
    if (v && typeof v.note === 'number' && v.tied === false) {
      previewNote(v.note, undefined, gainScale);
    }
  });
}

function setSeqPlayButtonState(isPlaying) {
  const btn = document.querySelector('.seq-viz-play-btn');
  if (!btn) return;
  btn.textContent = isPlaying ? '⏸' : '▶';
  btn.setAttribute('title', isPlaying ? 'Pause playback' : 'Play sequence at ~50% rate');
  btn.classList.toggle('playing', isPlaying);
}

/**
 * If the current state of a dirty-tracked sequence is byte-identical
 * to its pre-edit snapshot, clear the dirty flag + drop the snapshot
 * — the user has effectively undone all their edits (e.g. dragged a
 * note back to its original pitch). Without this, the SAVE button
 * would linger even when there's nothing actually to save.
 *
 * Equality check is JSON-roundtrip (both `current` and `snapshot`
 * were created via cloneSeq's JSON.parse(JSON.stringify(...))) so
 * their key insertion order matches in V8. Sequence data is pure
 * JSON shape — no Date, no functions, no circular refs — so this is
 * a correct deep-equal under the V8 string-key insertion-order rule.
 *
 * Safe to call when the sequence isn't dirty (no-op).
 *
 * @param {number} idx  index into library.sequences
 */
function maybeClearDirty(idx) {
  if (!dirtySequences.has(idx)) return;
  const current = library.sequences[idx];
  if (!current) return;
  // isNew sequences stay dirty until first SAVE — they have no disk
  // version, so "matches the snapshot" doesn't mean "clean." (The
  // snapshot would be the blank starting state; if the user deletes
  // everything to get back to blank, we still need them to SAVE to
  // persist the new sequence at all.)
  if (current.isNew) return;
  const snapshot = originalSequenceSnapshots.get(idx);
  if (!snapshot) return;
  if (JSON.stringify(current) === JSON.stringify(snapshot)) {
    dirtySequences.delete(idx);
    originalSequenceSnapshots.delete(idx);
  }
}

// ── Sequencer editor undo (Cmd+Z / Cmd+Shift+Z) ────────────────────
//
// Editor mutations (insertNote/Rest/Tie, deleteNoteAtStep, pitch-drag,
// group pitch-drag) push one entry per logical edit onto the global
// undoStack. We snapshot the ENTIRE affected sequence per edit (4KB
// each, capped at MAX_UNDO_DEPTH = 50 = ~200KB max) and on undo/redo
// deep-clone-restore + re-render. Sequence-level snapshots handle every
// editor mutation shape without per-path inverse logic (page-init on
// never-touched pages, polyphonic REST/TIE multi-voice writes, group
// pitch-drag across pages).
//
// seqIdx is captured at push time so an undo while viewing a different
// sequence still mutates the correct underlying data — the visualizer
// just won't re-render until the user navigates back.
//
// Known limitation: if the user Saves the sequence (creating a new
// library entry + restoring the original via originalSequenceSnapshots)
// or Discards via the nav-away guard, undo entries from before are
// "stale" — Cmd+Z would re-mark the sequence dirty without restoring
// meaningful prior state. Edge case in practice; future work could
// clear editor-undo entries on save/discard.
function pushSeqEditUndo(beforeSeq, afterSeq) {
  const seqIdx = selSequence;
  pushUndo({
    undo: () => applySeqUndoOrRedo(seqIdx, beforeSeq),
    redo: () => applySeqUndoOrRedo(seqIdx, afterSeq),
  });
}

function applySeqUndoOrRedo(seqIdx, targetState) {
  if (!library || !Array.isArray(library.sequences)) return;
  if (!library.sequences[seqIdx]) return;   // sequence was deleted
  // Ensure the first-edit snapshot exists BEFORE we mutate. The insert
  // paths set it via _prepStepForInsert / inline; the undo/redo path
  // bypasses those, so when a redo transitions the sequence from clean
  // (snapshot cleared by an earlier undo-to-baseline) back to dirty,
  // we need to re-capture. Without this, the subsequent SAVE flow
  // would have no original to restore from — discovered May 27 QA.
  // Current state IS the right snapshot to capture: it's the "as last
  // resolved" state (either the on-disk original, or the post-save
  // baseline). The next mutate-to-targetState makes us dirty; if
  // targetState matches the just-captured snapshot, maybeClearDirty
  // immediately reverses the dirty add — no harm done.
  if (!originalSequenceSnapshots.has(seqIdx)) {
    originalSequenceSnapshots.set(seqIdx, cloneSeq(library.sequences[seqIdx]));
  }
  library.sequences[seqIdx] = cloneSeq(targetState);
  dirtySequences.add(seqIdx);
  maybeClearDirty(seqIdx);   // clears dirty if back to first-edit baseline
  saveLibraryDebounced();
  // Re-render only when the user is viewing the affected sequence.
  if (selSequence === seqIdx) {
    clearSequenceSelection();
    renderSequenceVisualizer();
  }
}

/**
 * Clear the keyboard-delete note selection + remove any .selected
 * visual on the rendered cell. Safe to call when nothing is selected.
 * Doesn't re-render — caller decides whether the surrounding context
 * (mutation, navigation) already triggers a render.
 */
function clearSequenceSelection() {
  selectedSeqNotes = [];
  document.querySelectorAll('.seq-viz-note.selected').forEach((el) => el.classList.remove('selected'));
}

/**
 * Add the .selected class to every rect matching an entry in
 * selectedSeqNotes. Called after every render so selection state
 * survives re-renders that don't change the underlying notes.
 * No-op when nothing is selected.
 */
function applySequenceSelectionVisual() {
  if (selectedSeqNotes.length === 0) return;
  selectedSeqNotes.forEach(({ pitch, absStep }) => {
    const sel = document.querySelector(
      `.seq-viz-note[data-pitch="${pitch}"][data-step="${absStep}"]`
    );
    if (sel) sel.classList.add('selected');
  });
}

/**
 * Wire the document-level keyboard handler exactly once. Listens
 * for Delete / Backspace (delete the selected note) and Escape
 * (clear the selection without deleting). Skipped when focus is
 * inside an editable element (input / textarea / contenteditable)
 * so typing in the rename pencil doesn't accidentally nuke the
 * selected sequence cell.
 */
function setupSeqKeyListenerOnce() {
  if (seqKeyListenerWired) return;
  seqKeyListenerWired = true;
  // Double-tap-spacebar detection (parallels the play-button's
  // dblclick → full reset). First Space press fires single action
  // (play/pause/resume) immediately; if a second Space arrives
  // within 300 ms, that single action stays applied but we ALSO
  // run stopSeqPlayback for the full reset. Net end state is the
  // same as a direct double-click on the ▶ button.
  let recentSpaceTap = false;
  let recentSpaceTapTimer = null;
  const SPACE_DBLTAP_MS = 300;
  document.addEventListener('keydown', (e) => {
    // Don't intercept typing in inputs / textareas / contenteditable
    // so rate-input, name-pencil etc. keep their native behavior.
    // (This guards the rate slider too — range inputs respond to
    // arrow keys natively for ±1 increments, and we don't want to
    // hijack that with our left-arrow-resets-playhead shortcut.)
    const t = e.target;
    if (t && (
      t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
      t.isContentEditable
    )) return;

    // All sequencer-scoped shortcuts (Space, ArrowLeft, Delete/
    // Backspace, Escape) only fire when the visualizer is actually
    // on-screen — otherwise pressing Space anywhere in the app
    // would unexpectedly toggle playback. Gate via the container's
    // hidden attribute, which renderCustomBuilder toggles based on
    // selBank/selLibTab/selSequence.
    const viz = document.getElementById('sequence-visualizer');
    if (!viz || viz.hidden) return;

    // Space: same logic as clicking the ▶ button.
    //   - First tap → play / pause / resume (fires immediately)
    //   - Second tap within 300 ms → full reset (matches dblclick
    //     on the ▶ button). The first tap's action already ran,
    //     stopSeqPlayback is idempotent under whatever state that
    //     left us in.
    // preventDefault so a focused button doesn't also trigger its
    // own click on the same space press.
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (recentSpaceTap) {
        recentSpaceTap = false;
        if (recentSpaceTapTimer) { clearTimeout(recentSpaceTapTimer); recentSpaceTapTimer = null; }
        stopSeqPlayback();
        return;
      }
      recentSpaceTap = true;
      recentSpaceTapTimer = setTimeout(() => {
        recentSpaceTap = false;
        recentSpaceTapTimer = null;
      }, SPACE_DBLTAP_MS);
      if (!seqPlayState)                       startSeqPlayback();   // idle  → play
      else if (seqPlayState.timerId !== null)  pauseSeqPlayback();   // play  → pause
      else                                     startSeqPlayback();   // pause → resume
      return;
    }
    // ArrowLeft: full reset → idle (same as double-click on ▶).
    // Returns playhead to start of visible range.
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stopSeqPlayback();
      return;
    }

    // Escape: clear positional selection (no-op when empty).
    if (e.key === 'Escape') {
      if (selectedSeqNotes.length > 0) clearSequenceSelection();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedSeqNotes.length === 0) return;
      // Delete every selected note. Loop calls deleteNoteAtStep with
      // skipUndo=true; we push one batched undo entry covering the
      // whole multi-delete (otherwise the user would need N Cmd+Z's
      // to undo a single multi-note Delete keypress).
      const beforeSeq = library.sequences && library.sequences[selSequence]
        ? cloneSeq(library.sequences[selSequence])
        : null;
      let anyRemoved = false;
      selectedSeqNotes.forEach(({ pitch, absStep }) => {
        if (deleteNoteAtStep(pitch, absStep, { skipUndo: true })) anyRemoved = true;
      });
      clearSequenceSelection();
      if (anyRemoved) {
        if (beforeSeq) {
          pushSeqEditUndo(beforeSeq, cloneSeq(library.sequences[selSequence]));
        }
        e.preventDefault();
        renderSequenceVisualizer();
      }
    }
  });
}

/**
 * Return ALL new-attack pitches in the IMMEDIATELY preceding column
 * (absStep - 1). Used by polyphonic REST + TIE inserts to know what
 * set of pitches to continue/re-attack.
 *
 * Returns empty array if absStep is 0 OR the immediate previous
 * column has no new attacks. Only voices with `tied: false` count
 * (chord new attacks); tied continuations from earlier are excluded
 * — per Daniel 2026-05-26, Option B (matches JX recording flow
 * where REST/TIE land right after fresh key presses).
 *
 * Empirical basis (2026-05-26): Daniel's chord+REST recording on
 * the JX showed that REST after a 5-voice chord ties ALL 5 voices
 * into the next step (not just voice[0] as pitfall #16's single-
 * voice case suggested). Our editor's REST must match.
 *
 * @param {number}   absStep  Step we're inserting AT
 * @param {object[]} pages    library.sequences[selSequence].tape.pages
 * @returns {number[]}        Array of MIDI pitches from prev column
 *                            (empty if no prev attacks)
 */
// (Implementation lives in renderer/seq-insert-rules.js; UMD shim
// attaches it to window. We reassign here so the in-file references
// don't have to be window-qualified.)
const previousColumnAttackPitches = window.previousColumnAttackPitches;

/**
 * Does this page contain any actual note data? A page exists in the
 * data as an array of 16 steps even when empty (after on-demand
 * init by _prepStepForInsert), so "is it an array" isn't a strong
 * enough signal — we need to know if any voice slot anywhere on
 * the page is populated. Used by the page-button dimming logic to
 * fade buttons whose pages have no real content.
 *
 * @param {object[] | null | undefined} page
 * @returns {boolean}
 */
function pageHasContent(page) {
  if (!page || !Array.isArray(page)) return false;
  return page.some((step) =>
    step && Array.isArray(step.voices) && step.voices.some((v) => v != null)
  );
}

// Internal: get the step's voices array, snapshot the sequence if
// this is the first edit, and return the step for direct mutation.
// Returns null only if there's no selected sequence (no possible
// place to insert). If the page is null/missing, initializes it as
// 16 empty steps with byte7=127 (the "never written" sentinel) so
// the user can insert into pages the JX never sent.
function _prepStepForInsert(absStep) {
  const STEPS_PER_PAGE = 16;
  const seq = library.sequences && library.sequences[selSequence];
  if (!seq) return null;
  if (!seq.tape) return null;
  if (!Array.isArray(seq.tape.pages)) seq.tape.pages = [];

  // Snapshot BEFORE any structural change to the sequence (page
  // init counts) so revert correctly restores the pre-edit shape.
  if (!originalSequenceSnapshots.has(selSequence)) {
    originalSequenceSnapshots.set(selSequence, cloneSeq(library.sequences[selSequence]));
  }

  const pageIdx = Math.floor(absStep / STEPS_PER_PAGE);
  const stepIdx = absStep % STEPS_PER_PAGE;

  // On-demand page init. byte7=127 marks every step as "never
  // written" (per pitfall #16); the calling insert helper will
  // flip its target step's byte7 to 1 after writing the voice.
  if (!seq.tape.pages[pageIdx]) {
    const fresh = [];
    for (let i = 0; i < STEPS_PER_PAGE; i++) {
      fresh.push({ voices: [null, null, null, null, null, null, null], byte7: 127 });
    }
    seq.tape.pages[pageIdx] = fresh;
  }
  return seq.tape.pages[pageIdx][stepIdx];
}

/**
 * NOTE insert at `(pitch, absStep)`: write `{note: pitch, tied: false}`
 * into the first empty voice slot. No-op (returns false) if all 7
 * voice slots are taken — JX-3P's polyphony cap is 7 simultaneous
 * voices per step. Marks the sequence dirty on success.
 *
 * @returns {boolean}  True if the note was inserted.
 */
function insertNoteAtStep(pitch, absStep) {
  if (!library.sequences || !library.sequences[selSequence]) return false;
  // Snapshot BEFORE _prepStepForInsert (which can init a previously-
  // null page — that's a mutation we want to capture for undo).
  const beforeSeq = cloneSeq(library.sequences[selSequence]);
  const step = _prepStepForInsert(absStep);
  if (!step) return false;
  // Delegates to the pure mutator (renderer/seq-insert-rules.js) for
  // the actual voice-array write + JX-match rules (no-tied-voice,
  // 6-voice polyphony cap, byte7 sentinel flip). All gating rules are
  // tested in test/seq-insert-rules.test.js.
  if (!window.insertNoteIntoStep(step, pitch)) return false;
  dirtySequences.add(selSequence);
  // Check if the cumulative edits cancelled out (e.g. user inserted
  // then deleted, ending back at the snapshot state). Clears dirty
  // if so.
  maybeClearDirty(selSequence);
  pushSeqEditUndo(beforeSeq, cloneSeq(library.sequences[selSequence]));
  return true;
}

/**
 * REST insert at `absStep`: write voice[0] = {tied to previousPitch}.
 * Per pitfall #16, REST in JX semantics is "continue the previous
 * note's pitch as a tied voice[0]" — silent in the user's mental
 * model but encoded as a tied continuation in the wire data. The
 * clicked pitch row is intentionally ignored; REST always uses the
 * previous attack's pitch.
 *
 * @returns {boolean}  True if inserted (false when no previous attack).
 */
function insertRestAtStep(absStep) {
  if (!library.sequences || !library.sequences[selSequence]) return false;
  const beforeSeq = cloneSeq(library.sequences[selSequence]);
  const step = _prepStepForInsert(absStep);
  if (!step) return false;
  // Delegates to the pure mutator (renderer/seq-insert-rules.js):
  // ties EVERY prev-column attack into this step (polyphonic REST per
  // pitfall #16), gated on step-must-be-empty + prev-must-have-attacks.
  const pages = library.sequences[selSequence].tape.pages;
  const prevPitches = previousColumnAttackPitches(absStep, pages);
  if (!window.insertRestIntoStep(step, prevPitches)) return false;
  dirtySequences.add(selSequence);
  maybeClearDirty(selSequence);
  pushSeqEditUndo(beforeSeq, cloneSeq(library.sequences[selSequence]));
  return true;
}

/**
 * TIE insert at `absStep`: write voice[0] = {tied to prevPitch} AND
 * voice[1] = {new attack at prevPitch} — the JX-3P TIE-button
 * signature per pitfall #16. Same "uses previous pitch, ignores
 * clicked row" rule as REST.
 *
 * @returns {boolean}  True if inserted (false when no previous attack).
 */
function insertTieAtStep(absStep) {
  if (!library.sequences || !library.sequences[selSequence]) return false;
  const beforeSeq = cloneSeq(library.sequences[selSequence]);
  const step = _prepStepForInsert(absStep);
  if (!step) return false;
  // Delegates to the pure mutator (renderer/seq-insert-rules.js):
  // canonical {tied, attack} pairs when N≤3 fits the 6-voice budget,
  // fresh-attacks-only fallback for N≥4 (matches JX firmware per
  // pitfall #16). Same step-empty + prev-attacks gates as REST.
  const pages = library.sequences[selSequence].tape.pages;
  const prevPitches = previousColumnAttackPitches(absStep, pages);
  if (!window.insertTieIntoStep(step, prevPitches)) return false;
  dirtySequences.add(selSequence);
  maybeClearDirty(selSequence);
  pushSeqEditUndo(beforeSeq, cloneSeq(library.sequences[selSequence]));
  return true;
}

/**
 * Show a 3-button NOTE / REST / TIE insert tooltip near the cursor.
 * Buttons use the visualizer's cell colors (red NOTE / green REST /
 * blue TIE) for visual continuity. REST and TIE disable themselves
 * when no previous attack exists in the sequence (nothing to continue).
 *
 * Click → mutate via the corresponding insertXxxAtStep helper +
 * dismiss + re-render. Outside-click / Escape → dismiss without
 * action.
 *
 * @param {number} clientX   Cursor X at click time
 * @param {number} clientY   Cursor Y at click time
 * @param {number} pitch     MIDI pitch derived from cursor Y (used by NOTE only)
 * @param {number} absStep   Absolute step index derived from cursor X
 */
function showInsertCellTooltip(clientX, clientY, pitch, absStep) {
  // Dispose any prior tip cleanly (element + listeners). This handles
  // the "click empty area again to reposition tip" case: outsideClick
  // skips dismissing for empty-area clicks (see below), so the click
  // handler ends up here and we tear down the old tip ourselves.
  if (activeInsertTipDismiss) {
    activeInsertTipDismiss();
    activeInsertTipDismiss = null;
  }
  document.querySelectorAll('.seq-viz-edit-tip').forEach((el) => el.remove());

  // All eligibility rules (NOTE / REST / TIE availability) live in
  // the pure module renderer/seq-insert-rules.js so the tooltip and
  // the underlying mutators share one source of truth. The rules
  // encode the JX-match constraints from CLAUDE.md pitfall #16:
  // REST/TIE need an empty step + prev attacks; NOTE is blocked when
  // the column has any tied voice (can't mix attack with rest/tie
  // continuation, since the JX itself can't record that shape).
  const STEPS_PER_PAGE = 16;
  const seq     = library.sequences && library.sequences[selSequence];
  const pages   = (seq && seq.tape && Array.isArray(seq.tape.pages)) ? seq.tape.pages : [];
  const pageIdx = Math.floor(absStep / STEPS_PER_PAGE);
  const stepIdx = absStep % STEPS_PER_PAGE;
  const stepObj = pages[pageIdx] && pages[pageIdx][stepIdx];
  const voices  = (stepObj && Array.isArray(stepObj.voices)) ? stepObj.voices : [];
  const prevAttackCount = previousColumnAttackPitches(absStep, pages).length;
  const { noteAvailable, restAvailable, tieAvailable } =
    window.computeInsertEligibility(voices, prevAttackCount);

  const tip = document.createElement('div');
  tip.className = 'seq-viz-edit-tip';
  tip.style.position = 'fixed';
  // Anchor close to the cursor tip so the user doesn't have to travel
  // far to hit a button (Daniel 2026-05-26). 3px offset keeps the
  // tooltip from overlapping the cursor's hit-target while still
  // landing near the click point.
  tip.style.left = `${clientX + 3}px`;
  tip.style.top  = `${clientY + 3}px`;

  // Button glyphs mirror the JX-3P front-panel notation (Daniel 2026-05-26).
  //   ♪  = note (eighth-note glyph; size bumped via inline style so
  //        it visually pairs with the SVG rest below — the default
  //        text-character size renders smaller than the SVG)
  //   ⌣  = tie (upward-opening arc — rotated 180° from earlier ⌒ to
  //        match the JX panel orientation)
  //   <svg eighth-rest> = rest (diagonal stem + flag dot)
  // The Unicode music-rest characters (𝄾 𝄽) are SMP and don't
  // render reliably; SVG is universal.
  // Button glyphs mirror the hover-tooltip styling exactly (Daniel
  // 2026-05-26): same padding + REST SVG dimensions. Note + tie
  // wrapped in 22 px spans so their visible-glyph height matches
  // the SVG rest's ~14 px (text glyphs visible-area ~60-65 % of
  // font-size). At plain 16 px (button base font), ♪ and ⌣
  // rendered smaller than the rest icon.
  const NOTE_GLYPH = '<span style="font-size:22px;line-height:1;display:inline-block;vertical-align:middle;">♪</span>';
  const TIE_GLYPH  = '<span style="font-size:22px;line-height:1;display:inline-block;vertical-align:middle;">⌣</span>';
  const REST_GLYPH =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.03 17.67" ` +
    `width="10" height="14" style="display:inline-block;vertical-align:middle;fill:currentColor;">` +
    `<g transform="translate(-482.02112,-143.61753)">` +
    `<g transform="matrix(1.8,0,0,1.8,-471.40868,9.4615275)">` +
    `<path d="M 531.098,74.847 C 530.578,74.945 530.18,75.304 530,75.8 C 529.961,75.96 529.961,75.999 529.961,76.218 C 529.961,76.519 529.98,76.679 530.121,76.917 C 530.32,77.316 530.738,77.636 531.215,77.753 C 531.715,77.894 532.551,77.773 533.508,77.456 L 533.746,77.374 L 532.57,80.624 L 531.414,83.87 C 531.414,83.87 531.453,83.89 531.516,83.933 C 531.633,84.011 531.832,84.07 531.973,84.07 C 532.211,84.07 532.512,83.933 532.551,83.812 C 532.551,83.773 533.109,81.878 533.785,79.628 L 534.98,75.503 L 534.941,75.445 C 534.844,75.324 534.645,75.285 534.523,75.382 C 534.484,75.421 534.422,75.503 534.383,75.562 C 534.203,75.863 533.746,76.398 533.508,76.597 C 533.289,76.777 533.168,76.796 532.969,76.718 C 532.789,76.62 532.73,76.519 532.609,75.98 C 532.492,75.445 532.352,75.202 532.051,75.003 C 531.773,74.824 531.414,74.765 531.098,74.847 z"/>` +
    `</g></g></svg>`;

  const makeBtn = (label, variant, disabled, onClick, title, isHtml) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `seq-viz-edit-tip-btn seq-viz-edit-tip-btn-${variant}`;
    if (isHtml) b.innerHTML = label;        // SVG / mixed-markup labels
    else        b.textContent = label;       // plain glyphs / pitch names
    if (disabled) b.disabled = true;
    if (title)    b.title    = title;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (disabled) return;
      const ok = onClick();
      dismiss();
      if (ok) renderSequenceVisualizer();
    });
    return b;
  };

  const noteBtn = makeBtn(NOTE_GLYPH, 'attack', !noteAvailable,
    () => insertNoteAtStep(pitch, absStep),
    noteAvailable
      ? 'Insert a new attack at the clicked pitch'
      : 'Can’t add a note to a step that has a rest or tie — the JX-3P doesn’t mix those',
    /* isHtml */ true);
  tip.appendChild(noteBtn);

  // REST + TIE: both gated on step-empty + prev-attacks (see
  // computeInsertEligibility above; rules tested in
  // test/seq-insert-rules.test.js).
  if (restAvailable) {
    tip.appendChild(makeBtn(REST_GLYPH, 'rest', false,
      () => insertRestAtStep(absStep),
      'Insert a polyphonic rest — silently continues every new attack from the previous column',
      /* isHtml */ true));
  }
  if (tieAvailable) {
    tip.appendChild(makeBtn(TIE_GLYPH, 'tie', false,
      () => insertTieAtStep(absStep),
      'Tie — re-attacks every new attack from the previous column',
      /* isHtml */ true));   // TIE_GLYPH wraps ⌣ in a sized <span>
  }
  document.body.appendChild(tip);

  // Viewport-edge clamp. With 3 buttons the tooltip is ~210px wide; a
  // click near the right edge would push the TIE button off-screen.
  // After the tooltip is in the DOM we can measure it and flip the
  // horizontal anchor to the LEFT of the cursor if right-anchor
  // overflows. Same logic for bottom-edge → flip above the cursor.
  const tipBox = tip.getBoundingClientRect();
  const overflowRight  = tipBox.right  > window.innerWidth  - 8;
  const overflowBottom = tipBox.bottom > window.innerHeight - 8;
  if (overflowRight) {
    tip.style.left = `${clientX - tipBox.width - 3}px`;
  }
  if (overflowBottom) {
    tip.style.top  = `${clientY - tipBox.height - 3}px`;
  }

  const dismiss = () => {
    tip.remove();
    document.removeEventListener('mousedown', outsideClick, true);
    document.removeEventListener('keydown', escKey);
    if (activeInsertTipDismiss === dismiss) activeInsertTipDismiss = null;
  };
  // outsideClick rules:
  //   - target inside the tip itself → keep open
  //   - target on empty area of the seq SVG in single-page view →
  //       SKIP (the rollSvg click handler will call
  //       showInsertCellTooltip, which disposes this tip via
  //       activeInsertTipDismiss and opens the new one)
  //   - anything else (notes, header, other UI) → dismiss
  const outsideClick = (e) => {
    if (tip.contains(e.target)) return;
    const t = e.target;
    const inRoll = t && typeof t.closest === 'function' && t.closest('.seq-viz-svg');
    const isNote = t && t.classList && t.classList.contains('seq-viz-note');
    if (inRoll && !isNote && selSeqVizPage !== null) return;
    dismiss();
  };
  const escKey = (e) => { if (e.key === 'Escape') dismiss(); };
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClick, true);
    document.addEventListener('keydown', escKey);
    activeInsertTipDismiss = dismiss;
  }, 0);
}

// (showDeleteNoteTooltip removed 2026-05-26 — replaced by select+
// keyboard-Delete flow. deleteNoteAtStep still lives above as the
// shared mutation helper; the keyboard handler in setupSeqKeyListenerOnce
// calls it directly.)

/**
 * Nav-away guard. Wraps any navigation action that would move the
 * user away from a sequence with uncommitted edits. If no edits are
 * pending, the action runs immediately. If edits are pending, a
 * SAVE / DELETE / CANCEL modal pops:
 *   - SAVE   → commitDirtyEditsAsNewCopies(), then run action
 *   - DELETE → discardDirtyEdits(), then run action
 *   - CANCEL → modal closes, action does NOT run (user stays put)
 *
 * "DELETE" matches Daniel's spec wording. The actual semantic is
 * "discard the in-memory edits" (the on-disk original is never
 * touched), but DELETE reads more naturally as the "throw away
 * what I did" affordance.
 *
 * Wire this around every navigation that exits the current sequence
 * view: clicking a different sequence in the Library Sequences list,
 * switching the sub-tab (Sequences ↔ Tones), switching the main bank
 * tab (L ↔ C ↔ D). Drag-reorder + delete-via-trash on sequences are
 * not yet guarded — both will silently commit pending edits via the
 * unrelated-library-write path. Document as a known limitation.
 *
 * @param {() => void} action  The nav action to execute (sync). If
 *                             the user cancels, action is not called.
 * @returns {void}
 */
function guardSeqNav(action) {
  // Navigation always stops playback — the playhead would be stranded
  // in a sequence the user is no longer viewing, and continued audio
  // would feel disconnected. Called even when the early-return-clean
  // path fires (no dirty sequences) so the play-stop fires regardless.
  stopSeqPlayback();
  if (dirtySequences.size === 0) {
    action();
    return;
  }

  // Compose a friendly subject string for the modal body. Singular
  // case names the actual sequence; multi-dirty case (rare — usually
  // just the current sequence is dirty) shows a count instead.
  const dirtyIndices = Array.from(dirtySequences);
  let subjectName;
  if (dirtyIndices.length === 1) {
    const seq = library.sequences[dirtyIndices[0]];
    subjectName = (seq && (seq.customName || seq.defaultName)) || 'this sequence';
  } else {
    subjectName = `${dirtyIndices.length} sequences`;
  }

  showConfirmModal({
    title: 'Sequence has been edited',
    body:
      `*${subjectName}* has unsaved edits.\n\n` +
      'SAVE creates a new copy in the library; the original stays untouched.\n' +
      'REVERT discards your changes and restores the original.',
    confirmLabel: 'SAVE',
    onConfirm: async () => {
      await commitDirtyEditsAsNewCopies();
      action();
    },
    tertiaryLabel: 'REVERT',
    tertiaryStyle: 'danger',
    onTertiary: () => {
      discardDirtyEdits();
      action();
    },
  });
}
let selLibTab  = 'tones';  // 'tones' | 'sequences'
// pkg.id of a freshly-saved library package that should animate into the list
// on the next render. Cleared once the row is created. NOTE: live above any
// renderCustomBuilder reference so handleBuilderSave can set it cleanly.
let pendingSaveAnimationId = null;
// Label describing where the active C/D banks came from (library package name,
// or null for a fresh JX dump). Used as context when a patch is dragged from
// active banks into a Custom Builder bucket — unnamed patches display as
// "{origin} from {sourceLabel}" so the user can see at a glance which library
// the patch was lifted from.
let activeBanksSourceLabel = null;

// ═══════════════════════════════════════════════════════════════
// Undo / Redo (Cmd+Z / Cmd+Shift+Z)
// ═══════════════════════════════════════════════════════════════
// Lightweight action-history stacks. Each entry carries an undo() and
// redo() closure that captures whatever state is needed to reverse and
// re-apply the operation. isReplayingUndo guards against an action
// pushing a NEW entry when it's invoked from the stack itself (e.g.
// reorderBankSlot's undo calls reorderBankSlot in reverse, which would
// otherwise push a duplicate entry).
//
// Current coverage (~2026-05-24): reorder + delete + rename for the
// patch list, custom-bank buckets, library packages, and library
// sequences. Future expansion would add knob twists, patch loads,
// package saves — see docs/future-features.md "App-level Undo/Redo".
//
// Text-field guard: when an <input>/<textarea>/contenteditable has
// focus the keyboard handler skips so the browser's native character-
// level undo keeps working in name-edit fields.
const undoStack = [];
const redoStack = [];
const MAX_UNDO_DEPTH = 50;
let isReplayingUndo = false;

function pushUndo(action) {
  if (isReplayingUndo) return;
  undoStack.push(action);
  if (undoStack.length > MAX_UNDO_DEPTH) undoStack.shift();
  redoStack.length = 0;
}

function performUndo() {
  const action = undoStack.pop();
  if (!action) return;
  isReplayingUndo = true;
  try { action.undo(); } finally { isReplayingUndo = false; }
  redoStack.push(action);
}

function performRedo() {
  const action = redoStack.pop();
  if (!action) return;
  isReplayingUndo = true;
  try { action.redo(); } finally { isReplayingUndo = false; }
  undoStack.push(action);
}

document.addEventListener('keydown', (e) => {
  const ae = document.activeElement;
  const inText = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  if (inText) return;
  const isMeta = e.metaKey || e.ctrlKey;
  if (!isMeta || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  if (e.shiftKey) performRedo();
  else            performUndo();
});

function labelFromPath(path) {
  if (!path) return null;
  const basename = path.split(/[\\/]/).pop();
  return basename.replace(/\.(wav|json)$/i, '') || null;
}
let saveTimer = null;
// Write button: when armed, the next patch-list click writes the currently
// shown patch params into that slot (save-as / clone). Esc cancels.
let writePending = false;
let svgPatchNameEl = null;  // <text> in the SVG that displays the patch name

// Transient snapshot of the C/D bucket arrays taken right before a CLEAR.
// Non-null = the CLEAR button is in UNDO mode and one click will restore it.
// Reset to null on UNDO, on the first new patch dropped in, or app restart.
let clearUndoSnapshot = null;

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

const slotKey = (b, s) => `${b}${s + 1}`;

// library.slotMeta[bank][slotIndex] = { name, origin }.
// `name` is the user's custom mask (nullable); `origin` is the JX-3P slot the
// patch was imported from. Origin survives reorder and rename; only re-import
// overwrites it. The placeholder "imported as {origin}" shows through
// whenever there is no custom name, with an adjacent pencil icon as the
// rename affordance.
function slotMetaArr(bank) {
  return library && library.slotMeta && library.slotMeta[bank];
}
function slotMetaAt(b, s) {
  const arr = slotMetaArr(b);
  return (arr && arr[s]) || null;
}
function patchName(b, s) {
  const m = slotMetaAt(b, s);
  return (m && m.name) || null;
}
function patchOrigin(b, s) {
  const m = slotMetaAt(b, s);
  return (m && m.origin) || null;
}
function patchSourceLabel(b, s) {
  const m = slotMetaAt(b, s);
  return (m && m.sourceLabel) || null;
}
function patchOriginLibrary(b, s) {
  const m = slotMetaAt(b, s);
  return (m && (m.originLibrary || m.sourceLabel)) || null;
}
function patchOriginalName(b, s) {
  const m = slotMetaAt(b, s);
  return (m && m.originalName) || null;
}
function patchPlaceholder(b, s) {
  // Silent-default fillers (the "blank" patches written into empty CCB
  // slots on save) read as "blank" — not the misleading "imported as Cn
  // from <library>" line, which is for real-but-unnamed patches. Only
  // applies to the active C/D banks (paramsAt is bank-relative).
  if ((b === 'C' || b === 'D') && isSilentDefaultPatch(paramsAt(b, s))) return 'blank';
  const o = patchOrigin(b, s);
  if (!o) return 'click to name';
  const src = patchSourceLabel(b, s);
  return src ? `imported as ${o} from ${src}` : `imported as ${o}`;
}

// Inline rename affordance: a small pencil SVG appended to a name span when
// the item still bears its default/auto-generated name. Inherits currentColor
// from its parent so it matches whatever placeholder/italic style is active.
// Disappears once the user assigns a custom name (caller checks before calling).
function appendRenamePencil(span) {
  // v0.7.2: wrap the existing text in an inner .row-name-text span so
  // the text can ellipsize independently of the pencil. Without the
  // wrap, the pencil sits at the end of the parent span and gets
  // clipped by text-overflow:ellipsis when the row hovers and the name
  // shrinks to leave room for action icons. (Daniel 2026-06-03 — the
  // hovered "Espen Kraft Roland JX3P New Patches" row showed `…` but
  // no pencil.) The inner span carries the white-space/overflow/text-
  // overflow trio; the pencil is a flex-shrink:0 sibling.
  const text = span.textContent;
  span.textContent = '';
  const textSpan = document.createElement('span');
  textSpan.className = 'row-name-text';
  textSpan.textContent = text;
  span.appendChild(textSpan);
  span.insertAdjacentHTML('beforeend',
    ' <svg class="patch-rename-icon" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">' +
      '<path d="M8.5 1.5l2 2-6 6-2.5.5.5-2.5z" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/>' +
    '</svg>'
  );
}

// (displayLabel removed 2026-05-26: zero callers; superseded by inline
// `${slotKey(b,s)}: ${patchName(b,s)}` constructions in the rendering
// callsites. Flagged by ESLint's no-unused-vars and removed.)

// Patch identity = its 32 parameters. The app keys names against this
// fingerprint (library.history) so a name survives any roundtrip through the
// JX-3P (which itself stores no names) as long as the params don't change.
// Implementation lives in renderer/library-math.js (canonical sorted-JSON);
// it's loaded as a <script> in index.html and attaches paramsFingerprint to
// the global. Unit tests in test/library-math.test.js.

function paramsAt(b, s) {
  const bankIdx = b === 'D' ? 1 : 0;
  if (!patches || !Array.isArray(patches.banks) || !patches.banks[bankIdx]) return null;
  return patches.banks[bankIdx][s] || null;
}

// ─── Modified / Revert tracking (2026-05-25) ────────────────────────────────
//
// Each slotMeta entry carries an optional `cleanParams` snapshot — the
// patch params at the moment the slot was last replaced wholesale (library
// load, Record-from-JX, drag-drop WAV import, Write button into slot,
// library snapshot save). Knob twists / switch flips edit
// `patches.banks[…]` in place but DO NOT update cleanParams — so a slot
// whose current params differ from cleanParams has unsaved user edits.
//
// The patch list shows a small Roland-red dot next to the slot number for
// any modified slot. Click the dot → confirm modal → revert (with undo).

function snapshotCleanParamsAt(bank, slot) {
  const bankIdx = bank === 'D' ? 1 : 0;
  const bankArr = patches && patches.banks && patches.banks[bankIdx];
  const metaArr = library && library.slotMeta && library.slotMeta[bank];
  if (!bankArr || !metaArr || !bankArr[slot] || !metaArr[slot]) return;
  metaArr[slot].cleanParams = JSON.parse(JSON.stringify(bankArr[slot]));
}

function snapshotCleanParamsAll() {
  if (!patches || !Array.isArray(patches.banks)) return;
  ['C', 'D'].forEach((bank) => {
    for (let s = 0; s < 16; s++) snapshotCleanParamsAt(bank, s);
  });
}

function isPatchModified(bank, slot) {
  if (!patches || !library) return false;
  const bankIdx = bank === 'D' ? 1 : 0;
  const current = patches.banks && patches.banks[bankIdx] && patches.banks[bankIdx][slot];
  const meta    = library.slotMeta && library.slotMeta[bank] && library.slotMeta[bank][slot];
  const clean   = meta && meta.cleanParams;
  if (!current || !clean) return false;
  return paramsFingerprint(current) !== paramsFingerprint(clean);
}

function countModifiedSlots() {
  if (!patches || !library || !library.slotMeta) return 0;
  let count = 0;
  for (const bank of ['C', 'D']) {
    for (let s = 0; s < 16; s++) {
      if (isPatchModified(bank, s)) count++;
    }
  }
  return count;
}

// Background variant of handleSaveBanksToLibrary — used by the "Save
// and load" rescue path when the user is about to overwrite a modified
// active state. Adds the snapshot to library.packages WITHOUT yanking
// the user to the Library tab (they're mid-flow loading something
// else; jumping away mid-action would be jarring). The new entry
// appears at the top of the Library list when the user navigates there
// naturally.
function saveSnapshotInBackground(customName) {
  if (!patches || !Array.isArray(patches.banks)) return;
  snapshotCleanParamsAll();  // capture new baseline before cloning
  const now = new Date();
  const pkg = {
    id:          now.toISOString(),
    defaultName: packageDefaultName(now),
    customName:  (customName || '').trim(),
    createdAt:   now.toISOString(),
    savedAt:     now.toISOString(),
    banks:       JSON.parse(JSON.stringify(patches.banks)),
    slotMeta:    JSON.parse(JSON.stringify(library.slotMeta || {})),
  };
  if (!Array.isArray(library.packages)) library.packages = [];
  library.packages.unshift(pkg);
  if (selPackage !== null) selPackage += 1;  // existing selection shifts down
  saveLibraryDebounced();
}

function revertPatchToOriginal(bank, slot) {
  if (!isPatchModified(bank, slot)) return;
  const bankIdx = bank === 'D' ? 1 : 0;
  const clean   = library.slotMeta[bank][slot].cleanParams;
  const prev    = JSON.parse(JSON.stringify(patches.banks[bankIdx][slot]));
  patches.banks[bankIdx][slot] = JSON.parse(JSON.stringify(clean));
  saveLibraryDebounced();
  if (selBank === bank && selSlot === slot) updateAllControls(currentPatch());
  renderPatchList();
  pushUndo({
    undo: () => {
      patches.banks[bankIdx][slot] = JSON.parse(JSON.stringify(prev));
      saveLibraryDebounced();
      if (selBank === bank && selSlot === slot) updateAllControls(currentPatch());
      renderPatchList();
    },
    redo: () => {
      patches.banks[bankIdx][slot] = JSON.parse(JSON.stringify(clean));
      saveLibraryDebounced();
      if (selBank === bank && selSlot === slot) updateAllControls(currentPatch());
      renderPatchList();
    },
  });
}

// Record the current params+name of a named slot into the history ledger so
// the name can be restored on a future re-import. No-op for unnamed slots.
function recordToHistory(b, s) {
  const name = patchName(b, s);
  if (!name) return;
  const fp = paramsFingerprint(paramsAt(b, s));
  if (!fp) return;
  library.history[fp] = {
    name,
    origin: patchOrigin(b, s) || slotKey(b, s),
    ts: Date.now(),
  };
}

function recordAllNamedToHistory() {
  ['C', 'D'].forEach((bank) => {
    for (let s = 0; s < 16; s++) recordToHistory(bank, s);
  });
}

// Record (params → name) for a library package's stored slotMeta+banks pair.
// Used when sending a package directly to the JX-3P without first loading it
// into active banks: without this, an audio roundtrip (Electron → JX → tape
// dump → reimport) won't find the package's names in library.history and the
// reimported patches show as nameless. Works the same way as recordToHistory
// but reads from explicit args instead of the active library/patches globals.
function recordSlotMetaToHistory(slotMeta, banks, { noClobber = false } = {}) {
  if (!slotMeta || !Array.isArray(banks) || banks.length < 2) return;
  ['C', 'D'].forEach((bank) => {
    const bankIdx  = bank === 'D' ? 1 : 0;
    const slotsArr = slotMeta[bank] || [];
    const bankArr  = banks[bankIdx]  || [];
    for (let s = 0; s < 16; s++) {
      const meta = slotsArr[s];
      if (!meta || !meta.name) continue;
      const fp = paramsFingerprint(bankArr[s]);
      if (!fp) continue;
      // noClobber: used by the backfill on library load so we never overwrite
      // a more-recent rename from the active banks with an older package name.
      if (noClobber && library.history[fp]) continue;
      library.history[fp] = {
        name:   meta.name,
        origin: meta.origin || slotKey(bank, s),
        ts:     Date.now(),
      };
    }
  });
}

// Look up a patch by fingerprint and return its remembered { name, origin },
// or null if we haven't seen these params before.
function lookupInHistory(params) {
  const fp = paramsFingerprint(params);
  if (!fp) return null;
  return library.history[fp] || null;
}

// For each slot whose name is null, look up the slot's params in
// library.history and apply the remembered name (and origin if missing).
// Used by import paths that build a slotMeta with no explicit names —
// notably the Library → Tones drop of a JX-3P audio dump, where the
// WAV's RIFF chunk doesn't survive an audio roundtrip but the patch
// params do. With history pre-populated by the backfill in
// ensureLibraryShape, this restores the original names on import.
function restoreNamesFromHistory(slotMeta, banks) {
  if (!slotMeta || !Array.isArray(banks) || banks.length < 2) return;
  ['C', 'D'].forEach((bank) => {
    const bankIdx  = bank === 'D' ? 1 : 0;
    const slotsArr = slotMeta[bank] || [];
    const bankArr  = banks[bankIdx]  || [];
    for (let s = 0; s < 16; s++) {
      const meta = slotsArr[s];
      if (!meta || meta.name) continue;  // already named — leave alone
      const remembered = lookupInHistory(bankArr[s]);
      if (remembered && remembered.name) {
        meta.name = remembered.name;
        if (!meta.origin) meta.origin = remembered.origin;
      }
    }
  });
}

// Ensure library.slotMeta has 16 entries per bank, each shaped { name, origin }.
// Migrates the legacy library.names map and any legacy package snapshots.
// Also ensures library.history (fingerprint → name/origin) exists.
// Safe to call repeatedly.
function ensureLibraryShape() {
  if (!library) library = {};
  if (!library.history || typeof library.history !== 'object') library.history = {};
  if (!library.slotMeta || typeof library.slotMeta !== 'object') library.slotMeta = {};
  // v0.7.0: pinned cable-transmission output device. null = fall back to
  // system default (current pre-v0.7 behavior). String = setSinkId target
  // for the Send-to-JX audio playback. Lets the user set system default
  // to their speakers/headphones AND have transmissions still route to
  // the cable device, no more shared-default conflict.
  if (!('cableOutputDeviceId' in library)) library.cableOutputDeviceId = null;
  // v0.7.0: pinned app-sound output device. null = system default
  // (current pre-v0.7 behavior). String = setSinkId target for button
  // clicks, switch clicks, and sequencer note previews. Separated from
  // cableOutputDeviceId so the user can route transmissions to their
  // audio interface AND app sounds to their speakers/headphones, fully
  // independent of macOS Sound output (which becomes irrelevant to JP).
  if (!('appSoundDeviceId' in library)) library.appSoundDeviceId = null;
  // v0.7.0 (revised 2026-06-02): cached labels for the two pinned
  // devices. Saved alongside the deviceId so the Audio Settings picker
  // can show a "ghost" option ("KT USB Audio — unavailable") when the
  // device is unplugged, instead of forgetting the selection. The id
  // stays valid across unplug/replug cycles; the label gives the ghost
  // option human-readable text.
  if (!('cableOutputDeviceLabel' in library)) library.cableOutputDeviceLabel = null;
  if (!('appSoundDeviceLabel'    in library)) library.appSoundDeviceLabel    = null;
  const legacy = library.names || {};
  ['C', 'D'].forEach((bank) => {
    if (!Array.isArray(library.slotMeta[bank])) library.slotMeta[bank] = [];
    const arr = library.slotMeta[bank];
    for (let s = 0; s < 16; s++) {
      const cur = arr[s];
      const key = slotKey(bank, s);
      if (!cur || typeof cur !== 'object') {
        arr[s] = { name: legacy[key] || null, origin: key };
      } else {
        if (!('name' in cur)) cur.name = legacy[key] || null;
        if (!cur.origin) cur.origin = key;
      }
    }
    arr.length = 16;
  });
  if ('names' in library) delete library.names;
  if (Array.isArray(library.packages)) library.packages.forEach(migratePackageShape);
  if (Array.isArray(library.sequences)) library.sequences.forEach(migrateSequenceShape);
  // Backfill library.history from any package's slotMeta + banks pair so that
  // packages saved before the recordSlotMetaToHistory fix landed (or any
  // package that's ever been imported without first being routed through
  // active C/D) still resolve names on an audio roundtrip through the JX-3P.
  // noClobber: don't overwrite a more-recent direct rename in active banks.
  if (Array.isArray(library.packages)) {
    library.packages.forEach((pkg) => {
      if (pkg && pkg.slotMeta && Array.isArray(pkg.banks)) {
        recordSlotMetaToHistory(pkg.slotMeta, pkg.banks, { noClobber: true });
      }
    });
    // Reverse direction: retrofit any package slot that's nameless but whose
    // params do match a history fingerprint. Catches packages created via
    // the Library → Tones drop of a JX-dumped WAV before that path was
    // taught to consult history. Pure backfill — never overwrites an
    // existing name, only fills in nulls.
    library.packages.forEach((pkg) => {
      if (pkg && pkg.slotMeta && Array.isArray(pkg.banks)) {
        restoreNamesFromHistory(pkg.slotMeta, pkg.banks);
      }
    });
  }
  ensureCustomBucketsShape();
  ensureRecordCalibrationShape();
}

// Record-from-JX auto-calibration: stores a per-input-device gain multiplier
// so subsequent captures skip the calibration pass. Shape:
//   library.record.calibratedGain[deviceId] = {
//     label:        "KT USB Audio (31b2:2024)",   // for any "Recalibrate X" UI
//     gain:         12.4,
//     calibratedAt: "2026-05-24T07:30:00.000Z"
//   }
function ensureRecordCalibrationShape() {
  if (!library.record || typeof library.record !== 'object') library.record = {};
  if (!library.record.calibratedGain || typeof library.record.calibratedGain !== 'object') {
    library.record.calibratedGain = {};
  }
  // v0.7.1: preferred Record-from-JX input device. Pre-selected on
  // modal open; falls back to first available if absent. Label cached
  // so the user can see what's missing when the device is unplugged
  // (e.g. "KT USB Audio (31b2:2024) (unavailable, plug it in!)").
  if (!('preferredInputDeviceId'    in library.record)) library.record.preferredInputDeviceId    = null;
  if (!('preferredInputDeviceLabel' in library.record)) library.record.preferredInputDeviceLabel = null;
}
// Resolve a device's calibrated gain. Pass the label too: deviceIds are
// salted hashes that rotate across app updates / USB replug / default-switch,
// so a deviceId-only lookup "forgets" calibration the user already did. The
// label (stable, carries USB VID:PID) lets resolveCalibratedGain fall back to
// a label match — see renderer/record-calibration.js for the full rationale.
function getCalibratedGain(deviceId, deviceLabel) {
  if (!library || !library.record || !library.record.calibratedGain) return null;
  return resolveCalibratedGain(library.record.calibratedGain, deviceId, deviceLabel);
}
function setCalibratedGain(deviceId, gain, label) {
  if (!deviceId || typeof gain !== 'number' || !Number.isFinite(gain) || gain <= 0) return;
  ensureRecordCalibrationShape();
  const map = library.record.calibratedGain;
  // Prune stale entries for the same physical device (an old rotated deviceId
  // hash from a previous version, or a "default" alias) so we keep one entry
  // per device rather than accumulating an orphan on every upgrade.
  for (const key of staleCalibrationKeys(map, deviceId, label)) delete map[key];
  map[deviceId] = {
    label:        label || '(unknown device)',
    gain,
    calibratedAt: new Date().toISOString(),
  };
  saveLibraryDebounced();
}
function clearCalibratedGain(deviceId) {
  if (!deviceId) return;
  ensureRecordCalibrationShape();
  delete library.record.calibratedGain[deviceId];
  saveLibraryDebounced();
}

// ── Capture telemetry ──────────────────────────────────────────────
// Append a record of every Record-from-JX capture (success OR failure)
// to library.captureLog, capped at the most recent 30 entries. Also
// emit a console.log with a clear 'JP:CAPTURE' prefix so you can grep
// DevTools history. Existence of this log is what lets us actually
// SEE patterns in intermittent failures instead of guessing — without
// it, every failure was "Daniel says it failed" with no per-capture
// data on why. Designed for diffing successes vs. failures by hand
// (Python one-liner) or in a future visualizer.
//
// Schema (all fields optional except timestamp, kind, decode):
//   {
//     timestamp:    ISO string, when the capture finished
//     kind:         'tone' | 'sequence'
//     deviceLabel:  Chromium picker label of the input device
//     gain:         applied software gain (from saved calibration)
//     capturePeak:  max amplitude observed during the LIVE meter (0..1)
//     decode:       'success' | 'all-null' | 'error'
//     populatedPages:     for sequences only — count of non-null pages
//     populatedPatches:   for tones only — count of non-default-vca slots
//     errorMessage: when decode === 'error'
//   }
function logCaptureTelemetry(entry) {
  try {
    if (!library) return;
    if (!Array.isArray(library.captureLog)) library.captureLog = [];
    const record = Object.assign({ timestamp: new Date().toISOString() }, entry);
    library.captureLog.push(record);
    // Cap at most recent 30 — old entries roll off as new ones arrive.
    while (library.captureLog.length > 30) library.captureLog.shift();
    saveLibraryDebounced();
    console.log('JP:CAPTURE', JSON.stringify(record));
  } catch (err) {
    console.warn('telemetry log failed:', err && err.message);
  }
}

// isDecodeAllDefault now lives in renderer/calibration-math.js and is
// exposed as a window global (via <script> tag in index.html, loaded
// before this file). The previous inline definition here was a
// duplicate left over from an incomplete extraction — ESLint's
// no-redeclare rule caught it. Removed 2026-05-25.

// Show the recalibrate-or-cancel modal after a failed capture. On
// Three-state failure prompt, branching on whether the capture had any
// signal at all:
//
//   (a) LOW-SIGNAL (capturePeak < NO_SIGNAL_THRESHOLD):
//       the JX wasn't transmitting OR the cable/device is wrong. Gain
//       isn't the problem — recalibration won't help. Two buttons:
//       [Cancel] [Try again]. Setup-hint copy.
//
//   (b) BAD-DECODE (capturePeak >= threshold, but all pages decoded as
//       empty/null): there's audio, just couldn't decode it. Could be
//       gain-related OR could be a one-off jitter glitch. Three buttons:
//       [Cancel] [Recalibrate] [Try again]. "Try again" is primary —
//       since today's truncation fix landed, most "bad decode" failures
//       are NOT actually gain-related, so retrying with existing gain
//       is more likely to work than recalibrating.
//
// "Try again" re-opens the Record modal WITHOUT clearing the saved gain
// — fast single-pass capture. "Recalibrate" clears the gain and forces
// the two-pass calibration flow.
//
// On cancel: do nothing — the active C/D banks / sequences stay at their
// pre-record state since we never applied the empty decode.
function showRecalibratePrompt({ kind, deviceId, deviceLabel, capturePeak }) {
  const labelText = deviceLabel ? ` *${deviceLabel}*` : '';
  const isSeq = kind === 'sequence';
  const NO_SIGNAL_THRESHOLD = 0.02;     // matches meter's bottom-segment threshold
  const isLowSignal = typeof capturePeak === 'number' && capturePeak < NO_SIGNAL_THRESHOLD;

  // Both branches share this — re-opens Record with the saved gain
  // intact (single-pass capture, faster). Used by both "Try again"
  // tertiary buttons.
  const reopenWithoutRecalibrating = () => {
    showRecordFromJxModal({
      kind,
      onCaptured: async (tempWavPath, deviceInfo) => {
        if (kind === 'sequence') await applySequencerCapture(tempWavPath, deviceInfo);
        else                     await applyToneCapture(tempWavPath, deviceInfo);
      },
    });
  };

  if (isLowSignal) {
    // (a) — no signal detected.
    // Key 11 = Sequencer Save, key 14 = Tone Save in JX-3P Tape Memory mode.
    const saveKey = isSeq ? '11' : '14';
    showConfirmModal({
      title: 'No audio detected',
      body:
        `The capture from${labelText} was silent — JP didn't see any audio ` +
        'come through the cable.\n\n' +
        `Quick checks:\n` +
        `• On the JX-3P, press **Tape Memory**, then key **${saveKey}** (Save).\n` +
        `• Is your cable plugged into the JX **Tape Memory Save** jack ` +
        `(not Load)?\n` +
        `• In *Audio MIDI Setup*, is your audio interface selected as the ` +
        `default input?\n\n` +
        'Once you\'ve fixed it, try again.',
      confirmLabel: 'Try again',
      onConfirm: reopenWithoutRecalibrating,
    });
    return;
  }

  // (b) — had signal but didn't decode.
  const emptyDesc  = isSeq ? 'an empty sequence (no pages decoded)' : 'empty patches';
  const safetyText = isSeq ? 'Your existing sequences will not be modified.'
                           : 'Your active C/D banks will not be modified.';
  showConfirmModal({
    title: 'Recording didn\'t decode cleanly',
    body:
      `The capture from${labelText} came back as ${emptyDesc}. Audio reached ` +
      'JP, but the decoder couldn\'t make sense of it.\n\n' +
      `Most often this is a one-off glitch — **try again** with the same ` +
      'calibration. If it keeps failing, then try **recalibrating** the ' +
      `input gain. ${safetyText}`,
    // Primary (Roland green) = Try again — most likely to fix things now
    // that truncation is no longer the dominant failure mode.
    confirmLabel: 'Try again',
    confirmStyle: 'confirm',
    onConfirm: reopenWithoutRecalibrating,
    // Tertiary (Roland blue, alt-style) = Recalibrate — secondary
    // alternative when gain really is the issue.
    tertiaryLabel: 'Recalibrate',
    tertiaryStyle: 'alt',
    onTertiary: () => {
      // Capture the prior gain BEFORE clearing it so we can hand it
      // forward to the new calibration session as the starting slider
      // position. Otherwise calibration always opens at 1.0× — which
      // for the JX-3P's TAPE OUT means the meter looks barely alive
      // (the whole reason we calibrated to ~13× in the first place is
      // that unity gain on this hardware is too quiet to read), and
      // the user has to manually dial gain back up before pass 1 has
      // anything useful to measure. The calibration math
      // (newGain = currentGain * TARGET / measurePeak) works from any
      // starting position, so seeding from the prior gain is purely a
      // UX improvement — it lets pass 1 land near-target on the first
      // try instead of requiring the user to re-find the ballpark.
      const priorCal  = getCalibratedGain(deviceId, deviceLabel);
      const priorGain = priorCal ? priorCal.gain : null;
      if (deviceId) clearCalibratedGain(deviceId);
      showRecordFromJxModal({
        kind,
        initialGain: priorGain,
        onCaptured: async (tempWavPath, deviceInfo) => {
          if (kind === 'sequence') await applySequencerCapture(tempWavPath, deviceInfo);
          else                     await applyToneCapture(tempWavPath, deviceInfo);
        },
      });
    },
  });
}

// Inline JX-3P key-sequence diagram used in the Record-from-JX and
// Send-to-JX modals. Built as a single inline SVG so one CSS width on
// `.jx-key-diagram` controls every visual proportion — buttons, text,
// arrow, layout — without any pixel-level CSS tweaks. The button artwork
// matches panel.svg's button primitives exactly (58×58 cream face +
// 22×15 dark LED + 22×4 cream highlight at top), and the font matches
// the panel root style (Helvetica family).
//
//   action='save' → Save button highlighted, Tape Memory arrow in column 1
//                   (record-from-JX flow)
//   action='load' → Load button highlighted, Tape Memory arrow in column 3
//                   (send-to-JX flow)
//   kind='sequence' → keys 11/12/13 + "Sequencer" sub-mode pill
//   kind=other     → keys 14/15/16 + "Tone" sub-mode pill
//
// (The JX-3P remaps its numeric keys 11–13 to the Sequencer tape functions
// and 14–16 to the Tone tape functions, so the diagram has to swap the
// numbered labels in addition to the sub-mode pill. See CLAUDE.md pitfall
// #13 — never hardcode 14/15/16 anywhere; use this helper.)
function buildJxKeyDiagram({ action, kind }) {
  const isLoad = action === 'load';
  const isSeq  = kind === 'sequence';
  const keys   = isSeq ? ['11', '12', '13'] : ['14', '15', '16'];

  // ViewBox geometry — 240 wide × 300 tall. Drives all internal layout.
  // Three columns at x=40 / 120 / 200 (16px outer padding + 56px columns +
  // 20px gaps). The Tape Memory column lives at col 0 for Save variant,
  // col 2 for Load variant — matches Daniel's mockups where the arrow
  // visually drops onto the highlighted bottom-row key.
  const colCx  = [40, 120, 200];
  const tapeCx = isLoad ? colCx[2] : colCx[0];

  // Panel-style button (matches panel.svg "Manual" / "Write" anatomy).
  // active=true uses the same cream/dark/highlight colors as the panel;
  // active=false dims the face + highlight to greyscale variants.
  const btn = (cx, y, active) => {
    const face = active ? '#cbc4b4' : '#4a4a4a';
    const hl   = active ? '#dbd4c4' : '#5a5a5a';
    return [
      `<rect x="${cx - 29}" y="${y}" width="58" height="58" fill="${face}" stroke="#555" stroke-width="1.5" rx="2"/>`,
      `<rect x="${cx - 11}" y="${y}" width="22" height="15" fill="#333" rx="1"/>`,
      `<rect x="${cx - 11}" y="${y}" width="22" height="4" fill="${hl}"/>`,
    ].join('');
  };

  // Numeric key pill (above each function button).
  const numKey = (cx, label, active) => {
    const bg = active ? '#e84b2a' : '#5a2418';
    const fg = active ? '#ffffff' : '#9a7872';
    return [
      `<rect x="${cx - 29}" y="0" width="58" height="22" fill="${bg}" rx="2"/>`,
      `<text x="${cx}" y="16" text-anchor="middle" fill="${fg}" font-size="14" font-weight="600">${label}</text>`,
    ].join('');
  };

  // Function label under each button (Save / Verify / Load).
  const fnLabel = (cx, label, active) =>
    `<text x="${cx}" y="14" text-anchor="middle" fill="${active ? '#ffffff' : '#7a7a7a'}" font-size="14">${label}</text>`;

  // Tape Memory label alignment — must align to the button's outer edge
  // rather than centering on tapeCx, because "Tape Memory" (~85px at 14px
  // Helvetica) is wider than the 58px button. Centering caused the leading
  // "T" to clip past the left edge of the viewBox for the Save variant.
  // Save variant: left-align starting at the button's left edge.
  // Load variant: right-align ending at the button's right edge.
  const tapeLabelX      = isLoad ? tapeCx + 29 : tapeCx - 29;
  const tapeLabelAnchor = isLoad ? 'end' : 'start';

  const svg =
    `<svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" ` +
    `style="font-family:Helvetica,'Helvetica Neue',sans-serif;display:block;width:100%;height:auto;">` +
      // No background rect — the diagram inherits the modal's background so
      // there's no darker-than-modal frame around the buttons. Per Daniel's
      // design-language note: keep the diagram visually integrated with the
      // surrounding modal rather than boxing it in.
      `<text x="${tapeLabelX}" y="20" text-anchor="${tapeLabelAnchor}" fill="#f7f1e6" font-size="14" font-weight="500">Tape Memory</text>` +
      // Tape Memory button — always lit / active
      btn(tapeCx, 28, true) +
      // Arrow — 3px white shaft + triangular head, dropping toward the highlighted bottom-row key
      `<line x1="${tapeCx}" y1="94" x2="${tapeCx}" y2="124" stroke="#ffffff" stroke-width="3"/>` +
      `<polygon points="${tapeCx - 7},124 ${tapeCx + 7},124 ${tapeCx},138" fill="#ffffff"/>` +
      // Numeric keys row (y=148)
      `<g transform="translate(0, 148)">` +
        numKey(colCx[0], keys[0], !isLoad) +
        numKey(colCx[1], keys[1], false) +
        numKey(colCx[2], keys[2], isLoad) +
      `</g>` +
      // Function buttons row (y=178)
      `<g transform="translate(0, 178)">` +
        btn(colCx[0], 0, !isLoad) +
        btn(colCx[1], 0, false) +
        btn(colCx[2], 0, isLoad) +
      `</g>` +
      // Function labels row (y=246)
      `<g transform="translate(0, 246)">` +
        fnLabel(colCx[0], 'Save',   !isLoad) +
        fnLabel(colCx[1], 'Verify', false) +
        fnLabel(colCx[2], 'Load',   isLoad) +
      `</g>` +
      // Sub-mode pill — vintage cream background with dark text (matches panel palette)
      `<rect x="16" y="266" width="208" height="26" fill="#f7f1e6" rx="2"/>` +
      `<text x="120" y="284" text-anchor="middle" fill="#1a1a1a" font-size="14" font-weight="500">${isSeq ? 'Sequencer' : 'Tone'}</text>` +
    `</svg>`;

  const wrap = document.createElement('div');
  wrap.className = `jx-key-diagram jx-key-diagram-${isLoad ? 'load' : 'save'}`;
  wrap.innerHTML = svg;
  return wrap;
}

// Panel-style input gain knob — SVG component used in the Record-from-JX
// calibration modal's side-by-side layout. Mirrors panel.svg's knob
// primitives (r=22 cream circle + dark+grey indicator lines + 0/5/10
// labels in cream `#cfc8b8`), plus 11 radial tick marks around the dial
// for the 0–10 scale.
//
// Vertical drag changes the rotation 1°/1px (up=increase, down=decrease),
// matching the panel knob feel. Gain is log-scale 0.1×–30× across the
// -135° → +135° rotation range, identical to sliderToGain math just
// reparameterized for a 0–10 dial.
//
// `onChange(newGain)` fires on every drag tick. `wrap.setGain(g)` lets
// the parent push a new value programmatically (used to restore saved
// calibration on modal open).
function buildInputGainKnob({ initialGain, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'record-jx-gain-knob-wrap';

  // Log-scale gain ↔ angle helpers. 0× at -135°, 5 (≈1.7×) at 0°, 10 (30×) at +135°.
  // 270° of total rotation = 27° per knob unit.
  const gainToAngle = (g) => {
    const clamped = Math.max(0.1, Math.min(30, g));
    const k = Math.log(clamped / 0.1) / Math.log(300) * 10;
    return -135 + k * 27;
  };
  const angleToGain = (a) => {
    const clampedA = Math.max(-135, Math.min(135, a));
    const k = (clampedA + 135) / 27;
    return 0.1 * Math.pow(300, k / 10);
  };

  let currentAngle = gainToAngle(initialGain);

  // Build 11 radial tick marks (every 27°) around the dial.
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const angle = -135 + i * 27;
    const rad   = angle * Math.PI / 180;
    const x1 = 50 + Math.sin(rad) * 32;
    const y1 = 50 - Math.cos(rad) * 32;
    const x2 = 50 + Math.sin(rad) * 28;
    const y2 = 50 - Math.cos(rad) * 28;
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#cfc8b8" stroke-width="1.2" stroke-linecap="round"/>`);
  }

  // 0/5/10 labels positioned at the same radial distance as panel.svg
  // (slightly further out than the tick marks).
  const labelDist = 41;
  const labelData = [
    { value: '0',  angle: -135 },
    { value: '5',  angle:    0 },
    { value: '10', angle:  135 },
  ];
  const labels = labelData.map(({ value, angle }) => {
    const rad = angle * Math.PI / 180;
    const x = 50 + Math.sin(rad) * labelDist;
    const y = 50 - Math.cos(rad) * labelDist + 3; // +3 for baseline adjust
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" fill="#cfc8b8" font-size="9">${value}</text>`;
  }).join('');

  wrap.innerHTML =
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" ` +
      `style="font-family:Helvetica,'Helvetica Neue',sans-serif;display:block;width:100%;height:auto;cursor:ns-resize;user-select:none;">` +
      ticks.join('') +
      labels +
      // Knob body — matches panel.svg knob primitive (cream face, grey stroke)
      `<circle cx="50" cy="50" r="22" fill="#cbc4b4" stroke="#555" stroke-width="1.5"/>` +
      // Rotating indicator group (dark outer line + grey inner line, panel style)
      `<g class="knob-indicator" transform="rotate(${currentAngle.toFixed(1)} 50 50)">` +
        `<line x1="50" y1="34" x2="50" y2="38" stroke="#1a1a1a" stroke-width="3.5" stroke-linecap="round"/>` +
        `<line x1="50" y1="38" x2="50" y2="48" stroke="#888" stroke-width="3.5" stroke-linecap="round"/>` +
      `</g>` +
    `</svg>`;

  const svg = wrap.querySelector('svg');
  const indicator = wrap.querySelector('.knob-indicator');

  let dragStartY    = null;
  let dragStartAngle = null;

  const applyAngle = (newAngle) => {
    currentAngle = Math.max(-135, Math.min(135, newAngle));
    indicator.setAttribute('transform', `rotate(${currentAngle.toFixed(1)} 50 50)`);
    if (onChange) onChange(angleToGain(currentAngle));
  };

  svg.addEventListener('mousedown', (e) => {
    dragStartY     = e.clientY;
    dragStartAngle = currentAngle;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (dragStartY === null) return;
    const dy = dragStartY - e.clientY;       // up = positive = increase
    applyAngle(dragStartAngle + dy);
  });
  document.addEventListener('mouseup', () => {
    dragStartY = null;
    dragStartAngle = null;
  });

  // Programmatic setter (saved calibration restore, etc.). Does NOT fire onChange.
  wrap.setGain = (g) => {
    currentAngle = gainToAngle(g);
    indicator.setAttribute('transform', `rotate(${currentAngle.toFixed(1)} 50 50)`);
  };

  return wrap;
}

// Vertical 7-segment level meter — SVG component used alongside the gain
// knob in the calibration row. Classic VU-style ladder: each segment is
// PRE-assigned a zone color (blue / green / yellow / red) based on its
// position, and lights up independently when the live peak crosses its
// threshold. Provides ~10× the calibration resolution of the earlier
// 3-segment version while preserving the panel-LED visual feel.
//
//   seg 6 (top)     RED    lit at peak ≥ 0.88   — clipping
//   seg 5           YELLOW lit at peak ≥ 0.76   — hot but OK
//   seg 4           GREEN  lit at peak ≥ 0.62   — target zone top
//   seg 3           GREEN  lit at peak ≥ 0.48   — target zone (calibration aim, ~0.60)
//   seg 2           GREEN  lit at peak ≥ 0.34   — target zone bottom
//   seg 1           BLUE   lit at peak ≥ 0.22   — low signal
//   seg 0 (bottom)  BLUE   lit at peak ≥ 0.10   — signal present
//
// Calibration aims for peak 0.60 → user dials gain until segments 0–3 are
// lit (4 blue+green segments, seg 4+ still dark). That's the visual "I'm
// in the green band, optimally calibrated" state.
//
// Calling `.setPeak(p)` updates fills.
function buildVerticalLevelMeter() {
  const wrap = document.createElement('div');
  wrap.className = 'record-jx-vmeter-wrap';

  // 7 stacked segments, top→bottom (DOM order), with 3px gaps. ViewBox 30×100.
  // Each segment is 11px tall: 7*11 + 6*3 = 95 px. Centered with y=3 top padding.
  const SEG_H = 11;
  const GAP   = 3;
  const TOP_Y = 3;
  const segs = [];
  for (let i = 0; i < 7; i++) {
    const y = TOP_Y + i * (SEG_H + GAP);
    // i=0 is TOP segment (red zone), i=6 is BOTTOM (blue zone)
    segs.push({ y, height: SEG_H });
  }
  const rects = segs.map((s, i) =>
    `<rect class="vmeter-seg" data-seg="${i}" x="4" y="${s.y}" width="22" height="${s.height}" fill="#cbc4b4" rx="1.5"/>`
  ).join('');

  // Target marker — chunky white triangle + "target" label pointing at
  // the amber segment (the calibration target as of 2026-05-24). Aim:
  // land peak at 0.78 (mid-amber), which means the topmost lit segment
  // when correctly dialed in is the amber one. DOM order top→bottom:
  // seg 0=red (top), seg 1=amber, seg 2=green-top, etc. Notch + label
  // both vertically aligned to the center of seg 1 (amber).
  //   segs[1].y      = TOP_Y + 1*(SEG_H+GAP) = 3 + 14 = 17
  //   segs[1] center = 17 + SEG_H/2          = 17 + 5.5 = 22.5
  // ViewBox extended to 80 wide so the notch + "target" text fit in the
  // same SVG coordinate space (no HTML-vs-SVG alignment math). Wrap CSS
  // width = 78 px ≈ 1:1 with viewBox units, so screen size of meter
  // rects matches the prior visual weight.
  const NOTCH_Y = TOP_Y + 1 * (SEG_H + GAP) + SEG_H / 2;   // 22.5
  // Apex on the LEFT (x=26, touching the meter's right edge) so the
  // notch points INTO the meter at the target segment — visually says
  // "aim here" rather than pointing away toward the "target" label.
  const targetNotch =
    `<polygon points="36,${NOTCH_Y - 6} 36,${NOTCH_Y + 6} 26,${NOTCH_Y}" fill="#ffffff"/>`;
  const targetLabel =
    `<text x="40" y="${NOTCH_Y + 4}" fill="#cfc8b8" font-size="11" font-weight="500">target</text>`;

  wrap.innerHTML =
    `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style="font-family:Helvetica,'Helvetica Neue',sans-serif;display:block;width:100%;height:auto;">` +
      rects +
      targetNotch +
      targetLabel +
    `</svg>`;

  const segEls = wrap.querySelectorAll('.vmeter-seg');
  // segEls[0] = TOP (DOM order); segEls[6] = BOTTOM.

  // Brand palette + threshold ladder. Indexed by ladderPos where 0=bottom
  // and 6=top, matching the visual stack. Unlit segments use the panel
  // button-face cream (#cbc4b4) so the meter reads like a row of physical
  // JX-3P pads at rest, and any lit colored segment pops clearly against
  // the cream baseline.
  const UNLIT = '#cbc4b4';   // panel button-face cream
  const BLUE  = '#33508f';   // Roland blue
  const GREEN = '#1f6e5b';   // Roland green
  const AMBER = '#c39a3a';   // app warning amber (also used for low-signal toasts)
  const RED   = '#b94a2e';   // Roland red

  //                       ladderPos: 0     1     2      3      4      5      6
  //                                  bot                                      top
  const ZONE_COLOR     = [BLUE, BLUE, GREEN, GREEN, GREEN, AMBER, RED];
  // Bottom segment lights at 0.02 (essentially "any signal above true
  // silence") so the user gets a visual "input is alive" cue even with
  // very quiet inputs. Without this, a totally cream meter reads as
  // "dead" and the user might not realize audio is being received at
  // all. Higher thresholds are roughly linear from 0.22 → 0.88.
  const ZONE_THRESHOLD     = [0.02, 0.22, 0.34,  0.48,  0.62,  0.76,  0.88];
  // Hysteresis + falling-edge debounce (2026-05-24):
  //
  // 1. Hysteresis: each segment needs peak to drop ~25 % below the ON
  //    threshold before turning off. Handles steady-noise oscillation
  //    around a single threshold.
  //
  // 2. Falling-edge debounce: even with hysteresis, the JX's post-dump
  //    "end noise tone" has varying amplitude that crosses both the ON
  //    and OFF thresholds repeatedly. Require 6 consecutive ticks below
  //    the off-threshold before actually turning a segment off (rising
  //    edge stays instant — important for signal-arrival visibility).
  //    At ~60 fps that's ~100 ms of sustained "off" — eats the
  //    JX end-tone wobble while still feeling responsive to real
  //    intentional level changes.
  const ZONE_OFF_THRESHOLD = ZONE_THRESHOLD.map((t) => t * 0.75);
  const FALLING_EDGE_DEBOUNCE_TICKS = 6;
  const lastLit         = new Array(7).fill(false);
  const belowOffTicks   = new Array(7).fill(0);

  wrap.setPeak = (peak) => {
    // Walk each ladder position (0=bottom→6=top).
    // SVG DOM order is reversed (segEls[0]=top), so map ladderPos i →
    // segEls[6-i].
    for (let i = 0; i < 7; i++) {
      if (lastLit[i]) {
        // Currently lit. Only turn off after N consecutive sub-OFF ticks.
        if (peak < ZONE_OFF_THRESHOLD[i]) {
          belowOffTicks[i] += 1;
          if (belowOffTicks[i] >= FALLING_EDGE_DEBOUNCE_TICKS) {
            lastLit[i] = false;
            belowOffTicks[i] = 0;
          }
        } else {
          belowOffTicks[i] = 0;  // any non-sub-OFF tick resets the streak
        }
      } else {
        // Currently dark. Light immediately on first peak ≥ ON threshold.
        if (peak >= ZONE_THRESHOLD[i]) {
          lastLit[i] = true;
          belowOffTicks[i] = 0;
        }
      }
      const fill = lastLit[i] ? ZONE_COLOR[i] : UNLIT;
      segEls[6 - i].setAttribute('fill', fill);
    }
  };

  return wrap;
}

// Custom bank builder buckets — a persistent staging area where the user can
// drag patches from active C/D banks (across multiple package loads) and then
// save the result as a new library package. Each slot is null (empty) or
// { params, name }. `active: true` means the bucket panel is open.
function ensureCustomBucketsShape() {
  if (!library.customBuckets || typeof library.customBuckets !== 'object') {
    library.customBuckets = { active: false, C: [], D: [] };
  }
  if (typeof library.customBuckets.active !== 'boolean') library.customBuckets.active = false;
  ['C', 'D'].forEach((bank) => {
    if (!Array.isArray(library.customBuckets[bank])) library.customBuckets[bank] = [];
    const arr = library.customBuckets[bank];
    for (let s = 0; s < 16; s++) {
      if (arr[s] === undefined) arr[s] = null;
    }
    arr.length = 16;
  });
}

// Old packages stored pkg.names: { slotKey: name }. Convert to pkg.slotMeta.
function migratePackageShape(pkg) {
  if (!pkg || typeof pkg !== 'object') return;
  if (pkg.slotMeta && pkg.slotMeta.C && pkg.slotMeta.D) return;
  const legacy = pkg.names || {};
  pkg.slotMeta = pkg.slotMeta || {};
  ['C', 'D'].forEach((bank) => {
    if (!Array.isArray(pkg.slotMeta[bank])) pkg.slotMeta[bank] = [];
    for (let s = 0; s < 16; s++) {
      const key = `${bank}${s + 1}`;
      if (!pkg.slotMeta[bank][s] || typeof pkg.slotMeta[bank][s] !== 'object') {
        pkg.slotMeta[bank][s] = { name: legacy[key] || null, origin: key };
      }
    }
    pkg.slotMeta[bank].length = 16;
  });
  if ('names' in pkg) delete pkg.names;
}

// Sequence entries split into `tape` (hardware-faithful, round-trips to JX)
// and `app` (librarian-only metadata: patch note, paired patch).
// Legacy entries had pairedPatch at the top level + sequenceData: null; this
// migrates them in place. Safe to call repeatedly.
function migrateSequenceShape(seq) {
  if (!seq || typeof seq !== 'object') return;
  if (!seq.tape || typeof seq.tape !== 'object') {
    seq.tape = {
      // The JX-3P sequencer is one continuous ~128-step memory split into
      // 8 pages × 16 steps on tape. We treat a saved library entry as one
      // logical sequence and store all pages as the unit. Each entry in
      // `pages` is either an array of 16 step objects or null if the page
      // was empty. `pages` itself is null until the codec is wired.
      pages: null,
    };
  } else {
    if ('sequenceIndex' in seq.tape) delete seq.tape.sequenceIndex;
    if ('steps'         in seq.tape) delete seq.tape.steps;
    if (!('pages' in seq.tape)) seq.tape.pages = null;
  }
  if (!seq.app || typeof seq.app !== 'object') seq.app = {};
  if (typeof seq.app.patchNote !== 'string') seq.app.patchNote = '';
  if (!seq.app.pairedPatch || typeof seq.app.pairedPatch !== 'object') {
    const legacyPp = seq.pairedPatch || {};
    seq.app.pairedPatch = {
      bank:      legacyPp.bank || null,
      slot:      typeof legacyPp.slot === 'number' ? legacyPp.slot : null,
      params:    legacyPp.params || null,
      patchName: legacyPp.patchName || null,
    };
  }
  // Strip the legacy app.rate block. The RATE slider was removed from the
  // save / load / send modals on May 23, 2026 because the in-import UI was
  // too much for the user to figure out; tempo metadata will be captured
  // elsewhere in a future revision. Existing sequences are cleaned up on
  // first load after the upgrade and persist tidy on their next save.
  if ('rate'         in seq.app) delete seq.app.rate;
  if ('pairedPatch'  in seq) delete seq.pairedPatch;
  if ('sequenceData' in seq) delete seq.sequenceData;
}

function currentPatch() {
  // Paired-patch preview (v0.6.5): when a Library sequence with paired-
  // patch metadata is selected, the panel + Write source pull from the
  // preview slot instead of the active C/D slot. Other code that needs
  // the actual C/D slot identity (e.g. modified-dot tracking, slotMeta
  // lookups) uses activeBankSelection() / slotMeta arrays directly and
  // is unaffected by this preview indirection.
  if (currentPreviewPatch) return currentPreviewPatch.params;
  // v0.7.0 "play for fun" on the Library tab: return a phantom patch
  // (lazy-cloned from activeBankPatch) so knobs + switches respond to
  // mouse input without affecting any real C/D slot. Phantom is reset
  // on bank-tab navigation, so it always starts fresh from the user's
  // most-recent bank context.
  if (selBank === 'L') return getOrCreatePhantomPatch();
  if (!patches || !Array.isArray(patches.banks)) return null;
  const bankIdx = selBank === 'D' ? 1 : 0;
  return patches.banks[bankIdx] && patches.banks[bankIdx][selSlot] || null;
}

// v0.7.0 — phantom patch backing the Library-tab "play for fun" mode.
// Lazy-initialized from activeBankPatch on first read, deep-cloned so
// mutations don't leak back into the real slot. Cleared on bank-tab
// nav so the next Library visit re-clones from the current bank
// context. Library handlers that mutate it (knob drag, switch click)
// fall through the existing currentPatch() path — no per-handler
// branching needed. Save/render side effects fire harmlessly because
// phantom isn't in library.json.
let phantomPatch = null;
function getOrCreatePhantomPatch() {
  if (!phantomPatch) {
    const base = (typeof activeBankPatch === 'function') ? activeBankPatch() : null;
    phantomPatch = base ? JSON.parse(JSON.stringify(base)) : {};
  }
  return phantomPatch;
}

// Enter paired-patch preview mode — panel displays these params + name
// instead of the active C/D slot. Used by v0.6.5 paired-patch auto-load
// when user selects a Library sequence with paired-patch metadata.
function enterPreviewMode(params, name, sourceLabel) {
  if (!params || typeof params !== 'object') return;
  currentPreviewPatch = {
    params,
    name: name || '(unnamed patch)',
    sourceLabel: sourceLabel || null,
  };
  updateSvgPatchName();
  updateAllControls(currentPatch());
}

// Exit preview mode → panel returns to active C/D slot display (or to
// the Library-tab phantom when on Library). Called automatically when
// user selects any C/D slot (selectPatch) or switches to a sequence
// without paired-patch metadata.
function exitPreviewMode() {
  if (!currentPreviewPatch) return;
  currentPreviewPatch = null;
  updateSvgPatchName();
  // v0.7.0: currentPatch() now returns the phantom patch on the
  // Library tab (was null pre-v0.7), so it's safe to route everything
  // through it — no Library-tab special-case needed.
  updateAllControls(currentPatch());
}

// Returns the bank+slot of the patch the SVG panel is visibly showing. On a
// bank tab, this is the current selection. On the Library tab, it's the most
// recent bank/slot the user was on before navigating away (so flows like
// "pair this sequence with the active patch" still make sense).
function activeBankSelection() {
  if (selBank === 'C' || selBank === 'D') return { bank: selBank, slot: selSlot };
  return { bank: lastBankSelection.bank, slot: lastBankSelection.slot };
}

function activeBankPatch() {
  const { bank, slot } = activeBankSelection();
  if (!patches || !Array.isArray(patches.banks)) return null;
  const bankIdx = bank === 'D' ? 1 : 0;
  return (patches.banks[bankIdx] && patches.banks[bankIdx][slot]) || null;
}

// ═══════════════════════════════════════════════════════════════
// SVG: locate the patch-name text element and update it
// ═══════════════════════════════════════════════════════════════

function findSvgPatchNameEl(svgEl) {
  // The locked SVG draws the patch name at x=922 y=74, font-size=13, bold.
  // Walk all <text> nodes and pick the one whose initial content matches the
  // patch-slot pattern ("C5: …"). This avoids depending on coordinate values
  // that may shift if the SVG is regenerated.
  const texts = svgEl.querySelectorAll('text');
  for (const t of texts) {
    if (/^[CD]\d+:/.test(t.textContent.trim())) return t;
  }
  return null;
}

function updateSvgPatchName() {
  if (!svgPatchNameEl) return;
  // Two-tone readout, independent of bank:
  //   - Slot prefix (C2: / D7: / …) in light warm gray  #8a7f70
  //   - Patch name                            in antique white #f7f1e6
  // Colors are set on each <tspan> in the SVG; the JS just updates the
  // text content here.
  const prefixSpan = svgPatchNameEl.querySelector('.patch-readout-prefix');
  const nameSpan   = svgPatchNameEl.querySelector('.patch-readout-name');
  // v0.6.5 paired-patch preview: when active, the parallelogram shows
  // "Preview: {paired patch name}" instead of "{slot}: {name}". A CSS
  // class on the SVG element styles the preview state distinctly (the
  // existing two-tone tspans stay; just the text content changes). Class
  // toggle communicates the non-slot state via panel styling.
  let prefix, name;
  if (currentPreviewPatch) {
    // Preview mode: the section label above the parallelogram swaps to
    // "Paired Patch Preview" (announces the mode), and the parallelogram
    // shows the actual patch name in amber italic (via the prefix tspan,
    // which carries the .patch-readout-preview styling).
    prefix = currentPreviewPatch.name || '(unnamed patch)';
    name   = '';
    svgPatchNameEl.classList.add('patch-readout-preview');
  } else {
    // On Library tab there's no current C/D slot, so the parallelogram
    // would show "L1: click to name" if we used selBank/selSlot
    // directly. Fall through to activeBankSelection() which returns the
    // last bank/slot the user was on before navigating to Library —
    // matches the panel's behavior of "showing what you'd be working
    // on if you switched back to a bank tab."
    const { bank, slot } = activeBankSelection();
    prefix = `${slotKey(bank, slot)}: `;
    name   = patchName(bank, slot) || patchPlaceholder(bank, slot);
    svgPatchNameEl.classList.remove('patch-readout-preview');
  }
  if (prefixSpan) prefixSpan.textContent = prefix;
  if (nameSpan)   nameSpan  .textContent = name;
  // Swap the section label above the parallelogram to match the mode.
  const sectionLabel = (svgPatchNameEl.ownerSVGElement || svgPatchNameEl.closest('svg'))
    ?.querySelector('#svg-patch-section-label');
  if (sectionLabel) {
    sectionLabel.textContent = currentPreviewPatch ? 'Paired Patch Preview' : 'Patch';
  }
  // Always refresh the paired-patch hint alongside the parallelogram —
  // both react to the same preview-state change.
  updateSvgPairedPatchHint();
  // Truncate the NAME portion (never the prefix) with an ellipsis if the
  // rendered text would extend past the red parallelogram's slanted right
  // edge at the text baseline.
  const MAX_WIDTH = 195;
  if (typeof svgPatchNameEl.getComputedTextLength !== 'function') return;
  while (svgPatchNameEl.getComputedTextLength() > MAX_WIDTH &&
         nameSpan && nameSpan.textContent.length > 4) {
    nameSpan.textContent = nameSpan.textContent.slice(0, -2) + '…';
  }
}

// Paired-patch hint text below the JP PATCHES logo — visible only when
// in preview mode (paired patch auto-loaded from a Library sequence).
// Implementation: a runtime-created SVG foreignObject hosting an HTML
// <div> so word-wrapping works naturally instead of needing manual
// <tspan dy=...> line breaks. JP logo is at y=188..348 in the 1050×620
// viewBox, so the hint slot below it sits at y≈360-470 with comfortable
// margin before the Sustain/Release/Manual/Write row.
function updateSvgPairedPatchHint() {
  if (!svgPatchNameEl) return;
  const svg = svgPatchNameEl.ownerSVGElement || svgPatchNameEl.closest('svg');
  if (!svg) return;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const XHTMLNS = 'http://www.w3.org/1999/xhtml';
  let hintFo = svg.querySelector('foreignObject.paired-patch-hint-fo');
  if (!hintFo) {
    // Build on first use — kept out of panel.svg per the "don't modify
    // the locked SVG" convention. Positioned visually below the JP logo.
    hintFo = document.createElementNS(SVGNS, 'foreignObject');
    hintFo.setAttribute('class', 'paired-patch-hint-fo');
    hintFo.setAttribute('x', '755');
    hintFo.setAttribute('y', '358');
    hintFo.setAttribute('width', '280');
    hintFo.setAttribute('height', '115');
    const div = document.createElement('div');
    div.setAttribute('xmlns', XHTMLNS);
    div.className = 'paired-patch-hint';
    hintFo.appendChild(div);
    svg.appendChild(hintFo);
  }
  const div = hintFo.querySelector('.paired-patch-hint');
  if (!currentPreviewPatch || !div) {
    hintFo.style.display = 'none';
    return;
  }
  // Derive the selected-sequence label for the hint copy. selSequence is
  // set by the row click handler; library.sequences[selSequence] is the
  // entry whose paired patch is currently previewed.
  const selectedSeq = (typeof selSequence === 'number' && library && library.sequences)
    ? library.sequences[selSequence]
    : null;
  const seqLabel = (selectedSeq && (selectedSeq.customName || selectedSeq.defaultName)) || 'this sequence';
  const patchLabel = currentPreviewPatch.name || 'this patch';
  const noteLabel  = (selectedSeq && selectedSeq.app && selectedSeq.app.patchNote || '').trim();
  // Label/value layout — labels dim (modal-body pattern), values bright:
  //   sequence: {italic seqLabel}
  //   paired patch: {bold italic amber patchLabel}
  //   notes: {italic noteLabel}            (optional)
  //   click Write to save paired patch     (dim — CTA, not data)
  // Built via DOM (names are user data — avoid innerHTML). Each line is
  // its own <div> for clean stacking and left-alignment of the labels.
  div.textContent = '';
  const mkLabel = (text) => {
    const s = document.createElement('span');
    s.className = 'paired-patch-hint-label';
    s.textContent = text;
    return s;
  };

  const line1 = document.createElement('div');
  line1.appendChild(mkLabel('sequence: '));
  const seqI = document.createElement('i');
  seqI.textContent = seqLabel;
  line1.appendChild(seqI);

  const line2 = document.createElement('div');
  line2.appendChild(mkLabel('written with: '));
  const patchI = document.createElement('i');
  patchI.className = 'paired-patch-hint-name';
  patchI.textContent = patchLabel;
  line2.appendChild(patchI);

  div.appendChild(line1);
  div.appendChild(line2);

  // Optional notes line — only render when the sequence carries a
  // non-empty patchNote. Sits between paired patch and the call-to-
  // action so the user reads context before deciding to Write.
  if (noteLabel) {
    const lineN = document.createElement('div');
    lineN.className = 'paired-patch-hint-notes';
    lineN.appendChild(mkLabel('notes: '));
    const noteI = document.createElement('i');
    noteI.textContent = noteLabel;
    lineN.appendChild(noteI);
    div.appendChild(lineN);
  }

  const lineCTA = document.createElement('div');
  lineCTA.className = 'paired-patch-hint-cta';
  lineCTA.appendChild(document.createTextNode('click '));
  // "Write" in a mini panel-button frame so the user reads it as
  // referring to the actual Write button on the panel, not the verb.
  // Frame styling mirrors the panel-button face (#cbc4b4 cream +
  // #555 stroke) — design-system primitive.
  const writeKey = document.createElement('span');
  writeKey.className = 'paired-patch-hint-write-key';
  writeKey.textContent = 'Write';
  lineCTA.appendChild(writeKey);
  lineCTA.appendChild(document.createTextNode(' to save paired patch'));
  div.appendChild(lineCTA);
  hintFo.style.display = '';
}

// ═══════════════════════════════════════════════════════════════
// SVG knob tagging + rotation
// ═══════════════════════════════════════════════════════════════

function paramToAngle(param, value) {
  const steps = DISCRETE[param];
  if (steps) {
    const custom = SNAP_ANGLES[param];
    const idx = steps.indexOf(value);
    if (idx < 0) return custom ? custom[0] : -140;
    if (custom) return custom[Math.min(idx, custom.length - 1)];
    return steps.length < 2 ? 0 : -140 + (idx / (steps.length - 1)) * 280;
  }
  const v = Math.max(0, Math.min(255, typeof value === 'number' ? value : 0));
  return -140 + (v / 255) * 280;
}

// Walk the SVG, tag each knob's inner <g class="knob"> with data-param so
// updateKnobs can spin it via rotate(). Indicator primitives already point
// straight up by construction, so rotation happens around the inner g's local
// (0,0) — the outer translate handles positioning.
function tagKnobs(svg) {
  const SVGNS = 'http://www.w3.org/2000/svg';
  KNOB_REGISTRY.forEach(({ gTranslate, param }) => {
    const outer = svg.querySelector(`g[transform="translate(${gTranslate})"]`);
    if (!outer) return;
    const inner = outer.querySelector('g.knob');
    if (!inner) return;

    inner.dataset.param = param;

    // Transparent hit-target slightly larger than the knob face, so clicks
    // anywhere on/near the knob start a drag.
    const face = inner.querySelector('circle');
    const bodyR = parseFloat(face && face.getAttribute('r')) || 22;
    const overlay = document.createElementNS(SVGNS, 'circle');
    overlay.setAttribute('cx', '0');
    overlay.setAttribute('cy', '0');
    overlay.setAttribute('r', String(bodyR + 6));
    overlay.setAttribute('fill', 'transparent');
    overlay.dataset.control = 'knob';
    overlay.dataset.param = param;
    overlay.style.cursor = SNAP_ANGLES[param] ? 'pointer' : 'ns-resize';
    outer.appendChild(overlay);
  });
}

function updateKnobs(patch) {
  if (!patch) return;
  document.querySelectorAll('g.knob[data-param]').forEach((g) => {
    const param = g.dataset.param;
    if (!(param in patch)) return;
    const angle = paramToAngle(param, patch[param]);
    g.setAttribute('transform', `rotate(${angle.toFixed(1)})`);
  });
}

// Inverse of paramToAngle: convert a rotation back to a stored param value.
function angleToParam(param, angle) {
  const a = Math.max(-140, Math.min(140, angle));
  const steps = DISCRETE[param];
  if (steps) {
    if (steps.length < 2) return steps[0];
    const stepSize = 280 / (steps.length - 1);
    const idx = Math.round((a + 140) / stepSize);
    return steps[Math.max(0, Math.min(steps.length - 1, idx))];
  }
  return Math.round(((a + 140) / 280) * 255);
}

// ═══════════════════════════════════════════════════════════════
// Switches
// ═══════════════════════════════════════════════════════════════

function tagSwitches(svg) {
  SWITCH_REGISTRY.forEach((spec) => {
    const body = svg.querySelector(spec.bodySel);
    if (!body) return;
    body.dataset.control = 'switch';
    body.dataset.param = spec.param;
    body.dataset.switchType = spec.type;
    body.style.cursor = 'pointer';

    // Identify segment rects: the next 2 (duo) or 3 (tri) <rect> siblings
    // that are smaller than the body width.
    const wantSegs = spec.type === 'duo-enum' ? 2 : 3;
    const bodyW = parseFloat(body.getAttribute('width'));
    const segs = [];
    let s = body.nextElementSibling;
    while (s && segs.length < wantSegs) {
      if (s.tagName.toLowerCase() === 'rect' && parseFloat(s.getAttribute('width')) < bodyW) {
        segs.push(s);
      }
      s = s.nextElementSibling;
    }
    segs.forEach((seg, i) => {
      seg.id = `sw-${spec.param}-${i}`;
      seg.style.transition = 'fill 0.15s ease-out';
      // Make each segment a click target too, so the entire visible switch
      // (not just the thin border) responds to clicks.
      seg.dataset.control = 'switch';
      seg.dataset.param = spec.param;
      seg.dataset.switchType = spec.type;
      seg.style.cursor = 'pointer';
    });
  });
}

function isSwitchTopActive(spec, value) {
  if (spec.type === 'tri-binary') return Boolean(value);
  if (spec.type === 'tri-enum' || spec.type === 'duo-enum') return value === spec.vals[0];
  return false;
}

function updateSwitches(patch) {
  if (!patch) return;
  SWITCH_REGISTRY.forEach((spec) => {
    if (!(spec.param in patch)) return;
    const topActive = isSwitchTopActive(spec, patch[spec.param]);
    const seg0 = document.getElementById(`sw-${spec.param}-0`);
    const seg1 = document.getElementById(`sw-${spec.param}-1`);
    const seg2 = document.getElementById(`sw-${spec.param}-2`);
    if (!seg0) return;
    if (spec.type === 'duo-enum') {
      // 2-segment gold (top) / grey (bot)
      seg0.setAttribute('fill', topActive ? '#c8a020' : '#555');
      seg1.setAttribute('fill', topActive ? '#555' : '#c8a020');
    } else {
      // 3-segment white-grey-dark; highlight (white) moves between top and bot
      seg0.setAttribute('fill', topActive ? '#d0d0d0' : '#555');
      if (seg1) seg1.setAttribute('fill', '#999');
      if (seg2) seg2.setAttribute('fill', topActive ? '#555' : '#d0d0d0');
    }
  });
}

function handleSwitchClick(body) {
  const param = body.dataset.param;
  const spec = SWITCH_REGISTRY.find((s) => s.param === param);
  if (!spec) return;
  const patch = currentPatch();
  if (!patch) return;
  if (spec.type === 'tri-binary') {
    patch[param] = !patch[param];
  } else {
    const cur = patch[param];
    const i = spec.vals.indexOf(cur);
    patch[param] = spec.vals[(i + 1) % spec.vals.length];
  }
  updateSwitches(patch);
  renderPatchList();        // refresh the modified-indicator dot for this slot
  saveLibraryDebounced();   // persist active state — see saveLibraryDebounced comment
}

// ═══════════════════════════════════════════════════════════════
// Buttons (Save / Load / Manual / Write)
// ═══════════════════════════════════════════════════════════════

function tagButtons(svg) {
  BUTTON_REGISTRY.forEach((spec) => {
    const body = svg.querySelector(spec.bodySel);
    if (!body) return;
    body.dataset.control = 'button';
    body.dataset.buttonId = spec.id;
    body.style.cursor = 'pointer';
    // LED is the next-sibling rect with height=15 (silver-body LED flush
    // at the button top edge).
    let s = body.nextElementSibling;
    while (s && !(s.tagName.toLowerCase() === 'rect' && s.getAttribute('height') === '15')) {
      s = s.nextElementSibling;
    }
    if (s) {
      s.id = `led-${spec.id}`;
      s.style.transition = 'fill 0.08s ease-out';
      s.setAttribute('fill', LED_OFF);
    }
  });
}

function lightButton(id, on) {
  const led = document.getElementById(`led-${id}`);
  if (!led) return;
  if (!on) {
    led.setAttribute('fill', LED_OFF);
    return;
  }
  const spec = BUTTON_REGISTRY.find((b) => b.id === id);
  led.setAttribute('fill', spec ? spec.color : LED_OFF);
}

// ═══════════════════════════════════════════════════════════════
// Tag everything + push current values
// ═══════════════════════════════════════════════════════════════

function tagControls(svg) {
  tagKnobs(svg);
  tagSwitches(svg);
  tagButtons(svg);
}

function updateAllControls(patch) {
  updateKnobs(patch);
  updateSwitches(patch);
}

// Walk up from a click target to find the closest control element.
function findControl(target) {
  let el = target;
  while (el && el.nodeType === 1) {
    if (el.dataset && el.dataset.control) return el;
    el = el.parentNode;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Event delegation for all interactive controls
// ═══════════════════════════════════════════════════════════════

// setupInteraction — wires all pointer interactions on the SVG panel:
// knob drag/snap, switch click, button press, the value-tooltip on
// hover, and the numeric-edit overlay on dblclick. Three logical
// sections (split into named sub-functions inside the IIFE for
// readability, since each shares state via closure with the others):
//
//   setupKnobDragAndButtons(svg) — mousedown/move/up handlers.
//     Manages the dragState + button-press tracking. Defines
//     applyDragAngle which writes both the knob rotation AND the
//     live tooltip (which is owned by setupKnobTooltipAndEdit).
//
//   setupKnobTooltipAndEdit(svg) — hover delay + dblclick numeric
//     entry. Owns the valueTooltip + editInput DOM elements and
//     their lifecycle. The drag handlers call into here (via
//     show/updateDragTooltip + hideKnobValueTooltip) to coordinate.
//
// The two sections share several closures (dragState, tooltipTimer,
// valueTooltip, editInput); rather than splitting into separate
// modules and threading state between them, we keep them in one
// function with the structure made visible via the sub-function
// names + section comments.
function setupInteraction(svg) {
  // Shared closure state across the two sub-sections below.
  let dragState    = null;
  let downBtnId    = null;
  let valueTooltip = null;
  let editInput    = null;
  let tooltipTimer = null;

  // Display-range conversion (2026-05-25): patches store uint8
  // (0–255) — the JX-3P tape format precision. Hover tooltip + numeric
  // edit display as 0–100% because it's easier to read + matches the
  // forthcoming MIDI 7-bit range (0–127) in spirit. Drag retains full
  // 256-value access via cursor; typed input loses 2.5× granularity
  // but well below JND for any continuous JX param.
  const uint8ToDisplay = (n) => Math.round(n * 100 / 255);
  const displayToUint8 = (n) => Math.round(n * 255 / 100);

  const isSmoothKnob = (ctrl) => (
    ctrl && ctrl.dataset.control === 'knob' && !DISCRETE[ctrl.dataset.param]
  );

  const positionOverlay = (el, knobEl) => {
    const r = knobEl.getBoundingClientRect();
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top  = `${r.top  + r.height / 2}px`;
  };

  // ── Tooltip lifecycle (shared by hover, drag, and edit paths) ────
  const TOOLTIP_HOVER_DELAY_MS = 1000;

  const hideKnobValueTooltip = () => {
    if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
    if (valueTooltip) { valueTooltip.remove();      valueTooltip = null; }
  };

  // Hover-delayed: 1 s dwell before showing. Casual fly-overs never
  // surface a tooltip; only deliberate hover does.
  const showKnobValueTooltip = (knobEl, param) => {
    if (dragState || editInput) return;
    hideKnobValueTooltip();
    tooltipTimer = setTimeout(() => {
      tooltipTimer = null;
      if (dragState || editInput) return;       // re-check at fire time
      const patch = currentPatch();
      if (!patch || !(param in patch)) return;
      const val = patch[param];
      if (typeof val !== 'number') return;      // discrete enum values skipped
      valueTooltip = document.createElement('div');
      valueTooltip.className = 'knob-value-tooltip';
      valueTooltip.textContent = `${uint8ToDisplay(val)}%`;
      document.body.appendChild(valueTooltip);
      positionOverlay(valueTooltip, knobEl);
    }, TOOLTIP_HOVER_DELAY_MS);
  };

  // During an active drag we bypass the hover delay — the user wants
  // to see the live value as the knob moves. showDragTooltip is
  // called from the mousedown handler in setupKnobDragAndButtons;
  // updateDragTooltip is called from applyDragAngle each mousemove.
  const showDragTooltip = (knobEl, val) => {
    hideKnobValueTooltip();
    valueTooltip = document.createElement('div');
    valueTooltip.className = 'knob-value-tooltip';
    valueTooltip.textContent = `${uint8ToDisplay(val)}%`;
    document.body.appendChild(valueTooltip);
    positionOverlay(valueTooltip, knobEl);
  };
  const updateDragTooltip = (val) => {
    if (valueTooltip) valueTooltip.textContent = `${uint8ToDisplay(val)}%`;
  };

  // ── Sub-section 1: knob drag + button press handlers ─────────────
  setupKnobDragAndButtons();

  // ── Sub-section 2: hover tooltip + dblclick numeric edit ─────────
  setupKnobTooltipAndEdit();

  // ─────────────────────────────────────────────────────────────────

  function applyDragAngle(clientY) {
    // Drag up (negative dy) = clockwise (positive angle). 2° per 1px (140px = full range).
    const dy = clientY - dragState.startY;
    const angle = Math.max(-140, Math.min(140, dragState.startAngle - dy * 2));
    dragState.knob.setAttribute('transform', `rotate(${angle.toFixed(1)})`);
    // Live-update the value tooltip during drag.
    const liveVal = angleToParam(dragState.param, angle);
    if (typeof liveVal === 'number') updateDragTooltip(liveVal);
    return angle;
  }

  function setupKnobDragAndButtons() {
  svg.addEventListener('mousedown', (e) => {
    const ctrl = findControl(e.target);
    if (!ctrl) return;
    const type = ctrl.dataset.control;

    if (type === 'knob') {
      const param = ctrl.dataset.param;
      const patch = currentPatch();
      if (!patch || !(param in patch)) return;
      if (DISCRETE[param]) {
        // SNAP: click cycles to next position
        const cycle = SNAP_CYCLE[param] || DISCRETE[param];
        const curIdx = cycle.indexOf(patch[param]);
        const nextIdx = curIdx < 0 ? 0 : (curIdx + 1) % cycle.length;
        patch[param] = cycle[nextIdx];
        updateKnobs(patch);
        renderPatchList();        // refresh the modified-indicator dot
        saveLibraryDebounced();   // persist active state across restarts
      } else {
        // SMOOTH: drag up/down, 1° per 1px
        const knob = svg.querySelector(`g.knob[data-param="${param}"]`);
        if (!knob) return;
        dragState = {
          knob,
          param,
          startY: e.clientY,
          startAngle: paramToAngle(param, patch[param]),
        };
        // Suppress the patch-switch transition during active drag so the
        // knob tracks the cursor 1:1 instead of lagging behind.
        document.body.classList.add('knob-dragging');
        // Show the value tooltip immediately (no 1 s hover delay during
        // active adjustment).
        showDragTooltip(knob, patch[param]);
      }
      e.preventDefault();
    } else if (type === 'switch') {
      handleSwitchClick(ctrl);
      playSwitchClick();
      e.preventDefault();
    } else if (type === 'button') {
      downBtnId = ctrl.dataset.buttonId;
      lightButton(downBtnId, true);
      playButtonClick();
      e.preventDefault();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (dragState) applyDragAngle(e.clientY);
  });

  document.addEventListener('mouseup', (e) => {
    if (dragState) {
      const angle = applyDragAngle(e.clientY);
      const value = angleToParam(dragState.param, angle);
      const patch = currentPatch();
      if (patch) {
        patch[dragState.param] = value;
        updateKnobs(patch);     // snaps discrete knobs to nearest position
        renderPatchList();      // refresh the modified-indicator dot
        saveLibraryDebounced(); // persist active state across restarts
      }
      dragState = null;
      document.body.classList.remove('knob-dragging');
      // Hide the drag tooltip on release. User can re-hover (1 s
      // delay) to see the committed value again if they want.
      hideKnobValueTooltip();
    }
    if (downBtnId) {
      // Write: arm save-as mode on release; LED stays lit while awaiting
      // destination, so don't call lightButton(false) here.
      const ctrl = findControl(e.target);
      const onSame = ctrl && ctrl.dataset.control === 'button' && ctrl.dataset.buttonId === downBtnId;
      if (onSame && downBtnId === 'write') {
        enterWriteMode();
      } else {
        // Briefly keep the LED lit so the press registers visually (the
        // mousedown→mouseup window is too quick to notice otherwise), then
        // turn it off. Write is the exception above — its LED stays lit
        // while it awaits a destination slot. Manual remains otherwise
        // visual-only (real behavior lands with Phase 3 / MIDI).
        const releasedId = downBtnId;
        setTimeout(() => lightButton(releasedId, false), 150);
      }
      downBtnId = null;
    }
  });
  }   // end setupKnobDragAndButtons

  // ─── Sub-section 2: hover tooltip + dblclick numeric edit ────────
  //
  // Logic-style behavior:
  //   - Hover a smooth knob: small floating tooltip shows the
  //     current value as a percentage (0–100) after a 1 s dwell.
  //   - Double-click: input field appears centered over the knob,
  //     pre-filled with the current value. Type a new number, press
  //     Enter to commit. Esc or click-outside cancels.
  //   - Invalid input on Enter: flash red, keep the input open.
  //
  // Smooth knobs only — discrete (snap) knobs, switches, and
  // buttons do nothing on double-click (their value model is a
  // fixed enum, not a continuous range, so typing 247 makes no
  // sense).
  //
  // Tooltip lifecycle helpers (show/hide for hover + drag) are
  // declared higher up because the drag handler in sub-section 1
  // references them. This sub-function adds the dblclick edit
  // overlay + the SVG event delegation for hover/dblclick.
  function setupKnobTooltipAndEdit() {

  const closeEditInput = () => {
    if (!editInput) return;
    editInput.remove();
    editInput = null;
    document.removeEventListener('mousedown', editClickOutside, true);
  };

  // Capture-phase mousedown so click-outside catches everything (even
  // clicks on other interactive controls) before they fire their own
  // handlers.
  function editClickOutside(e) {
    if (!editInput) return;
    if (e.target === editInput) return;
    closeEditInput();
  }

  const openKnobNumericEdit = (knobEl, param) => {
    if (dragState) return;
    const patch = currentPatch();
    if (!patch || !(param in patch)) return;
    const val = patch[param];
    if (typeof val !== 'number') return;
    hideKnobValueTooltip();
    closeEditInput();
    editInput = document.createElement('input');
    editInput.className = 'knob-value-edit';
    editInput.type      = 'text';
    editInput.value     = `${uint8ToDisplay(val)}%`;
    editInput.inputMode = 'numeric';
    editInput.maxLength = 4;   // "100%" max
    document.body.appendChild(editInput);
    positionOverlay(editInput, knobEl);
    editInput.focus();
    editInput.select();
    const tryCommit = () => {
      // Strip a trailing % if the user kept or typed one — they can
      // enter "50" or "50%" and both work. Anything else (letters,
      // negative, decimals, > 100) flashes red.
      const raw = editInput.value.trim().replace(/%$/, '').trim();
      const n   = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(n) && n >= 0 && n <= 100) {
        patch[param] = displayToUint8(n);
        updateKnobs(patch);
        renderPatchList();        // refresh modified-indicator
        saveLibraryDebounced();   // persist active state across restarts
        closeEditInput();
        return true;
      }
      // Invalid — flash red, keep input open, leave focus.
      editInput.classList.remove('invalid');
      void editInput.offsetWidth;   // restart animation on next frame
      editInput.classList.add('invalid');
      editInput.select();
      return false;
    };
    editInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeEditInput(); return; }
      // Enter and Tab both commit. Tab needs preventDefault so the
      // browser doesn't move focus to whatever happens to be next.
      if (e.key === 'Enter') { tryCommit(); }
      if (e.key === 'Tab')   { e.preventDefault(); tryCommit(); }
    });
    // Click-outside cancels (registered in capture phase so it beats
    // other handlers).
    setTimeout(() => {
      document.addEventListener('mousedown', editClickOutside, true);
    }, 0);
  };

  // Event delegation for hover + dblclick on smooth knobs. Uses mouseover/
  // mouseout (which bubble) rather than mouseenter/mouseleave (which don't).
  svg.addEventListener('mouseover', (e) => {
    if (dragState) return;   // during drag, ignore all hover-state changes —
                             // the drag tooltip persists even if the cursor
                             // strays onto other panel elements (switches,
                             // labels, blank space). Without this guard the
                             // drag tooltip flickered out the moment the
                             // cursor crossed any non-knob target.
    const ctrl = findControl(e.target);
    if (!isSmoothKnob(ctrl)) { hideKnobValueTooltip(); return; }
    showKnobValueTooltip(ctrl, ctrl.dataset.param);
  });
  svg.addEventListener('mouseout', (e) => {
    if (dragState) return;   // never hide during active drag — the
                             // drag tooltip is meant to persist even
                             // if the cursor strays off the knob.
    // Only hide if the relatedTarget is outside the knob entirely —
    // otherwise crossing internal children would flicker the tooltip.
    const ctrl = findControl(e.target);
    if (!isSmoothKnob(ctrl)) return;
    if (ctrl.contains(e.relatedTarget)) return;
    hideKnobValueTooltip();
  });
  svg.addEventListener('dblclick', (e) => {
    const ctrl = findControl(e.target);
    if (!isSmoothKnob(ctrl)) return;
    openKnobNumericEdit(ctrl, ctrl.dataset.param);
    e.preventDefault();
  });
  }   // end setupKnobTooltipAndEdit
}

// ═══════════════════════════════════════════════════════════════
// Patch list
// ═══════════════════════════════════════════════════════════════

// Greys out Tape Memory hardware buttons when their action wouldn't do
// anything meaningful in the current context. Called from renderPatchList
// so it runs on every tab/selection change.
//   - Tone Save: always enabled (it's a file-import).
//   - Tone Load: ONLY enabled when viewing Bank C or D with valid active
//     patches. Disabled in the Library tab — to send a library package
//     to the JX, the user must first hover-LOAD it into active banks
//     (which auto-switches to Bank C), THEN click Tone Load. This is the
//     2026-05-24 "single source of truth" simplification — sending always
//     happens from active C/D, never directly from a selected library row.
//   - Sequencer Save: pairs the dump with the active patch, so it needs
//     a valid Bank C/D selection + loaded patches.
//   - Sequencer Load: only meaningful on Library > Sequences with a
//     sequence selected.
function updateTapeButtonStates() {
  const toneSave = document.getElementById('hw-tone-save');
  const toneLoad = document.getElementById('hw-tone-load');
  const seqSave  = document.getElementById('hw-seq-save');
  const seqLoad  = document.getElementById('hw-seq-load');
  if (!toneSave || !toneLoad || !seqSave || !seqLoad) return;

  const onBank   = selBank === 'C' || selBank === 'D';
  const onSeqs   = selBank === 'L' && selLibTab === 'sequences';
  const havePatches = !!(patches && Array.isArray(patches.banks) && patches.banks.length === 2);
  const hasSeq   = onSeqs && selSequence !== null
                   && library && Array.isArray(library.sequences) && library.sequences[selSequence];

  toneSave.disabled = false;
  toneLoad.disabled = !(onBank && havePatches);
  // Sequencer Save pairs the imported sequence with the active C/D patch
  // (which persists as `lastBankSelection` even when the user is browsing
  // the Library), so it only needs patches loaded — not a specific tab.
  seqSave .disabled = !havePatches;
  seqLoad .disabled = !hasSeq;
}

function renderPatchList() {
  const list = document.getElementById('patch-list');
  const actions = document.getElementById('bottom-actions');
  const subTabs = document.getElementById('lib-sub-tabs');
  const sourceLabel = document.getElementById('active-source-label');
  list.innerHTML = '';
  actions.innerHTML = '';
  updateTapeButtonStates();

  if (selBank === 'L') {
    if (subTabs) {
      subTabs.hidden = false;
      subTabs.querySelectorAll('.lib-sub-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.libtab === selLibTab);
      });
    }
    if (sourceLabel) sourceLabel.hidden = true;     // not relevant on Library tab
    if (selLibTab === 'sequences') {
      renderSequencesList(list);
      renderSequencesActions(actions);
    } else {
      renderLibraryList(list);
      renderLibraryActions(actions);
    }
    return;
  }

  if (subTabs) subTabs.hidden = true;

  // Active library context — shows the name of the most-recently-loaded
  // library package that currently sources the active C/D banks (e.g.
  // "Spils Sounds"). Hidden when active banks were assembled from
  // scratch (seed, Record-from-JX, drag-drop WAV) and have no library
  // origin. Visible only on Bank C / Bank D tabs.
  if (sourceLabel) {
    if (activeBanksSourceLabel) {
      sourceLabel.textContent = activeBanksSourceLabel;
      sourceLabel.hidden = false;
    } else {
      sourceLabel.hidden = true;
    }
  }

  // First-run / no-patches-loaded empty state. The user can populate this by
  // importing a JX-3P tape dump WAV (or a previously-exported JSON) via
  // Tape Memory > Tone > Save.
  if (!patches || !Array.isArray(patches.banks) || !patches.banks[selBank === 'D' ? 1 : 0]) {
    const ph = document.createElement('div');
    ph.className = 'library-placeholder';
    ph.innerHTML =
      'No patches loaded yet — use <em>Save from JX-3P</em> to import the C and D banks from your synth.';
    list.appendChild(ph);
    return;
  }

  if (writePending) {
    const banner = document.createElement('div');
    banner.className = 'write-banner';
    // Preview-mode write surfaces the paired patch name in the banner so
    // the user knows which patch is about to land in the slot they pick.
    const previewName = currentPreviewPatch && currentPreviewPatch.name;
    banner.textContent = previewName
      ? `Click a slot to write "${previewName}" (Esc to cancel)`
      : 'Click a slot to write current patch (Esc to cancel)';
    list.appendChild(banner);
  }

  for (let slot = 0; slot < 16; slot++) {
    const key  = slotKey(selBank, slot);
    const name = patchName(selBank, slot);

    const inRange = selectedRange
      && selectedRange.bank === selBank
      && slot >= selectedRange.start
      && slot <= selectedRange.end;
    const item = document.createElement('div');
    item.className = 'patch-item'
      + (slot === selSlot ? ' selected' : '')
      + (inRange ? ' in-range' : '');
    item.dataset.slot = String(slot);

    const num = document.createElement('span');
    num.className = 'patch-number';
    num.textContent = key + ':';

    // Modified indicator (2026-05-25) — small Roland-red dot shown when
    // current slot params differ from cleanParams (the last "fresh
    // load" baseline). Clickable: opens a confirm to revert this slot
    // to its baseline. Hidden entirely when slot is not modified.
    const modified = isPatchModified(selBank, slot);
    let modDot = null;
    if (modified) {
      modDot = document.createElement('button');
      modDot.className = 'patch-modified-dot';
      modDot.type = 'button';
      modDot.title = 'This patch has unsaved edits — click to revert';
      modDot.innerHTML =
        '<svg viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">' +
          '<circle cx="4" cy="4" r="3.2" fill="currentColor"/>' +
        '</svg>';
      modDot.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotKeyStr = slotKey(selBank, slot);
        const patchLabel = patchName(selBank, slot) || `(unnamed)`;
        showConfirmModal({
          title: `Revert ${slotKeyStr}?`,
          body:
            `Revert *${patchLabel}* to its original state? Your edits ` +
            `since the last library load (or import) will be discarded.\n\n` +
            'This is undoable.',
          confirmLabel: 'Revert',
          confirmStyle: 'danger',
          onConfirm: () => revertPatchToOriginal(selBank, slot),
        });
      });
      modDot.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const nm = document.createElement('span');
    nm.className = 'patch-name-span' + (name ? '' : ' unnamed');
    nm.textContent = name || patchPlaceholder(selBank, slot);
    // Rename pencil: shown on EVERY entry (2026-05-25 change) so the
    // edit affordance is always discoverable. Click only fires on the
    // pencil itself — clicking the name span just selects the row.
    appendRenamePencil(nm);

    const inp = document.createElement('input');
    inp.className = 'patch-name-edit';
    inp.type = 'text';
    inp.maxLength = 28;
    inp.spellcheck = false;
    inp.autocomplete = 'off';

    // Info icon — hover-revealed, sits to the left of the swap key. Click
    // shows a small modal with the patch's lineage (origin slot + source
    // library) so the user can see where it came from after renaming.
    const info = document.createElement('button');
    info.className = 'patch-info-btn';
    info.type = 'button';
    info.title = 'Patch info';
    info.innerHTML =
      '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">' +
        '<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="0.9"/>' +
        '<line x1="6" y1="5.2" x2="6" y2="8.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
        '<circle cx="6" cy="3.4" r="0.65" fill="currentColor"/>' +
      '</svg>';
    info.addEventListener('click', (e) => {
      e.stopPropagation();
      if (writePending) return;
      showPatchInfo(selBank, slot);
    });
    info.addEventListener('mousedown', (e) => e.stopPropagation());

    // (Cross-bank ⇄ swap button removed 2026-05-24. The Custom Banks
    // builder now covers cross-bank cherry-picking with more control
    // and a better UX; the per-row swap shortcut was redundant.)

    item.appendChild(num);
    if (modDot) item.appendChild(modDot);
    item.appendChild(nm);
    item.appendChild(inp);
    item.appendChild(info);
    list.appendChild(item);

    item.addEventListener('click', (e) => {
      if (writePending) {
        commitWriteTo(selBank, slot);
        return;
      }
      if (e.target.closest('.patch-rename-icon')) {
        startNameEdit(slot, nm, inp);
        return;
      }
      selectPatch(slot, { shiftKey: e.shiftKey });
    });

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  commitListEdit(slot, nm, inp);
      if (e.key === 'Escape') cancelListEdit(nm, inp);
    });
    inp.addEventListener('blur', () => commitListEdit(slot, nm, inp));

    // Within-bank reorder via HTML5 drag-and-drop. Suppressed while the user
    // is in write-pending mode (clicks there mean "write current patch here").
    if (!writePending) item.draggable = true;
    item.addEventListener('dragstart', (e) => {
      if (writePending || e.target.closest('.patch-info-btn, .patch-name-edit')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = 'copyMove';
      // text/plain carries the source slot index for in-bank reorder (existing
      // patch-item drop handlers parse this as int). Custom MIME carries the
      // full source descriptor (bank + slot) so Custom Builder bucket slots
      // can identify this as a cross-list patch drag.
      e.dataTransfer.setData('text/plain', String(slot));
      e.dataTransfer.setData('application/x-jp-patch-source',
        JSON.stringify({ bank: selBank, slot }));
      // Shift-click range: if the dragged slot is part of an active range
      // on the same bank, also include the range descriptor so the bucket
      // drop handler can place all the patches in one shot.
      const draggingRange = selectedRange
        && selectedRange.bank === selBank
        && slot >= selectedRange.start
        && slot <= selectedRange.end
        && selectedRange.end > selectedRange.start;
      if (draggingRange) {
        e.dataTransfer.setData('application/x-jp-patch-range',
          JSON.stringify({ bank: selBank, start: selectedRange.start, end: selectedRange.end }));
      }
      // Custom drag image — just the slot label + name (or a "n patches"
      // summary when dragging a range), excluding the info/swap/pencil
      // affordances. Rendered off-screen so the browser can snapshot it.
      const ghost = document.createElement('div');
      ghost.className = 'patch-drag-ghost';
      if (draggingRange) {
        const n = selectedRange.end - selectedRange.start + 1;
        const a = slotKey(selBank, selectedRange.start);
        const b = slotKey(selBank, selectedRange.end);
        ghost.textContent = `${n} patches  (${a}–${b})`;
      } else {
        ghost.textContent = `${key}: ${name || patchPlaceholder(selBank, slot)}`;
      }
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 12, 10);
      setTimeout(() => ghost.remove(), 0);
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.drag-over, .drag-over-bottom').forEach((el) => {
        el.classList.remove('drag-over', 'drag-over-bottom');
      });
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Detect top-half vs bottom-half so the user can drop AFTER the
      // last row (needed to make "move to last position" reachable —
      // dropping on top-half of last row resolves to its current slot,
      // which is a no-op for the second-to-last item).
      const rect = item.getBoundingClientRect();
      const isBottomHalf = (e.clientY - rect.top) > (rect.height / 2);
      list.querySelectorAll('.drag-over, .drag-over-bottom').forEach((el) => {
        if (el !== item) el.classList.remove('drag-over', 'drag-over-bottom');
      });
      item.classList.toggle('drag-over',        !isBottomHalf);
      item.classList.toggle('drag-over-bottom',  isBottomHalf);
    });
    item.addEventListener('dragleave', (e) => {
      if (e.currentTarget === item && !item.contains(e.relatedTarget)) {
        item.classList.remove('drag-over', 'drag-over-bottom');
      }
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over', 'drag-over-bottom');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const rect = item.getBoundingClientRect();
      const isBottomHalf = (e.clientY - rect.top) > (rect.height / 2);
      const toIdx = isBottomHalf ? slot + 1 : slot;
      if (Number.isNaN(fromIdx) || fromIdx === toIdx) return;
      reorderBankSlot(selBank, fromIdx, toIdx);
    });
  }

  // v0.7.0 hint: when the active C/D banks came from a fresh Record-
  // from-JX import (or any tape-capture load), the snapshot only lives
  // in active state until the user clicks "save C/D banks to library."
  // Surface that friction so users don't lose their import by switching
  // libraries before saving. The label switches off the "JX-3P tape
  // capture · …" prefix once the user saves (activeBanksSourceLabel
  // gets reassigned to the new package's name), so the hint
  // self-dismisses on save.
  if (activeBanksSourceLabel && activeBanksSourceLabel.startsWith('JX-3P tape capture')) {
    const hint = document.createElement('div');
    hint.className = 'save-banks-hint';
    hint.textContent = 'Your JX-3P import is in active C/D — save here to keep a snapshot.';
    actions.appendChild(hint);
  }

  const btn = document.createElement('button');
  btn.className = 'save-banks-btn';
  btn.textContent = 'save active C/D banks to library';
  btn.addEventListener('click', handleSaveBanksToLibrary);
  actions.appendChild(btn);
}

// Inline "load" button — hover-revealed on each Library row, sits just
// left of the trash icon. Clicking loads that specific row's data into
// the active banks / sequence editor (idx is bound by the caller).
function buildLoadToAppIcon(onClick, title, label) {
  const btn = document.createElement('button');
  btn.className = 'package-load-btn';
  btn.textContent = label || 'load';
  if (title) btn.title = title;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

// v0.7.2: hover-revealed download icon on each Library row, sits between
// the LOAD button and the trash. Click to write the row's data as a WAV
// to the user's Desktop. Uses an inline SVG download glyph (arrow into
// tray) styled to match the existing icon-button vocabulary.
function buildDownloadWavIcon(onClick, title) {
  const btn = document.createElement('button');
  btn.className = 'package-download-btn';
  btn.title = title || 'Download as WAV to Desktop';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      // Down arrow shaft + head
      '<path d="M8 2 V11"/>' +
      '<path d="M4.5 7.5 L8 11 L11.5 7.5"/>' +
      // Tray / baseline
      '<path d="M3 14 H13"/>' +
    '</svg>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function renderLibraryActions(actions) {
  // The "load to app" action moved to an inline hover icon on each
  // package row (see buildLoadToAppIcon).
  //
  // "Explore user shared tones" — placeholder entry point for the
  // community library (docs/future-features.md → Community library →
  // in-app share + explore workflow). Inactive until the community
  // manifest + tabs exist on jx-3p.com. Mirrors the sequences-tab
  // button in renderSequencesActions.
  const btn = document.createElement('button');
  btn.className = 'save-banks-btn';   // reuse the existing visual class
  btn.textContent = 'explore user shared tones';
  btn.disabled = true;
  actions.appendChild(btn);
}

// ═══════════════════════════════════════════════════════════════
// Library packages (Phase 2): snapshots of C+D bank state
// ═══════════════════════════════════════════════════════════════

function packageDefaultName(date) {
  const ds = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `C/D banks ${ds}`;
}

function relativeTime(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 10)  return 'just now';
  if (s < 60)  return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d} day${d === 1 ? '' : 's'} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}

function handleSaveBanksToLibrary() {
  if (!patches || !Array.isArray(patches.banks)) return;
  // Saving a library snapshot is the user declaring "this is my new
  // baseline" — clear any modified indicators by re-snapshotting clean
  // params against the just-saved state. Must happen BEFORE we clone
  // slotMeta into the package, so the package's slotMeta also carries
  // the fresh cleanParams (relevant when the package gets re-loaded).
  snapshotCleanParamsAll();
  const now = new Date();
  const pkg = {
    id: now.toISOString(),
    defaultName: packageDefaultName(now),
    customName: '',
    createdAt: now.toISOString(),
    savedAt: now.toISOString(),
    banks: JSON.parse(JSON.stringify(patches.banks)),
    slotMeta: JSON.parse(JSON.stringify(library.slotMeta || {})),
  };
  if (!Array.isArray(library.packages)) library.packages = [];
  library.packages.unshift(pkg);
  if (selPackage !== null) selPackage += 1;  // existing selection shifts down
  saveLibraryDebounced();

  // Switch to Library tab > Tones sub-tab so the new entry is visible.
  selBank = 'L';
  selSlot = 0;
  selLibTab = 'tones';
  pendingSaveAnimationId = pkg.id;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.bank === 'L');
  });
  renderPatchList();
}

function renderLibraryList(list) {
  const packages = Array.isArray(library.packages) ? library.packages : [];
  if (packages.length === 0) {
    selPackage = null;
    const ph = document.createElement('div');
    ph.className = 'library-placeholder';
    ph.textContent = 'No saved packages yet.\nUse "save active C/D banks to library" on a bank tab, or upload a WAV below.';
    list.appendChild(ph);
    list.appendChild(buildWavUploadZone('tones', { variant: 'prominent' }));
    return;
  }

  packages.forEach((pkg, idx) => {
    const item = document.createElement('div');
    item.className = 'package-item' + (idx === selPackage ? ' selected' : '');
    if (pkg.id && pkg.id === pendingSaveAnimationId) {
      item.classList.add('just-saved');
      pendingSaveAnimationId = null;
      item.addEventListener('animationend', () => item.classList.remove('just-saved'), { once: true });
    }
    item.draggable = true;
    item.dataset.idx = String(idx);

    const nm = document.createElement('span');
    nm.className = 'package-name-span' + (pkg.customName ? '' : ' unnamed');
    nm.textContent = pkg.customName || pkg.defaultName;
    appendRenamePencil(nm);  // always shown — see renderPatchList for rationale

    const def = document.createElement('span');
    def.className = 'package-default-name';
    def.textContent = relativeTime(pkg.savedAt);

    const inp = document.createElement('input');
    inp.className = 'package-name-edit';
    inp.type = 'text';
    inp.maxLength = 60;
    inp.spellcheck = false;
    inp.autocomplete = 'off';

    item.appendChild(nm);
    item.appendChild(def);
    item.appendChild(inp);
    item.appendChild(buildDownloadWavIcon(
      () => handleDownloadTonesPackage(idx),
      'download this C/D bank as a WAV (saves to Desktop)',
    ));
    item.appendChild(buildLoadToAppIcon(
      () => handleLoadLibraryBanks(idx),
      'Load this C/D bank package to app',
    ));
    item.appendChild(buildTrashIcon(idx));
    list.appendChild(item);

    item.addEventListener('click', (e) => {
      if (e.target.closest('.patch-rename-icon')) {
        startPackageNameEdit(idx, nm, def, inp);
        return;
      }
      selPackage = idx;
      renderPatchList();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  commitPackageNameEdit(idx, nm, def, inp);
      if (e.key === 'Escape') cancelPackageNameEdit(nm, inp);
    });
    inp.addEventListener('blur', () => commitPackageNameEdit(idx, nm, def, inp));

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.drag-over, .drag-over-bottom').forEach((el) => {
        el.classList.remove('drag-over', 'drag-over-bottom');
      });
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Top-half vs bottom-half — see active-bank reorder for rationale.
      const rect = item.getBoundingClientRect();
      const isBottomHalf = (e.clientY - rect.top) > (rect.height / 2);
      list.querySelectorAll('.drag-over, .drag-over-bottom').forEach((el) => {
        if (el !== item) el.classList.remove('drag-over', 'drag-over-bottom');
      });
      item.classList.toggle('drag-over',        !isBottomHalf);
      item.classList.toggle('drag-over-bottom',  isBottomHalf);
    });
    item.addEventListener('dragleave', (e) => {
      // Only remove the indicator when the pointer actually leaves the row,
      // not when it crosses internal children.
      if (e.currentTarget === item && !item.contains(e.relatedTarget)) {
        item.classList.remove('drag-over', 'drag-over-bottom');
      }
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const rect = item.getBoundingClientRect();
      const isBottomHalf = (e.clientY - rect.top) > (rect.height / 2);
      const toIdx = isBottomHalf ? idx + 1 : idx;
      item.classList.remove('drag-over', 'drag-over-bottom');
      if (Number.isNaN(fromIdx) || fromIdx === toIdx) return;
      reorderPackage(fromIdx, toIdx);
    });
  });
  // Always-visible upload affordance at the bottom of the populated list.
  list.appendChild(buildWavUploadZone('tones', { variant: 'compact' }));
}

// v0.7.2: visible WAV upload affordance for the Library sub-tabs.
// Two paths to import: click the zone (native file picker) OR
// drag-and-drop a WAV onto it. The parent #patch-list already handles
// drops globally via setupPatchListDropZone — this zone just provides
// the visible target + click-to-browse for users who don't know about
// drag-and-drop. Empty-state uses the prominent variant; populated-
// state appends a smaller version below the list.
function buildWavUploadZone(kind, opts) {
  const variant = (opts && opts.variant) || 'compact';   // 'prominent' | 'compact'
  const labelText = 'drop a WAV or click to upload a WAV';

  const zone = document.createElement('div');
  zone.className = `lib-upload-zone lib-upload-zone-${variant}`;
  zone.setAttribute('role', 'button');
  zone.setAttribute('tabindex', '0');
  zone.title = 'Click to browse, or drag a .wav file onto this area';

  // WAV-file icon: rounded-rect document shape with folded corner +
  // music note + "WAV" text label. Stroked in currentColor so it picks
  // up the parent's text color (cream-secondary normally, full cream
  // on hover/drag-over).
  zone.innerHTML =
    '<svg class="lib-upload-zone-icon" viewBox="0 0 32 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      // Document outline with folded corner
      '<path d="M3 2 H21 L29 10 V36 Q29 38 27 38 H5 Q3 38 3 36 Z"/>' +
      '<path d="M21 2 V10 H29"/>' +
      // Music note (filled head + stem)
      '<circle cx="10" cy="26" r="2.4" fill="currentColor" stroke="none"/>' +
      '<path d="M12.4 26 V16 L19 18.4 V22"/>' +
      '<circle cx="16.6" cy="22" r="2" fill="currentColor" stroke="none"/>' +
      // "WAV" text label below the note
      '<text x="16" y="34.5" text-anchor="middle" fill="currentColor" stroke="none" font-family="Helvetica, sans-serif" font-size="5.5" font-weight="700">WAV</text>' +
    '</svg>' +
    `<div class="lib-upload-zone-label">${labelText}</div>`;

  // Hidden file input — click on zone triggers the native picker.
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.wav';
  input.style.display = 'none';
  zone.appendChild(input);
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const filePath = (window.api && typeof window.api.getPathForFile === 'function')
      ? window.api.getPathForFile(file)
      : null;
    if (!filePath) { showImportError('Could not read file path. Try drag-and-drop instead.'); return; }
    if (kind === 'sequences') {
      handleSequenceDropImport(filePath);
    } else {
      handleTonesDropImport(filePath);
    }
    input.value = '';   // reset so same file can be picked again
  });

  // Visual hover state during drag-over. The parent #patch-list
  // catches the actual drop event via setupPatchListDropZone; this is
  // purely cosmetic feedback so the user knows the zone is the right
  // target.
  zone.addEventListener('dragenter', (e) => {
    const types = e.dataTransfer && Array.from(e.dataTransfer.types || []);
    if (types && types.includes('Files')) zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', (e) => {
    if (e.currentTarget === zone && !zone.contains(e.relatedTarget)) {
      zone.classList.remove('drag-over');
    }
  });
  // On drop: visual feedback that the drop registered + swap label to
  // "Importing…" so the user knows decoding is in flight (jx3p can take
  // 1-2 seconds). renderPatchList re-renders the zone after import
  // completes, which naturally resets state. Safety timeout resets the
  // label if import errors out (no re-render).
  zone.addEventListener('drop', (e) => {
    const types = e.dataTransfer && Array.from(e.dataTransfer.types || []);
    if (!types.includes('Files')) return;
    zone.classList.remove('drag-over');
    zone.classList.add('drop-received');
    const labelEl = zone.querySelector('.lib-upload-zone-label');
    if (labelEl) labelEl.textContent = 'Importing… (decoding WAV)';
    setTimeout(() => {
      zone.classList.remove('drop-received');
      if (labelEl) labelEl.textContent = labelText;
    }, 6000);
  });
  return zone;
}

function reorderPackage(fromIdx, toIdx) {
  const pkgs = library.packages;
  if (!pkgs || fromIdx < 0 || fromIdx >= pkgs.length) return;
  if (toIdx < 0 || toIdx >= pkgs.length) return;
  // Off-by-one fix — shared helper in renderer/library-math.js. See
  // reorderBankSlot for the long-form rationale.
  const effectiveToIdx = computeReorderIdx(fromIdx, toIdx);
  if (fromIdx === effectiveToIdx) return;
  const [moved] = pkgs.splice(fromIdx, 1);
  pkgs.splice(effectiveToIdx, 0, moved);

  // Adjust selPackage to follow the move.
  if (selPackage !== null) {
    if (selPackage === fromIdx) selPackage = effectiveToIdx;
    else if (fromIdx < selPackage && effectiveToIdx >= selPackage) selPackage -= 1;
    else if (fromIdx > selPackage && effectiveToIdx <= selPackage) selPackage += 1;
  }
  saveLibraryDebounced();
  renderPatchList();

  // Undo: reverse the splice.
  pushUndo({
    undo: () => reorderPackage(effectiveToIdx, fromIdx),
    redo: () => reorderPackage(fromIdx, toIdx),
  });
}

// Snapshot-naming modal used by the "Save and load" rescue path in
// handleLoadLibraryBanks. Standalone (not via showConfirmModal —
// showConfirmModal doesn't support text inputs). Calls onSaved with
// the entered (or default) name when the user clicks Save; calls
// onCancelled on Esc / Cancel / click-outside so the caller can
// abandon the whole flow rather than fall through to load anyway.
function showSaveAndContinueModal({ defaultName, onSaved, onCancelled }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal seq-save-modal';   // reuse the seq-save layout (title + input + buttons)

  const h = document.createElement('h2');
  h.className = 'modal-title';
  h.textContent = 'Save current C/D banks to Library';

  const body = document.createElement('p');
  body.className = 'modal-body';
  body.textContent =
    'Name this snapshot, then click Save to preserve your current C/D ' +
    'banks before loading the new one.';

  const nameSec = document.createElement('div');
  nameSec.className = 'seq-modal-section';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'NAME:';
  const nameInput = document.createElement('input');
  nameInput.type        = 'text';
  nameInput.className   = 'seq-modal-name';
  nameInput.maxLength   = 60;
  nameInput.spellcheck  = false;
  nameInput.autocomplete = 'off';
  nameInput.value       = defaultName;
  nameSec.appendChild(nameLabel);
  nameSec.appendChild(nameInput);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'modal-btn modal-btn-confirm';
  saveBtn.textContent = 'Save';
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  modal.appendChild(h);
  modal.appendChild(body);
  modal.appendChild(nameSec);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const doSave   = () => { const name = nameInput.value.trim(); close(); if (onSaved)     onSaved(name); };
  const doCancel = () => { close();                                       if (onCancelled) onCancelled(); };
  const onKey = (e) => {
    if (e.key === 'Escape') doCancel();
    if (e.key === 'Enter')  doSave();
  };
  cancelBtn.addEventListener('click', doCancel);
  saveBtn.addEventListener('click', doSave);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) doCancel(); });
  document.addEventListener('keydown', onKey);

  nameInput.focus();
  nameInput.select();
}

function handleLoadLibraryBanks(idx) {
  if (idx === undefined) idx = selPackage;
  if (idx == null) return;
  const pkg = library.packages[idx];
  if (!pkg) return;
  const pkgName = pkg.customName || pkg.defaultName || 'This package';
  const modifiedCount = countModifiedSlots();

  // Branch: if active C/D has unsaved edits, offer the "Save and load"
  // rescue path so the user doesn't silently lose work. If everything
  // is clean (just-loaded baseline state), keep the simple 2-button
  // confirm — no extra friction when there's nothing at risk.
  if (modifiedCount === 0) {
    showConfirmModal({
      title: 'Loading to active C/D banks',
      body: `*${pkgName}* will replace the current C and D banks in the JP Patches app.`,
      confirmLabel: 'Load',
      onConfirm: () => loadPackageIntoActiveBanks(pkg),
    });
    return;
  }

  // Modifications present — three-button rescue flow. "Save and load"
  // is the green primary (safer default given unsaved work is at risk);
  // "Load without saving" is the blue alt-style tertiary (explicit
  // opt-in to lose the modifications).
  const editLabel = modifiedCount === 1 ? '1 unsaved edit' : `${modifiedCount} unsaved edits`;
  showConfirmModal({
    title: 'Loading to active C/D banks',
    body:
      `Your active C/D banks have **${editLabel}**. Loading *${pkgName}* ` +
      'will replace them.',
    confirmLabel: 'Save and load',
    confirmStyle: 'confirm',
    onConfirm: () => {
      // Open the snapshot-naming modal. On save → background-save
      // (no Library-tab navigation), then load the selected package.
      showSaveAndContinueModal({
        defaultName: packageDefaultName(new Date()),
        onSaved: (name) => {
          saveSnapshotInBackground(name);
          loadPackageIntoActiveBanks(pkg);
        },
        onCancelled: () => {},  // abandon whole flow — user can re-click LOAD to retry
      });
    },
    tertiaryLabel: 'Load without saving',
    tertiaryStyle: 'alt',
    onTertiary: () => loadPackageIntoActiveBanks(pkg),
  });
}

function loadPackageIntoActiveBanks(pkg) {
  migratePackageShape(pkg);
  // Snapshot the CURRENT active state BEFORE overwriting so undo can
  // restore it. Captures everything that load mutates: patches.banks,
  // library.slotMeta, activeBanksSourceLabel, and the selBank/selSlot
  // navigation we apply at the end.
  const prevSnapshot = {
    banks:       patches && patches.banks ? JSON.parse(JSON.stringify(patches.banks)) : null,
    slotMeta:    library && library.slotMeta ? JSON.parse(JSON.stringify(library.slotMeta)) : null,
    sourceLabel: activeBanksSourceLabel,
    selBank,
    selSlot,
  };

  patches.banks = JSON.parse(JSON.stringify(pkg.banks));
  library.slotMeta = JSON.parse(JSON.stringify(pkg.slotMeta || {}));
  ensureLibraryShape();
  activeBanksSourceLabel = pkg.customName || pkg.defaultName || null;
  // Stamp source / origin info onto each slot's slotMeta:
  //   sourceLabel    — the most-recent library load (always updated)
  //   originLibrary  — the FIRST library this patch lived in (set once,
  //                    never overwritten — preserves the origin across
  //                    saves into custom mixes)
  //   originalName   — name at first-stamp time (set once); useful when
  //                    the user renames the patch later
  if (activeBanksSourceLabel) {
    ['C', 'D'].forEach((bank) => {
      const arr = library.slotMeta[bank] || [];
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (!m) continue;
        m.sourceLabel = activeBanksSourceLabel;
        if (!m.originLibrary) m.originLibrary = activeBanksSourceLabel;
        if (!m.originalName && m.name) m.originalName = m.name;
      }
    });
  }
  // Reset clean-params baseline for the modified-indicator — loading a
  // package is a "fresh slate" and any previously-tracked edits are
  // discarded along with the previous active state.
  snapshotCleanParamsAll();
  saveLibraryDebounced();

  // Surface the loaded banks: switch to Bank C and select the first slot.
  selBank = 'C';
  selSlot = 0;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.bank === 'C');
  });
  renderPatchList();
  updateSvgPatchName();
  updateAllControls(currentPatch());
  // v0.7.3 fix: re-render the custom-builder toggle. Loading a library
  // package implicitly switches us off the Library tab to Bank C; the
  // toggle's disabled state (set by renderCustomBuilder when on Library)
  // would otherwise stay greyed out even though we're now on a bank
  // where Create Custom Banks IS valid. Daniel hit this 2026-06-03.
  renderCustomBuilder();

  // Undo: restore the prior active state. Capturing post-snapshot for redo
  // so a redo replays the load without re-finding the package by index
  // (which could be stale if the user rearranged the library in between).
  const postSnapshot = {
    banks:       JSON.parse(JSON.stringify(patches.banks)),
    slotMeta:    JSON.parse(JSON.stringify(library.slotMeta)),
    sourceLabel: activeBanksSourceLabel,
    selBank:     'C',
    selSlot:     0,
  };
  pushUndo({
    undo: () => restoreActiveState(prevSnapshot),
    redo: () => restoreActiveState(postSnapshot),
  });
}

// Restore active bank state from a snapshot (helper used by the
// load-package undo/redo). Mirrors the mutations in
// loadPackageIntoActiveBanks but operates on a captured shape.
function restoreActiveState(snap) {
  if (!snap || !patches) return;
  if (snap.banks)    patches.banks    = JSON.parse(JSON.stringify(snap.banks));
  if (snap.slotMeta) library.slotMeta = JSON.parse(JSON.stringify(snap.slotMeta));
  activeBanksSourceLabel = snap.sourceLabel;
  selBank = snap.selBank;
  selSlot = snap.selSlot;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.bank === selBank);
  });
  saveLibraryDebounced();
  renderPatchList();
  updateSvgPatchName();
  updateAllControls(currentPatch());
  // v0.7.3 fix: same as loadPackageIntoActiveBanks — undo/redo may
  // cross Library ↔ Bank tab boundaries, so the custom-builder toggle's
  // disabled state needs to refresh against the restored selBank.
  renderCustomBuilder();
}

// Lightweight confirmation modal.
// `tertiaryLabel` / `onTertiary` / `tertiaryStyle` (optional) add a third
// button between Cancel and Confirm. Use for prompts that need a "primary
// recommended action" plus a "secondary safe alternative" — e.g. the
// Record-from-JX failure prompt offering both "Try again" (no recal) and
// "Recalibrate" (clear gain). Tertiary defaults to no styling (cream
// alt-button); pass tertiaryStyle: 'confirm' to make it the green primary
// and tertiaryStyle: 'alt' for the blue alt-style.
function showConfirmModal({ title, subtitle, body, confirmLabel, confirmStyle, onConfirm, onCancel, tertiaryLabel, onTertiary, tertiaryStyle, hideCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  if (subtitle) modal.classList.add('has-subtitle');

  const h = document.createElement('h2');
  h.className = 'modal-title';
  h.textContent = title;

  // Tiny inline markdown renderer used by both subtitle and body.
  // Supports **bold** and *italic*; everything else stays literal.
  const renderInline = (container, text) => {
    text.split('\n').forEach((line, i) => {
      if (i > 0) container.appendChild(document.createElement('br'));
      const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
      parts.forEach((piece) => {
        if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
          const strong = document.createElement('strong');
          strong.textContent = piece.slice(2, -2);
          container.appendChild(strong);
        } else if (piece.startsWith('*') && piece.endsWith('*') && piece.length > 2) {
          const em = document.createElement('em');
          em.textContent = piece.slice(1, -1);
          container.appendChild(em);
        } else if (piece) {
          container.appendChild(document.createTextNode(piece));
        }
      });
    });
  };

  const sub = subtitle ? document.createElement('div') : null;
  if (sub) {
    sub.className = 'modal-subtitle';
    renderInline(sub, subtitle);
  }

  const p = body ? document.createElement('p') : null;
  if (p) {
    p.className = 'modal-body';
    renderInline(p, body);
  }

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'modal-btn modal-btn-confirm';
  if (confirmStyle === 'danger') confirmBtn.classList.add('modal-btn-danger');
  confirmBtn.textContent = confirmLabel;

  // Optional tertiary button — sits between Cancel and Confirm.
  let tertiaryBtn = null;
  if (tertiaryLabel && typeof onTertiary === 'function') {
    tertiaryBtn = document.createElement('button');
    tertiaryBtn.className = 'modal-btn';
    if (tertiaryStyle === 'confirm') tertiaryBtn.classList.add('modal-btn-confirm');
    else if (tertiaryStyle === 'alt') tertiaryBtn.classList.add('modal-btn-alt');
    else if (tertiaryStyle === 'danger') tertiaryBtn.classList.add('modal-btn-danger');
    tertiaryBtn.textContent = tertiaryLabel;
  }

  // hideCancel: single-button informational modals (e.g. "MIDI coming
  // soon") only need an acknowledge button — showing a Cancel that
  // does the same thing as the OK button is just visual noise.
  if (!hideCancel) actions.appendChild(cancelBtn);
  if (tertiaryBtn) actions.appendChild(tertiaryBtn);
  actions.appendChild(confirmBtn);
  modal.appendChild(h);
  if (sub) modal.appendChild(sub);
  if (p) modal.appendChild(p);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // `didActOnIt` distinguishes "user explicitly chose Confirm/Tertiary"
  // (the action was handled) from "user dismissed without choosing"
  // (Cancel / Esc / overlay click). The latter triggers onCancel so
  // callers can tear down dependent state — e.g. Write mode's
  // `writePending` flag, which would otherwise leave the user stuck
  // in the slot-picker loop ("Click a slot to write current patch")
  // even after pressing Cancel on the confirm modal.
  const close = (didActOnIt = false) => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (!didActOnIt) runCallback(onCancel, 'Cancel action');
  };
  // Run an onConfirm / onTertiary callback safely. The callback may be
  // sync OR async — many callsites pass `async () => { await window.api.X(); ... }`.
  // Without this wrapper, a thrown sync error or rejected promise from
  // the callback would vanish (modal already closed, no UI surface).
  // The wrapper surfaces both cases via the global error banner so
  // failures are visible. Pulled into a helper here so all three
  // invocation paths (confirm click, tertiary click, Enter key) share
  // one safety pattern.
  const runCallback = (fn, ctx) => {
    if (typeof fn !== 'function') return;
    try {
      const ret = fn();
      if (ret && typeof ret.catch === 'function') {
        ret.catch((err) => {
          console.error(`${ctx} failed:`, err);
          setTimeout(() => { throw err; }, 0);
        });
      }
    } catch (err) {
      console.error(`${ctx} failed:`, err);
      setTimeout(() => { throw err; }, 0);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter')  { runCallback(onConfirm, 'Confirm action'); close(true); }
  };

  cancelBtn.addEventListener('click', () => close());
  confirmBtn.addEventListener('click', () => { runCallback(onConfirm, 'Confirm action'); close(true); });
  if (tertiaryBtn) tertiaryBtn.addEventListener('click', () => { runCallback(onTertiary, 'Tertiary action'); close(true); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  confirmBtn.focus();
}


function buildTrashIcon(idx) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('package-trash');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M3 4h10M5.5 4V2.5h5V4M4 4l.5 9.5h7L12 4M7 7v5M9 7v5');
  svg.appendChild(path);
  svg.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeletePackage(idx);
  });
  return svg;
}

function handleDeletePackage(idx) {
  const pkg = library.packages && library.packages[idx];
  if (!pkg) return;
  showConfirmModal({
    title: 'Delete this C/D bank package?',
    confirmLabel: 'Delete',
    confirmStyle: 'danger',
    onConfirm: () => {
      // Capture the package by reference so a stale `idx` from rapid
      // successive deletes still resolves to the right row at splice time.
      const pkgRef = pkg;
      const commit = () => {
        const curIdx = library.packages.indexOf(pkgRef);
        if (curIdx === -1) return;  // already removed (defensive)
        const removed = library.packages[curIdx];
        library.packages.splice(curIdx, 1);
        const prevSelPackage = selPackage;
        if (selPackage === curIdx) selPackage = null;
        else if (selPackage !== null && selPackage > curIdx) selPackage -= 1;
        saveLibraryDebounced();
        renderPatchList();
        pushUndo({
          undo: () => {
            library.packages.splice(curIdx, 0, removed);
            selPackage = prevSelPackage;
            saveLibraryDebounced();
            renderPatchList();
          },
          redo: () => {
            const i = library.packages.indexOf(pkgRef);
            if (i === -1) return;
            library.packages.splice(i, 1);
            if (selPackage === i) selPackage = null;
            else if (selPackage !== null && selPackage > i) selPackage -= 1;
            saveLibraryDebounced();
            renderPatchList();
          },
        });
      };
      animateRowDeleteThenCommit(`.package-item[data-idx="${idx}"]`, commit);
    },
  });
}

function startPackageNameEdit(idx, nm, def, inp) {
  // Pre-fill with the DISPLAYED name (customName || defaultName), not just
  // customName. WAV-imported packages carry their name in defaultName with
  // an empty customName (see the import path's `defaultName: fileLabel`),
  // so reading customName alone opened the editor blank even though the row
  // clearly showed a name. The input is .select()-ed below, so typing still
  // replaces the whole value in one keystroke.
  const pkg = library.packages[idx];
  inp.value = (pkg.customName || pkg.defaultName) || '';
  inp.style.display = 'block';
  nm.style.display  = 'none';
  inp.focus();
  inp.select();
}

function commitPackageNameEdit(idx, nm, def, inp) {
  if (inp.style.display !== 'block') return;
  const val = inp.value.trim();
  const oldName = library.packages[idx].customName || '';
  const newName = val;
  library.packages[idx].customName = newName;
  inp.style.display = 'none';
  nm.style.display  = '';
  saveLibraryDebounced();
  renderPatchList();
  if (oldName !== newName) {
    pushUndo({
      undo: () => { if (library.packages[idx]) { library.packages[idx].customName = oldName; saveLibraryDebounced(); renderPatchList(); } },
      redo: () => { if (library.packages[idx]) { library.packages[idx].customName = newName; saveLibraryDebounced(); renderPatchList(); } },
    });
  }
}

function cancelPackageNameEdit(nm, inp) {
  inp.style.display = 'none';
  nm.style.display  = '';
}

// ═══════════════════════════════════════════════════════════════
// Library — Sequences sub-tab
// ═══════════════════════════════════════════════════════════════
// Same UX as Tones (select / inline-rename / drag-reorder / hover-trash)
// but operates on library.sequences. Each entry has a `tape` block
// (hardware-faithful sequencer data, null until the codec is wired) and an
// `app` block (patchNote, pairedPatch — librarian-only
// metadata that doesn't round-trip to the JX-3P).

function renderSequencesList(list) {
  const seqs = Array.isArray(library.sequences) ? library.sequences : [];
  if (seqs.length === 0) {
    selSequence = null;
    const ph = document.createElement('div');
    ph.className = 'library-placeholder';
    ph.textContent =
      'No saved sequences yet.\nUse Tape Memory "Sequencer" mode + Save on a bank tab, or upload a WAV below.';
    list.appendChild(ph);
    list.appendChild(buildWavUploadZone('sequences', { variant: 'prominent' }));
    return;
  }

  seqs.forEach((seq, idx) => {
    const item = document.createElement('div');
    // Mark edited copies (name matches "(edited)" / "(edited N)")
    // with the .edited-copy modifier so CSS can render them italic +
    // dim. Self-cleans when user renames via the pencil affordance.
    const displayName = seq.customName || seq.defaultName;
    const isEdited    = isEditedSequenceName(displayName);
    item.className = 'package-item' +
                     (idx === selSequence ? ' selected'     : '') +
                     (isEdited            ? ' edited-copy'  : '');
    if (seq.id && seq.id === pendingSaveAnimationId) {
      item.classList.add('just-saved');
      pendingSaveAnimationId = null;
      item.addEventListener('animationend', () => item.classList.remove('just-saved'), { once: true });
    }
    item.draggable = true;
    item.dataset.idx = String(idx);

    const nm = document.createElement('span');
    nm.className = 'package-name-span' + (seq.customName ? '' : ' unnamed');
    nm.textContent = displayName;
    appendRenamePencil(nm);  // always shown — see renderPatchList for rationale

    const def = document.createElement('span');
    def.className = 'package-default-name';
    def.textContent = relativeTime(seq.savedAt);

    const inp = document.createElement('input');
    inp.className = 'package-name-edit';
    inp.type = 'text';
    inp.maxLength = 60;
    inp.spellcheck = false;
    inp.autocomplete = 'off';

    item.appendChild(nm);
    item.appendChild(def);
    item.appendChild(inp);
    item.appendChild(buildDownloadWavIcon(
      () => handleDownloadSequence(idx),
      'download this sequence as a WAV (saves to Desktop)',
    ));
    // Sequence info icon — replaces the in-app LOAD button (removed
    // 2026-05-25). The old LOAD action restored the paired patch into
    // its original C/D slot, which silently overwrote any edits the
    // user had made there. Sequences also don't NEED to be "loaded"
    // into JP — they live in the Library entry and get sent to the JX
    // via Sequencer → Load to JX-3P directly. The paired-patch context
    // remains discoverable via this info icon for users who want it.
    item.appendChild(buildSequenceInfoIcon(idx));
    item.appendChild(buildSequenceTrashIcon(idx));
    list.appendChild(item);

    item.addEventListener('click', (e) => {
      if (e.target.closest('.patch-rename-icon')) {
        startSequenceNameEdit(idx, nm, def, inp);
        return;
      }
      // Clicking the same sequence is a no-op — skip the guard so
      // it doesn't pop a stale "SAVE or DELETE" modal when the user
      // is already viewing this one.
      if (idx === selSequence) return;
      guardSeqNav(() => {
        selSequence = idx;
        selSeqVizPage = null;     // reset zoom when switching sequences
        clearSequenceSelection(); // selection is per-sequence
        // v0.6.5: paired-patch auto-load. If the selected sequence has
        // paired-patch metadata with params, flip the PG-200 panel into
        // preview mode showing those params + name. Otherwise exit any
        // active preview (e.g. user switched from a paired sequence to
        // a non-paired one).
        const selectedSeq = library && library.sequences && library.sequences[idx];
        const pp = selectedSeq && selectedSeq.app && selectedSeq.app.pairedPatch;
        if (pp && pp.params && typeof pp.params === 'object') {
          const seqLabel = selectedSeq.customName || selectedSeq.defaultName || 'sequence';
          enterPreviewMode(pp.params, pp.patchName, `Paired patch from ${seqLabel}`);
        } else {
          exitPreviewMode();
        }
        renderPatchList();
        renderCustomBuilder();    // refresh the visualizer for the newly-selected sequence
      });
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  commitSequenceNameEdit(idx, nm, def, inp);
      if (e.key === 'Escape') cancelSequenceNameEdit(nm, inp);
    });
    inp.addEventListener('blur', () => commitSequenceNameEdit(idx, nm, def, inp));

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.drag-over, .drag-over-bottom').forEach((el) => {
        el.classList.remove('drag-over', 'drag-over-bottom');
      });
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Top-half vs bottom-half — see active-bank reorder for rationale.
      const rect = item.getBoundingClientRect();
      const isBottomHalf = (e.clientY - rect.top) > (rect.height / 2);
      list.querySelectorAll('.drag-over, .drag-over-bottom').forEach((el) => {
        if (el !== item) el.classList.remove('drag-over', 'drag-over-bottom');
      });
      item.classList.toggle('drag-over',        !isBottomHalf);
      item.classList.toggle('drag-over-bottom',  isBottomHalf);
    });
    item.addEventListener('dragleave', (e) => {
      if (e.currentTarget === item && !item.contains(e.relatedTarget)) {
        item.classList.remove('drag-over', 'drag-over-bottom');
      }
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const rect = item.getBoundingClientRect();
      const isBottomHalf = (e.clientY - rect.top) > (rect.height / 2);
      const toIdx = isBottomHalf ? idx + 1 : idx;
      item.classList.remove('drag-over', 'drag-over-bottom');
      if (Number.isNaN(fromIdx) || fromIdx === toIdx) return;
      reorderSequence(fromIdx, toIdx);
    });
  });
  // Always-visible upload affordance at the bottom of the populated list.
  list.appendChild(buildWavUploadZone('sequences', { variant: 'compact' }));
}

function reorderSequence(fromIdx, toIdx) {
  const seqs = library.sequences;
  if (!seqs || fromIdx < 0 || fromIdx >= seqs.length) return;
  if (toIdx   < 0 || toIdx   >= seqs.length) return;
  // Same off-by-one fix as reorderBankSlot / reorderPackage. (The custom-
  // bank builder no longer uses insert-reorder — it swaps slots instead.)
  // Shared helper in renderer/library-math.js; tested in test/library-math.test.js.
  const effectiveToIdx = computeReorderIdx(fromIdx, toIdx);
  if (fromIdx === effectiveToIdx) return;
  const [moved] = seqs.splice(fromIdx, 1);
  seqs.splice(effectiveToIdx, 0, moved);
  // Keep index-keyed dirty/snapshot tracking in step with the move —
  // same bug class as delete-without-remap (see remapSequenceTracking).
  remapSequenceTracking((i) => remapIndexAfterReorder(i, fromIdx, effectiveToIdx));
  if (selSequence !== null) {
    if (selSequence === fromIdx) selSequence = effectiveToIdx;
    else if (fromIdx < selSequence && effectiveToIdx >= selSequence) selSequence -= 1;
    else if (fromIdx > selSequence && effectiveToIdx <= selSequence) selSequence += 1;
  }
  saveLibraryDebounced();
  renderPatchList();
}

function buildSequenceTrashIcon(idx) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('package-trash');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M3 4h10M5.5 4V2.5h5V4M4 4l.5 9.5h7L12 4M7 7v5M9 7v5');
  svg.appendChild(path);
  svg.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteSequence(idx);
  });
  return svg;
}

function handleDeleteSequence(idx) {
  const seq = library.sequences && library.sequences[idx];
  if (!seq) return;
  showConfirmModal({
    title: 'Delete this Sequence?',
    confirmLabel: 'Delete',
    confirmStyle: 'danger',
    onConfirm: () => {
      // Capture by reference — see handleDeletePackage for the rationale.
      const seqRef = seq;
      const commit = () => {
        const curIdx = library.sequences.indexOf(seqRef);
        if (curIdx === -1) return;
        const removed = library.sequences[curIdx];
        library.sequences.splice(curIdx, 1);
        // Remap index-keyed dirty/snapshot tracking past the splice —
        // drops the deleted sequence's own entries, shifts the rest.
        // Without this the deleted row's dirty flag lands on whichever
        // sequence inherits its index (2026-06-10 bug).
        remapSequenceTracking((i) => remapIndexAfterRemoval(i, curIdx));
        const prevSelSequence = selSequence;
        if (selSequence === curIdx) selSequence = null;
        else if (selSequence !== null && selSequence > curIdx) selSequence -= 1;
        saveLibraryDebounced();
        renderPatchList();
        // Deleting the SELECTED sequence nulls selSequence — re-render
        // the builder area so the dead sequence's visualizer (and its
        // stale SAVE badge) doesn't linger below the panel.
        renderCustomBuilder();
        pushUndo({
          undo: () => {
            library.sequences.splice(curIdx, 0, removed);
            remapSequenceTracking((i) => remapIndexAfterInsertion(i, curIdx));
            // An undone isNew delete restores a sequence that only ever
            // existed dirty — re-flag it so the SAVE badge returns and
            // discard/commit flows still know about it.
            if (removed.isNew) dirtySequences.add(curIdx);
            selSequence = prevSelSequence;
            saveLibraryDebounced();
            renderPatchList();
            renderCustomBuilder();
          },
          redo: () => {
            const i = library.sequences.indexOf(seqRef);
            if (i === -1) return;
            library.sequences.splice(i, 1);
            remapSequenceTracking((j) => remapIndexAfterRemoval(j, i));
            if (selSequence === i) selSequence = null;
            else if (selSequence !== null && selSequence > i) selSequence -= 1;
            saveLibraryDebounced();
            renderPatchList();
            renderCustomBuilder();
          },
        });
      };
      animateRowDeleteThenCommit(`.package-item[data-idx="${idx}"]`, commit);
    },
  });
}

// Shared helper: trigger the .deleting CSS animation on the row matching
// `selector`, then run `commit` after the animation completes. Falls
// through to immediate commit if the element isn't found, and includes a
// 500 ms safety timeout in case animationend never fires (e.g. reduced-
// motion accessibility settings or a missing CSS rule). Multi-delete-safe
// because each invocation captures its own element + listener.
function animateRowDeleteThenCommit(selector, commit) {
  const rowEl = document.querySelector(selector);
  if (!rowEl) { commit(); return; }
  let fired = false;
  const done = () => {
    if (fired) return;
    fired = true;
    commit();
  };
  rowEl.classList.add('deleting');
  rowEl.addEventListener('animationend', done, { once: true });
  setTimeout(done, 500);
}

function startSequenceNameEdit(idx, nm, def, inp) {
  // Same fix as startPackageNameEdit: pre-fill with the displayed name
  // (customName || defaultName) so WAV/drop-imported sequences — whose name
  // lives in defaultName with an empty customName — don't open blank.
  const seq = library.sequences[idx];
  inp.value = (seq.customName || seq.defaultName) || '';
  inp.style.display = 'block';
  nm.style.display  = 'none';
  inp.focus();
  inp.select();
}

function commitSequenceNameEdit(idx, nm, def, inp) {
  if (inp.style.display !== 'block') return;
  const val = inp.value.trim();
  const oldName = library.sequences[idx].customName || '';
  const newName = val;
  library.sequences[idx].customName = newName;
  inp.style.display = 'none';
  nm.style.display  = '';
  saveLibraryDebounced();
  renderPatchList();
  // Visualizer header reads from library.sequences[idx].customName too.
  // Without this, the bottom header stays stale ("Old Name") until the
  // user clicks something else that triggers a render. Only fire when
  // the renamed sequence is the one currently being visualized — no
  // point repainting if we're not showing it.
  if (idx === selSequence) renderSequenceVisualizer();
  if (oldName !== newName) {
    pushUndo({
      undo: () => {
        if (library.sequences[idx]) {
          library.sequences[idx].customName = oldName;
          saveLibraryDebounced();
          renderPatchList();
          if (idx === selSequence) renderSequenceVisualizer();
        }
      },
      redo: () => {
        if (library.sequences[idx]) {
          library.sequences[idx].customName = newName;
          saveLibraryDebounced();
          renderPatchList();
          if (idx === selSequence) renderSequenceVisualizer();
        }
      },
    });
  }
}

function cancelSequenceNameEdit(nm, inp) {
  inp.style.display = 'none';
  nm.style.display  = '';
}

function renderSequencesActions(actions) {
  // "Explore user shared sequences" — placeholder entry point for the
  // community library (docs/future-features.md → Community library →
  // in-app share + explore workflow). Inactive until the community
  // manifest + tabs exist on jx-3p.com. Create-new-sequence moved to
  // the builder-area key below the panel (see renderCustomBuilder).
  const btn = document.createElement('button');
  btn.className = 'save-banks-btn';   // reuse the existing visual class
  btn.textContent = 'explore user shared sequences';
  btn.disabled = true;
  actions.appendChild(btn);
}

// Sequence info icon (replaces the removed in-app LOAD button). Hover-
// revealed; clicking opens a read-only modal with the paired-patch
// reference, any notes the user attached at save time, and the save date.
// Matches the style of the .patch-info-btn used on active C/D slots so
// the visual vocabulary is consistent between bank-row and sequence-row
// info affordances.
function buildSequenceInfoIcon(idx) {
  const btn = document.createElement('button');
  btn.className = 'package-info-btn';
  btn.type = 'button';
  btn.title = 'Sequence info';
  btn.innerHTML =
    '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">' +
      '<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="0.9"/>' +
      '<line x1="6" y1="5.2" x2="6" y2="8.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
      '<circle cx="6" cy="3.4" r="0.65" fill="currentColor"/>' +
    '</svg>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showSequenceInfo(idx);
  });
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  return btn;
}

function showSequenceInfo(idx) {
  if (idx === undefined) idx = selSequence;
  if (idx == null) return;
  const seq = library.sequences && library.sequences[idx];
  if (!seq) return;
  migrateSequenceShape(seq);

  const pp = (seq.app && seq.app.pairedPatch) || {};
  const note = (seq.app && seq.app.patchNote) || '';
  const where = pp.bank ? `${pp.bank}${(pp.slot || 0) + 1}` : '?';
  const pName = pp.patchName || '(unnamed)';

  const seqName = seq.customName || seq.defaultName || '(unnamed sequence)';

  // Body lines — paired patch + notes (always shown, even when empty,
  // so the user sees where their JX-time notes would appear) +
  // optional saved date if savedAt is a valid timestamp.
  const lines = [`**Paired patch:** ${where} / ${pName}`];
  lines.push('');
  lines.push(`**Notes:** ${note || '(none)'}`);
  if (seq.savedAt) {
    const d = new Date(seq.savedAt);
    if (!Number.isNaN(d.getTime())) {
      const formatted = d.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      lines.push('');
      lines.push(`**Created:** ${formatted}`);
    }
  }

  showConfirmModal({
    title: 'Sequence info',
    subtitle: seqName,
    body: lines.join('\n'),
    confirmLabel: 'Close',
    onConfirm: () => {},
  });
}

// Build the _sequenceMeta payload that rides along with sequence WAV
// exports — main.js extracts the field and embeds it as a jPpS v:2 chunk
// for cross-user customName/originalName/createdAt/etc. preservation.
// Mirrors what _slotMeta does for patches.
//
// pairedPatch is embedded FULL (including params) so the recipient's
// paired-patch hint UI (Phase B) can populate the panel when the user
// clicks Write to add the patch to their library. Note: this is the only
// path today by which a paired-patch's full params get shared cross-user
// — preserves the "as the creator intended" listening context.
function buildSequenceMetaForExport(seq) {
  if (!seq) return null;
  const meta = {};
  if (seq.customName)   meta.customName   = seq.customName;
  if (seq.originalName) meta.originalName = seq.originalName;
  if (seq.createdAt)    meta.createdAt    = seq.createdAt;
  if (seq.app) {
    if (seq.app.patchNote) meta.patchNote = seq.app.patchNote;
    if (seq.app.pairedPatch) meta.pairedPatch = { ...seq.app.pairedPatch };
  }
  return Object.keys(meta).length > 0 ? meta : null;
}

function handleSendSequenceToJX() {
  if (selSequence === null) return;
  const seq = library.sequences[selSequence];
  if (!seq) return;
  // v0.6.5: paired-patch preview only represents visual context from
  // the Library — the JX-3P tape format carries sequence pages only,
  // no patch data. When the user kicks off Load to JX-3P, exit
  // preview so the panel stops implying "I'm sending both." Fade the
  // hint to opacity 0 (200ms), then clear state AND open the Send
  // modal — delaying the modal until the fade completes feels more
  // deliberate than letting them race.
  if (currentPreviewPatch) {
    const hintFo = document.querySelector('.paired-patch-hint-fo');
    if (hintFo) {
      hintFo.classList.add('paired-patch-hint-exiting');
      setTimeout(() => {
        exitPreviewMode();
        hintFo.classList.remove('paired-patch-hint-exiting');
        sendSequenceToJxAfterExit(seq);
      }, 220);
    } else {
      exitPreviewMode();
      sendSequenceToJxAfterExit(seq);
    }
    return;
  }
  sendSequenceToJxAfterExit(seq);
}

// Continuation of handleSendSequenceToJX — split so the paired-patch
// preview fade can defer the modal open until the fade completes.
function sendSequenceToJxAfterExit(seq) {
  migrateSequenceShape(seq);
  if (!seq.tape || !Array.isArray(seq.tape.pages)) {
    showConfirmModal({
      title: 'No sequence data to send',
      body:
        'This library entry was saved before sequencer audio support was wired ' +
        'and only contains the paired-patch metadata. There is nothing to send ' +
        'to the JX-3P. Re-capture the sequence to populate the tape data.',
      confirmLabel: 'OK',
      onConfirm: () => {},
    });
    return;
  }
  // Lazy-migrate originalName: set ONCE if missing, persist for future
  // exports. Honors the "set once at first export, never overwritten" rule
  // for the jPpS v:2 sequenceMeta.originalName field. Once set, even
  // renames via customName don't change it — preserves attribution to the
  // original creator across cross-user trades.
  if (!seq.originalName) {
    const initialName = seq.customName || seq.defaultName || null;
    if (initialName) {
      seq.originalName = initialName;
      saveLibraryDebounced();
    }
  }
  const label = seq.customName || seq.defaultName || null;
  // jx3p seq-json-to-wav validates kind: "sequence" + format_version; the
  // saved seq.tape only carries `pages`, so wrap it here.
  //
  // _sequenceMeta is stripped by main.js before passing to jx3p; embedded
  // via the jPpS v:2 chunk for cross-user customName/originalName/etc.
  // preservation. See main.js embedJpMetaInWav + docs/future-features.md
  // "v0.6.5 final scope" entry.
  const exportData = {
    format_version: '1.0',
    kind: 'sequence',
    pages: seq.tape.pages,
    _sequenceMeta: buildSequenceMetaForExport(seq),
  };
  // 2026-05-24: the paired-patch / notes intro block + the 3-step setup
  // instructions were removed from this modal (per Daniel) — the title is
  // descriptive enough on its own, and the paired-patch context is still
  // visible in the Library row's info button. Modal is now header + 3
  // action buttons in Step 1; Step 2 stays full-width with the timeline.
  showSendSequenceToJxModal(exportData, label);
}

// (showLoadSequenceModal removed 2026-05-26: it built a 3rd standalone
// "send sequence to JX" modal that was superseded by the unified
// showSendToJxFlow/showSendSequenceToJxModal path. Zero callers
// remained — flagged by ESLint's no-unused-vars and removed.)

function setupLibSubTabs() {
  document.querySelectorAll('.lib-sub-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const next = tab.dataset.libtab;
      if (!next || next === selLibTab) return;
      // Sub-tab switch IS a nav-away if there's a dirty sequence
      // (going from Sequences to Tones drops the visualizer entirely).
      // Wrapping in guardSeqNav pops the SAVE / DELETE modal first.
      guardSeqNav(() => {
        selLibTab = next;
        if (next === 'tones')     selSequence = null;
        else if (next === 'sequences') selPackage  = null;
        renderPatchList();
        renderCustomBuilder();   // refresh visualizer / builder visibility
      });
    });
  });
}

function selectPatch(slot, opts) {
  selSlot = slot;
  const shift = !!(opts && opts.shiftKey);
  if (selBank === 'C' || selBank === 'D') {
    lastBankSelection = { bank: selBank, slot };
    // Shift-click extends a range from the prior anchor on the same bank.
    // A plain click resets the anchor and clears any existing range.
    if (shift && rangeAnchor.bank === selBank) {
      const start = Math.min(rangeAnchor.slot, slot);
      const end   = Math.max(rangeAnchor.slot, slot);
      selectedRange = { bank: selBank, start, end };
    } else {
      rangeAnchor = { bank: selBank, slot };
      selectedRange = null;
    }
    // v0.6.5: selecting any C/D slot exits paired-patch preview mode —
    // the user has explicitly chosen to view a real slot, so the panel
    // returns to that slot's params + the slot-prefixed parallelogram.
    if (currentPreviewPatch) {
      currentPreviewPatch = null;   // direct clear (updateSvgPatchName + updateAllControls happen below)
    }
  } else {
    // Library tab — no range selection in the library list.
    selectedRange = null;
  }
  renderPatchList();
  updateSvgPatchName();
  updateAllControls(currentPatch());
}

// ── Write button: save-as / clone-to-slot ───────────────────────────────
// Matches the JX-3P hardware's WRITE-then-pick-slot flow. The patch list
// becomes a destination picker; clicking any slot writes the currently
// shown patch's params into that slot. Esc cancels. App-side only — does
// not touch the real synth (Phase 3 / MIDI concern).
function enterWriteMode() {
  // Paired-patch preview path (v0.6.5): user is on the Library tab with a
  // paired-patch preview loaded onto the panel. Auto-switch to Bank C so
  // the slot-picker becomes available — currentPatch() already returns
  // the preview params, so commitWriteTo/doWriteTo write the paired
  // patch into the chosen slot without further plumbing.
  if (currentPreviewPatch && selBank === 'L') {
    selBank = 'C';
    selSlot = 0;
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.bank === 'C');
    });
  }
  if (selBank === 'L') return;        // no concept of "current patch" in Library
  if (!currentPatch()) return;
  writePending = true;
  lightButton('write', true);
  renderPatchList();
}

function cancelWriteMode() {
  if (!writePending) return;
  writePending = false;
  lightButton('write', false);
  renderPatchList();
}

function commitWriteTo(destBank, destSlot) {
  if (!writePending) return;
  const src = currentPatch();
  if (!src || !patches || !Array.isArray(patches.banks)) {
    cancelWriteMode();
    return;
  }
  const destKey = slotKey(destBank, destSlot);
  // Paired-patch preview path (v0.6.5): name the patch in the title.
  // Body copy is shared across both paths — same overwrite-and-sync
  // story regardless of source.
  const previewName = currentPreviewPatch && currentPreviewPatch.name;
  const title = previewName
    ? `Save "${previewName}" to ${destKey}?`
    : `Save this new patch to ${destKey}?`;
  const body =
    `This will overwrite the current patch in JP Patches. ` +
    `Your JX-3P ${destKey} patch is unchanged. ` +
    `To push the updated bank to the synth, use the Load to JX-3P button.`;
  showConfirmModal({
    title,
    body,
    confirmLabel: 'Save',
    onConfirm: () => doWriteTo(destBank, destSlot),
    // Cancel on this modal should exit Write mode entirely — otherwise
    // dismissing the modal returns the user to the slot-picker banner
    // ("Click a slot to write current patch") and clicking any slot
    // re-pops this modal, which feels like a loop. (Daniel 2026-05-27.)
    onCancel: cancelWriteMode,
  });
}

function doWriteTo(destBank, destSlot) {
  const src = currentPatch();
  if (!src || !patches || !Array.isArray(patches.banks)) return;
  const destIdx = destBank === 'D' ? 1 : 0;
  if (!patches.banks[destIdx]) return;
  patches.banks[destIdx][destSlot] = JSON.parse(JSON.stringify(src));
  // Also clone the patch name into slotMeta for the destination so the
  // patch list shows the paired-patch name instead of staying blank /
  // showing the old name. Only do this in preview mode — non-preview
  // Write doesn't have an authoritative name to set.
  if (currentPreviewPatch && currentPreviewPatch.name) {
    const meta = slotMetaArr(destBank);
    if (meta && meta[destSlot]) {
      meta[destSlot].name = currentPreviewPatch.name;
    }
  }
  // Write IS the user committing a new clean state to the destination
  // slot — update its baseline so the modified-indicator reads "clean."
  snapshotCleanParamsAt(destBank, destSlot);
  saveLibraryDebounced();   // persist active state across restarts
  writePending = false;
  lightButton('write', false);
  // Exit preview mode now that the paired patch has a real home — the
  // panel should show the destination slot's params (which are now the
  // ex-preview params, but via the C/D slot, not via the preview slot).
  // Without this, currentPatch() would keep returning preview and the
  // post-write renderPatchList/updateAllControls would re-show preview
  // styling on the parallelogram instead of the new slot's normal view.
  currentPreviewPatch = null;
  // Navigate to the destination so the user sees the result.
  selBank = destBank;
  selSlot = destSlot;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.bank === destBank);
  });
  renderPatchList();
  updateSvgPatchName();
  updateAllControls(currentPatch());
}

// ═══════════════════════════════════════════════════════════════
// Name editing (left list only)
// ═══════════════════════════════════════════════════════════════

function startNameEdit(slot, nm, inp) {
  const cur = patchName(selBank, slot) || '';
  nm.style.display  = 'none';
  inp.style.display = 'block';
  inp.value = cur;
  inp.focus();
  inp.select();
}

function commitListEdit(slot, nm, inp) {
  if (inp.style.display !== 'block') return;
  const val = inp.value.trim();
  const arr = slotMetaArr(selBank);
  // Capture for undo BEFORE mutating.
  const bankAtEdit = selBank;
  const oldName    = (arr && arr[slot] && arr[slot].name) || null;
  const newName    = val || null;
  if (arr && arr[slot]) arr[slot].name = newName;
  recordToHistory(selBank, slot);
  inp.style.display = 'none';
  nm.style.display  = '';
  saveLibraryDebounced();
  renderPatchList();
  updateSvgPatchName();
  if (oldName !== newName) {
    pushUndo({
      undo: () => setPatchSlotName(bankAtEdit, slot, oldName),
      redo: () => setPatchSlotName(bankAtEdit, slot, newName),
    });
  }
}

// Small helper used by undo/redo of patch renames so the inverse
// operation can run without going through the DOM edit-field flow.
function setPatchSlotName(bank, slot, name) {
  const arr = slotMetaArr(bank);
  if (arr && arr[slot]) arr[slot].name = name;
  recordToHistory(bank, slot);
  saveLibraryDebounced();
  renderPatchList();
  updateSvgPatchName();
}

function cancelListEdit(nm, inp) {
  inp.style.display = 'none';
  nm.style.display  = '';
}

function saveLibraryDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Persist active C/D banks alongside the library (2026-05-25). The
    // legacy ~/Desktop/patches.json path is read-only at boot; without
    // this, patches.banks would silently revert to the seed on every
    // restart, leaving cleanParams pointing at the LAST library load —
    // which then shows all 32 slots as "modified" because current (seed)
    // ≠ clean (last library load). Storing active state on every
    // mutation flushes that mismatch and gives the user cross-session
    // edit memory as a bonus.
    if (patches && Array.isArray(patches.banks)) {
      library.activePatches = patches.banks;
    }
    // Check the IPC result so disk-write failures (full disk, permission
    // denied, sandbox issue) surface as a visible error instead of silent
    // data loss. Before this guard, the user would have no idea their last
    // edits never persisted. The main handler returns {ok: true} on success
    // and {ok: false, error: ...} on failure (it used to throw, which would
    // have produced an unhandled-rejection banner; we converted it to an
    // object return so the renderer can show contextual error info). Both
    // the success-with-error-shape and the unexpected-rejection paths
    // surface via the global error banner.
    const announceSaveError = (msg) => {
      console.error('Failed to save library to disk:', msg);
      setTimeout(() => { throw new Error('Library save failed: ' + msg); }, 0);
    };
    window.api.saveLibrary(library)
      .then((res) => {
        if (!res || res.ok === false) announceSaveError((res && res.error) || 'unknown error');
      })
      .catch((err) => announceSaveError(err && err.message || 'IPC rejection'));
  }, 500);
}

// ═══════════════════════════════════════════════════════════════
// Reorder: within-bank (drag-and-drop) and cross-bank (same-slot swap)
// ═══════════════════════════════════════════════════════════════

function reorderBankSlot(bank, fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  if (fromIdx < 0 || fromIdx > 15 || toIdx < 0 || toIdx > 15) return;
  const bankIdx = bank === 'D' ? 1 : 0;
  const paramsArr = patches && patches.banks && patches.banks[bankIdx];
  const metaArr   = slotMetaArr(bank);
  if (!Array.isArray(paramsArr) || !Array.isArray(metaArr)) return;

  // Off-by-one fix (2026-05-24): the drop indicator (bold line at TOP of
  // the hovered row) visually means "insert between slot toIdx-1 and
  // slot toIdx". When moving DOWN (fromIdx < toIdx), splice-removing the
  // source shifts the target up by 1, so the post-removal insertion index
  // should be toIdx - 1. When moving UP (fromIdx > toIdx), no shift —
  // splice removal doesn't move anything before fromIdx. Without this
  // adjustment, downward drags land one slot LATER than the indicator.
  // Helper in renderer/library-math.js; unit-tested in test/library-math.test.js.
  const effectiveToIdx = computeReorderIdx(fromIdx, toIdx);
  if (fromIdx === effectiveToIdx) return;  // no-op (adjacent down-move)

  // FLIP animation prep — capture each visible row's pre-move top position
  // BEFORE we mutate the data and re-render. Only fires when we're looking
  // at the bank that's reordering (otherwise the new state would already
  // be on-screen with nothing to animate from).
  let prePositions = null;
  if (bank === selBank) {
    const list = document.getElementById('patch-list');
    if (list) {
      prePositions = new Map();
      list.querySelectorAll('.patch-item').forEach((el) => {
        const idx = parseInt(el.dataset.slot, 10);
        if (!Number.isNaN(idx)) prePositions.set(idx, el.getBoundingClientRect().top);
      });
    }
  }

  const [paramsMoved] = paramsArr.splice(fromIdx, 1);
  paramsArr.splice(effectiveToIdx, 0, paramsMoved);
  const [metaMoved] = metaArr.splice(fromIdx, 1);
  metaArr.splice(effectiveToIdx, 0, metaMoved);

  // Keep selSlot pointing at the same patch if it was in the moved range.
  if (bank === selBank) {
    if (selSlot === fromIdx) selSlot = effectiveToIdx;
    else if (fromIdx < selSlot && effectiveToIdx >= selSlot) selSlot -= 1;
    else if (fromIdx > selSlot && effectiveToIdx <= selSlot) selSlot += 1;
  }

  // Refresh history for the named patches that just moved (origin doesn't
  // change, but ts and any stale entries get refreshed).
  recordToHistory(bank, fromIdx);
  recordToHistory(bank, effectiveToIdx);

  saveLibraryDebounced();
  renderPatchList();
  updateSvgPatchName();

  // Undo: reverse by moving the item (now at effectiveToIdx) back to fromIdx.
  // Pass effectiveToIdx (current location) as the source — the undo call
  // will then have effectiveToIdx > fromIdx (since we moved down originally)
  // and won't re-trigger the adjustment.
  pushUndo({
    undo: () => reorderBankSlot(bank, effectiveToIdx, fromIdx),
    redo: () => reorderBankSlot(bank, fromIdx, toIdx),
  });

  // FLIP animation play — for each rendered row, compute the delta from
  // its old position to its new one, transform it instantly back to where
  // it was, force a reflow, then transition transform back to 0. The
  // browser animates the slide smoothly. Plus a cream-tint flash on the
  // moved row so the destination is unmistakable.
  if (prePositions) {
    const newList = document.getElementById('patch-list');
    if (newList) {
      // Map each new-slot-index back to its old-slot-index, based on the
      // splice pattern (move from F to T):
      //   F < T: items at F+1..T shift up by 1; T receives the moved item.
      //   F > T: items at T..F-1 shift down by 1; T receives the moved item.
      const newToOld = (newIdx) => {
        if (newIdx === effectiveToIdx) return fromIdx;
        if (fromIdx < effectiveToIdx && newIdx >= fromIdx && newIdx < effectiveToIdx) return newIdx + 1;
        if (fromIdx > effectiveToIdx && newIdx > effectiveToIdx && newIdx <= fromIdx) return newIdx - 1;
        return newIdx;
      };
      const movedRows = [];
      newList.querySelectorAll('.patch-item').forEach((el) => {
        const newIdx = parseInt(el.dataset.slot, 10);
        if (Number.isNaN(newIdx)) return;
        const oldIdx = newToOld(newIdx);
        const oldTop = prePositions.get(oldIdx);
        if (oldTop === undefined) return;
        const newTop = el.getBoundingClientRect().top;
        const delta  = oldTop - newTop;
        if (Math.abs(delta) < 0.5) return;
        el.style.transition = 'none';
        el.style.transform  = `translateY(${delta}px)`;
        movedRows.push(el);
      });
      // Force a reflow so the pre-animation transform commits before we
      // swap in the transition + zero transform.
      void newList.offsetWidth;
      movedRows.forEach((el) => {
        el.style.transition = 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform  = 'translateY(0)';
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
          el.style.transform  = '';
        }, { once: true });
      });
      // Cream-tint flash on the row that received the moved patch — distinct
      // from the green .selected state so the two visuals layer cleanly.
      const movedEl = newList.querySelector(`.patch-item[data-slot="${effectiveToIdx}"]`);
      if (movedEl) {
        movedEl.classList.add('just-moved');
        setTimeout(() => movedEl.classList.remove('just-moved'), 850);
      }
    }
  }
}

// (swapAcrossBanks + performSwap removed 2026-05-24 along with the
// per-row ⇄ swap button. Custom Banks builder covers cross-bank
// cherry-picking with better UX. If a programmatic swap is ever needed
// again, recover from git history at SHA 3cc501e^.)

// ═══════════════════════════════════════════════════════════════
// Tape Memory: Save / Load
// ═══════════════════════════════════════════════════════════════

// (buildExportData removed 2026-05-26: it built a name-and-origin-
// preserving export shape that was replaced by the jPpS RIFF chunk
// approach in v0.5.11 — slot metadata now travels inside the WAV
// itself, so this separate JSON construction has zero callers.
// Flagged by ESLint's no-unused-vars and removed.)

// JSON load — restore an app-saved tape file. Custom names and origins
// round-trip via the file itself; for any slot the file leaves unnamed, we
// consult library.history by param fingerprint as a fallback.
function applyImportData(data, sourceLabel = null) {
  if (!data || !data.banks) throw new Error('invalid file: missing "banks"');
  ensureLibraryShape();
  activeBanksSourceLabel = sourceLabel;
  ['C', 'D'].forEach((bank) => {
    const bankIdx = bank === 'D' ? 1 : 0;
    const arr = data.banks[bank];
    if (!Array.isArray(arr)) return;
    arr.forEach((entry) => {
      if (!entry || typeof entry.slot !== 'number') return;
      const slot = entry.slot - 1;
      if (slot < 0 || slot >= 16) return;
      const meta = library.slotMeta[bank][slot];
      if (entry.params && patches && patches.banks && patches.banks[bankIdx]) {
        patches.banks[bankIdx][slot] = entry.params;
      }
      const fileName   = entry.name   || null;
      const fileOrigin = entry.origin || null;
      const remembered = lookupInHistory(entry.params);
      meta.name   = fileName   || (remembered && remembered.name)   || null;
      meta.origin = fileOrigin || (remembered && remembered.origin) || slotKey(bank, slot);
    });
  });
}

// jx3p output: { format_version, banks: [[16 patches], [16 patches]] }.
// A WAV import is a fresh tape dump — the JX-3P stores no names. For each
// incoming slot we look up the param fingerprint in library.history and
// restore the prior name/origin if seen before; otherwise the slot starts
// fresh with origin = current slot.
function applyWavData(data, sourceLabel = null, embeddedSlotMeta = null) {
  if (!data || !Array.isArray(data.banks) || data.banks.length < 2) {
    throw new Error('invalid jx3p output: expected banks: [[...], [...]]');
  }
  activeBanksSourceLabel = sourceLabel;
  patches = data;
  ensureLibraryShape();
  ['C', 'D'].forEach((bank) => {
    const bankIdx = bank === 'D' ? 1 : 0;
    library.slotMeta[bank].forEach((m, s) => {
      const params = patches.banks[bankIdx] && patches.banks[bankIdx][s];
      const remembered = lookupInHistory(params);
      // Name/origin resolution priority:
      //   1. Local fingerprint history (user's own remembered name for these
      //      params — wins so the user's own naming choices stick).
      //   2. Embedded slotMeta from the WAV's "jPpS" RIFF chunk (sender's
      //      name, when sharing a WAV between JP Patches users).
      //   3. Null (slot stays unnamed, just an "imported as X" placeholder).
      const embedded = embeddedSlotMeta && embeddedSlotMeta[bank] && embeddedSlotMeta[bank][s];
      m.name        = (remembered && remembered.name)   || (embedded && embedded.name)   || null;
      m.origin      = (remembered && remembered.origin) || (embedded && embedded.origin) || slotKey(bank, s);
      // Always refresh sourceLabel to reflect THIS import. Without this,
      // the per-slot label persists from whatever was previously loaded
      // (e.g. "Spils Sounds" stays stamped on slots even after they've
      // been overwritten by a different import) and the user sees a
      // misleading "imported as X from <stale library>" line.
      m.sourceLabel = sourceLabel || null;
      // jPpS v:2 chunk additions — preserve the original creator's
      // attribution + first-creation date across cross-user WAV trades.
      // Precedence: chunk wins for these (they're historical facts about
      // the file; the recipient's own remembered fingerprint history
      // doesn't carry them). Set only when the chunk has the field;
      // otherwise leave whatever the slot's previous value was.
      if (embedded && embedded.originalName)  m.originalName  = embedded.originalName;
      if (embedded && embedded.originLibrary) m.originLibrary = embedded.originLibrary;
      if (embedded && embedded.createdAt)     m.createdAt     = embedded.createdAt;
    });
  });
  // Fresh capture / import = fresh clean baseline for modified-indicator.
  snapshotCleanParamsAll();
  saveLibraryDebounced();   // persist new active state + slotMeta + clean baseline
}

// Each Tape Memory button is wired through setupHwButtons → handleTape*Save/
// handleTape*Load which dispatch to the per-data-type implementation below
// after a tape-vs-MIDI mode gate.

// ── Tone (patch bank) tape I/O ──────────────────────────────────────────
// Entry point for Tape Memory → Tone → Save (button 15 equivalent). Asks the
// user whether to import a pre-recorded WAV from disk or record a fresh
// tape dump directly from the JX-3P's audio output via the Mac's mic input.
function handleToneSave() {
  showFromJxChooserModal({
    kind: 'tone',
    onFile:   () => doToneSaveFromFile(),
    onRecord: () => showRecordFromJxModal({
      kind: 'tone',
      onCaptured: async (tempWavPath, deviceInfo) => {
        await applyToneCapture(tempWavPath, deviceInfo);
      },
    }),
  });
}

async function doToneSaveFromFile() {
  const result = await window.api.tapeSave();
  if (!result || !result.loaded) {
    if (result && result.error) console.error('Save (import) error:', result.error);
    return;
  }
  await applyToneResult(result, result.path);
}

// Reused by both the file-dialog Save and the live-record Save: takes the
// IPC decode result and applies it to the active C/D banks via applyWavData
// (or applyImportData for the JSON case). Optional labelOverride lets the
// caller substitute a friendlier source label than the raw filename (the
// record-from-JX flow uses this to avoid showing a gibberish temp path).
async function applyToneResult(result, sourcePath, labelOverride = null) {
  try {
    const label = labelOverride || labelFromPath(sourcePath);
    if (result.kind === 'wav') applyWavData(result.data, label, result.slotMeta);
    else                       applyImportData(result.data, label);
    saveLibraryDebounced();
    renderPatchList();
    updateSvgPatchName();
    updateAllControls(currentPatch());
    console.log(`Saved (imported) ${result.kind} from`, sourcePath);
  } catch (err) {
    console.error('Failed to apply imported data:', err.message);
  }
}

// Record-flow completion: decode the temp WAV produced by the record modal
// and route through the same applyToneResult path as the file-dialog flow.
// We pass a friendly label override so the slots' source line reads "from
// JX-3P tape capture" instead of the temp filename gibberish.
// deviceInfo carries { deviceId, deviceLabel } from the record modal so
// the recalibrate-prompt (fired on all-default decode) knows which device's
// saved gain to clear.
async function applyToneCapture(tempWavPath, deviceInfo) {
  const di = deviceInfo || {};
  const calGain = getCalibratedGain(di.deviceId, di.deviceLabel)?.gain ?? null;
  const result = await window.api.tapeSaveFromPath(tempWavPath);
  if (!result || !result.loaded) {
    logCaptureTelemetry({
      kind:         'tone',
      deviceLabel:  di.deviceLabel || null,
      gain:         calGain,
      capturePeak:  di.capturePeak ?? null,
      decode:       'error',
      errorMessage: (result && result.error) || 'unknown error',
    });
    showImportError(`Couldn't decode the captured audio: ${result && result.error || 'unknown error'}`);
    return;
  }
  const allDefault = isDecodeAllDefault(result.data);
  // Count populated patches (non-zero VCA Level across both banks).
  let populatedPatches = 0;
  try {
    const banks = result.data && result.data.banks;
    if (banks) {
      for (const bk of ['C', 'D']) {
        const arr = banks[bk];
        if (Array.isArray(arr)) {
          populatedPatches += arr.filter((p) => p && p.vca_level && p.vca_level !== 0).length;
        }
      }
    }
  } catch {}
  logCaptureTelemetry({
    kind:             'tone',
    deviceLabel:      di.deviceLabel || null,
    gain:             calGain,
    capturePeak:      di.capturePeak ?? null,
    decode:           allDefault ? 'all-null' : 'success',
    populatedPatches: populatedPatches,
  });
  if (allDefault) {
    showRecalibratePrompt({
      kind:        'tone',
      deviceId:    di.deviceId,
      deviceLabel: di.deviceLabel,
      capturePeak: di.capturePeak,
    });
    return;
  }
  const stamp = new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const label = `JX-3P tape capture · ${stamp}`;

  // Before applying, check if active C/D has unsaved edits and offer
  // the "Save and apply" rescue flow — mirrors the library-load path
  // in handleLoadLibraryBanks. Clean state (no modifications) applies
  // silently as before; modified state surfaces the 3-button choice so
  // the user can preserve their work before it's overwritten.
  const modifiedCount = countModifiedSlots();
  if (modifiedCount === 0) {
    await applyToneResult(result, tempWavPath, label);
    return;
  }

  // Modifications present — three-button rescue flow.
  const editLabel  = modifiedCount === 1 ? '1 unsaved edit' : `${modifiedCount} unsaved edits`;
  const deviceText = deviceInfo && deviceInfo.deviceLabel ? `*${deviceInfo.deviceLabel}*` : 'the JX-3P';
  showConfirmModal({
    title: 'Apply captured tape dump?',
    body:
      `Your active C/D banks have **${editLabel}**. The capture from ` +
      `${deviceText} decoded successfully — applying it will replace ` +
      'your current C/D banks.\n\n' +
      'Save them to the Library first, or apply directly to discard.',
    confirmLabel: 'Save and apply',
    confirmStyle: 'confirm',
    onConfirm: () => {
      showSaveAndContinueModal({
        defaultName: packageDefaultName(new Date()),
        onSaved: async (name) => {
          saveSnapshotInBackground(name);
          await applyToneResult(result, tempWavPath, label);
        },
        onCancelled: () => {},  // abandon — capture is discarded
      });
    },
    tertiaryLabel: 'Apply without saving',
    tertiaryStyle: 'alt',
    onTertiary: () => applyToneResult(result, tempWavPath, label),
  });
}

// Walk library.slotMeta and lazy-set originalName + createdAt on entries
// that don't have them — honors the "set once at first export, never
// overwritten" rule for the jPpS v:2 chunk's slotMeta fields. originalName
// is already populated for most slots via the package-load path (see line
// ~3815), this catches any that slipped through. createdAt is derived from
// the slot's origin package's createdAt when discoverable; else falls back
// to now (best-effort — older slots predating this field have no clear
// real creation timestamp, and the chunk surfacing "Created: today" is
// less misleading than no date at all).
function lazyMigrateSlotMetaForExport(slotMeta) {
  if (!slotMeta || typeof slotMeta !== 'object') return false;
  const packagesByLabel = new Map();
  const packages = (library && Array.isArray(library.packages)) ? library.packages : [];
  for (const pkg of packages) {
    if (!pkg) continue;
    const key = pkg.customName || pkg.defaultName;
    if (key) packagesByLabel.set(key, pkg);
  }
  const nowIso = new Date().toISOString();
  let dirty = false;
  for (const bank of ['C', 'D']) {
    const arr = slotMeta[bank] || [];
    for (const m of arr) {
      if (!m || typeof m !== 'object') continue;
      if (!m.originalName && m.name) {
        m.originalName = m.name;
        dirty = true;
      }
      if (!m.createdAt) {
        const pkg = m.originLibrary ? packagesByLabel.get(m.originLibrary) : null;
        m.createdAt = (pkg && pkg.createdAt) || nowIso;
        dirty = true;
      }
    }
  }
  return dirty;
}

async function handleToneLoad() {
  // SIMPLIFIED 2026-05-24: Always send the active C/D banks. The previous
  // behavior — sending a library package directly when one was selected in
  // the Library tab — caused cognitive ambiguity and bugs ("did I just
  // overwrite my import by loading a package, or am I sending the import?").
  // New model: active C/D banks = the single source of truth for transfer.
  // To send a library package, the user loads it INTO active first (one
  // click on the Library row's hover-LOAD button), then clicks Send. The
  // load step is undoable + auto-saves the previous active state so this
  // never destructively loses work.
  let exportData = patches;
  const label    = activeBanksSourceLabel || null;
  const slotMeta = library && library.slotMeta ? library.slotMeta : null;
  if (!exportData || !Array.isArray(exportData.banks) || exportData.banks.length < 2) {
    console.error('No patch data to export');
    return;
  }
  // Snapshot every named patch's current params → name mapping into history
  // before the data leaves the app. On a future re-import, matching params
  // will restore the name no matter what slot they come back in.
  recordAllNamedToHistory();
  saveLibraryDebounced();
  // Lazy-migrate originalName + createdAt on slotMeta entries — v0.6.5
  // jPpS v:2 chunk fields, set ONCE at first export, preserved across
  // recipient libraries forever after. See lazyMigrateSlotMetaForExport.
  if (slotMeta && lazyMigrateSlotMetaForExport(slotMeta)) {
    saveLibraryDebounced();
  }
  // Attach the slot metadata under a private key so main.js can pull it out
  // and embed it in the output WAV's RIFF "jPpS" chunk. The underscore
  // prefix marks it as our own extension; main.js strips it before passing
  // the bank JSON to jx3p (which would otherwise reject the extra field).
  if (slotMeta) exportData = { ...exportData, _slotMeta: slotMeta };
  showSendToJxModal(exportData, label);
}

// Two-step send-to-JX flow:
//   Step 1: setup instructions + "Send to JX-3P" button. Clicking it just
//           encodes the WAV in-app (no playback yet) and transforms the
//           modal into a ready-to-play state.
//   Step 2: a Play button. The user puts the JX into Tape Memory → Tone →
//           Load mode, THEN hits Play; the audio leaves the Mac at a moment
//           the JX is armed and waiting.
function showSendToJxModal(exportData, sourceLabel) {
  return showSendToJxFlow({
    exportData,
    sourceLabel,
    kind: 'patches',
    encodeApi: 'tapeEncodeToTemp',
    saveApi:   'tapeLoad',
    jxStep2:   'On the JX-3P click <span class="btn-hint">Tape Memory</span> → <span class="btn-hint">Load</span>, then hit Play below.<br><em>Make sure Memory Protect is off on the JX-3P.</em>',
    segments:  [
      { kind: 'init',    label: 'Init',    pilot: true  },
      { kind: 'bank-c',  label: 'Bank C',  pilot: false },
      { kind: 'divider', label: 'Divider', pilot: true  },
      { kind: 'bank-d',  label: 'Bank D',  pilot: false },
    ],
  });
}

function showSendSequenceToJxModal(exportData, sourceLabel) {
  return showSendToJxFlow({
    exportData,
    sourceLabel,
    kind: 'sequence',
    encodeApi: 'seqTapeEncodeToTemp',
    saveApi:   'seqTapeLoad',
    jxStep2:   'On the JX-3P click <span class="btn-hint">Tape Memory</span> → <span class="btn-hint">Load</span>, then hit Play below.<br><em>Make sure Memory Protect is off on the JX-3P.</em>',
    segments:  [
      { kind: 'init',     label: 'Init',     pilot: true  },
      { kind: 'sequence', label: 'Sequence', pilot: false },
    ],
  });
}

// Generic "send a tape dump to the JX-3P" flow. Step 1 shows setup
// instructions and a Send button; step 2 (after encoding) shows the timeline
// + Play; on completion, Done closes the modal. Used by both tone patches
// and sequencer dumps via thin wrappers above.
// ── Modal-construction helpers for showSendToJxFlow ────────────────
//
// Same pattern as the showRecordFromJxModal builders above: self-
// contained DOM construction that the modal assembles + wires events
// onto. Module-scope (hoisted) so they're callable from anywhere in
// app.js.

// (buildSendRow + buildSendStatusSection + buildSendActions moved to
// renderer/modal-builders.js for JSDOM testability. buildSendRow
// references buildJxKeyDiagram (defined further down in app.js) as a
// global at CALL time — works in production because both files load
// before any modal opens. Tests stub buildJxKeyDiagram before exercising
// buildSendRow.)

function showSendToJxFlow(opts) {
  const { exportData, sourceLabel, kind, encodeApi, saveApi, jxStep2, segments } = opts;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal send-jx-modal';

  const h = document.createElement('h2');
  h.className = 'modal-title';
  const fallback = kind === 'sequence' ? 'Send sequence to JX-3P' : 'Send C/D banks to JX-3P';
  // sourceLabel renders italicized (no quotes — typographic convention for
  // a name). Use innerHTML + escapeHtml so a malicious package name can't
  // inject markup; fallback is a known literal so it's safe as-is.
  if (sourceLabel) {
    h.innerHTML = `Send <em>${escapeHtml(sourceLabel)}</em> to JX-3P`;
  } else {
    h.textContent = fallback;
  }
  modal.appendChild(h);

  // Empty body element kept in DOM so enterPlayState (step 2) can populate
  // it with the "tape dump ready / press Load on JX / output device" copy.
  // Step 1 is intentionally bare — header + actions only (per 2026-05-24
  // design pass). Modal width also shrinks in step 1 via the absence of
  // the .step-2 class on .send-jx-modal (see style.css).
  const body = document.createElement('div');
  body.className = 'modal-body';
  modal.appendChild(body);

  // Cause→effect row (matches Record-from-JX layout pattern, defined in
  // docs/design-system.md §4.3). Construction in buildSendRow above.
  // (jxKeyDiagram lives inside sendRow now — no callsite needs the
  //  reference outside, so destructure-skip it with the _ prefix.)
  const { sendRow, sendArrow, sendJxLogo, jxKeyDiagram: _jxKeyDiagram } = buildSendRow(kind, sourceLabel);
  modal.appendChild(sendRow);

  // (Removed 2026-05-30: pre-play "First click JX buttons, then hit Play
  // below to initiate tape dump." instruction that used to fill the
  // cause→effect row's right slot in the .play-ready state. The body
  // copy ("On the JX-3P click [Tape Memory] → [Load], then hit Play
  // below.") + the title already convey this — the playReadyMsg was
  // duplicating instruction. The .play-ready / .playing state machine
  // still gates the JX-3P logo's reveal on the Play click.)

  // Output-device section — visual parallel to the Save modal's INPUT
  // DEVICE block (see record-jx-device-* in showRecordFromJxModal). Read-
  // only display of the system default output device, plus a hidden
  // "that's your built-in speakers" warning that shows when the resolved
  // default IS the Mac's own speakers (interface got unplugged → FSK
  // would blast the speakers and the JX would receive nothing).
  // Created here so the DOM order is title → instruction-body → sendRow
  // → outputDeviceSection → status(timeline). Hidden until step 2.
  const outputDeviceSection = document.createElement('div');
  outputDeviceSection.className = 'send-jx-device-section';
  outputDeviceSection.style.display = 'none';
  const outputDeviceLabel = document.createElement('label');
  outputDeviceLabel.className = 'send-jx-device-label';
  outputDeviceLabel.textContent = 'OUTPUT DEVICE:';
  // v0.7.0 (revised 2026-06-02): read-only display of the current cable
  // routing. Was an interactive picker earlier in v0.7.0 dev, but the
  // Audio Settings modal (gear icon) became the canonical place to set
  // this — keeping a picker here would be two surfaces for the same
  // library.cableOutputDeviceId. Display text resolves to the picked
  // device's label, or "(system default — <label>)" when unset.
  const outputDeviceDisplay = document.createElement('div');
  outputDeviceDisplay.id = 'send-jx-output-display';
  outputDeviceDisplay.className = 'send-jx-device-display';
  outputDeviceDisplay.textContent = 'checking…';
  outputDeviceSection.appendChild(outputDeviceLabel);
  outputDeviceSection.appendChild(outputDeviceDisplay);
  modal.appendChild(outputDeviceSection);

  // v0.7.0 safety net: if the current cable routing resolves to the
  // Mac's built-in speakers, disable Play + pop a warning modal pointing
  // the user at Audio Settings to fix it. Prevents the full-volume blast
  // that hits when setSinkId routes the FSK to the laptop speakers.
  // Discovered 2026-06-01 — see release notes for the full story.
  //
  // outputDevices is cached so the safety check can resolve the
  // current library.cableOutputDeviceId to a label without re-running
  // enumerateDevices on every check.
  let outputDevices = [];
  let safetyModalShown = false;     // only pop once per modal session
  // Effective routing analysis. Three states matter:
  //   - 'ok'      → saved device is present (or no save + system default
  //                 isn't speakers); Play allowed.
  //   - 'missing' → saved device set but unplugged; Play blocked — we
  //                 refuse to silently fall through to system default
  //                 (which could be speakers, regressing to the blast).
  //   - 'speakers'→ effective routing IS the built-in speakers; Play
  //                 blocked + warned about full-volume FSK risk.
  const analyzeRouting = () => {
    const saved = library.cableOutputDeviceId;
    if (saved) {
      const dev = outputDevices.find((d) => d.deviceId === saved);
      if (!dev) return { state: 'missing', savedLabel: library.cableOutputDeviceLabel || 'your saved device' };
      return { state: isBuiltInSpeakerOutput(dev.label) ? 'speakers' : 'ok' };
    }
    // No save — evaluate system default for the speakers risk.
    const def  = outputDevices.find((d) => d.deviceId === 'default') || outputDevices[0];
    const real = def && outputDevices.find((d) => d.deviceId !== 'default' && d.groupId && d.groupId === def.groupId);
    const label = (real && real.label) || (def && def.label) || '';
    return { state: isBuiltInSpeakerOutput(label) ? 'speakers' : 'ok' };
  };
  const applySafetyCheck = () => {
    const r = analyzeRouting();
    if (r.state === 'ok') {
      primaryBtn.disabled = false;
      safetyModalShown = false;
      return;
    }
    primaryBtn.disabled = true;
    if (safetyModalShown) return;
    safetyModalShown = true;
    if (r.state === 'speakers') {
      showConfirmModal({
        title: 'Heads up — your tape dump routing is your speakers',
        body:
          "Sending a tape dump to your Mac's built-in speakers will play the FSK at full volume — loud and unpleasant — and the JX-3P won't receive anything (it's not connected to your speakers). " +
          "Open Audio Settings (gear icon, top-right of the panel) and pick your audio interface under \"Tape dump routing.\"",
        confirmLabel: 'OK, got it',
        hideCancel: true,
        onConfirm: () => {},
      });
    } else {  // 'missing'
      showConfirmModal({
        title: 'Tape Dump device unavailable',
        body:
          `Your selected tape dump device ${r.savedLabel} isn't connected. ` +
          "Plug it back in, or open Audio Setting (gear icon, top-right of the panel) and pick a different device. " +
          "JP Patches won't fail back to your speakers (that would be painfully loud!). " +
          "Your last device is remembered—plug it back in to restore it.",
        confirmLabel: 'OK, got it',
        hideCancel: true,
        onConfirm: () => {},
      });
    }
  };

  // Per-segment timeline + indicator + status text. Construction in
  // buildSendStatusSection above. Hidden until enterPlayState (step 2).
  const { status, timeline, segs, indicator, statusText } = buildSendStatusSection(segments);
  modal.appendChild(status);

  // Tape Dump Sounds modal state. Declared here (before the mute toggle that
  // closes over tapeDumpMuted) to avoid a temporal-dead-zone error.
  //  - cableDeviceId: the real deviceId behind the system default output
  //    (resolved in enterPlayState), passed to the sound feature as the
  //    cable-exclusion guard so the parallel sound is never routed onto the
  //    device the transfer uses.
  //  - tapeDumpMuted: per-modal mute (session-local, no library write).
  let cableDeviceId = null;
  let tapeDumpMuted = false;

  // Tape-dump-sound control — label + info popover, then a mute-icon +
  // volume slider. Shown (in enterPlayState) only when tapeDumpSoundsEnabled.
  // The slider live-adjusts + persists library.transmissionSounds.volume;
  // the left speaker icon is a session mute (no library write); the info 'i'
  // toggles a popover whose "mute Tape Dump sounds" link disables the whole
  // feature (same as unchecking it in the View menu) and hides this control.
  const SPK   = '<polygon points="3 9 7 9 11 5 11 19 7 15 3 15" fill="currentColor" stroke="none"/>';
  const WAVE  = '<g class="snd-wave"><path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M17.5 7a7.5 7.5 0 0 1 0 10"/></g>';
  const SLASH = '<g class="snd-slash"><line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/></g>';
  const tdsSvg = (inner) =>
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';

  const tdsCtrl = document.createElement('div');
  tdsCtrl.className = 'send-jx-tds';
  tdsCtrl.style.display = 'none';
  // No "Tape Dump" header — that wording risked reading as the transfer
  // level going to the JX. Instead, a small cursive question under the
  // slider ("What does a tape dump sound like?") both labels the control as
  // a listen-only reference AND is the trigger for the info popover.
  tdsCtrl.innerHTML =
    '<div class="send-jx-tds-row">' +
      '<button type="button" class="send-jx-tds-mute" aria-label="Mute tape dump sound">' + tdsSvg(SPK + WAVE + SLASH) + '</button>' +
      '<input type="range" class="send-jx-tds-slider" min="0" max="1" step="0.01" aria-label="Tape dump sound volume">' +
      '<span class="send-jx-tds-volicon" aria-hidden="true">' + tdsSvg(SPK + WAVE) + '</span>' +
    '</div>' +
    '<button type="button" class="send-jx-tds-q" aria-label="What does my tape dump sound like?">' +
      'What does my tape dump sound like?' +
      '<svg class="send-jx-tds-iicon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
        '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
        '<line x1="8" y1="7.2" x2="8" y2="11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<circle cx="8" cy="4.7" r="0.95" fill="currentColor"/>' +
      '</svg>' +
    '</button>' +
    '<div class="send-jx-tds-pop" role="dialog" style="display:none">' +
      '<button type="button" class="send-jx-tds-pop-close" aria-label="Close">&times;</button>' +
      '<p>Does not affect data transfer to JX-3P—sound is for your reference.</p>' +
      "<p>Plays through your Mac's built-in speakers (check speaker volume if you hear nothing).</p>" +
    '</div>';
  status.appendChild(tdsCtrl);

  const tdsMute    = tdsCtrl.querySelector('.send-jx-tds-mute');
  const tdsSlider  = tdsCtrl.querySelector('.send-jx-tds-slider');
  const tdsQ       = tdsCtrl.querySelector('.send-jx-tds-q');
  const tdsPop     = tdsCtrl.querySelector('.send-jx-tds-pop');

  // Slider value v maps to volume v² (more resolution at low/quiet levels);
  // paint the filled portion of the track to match the thumb position.
  const paintSlider = () => {
    const pct = Math.round((parseFloat(tdsSlider.value) || 0) * 100);
    tdsSlider.style.background =
      `linear-gradient(to right, #f7f1e6 0%, #f7f1e6 ${pct}%, #5a2a20 ${pct}%, #5a2a20 100%)`;
  };
  tdsSlider.value = String(Math.sqrt(Math.max(0, Math.min(1, tapeDumpVolume))));
  paintSlider();

  const syncTdsMute = () => {
    tdsMute.classList.toggle('muted', tapeDumpMuted);
    tdsMute.title = tapeDumpMuted ? 'Unmute tape dump sound' : 'Mute tape dump sound';
    tdsMute.setAttribute('aria-pressed', String(tapeDumpMuted));
  };
  syncTdsMute();

  tdsMute.addEventListener('click', () => {
    tapeDumpMuted = !tapeDumpMuted;
    syncTdsMute();
    if (typeof setTapeDumpSoundMuted === 'function') setTapeDumpSoundMuted(tapeDumpMuted);
  });
  tdsSlider.addEventListener('input', () => {
    const v = parseFloat(tdsSlider.value) || 0;
    tapeDumpVolume = v * v;                       // quadratic → finer low-end control
    paintSlider();
    if (!library.transmissionSounds) library.transmissionSounds = {};
    library.transmissionSounds.volume = tapeDumpVolume;
    saveLibraryDebounced();
    if (typeof setTapeDumpSoundVolume === 'function') setTapeDumpSoundVolume(tapeDumpVolume);
  });
  tdsQ.addEventListener('click', () => {
    tdsPop.style.display = (tdsPop.style.display === 'none') ? '' : 'none';
  });
  tdsCtrl.querySelector('.send-jx-tds-pop-close').addEventListener('click', () => {
    tdsPop.style.display = 'none';
  });

  // Three-button actions row. Construction in buildSendActions above.
  // The primary button cycles through label states ("Send to JX-3P" →
  // "▶ Play" → "Done") as the flow progresses; modal wires events.
  const { actions, cancelBtn, saveBtn, primaryBtn } = buildSendActions();
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Active playback state.
  let audioEl = null;
  let tempPath = null;
  let progressTimer = null;
  let cancelled = false;
  // (cableDeviceId + tapeDumpMuted are declared earlier, above the mute
  // toggle that closes over them — see the Tape Dump Sounds state block.)

  // NOTE: We deliberately do NOT route the audio element through an
  // AudioContext + createMediaElementSource for Send-to-JX. That setup
  // hijacks the audio element's output routing through
  // AudioContext.destination — and if anything is off (suspended context,
  // edge-case browser bug), audio becomes silent even though currentTime
  // advances and the timeline animates. The result: timeline plays
  // through but the JX hears nothing. (Diagnosed 2026-05-24 — see
  // docs/future-features.md for the original analysis. Removed in favor
  // of timer-driven arrow pulse.)
  //
  // We don't need real audio analysis here anyway: the level meter that
  // used to consume the analyser data was replaced by the JX-3P logo, and
  // Mac volume is fixed at 100% per the setup instructions — there's
  // nothing for the user to monitor in real-time. The arrow pulse just
  // signals "audio is actively transmitting", which we know perfectly
  // well from audioEl's playing state without needing to tap the buffer.

  // Hot-plug listener handle — assigned when step 2 enters (registers
  // the listener), nulled in cleanup() (removes it). Hoisted above
  // cleanup() so the closure reference is unambiguous.
  let onDeviceChange = null;

  const cleanup = async () => {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    // Stop any parallel tape-dump sound (no-op if none playing / feature off).
    try { if (typeof stopTapeDumpSound === 'function') stopTapeDumpSound(); } catch {}
    // Detach the devicechange listener that was attached when step 2
    // entered. Leaving it dangling would leak per-modal-open + risk
    // calling refreshOutputDevices against a destroyed DOM.
    if (onDeviceChange) {
      try { navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange); } catch {}
      onDeviceChange = null;
    }
    if (audioEl) {
      try { audioEl.pause(); } catch {}
      audioEl.src = '';
      audioEl = null;
    }
    if (tempPath) {
      try { await window.api.tapeCleanupTemp(tempPath); } catch {}
      tempPath = null;
    }
  };

  const close = async () => {
    await cleanup();
    overlay.remove();
  };

  cancelBtn.addEventListener('click', async () => {
    cancelled = true;
    await close();
  });

  saveBtn.addEventListener('click', async () => {
    primaryBtn.disabled = true;
    saveBtn.disabled = true;
    const result = await window.api[saveApi](exportData);
    if (result && result.saved) {
      statusText.textContent = `Saved to ${result.path}`;
      saveBtn.textContent = 'Saved';
    } else if (result && result.error) {
      statusText.textContent = `Save failed: ${result.error}`;
      saveBtn.disabled = false;
    } else {
      saveBtn.disabled = false;
      primaryBtn.disabled = false;
    }
  });

  // Segment-duration math + indicator-position math both live in
  // renderer/send-timeline.js so they're unit-tested. The DOM mutation
  // (style.left + active-class toggle) stays inline below, driven by
  // the pure computeIndicatorPosition result.
  let segDurations = null;   // per-segment duration in seconds, indexed parallel to `segs`

  const applySegProportions = (durations) => {
    segs.forEach((s, i) => { s.el.style.flexGrow = String(Math.max(0.01, durations[i])); });
  };

  const updateIndicator = (currentSec) => {
    if (!segDurations) return;
    const { pct, activeIdx } = computeIndicatorPosition(currentSec, segDurations);
    indicator.style.left = `${pct}%`;
    segs.forEach((s, i) => s.el.classList.toggle('active', i === activeIdx));
  };

  // Step 2: arm the JX, then click Play to send the audio.
  const enterPlayState = (durationSec) => {
    // Bottom action row in step 2 is Cancel + "▶ Play" (Save WAV hidden).
    // The right slot of the cause→effect row carries the pre-play
    // instruction message instead of the trigger.
    primaryBtn.disabled = false;
    primaryBtn.textContent = '▶ Play';
    saveBtn.style.display = 'none';
    // Widen the modal for step 2 (timeline + sendRow need the room). Step 1
    // is a tighter shell — header + 3 buttons. See .send-jx-modal CSS.
    modal.classList.add('step-2');
    // Header from Step 1 carries through unchanged — it's already in the
    // `Send [thing] to JX-3P` family pattern AND preserves the source
    // label if one was provided (e.g. `Send "Spils Sounds" to JX-3P`).
    // (Historical: Step 2 used to override with "Ready to send sequence"
    // / "Ready to send patches" — dropped 2026-05-30 to (a) unify all
    // four modals in the Save/Send + Sequence/Tones matrix under the
    // same title pattern and (b) preserve the source label across steps.)
    // Body: just the primary instruction (jxStep2). The previous "transfer
    // takes about Xs / don't switch apps / generate audio" advisory was
    // dropped 2026-05-30 — the segmented timeline below already
    // communicates duration visually, and the "don't generate audio"
    // caveat reads as paranoid for a one-click flow. The output-device
    // label + speaker-warning moved into their own section between
    // sendRow and the timeline (see outputDeviceSection above).
    body.innerHTML = `<p>${jxStep2}</p>`;
    statusText.textContent = '';
    segDurations = computeSegDurations(durationSec, segs);
    applySegProportions(segDurations);
    timeline.style.display = '';
    // Reveal the cause→effect row (diagram + arrow + level meter) — step 2
    // is when the user actually needs to know which key to press and watch
    // the output level during playback.
    sendRow.style.display = '';
    outputDeviceSection.style.display = '';
    // Arm the row: reveals the big PLAY CTA + the (static) arrow pointing at
    // it, and hides the JX-3P logo until PLAY is pressed (startPlayback swaps
    // .play-ready → .playing).
    sendRow.classList.add('play-ready');
    // Surface the tape-dump-sound control only when the feature is on. Reset
    // the info popover to hidden each time we (re)enter the play state.
    tdsCtrl.style.display = tapeDumpSoundsEnabled ? '' : 'none';
    tdsPop.style.display = 'none';
    // v0.7.0 (revised 2026-06-02): refresh the read-only routing
    // display + caches from the current library.cableOutputDeviceId.
    // Initial call here; the devicechange listener (registered below)
    // re-invokes it on hot-plug / unplug while the modal is open.
    refreshOutputDevices();
    // Hot-plug handler: re-enumerate + re-render whenever the OS reports
    // a device change. Fixes the "unplug KT → 'unavailable, plug it
    // in!' display + Play disabled → plug KT back in → display still
    // stuck unavailable" trap Daniel hit 2026-06-02. Listener attached
    // only after step 2 enters (no point earlier — the display isn't
    // visible). Removed in cleanup().
    if (!onDeviceChange) {
      onDeviceChange = () => { refreshOutputDevices(); };
      try { navigator.mediaDevices.addEventListener('devicechange', onDeviceChange); } catch {}
    }
  };

  // Re-enumerate + repaint the output-device display + re-run the
  // safety check. Idempotent; called from enterPlayState's initial
  // setup AND from the devicechange listener.
  const refreshOutputDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      outputDevices = outputs;
      const displayEl = document.getElementById('send-jx-output-display');
      if (!displayEl) return;
      const def = outputs.find((d) => d.deviceId === 'default') || outputs[0];
      const saved = library.cableOutputDeviceId;
      const savedDev = saved && outputs.find((d) => d.deviceId === saved);
      // EFFECTIVE routing intent:
      //   - Saved device present: its label
      //   - Saved device missing: "X — unavailable, plug it in!" (NO
      //     silent fallback to system default — applySafetyCheck blocks
      //     Play in that state, per 2026-06-02 design call)
      //   - No save: system-default label
      const targetLabel = savedDev
        ? (savedDev.label || `(unnamed device ${saved.slice(0, 6)})`)
        : saved
          ? `${library.cableOutputDeviceLabel || 'your saved device'} — unavailable, plug it in!`
          : `(system default — ${(def && def.label) || 'unknown'})`;
      displayEl.textContent = targetLabel;
      // Resolve cableDeviceId for Tape Dump Sounds cable-exclusion.
      // When system default, resolve to the REAL device behind the
      // 'default' alias (same groupId) — that's the "cable" we must
      // never echo onto.
      if (savedDev) {
        cableDeviceId = savedDev.deviceId;
      } else {
        const realDefault = def && outputs.find((d) => d.deviceId !== 'default' && d.groupId && d.groupId === def.groupId);
        cableDeviceId = (realDefault && realDefault.deviceId) || (def && def.deviceId) || null;
      }
      applySafetyCheck();
    } catch {}
  };

  const startPlayback = async () => {
    primaryBtn.disabled = true;
    cancelBtn.textContent = 'Cancel';
    statusText.textContent = 'Playing…';
    // Swap the pre-play instruction out for the JX-3P logo: drop .play-ready
    // (hides the message, restores the logo slot) and add .playing (fades
    // the logo in, starts the arrow march). Done before play() so the visual
    // flips immediately on click even if play() takes a beat to resolve.
    sendRow.classList.remove('play-ready');
    // v0.7.0: pin transmission to the picked cable device. If null (user
    // hasn't picked), leave the audio element on its default sink (current
    // pre-v0.7 behavior = system default). Direct setSinkId call on the
    // audio element — no AudioContext / MediaElementSource needed (and
    // explicitly avoided per the comment block above; the rewire would
    // silence transmission audio).
    if (library.cableOutputDeviceId && typeof audioEl.setSinkId === 'function') {
      try {
        await audioEl.setSinkId(library.cableOutputDeviceId);
      } catch (err) {
        // setSinkId rejected (device gone, permission denied, etc.).
        // Don't abort — fall through to default routing rather than
        // failing the whole transfer. User will hear via Tape Dump Sounds
        // if enabled, OR catch it via the JX not receiving anything.
        console.warn('JP: setSinkId(cable) failed, using default sink:', err && err.message);
      }
    }
    try {
      await audioEl.play();
    } catch (err) {
      // Re-arm: restore the pre-play instruction so the user can retry.
      sendRow.classList.add('play-ready');
      primaryBtn.disabled = false;
      statusText.textContent = `Playback blocked: ${err.message}`;
      return;
    }
    // Tape Dump Sounds (View > Tape dump sounds; off by default).
    // Fire-and-forget the parallel low-volume FSK out the Mac speakers.
    // Fully isolated + silent-fail (separate <audio>, never the cable) —
    // not awaited so it can't delay or affect the transfer. Only fires
    // here, AFTER the transfer's own play() resolved, so sound ⇒ transfer.
    if (typeof maybePlayTapeDumpSound === 'function') {
      maybePlayTapeDumpSound({
        tempWavPath:   'file://' + tempPath,
        cableDeviceId,
        enabled:       tapeDumpSoundsEnabled,
        muted:         tapeDumpMuted,
        volume:        tapeDumpVolume,   // user-set via the modal slider, persisted

      });
    }
    // Arrow pulse driven by playback state — not audio analysis. As long
    // as the audio element is actively playing (not paused / ended), the
    // arrow pulses. Cleared by the 'ended' handler (which also sets the
    // .complete state) and by cleanup() on Cancel.
    sendArrow.classList.add('pulsing');
    // Reveal the transmission visuals — JX-3P "receiver" logo fades in,
    // arrow appears immediately with its marching dashes, and the JX key
    // diagram dims to 50% so attention shifts to the in-progress transfer.
    // Pre-Play state: only the diagram is visible (user is reading "press
    // these keys on the JX"). Once Play fires we've moved past instruction
    // into "transmission live" state.
    sendRow.classList.add('playing');
    progressTimer = setInterval(() => {
      if (!audioEl) return;
      updateIndicator(audioEl.currentTime || 0);
    }, 100);
  };

  // Step 1 → 2: the primary button cycles "Send to JX-3P" → "▶ Play" →
  // "Done". Step 1 encodes the WAV + hands off to enterPlayState; the play
  // state starts the transfer; done closes the modal.
  primaryBtn.addEventListener('click', async () => {
    if (primaryBtn.dataset.state === 'done') {
      await close();
      return;
    }
    if (primaryBtn.dataset.state === 'play') {
      startPlayback();
      return;
    }

    primaryBtn.disabled = true;
    saveBtn.disabled = true;
    statusText.textContent = 'Encoding…';

    const result = await window.api[encodeApi](exportData);
    if (cancelled) return;
    if (!result || !result.ok) {
      // Encoder errors (Python tracebacks, schema validation dumps) can be
      // huge. Take the first line and cap it so the modal doesn't blow up.
      const raw = (result && result.error) || 'unknown error';
      const firstLine = String(raw).split('\n')[0].slice(0, 200);
      statusText.textContent = `Encode failed: ${firstLine}`;
      primaryBtn.disabled = false;
      saveBtn.disabled = false;
      return;
    }
    tempPath = result.path;

    audioEl = new Audio('file://' + tempPath);
    audioEl.preload = 'auto';
    audioEl.volume = 1.0;          // defensive — never trust the default
    audioEl.muted = false;         // defensive — never trust the default

    audioEl.addEventListener('loadedmetadata', () => {
      enterPlayState(audioEl.duration);
      primaryBtn.dataset.state = 'play';
    });

    audioEl.addEventListener('ended', () => {
      if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
      indicator.style.left = '100%';
      // Mark every segment "active" so the whole bar lights up at completion.
      segs.forEach((s) => s.el.classList.add('active'));
      timeline.classList.add('complete');
      // Arrow goes solid (no dashed pattern, full opacity, no marching
      // animation) so the visual reads as "transmission done" rather
      // than "still transmitting". Drop the pulsing class first to stop
      // the dash-flow animation; add complete to swap to a solid line.
      sendArrow.classList.remove('pulsing');
      sendArrow.classList.add('complete');
      // Mirror the freeze on the "loading: {package}" label below the
      // JX-3P logo — the shimmer effect on the package name lives in
      // CSS keyed on parent .playing class and a .complete class on
      // the label itself. See style.css `.record-jx-package-label`.
      // Also swap the prefix verb "loading:" → "complete:" so the label
      // confirms the transfer ended (rather than reading as still
      // in-progress because it kept the active-state verb).
      const sendLabelEl = sendJxLogo.querySelector('.record-jx-package-label');
      if (sendLabelEl) {
        sendLabelEl.classList.add('complete');
        const prefixEl = sendLabelEl.querySelector('.record-jx-package-label-prefix');
        if (prefixEl) prefixEl.textContent = '✓ complete:';
      }
      statusText.textContent = '✓ Complete. Check your JX for confirmation.';
      // "▶ Play" becomes "Done" — the only remaining action closes the modal.
      primaryBtn.textContent = 'Done';
      primaryBtn.disabled = false;
      primaryBtn.dataset.state = 'done';
      cancelBtn.style.display = 'none';
    });

    audioEl.addEventListener('error', () => {
      statusText.textContent = 'Playback error. Try Save WAV file instead.';
      primaryBtn.disabled = false;
      saveBtn.disabled = false;
      saveBtn.style.display = '';
    });
  });
}

// ── Sequencer mode ─────────────────────────────────────────────────────
// Save: prompt for the sequencer-dump WAV file, decode it via the bundled
// jx3p tool, then show the save modal so the user can attach an optional
// note before persisting to library.sequences[]. The paired patch is
// auto-captured from the active selection at save time (not surfaced to the
// user). The new entry's default name is the source WAV's filename.

function handleSequencerSave() {
  if (!activeBankPatch()) {
    console.warn('No active patch to pair with a sequence entry');
    return;
  }
  showFromJxChooserModal({
    kind: 'sequence',
    onFile:   () => doSequencerSaveFromFile(),
    onRecord: () => showRecordFromJxModal({
      kind: 'sequence',
      onCaptured: async (tempWavPath, deviceInfo) => {
        await applySequencerCapture(tempWavPath, deviceInfo);
      },
    }),
  });
}

async function doSequencerSaveFromFile() {
  const result = await window.api.seqTapeSave();
  if (!result || !result.loaded) {
    if (result && result.error) console.error('Sequencer save (import) error:', result.error);
    return;
  }
  presentSequenceSaveModal(result.data, result.path, result.sequenceMeta || null);
}

async function applySequencerCapture(tempWavPath, deviceInfo) {
  const di = deviceInfo || {};
  const calGain = getCalibratedGain(di.deviceId, di.deviceLabel)?.gain ?? null;
  const result = await window.api.seqTapeSaveFromPath(tempWavPath);
  if (!result || !result.loaded) {
    logCaptureTelemetry({
      kind:         'sequence',
      deviceLabel:  di.deviceLabel || null,
      gain:         calGain,
      capturePeak:  di.capturePeak ?? null,
      decode:       'error',
      errorMessage: (result && result.error) || 'unknown error',
    });
    showImportError(`Couldn't decode the captured sequence: ${result && result.error || 'unknown error'}`);
    return;
  }
  const pages = (result.data && Array.isArray(result.data.pages)) ? result.data.pages : null;
  const isAllNullPages = pages && pages.every((p) => p == null);
  const populatedPages = pages ? pages.filter((p) => p != null).length : 0;
  logCaptureTelemetry({
    kind:           'sequence',
    deviceLabel:    di.deviceLabel || null,
    gain:           calGain,
    capturePeak:    di.capturePeak ?? null,
    decode:         isAllNullPages ? 'all-null' : 'success',
    populatedPages: populatedPages,
  });
  if (isAllNullPages) {
    showRecalibratePrompt({
      kind:        'sequence',
      deviceId:    di.deviceId,
      deviceLabel: di.deviceLabel,
      capturePeak: di.capturePeak,
    });
    return;
  }
  // Pass null for sourcePath — the temp WAV's filename (jp_seq_record_
  // {timestamp}) would otherwise leak through labelFromPath() as the
  // initial sequence name. Null forces the fallback to
  // sequenceDefaultName(new Date()) which gives a human-readable
  // "Sequence June 1, 2026" instead.
  // Record-from-JX captures never have a sequenceMeta chunk (the JX
  // doesn't embed RIFF chunks), so we pass null.
  presentSequenceSaveModal(result.data, null, null);
}

// Shared post-decode handler: opens the Save Sequence modal for naming +
// optional note, then persists to library.sequences[]. Used by file-
// dialog Save, the live-record Save, and (separately) the drag-drop
// import path which calls showSaveSequenceModal directly with the same
// shape.
//
// sequenceMeta carries the jPpS v:2 chunk fields (customName, originalName,
// createdAt, patchNote, pairedPatch) when the imported WAV came from
// another JP Patches user. Null when not present.
function presentSequenceSaveModal(tapeData, sourcePath, sequenceMeta) {
  showSaveSequenceModal({
    tapeData,
    sourcePath,
    sequenceMeta,
    onConfirm: ({ patchNote, defaultName, customName }) => {
      saveSequenceEntry({
        tapeData,
        patchNote,
        defaultName,
        customName,
        sequenceMeta,
      });
    },
  });
}

// Summarize the decoded tape data for the "Captured" line in the save modal.
function summarizeSeqTape(data) {
  const pages = (data && Array.isArray(data.pages)) ? data.pages : [];
  let pagesWithContent = 0;
  let activeSteps = 0;
  pages.forEach((page) => {
    if (!Array.isArray(page)) return;
    pagesWithContent += 1;
    page.forEach((step) => {
      if (step && Array.isArray(step.voices) && step.voices.some((v) => v != null)) {
        activeSteps += 1;
      }
    });
  });
  return { pagesWithContent, activeSteps };
}

function showSaveSequenceModal({ tapeData, sourcePath, sequenceMeta, onConfirm }) {
  const summary = summarizeSeqTape(tapeData);
  // Pre-fill the name field with (in priority order):
  //   1. customName from jPpS v:2 chunk — the original creator's name, when
  //      the imported WAV came from another JP Patches user
  //   2. labelFromPath(sourcePath) — filename minus extension, for plain
  //      WAV files (no chunk) that the user dropped in or opened
  //   3. sequenceDefaultName(...) — the JP_sequence_N counter fallback
  // Track the initial value so we can tell whether the user actually edited
  // it — if not, we store an empty customName so the entry stays cleanly
  // chunk/file/default-named with no redundant override.
  const initialName = (sequenceMeta && sequenceMeta.customName)
    || labelFromPath(sourcePath)
    || sequenceDefaultName(new Date());

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal seq-save-modal';

  const h = document.createElement('h2');
  h.className = 'modal-title';
  h.textContent = 'Save Sequence to Library';

  const captured = document.createElement('div');
  captured.className = 'seq-modal-captured';
  captured.textContent =
    `Captured sequence with ${summary.activeSteps} step${summary.activeSteps === 1 ? '' : 's'}`;

  // Name section — pre-filled, editable. Stays single-line.
  const nameSec = document.createElement('div');
  nameSec.className = 'seq-modal-section';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'NAME:';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'seq-modal-name';
  nameInput.maxLength = 60;
  nameInput.spellcheck = false;
  nameInput.autocomplete = 'off';
  nameInput.value = initialName;
  nameSec.appendChild(nameLabel);
  nameSec.appendChild(nameInput);

  // Patch note section.
  const noteSec = document.createElement('div');
  noteSec.className = 'seq-modal-section';
  const noteLabel = document.createElement('label');
  noteLabel.textContent = 'ADD NOTES (optional):';
  const noteInput = document.createElement('textarea');
  noteInput.className = 'seq-modal-note';
  noteInput.rows = 2;
  noteInput.maxLength = 200;
  noteInput.placeholder = 'e.g. tempo at 40%, turn Attack knob for drama!';
  // Pre-fill note from the jPpS v:2 chunk if the import carried one (the
  // original creator's annotation). User can edit before saving.
  if (sequenceMeta && sequenceMeta.patchNote) noteInput.value = sequenceMeta.patchNote;
  noteSec.appendChild(noteLabel);
  noteSec.appendChild(noteInput);

  // Actions.
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'modal-btn modal-btn-confirm';
  saveBtn.textContent = 'Save Sequence';
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  modal.appendChild(h);
  modal.appendChild(captured);
  modal.appendChild(nameSec);
  modal.appendChild(noteSec);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', () => {
    const finalName = nameInput.value.trim();
    // If the user didn't change the name (or cleared it back to the default),
    // store an empty customName so the entry reads as the filename alone.
    // Otherwise the user's edit becomes the customName override.
    const customName = (finalName && finalName !== initialName) ? finalName : '';
    onConfirm({
      patchNote: noteInput.value.trim(),
      defaultName: initialName,
      customName,
    });
    close();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  // Focus the note input so the user can start adding annotations
  // immediately. The pre-filled name is visible; user can click in to edit.
  setTimeout(() => noteInput.focus(), 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Record-from-JX (in-app tape capture)
// ═══════════════════════════════════════════════════════════════════════════
//
// Two-step flow that mirrors the Send-to-JX modal but in the opposite
// direction. Triggered by Tape Memory → Tone/Sequencer → Save:
//
//   Step 1 (chooser): a tiny modal asks whether the user wants to import
//                     a pre-recorded WAV from disk OR record a fresh tape
//                     dump live from the JX-3P's audio output. Either branch
//                     ends up calling the same per-kind decoder pipeline.
//   Step 2 (record):  for the record branch, a modal with input-device
//                     picker + level meter + Record/Stop button. Captures
//                     raw PCM via Web Audio, ships to main for WAV writing,
//                     then hands the temp WAV path to the caller's onCaptured
//                     handler (which routes through the existing decode flow).

function showFromJxChooserModal({ kind, onFile, onRecord }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const h = document.createElement('h2');
  h.className = 'modal-title';
  h.textContent = kind === 'sequence'
    ? 'Save Sequence from JX-3P'
    : 'Save Patches from JX-3P';
  modal.classList.add('capture-source-chooser-modal');

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.style.textAlign = 'center';
  body.innerHTML = kind === 'sequence'
    ? `<p>Where's your sequencer-dump WAV coming from?</p>`
    : `<p>Where's your tape-dump WAV coming from?</p>`;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  const fileBtn = document.createElement('button');
  fileBtn.className = 'modal-btn modal-btn-alt';      // Roland blue — alternative path to the same goal
  fileBtn.textContent = 'Open WAV file…';
  fileBtn.title = 'Use a WAV you already recorded outside the app';
  const recBtn = document.createElement('button');
  recBtn.className = 'modal-btn modal-btn-confirm';
  recBtn.textContent = '🎤 Record from JX-3P';
  recBtn.title = 'Capture the JX-3P\'s tape audio directly through your Mac\'s input';
  actions.appendChild(cancelBtn);
  actions.appendChild(fileBtn);
  actions.appendChild(recBtn);

  modal.appendChild(h);
  modal.appendChild(body);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  cancelBtn.addEventListener('click', close);
  fileBtn.addEventListener('click', () => { close(); onFile(); });
  recBtn.addEventListener('click',  () => { close(); onRecord(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
}

// (Modal-construction helpers buildRecordTimelineSection +
// buildRecordActions moved to renderer/modal-builders.js for JSDOM
// testability. Loaded as a <script> before this file; available as
// globals at call time. Tests in test/modal-builders.test.js.)

// initialGain (optional): seed the gain slider with this value when
// entering calibration mode (no saved cal exists). Used by the
// Recalibrate flow to preserve the user's prior calibrated gain as
// the starting point, instead of resetting to 1.0× and forcing them
// to manually re-find the ballpark. Ignored when a saved calibration
// exists for the selected device (capture mode uses cal.gain directly).
async function showRecordFromJxModal({ kind, onCaptured, initialGain = null }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal record-jx-modal';

  const h = document.createElement('h2');
  h.className = 'modal-title';
  h.textContent = kind === 'sequence'
    ? 'Record Sequence from JX-3P'
    : 'Record Patches from JX-3P';

  // Close X in the modal's upper-right corner. Replaces the Cancel
  // button in the bottom actions row (removed 2026-05-26 to reclaim
  // vertical space). aria-label for screen readers; the visible glyph
  // is a thin × that reads as "close" without competing for attention.
  // Click handler wired further down once `close()` is defined.
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close-x';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';   // multiplication sign — visually crisper than ASCII 'x'

  // The modal opens already capturing; instructions reflect that.
  const instr = document.createElement('div');
  instr.className = 'record-jx-instr';
  // "Tape Memory → Save" is the actual JX-3P key-press sequence (mode
  // key + save key). The Tone-vs-Sequencer sub-mode is conveyed visually
  // by the diagram's bottom pill ("Tone" or "Sequencer"), so the copy
  // doesn't need to spell it out and can stay identical for both modes.
  // Each button name is wrapped in `.btn-hint` (a faint outlined pill)
  // so it visually reads as a button command rather than plain text.
  const jxSaveLabel = '<span class="btn-hint">Tape Memory</span> → <span class="btn-hint">Save</span>';
  instr.innerHTML =
    `<p style="margin: 0;">Recording — press <b>${jxSaveLabel}</b> on the JX-3P now. ` +
    `Click <b>■ Stop</b> when the transmission finishes (~30–45 s).</p>`;

  const deviceSection = document.createElement('div');
  deviceSection.className = 'record-jx-section';

  // Two-element sample-rate notice. Both elements hidden on the happy
  // path (device IS at 44.1 — no nagging), both revealed when mismatched.
  //
  //   Row 1 (deviceHeaderRow):
  //     INPUT DEVICE: [left]   ·   JP Patches prefers 44.1kHz [right, FLASHING]
  //   Row 2 (devicePickerRow):
  //     <select> [grows]                              ·   48kHz [right, italic amber]
  //
  // The FLASH on the preferred-text is the warning signal — italic amber
  // is informational on its own, the pulse turns it into "fix me." The
  // rate readout next to the picker tells the user what their device
  // IS at so they don't have to switch to Audio MIDI Setup just to
  // diagnose. Amber `#c39a3a` matches the design-system "approaching
  // limit" token.
  const deviceHeaderRow = document.createElement('div');
  deviceHeaderRow.className = 'record-jx-device-header';
  const deviceLabel = document.createElement('label');
  deviceLabel.textContent = 'INPUT DEVICE:';
  const devicePreferred = document.createElement('span');
  devicePreferred.className = 'record-jx-device-preferred';
  devicePreferred.textContent = 'JP Patches prefers 44.1kHz';
  devicePreferred.hidden = true;
  deviceHeaderRow.appendChild(deviceLabel);
  deviceHeaderRow.appendChild(devicePreferred);
  deviceSection.appendChild(deviceHeaderRow);

  // Picker wrap: <select> with an absolutely-positioned actual-rate
  // overlay sitting just inside the native chevron, right-justified.
  // pointer-events: none on the overlay so clicks pass through to the
  // picker. Background-color on the overlay matches the picker so a
  // long device name visually clips behind the readout cleanly rather
  // than reading through.
  const devicePickerWrap = document.createElement('div');
  devicePickerWrap.className = 'record-jx-device-picker-wrap';
  const devicePicker = document.createElement('select');
  devicePicker.className = 'record-jx-device';
  const deviceActual = document.createElement('span');
  deviceActual.className = 'record-jx-device-actual';
  deviceActual.hidden = true;
  devicePickerWrap.appendChild(devicePicker);
  devicePickerWrap.appendChild(deviceActual);
  deviceSection.appendChild(devicePickerWrap);

  // (Removed 2026-05-24: meterSection / meterLabel / meterOuter /
  // meterTarget / meterBar / meterHint / fskPeakBadge. The new calRow
  // layout above contains the SVG vertical level meter that replaced all
  // of these. The horizontal HTML meter + FSK-peak badge + meter-hint
  // text were already display:none in both calibration and capture
  // modes — pure dead weight. Removed in the focused cleanup pass.)

  // Calibration-mode dump-progress bar. Sits under the level meter,
  // visible only when isCalibrating is true. Fills as cumulative FSK
  // signal accumulates against the expected dump duration; reaching the
  // end (or detecting silence-after-signal early) triggers the
  // calibration auto-stop. Gives the user clear "wait — the JX is still
  // transmitting, don't click anything" feedback while they adjust gain.
  const calProgressSection = document.createElement('div');
  calProgressSection.className = 'record-jx-section record-jx-cal-progress-section';
  const calProgressLabel = document.createElement('label');
  calProgressLabel.textContent = 'DUMP PROGRESS:';
  const calProgressOuter = document.createElement('div');
  calProgressOuter.className = 'record-jx-cal-progress-outer';
  const calProgressBar = document.createElement('div');
  calProgressBar.className = 'record-jx-cal-progress-bar';
  calProgressOuter.appendChild(calProgressBar);
  const calProgressHint = document.createElement('div');
  calProgressHint.className = 'record-jx-cal-progress-hint';
  calProgressHint.textContent = 'Calibration auto-advances when this fills. Sit tight while the JX transmits.';
  calProgressSection.appendChild(calProgressLabel);
  calProgressSection.appendChild(calProgressOuter);
  calProgressSection.appendChild(calProgressHint);
  // Expected total signal duration (cumulative FSK time) per kind. This
  // value is the upper-bound budget for the `totalSignalMs >= EXPECTED`
  // auto-stop trigger — set it ABOVE the worst-case real dump length so
  // the silence-after-dump trigger (a) reliably wins for normal captures
  // and (c) only fires as a backstop for genuinely too-long dumps. The
  // calibration progress bar uses this value as its denominator too, so
  // overshoot just means the bar fills slowly before snapping to 100 %
  // at end-of-dump.
  //
  // Both formats are content-variable because `_AUDIO_BIT_ONE = 50`
  // samples vs `_AUDIO_BIT_ZERO = 11` samples in jx3p/codec.py — a 4.5×
  // wall-clock difference per bit. Default/empty bytes encode mostly to
  // 1-bits, pushing dumps toward the long end.
  //
  // Tones: 2 pilots + 2 bank-data sections (each bank = 32 patches ×
  //   2 redundancy = 64 records). Range ~25 s (dense-zeros worst case)
  //   to ~58 s (sparse/default banks, mostly ones). Real captures
  //   typically land 30–45 s. Budget 50 s covers the common heavy case;
  //   safety timeout (+6 s) = 56 s covers near-worst-case content.
  //   Bug history: was 33000 ms — fine for content-dense captures
  //   (Daniel's 29.89 s successful capture), but truncated default-
  //   heavy banks by ~5–15 s → "decoding often fails" symptom.
  //
  // Sequences: 1 pilot + 16 records (8 pages × 2 redundancy) + 16
  //   separators. Range ~6 s to ~28 s. Spils Sequence (3 populated /
  //   5 empty pages) = 27.65 s. Budget 30 s covers worst-case content;
  //   safety = 36 s. Bug history: was 21000 ms, chopped Daniel's
  //   sequence dump at ~18 s → 0/8 pages decoded.
  // Tone budget tightened 2026-05-26 from 60 000 → 50 000. The 60 s
  // value was set defensively with no empirical basis. Real-world
  // tone dumps measured at 25 s (Daniel, 2026-05-26); toolkit worst-
  // case math gives ~37 s for an all-ones bit pattern (extremely
  // unrealistic). 50 s preserves 13 s of margin above that theoretical
  // worst case while bounding the modal-open time in the "loud JX
  // post-dump tone" case (where silence-after-signal can't fire
  // because peak stays above signalThreshold). If a user reports
  // their long heavy-content dump getting cut off mid-transmission,
  // bump back up.
  const EXPECTED_SIGNAL_MS = kind === 'sequence' ? 30000 : 50000;

  // Input gain — software multiplier applied between the mic source and
  // both the meter and the capture buffer. Lets the user crank up a quiet
  // signal in real time and watch the meter respond. Mathematically the
  // same as boosting in post (the auto-boost in jx3p does that), so this
  // doesn't *improve* SNR on its own — but it's a useful diagnostic and
  // helps users who want headroom-clean captures (boost in JS at higher
  // precision than int16 truncation will allow on a tiny-amplitude WAV).
  const gainSection = document.createElement('div');
  gainSection.className = 'record-jx-section';
  const gainLabel = document.createElement('label');
  gainLabel.textContent = 'INPUT GAIN:';
  const gainRow = document.createElement('div');
  gainRow.className = 'record-jx-gain-row';
  const gainSlider = document.createElement('input');
  gainSlider.type  = 'range';
  gainSlider.min   = '0';   // log scale below
  gainSlider.max   = '100';
  gainSlider.value = '20';  // ~1× at slider=20 (see mapping below)
  gainSlider.className = 'record-jx-gain-slider';
  const gainValueLabel = document.createElement('span');
  gainValueLabel.className = 'record-jx-gain-value';
  gainValueLabel.textContent = '1.0×';
  gainRow.appendChild(gainSlider);
  gainRow.appendChild(gainValueLabel);
  gainSection.appendChild(gainLabel);
  gainSection.appendChild(gainRow);

  // Slider position → linear gain mapping. Log scale so the lower half
  // covers 0.1×–1.0× (attenuation) and the upper half covers 1×–30×
  // sliderToGain / gainToSlider / formatGain — these used to be defined
  // inline here as closures. They now live in renderer/calibration-math.js
  // (loaded as a global script before app.js) and are unit-tested in
  // test/calibration-math.test.js. The inline closures were removed in
  // 2026-05-24 cleanup after confirming no closure dependency.

  // Structure timeline — reuses the .send-jx-* classes from the export modal
  // so the visual matches. Static reference during recording; all segments
  // light up green on successful capture (the "complete" treatment).
  // Construction lives in buildRecordTimelineSection above for navigability.
  // timelineHeader is a flex row with the "WHAT THE JX-3P SENDS:" label
  // on the left — we drop statusText into it (below) so the elapsed-time
  // counter sits to the right of that label, visually tied to the
  // segmented bar it describes.
  const { timelineSection, timelineHeader, timeline, segs, indicator } = buildRecordTimelineSection(kind);

  const statusText = document.createElement('div');
  statusText.className = 'record-jx-status';
  statusText.textContent = '';
  timelineHeader.appendChild(statusText);

  // Stop button (legacy; kept as invisible chrome for state-management
  // toggles below). Cancel was replaced by the close-X up top.
  // Construction in buildRecordActions; Stop is pre-disabled and enabled
  // after getUserMedia resolves (see startRecording).
  const { actions, stopBtn } = buildRecordActions();

  // Visual JX-3P key-sequence guide — sits right under the instruction
  // copy so the user reads "Press Save on the JX-3P" and immediately sees
  // exactly which key that is. Same diagram for calibration + capture
  // (both want the user to press Tape Memory → 14/Save).
  const jxKeyDiagram = buildJxKeyDiagram({ action: 'save', kind });

  // Calibration row — only visible in pass-1 (CALIBRATING) mode. Lays the
  // key diagram, an arrow, and the gain knob + vertical level meter on a
  // single horizontal row. The arrow pulses while FSK signal is detected
  // (class .pulsing toggled by tickMeter when fskStartMs has fired).
  // This re-uses jxKeyDiagram as its left column rather than building a
  // second copy — we DETACH it from the modal-level slot below when in
  // calibration mode and re-parent under calRow.
  const calRow = document.createElement('div');
  calRow.className = 'record-jx-cal-row';
  const calArrow = document.createElement('div');
  calArrow.className = 'record-jx-cal-arrow';
  calArrow.innerHTML =
    `<svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto;">` +
      `<line x1="4" y1="20" x2="62" y2="20" stroke="#ffffff" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round"/>` +
      `<polygon points="62,12 62,28 76,20" fill="#ffffff"/>` +
    `</svg>`;
  const calCard = document.createElement('div');
  calCard.className = 'record-jx-cal-card';
  const calGainCol = document.createElement('div');
  calGainCol.className = 'record-jx-cal-col cal-gain-col';
  const calGainLabel = document.createElement('div');
  calGainLabel.className = 'record-jx-cal-col-label';
  calGainLabel.textContent = 'Input Gain';
  const gainKnob = buildInputGainKnob({
    initialGain: 1.0,
    onChange: (newGain) => {
      // Mirror the knob's value back into the legacy gainSlider so the
      // calibration math (which reads sliderToGain(gainSlider.value)) and
      // the audio gain node stay in sync. We don't fire an 'input' event
      // because the slider's listener already updates gainNode — instead
      // we update both manually to avoid double-application.
      const sliderPos = gainToSlider(newGain);
      gainSlider.value = String(sliderPos);
      gainValueLabel.textContent = formatGain(newGain);
      if (gainNode) gainNode.gain.value = newGain;
      // Reset the running FSK-peak measurement when the user adjusts the
      // knob. Otherwise a transient clipping spike (e.g. dialed up too
      // far for a fraction of a second before backing off) would stay
      // baked into fskPeak forever, inflating measurePeak in the
      // calibration math and producing a pass-2 gain that's too low.
      // After reset, fskPeak tracks the max since the latest dial-in,
      // which is what the user actually intends.
      fskPeak = 0;
    },
  });
  calGainCol.appendChild(calGainLabel);
  calGainCol.appendChild(gainKnob);
  const calMeterCol = document.createElement('div');
  calMeterCol.className = 'record-jx-cal-col';
  const vmeter = buildVerticalLevelMeter();
  const calMeterLabel = document.createElement('div');
  calMeterLabel.className = 'record-jx-cal-col-label';
  calMeterLabel.textContent = 'Level';
  calMeterCol.appendChild(vmeter);
  calMeterCol.appendChild(calMeterLabel);
  calCard.appendChild(calGainCol);
  calCard.appendChild(calMeterCol);
  // JP Patches "receiver" logo — visible only in capture mode (STEP 2),
  // positioned between the arrow and the meter card. Visually completes
  // the cause→effect story: JX-3P keys (left) → data flowing (arrow) →
  // received by JP Patches (logo) → level visualized (meter on right).
  // Hidden in calibration mode because calibration is about measuring,
  // not about sending data into the app.
  const jpLogoEl = document.createElement('div');
  jpLogoEl.className = 'record-jx-jp-logo';
  // Auto-default name preview: shown below the JP logo as "saving: {name}"
  // so the user sees what package will be created. Same string the post-
  // capture handler assigns (see applyToneCapture / presentSequenceSaveModal).
  // Computed once at modal open; the actual save stamp may differ by a few
  // seconds, which is fine — the user can rename in the Library tab.
  const previewName = (kind === 'sequence')
    ? sequenceDefaultName(new Date())
    : `JX-3P tape capture · ${new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  jpLogoEl.innerHTML =
    `<img src="assets/jp-logo.png" alt="JP Patches" draggable="false"/>` +
    `<div class="record-jx-package-label">` +
      `<div class="record-jx-package-label-prefix">saving:</div>` +
      `<div class="record-jx-package-label-name"></div>` +
    `</div>`;
  // Use textContent on the name node so user data can't inject HTML.
  jpLogoEl.querySelector('.record-jx-package-label-name').textContent = previewName;
  // jxKeyDiagram will be re-parented INTO calRow in calibration mode,
  // and put back at modal level for capture mode. Start with the
  // calibration arrangement (most common first-time use).
  // DOM order: diagram, arrow, jpLogo, card. CSS does the visual ordering:
  //   Calibration (Step 1): default flex direction — [diagram, arrow, card]
  //     with jpLogo hidden. Diagram on LEFT, knob+meter on RIGHT.
  //   Capture (Step 2): flex-direction: row-reverse (scoped to record-jx-modal)
  //     — visual becomes [jpLogo, arrow, diagram] with card hidden. JP logo
  //     LEFT, diagram RIGHT, arrow points LEFT (scaleX flip via CSS).
  //     Matches Daniel's "JP Patches is receiving data → JP logo left,
  //     buttons right, arrow toward the destination" mockup.
  calRow.appendChild(jxKeyDiagram);
  calRow.appendChild(calArrow);
  calRow.appendChild(jpLogoEl);
  calRow.appendChild(calCard);

  // closeBtn first so it's the topmost positioned child — anchored to
  // the upper-right corner via .modal-close-x in CSS (position: absolute).
  modal.appendChild(closeBtn);
  modal.appendChild(h);
  modal.appendChild(instr);
  modal.appendChild(calRow);          // calibration layout — visibility toggled
  // (statusText is mounted INSIDE timelineSection's header row — see the
  // buildRecordTimelineSection call above. The elapsed-time counter +
  // warning messages now sit to the right of "WHAT THE JX-3P SENDS:",
  // visually tying the status to the segmented bar it describes.)
  modal.appendChild(deviceSection);
  // calProgressSection inserted between deviceSection and timelineSection
  // by configureForCurrentDevice (visible in calibration mode, hidden in
  // capture). Lives at modal level since meterSection was removed.
  modal.appendChild(gainSection);
  modal.appendChild(timelineSection);

  // Tape Dump Sounds state — MUST be declared before the tdsCtrl block
  // below, because the initial syncTdsMuteRec() call reads tapeDumpMuted
  // synchronously during modal construction. Mirrors the Send-modal
  // pattern (showSendToJxFlow declares cableDeviceId + tapeDumpMuted
  // immediately before its tdsCtrl block for the same reason).
  let tapeDumpMonitor = null;       // live speaker monitor (created post-capture-start by startTapeDumpMonitor)
  let tapeDumpMuted = false;        // per-modal mute toggle (session-local, no library write)

  // Tape Dump Sounds control — mirrors the Send-modal tdsCtrl. Mute
  // toggle + volume slider + info popover. Reuses the .send-jx-tds CSS
  // classes (named for historical reasons; the styling is generic to
  // the tape-dump-sounds control surface and works for both Send and
  // Record modals). Hidden by default; revealed when entering capture-
  // mode AND tapeDumpSoundsEnabled (see configureForCurrentDevice).
  // Live mute/volume changes call tapeDumpMonitor?.setMuted/setVolume
  // (optional chaining — monitor doesn't exist until startTapeDumpMonitor
  // resolves after capture starts; slider still updates persisted volume
  // before then so the monitor inherits the right value on launch).
  const tdsSpkRec  = '<polygon points="3 9 7 9 11 5 11 19 7 15 3 15" fill="currentColor" stroke="none"/>';
  const tdsWaveRec = '<g class="snd-wave"><path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M17.5 7a7.5 7.5 0 0 1 0 10"/></g>';
  const tdsSlashRec = '<g class="snd-slash"><line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/></g>';
  const tdsSvgRec = (inner) =>
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  const tdsCtrl = document.createElement('div');
  tdsCtrl.className = 'send-jx-tds';
  tdsCtrl.style.display = 'none';
  tdsCtrl.innerHTML =
    '<div class="send-jx-tds-row">' +
      '<button type="button" class="send-jx-tds-mute" aria-label="Mute tape dump sound">' + tdsSvgRec(tdsSpkRec + tdsWaveRec + tdsSlashRec) + '</button>' +
      '<input type="range" class="send-jx-tds-slider" min="0" max="1" step="0.01" aria-label="Tape dump sound volume">' +
      '<span class="send-jx-tds-volicon" aria-hidden="true">' + tdsSvgRec(tdsSpkRec + tdsWaveRec) + '</span>' +
    '</div>' +
    '<button type="button" class="send-jx-tds-q" aria-label="What does my tape dump sound like?">' +
      'What does my tape dump sound like?' +
      '<svg class="send-jx-tds-iicon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
        '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
        '<line x1="8" y1="7.2" x2="8" y2="11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<circle cx="8" cy="4.7" r="0.95" fill="currentColor"/>' +
      '</svg>' +
    '</button>' +
    '<div class="send-jx-tds-pop" role="dialog" style="display:none">' +
      '<button type="button" class="send-jx-tds-pop-close" aria-label="Close">&times;</button>' +
      '<p>Does not affect data captured from the JX-3P—sound is for your reference.</p>' +
      "<p>Plays through your Mac's built-in speakers (check speaker volume if you hear nothing).</p>" +
    '</div>';
  modal.appendChild(tdsCtrl);

  const tdsMuteRec   = tdsCtrl.querySelector('.send-jx-tds-mute');
  const tdsSliderRec = tdsCtrl.querySelector('.send-jx-tds-slider');
  const tdsQRec      = tdsCtrl.querySelector('.send-jx-tds-q');
  const tdsPopRec    = tdsCtrl.querySelector('.send-jx-tds-pop');

  const paintTdsSliderRec = () => {
    const pct = Math.round((parseFloat(tdsSliderRec.value) || 0) * 100);
    tdsSliderRec.style.background =
      `linear-gradient(to right, #f7f1e6 0%, #f7f1e6 ${pct}%, #5a2a20 ${pct}%, #5a2a20 100%)`;
  };
  tdsSliderRec.value = String(Math.sqrt(Math.max(0, Math.min(1, tapeDumpVolume))));
  paintTdsSliderRec();

  const syncTdsMuteRec = () => {
    tdsMuteRec.classList.toggle('muted', tapeDumpMuted);
    tdsMuteRec.title = tapeDumpMuted ? 'Unmute tape dump sound' : 'Mute tape dump sound';
    tdsMuteRec.setAttribute('aria-pressed', String(tapeDumpMuted));
  };
  syncTdsMuteRec();

  tdsMuteRec.addEventListener('click', () => {
    tapeDumpMuted = !tapeDumpMuted;
    syncTdsMuteRec();
    if (tapeDumpMonitor && typeof tapeDumpMonitor.setMuted === 'function') {
      try { tapeDumpMonitor.setMuted(tapeDumpMuted); } catch {}
    }
  });
  tdsSliderRec.addEventListener('input', () => {
    const v = parseFloat(tdsSliderRec.value) || 0;
    tapeDumpVolume = v * v;
    paintTdsSliderRec();
    if (!library.transmissionSounds) library.transmissionSounds = {};
    library.transmissionSounds.volume = tapeDumpVolume;
    saveLibraryDebounced();
    if (tapeDumpMonitor && typeof tapeDumpMonitor.setVolume === 'function') {
      try { tapeDumpMonitor.setVolume(tapeDumpVolume); } catch {}
    }
  });
  tdsQRec.addEventListener('click', () => {
    tdsPopRec.style.display = (tdsPopRec.style.display === 'none') ? '' : 'none';
  });
  tdsCtrl.querySelector('.send-jx-tds-pop-close').addEventListener('click', () => {
    tdsPopRec.style.display = 'none';
  });

  modal.appendChild(actions);
  overlay.appendChild(modal);
  // NOTE: document.body.appendChild(overlay) happens further down, AFTER
  // configureForCurrentDevice() runs to hide the mode-irrelevant sections.
  // Mounting first caused a flash of the "everything visible" layout for a
  // single frame before the snap to the final state — visually jarring.

  // Capture state. Modal opens already capturing — no manual Record click.
  let state = 'recording';          // 'recording' | 'processing'
  // Two-pass calibration state. Pass 1 measures the actual FSK peak amplitude
  // and computes a gain multiplier; pass 2 does the real capture at the
  // calibrated gain. The calibration is persisted per-input-device, so
  // subsequent records on the same device are single-pass.
  //   isCalibrating === true   →  currently doing pass 1
  //   isCalibrating === false  →  currently doing pass 2 (or single pass)
  // calibrationDevice* track the device identity for the persistence write.
  let isCalibrating = false;
  let calibrationDeviceId    = null;
  let calibrationDeviceLabel = null;
  let mediaStream = null;
  // captureSession owns the AudioContext + node graph + raf loop after
  // the Step 3e factory extraction. Modal mirrors a few values out of
  // it (audioContext, gainNode, captured, runningPeak, fskPeak) for
  // legacy stopRecording reads + the slider listener + the post-capture
  // PCM concat — see comments at each mirror site for details.
  let captureSession = null;
  let audioContext = null;          // mirror of session.audioContext; read at WAV-write time for the sampleRate header
  let gainNode     = null;          // mirror of session.gainNode; slider listener writes .gain.value here
  // (tapeDumpMonitor + tapeDumpMuted are declared earlier, above the tdsCtrl
  // block that closes over them — see the Tape Dump Sounds state block.)
  let captured     = [];            // mirror of session.captured (the live PCM buffer); concatenated by stopRecording
  let fskPeak      = 0;             // mirror from captureState.fskPeak each raf tick; read by calibration math
  let runningPeak  = 0;             // mirror from captureState.runningPeak; read by the onCaptured handoff. (Originally a local var inside startRecording that was invisible to stopRecording — every clean-capture auto-proceed threw a silent ReferenceError. Fixed 2026-05-25.)
  let elapsedTimer = null;
  let timerStartMs = null;          // set inside onTick when events.fskJustStarted fires; null while "Waiting…" for JX dump

  // Periodic re-probe of the selected device's sample rate. Catches
  // changes made externally in Audio MIDI Setup that don't reliably
  // emit a devicechange event on every macOS/Chromium combination.
  // Skipped while a capture is actively running (state === 'recording')
  // to avoid opening a competing getUserMedia stream that could disrupt
  // the active capture. Cleared in close() to prevent leakage.
  let sampleRatePollTimer = null;

  const close = () => {
    stopCapture();
    navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
    if (sampleRatePollTimer) { clearInterval(sampleRatePollTimer); sampleRatePollTimer = null; }
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape' && state !== 'processing') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay && state !== 'processing') close(); });
  // Same processing-state guard as the Escape-key + overlay-click paths.
  closeBtn.addEventListener('click', () => { if (state !== 'processing') close(); });

  // Inline notice anchored to the device picker. Hidden by default;
  // surfaced when the audio-device list changes mid-session (USB
  // hot-plug, power-cycle of an interface, sample-rate change) and
  // the picker had to update. Anchored here — not at statusText — so
  // the user's eye lands directly next to the dropdown that needs
  // re-verification.
  const deviceNotice = document.createElement('div');
  deviceNotice.className = 'record-jx-device-notice';
  deviceNotice.hidden = true;
  deviceSection.appendChild(deviceNotice);
  let deviceNoticeTimer = null;
  const showDeviceNotice = (msg) => {
    deviceNotice.textContent = msg;
    deviceNotice.hidden = false;
    clearTimeout(deviceNoticeTimer);
    // Auto-fade after 10 s — long enough to read + glance up at the
    // picker, short enough not to linger after acknowledgement.
    deviceNoticeTimer = setTimeout(() => { deviceNotice.hidden = true; }, 10000);
  };

  // SEPARATE persistent warning for sample-rate mismatch. Stays
  // visible until the user fixes the issue (or selects a different
  // device) because a wrong sample rate WILL silently corrupt every
  // capture — Chromium resamples device-rate → 44.1 kHz on the fly,
  // and the resampling artifacts scatter junk frequencies across the
  // FSK band, breaking decoder bit-timing lock. We learned this the
  // hard way 2026-05-25 after hours of chasing calibration ghosts:
  // the KT USB Audio interface was at 48/24 (its macOS default),
  // every capture produced WAVs that LOOKED structurally correct but
  // were undecodable. Switching the device to 44.1/24 in Audio MIDI
  // Setup fixed it instantly. This warning surfaces that condition
  // proactively. Red border (not amber) to signal "this WILL cause
  // failures" not "heads up".
  // Sample-rate warning toggle. Drives both notice elements together:
  //   - devicePreferred  (header right): show + flashing amber
  //   - deviceActual     (picker right): show text "<n>kHz" amber
  // Both hidden when the device IS at 44.1 (happy path, no nagging).
  // The 2 s background poll auto-refreshes when the user fixes the
  // rate in Audio MIDI Setup, so no Re-check button is needed.
  //
  // Param: mismatchedRateHz — the device's current rate in Hz when
  // it doesn't match 44.1k, or null/0/falsy to clear (matched state).
  const setSampleRateWarning = (mismatchedRateHz) => {
    if (mismatchedRateHz) {
      devicePreferred.hidden = false;
      deviceActual.textContent = `${mismatchedRateHz / 1000}kHz`;
      deviceActual.hidden = false;
    } else {
      devicePreferred.hidden = true;
      deviceActual.hidden = true;
    }
  };

  // Query the selected device's NATIVE sample rate from CoreAudio via a
  // main-process system_profiler call. We previously tried a Web Audio
  // probe (open a stream, read track.getSettings().sampleRate) but
  // Chromium aggressively caches the negotiated stream per deviceId —
  // once it returned 48 kHz, repeated probes returned 48 kHz forever,
  // even after the user changed the device's Format in Audio MIDI
  // Setup. The CoreAudio path bypasses Chromium entirely and always
  // reflects current reality, no cache-busting tricks needed.
  //
  // Label matching: Chromium's device picker uses labels like
  // "Default - KT USB Audio (31b2:2024)"; system_profiler returns the
  // bare device name "KT USB Audio". We match by substring against
  // each system_profiler device name and pick the one whose name
  // appears in the Chromium label. Falls back to the system default
  // input when the picker is set to Chromium's "default" deviceId.
  // Failures are non-fatal: capture still runs, we just can't warn.
  const probeDeviceSampleRate = async (deviceId) => {
    if (!deviceId) return;
    try {
      const result = await window.api.audioInputRates();
      if (!result || !result.ok || !Array.isArray(result.devices)) {
        // system_profiler failed (rare) — silently skip the warning.
        return;
      }
      const pickerLabel = devicePicker.options[devicePicker.selectedIndex]?.textContent || '';
      // Chromium's "default" deviceId points to whatever CoreAudio
      // currently has marked as default input. system_profiler exposes
      // that with isDefaultInput=true.
      let match;
      if (deviceId === 'default') {
        match = result.devices.find((d) => d.isDefaultInput);
      }
      if (!match) {
        // Fallback / non-default: substring match by device name.
        match = result.devices.find((d) => d.name && pickerLabel.includes(d.name));
      }
      if (!match || !match.sampleRate) {
        // Couldn't identify which CoreAudio device the picker refers to.
        // Don't warn — better silent than misleading.
        return;
      }
      const nativeRate = match.sampleRate;
      // Pass the rate so setSampleRateWarning can render the readout
      // (e.g. "48kHz"); falsy clears the notice.
      setSampleRateWarning(nativeRate !== 44100 ? nativeRate : null);
    } catch (err) {
      console.warn('Sample-rate probe failed:', err && err.message);
    }
  };

  // Populate (or repopulate) the input-device picker. We need a
  // one-shot permission grant on the first call to get human-readable
  // device labels — without it, enumerateDevices() returns anonymized
  // entries like "Audio Input (default)" with no real name. The
  // probe-grant persists for the modal's lifetime, so subsequent
  // calls (fired from the devicechange handler) skip it.
  //
  // Returns metadata about what changed so callers can decide whether
  // to surface a notice and/or restart an in-flight capture:
  //   - initial:     was this the first populate?
  //   - hadPrior:    was a deviceId selected before the refresh?
  //   - restored:    did we successfully restore that prior selection?
  //   - devicesGone: did enumerate fail or return zero inputs?
  let probeDone = false;
  const refreshDeviceList = async ({ initial = false } = {}) => {
    if (initial && !probeDone) {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
        probeDone = true;
      } catch (err) {
        // Permission denied or no devices — surface the error but still
        // let the user try Record later (a fresh permission prompt may
        // appear on the next click).
        statusText.textContent = `Mic permission: ${err.name}. ${err.message}`;
      }
    }
    const priorId    = devicePicker.value || null;
    const priorLabel = priorId && devicePicker.options[devicePicker.selectedIndex]
                       ? devicePicker.options[devicePicker.selectedIndex].textContent
                       : null;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs  = devices.filter((d) => d.kind === 'audioinput');
      devicePicker.innerHTML = '';
      inputs.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Audio Input ${i + 1}`;
        devicePicker.appendChild(opt);
      });
      if (!inputs.length) {
        const opt = document.createElement('option');
        opt.textContent = '(no audio inputs found)';
        opt.disabled = true;
        devicePicker.appendChild(opt);
        // No input device → no point letting the user click Stop on a
        // capture that never started. (This modal has no separate Record
        // button; it opens already capturing, so stopBtn is the only
        // capture-control affordance.)
        stopBtn.disabled = true;
        return { initial, hadPrior: !!priorId, restored: false, devicesGone: true };
      }
      // Try to restore the prior selection. Match by deviceId first,
      // then by label — Chromium often re-assigns deviceIds when a USB
      // device is unplugged + replugged, but the device label (e.g.
      // "KT USB Audio (31b2:2024)") stays stable, so the label-match
      // fallback recovers from that case without bothering the user.
      // v0.7.1: on INITIAL refresh, also try library.record.preferred*
      // (cross-session memory). Same id-then-label match strategy. If
      // the preferred device is missing entirely, prepend a disabled
      // ghost option so the user sees what's remembered + can replug.
      let restored = false;
      const tryMatch = (id, label) => {
        if (!id) return false;
        if ([...devicePicker.options].some((o) => o.value === id)) {
          devicePicker.value = id;
          return true;
        }
        if (label) {
          const byLabel = [...devicePicker.options].find((o) => o.textContent === label);
          if (byLabel) { devicePicker.value = byLabel.value; return true; }
        }
        return false;
      };
      if (priorId) {
        restored = tryMatch(priorId, priorLabel);
      } else if (initial && library.record && library.record.preferredInputDeviceId) {
        // First refresh of a fresh modal session: honor the saved
        // preferred device from a previous session.
        restored = tryMatch(library.record.preferredInputDeviceId, library.record.preferredInputDeviceLabel);
        if (!restored) {
          // Preferred device is unplugged. Prepend a ghost option so the
          // user can see what they had picked + is currently missing.
          // First available input stays auto-selected as the working
          // fallback — capture still starts so the modal isn't a dead
          // end while user finds their cable.
          const ghostLabel = library.record.preferredInputDeviceLabel || '(saved device)';
          const ghost = document.createElement('option');
          ghost.value = library.record.preferredInputDeviceId;
          ghost.textContent = `${ghostLabel} (unavailable, plug it in!)`;
          ghost.disabled = true;
          devicePicker.insertBefore(ghost, devicePicker.children[0] || null);
        }
      }
      return { initial, hadPrior: !!priorId, restored, devicesGone: false };
    } catch (err) {
      if (initial) statusText.textContent = `Couldn't list audio devices: ${err.message}`;
      stopBtn.disabled = true;   // see comment above on stopBtn vs (non-existent) recordBtn
      return { initial, hadPrior: !!priorId, restored: false, devicesGone: true };
    }
  };
  await refreshDeviceList({ initial: true });

  // Hot-plug / unplug handler. macOS + Chromium fire `devicechange`
  // when audio devices are added, removed, or change session ID (USB
  // power-cycle counts as the last). Without this, the picker held
  // stale deviceIds across hardware events: subsequent getUserMedia
  // calls would either silently return a dead stream or throw
  // OverconstrainedError, manifesting as "no audio detected" with no
  // hint about why.
  //
  // Behavior: re-enumerate; surface an inline notice next to the
  // picker reflecting what changed; if a capture is currently running,
  // tear it down + restart against the (possibly new) selection so the
  // level meter recovers without user action.
  const onDeviceChange = async () => {
    const result = await refreshDeviceList({ initial: false });

    // CRITICAL: Chromium emits `devicechange` for a LOT of reasons —
    // not just true hot-plug. It also fires when getUserMedia switches
    // a device's sample rate, when macOS power-cycles a USB interface
    // for its own reasons (CoreAudio sleep/wake), and when the system
    // default output changes. If we naïvely tear down + restart an
    // in-flight capture on every devicechange, we DROP the user's PCM
    // buffer mid-dump — and since the JX-3P's tape transmission is
    // one-shot (you have to press Save again to retry), this looks to
    // the user like the capture inexplicably failed. Decode also fails:
    // the new capture starts in the middle of the FSK with no leading
    // silence, so the silence→signal trim has nothing to anchor on.
    //
    // Therefore: only act on the PICKER/NOTICE/CAPTURE-RESTART side
    // if something MATERIAL changed. If the user's selected device is
    // still in the list (restored === true), don't tear down a running
    // capture or surface a notice.
    //
    // BUT — always re-probe the sample rate. Chromium fires devicechange
    // when a device's configuration changes (sample rate, channel count)
    // even when the device itself stays present. Without this re-probe,
    // a user who toggles their interface's sample rate in Audio MIDI
    // Setup mid-session sees a stale sample-rate warning that doesn't
    // refresh. The probe is cheap (~100ms getUserMedia round-trip) and
    // its result either clears or refreshes the warning.
    if (result.restored && !result.devicesGone) {
      probeDeviceSampleRate(devicePicker.value);
      return;
    }

    if (result.devicesGone) {
      showDeviceNotice('⚠ Audio device disconnected. Reconnect it or pick a different INPUT DEVICE above.');
    } else if (result.hadPrior && !result.restored) {
      showDeviceNotice('Audio device changed — INPUT DEVICE was reset. Verify your selection above before pressing Save on the JX-3P.');
    } else {
      // Device list changed but we had no prior selection (first-time
      // user, hadn't clicked the picker yet). Mild informational.
      showDeviceNotice('Audio device list updated.');
    }

    if (state === 'recording') {
      // Reach here only if the selected device is GONE — the in-flight
      // capture is dead anyway, so restart against whatever fell back
      // in. User will need to press Save on the JX again.
      stopCapture();
      configureForCurrentDevice();
      await startRecording();
    } else {
      // Not capturing yet — still re-read calibration for the (possibly
      // changed) selection so the gain text + warnings reflect reality.
      configureForCurrentDevice();
    }
  };
  navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);

  // Periodic re-probe (~2s) keeps the sample-rate warning fresh when
  // the user flips the device's Format in Audio MIDI Setup mid-session.
  // Chromium's devicechange event is documented for hot-plug but is
  // inconsistent for sample-rate flips on macOS, so this is the safety
  // net that guarantees the warning reflects current reality regardless
  // of what events fire. Runs even during active recording — on macOS,
  // CoreAudio multiplexes device access, so a brief probe stream
  // alongside the capture doesn't interrupt it (verified 2026-05-25).
  // The original "skip while recording" gate left users staring at
  // stale warnings throughout their entire ~25–30 s capture window.
  sampleRatePollTimer = setInterval(() => {
    if (!devicePicker.value) return;
    probeDeviceSampleRate(devicePicker.value);
  }, 2000);

  // Decide first-time-calibration vs single-pass based on whether this device
  // has a saved calibrated gain in library.json. Called now (initial open) and
  // again on device-picker change. Updates instructions copy + the gain
  // slider to reflect the chosen mode. In calibration mode we also retitle
  // the modal (so the user knows this is NOT data capture) and hide the
  // "WHAT THE JX-3P SENDS" timeline (which would imply we're collecting
  // segmented data, which would be misleading here).
  const configureForCurrentDevice = () => {
    calibrationDeviceId    = devicePicker.value;
    calibrationDeviceLabel = devicePicker.options[devicePicker.selectedIndex]?.textContent || null;
    // Probe the new selection's native sample rate. Fires async — the
    // warning shows once the probe resolves. Don't await: we don't
    // want to block the modal's UI setup on the probe.
    probeDeviceSampleRate(calibrationDeviceId);
    const cal = getCalibratedGain(calibrationDeviceId);
    if (cal) {
      isCalibrating = false;
      h.textContent = kind === 'sequence'
        ? 'Import sequence from JX-3P'
        : 'Import C/D banks from JX-3P';
      // Capture-mode layout: show the cal-row with the GAIN column hidden
      // (gain is already calibrated, no user input needed) — leaving the
      // [diagram | arrow | level meter] cause→effect visual intact. The
      // diagram lives inside calRow in both modes so we don't re-parent.
      calRow.style.display = '';
      calRow.classList.add('capture-mode');     // CSS hides .cal-gain-col
      if (jxKeyDiagram.parentElement !== calRow) {
        calRow.insertBefore(jxKeyDiagram, calRow.firstChild);
      }
      timelineSection.style.display = '';
      // Tape Dump Sounds control: visible in capture mode when feature enabled.
      tdsCtrl.style.display = tapeDumpSoundsEnabled ? '' : 'none';
      tdsPopRec.style.display = 'none';         // reset popover on each enter
      // In capture mode statusText lives inside the timeline header so
      // the elapsed counter sits to the right of "WHAT THE JX-3P SENDS:".
      // (Moves back to the modal-level slot in calibration — see below.)
      if (statusText.parentElement !== timelineHeader) {
        timelineHeader.appendChild(statusText);
      }
      statusText.classList.remove('record-jx-status-calibration');
      // Hide the Stop button — capture is fully hands-free now (auto-stop
      // fires when the JX dump completes; Cancel covers the abort case
      // for failed captures). Matches calibration mode's pattern.
      stopBtn.style.display = 'none';
      calProgressSection.style.display = 'none';
      gainSection.style.display = 'none';
      // Wrap the instructions in the boxed style so the visual hierarchy
      // matches the calibration modal (same card styling for the
      // intro/instructions block).
      instr.classList.add('record-jx-instr-box');
      const newPos = gainToSlider(cal.gain);
      gainSlider.value = String(newPos);
      gainValueLabel.textContent = formatGain(cal.gain);
      if (gainNode) gainNode.gain.value = cal.gain;
      gainKnob.setGain(cal.gain);
      // Both kinds dump in roughly ~25–30 s of real time:
      //   - Sequence: 1 pilot (4.64 s) + 1 sequence-data block (~22 s)
      //   - Tone:     1 pilot + bank C (~8 s) + divider pilot + bank D (~8 s)
      // EXPECTED_SIGNAL_MS (the auto-stop budget) sits well above
      // this — 30 s for sequences, 60 s for tones — so worst-case
      // heavy-content dumps still complete cleanly. "~30 s" is the
      // typical/expected case, set on the slightly-long side so the
      // user doesn't think we're stuck if their dump takes 30 s
      // instead of 25.
      const dumpDurationCopy = '~30 s';
      instr.innerHTML =
        `<p style="margin: 0;"><b>Now press ${jxSaveLabel}.</b></p>` +
        `<p style="margin: 6px 0 0; color: var(--text-mid); font-size: 12px;">Capture finishes automatically when the JX dump completes (${dumpDurationCopy}).</p>`;
    } else {
      isCalibrating = true;
      // Pick the starting gain for pass 1:
      //   - If the caller supplied initialGain (Recalibrate flow handing
      //     forward the prior calibrated value), use it so the meter
      //     opens at the level the user is accustomed to.
      //   - Otherwise (genuine first-time calibration on a never-seen
      //     device), default to 1.0× — a known baseline.
      // Either way, the calibration math (newGain = currentGain * TARGET
      // / measurePeak) computes the correct new gain from the measured
      // peak; the starting position is purely a UX seed.
      const startGain = (typeof initialGain === 'number' && initialGain > 0)
        ? initialGain
        : 1.0;
      gainSlider.value = String(gainToSlider(startGain));
      gainValueLabel.textContent = formatGain(startGain);
      if (gainNode) gainNode.gain.value = startGain;
      gainKnob.setGain(startGain);
      h.textContent = 'Calibrate volume';
      // Calibration layout: show the cal-row with BOTH columns (gain knob
      // + level meter). Remove .capture-mode so the .cal-gain-col CSS rule
      // un-hides the gain column. Hide the segmented timeline.
      calRow.style.display = '';
      calRow.classList.remove('capture-mode');
      if (jxKeyDiagram.parentElement !== calRow) {
        // Insert as first child of calRow (left column).
        calRow.insertBefore(jxKeyDiagram, calRow.firstChild);
      }
      timelineSection.style.display = 'none';
      // Tape Dump Sounds control: hidden in calibration mode (calibration is
      // about measuring source level, not playing back monitor audio).
      tdsCtrl.style.display = 'none';
      // Hide the Stop button — calibration is fully hands-free now.
      // Auto-stop triggers when the dump-progress bar fills (cumulative
      // signal hits the expected duration) or when end-of-dump silence
      // is detected.
      stopBtn.style.display = 'none';
      // Show the dump-progress bar (now at modal level since meterSection
      // was removed — insert it before deviceSection on first call).
      // MUST happen before the statusText reparent below — statusText
      // anchors against calProgressSection.
      if (calProgressSection.parentElement !== modal) {
        modal.insertBefore(calProgressSection, deviceSection);
      }
      // In calibration mode the timeline section is hidden, which would
      // also hide statusText (its child in capture mode). Reparent it
      // up to modal level — between calRow and calProgressSection — so
      // clipping / no-signal warnings remain visible during gain
      // adjustment. The .record-jx-status-calibration class gives it
      // a block layout with a small bottom margin (the flex layout
      // wouldn't make sense here without the sibling label).
      if (statusText.nextElementSibling !== calProgressSection) {
        modal.insertBefore(statusText, calProgressSection);
      }
      statusText.classList.add('record-jx-status-calibration');
      calProgressSection.style.display = '';
      calProgressBar.style.width = '0%';
      gainSection.style.display = 'none';   // gain knob in calRow replaces the slider
      instr.classList.add('record-jx-instr-box');
      // ~30 s covers both kinds — see the capture-branch comment above
      // for the per-segment breakdown.
      const dumpDurationCopy = '~30 s';
      instr.innerHTML =
        `<p style="margin: 0;"><b>Press ${jxSaveLabel} on the JX-3P now.</b></p>` +
        `<p style="margin: 6px 0 0;"><b>Adjust <span class="btn-hint">Input Gain</span> to reach <span class="pill-yellow">yellow</span> target notch.</b></p>` +
        `<p style="margin: 8px 0 0; color: var(--text-mid); font-size: 12px;">Calibration auto-advances when the JX finishes its dump (${dumpDurationCopy}); the recorder reopens for the real capture.</p>`;
    }
  };
  configureForCurrentDevice();
  // Mount NOW — the modal has its final layout in place, so it appears
  // already-sized rather than flashing through the all-sections-visible
  // intermediate state.
  document.body.appendChild(overlay);

  // Stops any in-flight capture without dismissing the modal. Used both on
  // device change (to restart with a different input) and as part of the
  // full cleanup path. Idempotent.
  const stopCapture = () => {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    // Stop the tape-dump speaker monitor before tearing down the audio graph
    // it taps (no-op if the feature was off / no eligible speaker).
    if (tapeDumpMonitor) { try { tapeDumpMonitor.stop(); } catch {} tapeDumpMonitor = null; }
    if (captureSession) { captureSession.stop(); captureSession = null; }
    // captureSession.stop() handles raf cancel + node disconnect + audio
    // context close. mediaStream stays the modal's responsibility — the
    // factory deliberately doesn't touch it because callers may want to
    // reuse it across sessions.
    audioContext = null;
    gainNode     = null;
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      mediaStream = null;
    }
  };

  // Light up the 'processing' segment in the timeline + snap the indicator
  // to its midpoint. Idempotent — safe to call repeatedly. Called from two
  // places:
  //   1. onTick (during recording) — optimistic UI when activeMs reaches
  //      the expected tx total. The JX has just finished dumping but the
  //      auto-stop trigger may need another few seconds of silence to
  //      confirm. Showing PROCESSING immediately gives the user instant
  //      "yep, done, working on it" feedback instead of staring at "BANK D
  //      with idle indicator" for 10+ s.
  //   2. stopRecording (post-auto-stop) — defensive backstop for the case
  //      where activeMs never reached txTotalEstSec (very short dump or
  //      content that the estimate overshot).
  const activateProcessingSeg = () => {
    const processingSeg = segs.find((s) => s.kind === 'processing');
    if (!processingSeg) return;
    segs.forEach((s) => s.el.classList.toggle('active', s === processingSeg));
    // Park the indicator AT THE START of the processing segment instead
    // of its midpoint — processing duration is unpredictable (decode +
    // disk I/O), so a midpoint-parked indicator gave the false sense
    // that progress had stalled mid-segment. The segment itself pulses
    // (CSS animation on .send-jx-seg.active.send-jx-seg-processing) to
    // signal "still working" without faking forward motion. Daniel
    // 2026-06-02 — "Star Trek transporter shimmer."
    const totalEst = segs.reduce((sum, s) => sum + s.estSec, 0);
    const startPct = (totalEst - processingSeg.estSec) / totalEst * 100;
    indicator.style.left = `${startPct}%`;
  };

  // Kicks off a capture using the currently-selected device. Called once
  // when the modal opens, and again on device-picker change (with prior
  // capture stopped + buffer cleared first).
  const startRecording = async () => {
    statusText.textContent = '';
    // (Used to reset `captured = []` here; setupAudioGraph now creates
    // a fresh array each call and we reassign the modal-scope reference
    // below. Same observable behavior, just less duplication.)
    // Re-probe sample rate at every capture-start. Belt-and-suspenders
    // against the case where Audio MIDI Setup changed the device's rate
    // since the last probe — devicechange may not fire reliably for every
    // sample-rate flip on every macOS/Chromium combination. The probe
    // either renews or clears the warning. Fires async; don't await.
    probeDeviceSampleRate(devicePicker.value);
    // Acquire the input stream with FSK-safe constraints. See
    // renderer/audio-capture.js for the strict-vs-soft constraint
    // dance + rationale. The helper handles the OverconstrainedError
    // fallback internally; we just need to surface a clean error to
    // the user if both attempts fail.
    try {
      const result = await acquireRawAudioStream(devicePicker.value || undefined);
      mediaStream = result.mediaStream;
    } catch (err) {
      statusText.textContent = `Couldn't start mic: ${err.name} — ${err.message}`;
      stopBtn.disabled = true;
      return;
    }
    // ── Capture session ──────────────────────────────────────────
    //
    // The audio chain (AudioContext + node graph), the analyser-peak
    // reader, the pure state machine, and the raf loop all live inside
    // startCaptureSession() in renderer/audio-capture.js. The modal
    // here owns the DOM and the post-capture flow; the factory's
    // onTick fires per frame with peak/thresholds/state/events and the
    // modal projects those to DOM updates.
    //
    // Slider position is preserved across restarts (e.g. on device
    // change) by reading gainSlider.value here rather than resetting.
    const initialGain = sliderToGain(parseInt(gainSlider.value, 10));
    gainValueLabel.textContent = formatGain(initialGain);

    // Pre-tick state owned by the modal (these aren't part of the
    // captureState — they drive DOM-only concerns).
    const totalEstSec = segs.reduce((sum, s) => sum + s.estSec, 0);
    // Arrow .pulsing falling-edge debounce (2026-05-24): without this,
    // the arrow flips off on brief silence dips inside sustained FSK.
    // Rising edge instant (responsive); falling edge requires N
    // consecutive sub-silence ticks.
    let arrowBelowSilenceTicks = 0;
    const ARROW_FALLING_DEBOUNCE_TICKS = 8;   // ~130 ms at 60 fps
    // 4-state warning ladder. null = no warning; otherwise one of
    // 'clipping' | 'no-signal-escalated' | 'no-signal' | 'quiet'.
    let warnLevel = null;
    const recordStartMs = Date.now();
    runningPeak = 0;
    fskPeak     = 0;

    captureSession = startCaptureSession({
      mediaStream,
      initialGain,
      recordStartMs,
      expectedSignalMs: EXPECTED_SIGNAL_MS,
      isRecording: () => state === 'recording',
      onTick: ({ peak, thresholds, state: cs, events }) => {
        // Mirror two values to modal-scope so stopRecording's existing
        // reads still work: fskPeak for the calibration math,
        // runningPeak for the capturePeak handoff to onCaptured.
        runningPeak = cs.runningPeak;
        fskPeak     = cs.fskPeak;

        // SVG vertical level meter (panel-style 7-segment ladder).
        vmeter.setPeak(peak);

        // Arrow .pulsing animation — falling-edge debounced.
        if (peak > thresholds.silence) {
          if (!calArrow.classList.contains('pulsing')) calArrow.classList.add('pulsing');
          arrowBelowSilenceTicks = 0;
        } else {
          if (calArrow.classList.contains('pulsing')) {
            arrowBelowSilenceTicks += 1;
            if (arrowBelowSilenceTicks >= ARROW_FALLING_DEBOUNCE_TICKS) {
              calArrow.classList.remove('pulsing');
              arrowBelowSilenceTicks = 0;
            }
          }
        }

        // State-machine events → DOM.
        if (events.fskJustStarted) {
          // Two-state row reveal in BOTH calibration and capture modes.
          // Calibration: knob + meter + arrow fade in after Save press.
          // Capture: JP logo + arrow fade in, diagram dims.
          calRow.classList.add('playing');
          // Start the "Recording — Ns elapsed" counter NOW (not from
          // modal-open) so the displayed elapsed time reflects actual
          // dump duration, not user reaction time before pressing
          // Tape Memory → Save on the JX. The setInterval below is
          // already running; it skips ticks until timerStartMs is set.
          if (timerStartMs === null) timerStartMs = Date.now();
        }
        if (isCalibrating && events.progressPct !== null) {
          // Wall-clock-driven progress bar (not cumulative-signal) so
          // the bar reaches 100% exactly when the dump actually ends.
          calProgressBar.style.width = `${events.progressPct}%`;
        }

        // Timeline-segment indicator (the "WHAT THE JX-3P SENDS" bar).
        // Driven by cumulative FSK signal time. Skip while in 'processing'
        // state — onTick is gated on state==='recording' so a late raf
        // tick after stopRecording fires can't reset our seg state.
        if (cs.activeMs > 0 && state === 'recording') {
          const elapsedSec = cs.activeMs / 1000;
          // Exclude the trailing 'processing' segment from both the
          // accumulator AND the totalEstSec denominator so the tx-side
          // indicator reaches the end of Bank D / Sequence at the right
          // visual position (start of the Processing segment), rather
          // than capping at ~86% with Processing included in the math.
          const txSegs = segs.filter((s) => s.kind !== 'processing');
          const txTotalEstSec = txSegs.reduce((sum, s) => sum + s.estSec, 0);

          if (elapsedSec >= txTotalEstSec) {
            // Optimistic Processing: activeMs has hit (or passed) the
            // expected tx total, so the JX is presumably done dumping.
            // Light up Processing now rather than waiting for auto-stop
            // to fire — on hardware where post-dump audio stays above
            // signalThreshold, auto-stop can lag 10+ s behind the actual
            // JX-done moment. Idempotent; safe to call every tick once
            // we're past the threshold.
            activateProcessingSeg();
          } else {
            // Normal advance through the tx-side segments.
            let acc = 0, activeIdx = txSegs.length - 1;
            for (let i = 0; i < txSegs.length; i++) {
              acc += txSegs[i].estSec;
              if (elapsedSec < acc) { activeIdx = i; break; }
            }
            segs.forEach((s) => {
              const isActive = s === txSegs[activeIdx];
              s.el.classList.toggle('active', isActive);
            });
            const txPortionPct = (txTotalEstSec / totalEstSec) * 100;
            const pct = Math.min(txPortionPct, (elapsedSec / txTotalEstSec) * txPortionPct);
            indicator.style.left = `${pct}%`;
          }
        }

        // Live warning classification: see renderer/capture-warnings.js.
        const newWarn = classifyCaptureWarning({
          peak,
          runningPeak:   cs.runningPeak,
          elapsedMs:     events.elapsedTotal,
          totalSignalMs: cs.totalSignalMs,
        });
        if (newWarn !== warnLevel) {
          warnLevel = newWarn;
          statusText.textContent = warnLevel ? CAPTURE_WARN_COPY[warnLevel]  : '';
          statusText.style.color = warnLevel ? CAPTURE_WARN_COLOR[warnLevel] : '';
        }
      },
      onAutoStop: () => {
        // Snap progress to 100% for clean visual closure before the
        // modal transitions to post-capture processing.
        if (isCalibrating) calProgressBar.style.width = '100%';
        stopRecording();
      },
    });
    // Mirror session pieces out for the legacy modal-scope readers:
    //   - audioContext: read at WAV-write time for the sampleRate header
    //   - gainNode:     written by the slider listener for live gain
    //   - captured:     the live PCM buffer; stopRecording concatenates
    audioContext = captureSession.audioContext;
    gainNode     = captureSession.gainNode;
    captured     = captureSession.captured;

    // Tape Dump Sounds (View > Tape dump sounds; off by default) — monitor the
    // incoming dump out the Mac's built-in speakers so the user HEARS it come
    // in. Fully isolated + silent-fail; built-in-speaker routing is forced so
    // it can never feed back into the JX. Uses the shared persisted volume.
    if (tapeDumpSoundsEnabled && typeof startTapeDumpMonitor === 'function') {
      startTapeDumpMonitor({
        audioContext: captureSession.audioContext,
        sourceNode:   captureSession.gainNode,
        cableDeviceId: null,                 // allowlist already excludes the KT (not a built-in speaker)
        enabled:      true,
        muted:        tapeDumpMuted,         // inherit current modal mute state
        volume:       tapeDumpVolume,        // inherit current modal volume (persisted)
      }).then((m) => { tapeDumpMonitor = m; }).catch(() => {});
    }

    stopBtn.disabled = false;
    statusText.style.color = '';
    // timerStartMs stays null until the JX actually begins transmitting
    // FSK (set by the events.fskJustStarted branch in onTick above). Until
    // then we show "Waiting…" — the modal is open and listening, but no
    // dump has arrived yet, so the elapsed counter would lie by counting
    // user reaction time. Once timerStartMs is set, the tick switches to
    // the "Recording — Ns elapsed" form.
    timerStartMs = null;
    statusText.textContent = 'Waiting…';
    elapsedTimer = setInterval(() => {
      // Don't clobber a live warning message (any of the 4 ladder states)
      // by overwriting it with the elapsed-time tick.
      if (warnLevel) return;
      if (timerStartMs === null) {
        // FSK hasn't started yet; keep showing "Waiting…".
        return;
      }
      const elapsedSec = Math.floor((Date.now() - timerStartMs) / 1000);
      statusText.textContent = `Recording — ${elapsedSec}s elapsed`;
    }, 250);
  };

  // Changing the input device mid-capture: drop the current stream and
  // restart from scratch with the new device. Buffer + elapsed timer reset.
  // Also re-check this device's saved calibration — switching devices may
  // toggle between first-time-calibration and saved-cal modes.
  // v0.7.1: persist this pick as the preferred input device so the next
  // modal open pre-selects it (cross-session memory). Label cached so a
  // future unplugged state can render a meaningful ghost option.
  devicePicker.addEventListener('change', () => {
    const id = devicePicker.value || null;
    const opt = devicePicker.options[devicePicker.selectedIndex];
    const label = (opt && opt.textContent) || null;
    if (id) {
      ensureRecordCalibrationShape();
      library.record.preferredInputDeviceId    = id;
      library.record.preferredInputDeviceLabel = label;
      saveLibraryDebounced();
    }
    if (state !== 'recording') return;
    stopCapture();
    configureForCurrentDevice();
    guardAsync(startRecording(), 'Restart recording (device change)');
  });

  // Input gain slider — live update both the gain node (so the captured
  // PCM reflects the change immediately) and the value label.
  gainSlider.addEventListener('input', () => {
    const g = sliderToGain(parseInt(gainSlider.value, 10));
    gainValueLabel.textContent = formatGain(g);
    if (gainNode) gainNode.gain.value = g;
  });

  const stopRecording = async () => {
    if (state !== 'recording') return;
    state = 'processing';
    stopBtn.disabled = true;
    // (cancelBtn removed 2026-05-26 — close-X has its own state-guard
    // in its click handler that checks state === 'processing'.)
    statusText.textContent = 'Processing audio…';

    // Defensive backstop: if onTick's optimistic-Processing branch
    // never tripped (e.g. activeMs never reached txTotalEstSec because
    // the dump was very short or the bank estimate overshot), make
    // sure Processing is lit by the time we enter the decode phase.
    // Idempotent — no-op if onTick already activated it. Skipped in
    // calibration mode (timeline is hidden anyway).
    if (isCalibrating === false) activateProcessingSeg();
    console.log(`record-jx STOP: isCalibrating=${isCalibrating}, fskPeak=${fskPeak.toFixed(4)}, capturedChunks=${captured.length}, calDeviceId=${calibrationDeviceId}`);

    const totalSamples = captured.reduce((sum, c) => sum + c.length, 0);
    if (!totalSamples) {
      statusText.textContent = 'Nothing recorded. Try again.';
      stopCapture();
      state = 'recording';
      // Re-arm capture so the user can try again without re-opening the modal.
      guardAsync(startRecording(), 'Re-arm recording');
      return;
    }
    // Concatenate all captured chunks into one Float32Array.
    const all = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of captured) { all.set(chunk, offset); offset += chunk.length; }
    const actualSampleRate = audioContext ? audioContext.sampleRate : 44100;

    // ── Calibration pass branch ──────────────────────────────────────────
    // If isCalibrating, this Stop ends pass 1. We measure the FSK peak
    // amplitude (tracked live in tickMeter as fskPeak — populated only
    // AFTER the silence→signal marker fires, so it reflects real FSK, not
    // the JX's idle tone), compute the gain multiplier needed to land the
    // peak in the middle of the target zone (0.6), persist that per-device
    // calibration, and transition seamlessly back to recording for pass 2.
    // The user is told to press Save on the JX again.
    if (isCalibrating) {
      // Primary: use the FSK-only peak tracked in tickMeter (most accurate).
      // Fallback: full-buffer max amplitude. The silence→signal detector
      // can fail to fire when the input is at the silence-threshold edge
      // (low-gain capture of a quietly-buzzing idle tone), leaving fskPeak
      // at 0 even though there's real signal in the buffer. The full-buffer
      // peak still gives a usable calibration in that case — it just
      // includes any pre-FSK idle tone, which on a JX is typically similar
      // in amplitude to the FSK transmission anyway.
      let measurePeak = fskPeak;
      if (measurePeak < 0.001) {
        for (let i = 0; i < totalSamples; i++) {
          const v = Math.abs(all[i]);
          if (v > measurePeak) measurePeak = v;
        }
        if (measurePeak >= 0.001) {
          console.log(`record-jx: fskPeak was 0; falling back to full-buffer peak=${measurePeak.toFixed(4)}`);
        }
      }
      // Still nothing → wrong device or no input at all.
      if (measurePeak < 0.001) {
        statusText.textContent = '⚠ No audio signal detected. Check the input device selection and that the cable is connected. Then try again.';
        statusText.style.color = '#c39a3a';
        stopCapture();
        state = 'recording';
        stopBtn.disabled = false;
        captured = [];
        guardAsync(startRecording(), 'Restart recording (no signal)');
        return;
      }
      const currentGain = sliderToGain(parseInt(gainSlider.value, 10));
      // TARGET_PEAK = 0.78 puts pass-2 capture peak mid-amber (the "hot
      // but OK" zone, between 0.76 and 0.88). Bumped from 0.60 (mid-green)
      // on Daniel's 2026-05-24 observation that send-to-JX naturally hits
      // amber but capture-from-JX was landing in green — visual asymmetry
      // and SNR was lower than necessary. JX FSK has stable amplitude
      // (no transient peaks like music) so the tighter clipping headroom
      // (~12% to red) is safe.
      const TARGET_PEAK = 0.78;
      // Cap measurePeak at 0.95 before division. Without this, any
      // clipping transient during pass 1 (peak briefly hit 0.95–1.0)
      // would inflate measurePeak and make the saved gain too low,
      // producing a pass-2 peak well below the 0.6 target. The 0.95
      // cap pretends the clipping moment was just "loud, not clipped"
      // so the math produces a saved gain that actually lands pass 2
      // near the target. Combined with the fskPeak-reset-on-knob-adjust
      // logic above, this eliminates the "pass 2 reads lower than I
      // dialed in pass 1" UX surprise.
      const cappedMeasurePeak = Math.min(0.95, measurePeak);
      const rawNewGain  = currentGain * TARGET_PEAK / cappedMeasurePeak;
      // Clamp so we don't end up with absurd gain. 0.5×–30× covers the
      // span of the slider (and avoids near-zero attenuations that would
      // turn future captures into silence).
      const newGain = Math.max(0.5, Math.min(30, rawNewGain));

      setCalibratedGain(calibrationDeviceId, newGain, calibrationDeviceLabel);

      // Tear down this modal entirely and prompt the user to start pass 2
      // via a fresh recorder. This avoids fighting with startRecording's
      // statusText reset + the elapsedTimer overwriting the "calibration
      // done" message — two clean modal flows, no state-management
      // tangle. The recorder re-opens in single-pass mode because the
      // calibration we just saved exists for this device.
      // (Route through close() — not raw overlay.remove() — so the
      // devicechange listener gets unwired. Bypassing close() here
      // was leaking one listener per successful calibration, causing
      // cross-capture state pollution over the modal's lifetime.)
      close();

      const passOneKind = kind;
      const passOneOnCaptured = onCaptured;
      showConfirmModal({
        title: 'Calibration Complete!',
        body:
          `Input level calibrated for *${calibrationDeviceLabel || 'this input'}* — ` +
          `gain set to **${formatGain(newGain)}**, saved for future imports.\n\n` +
          'Click below to open the recorder again for the real capture.',
        confirmLabel: 'Continue to capture',
        onConfirm: () => {
          showRecordFromJxModal({ kind: passOneKind, onCaptured: passOneOnCaptured });
        },
      });
      return;
    }
    // ── End calibration branch ───────────────────────────────────────────

    // Find the actual FSK transmission inside the captured buffer.
    // Algorithm + rationale: see renderer/record-trim.js. Extracted
    // into a separate module so it's unit-testable in isolation;
    // computeFskTrim returns the sample index to trim before, plus
    // diagnostic flags for telemetry.
    const currentGainAtTrim = sliderToGain(parseInt(gainSlider.value, 10));
    const trimResult        = computeFskTrim(all, actualSampleRate, currentGainAtTrim);
    const trimStart         = trimResult.trimStart;
    const trimmed           = trimStart > 0 ? all.subarray(trimStart) : all;

    // Convert trimmed Float32 → 16-bit signed PCM bytes + measure peak
    // in one pass. See renderer/record-trim.js for the fused-loop
    // rationale and the asymmetric Int16 range note.
    const { pcm, peakAmp } = floatToInt16WithPeak(trimmed);
    // Visible feedback for debugging the trim path. The status text is
    // already replaced moments later with the peak-quality message, but
    // for ~200 ms it shows whether the trim fired and at what offset.
    if (trimStart > 0) {
      const trimSec = (trimStart / actualSampleRate).toFixed(2);
      console.log(`record-jx: trimmed ${trimStart} leading samples (${trimSec}s) of pre-signal noise`);
      statusText.textContent = `Trimmed ${trimSec}s of pre-FSK noise…`;
    } else {
      console.log('record-jx: no trim applied (no silence-then-signal pattern found, fallback longest-run yielded 0)');
      statusText.textContent = 'No leading-noise trim applied…';
    }
    stopCapture();

    const result = await window.api.recordToWav({
      pcm:        new Uint8Array(pcm),
      sampleRate: actualSampleRate,
      channels:   1,
      kind:       kind === 'sequence' ? 'sequence' : 'tone',
    });
    if (!result || !result.ok) {
      statusText.textContent = `Couldn't write WAV: ${result && result.error || 'unknown error'}`;
      state = 'recording';
      guardAsync(startRecording(), 'Restart recording (WAV write failed)');
      return;
    }
    // Light up every segment to mirror the send-modal's "complete" treatment.
    segs.forEach((s) => s.el.classList.add('active'));
    timeline.classList.add('complete');
    // Gain-quality feedback. Clean captures dismiss automatically; quiet
    // or clipping captures require an explicit user dismiss so the warning
    // can't be missed (3.5 s auto-dismiss was too easy to miss in testing).
    // Quiet captures also expose a "Try again" button — common case is the
    // user wants to re-record after adjusting input gain rather than
    // committing a likely-undecodable capture.
    const peakPct = Math.round(peakAmp * 100);
    const isQuiet    = peakAmp < 0.30;
    const isClipping = peakAmp > 0.95;
    let postMsg;
    if (isQuiet) {
      postMsg = `⚠ Captured — peak ${peakPct}%. Signal looks quiet. JP will boost on decode, but if your peak is below ~10% the decode often fails. Raise Mac input gain (System Settings → Sound → Input) and re-record for best results.`;
    } else if (isClipping) {
      postMsg = `⚠ Captured — peak ${peakPct}%. Close to clipping; consider lowering input gain next time.`;
    } else {
      postMsg = `✓ Captured cleanly — peak ${peakPct}%`;
    }
    statusText.textContent = postMsg;
    statusText.style.color = (isQuiet || isClipping) ? '#c39a3a' : '';

    if (!isQuiet && !isClipping) {
      // Clean capture — auto-proceed.
      // Route the modal dismissal through close() so the devicechange
      // listener is unwired (raw overlay.remove() bypasses that and
      // leaks one listener per successful capture). Cross-capture
      // listener accumulation was a confirmed cause of subtle audio-
      // pipeline pollution that intermittently corrupted FSK data and
      // forced full app reboots to recover.
      //
      // onCaptured is async (applyToneCapture / applySequencerCapture).
      // We can't surface contextual errors inline because close() has
      // already removed the modal — but we still want failures to land
      // in the global error banner instead of vanishing. The .catch()
      // re-throws via setTimeout(0) so window.unhandledrejection picks
      // it up; same pattern as the saveLibrary fix.
      setTimeout(() => {
        close();
        const captured = onCaptured(result.path, {
          deviceId: calibrationDeviceId, deviceLabel: calibrationDeviceLabel, capturePeak: runningPeak,
        });
        if (captured && typeof captured.catch === 'function') {
          captured.catch((err) => {
            console.error('Post-capture handoff failed:', err);
            setTimeout(() => { throw err; }, 0);
          });
        }
      }, 800);
      return;
    }

    // Quiet or clipping — sticky warning with three explicit choices:
    //   Try again   (green)  — re-record with the SAME gain; default action,
    //                          covers transient clipping that won't recur
    //   Calibrate   (blue)   — clear the saved gain + re-enter calibration
    //                          mode so the user can dial gain down. Used
    //                          when the warning's "consider lowering gain
    //                          next time" actually applies (gain is too
    //                          hot for THIS device + signal level).
    //   Use anyway  (red)    — accept the marginal capture; red signals
    //                          "this isn't recommended" (vs. the prior
    //                          blue treatment which read as a safe alt).
    // (Bail-out path: close-X in the modal's upper-right corner.)
    stopBtn.style.display = 'none';
    const tryAgainBtn = document.createElement('button');
    tryAgainBtn.className = 'modal-btn modal-btn-confirm';  // green
    tryAgainBtn.textContent = 'Try again';
    const calibrateBtn = document.createElement('button');
    calibrateBtn.className = 'modal-btn modal-btn-alt';     // blue
    calibrateBtn.textContent = 'Calibrate';
    const useBtn = document.createElement('button');
    useBtn.className = 'modal-btn modal-btn-danger';        // red — "are you sure?"
    useBtn.textContent = 'Use anyway';
    actions.appendChild(tryAgainBtn);
    actions.appendChild(calibrateBtn);
    actions.appendChild(useBtn);
    useBtn.addEventListener('click', () => {
      // Route through close() (not raw overlay.remove()) so the
      // devicechange listener is unwired. See auto-proceed branch
      // above for the listener-leak rationale + the .catch rationale.
      close();
      const captured = onCaptured(result.path, {
        deviceId: calibrationDeviceId, deviceLabel: calibrationDeviceLabel, capturePeak: runningPeak,
      });
      if (captured && typeof captured.catch === 'function') {
        captured.catch((err) => {
          console.error('Post-capture handoff failed:', err);
          setTimeout(() => { throw err; }, 0);
        });
      }
    });
    // Shared cleanup for Try Again + Calibrate — both reset the post-
    // capture UI back to a fresh-recording state. Calibrate does extra
    // work after this (clear gain + re-enter calibration mode).
    const resetPostCaptureUi = () => {
      try { actions.removeChild(tryAgainBtn); } catch {}
      try { actions.removeChild(calibrateBtn); } catch {}
      try { actions.removeChild(useBtn); } catch {}
      stopBtn.style.display = '';
      stopBtn.disabled = true;
      stopBtn.textContent = '■ Stop';
      statusText.textContent = '';
      statusText.style.color = '';
      segs.forEach((s) => s.el.classList.remove('active'));
      timeline.classList.remove('complete');
    };
    tryAgainBtn.addEventListener('click', () => {
      resetPostCaptureUi();
      state = 'recording';
      guardAsync(startRecording(), 'Restart recording (Try Again)');
    });
    calibrateBtn.addEventListener('click', () => {
      resetPostCaptureUi();
      // Clear the saved gain for this device so configureForCurrentDevice
      // takes the calibration branch (gain knob + level meter visible)
      // rather than re-using the high gain that caused the clipping
      // warning. The user dials the knob down while watching the meter,
      // then presses Save on the JX again to run a fresh calibration.
      // After calibration auto-completes, the modal transitions back to
      // capture mode and the next Save press runs the actual capture.
      if (calibrationDeviceId) clearCalibratedGain(calibrationDeviceId);
      configureForCurrentDevice();
      state = 'recording';
      guardAsync(startRecording(), 'Restart recording (Calibrate)');
    });
  };

  // Small helper: surface async failures via the global error banner
  // AND recover the modal's state so a single failed call doesn't
  // permanently lock the UI (e.g. state === 'processing' with no path
  // out). Use for any async function called from a fire-and-forget
  // event handler inside this modal. window.unhandledrejection would
  // catch these anyway, but the state-recovery here is what prevents
  // a stuck modal.
  const guardAsync = (promise, ctx) => {
    if (!promise || typeof promise.catch !== 'function') return;
    promise.catch((err) => {
      console.error(`${ctx} failed:`, err);
      // Recover from a stuck 'processing' state — the worst lock-out
      // condition. 'recording' state can be aborted by the user via
      // the close-X (which is gated on state !== 'processing'), so
      // it's self-healing once we drop back to 'recording'.
      if (state === 'processing') {
        state = 'recording';
        stopBtn.disabled = false;
        statusText.textContent = `${ctx} failed — ${err && err.message || 'unknown error'}`;
        statusText.style.color = '#b94a2e';
      }
      // Re-throw on the next tick so the global error banner picks
      // it up too — contextual message above, banner stack below.
      setTimeout(() => { throw err; }, 0);
    });
  };

  stopBtn.addEventListener('click', () => guardAsync(stopRecording(), 'Stop recording'));

  // Kick off the capture immediately. macOS will fire the mic-permission
  // prompt on first run; the recording UI is already visible behind it so
  // the user knows what they're granting permission for. Guarded so a
  // permission rejection (or other startup failure) surfaces a contextual
  // message in the modal instead of just spinning forever with no UI cue.
  guardAsync(startRecording(), 'Start recording');
}

function saveSequenceEntry({ tapeData = null, patchNote = '', defaultName = null, customName = '', sequenceMeta = null } = {}) {
  if (!library) return;
  const now = new Date();
  // pairedPatch precedence: chunk wins (the original creator's intended
  // patch) over current active C/D selection (which was the right default
  // for Record-from-JX before chunk-import existed, but is irrelevant when
  // a chunk carries the actual paired patch).
  let pairedPatch;
  if (sequenceMeta && sequenceMeta.pairedPatch) {
    pairedPatch = { ...sequenceMeta.pairedPatch };
  } else {
    const { bank, slot } = activeBankSelection();
    pairedPatch = {
      bank,
      slot,
      params:    JSON.parse(JSON.stringify(activeBankPatch() || {})),
      patchName: patchName(bank, slot),
    };
  }
  const entry = {
    id: now.toISOString(),
    // Prefer a name derived from the source filename ("Sequence 2", etc.) so
    // imports stay recognizable at a glance. Falls back to the date-stamped
    // default when the caller can't supply one (e.g. unknown source).
    defaultName: defaultName || sequenceDefaultName(now),
    // customName is the optional user override, set in the import modal
    // when the user edits the pre-filled name. Empty = no override, display
    // shows defaultName.
    customName: customName || '',
    // originalName: from chunk if present (preserves attribution to the
    // FIRST creator across cross-user trades); else derive lazily from
    // customName / defaultName at first export (see handleSendSequenceToJX).
    originalName: (sequenceMeta && sequenceMeta.originalName) || '',
    // createdAt: from chunk if present (preserves the FIRST creation date
    // across trades); else now (this is a new entry created in our library).
    createdAt: (sequenceMeta && sequenceMeta.createdAt) || now.toISOString(),
    savedAt: now.toISOString(),
    tape: {
      pages: tapeData && Array.isArray(tapeData.pages) ? tapeData.pages : null,
    },
    app: {
      patchNote: patchNote || '',
      pairedPatch,
    },
  };
  if (!Array.isArray(library.sequences)) library.sequences = [];
  library.sequences.unshift(entry);
  pendingSaveAnimationId = entry.id;
  selLibTab = 'sequences';
  saveLibraryDebounced();

  // Navigate to Library > Sequences so the new entry is visible and animates in.
  selBank = 'L';
  selSlot = 0;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.bank === 'L');
  });
  renderPatchList();
}

function handleSequencerLoad() {
  // If the user already has a sequence selected, mirror the "send to JX-3P"
  // action button by opening the send modal. Otherwise navigate to Library →
  // Sequences so they can pick one first (the previous behaviour).
  if (selBank === 'L' && selLibTab === 'sequences' && selSequence !== null) {
    handleSendSequenceToJX();
    return;
  }
  selBank = 'L';
  selSlot = 0;
  selLibTab = 'sequences';
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.bank === 'L');
  });
  renderPatchList();
}

// Scan library.sequences[].defaultName for the JP_sequence_N pattern and
// return max+1 (or 1 if no matches). Scans defaultName ONLY, not customName
// — because defaultName is what we set (we know the pattern); customName
// is user-set (could be anything). So even if the user renames
// JP_sequence_3 to "Friday Morning" via customName, defaultName still
// reads "JP_sequence_3" and the next capture correctly increments to 4.
function nextSequenceCounter() {
  const sequences = (typeof library === 'object' && Array.isArray(library?.sequences)) ? library.sequences : [];
  let max = 0;
  for (const s of sequences) {
    const dn = s && s.defaultName;
    if (typeof dn !== 'string') continue;
    const m = dn.match(/^JP_sequence_(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}

// Default name for a newly captured/saved sequence. Returns "JP_sequence_N"
// where N is the next unused integer in library.sequences[].defaultName
// (see nextSequenceCounter). The `date` parameter is kept for callsite-
// compatibility but ignored — counter-based is more grokable than the
// prior "Sequence June 1, 2026" format for the kind of user who'll have
// dozens of captures (you can see "JP_sequence_47" and know it's the
// 47th, vs scanning a wall of similar dates).
//
// Pre-existing entries with date-based defaultNames stay as-is — the
// counter starts at 1 (or wherever the highest existing N + 1 lands)
// when this code first runs in a given library.
function sequenceDefaultName(/* date — kept for callsite compat; ignored */) {
  return `JP_sequence_${nextSequenceCounter()}`;
}

// (wireTapeButtons replaced by setupInteraction's button delegation.)

// ═══════════════════════════════════════════════════════════════
// Custom Bank Builder
// ═══════════════════════════════════════════════════════════════
//
// Persistent staging area where the user assembles a new C/D bank by dragging
// patches from active C/D banks. Buckets persist across navigation AND across
// app restarts (stored in library.customBuckets). When the user hits Save, the
// buckets are snapshotted into a new library.packages[] entry — same shape as
// "save C/D banks to library" but with default name "Custom C/D banks {date}"
// and empty slots padded with a silent default patch.

// Read-only piano-roll visualization of the selected Library sequence
// (2026-05-25). Renders below the panel SVG, sharing the custom-bank
// builder's screen real-estate (whichever is appropriate wins — see
// renderCustomBuilder's onSeqsWithSel hand-off).
//
// Layout: SVG with viewBox 16N × 49 where N is # pages in view (8 in
// the all-pages overview, 1 when zoomed into a single page).
//   - X axis: 16 steps per page, divider lines every 16 (only visible
//     in the all-pages view)
//   - Y axis: 49 rows (MIDI pitches 36–84, JX-3P keyboard range), high
//     pitches at top
//   - Each populated voice slot at (step, pitch) renders as a Roland-
//     green block. Tied notes (voice.tied === true) render at 55 %
//     opacity to distinguish from new note attacks.
//
// Page buttons below the SVG let the user zoom into one 16-step page
// (much larger note cells, easier to read) or back out to ALL.
// `preserveAspectRatio="none"` so the SVG stretches to fill its host
// — container CSS decides the rendered aspect ratio.

// Document-level mousemove/mouseup for the sequencer drag-pitch
// gesture. Wired exactly once (guarded by seqDragListenersWired)
// since renderSequenceVisualizer runs many times per session and we
// don't want to leak listeners on every re-render. Both handlers no-
// op when seqDragState is null (i.e. no drag in progress).
//
// The gesture geometry uses seqDragState.svgRect (captured at
// mousedown) instead of re-measuring on every move — avoids forcing
// reflow on every cursor pixel.
function setupSeqDragListenersOnce() {
  if (seqDragListenersWired) return;
  seqDragListenersWired = true;

  // Pitch range constants mirror renderSequenceVisualizer's locals.
  // Kept in sync manually — both are constants for the JX-3P (MIDI
  // 36–84, 49 semitones) and unlikely to change.
  const LOW_PITCH   = 36;
  const HIGH_PITCH  = 84;
  const PITCH_RANGE = HIGH_PITCH - LOW_PITCH + 1;

  // Playhead-drag mousemove: scrub the playhead to the cursor X +
  // play notes at reduced volume as the cursor crosses into new
  // steps. Runs independently of the pitch-drag + marquee handlers
  // — only one is active at a time (mousedown filters by target).
  document.addEventListener('mousemove', (e) => {
    if (!seqPlayheadDragState) return;
    scrubPlayheadTo(seqPlayheadDragState.svgRect, e.clientX,
                    { playOnChange: true, gainScale: 0.2 });
  });
  document.addEventListener('mouseup', () => {
    if (!seqPlayheadDragState) return;
    seqPlayheadDragState = null;
    seqPlayheadDragSuppressClick = true;
  });

  // Marquee-drag mousemove: recompute the selection live so the user
  // sees notes highlight as they drag. Column-constrained — horizontal
  // cursor motion is ignored (the column is fixed at mousedown).
  // Clamp pitch to the JX range so the selection range stays bounded.
  document.addEventListener('mousemove', (e) => {
    if (!seqMarqueeState) return;
    const { svgRect, absStep, startPitch } = seqMarqueeState;
    const PITCH_RANGE = 49;
    const HIGH_PITCH  = 84;
    const LOW_PITCH   = 36;
    const yRatio = (e.clientY - svgRect.top) / svgRect.height;
    let currentPitch = HIGH_PITCH - Math.floor(yRatio * PITCH_RANGE);
    if (currentPitch < LOW_PITCH)  currentPitch = LOW_PITCH;
    if (currentPitch > HIGH_PITCH) currentPitch = HIGH_PITCH;
    seqMarqueeState.currentPitch = currentPitch;
    // Recompute the selection set: every populated voice in the column
    // whose pitch falls within [lo, hi]. Re-apply the .selected visual
    // so the user sees the highlights expand/contract as they drag.
    const hi = Math.max(startPitch, currentPitch);
    const lo = Math.min(startPitch, currentPitch);
    const STEPS_PER_PAGE = 16;
    const seq = library.sequences && library.sequences[selSequence];
    const pages = (seq && seq.tape && Array.isArray(seq.tape.pages)) ? seq.tape.pages : [];
    const page = pages[Math.floor(absStep / STEPS_PER_PAGE)];
    const step = page && page[absStep % STEPS_PER_PAGE];
    const selectedPitches = new Set();
    if (step && Array.isArray(step.voices)) {
      step.voices.forEach((v) => {
        if (v && typeof v.note === 'number' && v.note >= lo && v.note <= hi) {
          selectedPitches.add(v.note);
        }
      });
    }
    // Clear previous .selected classes (without nuking selectedSeqNotes
    // mid-drag, since we're about to repopulate it).
    document.querySelectorAll('.seq-viz-note.selected').forEach((el) => el.classList.remove('selected'));
    selectedSeqNotes = Array.from(selectedPitches).map((pitch) => ({ pitch, absStep }));
    applySequenceSelectionVisual();
  });
  document.addEventListener('mouseup', () => {
    if (!seqMarqueeState) return;
    seqMarqueeState = null;
    // Selection was already set live by mousemove. Just suppress the
    // post-mouseup click so it doesn't immediately clear the
    // just-formed selection (the click handler treats empty-svg
    // clicks as "deselect").
    seqMarqueeSuppressClick = selectedSeqNotes.length > 0;
  });

  document.addEventListener('mousemove', (e) => {
    if (!seqDragState) return;
    const { svgRect, tipEl } = seqDragState;

    // Cursor Y → MIDI pitch, snapped + clamped to the JX range.
    const yRatio   = (e.clientY - svgRect.top) / svgRect.height;
    let newPitch   = HIGH_PITCH - Math.floor(yRatio * PITCH_RANGE);
    if (newPitch < LOW_PITCH)  newPitch = LOW_PITCH;
    if (newPitch > HIGH_PITCH) newPitch = HIGH_PITCH;

    if (newPitch !== seqDragState.currentPitch) {
      seqDragState.currentPitch = newPitch;
      // "Moved" = pitch changed away from start, even by 1 semitone.
      // Simpler + more semantically accurate than pixel-distance: a
      // user who carefully moves 2 px without crossing a semitone
      // boundary isn't dragging, they're clicking.
      if (newPitch !== seqDragState.startPitch) seqDragState.moved = true;
      // Live-update the rect's y attribute. SVG y coord = (HIGH_PITCH
      // - pitch), matching the construction in renderSequenceVisualizer.
      // Group-drag: shift every member by the SAME Δpitch as the
      // dragged note, clamped to JX pitch range. Member's startPitch
      // (captured at mousedown) + delta = new y.
      const deltaPitch = newPitch - seqDragState.startPitch;
      if (seqDragState.groupMembers) {
        seqDragState.groupMembers.forEach((m) => {
          let memberNewPitch = m.startPitch + deltaPitch;
          if (memberNewPitch < LOW_PITCH)  memberNewPitch = LOW_PITCH;
          if (memberNewPitch > HIGH_PITCH) memberNewPitch = HIGH_PITCH;
          m.rectEl.setAttribute('y', String(HIGH_PITCH - memberNewPitch));
        });
      } else {
        seqDragState.rect.setAttribute('y', String(HIGH_PITCH - newPitch));
      }
      // Update the tooltip text to the new pitch name so the user
      // sees the current target pitch in real time as they drag.
      if (tipEl) tipEl.textContent = midiPitchName(newPitch);
      // Quiet audible preview at the new pitch (20% gain — each
      // semitone crossing fires one note). Drop-preview in the
      // mouseup handler plays full volume so the final note is
      // distinct from the mid-drag scrubbing. Iterated 50% → 20%
      // → 10% → 20% on 2026-05-26 with the triangle wave; 20%
      // is the sweet spot for the softer waveform.
      // Duration omitted → uses the synth-preview default (180 ms).
      previewNote(newPitch, undefined, 0.2);
    }
    // Keep the tooltip glued to the cursor for the whole gesture —
    // outside of the pitch-change branch above so it tracks smoothly
    // even when the cursor moves within a single semitone band.
    // Force hidden=false in case something else flipped it (the
    // hover-tip handler is gated on !seqDragState so it shouldn't,
    // but defensive).
    if (tipEl) {
      tipEl.hidden     = false;
      tipEl.style.left = `${e.clientX + 14}px`;
      tipEl.style.top  = `${e.clientY - 18}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (!seqDragState) return;
    const { startPitch, currentPitch, absStep, moved, groupMembers } = seqDragState;
    seqDragState = null;
    document.body.classList.remove('seq-dragging-pitch');

    if (!moved || currentPitch === startPitch) {
      // No real drag — let the click handler do its normal thing.
      // (Don't set seqDragSuppressClick.)
      return;
    }

    // Suppress the upcoming click event (fires after mouseup) so we
    // don't get a phantom preview at the dropped pitch.
    seqDragSuppressClick = true;

    // Mutate the underlying sequence data. The mutation rule mirrors
    // the visual: a single cell at pitch P represents ALL voices at
    // that pitch in that step. So we update every voice in the step
    // whose note matches startPitch — that catches:
    //   - 'attack' case: one voice {note: P, tied: false}
    //   - 'tie' case:    voice[0] {note: P, tied: true} AND another
    //                    voice {note: P, tied: false}
    // Both get moved to currentPitch together, preserving the TIE
    // signature (same pitch in both voice slots).
    const STEPS_PER_PAGE = 16;
    const seq   = library.sequences && library.sequences[selSequence];
    const pages = (seq && seq.tape && Array.isArray(seq.tape.pages)) ? seq.tape.pages : [];
    const pageIdx = Math.floor(absStep / STEPS_PER_PAGE);
    const stepIdx = absStep % STEPS_PER_PAGE;
    const page    = pages[pageIdx];
    const step    = page && page[stepIdx];
    // Snapshot the original BEFORE the first mutation per-sequence.
    // SAVE will restore from this snapshot so the original is preserved
    // when the edits land in the library as a new "edited" copy.
    if (!originalSequenceSnapshots.has(selSequence)) {
      originalSequenceSnapshots.set(selSequence, cloneSeq(library.sequences[selSequence]));
    }
    // Snapshot for editor undo — captures pre-mutation state of the
    // whole sequence so undo restores correctly even for group drags
    // that touch multiple steps across pages.
    const beforeSeq = seq ? cloneSeq(seq) : null;

    const deltaPitch = currentPitch - startPitch;
    if (groupMembers) {
      // Group drag: shift every member by the SAME Δpitch (clamped).
      // For each member, update every voice in its step whose note
      // matches the member's startPitch.
      groupMembers.forEach((m) => {
        let memberNewPitch = m.startPitch + deltaPitch;
        if (memberNewPitch < LOW_PITCH)  memberNewPitch = LOW_PITCH;
        if (memberNewPitch > HIGH_PITCH) memberNewPitch = HIGH_PITCH;
        const mPageIdx = Math.floor(m.absStep / STEPS_PER_PAGE);
        const mStepIdx = m.absStep % STEPS_PER_PAGE;
        const mPage    = pages[mPageIdx];
        const mStep    = mPage && mPage[mStepIdx];
        if (mStep && Array.isArray(mStep.voices)) {
          mStep.voices.forEach((voice) => {
            if (voice && voice.note === m.startPitch) voice.note = memberNewPitch;
          });
        }
      });
    } else if (step && Array.isArray(step.voices)) {
      // Single-note drag: update every voice in the step whose note
      // matches startPitch (catches the TIE-pair case correctly).
      step.voices.forEach((voice) => {
        if (voice && voice.note === startPitch) voice.note = currentPitch;
      });
    }

    // Mark this sequence as having uncommitted edits. The visualizer
    // header reads dirtySequences in its render to decide whether to
    // show the SAVE button.
    dirtySequences.add(selSequence);
    maybeClearDirty(selSequence);
    if (beforeSeq) {
      pushSeqEditUndo(beforeSeq, cloneSeq(library.sequences[selSequence]));
    }
    clearSequenceSelection();

    // Preview the landed pitch — for group drag, preview the dragged
    // note's pitch (the rest of the group is the same Δ so a single
    // tone conveys "drop happened" without spamming).
    previewNote(currentPitch);

    renderSequenceVisualizer();
  });
}

function renderSequenceVisualizer() {
  setupSeqDragListenersOnce();   // idempotent — wires document-level mousemove/mouseup once
  setupSeqKeyListenerOnce();     // idempotent — wires Delete / Backspace / Escape
  const container = document.getElementById('sequence-visualizer');
  if (!container) return;
  if (selBank !== 'L' || selLibTab !== 'sequences' || selSequence === null) {
    container.hidden = true;
    return;
  }
  const seq = library.sequences && library.sequences[selSequence];
  if (!seq) { container.hidden = true; return; }

  const PAGES           = 8;
  const STEPS_PER_PAGE  = 16;
  const TOTAL_STEPS     = PAGES * STEPS_PER_PAGE;     // 128
  const LOW_PITCH       = 36;                          // C2
  const HIGH_PITCH      = 84;                          // C6
  const PITCH_RANGE     = HIGH_PITCH - LOW_PITCH + 1;  // 49

  // Color encoding (2026-05-25, extended with TIE 2026-05-25 evening):
  //   - New note attack    → Roland red    #b94a2e (primary event)
  //   - Tied note (hold)   → Roland green  #1f6e5b (continuation, OR
  //     REST-button press — see CLAUDE.md pitfall #16; they're
  //     indistinguishable when only voice[0] is populated)
  //   - TIE event          → Roland blue   #33508f (tied voice[0] AND
  //     new attack voice[1] at SAME pitch in the same step — the JX
  //     TIE-button signature, per pitfall #16). Same hex as REST_COLOR
  //     but visually distinct: TIE is a single full-opacity cell;
  //     REST is a full-column tint at 18% opacity.
  //   - Rest (silent step) → Roland blue   #33508f (absence indicator,
  //     drawn as a full-column tint at low opacity so it reads as
  //     "this step is silent" without competing with note bars)
  const NEW_NOTE_COLOR  = '#b94a2e';
  const HOLD_NOTE_COLOR = '#1f6e5b';
  const TIE_COLOR       = '#33508f';
  const REST_COLOR      = '#33508f';

  const pages = (seq.tape && Array.isArray(seq.tape.pages)) ? seq.tape.pages : [];
  // populatedCount text was removed earlier 2026-05-26 (rationale: the
  // page-button row at the bottom communicates the same info via
  // faded-vs-not-faded buttons) and restored later that day at Daniel's
  // request — the explicit count is more glanceable than reading the
  // page-button dimming state.
  const populatedCount = pages.filter((p) => p != null).length;

  const seqName = seq.customName || seq.defaultName || '(unnamed sequence)';
  // (Paired-patch reference removed from the header 2026-05-26 — was
  // visual noise that pushed the SAVE button off on narrow widths.
  // The paired-patch info is still in seq.app.pairedPatch on disk
  // and surfaced via the per-row info icon in the sequences list.)

  // Determine viewBox: zoomed into one page (offset = pageIdx * 16)
  // or showing all pages (offset = 0, width = 128).
  const zoomedPage = (selSeqVizPage !== null && selSeqVizPage >= 0 && selSeqVizPage < PAGES)
    ? selSeqVizPage : null;
  const viewBoxX     = zoomedPage !== null ? zoomedPage * STEPS_PER_PAGE : 0;
  const viewBoxWidth = zoomedPage !== null ? STEPS_PER_PAGE : TOTAL_STEPS;

  // Build the SVG content. Background grid lines first, notes on top.
  const svgParts = [];

  // Page divider lines (only meaningful in all-pages view — not visible
  // in zoom since the viewBox excludes them anyway)
  if (zoomedPage === null) {
    for (let p = 1; p < PAGES; p++) {
      const x = p * STEPS_PER_PAGE;
      svgParts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${PITCH_RANGE}" stroke="#222" stroke-width="0.08"/>`);
    }
  }
  // Per-step verticals in the zoomed view — gives a sense of "16 steps"
  // when only one page is visible.
  if (zoomedPage !== null) {
    for (let s = 1; s < STEPS_PER_PAGE; s++) {
      const x = viewBoxX + s;
      svgParts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${PITCH_RANGE}" stroke="#161616" stroke-width="0.02"/>`);
    }
  }
  // Horizontal lines at each C (visual pitch anchor — C2, C3, C4, C5, C6)
  for (let pitch = 36; pitch <= 84; pitch += 12) {
    const y = HIGH_PITCH - pitch;
    svgParts.push(`<line x1="${viewBoxX}" y1="${y + 0.5}" x2="${viewBoxX + viewBoxWidth}" y2="${y + 0.5}" stroke="#1c1c1c" stroke-width="0.04"/>`);
  }

  // Pass 1 — rest indicators (low layer, drawn before notes).
  // A "rest" is a step where every voice slot is empty. Null pages
  // (user never reached/programmed them) are treated as 16 rests.
  // Rendered as a faint full-height blue column so it reads as
  // "silent step" without overwhelming the notes themselves.
  for (let pageIdx = 0; pageIdx < PAGES; pageIdx++) {
    if (zoomedPage !== null && pageIdx !== zoomedPage) continue;
    const page = pages[pageIdx];
    for (let s = 0; s < STEPS_PER_PAGE; s++) {
      const absStep = pageIdx * STEPS_PER_PAGE + s;
      let isRest;
      if (!page) {
        isRest = true;   // entire page absent = all rests
      } else {
        const step = page[s];
        isRest = !step || !Array.isArray(step.voices) || !step.voices.some((v) => v != null);
      }
      if (isRest) {
        svgParts.push(
          `<rect x="${absStep}" y="0" width="1" height="${PITCH_RANGE}" ` +
          `fill="${REST_COLOR}" opacity="0.18"/>`
        );
      }
    }
  }

  // Pass 2 — notes (filtered to visible page range when zoomed —
  // small perf win and avoids off-canvas geometry for pathological
  // out-of-range pitches).
  pages.forEach((page, pageIdx) => {
    if (!page) return;
    if (zoomedPage !== null && pageIdx !== zoomedPage) return;
    page.forEach((step, stepIdx) => {
      if (!step || !Array.isArray(step.voices)) return;
      const absStep = pageIdx * STEPS_PER_PAGE + stepIdx;
      // Per-pitch classification at this step. We walk all 7 voice
      // slots first to decide what each pitch IS before painting,
      // because the JX TIE-button event surfaces as TWO voices at the
      // same pitch in the same step (one tied, one new attack) — and
      // we want to render that as a single amber cell, not as a red
      // cell over a green cell (which is what the old per-voice paint
      // loop produced). See CLAUDE.md pitfall #16.
      const cellType = new Map();   // pitch → 'attack' | 'tie' | 'hold-rest'
      step.voices.forEach((voice) => {
        if (!voice || typeof voice.note !== 'number') return;
        const pitch = voice.note;
        if (pitch < LOW_PITCH || pitch > HIGH_PITCH) return;
        const prev = cellType.get(pitch);
        if (voice.tied) {
          if      (prev === 'attack')     cellType.set(pitch, 'tie');
          else if (prev === undefined)    cellType.set(pitch, 'hold-rest');
          // 'tie' or 'hold-rest' already → keep
        } else {
          if      (prev === 'hold-rest')  cellType.set(pitch, 'tie');
          else if (prev === undefined)    cellType.set(pitch, 'attack');
          // 'tie' or 'attack' already → keep
        }
      });
      cellType.forEach((type, pitch) => {
        const y = HIGH_PITCH - pitch;
        const color = type === 'attack' ? NEW_NOTE_COLOR
                    : type === 'tie'    ? TIE_COLOR
                    :                     HOLD_NOTE_COLOR;
        // data-pitch + data-type drive the delegated click + drag
        // handlers below (wired on rollSvg). data-step lets the drag
        // handler locate the source voice(s) without parsing the x
        // attribute. The .seq-viz-note class scopes the cursor:pointer
        // affordance to playable cells only — CSS rules filter by
        // [data-type="attack"|"tie"] so hold-rest cells don't claim
        // interactivity they can't deliver.
        svgParts.push(
          `<rect class="seq-viz-note" data-pitch="${pitch}" ` +
          `data-type="${type}" data-step="${absStep}" ` +
          `x="${absStep}" y="${y}" width="1" height="1" ` +
          `fill="${color}" rx="0.15"/>`
        );
      });
    });
  });

  // Page selector buttons. "ALL" + 1–8. Active button = currently
  // viewed (or all-view). Click an inactive page to zoom; click the
  // active page (or ALL) to reset.
  // Page buttons. Each per-page button gets a .unpopulated modifier
  // when the page has no content (no voices anywhere); the CSS dims
  // these so the user can see at a glance which pages are populated.
  // Clicks still work on faded buttons (zoom into an empty page →
  // user can Ctrl-click to insert; the page initializes on demand
  // via _prepStepForInsert + the button un-fades on the next render).
  // The ALL button is faded when the whole sequence has no content.
  const anyPopulated = pages.some(pageHasContent);
  const allCls = 'seq-viz-page-btn' +
                 (zoomedPage === null ? ' active' : '') +
                 (anyPopulated ? '' : ' unpopulated');
  const pageBtns = [`<button class="${allCls}" data-page="all">ALL</button>`];
  for (let i = 0; i < PAGES; i++) {
    const isActive    = zoomedPage === i;
    const isPopulated = pageHasContent(pages[i]);
    const cls = 'seq-viz-page-btn' +
                (isActive    ? ' active'      : '') +
                (isPopulated ? ''             : ' unpopulated');
    pageBtns.push(`<button class="${cls}" data-page="${i}">${i + 1}</button>`);
  }

  // Piano keyboard column with realistic piano proportions:
  //   - 7 white keys per octave, each equal vertical height
  //   - 5 black keys per octave, narrower horizontally (~65 %) AND
  //     shorter vertically (~70 %), centered on the boundary between
  //     the two white keys they sit between
  // Uses a separate viewBox sized in WHITE-KEY units (29 total = 4
  // octaves × 7 + 1 for the top C), not semitones. The roll keeps
  // its 49-semitone grid; both SVGs share the same flex height so
  // they occupy the same vertical space. Pitch alignment between
  // roll-row and keyboard-key is approximate (linear-in-semitones
  // vs linear-in-white-keys diverge slightly per row); user reads
  // exact pitch from the hover tooltip.
  const KBD_WIDTH         = 6;
  const BLACK_KEY_WIDTH   = KBD_WIDTH * 0.65;
  const BLACK_KEY_HEIGHT  = 0.7;
  const WHITE_SEMITONES   = [0, 2, 4, 5, 7, 9, 11];   // C D E F G A B (within an octave)
  // White-key index from LOW_PITCH (0 = C1 at bottom, ascends upward).
  const whiteKeyIdx = (midiPitch) => {
    const octavesUp = Math.floor((midiPitch - LOW_PITCH) / 12);
    const semitone  = ((midiPitch % 12) + 12) % 12;
    const idxInOct  = WHITE_SEMITONES.indexOf(semitone);
    if (idxInOct === -1) return null;
    return octavesUp * 7 + idxInOct;
  };
  // Total whites: 4 octaves × 7 + 1 (top C5) = 29
  const TOTAL_WHITES   = 29;
  const KBD_VIEW_HEIGHT = TOTAL_WHITES;
  // Convert white-key index → y coord in keyboard viewBox (top = highest pitch)
  const whiteKeyY = (idx) => (TOTAL_WHITES - 1) - idx;

  // Each key rect carries a data-pitch attribute so the hover handler
  // (wired below the SVG render) can identify which note the cursor
  // is over. C-label text removed — was too small to read at this
  // scale; the hover tooltip now serves that role.
  const kbdParts = [];
  // Pass 1 — white keys (full width, 1 unit tall in white-key space).
  for (let p = LOW_PITCH; p <= HIGH_PITCH; p++) {
    if (!isWhiteKey(p)) continue;
    const idx = whiteKeyIdx(p);
    if (idx === null) continue;
    const y = whiteKeyY(idx);
    kbdParts.push(
      `<rect class="seq-viz-key seq-viz-key-white" data-pitch="${p}" ` +
      `x="0" y="${y}" width="${KBD_WIDTH}" height="1" ` +
      `fill="#cbc4b4" stroke="#0a0a0a" stroke-width="0.05"/>`
    );
  }
  // Pass 2 — black keys, centered on the boundary between adjacent
  // whites. For a black key at MIDI p, the white BELOW (p−1) gives
  // us the lower neighbor; its TOP edge (y = whiteY) is where the
  // boundary is. We center the black key on that boundary.
  for (let p = LOW_PITCH; p <= HIGH_PITCH; p++) {
    if (isWhiteKey(p)) continue;
    const idxBelow = whiteKeyIdx(p - 1);
    if (idxBelow === null) continue;
    const yWhiteBelow = whiteKeyY(idxBelow);
    const blackY      = yWhiteBelow - BLACK_KEY_HEIGHT / 2;
    kbdParts.push(
      `<rect class="seq-viz-key seq-viz-key-black" data-pitch="${p}" ` +
      `x="0" y="${blackY}" width="${BLACK_KEY_WIDTH}" height="${BLACK_KEY_HEIGHT}" ` +
      `fill="#1a1a1a" rx="0.05"/>`
    );
  }

  // SAVE button: shown only when the current sequence has uncommitted
  // edits (a drag-pitch landed in the current session). Right-justified
  // in the header per Daniel's spec ("SAVE button appears in upper right
  // of the header (to the right of the sequence name, justified right)").
  // The button uses the Roland-green confirm class for parity with the
  // "go / commit" affordances elsewhere in the app.
  const isDirty = dirtySequences.has(selSequence);
  const saveBtnHtml = isDirty
    ? `<button class="seq-viz-save-btn" type="button" title="Save edits to library">SAVE</button>`
    : '';

  container.hidden = false;
  container.innerHTML =
    `<div class="seq-viz-header">` +
      `<div class="seq-viz-header-text">` +
        `<span class="seq-viz-name">${escapeHtml(seqName)}</span>` +
        ` · ${populatedCount} of ${PAGES} pages populated` +
      `</div>` +
      saveBtnHtml +
    `</div>` +
    `<div class="seq-viz-row">` +
      `<svg class="seq-viz-keyboard" viewBox="0 0 ${KBD_WIDTH} ${KBD_VIEW_HEIGHT}" ` +
           `preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">` +
        kbdParts.join('') +
      `</svg>` +
      `<svg class="seq-viz-svg" viewBox="${viewBoxX} 0 ${viewBoxWidth} ${PITCH_RANGE}" ` +
           `preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">` +
        svgParts.join('') +
      `</svg>` +
    `</div>` +
    // (Sequential entry row removed 2026-05-26.)
    // Bottom controls row: ▶/⏸ play button + rate input + page
    // buttons, same horizontal level. Reads as a unified "playback +
    // navigation" strip. Rate input is a native number field
    // (browser handles increment/keyboard), clamped 1–100 — value is
    // the percentage of the JX-3P's default sequencer tempo (100% =
    // ~125 ms/step, 50% default = 250 ms/step).
    `<div class="seq-viz-controls-row">` +
      `<button class="seq-viz-play-btn" type="button" title="Play / Pause (double-click to reset)">▶</button>` +
      // Repeat (:||) toggle — when active, playback loops the active steps
      // (the JX repeats after the last entry). Roland-green when on. The
      // glyph is a hand-drawn end-repeat barline: two dots, thin line,
      // thick line, reading left→right as ":||".
      `<button class="seq-viz-repeat-btn${seqPlayRepeat ? ' active' : ''}" type="button" ` +
        `aria-pressed="${seqPlayRepeat}" title="Repeat — loop the active steps (JX-style)">` +
        `<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">` +
          `<circle cx="3.4" cy="5.6" r="1.05" fill="currentColor"/>` +
          `<circle cx="3.4" cy="10.4" r="1.05" fill="currentColor"/>` +
          `<line x1="6.5" y1="2.6" x2="6.5" y2="13.4" stroke="currentColor" stroke-width="1"/>` +
          `<rect x="8.6" y="2.6" width="2.3" height="10.8" fill="currentColor"/>` +
        `</svg>` +
      `</button>` +
      // Rate control: collapsed default shows just [number][%][›]
      // (carrot pointing right invites expansion). Expanded reveals
      // the slider to the left of the number, carrot flips to ‹ for
      // collapse. seqRateSliderExpanded persists in module scope so
      // the chosen state survives re-renders.
      `<div class="seq-viz-rate-wrap${seqRateSliderExpanded ? ' expanded' : ''}" title="Playback speed (1–100% of typical JX tempo)">` +
        `<input class="seq-viz-rate-slider" type="range" min="1" max="100" step="1" value="${seqPlayRatePct}">` +
        `<input class="seq-viz-rate" type="number" min="1" max="100" step="1" value="${seqPlayRatePct}">` +
        `<span class="seq-viz-rate-suffix">%</span>` +
        `<button class="seq-viz-rate-toggle" type="button" title="Show / hide rate slider">${seqRateSliderExpanded ? '‹' : '›'}</button>` +
      `</div>` +
      `<div class="seq-viz-pages">` + pageBtns.join('') + `</div>` +
    `</div>` +
    `<div class="seq-viz-hover-tip" hidden></div>`;

  // Wire SAVE button (present only when current sequence is dirty).
  //
  // Save-as-new-copy semantic (chosen 2026-05-26 over save-over):
  // every dirty sequence has its ORIGINAL restored from snapshot at
  // its original index AND a new copy (with the user's edits) appended
  // to library.sequences. The new copy gets " (edited)" appended to
  // the visible name and a fresh createdAt timestamp so it sorts as
  // a new item. The currently-viewed sequence's selSequence is then
  // moved to its new edited copy so the user stays on what they were
  // just editing.
  //
  // Why save EVERY dirty sequence (not just current): saveLibrary
  // writes the whole library file. If we restored only the current
  // sequence and saved, any in-memory mutations to OTHER dirty
  // sequences would silently land on disk — the same fragility the
  // dirty-tracking was designed to prevent. Saving them all as new
  // copies preserves all originals and all edits, with zero data loss.
  //
  // After save: snapshots + dirty Set both clear (everything is now
  // consistent with disk). Library list (renderPatchList) and the
  // visualizer both re-render.
  const saveBtn = container.querySelector('.seq-viz-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'SAVING…';
      try {
        await commitDirtyEditsAsNewCopies();
        // (commitDirtyEditsAsNewCopies re-renders the visualizer, which
        // re-creates the button DOM — no need to re-enable anything.)
      } catch (err) {
        // Re-enable so the user can retry; surface the error via the
        // button label since there's no inline error pane here.
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE FAILED — RETRY';
        console.error('Sequence SAVE failed:', err);
      }
    });
  }

  // Wire Play / Pause button.
  //   - Single click: toggle through idle → playing → paused → playing → ...
  //       Fires IMMEDIATELY on click (no debounce wait) so pause feels
  //       responsive — the previous debounce-then-act model added a
  //       250 ms latency that was audible (an extra step tick would
  //       fire during the wait, playing a note after the user clicked).
  //   - Double click: full reset → idle (removes playhead, drops state).
  //       Detected by watching for a second click within 300 ms of the
  //       first via the `recentClick` flag. The single-click action of
  //       the FIRST click still runs (e.g. pause), then the second
  //       click triggers reset on top. Net end-state is identical to
  //       "reset directly" — pause is idempotent under reset.
  const playBtn = container.querySelector('.seq-viz-play-btn');
  if (playBtn) {
    let recentClick = false;
    let recentClickTimer = null;
    const DBL_CLICK_WINDOW_MS = 300;

    playBtn.addEventListener('click', () => {
      if (recentClick) {
        // Second click within the window → treat as double-click.
        // Clear the flag immediately so a third click reverts to
        // single-click behavior.
        recentClick = false;
        if (recentClickTimer) { clearTimeout(recentClickTimer); recentClickTimer = null; }
        stopSeqPlayback();   // full reset to beginning
        return;
      }
      // First click — fire single-click action right now.
      recentClick = true;
      recentClickTimer = setTimeout(() => {
        recentClick = false;
        recentClickTimer = null;
      }, DBL_CLICK_WINDOW_MS);
      if (!seqPlayState)                       startSeqPlayback();   // idle  → play
      else if (seqPlayState.timerId !== null)  pauseSeqPlayback();   // play  → pause
      else                                     startSeqPlayback();   // pause → resume
    });
  }

  // Rate slider + number-input wiring. Both edit the same seqPlayRatePct
  // state; setSeqPlayRatePct clamps to [1, 100] and hot-restarts an
  // in-flight interval so the new tempo takes effect immediately
  // rather than after the next play cycle. After every change, sync
  // the OTHER control's visible value so the two stay in lockstep.
  // 'input' fires on every drag/keystroke (live), 'blur' on number
  // re-syncs visible value to the (potentially clamped) actual rate
  // — so typing "150" + tab snaps the box to "100".
  // Repeat (:||) toggle wiring. seqPlayRepeat is read live in
  // seqPlaybackTick, so flipping it mid-playback takes effect at the next
  // loop boundary — no timer restart needed.
  const repeatBtn = container.querySelector('.seq-viz-repeat-btn');
  if (repeatBtn) {
    repeatBtn.addEventListener('click', () => {
      seqPlayRepeat = !seqPlayRepeat;
      repeatBtn.classList.toggle('active', seqPlayRepeat);
      repeatBtn.setAttribute('aria-pressed', String(seqPlayRepeat));
    });
  }

  const rateSlider = container.querySelector('.seq-viz-rate-slider');
  const rateInput  = container.querySelector('.seq-viz-rate');
  const syncRateUI = () => {
    if (rateSlider && rateSlider.value !== String(seqPlayRatePct)) rateSlider.value = String(seqPlayRatePct);
    if (rateInput  && rateInput.value  !== String(seqPlayRatePct)) rateInput.value  = String(seqPlayRatePct);
  };
  if (rateSlider) {
    rateSlider.addEventListener('input', () => {
      const raw = parseInt(rateSlider.value, 10);
      if (!Number.isFinite(raw)) return;
      setSeqPlayRatePct(raw);
      syncRateUI();
    });
  }
  if (rateInput) {
    rateInput.addEventListener('input', () => {
      const raw = parseInt(rateInput.value, 10);
      if (!Number.isFinite(raw)) return;   // mid-edit (empty / non-numeric) — skip
      setSeqPlayRatePct(raw);
      syncRateUI();
    });
    rateInput.addEventListener('blur', syncRateUI);
  }
  // Slide-out / slide-in toggle for the slider. Toggles a class on
  // the wrap (CSS-driven visibility) + flips the chevron glyph.
  // Module-scope seqRateSliderExpanded persists across re-renders.
  const rateToggle = container.querySelector('.seq-viz-rate-toggle');
  if (rateToggle) {
    rateToggle.addEventListener('click', () => {
      seqRateSliderExpanded = !seqRateSliderExpanded;
      const wrap = container.querySelector('.seq-viz-rate-wrap');
      if (wrap) wrap.classList.toggle('expanded', seqRateSliderExpanded);
      rateToggle.textContent = seqRateSliderExpanded ? '‹' : '›';
    });
  }

  // Wire page-button clicks. Switching pages mid-playback would
  // leave the playhead stranded in the previous range and the user's
  // ear out of sync — stop playback first.
  container.querySelectorAll('.seq-viz-page-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopSeqPlayback();
      const v = btn.dataset.page;
      const next = v === 'all' ? null : parseInt(v, 10);
      // Click on the currently-active page (or ALL when already all) =
      // toggle back to all-view; otherwise switch.
      if (next === selSeqVizPage) selSeqVizPage = null;
      else selSeqVizPage = next;
      renderSequenceVisualizer();
    });
  });

  // Hover tooltip on the roll — distinguishes four states at the
  // hovered pitch from the sequence data:
  //   - Red note (new attack only) → pitch name (e.g. "C3")
  //   - TIE (tied voice + new attack at SAME pitch in another voice
  //     slot) → "tie". This is the JX-3P TIE-button signature: when
  //     you hold a note and press TIE, the JX records voice[0] tied
  //     AND voice[1] as a new attack at the same pitch. The "extra
  //     same-pitch new attack" is the discriminator. See CLAUDE.md
  //     pitfall #16.
  //   - Green note (tied voice only, no same-pitch new attack) →
  //     "rest". JX REST-button presses encode as tied continuations
  //     — indistinguishable in data from polyphonic note continuation,
  //     but the REST-button case is the common single-voice path so
  //     "rest" is the dominant honest label.
  //   - Blue rest column (step where ALL voices are empty, byte7=127)
  //     → "rest" (the silence isn't pitch-specific). Only appears for
  //     fully-empty steps / null pages — the JX cannot encode a true
  //     all-voices-empty step inside a populated page from the user-
  //     facing buttons.
  //   - Empty cell in a non-rest step (no voice at this pitch but
  //     other voices are present) → no tooltip
  const rollSvg = container.querySelector('.seq-viz-svg');
  const tip     = container.querySelector('.seq-viz-hover-tip');
  const visibleSteps = zoomedPage !== null ? STEPS_PER_PAGE : TOTAL_STEPS;
  const updateTip = (e) => {
    // While a drag-pitch gesture is in progress, the document-level
    // drag mousemove handler in setupSeqDragListenersOnce owns the
    // tip — it updates the text to the current snapped pitch and
    // pins the position to the cursor. If THIS hover handler also
    // ran during the drag it would compete (e.g. hide the tip when
    // the cursor crossed a non-note region), so bail out early.
    if (seqDragState) return;
    const r      = rollSvg.getBoundingClientRect();
    const yRatio = (e.clientY - r.top)  / r.height;
    const xRatio = (e.clientX - r.left) / r.width;
    const pitch  = HIGH_PITCH - Math.floor(yRatio * PITCH_RANGE);
    if (pitch < LOW_PITCH || pitch > HIGH_PITCH) { tip.hidden = true; return; }
    const stepInView = Math.floor(xRatio * visibleSteps);
    const absStep    = zoomedPage !== null
                       ? zoomedPage * STEPS_PER_PAGE + stepInView
                       : stepInView;
    if (absStep < 0 || absStep >= TOTAL_STEPS) { tip.hidden = true; return; }
    const pageIdx = Math.floor(absStep / STEPS_PER_PAGE);
    const stepIdx = absStep % STEPS_PER_PAGE;
    const page    = pages[pageIdx];
    const step    = page && page[stepIdx];

    // Silent step (null page OR step with every voice slot empty).
    // Labeled "empty" — NOT "rest" — because:
    //   - There's nothing in the data to interact with (Ctrl+click
    //     here opens the INSERT tooltip, not the DELETE tooltip)
    //   - JX REST-button presses are encoded as tied continuations
    //     (see CLAUDE.md pitfall #16) and render as green hold-rest
    //     cells with the `seq-viz-note` class — those DO say "rest"
    //     in the hover (below) AND respond to Ctrl+click → delete
    // Same word for both situations was confusing: users couldn't
    // tell which "rest" was deletable.
    const isRestStep = !page || !step || !Array.isArray(step.voices)
                       || !step.voices.some((v) => v != null);
    if (isRestStep) {
      tip.textContent = 'empty';
      tip.hidden = false;
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top  = `${e.clientY - 18}px`;
      return;
    }

    // Populated step — distinguish four cases at the hovered pitch:
    //   1. Tied voice + new attack at SAME pitch in another voice slot
    //      → "tie" (the JX-3P single-voice TIE signature — pitfall #16).
    //      Cell renders BLUE.
    //   2. New-attack-only AND this column's full attack-pitch set
    //      matches the previous column's attack-pitch set exactly →
    //      "tie" (polyphonic TIE = same chord re-attacked). Cell
    //      renders RED — the data is indistinguishable from chord
    //      re-attack, but in practice the user pressed TIE on the JX
    //      (or our editor's TIE button) to produce this. Visually red
    //      AND tooltip "tie" reflects: musically a re-articulation,
    //      data-shape-wise a fresh chord.
    //   3. New attack only, NOT matching prev column → pitch name
    //      (regular chord/note attack).
    //   4. Tied voice only → "rest".
    //   5. No voice at this pitch → no tooltip.
    // Symbols mirror the JX-3P front-panel notation (Daniel 2026-05-26):
    //   ♪ = note (eighth-note glyph, with pitch name appended)
    //   ⌣ = tie (upward-opening arc, matches the JX panel orientation)
    //   <svg eighth-rest> = rest. SVG-inline (not Unicode 𝄾) because
    //     the codepoint is in the Supplementary Multilingual Plane
    //     and renders as a missing-glyph box on systems without music
    //     notation font coverage.
    //
    // Text glyphs (♪ ⌣) wrapped in larger-font spans so their visible
    // glyph height (~60-65 % of font-size box) lands near the rest
    // SVG's ~14 px — matching visual weight in the tooltip.
    const SYM_NOTE = '<span style="font-size:22px;line-height:1;display:inline-block;vertical-align:middle;">♪</span>';
    const SYM_TIE  = '<span style="font-size:22px;line-height:1;display:inline-block;vertical-align:middle;">⌣</span>';
    // Eighth-rest SVG sourced from Wikimedia Commons (public domain,
    // Eighth_rest.svg). The path uses absolute coordinates centered
    // off-canvas with the nested transforms bringing them into the
    // 10.03 × 17.67 viewBox — preserved verbatim from the original
    // so the glyph matches standard music-notation rendering exactly.
    // fill:currentColor inherits the surrounding text color.
    const SYM_REST_HTML =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.03 17.67" ` +
      `width="10" height="14" style="display:inline-block;vertical-align:middle;fill:currentColor;">` +
      `<g transform="translate(-482.02112,-143.61753)">` +
      `<g transform="matrix(1.8,0,0,1.8,-471.40868,9.4615275)">` +
      `<path d="M 531.098,74.847 C 530.578,74.945 530.18,75.304 530,75.8 C 529.961,75.96 529.961,75.999 529.961,76.218 C 529.961,76.519 529.98,76.679 530.121,76.917 C 530.32,77.316 530.738,77.636 531.215,77.753 C 531.715,77.894 532.551,77.773 533.508,77.456 L 533.746,77.374 L 532.57,80.624 L 531.414,83.87 C 531.414,83.87 531.453,83.89 531.516,83.933 C 531.633,84.011 531.832,84.07 531.973,84.07 C 532.211,84.07 532.512,83.933 532.551,83.812 C 532.551,83.773 533.109,81.878 533.785,79.628 L 534.98,75.503 L 534.941,75.445 C 534.844,75.324 534.645,75.285 534.523,75.382 C 534.484,75.421 534.422,75.503 534.383,75.562 C 534.203,75.863 533.746,76.398 533.508,76.597 C 533.289,76.777 533.168,76.796 532.969,76.718 C 532.789,76.62 532.73,76.519 532.609,75.98 C 532.492,75.445 532.352,75.202 532.051,75.003 C 531.773,74.824 531.414,74.765 531.098,74.847 z"/>` +
      `</g></g></svg>`;

    const tiedHere = step.voices.find((v) => v && v.note === pitch && v.tied);
    const newHere  = step.voices.find((v) => v && v.note === pitch && !v.tied);
    if (!tiedHere && !newHere) { tip.hidden = true; return; }
    // All three branches now set innerHTML (not textContent) so the
    // music-symbol spans + SVG render rather than escape-printing.
    // Safe: pitch names from midiPitchName are short alphanumerics,
    // not user-controlled HTML; the symbol constants are static.
    if (tiedHere && newHere) {
      tip.innerHTML = SYM_TIE;
    } else if (newHere) {
      // Polyphonic-TIE detection: same set of attack pitches as
      // immediate previous column → user pressed TIE in chord
      // context (or our editor's TIE button). Symbol = tie even
      // though the cell visual stays red.
      const thisAttacks = step.voices
        .filter((v) => v && v.tied === false && typeof v.note === 'number')
        .map((v) => v.note).sort((a, b) => a - b);
      const prevAttacks = previousColumnAttackPitches(absStep, pages).slice().sort((a, b) => a - b);
      const sameAsPrev = thisAttacks.length > 0
                         && thisAttacks.length === prevAttacks.length
                         && thisAttacks.every((p, i) => p === prevAttacks[i]);
      tip.innerHTML = sameAsPrev ? SYM_TIE : `${SYM_NOTE} ${midiPitchName(pitch)}`;
    } else {
      tip.innerHTML = SYM_REST_HTML;
    }
    tip.hidden = false;
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top  = `${e.clientY - 18}px`;
  };
  rollSvg.addEventListener('mousemove', updateTip);
  rollSvg.addEventListener('mouseleave', () => { tip.hidden = true; });

  // Roll-SVG click handler. Behaviors:
  //
  //   - Plain click on a note (any type) → selects it (visual outline
  //       + keyboard Delete will remove it). Also previews the tone
  //       on attack/tie cells; hold-rest cells still select but
  //       don't preview (silent in JX playback).
  //   - Plain click on empty cell → clears any current selection.
  //   - Ctrl+click / right-click on a note → no-op.
  //   - Ctrl+click / right-click on empty cell → NOTE/REST/TIE insert
  //       tooltip (single-page view only — feature #4). Wired via the
  //       SEPARATE 'contextmenu' listener below, NOT this 'click'
  //       handler — see comment there for the macOS rationale.
  //
  // dragSuppressClick: set true by the drag-end handler when a real
  // drag (pitch actually changed) just finished, so the post-mouseup
  // click event doesn't fire a phantom preview / re-select at the
  // dropped pitch.
  rollSvg.addEventListener('click', (e) => {
    if (seqDragSuppressClick) { seqDragSuppressClick = false; return; }
    if (seqPlayheadDragSuppressClick) { seqPlayheadDragSuppressClick = false; return; }
    if (seqMarqueeSuppressClick) { seqMarqueeSuppressClick = false; return; }
    const t = e.target;
    const isNote = t && t.classList && t.classList.contains('seq-viz-note');

    // (Click-to-scrub-playhead was added then removed 2026-05-26 per
    // Daniel — drag-from-empty-area is the canonical way to move the
    // playhead now. Plain click on notes still selects + previews;
    // plain click on empty still clears the selection.)

    if (!isNote) {
      // Click on empty SVG → clear any selection AND toggle the
      // insert-cell tooltip (note/rest/tie) at the cursor. Single-
      // page view only (matches the editing-only-in-single-page
      // rule). Replaces the earlier macOS Ctrl-click / right-click
      // path (Daniel 2026-05-26) — plain click is more discoverable.
      //
      // Toggle semantic: if a tip is already showing, this click
      // dismisses it and stops (no new tip). Click again → reopen.
      // outsideClick is intentionally SKIPPED for empty-area roll
      // clicks (see showInsertCellTooltip) so the tip survives the
      // capture-phase mousedown and we can read activeInsertTipDismiss
      // here to drive the toggle.
      clearSequenceSelection();
      if (zoomedPage === null) return;
      if (activeInsertTipDismiss) {
        activeInsertTipDismiss();
        activeInsertTipDismiss = null;
        return;
      }
      const r       = rollSvg.getBoundingClientRect();
      const yRatio  = (e.clientY - r.top)  / r.height;
      const xRatio  = (e.clientX - r.left) / r.width;
      const pitch   = HIGH_PITCH - Math.floor(yRatio * PITCH_RANGE);
      const absStep = Math.floor(xRatio * STEPS_PER_PAGE) + zoomedPage * STEPS_PER_PAGE;
      if (pitch < LOW_PITCH || pitch > HIGH_PITCH) return;
      if (absStep < 0 || absStep >= TOTAL_STEPS) return;
      showInsertCellTooltip(e.clientX, e.clientY, pitch, absStep);
      return;
    }
    const type    = t.dataset.type;
    const pitch   = parseInt(t.dataset.pitch, 10);
    const absStep = parseInt(t.dataset.step, 10);
    if (!Number.isFinite(pitch) || !Number.isFinite(absStep)) return;

    // Select the clicked note (replaces any prior selection — single-
    // click is always a single-note selection; marquee drag is the
    // path for multi-select).
    clearSequenceSelection();
    selectedSeqNotes = [{ pitch, absStep }];
    t.classList.add('selected');

    // Preview tone for audible events; hold-rest stays silent.
    if (type === 'attack' || type === 'tie') previewNote(pitch);
  });

  // Drag-to-change-pitch (single-page view only, per Daniel's spec
  // "All editing would only happen in single page view"). The drag
  // semantic:
  //   - mousedown on a playable note (attack | tie) captures the
  //     source rect + the current pitch
  //   - mousemove (on document, so we catch drags that wander out of
  //     the SVG) computes the new pitch from cursor Y, snapped to the
  //     nearest semitone, and live-updates the rect's y attribute so
  //     the user sees the note follow the cursor
  //   - mouseup commits: mutate the source voice(s) in the sequence
  //     data to the new pitch, fire a preview tone, re-render
  //   - mouseup with no movement → no commit; click handler runs
  //     normally (preview at original pitch)
  //
  // hold-rest cells aren't draggable — there's no audible event to
  // move (the data we'd be moving is just a hold/continuation marker).
  //
  // Document-level mousemove/mouseup (rather than SVG-level) so the
  // drag survives the cursor briefly leaving the SVG, which is common
  // at the extreme top/bottom pitches.
  if (zoomedPage !== null) {
    rollSvg.addEventListener('mousedown', (e) => {
      const t = e.target;
      if (!t || !t.classList || !t.classList.contains('seq-viz-note')) return;
      const type = t.dataset.type;
      if (type !== 'attack' && type !== 'tie') return;
      const startPitch = parseInt(t.dataset.pitch, 10);
      const absStep    = parseInt(t.dataset.step, 10);
      if (!Number.isFinite(startPitch) || !Number.isFinite(absStep)) return;

      // Group-drag detection: if the mousedown note is part of a
      // multi-selection (and the selection has >1 entry), the drag
      // moves the WHOLE group by Δpitch. Group is captured as
      // {pitch, absStep, rectEl, startY} per entry. Single-selection
      // (or no selection) falls through to the existing single-note
      // drag path.
      const isPartOfGroup = selectedSeqNotes.length > 1 &&
        selectedSeqNotes.some((n) => n.pitch === startPitch && n.absStep === absStep);
      let groupMembers = null;
      if (isPartOfGroup) {
        groupMembers = selectedSeqNotes.map(({ pitch, absStep: s }) => ({
          startPitch: pitch,
          absStep:    s,
          rectEl:     document.querySelector(
            `.seq-viz-note[data-pitch="${pitch}"][data-step="${s}"]`
          ),
        })).filter((m) => m.rectEl);
      }

      seqDragState = {
        rect:        t,
        type,
        startPitch,
        currentPitch: startPitch,
        absStep,
        svgRect:     rollSvg.getBoundingClientRect(),
        moved:       false,
        groupMembers,   // null for single-note drag, populated for group
        // Carry the hover-tip element into the document-level
        // mousemove handler (which is in setupSeqDragListenersOnce's
        // scope and doesn't have access to renderSequenceVisualizer's
        // local `tip`). The mousemove handler updates the tip's text
        // + position each tick so the user sees the new pitch name
        // throughout the drag, not just at the start.
        tipEl:       tip,
      };
      // Seed the tip with the starting pitch immediately and anchor
      // it to the cursor — feels more responsive than waiting for
      // the first mousemove to populate.
      tip.textContent = midiPitchName(startPitch);
      tip.hidden      = false;
      tip.style.left  = `${e.clientX + 14}px`;
      tip.style.top   = `${e.clientY - 18}px`;
      // Audible feedback for the starting pitch at full volume — pairs
      // with the half-volume per-semitone previews during drag (added
      // in the document mousemove handler) and the full-volume preview
      // on drop. Without this, the user grabs a note and hears nothing
      // until they actually move.
      previewNote(startPitch);
      document.body.classList.add('seq-dragging-pitch');
      e.preventDefault();   // suppress text selection drag
    });
  }

  // Empty-area mousedown: branches into PLAYHEAD-DRAG (when the
  // mousedown target IS the playhead rect) or MARQUEE-SELECT (any
  // other empty space). Note-rect mousedown is left alone so the
  // pitch-drag handler above can claim it.
  //
  // Playhead drag: only available when playback exists. Reuses the
  // existing seqPlayheadDragState + scrubPlayheadTo machinery.
  //
  // Marquee select: column-constrained (Daniel 2026-05-26) — drag
  // up/down within a column to select multiple notes by pitch range.
  // Single-page view only (where the columns are wide enough to
  // make a marquee usable).
  rollSvg.addEventListener('mousedown', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('seq-viz-note')) return;   // pitch-drag handles

    // ── Playhead grab ──
    if (t && t.classList && t.classList.contains('seq-viz-playhead')) {
      if (!seqPlayState) return;
      seqPlayheadDragState = { svgRect: rollSvg.getBoundingClientRect() };
      scrubPlayheadTo(seqPlayheadDragState.svgRect, e.clientX,
                      { playOnChange: true, gainScale: 0.2 });
      e.preventDefault();
      return;
    }

    // ── Marquee select (single-page only) ──
    if (zoomedPage === null) return;
    const svgRect = rollSvg.getBoundingClientRect();
    const xRatio = (e.clientX - svgRect.left) / svgRect.width;
    const yRatio = (e.clientY - svgRect.top)  / svgRect.height;
    const absStep = Math.floor(xRatio * STEPS_PER_PAGE) + zoomedPage * STEPS_PER_PAGE;
    const startPitch = HIGH_PITCH - Math.floor(yRatio * PITCH_RANGE);
    if (absStep < 0 || absStep >= TOTAL_STEPS) return;
    if (startPitch < LOW_PITCH || startPitch > HIGH_PITCH) return;

    // No visual marquee rect — the user sees the selection by watching
    // the notes themselves highlight as they drag. mousemove recomputes
    // selectedSeqNotes live and re-applies the .selected class.
    seqMarqueeState = {
      svgRect,
      absStep,
      startPitch,
      currentPitch: startPitch,
    };
    // Clear any prior selection — marquee starts a fresh group.
    clearSequenceSelection();
    e.preventDefault();
  });

  // Wire keyboard key hover + click. Hover shows the pitch name in
  // the shared tooltip (same chip the roll uses); click plays a
  // square-wave preview at that pitch (same synth-preview helper the
  // roll's note click uses). The keys are a natural place to "audit"
  // what each pitch sounds like even when no note is at that step.
  container.querySelectorAll('.seq-viz-key').forEach((keyRect) => {
    keyRect.addEventListener('mousemove', (e) => {
      const pitch = parseInt(keyRect.dataset.pitch, 10);
      tip.textContent = midiPitchName(pitch);
      tip.hidden = false;
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top  = `${e.clientY - 18}px`;
    });
    keyRect.addEventListener('mouseleave', () => { tip.hidden = true; });
    keyRect.addEventListener('click', () => {
      const pitch = parseInt(keyRect.dataset.pitch, 10);
      if (Number.isFinite(pitch)) previewNote(pitch);
    });
  });

  // Re-apply the keyboard-selection visual. The rects are freshly
  // built in this render, so any previous .selected class is gone;
  // restore it from selectedSeqNote if the selected (pitch, step)
  // still matches a rendered cell. No-op when nothing selected or
  // when the cell no longer exists (e.g. just deleted).
  applySequenceSelectionVisual();
}

// MIDI pitch → JX-3P panel note name (Roland convention, where the
// JX's lowest key — MIDI 36 — is labeled "C1" on the synth's panel,
// one octave lower than standard MIDI's "C2"). Middle C reads as
// "C3" in this convention. Used by the sequence visualizer's
// keyboard labels and hover tooltip so what JP shows matches what
// Daniel reads off the physical JX-3P.
function midiPitchName(midiPitch) {
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const note   = NOTES[((midiPitch % 12) + 12) % 12];
  const octave = Math.floor(midiPitch / 12) - 2;   // Roland: 1 lower than standard MIDI
  return `${note}${octave}`;
}

// White/black key check (returns true for the seven white keys in an
// octave: C D E F G A B; false for the five black keys).
function isWhiteKey(midiPitch) {
  const semitone = ((midiPitch % 12) + 12) % 12;
  return [0, 2, 4, 5, 7, 9, 11].includes(semitone);
}

// Defensive HTML escape — sequence names + paired-patch refs are
// user-supplied, can contain arbitrary characters.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bucketsState() {
  return library && library.customBuckets;
}

function bucketEntryDisplayName(entry) {
  if (!entry) return '';
  if (entry.name) return entry.name;
  if (entry.origin && entry.sourceLabel) return `${entry.origin} from ${entry.sourceLabel}`;
  if (entry.origin) return entry.origin;
  return '(unnamed)';
}

function bucketCount(bank) {
  const arr = bucketsState() && bucketsState()[bank];
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((n, e) => n + (e ? 1 : 0), 0);
}

// A "silent" placeholder patch used to pad empty slots on save. Zero VCA level
// = no sound; other params default to a benign state. Mirrors what jx3p's
// JX3PPatch dataclass produces when zero-initialised, but with vca_level=0.
// silentDefaultPatch() now lives in renderer/bucket-ops.js and is attached
// to the global window by that file's UMD wrapper. Don't redefine here.

function setupCustomBuilder() {
  const toggle = document.getElementById('custom-builder-toggle');
  const abort  = document.getElementById('custom-builder-abort');
  const save   = document.getElementById('custom-builder-save');
  const clear  = document.getElementById('custom-builder-clear');
  if (!toggle || !abort || !save || !clear) return;

  toggle.addEventListener('click', () => {
    // Mode is set by renderCustomBuilder per tab/sub-tab:
    //   new-sequence         → Library → Sequences: create a sequence
    //   builder-from-library → Library → Tones: jump to Bank C + open
    //   builder              → Bank C/D: plain open/close toggle
    if (toggle.dataset.mode === 'new-sequence') {
      handleCreateNewSequence();
      return;
    }
    if (toggle.dataset.mode === 'builder-from-library') {
      // Switch to Bank C first (mirrors the load-package nav pattern:
      // selBank + tab classes + re-renders), then open the builder on
      // a tab where its C/D sources are actually visible. Preview +
      // phantom reset matches the setupTabs L → C/D path.
      selBank = 'C';
      selSlot = 0;
      if (currentPreviewPatch && !writePending) currentPreviewPatch = null;
      phantomPatch = null;
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.bank === 'C');
      });
      const sLib = bucketsState();
      sLib.active = true;
      saveLibraryDebounced();
      renderPatchList();
      updateSvgPatchName();
      updateAllControls(currentPatch());
      renderCustomBuilder();
      return;
    }
    const s = bucketsState();
    s.active = !s.active;
    saveLibraryDebounced();
    renderCustomBuilder();
  });
  // X closes the section but preserves staged patches — the user can reopen
  // and continue. CLEAR is the destructive action.
  abort.addEventListener('click', () => {
    const s = bucketsState();
    s.active = false;
    saveLibraryDebounced();
    renderCustomBuilder();
  });
  save .addEventListener('click', () => handleBuilderSave());
  clear.addEventListener('click', () => handleBuilderClearOrUndo());

  document.querySelectorAll('.cb-bucket').forEach((bucketEl) => {
    const bank = bucketEl.dataset.bank;
    // Resolve where the drop would start: the slot under the cursor, or
    // the next empty slot at the end of the bucket if dropping in dead
    // space. Returns -1 only if the bucket is completely full AND the
    // user wasn't aiming at a specific slot.
    const resolveTargetIdx = (e) => {
      const droppedOnSlot = e.target.closest('.cb-slot');
      if (droppedOnSlot) return Number(droppedOnSlot.dataset.idx);
      const next = nextEmptyBucketSlot(bank);
      return next;
    };
    // Will this range fit starting at startIdx? (Range size must be ≤
    // 16 − startIdx.) Used by both dragover preview and drop guard.
    const rangeFitsAt = (rangeSize, startIdx) =>
      startIdx >= 0 && startIdx + rangeSize <= 16;

    bucketEl.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-jp-patch-source')) return;
      e.preventDefault();
      const rangeJson = e.dataTransfer.types.includes('application/x-jp-patch-range')
        ? e.dataTransfer.getData('application/x-jp-patch-range') : '';
      let rangeSize = 1;
      if (rangeJson) {
        try {
          const r = JSON.parse(rangeJson);
          rangeSize = (r.end - r.start) + 1;
        } catch {}
      }
      const startIdx = resolveTargetIdx(e);
      const fits = rangeFitsAt(rangeSize, startIdx);
      e.dataTransfer.dropEffect = fits ? 'copy' : 'none';
      bucketEl.classList.toggle('drop-active', fits);
      bucketEl.classList.toggle('drop-blocked', !fits);
    });
    bucketEl.addEventListener('dragleave', (e) => {
      if (!bucketEl.contains(e.relatedTarget)) {
        bucketEl.classList.remove('drop-active');
        bucketEl.classList.remove('drop-blocked');
      }
    });
    bucketEl.addEventListener('drop', (e) => {
      bucketEl.classList.remove('drop-active');
      bucketEl.classList.remove('drop-blocked');
      const json = e.dataTransfer.getData('application/x-jp-patch-source');
      if (!json) return;
      e.preventDefault();
      let src;
      try { src = JSON.parse(json); } catch { return; }

      // Multi-patch path: a range descriptor means this is the leading
      // patch of a shift-selected group, place them all in sequence.
      const rangeJson = e.dataTransfer.getData('application/x-jp-patch-range');
      if (rangeJson) {
        let r;
        try { r = JSON.parse(rangeJson); } catch { return; }
        const startIdx = resolveTargetIdx(e);
        const rangeSize = (r.end - r.start) + 1;
        if (!rangeFitsAt(rangeSize, startIdx)) return; // guarded by dragover too
        for (let i = 0; i < rangeSize; i++) {
          placePatchInBucket(bank, startIdx + i, r.bank, r.start + i);
        }
        return;
      }

      // Single-patch path (existing behaviour).
      const droppedOnSlot = e.target.closest('.cb-slot');
      const targetIdx = droppedOnSlot
        ? Number(droppedOnSlot.dataset.idx)
        : nextEmptyBucketSlot(bank);
      if (targetIdx === -1) return;
      placePatchInBucket(bank, targetIdx, src.bank, src.slot);
    });
  });

  renderCustomBuilder();
}

function nextEmptyBucketSlot(bank) {
  const arr = bucketsState()[bank];
  for (let i = 0; i < 16; i++) if (!arr[i]) return i;
  return -1;
}

function placePatchInBucket(destBank, destIdx, srcBank, srcSlot) {
  // First new patch after a CLEAR voids the undo affordance — the buckets are
  // no longer in the empty post-clear state that UNDO would map back from.
  clearUndoSnapshot = null;
  const bankIdx = srcBank === 'D' ? 1 : 0;
  const params = patches && patches.banks && patches.banks[bankIdx]
    && patches.banks[bankIdx][srcSlot];
  if (!params) return;
  // Pure mutation delegated to bucket-ops.js — keeps the data shape +
  // bounds-checking in one place where the unit tests can reach it.
  //
  // v0.7.5: carry the source patch's DEEP PROVENANCE (originLibrary /
  // originalName / createdAt) into the bucket entry. Without this, building
  // a custom bank from patches that already live in another library severs
  // their lineage — the saved bank's load-time enrichment re-roots
  // originLibrary to the NEW bank's name + date, so the Patch-history modal
  // showed "Okay Dokay / today" for a patch that's really from "Spils
  // Sounds / 3 weeks ago". patchOriginLibrary already falls back to the
  // slot's sourceLabel, and we fall back once more to the current active
  // source for patches with no recorded provenance (preserves old behavior).
  const srcMeta = slotMetaAt(srcBank, srcSlot) || {};
  placeBucketEntry(bucketsState(), destBank, destIdx, {
    params: JSON.parse(JSON.stringify(params)),
    name:   patchName(srcBank, srcSlot),
    origin: patchOrigin(srcBank, srcSlot),
    sourceLabel:   activeBanksSourceLabel,
    originLibrary: patchOriginLibrary(srcBank, srcSlot) || activeBanksSourceLabel || null,
    originalName:  patchOriginalName(srcBank, srcSlot) || patchName(srcBank, srcSlot) || null,
    createdAt:     srcMeta.createdAt || null,
  });
  saveLibraryDebounced();
  renderCustomBuilder();
}

function removePatchFromBucket(bank, idx) {
  // Pure mutation in bucket-ops.js; this wrapper handles the side effects
  // (autosave, re-render, undo registration).
  const removed = clearBucketEntry(bucketsState(), bank, idx);
  if (!removed) return;
  saveLibraryDebounced();
  renderCustomBuilder();
  pushUndo({
    undo: () => {
      placeBucketEntry(bucketsState(), bank, idx, removed);
      saveLibraryDebounced();
      renderCustomBuilder();
    },
    redo: () => {
      clearBucketEntry(bucketsState(), bank, idx);
      saveLibraryDebounced();
      renderCustomBuilder();
    },
  });
}

// Swap two bucket slots — WITHIN a bank (C→C, D→D) or ACROSS banks (C↔D).
// This is the single model behind every bucket drag as of v0.7.4. Dragging
// slot A onto slot B trades their contents and NOTHING else moves.
//
// We dropped the old within-bank insert-reorder (splice + shift everything
// between) because on a sparse bucket it slid the empty slots around — the
// "strange shift that creates another empty slot" users complained about.
// A swap touches exactly two slots, so the result always matches the
// gesture: "A populates B" (and B's old contents go to A).
//
// FLIP animation: only the two swapped slots move; everything else stays
// put. Each translates from its OLD position to its NEW one — for a
// within-bank swap that's a pure vertical slide; for cross-bank the delta
// is on BOTH x and y. The same getBoundingClientRect math covers both.
function swapBucketSlots(srcBank, srcIdx, dstBank, dstIdx) {
  // FLIP capture: pre-mutation bounding rects of the two affected rows.
  // Captured BEFORE the mutation so we get the layout that's about to
  // disappear when renderCustomBuilder() re-creates the slot DOM.
  const srcSel = `.cb-bucket[data-bank="${srcBank}"] .cb-slot[data-idx="${srcIdx}"]`;
  const dstSel = `.cb-bucket[data-bank="${dstBank}"] .cb-slot[data-idx="${dstIdx}"]`;
  const oldSrcRow = document.querySelector(srcSel);
  const oldDstRow = document.querySelector(dstSel);
  const oldSrcRect = oldSrcRow ? oldSrcRow.getBoundingClientRect() : null;
  const oldDstRect = oldDstRow ? oldDstRow.getBoundingClientRect() : null;

  // Pure swap delegated to bucket-ops.js. Returns false if the swap was
  // a no-op (dropped on self / both empty / invalid inputs) — bail without
  // saving or animating.
  const didSwap = swapBucketEntries(bucketsState(), srcBank, srcIdx, dstBank, dstIdx);
  if (!didSwap) return;

  saveLibraryDebounced();
  renderCustomBuilder();

  // Undo: reverse the swap (swapping back is its own inverse).
  pushUndo({
    undo: () => swapBucketSlots(dstBank, dstIdx, srcBank, srcIdx),
    redo: () => swapBucketSlots(srcBank, srcIdx, dstBank, dstIdx),
  });

  // FLIP play: post-render, the row at srcSel holds what was at dst (and
  // vice versa). Translate each new row back to the OTHER's old position,
  // then animate to 0. Cross-container so we translate on x AND y.
  if (oldSrcRect && oldDstRect) {
    const newSrcRow = document.querySelector(srcSel);
    const newDstRow = document.querySelector(dstSel);
    const animateFromTo = (el, fromRect) => {
      if (!el || !fromRect) return;
      const toRect = el.getBoundingClientRect();
      const dx = fromRect.left - toRect.left;
      const dy = fromRect.top  - toRect.top;
      el.style.transition = 'none';
      el.style.transform  = `translate(${dx}px, ${dy}px)`;
    };
    // newSrcRow now contains what was at oldDstRect; fly it from there.
    animateFromTo(newSrcRow, oldDstRect);
    // newDstRow now contains what was at oldSrcRect; fly it from there.
    animateFromTo(newDstRow, oldSrcRect);
    // Force reflow then release.
    void document.body.offsetWidth;
    [newSrcRow, newDstRow].forEach((el) => {
      if (!el) return;
      el.style.transition = 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform  = 'translate(0, 0)';
      el.addEventListener('transitionend', () => {
        el.style.transition = '';
        el.style.transform  = '';
      }, { once: true });
    });
    // Cream-tint highlight on the destination slot (where the dragged
    // patch landed).
    if (newDstRow) {
      newDstRow.classList.add('just-moved');
      setTimeout(() => newDstRow.classList.remove('just-moved'), 850);
    }
  }
}

function renameBucketEntry(bank, idx, newName) {
  // setBucketEntryName mutates in place + returns the previous name.
  // Returns null when the slot is empty / inputs invalid → bail without
  // saving or registering undo.
  const buckets = bucketsState();
  const arr = buckets && buckets[bank];
  if (!arr || !arr[idx]) return;
  const oldName = setBucketEntryName(buckets, bank, idx, newName);
  const finalName = newName || null;
  saveLibraryDebounced();
  renderCustomBuilder();
  if (oldName !== finalName) {
    pushUndo({
      undo: () => renameBucketEntry(bank, idx, oldName),
      redo: () => renameBucketEntry(bank, idx, finalName),
    });
  }
}

function renderCustomBuilder() {
  const builder = document.getElementById('custom-builder');
  const toggle  = document.getElementById('custom-builder-toggle');
  if (!builder || !toggle) return;
  const s = bucketsState();
  if (!s) return;

  // The custom-bank builder is a C/D-bank operation — it stages patches
  // pulled from those banks. On the Library tab it has no meaningful
  // source, so the toggle button greys out. If the builder happens to
  // be open when the user navigates to Library, force-close it so the
  // staged buckets aren't editable from a context where the source
  // banks aren't visible. The staged patches themselves persist
  // (bucketsState is unchanged) so reopening from Bank C/D resumes
  // exactly where the user left off.
  //
  // Exceptions (2026-06-10): on the Library tab the key stays active
  // and repurposes per sub-tab. dataset.mode tells the click handler
  // which behavior applies; renderCustomBuilder owns label + state.
  //   - Library → Sequences: "Create New Sequence" — same action the
  //     sequences-list button carried before it became the (inactive)
  //     community-explore placeholder.
  //   - Library → Tones: "Create Custom Banks" — switches to Bank C
  //     and opens the builder there (the builder still only stages
  //     from active C/D banks; the key is just reachable from Tones).
  const onLibrary = selBank === 'L';
  const onSeqTab  = onLibrary && selLibTab === 'sequences';
  toggle.dataset.mode = onSeqTab ? 'new-sequence'
    : (onLibrary ? 'builder-from-library' : 'builder');
  toggle.textContent  = onSeqTab ? 'Create New Sequence' : 'Create Custom Banks';
  toggle.disabled     = false;
  if (onLibrary && s.active) {
    s.active = false;
    saveLibraryDebounced();
  }

  // Sequence visualizer takes priority over the custom-bank builder when
  // the user is browsing Library Sequences with a row selected — both
  // occupy the same space below the panel SVG, and the visualizer is
  // more useful in that context. Hand off + return.
  const onSeqsWithSel = selBank === 'L' && selLibTab === 'sequences' && selSequence !== null;
  const visEl = document.getElementById('sequence-visualizer');
  if (onSeqsWithSel) {
    builder.hidden = true;
    if (visEl) visEl.hidden = false;
    renderSequenceVisualizer();
    return;
  }
  builder.hidden = false;
  if (visEl) visEl.hidden = true;

  builder.classList.toggle('open', !!s.active);
  if (!s.active) return;

  // SAVE is inert until at least one patch has been staged.
  // CLEAR is inert until at least one patch has been staged — except when a
  // CLEAR was just performed, in which case it becomes UNDO and is enabled
  // even though the buckets are empty.
  const totalCount = bucketCount('C') + bucketCount('D');
  const saveBtn  = document.getElementById('custom-builder-save');
  const clearBtn = document.getElementById('custom-builder-clear');
  if (saveBtn)  saveBtn .disabled = totalCount === 0;
  if (clearBtn) {
    clearBtn.disabled = totalCount === 0 && !clearUndoSnapshot;
    clearBtn.textContent = clearUndoSnapshot ? 'UNDO' : 'CLEAR';
  }

  ['C', 'D'].forEach((bank) => {
    const bucketEl = builder.querySelector(`.cb-bucket[data-bank="${bank}"]`);
    if (!bucketEl) return;
    const arr = s[bank] || [];

    const listEl = bucketEl.querySelector('.cb-bucket-list');
    listEl.innerHTML = '';

    for (let i = 0; i < 16; i++) {
      const entry = arr[i];
      const row = document.createElement('div');
      row.className = 'cb-slot' + (entry ? ' filled' : ' empty');
      row.dataset.idx = String(i);
      row.dataset.bank = bank;

      // Static slot prefix (e.g. "D5:") — stays visible during rename edit,
      // mirroring the patch-list pattern where the slot number doesn't toggle.
      const prefixSpan = document.createElement('span');
      prefixSpan.className = 'cb-slot-prefix';
      prefixSpan.textContent = `${bank}${i + 1}:`;
      row.appendChild(prefixSpan);

      // Name portion (hidden during edit). For empty slots this stays empty
      // so the slot's CSS placeholder/empty state can show through.
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cb-slot-name';
      nameSpan.textContent = entry ? bucketEntryDisplayName(entry) : '';
      row.appendChild(nameSpan);

      // Inline rename input (shown during edit; replaces just the name span,
      // not the slot prefix).
      const editInp = document.createElement('input');
      editInp.type = 'text';
      editInp.className = 'cb-slot-name-edit';
      editInp.maxLength = 28;
      editInp.spellcheck = false;
      row.appendChild(editInp);

      if (entry) {
        // Trash icon (hover-revealed via CSS)
        const trash = document.createElement('button');
        trash.className = 'cb-slot-trash';
        trash.type = 'button';
        trash.innerHTML =
          '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M3 4h10M5.5 4V2.5h5V4M4 4l.5 9.5h7L12 4M7 7v5M9 7v5"/>' +
          '</svg>';
        trash.addEventListener('click', (e) => {
          e.stopPropagation();
          removePatchFromBucket(bank, i);
        });
        row.appendChild(trash);

        row.draggable = true;
        row.addEventListener('dragstart', (e) => {
          if (e.target.closest('.cb-slot-trash, .cb-slot-name-edit')) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('application/x-jp-bucket-source',
            JSON.stringify({ bank, idx: i }));
          row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('dragging');
        });

        // Click → edit name inline (matches patch-name-span pattern).
        row.addEventListener('click', (e) => {
          if (e.target.closest('.cb-slot-trash, .cb-slot-name-edit')) return;
          startBucketSlotEdit(row, bank, i);
        });
        editInp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter')  commitBucketSlotEdit(row, bank, i);
          if (e.key === 'Escape') cancelBucketSlotEdit(row);
        });
        editInp.addEventListener('blur', () => commitBucketSlotEdit(row, bank, i));
      }

      // Drop target. Two kinds of drag land here:
      //   - bucket→bucket (swap): every such drag is a slot-for-slot swap
      //     (within OR across banks, as of v0.7.4), so the whole target row
      //     highlights — no top/bottom-half "insert between" indicator.
      //   - patch-list → bucket (place/overwrite): single patch or a
      //     shift-selected range; also full-row highlight.
      row.addEventListener('dragover', (e) => {
        const isPatchSrc  = e.dataTransfer.types.includes('application/x-jp-patch-source');
        const isBucketSrc = e.dataTransfer.types.includes('application/x-jp-bucket-source');
        const isRange     = e.dataTransfer.types.includes('application/x-jp-patch-range');
        if (!isPatchSrc && !isBucketSrc) return;
        e.preventDefault();
        e.stopPropagation();
        // We can't read range contents on dragover (security restriction —
        // only the type list is exposed), so use a permissive fit check
        // (slot must be able to hold at least one patch) and re-validate
        // the real range size on drop.
        const fits = isRange ? (i < 16) : true;
        e.dataTransfer.dropEffect = isBucketSrc ? 'move' : (fits ? 'copy' : 'none');
        row.classList.toggle('drag-over', isBucketSrc ? true : fits);
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', (e) => {
        row.classList.remove('drag-over');
        // Read all three MIME payloads up-front so the decoder can
        // prioritize bucket-source > range > patch-source consistently.
        // Only one is set per dragstart in practice; the decoder enforces
        // precedence defensively.
        const bucketJson = e.dataTransfer.getData('application/x-jp-bucket-source');
        const rangeJson  = e.dataTransfer.getData('application/x-jp-patch-range');
        const patchJson  = e.dataTransfer.getData('application/x-jp-patch-source');
        if (!bucketJson && !rangeJson && !patchJson) return;
        e.preventDefault();
        e.stopPropagation();

        // Pure dispatch in bucket-ops.js — covered by unit tests so the
        // drag-payload → mutation-call contract can't drift unnoticed.
        const action = decodeBucketDropAction(
          { bucketJson, rangeJson, patchJson },
          { bank, idx: i },
        );

        switch (action.kind) {
          case 'bucket-swap':
            swapBucketSlots(action.srcBank, action.srcIdx, action.dstBank, action.dstIdx);
            return;
          case 'range-place':
            for (let k = 0; k < action.rangeSize; k++) {
              placePatchInBucket(action.dstBank, action.dstStartIdx + k, action.srcBank, action.srcStart + k);
            }
            return;
          case 'patch-place':
            placePatchInBucket(action.dstBank, action.dstIdx, action.srcBank, action.srcSlot);
            return;
          case 'range-too-big':
          case 'invalid':
          case 'none':
          default:
            return; // silently no-op (malformed/oversized drop)
        }
      });

      listEl.appendChild(row);
    }
  });
}

function startBucketSlotEdit(row, bank, idx) {
  const entry = bucketsState()[bank][idx];
  if (!entry) return;
  const nameSpan = row.querySelector('.cb-slot-name');
  const editInp  = row.querySelector('.cb-slot-name-edit');
  editInp.value = entry.name || '';
  nameSpan.style.display = 'none';
  editInp.style.display = 'block';
  editInp.focus();
  editInp.select();
}
function commitBucketSlotEdit(row, bank, idx) {
  const editInp = row.querySelector('.cb-slot-name-edit');
  if (editInp.style.display !== 'block') return;
  renameBucketEntry(bank, idx, editInp.value.trim());
}
function cancelBucketSlotEdit(row) {
  const nameSpan = row.querySelector('.cb-slot-name');
  const editInp  = row.querySelector('.cb-slot-name-edit');
  editInp.style.display = 'none';
  nameSpan.style.display = '';
}

// The CLEAR/UNDO button is a two-state toggle:
//   - CLEAR (no snapshot): wipes both buckets, captures the prior state as a
//     transient in-memory snapshot, and re-labels itself UNDO.
//   - UNDO (snapshot held): restores the snapshot and re-labels itself CLEAR.
// The snapshot is also discarded the moment the user drops a new patch in
// (see placePatchInBucket), since at that point an undo no longer maps
// cleanly to "what the buckets looked like before the clear."
function handleBuilderClearOrUndo() {
  const s = bucketsState();
  if (clearUndoSnapshot) {
    s.C = clearUndoSnapshot.C;
    s.D = clearUndoSnapshot.D;
    clearUndoSnapshot = null;
  } else {
    clearUndoSnapshot = { C: s.C.slice(), D: s.D.slice() };
    s.C = new Array(16).fill(null);
    s.D = new Array(16).fill(null);
  }
  saveLibraryDebounced();
  renderCustomBuilder();
}

function handleBuilderSave() {
  const s = bucketsState();
  const cCount = bucketCount('C');
  const dCount = bucketCount('D');
  if (cCount + dCount === 0) return;

  const now = new Date();
  // Empty bucket slots are filled with silentDefaultPatch (vca_level=0, no
  // sound). This is WYSIWYG: empty in the builder = silent in the saved
  // bank, so the user isn't surprised by leftover patches from whatever
  // they had loaded. Previous behavior (v0.7.3 and earlier) inherited from
  // the active C/D banks at the same position — flipped in v0.7.4 to make
  // the builder's visual state authoritative.
  const banks    = buildSavedBuckets(s);
  const slotMeta = buildSavedBucketSlotMeta(s);

  const dateStr = now.toLocaleDateString('en-US',
    { month: 'long', day: 'numeric', year: 'numeric' });
  const pkg = {
    id: now.toISOString(),
    defaultName: `Custom C/D banks ${dateStr}`,
    customName: '',
    createdAt: now.toISOString(),
    savedAt: now.toISOString(),
    banks,
    slotMeta,
  };
  if (!Array.isArray(library.packages)) library.packages = [];
  library.packages.unshift(pkg);
  if (selPackage !== null) selPackage += 1;
  pendingSaveAnimationId = pkg.id;
  selLibTab = 'tones';

  // Auto-load the just-saved package into active C/D banks so they mirror
  // what the user built. Without this, the active list keeps whatever was
  // there before save and visibly disagrees with the bucket contents — a
  // confusing "I just saved this but the active list shows other patches"
  // experience.
  patches.banks = JSON.parse(JSON.stringify(pkg.banks));
  library.slotMeta = JSON.parse(JSON.stringify(pkg.slotMeta));
  ensureLibraryShape();
  activeBanksSourceLabel = pkg.customName || pkg.defaultName || null;

  // Close the builder and clear the buckets — save is the commit, the
  // workspace resets to a clean slate. To iterate on the saved bank,
  // load it from the Library into active banks and start a new build.
  s.active = false;
  s.C = new Array(16).fill(null);
  s.D = new Array(16).fill(null);

  saveLibraryDebounced();

  // Navigate to Library > Tones so the new entry is visible and animates in.
  selBank = 'L';
  selSlot = 0;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.bank === 'L');
  });
  renderPatchList();
  renderCustomBuilder();
}

// ═══════════════════════════════════════════════════════════════
// Tabs
// ═══════════════════════════════════════════════════════════════

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const nextBank = tab.dataset.bank;
      // Same-tab click: no-op (skip guard).
      if (nextBank === selBank) return;
      // Bank-tab switch is the broadest nav-away — leaves the Library
      // tab entirely if going L → C/D. guardSeqNav pops the SAVE /
      // DELETE modal first when sequence edits are pending.
      guardSeqNav(() => {
        selBank = nextBank;
        selSlot = 0;
        // Library tab always opens to the Tones sub-tab (2026-05-25) —
        // most users browse Tones far more than Sequences, and the prior
        // behavior of remembering the last sub-tab was a subtle UX
        // gotcha where users would click Library expecting tone
        // packages and land on whatever sub-tab they last touched.
        if (selBank === 'L') selLibTab = 'tones';
        // v0.6.5 Option B: tab switch exits paired-patch preview so the
        // panel reflects the new bank's selected slot — keeps the
        // mental model honest ("I see what I selected") and prevents
        // the modified-dot indicator from comparing against preview
        // params instead of the slot's actual contents. Suspended
        // during writePending so the Write flow (which auto-switches
        // to Bank C while keeping preview active) still works, and
        // mid-write tab clicks let the user pick a destination on a
        // different bank.
        if (currentPreviewPatch && !writePending) {
          currentPreviewPatch = null;
        }
        // v0.7.0: also reset the Library-tab phantom patch on any tab
        // change. Phantom tweaks are "for fun" only — discarded on
        // navigation so the next Library visit starts fresh from the
        // current bank state.
        phantomPatch = null;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderPatchList();
        renderCustomBuilder();   // updates toggle.disabled + force-closes on Library
        if (selBank !== 'L') {
          updateSvgPatchName();
          updateAllControls(currentPatch());
        }
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Drag-and-drop WAV import
// ═══════════════════════════════════════════════════════════════
//
// Dropping a .wav from the desktop onto the patch-list area imports it,
// routed by which tab + sub-tab is currently active:
//   - Library > Sequences  → open the save modal (optional note);
//                            paired patch is auto-captured from active
//                            selection, default name = source filename
//   - Library > Tones      → create a new library package directly,
//                            non-destructive (active C/D banks stay put)
//   - Bank C / Bank D      → confirmation modal: snapshot current banks
//                            into the library THEN import + replace
//                            active banks. Cancel aborts both.

function setupPatchListDropZone() {
  const list = document.getElementById('patch-list');
  if (!list) return;

  const isFileDrag = (e) => e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

  list.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    list.classList.add('drop-target');
  });
  list.addEventListener('dragleave', (e) => {
    if (e.currentTarget === list && !list.contains(e.relatedTarget)) {
      list.classList.remove('drop-target');
    }
  });
  list.addEventListener('drop', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    list.classList.remove('drop-target');

    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    const filePath = window.api.getPathForFile(file);
    if (!filePath) {
      showImportError('Could not read the dropped file path.');
      return;
    }
    if (!filePath.toLowerCase().endsWith('.wav')) {
      showImportError('Only .wav files can be dropped here.');
      return;
    }
    routeWavDrop(filePath);
  });
}

function routeWavDrop(filePath) {
  if (selBank === 'L' && selLibTab === 'sequences') {
    handleSequenceDropImport(filePath);
  } else if (selBank === 'L' && selLibTab === 'tones') {
    handleTonesDropImport(filePath);
  } else if (selBank === 'C' || selBank === 'D') {
    handleBankDropImport(filePath);
  } else {
    showImportError('Drop on Bank C, Bank D, or the Library > Tones/Sequences sub-tabs.');
  }
}

// v0.7.2: download icon click handler — writes the selected Library Tones
// package to ~/Desktop as a WAV. Replaces what used to be the "Save WAV
// file" button inside the Send modal (now removed): downloading lives per-
// library-row so the user picks WHAT to download in the same place they
// browse their library. Main side resolves the path under ~/Desktop and
// auto-uniques on collision; renderer just supplies a friendly filename.
async function handleDownloadTonesPackage(idx) {
  const pkg = library && library.packages && library.packages[idx];
  if (!pkg || !Array.isArray(pkg.banks)) {
    showImportError('No package data to download.');
    return;
  }
  const filename = pkg.customName || pkg.defaultName || `JP Patches package ${idx + 1}`;
  // jx3p bank.schema.json requires {format_version, banks} and rejects
  // additional top-level properties — _slotMeta is stripped main-side
  // before being passed to jx3p (see tape-save-wav-to-path). v0.7.2:
  // forgot format_version on first cut → jx3p validation rejected the
  // payload + dumped the input as stderr (Daniel hit a wall of
  // 'vca_level: 154, chorus: False, …' in the error modal).
  const exportData = { format_version: '1.0', banks: pkg.banks };
  if (pkg.slotMeta) exportData._slotMeta = pkg.slotMeta;
  try {
    const result = await window.api.tapeSaveWavToPath(exportData, filename);
    // v0.7.4: no success modal — the native Save dialog closing IS the
    // standard macOS confirmation. Apps don't double-confirm. Error
    // path still surfaces via the global error banner; cancel is a
    // silent no-op (result.saved === false with no error).
    if (result && !result.saved && result.error) {
      showImportError(`Could not write WAV: ${result.error}`);
    }
  } catch (err) {
    showImportError(`Could not write WAV: ${err && err.message || err}`);
  }
}

// v0.7.2: same shape as handleDownloadTonesPackage but for sequences.
// Builds the export payload via buildSequenceMetaForExport so cross-user
// receivers see the customName / originalName / patchNote / pairedPatch
// the v0.6.5 chunk preserves.
async function handleDownloadSequence(idx) {
  const seq = library && library.sequences && library.sequences[idx];
  if (!seq || !seq.tape || !Array.isArray(seq.tape.pages)) {
    showImportError('No sequence data to download.');
    return;
  }
  const filename = seq.customName || seq.defaultName || `JP Patches sequence ${idx + 1}`;
  const exportData = {
    pages: seq.tape.pages,
    _sequenceMeta: (typeof buildSequenceMetaForExport === 'function')
      ? buildSequenceMetaForExport(seq)
      : null,
  };
  try {
    const result = await window.api.seqTapeSaveWavToPath(exportData, filename);
    // v0.7.4: no success modal — see handleDownloadTonesPackage above.
    if (result && !result.saved && result.error) {
      showImportError(`Could not write WAV: ${result.error}`);
    }
  } catch (err) {
    showImportError(`Could not write WAV: ${err && err.message || err}`);
  }
}

// allPatchesIdentical lives in renderer/library-math.js (extracted v0.7.2
// for unit-testability — see test/library-math.test.js). The UMD wrapper
// attaches it to window, so the call site below picks it up as a global.

async function handleSequenceDropImport(filePath) {
  const result = await window.api.seqTapeSaveFromPath(filePath);
  if (!result || !result.loaded) {
    showImportError(`Could not decode this WAV as a sequence: ${result && result.error || 'unknown error'}`);
    return;
  }
  // v0.7.2: if the sequence decoder returned empty pages, this WAV is
  // almost certainly a Tones (patches) dump misrouted to the Sequences
  // sub-tab. Silently auto-route to the Tones sub-tab + import there.
  // Tab switch is the only signal — Daniel: "users will only do this
  // when they forget [which] tab they're on (or so goes my theory)."
  const hasContent = result.data && Array.isArray(result.data.pages)
    && result.data.pages.some((p) => Array.isArray(p));
  if (!hasContent) {
    selLibTab = 'tones';
    renderPatchList();
    handleTonesDropImport(filePath);
    return;
  }
  if (!activeBankPatch()) {
    showImportError('Select a patch before importing a sequence — the sequence pairs with the currently selected patch.');
    return;
  }
  showSaveSequenceModal({
    tapeData: result.data,
    sourcePath: filePath,
    sequenceMeta: result.sequenceMeta || null,
    onConfirm: ({ patchNote, defaultName, customName }) => {
      saveSequenceEntry({
        tapeData: result.data,
        patchNote,
        defaultName,
        customName,
        sequenceMeta: result.sequenceMeta || null,
      });
    },
  });
}

async function handleTonesDropImport(filePath) {
  const result = await window.api.tapeSaveFromPath(filePath);
  if (!result || !result.loaded) {
    showImportError(`Could not decode this WAV: ${result && result.error || 'unknown error'}`);
    return;
  }
  // Build a snapshot package directly from the decoded data, without touching
  // active C/D banks. Default name uses an "Imported" prefix to distinguish
  // these from "Saved" snapshots.
  const banks = decodedToInMemoryBanks(result.data);
  // v0.7.2: when a Sequence WAV gets misrouted to the Tones sub-tab,
  // jx3p's bank decoder happily returns 32 identical patches (the
  // paired-patch metadata gets read as bank data). Silently auto-route
  // to the Sequences sub-tab + import there. Tab switch is the only
  // signal — Daniel: "users will only do this when they forget [which]
  // tab they're on (or so goes my theory)." Heuristic is reliable —
  // legitimate bank exports almost never have 32 identical patches.
  if (banks && allPatchesIdentical(banks)) {
    selLibTab = 'sequences';
    renderPatchList();
    handleSequenceDropImport(filePath);
    return;
  }
  // Prefer the slotMeta embedded in the WAV's "jPpS" chunk (set by another
  // JP Patches install on export) so cross-user shares preserve custom names.
  // Fall back to decodedToSlotMeta when the WAV carries no chunk — gives
  // blank slot names that the user can fill in via inline rename.
  const slotMeta = result.slotMeta || decodedToSlotMeta(result.data);
  if (!banks) {
    showImportError('This WAV does not contain any patch data. Try dropping it on the Sequences sub-tab if it is a sequencer dump.');
    return;
  }
  // Fingerprint-history fallback: if no chunk supplied names, walk each
  // slot's params and try library.history. This is what makes a JX-3P
  // audio roundtrip (Electron → tape → JX → tape dump → import) restore
  // names — the chunk gets stripped by the audio path but the params come
  // back byte-identical so the fingerprint lookup hits.
  restoreNamesFromHistory(slotMeta, banks);
  const now = new Date();
  // Default to the dropped file's name (sans .wav/.json extension) so the
  // library entry is recognizable at a glance. Fall back to a date-stamped
  // "Imported" label if for some reason the path can't be parsed.
  const fileLabel = labelFromPath(filePath);
  const pkg = {
    id: now.toISOString(),
    defaultName: fileLabel
      || `Imported ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    customName: '',
    createdAt: now.toISOString(),
    savedAt: now.toISOString(),
    banks,
    slotMeta,
  };
  if (!Array.isArray(library.packages)) library.packages = [];
  library.packages.unshift(pkg);
  if (selPackage !== null) selPackage += 1;
  pendingSaveAnimationId = pkg.id;
  selLibTab = 'tones';
  saveLibraryDebounced();
  renderPatchList();
}

function handleBankDropImport(filePath) {
  const fileName = filePath.split(/[\\/]/).pop();
  showConfirmModal({
    title: 'Safety First!',
    body:
      `Saving the current C & D banks to the library — then loading ${fileName}`,
    confirmLabel: 'Continue',
    onConfirm: async () => {
      snapshotCurrentBanksToLibrary();
      const result = await window.api.tapeSaveFromPath(filePath);
      if (!result || !result.loaded) {
        showImportError(`Could not decode this WAV: ${result && result.error || 'unknown error'}`);
        return;
      }
      try {
        applyWavData(result.data, labelFromPath(filePath), result.slotMeta);
        saveLibraryDebounced();
        renderPatchList();
        updateSvgPatchName();
        updateAllControls(currentPatch());
      } catch (err) {
        showImportError(`Failed to apply imported data: ${err.message}`);
      }
    },
  });
}

// Snapshot active C/D banks into library.packages without navigating away.
// Used by the bank-tab drop flow as a safety backup before overwriting.
function snapshotCurrentBanksToLibrary() {
  if (!patches || !Array.isArray(patches.banks)) return;
  const now = new Date();
  const pkg = {
    id: now.toISOString(),
    defaultName: packageDefaultName(now),
    customName: '',
    createdAt: now.toISOString(),
    savedAt: now.toISOString(),
    banks: JSON.parse(JSON.stringify(patches.banks)),
    slotMeta: JSON.parse(JSON.stringify(library.slotMeta || {})),
  };
  if (!Array.isArray(library.packages)) library.packages = [];
  library.packages.unshift(pkg);
  if (selPackage !== null) selPackage += 1;
  // Persist immediately — the "Safety First" promise requires this snapshot
  // to survive even if the subsequent import or the app itself crashes.
  saveLibraryDebounced();
}

// Convert decoded jx3p output into the in-memory shape used by patches.banks
// (2 arrays of 16 param objects). Handles both the WAV decoder's array shape
// (data.banks = [[16 patches], [16 patches]]) and the app's JSON export shape
// (data.banks = { C: [{slot, name, params}], D: [...] }). Returns null when
// the data doesn't contain meaningful patch params.
function decodedToInMemoryBanks(data) {
  if (!data || !data.banks) return null;
  // WAV-shape (jx3p wav-to-json output): array of two banks of raw param objects.
  if (Array.isArray(data.banks) && data.banks.length >= 2) {
    const hasContent = [0, 1].some((bi) =>
      (data.banks[bi] || []).some((p) => p && Object.keys(p).length > 0));
    if (!hasContent) return null;
    return [0, 1].map((bi) =>
      (data.banks[bi] || []).slice(0, 16).map((p) => p || {}));
  }
  // App JSON shape: object keyed by 'C'/'D', each entry is {slot, name, params}.
  if (data.banks.C && data.banks.D) {
    const hasContent = ['C', 'D'].some((b) =>
      data.banks[b].some((entry) => entry && entry.params && Object.keys(entry.params).length > 0));
    if (!hasContent) return null;
    return ['C', 'D'].map((b) =>
      data.banks[b].slice(0, 16).map((entry) => (entry && entry.params) || {}));
  }
  return null;
}

function decodedToSlotMeta(data) {
  const meta = { C: [], D: [] };
  const isArrayShape = data && Array.isArray(data.banks);
  ['C', 'D'].forEach((bank) => {
    const arr = isArrayShape
      ? []  // WAV has no name/origin info per slot — defaults will apply
      : (data && data.banks && data.banks[bank]) || [];
    for (let s = 0; s < 16; s++) {
      const key = `${bank}${s + 1}`;
      const entry = arr[s] || {};
      meta[bank][s] = {
        name:        entry.name || null,
        origin:      entry.origin || key,
        sourceLabel: null,
      };
    }
  });
  return meta;
}

function showImportError(message) {
  showConfirmModal({
    title: 'Import error',
    body: message,
    confirmLabel: 'OK',
    onConfirm: () => {},
  });
}

// Patch info popover (triggered by the (i) icon in C/D bank rows). Shows the
// patch's provenance — current display name, origin slot it was imported from,
// and the source library — so the user can trace lineage after renaming.
function showPatchInfo(bank, slot) {
  const key = slotKey(bank, slot);
  const name = patchName(bank, slot);
  const origin = patchOrigin(bank, slot);
  const source = patchSourceLabel(bank, slot);          // most-recent library load
  const originLib = patchOriginLibrary(bank, slot);     // FIRST library — never overwritten
  const originalName = patchOriginalName(bank, slot);   // name at first stamp

  // Subtitle (centered, sits attached to the "Patch history" title):
  //   <current slot>: <current name> / <current library>
  const subParts = [`${key}: ${name || '(unnamed)'}`];
  if (source) subParts.push(source);
  const subtitle = subParts.join(' / ');

  // History block:
  //   Origin: <original slot> / <original name or "no name"> / <original library>
  //   Date:   uploaded <package savedAt formatted as "May 15, 2026">
  const originSlot = origin || key;
  const originName = originalName || 'no name';
  const originParts = [originSlot, originName];
  if (originLib) originParts.push(originLib);
  const originLine = `Origin: ${originParts.join(' / ')}`;

  // Look up the original library's upload date. Prefer createdAt (stamped
  // once when the package is first written); fall back to savedAt for
  // packages that predate the createdAt field. If the originLibrary string
  // matches a known package (by customName or defaultName), use its date;
  // otherwise skip the date line.
  let dateLine = null;
  if (originLib && library && Array.isArray(library.packages)) {
    const pkg = library.packages.find((p) =>
      (p.customName === originLib) || (p.defaultName === originLib));
    const stamp = pkg && (pkg.createdAt || pkg.savedAt);
    if (stamp) {
      const d = new Date(stamp);
      if (!Number.isNaN(d.getTime())) {
        const formatted = d.toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        });
        dateLine = `Date: uploaded ${formatted}`;
      }
    }
  }

  const lines = [originLine];
  if (dateLine) lines.push(dateLine);

  showConfirmModal({
    title: 'Patch history',
    subtitle,
    body: lines.join('\n'),
    confirmLabel: 'OK',
    onConfirm: () => {},
  });
}

// One-shot backfill so existing libraries get their originLibrary /
// originalName / sourceLabel fields populated using current data. Idempotent
// — only sets fields that are missing. Called once at boot, just after
// loading the library file.
function backfillOriginFields() {
  if (!library) return;
  let dirty = false;
  // Library packages: use each package's own name as the origin.
  (library.packages || []).forEach((pkg) => {
    // Backfill createdAt from savedAt for packages that predate the field.
    // Real first-upload date is unrecoverable; savedAt is the best we have.
    if (!pkg.createdAt && pkg.savedAt) { pkg.createdAt = pkg.savedAt; dirty = true; }
    const pkgName = pkg.customName || pkg.defaultName || null;
    if (!pkgName || !pkg.slotMeta) return;
    ['C', 'D'].forEach((bank) => {
      const arr = pkg.slotMeta[bank];
      if (!Array.isArray(arr)) return;
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (!m) continue;
        if (!m.sourceLabel)   { m.sourceLabel   = pkgName; dirty = true; }
        if (!m.originLibrary) { m.originLibrary = pkgName; dirty = true; }
        if (!m.originalName && m.name) { m.originalName = m.name; dirty = true; }
      }
    });
  });
  // Active C/D banks: if a slot has a sourceLabel from a previous load,
  // promote it to originLibrary. (Slots with no source info stay unset.)
  ['C', 'D'].forEach((bank) => {
    const arr = library.slotMeta && library.slotMeta[bank];
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (!m) continue;
      if (!m.originLibrary && m.sourceLabel) { m.originLibrary = m.sourceLabel; dirty = true; }
      if (!m.originalName && m.name) { m.originalName = m.name; dirty = true; }
    }
  });
  if (dirty) saveLibraryDebounced();
}

async function init() {
  patches = await window.api.loadPatches();
  library = await window.api.loadLibrary();
  // Schema-versioned migration (see renderer/library-schema.js).
  // Runs version-stepped one-time transforms; idempotent on up-to-
  // date files; stamps schemaVersion if missing. Returns a fresh
  // empty library if the disk file was null/empty.
  library = migrateLibraryToCurrent(library);
  // Per-load shape-invariant ensurer — adds default values for any
  // missing top-level fields, backfills slotMeta from legacy `names`,
  // etc. Idempotent + runs on every load regardless of version.
  ensureLibraryShape();
  backfillOriginFields();

  // If library has persisted active patches from a prior session, prefer
  // them as the source of truth — they're the user's actual most-recent
  // state, including any in-flight knob/switch edits. Falls back to
  // whatever loadPatches returned (legacy ~/Desktop/patches.json or the
  // shipped seed) only when no active state has been saved yet.
  if (library.activePatches
      && Array.isArray(library.activePatches)
      && library.activePatches.length === 2) {
    patches = patches || { format_version: '1.0', banks: null };
    patches.banks = JSON.parse(JSON.stringify(library.activePatches));
  }

  // View > zoom presets are owned by main (it resizes the window and
  // applies the renderer zoomFactor). When the user picks a new preset,
  // main pushes the value here so we can persist it for the next launch.
  if (typeof window.api.onZoomChanged === 'function') {
    window.api.onZoomChanged((factor) => {
      if (typeof factor !== 'number') return;
      library.zoomFactor = factor;
      saveLibraryDebounced();
    });
  }
  // Button-sound toggle (View > Button Sounds). Restore the saved state,
  // tell main its initial checkbox value, then react to future toggles.
  buttonSoundsEnabled = library.buttonSounds !== false;   // default on
  if (typeof window.api.setButtonSoundsInitial === 'function') {
    window.api.setButtonSoundsInitial(buttonSoundsEnabled);
  }
  if (typeof window.api.onButtonSoundsChanged === 'function') {
    window.api.onButtonSoundsChanged((enabled) => {
      buttonSoundsEnabled = !!enabled;
      library.buttonSounds = buttonSoundsEnabled;
      saveLibraryDebounced();
    });
  }
  // Tape-dump-sounds toggle (View > Tape dump sounds). Off by default;
  // same restore / report-initial / react-to-toggle handshake as button
  // sounds, persisted under library.transmissionSounds.enabled.
  tapeDumpSoundsEnabled = !!(library.transmissionSounds && library.transmissionSounds.enabled);
  if (library.transmissionSounds && typeof library.transmissionSounds.volume === 'number') {
    tapeDumpVolume = Math.max(0, Math.min(1, library.transmissionSounds.volume));
  }
  if (typeof window.api.setTapeDumpSoundsInitial === 'function') {
    window.api.setTapeDumpSoundsInitial(tapeDumpSoundsEnabled);
  }
  if (typeof window.api.onTapeDumpSoundsChanged === 'function') {
    window.api.onTapeDumpSoundsChanged((enabled) => {
      tapeDumpSoundsEnabled = !!enabled;
      if (!library.transmissionSounds) library.transmissionSounds = {};
      library.transmissionSounds.enabled = tapeDumpSoundsEnabled;
      saveLibraryDebounced();
    });
  }
  // v0.7.1: standalone Help → Audio Diagnostics modal removed (canary
  // check + bug-report flow folded into the Audio Settings modal). The
  // IPC channel + preload binding stay as harmless dead code.
  // No source label at boot — active C/D banks are unnamed until the user
  // explicitly loads a library package (which sets activeBanksSourceLabel
  // to that package's name). The send-to-JX modal falls back to the
  // generic "Send C and D banks to JX-3P" title when label is null.

  // patches may be null on first run (no ~/Desktop/patches.json yet). That's
  // not a fatal state — the empty-state in renderPatchList prompts the user
  // to import via Tape Memory > Tone > Save. Continue with normal setup.

  // Inject the locked panel SVG. main.js's loadPanelSvg returns null if the
  // file is missing/unreadable (used to throw, which crashed init mid-way
  // through; now returns null so we can surface a clear empty state instead).
  const svgText = await window.api.loadPanelSvg();
  const host = document.getElementById('panel-host');
  if (!svgText) {
    host.innerHTML = '<div style="padding:40px;text-align:center;color:#b94a2e;font-family:Helvetica,sans-serif;">Panel SVG asset missing — reinstall the app or report a bug.</div>';
    console.error('panel.svg failed to load — app state is partial');
  } else {
    host.innerHTML = svgText;
    const svgEl = host.querySelector('svg');
    if (svgEl) {
      svgPatchNameEl = findSvgPatchNameEl(svgEl);
      tagControls(svgEl);
      setupInteraction(svgEl);
    }
  }

  setupTabs();
  setupLibSubTabs();
  setupHwButtons();
  setupPatchListDropZone();
  setupCustomBuilder();
  setupAppSoundPicker();
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !writePending) return;
    // If a modal is open it handles its own Esc (close → write mode stays
    // armed so the user can pick a different slot).
    if (document.querySelector('.modal-overlay')) return;
    cancelWriteMode();
  });
  // One-shot migration for libraries that predate the activePatches
  // persistence: re-baseline cleanParams to current state. Pre-fix,
  // patches.banks could silently revert to seed at every boot while
  // cleanParams persisted from the last library load — leaving all 32
  // slots looking "modified" against a baseline that no longer exists
  // in the working state. We detect this case by the absence of
  // library.activePatches and heal once.
  const isFirstBootWithActivePatchesSupport = !library.activePatches;
  if (isFirstBootWithActivePatchesSupport) {
    snapshotCleanParamsAll();
    saveLibraryDebounced();   // persist activePatches + freshly-aligned cleanParams
  } else {
    // Subsequent boots: only backfill missing cleanParams (slots from
    // libraries that predate the modified-indicator feature entirely).
    // Existing cleanParams is preserved so "I had unsaved edits before
    // quitting" survives the restart.
    ['C', 'D'].forEach((bank) => {
      for (let s = 0; s < 16; s++) {
        const meta = library.slotMeta && library.slotMeta[bank] && library.slotMeta[bank][s];
        if (meta && !meta.cleanParams) snapshotCleanParamsAt(bank, s);
      }
    });
  }

  renderPatchList();
  selectPatch(0);
  // Arm patch-switch animations AFTER the initial paint, so the C1
  // load doesn't visibly spin every knob from 0° to its real angle on
  // app launch. After this frame, any subsequent patch switch will
  // smoothly animate changed knobs to their new positions.
  requestAnimationFrame(() => {
    document.body.classList.add('controls-armed');
  });
}

// v0.7.0 — gear icon in the panel's red header strip (top-right). Opens
// a Settings modal with toggles for button/switch + tape-dump sounds
// AND device pickers for app audio routing + tape dump routing. Replaces
// the earlier always-visible chrome dropdown — less panel clutter,
// single point of audio configuration.
function setupAppSoundPicker() {
  const host = document.getElementById('panel-host');
  if (!host) return;
  if (document.getElementById('app-settings-gear')) return;    // idempotent

  const gear = document.createElement('button');
  gear.id = 'app-settings-gear';
  gear.className = 'app-settings-gear';
  gear.type = 'button';
  gear.setAttribute('aria-label', 'Open audio settings');
  gear.title = 'Audio settings';
  // Solid-fill cog icon (Material-style). More white-on-red mass than the
  // outline variant — reads cleanly at the small rendered size in the
  // panel header strip.
  gear.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' +
      '<path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>' +
    '</svg>';
  host.appendChild(gear);

  gear.addEventListener('click', () => {
    if (typeof showAudioSettingsModal === 'function') showAudioSettingsModal();
  });
}

// v0.7.0 — Audio Settings modal. Single point of audio configuration:
// two on/off toggles (tape dump sounds + button/switch sounds) and two
// device routing dropdowns (in-app audio + tape dump cable routing).
// Replaces the View-menu toggles (single source of truth) and the
// always-visible chrome dropdown. Wording per Daniel's 2026-06-02 call.
function showAudioSettingsModal() {
  if (document.querySelector('.audio-settings-modal')) return;   // idempotent

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal audio-settings-modal';
  modal.style.maxWidth = '520px';

  const closeX = document.createElement('button');
  closeX.className = 'modal-close-x';
  closeX.setAttribute('aria-label', 'Close');
  closeX.textContent = '×';

  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = 'Audio settings';

  // Row builders.
  const mkLabelBlock = (header, subtext) => {
    const lbl = document.createElement('div');
    lbl.className = 'settings-row-label';
    const h = document.createElement('div');
    h.className = 'settings-row-header';
    h.textContent = header;
    const s = document.createElement('div');
    s.className = 'settings-row-subtext';
    s.textContent = subtext;
    lbl.appendChild(h);
    lbl.appendChild(s);
    return lbl;
  };

  const mkToggleRow = (header, subtext, initial, onChange) => {
    const row = document.createElement('div');
    row.className = 'settings-row settings-row-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'settings-row-checkbox';
    cb.checked = !!initial;
    cb.addEventListener('change', () => onChange(cb.checked));
    const labelEl = document.createElement('label');
    labelEl.className = 'settings-row-toggle-label';
    labelEl.appendChild(cb);
    labelEl.appendChild(mkLabelBlock(header, subtext));
    row.appendChild(labelEl);
    return row;
  };

  const mkSelectRow = (header, subtext, savedId, onChange) => {
    const row = document.createElement('div');
    row.className = 'settings-row settings-row-select';
    row.appendChild(mkLabelBlock(header, subtext));
    const sel = document.createElement('select');
    sel.className = 'settings-row-select-control';
    // Placeholder until enumerateDevices resolves.
    const loading = document.createElement('option');
    loading.value = '';
    loading.textContent = 'checking…';
    sel.appendChild(loading);
    sel.addEventListener('change', () => {
      const id = sel.value || null;
      // Pull the human-readable label from the picked <option>'s
      // dataset (set during populate). Used to cache the label so a
      // future unplug still shows the friendly name in a ghost option.
      const opt = sel.options[sel.selectedIndex];
      const label = (opt && opt.dataset.deviceLabel) || null;
      onChange(id, label);
    });
    row.appendChild(sel);
    // Expose for async populate.
    row._select = sel;
    row._savedId = savedId;
    return row;
  };

  // Build the four rows.
  const tdsRow = mkToggleRow(
    'Tape dump sounds',
    'hear your tape dump (without affecting data transfer between JX and JP)',
    tapeDumpSoundsEnabled,
    (on) => {
      tapeDumpSoundsEnabled = on;
      if (!library.transmissionSounds) library.transmissionSounds = {};
      library.transmissionSounds.enabled = on;
      saveLibraryDebounced();
      // Mirror to the main-process menu checkbox so the View menu (if
      // still present in this build) reflects modal-driven changes.
      if (window.api && typeof window.api.setTapeDumpSoundsInitial === 'function') {
        window.api.setTapeDumpSoundsInitial(on);
      }
    }
  );

  const bsRow = mkToggleRow(
    'Button and switch sounds',
    'bring the PG-200 dashboard to life!',
    buttonSoundsEnabled,
    (on) => {
      buttonSoundsEnabled = on;
      library.buttonSounds = on;
      saveLibraryDebounced();
      if (window.api && typeof window.api.setButtonSoundsInitial === 'function') {
        window.api.setButtonSoundsInitial(on);
      }
    }
  );

  const inAppRow = mkSelectRow(
    'In-app audio',
    'where you hear tape dump, button, switch, and sequence editor sounds',
    library.appSoundDeviceId,
    (id, label) => {
      library.appSoundDeviceId    = id;
      library.appSoundDeviceLabel = label;
      saveLibraryDebounced();
      if (typeof setPreviewSink === 'function') setPreviewSink(id);
      // makeSoundPlayer audio elements pick up the change lazily on
      // their next play call.
    }
  );

  const cableRow = mkSelectRow(
    'Tape dump routing',
    'choose your cable or audio interface for transferring data between JX and JP',
    library.cableOutputDeviceId,
    (id, label) => {
      library.cableOutputDeviceId    = id;
      library.cableOutputDeviceLabel = label;
      saveLibraryDebounced();
    }
  );

  // v0.7.1: 5th row — Record input device. Same library.record.preferred*
  // fields the Record-from-JX modal writes to, so either surface stays
  // in sync. Read-current-saved-id-from-library in the populate path
  // (not the row's _savedId snapshot) so picks made in the Record modal
  // while this modal is open get reflected on the next refresh.
  const recordRow = mkSelectRow(
    'Record from JX-3P routing',
    'where JP captures the JX-3P’s tape dump audio',
    library.record && library.record.preferredInputDeviceId,
    (id, label) => {
      ensureRecordCalibrationShape();
      library.record.preferredInputDeviceId    = id;
      library.record.preferredInputDeviceLabel = label;
      saveLibraryDebounced();
    }
  );

  modal.appendChild(closeX);
  modal.appendChild(title);
  modal.appendChild(tdsRow);
  modal.appendChild(bsRow);
  modal.appendChild(inAppRow);
  modal.appendChild(cableRow);
  modal.appendChild(recordRow);

  // v0.7.1: collapsible "How routing works" disclosure. Power users
  // who want to understand the 4 distinct audio paths can expand it;
  // casual users see only the headers + the dropdowns above. Sits
  // here below the controls so the table reads as supporting
  // documentation, not an action item.
  const routingDetails = document.createElement('details');
  routingDetails.className = 'audio-settings-routing-details';
  const routingSummary = document.createElement('summary');
  routingSummary.textContent = 'How routing works';
  routingDetails.appendChild(routingSummary);
  const routingTable = document.createElement('table');
  routingTable.className = 'audio-settings-routing-table';
  routingTable.innerHTML =
    '<thead><tr><th>Sound</th><th>Where it plays</th></tr></thead>' +
    '<tbody>' +
      '<tr><td>Button &amp; switch clicks, sequencer note previews</td>' +
        '<td>The <strong>In-app audio</strong> device you picked above ' +
        '(or system default if you haven&rsquo;t picked).</td></tr>' +
      '<tr><td>Tape Dump Sounds &mdash; the FSK monitor you hear during a transfer</td>' +
        '<td>Your Mac&rsquo;s built-in speakers, always. ' +
        '(Hardcoded for safety &mdash; can&rsquo;t accidentally route into the cable.)</td></tr>' +
      '<tr><td>Outgoing tape dumps (Send to JX-3P)</td>' +
        '<td>The <strong>Tape dump routing</strong> device you picked above.</td></tr>' +
      '<tr><td>Incoming tape dumps (Record from JX-3P)</td>' +
        '<td>The input device you pick in the Record-from-JX modal ' +
        '(remembered across sessions).</td></tr>' +
    '</tbody>';
  routingDetails.appendChild(routingTable);
  modal.appendChild(routingDetails);

  // v0.7.1: canary status banner (folded in from the removed Audio
  // Diagnostics modal). Only renders when Tape Dump Sounds' built-in-
  // speaker allowlist DOESN'T match a present device — that's the
  // silent-regression check that catches macOS-update label format
  // changes. When status is 'ok' we render nothing (no need to alarm
  // users when everything's fine).
  const canarySection = document.createElement('div');
  canarySection.className = 'audio-settings-canary';
  canarySection.style.display = 'none';   // hidden until runAudioDiagnostic resolves to a bad state
  modal.appendChild(canarySection);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const doneBtn = document.createElement('button');
  doneBtn.className = 'modal-btn modal-btn-confirm';
  doneBtn.textContent = 'Done';
  actions.appendChild(doneBtn);
  modal.appendChild(actions);

  // Run the canary check + render the warning inline if needed. Same
  // diagnostic logic the standalone modal used to run; the bug-report
  // button reuses buildAudioDiagnosticIssueUrl + openExternal IPC.
  (async () => {
    if (typeof runAudioDiagnostic !== 'function') return;
    const diag = await runAudioDiagnostic();
    if (diag.status === 'ok') return;
    canarySection.style.display = '';
    const icon = document.createElement('span');
    icon.className = 'audio-settings-canary-icon';
    const text = document.createElement('div');
    text.className = 'audio-settings-canary-text';
    let showReport = false;
    if (diag.status === 'no-match') {
      icon.textContent = '⚠';
      text.innerHTML = '<strong>Tape Dump Sounds may not work.</strong> The macOS speaker label format looks unfamiliar — likely a recent OS update changed it.';
      showReport = true;
    } else if (diag.status === 'no-outputs') {
      icon.textContent = '⚠';
      text.innerHTML = '<strong>No audio outputs detected.</strong> Tape Dump Sounds + In-app audio routing are unavailable.';
      showReport = true;
    } else if (diag.status === 'empty-labels') {
      icon.textContent = 'ℹ';
      text.innerHTML = '<strong>Audio device labels not yet visible</strong> (microphone permission required). Use Record-from-JX once to grant the permission, then reopen this dialog.';
    }
    canarySection.appendChild(icon);
    canarySection.appendChild(text);
    canarySection.classList.add(`audio-settings-canary-${diag.status}`);
    if (showReport) {
      const reportBtn = document.createElement('button');
      reportBtn.type = 'button';
      reportBtn.className = 'audio-settings-canary-report';
      reportBtn.textContent = 'Report this bug';
      reportBtn.addEventListener('click', async () => {
        reportBtn.disabled = true;
        const originalLabel = reportBtn.textContent;
        reportBtn.textContent = 'Opening browser…';
        try {
          let appInfo = { appVersion: 'unknown', macOsRelease: 'unknown' };
          if (window.api && typeof window.api.getAppInfo === 'function') {
            try { appInfo = await window.api.getAppInfo() || appInfo; } catch {}
          }
          const url = buildAudioDiagnosticIssueUrl({
            diag,
            appVersion:   appInfo.appVersion,
            macOsRelease: appInfo.macOsRelease,
            regexSource:  (window.MAC_SPEAKER_LABEL_RE && window.MAC_SPEAKER_LABEL_RE.source) || '(missing)',
          });
          if (window.api && typeof window.api.openExternal === 'function') {
            const res = await window.api.openExternal(url);
            if (res && res.ok) {
              close();
              return;
            }
          }
          reportBtn.textContent = 'Could not open browser';
          setTimeout(() => { reportBtn.textContent = originalLabel; reportBtn.disabled = false; }, 2000);
        } catch (err) {
          console.warn('[audio-settings-canary] report flow failed:', (err && err.name) || err);
          reportBtn.textContent = 'Could not open browser';
          setTimeout(() => { reportBtn.textContent = originalLabel; reportBtn.disabled = false; }, 2000);
        }
      });
      canarySection.appendChild(reportBtn);
    }
  })();

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Hot-plug listener handle — assigned below, removed in close().
  let onDeviceChange = null;
  const close = () => {
    if (onDeviceChange) {
      try { navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange); } catch {}
      onDeviceChange = null;
    }
    overlay.remove();
  };
  closeX.addEventListener('click', close);
  doneBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      close();
      document.removeEventListener('keydown', onKey);
    }
  });

  // v0.7.0 (revised 2026-06-02): "ghost" option for a saved device
  // that's no longer enumerated (interface unplugged). Keeps the
  // selection in memory so plug-it-back-in restores it without the
  // user having to re-pick. Disabled in the dropdown — user has to
  // actively choose system-default (or another device) to use audio
  // right now, but the saved id stays in library.
  //
  // v0.7.1: generalized over device kind (outputs / inputs) and over
  // the library-path triplet (id / label / how-to-write-label-back)
  // so the same logic drives the In-app, Tape dump, AND Record input
  // pickers. cfg = { devices, savedId, savedLabel, setLabel }.
  const populate = (row, cfg) => {
    const sel = row._select;
    sel.textContent = '';
    const sysOpt = document.createElement('option');
    sysOpt.value = '';
    sysOpt.dataset.deviceLabel = '';
    const def = cfg.devices.find((d) => d.deviceId === 'default') || cfg.devices[0];
    const defLabel = (def && def.label) || 'unknown';
    sysOpt.textContent = `(system default — ${defLabel})`;
    sel.appendChild(sysOpt);
    cfg.devices.forEach((d) => {
      if (d.deviceId === 'default' || !d.deviceId) return;
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.dataset.deviceLabel = d.label || '';
      opt.textContent = d.label || `(unnamed device ${d.deviceId.slice(0, 6)})`;
      sel.appendChild(opt);
    });
    const presentDev = cfg.savedId && cfg.devices.find((d) => d.deviceId === cfg.savedId);
    if (presentDev) {
      sel.value = cfg.savedId;
      if (cfg.savedLabel !== presentDev.label) {
        cfg.setLabel(presentDev.label);
        saveLibraryDebounced();
      }
    } else if (cfg.savedId) {
      // Ghost option: render saved-but-unplugged device as the SELECTED
      // value in the closed dropdown (not disabled — disabling hides it
      // behind the system-default fallback, which silently misled users
      // into thinking their pick was lost). Inserted at the very top so
      // the user reads the saved selection first. Effective routing:
      // - Send modal safety belt blocks Play when state === 'missing'.
      // - In-app sounds attempt setSinkId(savedId), fail silently, fall
      //   through to default sink — user sees the "unavailable, plug
      //   it in!" suffix and understands why audio isn't on their pick.
      const ghostLabel = cfg.savedLabel || '(unknown device)';
      const ghost = document.createElement('option');
      ghost.value = cfg.savedId;
      ghost.dataset.deviceLabel = ghostLabel;
      ghost.textContent = `${ghostLabel} (unavailable, plug it in!)`;
      sel.insertBefore(ghost, sel.children[0] || null);
      sel.value = cfg.savedId;
    } else {
      sel.value = '';
    }
  };

  // Async device-list refresh — initial call + devicechange-driven
  // re-runs share this single path. Catches the "unplug → ghost shown
  // → replug → ghost gone, live option re-selected" cycle without
  // requiring the user to close + reopen. Enumerates both audiooutput
  // (for In-app + Tape dump routing) and audioinput (for Record input).
  const refresh = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      const inputs  = devices.filter((d) => d.kind === 'audioinput');
      populate(inAppRow, {
        devices:    outputs,
        savedId:    library.appSoundDeviceId,
        savedLabel: library.appSoundDeviceLabel,
        setLabel:   (l) => { library.appSoundDeviceLabel = l; },
      });
      populate(cableRow, {
        devices:    outputs,
        savedId:    library.cableOutputDeviceId,
        savedLabel: library.cableOutputDeviceLabel,
        setLabel:   (l) => { library.cableOutputDeviceLabel = l; },
      });
      populate(recordRow, {
        devices:    inputs,
        savedId:    library.record && library.record.preferredInputDeviceId,
        savedLabel: library.record && library.record.preferredInputDeviceLabel,
        setLabel:   (l) => {
          ensureRecordCalibrationShape();
          library.record.preferredInputDeviceLabel = l;
        },
      });
    } catch {}
  };
  refresh();
  // Listen for OS-level device changes so the modal stays in sync with
  // physical plug/unplug while open. Detached in close().
  onDeviceChange = () => { refresh(); };
  try { navigator.mediaDevices.addEventListener('devicechange', onDeviceChange); } catch {}
}

function setupHwButtons() {
  const wire = (id, handler) => {
    const btn = document.getElementById(`hw-${id}`);
    if (!btn) return;
    btn.addEventListener('mousedown', () => {
      btn.classList.add('pressed');
      if (!btn.disabled) playButtonClick();
    });
    btn.addEventListener('mouseup',   () => btn.classList.remove('pressed'));
    btn.addEventListener('mouseleave', () => btn.classList.remove('pressed'));
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      // Re-light the button and let the glow paint before running the
      // handler — most handlers open a modal synchronously, which would
      // otherwise block the render so the press visual never appears.
      btn.classList.add('pressed');
      setTimeout(() => {
        handler();
        // Clear the glow shortly after the handler fires (modal is now up).
        setTimeout(() => btn.classList.remove('pressed'), 180);
      }, 130);
    });
  };
  wire('tone-save', handleTapeToneSave);
  wire('tone-load', handleTapeToneLoad);
  wire('seq-save',  handleTapeSeqSave);
  wire('seq-load',  handleTapeSeqLoad);
  setupMemoryDropdown();
}

function midiBlocked(action) {
  if (getTapeMode() !== 'midi') return false;
  console.warn(`MIDI mode: ${action} not implemented (Phase 3).`);
  return true;
}

function handleTapeToneSave() { if (!midiBlocked('Tone save (import)'))  handleToneSave(); }
function handleTapeToneLoad() { if (!midiBlocked('Tone load (export)'))  handleToneLoad(); }
function handleTapeSeqSave()  { if (!midiBlocked('Sequencer save'))      handleSequencerSave(); }
function handleTapeSeqLoad()  { if (!midiBlocked('Sequencer load'))      handleSequencerLoad(); }

function getTapeMode() {
  return library && library.tapeMode === 'midi' ? 'midi' : 'tape';
}

function setupMemoryDropdown() {
  const sel = document.getElementById('hw-memory-mode');
  if (!sel) return;
  sel.value = getTapeMode();
  sel.addEventListener('change', () => {
    if (!library) return;
    const newMode = sel.value === 'midi' ? 'midi' : 'tape';
    library.tapeMode = newMode;
    saveLibraryDebounced();
    // Phase 3 placeholder: surface a friendly "coming soon" modal the
    // moment the user flips to MIDI Memory so they know nothing's
    // broken — the buttons would silently no-op otherwise (via the
    // existing midiBlocked console-warn). Tape Memory is still the
    // only working mode until the JX-3P MIDI Upgrade Kit is installed
    // and Phase 3 lands.
    if (newMode === 'midi') {
      // Revert dropdown + persisted mode back to Tape Memory on any
      // dismissal (OK / Esc / overlay click). MIDI is non-functional
      // until Phase 3 ships, so leaving the dropdown stuck on MIDI
      // would imply the mode is active when it isn't — better to bounce
      // it back so the next attempt to use Tape Memory just works.
      const revertToTape = () => {
        sel.value = 'tape';
        library.tapeMode = 'tape';
        saveLibraryDebounced();
      };
      showConfirmModal({
        title: 'MIDI Memory mode',
        body:
          'MIDI functionality is coming soon (once I install the Series Circuits ' +
          'MIDI upgrade kit on my JX-3P). Hold tight!',
        confirmLabel: 'OK',
        hideCancel: true,
        onConfirm: revertToTape,
        onCancel:  revertToTape,
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
