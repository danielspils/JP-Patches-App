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

### v0.6.4 additions (Record-from-JX modal cleanup)

| Check | Expected | Result |
|---|---|---|
| Open Record-from-JX (Sequence) | title reads **"Import sequence from JX-3P"** (NO "Step 2 of 2" prefix) | |
| Open Record-from-JX (Tone) | title reads **"Import C/D banks from JX-3P"** | |
| First-time-on-a-new-device path (rare): open Record-from-JX with no calibrated gain | title reads **"Calibrate volume"** (no Step prefix) | |
| Capture mode initial state (before pressing Save on JX) | JX-key diagram **centered** in the row, NO JP logo, NO arrow visible | |
| Press Save on JX → signal arrives | JP logo + arrow fade in over ~0.5 s, diagram shifts right to make room | |
| Engineer a clipping capture (crank input gain or use a hot signal) | warning shows three buttons: **Try again** (green) / **Calibrate** (blue) / **Use anyway** (red) | |
| Click Calibrate from the warning | modal returns to calibration screen with gain knob + level meter; saved gain cleared | |
| Click Use anyway from the warning | red color signals "are you sure"; capture proceeds | |
| Sequence default name after capture (no prior `JP_sequence_*` entries) | save modal defaults to `JP_sequence_1` | |
| Capture another sequence | save modal defaults to `JP_sequence_2` (counter increments) | |
| Rename `JP_sequence_2` to something custom, then capture another | next defaults to `JP_sequence_3` (counter reads defaultName, not customName) | |
| **No `PROMISE Cannot access 'tapeDumpMuted' before initialization` error banner** on any Record-from-JX open | (regression catch — TDZ bug hit in pre-release testing) | |

### 6a. Tape dump sounds (Record-side — hear incoming dump)

> Same as §7a but the OPPOSITE direction: hear the JX dump **coming IN** through your Mac speakers during Record. Built-in-speaker routing is forced (mandatory, not just nice — monitoring via system default could feed audio back into the JX during capture). **Pre-check:** Audio Diagnostics modal (Help > Audio Diagnostics) shows green.

| Check | Expected | Result |
|---|---|---|
| **View → Tape dump sounds** unchecked → open Record-from-JX → reach capture mode | NO Tape Dump control in the modal | |
| Check **View → Tape dump sounds** → reopen Record-from-JX → capture mode | Tape Dump control visible (slider + mute icon + "What does my tape dump sound like?" link) | |
| With feature on, press Save on JX → signal arrives | hear the incoming FSK through laptop speakers in parallel with the capture | |
| Drag the slider mid-capture | live volume change; capture unaffected | |
| Click the mute icon mid-capture | sound mutes/unmutes live; capture unaffected | |
| Click the "What does my tape dump sound like?" info ⓘ | green popover appears opening **UPWARD** (Record modal is taller than Send — popover would otherwise overflow the viewport) | |
| Calibration mode (rare path) | Tape Dump control is **hidden** (calibration is about measuring source, not monitor playback) | |

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

### v0.6.4 additions (Send-to-JX modal cleanup)

| Check | Expected | Result |
|---|---|---|
| Open Send-to-JX (Sequence) with no source label | title reads **"Send sequence to JX-3P"** | |
| Open Send-to-JX (Tones) with no source label | title reads **"Send C/D banks to JX-3P"** | |
| Open Send-to-JX with a named library package (e.g. Spils Sounds) | title reads `Send` *Spils Sounds* `to JX-3P` — package name italic + muted grey (NOT quoted, NOT bold) | |
| Send-modal body copy | **centered**, single instruction line `On the JX-3P click Tape Memory → Load, then hit Play below.` | |
| Memory Protect hint visible below instruction | italic sub-line: *Make sure Memory Protect is off on the JX-3P.* | |
| NO time-estimate paragraph ("Transfer takes about Xs…") | removed | |
| NO "(button 13)" / "(button 16)" parenthetical in the instruction | removed | |
| NO pre-play "First click JX buttons, then hit Play below" message | removed | |
| OUTPUT DEVICE block sits **between cause→effect row and timeline** | labeled "OUTPUT DEVICE:" + boxed display with current system default | |
| If output IS your Mac speakers (unplug interface as a test) | amber warning appears below the OUTPUT DEVICE box | |
| Transfer completes | label under JX-3P logo changes from `loading: ` *name* to `✓ complete:` *name* | |

### 7a. Tape dump sounds (the parallel monitor — requires JX-3P + cable + built-in speakers audible)

> Plays the FSK quietly out the Mac's **built-in speakers** in parallel with the cable, so you *hear* the tape dump. Off by default. **Pre-check:** make sure your built-in-speaker volume isn't at zero (it's independent of the cable output — select MacBook Pro Speakers as output, raise it, switch back to the cable).

| Check | Expected | Result |
|---|---|---|
| **View → Tape dump sounds** unchecked → open the send modal → reach the Play step | no "Tape Dump" control in the modal | |
| Check **View → Tape dump sounds** → reopen the send modal → Play step | "Tape Dump" control visible: label + **?** + slider (starts low) + speaker icon | |
| With it on + cable as output, click ▶ Play | **transfer succeeds on the JX** AND you faintly hear the FSK out the laptop speakers | |
| Drag the slider up/down mid-transfer | sound volume changes live; transfer unaffected | |
| Click the **speaker icon** left of the slider | sound mutes/unmutes live (icon shows slash when muted); transfer unaffected | |
| Reopen the modal after moving the slider | slider remembers its position (volume persisted) | |
| Click the **?** | green info popover appears (2 lines + ×) | |
| Click the **×** (or **?** again) | popover closes | |
| **Unplug the interface** (or set Output → MacBook Pro Speakers) → open send modal → Play step | **amber warning** appears: "That's your Mac's built-in speakers, not your JX cable…" | |
| Plug the interface back in / select it as output → reopen | amber warning is gone | |
| Verify the FSK is **not doubling onto the cable** | the JX still decodes the transfer cleanly (sound goes to speakers only, never the cable) | |

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
| View → Tape dump sounds (uncheck) | menu item state toggles + persists | |
| View → Tape dump sounds (re-check) | toggles back | |

### 10a. Audio Diagnostics (Help menu, v0.6.4)

> Surfaces whether the Tape Dump Sounds built-in-speaker allowlist matches your live audio device labels. Primary use: catching the macOS-update regression where speaker label format changes and `setSinkId` silently stops routing.

| Check | Expected | Result |
|---|---|---|
| Help → Audio Diagnostics… | modal opens, title "Audio Diagnostics" | |
| Normal state (MacBook with built-in speakers detected) | **green** banner: "✓ All systems go! Tape Dump Sounds will play through *MacBook Pro Speakers (Built-in)*" + Done button (NO Report button) | |
| Close button (×) and Done button both dismiss the modal | works | |
| Esc key dismisses | works | |
| Engineered no-match state (rare — would require macOS changing label format) | amber banner: "OS may have changed output labels…" + **Report this bug** button (left) + Done (right) | |
| Click **Report this bug** | default browser opens to a pre-filled GitHub Issue on `danielspils/JP-Patches-App` with title, app version, macOS Darwin release, allowlist regex, full device list embedded — paste-and-go | |
| Modal closes after successful Report (browser opened) | confirms the openExternal IPC returned ok | |
| Engineered no-outputs state (extremely rare — Mac with no audio outputs at all) | amber banner: "No audio outputs detected on this Mac" + Report button | |
| Engineered empty-labels state (fresh install, mic permission not yet granted) | **blue** info banner: "Audio device labels are not yet visible (microphone permission required)" + NO Report button | |

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
