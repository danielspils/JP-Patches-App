// What the relay counts as a download-button press.
//
// relay/worker.js had no tests, and it is the only component a stranger can
// reach. This covers the one decision in it that changes a published number.
// The same file exists in this-seven-goes-to-eleven; keep them in step.

const test = require('node:test');
const assert = require('node:assert');

const libP = import('../relay/worker.js');

// Real strings, from this relay's own /download/agents fingerprints on
// 2026-11-04. Every mobile agent pressed BOTH buttons exactly once; the only
// uneven splits were desktop.
const MOBILE = [
  'Mozilla/5.0 (Linux; Android 4.4.2; 4024D) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Mozilla/5.0 (Linux; Android 10; SM-A715F) AppleWebKit/537.36',
  'Mozilla/5.0 (Linux; Android 9; BND-L21 Build/HONORBND-L21) AppleWebKit/537.36',
  'Mozilla/5.0 (Linux; U; Android 9; it-it; Redmi Note 7 Build/PKQ1) AppleWebKit/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15',
  'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
];

const DESKTOP = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130',
  'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:60.0) Gecko/20100101 Firefox/60.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
];

const ANNOUNCED_BOTS = [
  'Googlebot/2.1 (+http://www.google.com/bot.html)',
  'curl/8.4.0',
  'python-requests/2.31.0',
  'HeadlessChrome/120.0.0.0',
];

test('a phone is never a press — the installer does not run there', async () => {
  const { countsAsPress } = await libP;
  for (const ua of MOBILE) assert.equal(countsAsPress(ua), false, ua);
});

test('anything without a Mozilla/ token is a program, named or not', async () => {
  // Found 9 Nov 2026 in this relay's own fingerprints: MSH PDFMIN/1 pressing
  // both buttons on both sites, announcing nothing DL_BOT_RE could match.
  const { countsAsPress } = await libP;
  for (const ua of ['MSH PDFMIN/1', 'riverbot/1.0 (https://river.ai/bot)', 'SomeAgent/3.1']) {
    assert.equal(countsAsPress(ua), false, ua);
  }
});

test('a desktop browser is a press', async () => {
  const { countsAsPress } = await libP;
  for (const ua of DESKTOP) assert.equal(countsAsPress(ua), true, ua);
});

test('agents that announce themselves are not presses', async () => {
  const { countsAsPress } = await libP;
  for (const ua of ANNOUNCED_BOTS) assert.equal(countsAsPress(ua), false, ua);
});

test('no user-agent at all is not a person', async () => {
  const { countsAsPress } = await libP;
  assert.equal(countsAsPress(''), false);
  assert.equal(countsAsPress(null), false);
  assert.equal(countsAsPress(undefined), false);
});

test('desktop Safari is not caught by the mobile pattern', async () => {
  const { countsAsPress } = await libP;
  assert.equal(countsAsPress(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  ), true);
});

// ── The wiring, not just the rule ─────────────────────────────────────
// Filtered requests must never reach an asset URL: GitHub counts every asset
// fetch with no filter, which is how bots inflated "All downloads". Same
// tests as this-seven-goes-to-eleven/scripts/press-filter.test.mjs.

const fakeEnv = () => {
  const store = new Map();
  return {
    HEARTS: {
      get: async (k) => (store.has(k) ? store.get(k) : null),
      put: async (k, v) => { store.set(k, v); },
      list: async () => ({ keys: [], list_complete: true }),
    },
    _store: store,
  };
};
const fakeCtx = () => ({ waitUntil: () => {} });
// A real click: browsers mark it Sec-Fetch-Mode: navigate. Pass null to
// model a script that fakes the user agent but not the navigation.
const req = (ua, mode = 'navigate') => ({
  headers: { get: (h) => ({ 'user-agent': ua, 'sec-fetch-mode': mode })[h.toLowerCase()] ?? null },
  cf: { country: 'SE' },
});
const dlKeys = (env) => [...env._store.keys()].filter((k) => k.startsWith('dl:') || k.startsWith('dlm:'));

for (const ua of [MOBILE[1], 'MSH PDFMIN/1', '', ANNOUNCED_BOTS[0]]) {
  test(`a filtered agent gets the releases page, never the installer: ${JSON.stringify(ua)}`, async () => {
    const { handleDownload } = await libP;
    const env = fakeEnv();
    const res = await handleDownload(req(ua), env, fakeCtx(), 'mac');
    assert.equal(res.status, 302, 'nobody is refused');
    assert.match(res.headers.get('location'), /\/releases\/latest$/);
    assert.deepEqual(dlKeys(env), [], 'nothing was counted');
  });
}

test('a desktop press gets the Mac installer and is counted', async () => {
  const { handleDownload } = await libP;
  const env = fakeEnv();
  const res = await handleDownload(req(DESKTOP[0]), env, fakeCtx(), 'mac');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/releases\/latest\/download\/JP-Patches\.dmg$/);
  assert.ok(dlKeys(env).some((k) => k.startsWith('dl:') && k.endsWith(':mac:SE')), 'counted');
});

test('a desktop browser on Tor is treated as filtered: releases page, not counted', async () => {
  const { handleDownload } = await libP;
  const env = fakeEnv();
  const torReq = { ...req('Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0'), cf: { country: 'T1' } };
  const res = await handleDownload(torReq, env, fakeCtx(), 'mac');
  assert.match(res.headers.get('location'), /\/releases\/latest$/);
  assert.deepEqual(dlKeys(env), [], 'nothing was counted');
});

test('a desktop agent without a real click gets the releases page and is not counted', async () => {
  const { handleDownload } = await libP;
  const env = fakeEnv();
  const res = await handleDownload(req(DESKTOP[1], null), env, fakeCtx(), 'mac');
  assert.match(res.headers.get('location'), /\/releases\/latest$/);
  assert.deepEqual(dlKeys(env), [], 'nothing was counted');
});

// ── New installs: first: true on the app's first-ever ping ────────────
const pingReq = (body) => ({ json: async () => body, headers: { get: () => null }, cf: { country: 'SE' } });
const inKeys = (env) => [...env._store.keys()].filter((k) => k.startsWith('in:') || k.startsWith('inm:'));

test('a first ping counts one new install, daily and monthly', async () => {
  const { handlePing } = await libP;
  const env = fakeEnv();
  const res = await handlePing(pingReq({ platform: 'mac', version: '0.9.0', first: true }), env, fakeCtx());
  assert.equal(res.status, 200);
  assert.equal(inKeys(env).length, 2);
  for (const k of inKeys(env)) assert.equal(env._store.get(k), '1');
});

test('an ordinary ping, or a first that is not literally true, counts no install', async () => {
  const { handlePing } = await libP;
  for (const first of [undefined, false, 'true', 1]) {
    const env = fakeEnv();
    await handlePing(pingReq({ platform: 'win', version: '0.9.0', first }), env, fakeCtx());
    assert.deepEqual(inKeys(env), [], `first=${JSON.stringify(first)}`);
  }
});
