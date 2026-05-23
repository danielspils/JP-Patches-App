'use strict';

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

function displayLabel(b, s) {
  return `${slotKey(b, s)}: ${patchName(b, s) || patchPlaceholder(b, s)}`;
}

// Patch identity = its 32 parameters. The app keys names against this
// fingerprint (library.history) so a name survives any roundtrip through the
// JX-3P (which itself stores no names) as long as the params don't change.
// JSON.stringify with sorted keys gives a stable canonical string.
function paramsFingerprint(params) {
  if (!params || typeof params !== 'object') return null;
  const keys = Object.keys(params).sort();
  if (keys.length === 0) return null;
  const norm = keys.map((k) => [k, params[k]]);
  return JSON.stringify(norm);
}

function paramsAt(b, s) {
  const bankIdx = b === 'D' ? 1 : 0;
  if (!patches || !Array.isArray(patches.banks) || !patches.banks[bankIdx]) return null;
  return patches.banks[bankIdx][s] || null;
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

// Look up a patch by fingerprint and return its remembered { name, origin },
// or null if we haven't seen these params before.
function lookupInHistory(params) {
  const fp = paramsFingerprint(params);
  if (!fp) return null;
  return library.history[fp] || null;
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
  ensureCustomBucketsShape();
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
  let downBtnInside = true;

  function applyDragAngle(clientY) {
    // Drag up (negative dy) = clockwise (positive angle). 2° per 1px (140px = full range).
    const dy = clientY - dragState.startY;
    const angle = Math.max(-140, Math.min(140, dragState.startAngle - dy * 2));
    dragState.knob.setAttribute('transform', `rotate(${angle.toFixed(1)})`);
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
      }
      e.preventDefault();
    } else if (type === 'switch') {
      handleSwitchClick(ctrl);
      e.preventDefault();
    } else if (type === 'button') {
      downBtnId = ctrl.dataset.buttonId;
      downBtnInside = true;
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
        updateKnobs(patch);   // snaps discrete knobs to nearest position
      }
      dragState = null;
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
}

// ═══════════════════════════════════════════════════════════════
// Patch list
// ═══════════════════════════════════════════════════════════════

// Greys out Tape Memory hardware buttons when their action wouldn't do
// anything meaningful in the current context. Called from renderPatchList
// so it runs on every tab/selection change.
//   - Tone Save: always enabled (it's a file-import).
//   - Tone Load: needs sendable data — active C/D banks, OR a selected
//     Library > Tones package.
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
  const onTones  = selBank === 'L' && selLibTab === 'tones';
  const onSeqs   = selBank === 'L' && selLibTab === 'sequences';
  const havePatches = !!(patches && Array.isArray(patches.banks) && patches.banks.length === 2);
  const hasPkg   = onTones && selPackage !== null
                   && library && Array.isArray(library.packages) && library.packages[selPackage];
  const hasSeq   = onSeqs && selSequence !== null
                   && library && Array.isArray(library.sequences) && library.sequences[selSequence];

  toneSave.disabled = false;
  toneLoad.disabled = !((onBank && havePatches) || hasPkg);
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

    const nm = document.createElement('span');
    nm.className = 'patch-name-span' + (name ? '' : ' unnamed');
    nm.textContent = name || patchPlaceholder(selBank, slot);
    if (!name) appendRenamePencil(nm);

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

    const swap = document.createElement('button');
    swap.className = 'patch-swap-btn';
    swap.type = 'button';
    const otherBank = selBank === 'C' ? 'D' : 'C';
    swap.textContent = `⇄${otherBank}${slot + 1}`;
    swap.title = `Swap with ${otherBank}${slot + 1}`;
    swap.addEventListener('click', (e) => {
      e.stopPropagation();
      if (writePending) return;
      swapAcrossBanks(slot);
    });
    swap.addEventListener('mousedown', (e) => e.stopPropagation());

    item.appendChild(num);
    item.appendChild(nm);
    item.appendChild(inp);
    item.appendChild(info);
    item.appendChild(swap);
    list.appendChild(item);

    item.addEventListener('click', (e) => {
      if (writePending) {
        commitWriteTo(selBank, slot);
        return;
      }
      if (nm.contains(e.target) && slot === selSlot) {
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
      if (writePending || e.target.closest('.patch-swap-btn, .patch-info-btn, .patch-name-edit')) {
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
      list.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.drag-over').forEach((el) => {
        if (el !== item) el.classList.remove('drag-over');
      });
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', (e) => {
      if (e.currentTarget === item && !item.contains(e.relatedTarget)) {
        item.classList.remove('drag-over');
      }
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = slot;
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
    if (!pkg.customName) appendRenamePencil(nm);

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
      if (nm.contains(e.target) && idx === selPackage) {
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
      list.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.drag-over').forEach((el) => {
        if (el !== item) el.classList.remove('drag-over');
      });
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', (e) => {
      // Only remove the indicator when the pointer actually leaves the row,
      // not when it crosses internal children.
      if (e.currentTarget === item && !item.contains(e.relatedTarget)) {
        item.classList.remove('drag-over');
      }
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = idx;
      item.classList.remove('drag-over');
      if (Number.isNaN(fromIdx) || fromIdx === toIdx) return;
      reorderPackage(fromIdx, toIdx);
    });
  });
}

