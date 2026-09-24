'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for the daily download report's pure logic
// (scripts/download-report-lib.mjs).
//
// What's worth pinning here: the report mixes two measurements that don't
// agree — GitHub's per-asset counter (real downloads, no geography) and the
// relay Worker's button-click counters (geography, but a click isn't a
// download). The rules that keep the email honest about that gap are the
// ones tested: the >= v0.8.0 cutoff, the snapshot-subtraction that makes a
// window exact, the lifetime accumulator that survives the Worker's 90-day
// key expiry, and the cap that stops a split from printing a negative.
//
// The lib is ESM; this suite (like the rest of test/) is CJS — bridge via
// dynamic import resolved once and awaited inside each test.
//
// Run with:    node --test test/download-report-lib.test.js
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');

const libP = import('../scripts/download-report-lib.mjs');

// ── GitHub asset tallies ──────────────────────────────────────────────

test('versionKey strips the v and any pre-release suffix', async () => {
  const { versionKey } = await libP;
  assert.equal(versionKey('v0.8.0'), 800);
  assert.equal(versionKey('v0.8.8-win-preview'), 808);
  assert.equal(versionKey('v0.5.13'), 513);
  assert.equal(versionKey('v1.0.0'), 10000);
});

test('tallyAssets counts only matching assets at or after the cutoff', async () => {
  const { tallyAssets, ASSET_RE } = await libP;
  const rows = [
    { tag: 'v0.5.4', name: 'JP-Patches.dmg', count: 95 },   // pre-cutoff: crawlers
    { tag: 'v0.8.0', name: 'JP-Patches.dmg', count: 10 },
    { tag: 'v0.8.8', name: 'JP-Patches.dmg', count: 3 },
    { tag: 'v0.8.8', name: 'JP-Patches-mac.zip', count: 7 },
    { tag: 'v0.8.8-win-preview', name: 'JP-Patches-Setup.exe', count: 5 },
  ];
  assert.equal(tallyAssets(rows, ASSET_RE.macNew), 13);
  assert.equal(tallyAssets(rows, ASSET_RE.macUpd), 7);
  assert.equal(tallyAssets(rows, ASSET_RE.pcNew), 5);
});

// ── window + lifetime bookkeeping ─────────────────────────────────────

const stats = (mac, pc, byCountry = {}) => ({ totals: { mac, pc }, byCountry });

test('diffSite subtracts the stored baseline for an exact window', async () => {
  const { diffSite } = await libP;
  const prev = {
    seen: { mac: 5, pc: 6 },
    byCountry: { US: { mac: 3, pc: 1 }, SE: { mac: 2, pc: 2 } },
    lifetime: { mac: 5, pc: 6 },
    lifetimeByCountry: { US: { mac: 3, pc: 1 }, SE: { mac: 2, pc: 2 } },
  };
  const cur = stats(8, 8, { US: { mac: 4, pc: 2 }, SE: { mac: 2, pc: 2 }, CN: { mac: 1, pc: 1 } });
  const { window, lifetime } = diffSite(prev, cur, stats(99, 99));

  assert.equal(window.exact, true);
  assert.deepEqual({ mac: window.mac, pc: window.pc }, { mac: 3, pc: 2 });
  // Countries with no movement drop out of the since-last-report list.
  assert.deepEqual(window.byCountry, { US: { mac: 1, pc: 1 }, CN: { mac: 1, pc: 1 } });
  assert.deepEqual({ mac: lifetime.mac, pc: lifetime.pc }, { mac: 8, pc: 8 });
});

