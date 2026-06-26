# v0.8.5 — Trimming the fat

Found and fixed the tape-dump gremlin (the bane!). When you record from the
JX-3P, the synth hums an idle tone before and after the actual dump. JP now
reliably finds the real dump inside the recording — by its sound, not its
loudness — and trims that idle hum off before decoding.

What this means for you: captures decode whether your input gain is high or
low. No more riding the gain knob way down to coax a clean read.

## Install

Auto-update from v0.8.4 should bring this up automatically. Otherwise: DMG
below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
