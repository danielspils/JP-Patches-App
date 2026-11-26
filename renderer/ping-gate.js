// Pure decisions for the anonymous usage ping (renderer/app.js
// maybeSendUsagePing). No DOM, no IPC; unit-tested in test/ping-gate.test.js.
//
// It lives out here because app.js is 12k lines and untested, and these are
// the rules a mistake would be expensive in: ping before the notice, ping
// after an opt-out, or report an existing user as a new install.
(() => {
  // HAS THIS INSTALL ALREADY BEEN COUNTED AS NEW?
  //
  // DERIVED, NOT MIGRATED. installCounted did not exist before this release,
  // so every library already out there lacks it — and every one of those that
  // has ever pinged belongs to somebody who installed the app before
  // new-install counting existed. They are not new. A schema migration could
  // stamp them, but one that failed to run, or ran on a library restored from
  // an older backup, would report a long-standing user as a fresh install and
  // nothing afterwards could tell. Deriving it from lastPing cannot go wrong
  // that way: a library with a lastPing is counted, full stop.
  //
  // The flag is still written on success, because lastPing is a DATE and says
  // nothing on its own about whether a first-launch ping was ever accepted.
  function isCounted(telemetry) {
    const t = telemetry || {};
    return t.installCounted === true || typeof t.lastPing === 'string';
  }

  // WHAT TO DO ON LAUNCH. -> { send: false } | { send: true, first: boolean }
  //
  // `first` rides the ping the install sends anyway rather than being a second
  // request, so an install that never gets to ping is never counted — which is
  // correct: counting installs at launch counts people who RAN the app, as
  // against the download counters, which bots inflate.
  function planPing(telemetry, today, inFlight) {
    const t = telemetry || {};
    if (!t.noticeSeen) return { send: false };          // never before the notice
    if (t.enabled === false) return { send: false };    // opted out
    if (t.lastPing === today) return { send: false };   // already counted today
    if (inFlight) return { send: false };               // one attempt at a time
    return { send: true, first: !isCounted(t) };
  }

  // WHAT TO WRITE BACK after a CONFIRMED success, merged onto telemetry by the
  // caller. A failed send writes nothing, so it retries next launch and is
  // still first — the flag is consumed by a successful send, never by an
  // attempt.
  function afterSuccess(today) {
    return { lastPing: today, installCounted: true };
  }

  // THE BODY MAIN PUTS ON THE WIRE. Here rather than inline in main.js so the
  // `first === true` rule is TESTED and has exactly one definition — main.js
  // has no tests, and two copies of a validation rule is how one of them
  // quietly loosens.
  //
  // Read as a literal true and nothing else: the relay counts `first` as a new
  // install, so a truthy-but-not-true value ('yes', 1, {}) arriving through a
  // bug would inflate the count with no way to tell afterwards. Absent or
  // anything else and the body is byte-for-byte what it was before new-install
  // counting shipped.
  function pingBody(platform, version, opts) {
    const first = !!(opts && opts.first === true);
    return first ? { platform, version, first: true } : { platform, version };
  }

  const exports = { isCounted, planPing, afterSuccess, pingBody };
  if (typeof window !== 'undefined') Object.assign(window, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})();
