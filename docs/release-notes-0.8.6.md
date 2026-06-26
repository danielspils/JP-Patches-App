# v0.8.6 — Calibration guardrails

Two fixes so a saved calibration can't trap you in a recalibrate loop:

- **Calibration now aims lower and is capped**, so it can't over-drive your input gain (the cause of captures that wouldn't decode no matter how many times you recalibrated).
- When a capture won't decode, the recovery prompt now offers **"Reset to auto-decode"** — one click to clear a device's saved gain and fall back to the auto-decode default, instead of recalibrating into the same hole.

## Install

Auto-update from v0.8.5 should bring this up automatically. Otherwise: DMG
below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
