// Pure logic for the daily download report (scripts/download-report.mjs,
// driven by .github/workflows/download-report.yml). No I/O, no env, no
// fetch — everything here is deterministic on its inputs, which is what
// makes it unit-testable (test/download-report-lib.test.js). The script
// keeps the side-effectful half: GitHub API, the relay Worker, the
// snapshot file, GITHUB_OUTPUT.
//
// Two independent measurements meet in this file and they do NOT agree:
//
//   1. GitHub's per-asset download_count — the real download numbers, but
//      cumulative-only and with no geography at all.
//   2. The relay Worker's KV counters — one bump per download-BUTTON click
//      on jx-3p.com, with a Cloudflare-resolved country.
//
// (1) is the source of truth for "how many downloads". (2) is the only
// source of "from where". "via GitHub" is derived by subtracting (2) from
// (1), so it is an ESTIMATE: a click that never finishes downloading, or a
// download GitHub dedupes, lands in the gap. See splitCounts.

// Only count releases at or after v0.8.0 — when the site + lending library
// went live and JP Patches became public. Everything older is dominated by
// crawlers and dev-testing (v0.5.4-and-earlier was ~83% of the raw count),
// and those bots still hit the old assets, so the cutoff keeps phantom
// deltas out of the daily email too.
export const MIN_VER = 800;              // major*10000 + minor*100 + patch

export const COUNTRY_NAMES = {
  US: 'United States', GB: 'United Kingdom', DE: 'Germany', JP: 'Japan',
  CA: 'Canada', AU: 'Australia', FR: 'France', NL: 'Netherlands',
  SE: 'Sweden', IT: 'Italy', ES: 'Spain', BR: 'Brazil', MX: 'Mexico',
  PL: 'Poland', NO: 'Norway', DK: 'Denmark', FI: 'Finland', BE: 'Belgium',
  CH: 'Switzerland', AT: 'Austria', IE: 'Ireland', NZ: 'New Zealand',
  RU: 'Russia', UA: 'Ukraine', CZ: 'Czechia', PT: 'Portugal', GR: 'Greece',
  TR: 'Turkey', IN: 'India', CN: 'China', KR: 'South Korea', TW: 'Taiwan',
  AR: 'Argentina', CL: 'Chile', CO: 'Colombia', ZA: 'South Africa',
  IL: 'Israel', IR: 'Iran', SG: 'Singapore', HK: 'Hong Kong',
  HU: 'Hungary', RO: 'Romania', TH: 'Thailand', ID: 'Indonesia',
  PH: 'Philippines', VN: 'Vietnam', MY: 'Malaysia', EE: 'Estonia',
  LT: 'Lithuania', LV: 'Latvia', SK: 'Slovakia', SI: 'Slovenia',
  HR: 'Croatia', RS: 'Serbia', BG: 'Bulgaria', IS: 'Iceland',
  LU: 'Luxembourg', XX: 'Unknown',
};

export const countryName = (code) => COUNTRY_NAMES[code] || code;

// ── GitHub asset tallies ──────────────────────────────────────────────

// "v0.8.8-win-preview" → 808. Pre-release suffixes are stripped so a
// -win-preview tag sorts with its release.
export function versionKey(tag) {
  const [maj = 0, min = 0, pat = 0] = String(tag)
    .replace(/^v/, '').replace(/-.*$/, '').split('.').map(Number);
  return (maj || 0) * 10000 + (min || 0) * 100 + (pat || 0);
}

// rows: [{ tag, name, count }] — one per release asset.
export function tallyAssets(rows, re, minVer = MIN_VER) {
  return rows.reduce((sum, r) => (
    versionKey(r.tag) >= minVer && re.test(String(r.name).toLowerCase())
      ? sum + (Number(r.count) || 0)
      : sum
  ), 0);
}

export const ASSET_RE = {
  macNew: /\.dmg$/,
  macUpd: /mac.*\.zip$/,
  pcNew: /\.exe$/,
};

// ── site-click bookkeeping ────────────────────────────────────────────

const pos = (n) => (n > 0 ? n : 0);
const plat = (v) => ({ mac: Number(v?.mac) || 0, pc: Number(v?.pc) || 0 });

function subCountry(cur = {}, prev = {}) {
  const out = {};
  for (const [cc, v] of Object.entries(cur)) {
    const d = { mac: pos(plat(v).mac - plat(prev[cc]).mac), pc: pos(plat(v).pc - plat(prev[cc]).pc) };
    if (d.mac + d.pc > 0) out[cc] = d;
  }
  return out;
}

