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
  LU: 'Luxembourg', T1: 'Tor network', XX: 'Unknown',
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

// "17 Aug" for the header, "17 Aug 2026" where the year earns its place —
// shared wording with the Seven's email. One deliberate difference from its
// code: timeZone is pinned to UTC (the Seven formats in runner-local time;
// JP's test suite has always required UTC so a report cut near midnight
// doesn't name the wrong day). Fixed locale: this is one person's daily
// email, and en-GB puts the day first.
export function formatDate(iso, { year = false } = {}) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC', ...(year ? { year: 'numeric' } : {}),
  });
}

const INDENT = '  ';
const LABEL_W = 6;
// Where a header's figure ends, so every section total shares one column. It
// was 38 until the press sections arrived: "STARTED FROM THE WEBSITE — LAST 7
// DAYS" is 38 characters on its own, so its figure fell off the end and sat
// one space after the words while every other total lined up without it. A
// column that one row opts out of is not a column. Widened rather than
// shortening the heading, because the headings are shared with the Seven's
// email word for word.
const LINE_W = 44;

// THE SECTION TOTAL LIVES ON THE HEADER, right-aligned. Mac and PC underneath
// are the breakdown; the number you read first should not be one you have to
// add up yourself every morning.
function header(title, n) {
  const figure = String(n);
  return title + ' '.repeat(Math.max(1, LINE_W - title.length - figure.length)) + figure;
}

function row(label, n, note) {
  return (INDENT + label.padEnd(LABEL_W) + String(n) + (note ? `   (${note})` : ''))
    .replace(/\s+$/, '');
}

// Country rows, biggest first, then alphabetically so two equal counts have a
// stable order rather than whatever the relay's key listing happened to give.
// A row that counts nothing is dropped: a country appears because somebody
// there pressed a button.
function countryRows(byCountry) {
  return Object.entries(byCountry || {})
    .map(([cc, v]) => {
      const o = (v && typeof v === 'object') ? v : { total: Number(v) || 0 };
      const mac = Number(o.mac) || 0;
      const pc = Number(o.pc) || 0;
      return { name: countryName(cc), mac, pc, total: Number(o.total) || mac + pc };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));
}

// LAST 7 DAYS: "United States 3   Mac 2   PC 1". The platform cells are blank
// when that platform had none, so the columns stay put and an all-Mac country
// does not print "PC 0" — a zero nobody needs to read.
function countryTableSplit(byCountry) {
  const rows = countryRows(byCountry);
  if (!rows.length) return [`${INDENT}none`];
  const first = rows.map((r) => `${r.name} ${r.total}`);
  const w1 = Math.max(LABEL_W, Math.max(...first.map((s) => s.length)) + 2);
  const macCells = rows.map((r) => (r.mac > 0 ? `Mac ${r.mac}` : ''));
  const w2 = Math.max(...macCells.map((s) => s.length)) + 3;
  return rows.map((r, i) => (
    INDENT + first[i].padEnd(w1) + macCells[i].padEnd(w2) + (r.pc > 0 ? `PC ${r.pc}` : '')
  ).replace(/\s+$/, ''));
}

// TOTAL: country then one count.
function countryTableCount(byCountry) {
  const rows = countryRows(byCountry);
  if (!rows.length) return [`${INDENT}none`];
  const w = Math.max(LABEL_W, Math.max(...rows.map((r) => r.name.length)) + 2);
  return rows.map((r) => INDENT + r.name.padEnd(w) + r.total);
}

// WHAT POPULATION A PRESS TABLE COUNTS, under its own heading. Two
// country-ish numbers from two sources read as one number contradicting
// itself unless each says who it counts.
const PRESS_POP = `${INDENT}(download button presses on the site — includes presses that never finished)`;

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

// Rows for a borrow block. Patches/Sequences are always shown; the
// `unknown` bucket (borrows from app builds that predate the kind tag) only
// appears while it is non-zero, so the block stays clean once installs update.
function borrowRows(counts) {
  // Borrow labels outgrow LABEL_W ("Sequences" is 9 chars), so they carry
  // their own pad — 11 keeps at least two spaces before every count.
  const c = kinds(counts);
  const line = (label, n) => (INDENT + label.padEnd(11) + n);
  const lines = [line('Patches', c.patches), line('Sequences', c.sequences)];
  if (c.unknown > 0) lines.push(line('Older app', c.unknown));
  return lines;
}

