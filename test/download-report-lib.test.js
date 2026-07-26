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

const model = (over = {}) => ({
  prevDate: 'Jul 22, 2026',
  daysSince: 4,
  delta: { macNew: 6, macUpd: 1, pcNew: 4 },
  lifetime: { macNew: 41, macUpd: 23, pcNew: 19 },
  site: {
    window: { byCountry: { SE: { mac: 2, pc: 2 }, CN: { mac: 1, pc: 0 } } },
    lifetime: { byCountry: { US: { mac: 6, pc: 4 }, SE: { mac: 3, pc: 5 } } },
  },
  ...over,
});

test('renderBody opens with the "last report N days ago" line', async () => {
  const { renderBody } = await libP;
  assert.match(renderBody(model()), /^Your last report was 4 days ago\.\n/);
  assert.match(renderBody(model({ daysSince: 1 })), /^Your last report was 1 day ago\.\n/);
  assert.match(renderBody(model({ prevDate: '', daysSince: null })), /^Your first download report\.\n/);
});

test('renderBody NEW/LIFETIME download rows are bare counts, no split', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());
  assert.match(body, /\nNEW DOWNLOADS YESTERDAY\n {2}Mac {14}\+6\n {2}PC {15}\+4\n/);
  assert.match(body, /\nLIFETIME DOWNLOADS\n {2}Mac {14}41\n {2}PC {15}19\n/);
  assert.doesNotMatch(body, /site \d|GitHub \d/);
});

test('renderBody MAC UPDATES aligns the +delta with the bare lifetime', async () => {
  const { renderBody } = await libP;
  assert.match(renderBody(model()), /\nMAC UPDATES\n {2}New {14}\+1\n {2}Lifetime {10}23\n/);
});

test('renderBody NEW by-country is a 3-column table, sorted, zero platform omitted', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());

  assert.match(body, /\nNEW BY COUNTRY \(via jx-3p\.com\)\n/);
  // SE 4 (2+2) first, then CN 1 (Mac only → no PC cell). Columns align:
  // country+count padded to 10, Mac cell padded to 8, then PC.
  assert.match(body, /\n {2}Sweden 4 {2}Mac 2 {3}PC 2\n {2}China 1 {3}Mac 1\n/);
  assert.doesNotMatch(body, /PC 0/);
});

test('renderBody LIFETIME by-country is a 2-column table, sorted by count', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());
  // US 10 (6+4) outranks SE 8 (3+5); no platform split, count column aligned.
  assert.match(body, /\nLIFETIME BY COUNTRY \(via jx-3p\.com\)\n {2}United States {2}10\n {2}Sweden {9}8\n/);
});

test('renderBody sorts countries by count desc then full name', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model({
    site: {
      window: { byCountry: {} },
      lifetime: { byCountry: { SG: { mac: 1, pc: 0 }, KR: { mac: 1, pc: 0 }, US: { mac: 5, pc: 0 } } },
    },
  }));
  const life = body.slice(body.indexOf('LIFETIME BY COUNTRY'));
  // US 5 first; then the two 1s alphabetically: Singapore before South Korea.
  assert.ok(life.indexOf('United States') < life.indexOf('Singapore'));
  assert.ok(life.indexOf('Singapore') < life.indexOf('South Korea'));
});

test('renderBody prints "none" for an empty by-country table', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model({
    site: { window: { byCountry: {} }, lifetime: { byCountry: { US: { mac: 5, pc: 0 } } } },
  }));
  assert.match(body, /\nNEW BY COUNTRY \(via jx-3p\.com\)\n {2}none\n/);
});

test('renderBody shows "none" for both country tables when the Worker is unreachable', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model({ site: null }));
  // Downloads still render (GitHub, not the Worker).
  assert.match(body, /^ {2}Mac {14}\+6$/m);
  assert.match(body, /^ {2}Mac {14}41$/m);
  assert.match(body, /\nNEW BY COUNTRY \(via jx-3p\.com\)\n {2}none\n/);
  assert.match(body, /\nLIFETIME BY COUNTRY \(via jx-3p\.com\)\n {2}none\n/);
});

test('renderBody carries the static HOW THIS IS COUNTED block verbatim', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());
  assert.match(body, /\nHOW THIS IS COUNTED\n {2}Downloads are counted by GitHub when a file is served\. Country is\n {2}only known for jx-3p\.com button clicks — a rough interest signal,\n {2}not downloads, so those counts won't match the download totals\.\n {2}PC has no auto-updater yet\.\n$/);
});

test('renderBody never claims a site/GitHub split', async () => {
  const { renderBody } = await libP;
  assert.doesNotMatch(renderBody(model()), /via GitHub|GitHub \d|estimated/);
});

test('renderBody emits the section headings in order', async () => {
  const { renderBody } = await libP;
  const body = renderBody(model());
  const order = [
    'NEW DOWNLOADS YESTERDAY', 'MAC UPDATES',
    'NEW BY COUNTRY (via jx-3p.com)', 'LIFETIME BY COUNTRY (via jx-3p.com)',
    'LIFETIME DOWNLOADS', 'HOW THIS IS COUNTED',
  ];
  let last = -1;
  for (const h of order) {
    const at = body.indexOf(`\n${h}\n`);
    assert.ok(at > last, `${h} missing or out of order`);
    last = at;
  }
});

test('htmlBody wraps the body verbatim in one inline-styled <pre>', async () => {
  const { htmlBody } = await libP;
  const body = 'NEW DOWNLOADS\n  Mac              +6\n';
  const html = htmlBody(body);

  const STYLE = "font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "
    + "'Liberation Mono', monospace; font-size: 13px; line-height: 1.45; "
    + 'white-space: pre; margin: 0;';
  assert.equal(html, `<pre style="${STYLE}">${body}</pre>`);
  // The body is emitted byte-for-byte inside — same newlines, no reflow.
  assert.ok(html.includes(body));
  // No block tags manufactured around the content.
  assert.doesNotMatch(html, /<br|<div|<table|<head|<style/);
});

test('htmlBody escapes & < > only, leaving the · separator intact', async () => {
  const { htmlBody } = await libP;
  const html = htmlBody('a & b < c > d · e');
  assert.match(html, />a &amp; b &lt; c &gt; d · e</);
});

test('htmlBody escapes ampersand before the angle brackets', async () => {
  const { htmlBody } = await libP;
  // A literal < in the source must become &lt;, never double-escape to &amp;lt;.
  const html = htmlBody('x < y');
  assert.ok(html.includes('x &lt; y'));
  assert.ok(!html.includes('&amp;lt;'));
});

test('formatDate renders UTC, not the runner local time', async () => {
  const { formatDate } = await libP;
  assert.equal(formatDate('2026-06-12T01:14:12Z'), 'Jun 12, 2026');
  assert.equal(formatDate('2026-07-22T23:59:00Z'), 'Jul 22, 2026');
  assert.equal(formatDate('nonsense'), '');
});

