'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const { computeFskTrim, findFskStartByFreq, fskPresentInWindow, fskShortCycleRate, classifyWindows, computeTrimThresholds, floatToInt16WithPeak } = require('../renderer/record-trim.js');

// Helpers for the frequency-detector tests: synthesize tones whose
// half-period lands in (3675 Hz → ~6 samples = "short"/bit-0) or out of
// (882 Hz → ~25 samples = "long"/idle-pilot) the bit-0 crossing-interval band.
const SR = 44100;
function tone(freqHz, durSec, amp) {
  const n = Math.floor(durSec * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freqHz * i / SR);
  return out;
}
function concatF32(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

// ── computeTrimThresholds ───────────────────────────────────────────

test('computeTrimThresholds — gain 1× uses default floors', () => {
  const t = computeTrimThresholds(1);
  assert.equal(t.SIGNAL_THRESHOLD,  0.10);
  assert.equal(t.SILENCE_THRESHOLD, 0.05);
});

test('computeTrimThresholds — gain 11× scales both thresholds', () => {
  const t = computeTrimThresholds(11);
  // signal: max(0.10, 0.025 * 11) = max(0.10, 0.275) = 0.275
  assert.ok(Math.abs(t.SIGNAL_THRESHOLD  - 0.275) < 1e-9);
  // silence: max(0.05, 0.012 * 11) = max(0.05, 0.132) = 0.132
  assert.ok(Math.abs(t.SILENCE_THRESHOLD - 0.132) < 1e-9);
});

test('computeTrimThresholds — gain at 20× cap', () => {
  const t = computeTrimThresholds(20);
  assert.ok(Math.abs(t.SIGNAL_THRESHOLD  - 0.500) < 1e-9);
  assert.ok(Math.abs(t.SILENCE_THRESHOLD - 0.240) < 1e-9);
});

test('computeTrimThresholds — gain above 20× clamps to 20×', () => {
  const tCap  = computeTrimThresholds(20);
  const tOver = computeTrimThresholds(50);
  assert.equal(tOver.SIGNAL_THRESHOLD,  tCap.SIGNAL_THRESHOLD);
  assert.equal(tOver.SILENCE_THRESHOLD, tCap.SILENCE_THRESHOLD);
});

test('computeTrimThresholds — gain below 1× clamps to 1×', () => {
  const tUnity = computeTrimThresholds(1);
  const tLow   = computeTrimThresholds(0.5);
  assert.equal(tLow.SIGNAL_THRESHOLD,  tUnity.SIGNAL_THRESHOLD);
  assert.equal(tLow.SILENCE_THRESHOLD, tUnity.SILENCE_THRESHOLD);
});

test('computeTrimThresholds — handles 0/null/undefined gain by clamping to 1×', () => {
  const tUnity = computeTrimThresholds(1);
  for (const g of [0, null, undefined, NaN]) {
    const t = computeTrimThresholds(g);
    assert.equal(t.SIGNAL_THRESHOLD,  tUnity.SIGNAL_THRESHOLD);
    assert.equal(t.SILENCE_THRESHOLD, tUnity.SILENCE_THRESHOLD);
  }
});

// ── classifyWindows ─────────────────────────────────────────────────

// Helper: build a Float32Array of `seconds` length filled with the
// given absolute peak amplitude (alternating + and - so abs(...) max
// is exactly `peak`).
function buf(seconds, peak, sampleRate = 44100) {
  const n   = Math.floor(seconds * sampleRate);
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = (i % 2 === 0) ? peak : -peak;
  return arr;
}

// Concatenate multiple Float32 buffers.
function concat(...bufs) {
  const total = bufs.reduce((s, b) => s + b.length, 0);
  const out   = new Float32Array(total);
  let off = 0;
  for (const b of bufs) { out.set(b, off); off += b.length; }
  return out;
}

test('classifyWindows — pure silence buffer is all silence', () => {
  const t  = computeTrimThresholds(1);
  const b  = buf(1.0, 0.0);
  const k  = classifyWindows(b, 44100, t);
  assert.ok(k.length > 0);
  assert.ok(k.every((x) => x === 'silence'));
});

test('classifyWindows — pure signal buffer is all signal', () => {
  const t = computeTrimThresholds(1);
  const b = buf(1.0, 0.5);                         // 0.5 > 0.10 (signal threshold)
  const k = classifyWindows(b, 44100, t);
  assert.ok(k.length > 0);
  assert.ok(k.every((x) => x === 'signal'));
});

test('classifyWindows — between-threshold buffer is all "between"', () => {
  const t = computeTrimThresholds(1);
  const b = buf(1.0, 0.07);                        // 0.05 < 0.07 < 0.10
  const k = classifyWindows(b, 44100, t);
  assert.ok(k.length > 0);
  assert.ok(k.every((x) => x === 'between'));
});

// ── computeFskTrim ──────────────────────────────────────────────────

test('computeFskTrim — silence then sustained signal trims at the gap', () => {
  // 1 s silence, then 6 s signal. Expect trim around the 1 s mark
  // (with the small ~50 ms backoff).
  const sampleRate = 44100;
  const all = concat(buf(1.0, 0.0, sampleRate), buf(6.0, 0.5, sampleRate));
  const r = computeFskTrim(all, sampleRate, 1);
  assert.ok(r.foundSilenceGap, 'pass 1 should succeed on clean silence→signal');
  assert.ok(!r.usedFallback);
  // Trim should be near 1 s (within ~250 ms tolerance for window quantization + backoff)
  const expected = 1.0 * sampleRate;
  assert.ok(Math.abs(r.trimStart - expected) < 0.25 * sampleRate,
    `trimStart=${r.trimStart}, expected ≈ ${expected}`);
});

test('computeFskTrim — buffer starting with signal (no silence) uses fallback', () => {
  // 8 s of pure signal, no leading silence.
  const sampleRate = 44100;
  const all = buf(8.0, 0.5, sampleRate);
  const r = computeFskTrim(all, sampleRate, 1);
  assert.ok(!r.foundSilenceGap);
  assert.ok(r.usedFallback);
  // Longest-run start is window 0, no backoff applied (trimWindow === 0
  // skips the backoff branch). trimStart should be 0.
  assert.equal(r.trimStart, 0);
});

test('computeFskTrim — multiple silence→signal patterns picks the LATEST', () => {
  // Pattern: 1 s silence, 6 s signal, 1 s silence, 6 s signal.
  // Both gaps qualify; algorithm picks the latest (second one at ~8 s).
  const sampleRate = 44100;
  const all = concat(
    buf(1.0, 0.0, sampleRate),
    buf(6.0, 0.5, sampleRate),
    buf(1.0, 0.0, sampleRate),
    buf(6.0, 0.5, sampleRate)
  );
  const r = computeFskTrim(all, sampleRate, 1);
  assert.ok(r.foundSilenceGap);
  const expected = 8.0 * sampleRate;   // start of second signal run
  assert.ok(Math.abs(r.trimStart - expected) < 0.25 * sampleRate,
    `trimStart=${r.trimStart}, expected ≈ ${expected}`);
});

test('computeFskTrim — signal run shorter than 5 s does NOT trigger pass 1', () => {
  // 1 s silence, 3 s signal (too short for the 5 s sustained-signal rule),
  // 1 s silence, 6 s signal (qualifies).
  const sampleRate = 44100;
  const all = concat(
    buf(1.0, 0.0, sampleRate),
    buf(3.0, 0.5, sampleRate),   // doesn't qualify
    buf(1.0, 0.0, sampleRate),
    buf(6.0, 0.5, sampleRate)    // qualifies
  );
  const r = computeFskTrim(all, sampleRate, 1);
  assert.ok(r.foundSilenceGap);
  // Should trim at the 5 s mark (start of the second signal block)
  const expected = 5.0 * sampleRate;
  assert.ok(Math.abs(r.trimStart - expected) < 0.25 * sampleRate,
    `trimStart=${r.trimStart}, expected ≈ ${expected}`);
});

test('computeFskTrim — pure silence buffer returns trimStart=0 (nothing to trim to)', () => {
  const all = buf(5.0, 0.0);
  const r   = computeFskTrim(all, 44100, 1);
  assert.equal(r.trimStart, 0);
  assert.ok(!r.foundSilenceGap);
  assert.ok(!r.usedFallback);    // no signal run found
});

test('computeFskTrim — high gain (15×) raises thresholds so 0.1 idle reads as silence', () => {
  // At gain 1×, an amplitude of 0.13 is "between" (>SILENCE, <SIGNAL).
  // At gain 15×, SILENCE=0.18 so 0.13 is now silence. Verify the
  // threshold scaling is applied through to classifyWindows.
  const sampleRate = 44100;
  const all = concat(buf(1.0, 0.13, sampleRate), buf(6.0, 0.7, sampleRate));
  const r = computeFskTrim(all, sampleRate, 15);
  // At gain 15×, leading 0.13 is silence and 0.7 is signal → pass 1
  // should fire.
  assert.ok(r.foundSilenceGap, 'at gain 15× the leading 0.13 should classify as silence');
});

test('computeFskTrim — applies ~50 ms backoff before the detected window', () => {
  // 2 s silence, 6 s signal. Trim should land ~50 ms BEFORE the 2 s mark.
  const sampleRate = 44100;
  const all = concat(buf(2.0, 0.0, sampleRate), buf(6.0, 0.5, sampleRate));
  const r = computeFskTrim(all, sampleRate, 1);
  assert.ok(r.foundSilenceGap);
  const transition = 2.0 * sampleRate;
  // trimStart should be slightly LESS than `transition` due to backoff
  assert.ok(r.trimStart < transition, `trimStart (${r.trimStart}) should be < transition (${transition})`);
  // and within ~250 ms of it
  assert.ok(transition - r.trimStart < 0.25 * sampleRate);
});

// ── findFskStartByFreq (frequency-aware trim, pitfall #26) ──────────

test('findFskStartByFreq — leading loud-idle then data: trims ~1 s before data, NOT amplitude-gated', () => {
  // 2 s of idle tone + 3 s of data tone, at the SAME amplitude (the amplitude
  // trim would find no silence gap here). Expect a trim ~1 s before the 2 s
  // data start (the pilot backoff), i.e. ~1 s.
  const all = concatF32(tone(882, 2.0, 0.3), tone(3675, 3.0, 0.3));
  const ts = findFskStartByFreq(all, SR);
  assert.ok(ts > 0, `expected a positive trim, got ${ts}`);
  assert.ok(ts < 2.0 * SR, 'must cut into the leading idle, not keep all of it');
  assert.ok(Math.abs(ts - 1.0 * SR) <= 0.5 * SR, `trimStart ${ts} should be ~1 s (${SR})`);
});

test('findFskStartByFreq — amplitude-INDEPENDENT: same result at a tiny 0.04 level', () => {
  // Quarter the test above but at 0.04 amplitude — far below any silence
  // threshold. The boost-then-frequency approach must still find the start.
  const all = concatF32(tone(882, 2.0, 0.04), tone(3675, 3.0, 0.04));
  const ts = findFskStartByFreq(all, SR);
  assert.ok(ts > 0 && ts < 2.0 * SR, `low-level capture should still trim, got ${ts}`);
  assert.ok(Math.abs(ts - 1.0 * SR) <= 0.5 * SR);
});

test('findFskStartByFreq — pure idle tone (no bit-0 cycles) → -1 (caller falls back)', () => {
  const all = tone(882, 4.0, 0.3);
  assert.equal(findFskStartByFreq(all, SR), -1);
});

test('findFskStartByFreq — data from the very start → 0 (nothing to trim)', () => {
  const all = tone(3675, 3.0, 0.3);
  assert.equal(findFskStartByFreq(all, SR), 0);
});

test('findFskStartByFreq — empty / silent / no sampleRate → -1, never throws', () => {
  assert.equal(findFskStartByFreq(new Float32Array(0), SR), -1);
  assert.equal(findFskStartByFreq(tone(3675, 1.0, 0), SR), -1);   // all zeros
  assert.equal(findFskStartByFreq(tone(3675, 1.0, 0.3), 0), -1);  // bad sampleRate
});

test('findFskStartByFreq — RATE-AGNOSTIC: same idle+data structure at native 48 kHz', () => {
  // pitfall #27: JP now captures at the device's native rate (48 kHz on the
  // KT) instead of forcing 44.1k. The bit-0 interval bounds scale with the
  // rate, so the trim must locate the data start at 48k just as it does at
  // 44.1k. Idle 882 Hz, data 3675 Hz — same tones, generated at 48 kHz.
  const SR48 = 48000;
  const toneAt = (freqHz, durSec, amp) => {
    const n = Math.floor(durSec * SR48);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freqHz * i / SR48);
    return out;
  };
  const all = concatF32(toneAt(882, 2.0, 0.3), toneAt(3675, 3.0, 0.3));
  const ts = findFskStartByFreq(all, SR48);
  assert.ok(ts > 0 && ts < 2.0 * SR48, `48 kHz capture should trim into the idle, got ${ts}`);
  assert.ok(Math.abs(ts - 1.0 * SR48) <= 0.5 * SR48, `trimStart ${ts} should be ~1 s at 48 kHz`);
});

