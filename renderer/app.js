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
  { gTranslate: '690,545', param: 'env_sustain' },
  { gTranslate: '600,545', param: 'env_release' },
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
const BUTTON_REGISTRY = [
  { id: 'manual', color: '#cc2222', bodySel: 'rect[x="765"][y="516"][width="58"]' },
  { id: 'write',  color: '#cc2222', bodySel: 'rect[x="843"][y="516"][width="58"]' },
];

const LED_OFF = '#333';

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

let patches  = null;
let library  = null;
let selBank  = 'C';
let selSlot  = 0;
let selPackage = null;     // selected index in library.packages   (Tones sub-tab)
let selSequence = null;    // selected index in library.sequences  (Sequences sub-tab)
let selLibTab  = 'tones';  // 'tones' | 'sequences'
let saveTimer = null;
let svgPatchNameEl = null;  // <text> in the SVG that displays the patch name

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

const slotKey = (b, s) => `${b}${s + 1}`;

function patchName(b, s) {
  return (library && library.names && library.names[slotKey(b, s)]) || null;
}

function displayLabel(b, s) {
  const nm = patchName(b, s);
  return nm ? `${slotKey(b, s)}: ${nm}` : `${slotKey(b, s)}`;
}

function currentPatch() {
  if (!patches || !Array.isArray(patches.banks) || selBank === 'L') return null;
  const bankIdx = selBank === 'D' ? 1 : 0;
  return patches.banks[bankIdx] && patches.banks[bankIdx][selSlot] || null;
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
  svgPatchNameEl.textContent = displayLabel(selBank, selSlot);
  // Truncate with an ellipsis if the rendered text would extend past the
  // red parallelogram's slanted right edge at the text baseline (y=116).
  const MAX_WIDTH = 195;
  if (typeof svgPatchNameEl.getComputedTextLength !== 'function') return;
  while (svgPatchNameEl.getComputedTextLength() > MAX_WIDTH &&
         svgPatchNameEl.textContent.length > 4) {
    svgPatchNameEl.textContent = svgPatchNameEl.textContent.slice(0, -2) + '…';
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
      lightButton(downBtnId, false);
      // Manual / Write are visual-only for now. Save / Load live as HTML
      // buttons below the left panel — see setupHwButtons.
      downBtnId = null;
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Patch list
// ═══════════════════════════════════════════════════════════════

function renderPatchList() {
  const list = document.getElementById('patch-list');
  const actions = document.getElementById('bottom-actions');
  const subTabs = document.getElementById('lib-sub-tabs');
  list.innerHTML = '';
  actions.innerHTML = '';

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

  for (let slot = 0; slot < 16; slot++) {
    const key  = slotKey(selBank, slot);
    const name = patchName(selBank, slot);

    const item = document.createElement('div');
    item.className = 'patch-item' + (slot === selSlot ? ' selected' : '');

    const num = document.createElement('span');
    num.className = 'patch-number';
    num.textContent = key + ':';

    const nm = document.createElement('span');
    nm.className = 'patch-name-span' + (name ? '' : ' unnamed');
    nm.textContent = name || 'click to name';

    const inp = document.createElement('input');
    inp.className = 'patch-name-edit';
    inp.type = 'text';
    inp.maxLength = 28;
    inp.spellcheck = false;
    inp.autocomplete = 'off';

    item.appendChild(num);
    item.appendChild(nm);
    item.appendChild(inp);
    list.appendChild(item);

    item.addEventListener('click', (e) => {
      if (e.target === nm && slot === selSlot) {
        startNameEdit(slot, nm, inp);
        return;
      }
      selectPatch(slot);
    });

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  commitListEdit(slot, nm, inp);
      if (e.key === 'Escape') cancelListEdit(nm, inp);
    });
    inp.addEventListener('blur', () => commitListEdit(slot, nm, inp));
  }

  const btn = document.createElement('button');
  btn.className = 'save-banks-btn';
  btn.textContent = 'save C/D banks to library';
  btn.addEventListener('click', handleSaveBanksToLibrary);
  actions.appendChild(btn);
}

