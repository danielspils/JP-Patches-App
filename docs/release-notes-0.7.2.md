# v0.7.2 — Upload and download WAVs from your library

For users who don't have the KT cable connected (or who want to share
a backup of a saved bank), JP Patches now has explicit upload and
download affordances right in the library.

## What's new

### Upload WAV files

A new dashed-border zone at the bottom of Library → Tones (and Library →
Sequences) that reads *"drop a WAV or click to upload a WAV"*. Drop a
file onto it OR click to open the native macOS file picker. Same
import path as before — the zone just makes the option visible. On
drop, the zone pulses and shows *"Importing… (decoding WAV)"* so you
know something's happening during the brief decode pause.

### Download WAVs from any library row

Hover any row in Library → Tones or Library → Sequences and you'll
see a new download icon between the LOAD/info button and the trash.
Click it to open the native macOS Save dialog, defaulting to your
Desktop with the package or sequence name pre-filled. Save where you
want, or hit Cancel.

The downloaded WAV is a full JX-3P-loadable tape dump, with all the
v0.6.5 metadata baked in (custom names, paired patches, notes) — so
sharing one with another JP Patches user preserves everything.

### Cleaner Send-to-JX flow

The *"Save WAV file"* button is gone from the Send-to-JX modal — that
action lives on each library row now. The Send modal stays focused
on its one job: shoot the active C/D banks (or a sequence) down the
cable.

### Wrong-tab WAVs auto-route

If you drop a Sequence WAV on the Tones sub-tab (or a Tones WAV on
Sequences), JP Patches detects the mistype and silently switches you
to the right sub-tab to land the file there. No modal, no warning —
just the tab change as your signal that the file went where it
belonged.

## Install

Auto-update from v0.7.1 should bring this up automatically. Otherwise:
DMG below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
