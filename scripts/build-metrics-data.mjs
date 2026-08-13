// Snapshot the numbers the private metrics page (/metrics/) reads into one
// same-origin file, docs/metrics/data.json. Kept deliberately separate from
// the daily email logic (download-report.mjs) so the tested email path is
// untouched and the page has no dependency on the Worker being up at view time.
//
//   node scripts/build-metrics-data.mjs            # write docs/metrics/data.json
//   node scripts/build-metrics-data.mjs --dry-run  # print it, write nothing
//
// Sources:
//   - .github/download-history.jsonl  → the cumulative download series (curve)
//   - relay Worker /totals            → downloads-by-country, borrows, active
// Both are already public / already collected; this just assembles them.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const HISTORY = flag('history', '.github/download-history.jsonl');
const OUT = flag('out', 'docs/metrics/data.json');
const RELAY = flag('relay', 'https://lend.jx-3p.com');

// Cumulative download series from the append-only history. Each row already
// carries the running totals (mac_new / pc_new); we only surface date + totals.
let rows = [];
try {
  rows = readFileSync(HISTORY, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
} catch { /* no history yet → empty series */ }
const series = rows.map((r) => ({ date: r.date, mac: r.mac_new || 0, pc: r.pc_new || 0 }));
const last = rows[rows.length - 1] || {};

// Worker aggregates (best-effort — the page degrades to just the curve if the
// Worker is unreachable at build time).
async function relay(path) {
  try {
    const res = await fetch(`${RELAY}${path}`, { signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
const totals = await relay('/totals');
const ping = await relay('/ping/stats');
const byCountry = (totals && totals.downloads && totals.downloads.byCountry) || {};

// Per-preset window stats for the page's filter (7/30/90 days). The Worker's
// daily dl:/lb: keys retain 90 days, so these are exact for every preset the
// page offers; This year / All time fall back to the lifetime numbers client-
// side. Countries = distinct click-countries in the window; borrows = borrow
// events in the window. "Active" is deliberately NOT windowed: pings carry no
// identifier, so cross-day counts would double-count the same install.
const windows = {};
for (const days of [7, 30, 90]) {
  const since = new Date(Date.now() - days * 86_400_000)
    .toISOString().slice(0, 10).replace(/-/g, '');
  const dl = await relay(`/download/stats?since=${since}`);
  const lb = await relay(`/borrow/stats?since=${since}`);
  windows[days] = {
    countries: dl && dl.byCountry ? Object.keys(dl.byCountry).length : null,
    borrows: lb && typeof lb.total === 'number' ? lb.total
      : lb && lb.totals ? Object.values(lb.totals).reduce((a, b) => a + (Number(b) || 0), 0)
      : null,
  };
}

// Per-country and per-kind cumulative series for the page's alternate chart
// modes (click the Countries / Library borrows tiles). Built from the
// Worker's per-day series endpoints (dl:/lb: keys, 90-day retention — the
// whole tracked history for now). Cumulative running totals, same convention
// as the downloads curve. Countries are CLICK counts (mac+pc combined).
function cumulate(daysObj, valueOf) {
  const dates = Object.keys(daysObj || {}).sort();
  const keys = new Set();
  for (const d of dates) for (const k of Object.keys(daysObj[d])) keys.add(k);
  const out = { dates: dates.map((d) => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`), series: {} };
  for (const k of keys) {
    let run = 0;
    out.series[k] = dates.map((d) => { run += valueOf(daysObj[d][k]); return run; });
  }
  return out;
}
const dlSeries = await relay('/download/series');
const lbSeries = await relay('/borrow/series');
const countrySeries = dlSeries && dlSeries.days
  ? cumulate(dlSeries.days, (v) => v ? (v.mac || 0) + (v.pc || 0) : 0) : null;
const borrowSeries = lbSeries && lbSeries.days
  ? cumulate(lbSeries.days, (v) => Number(v) || 0) : null;

const data = {
  asOf: last.date || null,
  generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  downloads: { mac: last.mac_new || 0, pc: last.pc_new || 0, macUpd: last.mac_upd || 0 },
  series,
  byCountry,                                   // { ISO: clicks } — jx-3p.com button clicks
  windows,                                     // per-preset {countries, borrows} for 7/30/90d
  countrySeries,                               // cumulative clicks per country over time
  borrowSeries,                                // cumulative borrows per kind over time
  borrows: (totals && totals.library && totals.library.total) || 0,
  // Daily-active: the usage ping carries no identifier (privacy), so we can
  // count installs active on the most recent DAY but not dedupe across days
  // into a weekly/monthly unique. activeLatest = that most-recent day's count.
  activeToday: (ping && ping.activeLatest) || 0,
};

const json = `${JSON.stringify(data, null, 0)}\n`;
if (DRY) {
  process.stdout.write(json);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  process.stderr.write(`wrote ${OUT}: ${series.length} series points, `
    + `${Object.keys(byCountry).length} countries, as of ${data.asOf}\n`);
}