test('diffSite falls back to the ?since= window when there is no baseline', async () => {
  const { diffSite } = await libP;
  const cur = stats(8, 8, { US: { mac: 4, pc: 2 } });
  const { window, lifetime } = diffSite(null, cur, stats(7, 7, { US: { mac: 3, pc: 2 } }));

  // Day-granular, so it re-counts the last report's own day → not exact,
  // and renderBody suppresses the split rather than printing it.
  assert.equal(window.exact, false);
  assert.deepEqual({ mac: window.mac, pc: window.pc }, { mac: 7, pc: 7 });
  // Lifetime seeds from everything the Worker still holds.
  assert.deepEqual({ mac: lifetime.mac, pc: lifetime.pc }, { mac: 8, pc: 8 });
});

test('diffSite accumulates lifetime so the Worker 90-day expiry cannot shrink it', async () => {
  const { diffSite } = await libP;
  const prev = {
    seen: { mac: 40, pc: 30 },
    byCountry: { US: { mac: 40, pc: 30 } },
    lifetime: { mac: 100, pc: 90 },
    lifetimeByCountry: { US: { mac: 100, pc: 90 } },
  };
  // Old keys rolled off: the Worker now reports FEWER clicks than last time.
  const cur = stats(38, 31, { US: { mac: 38, pc: 31 } });
  const { window, lifetime, nextSite } = diffSite(prev, cur, stats(0, 0));

  assert.equal(window.mac, 0, 'a shrinking counter must not report a negative window');
  assert.equal(window.pc, 1);
  assert.deepEqual({ mac: lifetime.mac, pc: lifetime.pc }, { mac: 100, pc: 91 });
  // The next baseline is what the Worker says now, not the lifetime figure.
  assert.deepEqual(nextSite.seen, { mac: 38, pc: 31 });
  assert.deepEqual(nextSite.lifetime, { mac: 100, pc: 91 });
});

// ── rendering ─────────────────────────────────────────────────────────
//
// The template is column-precise (two-space indent), so most assertions pin
// exact whitespace. Downloads (GitHub) and the by-country breakdown (jx-3p.com
// button clicks) are separate — clicks are never netted against downloads.
// See scripts/download-report-lib.mjs.

// site.week is the rolling last-7-days byCountry (a plain map, no snapshot
// diffing); site.lifetime the accumulated all-time counters. prevDate is the
// RAW ISO timestamp of the last report (renderBody formats it).
const model = (over = {}) => ({
  prevDate: '2026-07-22T14:00:00Z',
  delta: { macNew: 6, macUpd: 1, pcNew: 4 },
  lifetime: { macNew: 41, macUpd: 23, pcNew: 19 },
  site: {
    week: { SE: { mac: 2, pc: 2 }, CN: { mac: 1, pc: 0 } },
    lifetime: { byCountry: { US: { mac: 6, pc: 4 }, SE: { mac: 3, pc: 5 } } },
  },
  ...over,
});

test('renderBody opens with ALL DOWNLOADS SINCE <date>, total right-aligned at column 44', async () => {
  const { renderBody } = await libP;
  // "ALL DOWNLOADS SINCE 22 JUL" (26) + spaces + "10" ends at column 44.
  assert.match(renderBody(model()), /^ALL DOWNLOADS SINCE 22 JUL {16}10\n/);
  // First-ever send has no prior report -> no window suffix, column kept.
  assert.match(renderBody(model({ prevDate: '' })), /^ALL DOWNLOADS {29}10\n/);
  assert.doesNotMatch(renderBody(model()), /NEW DOWNLOADS|days ago|YESTERDAY/);
});

test('renderBody download rows are bare counts under a blank line, no split, no plus signs', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());
  assert.match(body, /^ALL DOWNLOADS SINCE 22 JUL {16}10\n\n {2}Mac {3}6\n {2}PC {4}4\n/);
  assert.match(body, /\nALL DOWNLOADS, LIFETIME {19}60\n\n {2}Mac {3}41\n {2}PC {4}19\n/);
  assert.doesNotMatch(body, /\+\d|site \d|· GitHub/);
});

