// JP Patches — lending relay (Cloudflare Worker)
//
// The one hosted component of the user lending library (see
// docs/future-features.md → Community library → publish semantics).
// The app POSTs a lending submission here; this Worker files it as a
// GitHub issue in danielspils/JP-Patches-App using a repo-scoped token
// held as a Worker secret — so users need no GitHub account and the
// token never ships inside the app.
//
// Deploy: see relay/README.md. Secret required: GITHUB_TOKEN
// (fine-grained PAT, this repo only, Issues read+write).
//
// API:
//   POST /lend
//     { kind: 'tones'|'sequences', lendName, author, hometown?, notes?,
//       token,            // app-generated UUID — embedded for future withdraw
//       payload }          // the .json payload object (download-path shape)
//   → 200 { ok: true, issueUrl }
//   → 4xx/5xx { ok: false, error }
//
// The issue lands with the same community-tones / community-sequences
// label the manual GitHub forms use — one review queue either way.

const REPO = 'danielspils/JP-Patches-App';
const MAX_REQUEST_BYTES = 1 * 1024 * 1024;   // payloads are ~15-35KB; 1MB = generous
const MAX_ISSUE_BODY = 60000;                // GitHub caps issue bodies at 65536

// CORS: the lend form on jx-3p.com posts here cross-origin (the app's
// main-process fetch sends no Origin and is unaffected). Allow exactly
// the site origin — nothing else.
const ALLOWED_ORIGIN = 'https://jx-3p.com';

const CORS_HEADERS = {
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });

// ── Hearts ──────────────────────────────────────────────────────────
// Simple per-entry like counts, deduped one-per-IP-per-entry. IPs are
// never stored — only a salted SHA-256. The salt is a code constant
// (not a secret): hearts aren't sensitive data, the hash just keeps
// raw addresses out of the KV namespace.
const HEART_SALT = 'jp-patches-hearts-v1:';
const HEART_ID_RE = /^[a-z0-9-]{1,64}$/;
const MAX_HEART_IDS = 60;

async function heartIpHash(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const digest = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(HEART_SALT + ip));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function kvCount(env, key) {
  return Number(await env.HEARTS.get(key)) || 0;
}

// GET /hearts?ids=… — batch counts. Returns hearts AND borrows per id
// (borrows added 2026-06-10; `counts` keeps its original hearts-only
// shape for backward compatibility, `borrows` rides alongside).
async function handleGetHearts(url, env) {
  const ids = (url.searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => HEART_ID_RE.test(s))
    .slice(0, MAX_HEART_IDS);
  const counts = {};
  const borrows = {};
  await Promise.all(ids.map(async (id) => {
    counts[id]  = await kvCount(env, `c:${id}`);
    borrows[id] = await kvCount(env, `bc:${id}`);
  }));
  return json({ ok: true, counts, borrows });
}

// POST /heart — TOGGLE (2026-06-10, was add-only): hearted → un-heart,
// not hearted → heart. One slot per IP per entry; response carries the
// resulting state so clients stay in sync.
async function handlePostHeart(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid JSON' }, 400); }
  const id = body && body.id;
  if (typeof id !== 'string' || !HEART_ID_RE.test(id)) {
    return json({ ok: false, error: 'invalid id' }, 400);
  }
  const marker = `h:${id}:${await heartIpHash(request)}`;
  const countKey = `c:${id}`;
  if (await env.HEARTS.get(marker)) {
    await env.HEARTS.delete(marker);
    const next = Math.max(0, (await kvCount(env, countKey)) - 1);
    await env.HEARTS.put(countKey, String(next));
    return json({ ok: true, count: next, hearted: false });
  }
  await env.HEARTS.put(marker, '1');
  const next = (await kvCount(env, countKey)) + 1;   // non-atomic; fine at this scale
  await env.HEARTS.put(countKey, String(next));
  return json({ ok: true, count: next, hearted: true });
}

