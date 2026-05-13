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

// Knob registry: maps a SVG locator → patch param.
// `gTranslate` matches `<g transform="translate(X,Y)">` (line lives at local 0,0).
// `circleCx/Cy` matches a top-row knob body whose indicator line is the next sibling.
const KNOB_REGISTRY = [
  // DCO-1 + DCO-2 (top row, parent group <g transform="translate(0,24)">)
  { circleCx: 70,  circleCy: 84,  param: 'dco1_range' },
  { circleCx: 70,  circleCy: 196, param: 'dco1_waveform' },
  { circleCx: 218, circleCy: 84,  param: 'dco2_range' },
  { circleCx: 368, circleCy: 84,  param: 'dco2_tune' },
  { circleCx: 218, circleCy: 196, param: 'dco2_waveform' },
  { circleCx: 368, circleCy: 196, param: 'dco2_fine_tune' },
  { circleCx: 218, circleCy: 295, param: 'dco2_crossmod' },
  // DCO mod (wrapped in own translate groups)
  { gTranslate: '65,390',  param: 'dco_lfo_amount' },
  { gTranslate: '218,390', param: 'dco_env_amount' },
  // VCF / VCA (wrapped, parent group <g transform="translate(430,24)">)
  { gTranslate: '55,58',   param: 'vcf_mix' },
  { gTranslate: '140,58',  param: 'vcf_hpf' },
  { gTranslate: '55,166',  param: 'vcf_cutoff' },
  { gTranslate: '140,166', param: 'vcf_resonance' },
  { gTranslate: '261,166', param: 'vca_level' },
  { gTranslate: '55,274',  param: 'vcf_lfo_mod' },
  { gTranslate: '140,274', param: 'vcf_env_mod' },
  { gTranslate: '55,386',  param: 'vcf_pitch_follow' },
  // Bottom row LFO + Envelope
  { circleCx: 55,  circleCy: 545, param: 'lfo_waveform' },
  { gTranslate: '165,545', param: 'lfo_delay' },
  { gTranslate: '300,545', param: 'lfo_rate' },
  { gTranslate: '420,545', param: 'env_attack' },
  { gTranslate: '490,545', param: 'env_decay' },
  { gTranslate: '560,545', param: 'env_sustain' },
  { gTranslate: '630,545', param: 'env_release' },
];

// Switch registry. Body rect identifies each switch; segment rects (the
// coloured stripes) are siblings immediately following the body.
//   - tri-binary   : 3 segments (top/mid/bot), boolean param. true→top, false→bot
//   - tri-enum     : 3 segments, enum param.   vals[0]→top, vals[1]→bot
//   - duo-enum     : 2 gold segments (top/bot), enum param. vals[0]→top
const SWITCH_REGISTRY = [
  { type: 'tri-binary', param: 'dco1_fmod_lfo',     bodySel: 'rect[x="30"][y="260"]' },
  { type: 'tri-binary', param: 'dco1_fmod_env',     bodySel: 'rect[x="74"][y="260"]' },
  { type: 'tri-binary', param: 'dco2_fmod_lfo',     bodySel: 'rect[x="346"][y="260"]' },
  { type: 'tri-binary', param: 'dco2_fmod_env',     bodySel: 'rect[x="390"][y="260"]' },
  { type: 'tri-enum',   param: 'vca_mode', vals: ['env', 'gate'],
    bodySel: 'rect[x="248"][y="35"]' },
  { type: 'tri-binary', param: 'chorus',            bodySel: 'rect[x="248"][y="363"]' },
  { type: 'tri-enum',   param: 'dco_env_polarity', vals: ['pos', 'neg'],
    bodySel: 'rect[x="367"][y="370"]' },
  { type: 'tri-enum',   param: 'vcf_env_polarity', vals: ['pos', 'neg'],
    bodySel: 'rect[x="126"][y="358"]' },
];

// Tape Memory + Manual/Write hardware buttons.
// `id` is the internal identifier; `bodySel` finds the button rect; LED rect
// is the next-sibling small <rect> after the body.
const BUTTON_REGISTRY = [
  { id: 'save',   color: '#cc2222', bodySel: 'rect[x="814"][y="358"][width="58"]' },
  { id: 'load',   color: '#44aa44', bodySel: 'rect[x="940"][y="358"][width="58"]' },
  { id: 'manual', color: '#cc2222', bodySel: 'rect[x="690"][y="516"][width="58"]' },
  { id: 'write',  color: '#44aa44', bodySel: 'rect[x="768"][y="516"][width="58"]' },
];

const LED_OFF = '#333';

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

let patches  = null;
let library  = null;
let selBank  = 'C';
let selSlot  = 0;
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

