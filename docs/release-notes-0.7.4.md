# v0.7.4 — Create Custom Banks fixes

If you're reading this, welcome to JP Patches 7.4! If I'm being honest,
developing this lil' program is super fun … and also a shit-ton of work.
I'm trying to stabilize things by fixing bugs and correcting my own
mistakes. This release focuses on cleanups to the custom bank builder
based on real use.

There will undoubtedly be more fixes, but it does feel like things are
stabilizing. I'm loving using JP Patches with my JX-3P. I hope you do too.

## What's new

- **Drag patches between C and D banks.** You can now drag a slot from
  the C bucket to the D bucket (and back). Before, cross-bank drags
  silently did nothing.
- **Empty slots save as blank.** When you save a bank with some slots
  empty, those slots are now silent (no sound) instead of inheriting
  whatever was loaded. What you see is what you save.
- **Empty slots read "blank"** in the bank list, instead of "imported as
  C9 from …".

## Install

Auto-update from v0.7.3 should bring this up automatically. Otherwise:
DMG below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
