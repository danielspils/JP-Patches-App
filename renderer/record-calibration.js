'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// record-calibration.js — resolve Record-from-JX calibration gain robustly.
//
// THE BUG THIS FIXES (v0.7.5):
// Record-from-JX stores a per-input-device gain multiplier in
// library.record.calibratedGain, keyed by MediaDeviceInfo.deviceId. But
// Chromium/Electron deviceIds are SALTED HASHES, not stable identifiers —
// they rotate across:
//   - Electron/Chromium version bumps (i.e. app updates),
//   - USB unplug/replug,
//   - the device becoming / un-becoming the system default ("default" alias).
// A deviceId-only lookup therefore "forgets" calibration the user already
// did — they're re-prompted to recalibrate even though the gain is still
// sitting in library.json under the now-orphaned old key.
//
// THE FIX:
// Fall back to matching by device LABEL, which carries the USB vendor:product
// id (e.g. "KT USB Audio (31b2:2024)") and is stable for the physical device.
// This mirrors what the input-device picker already does. We normalize away
// Chromium's "Default - " prefix so the same device matches whether or not
// it's the current default, and when several entries match the same device
// we return the most recently calibrated one.
//
// Pure logic — no DOM, no library global, no I/O. UMD pattern (window in the
// renderer, require() in Node tests), same as library-math.js / bucket-ops.js.
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
  const exports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  } else {
    Object.assign(root, exports);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ── normalizeDeviceLabel ───────────────────────────────────────────────
  //
  // Strip Chromium's "Default - " prefix and surrounding whitespace so the
  // same physical device matches whether or not it's currently the system
  // default input. E.g. both "Default - KT USB Audio (31b2:2024)" and
  // "KT USB Audio (31b2:2024)" normalize to "KT USB Audio (31b2:2024)".
  function normalizeDeviceLabel(label) {
    return String(label == null ? '' : label).replace(/^Default - /, '').trim();
  }

  // A calibration entry is usable only if it carries a positive finite gain.
  function isValidEntry(entry) {
    return !!entry
      && typeof entry.gain === 'number'
      && Number.isFinite(entry.gain)
      && entry.gain > 0;
  }

  // ── resolveCalibratedGain ──────────────────────────────────────────────
  //
  // Find the calibration entry for a device.
  //   map         — library.record.calibratedGain
  //                 ({ [deviceId]: { label, gain, calibratedAt } })
  //   deviceId    — the device's CURRENT (possibly newly-rotated) deviceId
  //   deviceLabel — the device's current label (stable; carries USB VID:PID)
  // Returns the matching entry object (by reference) or null.
  //
  // Strategy:
  //   1. Exact deviceId key — fast path, the common same-session case.
  //   2. Else normalized-label match — recovers gain after a deviceId
  //      rotation (update / replug / default-switch). Among multiple label
  //      matches, the most recently calibrated entry wins (by ISO
  //      calibratedAt string compare — ISO-8601 sorts lexically).
  function resolveCalibratedGain(map, deviceId, deviceLabel) {
    if (!map || typeof map !== 'object') return null;

    const want = normalizeDeviceLabel(deviceLabel);

    // 1. Fast path: exact deviceId hit — but only TRUST it when the stored
    //    label matches the current device (or no label was supplied). A
    //    reused key like "default" can point at a DIFFERENT physical device
    //    after the user switches their default audio input; without this
    //    guard we'd hand device B the gain calibrated for device A. On a
    //    label mismatch we fall through to the label search below.
    if (deviceId && isValidEntry(map[deviceId])) {
      if (!want || normalizeDeviceLabel(map[deviceId].label) === want) {
        return map[deviceId];
      }
    }

    // 2. Fallback: normalized-label match, latest-wins.
    if (!want) return null;
    let best = null;
    for (const key of Object.keys(map)) {
      const entry = map[key];
      if (!isValidEntry(entry)) continue;
      if (normalizeDeviceLabel(entry.label) !== want) continue;
      if (!best || String(entry.calibratedAt || '') > String(best.calibratedAt || '')) {
        best = entry;
      }
    }
    return best;
  }

  // ── staleCalibrationKeys ───────────────────────────────────────────────
  //
  // Return the keys in `map` that refer to the SAME physical device as
  // (deviceId, label) but under a DIFFERENT key — i.e. orphaned duplicates
  // (an old rotated hash, or the "default" alias). The caller deletes these
  // on recalibrate so we keep one entry per device instead of accumulating
  // one orphan per upgrade. The current deviceId key is never returned.
  function staleCalibrationKeys(map, deviceId, label) {
    if (!map || typeof map !== 'object') return [];
    const want = normalizeDeviceLabel(label);
    if (!want) return [];
    return Object.keys(map).filter((key) =>
      key !== deviceId
      && map[key]
      && normalizeDeviceLabel(map[key].label) === want
    );
  }

  return { normalizeDeviceLabel, resolveCalibratedGain, staleCalibrationKeys };
});
