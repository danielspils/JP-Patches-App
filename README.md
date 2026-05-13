# JP Patches

Free, open-source macOS librarian app for the Roland JX-3P synthesizer.

> JP Patches is the first app I've ever written (aka "vibe coded"). I've owned my JX-3P since it was released in 1983 and have always wanted a way to save and trade sounds with other JX-3P enthusiasts. This app is designed to work with the tape dump functionality built into every JX-3P, and eventually with the Series Circuits MIDI upgrade kit.
>
> Today it can import patches from a JX-3P tape dump and edit them via a PG-200-style panel. Tape dump save and a patch library are next. MIDI integration comes once I install the Series Circuits kit.
>
> If you've got a JX-3P and want to try it, I'd welcome your feedback.
>
> — Daniel

## Status

**v1 in development** — tape dump workflow only. MIDI integration planned for v2.

The app reads JX-3P tape-dump WAV files (decoded to JSON via Bruce Oberg's
`jx3p` Python toolkit), renders all 32 patch parameters in a faithful PG-200
panel UI, and lets you name and organize patches. Phase 2 (Library tab for
managing C+D bank snapshots) is the next milestone. Phase 3 (live MIDI CC
control via the Series Circuits JX-3P MIDI Upgrade Kit) follows.

## Prerequisites

- **macOS** (Mac-only for v1)
- **Node.js 18+**
- **[`uv`](https://github.com/astral-sh/uv)** — Python package runner, used to invoke `jx3p` for WAV import. Install with `brew install uv`.
- **[Bruce Oberg's `jx3p` Python toolkit](https://github.com/bruceoberg/jx-3p-patches)** — clone it to `~/JP-Patches` (the app currently expects this exact path):
  ```
  git clone https://github.com/bruceoberg/jx-3p-patches.git ~/JP-Patches
  ```

## Install / Run

```
git clone https://github.com/danielspils/JP-Patches-App.git
cd JP-Patches-App
npm install
npm start
```

The window opens at 1140×710 and is non-resizable in v1 (sized for a typical MacBook logical display).

## How to get `patches.json`

The app loads patch data from `~/Desktop/patches.json` at startup. To produce that file from your JX-3P:

1. Connect your JX-3P's **tape out** to your Mac's audio input (USB audio interface recommended).
2. Initiate a tape dump from the JX-3P following the procedure in the JX-3P manual.
3. Record the FSK audio to a **lossless** format (WAV or AIFF — **not** MP3/M4A; lossy compression destroys the FSK signal).
4. Decode the WAV to JSON using `jx3p`:
   ```
   uv run --directory ~/JP-Patches jx3p wav-to-json /path/to/dump.wav ~/Desktop/patches.json
   ```
5. Launch JP Patches — your 32 patches (C1–D16) will load.

Alternatively, the **Load** button in the app's Tape Memory section opens a file dialog that accepts a `.wav` (decoded on-the-fly via `jx3p`) or a `.json` patch library exported earlier.

## Roadmap

See [`docs/library-and-midi-spec.md`](docs/library-and-midi-spec.md) for the full v1 (Library tab) and v2 (MIDI integration) design specs.

## License

[MIT](LICENSE) © 2026 Daniel Spils
