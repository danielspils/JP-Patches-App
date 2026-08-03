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
  IL: 'Israel', IR: 'Iran', IQ: 'Iraq', SG: 'Singapore', HK: 'Hong Kong',
  HU: 'Hungary', RO: 'Romania', TH: 'Thailand', ID: 'Indonesia',
  PH: 'Philippines', VN: 'Vietnam', MY: 'Malaysia', EE: 'Estonia',
  LT: 'Lithuania', LV: 'Latvia', SK: 'Slovakia', SI: 'Slovenia',
  HR: 'Croatia', RS: 'Serbia', BG: 'Bulgaria', IS: 'Iceland',
  LU: 'Luxembourg', XX: 'Unknown',
};

// Resolve an ISO 3166-1 alpha-2 code to a full English name via Intl (the CI
// runner has full ICU), so ANY code lands — not just the hand-listed ones (IQ
// slipped through the map). XX is our own "unknown country" sentinel. Falls
// back to the manual map, then the raw code, if Intl is missing or doesn't
// recognise the code.
const REGION_NAMES = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); }
  catch { return null; }
})();

export function countryName(code) {
  if (code === 'XX') return 'Unknown';
  if (REGION_NAMES) {
    try {
      const name = REGION_NAMES.of(code);
      if (name && name !== code) return name;
    } catch { /* invalid code → fall through */ }
  }
  return COUNTRY_NAMES[code] || code;
}

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

// ── lending-library borrow bookkeeping ────────────────────────────────
// Structurally identical to the site-click math above, but the platform
// axis is the borrow KIND (patches / sequences) instead of mac / pc, and a
// third `unknown` bucket catches borrows from app versions that predate the
// kind-tagged /borrow call — so the total never silently undercounts while
// that field rolls out to installs in the wild. This is a SEPARATE metric:
// borrows are lending-library files taken from the site or the app, never
// GitHub app downloads, and are never netted against them (same firewall the
// site-clicks block keeps). Same snapshot-subtract-for-an-exact-window and
// accumulate-lifetime-past-the-Worker's-90-day-expiry design as diffSite.
export const BORROW_KINDS = ['patches', 'sequences', 'unknown'];

const kinds = (v) => ({
  patches: Number(v?.patches) || 0,
  sequences: Number(v?.sequences) || 0,
  unknown: Number(v?.unknown) || 0,
});
const kindSum = (v) => v.patches + v.sequences + v.unknown;

function subCountryKinds(cur = {}, prev = {}) {
  const out = {};
  for (const [cc, v] of Object.entries(cur)) {
    const c = kinds(v);
    const p = kinds(prev[cc]);
    const d = {
      patches: pos(c.patches - p.patches),
      sequences: pos(c.sequences - p.sequences),
      unknown: pos(c.unknown - p.unknown),
    };
    if (kindSum(d) > 0) out[cc] = d;
  }
  return out;
}

function addCountryKinds(a = {}, b = {}) {
  const out = {};
  for (const cc of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[cc] = {
      patches: kinds(a[cc]).patches + kinds(b[cc]).patches,
      sequences: kinds(a[cc]).sequences + kinds(b[cc]).sequences,
      unknown: kinds(a[cc]).unknown + kinds(b[cc]).unknown,
    };
  }
  return out;
}

// The borrow twin of diffSite — see that function's comment for the why of
// snapshot-subtraction and the accumulated lifetime. Same shapes:
//   prevLib   — snapshot.library from the last report (null on the first run)
//   cur       — GET /borrow/stats
//   fallback  — GET /borrow/stats?since=…  (seeds the first window only)
export function diffLibrary(prevLib, cur, fallback) {
  const curT = kinds(cur?.totals);
  const curC = cur?.byCountry || {};
  const seen = prevLib?.seen;

  const window = seen
    ? { exact: true,
        patches: pos(curT.patches - kinds(seen).patches),
        sequences: pos(curT.sequences - kinds(seen).sequences),
        unknown: pos(curT.unknown - kinds(seen).unknown),
        byCountry: subCountryKinds(curC, prevLib.byCountry) }
    : { exact: false, ...kinds(fallback?.totals), byCountry: fallback?.byCountry || {} };

  const lifetime = prevLib?.lifetime
    ? { patches: kinds(prevLib.lifetime).patches + window.patches,
        sequences: kinds(prevLib.lifetime).sequences + window.sequences,
        unknown: kinds(prevLib.lifetime).unknown + window.unknown,
        byCountry: addCountryKinds(prevLib.lifetimeByCountry, window.byCountry) }
    : { ...curT, byCountry: curC };

  return {
    window,
    lifetime,
    nextLibrary: {
      seen: curT,
      byCountry: curC,
      lifetime: { patches: lifetime.patches, sequences: lifetime.sequences, unknown: lifetime.unknown },
      lifetimeByCountry: lifetime.byCountry,
    },
  };
}

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

