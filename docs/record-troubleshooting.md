# Record-from-JX — "didn't decode cleanly" troubleshooting

When a tape-dump capture fails to decode, **get DATA before theorizing.** Two debugging marathons (2026-06-26/27) burned days on wrong theories the data would have killed in minutes. Both real software causes have since shipped fixes (v0.8.5); what remains useful is the toolkit + how to tell the failure modes apart.

## Diagnostic toolkit

- **The failing WAV is on disk.** The renderer writes the trimmed capture to `os.tmpdir()/jp_seq_record_<ts>.wav` (sequences) or `jp_patches_record_<ts>.wav` (tones); it's not cleaned up immediately. Grab it right after the failure modal:
  `find $(node -e 'console.log(require("os").tmpdir())') -name 'jp_*record_*.wav' -mmin -30`
- **Per-capture telemetry** in `library.captureLog` (`~/Library/Application Support/jp-patches/library.json`): `{timestamp, gain, capturePeak, decode, populatedPages, audioDiag}`. `gain: null` = auto-decode path. Compare a failing run against a past SUCCESS at the same `capturePeak` to separate signal-quality from level.
- **Known-good reference**: `~/JP-Patches/tests/fixtures/quiet-unit-seq.wav` → 8 pages.
- **Decode ONLY via the `jx3p` CLI** (`wav-to-json` / `wav-to-seq-json`). Hand-rolled `_decode_patches` / `_decode_sequence_records` framing in a Python REPL gives **FALSE results** — it disagreed with the CLI in both directions and was wrong both times.
- **Codec internals** (`uv run python` from `~/JP-Patches`): `_load_wav_mono_float` (applies the auto-boost) → `_detect_crossings` (returns inter-crossing **intervals in samples**, NOT indices — don't `np.diff` them) → `_demodulate_bits` → `_decode_sequence_records`. A healthy dump shows a **bimodal interval histogram**: a short cluster ~6 samples (bit-0, the high-freq tone) + a long cluster ~25 (bit-1 / pilot).

## The 4-way failure triage

Pull the temp WAV, boost it, count total bit-0 cycles, run a sliding-window decode. **`capturePeak` alone does NOT predict success.** If it works on one machine but not another, AirDrop + diff `library.json`.

1. **~0 bit-0 cycles anywhere** → the capture contains no dump data (capture timing / early auto-stop / the JX didn't dump that press / a transient). NOT a decoder bug — a capture event. **Don't assume a cable fault.**
2. **Many bit-0 cycles, full buffer fails but a sub-window decodes** → the loud-idle **trim bug** → FIXED v0.8.5 (`findFskStartByFreq`). This was the systemic, intermittent one (random success/fail at identical gain across weeks of `captureLog`).
3. **Many bit-0 cycles, even the best window only partially decodes** → marginal signal (too quiet; the boost amplified the noise floor into spurious cycles). Needs more level / a cleaner cable, not code.
4. **Decodes on machine A but not B (same gear), or a Recalibrate loop** → over-hot saved calibration → FIXED v0.8.6 guardrails (cal target 0.78→0.45, gain cap 30→12). Recovery: clear the device's saved gain — the **Calibrate** button does this now (the old "Reset to auto-decode" branch was removed in v0.8.5).

## The two root causes (both shipped fixes)

- **Loud-idle trim (v0.8.5).** The JX hums an idle tone before AND after the dump. The amplitude trim (`computeFskTrim`) found the dump start by looking for a *silence gap*; a loud idle leaves no gap, so the trim kept everything and the leading idle wrecked the demodulator's `long_width` calibration → 0 records. Fix: **`findFskStartByFreq`** finds the dump by its bit-0 (short-cycle) **frequency** signature — amplitude-independent. Now the PRIMARY trim; `computeFskTrim` is the fallback.
- **Forced-44.1k resample jitter (v0.8.5).** See the "native-rate capture" trap in CLAUDE.md. JP forced getUserMedia/AudioContext to 44.1k → Chromium real-time-resampled the 48k input → ~2× FSK timing jitter → dropped dense sequence pages. Fix: capture at the device's native rate.

## Dead ends — do NOT re-chase (each disproven with data)

Sample rate (the on-disk WAV is always whatever the AudioContext was set to), clipping (failing captures measured 0%), browser DSP (`audioDiag` proved `processingActive:false` every time), weak/absent bit-0 (a *symptom* of idle-in-the-trim, not capture quality), auto-boost level, and **the cable** — tempting after a reseat seemed to "fix" it, but it failed across two independent rigs and the cause was software both times.

**Reach for the data — temp WAV + `captureLog` + `library.json` — not the cable.**