function addCountry(a = {}, b = {}) {
  const out = {};
  for (const cc of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[cc] = { mac: plat(a[cc]).mac + plat(b[cc]).mac, pc: plat(a[cc]).pc + plat(b[cc]).pc };
  }
  return out;
}

// Work out this report's site-click window and the running lifetime.
//
// Why not just ask the Worker for "?since=<last report day>": its keys are
// day-granular, so a same-day previous report gets counted twice. Instead
// we snapshot the Worker's own cumulative counters and subtract — exactly
// how the GitHub side already works, and precise to the report, not the day.
//
// The lifetime figure is ACCUMULATED rather than read: the Worker's dl:
// keys expire after 90 days, so its cumulative total silently shrinks over
// time. Adding each window's delta to the stored lifetime survives that.
//
//   prevSite  — snapshot.site from the last report (null on the first run)
//   cur       — GET /download/stats          (everything still retained)
//   fallback  — GET /download/stats?since=…  (only used to seed the very
//               first window, where there is no baseline to subtract)
export function diffSite(prevSite, cur, fallback) {
  const curT = plat(cur?.totals);
  const curC = cur?.byCountry || {};
  const seen = prevSite?.seen;

  // `exact` is false only on the seeding run, where there is no stored
  // baseline and the day-granular ?since= query is all we have — it
  // re-counts everything that happened earlier on the day of the last
  // report. The report suppresses the since-last-report split in that
  // case rather than printing a number it can't stand behind.
  const window = seen
    ? { exact: true,
        mac: pos(curT.mac - plat(seen).mac),
        pc: pos(curT.pc - plat(seen).pc),
        byCountry: subCountry(curC, prevSite.byCountry) }
    : { exact: false, ...plat(fallback?.totals), byCountry: fallback?.byCountry || {} };

  const lifetime = prevSite?.lifetime
    ? { mac: plat(prevSite.lifetime).mac + window.mac,
        pc: plat(prevSite.lifetime).pc + window.pc,
        byCountry: addCountry(prevSite.lifetimeByCountry, window.byCountry) }
    : { ...curT, byCountry: curC };

  return {
    window,
    lifetime,
    nextSite: {
      seen: curT,
      byCountry: curC,
      lifetime: { mac: lifetime.mac, pc: lifetime.pc },
      lifetimeByCountry: lifetime.byCountry,
    },
  };
}

// Download counts (GitHub) and button clicks (the Worker) are two separate
// measurements that are NOT subtracted from or capped against each other.
// A click is a rough interest signal, not a verified download — nothing here
// links a specific click to a completed download, because no such data
// exists (the Worker only redirects; GitHub exposes a cumulative count with
// no per-download events). So clicks get their own block and downloads come
// straight from tallyAssets. See the report template for the two-block shape.

// ── formatting ────────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// "2026-06-12T01:14:12Z" → "Jun 12, 2026". UTC throughout — the workflow
// runs on GitHub's clock, not Daniel's.
export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

const INDENT = '  ';
const LABEL_W = 17;              // labels padded so values start at column 19

// A titled block of "label   value" rows, values in one column. A "+" marks a
// since-window delta; a bare figure sharing a block with deltas reserves that
// sign column with a leading space, so the digits still line up under them.
function metricBlock(title, rows) {
  const anyDelta = rows.some((r) => r.delta);
  const token = (r) => (r.delta ? `+${r.n}` : `${anyDelta ? ' ' : ''}${r.n}`);
  const width = Math.max(...rows.map((r) => token(r).length));
  const lines = [title];
  for (const r of rows) {
    lines.push((INDENT + r.label.padEnd(LABEL_W) + token(r).padEnd(width)).replace(/\s+$/, ''));
  }
  return lines;
}

// Country rows, sorted by count desc then full name. Each: { name, mac, pc, t }.
function countryRows(byCountry) {
  return Object.entries(byCountry || {})
    .map(([cc, v]) => ({ name: countryName(cc), mac: plat(v).mac, pc: plat(v).pc, t: plat(v).mac + plat(v).pc }))
    .filter((x) => x.t > 0)
    .sort((a, b) => (b.t - a.t) || a.name.localeCompare(b.name));
}

