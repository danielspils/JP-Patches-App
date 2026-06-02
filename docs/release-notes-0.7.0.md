# v0.7.0 — Pin your cable, hear everything else

Until now, JP Patches has been stuck in a routing trap that every
JX-3P tape user runs into eventually. macOS gives you one "system
default" output — and JP Patches' cable transmissions had to share
that default with the rest of your Mac's audio. You got to pick one
or the other, and neither choice worked:

- **System default set to the cable** (audio interface plugged into
  the JX's tape input): transmissions reach the synth, but every
  app sound vanishes. Click a switch in the panel UI → silence.
  Drop a note in the sequencer editor → silence. The Tape Dump
  Sounds monitor still plays through the built-in speakers thanks
  to its explicit routing, but everything else is gone.
- **System default set to your speakers or headphones**: app
  sounds work, but transmissions blast out the laptop speakers
  and the JX hears nothing → tape loads silently fail.

There was no setting that let you say "the cable is the cable, my
speakers/headphones are where I listen to everything else." Now
there is.

## What's new

### Explicit cable device picker in the Send modal

The OUTPUT DEVICE block in the Send-to-JX-3P modal used to be a
read-only display showing whatever your system default resolved to.
It's now an interactive dropdown listing every audio output device
the OS reports. Pick your audio interface (or whatever you've got
between the Mac and the JX) once, and JP Patches pins the
transmission audio to it via `setSinkId` on every Send. The
selection persists across modal closes, app reloads, and full
restarts.

System default can now be your speakers, your headphones, your
AirPods — whatever your normal listening setup is. App sounds and
sequencer previews route there. Cable transmissions route through
the pinned device. They no longer fight for the same output.

The amber "that's your Mac's built-in speakers, not your JX cable"
warning is gone — it was a workaround for the old routing tangle.
The picker IS the answer now; if you explicitly chose a device,
you know where the transmission is going.

### Audio Diagnostics surfaces the pinned device

`Help → Audio Diagnostics…` already showed which device Tape Dump
Sounds was routing to (the parallel monitor through your built-in
speakers). It now also shows where your cable transmission is
routed — *Transmission output: KT USB Audio (…)* — so you can
verify both ends of your audio plumbing in one glance.

### Resilient to unplugged devices

If you'd pinned an audio interface and it's no longer connected
when you open the Send modal, the picker quietly falls back to the
system default and clears the stale device ID from your library.
No errors, no confusing "device not found" — just back to where
you'd be without a pin. Pick a new device any time.

## What this unlocks

Less obvious wins of having a non-shared default:

- **Sequencer editor note previews** are now audible whether or
  not your cable is the default — the previews route to system
  default, which is now safely your speakers.
- **Button and switch click sounds** are now audible for the same
  reason. They're off by default today partly because they were
  inaudible when cable was the default; that excuse is gone.
- **Tape Dump Sounds** stays exactly the same — it still routes
  to your built-in speakers via its existing explicit routing.

## Backward compatibility

If you've never opened the Send modal in v0.7.0, your routing
hasn't changed — the picker defaults to *(system default)* on
fresh libraries and existing behavior is preserved. You only get
the new behavior once you pick a device. Older builds reading a
v0.7.0 library ignore the new `cableOutputDeviceId` field cleanly.

## Install

Auto-update from v0.6.5 should bring this up automatically — on
launch JP Patches checks GitHub, downloads in the background, and
prompts to restart when ready.

If you're installing fresh, download the DMG below, open it, and
drag JP Patches to your Applications folder. Signed and notarized
by Apple — no security warnings.

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.