// model:
//   prevDate  — ISO timestamp of the last report; "" on the first-ever send.
//               Because the email only fires on activity, "since <date>" is
//               literally "since the last new downloads".
//   delta:    { macNew, macUpd, pcNew }              GitHub deltas this window
//   lifetime: { macNew, macUpd, pcNew }              GitHub cumulative
//   site:     null when the Worker is unreachable, else
//             { week, window, lifetime: {byCountry}, stale? } — raw button
//             presses. Their own blocks, never netted against downloads.
//   library:  null when the Worker is unreachable, else
//             { window: {patches, sequences, unknown, byCountry},
//               lifetime: {patches, sequences, unknown} } — lending-library
//             borrows, their OWN separate metric.
//
// SECTION ORDER IS SHARED WITH the Seven's email, same words in the same
// order, so one person reading both every morning reads one format twice
// rather than two formats. JP's two DECLARED differences: the library-borrow
// blocks (no counterpart on the Seven) and the two footer CTA links appended
// after HOW THIS IS COUNTED; a difference that is written down is not drift.
//
//   1  ALL DOWNLOADS SINCE <date>
//   2  ALL DOWNLOADS, LIFETIME
//   3  MAC AUTO-UPDATES                    only when there was activity
//   4  STARTED FROM THE WEBSITE — LAST 7 DAYS
//   5  STARTED FROM THE WEBSITE — TOTAL
//   6  library borrows                     JP only, the declared exception
//   7  HOW THIS IS COUNTED
//
// NEVER call the relay number "downloads". It counts presses, not
// completions. Never sum, difference or percentage the two.
export function renderBody(model) {
  const { prevDate, delta, lifetime, site, library } = model;
  const sections = [];
  const sinceLabel = prevDate ? ` SINCE ${formatDate(prevDate).toUpperCase()}` : '';

  // Press countries for this window, appended as a parenthetical on the
  // matching delta line, e.g. "Mac   1   (United States)". A rough "where
  // from" signal, not an attribution — presses and downloads are different
  // events and may not line up 1:1. JP-local detail; the Seven's rows carry
  // an off-latest-version note here instead.
  const clickNote = (p) => {
    if (!site || !site.window) return '';
    return countryRows(site.window)
      .filter((r) => r[p] > 0)
      .sort((a, b) => (b[p] - a[p]) || a.name.localeCompare(b.name))
      .map((r) => r.name).join(', ');
  };

  sections.push([
    header(`ALL DOWNLOADS${sinceLabel}`, delta.macNew + delta.pcNew),
    '',
    row('Mac', delta.macNew, delta.macNew > 0 ? clickNote('mac') : ''),
    row('PC', delta.pcNew, delta.pcNew > 0 ? clickNote('pc') : ''),
  ]);

  sections.push([
    header('ALL DOWNLOADS, LIFETIME', lifetime.macNew + lifetime.pcNew),
    '',
    row('Mac', lifetime.macNew),
    row('PC', lifetime.pcNew),
  ]);

  // Only when there were some: a permanent "0" beside numbers that actually
  // move is noise, and auto-updates are rare. The count sits on the header
  // like every other section.
  if (delta.macUpd > 0) {
    sections.push([header('MAC AUTO-UPDATES', delta.macUpd)]);
  }

  // ── THE RELAY'S HALF ──────────────────────────────────────────────
  // A HEADER FIGURE IS A CLAIM, so an unread source gets an em dash and not
  // a zero. Zero means the relay answered and nobody pressed anything;
  // anything else says so in words.
  const weekClicks = site ? site.week : null;
  const weekTotal = weekClicks
    ? countryRows(weekClicks).reduce((n, r) => n + r.total, 0)
    : null;
  const weekBlock = [header('STARTED FROM THE WEBSITE — LAST 7 DAYS', weekTotal ?? '—'), PRESS_POP];
  weekBlock.push(...(weekClicks ? countryTableSplit(weekClicks) : [`${INDENT}none`]));
  sections.push(weekBlock);

  // stale = the live press fetch failed and these totals come from the last
  // report's snapshot. The notice leads so the number underneath is never
  // mistaken for a current one.
  const lifeClicks = site ? site.lifetime.byCountry : null;
  const lifeRows = lifeClicks ? countryRows(lifeClicks) : null;
  const lifeBlock = [
    header('STARTED FROM THE WEBSITE — TOTAL',
      lifeRows ? lifeRows.reduce((n, r) => n + r.total, 0) : '—'),
    PRESS_POP,
  ];
  if (site && site.stale) {
    lifeBlock.push(`${INDENT}(live press data unavailable — totals below are from the last report)`);
  }
  lifeBlock.push(...(lifeRows && lifeRows.length ? countryTableCount(lifeClicks) : [`${INDENT}none`]));
  sections.push(lifeBlock);

  // ── LIBRARY BORROWS — JP only, the declared exception ─────────────
  // Rare, so the whole trio appears only when this window had a borrow (a
  // borrow also triggers a send, so any borrow day surfaces). Headers carry
  // right-aligned totals like every other section.
  const wb = library ? kinds(library.window) : null;
  const hasBorrows = wb ? wb.patches + wb.sequences + wb.unknown > 0 : false;
  if (hasBorrows) {
    const lb = kinds(library.lifetime);
    sections.push([
      header('NEW LIBRARY BORROWS', kindSum(wb)),
      '',
      ...borrowRows(library.window),
    ]);
    sections.push([
      header('LIBRARY BORROWS BY COUNTRY', kindSum(wb)),
      ...borrowCountryTable(library.window.byCountry),
    ]);
    sections.push([
      header('TOTAL LIBRARY BORROWS', kindSum(lb)),
      '',
      ...borrowRows(library.lifetime),
    ]);
  }

  // TWO LINES, shared with the Seven verbatim. The long bullet list explained
  // answers to questions nobody asks daily; what survives is the one caveat
  // that changes how a number is READ. The press population lines above make
  // this footer possible at this length. Daniel's wording; do not expand it.
  sections.push([
    'HOW THIS IS COUNTED',
    '',
    '    Mac counts new downloads',
    "    PC combines new downloads + updates (GitHub can't distinguish)",
  ]);

  return `${sections.map((sec) => sec.join('\n')).join('\n\n')}\n`;
}