// "NEW — BY COUNTRY" table: one country per line, three space-aligned
// columns — "Country N", "Mac n", "PC n" — so it scans down cleanly. A
// platform with no clicks leaves its cell blank (the next column stays put).
function countryTableSplit(byCountry) {
  const rows = countryRows(byCountry);
  if (!rows.length) return [`${INDENT}none`];
  const c1 = rows.map((r) => `${r.name} ${r.t}`);
  const w1 = Math.max(...c1.map((s) => s.length)) + 2;
  const macCells = rows.map((r) => (r.mac > 0 ? `Mac ${r.mac}` : ''));
  const w2 = Math.max(...macCells.map((s) => s.length)) + 3;
  return rows.map((r, i) => {
    const pc = r.pc > 0 ? `PC ${r.pc}` : '';
    return (INDENT + c1[i].padEnd(w1) + macCells[i].padEnd(w2) + pc).replace(/\s+$/, '');
  });
}

// "LIFETIME — BY COUNTRY" table: country then a single count, aligned.
function countryTableCount(byCountry) {
  const rows = countryRows(byCountry);
  if (!rows.length) return [`${INDENT}none`];
  const w = Math.max(...rows.map((r) => r.name.length)) + 2;
  return rows.map((r) => INDENT + r.name.padEnd(w) + r.t);
}

// model:
//   prevDate   — last report's date; "" on the first-ever send
//   daysSince  — whole days since the last report (null on the first send).
//                Because the email only fires on activity, "last report" IS
//                "last new downloads", so the intro line is literally true.
//   delta:    { macNew, macUpd, pcNew }              GitHub deltas this window
//   lifetime: { macNew, macUpd, pcNew }              GitHub cumulative
//   site:     null when the Worker is unreachable, else
//             { window: {byCountry}, lifetime: {byCountry} } — raw button
//             clicks. Reported as their own block, never netted against
//             downloads.
export function renderBody(model) {
  const { prevDate, daysSince, delta, lifetime, site } = model;
  const winClicks = site ? site.window.byCountry : null;
  const lifeClicks = site ? site.lifetime.byCountry : null;

  const out = [];
  // The job runs just after midnight UTC and flushes each active day the next
  // morning, so a report covers yesterday; daysSince is how long since the last
  // NON-EMPTY day (the last report).
  out.push(prevDate
    ? `Your last report was ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`
    : 'Your first download report.');
  out.push('');

  out.push(...metricBlock('NEW DOWNLOADS YESTERDAY', [
    { label: 'Mac', n: delta.macNew, delta: true },
    { label: 'PC', n: delta.pcNew, delta: true },
  ]));
  out.push('');

  out.push(...metricBlock('MAC UPDATES', [
    { label: 'New', n: delta.macUpd, delta: true },
    { label: 'Lifetime', n: lifetime.macUpd, delta: false },
  ]));
  out.push('');

  out.push('NEW BY COUNTRY (via jx-3p.com)');
  out.push(...(winClicks ? countryTableSplit(winClicks) : [`${INDENT}none`]));
  out.push('');

  out.push('LIFETIME BY COUNTRY (via jx-3p.com)');
  out.push(...(lifeClicks ? countryTableCount(lifeClicks) : [`${INDENT}none`]));
  out.push('');

  out.push(...metricBlock('LIFETIME DOWNLOADS', [
    { label: 'Mac', n: lifetime.macNew, delta: false },
    { label: 'PC', n: lifetime.pcNew, delta: false },
  ]));
  out.push('');

  // Static — deliberately not templated. Explains why the by-country counts
  // (button clicks) won't add up to the download totals above.
  out.push('HOW THIS IS COUNTED');
  out.push('  Downloads are counted by GitHub when a file is served. Country is');
  out.push('  only known for jx-3p.com button clicks — a rough interest signal,');
  out.push('  not downloads, so those counts won\'t match the download totals.');
  out.push('  PC has no auto-updater yet.');

  return out.join('\n') + '\n';
}

// The HTML alternative part: the SAME body, HTML-escaped (& < > only, & first)
// and dropped verbatim into one inline-styled <pre>. No reflow, no markdown,
// no <head>/<style> (clients strip those), no <div>/<table>/<br> — the body's
// own newlines are the line breaks. charset=utf-8 (set on the mail part) keeps
// the "·" separator intact.
export function htmlBody(body) {
  const escaped = String(body)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace; font-size: 13px; line-height: 1.45; white-space: pre; margin: 0;">${escaped}</pre>`;
}
