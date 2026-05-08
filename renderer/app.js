'use strict';

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
    applyImportData(result.data);
    saveLibraryDebounced();
    renderPatchList();
    updateSvgPatchName();
    console.log('Loaded patch library from', result.path);
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
      if (selBank !== 'L') updateSvgPatchName();
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
    wireTapeButtons(svgEl);
  }

  setupTabs();
  renderPatchList();
  selectPatch(0);
}

document.addEventListener('DOMContentLoaded', init);