// Footer CTA bullets — the durable, graphed history the daily email can't
// show. Two lines: the site's own metrics page first, then the GoatCounter
// dashboard. A DECLARED exception to the shared format (like the borrow
// blocks): the Seven's email ends at HOW THIS IS COUNTED and JP's carries
// these two links after it — Daniel asked for them back (2026-09-24), and a
// difference that is written down is not drift.
export const METRICS_URL = 'https://jx-3p.com/metrics';
export const GOATCOUNTER_URL = 'https://jx-3p.goatcounter.com';
const CTAS = [
  { prefix: 'Historical metrics at ', link: 'JX-3P.com/metrics', url: METRICS_URL },
  { prefix: 'more metrics: ', link: 'GoatCounter', url: GOATCOUNTER_URL },
];

export function ctaBullet() {
  return CTAS.map((c) => `  • ${c.prefix}${c.link}: ${c.url}`).join('\n');
}

// The HTML half of the multipart email: the same text, escaped, in one
// inline-styled <pre>. No reflow and no markdown — the alignment above IS the
// layout. The one exception is the CTA bullets appended last: an inline <a>
// around each link text (inline elements are fine inside <pre>), so only
// those words link and no raw URL shows.
export function htmlBody(report) {
  const escaped = String(report)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const cta = CTAS.map((c) => `  • ${c.prefix}<a href="${c.url}">${c.link}</a>`).join('\n') + '\n';
  return `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace; font-size: 13px; line-height: 1.45; white-space: pre; margin: 0;">${escaped}${cta}</pre>`;
}

// ── daily press archive ───────────────────────────────────────────────
// The Worker's dl: day keys expire after 90 days; the dlm: monthly rollups
// are permanent but lose day resolution. This file keeps the daily detail:
// .github/press-history.jsonl, one line per UTC day —
//   {"date":"2026-07-15","countries":{"US":{"mac":1,"pc":0}}}
// merge(existing lines, /download/series days, today) returns the lines to
// write plus how many days were added. Idempotent and self-healing: every
// run appends any COMPLETE day (before today UTC) that KV still holds and
// the file lacks, so the first run is the backfill and a missed cron
// repairs itself from KV's 90-day buffer. A day already in the file is
// never rewritten (append-only history), and today is never written — it
// is still accruing, and freezing a partial day would archive a wrong one.
export function mergePressHistory(lines, seriesDays, todayKey) {
  const rows = (lines || [])
    .filter(Boolean)
    .map((l) => (typeof l === 'string' ? JSON.parse(l) : l));
  const have = new Set(rows.map((r) => r.date));
  let added = 0;
  for (const day of Object.keys(seriesDays || {}).sort()) {
    if (day >= todayKey) continue;                 // still accruing
    const date = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
    if (have.has(date)) continue;
    const countries = {};
    for (const [cc, v] of Object.entries(seriesDays[day] || {})) {
      const mac = Number(v?.mac) || 0;
      const pc = Number(v?.pc) || 0;
      if (mac + pc > 0) countries[cc] = { mac, pc };
    }
    if (!Object.keys(countries).length) continue;  // an all-zero day earns no line
    rows.push({ date, countries });
    added += 1;
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { lines: rows.map((r) => JSON.stringify(r)), added };
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
