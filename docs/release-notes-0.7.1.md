# v0.7.1 — JP Patches remembers your audio gear

v0.7.0 introduced the audio settings panel with two dropdowns: one
for in-app audio (your speakers or headphones) and one for tape dump
routing (your cable to the JX-3P). Worked great — until I unplugged
my cable, opened the Send modal, and my carefully-picked KT USB
Audio device had silently switched back to system default. With my
system default set to the laptop speakers (per the v0.7.0 setup), I
was one click away from blasting my ears with a full-volume FSK
transfer. The very bug v0.7.0 was supposed to prevent.

v0.7.1 fixes that. JP Patches now *remembers* your audio gear even
when it's unplugged, and refuses to silently fall back to your
speakers.

## What's new

### Ghost devices — JP Patches remembers your pick

When you pick KT (or whatever you use) for tape dump routing and
then unplug the cable, the dropdown now shows your selection as
**KT USB Audio (31b2:2024) (unavailable, plug it in!)** — front
and center in the closed dropdown. Same for the in-app audio
picker and the Record from JX-3P routing.

Plug the cable back in and the picker live-updates: ghost goes
away, your real KT selection becomes the live pick. No need to
close and reopen the modal.

### Hot-plug aware

Both the Audio Settings modal and the Send-to-JX modal listen for
device changes while open. Unplug a device mid-modal, plug a
different one in, swap your interface — the dropdowns + status
displays react in real time.

### The Send modal refuses to blast your speakers

If your selected tape dump device isn't connected when you open the
Send-to-JX modal, the ▶ Play button stays disabled and a warning
modal explains why:

> Your selected tape dump device (KT USB Audio) isn't connected.
> Plug it back in, or open Audio Setting (gear icon, top-right of
> the panel) and pick a different device.
>
> JP Patches won't fail back to your speakers (that would be
> painfully loud!). Your last device is remembered—plug it back in
> to restore it.

Plug the cable back in and Play unlocks immediately. No more "I
clicked Play and my ears bled" risk.

### Record from JX-3P also remembers

If you always use the same audio interface to record from your
JX-3P, JP Patches now remembers that preference across sessions.
Open the Record-from-JX modal and your device is pre-selected —
even if you've quit and relaunched the app in between.

You can also set it from the Audio Settings panel directly (a new
fifth row, **Record from JX-3P routing**) — either surface stays
in sync.

### Audio Settings panel — now one stop for everything

The standalone **Help → Audio Diagnostics…** menu item is gone.
The macOS speaker-detection canary (which warns if a macOS update
breaks Tape Dump Sounds routing) and the bug-report button now
live inline at the bottom of the Audio Settings modal — only shown
when there's actually a problem to surface.

And a new collapsible **"How routing works"** section at the
bottom of the modal explains where each sound goes (in-app
clicks, Tape Dump Sounds monitor, outgoing transfers, incoming
captures) for the curious.

### Smaller things

- The Tape Memory dropdown's "MIDI Memory" placeholder modal now
  flips back to Tape Memory on dismiss (was getting stuck on the
  non-functional mode).
- The Record-from-JX "PROCESSING" segment in the timeline pulses
  in place instead of looking frozen at the boundary — honest
  signal that decode duration is unpredictable.
- Sequencer note previews get a gentle low-pass filter on the
  triangle wave — slightly mellower top octave.
- Sequence info popover now reads **Created:** instead of **Saved:**
  (the timestamp is creation time, not last-save time).
- A small italic hint appears above the **save C/D banks to
  library** button when you've just imported a fresh JX-3P tape
  capture: *"Your JX-3P import is in active C/D — save here to
  keep a snapshot."* Self-dismisses once you save.
- The PG-200 panel knobs and switches respond on the Library tab
  now (it's just for fun — your changes don't affect any real
  slot, and the panel resets when you click a real patch).

## Install

Auto-update from v0.7.0 should bring this up automatically — on
launch JP Patches checks GitHub, downloads in the background, and
prompts to restart when ready.

If you're installing fresh, download the DMG below, open it, and
drag JP Patches to your Applications folder. Signed and notarized
by Apple — no security warnings.

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.
