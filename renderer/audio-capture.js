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

  // Build the audio-processing node graph for a Record-from-JX
  // capture. Takes an already-created AudioContext + already-acquired
  // MediaStream (callers handle those because the AudioContext needs
  // a try/catch wrapper for the sampleRate constraint and the stream
  // needs acquireRawAudioStream's fallback dance) and wires up the
  // full processing chain:
  //
  //   sourceNode  → gainNode  ┬─→ analyserNode    (live peak meter)
  //                           └─→ processorNode → muteGain → destination
  //                                              (PCM capture buffer)
  //
  // The muteGain is at value=0 so nothing actually plays back through
  // the speakers; we only need processorNode → destination connected
  // because ScriptProcessor's `onaudioprocess` callback won't fire
  // unless its output is connected to something downstream that
  // eventually reaches destination. Quirk of the deprecated API.
  //
  // Returns an object with all the nodes + the live `captured` array.
  // The array is mutated as audio arrives (one Float32Array per audio-
  // process tick); callers concatenate it after stopping. The modal
  // keeps references to gainNode (for live slider updates) and
  // analyserNode (for the raf-loop peak read).
  //
  // Notably the factory does NOT own the lifecycle — callers still
  // call stopCapture to disconnect + close. This is a deliberate
  // smaller-slice extraction; the full lifecycle (raf loop, sample-
  // rate probe, calibration state machine, etc.) is too entangled
  // with the modal's DOM state to factor cleanly without a much
  // larger rewrite.
  function setupAudioGraph(audioContext, mediaStream, initialGain) {
    const sourceNode = audioContext.createMediaStreamSource(mediaStream);

    const gainNode = audioContext.createGain();
    gainNode.gain.value = initialGain;
    sourceNode.connect(gainNode);

    // Level meter via AnalyserNode. fftSize=256 → 128 frequency bins;
    // we only read it for peak detection (max of time-domain samples),
    // so the smaller buffer cuts the per-frame work without hurting
    // peak accuracy. The shared Uint8Array allocation lives in the
    // raf loop so this factory stays pure-setup.
    const analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    gainNode.connect(analyserNode);

    // ScriptProcessor for PCM capture. Deprecated in favor of
    // AudioWorklet but vastly simpler and still works in Electron 35.
    // ~93 ms latency at bufferSize=4096 / 44.1 kHz — fine for offline
    // capture (we don't monitor the signal, just record it).
    const BUFFER_SIZE = 4096;
    const processorNode = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    const captured = [];
    processorNode.onaudioprocess = (e) => {
      // Must copy: the inputBuffer's channel data is reused by the
      // audio engine on the next callback. Without the copy, all the
      // accumulated chunks would alias the same underlying memory.
      captured.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    gainNode.connect(processorNode);

    // ScriptProcessor doesn't fire onaudioprocess unless its output
    // is connected. Route to a muted GainNode so nothing actually
    // plays through the speakers (otherwise we'd hear the captured
    // input as monitor-out).
    const muteGain = audioContext.createGain();
    muteGain.gain.value = 0;
    processorNode.connect(muteGain);
    muteGain.connect(audioContext.destination);

    return { sourceNode, gainNode, analyserNode, processorNode, muteGain, captured };
  }

  // Module API. Browser-only — no module.exports since this is not
  // unit-tested in Node (the implementations are pure-glue over the
  // Web Audio API, which doesn't exist in the Node test runner).
  if (typeof window !== 'undefined') {
    window.acquireRawAudioStream = acquireRawAudioStream;
    window.setupAudioGraph       = setupAudioGraph;
  }
})();
