# v0.6.4 — Hear your tape dumps + a cleaner modal family

JP Patches can now play the FSK tone of your *incoming* tape dumps
through your Mac's built-in speakers in parallel with the cable —
so you actually hear the data come in from your JX-3P (the 1980s
cassette-backup sound you grew up with). The send-direction equivalent
landed earlier; both directions are wired now.

Also a sweep through every transfer modal to tighten the copy, unify
the titles, and surface a long-standing JX-3P gotcha (Memory Protect)
before it can quietly eat your transfers.

## What's new

### Hear your tape dumps — both directions

- Toggle **View → Tape dump sounds** on. During Send-to-JX *and*
  Record-from-JX, the FSK plays quietly through your Mac speakers
  in parallel with the cable.
- Per-modal **volume slider + mute icon** in both flows — adjust on
  the fly without leaving the modal.
- Off by default. Fully isolated from the actual transfer: a separate
  audio stream that can't affect the cable data either way.

### Audio Diagnostics (Help → Audio Diagnostics…)

A one-glance check of whether Tape Dump Sounds can find your Mac's
built-in speakers. Green "All systems go!" if the speakers are
detected, amber if something's changed (a recent macOS update may
have shifted the speaker label format) with a one-click **Report
this bug** button that opens a pre-filled GitHub Issue containing
your device list — paste-and-go for me to ship a fix.

### Memory Protect reminder in the Send modal

Both Send-to-JX modals now include a small reminder:
*"Make sure Memory Protect is off on the JX-3P."* It's a JX-3P
gotcha that silently discards tape-load writes — the transfer looks
like it worked from JP's side but nothing actually saved on the JX.
The hint prevents the silent-failure trap.

### Cleaner modal family

A pass across both Send-to-JX and Record-from-JX modals to align
the visuals, drop dead copy, and improve the order of events:

- **New titles**: *Send sequence to JX-3P* / *Send C/D banks to
  JX-3P* / *Import sequence from JX-3P* / *Import C/D banks from
  JX-3P* — same shape across all four flows. Dropped the misleading
  "Step 2 of 2" prefix (which only made sense the first time you
  calibrated a new audio input).
- **New OUTPUT DEVICE block** in the Send modal, visually matching
  the INPUT DEVICE block in Record — so the device routing is
  surfaced consistently across both directions.
- **Cause-effect layout**: when the JX starts transmitting (during
  Record), the JP Patches "receiver" logo + arrow now fade in
  alongside your JX key diagram — the diagram visually shifts to
  make room, mirroring the Send modal's pattern.
- **Three-button post-capture warning** (Record): when a capture
  comes in too loud (clipping) or too quiet, you now get a
  **Calibrate** button right there — drops you straight into
  calibration mode so you can lower the gain without canceling and
  reopening. Use Anyway shifts to red to signal "you probably
  shouldn't."
- Removed time estimates, hint about not switching apps during
  transfer, and other low-value copy that had accumulated. The
  timeline communicates duration on its own.
- The "loading: *package name*" label below the JX-3P logo updates
  to "✓ complete: *package name*" when the transfer finishes.

## Install

Auto-update from v0.6.3 should bring this up automatically — on
launch JP Patches checks GitHub, downloads in the background, and
prompts to restart when ready.

If you're installing fresh, download the DMG below, open it, and
drag JP Patches to your Applications folder. Signed and notarized
by Apple — no security warnings.

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.
