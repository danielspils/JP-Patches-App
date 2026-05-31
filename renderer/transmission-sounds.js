// Tape Dump Sounds — play the raw FSK out the Mac's built-in speakers,
// in parallel with the cable, so the user HEARS the tape dump happening
// (1980s-cassette-backup style). Pure delight feature; see the full spec
// in docs/future-features.md ("Tape Dump Sounds").
//
// ── Design principle: NEVER able to affect the real transmission ──
// The cable channel (Mac → JX) is the only one that matters. This feature
// must not be able to corrupt it. So:
//   - The playback uses a COMPLETELY SEPARATE <audio> element that only
//     shares the temp-WAV file URL with the transmission. It does not wrap
//     the transmission <audio> in a MediaElementSource, does not join its
//     AudioContext, and mutates no shared state.
//   - Every browser-side step is wrapped in try/catch with SILENT FAIL:
//     any error (setSinkId rejects, enumerateDevices throws, load fails)
//     is logged and swallowed; the transfer proceeds untouched.
//   - No automated library.json writes from here. The user is the sole
//     mutator of the enabled flag (via the View menu, handled elsewhere).
//
// ── The catastrophic outcome we guard against ──
// The one genuinely-bad scenario: this second stream gets routed to the
// USB cable, doubling the FSK and corrupting the transfer. TWO independent
// guards in selectTapeDumpSpeaker prevent it:
//   1. ALLOWLIST — only outputs whose label is EXACTLY a known Mac
//      built-in speaker name are eligible. No 'default' fallback, no
//      "any non-cable output" fallback. No match → no sound.
//   2. CABLE EXCLUSION — even on an allowlist match, hard-reject if the
//      device is the one Send is using for the cable.
// A third implicit guard lives in maybePlayTapeDumpSound: if setSinkId is
// unavailable we DO NOT play at all (a sink-less <audio> would go to the
// system default output, which could BE the cable).
//
// Loaded via a plain <script> tag in renderer/index.html before app.js,
// so the globals here are visible at app.js execution time. Also exports
// via module.exports so the pure selector can be unit-tested in Node.

(function () {
  'use strict';

  // Exact-match allowlist for Apple built-in speaker device labels. The
  // `$ Speakers$` anchor is deliberate: it excludes the enumerateDevices
  // "Default - MacBook Pro Speakers" duplicate (which carries a
  // "Default - " prefix) so we never resolve to the ambiguous 'default'
  // sink. Covers the current Mac lineup; the power-user picker for
  // headless / external-speaker setups is a deferred phase.
  const MAC_SPEAKER_LABEL_RE =
    /^(MacBook( Pro| Air)?|iMac|Mac mini|Mac Studio|Studio Display) Speakers$/;

  /**
   * Pick the eligible Mac built-in speaker to play tape-dump sound out of,
   * or null if none qualifies. PURE — no DOM, no side effects — so it's
   * unit-testable and carries the two safety guards.
   *
   * @param {Array<{kind?: string, label?: string, deviceId?: string}>} devices
   *   Output of navigator.mediaDevices.enumerateDevices() (or a stub).
   * @param {string | null | undefined} cableDeviceId
   *   The deviceId Send-to-JX is using for the cable. Excluded from the
   *   result even if its label matches the allowlist.
   * @returns {{kind: string, label: string, deviceId: string} | null}
   *   The first eligible audiooutput, or null if none.
   */
  function selectTapeDumpSpeaker(devices, cableDeviceId) {
    if (!Array.isArray(devices)) return null;
    for (const d of devices) {
      if (!d || d.kind !== 'audiooutput') continue;
      // A device with no usable id can't be targeted with setSinkId, and a
      // null id would also spuriously "equal" a null cableDeviceId — skip.
      if (!d.deviceId) continue;
      if (typeof d.label !== 'string' || !MAC_SPEAKER_LABEL_RE.test(d.label)) continue;
      // Guard 2: never the cable, no matter what its label says.
      if (d.deviceId === cableDeviceId) continue;
      return d;
    }
    return null;
  }

  // Handle to the currently-playing tape-dump <audio>, so stop can pause
  // it. Module-scope single-stream — we only ever play one at a time.
  let activeSound = null;

  /**
   * Best-effort play the temp WAV out the Mac built-in speakers, quietly,
   * in parallel with the cable. SILENT-FAIL: returns null on any problem
   * (disabled, no eligible device, setSinkId missing/rejects, load error)
   * and never throws — the caller's transmission must be unaffected.
   *
   * Browser-only (uses navigator/Audio); not exercised by the Node tests.
   *
   * @param {Object} opts
   * @param {string}  opts.tempWavPath   file URL/path of the temp dump WAV
   *   (the SAME file the transmission plays — shared by URL only).
   * @param {string | null} opts.cableDeviceId  device Send is using.
   * @param {boolean} opts.enabled       library.transmissionSounds.enabled
   * @param {boolean} [opts.muted=false] per-modal mute toggle state.
   * @param {number}  [opts.volume=0.3]  playback volume (0..1), low default.
   * @returns {Promise<HTMLAudioElement | null>}
   */
  async function maybePlayTapeDumpSound(opts) {
    const o = opts || {};
    if (!o.enabled) return null;
    try {
      if (typeof navigator === 'undefined'
          || !navigator.mediaDevices
          || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        return null;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const speaker = selectTapeDumpSpeaker(devices, o.cableDeviceId);
      if (!speaker) return null;                      // no eligible device → silent skip

      const a = new Audio(o.tempWavPath);
      a.volume = o.muted ? 0 : (typeof o.volume === 'number' ? o.volume : 0.3);

      // Routing guard: without setSinkId we can't GUARANTEE this goes to
      // the speaker (it would fall to the system default output, which
      // might be the cable). So we refuse to play rather than risk it.
      if (typeof a.setSinkId !== 'function') return null;
      await a.setSinkId(speaker.deviceId);            // throws → caught → no play

      await a.play();
      activeSound = a;
      return a;
    } catch (err) {
      console.warn('[transmission-sounds] skipped:', (err && err.name) || err);
      return null;
    }
  }

  /**
   * Stop + release the active tape-dump sound, if any. Silent-fail.
   */
  function stopTapeDumpSound() {
    try {
      if (activeSound) {
        activeSound.pause();
        activeSound.src = '';
        activeSound = null;
      }
    } catch (err) {
      console.warn('[transmission-sounds] cleanup failed:', (err && err.name) || err);
      activeSound = null;
    }
  }

  // Module API — window globals for app.js (loaded after this file).
  if (typeof window !== 'undefined') {
    window.selectTapeDumpSpeaker  = selectTapeDumpSpeaker;
    window.maybePlayTapeDumpSound = maybePlayTapeDumpSound;
    window.stopTapeDumpSound      = stopTapeDumpSound;
    window.MAC_SPEAKER_LABEL_RE   = MAC_SPEAKER_LABEL_RE;
  }
  // Node require() for unit tests (only the pure selector + regex run).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      selectTapeDumpSpeaker,
      maybePlayTapeDumpSound,
      stopTapeDumpSound,
      MAC_SPEAKER_LABEL_RE,
    };
  }
})();