// ── floatToInt16WithPeak ────────────────────────────────────────────

test('floatToInt16WithPeak — empty buffer yields zero-length pcm and peak 0', () => {
  const r = floatToInt16WithPeak(new Float32Array(0));
  assert.equal(r.pcm.byteLength, 0);
  assert.equal(r.peakAmp, 0);
});

test('floatToInt16WithPeak — output byte length is 2× sample count (mono Int16)', () => {
  const r = floatToInt16WithPeak(new Float32Array(100));
  assert.equal(r.pcm.byteLength, 200);
});

test('floatToInt16WithPeak — peak measurement matches max |sample|', () => {
  const r = floatToInt16WithPeak(new Float32Array([0.1, -0.3, 0.2, -0.7, 0.4]));
  assert.ok(Math.abs(r.peakAmp - 0.7) < 1e-6);
});

test('floatToInt16WithPeak — clamps samples outside [-1, 1] before conversion', () => {
  // Without clamping, a sample of 1.5 would multiply to 49150 — overflows Int16.
  const r = floatToInt16WithPeak(new Float32Array([1.5, -1.5]));
  const view = new DataView(r.pcm);
  assert.equal(view.getInt16(0, true),  0x7FFF);   // clamped +1.0 → 32767
  assert.equal(view.getInt16(2, true), -0x8000);   // clamped -1.0 → -32768
  // Peak is the post-clamp value
  assert.equal(r.peakAmp, 1.0);
});