// POST /borrow — count unique borrowers (one per IP per entry, same
// dedupe pattern as hearts; NOT a toggle — borrowing again is a no-op
// for the count). Fired by the site's borrow click and by the app's
// download handler, so the tally combines both surfaces.
async function handlePostBorrow(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid JSON' }, 400); }
  const id = body && body.id;
  if (typeof id !== 'string' || !HEART_ID_RE.test(id)) {
    return json({ ok: false, error: 'invalid id' }, 400);
  }
  const marker = `bh:${id}:${await heartIpHash(request)}`;
  const countKey = `bc:${id}`;
  if (await env.HEARTS.get(marker)) {
    return json({ ok: true, count: await kvCount(env, countKey), deduped: true });
  }
  await env.HEARTS.put(marker, '1');
  const next = (await kvCount(env, countKey)) + 1;
  await env.HEARTS.put(countKey, String(next));
  return json({ ok: true, count: next });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method === 'GET' && url.pathname === '/hearts') {
      return handleGetHearts(url, env);
    }
    if (request.method === 'POST' && url.pathname === '/heart') {
      return handlePostHeart(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/borrow') {
      return handlePostBorrow(request, env);
    }
    if (request.method !== 'POST' || url.pathname !== '/lend') {
      return json({ ok: false, error: 'POST /lend only' }, 404);
    }
    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_REQUEST_BYTES) {
      return json({ ok: false, error: 'request too large' }, 413);
    }

    // Rate limit: max 5 submissions per IP per UTC day. Submissions
    // auto-publish now, so this is the flood guard — without it a
    // script could fill the public catalog overnight. Non-atomic KV
    // counter is fine: the limit is approximate by design.
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rlKey = `rl:${await heartIpHash(request)}:${day}`;
    const submittedToday = Number(await env.HEARTS.get(rlKey)) || 0;
    if (submittedToday >= 5) {
      return json({ ok: false, error: 'daily lending limit reached — try again tomorrow' }, 429);
    }
    await env.HEARTS.put(rlKey, String(submittedToday + 1), { expirationTtl: 172800 });

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'invalid JSON' }, 400);
    }

    const { kind, lendName, author, hometown, notes, token, payload } = body || {};
    const isTones = kind === 'tones';
    if (!isTones && kind !== 'sequences') {
      return json({ ok: false, error: 'kind must be tones|sequences' }, 400);
    }
    if (!isNonEmptyString(lendName) || !isNonEmptyString(author) || !isNonEmptyString(token)) {
      return json({ ok: false, error: 'lendName, author, and token are required' }, 400);
    }
    if (!payload || typeof payload !== 'object'
        || payload.format_version !== '1.0'
        || (isTones ? !Array.isArray(payload.banks) : !Array.isArray(payload.pages))) {
      return json({ ok: false, error: 'payload shape invalid' }, 400);
    }

    const payloadJson = JSON.stringify(payload);   // compact — issue bodies cap at 64K
    const issueBody = [
      `**${isTones ? 'Package' : 'Sequence'} name:** ${clean(lendName)}`,
      `**Author:** ${clean(author)}`,
      hometown ? `**Hometown:** ${clean(hometown)}` : null,
      notes ? `**Notes:** ${clean(notes)}` : null,
      '',
      '_Submitted from inside JP Patches via the lending relay._',
      `<!-- lend-token: ${clean(token)} -->`,
      '',
      '```json',
      payloadJson,
      '```',
    ].filter((l) => l !== null).join('\n');

    if (issueBody.length > MAX_ISSUE_BODY) {
      return json({
        ok: false,
        error: 'payload too large for an issue — use the GitHub form with a file attachment instead',
      }, 413);
    }

    const ghRes = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'accept': 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'jp-patches-lending-relay',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        title: `[Lend ${isTones ? 'Tones' : 'Sequence'}] ${clean(lendName)}`,
        labels: [isTones ? 'community-tones' : 'community-sequences'],
        body: issueBody,
      }),
    });

    if (!ghRes.ok) {
      const detail = await ghRes.text().catch(() => '');
      console.log(`github error ${ghRes.status}: ${detail.slice(0, 300)}`);
      return json({ ok: false, error: `github rejected the submission (${ghRes.status})` }, 502);
    }
    const issue = await ghRes.json();
    return json({ ok: true, issueUrl: issue.html_url });
  },
};

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Strip control chars + cap length — these strings land in markdown we
// author, so keep them boring. (Markdown injection here is low-stakes —
// the issue is only ever read by the curator — but no reason to allow it.)
function clean(v) {
  return String(v).replace(/[ -]/g, ' ').slice(0, 300).trim();
}
