# v0.7.3 — Hotfix: download icon was broken in v0.7.2

A file the v0.7.2 build needed (`main-filename-util.js`) wasn't
included in the packaged DMG, so clicking the new download icon
errored out with *"No handler registered for 'tape-save-wav-to-path'."*
This release adds the missing file to the build manifest. Download
works as intended.

If you saw the error: update to v0.7.3 and the download icon will
work normally.

## Install

Auto-update from v0.7.2 should bring this up automatically. Otherwise:
DMG below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
