# JP Patches

Free, open-source macOS librarian app for the Roland JX-3P synthesizer.

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

> **Unsigned builds** (until I set up notarization): macOS will block first launch. Right-click the app in Applications → **Open** → confirm. After that, it launches normally.

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

The app mirrors the JX-3P's hardware Tape Memory buttons:

- **Tone → Save (from JX-3P)** — import a WAV (decoded via `jx3p wav-to-json`) or a JSON.
- **Tone → Load (to JX-3P)** — export the current C+D banks as a WAV (encoded via `jx3p json-to-wav`). Play that WAV into the JX-3P's CMT input to overwrite its patch memory.
- **Sequencer → Save / Load** — UI in place; sequencer audio codec is pending upstream work in `jx3p`. For now, Sequencer Save bookmarks the active patch as a Sequence entry in the Library (the "paired patch" killer feature — when sequencer codec lands, the same entry will carry the sequence audio alongside).
- **MIDI Memory** dropdown — Phase 3. Selecting it currently logs a "not implemented" message; activates once MIDI is wired.

## Library

The Library tab is your in-app cold storage. Two sub-tabs:

- **Tones** — save the current C+D banks as a snapshot (*save C/D banks to library* button). Snapshots have an auto-generated name like *C/D banks May 18, 2026* plus an editable custom name. Drag-reorder, hover-trash to delete, click *load selected library C/D banks to app* to restore.
- **Sequences** — same UX, paired with a patch. Loading restores the paired patch into its original slot.

## Write button (save-as)

Click the panel's **Write** button to enter "save-as" mode: a sticky banner appears at the top of the patch list (*Click a slot to write current patch — Esc to cancel*). Click any C/D slot and confirm in the modal to clone the currently shown patch into that slot. App-side only — doesn't touch the real JX-3P's stored memory. To get the edited bank onto the synth, follow up with **Tape Memory → Tone → Load (to JX-3P)**.

## Roadmap

- **Phase 1** ✅ Panel UI + patch editing
- **Phase 2** ✅ Library tab (Tones + Sequences, drag-reorder, paired-patch model)
- **Phase 3** ⏳ MIDI integration (Series Circuits kit)
- **Phase 4** 🚧 Distribution (`.dmg`, code-sign + notarize, GitHub Releases)

Full design spec: [`docs/library-and-midi-spec.md`](docs/library-and-midi-spec.md).

## Build a `.dmg` locally

```
npm install
npm run dist:unsigned   # produces dist/JP Patches-0.1.0-arm64.dmg
```

`npm run setup-vendor` (run automatically before `dist`) populates `vendor/` with the `uv` binary and a copy of `~/JP-Patches/`. Set `JX3P_SRC=/path/to/your/clone` to point at a different location.

`npm run dist` (without `:unsigned`) requires an Apple Developer ID for code-signing — coming when notarization is set up.

## License

[MIT](LICENSE) © 2026 Daniel Spils
