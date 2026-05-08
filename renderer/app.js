'use strict';

// ═══════════════════════════════════════════════════════════════
// Discrete parameter value tables (mirrors jx3p/patch.py)
// ═══════════════════════════════════════════════════════════════

const DISCRETE = {
  dco1_range:    ["16'", "8'", "4'"],
  dco1_waveform: ["saw", "pulse", "square"],
  dco2_range:    ["16'", "8'", "4'"],
  dco2_waveform: ["saw", "pulse", "square", "noise"],
  dco2_crossmod: ["off", "sync", "metal"],
  lfo_waveform:  ["sine", "square", "random", "fast random"],
};

// ═══════════════════════════════════════════════════════════════
// App state
// ═══════════════════════════════════════════════════════════════

let patches  = null;   // { banks: [[16 patches], [16 patches]] }
let library  = null;   // { version, names: { 'C1': 'Warm Pad', ... } }
let selBank  = 'C';    // 'C' | 'D' | 'L'
let selSlot  = 0;      // 0-15
let saveTimer = null;

// Map from param name → updater function: (value) => void
const updaters = {};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function bankIndex(bank) { return bank === 'D' ? 1 : 0; }

function slotKey(bank, slot) { return `${bank}${slot + 1}`; }

function patchName(bank, slot) {
  const key = slotKey(bank, slot);
  return (library && library.names && library.names[key]) || null;
}

function displayName(bank, slot) {
  return patchName(bank, slot) || `${bank}${slot + 1}`;
}

function currentPatch() {
  if (!patches || selBank === 'L') return null;
  return patches.banks[bankIndex(selBank)][selSlot];
}

// ═══════════════════════════════════════════════════════════════
// Knob SVG generation
// ═══════════════════════════════════════════════════════════════

let _uid = 0;

function paramToAngle(param, value) {
  const steps = DISCRETE[param];
  if (steps) {
    const idx = steps.indexOf(value);
    if (idx < 0) return -135;
    return steps.length < 2 ? 0 : -135 + (idx / (steps.length - 1)) * 270;
  }
  const v = Math.max(0, Math.min(255, typeof value === 'number' ? value : 0));
  return -135 + (v / 255) * 270;
}

