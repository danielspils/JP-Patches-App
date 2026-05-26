// Web Audio acquisition helpers for Record-from-JX captures.
//
// Encapsulates the constraint-fallback dance for getUserMedia so the
// modal's startRecording doesn't have to. The strict-constraints path
// disables Chromium's voice-call DSP (echo cancel, AGC, noise gate,
// high-pass) — those silently mangle the JX-3P's FSK carrier and
// break decoder lock. The `{exact: false}` form forces the disables;
// the legacy `googXxx` flags catch older Chromium versions that
// ignored the standard names.
//
// Some devices (rare) report they can't comply with `{exact: false}`
// and throw OverconstrainedError. We fall back to the soft form so
// the user can at least record (degraded quality, but useful for the
// level meter and for troubleshooting). The unfallback case — both
// strict + soft fail — rejects with the underlying error.
//
// This module is browser-only (uses navigator.mediaDevices); it's not
// imported by the Node test runner. The single exported function is
// exposed as window.acquireRawAudioStream so app.js can use it.

(function () {
  'use strict';

  // The strict constraint set — all the audio processing disabled.
  // FSK captures NEED this; without it, the carrier comes back
  // partially filtered and every checksum fails.
  function strictConstraints(deviceId) {
    return {
      audio: {
        deviceId:                 deviceId ? { exact: deviceId } : undefined,
        echoCancellation:         { exact: false },
        noiseSuppression:         { exact: false },
        autoGainControl:          { exact: false },
        googEchoCancellation:     false,
        googAutoGainControl:      false,
        googNoiseSuppression:     false,
        googHighpassFilter:       false,
        googTypingNoiseDetection: false,
        channelCount:             1,
        sampleRate:               44100,
      },
    };
  }

  // The soft constraint set — Chromium treats `false` as a preference
  // here, not an absolute. The device may still apply some processing.
  // Used only as a last resort when strict throws OverconstrainedError.
  function softConstraints(deviceId) {
    return {
      audio: {
        deviceId:         deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl:  false,
        channelCount:     1,
        sampleRate:       44100,
      },
    };
  }

  // Acquire a MediaStream for the given audio input device, preferring
  // the strict constraint set but falling back to soft constraints if
  // the device rejects strict (OverconstrainedError). Returns a Promise
  // resolving to { mediaStream, usedFallback: boolean } so callers can
  // log the fallback case for debugging if needed.
  //
  // Errors: rejects with whatever getUserMedia rejected with on the
  // soft fallback path. Callers should surface the failure to the user
  // (permission denied, device disconnected, etc.).
  async function acquireRawAudioStream(deviceId) {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(strictConstraints(deviceId));
      return { mediaStream, usedFallback: false };
    } catch (err) {
      console.warn('Strict raw-audio constraints failed, falling back:', err && err.name);
      const mediaStream = await navigator.mediaDevices.getUserMedia(softConstraints(deviceId));
      return { mediaStream, usedFallback: true };
    }
  }

  // Module API. Browser-only — no module.exports since this is not
  // unit-tested in Node (the implementation is pure-glue over the
  // Web Audio API, which doesn't exist in the Node test runner).
  if (typeof window !== 'undefined') {
    window.acquireRawAudioStream = acquireRawAudioStream;
  }
})();
