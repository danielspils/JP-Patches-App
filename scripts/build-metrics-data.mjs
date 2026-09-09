// Snapshot the numbers the metrics page (/metrics/) reads into one same-origin
// file, docs/metrics/data.json. Kept deliberately separate from the daily email
// logic (download-report.mjs) so the tested email path is untouched.
//
//   node scripts/build-metrics-data.mjs            # write docs/metrics/data.json
//   node scripts/build-metrics-data.mjs --dry-run  # print it, write nothing
//
// SHARED SHAPE: this file and the Seven's (this-seven-goes-to-eleven) feed two
// pages that are meant to read as one thing — same sections, same field names:
//   generated              build timestamp
//   downloads.{mac,pc}     lifetime installer downloads (GitHub, installers only)
//   downloads.macUpd       lifetime Mac auto-updates (the separate .zip asset)
//   downloads.series       [{date, mac, pc, upd}] cumulative, flat to today
//   assets                 [{tag, name, count}] every release asset — the page
//                          filters to installers; shipping all of them keeps the
//                          filter (and its "no feed files" rule) in ONE place
//   presses                {total, mac, pc, byCountry} — download button presses
//   borrows                {total, byKind} — JP-only, a declared exception
//   active                 {total, byCountry} — ping fallback; "today" itself is
//                          only answerable live and the page reads it from the
//                          relay at view time
//
// PRESSES COME FROM THE EMAIL'S SNAPSHOT, NOT THE WORKER'S ROLLUPS. The daily
// report accumulates presses from the Worker's day-keys into
// .github/download-stats.json continuously since day one (2026-07-15); the
// monthly rollups started one day later and are permanently 4 presses short.
// The snapshot also outlives the day-keys' 90-day retention.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const HISTORY = flag('history', '.github/download-history.jsonl');
const SNAP = flag('snapshot', '.github/download-stats.json');
const OUT = flag('out', 'docs/metrics/data.json');
const RELAY = flag('relay', 'https://lend.jx-3p.com');
const REPO = flag('repo', 'danielspils/JP-Patches-App');

// ── Downloads: cumulative series from the append-only history ─────────
// Each row already carries the running totals; `upd` is the Mac auto-update
// counter (its own .zip asset — never part of mac/pc).
let rows = [];
try {
  rows = readFileSync(HISTORY, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
} catch { /* no history yet → empty series */ }
const series = rows.map((r) => ({
  date: r.date, mac: r.mac_new || 0, pc: r.pc_new || 0, upd: r.mac_upd || 0,
}));
const last = rows[rows.length - 1] || {};

// History rows only exist on report (download) days; extend the curve flat to
// TODAY so quiet days read as the zero-download days they were.
const todayIso = new Date().toISOString().slice(0, 10);
if (series.length && series[series.length - 1].date < todayIso) {
  series.push({ date: todayIso, mac: last.mac_new || 0, pc: last.pc_new || 0, upd: last.mac_upd || 0 });
}

// ── Presses + borrows: the email snapshot (see header) ────────────────
let snap = null;
try { snap = JSON.parse(readFileSync(SNAP, 'utf8')); } catch { /* no snapshot yet */ }
const plat = (v) => ({ mac: Number(v?.mac) || 0, pc: Number(v?.pc) || 0 });
let presses = null;
if (snap?.site?.lifetime) {
  const t = plat(snap.site.lifetime);
  const byCountry = {};
  for (const [cc, v] of Object.entries(snap.site.lifetimeByCountry || {})) {
    byCountry[cc] = plat(v).mac + plat(v).pc;
  }
  presses = { total: t.mac + t.pc, mac: t.mac, pc: t.pc, byCountry };
}
let borrows = null;
if (snap?.library?.lifetime) {
  const k = snap.library.lifetime;
  const byKind = {
    patches: Number(k.patches) || 0,
    sequences: Number(k.sequences) || 0,
    unknown: Number(k.unknown) || 0,
  };
  borrows = { total: byKind.patches + byKind.sequences + byKind.unknown, byKind };
}

// ── Assets: GitHub's per-release counters, for the version table ──────
// Best-effort with a previous-build fallback: a flaky API call shouldn't blank
// the table, and a stale count is labelled by the page's own "as of" line.
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
async function githubAssets() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'jp-patches-metrics-data',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`GitHub releases ${res.status}`);
    const rels = await res.json();
    for (const r of rels) {
      for (const a of r.assets || []) out.push({ tag: r.tag_name, name: a.name, count: a.download_count });
    }
    if (rels.length < 100) break;
  }
  return out;
}
let assets = null;
try {
  assets = await githubAssets();
} catch {
  try { assets = JSON.parse(readFileSync(OUT, 'utf8')).assets || null; } catch { /* first run */ }
}

// ── Active installs: /totals rollup as the page's ping FALLBACK ───────
// "Active today" itself is read live by the page (a day-old file can't answer
// "today"); this is the lifetime by-country detail when the relay is up at
// build time but down at view time. Best-effort — null degrades gracefully.
let active = null;
try {
  const res = await fetch(`${RELAY}/totals`, { signal: AbortSignal.timeout(10_000) });
  if (res.ok) {
    const t = await res.json();
    if (t?.active) active = { total: t.active.total || 0, byCountry: t.active.byCountry || {} };
  }
} catch { /* relay unreachable → page states it */ }

const data = {
  generated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  downloads: { mac: last.mac_new || 0, pc: last.pc_new || 0, macUpd: last.mac_upd || 0, series },
  assets,
  presses,
  borrows,
  active,
};

const json = `${JSON.stringify(data, null, 0)}\n`;
if (DRY) {
  process.stdout.write(json);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  process.stderr.write(`wrote ${OUT}: ${series.length} series points, `
    + `${assets ? assets.length : 'NO'} assets, presses ${presses ? presses.total : 'none'}, `
    + `borrows ${borrows ? borrows.total : 'none'}\n`);
}
