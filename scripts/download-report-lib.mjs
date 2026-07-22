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
export const MIN_VER_TAG = 'v0.8.0';     // the same cutoff, for display + lookup

// Download-button tracking shipped in the Worker on this date (commit
// b7b69d0), a month after v0.8.0. Site clicks therefore cannot account for
// downloads before it, which is why the lifetime split gets a caveat.
export const SITE_TRACKING_START = '2026-07-15';

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

// Split a GitHub download total into "came via a jx-3p.com button" and
// "came straight from GitHub". Only the site half is measured; the GitHub
// half is what's left over.
//
// Site clicks can EXCEED GitHub's count for the same window — a click that
// the user cancels, a redirect GitHub dedupes, a bot past the UA filter.
// The report presents these two numbers as parts of a whole, so the site
// half is capped at the total (and `capped` is raised, which adds a note)
// rather than printing a negative or a pair that doesn't add up.
export function splitCounts(total, siteClicks) {
  const t = Math.max(0, Number(total) || 0);
  const raw = Math.max(0, Number(siteClicks) || 0);
  const site = Math.min(raw, t);
  return { site, github: t - site, capped: raw > t, raw };
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

// "2026-07-16T15:24:07Z" → "July 16". The section headings say "Since
// July 16" — no year, because the gap between reports is a day or two.
export function formatDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const pad = (label, width) => label + ' '.repeat(Math.max(1, width - label.length));

// Rows: [[label, value]] → left-aligned labels, values in one column.
function column(rows, gap = 2) {
  const width = Math.max(...rows.map(([l]) => l.length)) + gap;
  return rows.map(([l, v]) => `  ${pad(l, width)}${v}`);
}

const byTotalDesc = (a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]);

// model:
//   date, lastReport, v0Date         — display strings ('' when unknown)
//   delta:    { macNew, macUpd, pcNew }              GitHub deltas
//   lifetime: { macNew, macUpd, pcNew }              GitHub cumulative
//   site:     null when the Worker is unreachable, else
//             { window: {mac, pc, byCountry}, lifetime: {mac, pc, byCountry} }
export function renderBody(model) {
  const { date, lastReport, v0Date, delta, lifetime, site } = model;
  const out = [];
  const notes = [];
  let capped = false;

  // A "+N (a via jx-3p.com, b via GitHub)" value, or a bare "+N" when the
  // site half is unavailable. The jx-3p.com half is the measured one; the
  // GitHub half is what's left after subtracting it.
  const value = (n, siteClicks, sign) => {
    const num = `${sign && n >= 0 ? '+' : ''}${n}`;
    if (siteClicks == null) return num;
    const s = splitCounts(n, siteClicks);
    capped = capped || s.capped;
    return `${num}  (${s.site} via jx-3p.com, ${s.github} via GitHub)`;
  };

  out.push(`JP Patches — new downloads for ${date}`);
  out.push('');

  // "Since July 16" — falls back to the generic wording only if the
  // snapshot has no date (the very first report ever).
  const since = lastReport ? `Since ${lastReport}` : 'Since your last report';

  // The since-window site clicks, but only when they're exact (see
  // diffSite) — on the seeding run there's no baseline to subtract, so
  // the split is withheld rather than printed from a day-granular guess.
  const win = site && site.window.exact !== false ? site.window : null;

  // 1 — everything GitHub counted this window, split on each line.
  out.push(`${since} > all new downloads:`);
  out.push(...column([
    ['Mac — installs:', value(delta.macNew, win ? win.mac : null, true)],
    ['Mac — auto-updates:', `+${delta.macUpd}`],
    ['PC — downloads:', value(delta.pcNew, win ? win.pc : null, true)],
  ]));

  if (site) {
    // 2 — where this window's site clicks came from.
    const byCountry = Object.entries(site.window.byCountry)
      .map(([cc, v]) => [cc, plat(v)])
      .filter(([, v]) => v.mac + v.pc > 0)
      .sort((a, b) => byTotalDesc([a[0], a[1].mac + a[1].pc], [b[0], b[1].mac + b[1].pc]));
    if (byCountry.length) {
      out.push('');
      out.push(`${since} > jx-3p.com downloads by country:`);
      for (const [cc, v] of byCountry) {
        out.push(`  ${countryName(cc)}: ${v.mac + v.pc} (Mac ${v.mac}, PC ${v.pc})`);
      }
    }

    // 3 — the same, for all time.
    const life = Object.entries(site.lifetime.byCountry)
      .map(([cc, v]) => [cc, plat(v).mac + plat(v).pc])
      .filter(([, n]) => n > 0)
      .sort(byTotalDesc);
    if (life.length) {
      out.push('');
      out.push('Lifetime > jx-3p.com downloads by country:');
      out.push(...column(life.map(([cc, n]) => [`${countryName(cc)}:`, `${n}`])));
    }
  }

  // 4 — the running totals, last.
  out.push('');
  out.push('Lifetime > total downloads:');
  out.push(...column([
    ['Mac installs:', value(lifetime.macNew, site ? site.lifetime.mac : null, false)],
    ['Mac updates:', `${lifetime.macUpd}`],
    ['PC downloads:', value(lifetime.pcNew, site ? site.lifetime.pc : null, false)],
  ], 3));

  notes.push('No auto-update for PC yet, so only direct .exe downloads from GitHub are counted.');
  notes.push('Country attribution only works when someone clicks a download button on jx-3p.com. Direct GitHub downloads (most of them) aren\'t tied to a country.');
  if (v0Date) notes.push(`Total downloads begin with ${MIN_VER_TAG}, released on ${v0Date}.`);
  if (!site) {
    notes.push('The jx-3p.com / GitHub split isn\'t available this time — the site\'s click tracking couldn\'t be reached.');
  } else {
    notes.push('The jx-3p.com / GitHub split is an estimate: site clicks are counted at the button, GitHub counts completed downloads, so the two never line up exactly.');
    if (!win) {
      notes.push('No since-last-report split this time — this report sets the click-tracking baseline, so the next one will have it.');
    }
    if (v0Date && formatDate(SITE_TRACKING_START) !== v0Date) {
      notes.push(`Site click tracking only started ${formatDate(SITE_TRACKING_START)}, so lifetime downloads before that all count as "via GitHub".`);
    }
    if (capped) {
      notes.push('More site clicks than counted downloads in a row above, so "via GitHub" shows 0 there — a click isn\'t always a finished download.');
    }
  }

  out.push('');
  out.push('NOTES');
  for (const n of notes) out.push(`- ${n}`);

  return out.join('\n') + '\n';
}
