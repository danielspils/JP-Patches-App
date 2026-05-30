# JP Patches — pre-release smoke test

Run this checklist before publishing any release. ~15 minutes if
everything works; longer if anything regresses. Catches the kinds of
integration issues that unit tests can't (modal flows, file dialogs,
JX-3P interaction, drag-and-drop, etc.).

Mark each row ✅ pass / ❌ fail / ⏭️ skip (with reason).

## 1. Startup

| Check | Expected | Result |
|---|---|---|
| `npm start` launches Electron at 1140×710 | window opens with panel + active C/D | |
| First-run / seeded library shows Spils Sounds in C/D | not the "no patches loaded" empty state (unless library.json is fresh) | |
| Panel SVG renders fully (knobs, switches, buttons visible) | no "Panel SVG asset missing" red banner | |
| **No red banners at app launch** | global error stack empty | |

## 2. Bank navigation + patch editing

| Check | Expected | Result |
|---|---|---|
| Click Bank C tab, click Bank D tab | switches active bank, panel reflects current patch | |
| Click each of C1–C16 in turn | panel knobs animate to each patch's values | |
| Hover a smooth knob ~1 sec | tooltip appears showing 0–100 % | |
| Drag a smooth knob vertically | tooltip updates live; patch value changes | |
| Double-click a smooth knob, type `50`, Enter | knob snaps to 50%; tooltip dismisses | |
| Click a snap knob (e.g. DCO-1 Range) | cycles to next enum value | |
| Click any of the 8 toggle switches | cycles position **and plays the switch-click sound** | |
| Press Manual / Write panel buttons | LED lights on press **and plays the button-click sound** | |
| Press Tape Memory Save / Load buttons (when enabled) | red/green glow lights on click, just before the dialog opens, with the button-click sound | |
| Rapid repeated presses on any panel button | sound retriggers cleanly each press (no cutoff/overlap glitch) | |
| After editing a patch, a small dot appears next to its row | modified indicator | |
| Hover the dot | tooltip says "Revert" (or similar) | |
| Click the dot | patch reverts to clean state, dot disappears | |
| Drag-reorder a patch within bank | row moves; other rows shift; selection persists | |
| Cross-bank swap via the ⇄ hover icon | C-slot ↔ D-slot swap with animation | |

## 3. Library tab

| Check | Expected | Result |
|---|---|---|
| Click Library tab | Tones sub-tab shown by default | |
| Hover a package row → LOAD button | button visible | |
| Click LOAD on an unmodified bank | active C/D updates to that package | |
| Edit a patch, then LOAD a different package | 3-button modal: Cancel / Load without saving / Save and load | |
| "Save and load" path | name prompt → save → load proceeds | |
| Click Sequences sub-tab | sequences list shown | |
| Sequence row hover ⓘ info icon | clickable | |
| Click ⓘ | modal shows paired patch + note + save date | |
| Click 🗑 trash icon on a sequence | confirm modal → delete | |

## 4. Sequencer editor (new in v0.6.0)

**Critical:** this is the major new feature surface. Every encoding path was empirically validated end-to-end on real JX hardware May 26, but UI flows haven't burned in across releases yet. Run all rows; skip the JX round-trip if no JX is connected.

