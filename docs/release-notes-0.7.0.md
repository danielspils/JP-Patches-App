# v0.7.0 — JP Patches takes over its own audio routing

For every JX-3P tape user, audio routing on macOS has been a forced
choice. The Mac gives you one "system default" output, and JP Patches'
cable transmissions had to share it with everything else your Mac
played — clicks, sequencer note previews, the works. You got one or
the other, never both:

- **System default = the cable** (audio interface plugged into the
  JX): transmissions reach the synth, but every app sound vanishes.
  Click a switch in the panel UI → silence. Move a note in the
  sequencer editor → silence.
- **System default = your speakers**: app sounds work, but
  transmissions blast out the laptop speakers and the JX hears
  nothing → tape loads silently fail.

This release moves both decisions inside JP Patches. There are now
two explicit pickers — one for cable transmissions, one for app
sounds — and the app routes each stream to its target via
`setSinkId`. macOS system default becomes irrelevant to JP Patches.
Whatever you've got the Mac doing for its own audio doesn't matter;
JP Patches knows where every sound it makes belongs.

## What's new

### App-sound picker in the panel chrome

A small dropdown in the top-right corner of the panel, visible at
all times — *app sound: <device>*. Pick where button clicks, switch
clicks, and sequencer note previews play. Default is system default
(no behavior change on first launch); pick anything else once and
JP Patches pins it via `setSinkId` for every app sound from then on.

Most users will want this on the Mac's built-in speakers or their
headphones — the listening setup they normally use. The pinning is
remembered across modal closes, app reloads, and full restarts.

### Cable device picker in the Send modal

The OUTPUT DEVICE block in the Send-to-JX-3P modal — previously a
read-only display showing whatever system default resolved to — is
now an interactive dropdown listing every audio output device the
OS reports. Pick your audio interface (or whatever you've got
between the Mac and the JX) and JP Patches pins the transmission
audio to it on every Send.

Pre-v0.7 users could indirectly cause this by changing system
default; now it's an explicit choice that's separate from anything
else your Mac is doing.

### Safety belt — speaker-routing guard on the cable picker

The cable picker won't let you accidentally send a tape dump to your
laptop speakers. If your selection (explicit or implicit via system
default) resolves to the Mac's built-in speakers, a modal warning
pops:

> Heads up — your selected output is your speakers
>
> Sending a tape dump to your Mac's built-in speakers will play
> the FSK at full volume — loud and unpleasant — and the JX-3P
> won't receive anything (it's not connected to your speakers).
> Pick your audio interface from the OUTPUT DEVICE dropdown.

…and the ▶ Play button stays disabled until you pick a non-speaker
device. The amber "that's your speakers" warning JP Patches used
to show passively is gone; this active guard is its replacement.

### Audio Diagnostics surfaces both routes

`Help → Audio Diagnostics…` already showed whether Tape Dump Sounds
could find your built-in speakers. It now also shows where your
cable transmission is routed — *Transmission output: KT USB Audio
(…)* — so you can verify both ends of your audio plumbing in one
glance.

### Resilient to unplugged devices

If you'd pinned an audio interface in either picker and it's no
longer connected when JP Patches opens, the picker quietly falls
back to system default and clears the stale device ID from your
library. No errors, no confusing "device not found" — just back to
where you'd be without a pin. Pick a new device any time.

## What this unlocks

Now that app sounds have their own routing target:

- **Sequencer editor note previews** are audible whether or not
  your cable is the system default.
- **Button and switch click sounds** are audible the same way —
  they're off by default today (View menu toggle), but enabling
  them is no longer a routing gamble.
- **Tape Dump Sounds** keeps its existing built-in-speaker routing
  unchanged.

## Backward compatibility

If you've never opened the Send modal or touched the app-sound
picker, your routing hasn't changed — both pickers default to
*(system default)* and existing behavior is preserved. You only
get the new behavior once you pick a device. Older builds reading
a v0.7.0 library ignore the new `cableOutputDeviceId` and
`appSoundDeviceId` fields cleanly.

## Install

Auto-update from v0.6.5 should bring this up automatically — on
launch JP Patches checks GitHub, downloads in the background, and
prompts to restart when ready.

If you're installing fresh, download the DMG below, open it, and
drag JP Patches to your Applications folder. Signed and notarized
by Apple — no security warnings.

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.
