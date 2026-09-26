// Pure logic for the Send modal's low-output warning (trap #39): decide,
// from the CoreAudio probe's device list and the picked cable's label,
// whether the OS-level output volume would degrade the FSK send — and how
// to say so. No DOM, no IPC; unit-tested in test/output-volume.test.js.
//
// Why it exists: on 2026-09-24 the KT cable's output half sat at −6.5 dB in
// Audio MIDI Setup. The app pins its <audio> element volume to 1.0, but the
// DEVICE volume still scales the signal — every send reached the JX at
// ~half amplitude and was rejected (tape-error lights, wedged panel), while
// capture stayed perfect. Nothing in the web layer can read that slider;
// the vendored volume-probe can.
(() => {
  // Warn below this scalar. 0.95 rather than 1.0: some drivers report a hair
  // under full for a maxed slider, and a warning that cries wolf gets ignored.
  const FULL_ENOUGH = 0.95;

  // The probe reports CoreAudio names ("KT USB Audio 2"); Chromium's
  // enumerateDevices labels are close but not identical (suffixes, counts).
  // Match by containment either way, longest candidate name first so
  // "KT USB Audio 2" beats "KT USB Audio". Null when nothing matches —
  // callers show nothing rather than warning about the wrong device.
  function pickOutputDevice(devices, label) {
    if (!Array.isArray(devices) || !label) return null;
    const norm = (s) => String(s).toLowerCase().trim();
    const want = norm(label);
    const named = devices.filter((d) => d && d.name);
    const ranked = named
      .filter((d) => want.includes(norm(d.name)) || norm(d.name).includes(want))
      .sort((a, b) => b.name.length - a.name.length);
    return ranked[0] || null;
  }

  // → { level: 'muted'|'low', text } when the send would be degraded, else
  // null (full volume, no volume control at all, or device not found — a
  // device without a volume control cannot be turned down, so nothing to
  // warn about).
  function describeLowOutput(device) {
    if (!device) return null;
    if (device.muted) {
      return {
        level: 'muted',
        text: 'The cable’s output is MUTED in macOS — the JX will receive nothing. '
          + 'Unmute it in Audio MIDI Setup (Output tab), then send.',
      };
    }
    const v = device.volume;
    if (typeof v !== 'number' || v < 0 || v >= FULL_ENOUGH) return null;
    // Prefer the probe's CoreAudio dB reading — the scalar-to-dB curve is
    // device-specific, and this number must match what the user sees in
    // Audio MIDI Setup (0.757 on the KT is −6.5 dB there, not the −2.4 that
    // 20·log10 gives). Naive amplitude dB is only the last-ditch fallback.
    const db = typeof device.db === 'number' ? device.db.toFixed(1)
      : v > 0 ? (20 * Math.log10(v)).toFixed(1) : '−∞';
    return {
      level: 'low',
      text: `The cable’s output volume is turned down in macOS (${Math.round(v * 100)}%, `
        + `${db} dB) — the JX may reject the send. Set it to 0 dB in Audio MIDI Setup `
        + '(Output tab), then send.',
    };
  }

  const exports = { pickOutputDevice, describeLowOutput, FULL_ENOUGH };
  if (typeof window !== 'undefined') Object.assign(window, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})();