function reorderPackage(fromIdx, toIdx) {
  const pkgs = library.packages;
  if (!pkgs || fromIdx < 0 || fromIdx >= pkgs.length) return;
  if (toIdx < 0 || toIdx >= pkgs.length) return;
  const [moved] = pkgs.splice(fromIdx, 1);
  pkgs.splice(toIdx, 0, moved);

  // Adjust selPackage to follow the move.
  if (selPackage !== null) {
    if (selPackage === fromIdx) selPackage = toIdx;
    else if (fromIdx < selPackage && toIdx >= selPackage) selPackage -= 1;
    else if (fromIdx > selPackage && toIdx <= selPackage) selPackage += 1;
  }
  saveLibraryDebounced();
  renderPatchList();
}

function handleLoadLibraryBanks(idx) {
  if (idx === undefined) idx = selPackage;
  if (idx == null) return;
  const pkg = library.packages[idx];
  if (!pkg) return;
  const pkgName = pkg.customName || pkg.defaultName || 'This package';
  showConfirmModal({
    title: 'Loading new C/D banks to JP Patches',
    body:
      `*${pkgName}* will replace the current C and D banks in the JP Patches app.\n\n` +
      `Use the **Tone → Save to JX-3P** button to send *${pkgName}* to your synth.`,
    confirmLabel: 'Load',
    onConfirm: () => loadPackageIntoActiveBanks(pkg),
  });
}

function loadPackageIntoActiveBanks(pkg) {
  migratePackageShape(pkg);
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
}

// Lightweight confirmation modal.
function showConfirmModal({ title, subtitle, body, confirmLabel, confirmStyle, onConfirm }) {
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

  actions.appendChild(cancelBtn);
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
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter')  { onConfirm(); close(); }
  };

  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', () => { onConfirm(); close(); });
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
      library.packages.splice(idx, 1);
      if (selPackage === idx) selPackage = null;
      else if (selPackage !== null && selPackage > idx) selPackage -= 1;
      saveLibraryDebounced();
      renderPatchList();
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
  library.packages[idx].customName = val;
  inp.style.display = 'none';
  nm.style.display  = '';
  saveLibraryDebounced();
  renderPatchList();
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
    if (!seq.customName) appendRenamePencil(nm);

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
    item.appendChild(buildLoadToAppIcon(
      () => handleLoadLibrarySequence(idx),
      'Load this sequence (and its original paired patch) to app',
    ));
    item.appendChild(buildSequenceTrashIcon(idx));
    list.appendChild(item);

    item.addEventListener('click', (e) => {
      if (nm.contains(e.target) && idx === selSequence) {
        startSequenceNameEdit(idx, nm, def, inp);
        return;
      }
      selSequence = idx;
      renderPatchList();
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
      list.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.drag-over').forEach((el) => {
        if (el !== item) el.classList.remove('drag-over');
      });
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', (e) => {
      if (e.currentTarget === item && !item.contains(e.relatedTarget)) {
        item.classList.remove('drag-over');
      }
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = idx;
      item.classList.remove('drag-over');
      if (Number.isNaN(fromIdx) || fromIdx === toIdx) return;
      reorderSequence(fromIdx, toIdx);
    });
  });
}

