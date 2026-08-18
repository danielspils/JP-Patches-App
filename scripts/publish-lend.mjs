// Auto-publish a lending-library submission (issue → catalog).
//
// Runs inside .github/workflows/lending-publish.yml on every
// community-labeled issue. Replaces manual curation (Daniel,
// 2026-06-10: limited audience + strictly-validated pure-data payloads
// + post-moderation via the email ping = auto-approve is right-sized).
//
// Pipeline: fetch issue → parse metadata + payload → STRICT validation
// → content-hash dedup against the existing catalog → write payload +
// YAML entry → catalog consistency test as the final gate → commit +
// push (Pages auto-deploys) → close the issue with a receipt.
// Anything the automation isn't sure about gets the `needs-review`
// label and stays open for a human — it never publishes on doubt.
//
// Env: ISSUE_NUMBER, GITHUB_REPOSITORY, GH_TOKEN (workflow token —
// contents+issues write; the relay's PAT stays Issues-only).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  validatePayload, contentHash, cleanText, yamlQuote,
  extractMeta, extractTokenHash, extractJsonFence, uniqueId,
} from './lend-publish-lib.mjs';

const REPO = process.env.GITHUB_REPOSITORY;
const ISSUE = process.env.ISSUE_NUMBER;
const TOKEN = process.env.GH_TOKEN;
const API = `https://api.github.com/repos/${REPO}`;

const gh = async (route, init = {}) => {
  const res = await fetch(`${API}${route}`, {
    ...init,
    headers: {
      'authorization': `Bearer ${TOKEN}`,
      'accept': 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub ${route}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};

const comment = (body) =>
  gh(`/issues/${ISSUE}/comments`, { method: 'POST', body: JSON.stringify({ body }) });

// Content-judgment failure: label needs-review, explain, leave open.
// Exit 0 — a rejected submission is a handled outcome, not a CI error.
async function needsReview(reason) {
  await comment(
    `⚠️ **Not auto-published:** ${reason}\n\nLeaving this open with ` +
    '`needs-review` for a human look. (Automated validator.)');
  await gh(`/issues/${ISSUE}/labels`, {
    method: 'POST', body: JSON.stringify({ labels: ['needs-review'] }),
  });
  console.log(`needs-review: ${reason}`);
  process.exit(0);
}

// ── main ─────────────────────────────────────────────────────────────
const issue = await gh(`/issues/${ISSUE}`);
if (issue.state !== 'open') { console.log('issue not open — nothing to do'); process.exit(0); }
const labels = issue.labels.map((l) => l.name);
const kind = labels.includes('community-tones') ? 'tones'
  : labels.includes('community-sequences') ? 'sequences' : null;
if (!kind) { console.log('not a lending submission — nothing to do'); process.exit(0); }
if (labels.includes('needs-review')) { console.log('already marked needs-review'); process.exit(0); }

const body = issue.body || '';
const meta = (label) => extractMeta(body, label);
const lendName = cleanText(meta('Package name') || meta('Sequence name'), 80);
const author   = cleanText(meta('Author'), 80);
const hometown = cleanText(meta('Hometown'), 80);
const notes    = cleanText(meta('Notes'), 200);
if (!lendName || !author) await needsReview('could not parse the name/author fields from the issue');

// The HASH, not the token: new issues carry only the hash, and an older one
// is hashed here rather than anywhere public (2026-08-18).
const lendTokenHash = await extractTokenHash(body,
  (t) => createHash('sha256').update(t).digest('hex'));

const fence = extractJsonFence(body);
if (fence === null) await needsReview('no JSON payload found in the issue body');
let payload;
try { payload = JSON.parse(fence); }
catch { await needsReview('the payload is not valid JSON'); }

const invalid = validatePayload(kind, payload);
if (invalid) await needsReview(`payload failed validation: ${invalid}`);

// Dedup against every payload already in the catalog (content identity).
// mkdir first: git drops empty dirs, so a fully-withdrawn catalog has no
// docs/library/patches|sequences in a fresh checkout (ENOENT crash,
// 2026-06-11 — every post-clean-slate publish failed on this).
const dir = path.join('docs', 'library', kind === 'tones' ? 'patches' : 'sequences');
fs.mkdirSync(dir, { recursive: true });
const hash = contentHash(kind, payload);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  try {
    const existing = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (contentHash(kind, existing) === hash) {
      await needsReview(`this exact content is already in the catalog as \`${f}\``);
    }
  } catch { /* index.json (Liquid front matter) won't parse — fine */ }
}

// Unique id: slug, suffixed on collision.
const yamlPath = path.join('docs', '_data', `${kind === 'tones' ? 'patches' : 'sequences'}.yml`);
const yamlText = fs.readFileSync(yamlPath, 'utf8');
const takenIds = new Set([...yamlText.matchAll(/^- id: (.+)$/gm)].map((m) => m[1].trim()));
const id = uniqueId(lendName, takenIds);

// Write payload + catalog entry.
const filePath = path.join(dir, `${id}.json`);
fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
const size = fs.statSync(filePath).size;
const entry = `
- id: ${id}
  name: ${yamlQuote(lendName)}
  author: ${yamlQuote(author)}
  hometown: ${yamlQuote(hometown)}
  description: ${yamlQuote(notes || `Lent by ${author}.`)}
  added: ${new Date().toISOString().slice(0, 10)}
  file: /library/${kind === 'tones' ? 'patches' : 'sequences'}/${id}.json
  size_bytes: ${size}
  tags: []
  audio_preview: null${lendTokenHash ? `
  token_hash: ${lendTokenHash}` : ''}
`;
fs.appendFileSync(yamlPath, entry);

// Final gate: the same consistency test that guards manual curation.
execFileSync('node', ['--test', 'test/community-catalog.test.js'], { stdio: 'inherit' });

// Commit + push (Pages deploys the site + manifest from this).
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('git', ['config', 'user.name', 'github-actions[bot]']);
run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
run('git', ['add', filePath, yamlPath]);
run('git', ['commit', '-m', `catalog: auto-publish lending request #${ISSUE} — ${lendName}`]);
try { run('git', ['push']); }
catch { run('git', ['pull', '--rebase']); run('git', ['push']); }

await comment(
  `✅ **Auto-published!** *${lendName}* passed validation and is rolling out now — ` +
  `live at https://jx-3p.com/${kind === 'tones' ? 'patches' : 'sequences'}/ ` +
  'and in the in-app lending library within a couple of minutes. Thanks for lending!');
await gh(`/issues/${ISSUE}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
console.log(`published ${id} (${size} bytes)`);
