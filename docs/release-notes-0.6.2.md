# v0.6.2 — Automatic updates

JP Patches can now update itself. Starting with this version, the app
checks for new releases on launch and downloads them in the background;
when an update is ready it offers to restart and finish installing — no
more manually downloading a DMG each time.

## What's new

### In-app auto-update

- On launch, the app quietly checks GitHub for a newer signed release.
- If one exists, it downloads in the background and then asks: **Restart
  Now** or **Later**. Restarting finishes the update.
- **JP Patches → Check for Updates…** runs the same check on demand and
  tells you if you're already up to date.

One-time note: because this is the first version with auto-update built
in, you'll install **this** release manually. Every release after it
arrives automatically.

## Install

Download the DMG below, open it, and drag JP Patches to your
Applications folder. The app is signed and notarized by Apple, so it
opens normally — no security warnings.

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.
