# JP Patches

Free, open-source macOS librarian app for the Roland JX-3P synthesizer.

![JP Patches main panel — PG-200 style controls on the right, active C/D bank list on the left, hardware tape buttons below](docs/screenshots/jx-hero.png)

> JP Patches is the first app I've ever written (aka "vibe coded"). I've owned my JX-3P since it was released in 1983 and have always wanted a way to save and trade sounds with other JX-3P enthusiasts. This app is designed to work with the tape dump functionality built into every JX-3P, and eventually with the Series Circuits MIDI upgrade kit.
>
> Today it can import and export JX-3P tape-dump WAVs, edit all 32 patch parameters via a PG-200-style panel, save and reorder bank snapshots in an in-app library, and clone individual patches into new slots with the Write button. MIDI integration is wired into the UI and waiting on the kit install.
>
> If you've got a JX-3P and want to try it, I'd welcome your feedback.
>
> — Daniel

## Status

**v1 in active development.** Tape Memory (WAV import + export via Bruce Oberg's `jx3p` toolkit) and the in-app Library are working. MIDI integration is **deferred** until I install the Series Circuits JX-3P MIDI Upgrade Kit — the UI controls (MIDI Memory mode in the Tape Memory dropdown) are in place and will activate in Phase 3.

## Install (download .dmg)

Once a release is published you can grab the latest **JP Patches.dmg** from the [Releases page](https://github.com/danielspils/JP-Patches-App/releases), drag the app to Applications, and launch. The `.dmg` bundles Bruce's `jx3p` tool and the `uv` Python runner, so there's nothing else to install — the first WAV import will take ~10–30s while `uv` fetches a Python interpreter into its local cache; subsequent runs are instant.

### First-launch on macOS

JP Patches is signed and notarized by Apple, so it opens normally — no Gatekeeper warning, no right-click workaround, no Terminal commands.

## Run from source

```
git clone https://github.com/danielspils/JP-Patches-App.git
cd JP-Patches-App
npm install
npm start
```

Running from source uses your system `uv` (e.g. `brew install uv`) and expects [Bruce Oberg's `jx3p` toolkit](https://github.com/bruceoberg/jx-3p-patches) cloned to `~/JP-Patches/`.

The window opens at 1140×710 and is non-resizable in v1.

## First run

The app starts empty — you'll see *"No patches loaded yet — use Save from JX-3P to import the C and D banks from your synth."* Two ways to import:

1. **Record a tape dump** from the JX-3P's CMT output (synth audio out) into your Mac as a **lossless** WAV (no MP3/M4A — lossy compression destroys the FSK signal). Then in the app, **Tape Memory → Tone → Save**, pick the WAV. (Yes, "Save" imports — that matches the JX-3P's hardware nomenclature where SAVE is the synth's "dump my patches out" button.)
2. **Open a JSON patch library** previously exported by the app, via the same dialog.

Once loaded, all 32 patches (C1–D16) populate.

## Tape Memory — quick reference

![Record-from-JX-3P modal mid-capture — JP Patches logo on the left receiving audio from the JX-3P, level meter and segmented transmission timeline showing live state](docs/screenshots/jx-save-to-app.png)

The app mirrors the JX-3P's hardware Tape Memory buttons:

- **Tone → Save (from JX-3P)** — import a WAV (decoded via `jx3p wav-to-json`) or a JSON.
- **Tone → Load (to JX-3P)** — export the current C+D banks as a WAV (encoded via `jx3p json-to-wav`). Play that WAV into the JX-3P's CMT input to overwrite its patch memory.
- **Sequencer → Save / Load** — UI in place; sequencer audio codec is pending upstream work in `jx3p`. For now, Sequencer Save bookmarks the active patch as a Sequence entry in the Library (the "paired patch" killer feature — when sequencer codec lands, the same entry will carry the sequence audio alongside).
- **MIDI Memory** dropdown — Phase 3. Selecting it currently logs a "not implemented" message; activates once MIDI is wired.

## Audio setup (Tape Memory hardware path)

Tape Memory transfers are FSK audio — the JX-3P encodes patch / sequence data as audible tones and reads them back the same way. Two hardware paths work reliably; pick based on what you already have.

**Option A — USB audio cable (lowest cost):**

![USB-C to dual 1/4" splitter cable connecting a MacBook to the JX-3P's Tape Memory Save and Load jacks](docs/screenshots/jx-cable.png)

- **The cable I use:** a [USB-C → dual 1/4" splitter](https://www.amazon.com/dp/B0G43JQJXT) — ~$20 on Amazon. USB-C end into the Mac; **TS** end into the JX's **Tape Memory Save** jack; **TRS** end into the JX's **Tape Memory Load** jack. Both legs are cabled simultaneously, so no swap when switching directions between capturing and sending.
- **This is the only cable I've personally tested.** Other USB-to-1/4" cables in this category (KT USB Audio, J&D, Tisino, ART TConnect) may work but haven't been verified. If you'd prefer guaranteed reliability over price, **Option B** below uses any standard USB audio interface — anything modern with a clean signal will definitely work.
- **Caveats:**
  - Many of these cables expose the **output side** as separately reconfigurable in Audio MIDI Setup but **lock the input side at 48 kHz**. That's fine — JP and the decoder tolerate this.
- **Setup:**
  1. Plug in the cable. Open **Applications → Utilities → Audio MIDI Setup**.
  2. The cable usually shows up as two devices (one input, one output).
  3. **Recommended:** set both input and output to `44.1 kHz` (24-bit if available) if the dropdown allows. Reduces unnecessary macOS sample-rate conversion.
  4. **In practice:** if either side is locked at 48 kHz, leave it. Transfers still decode reliably — verified empirically on KT USB Audio with input locked at 48 kHz and output at either 44.1 or 48 kHz (both work).
  5. Restart JP so the new device settings take effect.

**Option B — Dedicated USB audio interface (best ergonomics):**

- **Any modern USB audio interface** with native 44.1 kHz support and separate I/O jacks — e.g. Universal Audio Volt 2, Focusrite Scarlett 2i2.
- **Two standard 1/4" TS (mono unbalanced) cables** — JX **Save** out → interface input, interface output → JX **Load** in.
- Both legs cabled simultaneously → no swap workflow.
- Set both directions to 44.1 kHz in Audio MIDI Setup.

**Connector notes:**

- The JX-3P's Tape Memory Save and Load jacks are mono unbalanced 1/4" (TS).
- A **TRS** plug into a TS jack works electrically but shorts the ring to sleeve — if the source is balanced, you lose ~6 dB of level. Prefer **TS-to-TS** for the JX-side connections.

**Send (JP → JX) vs. Record (JX → JP):**

- **Send** is software-generated bit-perfect WAV → analog out. Only failure modes are output level too low, cable disconnected, or JX not in receive mode.
- **Record** captures real audio through your hardware path → decoder. More moving parts, but with the current JP version (which sizes the capture budget to the actual JX dump length), captures decode reliably even on cheap USB cables — verified across 10 consecutive sequence captures on a KT USB cable, all bit-perfect against the source.

**Sanity checks if a transfer fails:**

1. Mac output volume at 100 % when sending. The Send modal shows your current output device — verify it's your audio interface / cable, not the laptop speakers or AirPods.
2. Sample rate **preferably 44.1 kHz** for both input and output in Audio MIDI Setup, but 48 kHz works too if your device is locked.
3. JX is in the correct mode — Tape Memory + **Save** + key 14 (Tone) or 11 (Sequencer) for the JX to *send*; Tape Memory + **Load** + key 16 (Tone) or 13 (Sequencer) for the JX to *receive*.
4. Cable: a shorter cable rarely hurts. If you're seeing repeated Record failures, retry — and if that doesn't help, that's a strong signal to move from Option A to Option B.

## Library

![Library tab showing the Sequences sub-tab — saved sequences listed with paired-patch info accessible via the row's ⓘ icon](docs/screenshots/jx-sequencer.png)

The Library tab is your in-app cold storage. Two sub-tabs:

- **Tones** — save the current C+D banks as a snapshot (*save C/D banks to library* button). Snapshots have an auto-generated name like *C/D banks May 18, 2026* plus an editable custom name. Drag-reorder, hover-trash to delete, click *load selected library C/D banks to app* to restore.
- **Sequences** — same UX, paired with a patch. Hover the ⓘ icon on a sequence row to see the paired-patch reference (which patch was selected when the sequence was captured) plus any notes you added at save time.

## Write button (save-as)

Click the panel's **Write** button to enter "save-as" mode: a sticky banner appears at the top of the patch list (*Click a slot to write current patch — Esc to cancel*). Click any C/D slot and confirm in the modal to clone the currently shown patch into that slot. App-side only — doesn't touch the real JX-3P's stored memory. To get the edited bank onto the synth, follow up with **Tape Memory → Tone → Load (to JX-3P)**.

## Custom bank builder

![Custom Bank Builder open below the panel — 4×8 slot grid with patches dragged in from multiple library packages, origin labels visible on each entry](docs/screenshots/jx-custom-patch-banks.png)

Once you've collected a handful of C/D snapshots in the Library, you'll often want to **cherry-pick patches across them** into a new custom 32-patch collection — a setlist for a gig, your favorite 32 leads, etc.

Click **Create Custom Banks** below the PG-200 panel to open a staging area: a 4×8 slot grid (C on the left in green, D on the right in blue) sitting under a red header strip. Drag any patch from the active C or D bank list into any slot. Slots stay across navigation and across app restarts, so you can browse multiple library packages, pulling favorites in as you go.

- **SAVE TO LIBRARY** — commits the staged buckets as a new Library Tones snapshot. Empty slots are padded with a silent default patch. The builder closes and the new snapshot becomes the active C/D banks.
- **CLEAR** — wipes both staged buckets. Immediately after clearing the button becomes **UNDO** for a one-shot restore; dropping any new patch voids the undo.
- **×** — closes the staging area without clearing. Reopen it and your staged patches are still there.

## Roadmap

- **Phase 1** ✅ Panel UI + patch editing
- **Phase 2** ✅ Library tab (Tones + Sequences, drag-reorder, paired-patch model)
- **Phase 3** ⏳ MIDI integration (Series Circuits kit)
- **Phase 4** 🚧 Distribution (signed + notarized `.dmg` on GitHub Releases ✅; Mac App Store TBD)

Full design spec: [`docs/library-and-midi-spec.md`](docs/library-and-midi-spec.md).

## Build a `.dmg` locally

```
npm install
npm run dist:unsigned   # produces dist/JP Patches-0.1.0-arm64.dmg
```

`npm run setup-vendor` (run automatically before `dist`) populates `vendor/` with the `uv` binary and a copy of `~/JP-Patches/`. Set `JX3P_SRC=/path/to/your/clone` to point at a different location.

`npm run dist` (without `:unsigned`) produces a signed + notarized DMG. It requires an Apple Developer ID certificate in your keychain plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` in a `.env` file (see `.env.example`).

## License

[MIT](LICENSE) © 2026 Daniel Spils
