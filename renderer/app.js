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
    const idx = steps.indexOf(value);
    if (idx < 0) return -140;
    return steps.length < 2 ? 0 : -140 + (idx / (steps.length - 1)) * 280;
  }
  const v = Math.max(0, Math.min(255, typeof value === 'number' ? value : 0));
  return -140 + (v / 255) * 280;
}

// Walk the SVG, tag each indicator <line> with data-param and the
// knob center, and normalise endpoints to "straight up at 12 noon"
// so that a CSS-style rotate transform maps cleanly to value angle.
function tagKnobs(svg) {
  KNOB_REGISTRY.forEach(({ circleCx, circleCy, gTranslate, param }) => {
    let line = null;
    let cx, cy;
    if (gTranslate !== undefined) {
      const g = svg.querySelector(`g[transform="translate(${gTranslate})"]`);
      if (!g) return;
      // Indicator line is the only line[stroke="#ddd"] inside the group.
      line = g.querySelector('line[stroke="#ddd"]');
      cx = 0; cy = 0;
    } else {
      const circle = svg.querySelector(`circle[cx="${circleCx}"][cy="${circleCy}"]`);
      if (!circle) return;
      let s = circle.nextElementSibling;
      while (s && !(s.tagName.toLowerCase() === 'line' && s.getAttribute('stroke') === '#ddd')) {
        s = s.nextElementSibling;
      }
      line = s;
      cx = circleCx; cy = circleCy;
    }
    if (!line) return;
    // Normalise endpoints: keep their distances from (cx,cy), point straight up.
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
  updateKnobs(currentPatch());
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
    updateKnobs(currentPatch());
    console.log(`Loaded ${result.kind} from`, result.path);
  } catch (err) {
    console.error('Failed to apply loaded data:', err.message);
  }
}

// Locate the SVG button rects by their unique x,y attribute combination
// (Save at x=814 y=240, Load at x=940 y=240) and wire click handlers.
function wireTapeButtons(svgEl) {
  const saveRect = svgEl.querySelector('rect[x="814"][y="328"][width="58"]');
  const loadRect = svgEl.querySelector('rect[x="940"][y="328"][width="58"]');

  [[saveRect, handleTapeSave], [loadRect, handleTapeLoad]].forEach(([r, fn]) => {
    if (!r) return;
    r.style.cursor = 'pointer';
    r.addEventListener('click', fn);
  });
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
        updateKnobs(currentPatch());
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
    tagKnobs(svgEl);
    wireTapeButtons(svgEl);
  }

  setupTabs();
  renderPatchList();
  selectPatch(0);
}

document.addEventListener('DOMContentLoaded', init);
