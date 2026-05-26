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

## 4. Tape Memory — file-based (no JX needed)

| Check | Expected | Result |
|---|---|---|
| Tape Memory → Tone → Save (file dialog branch) | drag-drop or pick a known-good WAV | |
| WAV decodes, active C/D populates | patch names visible, slot data correct | |
| Tape Memory → Tone → Load | file dialog → save WAV file → confirms saved | |
| Tape Memory → Sequencer → Save (file branch) | sequence dialog, decodes, save-sequence modal appears | |
| Tape Memory → Sequencer → Load | file dialog → save sequence WAV file | |

## 5. Record-from-JX-3P (requires JX-3P + audio interface)

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

## 6. Send-to-JX-3P (requires JX-3P + cable)

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

## 7. Drag-and-drop

| Check | Expected | Result |
|---|---|---|
| Drag a `.wav` from Finder onto Bank C | quick-check modal → import → C populates | |
| Drag a `.wav` onto Library Tones | new package added with file's name | |
| Drag a sequencer-dump `.wav` onto Library Sequences | save-sequence modal | |

## 8. Custom Bank Builder

| Check | Expected | Result |
|---|---|---|
| Click "Create Custom Banks" button (Bank tab) | builder opens below panel | |
| Drag patches into C bucket (16 slots) | slots populate; origin labels shown | |
| Drag patches into D bucket (16 slots) | slots populate | |
| Once both buckets are 16/16, SAVE button appears | enabled, not greyed | |
| Click SAVE | name prompt → saves as Library Tones package → auto-loads as active C/D | |
| Click CLEAR (after building, before saving) | one-shot undo offered → restores prior state | |
| Builder state persists across app restart | re-launch app → builder shows last buckets | |

## 9. App menu

| Check | Expected | Result |
|---|---|---|
| JP Patches → About | modal appears with version | |
| View → 75% | window + renderer scale to 75% | |
| View → 100% | back to 100% | |
| View → Toggle DevTools | DevTools opens / closes | |
| Help → GitHub link | browser opens repo | |
| Cmd+W | window closes (app stays in dock) | |

## 10. Persistence check

| Check | Expected | Result |
|---|---|---|
| Edit a patch, reload renderer (Cmd+R) | dot persists; revert still works | |
| Quit + relaunch app | active C/D persists; modified dots persist | |
| `library.json` is well-formed JSON | `python3 -c "import json;json.load(open(PATH))"` | |
| `library.json` has a `captureLog` field after a capture | telemetry working | |

## 11. Build (optional — only on release-prep runs)

| Check | Expected | Result |
|---|---|---|
| `npm run setup-vendor` succeeds | populates `vendor/uv/` and `vendor/jx3p/` | |
| `npm run dist:unsigned` produces a DMG in `dist/` | no errors | |
| Open the DMG, drag JP Patches to Applications | install completes | |
| Right-click app → Open (Gatekeeper bypass) | app launches with the same first-run behavior | |

---

## If anything fails

1. **Reproduce** the failure once more — confirm it's not a one-off.
2. **Check DevTools console** for `JP:ERROR` lines — the global error
   handler logs there even if the banner has been dismissed.
3. **Check `~/Library/Application Support/jp-patches/library.json`
   `captureLog`** for the last 30 captures' diagnostic data.
4. **Don't ship** until the failure is understood. The whole point of
   this checklist is to catch issues before users do.
