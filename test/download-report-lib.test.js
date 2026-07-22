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

// ── the site/GitHub split ─────────────────────────────────────────────

test('splitCounts derives the GitHub half by subtraction', async () => {
  const { splitCounts } = await libP;
  assert.deepEqual(splitCounts(10, 4), { site: 4, github: 6, capped: false, raw: 4 });
  assert.deepEqual(splitCounts(10, 0), { site: 0, github: 10, capped: false, raw: 0 });
});

test('splitCounts caps site clicks at the total instead of going negative', async () => {
  const { splitCounts } = await libP;
  // 7 button clicks, 5 downloads GitHub actually counted — cancelled clicks,
  // deduped redirects. The parts must still add up to the whole.
  const s = splitCounts(5, 7);
  assert.deepEqual(s, { site: 5, github: 0, capped: true, raw: 7 });
  assert.equal(s.site + s.github, 5);
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

const model = (over = {}) => ({
  date: 'Jul 22, 2026',
  lastReport: 'July 20',
  v0Date: 'Jun 12, 2026',
  delta: { macNew: 6, macUpd: 1, pcNew: 4 },
  lifetime: { macNew: 36, macUpd: 23, pcNew: 17 },
  site: {
    window: { exact: true, mac: 3, pc: 2, byCountry: { SE: { mac: 2, pc: 2 }, CN: { mac: 1, pc: 1 } } },
    lifetime: { mac: 8, pc: 8, byCountry: { SE: { mac: 2, pc: 2 }, US: { mac: 4, pc: 2 } } },
  },
  ...over,
});

test('renderBody lays out the report with both splits', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());

  assert.match(body, /^JP Patches — new downloads for Jul 22, 2026\n/);
  assert.match(body, /^Since July 20 > all new downloads:$/m);
  assert.match(body, /Mac — installs: {6}\+6 {2}\(3 via jx-3p\.com, 3 via GitHub\)/);
  // Auto-updates never come from the site, so that row carries no split.
  assert.match(body, /Mac — auto-updates: {2}\+1\n/);
  assert.match(body, /PC — downloads: {6}\+4 {2}\(2 via jx-3p\.com, 2 via GitHub\)/);
  assert.match(body, /Mac installs: {3}36 {2}\(8 via jx-3p\.com, 28 via GitHub\)/);
  assert.match(body, /Mac updates: {4}23\n/);
  assert.match(body, /PC downloads: {3}17 {2}\(8 via jx-3p\.com, 9 via GitHub\)/);
  assert.match(body, /Sweden: 4 \(Mac 2, PC 2\)/);
  assert.match(body, /Total downloads begin with v0\.8\.0, released on Jun 12, 2026\./);
});

test('renderBody sorts countries by total, descending', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());
  const life = body.slice(body.indexOf('Lifetime > jx-3p.com downloads by country:'));
  assert.ok(life.indexOf('United States') < life.indexOf('Sweden'), 'US (6) outranks Sweden (4)');
});

test('renderBody omits the split entirely when the Worker is unreachable', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model({ site: null }));

  assert.match(body, /Mac — installs: {6}\+6\n/);
  assert.match(body, /Mac installs: {3}36\n/);
  assert.doesNotMatch(body, /via jx-3p\.com/);
  assert.match(body, /couldn't be reached/);
});

test('renderBody suppresses the since-last-report split on the seeding run', async () => {
  const { renderBody } = await libP;
  const site = model().site;
  site.window.exact = false;
  const body = renderBody(model({ site }));

  assert.match(body, /Mac — installs: {6}\+6\n/, 'window split withheld');
  assert.match(body, /Mac installs: {3}36 {2}\(8 via jx-3p\.com/, 'lifetime split still shown');
  assert.match(body, /sets the click-tracking baseline/);
  // The by-country section is a click count in its own right, not a claim
  // about the GitHub totals, so it still prints.
  assert.match(body, /^Since July 20 > jx-3p\.com downloads by country:$/m);
});

test('renderBody notes when a row had more clicks than counted downloads', async () => {
  const { renderBody } = await libP;
  const site = model().site;
  site.window.mac = 99;
  const body = renderBody(model({ site }));

  assert.match(body, /Mac — installs: {6}\+6 {2}\(6 via jx-3p\.com, 0 via GitHub\)/);
  assert.match(body, /a click isn't always a finished download/);
});

test('formatDate renders UTC, not the runner local time', async () => {
  const { formatDate } = await libP;
  assert.equal(formatDate('2026-06-12T01:14:12Z'), 'Jun 12, 2026');
  assert.equal(formatDate('2026-07-22T23:59:00Z'), 'Jul 22, 2026');
  assert.equal(formatDate('nonsense'), '');
});

test('renderBody orders the four sections as specified', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());
  const headings = body.split('\n').filter((l) => /(:|downloads)$/.test(l) && !l.startsWith(' '));

  assert.deepEqual(headings, [
    'Since July 20 > all new downloads:',
    'Since July 20 > jx-3p.com downloads by country:',
    'Lifetime > jx-3p.com downloads by country:',
    'Lifetime > total downloads:',
  ]);
});

