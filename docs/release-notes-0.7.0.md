# v0.7.0 — Signed, notarized, and a little more alive

JP Patches is now **signed and notarized by Apple**. The big practical
win: the app installs cleanly. No more "JP Patches is damaged" warning,
no right-click → Open dance, no Terminal commands — download the DMG,
drag it to Applications, and open it like any other Mac app.

This release also gives the PG-200 panel a voice: the buttons and
switches now click when you use them, sampled from a real JX-3P.

## What's new

### Signed + notarized build

The DMG is code-signed with an Apple Developer ID and notarized by
Apple, then stapled so it even opens cleanly offline. Gatekeeper now
recognizes JP Patches as coming from an identified developer — the
first-launch experience is the normal one.

If you've been using an earlier build that you had to right-click → Open
(or run `xattr` on), you can replace it with this one and just
double-click from now on.

### Button & switch sounds

The six Tape Memory panel buttons (Tone Save/Load, Sequencer Save/Load,
Manual, Write) now play a JX-3P button click when pressed, and the eight
PG-200 toggle switches play a softer switch click. Both are sampled from
an actual JX-3P.

- **On by default**, toggled from **View → Button & switch sounds**.
- The setting persists across launches.
- The **Manual** button now lights its LED on press, and the Tape Memory
  Save / Load buttons light when clicked, matching the other panel
  buttons.

## Also

- Feedback now has a home: **[jx-3p.com/feedback](https://jx-3p.com/feedback/)**
  has a simple form if you want to report a bug or say how it's working
  with your JX-3P.

## Install

Download the DMG below, open it, and drag JP Patches to your
Applications folder. The app is signed and notarized by Apple, so it
opens normally — no security warnings.

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.
