# v0.8.2 — Calibration Celebration!

Auto-calibration is here. JP now corrects for both low- and high-volume
tape-dump imports on its own. It happens in the background — you'll only be
asked to calibrate import gain in the most extreme cases (if ever). Rejoice!

## What's new

- **Record-from-JX just works.** Importing a tape dump no longer starts with
  a manual "calibrate volume" step. JP captures at a safe level and dials in
  the gain when it decodes — quiet dumps get boosted, hot ones still come
  through. Press **Tape Memory → Save** on the JX and your patches or
  sequences land in the library. That's it.
- **Manual calibration is still there as a safety net.** In the rare case a
  capture can't be read, JP offers it — and if a capture came in too hot, JP
  lowers the input gain itself and asks you to press Save again. No knob to
  fiddle with in the normal flow.

## Install

Auto-update from v0.8.1 should bring this up automatically. Otherwise: DMG
below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
