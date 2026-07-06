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

  // Are we on Windows? Detect from the UA/platform string, which carries
  // "Windows NT" in the Electron renderer but resolves to "Node.js/…" under
  // the Node test runner — so the unit tests always exercise the macOS
  // allowlist regardless of which OS runs them.
  const IS_WIN = (() => {
    try {
      const nav = (typeof navigator !== 'undefined' && navigator) || null;
      const ua = nav ? (nav.userAgent || nav.platform || '') : '';
      return /Windows|Win32|Win64/i.test(ua);
    } catch { return false; }
  })();

  // Allowlist for Apple built-in speaker device labels. Anchored to the
  // model name + " Speakers", with an OPTIONAL " (Built-in)" transport
  // suffix — which is what Chromium's enumerateDevices actually appends
  // (e.g. "MacBook Pro Speakers (Built-in)"); the bare form is kept for
  // the labels-not-yet-revealed edge. The leading anchor excludes the
  // "Default - …" alias (no 'default' fallback), and restricting the
  // suffix to exactly "(Built-in)" keeps the cable ("KT USB Audio
  // (31b2:2024)") and virtual devices ("… (Virtual)") out. Studio Display
  // / external-monitor speakers (USB transport, not Built-in) are the
  // deferred power-user-picker case — intentionally not matched here.
  const MAC_SPEAKER_RE =
    /^(MacBook( Pro| Air)?|iMac|Mac mini|Mac Studio|Studio Display) Speakers( \(Built-in\))?$/;

  // Windows built-in-output allowlist, tuned against a real test laptop
  // (2026-07-04). CRITICAL: it must match the onboard speakers but NEVER a USB
  // audio cable — and Windows names BOTH generically, e.g. built-in "Speakers
  // (2- Realtek(R) Audio)" vs the KT cable "Speakers (KT USB Audio)". So we
  // match the built-in *vendor/driver* keywords (Realtek / High Definition
  // Audio / Internal / Built-in) and deliberately DROP the bare "Speakers"/
  // "Headphones" words, which the USB cable also carries. Matching the cable
  // here is what let the tape-dump monitor grab the cable and truncate a
  // JP→JX send (bank D dropped); the vendor-keyword match is what prevents it.
  const WIN_SPEAKER_RE =
    /(Realtek|High Definition Audio|Internal Speaker|Built-in)/i;

  // The active allowlist for THIS platform, published under the historical
  // MAC_SPEAKER_LABEL_RE name so every downstream reader (selectTapeDumpSpeaker,
  // isBuiltInSpeakerOutput, app.js, the export, the tests) keeps working.
  const MAC_SPEAKER_LABEL_RE = IS_WIN ? WIN_SPEAKER_RE : MAC_SPEAKER_RE;

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
  /**
   * Pick the output device to play APP SOUNDS through (tape-dump monitor,
   * button clicks, sequencer preview) — the ONE rule: never the transfer cable.
   *
   * Rather than try to RECOGNIZE the built-in speakers by name (a losing game —
   * Realtek / Conexant / Cirrus / Intel / "High Definition Audio" / countless
   * OEM variants), we EXCLUDE the cable the user configured and take what's
   * left. The cable is excluded by its whole physical device: Windows lists one
   * device up to 3× (Default / Communications / raw) with different deviceIds
   * but the SAME groupId, so groupId is the reliable "same device" key (exact
   * deviceId + base-label are fallbacks). OS role-alias entries are skipped so
   * we always target a concrete device, never the ambiguous default sink (which
   * during a send IS the cable).
   *
   * The name allowlist is kept as a PREFERENCE: if a recognized built-in
   * speaker is present it wins. `allowUnrecognizedFallback` (Windows) then
   * takes the first non-cable output when nothing is recognized — better a
   * real speaker than silence. macOS leaves it off (short, stable speaker list;
   * strict allowlist avoids routing to random externals).
   *
   * @param {Array} devices  enumerateDevices() output
   * @param {string|null|undefined} cableDeviceId  the configured transfer device
   * @param {{allowUnrecognizedFallback?: boolean}} [opts]
   * @returns {{kind,label,deviceId,groupId}|null}
   */
  function selectSoundOutputDevice(devices, cableDeviceId, opts) {
    if (!Array.isArray(devices)) return null;
    const allowFallback = !!(opts && opts.allowUnrecognizedFallback);

    // Resolve the cable's physical identity so ALL its aliases are excluded.
    // groupId is the reliable "same physical device" key (Chromium tags every
    // alias of one device with it); exact deviceId is the other. We deliberately
    // do NOT match by label — two DISTINCT devices can share a label (e.g. a
    // cable a user renamed "Speakers"), and label-matching would wrongly
    // exclude the real speaker too.
    const cableDev = cableDeviceId
      ? devices.find((d) => d && d.deviceId === cableDeviceId)
      : null;
    const cableGroup = cableDev && cableDev.groupId ? cableDev.groupId : null;
    const isCable = (d) =>
      (cableDeviceId && d.deviceId === cableDeviceId) ||
      (cableGroup && d.groupId && d.groupId === cableGroup);

    // Eligible = a concrete (non-role-alias) audiooutput that isn't the cable.
    const eligible = (d) => {
      if (!d || d.kind !== 'audiooutput' || !d.deviceId) return false;
      if (d.deviceId === 'default' || d.deviceId === 'communications') return false;
      if (/^(Default|Communications) - /.test(d.label || '')) return false;
      return !isCable(d);
    };

    // Prefer a recognized built-in speaker.
    const recognized = devices.find((d) => eligible(d)
      && typeof d.label === 'string' && MAC_SPEAKER_LABEL_RE.test(d.label));
    if (recognized) return recognized;

    // Fallback (Windows): any non-cable output beats a silent monitor.
    return allowFallback ? (devices.find((d) => eligible(d)) || null) : null;
  }

  // Back-compat wrapper: the tape-dump monitor's speaker pick. Windows gets the
  // unrecognized-name fallback; macOS stays strict.
  function selectTapeDumpSpeaker(devices, cableDeviceId) {
    return selectSoundOutputDevice(devices, cableDeviceId, { allowUnrecognizedFallback: IS_WIN });
  }

  /**
   * Is this output-device label one of the Mac's built-in speakers? Used by
   * the Send modal to warn when the transfer's output IS the speakers (the
   * FSK would blast out the speakers and the JX would receive nothing — the
   * classic "interface got unplugged" case). PURE / unit-tested.
   *
   * Strips the enumerateDevices "Default - " alias prefix (the default output
   * is reported as e.g. "Default - MacBook Pro Speakers (Built-in)") so the
   * allowlist can match the underlying device name.
   *
   * @param {string} label  an audiooutput device label
   * @returns {boolean}
   */
  function isBuiltInSpeakerOutput(label) {
    if (typeof label !== 'string') return false;
    return MAC_SPEAKER_LABEL_RE.test(label.replace(/^Default - /, ''));
  }

  // Handle to the currently-playing tape-dump <audio>, so stop can pause
  // it. Module-scope single-stream — we only ever play one at a time.
  let activeSound = null;
  // Base (unmuted) volume + mute state of the active sound, so the live
  // slider + mute toggle can adjust it mid-transmission. Set per-play from
  // opts; the initializers are just pre-play placeholders.
  let activeVolume = 0.0025;
  let activeMuted = false;

  // Apply the current volume/mute state to the live element (no-op if none).
  function applyActiveVolume() {
    if (activeSound) activeSound.volume = activeMuted ? 0 : activeVolume;
  }

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
   * @param {number}  [opts.volume=0.0025]  playback volume (0..1), low default.
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
      activeVolume = (typeof o.volume === 'number' ? o.volume : 0.0025);
      activeMuted  = !!o.muted;
      a.volume = activeMuted ? 0 : activeVolume;

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
   * Live-mute/unmute the active tape-dump sound (the Send modal's mute
   * icon toggles this mid-transmission). No-op if nothing is playing.
   * Silent-fail. @param {boolean} muted
   */
  function setTapeDumpSoundMuted(muted) {
    try { activeMuted = !!muted; applyActiveVolume(); }
    catch (err) { console.warn('[transmission-sounds] mute toggle failed:', (err && err.name) || err); }
  }

  /**
   * Live-set the active tape-dump sound volume (the Send modal's slider
   * drives this). Respects the current mute state. No-op if nothing is
   * playing. Silent-fail. @param {number} volume 0..1
   */
  function setTapeDumpSoundVolume(volume) {
    try {
      if (typeof volume === 'number') activeVolume = Math.max(0, Math.min(1, volume));
      applyActiveVolume();
    } catch (err) {
      console.warn('[transmission-sounds] volume set failed:', (err && err.name) || err);
    }
  }

  /**
   * Live-monitor a capture graph out the Mac built-in speakers — the
   * Record-from-JX counterpart: hear the dump coming IN from the JX. Taps the
   * given AudioNode (the capture session's gain node), routes a volume-
   * controlled copy through a MediaStreamDestination → a separate <audio>
   * element → setSinkId(built-in speaker). SILENT-FAIL.
   *
   * Built-in-speaker routing is MANDATORY here, not just nice: during Record
   * the KT is the INPUT but also a possible OUTPUT, so monitoring via the
   * system default could feed audio back into the JX's tape input mid-dump.
   * selectTapeDumpSpeaker's allowlist guarantees we only ever hit the Mac's
   * own speakers — never the cable. The tap also never touches the capture's
   * own nodes beyond adding one outgoing connection we later disconnect, so
   * it cannot affect capture quality.
   *
   * Browser-only (Web Audio + Audio); not exercised by the Node tests.
   *
   * @param {Object} opts
   * @param {AudioContext} opts.audioContext  the capture session's context
   * @param {AudioNode}    opts.sourceNode    node to tap (the gain node)
   * @param {string|null}  opts.cableDeviceId belt-and-suspenders exclusion
   * @param {boolean}      opts.enabled
   * @param {boolean}      [opts.muted=false]
   * @param {number}       [opts.volume=0.0025]
   * @returns {Promise<{stop:Function,setVolume:Function,setMuted:Function}|null>}
   */
  async function startTapeDumpMonitor(opts) {
    const o = opts || {};
    if (!o.enabled) return null;
    // The RECORD-side monitor plays the LIVE capture input out a speaker while
    // recording. It was gated off on Windows (2026-07-05) over a feared feedback
    // loop, but the actual path was the monitor being routed OUT the KT cable
    // itself (label collision) → back into the JX. Two fixes now close that:
    //   1. Cable-exclusion by groupId/id (selectSoundOutputDevice + the caller
    //      passing the real cableDeviceId) → the monitor can never pick the KT.
    //   2. The KT is a direct LINE cable, not a mic, so built-in-speaker audio
    //      can't acoustically re-enter the exact-device capture; and Fix 2's
    //      frequency gate keys on the bit-0 FSK, not stray level.
    // If no eligible non-cable speaker is found the monitor silently no-ops
    // (returns null below), so the worst case on any platform is "no monitor,"
    // never feedback. Re-enabled on Windows; verify on hardware.  (Task #21.)
    try {
      const ctx = o.audioContext;
      if (!ctx || !o.sourceNode || typeof ctx.createMediaStreamDestination !== 'function') return null;
      if (typeof navigator === 'undefined'
          || !navigator.mediaDevices
          || typeof navigator.mediaDevices.enumerateDevices !== 'function') return null;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const speaker = selectTapeDumpSpeaker(devices, o.cableDeviceId);
      if (!speaker) return null;                          // no eligible speaker → silent skip

      let vol   = (typeof o.volume === 'number' ? o.volume : 0.0025);
      let muted = !!o.muted;
      const monGain = ctx.createGain();
      monGain.gain.value = muted ? 0 : vol;
      const dest = ctx.createMediaStreamDestination();
      o.sourceNode.connect(monGain);
      monGain.connect(dest);

      const a = new Audio();
      a.srcObject = dest.stream;
      a.volume = 1;                                       // level controlled by monGain
      // Routing guard: without setSinkId we can't guarantee built-in speakers
      // (it'd fall to the system default, which might be the KT → feedback).
      if (typeof a.setSinkId !== 'function') {
        try { o.sourceNode.disconnect(monGain); } catch {}
        return null;
      }
      await a.setSinkId(speaker.deviceId);                // throws → caught → cleaned up below
      await a.play();

      const apply = () => { monGain.gain.value = muted ? 0 : vol; };
      return {
        stop() {
          try { a.pause(); a.srcObject = null; } catch {}
          try { monGain.disconnect(); } catch {}
          try { o.sourceNode.disconnect(monGain); } catch {}
        },
        setVolume(v) { if (typeof v === 'number') vol = Math.max(0, Math.min(1, v)); apply(); },
        setMuted(m)  { muted = !!m; apply(); },
      };
    } catch (err) {
      console.warn('[transmission-sounds] monitor skipped:', (err && err.name) || err);
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
    window.selectTapeDumpSpeaker   = selectTapeDumpSpeaker;
    window.selectSoundOutputDevice = selectSoundOutputDevice;
    window.isBuiltInSpeakerOutput  = isBuiltInSpeakerOutput;
    window.maybePlayTapeDumpSound  = maybePlayTapeDumpSound;
    window.setTapeDumpSoundMuted   = setTapeDumpSoundMuted;
    window.setTapeDumpSoundVolume  = setTapeDumpSoundVolume;
    window.startTapeDumpMonitor    = startTapeDumpMonitor;
    window.stopTapeDumpSound       = stopTapeDumpSound;
    window.MAC_SPEAKER_LABEL_RE    = MAC_SPEAKER_LABEL_RE;
  }
  // Node require() for unit tests (only the pure helpers + regex run).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      selectTapeDumpSpeaker,
      selectSoundOutputDevice,
      isBuiltInSpeakerOutput,
      maybePlayTapeDumpSound,
      setTapeDumpSoundMuted,
      setTapeDumpSoundVolume,
      startTapeDumpMonitor,
      stopTapeDumpSound,
      MAC_SPEAKER_LABEL_RE,
    };
  }
})();