// "NEW BY COUNTRY" table: one country per line, three space-aligned columns —
// "Country N", "Mac n", "PC n". The first column is at least LABEL_W wide, so
// the Mac column lands on the same column (19) as the metric-block values above
// and the lifetime counts below. A platform with no clicks leaves its cell
// blank (the next column stays put).
function countryTableSplit(byCountry) {
  const rows = countryRows(byCountry);
  if (!rows.length) return [`${INDENT}none`];
  const c1 = rows.map((r) => `${r.name} ${r.t}`);
  const w1 = Math.max(LABEL_W, Math.max(...c1.map((s) => s.length)) + 2);
  const macCells = rows.map((r) => (r.mac > 0 ? `Mac ${r.mac}` : ''));
  const w2 = Math.max(...macCells.map((s) => s.length)) + 3;
  return rows.map((r, i) => {
    const pc = r.pc > 0 ? `PC ${r.pc}` : '';
    return (INDENT + c1[i].padEnd(w1) + macCells[i].padEnd(w2) + pc).replace(/\s+$/, '');
  });
}

// "LIFETIME BY COUNTRY" table: country then a single count. The name field is
// at least LABEL_W wide so the count sits in the same value column (19) as the
// Mac/PC figures elsewhere.
function countryTableCount(byCountry) {
  const rows = countryRows(byCountry);
  if (!rows.length) return [`${INDENT}none`];
  const w = Math.max(LABEL_W, Math.max(...rows.map((r) => r.name.length)) + 2);
  return rows.map((r) => INDENT + r.name.padEnd(w) + r.t);
}

// Borrow country table: one total per country (patches + sequences + unknown
// summed — the block never splits borrows by kind in the by-country view, to
// stay tight). Same single-count column layout as countryTableCount above.
function borrowCountryTable(byCountry) {
  const rows = Object.entries(byCountry || {})
    .map(([cc, v]) => ({ name: countryName(cc), t: kindSum(kinds(v)) }))
    .filter((x) => x.t > 0)
    .sort((a, b) => (b.t - a.t) || a.name.localeCompare(b.name));
  if (!rows.length) return [`${INDENT}none`];
  const w = Math.max(LABEL_W, Math.max(...rows.map((r) => r.name.length)) + 2);
  return rows.map((r) => INDENT + r.name.padEnd(w) + r.t);
}

// Rows for a borrow metricBlock. Patches/Sequences are always shown; the
// `unknown` bucket (borrows from app builds that predate the kind tag) only
// appears while it is non-zero, so the block stays clean once installs update.
function borrowRows(counts, delta) {
  const c = kinds(counts);
  const rows = [
    { label: 'Patches', n: c.patches, delta },
    { label: 'Sequences', n: c.sequences, delta },
  ];
  if (c.unknown > 0) rows.push({ label: 'Older app', n: c.unknown, delta });
  return rows;
}