function reorderSequence(fromIdx, toIdx) {
  const seqs = library.sequences;
  if (!seqs || fromIdx < 0 || fromIdx >= seqs.length) return;
  if (toIdx   < 0 || toIdx   >= seqs.length) return;
  const [moved] = seqs.splice(fromIdx, 1);
  seqs.splice(toIdx, 0, moved);
  if (selSequence !== null) {
    if (selSequence === fromIdx) selSequence = toIdx;
    else if (fromIdx < selSequence && toIdx >= selSequence) selSequence -= 1;
    else if (fromIdx > selSequence && toIdx <= selSequence) selSequence += 1;
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
      library.sequences.splice(idx, 1);
      if (selSequence === idx) selSequence = null;
      else if (selSequence !== null && selSequence > idx) selSequence -= 1;
      saveLibraryDebounced();
      renderPatchList();
    },
  });
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
  library.sequences[idx].customName = val;
  inp.style.display = 'none';
  nm.style.display  = '';
  saveLibraryDebounced();
  renderPatchList();
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

function handleLoadLibrarySequence(idx) {
  if (idx === undefined) idx = selSequence;
  if (idx == null) return;
  const seq = library.sequences[idx];
  if (!seq) return;
  migrateSequenceShape(seq);
  const seqName = seq.customName || seq.defaultName || 'this sequence';
  showConfirmModal({
    title: 'Loading Sequence to JP Patches',
    body:
      `*${seqName}* will load to the app — it will recall the original sequence patch.\n\n` +
      'To load the sequence into your synth, use the **Sequencer → Load to JX-3P** button.',
    confirmLabel: 'Load',
    onConfirm: () => loadSequenceIntoActivePatch(seq),
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
  // Build the paired-patch / note reminder as an "intro" block to sit above
  // the standard send-to-JX flow.
  const intro = buildSequenceIntro(seq);
  const label = seq.customName || seq.defaultName || null;
  // jx3p seq-json-to-wav validates kind: "sequence" + format_version; the
  // saved seq.tape only carries `pages`, so wrap it here.
  const exportData = {
    format_version: '1.0',
    kind: 'sequence',
    pages: seq.tape.pages,
  };
  showSendSequenceToJxModal(exportData, label, intro);
}

// Construct the paired-patch + note reminder block reused by the
// sequence-send modal. Pulled out of the old showLoadSequenceModal so the
// new flow can drop it in as an intro DOM node.
function buildSequenceIntro(seq) {
  const pp = (seq.app && seq.app.pairedPatch) || {};
  const where = pp.bank ? `${pp.bank}${(pp.slot || 0) + 1}` : '?';
  const pName = pp.patchName || '(unnamed)';
  const note = (seq.app && seq.app.patchNote) || '';

  const wrap = document.createElement('div');
  wrap.className = 'seq-modal-intro';

  // Paired patch.
  const ppSec = document.createElement('div');
  ppSec.className = 'seq-modal-section';
  const ppLabel = document.createElement('label');
  ppLabel.textContent = 'PAIRED PATCH from the person who made this sequence';
  const ppValue = document.createElement('div');
  ppValue.className = 'seq-modal-paired';
  ppValue.textContent = `${where}: ${pName}`;
  ppSec.appendChild(ppLabel);
  ppSec.appendChild(ppValue);
  wrap.appendChild(ppSec);

  // Optional note.
  if (note) {
    const noteSec = document.createElement('div');
    noteSec.className = 'seq-modal-section';
    const noteLabel = document.createElement('label');
    noteLabel.textContent = 'NOTES from the person who made this sequence';
    const noteValue = document.createElement('div');
    noteValue.className = 'seq-modal-paired';
    noteValue.textContent = note;
    noteSec.appendChild(noteLabel);
    noteSec.appendChild(noteValue);
    wrap.appendChild(noteSec);
  }

  return wrap;
}

function showLoadSequenceModal({ seq, onSend }) {
  const pp = (seq.app && seq.app.pairedPatch) || {};
  const where = pp.bank ? `${pp.bank}${(pp.slot || 0) + 1}` : '?';
  const pName = pp.patchName || '(unnamed)';
  const note = (seq.app && seq.app.patchNote) || '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal seq-save-modal';

  const h = document.createElement('h2');
  h.className = 'modal-title';
  h.textContent = 'Send Sequence to JX-3P';

  const intro = document.createElement('div');
  intro.className = 'seq-modal-captured';
  intro.textContent =
    'You will save a WAV file. Play that WAV into the JX-3P\'s tape input ' +
    'while the synth is in Tape Memory Load mode.';

  // Paired patch reminder.
  const ppSec = document.createElement('div');
  ppSec.className = 'seq-modal-section';
  const ppLabel = document.createElement('label');
  ppLabel.textContent = 'Paired patch (select this slot on your JX-3P)';
  const ppValue = document.createElement('div');
  ppValue.className = 'seq-modal-paired';
  ppValue.textContent = `${where}: ${pName}`;
  ppSec.appendChild(ppLabel);
  ppSec.appendChild(ppValue);

  // Patch note reminder (if present). Built here, appended below in
  // proper document order (after the paired-patch section, before actions).
  let noteSec = null;
  if (note) {
    noteSec = document.createElement('div');
    noteSec.className = 'seq-modal-section';
    const noteLabel = document.createElement('label');
    noteLabel.textContent = 'NOTES from the person who made this sequence';
    const noteValue = document.createElement('div');
    noteValue.className = 'seq-modal-paired';
    noteValue.textContent = note;
    noteSec.appendChild(noteLabel);
    noteSec.appendChild(noteValue);
  }

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'modal-btn modal-btn-confirm';
  sendBtn.textContent = 'Save WAV…';

  modal.appendChild(h);
  modal.appendChild(intro);
  modal.appendChild(ppSec);
  if (noteSec) modal.appendChild(noteSec);
  modal.appendChild(actions);
  actions.appendChild(cancelBtn);
  actions.appendChild(sendBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  cancelBtn.addEventListener('click', close);
  sendBtn.addEventListener('click', () => { close(); onSend(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
}

function loadSequenceIntoActivePatch(seq) {
  const pp = seq && seq.app && seq.app.pairedPatch;
  if (!pp || !pp.bank) return;
  const bankIdx = pp.bank === 'D' ? 1 : 0;
  if (patches && Array.isArray(patches.banks) && patches.banks[bankIdx] && pp.params) {
    patches.banks[bankIdx][pp.slot] = JSON.parse(JSON.stringify(pp.params));
  }
  selBank = pp.bank === 'D' ? 'D' : 'C';
  selSlot = typeof pp.slot === 'number' ? pp.slot : 0;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.bank === selBank);
  });
  renderPatchList();
  updateSvgPatchName();
  updateAllControls(currentPatch());
}

function setupLibSubTabs() {
  document.querySelectorAll('.lib-sub-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const next = tab.dataset.libtab;
      if (!next || next === selLibTab) return;
      selLibTab = next;
      if (next === 'tones')     selSequence = null;
      else if (next === 'sequences') selPackage  = null;
      renderPatchList();
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
  if (arr && arr[slot]) arr[slot].name = val || null;
  recordToHistory(selBank, slot);
  inp.style.display = 'none';
  nm.style.display  = '';
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
  saveTimer = setTimeout(() => window.api.saveLibrary(library), 500);
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

  const [paramsMoved] = paramsArr.splice(fromIdx, 1);
  paramsArr.splice(toIdx, 0, paramsMoved);
  const [metaMoved] = metaArr.splice(fromIdx, 1);
  metaArr.splice(toIdx, 0, metaMoved);

  // Keep selSlot pointing at the same patch if it was in the moved range.
  if (bank === selBank) {
    if (selSlot === fromIdx) selSlot = toIdx;
    else if (fromIdx < selSlot && toIdx >= selSlot) selSlot -= 1;
    else if (fromIdx > selSlot && toIdx <= selSlot) selSlot += 1;
  }

  // Refresh history for the named patches that just moved (origin doesn't
  // change, but ts and any stale entries get refreshed).
  recordToHistory(bank, fromIdx);
  recordToHistory(bank, toIdx);

  saveLibraryDebounced();
  renderPatchList();
  updateSvgPatchName();
}

function swapAcrossBanks(slot) {
  if (slot < 0 || slot > 15) return;
  const list = document.getElementById('patch-list');
  const row = list && list.querySelector(`.patch-item[data-slot="${slot}"]`);
  if (!row || selBank === 'L') {
    performSwap(slot);
    return;
  }
  const dir = selBank === 'C' ? 1 : -1;

  // Snapshot the outgoing NAME span only — the slot prefix (C7: / D7:)
  // represents the slot, not the patch, so it stays put while the patch
  // names cross-fade past each other.
  const outgoingName = row.querySelector('.patch-name-span');
  if (!outgoingName) {
    performSwap(slot);
    return;
  }
  const rect     = outgoingName.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const ghost = outgoingName.cloneNode(true);
  ghost.classList.remove('swap-in');
  ghost.style.position      = 'absolute';
  ghost.style.top           = `${rect.top - listRect.top + list.scrollTop}px`;
  ghost.style.left          = `${rect.left - listRect.left + list.scrollLeft}px`;
  ghost.style.width         = `${rect.width}px`;
  ghost.style.height        = `${rect.height}px`;
  ghost.style.boxSizing     = 'border-box';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex        = '2';
  ghost.style.setProperty('--swap-dir', String(dir));

  performSwap(slot);

  // After re-render the new row carries the incoming patch. Float the ghost
  // over the list and animate just the names — the slot prefix on either
  // row never moves.
  list.appendChild(ghost);
  const newRow  = list.querySelector(`.patch-item[data-slot="${slot}"]`);
  const newName = newRow && newRow.querySelector('.patch-name-span');
  if (newName) {
    newName.style.setProperty('--swap-dir', String(dir));
    newName.classList.add('swap-in');
    newName.addEventListener('animationend', () => {
      newName.classList.remove('swap-in');
      newName.style.removeProperty('--swap-dir');
    }, { once: true });
  }
  // Force a reflow so the starting state is committed before adding swap-out.
  // eslint-disable-next-line no-unused-expressions
  ghost.offsetWidth;
  ghost.classList.add('swap-out');
  ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
}

function performSwap(slot) {
  const cArr = patches && patches.banks && patches.banks[0];
  const dArr = patches && patches.banks && patches.banks[1];
  const cMeta = slotMetaArr('C');
  const dMeta = slotMetaArr('D');
  if (!Array.isArray(cArr) || !Array.isArray(dArr)) return;
  if (!Array.isArray(cMeta) || !Array.isArray(dMeta)) return;

  [cArr[slot],  dArr[slot]]  = [dArr[slot],  cArr[slot]];
  [cMeta[slot], dMeta[slot]] = [dMeta[slot], cMeta[slot]];

  recordToHistory('C', slot);
  recordToHistory('D', slot);

  saveLibraryDebounced();
  renderPatchList();
  updateSvgPatchName();
  if (selBank !== 'L') updateAllControls(currentPatch());
}

// ═══════════════════════════════════════════════════════════════
// Tape Memory: Save / Load
// ═══════════════════════════════════════════════════════════════

function buildExportData() {
  const out = { banks: { C: [], D: [] }, library: [] };
  ['C', 'D'].forEach((bank) => {
    const bankIdx = bank === 'D' ? 1 : 0;
    for (let slot = 0; slot < 16; slot++) {
      const params = (patches && patches.banks && patches.banks[bankIdx])
        ? patches.banks[bankIdx][slot] || {}
        : {};
      out.banks[bank].push({
        slot: slot + 1,
        name: patchName(bank, slot) || null,
        origin: patchOrigin(bank, slot) || slotKey(bank, slot),
        params,
      });
    }
  });
  return out;
}

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
function applyWavData(data, sourceLabel = null) {
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
      m.name   = (remembered && remembered.name)   || null;
      m.origin = (remembered && remembered.origin) || slotKey(bank, s);
    });
  });
}

