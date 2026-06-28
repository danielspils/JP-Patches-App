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
  function strictConstraints(deviceId, sampleRate) {
    const audio = {
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
    };
    // Request the device's NATIVE rate so Chromium delivers it un-resampled.
    // Chromium's no-constraint DEFAULT is 44.1k — which real-time-resamples a
    // 48k device and jitters the FSK timing (pitfall #27). So we must name the
    // native rate explicitly (caller passes it from the CoreAudio probe).
    if (sampleRate) audio.sampleRate = sampleRate;
    return { audio };
  }

  // The soft constraint set — Chromium treats `false` as a preference
  // here, not an absolute. The device may still apply some processing.
  // Used only as a last resort when strict throws OverconstrainedError.
  function softConstraints(deviceId, sampleRate) {
    const audio = {
      deviceId:         deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl:  false,
      channelCount:     1,
    };
    if (sampleRate) audio.sampleRate = sampleRate;   // native rate (see strictConstraints)
    return { audio };
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
  /**
   * @typedef {Object} AcquireResult
   * @property {MediaStream} mediaStream Live audio stream from getUserMedia
   * @property {boolean} usedFallback   true if the strict constraints
   *   rejected with OverconstrainedError and we fell back to soft
   */

  /**
   * Acquire a MediaStream for FSK capture with appropriate Chromium
   * audio-processing disables. Strict constraints (forced `{exact:
   * false}` on echoCancel/AGC/noiseSuppress, plus the legacy googXxx
   * flags) preferred; soft fallback if the device rejects strict.
   *
   * @param {string | undefined} deviceId Specific device or undefined
   *   for system default
   * @param {number} [sampleRate] Device native rate to request (Hz) so
   *   Chromium delivers it un-resampled. Omit → Chromium's 44.1k default.
   * @returns {Promise<AcquireResult>}
   * @throws {Error} If both strict and soft getUserMedia fail
   */
  async function acquireRawAudioStream(deviceId, sampleRate) {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(strictConstraints(deviceId, sampleRate));
      return { mediaStream, usedFallback: false };
    } catch (err) {
      console.warn('Strict raw-audio constraints failed, falling back:', err && err.name);
      const mediaStream = await navigator.mediaDevices.getUserMedia(softConstraints(deviceId, sampleRate));
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
  /**
   * @typedef {Object} AudioGraph
   * @property {MediaStreamAudioSourceNode} sourceNode
   * @property {GainNode} gainNode      Software gain stage; update
   *   `.gain.value` to adjust mid-capture
   * @property {AnalyserNode} analyserNode For raf-loop peak reads
   * @property {ScriptProcessorNode} processorNode Captures PCM into
   *   the `captured` array via onaudioprocess
   * @property {GainNode} muteGain      Output sink at volume=0 (required
   *   for ScriptProcessor to fire callbacks)
   * @property {Float32Array[]} captured Live PCM chunks; appends as
   *   audio arrives. Concatenate after stop.
   */

  /**
   * Build the audio-processing node graph for a Record-from-JX capture.
   * See module header for the chain layout.
   *
   * @param {AudioContext} audioContext Already-created context (caller
   *   handles the sampleRate try/catch fallback)
   * @param {MediaStream} mediaStream Already-acquired stream from
   *   {@link acquireRawAudioStream}
   * @param {number} initialGain Initial software gain (1× = unity)
   * @returns {AudioGraph}
   */
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
    // ~85–93 ms latency at bufferSize=4096 (depends on the device's
    // native rate — fine for offline capture; we record, don't monitor).
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

  /**
   * @typedef {Object} CaptureSession
   * @property {AudioContext} audioContext
   *   Read `.sampleRate` to size the WAV header at write time.
   * @property {GainNode} gainNode
   *   Update `.gain.value` to adjust software gain mid-capture (the
   *   level slider's `input` handler writes here).
   * @property {Float32Array[]} captured
   *   Live PCM buffer; appends as audio arrives. Concatenate after stop.
   * @property {() => import('./capture-state.js').CaptureState} getState
   *   Current capture state (runningPeak, fskPeak, totalSignalMs, etc.)
   *   for callers that need a snapshot outside the onTick stream.
   * @property {() => void} stop
   *   Tear down: cancel the raf loop, disconnect all nodes, close
   *   the AudioContext. MediaStream lifecycle is the caller's
   *   responsibility (they may want to reuse it across sessions).
   */

  /**
   * Start a capture session: bundles AudioContext creation +
   * {@link setupAudioGraph} + the raf-loop driven state machine into
   * a single entry point. The modal subscribes via callbacks for DOM
   * updates (`onTick` per frame, `onAutoStop` when the session
   * decides the dump is complete).
   *
   * The raf loop's mechanics are entirely inside the session: read
   * peak from analyser → compute thresholds → tick the pure state
   * machine → invoke onTick({peak, thresholds, state, events}) so
   * the modal can project to DOM. If events.autoStop fires, the
   * session invokes onAutoStop(reason) and stops scheduling new
   * frames. The modal's onTick callback is the ONLY place DOM gets
   * touched per-frame — keeps audio + state separate from rendering.
   *
   * @param {Object} opts
   * @param {MediaStream} opts.mediaStream
   *   From {@link acquireRawAudioStream}. Caller owns lifecycle.
   * @param {number} opts.initialGain Software gain at start (1× = unity)
   * @param {number} opts.recordStartMs Date.now() at modal-mount time
   * @param {number} opts.expectedSignalMs Auto-stop budget for this dump kind
   * @param {() => boolean} opts.isRecording
   *   Polled each tick; if returns false, skip the frame (modal
   *   pauses ticking during the 'processing' state without
   *   tearing the session down).
   * @param {(frame: {peak: number, thresholds: {silence: number, signal: number}, state: import('./capture-state.js').CaptureState, events: import('./capture-state.js').CaptureEvents}) => void} opts.onTick
   *   Called every frame in the raf loop. Modal does DOM updates here.
   * @param {(reason: 'silence-after-signal' | 'dump-timeout' | 'total-signal' | 'safety-timeout') => void} opts.onAutoStop
   *   Called once when the state machine decides the dump is done.
   *   Modal typically transitions to processing/post-capture flow.
   * @returns {CaptureSession}
   */
  function startCaptureSession({
    mediaStream,
    initialGain,
    recordStartMs,
    expectedSignalMs,
    isRecording,
    onTick,
    onAutoStop,
  }) {
    // AudioContext at the device's NATIVE capture rate so the
    // MediaStreamSource is NOT resampled. Forcing 44.1k made Chromium
    // real-time-resample the KT's native 48k input, ~doubling the FSK
    // cycle-timing jitter and dropping sequence pages (pitfall #27).
    // Everything downstream (WAV header, trim bit-math) reads
    // audioContext.sampleRate, so JP is sample-rate-agnostic. Falls back
    // to the platform default if the native rate is unreadable or the
    // constructor rejects it.
    let audioContext;
    const _track = mediaStream.getAudioTracks ? mediaStream.getAudioTracks()[0] : null;
    const nativeRate = _track && _track.getSettings ? _track.getSettings().sampleRate : undefined;
    try {
      audioContext = (typeof nativeRate === 'number' && nativeRate > 0)
        ? new AudioContext({ sampleRate: nativeRate })
        : new AudioContext();
    } catch {
      audioContext = new AudioContext();
    }

    // Build the node graph (source → gain → {analyser, processor →
    // muteGain → destination}) and capture buffer.
    const graph = setupAudioGraph(audioContext, mediaStream, initialGain);
    const analyserBuf = new Uint8Array(graph.analyserNode.fftSize);

    // Pure state machine — see renderer/capture-state.js.
    let captureState = makeInitialCaptureState();
    let levelRaf = null;
    let stopped = false;
    let autoStopFired = false;

    const tick = () => {
      if (stopped) return;
      // Modal can pause ticking (e.g. state === 'processing' during
      // post-capture decode) without tearing the session down. We
      // keep scheduling frames so when isRecording flips back on,
      // the loop resumes seamlessly.
      if (!isRecording()) {
        levelRaf = requestAnimationFrame(tick);
        return;
      }
      const peak = readAnalyserPeak(graph.analyserNode, analyserBuf);
      const thresholds = liveThresholdsFor(graph.gainNode.gain.value);
      const now = Date.now();
      const { state: nextState, events } = updateCaptureState(captureState, {
        peak,
        now,
        silenceThreshold: thresholds.silence,
        signalThreshold:  thresholds.signal,
        recordStartMs,
        expectedSignalMs,
      });
      captureState = nextState;
      // Modal projects state + events to DOM.
      try { onTick({ peak, thresholds, state: captureState, events }); }
      catch (err) { console.error('onTick threw:', err); }
      // Auto-stop fires once: callback runs, raf stops scheduling.
      // Modal is responsible for calling session.stop() (or letting
      // the rest of its post-capture flow tear things down). We
      // don't stop ourselves here because the modal may need the
      // audio chain live a moment longer for post-processing.
      if (events.autoStop && !autoStopFired) {
        autoStopFired = true;
        try { onAutoStop(events.autoStop); }
        catch (err) { console.error('onAutoStop threw:', err); }
        return;
      }
      levelRaf = requestAnimationFrame(tick);
    };
    levelRaf = requestAnimationFrame(tick);

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (levelRaf) { cancelAnimationFrame(levelRaf); levelRaf = null; }
      // Disconnect in reverse-creation order. Catch + ignore errors —
      // any node already disconnected (by Web Audio's gc, by a prior
      // error, etc.) shouldn't block teardown of the others.
      try { graph.processorNode.disconnect(); } catch {}
      try { graph.muteGain.disconnect();      } catch {}
      try { graph.analyserNode.disconnect();  } catch {}
      try { graph.gainNode.disconnect();      } catch {}
      try { graph.sourceNode.disconnect();    } catch {}
      try { if (audioContext.state !== 'closed') audioContext.close(); } catch {}
      // mediaStream cleanup is the caller's job — they own it.
    };

    return {
      audioContext,
      gainNode: graph.gainNode,
      captured: graph.captured,
      getState: () => captureState,
      stop,
    };
  }

  // Module API. Browser-only — no module.exports since this is not
  // unit-tested in Node (the implementations are pure-glue over the
  // Web Audio API, which doesn't exist in the Node test runner).
  if (typeof window !== 'undefined') {
    window.acquireRawAudioStream = acquireRawAudioStream;
    window.setupAudioGraph       = setupAudioGraph;
    window.startCaptureSession   = startCaptureSession;
  }
})();
