// Process a lending-library withdraw request (issue → catalog removal).
//
// Runs inside .github/workflows/lending-withdraw.yml on issues labeled
// community-withdraw. The issue carries a sha256 of the lender's secret
// token; publish-lend.mjs stored the same hash in the catalog YAML at
// publish time. Match → remove the entry + payload → consistency test →
// push → close with a receipt. No match → needs-review for a human.
//
// Trust model: the workflow only runs this for issues AUTHORED BY THE
// REPO OWNER (i.e. relay-filed via Daniel's PAT). The hash is public in
// the YAML, but a stranger filing their own [Withdraw] issue with a
// copied hash is never processed — wrong author.
//
// Env: ISSUE_NUMBER, GITHUB_REPOSITORY, GH_TOKEN.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { findEntryByTokenHash } from './lend-publish-lib.mjs';

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

async function needsReview(reason) {
  await comment(`⚠️ **Not auto-removed:** ${reason}\n\nLeaving open with \`needs-review\`.`);
  await gh(`/issues/${ISSUE}/labels`, {
    method: 'POST', body: JSON.stringify({ labels: ['needs-review'] }),
  });
  console.log(`needs-review: ${reason}`);
  process.exit(0);
}

const issue = await gh(`/issues/${ISSUE}`);
if (issue.state !== 'open') { console.log('issue not open'); process.exit(0); }

const m = (issue.body || '').match(/\*\*Token hash:\*\* ([a-f0-9]{64})/);
if (!m) await needsReview('no token hash found in the request');
const hash = m[1];

// Find the catalog entry carrying this token_hash.
let found = null;
for (const kind of ['patches', 'sequences']) {
  const yamlPath = `docs/_data/${kind}.yml`;
  const match = findEntryByTokenHash(fs.readFileSync(yamlPath, 'utf8'), hash);
  if (match) { found = { kind, yamlPath, ...match }; break; }
}
if (!found) {
  await needsReview(
    'no catalog entry matches this token — either it was published before ' +
    'withdraw support (no stored token hash), already removed, or never published');
}

// Remove the YAML block + payload file.
const yamlText = fs.readFileSync(found.yamlPath, 'utf8');
fs.writeFileSync(found.yamlPath, yamlText.replace(found.block, ''));
const payloadPath = `docs/library/${found.kind}/${found.id}.json`;
if (fs.existsSync(payloadPath)) fs.unlinkSync(payloadPath);

// Consistency gate, then ship.
execFileSync('node', ['--test', 'test/community-catalog.test.js'], { stdio: 'inherit' });
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('git', ['config', 'user.name', 'github-actions[bot]']);
run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
run('git', ['add', found.yamlPath, payloadPath]);
run('git', ['commit', '-m', `catalog: withdraw lending entry '${found.id}' (request #${ISSUE})`]);
try { run('git', ['push']); }
catch { run('git', ['pull', '--rebase']); run('git', ['push']); }

await comment(
  `✅ **Removed.** \`${found.id}\` is out of the lending library — the site and ` +
  'in-app catalog update within a couple of minutes. (Hearts/borrow counts in ' +
  'KV are left behind harmlessly.)');
await gh(`/issues/${ISSUE}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
console.log(`withdrew ${found.id}`);