// model:
//   prevDate   — last report's date; "" on the first-ever send
//   daysSince  — whole days since the last report (null on the first send).
//                Because the email only fires on activity, "last report" IS
//                "last new downloads", so the heading's span is literally true.
//   delta:    { macNew, macUpd, pcNew }              GitHub deltas this window
//   lifetime: { macNew, macUpd, pcNew }              GitHub cumulative
//   site:     null when the Worker is unreachable, else
//             { week: byCountry, lifetime: {byCountry} } — raw button clicks:
//             `week` is the rolling last-7-days query, `lifetime` the
//             accumulated all-time counters. Their own blocks, never netted
//             against downloads.
//   library:  null when the Worker is unreachable, else
//             { window: {patches, sequences, unknown, byCountry},
//               lifetime: {patches, sequences, unknown} } — lending-library
//             borrows (site + app), their OWN separate metric, never netted
//             against the GitHub download counts above.
export function renderBody(model) {
  const { prevDate, daysSince, delta, lifetime, site, library } = model;
  const weekClicks = site ? site.week : null;
  const lifeClicks = site ? site.lifetime.byCountry : null;

  const out = [];
  // The top block is GitHub's counted downloads since the last report — the
  // real activity, no click numbers near it. The by-country blocks below use
  // DIFFERENT, explicitly-labelled windows (rolling 7 days / all time): geo
  // only exists for site clicks, and GitHub's counter lags by hours, so a
  // same-window click column would routinely disagree with this block and
  // invite a reconciliation that can't hold. Distinct windows, no comparison.
  const sinceLabel = prevDate
    ? ` SINCE LAST REPORT (${daysSince} day${daysSince === 1 ? '' : 's'} ago)`
    : '';

  out.push(...metricBlock(`NEW DOWNLOADS${sinceLabel}`, [
    { label: 'Mac', n: delta.macNew, delta: true },
    { label: 'PC', n: delta.pcNew, delta: true },
  ]));
  out.push('');

  // Rolling 7 calendar days of site clicks, straight from the Worker's
  // day-granular keys — no snapshot baseline, and overlap between consecutive
  // emails is fine because the label says exactly what the window is.
  out.push('DOWNLOADS BY COUNTRY — LAST 7 DAYS');
  out.push(...(weekClicks ? countryTableSplit(weekClicks) : [`${INDENT}none`]));
  out.push('');

  out.push('DOWNLOADS BY COUNTRY — TOTAL');
  out.push(...(lifeClicks ? countryTableCount(lifeClicks) : [`${INDENT}none`]));
  // The country lines are jx-3p.com clicks; GitHub's total is larger because
  // most downloads never touch a site button. Show that remainder as a single
  // "Direct" residual so the block reconciles to the download total. Only when
  // positive — over all time, downloads ≫ clicks; a click isn't a 1:1
  // download, so a negative residual would be meaningless (never shown).
  const clickSum = lifeClicks
    ? Object.values(lifeClicks).reduce((s, v) => s + plat(v).mac + plat(v).pc, 0)
    : 0;
  const direct = (lifetime.macNew + lifetime.pcNew) - clickSum;
  if (lifeClicks && direct > 0) {
    out.push(`${INDENT}Direct from GitHub (no jx-3p.com click)   ${direct}`);
  }
  out.push('');

  out.push(...metricBlock('TOTAL DOWNLOADS', [
    { label: 'Mac', n: lifetime.macNew, delta: false },
    { label: 'PC', n: lifetime.pcNew, delta: false },
  ]));
  out.push('');

  // Mac auto-updates appear only when this window HAD one — they're rare, and
  // a quiet +0 block is noise next to the always-moving download sections.
  if (delta.macUpd > 0) {
    out.push(...metricBlock('MAC UPDATES', [
      { label: 'New', n: delta.macUpd, delta: true },
      { label: 'Lifetime', n: lifetime.macUpd, delta: false },
    ]));
    out.push('');
  }

  // Lending-library borrows — a SEPARATE metric from the downloads above (a
  // borrow is a shared C/D bank or sequence taken from the site or the app,
  // not an app install). Borrows are rare, so the WHOLE section appears only
  // when there was a borrow in this window — a download-only report stays
  // uncluttered. (A borrow also triggers a send, so any borrow day surfaces.)
  const wb = library ? kinds(library.window) : null;
  const hasBorrows = wb ? wb.patches + wb.sequences + wb.unknown > 0 : false;
  if (hasBorrows) {
    out.push(...metricBlock('LIBRARY BORROWS YESTERDAY', borrowRows(library.window, true)));
    out.push('');

    out.push('LIBRARY BORROWS BY COUNTRY');
    out.push(...borrowCountryTable(library.window.byCountry));
    out.push('');

    out.push(...metricBlock('LIFETIME LIBRARY BORROWS', borrowRows(library.lifetime, false)));
    out.push('');
  }

  // Static — deliberately not templated. Bulleted; the middle two lines are
  // why the Country and Downloads numbers never tie out. The borrow lines only
  // join when the borrow section is shown (nothing to explain otherwise).
  out.push('HOW THIS IS COUNTED');
  out.push('  • Country = button clicks via jx-3p.com');
  out.push('  • Downloads = a file served via GitHub.');
  out.push('  • Therefore, Country & Downloads metrics will never match.');
  out.push('  • PC has no auto-updater yet.');
  if (hasBorrows) {
    out.push('  • Borrows = a lending-library file taken via jx-3p.com or the app.');
    out.push('  • Borrows are their own metric — not part of the downloads above.');
  }

  return out.join('\n') + '\n';
}

