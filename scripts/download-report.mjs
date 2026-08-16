// Daily download report — the side-effectful half (pure logic lives in
// scripts/download-report-lib.mjs). Driven by
// .github/workflows/download-report.yml, but runnable locally:
//
//   node scripts/download-report.mjs --dry-run     # print the email, touch nothing
//
// What it does:
//   1. tallies GitHub's per-asset download counts (>= v0.8.0)
//   2. reads the relay Worker's download-button + lending-library-borrow
//      counters (geo, and the site/GitHub split for downloads)
//   3. diffs all against .github/download-stats.json — the totals as of the
//      LAST REPORT, not the last run
//   4. prints the email body; writes the new snapshot unless --dry-run
//
// The email is sent (by the workflow) BEFORE the snapshot is committed, so a
// failed send leaves the snapshot untouched and tomorrow's run retries it.

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import {
  ASSET_RE, tallyAssets, diffSite, diffLibrary, renderBody, htmlBody, ctaBullet,
  formatDate, historyRow,
} from './download-report-lib.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const REPO = flag('repo', process.env.GITHUB_REPOSITORY || 'danielspils/JP-Patches-App');
const SNAP = flag('snapshot', '.github/download-stats.json');
const HISTORY = flag('history', '.github/download-history.jsonl');
const RELAY = flag('relay', 'https://lend.jx-3p.com');
const DRY = has('dry-run');

// ── GitHub ────────────────────────────────────────────────────────────

const ghHeaders = {
  accept: 'application/vnd.github+json',
  'user-agent': 'jp-patches-download-report',
  'x-github-api-version': '2022-11-28',
  ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
};