| Check | Expected | Result |
|---|---|---|
| Library → Sequences → click a sequence with content | visualizer renders piano-roll view | |
| Click a page button (1–8) | zooms into single-page view | |
| Hover an attack cell | tooltip shows ♪ + pitch name (e.g. `♪ C4`) | |
| Hover a REST cell (green) | tooltip shows the rest SVG glyph | |
| Hover a TIE cell (blue, or red that matches prev-column attacks) | tooltip shows ⌣ (tie arc) | |
| Click an empty area of the roll | insert tooltip appears at cursor (~3px offset) with NOTE button (and REST/TIE if available) | |
| Click another empty area | the tip moves to the new location (auto-dismisses old) — or click same spot → tip dismisses (toggle) | |
| Press Escape with tip open | tip dismisses | |
| Click NOTE button on an empty column | red attack appears at clicked pitch | |
| Add a second NOTE at a different pitch in the same column (chord) | second voice added; works up to 6 voices | |
| Click REST button on empty column following a 4-voice chord | 4 green ties appear (polyphonic REST per pitfall #16) | |
| Click TIE button on empty column following a 1-pitch column (canonical) | small BLUE note appears (single-voice TIE: tied + new-attack pair) | |
| Click TIE button on empty column following a 4-voice chord (fallback) | 4 RED attacks appear; hover any → tooltip says ⌣ (tie heuristic) | |
| Try to click NOTE on a column containing a REST or TIE | NOTE button is disabled; tooltip explains "Can't add a note to a step that has a rest or tie" | |
| Drag a note vertically | rect follows cursor; on drop, voice moves + preview tone plays at new pitch | |
| Click a single note | cream-tint outline appears | |
| Press Delete with one note selected | note removed | |
| Drag in empty area across 3+ note pitches in one column | all 3 notes highlight live as the drag covers their pitch range (no dashed rect) | |
| Press Delete with marquee selection | all selected notes removed | |
| Marquee-select 3 notes, then drag any one vertically | all 3 move by the same Δpitch (group drag) | |
| Make any edit → **Cmd+Z** | edit undoes; SAVE button clears if undo reached the original state | |
| **Cmd+Shift+Z** after the Cmd+Z | edit re-applies (redo) | |
| Marquee-select 3+ notes → Delete → Cmd+Z | all deleted notes restored in a single undo (not three) | |
| Click the playhead during playback | grabs (cursor: ew-resize); drag scrubs the playhead | |
| Make an edit → header shows SAVE affordance | dirty indicator visible | |
| Click SAVE → name prompt → confirm | new "edited" sequence appears in Library; original unchanged | |
| Make an edit → click a different sequence | nav-away guard modal: Save / Discard / Cancel | |
| Click Discard | original sequence stays intact | |
| **(Optional, requires JX-3P)** Round-trip an edited sequence: SAVE → Send-to-JX → play on JX → Record-back-to-JP → visual compare | both versions match column-for-column | |
| **Nav-away guard direction symmetry** (watch for known v0.6.0 intermittent): with a dirty sequence, click Bank C/D tab → modal should fire. Click back to Library tab → modal fires again. If EITHER direction skips the modal, capture state and report | both directions fire the modal | |

## 5. Tape Memory — file-based (no JX needed)

| Check | Expected | Result |
|---|---|---|
| Tape Memory → Tone → Save (file dialog branch) | drag-drop or pick a known-good WAV | |
| WAV decodes, active C/D populates | patch names visible, slot data correct | |
| Tape Memory → Tone → Load | file dialog → save WAV file → confirms saved | |
| Tape Memory → Sequencer → Save (file branch) | sequence dialog, decodes, save-sequence modal appears | |
| Tape Memory → Sequencer → Load | file dialog → save sequence WAV file | |

## 6. Record-from-JX-3P (requires JX-3P + audio interface)

**Critical:** this is the area we hammered on in v0.5.13. Run all 5 sub-checks.

| Check | Expected | Result |
|---|---|---|
| Tape Memory → Tone → Save from JX-3P → "Record from JX-3P" | record modal opens, level meter visible | |
| Press Tape Memory + Save on JX | level meter responds, arrow pulses | |
| Wait for auto-stop (or click Stop) | save modal appears, patch lands in C/D | |
| **No red error banners during or after capture** | global error stack stays empty | |
| Repeat capture 3× in same session without reload | all three succeed | |
| Sample-rate notice: open Audio MIDI Setup, change KT to 48 kHz | amber notice appears within ~2 s | |
| Re-check button on the notice | re-probes immediately | |
| Switch KT back to 44.1 | notice clears (if device input is reconfigurable) | |
| Sequence capture: Tape Memory → Sequencer → Save from JX-3P | same flow as tones; save-sequence modal appears | |
| Recalibrate path: trigger a "didn't decode cleanly" failure, click Recalibrate | calibration modal opens with PRIOR gain (not 1×) | |

## 7. Send-to-JX-3P (requires JX-3P + cable)

| Check | Expected | Result |
|---|---|---|
| Bank tab → use the SVG Load button → opens send modal | setup instructions visible | |
| Click "Send to JX-3P" | encode → enter play state → Play button | |
| Click ▶ Play | audio plays through default output; timeline indicator sweeps; arrow pulses | |
| Audio completes | all segments lit, "Complete" message | |
| **No red error banners during transfer** | | |
| Save WAV branch: click "Save WAV file" instead | file dialog → confirms saved | |
| Cancel during playback | audio stops, modal closes | |
| Sequence variant: Library → Sequences → LOAD a sequence | send modal opens with paired-patch context | |

## 8. Drag-and-drop

| Check | Expected | Result |
|---|---|---|
| Drag a `.wav` from Finder onto Bank C | quick-check modal → import → C populates | |
| Drag a `.wav` onto Library Tones | new package added with file's name | |
| Drag a sequencer-dump `.wav` onto Library Sequences | save-sequence modal | |

## 9. Custom Bank Builder

| Check | Expected | Result |
|---|---|---|
| Click "Create Custom Banks" button (Bank tab) | builder opens below panel | |
| Drag patches into C bucket (16 slots) | slots populate; origin labels shown | |
| Drag patches into D bucket (16 slots) | slots populate | |
| Once both buckets are 16/16, SAVE button appears | enabled, not greyed | |
| Click SAVE | name prompt → saves as Library Tones package → auto-loads as active C/D | |
| Click CLEAR (after building, before saving) | one-shot undo offered → restores prior state | |
| Builder state persists across app restart | re-launch app → builder shows last buckets | |
| **Reorder regression (v0.6.0 fix):** drag C-bucket slot 15 onto the BOTTOM half of slot 16 | green bar appears below slot 16; on drop, item moves into the last slot (previous slot-16 content shifts up to slot 15) | |
| Drag any C-bucket slot onto the TOP half of another slot | green bar appears above the target; on drop, item lands above the target | |

## 10. App menu

| Check | Expected | Result |
|---|---|---|
| JP Patches → About | modal appears with version | |
| View → 75% | window + renderer scale to 75% | |
| View → 100% | back to 100% | |
| View → Toggle DevTools | DevTools opens / closes | |
| View → Button & switch sounds (uncheck) | buttons + switches go silent | |
| View → Button & switch sounds (re-check) | sounds return | |
| Help → GitHub link | browser opens repo | |
| JP Patches → Check for Updates… (dev / `npm start`) | "Updates unavailable in development" dialog — no crash | |
| Cmd+W | window closes (app stays in dock) | |

## 11. Persistence check

| Check | Expected | Result |
|---|---|---|
| Edit a patch, reload renderer (Cmd+R) | dot persists; revert still works | |
| Quit + relaunch app | active C/D persists; modified dots persist | |
| Toggle Button & switch sounds off, quit + relaunch | menu checkbox stays unchecked; buttons/switches stay silent | |
| `library.json` is well-formed JSON | `python3 -c "import json;json.load(open(PATH))"` | |
| `library.json` has a `captureLog` field after a capture | telemetry working | |

## 12. Build (optional — only on release-prep runs)

| Check | Expected | Result |
|---|---|---|
| `npm run setup-vendor` succeeds | populates `vendor/uv/` and `vendor/jx3p/` | |
| `npm run dist:unsigned` produces a DMG in `dist/` | no errors | |
| Open the DMG, drag JP Patches to Applications | install completes | |
| Double-click the installed app | launches cleanly — no Gatekeeper "damaged"/unidentified warning (signed + notarized) | |
| `xcrun stapler validate "dist/JP Patches-<ver>.dmg"` | "The validate action worked!" | |

## 13. Auto-update (release-prep — requires two published builds)

Auto-update only activates in the installed (packaged) app, and only proves out across two real releases. Run this when verifying a release that the previous one should update *to*.

| Check | Expected | Result |
|---|---|---|
| Build emits the update feed | `dist/` contains `*-mac.zip` and `latest-mac.yml` after `npm run dist` | |
| Release published with feed attached | GitHub release has the `.dmg`, the `-mac.zip`, and `latest-mac.yml` assets | |
| Launch the OLDER installed build with a newer release live | update downloads silently in the background (no prompt yet) | |
| When the download finishes | "Update ready to install — Restart Now / Later" dialog appears | |
| Click Restart Now | app relaunches; JP Patches → About shows the new version | |
| Check for Updates… when already on latest | "You're up to date" dialog | |

---

## If anything fails

1. **Reproduce** the failure once more — confirm it's not a one-off.
2. **Check DevTools console** for `JP:ERROR` lines — the global error
   handler logs there even if the banner has been dismissed.
3. **Check `~/Library/Application Support/jp-patches/library.json`
   `captureLog`** for the last 30 captures' diagnostic data.
4. **Don't ship** until the failure is understood. The whole point of
   this checklist is to catch issues before users do.