// Each Tape Memory button is wired through setupHwButtons → handleTape*Save/
// handleTape*Load which dispatch to the per-data-type implementation below
// after a tape-vs-MIDI mode gate.

// ── Tone (patch bank) tape I/O ──────────────────────────────────────────
async function handleToneSave() {
  const result = await window.api.tapeSave();
  if (!result || !result.loaded) {
    if (result && result.error) console.error('Save (import) error:', result.error);
    return;
  }
  try {
    const label = labelFromPath(result.path);
    if (result.kind === 'wav') applyWavData(result.data, label);
    else                       applyImportData(result.data, label);
    saveLibraryDebounced();
    renderPatchList();
    updateSvgPatchName();
    updateAllControls(currentPatch());
    console.log(`Saved (imported) ${result.kind} from`, result.path);
  } catch (err) {
    console.error('Failed to apply imported data:', err.message);
  }
}

async function handleToneLoad() {
  // Pick the source: when the user is browsing the Library Tones sub-tab
  // with a package selected, send that package directly. Otherwise send the
  // active C/D banks. This matches the intuition that clicking Load while
  // viewing "Martin Crane DUMBO Sounds" sends *that* — without making the
  // user first round-trip it through the active banks.
  let exportData = patches;
  let label = activeBanksSourceLabel || null;
  if (selBank === 'L' && selLibTab === 'tones' && selPackage !== null
      && library && Array.isArray(library.packages) && library.packages[selPackage]) {
    const pkg = library.packages[selPackage];
    if (pkg.banks && pkg.banks.length === 2) {
      // jx3p's bank.schema.json requires { format_version, banks }; library
      // packages carry extra fields (id, slotMeta, customName, savedAt) that
      // the schema doesn't know about, so wrap a minimal-shape object here.
      exportData = {
        format_version: (patches && patches.format_version) || '1.0',
        banks: pkg.banks,
      };
      label = pkg.customName || pkg.defaultName || null;
    }
  }
  if (!exportData || !Array.isArray(exportData.banks) || exportData.banks.length < 2) {
    console.error('No patch data to export');
    return;
  }
  // Snapshot every named patch's current params → name mapping into history
  // before the data leaves the app. On a future re-import, matching params
  // will restore the name no matter what slot they come back in.
  recordAllNamedToHistory();
  saveLibraryDebounced();
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
    jxStep2:   'On the JX-3P click <b>Tape Memory</b> button → <b>Tone/Load</b> (button 16), then hit play below.',
    segments:  [
      { kind: 'init',    label: 'Init',    pilot: true  },
      { kind: 'bank-c',  label: 'Bank C',  pilot: false },
      { kind: 'divider', label: 'Divider', pilot: true  },
      { kind: 'bank-d',  label: 'Bank D',  pilot: false },
    ],
  });
}