function makeKnobSVG(angleDeg, size = 44) {
  const cx = size / 2, cy = size / 2;
  const r        = size * 0.365;
  const tickOuter = size * 0.477;
  const tickInner = tickOuter - 3.5;
  const indOuter  = r * 0.83;
  const indInner  = r * 0.20;

  const ticks = [];
  for (let a = -135; a <= 135; a += 45) {
    const rad = (a - 90) * Math.PI / 180;
    const x1 = (cx + Math.cos(rad) * tickInner).toFixed(2);
    const y1 = (cy + Math.sin(rad) * tickInner).toFixed(2);
    const x2 = (cx + Math.cos(rad) * tickOuter).toFixed(2);
    const y2 = (cy + Math.sin(rad) * tickOuter).toFixed(2);
    const major = a === -135 || a === 0 || a === 135;
    ticks.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
      `stroke="${major ? '#6a6a6a' : '#484848'}" stroke-width="${major ? 1.5 : 1}" stroke-linecap="round"/>`
    );
  }

  const rad = (angleDeg - 90) * Math.PI / 180;
  const ix1 = (cx + Math.cos(rad) * indInner).toFixed(2);
  const iy1 = (cy + Math.sin(rad) * indInner).toFixed(2);
  const ix2 = (cx + Math.cos(rad) * indOuter).toFixed(2);
  const iy2 = (cy + Math.sin(rad) * indOuter).toFixed(2);

  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ` +
    `xmlns="http://www.w3.org/2000/svg">` +
    ticks.join('') +
    `<circle cx="${cx}" cy="${cy}" r="${(r + 1.5).toFixed(1)}" fill="rgba(0,0,0,0.35)"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="url(#knob-chrome)" stroke="#1a1a1a" stroke-width="1"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="url(#knob-vignette)"/>` +
    `<line x1="${ix1}" y1="${iy1}" x2="${ix2}" y2="${iy2}" stroke="#f0f0f0" stroke-width="1.8" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="2.2" fill="#1c1c1c"/>` +
    `</svg>`
  );
}

// ═══════════════════════════════════════════════════════════════
// Control builders
// ═══════════════════════════════════════════════════════════════

function makeKnob(label, param) {
  const wrap = document.createElement('div');
  wrap.className = 'ctrl';
  wrap.dataset.param = param;

  const svgWrap = document.createElement('div');
  const lbl = document.createElement('div');
  lbl.className = 'ctrl-label';
  lbl.textContent = label;

  wrap.appendChild(svgWrap);
  wrap.appendChild(lbl);

  updaters[param] = (val) => {
    svgWrap.innerHTML = makeKnobSVG(paramToAngle(param, val));
  };
  updaters[param](0);   // initial render (angle = min)
  return wrap;
}

function makeSwitch(label, param) {
  const wrap = document.createElement('div');
  wrap.className = 'sw-ctrl';

  const btn = document.createElement('div');
  btn.className = 'sw-btn';

  const led = document.createElement('span');
  led.className = 'led red-led';
  btn.appendChild(led);

  const lbl = document.createElement('div');
  lbl.className = 'sw-label';
  lbl.textContent = label;

  wrap.appendChild(btn);
  wrap.appendChild(lbl);

  updaters[param] = (val) => {
    btn.classList.toggle('on', Boolean(val));
  };
  updaters[param](false);
  return wrap;
}

function makeToggle(label, param, options, displayLabels) {
  const labels = displayLabels || options.map(o => String(o));
  const wrap = document.createElement('div');
  wrap.className = 'toggle-ctrl';

  const group = document.createElement('div');
  group.className = 'toggle-group';

  const btns = options.map((opt, i) => {
    const b = document.createElement('div');
    b.className = 'toggle-opt';
    b.textContent = labels[i];
    group.appendChild(b);
    return b;
  });

  const lbl = document.createElement('div');
  lbl.className = 'toggle-label';
  lbl.textContent = label;

  wrap.appendChild(group);
  wrap.appendChild(lbl);

  updaters[param] = (val) => {
    btns.forEach((b, i) => b.classList.toggle('active', options[i] === val));
  };
  updaters[param](options[0]);
  return wrap;
}

function makeSep() {
  const s = document.createElement('div');
  s.style.cssText = 'width:1px;background:#333;align-self:stretch;margin:0 2px;flex-shrink:0';
  return s;
}

// ═══════════════════════════════════════════════════════════════
// Build PG-200 sections
// ═══════════════════════════════════════════════════════════════

function buildSections() {
  const dco1 = document.getElementById('body-dco1');
  dco1.appendChild(makeKnob("Range",    'dco1_range'));
  dco1.appendChild(makeKnob("Waveform", 'dco1_waveform'));
  dco1.appendChild(makeSep());
  dco1.appendChild(makeSwitch("LFO",    'dco1_fmod_lfo'));
  dco1.appendChild(makeSwitch("ENV",    'dco1_fmod_env'));

  const dco2 = document.getElementById('body-dco2');
  dco2.appendChild(makeKnob("Range",     'dco2_range'));
  dco2.appendChild(makeKnob("Waveform",  'dco2_waveform'));
  dco2.appendChild(makeKnob("Cross Mod", 'dco2_crossmod'));
  dco2.appendChild(makeKnob("Tune",      'dco2_tune'));
  dco2.appendChild(makeKnob("Fine Tune", 'dco2_fine_tune'));
  dco2.appendChild(makeSep());
  dco2.appendChild(makeSwitch("LFO",     'dco2_fmod_lfo'));
  dco2.appendChild(makeSwitch("ENV",     'dco2_fmod_env'));

  const dcomod = document.getElementById('body-dcomod');
  dcomod.appendChild(makeKnob("LFO Amt",  'dco_lfo_amount'));
  dcomod.appendChild(makeKnob("ENV Amt",  'dco_env_amount'));
  dcomod.appendChild(makeSep());
  dcomod.appendChild(makeToggle("ENV Pol", 'dco_env_polarity', ["neg", "pos"]));

  const vcf = document.getElementById('body-vcf');
  vcf.appendChild(makeKnob("Src Mix",    'vcf_mix'));
  vcf.appendChild(makeKnob("HPF",        'vcf_hpf'));
  vcf.appendChild(makeKnob("Cutoff",     'vcf_cutoff'));
  vcf.appendChild(makeKnob("Resonance",  'vcf_resonance'));
  vcf.appendChild(makeKnob("LFO Mod",   'vcf_lfo_mod'));
  vcf.appendChild(makeKnob("ENV Mod",   'vcf_env_mod'));
  vcf.appendChild(makeKnob("Pitch Flw", 'vcf_pitch_follow'));
  vcf.appendChild(makeSep());
  vcf.appendChild(makeToggle("ENV Pol",  'vcf_env_polarity', ["neg", "pos"]));

  const vca = document.getElementById('body-vca');
  vca.appendChild(makeToggle("Mode",    'vca_mode',  ["gate", "env"]));
  vca.appendChild(makeKnob("Level",     'vca_level'));
  vca.appendChild(makeSep());
  vca.appendChild(makeToggle("Chorus",  'chorus',    [false, true], ["Off", "On"]));

  const lfo = document.getElementById('body-lfo');
  lfo.appendChild(makeKnob("Waveform", 'lfo_waveform'));
  lfo.appendChild(makeKnob("Delay",    'lfo_delay'));
  lfo.appendChild(makeKnob("Rate",     'lfo_rate'));

  const env = document.getElementById('body-env');
  env.appendChild(makeKnob("Attack",   'env_attack'));
  env.appendChild(makeKnob("Decay",    'env_decay'));
  env.appendChild(makeKnob("Sustain",  'env_sustain'));
  env.appendChild(makeKnob("Release",  'env_release'));
}

// ═══════════════════════════════════════════════════════════════
// Patch list rendering
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
    item.dataset.slot = slot;

    const num = document.createElement('span');
    num.className = 'patch-number';
    num.textContent = key;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'patch-name-span' + (name ? '' : ' unnamed');
    nameSpan.textContent = name || `click to name`;
    nameSpan.dataset.slot = slot;

    const nameInput = document.createElement('input');
    nameInput.className = 'patch-name-edit';
    nameInput.type = 'text';
    nameInput.maxLength = 28;
    nameInput.spellcheck = false;
    nameInput.autocomplete = 'off';

    item.appendChild(num);
    item.appendChild(nameSpan);
    item.appendChild(nameInput);
    list.appendChild(item);

    item.addEventListener('click', (e) => {
      if (e.target === nameSpan && slot === selSlot) {
        startNameEdit(slot, nameSpan, nameInput);
        return;
      }
      selectPatch(slot);
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  commitName(slot, nameSpan, nameInput);
      if (e.key === 'Escape') cancelEdit(nameSpan, nameInput);
    });
    nameInput.addEventListener('blur', () => commitName(slot, nameSpan, nameInput));
  }
}

function selectPatch(slot) {
  selSlot = slot;
  renderPatchList();
  updatePG200();
  updateTopBar();
}

// ═══════════════════════════════════════════════════════════════
// PG-200 display update
// ═══════════════════════════════════════════════════════════════

function updatePG200() {
  const patch = currentPatch();
  if (!patch) return;
  Object.entries(updaters).forEach(([param, fn]) => {
    if (param in patch) fn(patch[param]);
  });
}

// ═══════════════════════════════════════════════════════════════
// Top-bar patch name
// ═══════════════════════════════════════════════════════════════

function updateTopBar() {
  if (selBank === 'L') return;
  const key  = slotKey(selBank, selSlot);
  const name = patchName(selBank, selSlot);
  const display = document.getElementById('patch-name-display-text');

  if (name) {
    display.textContent = `${key}: ${name}`;
    display.classList.remove('placeholder');
  } else {
    display.textContent = `${key}: click to name`;
    display.classList.add('placeholder');
  }
}

// ═══════════════════════════════════════════════════════════════
// Name editing
// ═══════════════════════════════════════════════════════════════

function startNameEdit(slot, nameSpan, nameInput) {
  const existing = patchName(selBank, slot) || '';
  nameSpan.style.display   = 'none';
  nameInput.style.display  = 'block';
  nameInput.value          = existing;
  nameInput.focus();
  nameInput.select();
}

function commitName(slot, nameSpan, nameInput) {
  if (nameInput.style.display === 'none') return;
  const val = nameInput.value.trim();
  const key = slotKey(selBank, slot);
  if (val) {
    library.names[key] = val;
  } else {
    delete library.names[key];
  }
  nameInput.style.display = 'none';
  nameSpan.style.display  = '';
  saveLibraryDebounced();
  renderPatchList();
  updateTopBar();
}

function cancelEdit(nameSpan, nameInput) {
  nameInput.style.display = 'none';
  nameSpan.style.display  = '';
}

// Top-bar parallelogram click → edit current patch name
function setupTopBarEdit() {
  const pill  = document.getElementById('patch-name-pill');
  const input = document.getElementById('patch-name-input');
  const disp  = document.getElementById('patch-name-display-text');

  pill.addEventListener('click', () => {
    if (selBank === 'L') return;
    if (input.style.display === 'block') return;
    const existing = patchName(selBank, selSlot) || '';
    disp.style.display  = 'none';
    input.style.display = 'block';
    input.value         = existing;
    input.focus();
    input.select();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        const key = slotKey(selBank, selSlot);
        if (val) {
          library.names[key] = val;
        } else {
          delete library.names[key];
        }
        saveLibraryDebounced();
      }
      input.style.display = 'none';
      disp.style.display  = '';
      renderPatchList();
      updateTopBar();
    }
  });

  input.addEventListener('blur', () => {
    if (input.style.display !== 'block') return;
    const val = input.value.trim();
    const key = slotKey(selBank, selSlot);
    if (val) {
      library.names[key] = val;
    } else {
      delete library.names[key];
    }
    input.style.display = 'none';
    disp.style.display  = '';
    saveLibraryDebounced();
    renderPatchList();
    updateTopBar();
  });
}

// ═══════════════════════════════════════════════════════════════
// Library persistence
// ═══════════════════════════════════════════════════════════════

function saveLibraryDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.api.saveLibrary(library), 500);
}

// ═══════════════════════════════════════════════════════════════
// Tab switching
// ═══════════════════════════════════════════════════════════════

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      selBank = tab.dataset.bank;
      selSlot = 0;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPatchList();
      updatePG200();
      updateTopBar();
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
      '<div class="library-placeholder">Could not load patches.json from Desktop.<br>Please check the file is in place.</div>';
    return;
  }

  buildSections();
  setupTabs();
  setupTopBarEdit();
  selectPatch(0);
}

document.addEventListener('DOMContentLoaded', init);
