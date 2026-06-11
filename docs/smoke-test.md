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

### 3a. Paired-patch preview (v0.6.5)

> The jPpS RIFF chunk now carries sequence metadata (customName, originalName, createdAt, patchNote, **and** the full paired patch with params) so cross-user WAV sharing preserves attribution AND lets the recipient see / Write the paired patch. When a Library sequence with a paired patch is selected, the panel auto-loads the patch as a non-destructive preview with a hint block under the JP logo. Requires at least one Library sequence with a paired patch — pair one to a C/D slot via the existing pairing flow first if you don't have one.

| Check | Expected | Result |
|---|---|---|
| Click a Library sequence with a paired patch | parallelogram swaps to **"Paired Patch Preview" / patch name** in amber italic; section label above swaps from "Patch" to "Paired Patch Preview" | |
| PG-200 knobs reflect the paired patch's params (not the previous C/D selection) | knobs animate to paired-patch positions | |
| Hint block appears below JP logo: `sequence: {name}` / `written with: {patch}` (amber bold) / `notes: …` (if patchNote present, 2-line clamp w/ hanging indent) / `click [Write] to save paired patch` | labels dim, values bright, "Write" rendered in mini panel-button cap | |
| Click a Library sequence with NO paired patch | preview does not activate; parallelogram + label return to normal slot view; hint hidden | |
| Click a C or D **slot** in the patch list while previewing | preview exits — panel reflects the clicked slot, hint hides | |
| Click a Bank C/D **tab** while previewing (no slot click) | preview exits — panel snaps to that bank's slot 0 (Option B behavior) | |
| Click **Write** while previewing on Library | auto-switches to Bank C; slot-picker banner reads `Click a slot to write "{patch}" (Esc to cancel)` | |
| Mid-write, click Bank D tab | preview persists (writePending guards the auto-exit); banner stays | |
| Click any destination slot during Write | confirm modal title `Save "{patch}" to {destKey}?`; body simplified (overwrites in JP Patches; JX-3P {destKey} patch unchanged) | |
| Confirm Save | params + paired-patch name land in destination slotMeta; panel exits preview onto new slot; parallelogram reads `{destKey}: {patch}` | |
| Cancel modal | exits Write mode entirely (no slot-picker loop) | |
| Click **Load to JX-3P** (Sequencer hardware button OR Tape Memory Sequencer Load) while previewing | hint fades to opacity 0 over ~200 ms; Send modal opens **after** the fade completes; parallelogram snaps to last C/D slot mid-fade | |
| ⓘ info popover on the sequence shows `Paired patch: {bank}{slot} / {name}` + `Notes: …` + `Saved: {date}` | all fields present (even when sequence was imported from another machine) | |

### 3b. Cross-user WAV round-trip (v0.6.5)

> The whole point of the chunk extension: a sequence WAV emailed/airdropped to another JP Patches user lands with all the metadata intact. This row exercises it locally (export → re-import on same machine), but the chunk shape is identical for cross-machine.

| Check | Expected | Result |
|---|---|---|
| Pick a sequence with a customName, patchNote, AND paired patch | confirm all three present in ⓘ popover | |
| Send to JX-3P → Save WAV file to `~/Desktop/roundtrip.wav` | file written; size ~1 MB | |
| Inspect chunk: `python3 -c "import struct;d=open('/Users/$USER/Desktop/roundtrip.wav','rb').read();i=12\nwhile i<len(d)-8:\n cid=d[i:i+4];sz=struct.unpack('<I',d[i+4:i+8])[0]\n if cid==b'jPpS':print(d[i+8:i+8+sz].decode());break\n i+=8+sz+(sz%2)"` | JSON with `v: 2`, `sequenceMeta: { customName, originalName, createdAt, patchNote, pairedPatch: { bank, slot, patchName, params } }` | |
| Drag the WAV back into the Library Sequences sub-tab | save modal opens with customName + patchNote pre-filled from the chunk | |
| Save (keep pre-fill values) | new sequence entry appears with originalName, createdAt, patchNote, pairedPatch all preserved | |
| Click the re-imported sequence | preview activates with the paired patch (proves params + name traveled in the chunk) | |
| Write the previewed patch to a fresh C/D slot | params + name land correctly (same as section 3a row) | |
| Step §3b row 2 above ("Send to JX-3P → Save WAV file") | **v0.7.2 NOTE:** the "Save WAV file" button no longer exists in the Send modal. Use the per-row **download icon** on the Library Sequences row instead — hover the row, click the down-arrow icon, hit Save in the native dialog. Same WAV output. | |

