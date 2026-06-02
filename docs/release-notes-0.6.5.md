# v0.6.5 — Paired patches travel with your sequences

When you save a sequence in JP Patches, you can pair it with one of
the patches in your library — so you know exactly which sound the
sequence was written for. That pairing has always lived in your local
library, but if you exported the sequence to a WAV and shared it with
another JX-3P friend, the patch reference (and the patch itself)
didn't travel along. Your friend got the sequence, but not the sound
with which it was intended to be paired.

This release fixes that. The custom RIFF chunk JP Patches already
uses to preserve patch names across cross-user WAV sharing now also
carries the sequence's custom name, original name, save date, your
patch note, *and* the full paired patch — name, slot reference, and
all 32 parameters. Share a sequence WAV and it lands on the other
side with everything intact, including the patch you were riffing on.

JP Patches uses that data the moment you click the sequence in your
library: it loads the paired patch onto the PG-200 panel as a
non-destructive preview, with a hint block under the JP logo telling
you what you're hearing and how to keep it.

## What's new

### Paired-patch preview on the panel

Click any sequence in your library that has a paired patch and the
PG-200 panel auto-loads it. The Patch readout above the parallelogram
swaps to **Paired Patch Preview**, the parallelogram itself shows the
patch name in amber italic, and all 24 knobs and 8 switches reflect
the patch's parameters. It's preview-only — nothing in your active
C/D banks changes until you decide to save it.

Below the JP logo, a small hint block tells you what's loaded:

> sequence: *David Nixon 2*
> written with: ***Square Pants***
> notes: *Patch D4, turn the ENV knob, tempo @ 50%.*
> click [Write] to save paired patch

### One-click save to a C or D slot

While previewing a paired patch from the library, click **Write**.
JP Patches flips you to Bank C with a slot-picker banner that names
the patch — *Click a slot to write "Square Pants" (Esc to cancel)* —
and you can navigate between Bank C and Bank D before picking your
destination. Click any slot, confirm the modal, and the patch lands
with its name pre-filled. The panel exits preview and settles onto
the slot you just wrote to.

### Tab clicks exit preview cleanly

If you're previewing a paired patch and click the Bank C or Bank D
tab without saving, the preview exits — the panel snaps to that
bank's slot 0 and what you see on the panel matches what's selected.
Mid-write the preview persists (so the slot-picker can navigate
between banks), but otherwise tab clicks mean "I'm done with that
preview."

### Load to JX-3P clears the preview

When you click **Load to JX-3P** on a paired-patch sequence, the
hint fades out and the panel returns to its slot view before the
Send modal opens. The JX-3P's tape format only carries sequence
data — not the patch — so the fade is a small honest signal that
we're sending just the sequence, even though the panel had been
showing both.

### Backward-compatible chunk schema

The RIFF chunk format gets a `v: 2` bump for the new sequence
metadata fields. Older v0.6.4 builds read v:2 chunks just fine
(they ignore the new keys); newer builds read v:1 chunks the same
way they always did. So this release doesn't break sharing with
people still on older versions.

## Install

Auto-update from v0.6.4 should bring this up automatically — on
launch JP Patches checks GitHub, downloads in the background, and
prompts to restart when ready.

If you're installing fresh, download the DMG below, open it, and
drag JP Patches to your Applications folder. Signed and notarized
by Apple — no security warnings.

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.
