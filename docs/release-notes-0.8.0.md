# v0.8.0 — The User Lending Library has arrived!

Borrow and lend your C/D banks of patches and your custom sequences with
other JX-3P-eople. No accounts required. This is Open Source meets Little
Free Library.

I'm currently the only person using it. Join me.

## What's new

- **Borrow.** Library → Tones (or Sequences) → **explore the user lending
  library**. The three newest user files are right there — one click and
  they're in your library, names, notes, and paired patches intact. The
  full catalog lives at [jx-3p.com/patches](https://jx-3p.com/patches/)
  and [jx-3p.com/sequences](https://jx-3p.com/sequences/).
- **Lend.** Same modal — check the two lending boxes, click **lend**, add
  your name and hometown, submit. No account, no upload, no form. Your
  file is live on the site and in everyone's app within about 3 minutes.
- **Change your mind?** Click the green **submitted** button to remove
  your file from the library for future users. If it's already downloaded
  by users, it's in the wild and can't be taken back (just know before
  you let go).
- **Hearts + borrow counts.** Tap the heart on the site if you like what
  you hear; every entry shows how many times it's been borrowed.
- **Every file remembers where it came from.** The ⓘ icons — now on
  Tones packages too — show who created what, when, and where, including
  the lender's notes on anything you borrow.
- **JSON files work everywhere WAVs do.** Drag a `.json` export onto the
  app (or pick one in the Save dialogs) and it imports just like a WAV —
  patch and sequence names included.

## Fixes

- **Deleting a just-created sequence no longer haunts its neighbor.**
  Creating a new sequence, trashing it, and navigating away could pop a
  bogus "unsaved edits" warning naming a sequence you never touched. The
  bookkeeping underneath has been rebuilt (with tests), and the sequence
  view below the panel now clears immediately when you delete the
  sequence you're looking at.
- Sequence info, package info, and patch history popups got a matching
  cleanup — the item is the header, empty fields stay hidden, and one
  Close button does the work.

## Install

Auto-update from v0.7.5 should bring this up automatically. Otherwise: DMG
below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