### 3c. WAV upload zone (v0.7.2)

> Always-visible dashed-border zone at the bottom of each Library sub-tab. Accepts drag-and-drop OR click-to-browse via native file picker. Pulses + shows "Importing…" on drop so the decode delay reads as feedback, not stalled UI.

| Check | Expected | Result |
|---|---|---|
| Library → Tones with packages already present | dashed-border zone at bottom of list: WAV-file icon + label *"drop a WAV or click to upload a WAV"* (compact horizontal variant) | |
| Library → Tones with NO packages (empty state) | zone renders larger + centered (prominent variant); placeholder text above mentions both "save active C/D banks to library" + "upload a WAV below" | |
| Library → Sequences | same zone (compact when populated, prominent when empty) | |
| Hover the zone | border + label brighten (text-bright color); cursor reads as pointer | |
| Drag a .wav file over the zone (don't drop yet) | border + label brighten via `.drag-over` class | |
| Drop the WAV | zone pulses outward once (~600ms ring); border + background stay brighter; label swaps to *"Importing… (decoding WAV)"*; ~1-2s later the file appears in the list and the zone re-renders fresh | |
| Click the zone | native macOS file picker opens, filtered to `.wav` | |
| Pick a .wav in the picker | imports same as drag-drop (label change + pulse + list update) | |
| Drop a non-WAV file (e.g. .png) | global error banner: *"Only .wav files can be dropped here."* (parent #patch-list catches this; zone may or may not have pulsed) | |
| Drop a corrupted WAV | global error banner: *"Could not decode this WAV: …"*; zone's "Importing…" state self-resets after 6s safety timeout | |

### 3d. Library row download icon (v0.7.2)

> Hover-revealed icon on each Library row (Tones + Sequences). Native macOS Save dialog defaults to ~/Desktop with the package/sequence name pre-filled. Replaces the removed "Save WAV file" button that used to live in the Send modal.

| Check | Expected | Result |
|---|---|---|
| Library → Tones row, hover | three icons reveal left-to-right: **LOAD button**, **download arrow icon**, **trash icon** | |
| Library → Sequences row, hover | three icons reveal left-to-right: **info (ⓘ) icon**, **download arrow icon**, **trash icon** | |
| Click download icon on a Tones row (e.g. Spils Sounds) | native macOS Save dialog opens; default filename `Spils Sounds.wav`; default location is Desktop | |
| Click Save without changing | WAV writes to `~/Desktop/Spils Sounds.wav`; small confirm modal pops: *"WAV saved"* + the path | |
| Pick a different folder in the dialog → Save | WAV writes there instead | |
| Cancel the dialog | silent no-op (no error modal) | |
| Click download icon on a Sequences row | dialog defaults to `<sequence name>.wav`; same flow | |
| Download a row whose package has a customName | filename in the dialog matches the customName | |
| Download a row with the JP-default name (e.g. "C/D banks May 18, 2026") | filename in the dialog matches the default name | |
| Verify chunk preservation: open the downloaded WAV in a hex viewer (or re-import into JP) | jPpS chunk present (v:2 for sequences with paired patches); customName + slotMeta survive | |
| Send-to-JX modal action row | **no "Save WAV file" button** — only Cancel + Send to JX-3P | |

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

> Same as §7a but the OPPOSITE direction: hear the JX dump **coming IN** through your Mac speakers during Record. Built-in-speaker routing is forced (mandatory, not just nice — monitoring via system default could feed audio back into the JX during capture). **Pre-check (v0.7.1+):** open Audio Settings (gear icon, top-right of panel) — no amber/blue canary section at the bottom means built-in speakers are detected by the allowlist.

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
| OUTPUT DEVICE block sits **between cause→effect row and timeline** | labeled "OUTPUT DEVICE:" + a read-only status line showing the current tape dump routing target (set in Audio Settings gear modal — v0.7.0 had an interactive picker here, v0.7.1 made it read-only since the gear modal owns this setting) | |
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
| Verify the FSK is **not doubling onto the cable** | the JX still decodes the transfer cleanly (sound goes to speakers only, never the cable) | |

### 7b. Audio Settings modal (gear icon, v0.7.1)

> Gear icon top-right of the panel red strip opens the modal. Single source of truth for: tape dump sounds toggle, button/switch sounds toggle, In-app audio device, Tape dump routing device, Record from JX-3P routing device, "How routing works" disclosure, and the macOS speaker-detection canary (only shown when the allowlist doesn't match — folded in from the removed Audio Diagnostics modal).

| Check | Expected | Result |
|---|---|---|
| Panel red strip has a small white gear icon top-right | yes — scales with panel zoom, sits inside the 24px-tall strip | |
| Click gear | Audio settings modal opens with 5 rows + collapsed "How routing works" + Done | |
| Modal fits at 100% zoom without scroll | yes (scrollable cap at 85vh kicks in only at smaller zooms / with disclosure expanded) | |
| Toggle "Tape dump sounds" | persists to `library.transmissionSounds.enabled`; Send/Record modals reflect the toggle next open | |
| Toggle "Button and switch sounds" | persists to `library.buttonSounds`; click any panel button to verify | |
| In-app audio dropdown → pick KT USB Audio | persists to `library.appSoundDeviceId` + `library.appSoundDeviceLabel`; setPreviewSink fires for sequencer previews; next click sound plays through KT | |
| Tape dump routing dropdown → pick KT | persists to `library.cableOutputDeviceId` + `library.cableOutputDeviceLabel` | |
| Record from JX-3P routing dropdown → pick KT (input device) | persists to `library.record.preferredInputDeviceId` + `library.record.preferredInputDeviceLabel` | |
| Expand "How routing works" | 4-row table appears: in-app clicks/previews, Tape Dump Sounds monitor (always built-in speakers), outgoing tape dumps, incoming tape dumps | |
| Close + reopen modal | all picks persist, toggles persist, disclosure resets to collapsed | |
| Quit + relaunch app + reopen modal | all picks persist across restart | |

### 7b.1. Ghost devices (v0.7.1)

> When a saved device is unplugged, the picker shows it as the SELECTED value with a "(unavailable, plug it in!)" suffix — not silently fallback to system default. Replug → ghost disappears, real device pre-selected automatically.

| Check | Expected | Result |
|---|---|---|
| Pick KT in In-app audio + Tape dump routing + Record from JX-3P routing → close modal | all three saved to library with labels cached | |
| Unplug KT → reopen Audio settings | all three dropdowns show `KT USB Audio (31b2:2024) (unavailable, plug it in!)` as the visible selected value | |
| Open one of the dropdowns | ghost is the first option (selected), then "(system default — …)", then other connected devices | |
| Replug KT (modal stays open) | within ~1s all three dropdowns live-update: ghost gone, KT becomes the live selected option (no manual interaction needed) | |
| Quit, relaunch, reopen modal (KT still unplugged) | ghost label persists across restart (cached labels in library) | |
| Without ever picking a device → unplug something else | no ghost option appears (no saved id to be unavailable) | |

### 7b.2. Send modal — missing-device safety (v0.7.1)

> Builds on v0.7.0's speaker safety belt: now ALSO refuses to fall through to system default when the saved tape dump device is missing. Send modal blocks Play with a warning until user replugs or picks a different device.

| Check | Expected | Result |
|---|---|---|
| Pick KT for Tape dump routing → unplug KT → open Send modal → reach play state | display reads `KT USB Audio (31b2:2024) — unavailable, plug it in!`; ▶ Play is disabled | |
| Warning modal pops: *"Tape Dump device unavailable — Your selected tape dump device (KT USB Audio) isn't connected. Plug it back in, or open Audio Setting (gear icon, top-right of the panel) and pick a different device. JP Patches won't fail back to your speakers (that would be painfully loud!). Your last device is remembered—plug it back in to restore it."* | yes, single OK button | |
| Dismiss warning | ▶ Play stays disabled | |
| Replug KT (Send modal still open) | display reactively updates to `KT USB Audio (31b2:2024)`; ▶ Play re-enables; no further warning | |
| With macOS system default = built-in speakers + ghost = KT | safety analysis returns 'missing' (not 'speakers'); the missing warning fires (not the speakers one) | |
| Click ▶ Play after replug | transfer routes to KT; JX receives | |

### 7b.3. Send modal cable picker safety belt (v0.7.0 → v0.7.1 refined)

> When effective routing IS built-in speakers (saved device is speakers, OR no save + system default resolves to speakers), pop the speaker warning + disable Play. Refined in v0.7.1: copy points users to the gear icon (was: a now-removed in-modal dropdown).

| Check | Expected | Result |
|---|---|---|
| Set macOS Sound output → MacBook Pro Speakers + no Tape dump routing pick → open Send modal → play state | modal warning: *"Heads up — your tape dump routing is your speakers"* + body pointing at Audio Settings gear icon; ▶ Play disabled | |
| Open gear modal → pick KT for Tape dump routing → close gear modal → back to Send modal | display + Play recovers (no speaker warning) | |
| Explicitly pick MacBook Pro Speakers as Tape dump routing in gear modal | safety belt fires next time Send modal opens (selecting speakers as cable is a foot-gun in any path) | |

### 7c. Audio Settings — canary (v0.7.1; folded in from removed Audio Diagnostics modal)

> Hidden when everything's healthy. Shows up at the bottom of the Audio Settings modal when the Tape Dump Sounds allowlist can't find a present built-in speaker (the macOS-update label-regression canary).

| Check | Expected | Result |
|---|---|---|
| Normal state (built-in speakers detected by allowlist) | NO canary section in the modal — modal ends with the "How routing works" disclosure + Done | |
| Help menu | **no** "Audio Diagnostics…" item (removed in v0.7.1; the canary lives inline in the gear modal now) | |
| Engineered no-match state (would require macOS changing speaker label format — can also be simulated by temporarily editing `MAC_SPEAKER_LABEL_RE` to a non-matching regex) | amber canary section: *"Tape Dump Sounds may not work. The macOS speaker label format looks unfamiliar — likely a recent OS update changed it."* + "Report this bug" button | |
| Click "Report this bug" | default browser opens to a pre-filled GitHub Issue on `danielspils/JP-Patches-App` with title, app version, macOS Darwin release, allowlist regex, full device list embedded | |
| Engineered empty-labels state (fresh install, mic permission not yet granted) | blue info canary: *"Audio device labels not yet visible (microphone permission required)…"* + NO Report button | |

## 8. Drag-and-drop

| Check | Expected | Result |
|---|---|---|
| Drag a `.wav` from Finder onto Bank C | quick-check modal → import → C populates | |
| Drag a `.wav` onto Library Tones | new package added with file's name | |
| Drag a sequencer-dump `.wav` onto Library Sequences | save-sequence modal | |
| Drag a tones `.json` (per-row download export) onto Library Tones | imports as a new package **with patch names restored** (from `_slotMeta`) | |
| Drag a sequence `.json` onto Library Sequences | imports with name/notes/paired patch restored (from `_sequenceMeta`) | |
| Drag a `.txt` (or other extension) anywhere | "Only .wav and .json files can be dropped here." error — no import | |

## 8a. User Lending Library (new in v0.8.0)

**Explore + borrow** (needs network to jx-3p.com):

| Check | Expected | Result |
|---|---|---|
| Library → Tones: "explore the user lending library" button | Roland **green**, active | |
| Library → Sequences: same button | Roland **blue**, active | |
| Click explore (Tones) | modal opens, "Fetching…" → up to 3 newest catalog tones with name + author · hometown · date + notes | |
| Click **borrow** on an entry | button → "borrowing…" → green "borrowed"; package lands in Library Tones with patch names intact and **no `.wav` in the label** | |
| Borrow from the Sequences modal | sequence lands DIRECTLY in Library Sequences — **no "Save Sequence to Library" modal** (lender's name + notes + paired patch arrive embedded; check the (i)) | |
| (i) on any borrowed item (tones or sequence) | shows **Borrowed on:** date + **Lender:** name, hometown | |
| Drag-drop a sequence WAV (NOT a borrow) | the "Save Sequence to Library" modal still appears (name genuinely unresolved for tape imports) | |
| "explore the entire lending library" link (centered, underlined) | opens jx-3p.com/patches/ or /sequences/ in the default browser — app window does NOT navigate | |
| × in the modal's upper right + Escape + overlay click | all three close the modal | |
| Offline (Wi-Fi off) → open explore modal | "Offline — showing the last fetched list." with cached entries, or the could-not-reach message if never fetched | |

**Lend** (relay at lend.jx-3p.com):

| Check | Expected | Result |
|---|---|---|
| Open explore modal → "Lend your tones/sequences" section | only the two consent checkboxes visible — **no item list yet** | |
| Check both consent boxes | your packages/sequences list appears, lend buttons active Roland blue | |
| Uncheck either box | the list hides again | |
| Close + reopen the modal | consent boxes are UNCHECKED again, list hidden (deliberately per-open) | |
| Click **lend** | "Lending Library submission" confirm: editable TONES/SEQUENCE YOU ARE LENDING (pre-filled), YOUR NAME / HOMETOWN / NOTES with *italic* placeholders | |
| Submit with empty name | blocked — focus jumps to the empty field, nothing sent | |
| Submit with all fields | button → "Submitting…" → modal closes → row button reads **submitted** in Roland **green** (lendable rows stay blue); a `[Lend …]` issue appears in the GitHub queue with metadata + JSON payload | |
| Quit + relaunch → reopen explore modal | the lent item still reads **submitted** (persisted) | |
| Second lend: name + hometown | pre-filled from the previous lend; notes empty | |
| Relay down (Wi-Fi off) → lend | "Direct submit unavailable" → Open GitHub form: browser opens pre-filled issue form, JSON on clipboard | |
| 11th lend in one UTC day | "Easy there, lender!" rate-limit modal — **no** GitHub-form fallback offered (that would bypass the limit) | |

**Auto-publish + withdraw round trip** (the full robot pipeline — allow ~3 min per direction):

| Check | Expected | Result |
|---|---|---|
| After a lend: watch the issue | Auto-publish workflow validates → commits payload + YAML → closes the issue with a ✅ receipt comment within ~1–2 min | |
| ~3 min after lending | entry is live on jx-3p.com/patches/ (or /sequences/) AND in the in-app explore modal (reopen it) | |
| Daniel gets an email | the notify workflow @mentions him on every `community-*` issue (own-PAT issues are otherwise silent — pitfall #23) | |
| Re-lend the SAME banks/sequence under a different name | NOT published — issue gets `needs-review` + "this exact content is already in the catalog" comment, stays open | |
| Click **submitted** (Tones row) | "Remove from Lending Library" confirm — body names the lent file, warns future users can't download | |
| Confirm Remove | button → "removing…" → flips back to blue **lend**; withdraw issue files + closes; entry gone from site + modal in ~3 min | |
| Click **submitted** on a SEQUENCE row | same withdraw flow as patches (regression: was disabled-grey in-session) | |
| Withdraw → re-lend the same item | publishes again cleanly (dedup checks the live catalog, not history) | |

**Site hearts + borrow counts** (jx-3p.com/patches/ + /sequences/):

| Check | Expected | Result |
|---|---|---|
| Heart outline (28px, grey stroke) on an entry | click → fills Roland red, count +1; click again → un-fills, count −1 (toggle, one per visitor) | |
| Green **borrow** button on the site | downloads the payload; "N borrows" under the button ticks up (unique per IP — repeat downloads don't double-count) | |
| Borrow the same entry in-app | the same borrow counter increments (site + app share KV counts) | |
| Explore-modal bylines in-app | show `♥ N · M borrows` when counts are nonzero | |

**Library row info (i):**

| Check | Expected | Result |
|---|---|---|
| Hover a Tones row | four icons: (i) \| LOAD \| download \| trash — no overlap, even with a long name (ellipsized) | |
| Click (i) on the currently-loaded package | modal shows "Status: currently loaded in the active C/D banks" + named-patch summary + Created; **Close button only** | |
| Click (i) on any other package | NO Status line (deliberate); provenance rollup appears only for multi-source custom banks | |
| Click the pencil (rename) on a row | hover icons disappear while editing; return on commit/cancel | |

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

### 10a. Audio Diagnostics — REMOVED in v0.7.1

> Folded into the Audio Settings modal (gear icon → see §7c above). Help menu no longer has an "Audio Diagnostics…" item.

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
