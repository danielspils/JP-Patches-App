# v0.8.4 — Tape Dumps Work (finally)

Tape transfers are finally reliable: patches and sequences transfer between JP Patches and the JX-3P without losing data. This bug nearly crushed me (many long days of haggling with Claude).

Recently I noticed captures from the JX dropped data at random — sequences missing pages, patches arriving with sound but no name (or a name but no sound). The culprit: JP was quietly asking your Mac to convert the incoming audio to a different sample rate in real time, and that conversion jittered the JX's tape-dump timing just enough to lose records.

JP now records at your interface's native sample rate — no conversion, no jitter, no dropped records.

You can read the whole story here: [Notes blog](https://jx-3p.com/notes/the-missing-music/).

## Install

Auto-update from v0.8.3 brings this up automatically. Otherwise: DMG below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
