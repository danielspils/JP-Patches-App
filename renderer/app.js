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
}
function getCalibratedGain(deviceId) {
  if (!deviceId || !library || !library.record) return null;
  const entry = library.record.calibratedGain && library.record.calibratedGain[deviceId];
  return (entry && typeof entry.gain === 'number') ? entry : null;
}
function setCalibratedGain(deviceId, gain, label) {
  if (!deviceId || typeof gain !== 'number' || !Number.isFinite(gain) || gain <= 0) return;
  ensureRecordCalibrationShape();
  library.record.calibratedGain[deviceId] = {
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
      const priorCal  = deviceId ? getCalibratedGain(deviceId) : null;
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
  if (!patches || !Array.isArray(patches.banks) || selBank === 'L') return null;
  const bankIdx = selBank === 'D' ? 1 : 0;
  return patches.banks[bankIdx] && patches.banks[bankIdx][selSlot] || null;
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
  const prefix = `${slotKey(selBank, selSlot)}: `;
  const name   = patchName(selBank, selSlot) || patchPlaceholder(selBank, selSlot);
  if (prefixSpan) prefixSpan.textContent = prefix;
  if (nameSpan)   nameSpan  .textContent = name;
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

function setupInteraction(svg) {
  let dragState = null;
  let downBtnId = null;
  // (downBtnInside removed 2026-05-26: was assigned but never read —
  // remnant of an earlier panel-button hover-inside-outside tracking
  // that was simplified away.)

  function applyDragAngle(clientY) {
    // Drag up (negative dy) = clockwise (positive angle). 2° per 1px (140px = full range).
    const dy = clientY - dragState.startY;
    const angle = Math.max(-140, Math.min(140, dragState.startAngle - dy * 2));
    dragState.knob.setAttribute('transform', `rotate(${angle.toFixed(1)})`);
    // Live-update the value tooltip during drag (hover delay is
    // bypassed — see showDragTooltip / updateDragTooltip below).
    const liveVal = angleToParam(dragState.param, angle);
    if (typeof liveVal === 'number') updateDragTooltip(liveVal);
    return angle;
  }

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
      e.preventDefault();
    } else if (type === 'button') {
      downBtnId = ctrl.dataset.buttonId;
      lightButton(downBtnId, true);
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
        lightButton(downBtnId, false);
      }
      // Manual stays visual-only (Phase 3 / MIDI work).
      downBtnId = null;
    }
  });

  // ─── Numeric-edit overlay for smooth knobs (2026-05-25) ──────────────
  //
  // Logic-style behavior:
  //   - Hover a smooth knob: small floating tooltip shows the current
  //     raw uint8 value (0–255).
  //   - Double-click: input field appears centered over the knob,
  //     pre-filled with the current value. Type a new number, press
  //     Enter to commit. Esc or click-outside cancels.
  //   - Invalid input on Enter: flash red, keep the input open.
  //
  // Smooth knobs only — discrete (snap) knobs, switches, and buttons
  // do nothing on double-click (their value model is a fixed enum, not
  // a continuous range, so typing 247 makes no sense).
  let valueTooltip = null;
  let editInput    = null;
  let tooltipTimer = null;   // pending hover delay (1 s before tooltip appears)

  // Display-range conversion (2026-05-25): patches are stored as uint8
  // (0–255) internally — that's the JX-3P tape format precision and
  // doesn't change. The hover tooltip + numeric edit display in 0–100
  // (percentage) because it's easier to read and matches the
  // forthcoming MIDI 7-bit range (0–127) in spirit. Typed input loses
  // 2.5× addressable granularity vs raw uint8, but the rounded values
  // are well below the just-noticeable-difference for any continuous
  // JX param. Drag still gives full 256-value access via cursor.
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

  // Tooltip appears after a 1 s hover hold — protects against accidental
  // tooltips popping up as the mouse just drifts across the panel. The
  // 1 s timer is canceled on mouseout, so casual fly-overs never show
  // a tooltip; only deliberate dwell does.
  const TOOLTIP_HOVER_DELAY_MS = 1000;
  const showKnobValueTooltip = (knobEl, param) => {
    if (dragState || editInput) return;
    hideKnobValueTooltip();              // clears both pending timer + visible tooltip
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

  const hideKnobValueTooltip = () => {
    if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
    if (valueTooltip) { valueTooltip.remove();      valueTooltip = null; }
  };

  // During a drag we bypass the 1 s hover delay — the user is actively
  // adjusting and wants to see the live value immediately. Called from
  // the smooth-knob mousedown handler. updateDragTooltip is called from
  // applyDragAngle on each mousemove tick to reflect the new value.
  const showDragTooltip = (knobEl, val) => {
    hideKnobValueTooltip();                  // clear pending timer + any existing tooltip
    valueTooltip = document.createElement('div');
    valueTooltip.className = 'knob-value-tooltip';
    valueTooltip.textContent = `${uint8ToDisplay(val)}%`;
    document.body.appendChild(valueTooltip);
    positionOverlay(valueTooltip, knobEl);
  };
  const updateDragTooltip = (val) => {
    if (valueTooltip) valueTooltip.textContent = `${uint8ToDisplay(val)}%`;
  };

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
    banner.textContent = 'Click a slot to write current patch (Esc to cancel)';
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

  const btn = document.createElement('button');
  btn.className = 'save-banks-btn';
  btn.textContent = 'save C/D banks to library';
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

function renderLibraryActions(_actions) {
  // The "load to app" action moved to an inline hover icon on each
  // package row (see buildLoadToAppIcon). No bottom-of-list button.
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
    ph.textContent = 'No saved packages yet.\nUse "save C/D banks to library" on a bank tab.';
    list.appendChild(ph);
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
      title: 'Loading new C/D banks to JP Patches',
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
    title: 'Loading new C/D banks to JP Patches',
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
}

// Lightweight confirmation modal.
// `tertiaryLabel` / `onTertiary` / `tertiaryStyle` (optional) add a third
// button between Cancel and Confirm. Use for prompts that need a "primary
// recommended action" plus a "secondary safe alternative" — e.g. the
// Record-from-JX failure prompt offering both "Try again" (no recal) and
// "Recalibrate" (clear gain). Tertiary defaults to no styling (cream
// alt-button); pass tertiaryStyle: 'confirm' to make it the green primary
// and tertiaryStyle: 'alt' for the blue alt-style.
function showConfirmModal({ title, subtitle, body, confirmLabel, confirmStyle, onConfirm, tertiaryLabel, onTertiary, tertiaryStyle }) {
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

  actions.appendChild(cancelBtn);
  if (tertiaryBtn) actions.appendChild(tertiaryBtn);
  actions.appendChild(confirmBtn);
  modal.appendChild(h);
  if (sub) modal.appendChild(sub);
  if (p) modal.appendChild(p);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
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
    if (e.key === 'Enter')  { runCallback(onConfirm, 'Confirm action'); close(); }
  };

  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', () => { runCallback(onConfirm, 'Confirm action'); close(); });
  if (tertiaryBtn) tertiaryBtn.addEventListener('click', () => { runCallback(onTertiary, 'Tertiary action'); close(); });
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
  inp.value = library.packages[idx].customName || '';
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
      'No saved sequences yet.\nUse Tape Memory "Sequencer" mode + Save on a bank tab.';
    list.appendChild(ph);
    return;
  }

  seqs.forEach((seq, idx) => {
    const item = document.createElement('div');
    item.className = 'package-item' + (idx === selSequence ? ' selected' : '');
    if (seq.id && seq.id === pendingSaveAnimationId) {
      item.classList.add('just-saved');
      pendingSaveAnimationId = null;
      item.addEventListener('animationend', () => item.classList.remove('just-saved'), { once: true });
    }
    item.draggable = true;
    item.dataset.idx = String(idx);

    const nm = document.createElement('span');
    nm.className = 'package-name-span' + (seq.customName ? '' : ' unnamed');
    nm.textContent = seq.customName || seq.defaultName;
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
      selSequence = idx;
      selSeqVizPage = null;     // reset zoom when switching sequences
      renderPatchList();
      renderCustomBuilder();    // refresh the visualizer for the newly-selected sequence
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
}

function reorderSequence(fromIdx, toIdx) {
  const seqs = library.sequences;
  if (!seqs || fromIdx < 0 || fromIdx >= seqs.length) return;
  if (toIdx   < 0 || toIdx   >= seqs.length) return;
  // Same off-by-one fix as reorderBankSlot / reorderPackage / reorderBucketSlot.
  // Shared helper in renderer/library-math.js; tested in test/library-math.test.js.
  const effectiveToIdx = computeReorderIdx(fromIdx, toIdx);
  if (fromIdx === effectiveToIdx) return;
  const [moved] = seqs.splice(fromIdx, 1);
  seqs.splice(effectiveToIdx, 0, moved);
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
        const prevSelSequence = selSequence;
        if (selSequence === curIdx) selSequence = null;
        else if (selSequence !== null && selSequence > curIdx) selSequence -= 1;
        saveLibraryDebounced();
        renderPatchList();
        pushUndo({
          undo: () => {
            library.sequences.splice(curIdx, 0, removed);
            selSequence = prevSelSequence;
            saveLibraryDebounced();
            renderPatchList();
          },
          redo: () => {
            const i = library.sequences.indexOf(seqRef);
            if (i === -1) return;
            library.sequences.splice(i, 1);
            if (selSequence === i) selSequence = null;
            else if (selSequence !== null && selSequence > i) selSequence -= 1;
            saveLibraryDebounced();
            renderPatchList();
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
  inp.value = library.sequences[idx].customName || '';
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
  if (oldName !== newName) {
    pushUndo({
      undo: () => { if (library.sequences[idx]) { library.sequences[idx].customName = oldName; saveLibraryDebounced(); renderPatchList(); } },
      redo: () => { if (library.sequences[idx]) { library.sequences[idx].customName = newName; saveLibraryDebounced(); renderPatchList(); } },
    });
  }
}

function cancelSequenceNameEdit(nm, inp) {
  inp.style.display = 'none';
  nm.style.display  = '';
}

function renderSequencesActions(_actions) {
  // No bottom-of-list actions on the Sequences sub-tab:
  // - "load paired patch to app" moved to an inline hover icon on each row
  // - "send to JX-3P" was duplicative of the panel's Sequencer → Load button
  //   (which calls handleSequencerLoad → handleSendSequenceToJX when a
  //   sequence is selected).
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

  // Body lines — paired patch (always present), optional user notes,
  // optional saved date if savedAt is a valid timestamp.
  const lines = [`**Paired patch:** ${where} / ${pName}`];
  if (note) {
    lines.push('');
    lines.push(`**Notes:** ${note}`);
  }
  if (seq.savedAt) {
    const d = new Date(seq.savedAt);
    if (!Number.isNaN(d.getTime())) {
      const formatted = d.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      lines.push('');
      lines.push(`**Saved:** ${formatted}`);
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

function handleSendSequenceToJX() {
  if (selSequence === null) return;
  const seq = library.sequences[selSequence];
  if (!seq) return;
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
  const label = seq.customName || seq.defaultName || null;
  // jx3p seq-json-to-wav validates kind: "sequence" + format_version; the
  // saved seq.tape only carries `pages`, so wrap it here.
  const exportData = {
    format_version: '1.0',
    kind: 'sequence',
    pages: seq.tape.pages,
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
      selLibTab = next;
      if (next === 'tones')     selSequence = null;
      else if (next === 'sequences') selPackage  = null;
      renderPatchList();
      renderCustomBuilder();   // refresh visualizer / builder visibility
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
  showConfirmModal({
    title: `Save this new patch to ${destKey}?`,
    body:
      `This saves the patch in the app only — your JX-3P's ${destKey} is unchanged. ` +
      `To push the updated bank to the synth, click Load to JX-3P afterward.`,
    confirmLabel: 'Save',
    onConfirm: () => doWriteTo(destBank, destSlot),
  });
}

function doWriteTo(destBank, destSlot) {
  const src = currentPatch();
  if (!src || !patches || !Array.isArray(patches.banks)) return;
  const destIdx = destBank === 'D' ? 1 : 0;
  if (!patches.banks[destIdx]) return;
  patches.banks[destIdx][destSlot] = JSON.parse(JSON.stringify(src));
  // Write IS the user committing a new clean state to the destination
  // slot — update its baseline so the modified-indicator reads "clean."
  snapshotCleanParamsAt(destBank, destSlot);
  saveLibraryDebounced();   // persist active state across restarts
  writePending = false;
  lightButton('write', false);
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
  const calGain = di.deviceId ? (getCalibratedGain(di.deviceId)?.gain ?? null) : null;
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
    jxStep2:   'On the JX-3P click <span class="btn-hint">Tape Memory</span> → <span class="btn-hint">Load</span> (button 16), then hit Play below.',
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
    jxStep2:   'On the JX-3P click <span class="btn-hint">Tape Memory</span> → <span class="btn-hint">Load</span> (button 13), then hit Play below.',
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

// Cause→effect row for the Send modal. LEFT: JX-3P key diagram showing
// which key/sub-mode to arm. ARROW: pulses while audio is playing.
// RIGHT: JX-3P "destination" logo (with optional "loading: {label}"
// caption below it).
//
// Returns: { sendRow, sendArrow, sendJxLogo, jxKeyDiagram }
function buildSendRow(kind, sourceLabel) {
  const jxKeyDiagram = buildJxKeyDiagram({ action: 'load', kind });
  const sendRow = document.createElement('div');
  sendRow.className = 'record-jx-cal-row capture-mode';   // capture-mode = no gain knob
  sendRow.style.display = 'none';                          // revealed in step 2
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
    // textContent so user-supplied labels can't inject HTML
    sendJxLogo.querySelector('.record-jx-package-label-name').textContent = sourceLabel;
  }
  sendRow.appendChild(jxKeyDiagram);
  sendRow.appendChild(sendArrow);
  sendRow.appendChild(sendJxLogo);
  return { sendRow, sendArrow, sendJxLogo, jxKeyDiagram };
}

// (buildSendStatusSection + buildSendActions moved to
// renderer/modal-builders.js for JSDOM testability. The buildSendRow
// helper above stays in app.js because it depends on buildJxKeyDiagram
// which pulls in too much modal-orchestration context to extract
// cleanly today.)

function showSendToJxFlow(opts) {
  const { exportData, sourceLabel, kind, encodeApi, saveApi, jxStep2, segments } = opts;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal send-jx-modal';

  const h = document.createElement('h2');
  h.className = 'modal-title';
  const fallback = kind === 'sequence' ? 'Send sequence to JX-3P' : 'Send C/D banks to JX-3P';
  h.textContent = sourceLabel
    ? `Send "${sourceLabel}" to JX-3P`
    : fallback;
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

  // Per-segment timeline + indicator + status text. Construction in
  // buildSendStatusSection above. Hidden until enterPlayState (step 2).
  const { status, timeline, segs, indicator, statusText } = buildSendStatusSection(segments);
  modal.appendChild(status);

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

  const cleanup = async () => {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
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
    primaryBtn.disabled = false;
    primaryBtn.textContent = '▶ Play';
    saveBtn.style.display = 'none';
    // Widen the modal for step 2 (timeline + sendRow need the room). Step 1
    // is a tighter shell — header + 3 buttons. See .send-jx-modal CSS.
    modal.classList.add('step-2');
    h.textContent = 'Ready to send';
    const dur = durationSec ? `${Math.ceil(durationSec)} seconds` : 'about 25 seconds';
    body.innerHTML =
      `<p>Tape dump audio is ready.</p>` +
      `<p style="margin-top: 8px;">${jxStep2}</p>` +
      `<p style="margin-top: 8px; color: var(--text-mid); font-size: 12px;">Transfer takes about ${dur}. Don't switch apps or generate audio during transfer.</p>` +
      // Output-device label — shows where the audio is going. Most common
      // "Send isn't working" cause is the system default output being
      // something other than the cable to the JX (e.g. internal speakers,
      // AirPods). Surfacing the device gives the user a one-glance check.
      `<p id="send-jx-output-label" style="margin-top: 8px; color: var(--text-mid); font-size: 11px; font-style: italic;">Audio output device: <span style="color: var(--text-bright); font-style: normal;">checking…</span></p>`;
    statusText.textContent = '';
    segDurations = computeSegDurations(durationSec, segs);
    applySegProportions(segDurations);
    timeline.style.display = '';
    // Reveal the cause→effect row (diagram + arrow + level meter) — step 2
    // is when the user actually needs to know which key to press and watch
    // the output level during playback.
    sendRow.style.display = '';
    // Query the OS for the current default audio output and surface its
    // label. enumerateDevices requires a prior getUserMedia grant in some
    // browsers; falls back to a generic label if blocked.
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        const def     = outputs.find((d) => d.deviceId === 'default') || outputs[0];
        const labelEl = document.getElementById('send-jx-output-label');
        if (labelEl) {
          const span = labelEl.querySelector('span');
          if (span) span.textContent = (def && def.label) || 'System default (label unavailable)';
        }
      } catch {}
    })();
  };

  const startPlayback = async () => {
    primaryBtn.disabled = true;
    cancelBtn.textContent = 'Cancel';
    statusText.textContent = 'Playing…';
    try {
      await audioEl.play();
    } catch (err) {
      statusText.textContent = `Playback blocked: ${err.message}`;
      primaryBtn.disabled = false;
      return;
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

  // Step 1 → 2: encode the WAV, then hand off to enterPlayState. The primary
  // button is then re-armed as a Play button, and finally as a Done button
  // that closes the modal after the transfer completes.
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
      const sendLabelEl = sendJxLogo.querySelector('.record-jx-package-label');
      if (sendLabelEl) sendLabelEl.classList.add('complete');
      statusText.textContent = '✓ Complete. Check your JX for confirmation.';
      // Done is now the only action — it closes the modal.
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
  presentSequenceSaveModal(result.data, result.path);
}

async function applySequencerCapture(tempWavPath, deviceInfo) {
  const di = deviceInfo || {};
  const calGain = di.deviceId ? (getCalibratedGain(di.deviceId)?.gain ?? null) : null;
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
  presentSequenceSaveModal(result.data, tempWavPath);
}

// Shared post-decode handler: opens the Save Sequence modal for naming +
// optional note, then persists to library.sequences[]. Used by both the
// file-dialog Save and the live-record Save.
function presentSequenceSaveModal(tapeData, sourcePath) {
  showSaveSequenceModal({
    tapeData,
    sourcePath,
    onConfirm: ({ patchNote, defaultName, customName }) => {
      saveSequenceEntry({
        tapeData,
        patchNote,
        defaultName,
        customName,
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

function showSaveSequenceModal({ tapeData, sourcePath, onConfirm }) {
  const summary = summarizeSeqTape(tapeData);
  // Pre-fill the name field with the source filename (sans extension); fall
  // back to a date-stamped default if for some reason the path can't be
  // parsed. We track the initial value so we can tell whether the user
  // actually edited it — if not, we store an empty customName so the entry
  // stays cleanly date/file-named with no redundant override.
  const initialName = labelFromPath(sourcePath) || sequenceDefaultName(new Date());

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
  const deviceLabel = document.createElement('label');
  deviceLabel.textContent = 'INPUT DEVICE:';
  const devicePicker = document.createElement('select');
  devicePicker.className = 'record-jx-device';
  deviceSection.appendChild(deviceLabel);
  deviceSection.appendChild(devicePicker);

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
  const EXPECTED_SIGNAL_MS = kind === 'sequence' ? 30000 : 60000;

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
  const { timelineSection, timeline, segs, indicator } = buildRecordTimelineSection(kind);

  const statusText = document.createElement('div');
  statusText.className = 'record-jx-status';
  statusText.textContent = '';

  // Cancel + Stop. Construction in buildRecordActions above. Stop is
  // pre-disabled; enabled after getUserMedia resolves (see startRecording).
  const { actions, cancelBtn, stopBtn } = buildRecordActions();

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

  modal.appendChild(h);
  modal.appendChild(instr);
  modal.appendChild(calRow);          // calibration layout — visibility toggled
  // statusText sits directly under the calRow and is right-aligned so the
  // "Recording — Xs elapsed" counter and any warning messages visually
  // associate with the meter (which is the rightmost element in calRow).
  // Previous position (bottom of modal, centered) read as floating /
  // disconnected from the live capture state.
  modal.appendChild(statusText);
  modal.appendChild(deviceSection);
  // calProgressSection inserted between deviceSection and timelineSection
  // by configureForCurrentDevice (visible in calibration mode, hidden in
  // capture). Lives at modal level since meterSection was removed.
  modal.appendChild(gainSection);
  modal.appendChild(timelineSection);
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
  let captured     = [];            // mirror of session.captured (the live PCM buffer); concatenated by stopRecording
  let fskPeak      = 0;             // mirror from captureState.fskPeak each raf tick; read by calibration math
  let runningPeak  = 0;             // mirror from captureState.runningPeak; read by the onCaptured handoff. (Originally a local var inside startRecording that was invisible to stopRecording — every clean-capture auto-proceed threw a silent ReferenceError. Fixed 2026-05-25.)
  let elapsedTimer = null;
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
  cancelBtn.addEventListener('click', close);

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
  const deviceRateWarning = document.createElement('div');
  deviceRateWarning.className = 'record-jx-device-rate-warning';
  deviceRateWarning.hidden = true;
  deviceSection.appendChild(deviceRateWarning);
  // Warning has two children: a text span for the message + a
  // "Re-check" button on its own line. The button is needed because
  // Chromium aggressively caches the per-deviceId stream — once we've
  // probed and gotten 48 kHz, subsequent probes for the same deviceId
  // return the cached 48 kHz indefinitely, even after the user fixes
  // the device in Audio MIDI Setup. The 2 s background poll attempts
  // to refresh, but on most macOS/Chromium combinations the cache
  // wins. The manual button forces the user-perceived re-check moment
  // to align with reality — they fix the device, click, expect fresh
  // truth. Even when the click ALSO returns cached data, the user
  // has a deliberate action they can repeat or interpret.
  const rateWarningText = document.createElement('span');
  const rateRecheckBtn  = document.createElement('button');
  rateRecheckBtn.type   = 'button';
  rateRecheckBtn.className = 'record-jx-device-rate-recheck';
  rateRecheckBtn.textContent = 'Re-check sample rate';
  deviceRateWarning.appendChild(rateWarningText);
  deviceRateWarning.appendChild(rateRecheckBtn);
  rateRecheckBtn.addEventListener('click', () => {
    // Briefly disable + relabel during the probe so the click feels
    // responsive even when the underlying probe hits Chromium's cache
    // and "succeeds" with the same value.
    rateRecheckBtn.disabled = true;
    rateRecheckBtn.textContent = 'Re-checking…';
    probeDeviceSampleRate(devicePicker.value).finally(() => {
      rateRecheckBtn.disabled = false;
      rateRecheckBtn.textContent = 'Re-check sample rate';
    });
  });
  const setSampleRateWarning = (msg) => {
    if (msg) {
      rateWarningText.textContent = msg + ' ';
      deviceRateWarning.hidden = false;
    } else {
      deviceRateWarning.hidden = true;
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
      if (nativeRate !== 44100) {
        const deviceLabel = pickerLabel || match.name || 'this audio device';
        setSampleRateWarning(
          `ℹ︎ ${deviceLabel} is running at ${nativeRate / 1000} kHz. ` +
          `JP records at 44.1 kHz, so Chromium will resample. Most modern interfaces ` +
          `survive this cleanly — but if a capture decodes empty and the gain looks right, ` +
          `try switching this device's Format to 44100 Hz in Audio MIDI Setup. ` +
          `(Some interfaces lock the input side to one rate; if there's no 44100 option, ignore this notice.)`
        );
      } else {
        setSampleRateWarning(null);   // clear any prior warning
      }
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
      let restored = false;
      if (priorId) {
        if ([...devicePicker.options].some((o) => o.value === priorId)) {
          devicePicker.value = priorId;
          restored = true;
        } else if (priorLabel) {
          const byLabel = [...devicePicker.options].find((o) => o.textContent === priorLabel);
          if (byLabel) {
            devicePicker.value = byLabel.value;
            restored = true;
          }
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
  // stale warnings throughout their entire ~30 s capture window.
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
        ? 'Step 2 of 2: Sequence data dump from JX-3P'
        : 'Step 2 of 2: Data dump from JX-3P';
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
      instr.innerHTML =
        `<p style="margin: 0;"><b>Now press ${jxSaveLabel}.</b></p>` +
        `<p style="margin: 6px 0 0; color: var(--text-mid); font-size: 12px;">Capture finishes automatically when the JX dump completes (~30 s). Click <b>Cancel</b> to abort if no audio is being received. The level shown reflects your saved calibration (${formatGain(cal.gain)} gain) for this device.</p>`;
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
      h.textContent = 'Step 1 of 2: Calibrate volume';
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
      // Hide the Stop button — calibration is fully hands-free now.
      // Auto-stop triggers when the dump-progress bar fills (cumulative
      // signal hits the expected duration) or when end-of-dump silence
      // is detected.
      stopBtn.style.display = 'none';
      // Show the dump-progress bar (now at modal level since meterSection
      // was removed — insert it before deviceSection on first call).
      if (calProgressSection.parentElement !== modal) {
        modal.insertBefore(calProgressSection, deviceSection);
      }
      calProgressSection.style.display = '';
      calProgressBar.style.width = '0%';
      gainSection.style.display = 'none';   // gain knob in calRow replaces the slider
      instr.classList.add('record-jx-instr-box');
      instr.innerHTML =
        `<p style="margin: 0;"><b>Press ${jxSaveLabel} on the JX-3P now.</b></p>` +
        `<p style="margin: 6px 0 0;"><b>Adjust <span class="btn-hint">Input Gain</span> until the level reaches the target notch (the yellow segment).</b></p>` +
        `<p style="margin: 8px 0 0; color: var(--text-mid); font-size: 12px;">Calibration auto-advances when the JX finishes its dump (~30 s); the recorder reopens for the real capture.</p>`;
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
        }
        if (isCalibrating && events.progressPct !== null) {
          // Wall-clock-driven progress bar (not cumulative-signal) so
          // the bar reaches 100% exactly when the dump actually ends.
          calProgressBar.style.width = `${events.progressPct}%`;
        }

        // Timeline-segment indicator (the "WHAT THE JX-3P SENDS" bar).
        if (cs.activeMs > 0) {
          const elapsedSec = cs.activeMs / 1000;
          let acc = 0, activeIdx = segs.length - 1;
          for (let i = 0; i < segs.length; i++) {
            acc += segs[i].estSec;
            if (elapsedSec < acc) { activeIdx = i; break; }
          }
          segs.forEach((s, i) => s.el.classList.toggle('active', i === activeIdx));
          const pct = Math.min(100, (elapsedSec / totalEstSec) * 100);
          indicator.style.left = `${pct}%`;
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

    stopBtn.disabled = false;
    statusText.style.color = '';
    const startMs = Date.now();
    elapsedTimer = setInterval(() => {
      // Don't clobber a live warning message (any of the 4 ladder states)
      // by overwriting it with the elapsed-time tick.
      if (warnLevel) return;
      const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
      statusText.textContent = `Recording — ${elapsedSec}s elapsed`;
    }, 250);
  };

  // Changing the input device mid-capture: drop the current stream and
  // restart from scratch with the new device. Buffer + elapsed timer reset.
  // Also re-check this device's saved calibration — switching devices may
  // toggle between first-time-calibration and saved-cal modes.
  devicePicker.addEventListener('change', () => {
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
    cancelBtn.disabled = true;
    statusText.textContent = 'Processing audio…';
    console.log(`record-jx STOP: isCalibrating=${isCalibrating}, fskPeak=${fskPeak.toFixed(4)}, capturedChunks=${captured.length}, calDeviceId=${calibrationDeviceId}`);

    const totalSamples = captured.reduce((sum, c) => sum + c.length, 0);
    if (!totalSamples) {
      statusText.textContent = 'Nothing recorded. Try again.';
      stopCapture();
      state = 'recording';
      cancelBtn.disabled = false;
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
        cancelBtn.disabled = false;
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
      cancelBtn.disabled = false;
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
    //   Cancel       (keeps existing Cancel behavior — closes modal)
    //   Try again    (reset to a fresh recording attempt, same device)
    //   Use anyway   (proceed with decode on this capture)
    stopBtn.style.display = 'none';
    cancelBtn.disabled = false;
    const tryAgainBtn = document.createElement('button');
    tryAgainBtn.className = 'modal-btn modal-btn-confirm';  // green — recommended action (re-record cleanly)
    tryAgainBtn.textContent = 'Try again';
    const useBtn = document.createElement('button');
    useBtn.className = 'modal-btn modal-btn-alt';           // blue — risky alternative (proceed with marginal capture)
    useBtn.textContent = 'Use anyway';
    actions.appendChild(tryAgainBtn);
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
    tryAgainBtn.addEventListener('click', () => {
      try { actions.removeChild(tryAgainBtn); } catch {}
      try { actions.removeChild(useBtn); } catch {}
      stopBtn.style.display = '';
      stopBtn.disabled = true;
      stopBtn.textContent = '■ Stop';
      statusText.textContent = '';
      statusText.style.color = '';
      segs.forEach((s) => s.el.classList.remove('active'));
      timeline.classList.remove('complete');
      state = 'recording';
      guardAsync(startRecording(), 'Restart recording (Try Again)');
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
      // condition. 'recording' state can be cancelled by the user via
      // Cancel button, so it's self-healing.
      if (state === 'processing') {
        state = 'recording';
        cancelBtn.disabled = false;
        stopBtn.disabled   = false;
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

function saveSequenceEntry({ tapeData = null, patchNote = '', defaultName = null, customName = '' } = {}) {
  if (!library) return;
  const now = new Date();
  const { bank, slot } = activeBankSelection();
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
    savedAt: now.toISOString(),
    tape: {
      pages: tapeData && Array.isArray(tapeData.pages) ? tapeData.pages : null,
    },
    app: {
      patchNote: patchNote || '',
      pairedPatch: {
        bank,
        slot,
        params:    JSON.parse(JSON.stringify(activeBankPatch() || {})),
        patchName: patchName(bank, slot),
      },
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

function sequenceDefaultName(date) {
  const ds = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `Sequence ${ds}`;
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
function renderSequenceVisualizer() {
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
  const populatedCount = pages.filter((p) => p !== null && p !== undefined).length;

  const seqName = seq.customName || seq.defaultName || '(unnamed sequence)';
  const pp = (seq.app && seq.app.pairedPatch) || {};
  const pairedRef = pp.bank
    ? `${pp.bank}${(pp.slot || 0) + 1}: ${pp.patchName || '(unnamed)'}`
    : 'no paired patch';

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
        svgParts.push(
          `<rect x="${absStep}" y="${y}" width="1" height="1" ` +
          `fill="${color}" rx="0.15"/>`
        );
      });
    });
  });

  // Page selector buttons. "ALL" + 1–8. Active button = currently
  // viewed (or all-view). Click an inactive page to zoom; click the
  // active page (or ALL) to reset.
  const pageBtns = ['<button class="seq-viz-page-btn' +
                    (zoomedPage === null ? ' active' : '') +
                    '" data-page="all">ALL</button>'];
  for (let i = 0; i < PAGES; i++) {
    const isActive = zoomedPage === i;
    const cls = 'seq-viz-page-btn' + (isActive ? ' active' : '');
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

  container.hidden = false;
  container.innerHTML =
    `<div class="seq-viz-header">` +
      `<span class="seq-viz-name">${escapeHtml(seqName)}</span>` +
      ` · paired with <span class="seq-viz-paired">${escapeHtml(pairedRef)}</span>` +
      ` · ${populatedCount} of ${PAGES} pages populated` +
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
    `<div class="seq-viz-pages">` + pageBtns.join('') + `</div>` +
    `<div class="seq-viz-hover-tip" hidden></div>`;

  // Wire page-button clicks
  container.querySelectorAll('.seq-viz-page-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
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

    // Rest step (null page OR step with no populated voices).
    // NB: This only catches TRUE rests where every voice slot is empty
    // (typically full null pages the synth never reached). User-input
    // "rests" via the JX-3P's REST button are NOT detected here — the
    // JX encodes those as tied continuations of the previous note, so
    // they look identical to a held note in the data. See CLAUDE.md
    // pitfall #16 for the full explanation. Tooltip wording below
    // reflects this by saying "hold or rest" for tied cells.
    const isRestStep = !page || !step || !Array.isArray(step.voices)
                       || !step.voices.some((v) => v != null);
    if (isRestStep) {
      tip.textContent = 'rest';
      tip.hidden = false;
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top  = `${e.clientY - 18}px`;
      return;
    }

    // Populated step — distinguish three cases at the hovered pitch:
    //   1. New attack only (no tied voice at same pitch) → pitch name
    //   2. Tied voice + new attack at SAME pitch in another voice slot
    //      → "tie" (this is the JX-3P TIE-button signature; see
    //      CLAUDE.md pitfall #16)
    //   3. Tied voice only (no same-pitch new attack) → "rest" (the
    //      JX REST button encodes as a tied continuation, indistinguish-
    //      able in the data from a normal polyphonic note continuation;
    //      "rest" is the dominant single-voice case)
    //   4. No voice at this pitch → no tooltip
    const tiedHere = step.voices.find((v) => v && v.note === pitch && v.tied);
    const newHere  = step.voices.find((v) => v && v.note === pitch && !v.tied);
    if (!tiedHere && !newHere) { tip.hidden = true; return; }
    if (tiedHere && newHere)   tip.textContent = 'tie';
    else if (newHere)          tip.textContent = midiPitchName(pitch);
    else                       tip.textContent = 'rest';
    tip.hidden = false;
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top  = `${e.clientY - 18}px`;
  };
  rollSvg.addEventListener('mousemove', updateTip);
  rollSvg.addEventListener('mouseleave', () => { tip.hidden = true; });

  // Wire keyboard key hover — show the pitch name in the shared
  // tooltip (same chip the roll uses). Replaces the small per-octave
  // C labels that used to render on the keys themselves — those were
  // too small to read at this scale, so we surface the pitch on
  // demand via hover instead.
  container.querySelectorAll('.seq-viz-key').forEach((keyRect) => {
    keyRect.addEventListener('mousemove', (e) => {
      const pitch = parseInt(keyRect.dataset.pitch, 10);
      tip.textContent = midiPitchName(pitch);
      tip.hidden = false;
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top  = `${e.clientY - 18}px`;
    });
    keyRect.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
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
function silentDefaultPatch() {
  return {
    dco1_range: "16'",
    dco1_waveform: 'saw',
    dco1_fmod_lfo: false,
    dco1_fmod_env: false,
    dco2_range: "16'",
    dco2_waveform: 'saw',
    dco2_crossmod: 'off',
    dco2_tune: 0,
    dco2_fine_tune: 0,
    dco2_fmod_lfo: false,
    dco2_fmod_env: false,
    dco_lfo_amount: 0,
    dco_env_amount: 0,
    dco_env_polarity: 'pos',
    vcf_mix: 0,
    vcf_hpf: 0,
    vcf_cutoff: 0,
    vcf_lfo_mod: 0,
    vcf_pitch_follow: 0,
    vcf_resonance: 0,
    vcf_env_mod: 0,
    vcf_env_polarity: 'pos',
    vca_mode: 'env',
    vca_level: 0,            // silent
    chorus: false,
    lfo_waveform: 'sine',
    lfo_delay: 0,
    lfo_rate: 0,
    env_attack: 0,
    env_decay: 0,
    env_sustain: 0,
    env_release: 0,
    mystery: 0,
  };
}

function setupCustomBuilder() {
  const toggle = document.getElementById('custom-builder-toggle');
  const abort  = document.getElementById('custom-builder-abort');
  const save   = document.getElementById('custom-builder-save');
  const clear  = document.getElementById('custom-builder-clear');
  if (!toggle || !abort || !save || !clear) return;

  toggle.addEventListener('click', () => {
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
  const arr = bucketsState()[destBank];
  if (!arr) return;
  if (destIdx < 0 || destIdx > 15) return;
  const bankIdx = srcBank === 'D' ? 1 : 0;
  const params = patches && patches.banks && patches.banks[bankIdx]
    && patches.banks[bankIdx][srcSlot];
  if (!params) return;
  arr[destIdx] = {
    params: JSON.parse(JSON.stringify(params)),
    name:   patchName(srcBank, srcSlot),
    origin: patchOrigin(srcBank, srcSlot),
    sourceLabel: activeBanksSourceLabel,
  };
  saveLibraryDebounced();
  renderCustomBuilder();
}

function removePatchFromBucket(bank, idx) {
  const arr = bucketsState()[bank];
  if (!arr) return;
  const removed = arr[idx];
  arr[idx] = null;
  saveLibraryDebounced();
  renderCustomBuilder();
  if (removed) {
    pushUndo({
      undo: () => {
        const a = bucketsState()[bank];
        if (!a) return;
        a[idx] = removed;
        saveLibraryDebounced();
        renderCustomBuilder();
      },
      redo: () => {
        const a = bucketsState()[bank];
        if (!a) return;
        a[idx] = null;
        saveLibraryDebounced();
        renderCustomBuilder();
      },
    });
  }
}

function reorderBucketSlot(bank, fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const arr = bucketsState()[bank];
  if (!arr) return;

  // FLIP animation prep — capture pre-move row positions for this bank's
  // bucket container, BEFORE we mutate + re-render. Same technique as
  // reorderBankSlot in the patch list.
  const bucketEl = document.querySelector(`.cb-bucket[data-bank="${bank}"] .cb-bucket-list`);
  let prePositions = null;
  if (bucketEl) {
    prePositions = new Map();
    bucketEl.querySelectorAll('.cb-slot').forEach((el) => {
      const idx = parseInt(el.dataset.idx, 10);
      if (!Number.isNaN(idx)) prePositions.set(idx, el.getBoundingClientRect().top);
    });
  }

  // Off-by-one fix — shared helper in renderer/library-math.js. See
  // reorderBankSlot for the rationale.
  const effectiveToIdx = computeReorderIdx(fromIdx, toIdx);
  if (fromIdx === effectiveToIdx) return;

  const [moved] = arr.splice(fromIdx, 1);
  arr.splice(effectiveToIdx, 0, moved);
  // Buckets are always length 16; the splice above can shorten the array
  // (if we move a filled entry past trailing empties). Re-pad.
  while (arr.length < 16) arr.push(null);
  arr.length = 16;
  saveLibraryDebounced();
  renderCustomBuilder();

  // Undo: reverse the splice by reordering back.
  pushUndo({
    undo: () => reorderBucketSlot(bank, effectiveToIdx, fromIdx),
    redo: () => reorderBucketSlot(bank, fromIdx, toIdx),
  });

  // FLIP play — same logic as reorderBankSlot. Bucket re-render replaces
  // all .cb-slot rows; we translate each new row back to its old top, then
  // animate to 0. Cream-tint flash on the destination row.
  if (prePositions) {
    const newBucketEl = document.querySelector(`.cb-bucket[data-bank="${bank}"] .cb-bucket-list`);
    if (newBucketEl) {
      const newToOld = (newIdx) => {
        if (newIdx === effectiveToIdx) return fromIdx;
        if (fromIdx < effectiveToIdx && newIdx >= fromIdx && newIdx < effectiveToIdx) return newIdx + 1;
        if (fromIdx > effectiveToIdx && newIdx > effectiveToIdx && newIdx <= fromIdx) return newIdx - 1;
        return newIdx;
      };
      const movedRows = [];
      newBucketEl.querySelectorAll('.cb-slot').forEach((el) => {
        const newIdx = parseInt(el.dataset.idx, 10);
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
      void newBucketEl.offsetWidth;
      movedRows.forEach((el) => {
        el.style.transition = 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform  = 'translateY(0)';
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
          el.style.transform  = '';
        }, { once: true });
      });
      const movedEl = newBucketEl.querySelector(`.cb-slot[data-idx="${effectiveToIdx}"]`);
      if (movedEl) {
        movedEl.classList.add('just-moved');
        setTimeout(() => movedEl.classList.remove('just-moved'), 850);
      }
    }
  }
}

function renameBucketEntry(bank, idx, newName) {
  const arr = bucketsState()[bank];
  if (!arr || !arr[idx]) return;
  const oldName = arr[idx].name || null;
  const finalName = newName || null;
  arr[idx].name = finalName;
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
  const onLibrary = selBank === 'L';
  toggle.disabled = onLibrary;
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
        row.addEventListener('dragend', () => row.classList.remove('dragging'));

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

      // Drop target (within-bucket reorder OR cross-list drop from patch list).
      // For shift-selected ranges, validate the range fits at this slot.
      row.addEventListener('dragover', (e) => {
        const isPatchSrc  = e.dataTransfer.types.includes('application/x-jp-patch-source');
        const isBucketSrc = e.dataTransfer.types.includes('application/x-jp-bucket-source');
        const isRange     = e.dataTransfer.types.includes('application/x-jp-patch-range');
        if (!isPatchSrc && !isBucketSrc) return;
        e.preventDefault();
        e.stopPropagation();
        // Multi-patch range: compute size from the dataTransfer types list
        // (we can't read range contents on dragover — security restriction —
        // so fall back to a permissive guard here and re-check on drop).
        // We can't parse the range JSON until drop; on dragover, treat any
        // range drag as "needs to fit from i to 16" by tightening the
        // dropEffect when the slot can hold at least one patch.
        const fits = isRange ? (i < 16) : true;
        e.dataTransfer.dropEffect = isBucketSrc ? 'move' : (fits ? 'copy' : 'none');
        row.classList.toggle('drag-over', fits);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        row.classList.remove('drag-over');
        const bucketJson = e.dataTransfer.getData('application/x-jp-bucket-source');
        if (bucketJson) {
          e.preventDefault();
          e.stopPropagation();
          try {
            const src = JSON.parse(bucketJson);
            if (src.bank === bank) reorderBucketSlot(bank, src.idx, i);
          } catch {}
          return;
        }
        // Multi-patch range path (shift-selected drag).
        const rangeJson = e.dataTransfer.getData('application/x-jp-patch-range');
        if (rangeJson) {
          e.preventDefault();
          e.stopPropagation();
          let r;
          try { r = JSON.parse(rangeJson); } catch { return; }
          const rangeSize = (r.end - r.start) + 1;
          if (i + rangeSize > 16) return; // doesn't fit
          for (let k = 0; k < rangeSize; k++) {
            placePatchInBucket(bank, i + k, r.bank, r.start + k);
          }
          return;
        }
        const patchJson = e.dataTransfer.getData('application/x-jp-patch-source');
        if (patchJson) {
          e.preventDefault();
          e.stopPropagation();
          try {
            const src = JSON.parse(patchJson);
            placePatchInBucket(bank, i, src.bank, src.slot);
          } catch {}
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
  // Empty bucket slots inherit from the current active C/D banks at the same
  // position — so the user can iterate on a few slots without nuking the rest
  // of the bank. silentDefaultPatch() is only the final fallback for the
  // (unlikely) case where active banks aren't populated for a slot.
  const activeC = (patches && patches.banks && patches.banks[0]) || [];
  const activeD = (patches && patches.banks && patches.banks[1]) || [];
  const activeMeta = (library && library.slotMeta) || {};
  const fillBank = (bucket, activeBank) =>
    bucket.map((entry, i) => {
      if (entry) return JSON.parse(JSON.stringify(entry.params));
      if (activeBank[i]) return JSON.parse(JSON.stringify(activeBank[i]));
      return silentDefaultPatch();
    });
  const banks = [fillBank(s.C, activeC), fillBank(s.D, activeD)];

  const slotMeta = { C: [], D: [] };
  ['C', 'D'].forEach((bank) => {
    for (let i = 0; i < 16; i++) {
      const entry = s[bank][i];
      if (entry) {
        slotMeta[bank][i] = {
          name:        entry.name || null,
          origin:      entry.origin || `${bank}${i + 1}`,
          sourceLabel: entry.sourceLabel || null,
        };
      } else {
        // Inherit slot identity from the active bank position too, so the
        // saved package's metadata matches the patch params it just adopted.
        const a = (activeMeta[bank] && activeMeta[bank][i]) || {};
        slotMeta[bank][i] = {
          name:        a.name || null,
          origin:      a.origin || `${bank}${i + 1}`,
          sourceLabel: a.sourceLabel || activeBanksSourceLabel || null,
        };
      }
    }
  });

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
      selBank = tab.dataset.bank;
      selSlot = 0;
      // Library tab always opens to the Tones sub-tab (2026-05-25) —
      // most users browse Tones far more than Sequences, and the prior
      // behavior of remembering the last sub-tab was a subtle UX
      // gotcha where users would click Library expecting tone
      // packages and land on whatever sub-tab they last touched.
      if (selBank === 'L') selLibTab = 'tones';
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

async function handleSequenceDropImport(filePath) {
  const result = await window.api.seqTapeSaveFromPath(filePath);
  if (!result || !result.loaded) {
    showImportError(`Could not decode this WAV as a sequence: ${result && result.error || 'unknown error'}`);
    return;
  }
  // If the file decoded but every page is empty, it's probably a patch WAV.
  const hasContent = result.data && Array.isArray(result.data.pages)
    && result.data.pages.some((p) => Array.isArray(p));
  if (!hasContent) {
    showImportError('This WAV does not contain any sequencer data. Try dropping it on the Tones sub-tab if it is a patch dump.');
    return;
  }
  if (!activeBankPatch()) {
    showImportError('Select a patch before importing a sequence — the sequence pairs with the currently selected patch.');
    return;
  }
  showSaveSequenceModal({
    tapeData: result.data,
    sourcePath: filePath,
    onConfirm: ({ patchNote, defaultName, customName }) => {
      saveSequenceEntry({
        tapeData: result.data,
        patchNote,
        defaultName,
        customName,
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

function setupHwButtons() {
  const wire = (id, handler) => {
    const btn = document.getElementById(`hw-${id}`);
    if (!btn) return;
    btn.addEventListener('mousedown', () => btn.classList.add('pressed'));
    btn.addEventListener('mouseup',   () => btn.classList.remove('pressed'));
    btn.addEventListener('mouseleave', () => btn.classList.remove('pressed'));
    btn.addEventListener('click', handler);
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
    library.tapeMode = sel.value === 'midi' ? 'midi' : 'tape';
    saveLibraryDebounced();
  });
}

document.addEventListener('DOMContentLoaded', init);
