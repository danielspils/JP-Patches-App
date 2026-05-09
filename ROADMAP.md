# JP Patches Roadmap

## Phase 1 — Librarian Core (current, no MIDI required)
- [x] Full PG-200 panel UI (SVG)
- [x] Patch list C1-C16 with click-to-name
- [x] Patch name in red parallelogram
- [x] JP Patches logo
- [x] Tape Memory box (Save/Load buttons)
- [x] Manual/Write buttons
- [x] First GitHub commit
- [ ] Save/Load wired to JSON file I/O
- [ ] Patch names persist across app restarts
- [ ] Bank D tab functional
- [ ] Library tab functional
- [ ] WAV import via Bruce Oberg's jx3p Python toolkit

## Phase 1.5 — Polish (no MIDI required)
- [ ] Audio preview per patch (play button, right-click to attach MP3/M4A, stored as file path in patch JSON)
- [ ] Interactive controls — visual only:
  - [ ] Continuous knobs draggable (click+drag, 0-10 mapped to -140 to +140 degrees)
  - [ ] Rotary switch knobs snap to discrete positions (Range, Waveform, Cross Mod, LFO Waveform)
  - [ ] Toggle switches click between positions
  - [ ] Buttons light on press only
  - [ ] All values stored in patch params object

## Phase 2 — MIDI Layer (requires Series Circuits kit)
- [ ] MIDI device detection and connection
- [ ] Each control mapped to JX-3P MIDI CC number
- [ ] Moving on-screen knob sends CC to synth
- [ ] Incoming CC from physical PG-200 moves on-screen knob
- [ ] Bidirectional sync
- [ ] Live patch transfer via MIDI
- [ ] MIDI patch import/export

## Distribution
- [ ] Package as .dmg via electron-builder
- [ ] GitHub Releases page
