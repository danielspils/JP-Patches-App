# v0.7.6 — Library cleanup + a bug fix (and a quiet preview)

A tidy-up release for the Library, plus one bug that deserved squashing.

## What's new

- **Tones get an info icon too.** Hover any package in Library → Tones
  and click the ⓘ — patch names at a glance, where the patches came
  from (handy for custom banks built from several libraries), the date,
  and whether the package is what's currently loaded in your active
  C/D banks.
- **Creating things is clearer.** The big key below the panel now does
  the right thing wherever you are: **Create New Sequence** (blue) on
  Library → Sequences, **Create Custom Banks** (green) everywhere it
  applies — including straight from Library → Tones, which jumps you to
  Bank C with the builder open.
- **JSON files work everywhere WAVs do.** Drag a `.json` export onto
  the app (or pick one in the Save dialogs) and it imports just like a
  WAV — patch and sequence names included.
- **Clearer words.** "save active C/D banks to library", "Loading to
  active C/D banks" — small label changes so it's always obvious
  you're acting on the *active* banks.

## Fixed

- **Deleting a just-created sequence no longer haunts its neighbor.**
  Creating a new sequence, trashing it, and navigating away could pop a
  bogus "unsaved edits" warning naming a sequence you never touched —
  and saving from that warning minted a junk "(edited)" copy. The
  bookkeeping underneath has been rebuilt (with tests) so deleting,
  reordering, and creating sequences can't mix each other's state up.
- The sequence view below the panel now clears immediately when you
  delete the sequence you're looking at.
- Read-only info popups show a single Close button instead of a
  Cancel/Close pair that did the same thing.

## A quiet preview

If you poke around Library, you'll find **"explore the user lending
library"** — the beginnings of patch and sequence trading between
JX-3P owners, backed by [jx-3p.com/patches](https://jx-3p.com/patches/).
It works today (borrow away!), but the full story gets its own release
soon. Consider this a soft opening.

## Install

Auto-update from v0.7.5 should bring this up automatically. Otherwise:
DMG below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
