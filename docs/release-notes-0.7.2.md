# v0.7.2 — WAV file library improvements

For users who don't use a cable or audio interface (or who want to
share a backup of a saved bank), JP Patches now has explicit upload
and download affordances from the library.

## What's new

### Upload WAV files

Made it much clearer that you can drag-and-drop or click to upload
WAV files direct from your computer. Works for C/D patches (aka
Tones) or Sequences.

### Download WAVs from any library row

Hover any file in Tones or Sequences and you'll see a new download
icon for saving that file to your desktop. The downloaded WAV is a
full JX-3P-loadable tape dump. These files include v0.6.5 metadata
baked in (custom names, paired patches, notes) — so sharing a WAV
file of tones or a sequence with another JP Patches user preserves
everything. They'll see custom names, paired patch, notes.

### Cleaner Send-to-JX flow

The "Save WAV file" button is gone from the Send-to-JX modal — that
action lives on each library row now.

### Wrong-tab WAVs auto-route

If you drop a Sequence WAV on the Tones sub-tab (or a Tones WAV on
Sequences), JP Patches detects your brain fart and uploads to the
correct tab, silently switching you to the right sub-tab.

## Install

Auto-update from v0.7.1 should bring this up automatically. Otherwise:
DMG below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
