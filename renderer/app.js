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

// Heuristic: detect when a decoded jx3p result is "all default empty
// patches" — i.e. every checksum failed and the decoder returned 32 fresh
// JX3PPatch() instances. We use vca_level === 0 across all 32 slots as the
// signal: real patches almost always have non-zero VCA Level (otherwise
// the patch is inaudible), so 32-of-32 zeros is a near-certain decode
// failure. Used by applyToneCapture / applySequencerCapture to trigger
// the RECALIBRATE_PROMPT flow instead of silently importing empties.
function isDecodeAllDefault(data) {
  if (!data || !Array.isArray(data.banks)) return false;
  let any = false;
  for (let bi = 0; bi < data.banks.length; bi++) {
    const bank = data.banks[bi] || [];
    for (let s = 0; s < bank.length; s++) {
      const p = bank[s];
      if (!p) continue;
      any = true;
      if (typeof p.vca_level === 'number' && p.vca_level !== 0) return false;
    }
  }
  return any;
}

// Show the recalibrate-or-cancel modal after a failed capture. On
// confirm: clear this device's saved calibration entry and re-open the
// Record-from-JX modal (which now opens in two-pass calibration mode
// since the saved gain is gone). On cancel: do nothing — the user's
// active C/D banks stay at their pre-record state since we never
// applied the empty decode.
function showRecalibratePrompt({ kind, deviceId, deviceLabel }) {
  const labelText = deviceLabel ? ` *${deviceLabel}*` : '';
  showConfirmModal({
    title: 'Recording didn\'t decode cleanly',
    body:
      `The capture from${labelText} came back as empty patches. The most ` +
      'common cause is the input level being off.\n\n' +
      'Want to recalibrate the input gain and try again? Your active C/D ' +
      'banks will not be modified.',
    confirmLabel: 'Recalibrate',
    onConfirm: () => {
      if (deviceId) clearCalibratedGain(deviceId);
      // Re-open the Record modal — it'll now run the two-pass calibration
      // since this device has no saved gain.
      showRecordFromJxModal({
        kind,
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
  const ZONE_THRESHOLD = [0.02, 0.22, 0.34,  0.48,  0.62,  0.76,  0.88];

  wrap.setPeak = (peak) => {
    // Walk each ladder position (0=bottom→6=top). If peak crosses its
    // threshold, paint its zone color; otherwise paint the unlit cream.
    // SVG DOM order is reversed (segEls[0]=top), so map ladderPos i →
    // segEls[6-i].
    for (let i = 0; i < 7; i++) {
      const lit  = peak >= ZONE_THRESHOLD[i];
      const fill = lit ? ZONE_COLOR[i] : UNLIT;
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
  const result = await window.api.tapeSaveFromPath(tempWavPath);
  if (!result || !result.loaded) {
    showImportError(`Couldn't decode the captured audio: ${result && result.error || 'unknown error'}`);
    return;
  }
  // All-default decode = checksum failures across the board = capture
  // didn't work. Offer recalibration instead of silently populating active
  // C/D with empty patches.
  if (isDecodeAllDefault(result.data)) {
    showRecalibratePrompt({
      kind:        'tone',
      deviceId:    deviceInfo && deviceInfo.deviceId,
      deviceLabel: deviceInfo && deviceInfo.deviceLabel,
    });
    return;
  }
  const stamp = new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  await applyToneResult(result, tempWavPath, `JX-3P tape capture · ${stamp}`);
}

async function handleToneLoad() {
  // Pick the source: when the user is browsing the Library Tones sub-tab
  // with a package selected, send that package directly. Otherwise send the
  // active C/D banks. This matches the intuition that clicking Load while
  // viewing "Martin Crane DUMBO Sounds" sends *that* — without making the
  // user first round-trip it through the active banks.
  let exportData = patches;
  let label = activeBanksSourceLabel || null;
  // slotMeta captured alongside the export — main.js will embed this as a
  // custom RIFF chunk in the WAV so a recipient JP Patches install can
  // restore the original custom names. JX-3P hardware ignores the chunk.
  let slotMeta = library && library.slotMeta ? library.slotMeta : null;
  let sendingPackage = false;
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
      label          = pkg.customName || pkg.defaultName || null;
      slotMeta       = pkg.slotMeta   || null;
      sendingPackage = true;
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
  // When sending a library package *directly* (not via the active C/D banks),
  // the package's slotMeta isn't reflected in library.slotMeta, so
  // recordAllNamedToHistory above wouldn't capture the package's names.
  // Record them explicitly so an audio roundtrip through the JX-3P (which
  // strips the RIFF chunk that would otherwise carry names) still restores
  // them on reimport via fingerprint match.
  if (sendingPackage) recordSlotMetaToHistory(slotMeta, exportData.banks);
  saveLibraryDebounced();
  // Attach the slot metadata under a private key so main.js can pull it out
  // and embed it in the output WAV's RIFF "jPpS" chunk. The underscore
  // prefix marks it as our own extension; main.js strips it before passing
  // the bank JSON to jx3p (which would otherwise reject the extra field).
  if (slotMeta) exportData = { ...exportData, _slotMeta: slotMeta };
  // Diagnostic: log what's actually being sent so we can compare across
  // C/D-banks-source vs library-package-source paths when investigating
  // "send didn't reach the JX" bugs. Logs source label, bank slot 0
  // identity (first patch params), and slotMeta fingerprint.
  const sourceTag = sendingPackage ? `LIBRARY[${selPackage}]` : 'ACTIVE_C/D';
  const firstPatch = exportData.banks?.[0]?.[0];
  console.log(
    `send-to-jx tone: source=${sourceTag} label="${label}" ` +
    `bank-C-slot-0 vca=${firstPatch?.vca_level} dco1=${firstPatch?.dco1_waveform}@${firstPatch?.dco1_range} ` +
    `slotMeta=${slotMeta ? 'present' : 'none'}`
  );
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

function showSendSequenceToJxModal(exportData, sourceLabel, intro) {
  return showSendToJxFlow({
    exportData,
    sourceLabel,
    intro,
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

  // Cause→effect row (matches Record-from-JX layout pattern, defined in
  // docs/design-system.md §4.3). LEFT: JX-3P key diagram showing which
  // key/sub-mode to arm. ARROW: pulses while audio is actively playing
  // out of the Mac. RIGHT: vertical level meter showing the Mac's audio
  // output amplitude during playback (no gain knob — gain is fixed at
  // 100% Mac volume per the setup instructions). Hidden during step 1
  // (the setup checklist) and revealed when enterPlayState fires.
  const jxKeyDiagram = buildJxKeyDiagram({ action: 'load', kind });
  const sendRow = document.createElement('div');
  sendRow.className = 'record-jx-cal-row capture-mode';  // capture-mode = no gain knob
  sendRow.style.display = 'none';
  const sendArrow = document.createElement('div');
  sendArrow.className = 'record-jx-cal-arrow';
  sendArrow.innerHTML =
    `<svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto;">` +
      `<line x1="4" y1="20" x2="62" y2="20" stroke="#ffffff" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round"/>` +
      `<polygon points="62,12 62,28 76,20" fill="#ffffff"/>` +
    `</svg>`;
  // JX-3P "destination" logo — replaces the level meter that used to
  // live here. For send mode the meter wasn't actionable (Mac volume is
  // fixed at 100%, user can't tune it), and the logo communicates
  // "transmission destination" more clearly. Mirrors the Record-from-JX
  // capture layout where the JP Patches logo sits to the right of the
  // arrow as the data destination — here the destination is the JX, so
  // the JX-3P logo appears.
  const sendJxLogo = document.createElement('div');
  sendJxLogo.className = 'record-jx-jx3p-logo';
  sendJxLogo.innerHTML = `<img src="assets/jx3p-logo.png" alt="JX-3P" draggable="false"/>`;
  sendRow.appendChild(jxKeyDiagram);
  sendRow.appendChild(sendArrow);
  sendRow.appendChild(sendJxLogo);
  modal.appendChild(sendRow);

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

  // Audio analysis pipeline — drives the sendArrow pulse from
  // the actual audio element output. Set up lazily on first Play click
  // (createMediaElementSource can only run once per element, and we want
  // it inside a user-gesture handler so the AudioContext starts unblocked).
  let sendAudioCtx  = null;
  let sendAnalyser  = null;
  let sendAnalyserBuf = null;
  let sendMeterRaf  = null;

  const setupAudioAnalysis = () => {
    if (!audioEl || sendAudioCtx) return;
    try {
      sendAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = sendAudioCtx.createMediaElementSource(audioEl);
      sendAnalyser = sendAudioCtx.createAnalyser();
      sendAnalyser.fftSize = 256;
      // Route source → analyser → destination so audio still plays AND
      // we can tap the amplitude. If we don't connect to destination,
      // the audio element stops being audible (createMediaElementSource
      // takes over the routing).
      source.connect(sendAnalyser);
      sendAnalyser.connect(sendAudioCtx.destination);
      sendAnalyserBuf = new Uint8Array(sendAnalyser.fftSize);
    } catch (err) {
      // If analysis setup fails (e.g. CORS on audioEl src), let playback
      // continue without the meter. Don't break the send flow.
      console.warn('Send-to-JX meter analysis unavailable:', err.message);
      sendAudioCtx = null;
    }
  };

  const tickSendMeter = () => {
    if (!sendAnalyser) return;
    sendAnalyser.getByteTimeDomainData(sendAnalyserBuf);
    let peak = 0;
    for (let i = 0; i < sendAnalyserBuf.length; i++) {
      const v = Math.abs(sendAnalyserBuf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    // Pulse the arrow while audio is actively flowing — same pattern as
    // the Record-from-JX arrow during capture. (Level meter removed from
    // Send-to-JX in favor of the JX-3P logo; analyser still feeds the
    // arrow-pulse decision.)
    if (peak > 0.03) {
      if (!sendArrow.classList.contains('pulsing')) sendArrow.classList.add('pulsing');
    } else {
      if (sendArrow.classList.contains('pulsing')) sendArrow.classList.remove('pulsing');
    }
    sendMeterRaf = requestAnimationFrame(tickSendMeter);
  };

  const cleanup = async () => {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    if (sendMeterRaf) { cancelAnimationFrame(sendMeterRaf); sendMeterRaf = null; }
    if (sendAudioCtx) {
      try { await sendAudioCtx.close(); } catch {}
      sendAudioCtx = null;
      sendAnalyser = null;
      sendAnalyserBuf = null;
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
    // Reveal the cause→effect row (diagram + arrow + level meter) — step 2
    // is when the user actually needs to know which key to press and watch
    // the output level during playback.
    sendRow.style.display = '';
  };

  const startPlayback = async () => {
    primaryBtn.disabled = true;
    cancelBtn.textContent = 'Cancel';
    statusText.textContent = 'Playing…';
    // Wire up audio analysis BEFORE play() so the meter starts reading on
    // the first audio frame. setupAudioAnalysis must run inside this
    // user-gesture handler so the AudioContext starts in 'running' state
    // (Chrome's autoplay policy blocks contexts created without a gesture).
    setupAudioAnalysis();
    // Defensive: even when created in a user gesture, the AudioContext
    // can occasionally start in 'suspended' state (Chromium edge cases
    // when a previous context was still being torn down). Without this
    // resume, createMediaElementSource silently redirects the audio
    // element's output into a suspended context and NO sound plays —
    // visually everything looks normal (timeline advances, status reads
    // "Playing…") but the JX-3P never hears the dump and the user thinks
    // Send was broken.
    if (sendAudioCtx && sendAudioCtx.state === 'suspended') {
      try { await sendAudioCtx.resume(); } catch {}
    }
    try {
      await audioEl.play();
    } catch (err) {
      statusText.textContent = `Playback blocked: ${err.message}`;
      primaryBtn.disabled = false;
      return;
    }
    // Drive the send-level meter + arrow pulse from the analyser.
    if (sendAnalyser && !sendMeterRaf) {
      sendMeterRaf = requestAnimationFrame(tickSendMeter);
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
      // Arrow goes solid (no dashed pattern, full opacity, no marching
      // animation) so the visual reads as "transmission done" rather
      // than "still transmitting". Drop the pulsing class first to stop
      // the dash-flow animation; add complete to swap to a solid line.
      sendArrow.classList.remove('pulsing');
      sendArrow.classList.add('complete');
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
  const result = await window.api.seqTapeSaveFromPath(tempWavPath);
  if (!result || !result.loaded) {
    showImportError(`Couldn't decode the captured sequence: ${result && result.error || 'unknown error'}`);
    return;
  }
  // For sequences "all-default" means the tape.pages array is fully null —
  // every page checksum failed. Surface the recalibrate prompt BEFORE
  // opening the save-sequence modal so the user isn't asked to name an
  // empty sequence.
  const pages = (result.data && Array.isArray(result.data.pages)) ? result.data.pages : null;
  const isAllNullPages = pages && pages.every((p) => p == null);
  if (isAllNullPages) {
    showRecalibratePrompt({
      kind:        'sequence',
      deviceId:    deviceInfo && deviceInfo.deviceId,
      deviceLabel: deviceInfo && deviceInfo.deviceLabel,
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

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.style.textAlign = 'left';
  body.innerHTML = kind === 'sequence'
    ? `<p>Where's your sequencer-dump WAV coming from?</p>`
    : `<p>Where's your tape-dump WAV coming from?</p>`;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  const fileBtn = document.createElement('button');
  fileBtn.className = 'modal-btn';
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

async function showRecordFromJxModal({ kind, onCaptured }) {
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

  const meterSection = document.createElement('div');
  meterSection.className = 'record-jx-section';
  const meterLabel = document.createElement('label');
  meterLabel.textContent = 'LEVEL:';
  const meterOuter = document.createElement('div');
  meterOuter.className = 'record-jx-meter-outer';
  // Target-zone overlay: shaded band showing where FSK decodes cleanest.
  // Sits behind the live bar so the user can see "aim the peak into here".
  // Bounds match the clean-capture range used by the post-capture warning
  // (30–95%, but we cap visual at 70% as a "comfortable peak target" —
  // 70–95% works too, just closer to clipping).
  const meterTarget = document.createElement('div');
  meterTarget.className = 'record-jx-meter-target';
  meterOuter.appendChild(meterTarget);
  const meterBar = document.createElement('div');
  meterBar.className = 'record-jx-meter-bar';
  meterOuter.appendChild(meterBar);
  meterSection.appendChild(meterLabel);
  meterSection.appendChild(meterOuter);
  // Caption under the meter explaining the target band. Crucially: the
  // JX-3P emits a persistent idle tone *before* you press Save on it, and
  // the actual FSK transmission may be a different amplitude than the
  // idle tone. So gain calibrated against the idle tone may not produce
  // a usable FSK capture. The "FSK PEAK" badge below the meter only
  // updates once a silence-then-signal pattern is detected (i.e. the
  // real dump has started) — that's the number to actually optimize.
  const meterHint = document.createElement('div');
  meterHint.className = 'record-jx-meter-hint';
  meterHint.innerHTML =
    'Aim the FSK peak (badge below) into the shaded zone.<br>' +
    'The JX\'s idle tone may be a different level than the actual dump — ignore it; only the FSK peak matters.';
  meterSection.appendChild(meterHint);
  const fskPeakBadge = document.createElement('div');
  fskPeakBadge.className = 'record-jx-fsk-peak';
  fskPeakBadge.textContent = 'FSK PEAK: — (waiting for dump to start)';
  meterSection.appendChild(fskPeakBadge);

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
  meterSection.appendChild(calProgressSection);
  // Expected total signal duration (cumulative FSK time) per kind. Tones
  // are ~33 s (2 pilots + 2 bank-data sections); sequences are ~21 s
  // (1 pilot + up to 8 pages of data). These are the upper bounds used
  // for the progress-bar denominator.
  const EXPECTED_SIGNAL_MS = kind === 'sequence' ? 21000 : 33000;

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
  // (boost), with 1.0× landing around the 20% mark for muscle memory.
  // Formula: gain = 0.1 × 300^(slider/100). At slider=0 → 0.1×, slider=20
  // → ~1×, slider=100 → 30×.
  const sliderToGain = (s) => 0.1 * Math.pow(300, s / 100);
  // Clamp g ≥ 0.001 inside Math.max so negative/zero gain doesn't crash
  // into Math.log(negative) = NaN. (Defensive — in practice gain comes
  // from the slider or knob, both of which clamp positive.)
  const gainToSlider = (g) => Math.max(0, Math.min(100, Math.round(Math.log(Math.max(g, 0.001) / 0.1) / Math.log(300) * 100)));
  const formatGain   = (g) => g >= 10 ? `${g.toFixed(0)}×` : g >= 1 ? `${g.toFixed(1)}×` : `${g.toFixed(2)}×`;

  // Structure timeline — reuses the .send-jx-* classes from the export modal
  // so the visual matches. Static reference during recording; all segments
  // light up green on successful capture (the "complete" treatment).
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
    // Approximate per-segment durations (in seconds) derived from JX-3P
    // tape format math: pilots are 4096 bits × 51 samples / 44100 Hz =
    // ~4.74 s; data sections depend on bit content but average ~8.6 s
    // per bank for patches, ~16 s for an 8-page sequence. Used both for
    // the flex-grow ratio (visual proportions) and the timed sweep below.
    cfg.estSec = cfg.pilot
      ? 4.74
      : kind === 'sequence' ? 16.0 : 8.6;
    seg.style.flexGrow = String(cfg.estSec);
    const label = document.createElement('span');
    label.className = 'send-jx-seg-label';
    label.textContent = cfg.label.toUpperCase();
    seg.appendChild(label);
    timeline.appendChild(seg);
    return { ...cfg, el: seg };
  });
  // Sweeping indicator line — reuses the send-side .send-jx-indicator
  // styling. Anchored to the moment audio first crosses the signal
  // threshold (= JX started transmitting), then advances based on the
  // per-segment estSec values above.
  const indicator = document.createElement('div');
  indicator.className = 'send-jx-indicator';
  indicator.style.left = '0%';
  timeline.appendChild(indicator);
  timelineSection.appendChild(timelineLabel);
  timelineSection.appendChild(timeline);

  const statusText = document.createElement('div');
  statusText.className = 'record-jx-status';
  statusText.textContent = '';

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  const stopBtn = document.createElement('button');
  stopBtn.className = 'modal-btn modal-btn-confirm';
  stopBtn.textContent = '■ Stop';
  // Disabled until the capture actually starts (after the permission grant
  // + getUserMedia resolves) so a too-fast Stop click doesn't fire into a
  // half-initialized state.
  stopBtn.disabled = true;
  actions.appendChild(cancelBtn);
  actions.appendChild(stopBtn);

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
  jpLogoEl.innerHTML = `<img src="assets/jp-logo.png" alt="JP Patches" draggable="false"/>`;
  // jxKeyDiagram will be re-parented INTO calRow in calibration mode,
  // and put back at modal level for capture mode. Start with the
  // calibration arrangement (most common first-time use).
  calRow.appendChild(jxKeyDiagram);
  calRow.appendChild(calArrow);
  calRow.appendChild(jpLogoEl);
  calRow.appendChild(calCard);

  modal.appendChild(h);
  modal.appendChild(instr);
  modal.appendChild(calRow);          // calibration layout — visibility toggled
  modal.appendChild(deviceSection);
  modal.appendChild(meterSection);    // capture layout — visibility toggled
  modal.appendChild(gainSection);
  modal.appendChild(timelineSection);
  modal.appendChild(statusText);
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
  let mediaStream  = null;
  let audioContext = null;
  let sourceNode   = null;
  let gainNode     = null;          // software input-gain stage
  let analyserNode = null;
  let processorNode = null;
  let captured = [];                // Float32Array chunks accumulated during onaudioprocess
  let fskPeak  = 0;                 // max peak observed AFTER FSK start; populated by tickMeter, read by stopRecording for calibration
  let totalSignalMs = 0;            // cumulative time peak > SIGNAL_THRESHOLD_LIVE; modal-scoped so the calibration auto-stop can read it without requiring silence→signal detection
  let levelRaf = null;
  let elapsedTimer = null;

  const close = () => { stopCapture(); overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && state !== 'processing') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay && state !== 'processing') close(); });
  cancelBtn.addEventListener('click', close);

  // Populate device list. We need a one-shot permission grant first to get
  // human-readable device labels; without it, enumerateDevices() returns
  // anonymized entries like "Audio Input (default)" with no real name.
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());
  } catch (err) {
    // Permission denied or no devices — surface the error but still let the
    // user try Record later (a fresh permission prompt may appear).
    statusText.textContent = `Mic permission: ${err.name}. ${err.message}`;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs  = devices.filter((d) => d.kind === 'audioinput');
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
      recordBtn.disabled = true;
    }
  } catch (err) {
    statusText.textContent = `Couldn't list audio devices: ${err.message}`;
    recordBtn.disabled = true;
  }

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
      // Drop the legacy horizontal LEVEL section — replaced by the SVG
      // vertical meter inside calRow.
      meterSection.style.display = 'none';
      timelineSection.style.display = '';
      // Hide the Stop button — capture is fully hands-free now (auto-stop
      // fires when the JX dump completes; Cancel covers the abort case
      // for failed captures). Matches calibration mode's pattern.
      stopBtn.style.display = 'none';
      calProgressSection.style.display = 'none';
      gainSection.style.display = 'none';
      meterHint.style.display = 'none';
      fskPeakBadge.style.display = 'none';
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
      // First-time: start at unity gain. Calibration will measure and set the
      // multiplier post-pass-1 so pass 2 captures at the right level.
      gainSlider.value = '20';
      gainValueLabel.textContent = '1.0×';
      if (gainNode) gainNode.gain.value = 1.0;
      gainKnob.setGain(1.0);
      h.textContent = 'Step 1 of 2: Calibrate volume';
      // Calibration layout: show the cal-row with BOTH columns (gain knob
      // + level meter). Remove .capture-mode so the .cal-gain-col CSS rule
      // un-hides the gain column. Hide the legacy meter and gain sections
      // + segmented timeline. The dump-progress bar lives in meterSection
      // so we hoist it out below so it survives meterSection display:none.
      calRow.style.display = '';
      calRow.classList.remove('capture-mode');
      if (jxKeyDiagram.parentElement !== calRow) {
        // Insert as first child of calRow (left column).
        calRow.insertBefore(jxKeyDiagram, calRow.firstChild);
      }
      meterSection.style.display = 'none';
      timelineSection.style.display = 'none';
      // Hide the Stop button — calibration is fully hands-free now.
      // Auto-stop triggers when the dump-progress bar fills (cumulative
      // signal hits the expected duration) or when end-of-dump silence
      // is detected.
      stopBtn.style.display = 'none';
      // Show the dump-progress bar (re-parented under calRow so it stays
      // visible even though its host meterSection is hidden) + initialize.
      if (calProgressSection.parentElement !== modal) {
        // Move it out of meterSection (its original parent) and place it
        // directly under calRow so it survives meterSection display:none.
        modal.insertBefore(calProgressSection, deviceSection);
      }
      calProgressSection.style.display = '';
      calProgressBar.style.width = '0%';
      gainSection.style.display = 'none';   // gain knob in calRow replaces the slider
      meterHint.style.display = 'none';
      fskPeakBadge.style.display = 'none';
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
    if (levelRaf)     { cancelAnimationFrame(levelRaf); levelRaf = null; }
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    try { if (processorNode) { processorNode.disconnect(); processorNode = null; } } catch {}
    try { if (analyserNode)  { analyserNode.disconnect();  analyserNode  = null; } } catch {}
    try { if (gainNode)      { gainNode.disconnect();      gainNode      = null; } } catch {}
    try { if (sourceNode)    { sourceNode.disconnect();    sourceNode    = null; } } catch {}
    try { if (audioContext && audioContext.state !== 'closed') audioContext.close(); } catch {}
    audioContext = null;
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
    captured = [];
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId:         devicePicker.value ? { exact: devicePicker.value } : undefined,
          // Critical: disable any processing that would mangle the FSK signal.
          // Chromium's voice-call DSP (high-pass filter + AGC + noise gate)
          // is on by default and the *standard* boolean flags below aren't
          // always respected — they're treated as soft preferences. The
          // `{exact: false}` form forces them, and the legacy `googXxx`
          // flags catch older Chromium versions that ignored the standard
          // names. Without this, recordings come back with the FSK carrier
          // partially filtered out — bits decode as noise, no checksums pass.
          echoCancellation:        { exact: false },
          noiseSuppression:        { exact: false },
          autoGainControl:         { exact: false },
          googEchoCancellation:    false,
          googAutoGainControl:     false,
          googNoiseSuppression:    false,
          googHighpassFilter:      false,
          googTypingNoiseDetection:false,
          channelCount:            1,
          sampleRate:              44100,
        },
      });
    } catch (err) {
      // {exact:false} can throw OverconstrainedError on devices that report
      // they can't comply. Fall back to the soft form so the user can at
      // least record (degraded quality, but lets them see the level meter).
      console.warn('Strict raw-audio constraints failed, falling back:', err.name);
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId:         devicePicker.value ? { exact: devicePicker.value } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl:  false,
            channelCount:     1,
            sampleRate:       44100,
          },
        });
      } catch (err2) {
        statusText.textContent = `Couldn't start mic: ${err2.name} — ${err2.message}`;
        stopBtn.disabled = true;
        return;
      }
    }
    // AudioContext sample rate may differ from what we requested (browser
    // resampler may apply). We read audioContext.sampleRate when shipping
    // the WAV so the header matches the actual data rate.
    try {
      audioContext = new AudioContext({ sampleRate: 44100 });
    } catch {
      audioContext = new AudioContext();
    }
    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    // Software input-gain stage. Sits between the mic source and everything
    // downstream so both the level meter and the captured PCM reflect the
    // user's gain choice. Slider position is preserved across restarts
    // (e.g. on device change) by reading gainSlider.value here rather than
    // resetting.
    gainNode = audioContext.createGain();
    gainNode.gain.value = sliderToGain(parseInt(gainSlider.value, 10));
    gainValueLabel.textContent = formatGain(gainNode.gain.value);
    sourceNode.connect(gainNode);

    // Level meter via AnalyserNode (peaks, not RMS — easier to see clipping).
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    gainNode.connect(analyserNode);
    const analyserBuf = new Uint8Array(analyserNode.fftSize);
    // Live peak-tracker for the meter, silence-anchored timeline sweep,
    // and live quiet-input warning all share this RAF loop.
    //
    // Timeline sweep: the JX-3P emits a persistent idle tone before the
    // user presses Save, then pauses briefly, then transmits FSK. So
    // we DON'T start the sweep on first signal — that's just the idle
    // tone. We start it only after we've observed a silence gap (the
    // Save-press marker) followed by signal. This matches the same
    // silence-then-signal detection used in stopRecording's trim logic.
    // Lowered silence threshold from 0.05 to 0.03 — at high gain (10×+),
    // the noise floor of typical audio interfaces sits around 0.04, which
    // would falsely register as "signal" with a 0.05 threshold and break
    // the silence-then-signal detection. 0.03 is below most noise floors
    // but well below the FSK signal levels (typically 0.3+ post-gain).
    const SILENCE_THRESHOLD_LIVE = 0.03;
    const SIGNAL_THRESHOLD_LIVE  = 0.10;
    const totalEstSec = segs.reduce((sum, s) => sum + s.estSec, 0);
    // Track SUSTAINED silence (consecutive below-threshold ticks reset on
    // any non-silence). Accumulated/total silence isn't enough — the JX
    // idle tone can dip below threshold briefly and falsely accumulate.
    let consecSilenceMs = 0;
    let fskStartMs   = null;      // ms timestamp when FSK actually began (silence→signal pattern detected; may be null if no silence preceded the signal)
    let firstSignalMs = null;     // ms timestamp when peak FIRST crossed SIGNAL_THRESHOLD_LIVE — robust to no-silence-precursor case; used for the "expected dump duration has elapsed since signal start" auto-stop trigger
    let activeMs     = 0;         // accumulated time inside FSK transmission
    totalSignalMs    = 0;         // reset between record sessions (modal-scoped)
    let lastTickMs   = null;
    let runningPeak  = 0;
    fskPeak = 0;                  // reset between record sessions (modal-scoped)
    let quietWarningShown = false;
    const recordStartMs = Date.now();
    const tickMeter = () => {
      if (state !== 'recording') return;
      analyserNode.getByteTimeDomainData(analyserBuf);
      let peak = 0;
      for (let i = 0; i < analyserBuf.length; i++) {
        const v = Math.abs(analyserBuf[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      meterBar.style.width = `${Math.min(100, peak * 100)}%`;
      // Color-code: green up to ~70%, amber 70–90%, red above.
      meterBar.style.background = peak < 0.7 ? '#1f6e5b' : peak < 0.9 ? '#c39a3a' : '#b94a2e';
      // Calibration-mode SVG vertical level meter (panel-style 3-segment
      // ladder). setPeak picks grey/blue/green/red zones per the mockups.
      vmeter.setPeak(peak);
      // Arrow between key diagram and gain/meter card pulses when there's
      // any signal coming in — reinforces the visual cause→effect (press
      // Save on JX → see level respond on Mac).
      if (peak > SILENCE_THRESHOLD_LIVE) {
        if (!calArrow.classList.contains('pulsing')) calArrow.classList.add('pulsing');
      } else {
        if (calArrow.classList.contains('pulsing'))  calArrow.classList.remove('pulsing');
      }
      if (peak > runningPeak) runningPeak = peak;

      const now = Date.now();
      const dtMs = lastTickMs !== null ? (now - lastTickMs) : 0;
      lastTickMs = now;

      // Sustained-silence detection: need 500 ms of consecutive ticks below
      // the silence threshold to register as the "Save press" marker. Any
      // tick that's not silence resets the streak — that filters out brief
      // idle-tone dips that aren't actually the JX going quiet.
      if (peak < SILENCE_THRESHOLD_LIVE) {
        consecSilenceMs += dtMs;
      } else {
        if (peak > SIGNAL_THRESHOLD_LIVE) {
          totalSignalMs += dtMs;
          // First time we see real signal — set firstSignalMs so the
          // (b) auto-stop trigger can anchor to "dump start" rather than
          // "recording start". This makes the timeout robust to any
          // pre-roll between modal-open and user pressing Save on the JX.
          if (firstSignalMs === null) firstSignalMs = now;
          // Drive the calibration-mode dump-progress bar from WALL-CLOCK
          // time since signal first arrived (rather than cumulative-pulse
          // time). The JX dump takes a fixed ~33 s wall-clock from first
          // signal to last; tracking wall-clock means the bar reaches
          // 100% exactly when the dump actually ends, not 6–8 s later
          // after gaps (pre-roll, inter-segment pauses) catch up.
          if (isCalibrating && firstSignalMs !== null) {
            const signalElapsed = now - firstSignalMs;
            const pct = Math.min(100, (signalElapsed / EXPECTED_SIGNAL_MS) * 100);
            calProgressBar.style.width = `${pct}%`;
          }
          if (fskStartMs === null && consecSilenceMs >= 500) {
            fskStartMs = now;
          }
          if (fskStartMs !== null) {
            activeMs += dtMs;
            if (peak > fskPeak) {
              fskPeak = peak;
              const pct = Math.round(fskPeak * 100);
              const zone = fskPeak < 0.30 ? 'quiet — auto-boost will help, but raise gain for cleaner decode'
                         : fskPeak > 0.95 ? 'CLIPPING — lower gain immediately or capture will fail'
                         : 'in target zone ✓';
              fskPeakBadge.textContent = `FSK PEAK: ${pct}% — ${zone}`;
              fskPeakBadge.style.color = fskPeak < 0.30 ? '#c39a3a'
                                        : fskPeak > 0.95 ? '#b94a2e'
                                        : '#1f6e5b';
            }
            // Calibration auto-stop removed: it tore down capture mid-JX-
            // transmission, so pass 2 would start mid-dump (no pilot tone)
            // and the demodulator couldn't calibrate cycle widths → 0
            // valid records. User now clicks Stop manually after each pass;
            // the JX has time to finish its dump, and the next Save press
            // produces a clean pilot-led pass 2 capture.
          }
        }
        consecSilenceMs = 0;
      }

      // End-of-dump auto-stop — fires in BOTH calibration AND capture
      // modes. Lives OUTSIDE the silence/signal branches so it runs every
      // tick, regardless of whether the JX's post-dump idle tone is loud
      // enough to mask the silence detector (Daniel's 2026-05-24 bug:
      // at calibrated gain the idle tone kept peak above the silence
      // threshold, so the auto-stop check never ran). Four triggers,
      // listed in order of preference:
      //   (a) Saw ≥5 s of cumulative signal then ≥1 s of contiguous
      //       silence — the normal "JX finished dumping" case. Most
      //       responsive when post-dump audio actually drops to silence.
      //   (b) Time since firstSignalMs ≥ expected dump duration + 2 s.
      //       Primary trigger when (a) can't fire. Anchored to "when
      //       signal actually arrived" rather than recording start, so
      //       it accounts for any pre-roll between modal-open and user
      //       pressing Save on the JX. Fires within ~2 s of dump end
      //       regardless of post-dump idle tone amplitude.
      //   (c) totalSignalMs ≥ expected dump duration — we've captured
      //       enough cumulative FSK to know the dump is done.
      //   (d) Safety timeout — elapsedTotal exceeds expected dump
      //       duration + 6 s grace. Hard fallback if signal detection
      //       itself misfires.
      const elapsedTotal = now - recordStartMs;
      const signalElapsed = firstSignalMs !== null ? (now - firstSignalMs) : 0;
      const DUMP_TIMEOUT_MS   = EXPECTED_SIGNAL_MS + 500;   // primary close trigger — fires almost simultaneously with progress bar hitting 100%
      const SAFETY_TIMEOUT_MS = EXPECTED_SIGNAL_MS + 6000;  // hard fallback if signal detection misfires
      if (
            (totalSignalMs >= 5000 && consecSilenceMs >= 1000) ||
            (firstSignalMs !== null && signalElapsed >= DUMP_TIMEOUT_MS) ||
            (totalSignalMs >= EXPECTED_SIGNAL_MS) ||
            elapsedTotal >= SAFETY_TIMEOUT_MS
      ) {
        // Snap the progress bar to 100% before triggering Stop so the
        // user gets a clean visual closure before the modal advances.
        if (isCalibrating) calProgressBar.style.width = '100%';
        stopRecording();
        return;
      }

      if (activeMs > 0) {
        const elapsedSec = activeMs / 1000;
        let acc = 0, activeIdx = segs.length - 1;
        for (let i = 0; i < segs.length; i++) {
          acc += segs[i].estSec;
          if (elapsedSec < acc) { activeIdx = i; break; }
        }
        segs.forEach((s, i) => s.el.classList.toggle('active', i === activeIdx));
        const pct = Math.min(100, (elapsedSec / totalEstSec) * 100);
        indicator.style.left = `${pct}%`;
      }

      // After 6 s of recording, if peak has never crossed 15%, surface a
      // live warning so the user can crank input gain BEFORE wasting the
      // full recording on an undecodable signal. Auto-clear the warning if
      // the signal subsequently recovers — stale warnings on a healthy
      // meter are confusing.
      if (!quietWarningShown && now - recordStartMs > 6000 && runningPeak < 0.15) {
        quietWarningShown = true;
        statusText.textContent = '⚠ Signal looks very quiet — raise INPUT GAIN above or your Mac input gain. Quiet captures often decode as noise.';
        statusText.style.color = '#c39a3a';
      } else if (quietWarningShown && runningPeak >= 0.30) {
        quietWarningShown = false;
        statusText.textContent = '';
        statusText.style.color = '';
      }
      levelRaf = requestAnimationFrame(tickMeter);
    };
    levelRaf = requestAnimationFrame(tickMeter);

    // Capture via ScriptProcessorNode. Deprecated in favor of AudioWorklet
    // but vastly simpler and still works in Electron 35. ~93 ms latency at
    // bufferSize=4096 / 44.1kHz, fine for offline capture (we don't monitor
    // the signal).
    const BUFFER_SIZE = 4096;
    processorNode = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    processorNode.onaudioprocess = (e) => {
      // Must copy: the inputBuffer's channel data is reused by the audio
      // engine on the next callback.
      captured.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    gainNode.connect(processorNode);
    // ScriptProcessor doesn't fire onaudioprocess unless its output is
    // connected. We route to a muted GainNode so nothing actually plays
    // through the speakers (otherwise we'd hear the captured input).
    const muteGain = audioContext.createGain();
    muteGain.gain.value = 0;
    processorNode.connect(muteGain);
    muteGain.connect(audioContext.destination);

    stopBtn.disabled = false;
    statusText.style.color = '';
    const startMs = Date.now();
    elapsedTimer = setInterval(() => {
      // Don't clobber a live warning message (e.g. "signal looks too quiet")
      // by overwriting it with the elapsed-time tick.
      if (quietWarningShown) return;
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
    startRecording();
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
      startRecording();
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
        startRecording();
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
      stopCapture();
      overlay.remove();
      document.removeEventListener('keydown', onKey);

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
    //
    // The JX-3P emits a persistent idle tone before AND after the tape
    // dump. The pre-idle tone has its own crossing pattern (NOT real FSK
    // cycle widths), which contaminates jx3p's demodulator calibration —
    // it locks onto the wrong long_width reference and misclassifies every
    // subsequent crossing.
    //
    // Crucially, when the user presses Save on the JX, the idle tone
    // BRIEFLY PAUSES before the pilot tone starts. That silence gap (~100
    // ms to a few seconds depending on user timing) is our marker for
    // where the real FSK begins.
    //
    // Algorithm: scan 200 ms windows classifying each as signal (peak >
    // 0.10), silence (peak < 0.05), or in-between. Find the first
    // silence → signal transition where the following signal run is at
    // least 5 s long (real FSK is ~30 s, so anything ≥ 5 s is clearly
    // not a transient pop). Trim everything before that transition.
    //
    // Fallback: if no silence → sustained-signal pattern is found (e.g.,
    // user already pressed Save before clicking Record, no pre-noise),
    // use the longest signal run instead.
    //
    // Threshold scaling: the JX's between-dumps idle tone is a constant
    // pre-gain amplitude (~0.005–0.010), so after applying software gain g
    // it lands at ~0.005g–0.010g. At low gain (≤4×) idle stays under the
    // default 0.05 silence threshold; at higher gain it crosses, the
    // silence detector finds no pre-FSK gap, trim falls through to the
    // longest-signal-run fallback, and jx3p's demodulator calibrates
    // against idle-tone cycle widths instead of FSK — every checksum
    // fails. Scale both thresholds with current gain (capped at 20× so
    // the signal threshold doesn't approach the FSK peak target of 0.6).
    const currentGainAtTrim  = sliderToGain(parseInt(gainSlider.value, 10));
    const thresholdScale     = Math.min(20, Math.max(1, currentGainAtTrim));
    const WIN_SEC            = 0.2;
    const SIGNAL_THRESHOLD   = Math.max(0.10, 0.025 * thresholdScale);
    const SILENCE_THRESHOLD  = Math.max(0.05, 0.012 * thresholdScale);
    console.log(`record-jx trim: gain=${currentGainAtTrim.toFixed(2)}× thresholds: silence=${SILENCE_THRESHOLD.toFixed(3)} signal=${SIGNAL_THRESHOLD.toFixed(3)}`);
    const MIN_SILENCE_WINDOWS = Math.ceil(0.30 / WIN_SEC);  // ≥ 300 ms silence
    const MIN_SIGNAL_WINDOWS  = Math.ceil(5.00 / WIN_SEC);  // ≥ 5 s sustained signal after
    const winSize    = Math.floor(WIN_SEC * actualSampleRate);
    const numWindows = Math.floor(totalSamples / winSize);

    // Classify each window once.
    const klass = new Array(numWindows); // 'signal' | 'silence' | 'between'
    for (let w = 0; w < numWindows; w++) {
      let peak = 0;
      const lo = w * winSize, hi = lo + winSize;
      for (let i = lo; i < hi; i++) {
        const v = Math.abs(all[i]);
        if (v > peak) peak = v;
      }
      klass[w] = peak > SIGNAL_THRESHOLD ? 'signal'
               : peak < SILENCE_THRESHOLD ? 'silence'
               : 'between';
    }

    // Pass 1: look for silence ≥ MIN_SILENCE_WINDOWS, then signal that
    // sustains for ≥ MIN_SIGNAL_WINDOWS. Pick the LATEST matching
    // transition — recordings can contain multiple silence→signal
    // patterns (e.g. the JX idle tone briefly hiccupping before Save is
    // pressed), and the real FSK is always the last sustained signal run
    // in the buffer (the user clicks Stop right after the dump ends).
    let trimWindow = -1;
    let silenceLen = 0;
    for (let w = 0; w < numWindows; w++) {
      if (klass[w] === 'silence') {
        silenceLen += 1;
      } else if (klass[w] === 'signal' && silenceLen >= MIN_SILENCE_WINDOWS) {
        // Count how long this signal run continues (signal-or-between
        // counts; silence breaks it).
        let signalRun = 0;
        for (let v = w; v < numWindows && klass[v] !== 'silence'; v++) {
          if (klass[v] === 'signal') signalRun += 1;
        }
        if (signalRun >= MIN_SIGNAL_WINDOWS) {
          trimWindow = w;  // KEEP looking — we want the latest match
        }
        silenceLen = 0;
      } else {
        // 'between' or 'signal' without prior qualifying silence
        if (klass[w] === 'signal') silenceLen = 0;
      }
    }

    // Pass 2 (fallback): no silence→signal pattern. Use longest signal run.
    if (trimWindow < 0) {
      let bestStart = 0, bestLen = 0, curStart = -1, curLen = 0;
      for (let w = 0; w < numWindows; w++) {
        if (klass[w] === 'signal') {
          if (curStart < 0) curStart = w;
          curLen += 1;
          if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
        } else {
          curStart = -1;
          curLen   = 0;
        }
      }
      if (bestLen > 0) trimWindow = bestStart;
    }

    const backoff   = Math.floor(0.05 * actualSampleRate);
    const trimStart = trimWindow > 0
      ? Math.max(0, trimWindow * winSize - backoff)
      : 0;
    const trimmed    = trimStart > 0 ? all.subarray(trimStart) : all;
    const trimmedLen = trimmed.length;

    // Convert trimmed Float32 → interleaved 16-bit signed PCM (mono, so
    // no interleaving needed). Track overall peak in the same loop so we
    // can surface gain-quality feedback to the user after capture.
    const pcm = new ArrayBuffer(trimmedLen * 2);
    const view = new DataView(pcm);
    let peakAmp = 0;
    for (let i = 0; i < trimmedLen; i++) {
      const s = Math.max(-1, Math.min(1, trimmed[i]));
      const absV = Math.abs(s);
      if (absV > peakAmp) peakAmp = absV;
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
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
      startRecording();
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
      setTimeout(() => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        onCaptured(result.path, { deviceId: calibrationDeviceId, deviceLabel: calibrationDeviceLabel });
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
    tryAgainBtn.className = 'modal-btn';
    tryAgainBtn.textContent = 'Try again';
    const useBtn = document.createElement('button');
    useBtn.className = 'modal-btn';
    useBtn.textContent = 'Use anyway';
    actions.appendChild(tryAgainBtn);
    actions.appendChild(useBtn);
    useBtn.addEventListener('click', () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      // Pass deviceInfo so a subsequent all-default decode (which fires
      // the recalibrate prompt) can correctly clear THIS device's saved
      // gain entry. Without it, the recalibrate flow re-opens into Step 2
      // (capture) instead of Step 1 (calibration) because the saved
      // calibration is never cleared.
      onCaptured(result.path, { deviceId: calibrationDeviceId, deviceLabel: calibrationDeviceLabel });
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
      startRecording();
    });
  };

  stopBtn.addEventListener('click', () => stopRecording());

  // Kick off the capture immediately. macOS will fire the mic-permission
  // prompt on first run; the recording UI is already visible behind it so
  // the user knows what they're granting permission for.
  startRecording();
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