test('renderBody MAC AUTO-UPDATES is header-only, shown only when the window had one', async () => {
  const { renderBody } = await libP;
  assert.match(renderBody(model()), /\nMAC AUTO-UPDATES {27}1\n/);
  const quiet = renderBody(model({ delta: { macNew: 6, macUpd: 0, pcNew: 4 } }));
  assert.doesNotMatch(quiet, /MAC AUTO-UPDATES|MAC UPDATES/);
});

test('renderBody 7-day press table: header total, population line, 3 columns, zero platform omitted', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());
  // Heading is 38 chars; the total (SE 4 + CN 1 = 5) still ends at column 44.
  assert.match(body, /\nSTARTED FROM THE WEBSITE — LAST 7 DAYS {5}5\n {2}\(download button presses on the site — includes presses that never finished\)\n/);
  assert.match(body, /\n {2}Sweden 4 {2}Mac 2 {3}PC 2\n {2}China 1 {3}Mac 1\n/);
  assert.doesNotMatch(body, /PC 0/);
});

test('renderBody TOTAL press table: header total, population line, one count per country', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());
  assert.match(body, /\nSTARTED FROM THE WEBSITE — TOTAL {10}18\n {2}\(download button presses[^\n]*\n {2}United States {2}10\n {2}Sweden {9}8\n/);
});

test('renderBody sorts countries by count desc then full name', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model({
    site: {
      week: {},
      lifetime: { byCountry: { SG: { mac: 1, pc: 0 }, KR: { mac: 1, pc: 0 }, US: { mac: 5, pc: 0 } } },
    },
  }));
  const life = body.slice(body.indexOf('STARTED FROM THE WEBSITE — TOTAL'));
  assert.ok(life.indexOf('United States') < life.indexOf('Singapore'));
  assert.ok(life.indexOf('Singapore') < life.indexOf('South Korea'));
});

test('renderBody prints a ZERO header and "none" when the relay answered with an empty week', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model({
    site: { week: {}, lifetime: { byCountry: { US: { mac: 5, pc: 0 } } } },
  }));
  // The relay ANSWERED and had nothing: zero is earned, none is truthful.
  assert.match(body, /\nSTARTED FROM THE WEBSITE — LAST 7 DAYS {5}0\n {2}\(download button presses[^\n]*\n {2}none\n/);
});

test('renderBody prints an EM DASH, not 0, when the relay could not be read', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model({ site: null }));
  // Downloads still render (GitHub, not the Worker).
  assert.match(body, /^ {2}Mac {3}6$/m);
  assert.match(body, /^ {2}Mac {3}41$/m);
  // A header figure is a claim: an unread source is "—", never a zero.
  assert.match(body, /\nSTARTED FROM THE WEBSITE — LAST 7 DAYS {5}—\n {2}\(download button presses[^\n]*\n {2}none\n/);
  assert.match(body, /\nSTARTED FROM THE WEBSITE — TOTAL {11}—\n {2}\(download button presses[^\n]*\n {2}none\n/);
});

test('HOW THIS IS COUNTED is the shared two-line footer, verbatim, and ends the email', async () => {
  const { renderBody } = await libP;
  const footer = '\nHOW THIS IS COUNTED\n\n'
    + '    Mac counts new downloads\n'
    + "    PC combines new downloads + updates (GitHub can't distinguish)\n";
  assert.ok(renderBody(model()).endsWith(footer));
  assert.ok(renderBody(libModel()).endsWith(footer));
  assert.doesNotMatch(renderBody(model()), /• |bullets|goatcounter|metrics:/i);
});

test('renderBody never claims a per-line site/GitHub split', async () => {
  const { renderBody } = await libP;
  assert.doesNotMatch(renderBody(model()), /· GitHub|site \d|estimated/);
});

