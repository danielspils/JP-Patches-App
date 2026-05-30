# v0.6.3 — Automatic updates (for real this time)

JP Patches now updates itself. On launch it checks for a newer release
and downloads it in the background; when an update is ready it offers to
restart and finish installing — no more manually downloading a DMG each
time.

(0.6.2 shipped this feature but with a packaging bug that broke the
update download. 0.6.3 fixes it. This is the version every later release
will update from.)

## What's new

### In-app auto-update

- On launch, the app quietly checks GitHub for a newer signed release.
- If one exists, it downloads in the background, then asks: **Restart
  Now** or **Later**. Restarting finishes the update.
- **JP Patches → Check for Updates…** runs the same check on demand and
  tells you if you're already up to date.

One-time note: because the working version of auto-update lands here,
install **this** release manually. Every release after it arrives
automatically.

## Install

Download the DMG below, open it, and drag JP Patches to your
Applications folder. The app is signed and notarized by Apple, so it
opens normally — no security warnings.

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.
