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