async function githubReleases() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`,
      { headers: ghHeaders });
    if (!res.ok) throw new Error(`GitHub releases ${res.status} ${await res.text()}`);
    const rels = await res.json();
    out.push(...rels);
    if (rels.length < 100) break;
  }
  return out;
}

// ── relay Worker (best-effort — the report degrades, never fails) ──────

async function relay(path) {
  try {
    const res = await fetch(`${RELAY}${path}`, { signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// ── main ──────────────────────────────────────────────────────────────

const releases = await githubReleases();
const rows = releases.flatMap((r) => (r.assets || [])
  .map((a) => ({ tag: r.tag_name, name: a.name, count: a.download_count })));

const now = {
  macNew: tallyAssets(rows, ASSET_RE.macNew),
  macUpd: tallyAssets(rows, ASSET_RE.macUpd),
  pcNew: tallyAssets(rows, ASSET_RE.pcNew),
};

let snap = null;
try { snap = JSON.parse(readFileSync(SNAP, 'utf8')); } catch { /* first run */ }
const first = !snap;

const prev = {
  macNew: Number(snap?.mac_new) || 0,
  macUpd: Number(snap?.mac_upd) || 0,
  pcNew: Number(snap?.pc_new) || 0,
};
const delta = first
  ? { macNew: 0, macUpd: 0, pcNew: 0 }
  : { macNew: now.macNew - prev.macNew, macUpd: now.macUpd - prev.macUpd, pcNew: now.pcNew - prev.pcNew };
const totalNew = delta.macNew + delta.macUpd + delta.pcNew;

// Site clicks. `cur` is the Worker's whole retained window; the ?since=
// seeding query only feeds the very first report's lifetime baseline.
const sinceDay = String(snap?.updated || '').slice(0, 10).replace(/-/g, '');
const cur = await relay('/download/stats');
const fallback = sinceDay ? await relay(`/download/stats?since=${sinceDay}`) : cur;
const site = cur ? diffSite(snap?.site, cur, fallback || cur) : null;

// The by-country display window: a rolling last-7-calendar-days query against
// the Worker's day-granular keys. Deliberately NOT snapshot-based — the label
// says exactly what the window is, so overlap between consecutive emails is
// fine, and a 7-day span absorbs GitHub's hours-long download-count lag that
// made a same-window click column disagree with the download delta.
const weekDay = new Date(Date.now() - 7 * 86_400_000)
  .toISOString().slice(0, 10).replace(/-/g, '');
const week = await relay(`/download/stats?since=${weekDay}`);

// Lending-library borrows — the same snapshot-diff dance as site clicks, from
// the Worker's /borrow/stats counters. A SEPARATE metric, never netted against
// downloads. `library` is null when the Worker is unreachable or the endpoint
// isn't deployed yet (the borrow section simply doesn't render).
const libCur = await relay('/borrow/stats');
const libFallback = sinceDay ? await relay(`/borrow/stats?since=${sinceDay}`) : libCur;
const library = libCur ? diffLibrary(snap?.library, libCur, libFallback || libCur) : null;

// Whole days since the last report. We only email on activity, so the last
// report is also the last time there were new downloads — the heading's span
// leans on that. Floor at 1 so a same-day resend never says "0 days ago".
const snapMs = snap?.updated ? Date.parse(snap.updated) : NaN;
const daysSince = Number.isNaN(snapMs)
  ? null
  : Math.max(1, Math.round((Date.now() - snapMs) / 86_400_000));

const report = renderBody({
  prevDate: snap?.updated ? formatDate(snap.updated) : '',
  daysSince,
  delta,
  lifetime: now,
  // When the live /download/stats fetch fails but the snapshot already holds
  // an accumulated lifetime table, degrade instead of rendering "none": pass
  // the stored totals with stale:true so renderBody can label them plainly.
  // The 7-day window stays live-only (no snapshot equivalent), and the
  // snapshot itself is never advanced from a failed fetch (see the write
  // below, which keeps snap.site when site is null).
  site: site
    ? { week: week?.byCountry || null, window: site.window.byCountry || null, lifetime: site.lifetime }
    : snap?.site?.lifetimeByCountry
      ? { week: week?.byCountry || null, window: null,
          lifetime: { ...snap.site.lifetime, byCountry: snap.site.lifetimeByCountry }, stale: true }
      : null,
  library: library ? { window: library.window, lifetime: library.lifetime } : null,
});

// The two multipart/alternative parts. The footer CTAs (site metrics page,
// then GoatCounter) follow HOW THIS IS COUNTED: plain appends phrase + URL
// lines; htmlBody appends inline anchors around the link texts in the <pre>.
const body = `${report}${ctaBullet()}\n`;
const html = htmlBody(report);

process.stdout.write(body);

// New library borrows this window count as activity too — a borrow-only day
// still sends. Only an EXACT window (a stored library baseline to subtract)
// can trigger a send; the seeding run's approximate ?since= figure never does.
const borrowNew = library && library.window.exact
  ? library.window.patches + library.window.sequences + library.window.unknown
  : 0;

// The first report that carries library data has a download baseline but no
// library baseline yet. Commit silently (no email) so it seeds snapshot.library
// — the next borrow day then has an exact baseline and can trigger on its own.
const librarySeeding = Boolean(library && !snap?.library);

// Email only when there's something new; commit the snapshot when we report
// (or to seed the very first baseline, or the library baseline).
const send = !first && (totalNew > 0 || borrowNew > 0);
const commit = first || send || librarySeeding;

const reportDate = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// Baseline advances ONLY when we report. The workflow already gates the git
// commit on `commit`, so an ungated write never became durable — but gating
// the write too means even a local (non-CI) suppressed run can't move the
// file, and the invariant lives in one obvious place.
if (!DRY && commit) {
  writeFileSync(SNAP, `${JSON.stringify({
    mac_new: now.macNew,
    mac_upd: now.macUpd,
    pc_new: now.pcNew,
    updated: reportDate,
    // Worker counters as of this report. Absent when the Worker was
    // unreachable — keep the old block so the next run still has a baseline.
    site: site ? site.nextSite : snap?.site,
    // Same for the library-borrow baseline.
    library: library ? library.nextLibrary : snap?.library,
  }, null, 0)}\n`);

  // Append one row to the permanent history on the same report days. The
  // snapshot is overwritten each report; this file only grows, so it's the
  // durable, chartable download time series. The workflow git-adds both.
  appendFileSync(HISTORY,
    `${historyRow({
      date: reportDate.slice(0, 10),
      delta,
      lifetime: now,
      borrow: library ? { window: library.window, lifetime: library.lifetime } : null,
    })}\n`);
}

if (process.env.GITHUB_OUTPUT) {
  // Both parts of the multipart/alternative email: `body` (text/plain) and
  // `html` (the same body wrapped in one <pre>). The workflow passes them
  // to action-send-mail as `body` and `html_body`.
  appendFileSync(process.env.GITHUB_OUTPUT,
    `send=${send}\ncommit=${commit}\n`
    + `body<<BODY_EOF\n${body}BODY_EOF\n`
    + `html<<HTML_EOF\n${html}\nHTML_EOF\n`);
}

process.stderr.write(`deltas — mac:${delta.macNew} upd:${delta.macUpd} pc:${delta.pcNew} `
  + `| site window mac:${site?.window.mac ?? 'n/a'} pc:${site?.window.pc ?? 'n/a'} `
  + `| borrow window pat:${library?.window.patches ?? 'n/a'} seq:${library?.window.sequences ?? 'n/a'} `
  + `| send=${send} commit=${commit}${DRY ? ' (dry run)' : ''}\n`);