test('renderBody emits the shared section order (borrows between presses and the footer)', async () => {
  const { renderBody } = await libP;
  const body = renderBody(libModel());
  const order = [
    'ALL DOWNLOADS SINCE 22 JUL',
    'ALL DOWNLOADS, LIFETIME',
    'MAC AUTO-UPDATES',
    'STARTED FROM THE WEBSITE — LAST 7 DAYS',
    'STARTED FROM THE WEBSITE — TOTAL',
    'NEW LIBRARY BORROWS', 'LIBRARY BORROWS BY COUNTRY', 'TOTAL LIBRARY BORROWS',
    'HOW THIS IS COUNTED',
  ];
  let last = -1;
  for (const h of order) {
    const at = body.indexOf(h);
    assert.ok(at > last, `${h} missing or out of order`);
    last = at;
  }
});

test('countryName resolves any ISO code via Intl, XX -> Unknown, T1 -> Tor network', async () => {
  const { countryName } = await libP;
  assert.equal(countryName('IQ'), 'Iraq');
  assert.equal(countryName('US'), 'United States');
  assert.equal(countryName('CO'), 'Colombia');
  assert.equal(countryName('KR'), 'South Korea');
  assert.equal(countryName('XX'), 'Unknown');         // our own sentinel
  // Cloudflare's Tor-exit marker arrives shaped exactly like a country code;
  // Intl does not know it, so the manual map must.
  assert.equal(countryName('T1'), 'Tor network');
  assert.equal(countryName('zzz'), 'zzz');            // invalid -> raw code, no throw
});

test('the Direct-from-GitHub residual never renders (downloads minus presses is meaningless)', async () => {
  const { renderBody } = await libP;
  assert.doesNotMatch(renderBody(model()), /Direct from GitHub/);
  const body = renderBody(model({
    lifetime: { macNew: 1, macUpd: 0, pcNew: 0 },
    site: { week: {}, lifetime: { byCountry: { US: { mac: 5, pc: 5 } } } },
  }));
  assert.doesNotMatch(body, /Direct from GitHub/);
});

test('delta lines carry press countries only when delta > 0 and presses exist', async () => {
  const { renderBody } = await libP;
  const m = model();
  m.delta.macNew = 2; m.delta.pcNew = 0;
  m.site.window = { US: { mac: 2, pc: 0 }, SE: { mac: 1, pc: 3 } };
  const body = renderBody(m);
  assert.match(body, /\n {2}Mac {3}2 {3}\(United States, Sweden\)\n/);
  assert.match(body, /\n {2}PC {4}0\n/);
});