// The GoatCounter dashboard — the durable, graphed history the daily email
// can't show. Linked from the 5th bullet of HOW THIS IS COUNTED. Only the
// word "GoatCounter" is the link.
export const GOATCOUNTER_URL = 'https://jx-3p.goatcounter.com';
const CTA_PREFIX = 'Historical metrics at ';
const CTA_LINK = 'GoatCounter';

// The plain-text 5th bullet: the phrase plus the URL, since plain text can't
// hyperlink (the URL auto-links in most clients). Appended by the driver.
export function ctaBullet() {
  return `  • ${CTA_PREFIX}${CTA_LINK}: ${GOATCOUNTER_URL}`;
}

// The HTML alternative part: the report, HTML-escaped (& < > only, & first)
// and dropped verbatim into one inline-styled <pre> — no reflow, no markdown,
// no <head>/<style> (clients strip those), no <div>/<table>/<br>. The one
// exception is the CTA bullet appended last: an inline <a> around "GoatCounter"
// (inline elements are fine inside <pre>), so only that word links and no raw
// URL shows. charset=utf-8 keeps the "·" separator intact.
export function htmlBody(report) {
  const escaped = String(report)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const cta = `  • ${CTA_PREFIX}<a href="${GOATCOUNTER_URL}">${CTA_LINK}</a>\n`;
  return `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace; font-size: 13px; line-height: 1.45; white-space: pre; margin: 0;">${escaped}${cta}</pre>`;
}

// One append-only history row per report, for charting downloads over time.
// The daily snapshot is overwritten each run (single point); this accumulates.
// Flat keys so it drops straight into a spreadsheet or plotting tool: the
// `d_*` fields are that report's NEW counts, the bare fields are the running
// cumulative totals. `date` is the report's UTC day (YYYY-MM-DD). Returns a
// single compact JSON line WITHOUT a trailing newline (the caller adds it).
// `borrow` is optional: when the report has library data it carries
// { window: {patches, sequences, unknown}, lifetime: {patches, sequences,
// unknown} } and the row gains d_borrow_*/borrow_* columns. Omitted (Worker
// unreachable, or callers that don't pass it) → the row is byte-for-byte the
// old download-only shape, so existing history stays consistent.
export function historyRow({ date, delta, lifetime, borrow }) {
  const row = {
    date,
    d_mac_new: delta.macNew, d_mac_upd: delta.macUpd, d_pc_new: delta.pcNew,
    mac_new: lifetime.macNew, mac_upd: lifetime.macUpd, pc_new: lifetime.pcNew,
  };
  if (borrow) {
    const w = kinds(borrow.window);
    const l = kinds(borrow.lifetime);
    row.d_borrow_patches = w.patches; row.d_borrow_sequences = w.sequences; row.d_borrow_unknown = w.unknown;
    row.borrow_patches = l.patches; row.borrow_sequences = l.sequences; row.borrow_unknown = l.unknown;
  }
  return JSON.stringify(row);
}