test('floatToInt16WithPeak — uses asymmetric Int16 range (0x7FFF positive, 0x8000 negative)', () => {
  const r = floatToInt16WithPeak(new Float32Array([1.0, -1.0]));
  const view = new DataView(r.pcm);
  assert.equal(view.getInt16(0, true),  32767);
  assert.equal(view.getInt16(2, true), -32768);
});

test('floatToInt16WithPeak — zero samples encode to zero bytes', () => {
  const r = floatToInt16WithPeak(new Float32Array([0, 0, 0]));
  const view = new DataView(r.pcm);
  assert.equal(view.getInt16(0, true), 0);
  assert.equal(view.getInt16(2, true), 0);
  assert.equal(view.getInt16(4, true), 0);
  assert.equal(r.peakAmp, 0);
});

test('floatToInt16WithPeak — output is little-endian (RIFF/WAVE convention)', () => {
  // 0.5 * 0x7FFF = 16383.5 → 16383 = 0x3FFF; little-endian bytes [0xFF, 0x3F]
  const r = floatToInt16WithPeak(new Float32Array([0.5]));
  const bytes = new Uint8Array(r.pcm);
  assert.equal(bytes[0], 0xFF);
  assert.equal(bytes[1], 0x3F);
});

// ── LIVE frequency-aware presence (fskShortCycleRate / fskPresentInWindow) ──
// The 3675 Hz tone's half-period ≈ 6 samples → inside the bit-0 "short"
// crossing band → reads as FSK data. The 882 Hz tone's half-period ≈ 25
// samples → outside the band → reads as idle/pilot. This is exactly how the
// live gate distinguishes a real dump from the JX's constant idle buzz.
const SHORT_FSK_HZ = 3675;   // ~bit-0 rate: half-period in the [4,12)-sample band
const IDLE_TONE_HZ = 882;    // idle buzz / pilot: half-period well above the band