// Walk the SVG, tag each indicator <line> with data-param and the
// knob center, and normalise endpoints to "straight up at 12 noon"
// so that a CSS-style rotate transform maps cleanly to value angle.
function tagKnobs(svg) {
  const SVGNS = 'http://www.w3.org/2000/svg';
  KNOB_REGISTRY.forEach(({ circleCx, circleCy, gTranslate, param }) => {
    let line = null, body = null, parent = null;
    let cx, cy;
    if (gTranslate !== undefined) {
      const g = svg.querySelector(`g[transform="translate(${gTranslate})"]`);
      if (!g) return;
      line = g.querySelector('line[stroke="#ddd"]');
      body = g.querySelector('circle[fill="#2a2a2a"]');
      cx = 0; cy = 0;
      parent = g;
    } else {
      body = svg.querySelector(`circle[cx="${circleCx}"][cy="${circleCy}"]`);
      if (!body) return;
      let s = body.nextElementSibling;
      while (s && !(s.tagName.toLowerCase() === 'line' && s.getAttribute('stroke') === '#ddd')) {
        s = s.nextElementSibling;
      }
      line = s;
      cx = circleCx; cy = circleCy;
      parent = body.parentNode;
    }
    if (!line || !body) return;

    // Normalise indicator endpoints: keep their distances from the centre,
    // but point them straight up so a transform="rotate(angle)" maps cleanly.
    const x1 = parseFloat(line.getAttribute('x1'));
    const y1 = parseFloat(line.getAttribute('y1'));
    const x2 = parseFloat(line.getAttribute('x2'));
    const y2 = parseFloat(line.getAttribute('y2'));
    const r1 = Math.hypot(x1 - cx, y1 - cy);
    const r2 = Math.hypot(x2 - cx, y2 - cy);
    line.setAttribute('x1', cx);
    line.setAttribute('y1', (cy - r1).toFixed(2));
    line.setAttribute('x2', cx);
    line.setAttribute('y2', (cy - r2).toFixed(2));
    line.dataset.param = param;
    line.dataset.cx = String(cx);
    line.dataset.cy = String(cy);

    // Add a transparent hit-target circle slightly larger than the body, so
    // clicks anywhere on/near the knob start a drag.
    const bodyR = parseFloat(body.getAttribute('r')) || 18;
    const overlay = document.createElementNS(SVGNS, 'circle');
    overlay.setAttribute('cx', String(cx));
    overlay.setAttribute('cy', String(cy));
    overlay.setAttribute('r', String(bodyR + 6));
    overlay.setAttribute('fill', 'transparent');
    overlay.dataset.control = 'knob';
    overlay.dataset.param = param;
    overlay.dataset.cx = String(cx);
    overlay.dataset.cy = String(cy);
    overlay.style.cursor = SNAP_ANGLES[param] ? 'pointer' : 'ns-resize';
    parent.appendChild(overlay);
  });
}

function updateKnobs(patch) {
  if (!patch) return;
  document.querySelectorAll('line[data-param]').forEach((line) => {
    const param = line.dataset.param;
    if (!(param in patch)) return;
    const angle = paramToAngle(param, patch[param]);
    const cx = line.dataset.cx;
    const cy = line.dataset.cy;
    line.setAttribute('transform', `rotate(${angle.toFixed(1)} ${cx} ${cy})`);
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
    // LED is the next-sibling small rect (height === 6).
    let s = body.nextElementSibling;
    while (s && !(s.tagName.toLowerCase() === 'rect' && s.getAttribute('height') === '6')) {
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
    dragState.line.setAttribute(
      'transform',
      `rotate(${angle.toFixed(1)} ${dragState.cx} ${dragState.cy})`,
    );
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
        const line = svg.querySelector(`line[data-param="${param}"]`);
        if (!line) return;
        dragState = {
          line,
          param,
          startY: e.clientY,
          startAngle: paramToAngle(param, patch[param]),
          cx: ctrl.dataset.cx,
          cy: ctrl.dataset.cy,
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
      // Trigger the button's action only if mouseup happened on the same button.
      const ctrl = findControl(e.target);
      const onSame = ctrl && ctrl.dataset.control === 'button' && ctrl.dataset.buttonId === downBtnId;
      if (onSame) {
        if (downBtnId === 'save') handleTapeSave();
        else if (downBtnId === 'load') handleTapeLoad();
        // Manual / Write: visual-only for now.
      }
      downBtnId = null;
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Patch list
// ═══════════════════════════════════════════════════════════════

function renderPatchList() {
  const list = document.getElementById('patch-list');
  list.innerHTML = '';

  if (selBank === 'L') {
    const ph = document.createElement('div');
    ph.className = 'library-placeholder';
    ph.textContent = 'Library management coming in a future version.';
    list.appendChild(ph);
    return;
  }

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

async function handleTapeSave() {
  const result = await window.api.tapeSave(buildExportData());
  if (result && result.saved) {
    console.log('Saved patch library to', result.path);
  }
}

async function handleTapeLoad() {
  const result = await window.api.tapeLoad();
  if (!result || !result.loaded) {
    if (result && result.error) console.error('Load error:', result.error);
    return;
  }
  try {
    if (result.kind === 'wav') applyWavData(result.data);
    else                       applyImportData(result.data);
    saveLibraryDebounced();
    renderPatchList();
    updateSvgPatchName();
    updateAllControls(currentPatch());
    console.log(`Loaded ${result.kind} from`, result.path);
  } catch (err) {
    console.error('Failed to apply loaded data:', err.message);
  }
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
  renderPatchList();
  selectPatch(0);
}

document.addEventListener('DOMContentLoaded', init);
