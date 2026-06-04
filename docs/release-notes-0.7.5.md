# v0.7.5 — Sequencer repeat :|| + more fixes

My motto: ship 'til I drop! Welcome to 7.5

I added a :|| repeat to the sequencer, plus more fixes.

## What's new

- **Repeat (:||) in the sequence editor.** There's a small :|| toggle next
  to the play button. Flip it on and playback loops the active part of your
  sequence — just like the JX-3P.

## Fixes

- **Custom bank patch history shows the true origin again.** When you build
  a custom bank from patches that live in another library, the patch history
  (the ⓘ icon) now traces back to where the patch actually came from — the
  original library and date. This release also quietly repairs your existing
  banks.
- **Renaming a library item no longer starts blank.** Click the pencil and
  the current name is right there, selected and ready to edit.
- **The app remembers your Record-from-JX input level across updates.** It
  was forgetting your calibrated gain whenever the app updated; now it sticks.
- **Tightened up the Send-to-JX confirmation.** Centered the buttons and
  trimmed the empty space.

## Install

Auto-update from v0.7.4 should bring this up automatically. Otherwise: DMG
below, drag to Applications. Signed + notarized.

**System requirement**: macOS 12+ on Apple Silicon (arm64).