test('fskShortCycleRate — bit-0-band tone yields a high short-cycle rate', () => {
  const rate = fskShortCycleRate(tone(SHORT_FSK_HZ, 0.5, 0.6), SR);
  assert.ok(rate > 100, `expected ≫ threshold, got ${rate}`);
});

test('fskShortCycleRate — idle/pilot tone yields ~zero short cycles', () => {
  const rate = fskShortCycleRate(tone(IDLE_TONE_HZ, 0.5, 0.6), SR);
  assert.ok(rate < 30, `idle tone should stay under the floor, got ${rate}`);
});

test('fskShortCycleRate — silent buffer is 0 (no divide-by-peak blowup)', () => {
  assert.equal(fskShortCycleRate(new Float32Array(SR * 0.5), SR), 0);
});

test('fskPresentInWindow — true for a real FSK-band window', () => {
  assert.equal(fskPresentInWindow(tone(SHORT_FSK_HZ, 0.5, 0.6), SR), true);
});

test('fskPresentInWindow — false for the idle buzz / pilot tone', () => {
  assert.equal(fskPresentInWindow(tone(IDLE_TONE_HZ, 0.5, 0.6), SR), false);
});

test('fskPresentInWindow — amplitude-INDEPENDENT: catches a very quiet dump', () => {
  // 0.02 peak (below any amplitude signal floor) still detected — the detector
  // boosts by the window peak before counting. This is the low-gain fix.
  assert.equal(fskPresentInWindow(tone(SHORT_FSK_HZ, 0.5, 0.02), SR), true);
});

test('fskPresentInWindow — a quiet idle buzz stays rejected even after boost', () => {
  // The boost lifts a 0.02 idle tone to ~0.92 too, but it's still low-frequency
  // → no short cycles → correctly NOT flagged as a dump (no premature start).
  assert.equal(fskPresentInWindow(tone(IDLE_TONE_HZ, 0.5, 0.02), SR), false);
});

test('fskPresentInWindow — window shorter than 0.3s returns false (too little to judge)', () => {
  assert.equal(fskPresentInWindow(tone(SHORT_FSK_HZ, 0.2, 0.6), SR), false);
});

test('fskPresentInWindow — 48k sample rate: bit-0 band scales with rate', () => {
  // At 48k the bit-0 half-period is ~6.5 samples; the rate-scaled bounds keep
  // the same tone in-band, so detection is sample-rate-agnostic (pitfall #27).
  const SR48 = 48000;
  const n = Math.floor(0.5 * SR48);
  const t = new Float32Array(n);
  for (let i = 0; i < n; i++) t[i] = 0.6 * Math.sin(2 * Math.PI * SHORT_FSK_HZ * i / SR48);
  assert.equal(fskPresentInWindow(t, SR48), true);
});
