// Daily download report — the side-effectful half (pure logic lives in
// scripts/download-report-lib.mjs). Driven by
// .github/workflows/download-report.yml, but runnable locally:
//
//   node scripts/download-report.mjs --dry-run     # print the email, touch nothing
//
// What it does:
//   1. tallies GitHub's per-asset download counts (>= v0.8.0)
//   2. reads the relay Worker's download-button counters (geo + site/GitHub split)
//   3. diffs both against .github/download-stats.json — the totals as of the
//      LAST REPORT, not the last run
//   4. prints the email body; writes the new snapshot unless --dry-run
//
// The email is sent (by the workflow) BEFORE the snapshot is committed, so a
// failed send leaves the snapshot untouched and tomorrow's run retries it.

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import {
  ASSET_RE, tallyAssets, diffSite, renderBody, htmlBody, textCta, htmlCta, formatDate,
} from './download-report-lib.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const REPO = flag('repo', process.env.GITHUB_REPOSITORY || 'danielspils/JP-Patches-App');
const SNAP = flag('snapshot', '.github/download-stats.json');
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
// query only seeds the very first report that has no stored baseline.
const sinceDay = String(snap?.updated || '').slice(0, 10).replace(/-/g, '');
const cur = await relay('/download/stats');
const fallback = sinceDay ? await relay(`/download/stats?since=${sinceDay}`) : cur;
const site = cur ? diffSite(snap?.site, cur, fallback || cur) : null;

// Whole days since the last report. We only email on activity, so the last
// report is also the last time there were new downloads — the intro line
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
  site: site ? { window: site.window, lifetime: site.lifetime } : null,
});

// The two multipart/alternative parts. Both carry the GoatCounter CTA after
// the report — plain gets the phrase + URL, HTML gets a real anchor after the
// <pre> (a link can't live inside the escaped <pre>).
const body = report + textCta();
const html = htmlBody(report) + htmlCta();

process.stdout.write(body);

// Email only when there's something new; commit the snapshot when we report
// (or to seed the very first baseline).
const send = !first && totalNew > 0;
const commit = first || send;

if (!DRY) {
  writeFileSync(SNAP, `${JSON.stringify({
    mac_new: now.macNew,
    mac_upd: now.macUpd,
    pc_new: now.pcNew,
    updated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    // Worker counters as of this report. Absent when the Worker was
    // unreachable — keep the old block so the next run still has a baseline.
    site: site ? site.nextSite : snap?.site,
  }, null, 0)}\n`);
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
  + `| send=${send} commit=${commit}${DRY ? ' (dry run)' : ''}\n`);