test('stale site: TOTAL renders the snapshot table + notice; 7-day header is an em dash', async () => {
  const { renderBody } = await libP;
  const m = model();
  m.site = {
    week: null,
    window: null,
    lifetime: { mac: 6, pc: 4, byCountry: { SE: { mac: 4, pc: 2 }, US: { mac: 2, pc: 2 } } },
    stale: true,
  };
  const body = renderBody(m);
  const total = body.slice(body.indexOf('STARTED FROM THE WEBSITE — TOTAL'));
  assert.match(total, /^STARTED FROM THE WEBSITE — TOTAL {10}10\n/);
  assert.match(total, /\n {2}\(live press data unavailable — totals below are from the last report\)\n/);
  assert.match(total, /Sweden {9}6/);
  assert.match(total, /United States {2}4/);
  assert.doesNotMatch(total, /Direct from GitHub/);
  // The rolling window has no snapshot equivalent — an unread window is a
  // dash over none, not a zero.
  assert.match(body, /STARTED FROM THE WEBSITE — LAST 7 DAYS {5}—\n {2}\(download button presses[^\n]*\n {2}none\n/);
});

test('historyRow is one flat JSON line: date, deltas (d_*), cumulative', async () => {
  const { historyRow } = await libP;
  const row = historyRow({
    date: '2026-07-27',
    delta: { macNew: 2, macUpd: 0, pcNew: 1 },
    lifetime: { macNew: 43, macUpd: 23, pcNew: 21 },
  });
  // No trailing newline (the caller adds it), and it round-trips.
  assert.doesNotMatch(row, /\n/);
  assert.deepEqual(JSON.parse(row), {
    date: '2026-07-27',
    d_mac_new: 2, d_mac_upd: 0, d_pc_new: 1,
    mac_new: 43, mac_upd: 23, pc_new: 21,
  });
});

test('htmlBody wraps the escaped report in one <pre> and appends the CTA anchors', async () => {
  const { htmlBody, METRICS_URL, GOATCOUNTER_URL } = await libP;
  const html = htmlBody('ALL DOWNLOADS\n  Mac   1 <&>');
  assert.ok(html.startsWith('<pre style='));
  assert.ok(html.endsWith('</pre>'));
  assert.match(html, /ALL DOWNLOADS\n {2}Mac {3}1 &lt;&amp;&gt;/);
  // The declared footer exception: two link bullets after the report, only
  // the link TEXT anchored, no raw URL visible.
  const cta = `  • Historical metrics at <a href="${METRICS_URL}">JX-3P.com/metrics</a>\n`
    + `  • more metrics: <a href="${GOATCOUNTER_URL}">GoatCounter</a>\n`;
  assert.ok(html.includes(cta));
});

test('ctaBullet: two plain footer bullets — site metrics page, then GoatCounter', async () => {
  const { ctaBullet, METRICS_URL, GOATCOUNTER_URL } = await libP;
  assert.equal(
    ctaBullet(),
    `  • Historical metrics at JX-3P.com/metrics: ${METRICS_URL}\n`
      + `  • more metrics: GoatCounter: ${GOATCOUNTER_URL}`
  );
});

test('htmlBody escapes & < > only in the report, leaving the · separator intact', async () => {
  const { htmlBody } = await libP;
  const html = htmlBody('a & b < c > d · e\n');
  assert.match(html, /a &amp; b &lt; c &gt; d · e/);
});

test('htmlBody escapes ampersand before the angle brackets', async () => {
  const { htmlBody } = await libP;
  // A literal < in the source must become &lt;, never double-escape to &amp;lt;.
  const html = htmlBody('x < y');
  assert.ok(html.includes('x &lt; y'));
  assert.ok(!html.includes('&amp;lt;'));
});

test('formatDate: shared day-first wording, pinned to UTC, optional year', async () => {
  const { formatDate } = await libP;
  assert.equal(formatDate('2026-06-12T01:14:12Z'), '12 Jun');
  // 00:10 UTC is still the previous day in every US timezone — this is the
  // line that fails if someone drops the timeZone pin (the Seven formats in
  // runner-local time; JP deliberately does not).
  assert.equal(formatDate('2026-07-23T00:10:00Z'), '23 Jul');
  assert.equal(formatDate('2026-06-12T01:14:12Z', { year: true }), '12 Jun 2026');
  assert.equal(formatDate('nonsense'), '');
});

// ── lending-library borrows ───────────────────────────────────────────
//
// diffLibrary is the borrow twin of diffSite — the platform axis is the
// borrow KIND (patches / sequences) plus an `unknown` bucket for borrows from
// app builds that predate the kind-tagged /borrow call. Same three rules pinned
// as for diffSite: exact window via snapshot-subtraction, lifetime accumulation
// past the Worker's 90-day expiry, and the non-negative clamp. Borrows are a
// SEPARATE metric — never subtracted from or capped against GitHub downloads.

const bstats = (patches, sequences, unknown = 0, byCountry = {}) =>
  ({ totals: { patches, sequences, unknown }, byCountry });

test('diffLibrary subtracts the stored baseline for an exact window', async () => {
  const { diffLibrary } = await libP;
  const prev = {
    seen: { patches: 5, sequences: 6, unknown: 0 },
    byCountry: { US: { patches: 3, sequences: 1 }, SE: { patches: 2, sequences: 2 } },
    lifetime: { patches: 5, sequences: 6, unknown: 0 },
    lifetimeByCountry: { US: { patches: 3, sequences: 1 }, SE: { patches: 2, sequences: 2 } },
  };
  const cur = bstats(8, 8, 0, {
    US: { patches: 4, sequences: 2 }, SE: { patches: 2, sequences: 2 }, CN: { patches: 1, sequences: 1 },
  });
  const { window, lifetime } = diffLibrary(prev, cur, bstats(99, 99));

  assert.equal(window.exact, true);
  assert.deepEqual({ patches: window.patches, sequences: window.sequences }, { patches: 3, sequences: 2 });
  // No-movement countries drop out; new/changed ones carry the per-kind delta.
  assert.deepEqual(window.byCountry, {
    US: { patches: 1, sequences: 1, unknown: 0 }, CN: { patches: 1, sequences: 1, unknown: 0 },
  });
  assert.deepEqual({ patches: lifetime.patches, sequences: lifetime.sequences }, { patches: 8, sequences: 8 });
});

test('diffLibrary falls back to the ?since= window when there is no baseline', async () => {
  const { diffLibrary } = await libP;
  const cur = bstats(8, 8, 0, { US: { patches: 4, sequences: 2 } });
  const { window, lifetime } = diffLibrary(null, cur, bstats(7, 7, 0, { US: { patches: 3, sequences: 2 } }));

  // Seeding run: day-granular, so not exact — the driver won't let it trigger a send.
  assert.equal(window.exact, false);
  assert.deepEqual({ patches: window.patches, sequences: window.sequences }, { patches: 7, sequences: 7 });
  assert.deepEqual({ patches: lifetime.patches, sequences: lifetime.sequences }, { patches: 8, sequences: 8 });
});

test('diffLibrary accumulates lifetime so the Worker 90-day expiry cannot shrink it', async () => {
  const { diffLibrary } = await libP;
  const prev = {
    seen: { patches: 40, sequences: 30, unknown: 0 },
    byCountry: { US: { patches: 40, sequences: 30 } },
    lifetime: { patches: 100, sequences: 90, unknown: 0 },
    lifetimeByCountry: { US: { patches: 100, sequences: 90 } },
  };
  // Old keys rolled off: the Worker now reports FEWER borrows than last report.
  const cur = bstats(38, 31, 0, { US: { patches: 38, sequences: 31 } });
  const { window, lifetime, nextLibrary } = diffLibrary(prev, cur, bstats(0, 0));

  assert.equal(window.patches, 0, 'a shrinking counter must not report a negative window');
  assert.equal(window.sequences, 1);
  assert.deepEqual({ patches: lifetime.patches, sequences: lifetime.sequences }, { patches: 100, sequences: 91 });
  // The next baseline is the Worker's current figure, not the lifetime total.
  assert.deepEqual(nextLibrary.seen, { patches: 38, sequences: 31, unknown: 0 });
  assert.deepEqual(nextLibrary.lifetime, { patches: 100, sequences: 91, unknown: 0 });
});

test('diffLibrary carries the unknown (pre-kind-tag) bucket through window and lifetime', async () => {
  const { diffLibrary } = await libP;
  const prev = {
    seen: { patches: 2, sequences: 1, unknown: 3 },
    byCountry: {}, lifetime: { patches: 2, sequences: 1, unknown: 3 }, lifetimeByCountry: {},
  };
  const cur = bstats(2, 1, 5, { XX: { patches: 0, sequences: 0, unknown: 2 } });
  const { window, lifetime } = diffLibrary(prev, cur, bstats(0, 0, 0));
  assert.equal(window.unknown, 2);
  assert.equal(lifetime.unknown, 5);
  assert.deepEqual(window.byCountry, { XX: { patches: 0, sequences: 0, unknown: 2 } });
});

// ── borrow rendering ──────────────────────────────────────────────────

const libModel = (over = {}) => ({
  ...model(),
  library: {
    window: { patches: 6, sequences: 4, unknown: 0, byCountry: { SE: { patches: 2, sequences: 2 }, CN: { patches: 1, sequences: 0 } } },
    lifetime: { patches: 41, sequences: 19, unknown: 0 },
  },
  ...over,
});

test('renderBody borrow blocks: header totals at column 44, padded kind rows', async () => {
  const { renderBody } = await libP;
  const body = renderBody(libModel());
  assert.match(body, /\nNEW LIBRARY BORROWS {23}10\n\n {2}Patches {4}6\n {2}Sequences {2}4\n/);
  assert.match(body, /\nTOTAL LIBRARY BORROWS {21}60\n\n {2}Patches {4}41\n {2}Sequences {2}19\n/);
});

test('renderBody borrow by-country: header total, single-total rows summed across kinds, sorted', async () => {
  const { renderBody } = await libP;
  const body = renderBody(libModel());
  // SE 4 (2+2) outranks CN 1 (1+0); window total 10 on the header.
  assert.match(body, /\nLIBRARY BORROWS BY COUNTRY {16}10\n {2}Sweden {2}4\n {2}China {3}1\n/);
});

test('renderBody shows the Older-app row only while the unknown bucket is non-zero', async () => {
  const { renderBody } = await libP;
  assert.doesNotMatch(renderBody(libModel()), /Older app/);
  const withUnknown = renderBody(libModel({
    library: {
      window: { patches: 1, sequences: 0, unknown: 2, byCountry: {} },
      lifetime: { patches: 1, sequences: 0, unknown: 7 },
    },
  }));
  assert.match(withUnknown, /\nNEW LIBRARY BORROWS {24}3\n\n {2}Patches {4}1\n {2}Sequences {2}0\n {2}Older app {2}2\n/);
  assert.match(withUnknown, /\nTOTAL LIBRARY BORROWS {22}8\n\n {2}Patches {4}1\n {2}Sequences {2}0\n {2}Older app {2}7\n/);
});

test('renderBody omits the borrow section entirely when there are no borrows this window', async () => {
  const { renderBody } = await libP;
  // No library data at all (Worker unreachable) → no borrow sections.
  assert.doesNotMatch(renderBody(model({ library: undefined })), /LIBRARY BORROWS|Borrows/);
  // Library data present but zero borrows this window → still omitted, even
  // with a non-zero lifetime (only window activity earns the space).
  const quiet = renderBody(libModel({
    library: {
      window: { patches: 0, sequences: 0, unknown: 0, byCountry: {} },
      lifetime: { patches: 41, sequences: 19, unknown: 0 },
    },
  }));
  assert.doesNotMatch(quiet, /LIBRARY BORROWS|Borrows/);
});

test('historyRow appends d_borrow_*/borrow_* columns when borrow data is present', async () => {
  const { historyRow } = await libP;
  const row = historyRow({
    date: '2026-07-29',
    delta: { macNew: 2, macUpd: 0, pcNew: 1 },
    lifetime: { macNew: 43, macUpd: 23, pcNew: 21 },
    borrow: {
      window: { patches: 3, sequences: 1, unknown: 0 },
      lifetime: { patches: 30, sequences: 12, unknown: 4 },
    },
  });
  assert.deepEqual(JSON.parse(row), {
    date: '2026-07-29',
    d_mac_new: 2, d_mac_upd: 0, d_pc_new: 1,
    mac_new: 43, mac_upd: 23, pc_new: 21,
    d_borrow_patches: 3, d_borrow_sequences: 1, d_borrow_unknown: 0,
    borrow_patches: 30, borrow_sequences: 12, borrow_unknown: 4,
  });
});

test('historyRow stays the exact download-only shape when borrow is omitted', async () => {
  const { historyRow } = await libP;
  const row = historyRow({
    date: '2026-07-29',
    delta: { macNew: 2, macUpd: 0, pcNew: 1 },
    lifetime: { macNew: 43, macUpd: 23, pcNew: 21 },
  });
  assert.doesNotMatch(row, /borrow/);
});