function renderLibraryActions(actions) {
  const btn = document.createElement('button');
  btn.className = 'save-banks-btn';
  btn.textContent = 'load selected library C/D banks to app';
  btn.disabled = selPackage === null;
  btn.addEventListener('click', handleLoadLibraryBanks);
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
  const now = new Date();
  const pkg = {
    id: now.toISOString(),
    defaultName: packageDefaultName(now),
    customName: '',
    savedAt: now.toISOString(),
    banks: JSON.parse(JSON.stringify(patches.banks)),
    names: { ...(library.names || {}) },
  };
  if (!Array.isArray(library.packages)) library.packages = [];
  library.packages.unshift(pkg);
  if (selPackage !== null) selPackage += 1;  // existing selection shifts down
  saveLibraryDebounced();

  // Switch to Library tab.
  selBank = 'L';
  selSlot = 0;
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
    item.draggable = true;
    item.dataset.idx = String(idx);

    const nm = document.createElement('span');
    nm.className = 'package-name-span' + (pkg.customName ? '' : ' unnamed');
    nm.textContent = pkg.customName || pkg.defaultName;

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
    item.appendChild(buildTrashIcon(idx));
    list.appendChild(item);

    item.addEventListener('click', (e) => {
      if (e.target === nm && idx === selPackage) {
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

function handleLoadLibraryBanks() {
  if (selPackage === null) return;
  const pkg = library.packages[selPackage];
  if (!pkg) return;
  showConfirmModal({
    title: 'Overwrite active C/D banks?',
    body:
      'Loading this library package will replace the C and D banks currently in the JP Patches app.\n\n' +
      'These banks will not be loaded to a JX-3P until you click the "load to JX-3P" button.',
    confirmLabel: 'Load',
    onConfirm: () => loadPackageIntoActiveBanks(pkg),
  });
}

function loadPackageIntoActiveBanks(pkg) {
  patches.banks = JSON.parse(JSON.stringify(pkg.banks));
  library.names = { ...(pkg.names || {}) };
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
function showConfirmModal({ title, body, confirmLabel, confirmStyle, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const h = document.createElement('h2');
  h.className = 'modal-title';
  h.textContent = title;

  const p = document.createElement('p');
  p.className = 'modal-body';
  body.split('\n').forEach((line, i) => {
    if (i > 0) p.appendChild(document.createElement('br'));
    p.appendChild(document.createTextNode(line));
  });

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
  modal.appendChild(p);
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
    body: 'Are you sure you want to delete this C/D bank? It can not be undone.',
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
// but operates on library.sequences. Each sequence carries a paired-patch
// snapshot; loading restores the paired patch. Real sequencer audio data
// is stored in `sequenceData` (null today; awaits upstream codec).

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
    item.draggable = true;
    item.dataset.idx = String(idx);

    const nm = document.createElement('span');
    nm.className = 'package-name-span' + (seq.customName ? '' : ' unnamed');
    nm.textContent = seq.customName || seq.defaultName;

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
    item.appendChild(buildSequenceTrashIcon(idx));
    list.appendChild(item);

    item.addEventListener('click', (e) => {
      if (e.target === nm && idx === selSequence) {
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
    body: 'Are you sure you want to delete this Sequence? It can not be undone.',
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

function renderSequencesActions(actions) {
  const btn = document.createElement('button');
  btn.className = 'save-banks-btn';
  btn.textContent = 'load selected sequence to app';
  btn.disabled = selSequence === null;
  btn.addEventListener('click', handleLoadLibrarySequence);
  actions.appendChild(btn);
}

function handleLoadLibrarySequence() {
  if (selSequence === null) return;
  const seq = library.sequences[selSequence];
  if (!seq) return;
  const pp = seq.pairedPatch || {};
  const where = (pp.bank || 'C') + ((pp.slot || 0) + 1);
  showConfirmModal({
    title: 'Load this Sequence?',
    body:
      `Loading this Sequence will jump to the paired patch slot (${where}) and ` +
      `apply the patch parameters captured at save time.\n\n` +
      'Sequence audio data isn\'t yet captured by the patch tool — only the paired ' +
      'patch is restored today.',
    confirmLabel: 'Load',
    onConfirm: () => loadSequenceIntoActivePatch(seq),
  });
}

function loadSequenceIntoActivePatch(seq) {
  const pp = seq && seq.pairedPatch;
  if (!pp) return;
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

function selectPatch(slot) {
  selSlot = slot;
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
  const key = slotKey(selBank, slot);
  if (val) library.names[key] = val;
  else     delete library.names[key];
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
        params,
      });
    }
  });
  return out;
}

function applyImportData(data) {
  if (!data || !data.banks) throw new Error('invalid file: missing "banks"');
  ['C', 'D'].forEach((bank) => {
    const bankIdx = bank === 'D' ? 1 : 0;
    const arr = data.banks[bank];
    if (!Array.isArray(arr)) return;
    arr.forEach((entry) => {
      if (!entry || typeof entry.slot !== 'number') return;
      const slot = entry.slot - 1;
      if (slot < 0 || slot >= 16) return;
      const key = slotKey(bank, slot);
      if (entry.name) library.names[key] = entry.name;
      else            delete library.names[key];
      if (entry.params && patches && patches.banks && patches.banks[bankIdx]) {
        patches.banks[bankIdx][slot] = entry.params;
      }
    });
  });
}

// jx3p output: { format_version, banks: [[16 patches], [16 patches]] }
// (no slot keys, no name field — just the parameter object per slot).
// Replace the in-memory patch params; existing user names are preserved.
function applyWavData(data) {
  if (!data || !Array.isArray(data.banks) || data.banks.length < 2) {
    throw new Error('invalid jx3p output: expected banks: [[...], [...]]');
  }
  patches = data;
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
    if (result.kind === 'wav') applyWavData(result.data);
    else                       applyImportData(result.data);
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
  if (!patches || !Array.isArray(patches.banks) || patches.banks.length < 2) {
    console.error('No patch data to export');
    return;
  }
  const result = await window.api.tapeLoad(patches);
  if (result && result.saved) {
    console.log('Loaded (exported) tape dump WAV to', result.path);
  } else if (result && result.error) {
    console.error('Load (export) error:', result.error);
  }
}

// ── Sequencer mode ─────────────────────────────────────────────────────
// Bruce's `jx3p` tool decodes/encodes patch banks only — sequencer WAV
// support isn't there. For now, "save" captures the currently active patch
// as a library Sequence entry (the killer-feature pairing); the actual
// sequence-audio data is left null until upstream codec support exists.
// "Load" navigates the user to Library > Sequences to pick one.
function handleSequencerSave() {
  const patch = currentPatch();
  if (!patch) {
    console.warn('No active patch to pair with a sequence entry');
    return;
  }
  showConfirmModal({
    title: 'Save active patch as a Sequence entry?',
    body:
      'Sequence audio data isn\'t yet supported by the patch tool, so this will save ' +
      'a Sequence entry that bookmarks the currently selected patch only. Loading the ' +
      'entry later will restore that patch.\n\n' +
      'When sequencer codec support is added, this same entry can carry the actual ' +
      'sequence audio alongside the paired patch.',
    confirmLabel: 'Save Sequence',
    onConfirm: () => saveSequenceEntry(),
  });
}

function saveSequenceEntry() {
  if (!library) return;
  const now = new Date();
  const entry = {
    id: now.toISOString(),
    defaultName: sequenceDefaultName(now),
    customName: '',
    savedAt: now.toISOString(),
    pairedPatch: {
      bank: selBank === 'L' ? 'C' : selBank,
      slot: selSlot,
      params: JSON.parse(JSON.stringify(currentPatch() || {})),
    },
    sequenceData: null,
  };
  if (!Array.isArray(library.sequences)) library.sequences = [];
  library.sequences.unshift(entry);
  saveLibraryDebounced();

  // Navigate to Library tab. Sub-tab handling lands when the Library
  // Tones/Sequences UI is built; for now the sequence is persisted and the
  // user lands on the Library list.
  selBank = 'L';
  selSlot = 0;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.bank === 'L');
  });
  renderPatchList();
}

function handleSequencerLoad() {
  selBank = 'L';
  selSlot = 0;
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

async function init() {
  patches = await window.api.loadPatches();
  library = await window.api.loadLibrary();

  if (!patches) {
    document.getElementById('patch-list').innerHTML =
      '<div class="library-placeholder">Could not load patches.json from Desktop.</div>';
    return;
  }

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
