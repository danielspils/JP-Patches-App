# v0.7.1 — JP Patches remembers your audio gear

JP now *remembers* your audio devices even when they're unplugged,
and refuses to silently fall back to anything risky.

## What's new

### Ghost devices

Pick KT (or whatever cable you use) for tape dump routing, then
unplug it. The dropdown now shows **KT USB Audio (unavailable,
plug it in!)** as the visible selection — not a silent revert to
system default. Plug it back in: ghost disappears, real KT
selection restored automatically. No close-and-reopen needed.

Same behavior for in-app audio and Record-from-JX routing. All
three remember across app restarts.

### Send modal won't blast your speakers

If your tape dump device is unplugged when you open Send-to-JX,
the ▶ Play button stays disabled and a warning explains:

> *Your selected tape dump device (KT USB Audio) isn't connected.
> Plug it back in, or open Audio Settings and pick a different
> device. JP Patches won't fail back to your speakers (that would
> be painfully loud!).*

Replug → Play unlocks. No more accidental ear-blasts.

### Record-from-JX remembers too

Same preference memory for the input device you use to capture
tape dumps. Set it once in the Record modal (or from the new
"Record from JX-3P routing" row in Audio settings) — pre-selected
forever after.

### Audio settings → one stop

Help → Audio Diagnostics… is gone. The speaker-detection canary
that warned about macOS label changes now lives inline in the
Audio Settings modal, shown only when there's actually a problem.
And a new collapsible "How routing works" section explains where
each sound goes for the curious.

### Smaller things

- MIDI Memory dropdown flips back to Tape Memory on dismiss (was
  getting stuck on the non-functional mode).
- PG-200 knobs and switches respond on the Library tab now — just
  for fun. Resets when you click a real patch.

## Install

Auto-update from v0.7.0 should bring this up automatically.
Otherwise: DMG below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