function showSendSequenceToJxModal(exportData, sourceLabel, intro) {
  return showSendToJxFlow({
    exportData,
    sourceLabel,
    intro,
    kind: 'sequence',
    encodeApi: 'seqTapeEncodeToTemp',
    saveApi:   'seqTapeLoad',
    jxStep2:   'On the JX-3P click <b>Tape Memory</b> button → <b>Sequencer/Load</b>, then hit play below.',
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
function showSendToJxFlow(opts) {
  const { exportData, sourceLabel, kind, encodeApi, saveApi, jxStep2, segments, intro } = opts;

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

  if (intro) modal.appendChild(intro);

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.innerHTML =
    '<ol style="padding-left: 20px; margin: 0;">' +
      '<li>Connect your Mac headphone out to JX-3P Tape Memory LOAD input.</li>' +
      '<li>Turn up Mac volume to 100%.</li>' +
      '<li>Click the <b>Send to JX-3P</b> button below.</li>' +
    '</ol>';
  modal.appendChild(body);

  // Status row: per-segment timeline (driven by opts.segments) with a
  // playback indicator, plus a status text line. Hidden until step 2.
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
    return { ...cfg, el: seg };
  });
  const indicator = document.createElement('div');
  indicator.className = 'send-jx-indicator';
  timeline.appendChild(indicator);
  status.appendChild(timeline);
  const statusText = document.createElement('div');
  statusText.className = 'send-jx-status-text';
  status.appendChild(statusText);
  modal.appendChild(status);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'modal-btn';
  saveBtn.textContent = 'Save WAV file';
  saveBtn.title = 'Export to a file instead of sending directly';
  const primaryBtn = document.createElement('button');
  primaryBtn.className = 'modal-btn modal-btn-confirm';
  primaryBtn.textContent = 'Send to JX-3P';
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  actions.appendChild(primaryBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Active playback state.
  let audioEl = null;
  let tempPath = null;
  let progressTimer = null;
  let cancelled = false;

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

  // Segment boundaries derived from opts.segments. Pilot segments are EXACT
  // (4096 bits × 50 samples/bit / 44100 Hz = 4.6440s each); non-pilots share
  // the remaining duration equally.
  const PILOT_SEC = 4096 * 50 / 44100;
  let segDurations = null; // per-segment duration in seconds, indexed parallel to `segs`

  const computeSegDurations = (total) => {
    const numPilots = segs.filter((s) => s.pilot).length;
    const numData = segs.length - numPilots;
    const pilotTotal = numPilots * PILOT_SEC;
    const dataEach = numData > 0 ? Math.max(0, (total - pilotTotal) / numData) : 0;
    return segs.map((s) => (s.pilot ? PILOT_SEC : dataEach));
  };

  const applySegProportions = (durations) => {
    segs.forEach((s, i) => { s.el.style.flexGrow = String(Math.max(0.01, durations[i])); });
  };

  const updateIndicator = (currentSec) => {
    if (!segDurations) return;
    const total = segDurations.reduce((a, b) => a + b, 0);
    if (!total) return;
    const pct = Math.min(100, (currentSec / total) * 100);
    indicator.style.left = `${pct}%`;
    // Highlight whichever segment the playhead is currently inside.
    let acc = 0;
    let activeIdx = 0;
    for (let i = 0; i < segs.length; i++) {
      acc += segDurations[i];
      if (currentSec < acc) { activeIdx = i; break; }
      activeIdx = i;
    }
    segs.forEach((s, i) => s.el.classList.toggle('active', i === activeIdx));
  };

  // Step 2: arm the JX, then click Play to send the audio.
  const enterPlayState = (durationSec) => {
    primaryBtn.disabled = false;
    primaryBtn.textContent = '▶ Play';
    saveBtn.style.display = 'none';
    h.textContent = 'Ready to send';
    const dur = durationSec ? `${Math.ceil(durationSec)} seconds` : 'about 25 seconds';
    body.innerHTML =
      `<p>Tape dump audio is ready.</p>` +
      `<p style="margin-top: 8px;">${jxStep2}</p>` +
      `<p style="margin-top: 8px; color: var(--text-mid); font-size: 12px;">Transfer takes about ${dur}. Don’t switch apps or generate audio during transfer.</p>`;
    statusText.textContent = '';
    segDurations = computeSegDurations(durationSec);
    applySegProportions(segDurations);
    timeline.style.display = '';
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

async function handleSequencerSave() {
  if (!activeBankPatch()) {
    console.warn('No active patch to pair with a sequence entry');
    return;
  }
  const result = await window.api.seqTapeSave();
  if (!result || !result.loaded) {
    if (result && result.error) console.error('Sequencer save (import) error:', result.error);
    return;
  }
  showSaveSequenceModal({
    tapeData: result.data,
    sourcePath: result.path,
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
  arr[idx] = null;
  saveLibraryDebounced();
  renderCustomBuilder();
}

function reorderBucketSlot(bank, fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const arr = bucketsState()[bank];
  if (!arr) return;
  const [moved] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, moved);
  // Buckets are always length 16; the splice above can shorten the array
  // (if we move a filled entry past trailing empties). Re-pad.
  while (arr.length < 16) arr.push(null);
  arr.length = 16;
  saveLibraryDebounced();
  renderCustomBuilder();
}

function renameBucketEntry(bank, idx, newName) {
  const arr = bucketsState()[bank];
  if (!arr || !arr[idx]) return;
  arr[idx].name = newName || null;
  saveLibraryDebounced();
  renderCustomBuilder();
}

function renderCustomBuilder() {
  const builder = document.getElementById('custom-builder');
  const toggle  = document.getElementById('custom-builder-toggle');
  if (!builder || !toggle) return;
  const s = bucketsState();
  if (!s) return;

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
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPatchList();
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
  const slotMeta = decodedToSlotMeta(result.data);
  if (!banks) {
    showImportError('This WAV does not contain any patch data. Try dropping it on the Sequences sub-tab if it is a sequencer dump.');
    return;
  }
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
        applyWavData(result.data, labelFromPath(filePath));
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

  // Inject the locked panel SVG
  const svgText = await window.api.loadPanelSvg();
  const host = document.getElementById('panel-host');
  host.innerHTML = svgText;
  const svgEl = host.querySelector('svg');
  if (svgEl) {
    svgPatchNameEl = findSvgPatchNameEl(svgEl);
    tagControls(svgEl);
    setupInteraction(svgEl);
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
  renderPatchList();
  selectPatch(0);
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
