# v0.6.0 — Sequencer editor + JX-faithful editing rules

This release turns the Sequences sub-tab's piano-roll visualizer into
a full editor. Insert notes / rests / ties; drag-to-shift pitch;
marquee-select multiple notes per column; save edits as new library
entries. Every encoding path the editor can produce was empirically
validated end-to-end on a real JX-3P (tape-load → playback → tape-
record → JP-decode → visual match).

## What's improved

### Sequencer editor (new)

Single-page-view editing across the whole roll:

- **Click an empty area** of the roll → toggle a small insert tooltip
  with NOTE / REST / TIE buttons (note-glyph ♪, JX-tie-arc ⌣, eighth-
  rest SVG — same icons as the hover labels). Click again on any empty
  area → tip dismisses. Anchors near the cursor. Replaces the prior
  Ctrl+click / right-click trigger — plain click is more discoverable.
- **Drag a note vertically** → pitch-shift with live preview. The rect
  follows the cursor; on drop, the underlying voice mutates and a
  preview tone plays at the new pitch.
- **Marquee drag** on an empty area → column-constrained multi-select.
  Notes highlight live as the drag covers their pitch range (no dashed
  rectangle — the notes themselves indicate selection).
- **Group pitch-drag** → if the mousedown lands on a selected note in
  a group of >1, the drag moves every group member by the same Δpitch.
- **Keyboard Delete** → removes the selected note(s).
- **Playhead is grabbable directly** (cursor: ew-resize) for scrub.
- **Save-as-new-copy** → the original library sequence is snapshotted
  on first edit. SAVE writes the edits as a new "edited" library entry
  (numbered) and restores the original from the snapshot. Nav-away
  with unsaved edits prompts Save / Discard / Cancel.
- **Undo / redo** → standard **Cmd+Z** / **Cmd+Shift+Z** undoes any
  editor mutation (insert, delete, pitch-drag, group drag). Multi-note
  Delete via marquee selection is batched into a single undo entry.
  Reuses the app-wide undo stack (50 entries deep) already used by
  patch-list and bucket reorders. If undo brings the sequence back to
  its pre-edit state, the SAVE button automatically goes away.

### JX-faithful insert rules (pitfall #16 closure)

The editor's NOTE / REST / TIE buttons respect the JX-3P's actual
encoding constraints, so JP-edited sequences load and play correctly
on real hardware:

- **REST** ties EVERY new attack from the previous column into this
  step. A 5-voice chord followed by REST produces 5 tied voices in the
  next column, not 1.
- **TIE** writes canonical `{tied, attack}` voice pairs per pitch when
  N≤3 fits the JX's 6-voice budget; falls back to fresh-attacks-only
  for N≥4 (matches the JX firmware's observed polyphonic-TIE fallback).
- **NOTE** is disabled when the column has any tied voice — the JX
  itself can't record a step that mixes a note attack with a rest/tie
  continuation, so neither does the editor. The disabled button shows
  a tooltip explaining why.

End-to-end validated on real JX-3P hardware: edits round-tripped
through tape-load → JX playback → tape-record → JP decode with column-
for-column match, across all four encoding paths (single + chord
NOTE, polyphonic REST, canonical TIE, polyphonic-TIE fallback).

### Custom Bank reorder: drag-to-last-slot fixed

Dragging a C-bucket or D-bucket entry onto the LAST slot (C16 / D16)
was a silent no-op — the bucket drop handler was missing the top-half
/ bottom-half cursor convention that the three other reorder paths
already use. Now drop on the bottom half of a row to "insert after"
that row; the last slot is finally reachable as a destination. A
2px green bar appears above or below the target row to show direction.

### Write flow: Cancel actually exits now

Pressing **Cancel** on the "Save this new patch to <slot>?" confirm
modal used to dismiss the modal but leave the app in Write mode —
clicking any other slot re-popped the modal, which felt like a loop.
Cancel, Escape, and click-outside on the overlay all now exit Write
mode cleanly (banner disappears, Write button un-lights).

### Sequence visualizer header: page-count restored

The "X of N pages populated" text is back in the visualizer header
(removed earlier in the cycle on the theory that the dimmed page-
button row at the bottom communicated the same info). The explicit
count is faster to read.

## Internal changes

- **New pure-logic module** `renderer/seq-insert-rules.js` holding the
  NOTE / REST / TIE insert rules + eligibility math. Same source of
  truth for the tooltip's button-enabled state AND the underlying
  voice-array mutators. **33 new unit tests** pin every JX-derived
  property (canonical-vs-fallback TIE branch at N=4, polyphonic REST
  6-voice cap, NOTE-vs-tied gate, page-boundary lookups).
- **New module** `renderer/synth-preview.js` (triangle-wave note preview
  with envelope ramps; 5 tests including A4 = 440 Hz round-trip).
- `showConfirmModal` gained an optional `onCancel` callback so callers
  can clean up dependent state when the modal is dismissed without an
  explicit Confirm/Tertiary choice. (Used to fix the Write-flow loop.)
- `app.js` shrank by 77 lines on the seq-insert-rules extraction.
- **Test count: 127 → 199**, all passing.

## Known issues

- **Nav-away guard direction asymmetry (intermittent).** Observed once during QA: navigating from the sequence editor (Library tab) to the active banks (C/D) with an unsaved sequence did NOT pop the "Sequence has been edited" modal, but navigating back from the banks to the Library did. Both directions are wired through the same `guardSeqNav` helper, so the asymmetry should be impossible — but we couldn't reproduce it after the first occurrence. Not a data-loss bug (dirty tracking and SAVE/REVERT still work as labeled). If you hit it, capture the state and we'll instrument with logging in a follow-up.

## Install

Download the DMG below. macOS will flag it as "damaged" — that's a
Gatekeeper warning, not real damage. To open: right-click the app →
Open → Open. (Apple Developer ID notarization is on the roadmap for
a future release.)

**System requirement**: macOS 12+ on Apple Silicon (arm64). Intel
Macs not currently supported.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
