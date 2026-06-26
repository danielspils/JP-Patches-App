# JP Patches — Claude Code project memory

> **🔔 FRESH SESSION? READ THIS NEXT:**
> Before answering anything substantive, open
> **[`docs/session-handoff-2026-06-10.md`](docs/session-handoff-2026-06-10.md)**
> (or the newest `session-handoff-*.md` if one supersedes it).
> It carries the open threads, recent verbal design decisions,
> sequencer-editor open questions, and pickup-ready next moves
> from the prior session. ~3 minutes to read; saves rediscovering
> everything via git log. Skip only if your task is entirely
> unrelated to recent work.

Free, open-source macOS Electron app for the Roland JX-3P synthesizer. Author: Daniel Spils (GitHub: `danielspils`). First-time programmer; vibe-coded with Claude Code.

This file is the cold-start summary. Pair it with:

- **[`docs/design-system.md`](docs/design-system.md)** — **the binding design guide.** Color tokens, typography, SVG primitives (buttons, knobs, switches, level meter, arrow), layout patterns, animation, anti-patterns. **Read this before building any new UI component, modal, or visual.** The "Design language" section below is the brief; this doc is the authoritative reference.
- **[`docs/library-and-midi-spec.md`](docs/library-and-midi-spec.md)** — authoritative design spec for Phases 1–4. Phase 2 has an "As-shipped summary" noting where the actual implementation diverged from the original design.
- **[`docs/record-from-jx.md`](docs/record-from-jx.md)** — shipped-feature reference for in-app JX-3P tape capture + two-pass auto-calibration. The place to land when reading `showRecordFromJxModal` in `app.js`.
- **[`docs/smoke-test.md`](docs/smoke-test.md)** — pre-release manual QA checklist (11 sections, ~50 individual checks). Run before publishing any release; catches integration issues unit tests can't.
- **[`docs/site-architecture.md`](docs/site-architecture.md)** — how **jx-3p.com** is built: no-theme Jekyll layout, the nav tabs, the **Notes blog** (`_posts`), the lending-library catalog (`_data` → `/library/index.json`), CSS tokens, and the **deploys-from-`main`-only** gotcha. Read before touching anything under `docs/` that affects the public site.
- **[`docs/session-handoff-2026-06-10.md`](docs/session-handoff-2026-06-10.md)** — most-recent session-end snapshot: the User Lending Library day (borrow/lend/relay/hearts), the new Cloudflare infrastructure Daniel owns, open threads. **A fresh Claude session should read this right after CLAUDE.md.** Note: its manual-curation section is superseded — submissions auto-publish since June 11 (see the User Lending Library section below). Supersede with a newer dated doc as state moves on.
- **[`docs/future-features.md`](docs/future-features.md)** — parking lot for ideas not yet on the roadmap (screenshots refresh, signing, Windows port, adaptive sizing, sound samples, app-level Undo/Redo, etc.).
- **[`README.md`](README.md)** — end-user docs (install, first run, Tape Memory reference, Library, Custom Banks, Roadmap).
- **GitHub Releases — [github.com/danielspils/JP-Patches-App/releases](https://github.com/danielspils/JP-Patches-App/releases)** — every shipped version has detailed user-facing release notes. The best chronological record of recent UX and behavior changes. `gh release list` and `gh api repos/danielspils/JP-Patches-App/releases --paginate -q '.[].body'` to pull locally.

## Status

Current version: **0.8.3** (June 25, 2026). 25+ public releases since v0.1.0 on May 19. Public site live at **[jx-3p.com](https://jx-3p.com)** (built May 28–29). Release automation (`scripts/release.sh`) shipped May 29.

- **Phase 1** ✅ shipped — panel UI + patch editing
- **Phase 2** ✅ shipped — Library (Tones + Sequences with paired-patch model), Custom Bank Builder, drag-and-drop WAV import, sequencer codec, sequence-send-to-JX
- **Phase 3** ⏳ blocked — MIDI integration, deferred until the Series Circuits JX-3P MIDI Upgrade Kit is installed. CC map and architecture already drafted in the spec doc §Phase 3.
- **Phase 4** 🚧 in progress — distribution. **Signed + notarized DMGs ship via `scripts/release.sh`** (Developer ID since May 29 — Gatekeeper-clean, auto-update working). Marketing/onboarding site lives at jx-3p.com.
- **User Lending Library** ✅ shipped in v0.8.0 (June 11): borrow + lend in-app, backed by the `relay/` Cloudflare Worker at **lend.jx-3p.com** (Daniel's first hosted infra). Fully automated end-to-end: submissions auto-publish (~3 min to live, strict validation + dedup, `needs-review` on doubt), withdraw via the in-app **submitted** button, hearts + borrow counts on the site, 5/day rate limit. Architecture in the "User Lending Library" section below; session narrative in `docs/session-handoff-2026-06-10.md` (its curation section is superseded by auto-publish).

**System requirement**: macOS 12+ on **Apple Silicon (arm64) only**. Intel Macs are not supported by the published DMGs.

## File map

```
~/JP-Patches-App/
├── main.js                       Electron main process — 13 IPC handlers, app menu, zoom persistence
├── preload.js                    contextBridge → window.api.* (incl. webUtils.getPathForFile)
├── package.json                  electron@^35 + electron-builder@^25 (dev only)
├── package-lock.json
├── .gitignore                    node_modules/, dist/, vendor/, build/
├── README.md                     end-user readme
├── ROADMAP.md                    pointer file (see README + docs/library-and-midi-spec.md)
├── LICENSE                       MIT, © 2026 Daniel Spils
├── docs/                         GitHub Pages source for jx-3p.com (custom Jekyll layout)
│   ├── _config.yml               site title + description; no theme = our custom layout owns rendering
│   ├── _layouts/default.html     custom page skeleton (dark header w/ JX A/B/C/D motif, content, footer)
│   ├── CNAME                     jx-3p.com (custom domain via Squarespace registrar)
│   ├── index.md                  the actual landing page content (Daniel's voice + screenshots + YouTube embed)
│   ├── assets/
│   │   ├── css/style.css         site stylesheet — Roland brand tokens, header motif, lightbox, gallery
│   │   ├── js/site.js            lightbox w/ prev-next, tracking-URL stripper, header LED-flash click
│   │   ├── img/jp-logo.png       transparent-cream redesign (copied from renderer/assets/jp-logo.png)
│   │   ├── img/favicon-*.png     32 + 192 + apple-touch (180) — regenerated from jp-logo.png via sips
│   │   └── img/jx-*.png          page screenshots (hero, cable, save-to-app, save-to-synth, etc.)
│   ├── screenshots/              alternate screenshots dir (README references jx-*.png here)
│   ├── design-system.md          BINDING design guide — colors, typography, SVG primitives, layout
│   ├── library-and-midi-spec.md  authoritative design spec (Phases 1–4)
│   ├── record-from-jx.md         shipped-feature reference: in-app tape capture + auto-cal
│   ├── smoke-test.md             pre-release manual QA checklist (run before publishing; §8a = lending library)
│   ├── patches.md + sequences.md lending-library catalog pages (borrow + lend form + hearts)
│   ├── _data/                    catalog entries YAML (drive the pages AND /library/index.json manifest)
│   ├── library/                  payload .json files + the Liquid-generated index.json manifest
│   ├── release-notes-*.md        drafted user-facing release notes per version
│   ├── RELEASE.md                release workflow + recovery doc (companion to scripts/release.sh)
│   └── future-features.md        parking lot beyond the formal roadmap
├── relay/                        Cloudflare Worker — the lending relay at lend.jx-3p.com
│   ├── worker.js                 POST /lend (→ GitHub issue, 10/IP/day) · /heart (toggle) · /borrow (deduped count) · /withdraw · GET /hearts — KV-backed
│   ├── wrangler.toml             custom-domain route + HEARTS KV binding
│   └── README.md                 deploy steps, PAT renewal, smoke test
├── scripts/
│   ├── setup-vendor.sh           populates vendor/ before `npm run dist`
│   ├── release.sh                one-command release — bumps version, builds DMG, tags, ships GH release
│   ├── lend-publish-lib.mjs      PURE lending-automation logic (validation, dedup hash, YAML quoting, withdraw matching) — the auto-publish trust boundary, unit-tested
│   ├── publish-lend.mjs          auto-publish pipeline (runs in CI): issue → validate → dedup → catalog commit → close
│   ├── withdraw-lend.mjs         withdraw pipeline (runs in CI): token-hash match → remove entry + payload → close
│   └── remove-lend.sh            manual takedown by catalog id (post-moderation)
├── .github/workflows/
│   ├── lending-publish.yml       auto-publish on community-labeled issues (serialized via concurrency group)
│   ├── lending-withdraw.yml      withdraw on community-withdraw issues — AUTHOR-GATED to repo owner (trust boundary)
│   └── lending-notify.yml        @mentions Daniel per submission (own-PAT issues are silent — pitfall #23)
├── build/
│   ├── icon.png                  1024×1024 source for the app icon
│   └── entitlements.mac.plist    macOS hardened-runtime entitlements
├── vendor/                       gitignored; populated by setup-vendor.sh
│   ├── uv/uv                     uv binary, macOS arm64
│   └── jx3p/                     rsynced copy of ~/JP-Patches (Bruce's toolkit)
├── dist/                         gitignored; electron-builder output (.dmg, .app)
└── renderer/
    ├── index.html                shell — left panel + #panel-host
    ├── style.css                 vintage cream hardware aesthetic (~2,500 lines)
    ├── app.js                    all UI logic — ~9,300 lines (heavily commented)
    ├── calibration-math.js       pure math: gain↔angle, decode-all-default heuristic
    ├── library-math.js           pure math: reorder index, params fingerprint, dirty-index remap, latest-N lending entries
    ├── lending.js                pure lending helpers: lend payload + GitHub-issue-URL builders
    ├── library-schema.js         library.json versioning + migration scaffolding
    ├── record-trim.js            FSK trim algorithm + Float32→Int16 PCM converter
    ├── capture-warnings.js       4-state live warning ladder (clipping/no-signal/quiet)
    ├── capture-state.js          capture state-machine + auto-stop ladder
    ├── record-flow.js            auto-calibration decisions (pure): chooseCaptureGain + planDecodeFailureResponse (clipping step-down ladder)
    ├── audio-capture.js          getUserMedia constraint fallback + node-graph factory
    ├── send-timeline.js          send-modal timeline math (pilot/data segment durations)
    ├── modal-builders.js         shared modal-row builders (extracted from app.js)
    ├── synth-preview.js          triangle-wave note preview (sequencer editor audio)
    ├── seq-insert-rules.js       JX-faithful NOTE/REST/TIE insert rules (pure)
    ├── transmission-sounds.js    Tape Dump Sounds — play FSK out Mac built-in speakers in parallel with the cable (Send + Record). Allowlist + cable-exclusion safety. Off by default.
    ├── audio-diagnostic.js       Help > Audio Diagnostics — categorize enumerateDevices vs the Tape Dump Sounds speaker allowlist. Pre-fills a GitHub Issue URL via buildAudioDiagnosticIssueUrl when allowlist fails to match.
    ├── panel.svg                 locked PG-200 panel artwork (1050×620 viewBox)
    ├── panel_locked_v2..v6.svg   historical snapshots (v6 is current canonical reference)
    ├── seed/
    │   ├── library.json          first-run Spils Sounds + Spils Sequence
    │   └── patches.json          first-run active C/D banks
    └── assets/jp-logo.png        chrome JP logo embedded in panel

test/                             469 unit tests across 18 pure-logic/consistency suites
├── calibration-math.test.js
├── library-math.test.js
├── library-schema.test.js
├── record-trim.test.js
├── capture-warnings.test.js
├── capture-state.test.js
├── record-flow.test.js          auto-calibration: capture-gain choice + decode-failure/clipping-step-down planner
├── send-timeline.test.js
├── modal-builders.test.js
├── synth-preview.test.js
├── seq-insert-rules.test.js
├── transmission-sounds.test.js  selector allowlist + cable-exclusion + degenerate input
├── audio-diagnostic.test.js     categorizer status branches + GitHub Issue URL builder
├── lending.test.js              lend payload shapes + issue-URL encoding edge cases
├── lend-publish-lib.test.js     auto-publish trust boundary: payload validation, dedup hash, YAML-injection guard, withdraw matcher
└── community-catalog.test.js    docs/_data ↔ docs/library consistency (also the CI gate inside auto-publish/withdraw)
```

## External runtime dependencies

- **`uv`** — Python package runner. From source: `brew install uv`. In packaged DMG: bundled at `vendor/uv/uv` and copied to `extraResources/uv/uv`.
- **`jx3p`** Python toolkit — Bruce Oberg's tool at `bruceoberg/jx-3p-patches`. Used for WAV ↔ JSON conversion of both **patches** and **sequences** (sequencer codec is shipped upstream; datatype=1; round-trip lossless). From source: expected cloned to `~/JP-Patches/`. In packaged DMG: rsynced to `vendor/jx3p/` then copied to `extraResources/jx3p/`.
  - **`~/JP-Patches/` is Daniel's fork** (`origin = danielspils/JP-Patches`, with `bruceoberg` as upstream remote), **not a clean clone of Bruce's repo**. It carries a local divergence: a quiet-recording auto-boost inside `_load_wav_mono_float` (`jx3p/codec.py`, `AUTO_BOOST_TARGET = 0.92`). See the pitfalls section for the rationale. If pulling from `bruceoberg` upstream, preserve the local patch or re-apply it.
- **`~/Library/Application Support/jp-patches/library.json`** — user state (patch names, library packages, sequences, custom bank buckets, zoom factor, tape-memory mode, future MIDI prefs). If absent on first launch, app seeds from `renderer/seed/`.
- **`~/Desktop/patches.json`** — legacy boot-time patch source. No longer fatal if absent (first-run empty state handles it).

## Test hardware (Daniel's setup)

Daniel has **two JX-3P units** at home — an **upstairs** unit (most testing happens here, off the MacBook laptop) and a **downstairs** unit (typically driven by the Mac Mini). They have **different tape-dump output levels**, which matters for Record-from-JX calibration: a gain calibrated on one unit (peak normalized to ~0.78) may be too quiet to decode reliably on the other — the FSK zero-crossing detector needs the waveform to swing well past its ±0.15 quiescence band, and a low-output unit can leave weak passages dipping into it (sequences fail first; see pitfall #15). Workaround observed 2026-06-11: cranking INPUT GAIN into the red (clipping warning) decoded perfectly, because clipping preserves zero-crossing timing while lifting amplitude. When a capture bug only reproduces "sometimes," suspect a unit/level difference before a code regression.

## How to run / build

```
cd ~/JP-Patches-App
npm install                   # first time only
npm start                     # opens the Electron window

npm run setup-vendor          # populate vendor/ from ~/JP-Patches (or $JX3P_SRC)
npm run dist:unsigned         # build DMG without code signing
npm run dist                  # build signed+notarized DMG (Developer ID — what release.sh runs)
```

Window opens at **1140×710** (sized for Daniel's logical screen of 1147×719) and is non-resizable in v1 — but the View menu zoom presets (75% / 100%) scale window + renderer together, so 75% (855×532) works on smaller laptops. Fullscreen toggle via the green ⛶ button or Cmd+Ctrl+F.

## What works (current state)

### Panel UI (Phase 1)
- 16-slot patch list per bank (C1–C16, D1–D16) in the left panel. Click-to-name; names persist via `slotMeta` (separate `customName` + `defaultName`).
- Drag-reorder within a bank; cross-bank swap via the ⇄ hover icon (slot-anchored swap animation).
- Hover (i) info icon shows patch lineage: current slot, name, origin slot, origin library.
- Full PG-200 panel rendered from `panel.svg`, injected at startup.
- **24 knobs**:
  - 6 snap knobs (`SNAP_ANGLES`): click cycles to next enum. Params: `dco1_range`, `dco1_waveform`, `dco2_range`, `dco2_waveform`, `dco2_crossmod`, `lfo_waveform`.
  - 18 smooth knobs: vertical drag, 2°/1px sensitivity, range −140° to +140°.
- 8 toggle switches (canonical 3-segment white/grey/dark; click anywhere on body cycles state).
- 4 panel buttons: Save / Load / Manual / Write. Write is the in-app clone-to-slot affordance (arms a slot-picker; click any C/D slot → confirmation modal → clone current patch params into that slot).

### Tape Memory (Phase 1 + 2)
JX-3P-faithful nomenclature: **Save = import from synth**, **Load = export to synth**.
- Tape Memory dropdown header (Tape Memory / MIDI Memory — MIDI mode logs "not implemented" until Phase 3).
- Two columns (Tone / Sequencer), each with Save / Load buttons. Greyed out when their action would be a no-op.
- Tone Save / Load: `.wav` ↔ JSON via `jx3p wav-to-json` / `json-to-wav`.
- Sequencer Save / Load: same, with paired-patch + RATE slider + note metadata.
- **Send to JX-3P** (v0.5.7): in-app guided two-step modal — setup instructions → timeline visualization (Init / Bank C / Divider / Bank D for patches; Init / Sequence for sequencer) → ▶ Play. Pilot tone durations exact (4096 bits × 50 samples/bit / 44100 Hz = 4.644 s per pilot).
- **Record from JX-3P** (v0.5.11): live tape-dump capture via the Mac's audio input. **As of v0.8.2 (auto-calibration): no mandatory volume-calibration step** — a never-calibrated device captures at `DEFAULT_CAPTURE_GAIN` (2.0×) and the decode-time boost (`AUTO_BOOST_TARGET` in the jx3p fork) finds the level. The two-pass manual calibration survives only as a failure fallback; a clipping capture auto-steps the gain down and re-records. Decode-flow decisions are pure + tested in `renderer/record-flow.js`. Failed decode triggers a recovery prompt (Try again / Calibrate). **See [`docs/record-from-jx.md`](docs/record-from-jx.md) for the (pre-auto-cal) feature spec, state machine, persistence shape, and audio-pipeline details. ⚠ that doc predates v0.8.2 — it still describes mandatory two-pass calibration as the default; the auto-decode flow above supersedes it.**
- **JX-3P key-sequence diagram** (v0.5.11): a small inline visual mockup of the JX panel keys the user needs to press. Reusable component `buildJxKeyDiagram({ action, kind })` in `app.js`, styled in `style.css` (`.jx-key-diagram*`). Lives in both Record-from-JX modals (Save variant: keys 14/15/16 for Tone, 11/12/13 for Sequencer) and Send-to-JX modals (Load variant). Matches the panel's cream face / dark LED / Roland-red highlight aesthetic.
- "Save WAV file" file-export fallback still available.

### Library tab (Phase 2)
- Two sub-tabs: **Tones** (C+D snapshots) and **Sequences** (paired patch + sequence data + RATE % + note).
- Auto-default names (`C/D banks May 18, 2026`, `Sequence May 18, 2026 at 12:23 PM`) with editable custom-name overrides. Pencil-icon affordance for unnamed items.
- Each row: hover-LOAD button (inline single-row load), hover-trash, relative timestamp subtitle.
- Drag-reorder within a sub-tab.
- Shift-click range select (within a single bank) — drag the range as a multi-patch payload into the Custom Banks builder.
- Drag-and-drop WAV/JSON onto sub-tabs: dropped file's name becomes the new package name.

### Sequencer editor (Phase 2.5, May 26)
The Sequences sub-tab visualizer (piano-roll style) is now a full editor — not just a viewer. All editing happens in **single-page view** (zoomed into one of the 8 pages). The 8-page overview stays read-only by design.

**Insert flow:**
- **Click an empty area** of the roll → toggle a small insert tooltip with NOTE / REST / TIE buttons (note-glyph ♪, JX-tie-arc ⌣, eighth-rest SVG — same icons as the hover labels). Click again on any empty area → tip dismisses (toggle behavior). Tip anchors near the cursor (3 px offset). REPLACES the prior Ctrl+click / right-click trigger — plain click is more discoverable.
- **NOTE** writes one new attack at the clicked pitch (chord stacking up to 6 voices). Button is disabled when the column has any tied voice (REST or canonical TIE) — symmetric with the REST/TIE empty-step gate. The JX itself can't record a step that mixes a note attack with a rest/tie continuation, so the editor doesn't either.
- **REST** ties EVERY new attack from the previous column into this step (polyphonic — pitfall #16). 5-voice chord + REST = 5 tied voices in the next column.
- **TIE** writes canonical `{tied} + {attack}` voice pairs per prev-column pitch when N≤3 fits the 6-voice budget; for N≥4, falls back to fresh-attacks-only (data-shape-identical to a chord re-strike — matches JX firmware behavior).

**Editing flow:**
- **Drag a note vertically** → pitch-shift with live preview (the rect follows the cursor; on drop the underlying voice mutates and a preview tone plays at the new pitch). The drag captures *all* voices in the step at that pitch — so a single-voice TIE pair moves together.
- **Marquee drag** on an empty area → column-constrained multi-select. No dashed rectangle — the notes themselves highlight live as the drag covers their pitch range. Single-page view only.
- **Group pitch-drag** → if the mousedown lands on a `.selected` note in a group of >1, the drag moves *every* group member by the same Δpitch (clamped to JX range).
- **Keyboard Delete** → removes the selected note(s).
- **Cmd+Z / Cmd+Shift+Z** → standard undo/redo of any editor mutation (insert / delete / pitch-drag / group drag). Reuses the app-wide `pushUndo` stack (50 entries) already used by patch-list and bucket reorders. Multi-note Delete batches into one undo entry. Sequence-level snapshots (4KB each via `cloneSeq`) keep the inverse logic trivial — no per-mutation undo helpers.
- **Playhead** is grabbable directly (cursor: ew-resize) for scrub during playback.

**Save-as-new-copy:** the original library sequence is snapshotted on the first edit. SAVE writes the edits as a NEW "edited" library entry (numbered) and restores the original from the snapshot. Discarding edits (nav-away guard) restores from the same snapshot.

**Pure-logic backing:** insert rules + eligibility math live in `renderer/seq-insert-rules.js` with 33 unit tests pinning the JX-derived properties (canonical-vs-fallback TIE branch, polyphonic REST cap, NOTE-vs-tied gate, polyphony cap, page-boundary lookups). Note preview is a triangle-wave synth (`renderer/synth-preview.js`, 5 tests).

### Custom Bank Builder (Phase 2)
- Below the panel, opens via the **Create Custom Banks** key. 4×8 grid (C left in Roland green, D right in Roland blue) under a JX-3P-style red header.
- Drag patches from active bank list into bucket slots; bucket entries show origin (e.g. `C8 from Daniel's Patches`).
- Save gate: SAVE label only appears when both buckets are **16/16** (forces a deliberate end state).
- Save commits as a new Library Tones package, auto-loads as active C/D, closes the builder.
- CLEAR ↔ UNDO (one-shot restore until next drop voids the snapshot).
- Buckets survive cross-tab navigation **and** app restart, so multi-library cherry-picking works across sessions.

### First-run + drag-and-drop
- Empty `library.json` → seeds from `renderer/seed/` (Spils Sounds active banks + Spils Sounds/Sequence in Library). Once user makes any change, their own file takes over; seed never read again. Deletions stick.
- Drop a `.wav` from Finder anywhere in the window — routed by active tab: Library Sequences → save modal; Library Tones → non-destructive new package; Bank C/D → "Quick check" confirm + safety snapshot + import.
- File path obtained via `webUtils.getPathForFile` (Electron 32+; the old `File.path` was removed upstream).

### App menu
- **JP Patches**: About / Check for Updates… (opens Releases page) / Hide / Hide Others / Quit.
- **File**: Close Window (Cmd+W).
- **Edit**: Cut / Copy / Paste / Select All only — manually wired with click handlers to prevent macOS auto-injecting Substitutions, Speech, Writing Tools, AutoFill, Dictation, and Emoji & Symbols.
- **View**: Actual Size (Cmd+0), 75% (Cmd+−), Reload, Toggle DevTools, Toggle Fullscreen. Zoom factor persists across launches.
- **Help**: GitHub link.

### Website — jx-3p.com (May 28–29)
Public-facing site for JP Patches, hosted on GitHub Pages from the `docs/` source. Custom domain `jx-3p.com` purchased via Squarespace registrar (`docs/CNAME` carries the hostname).

- **Custom Jekyll layout** in `docs/_layouts/default.html` — no `theme:` set in `_config.yml`, so our custom skeleton owns rendering. All visuals driven by `docs/assets/css/style.css` using the design-system tokens (Roland red `#b94a2e`, green `#1f6e5b`, blue `#33508f`, vintage cream `#f7f1e6`, panel black `#1a1a1a`, app-bg `#0a0a0a`).
- **JX-3P A/B/C/D bank-indicator motif as the structural header.** Green and blue parallelograms sit on top of the dark band on the left; their tops form thin stripes that extend right across the header above the logo + subtitle; their bodies extend down through the band; their bottoms align at y=195 with the red C/D parallelograms that bleed into the body. A red stripe runs full-width below the header at the bottom of the band.
- **Header download button is a panel-button primitive** — 44×44 SVG with cream button face (`#cbc4b4`), `#555` stroke, dark `#333` LED with cream highlight band, plus a white caret + "JP Patches" label in 16px Helvetica cream-secondary. Click handler in `site.js` arms the LED to Roland red for 350 ms before navigating, mimicking the in-app Save/Load button behavior.
- **4 download CTAs distributed through the page**, all pointing at `/releases/latest` (so zero site changes needed per release): header panel button (cream); body buttons in red, green, and blue — all rendered as parallelograms via CSS `clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)`.
- **2×2 image gallery** of feature screenshots with a lightbox (prev/next chevrons + arrow keys + Escape to close, defined in `site.js`).
- **YouTube Short embed** at page bottom (vertical 320×568, youtube-nocookie variant), left-justified to match the hero + cable images. Used explicit width/height rather than CSS `aspect-ratio` after the latter failed to render reliably across browsers.
- **Tracking-param stripper** in `site.js` removes `fbclid`, `gclid`, `utm_*`, etc. from the URL via `history.replaceState` so shared links don't carry social-platform noise.
- **Mobile layout** (`@media (max-width: 540px)`) drops the JX swoops, stripes, and panel button; logo + short subtitle only.
- **Logo** is a transparent-cream redesign (1306×872 PNG) that lives at `renderer/assets/jp-logo.png` AND `docs/assets/img/jp-logo.png` — two copies because the panel embed references the renderer path and the site references the docs path. Update both together. Favicons (32, 192, apple-touch 180) are regenerated from the same source via `sips` center-crop → resize.

### User Lending Library (June 10–11, shipped in v0.8.0)
- **Borrow**: Library sub-tab explore buttons (green Tones / blue Sequences) → modal with the 3 latest catalog entries → one-click borrow through the standard import path (names restore via embedded `_slotMeta`/`_sequenceMeta`). Manifest cached in `library.community` for offline.
- **Lend**: per-open consent checkboxes gate blue lend buttons over the user's own items → confirm step (editable catalog name; YOUR NAME / HOMETOWN / NOTES — name+hometown persist in `library.lending`) → relay POST → persisted `item.lending` ("submitted" state, surfaced in the (i) info modals). Relay-down fallback: clipboard + pre-filled GitHub issue form.
- **Relay**: `relay/` Cloudflare Worker at lend.jx-3p.com — files `community-*`-labeled GitHub issues with Daniel's PAT (users need no GitHub account); hearts endpoints on KV (one-per-IP salted-hash dedupe). CORS locked to jx-3p.com. A GitHub Action @mention-pings Daniel per submission (see pitfall #23).
- **Auto-publish** (June 11 — replaced manual curation): `lending-publish.yml` runs on every community-labeled issue → strict payload validation + content-hash dedup (banks/pages only, so renames can't beat it) + catalog consistency test → commit + close with a receipt. Anything doubtful gets `needs-review` and stays open. Submit → live on site + in-app in ~3 min. Rate limit: 10 lends/IP/UTC-day (`LEND_DAILY_LIMIT` in `relay/worker.js`; "Easy there, lender!" modal — no GitHub-form fallback, which would bypass it). Post-moderation: `scripts/remove-lend.sh <id>`.
- **Withdraw**: clicking a (green) **submitted** button → "Remove from Lending Library" confirm → relay `/withdraw` hashes the item's secret `lending.token` → author-gated workflow matches the public `token_hash` in the catalog YAML and removes entry + payload. Only relay-filed (owner-authored) withdraw issues are processed — a stranger copying the public hash gets ignored.
- **Hearts + borrows**: site hearts are toggle-able (outline → Roland red, one per visitor via salted-IP-hash markers in KV); borrow counts dedupe per IP and combine site + in-app downloads ("N borrows" on site, `♥ N · M borrows` bylines in the modal).
- **Site**: /patches/ + /sequences/ catalog pages (green borrow buttons, hearts, borrow counts) driven by `docs/_data/*.yml`; `/library/index.json` manifest feeds the in-app modal. Lend forms were removed from the site — lending is in-app only, documented with screenshots + a 3-step walkthrough on both pages.

### Release automation (May 29)
- **`scripts/release.sh`** — one-command release. Usage: `./scripts/release.sh 0.6.1`. Pre-flight checks (git/gh/npm installed, gh authenticated, on `main`, clean tree, in-sync with origin, release-notes file exists, tag not taken). Bumps `package.json` version + the `Status` line in `CLAUDE.md` with today's date. Runs `npm test`; aborts and rolls back the version bump on failure. Builds DMG via `npm run dist:unsigned`. Prompts for explicit confirmation before any push. Commits, tags (lightweight, matching the existing convention), pushes, creates the GitHub release with notes file + DMG + blockmap attached.
- **`docs/RELEASE.md`** — workflow + recovery doc. 3-step quick reference (write notes → smoke test → run script) plus recovery procedures (delete a bad tag, replace a DMG, edit notes after publish). Confirms that the site auto-updates because all 4 download CTAs use `/releases/latest`.

## What's next

**Phase 3 (MIDI)** — blocked on Series Circuits kit install. Concrete CC map ready in spec §3.2. Library: `easymidi`. Architecture: main-process owns MIDI, IPC pattern matches existing handlers. Sub-phasing in spec §3.8.

**Phase 4 (Distribution)** — signed + notarized releases live since May 29. Open work items, in priority order:
1. ~~Apple Developer ID + notarization~~ ✅ DONE (May 29 — Developer ID, notarized, auto-update).
2. README screenshots refresh (current shots predate vintage cream + Custom Banks redesign).
3. Mac App Store publish (after signing).
4. Adaptive window sizing + 125/150/200% zoom presets (need screen-bound clamp first).
5. Windows port (waiting for a Windows-using JX-3P owner to volunteer testing).

Other parking-lot items in `docs/future-features.md`.

## Design language — north star

**The app is an extension of the JX-3P.** The hardware panel (buttons, knobs, switches, colors, fonts, layout, the small visual details of how a Roland synth from 1983 looks and feels) is the design inspiration for everything the user sees. Modals, panels, list rows, level meters, gain controls, key-sequence diagrams, even error states — when in doubt, reach for the JX-3P aesthetic before inventing something generic.

This is a *guideline*, not dogma — override when it benefits the user (e.g. a standard macOS file picker is better than a hardware-mimicking one, a contextual help link doesn't need a panel button skin). But the override should be a conscious choice, not a default. Generic "web app" components (flat HTML buttons, system fonts, neutral greys) should feel out of place in this codebase. If you're building something new and it doesn't feel like it belongs on the JX, ask if it should.

### **→ [`docs/design-system.md`](docs/design-system.md) is the binding reference.**

That document is the canonical, copy-paste-ready guide to colors, typography, SVG button/knob/switch primitives, layout patterns, animations, and anti-patterns. **You MUST consult it before building any new UI component, modal, or visual element.** It contains:

- §1 Color tokens (every canonical hex, with semantic role)
- §2 Typography (font family + size/weight ladder)
- §3 Component primitives (button, knob big/small, switch, numeric key, sub-mode pill, level meter, arrow — all with copy-paste-ready SVG)
- §4 Layout patterns (modal, section card, cause→effect row, instruction box, step-title hero)
- §5 Animation (pulse, hover transitions)
- §6 Anti-patterns (what NOT to do, with examples of past mistakes)
- §7 Existing component helpers in `app.js`

### Brief summary (full details in the design-system doc)

| Element | Quick reference |
|---|---|
| **Brand triad + amber** | Roland red `#b94a2e` (warnings) · Roland green `#1f6e5b` (good/Tones/Bank C) · Roland blue `#33508f` (informational/Sequences/Bank D) · warning amber `#c39a3a` (approaching limit) |
| **Cream family** | Vintage cream `#f7f1e6` (panel labels) · cream secondary `#cfc8b8` (tick labels) · button face `#cbc4b4` · highlight `#dbd4c4` |
| **Dark surfaces** | Modal `#1a1a1a` · app/card `#0a0a0a` · button LED `#333` · stroke `#555` · inactive `#4a4a4a` |
| **Font** | `Helvetica,'Helvetica Neue',sans-serif` (set on SVG root, inherited) |
| **Default sizes** | 12px regular for body · 14px for labels · 9–10px for tick labels |
| **Components ready to reuse** | `buildJxKeyDiagram`, `buildInputGainKnob`, `buildVerticalLevelMeter`, `showConfirmModal`, `showRecordFromJxModal`, `showSendToJxFlow` |

When designing a new modal or panel, the first question to ask: *what would this look like if Roland had shipped it on the original JX-3P?* Even when the answer is "they wouldn't have," that framing usually surfaces a more cohesive design than starting from "what would a typical Electron app do here."

## Conventions

1. **Plain JS only.** No TypeScript, no React/Vue/Svelte. Direct DOM manipulation in `app.js`.
2. **Don't modify `panel.svg`** unless the change is essential and unavoidable. `panel_locked_v6.svg` is the current canonical reference snapshot. Functional changes happen in `app.js` (tagging, event handling) without touching the SVG. New components that need panel-style artwork should *reference* panel.svg's primitives by copying the SVG shapes inline, not by editing panel.svg.
3. **Window stays at 1140×710** (`resizable: false`) — until adaptive sizing lands. The View menu zoom presets (75% / 100%) are the only sanctioned size variants. Daniel's screen is 1147×719 — anything wider than 1140 will be clipped.
4. **CSP**: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`. Update the meta tag in `index.html` if external resources or `eval`-style features become needed.
5. **macOS-only for v1.** Code freely uses `~/`, `pkill`, etc.
6. **Color palette + design language** — see the "Design language — north star" section above. Don't introduce off-palette colors or framework-default components without a deliberate reason.
7. **Commit messages** prefixed with `feat:`, `fix:`, `chore:`, `docs:`, `Spec:`, etc. See `git log --oneline` for the style.
8. **Co-author trailer** on commits: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
9. **Release notes are user-facing prose** — see Releases on GitHub for the established voice. Mirror that style for new releases.
10. **Website pushes ship independently of app releases.** Any change under `docs/` that affects the public jx-3p.com site (`index.md`, `_layouts/`, `assets/`, `screenshots/`, `CNAME`, `_config.yml`) commits + pushes immediately on its own — DO NOT bundle with app code changes or hold for the next app release. GitHub Pages auto-deploys site changes in ~30–60 s; the app release cadence is much slower (every few days) and there's no reason a copy fix or a new feedback button should wait. Internal docs (`CLAUDE.md`, `future-features.md`, `smoke-test.md`, `release-notes-*.md`) MAY be bundled with the app commits they describe — they're development-team-facing, not site content.

## Architecture

### IPC surface (`preload.js` → `window.api.*`)

23 `ipcMain.handle` channels (plus a few one-way `.on` pushes for menu state), all defined in `main.js`. New handlers should follow the same pattern.

```js
// File I/O
loadPatches:         ()              → load ~/Desktop/patches.json (legacy boot source)
loadLibrary:         ()              → load ~/Library/.../jp-patches/library.json (or seed)
saveLibrary:         (data)          → write same
loadPanelSvg:        ()              → read renderer/panel.svg
getPathForFile:      (File)          → on-disk path of a dropped File (Electron 32+)

// Tape Memory — patches
tapeSave:            ()              → file-dialog → write JSON
tapeLoad:            (data)          → file-dialog → read .wav (jx3p decode) OR .json
tapeSaveFromPath:    (path)          → import a known-path WAV (drag-drop flow)
tapeEncodeToTemp:    (data)          → encode JSON to temp WAV for the Send modal's <audio>
tapeCleanupTemp:     (path)          → delete that temp WAV on modal close

// Tape Memory — sequences
seqTapeSave:         ()              → file-dialog → write sequence JSON
seqTapeLoad:         (data)          → file-dialog → read .wav (jx3p seq decode) OR .json
seqTapeSaveFromPath: (path)          → import a known-path sequence WAV
seqTapeEncodeToTemp: (data)          → encode sequence to temp WAV for the Send modal

// Record from JX-3P (v0.5.11)
recordToWav:         (payload)       → write captured PCM (Float32 → 16-bit LE) to a temp WAV path

// Zoom persistence
onZoomChanged:       (cb)            → main → renderer push when View menu zoom changes

// User lending library (June 10) — ALL outbound network lives main-side,
// hardlocked to https://jx-3p.com/ + https://lend.jx-3p.com/
communityFetchManifest:  ()          → GET jx-3p.com/library/index.json (cached in library.community)
communityDownloadToTemp: (url, name) → download payload → temp .json → reuse drag-drop import path
communityLend:           (submission)→ POST lend.jx-3p.com/lend → GitHub issue (relay)
communityFetchHearts:    (ids)       → GET lend.jx-3p.com/hearts (display-only counts)
openExternal:            (url)       → shell.openExternal, allowlisted (GitHub repo + jx-3p.com)
```

### `library.json` shape (current)

```jsonc
{
  "version": "...",
  "names":     { /* legacy: bank slot → custom name */ },
  "slotMeta":  { /* per-slot { customName, defaultName, originSlot, originLibrary, ... } */ },
  "packages":  [ /* Tones snapshots: { name, customName, createdAt, banks: {C: [...], D: [...]} } */ ],
  "sequences": [ /* Sequences:       { name, customName, createdAt, tape: {...}, app: {pairedPatch, patchNote} } */ ],
  "customBanks": { /* persistent Custom Bank Builder buckets across restarts */ },
  "tapeMode":  "tape" | "midi",
  "zoom":      1.0,           // last View-menu zoom factor
  "lastBankSelection": { /* C/D + slot, for cross-tab context (e.g. sequence pairing from Library) */ },
  "midi":      { /* Phase 3 — input, output, channel, sendPC, followPC */ },
  "community": { /* June 10 — cached lending-library manifest {fetchedAt, manifest} for offline explore */ },
  "lending":   { /* June 10 — lender prefs {name, hometown}; consent deliberately NOT persisted */ },
  // packages[i].lending / sequences[i].lending — {token, submittedAt, issueUrl, lendName, author, hometown, notes}
  // packages[i].borrowed / sequences[i].borrowed — {lender, hometown, entryId, borrowedAt} (set at borrow time; community marker + "Borrowed on / Lender" (i) lines)
  "record": {                 // v0.5.11 — Record-from-JX persistence
    "calibratedGain": {       // per-MediaDeviceInfo.deviceId
      "<deviceId>": { "label": "KT USB Audio (…)", "gain": 11.07, "calibratedAt": "ISO" }
    }
  }
}
```

### Key tables in `app.js`

- `DISCRETE` — enum values per discrete param (mirrors upstream `jx3p/patch.py`).
- `SNAP_ANGLES` — visual marker angles for snap knobs; overrides default −140°/+140° spread in `paramToAngle`.
- `SNAP_CYCLE` — overrides DISCRETE for click-cycle on knobs with fewer visual markers than enum values (currently only `lfo_waveform`: skips `fast random`).
- `KNOB_REGISTRY` — maps SVG location (circle cx/cy or `<g translate(...)>`) to param name.
- `SWITCH_REGISTRY` — 8 switches with body selector + type.
- `BUTTON_REGISTRY` — 4 buttons with body selector + LED color.

## Patch data shape (32 params per slot)

See `jx3p/patch.py` upstream for canonical types. Key gotchas:

- `dco2_waveform` has 4 values incl. `"noise"` — but the Series Circuits MIDI kit can't transmit noise (kit only defines Saw=0, Pulse=32, Square=64 for DCO-2 wave). WAV import remains the only way `dco2_waveform = "noise"` can land in the app once MIDI ships.
- `mystery` (uint8 0–15) is preserved on disk for round-trip integrity but never sent over MIDI.
- Continuous params are uint8 (0–255). The MIDI kit transmits 7-bit, so a round-trip loses the bottom bit.

**Patch identity by parameters**: in the app's mental model a patch's identity is its 32 params, not its name. So if you name a patch in the app, export to the synth, move it around on the JX, and import the tape dump back, the app recognizes the patch and restores the name automatically. Edit knobs on the JX → identity changes → name resets. By design.

**Custom-name embedding in exported WAVs ("jPpS" RIFF chunk)**: To preserve custom names across cross-user WAV sharing (the JX-3P tape format has no name field, so a WAV emailed to a friend would normally lose all names), `main.js` appends a custom RIFF chunk with ID `"jPpS"` after `jx3p json-to-wav` (or `seq-json-to-wav`) writes the file. The chunk contains a UTF-8 JSON payload with a `v` schema version and one or both of `slotMeta` (patch tape dumps) and `sequenceMeta` (sequence tape dumps). JX-3P hardware (and Bruce's `jx3p` decoder) ignore any chunk they don't recognize, so the WAV remains a fully valid tape dump. The renderer attaches private fields underscore-prefixed (`_slotMeta`, `_sequenceMeta`) on the JSON sent to the IPC handlers; `main.js` strips these before handing to jx3p (whose schema would reject them) and embeds them after the WAV is written. The unified embed/read pair is `embedJpMetaInWav({slotMeta?, sequenceMeta?})` and `readJpMetaFromWav` in `main.js`.

Schema shapes:

- **v:1** (shipped v0.5.11, **patches only**): `{ v: 1, app: "JP Patches", slotMeta: { C: [...], D: [...] } }` — per-slot `{ name, origin, sourceLabel }`.
- **v:2** (shipped v0.6.5, **patches OR sequences**): adds `sequenceMeta: { customName, originalName, createdAt, patchNote, pairedPatch: { bank, slot, patchName, params } }` for sequence WAVs. The full paired patch (all 32 params + name + slot ref) travels with the sequence so the recipient can preview the patch on the panel and Write it into a slot. `originalName` is set ONCE at first export and never overwritten, preserving attribution across renames.

Backward compatibility: v:1 readers ignore unknown keys, so v:2 WAVs decode cleanly on older builds (sequence WAVs just lose the metadata, same as pre-v:2 behavior). v:2 readers handle both v:1 and v:2 chunks. No version is ever removed.

On import, the renderer prefers fingerprint-history (the user's own remembered names) over the chunk's names for patch slots, falling back to the chunk when history is silent — so a friend's WAV repopulates names but doesn't clobber the receiver's own renames. For sequences, the chunk's `customName`/`patchNote` pre-fill the save-as modal (user can edit before saving); `originalName`/`createdAt`/`pairedPatch` come straight through.

**v0.6.5 paired-patch preview** (renderer-side UX): when a Library sequence with a `pairedPatch` is selected, the panel auto-loads it as a non-destructive preview. State lives in `currentPreviewPatch` (a `{params, name, sourceLabel}` object). `currentPatch()` routes through it: returns the preview params when set, otherwise the active C/D slot. So everything downstream that reads `currentPatch()` — knob updates, parallelogram readout, Write button source — automatically reflects the preview without per-call-site changes. The non-data-shape side effects (parallelogram label swap to "Paired Patch Preview", hint block under the JP logo via runtime-created `<foreignObject>`) are added in `updateSvgPatchName` / `updateSvgPairedPatchHint`. Preview exits on: any C/D slot click (`selectPatch` clears it), any bank-tab click that isn't write-mode-protected (`setupTabs` clears it), or the start of Load-to-JX (`handleSendSequenceToJX` fades the hint over 200ms then clears). Write from preview auto-switches to Bank C if user is on Library, then commits via the existing `commitWriteTo`/`doWriteTo` path — which now also clones `currentPreviewPatch.name` into the destination slotMeta.

## Recent themes

`git log --oneline` and the GitHub Releases page are authoritative — releases especially, since each has a thorough user-facing changelog. Themes from the May 19–30 burst:

- **Auto-calibration — "Calibration Celebration"** (June 14, v0.8.2) — Record-from-JX no longer makes the user calibrate volume. **Origin:** Daniel's quieter downstairs JX failed to decode even after calibrating; root cause was the jx3p fork's `AUTO_BOOST_TARGET` sitting at 0.7, *below* the app's ~0.78 calibration aim, so the decode-time boost never fired for a calibrated capture. **v0.8.1** bumped it to 0.92 (fires above the aim) — that alone fixed the bug, validated on the real downstairs unit (a recalibrate that previously failed now worked). **v0.8.2** is the UX payoff: a never-calibrated device captures at `DEFAULT_CAPTURE_GAIN` (2.0×) and the boost finds the level — no two-pass calibration step. The two-pass survives only as a failure fallback (recovery prompt → Calibrate), plus a **clipping auto-step-down** (halve capture gain + re-record, capped at 2 — the mirror of the boost). The pre-decode peak warning was deleted (decode RESULT is the source of truth — quiet captures decode silently, clipped captures usually decode fine since clipping preserves zero-crossings); the live clipping warning is now latched (no modal jitter) and reworded calm. New decision logic is pure + tested in `renderer/record-flow.js` (14 tests). **An exploratory decode-time "sweep/limiter" (try multiple gain levels + clip-and-push) was built then reverted** — the plain boost handles every real case and the limiter over-clips a clean FSK tone; the fork keeps only a real-hardware regression fixture (`tests/fixtures/quiet-unit-seq.wav`, an actual ~12% capture). **Don't rebuild the sweep.** Hardware-validated on both JX units (upstairs/laptop + downstairs/Mac Mini).
- **WAV upload zone + per-row download icon** (June 3, v0.7.2) — Two new Library surfaces for users who don't have the KT cable connected (or who want a backup WAV of a saved package). **Upload zone**: always-visible dashed-border drop target at the bottom of Library Tones + Sequences sub-tabs, with WAV-file icon + label "drop a WAV or click to upload a WAV". Accepts drag-and-drop OR click-to-browse via hidden `<input type="file">` + getPathForFile (same Electron 32+ pattern the drag-drop flow uses). Two variants — `prominent` for empty-state, `compact` for populated. Drop animation: 600ms ring pulse via @keyframes lib-upload-drop-pulse + label swap to "Importing… (decoding WAV)" so the jx3p decode delay reads as feedback, not stalled UI; auto-resets via 6s safety timeout if import errors (no renderPatchList re-render in error paths). **Download icon**: hover-revealed inline SVG arrow-into-tray on each Library row, between the primary action and the trash. Click opens native macOS Save dialog defaulting to ~/Desktop/<package or sequence name>.wav (filename sanitized to ASCII letters/digits/safe punctuation). Cancel is silent no-op; success pops a small confirm modal with the chosen path. **New IPC handlers**: `tape-save-wav-to-path` + `seq-tape-save-wav-to-path`. Run showSaveDialog with desktop default, then jx3p json-to-wav / seq-json-to-wav, then jPpS chunk embed (slotMeta / sequenceMeta — same v0.6.5 chunk preservation flow). Schema gotcha: bank.schema.json is `additionalProperties: false` with `required: [format_version, banks]` — v0.7.2's first cut forgot format_version and got a wall-of-text stderr dump in the error modal; the renderer must build `exportData = {format_version: '1.0', banks: pkg.banks}` (plus optional `_slotMeta` that main.js strips). **Removed**: "Save WAV file" button from the Send-to-JX modal — downloading is per-library-row now, Send stays focused on transfer. buildSendActions still returns a detached saveBtn stub so existing destructurers don't break. **Row layout**: hover-state buttons read LOAD | download | trash (or info | download | trash on sequences) left-to-right via :has() selectors that position primary action further from the right edge than download (which sits at right: 40 between primary and trash).
- **Audio Settings modal as single source + ghost devices + Audio Diagnostics fold-in** (June 2, v0.7.1) — Polish + structural cleanup pass on top of v0.7.0's routing rewrite. **Ghost devices**: when a user picks a device (KT USB Audio for any of the three routings) and later unplugs it, the picker now shows the saved selection as the visible value in the closed dropdown with a `(unavailable, plug it in!)` suffix — was: silent fallback to system default which misled users into thinking their pick was lost. Two new library fields cache labels for ghost UX across restarts: `library.cableOutputDeviceLabel`, `library.appSoundDeviceLabel`, `library.record.preferredInputDeviceLabel`. **Hot-plug**: `devicechange` listeners on Send modal + Audio Settings modal reactively re-enumerate + repopulate when devices come/go while open. No more "close and reopen" friction. **Send-modal missing-device safety belt**: `analyzeRouting()` returns `'ok' | 'speakers' | 'missing'`; `'missing'` blocks Play with a warning that the cable device is unplugged. JP refuses to silently fall back to system default — would risk regressing the v0.7.0 speaker-blast bug if system default happened to be built-in speakers. **Audio Settings modal grew from 3 to 5 controls**: added "Record from JX-3P routing" (writes the same `library.record.preferredInputDeviceId` the Record-from-JX modal reads — single source of truth) and a collapsible "How routing works" disclosure with a 4-row table explaining where each sound goes (per Daniel's "this is the most helpful chart" call). **Audio Diagnostics fold-in**: removed the standalone Help → Audio Diagnostics… modal + menu item; the macOS-label-regression canary + bug-report button live inline at the bottom of the Audio Settings modal (only shown when status != 'ok'). One audio surface, less duplication. `showAudioDiagnosticsModal` function (~200 lines) and orphaned `.audio-diag-*` CSS removed. **Record-from-JX cross-session preferred input device memory**: `library.record.preferredInputDeviceId` + label persisted on every picker change in either surface, pre-selected on Record modal open, ghost option for unplugged saved device. **Other polish**: PROCESSING segment in the Record timeline pulses in place (Star Trek transporter) since decode duration is unpredictable; sequencer note preview gets a 3.5 kHz lowpass filter for a mellower top octave; Library tab "for fun" phantom patch (PG-200 responds to clicks even without a real patch selected, cloned from `activeBankPatch` on first interaction, reset on bank-tab nav); MIDI Memory mode placeholder modal reworded + dropdown reverts to Tape Memory on dismiss (was getting stuck on the non-functional mode); save-banks hint italicized above the "save C/D banks to library" button for fresh JX-3P imports; "Saved:" → "Created:" in sequence info popover.
- **Paired patches travel with sequence WAVs + on-panel preview** (June 1, v0.6.5) — Two threads. **Data layer**: jPpS RIFF chunk bumped to v:2 to carry `sequenceMeta` alongside the existing patch `slotMeta`. The sequence chunk includes `customName`, `originalName` (set ONCE at first export, preserves cross-user attribution across renames), `createdAt`, `patchNote`, and the full `pairedPatch` — `{bank, slot, patchName, params}` with all 32 patch parameters. So a sequence WAV shared with another JP Patches user lands with the paired patch fully intact (not just a reference). Backward compatible: v:1 readers ignore unknown keys, v:2 readers handle both. Unified embed/read helpers `embedJpMetaInWav` / `readJpMetaFromWav` in main.js — patches and sequences share the chunk machinery now. **UI layer**: clicking a Library sequence with a paired patch auto-loads it onto the PG-200 panel as a non-destructive preview. New `currentPreviewPatch` state routes through `currentPatch()` so every downstream consumer (knobs, parallelogram, Write source) reflects the preview without per-call-site changes. Parallelogram section label swaps from "Patch" to "Paired Patch Preview"; patch name renders in amber italic inside the parallelogram. A hint block under the JP logo (foreignObject + HTML so word-wrap is automatic) shows `sequence: {name}` / `written with: {patch}` (amber bold) / `notes: {patchNote}` (2-line clamp, hanging indent — only when present) / `click [Write] to save paired patch` (with "Write" in a mini panel-button frame mirroring the design-system primitive). Labels dim to `--text-mid`, values stay bright — modal-body supportive-prose pattern. Preview exits on: C/D slot click, bank-tab click (Option B — picks the cleaner mental model over preview-persists, gated by `!writePending` so the slot-picker can navigate banks mid-Write), or Load-to-JX (hint fades 200ms, modal opens after fade completes). Write from preview auto-switches Library → Bank C, surfaces paired patch name in the slot-picker banner + confirm modal title, then clones name into destination slotMeta on commit. Round-trip verified end-to-end on June 1: David Nixon 2 → JX export → re-import as David Nixon 3 → preview activates → Write to C7 → params + name land correctly. Smoke test gained §3a (14 rows for preview UI) and §3b (7 rows for chunk round-trip).
- **Tape Dump Sounds (Send + Record) + Audio Diagnostics + modal-family cleanup** (May 29–30, queued for v0.6.4) — three threads landed across two days, all building on each other.

  **Tape Dump Sounds (Send-side, committed earlier)** — plays the FSK quietly out the Mac's built-in speakers in parallel with the cable transmission, so the user *hears* the tape dump happening (1980s-cassette-backup style). Off by default via `View > Tape dump sounds`. FSK-only (no stylized mode — every user of this app is a JX-3P-owning vintage-synth nerd; the modem-screech is the whole point). All routing in `renderer/transmission-sounds.js` with strict safety: allowlist matches only Mac built-in speaker labels via `MAC_SPEAKER_LABEL_RE` (`/^(MacBook( Pro| Air)?|iMac|Mac mini|Mac Studio|Studio Display) Speakers( \(Built-in\))?$/`), cable-exclusion as a second guard (`deviceId !== cableDeviceId`), and `setSinkId` is mandatory (no fallback to system default — the cable IS the system default). All wrapped in try/catch with silent-fail logging. New audio stream is a completely separate `<audio>` element that shares only the temp-WAV URL with the transmission — cannot corrupt the cable channel even if it errors. Volume slider in the modal with `vol = sliderPos²` mapping; speaker icon left = momentary mute; info popover right.

  **Tape Dump Sounds Record-side counterpart (`startTapeDumpMonitor`, queued)** — analogous routing for the inbound direction: hear the JX dump come IN during Record. Taps the capture's gain node via `MediaStreamDestination` → separate `<audio>` → `setSinkId(built-in speaker)`. Built-in-speaker routing is MANDATORY here (not just nice) because during Record the KT is the INPUT but also a possible OUTPUT, so monitoring via system default could feed audio back into the JX's tape input mid-dump. Lifecycle in `showRecordFromJxModal` mirrors the Send-side pattern.

  **Audio Diagnostics (Help > Audio Diagnostics…, committed `a254d88`)** — opens a one-glance modal that runs `runAudioDiagnostic()` (= `enumerateDevices` + categorize against `MAC_SPEAKER_LABEL_RE`) and surfaces the result in a single color-coded banner: green "All systems go!" + matched speaker, amber "OS may have changed output labels" + Report-this-bug button, amber "no audio outputs" + Report, or blue info "grant mic permission via Record-from-JX" (not a bug; no Report button). "Report this bug" opens a pre-filled GitHub Issue URL in the user's default browser (via `shell.openExternal` allowlisted to the JP repo). Body packages app version, macOS Darwin release, allowlist regex source, full device list with labels + IDs — everything needed to update the regex. Detects the macOS-update regression where built-in speaker labels change format and the allowlist silently stops matching. 23 unit tests in `test/audio-diagnostic.test.js` covering all four status branches + URL-builder shape.

  **Modal-family cleanup (queued)** — Daniel-driven UX sweep across the Send-to-JX + Record-from-JX modal family:
  - **Title unification under `[Verb] [thing] [direction] JX-3P` pattern**: `Send sequence to JX-3P` / `Send C/D banks to JX-3P` / `Import sequence from JX-3P` / `Import C/D banks from JX-3P` / `Calibrate volume`. Dropped "Step X of Y" prefixes (misleading for the post-first-calibration common case where only Step 2 ever shows). Send modal step-2 title now inherits Step 1's title (so source label `Send "Spils Sounds" to JX-3P` carries across — used to drop to generic on step transition).
  - **Source label rendering**: `Send "Spils Sounds" to JX-3P` → `Send `<em>`Spils Sounds`</em>` to JX-3P` — italicized, no quotes (typographic convention for a name). New `.modal-title em` rule: `font-style: italic; color: var(--text-mid);` — keeps the title's bold weight (inherited) but switches color to the body-text muted grey, so the name visually separates from the surrounding bright verb + suffix without dropping in weight. `innerHTML` + `escapeHtml(sourceLabel)` so a malicious package name can't inject markup.
  - **Send modal IA simplification**: removed time-estimate paragraph ("Transfer takes about Xs. Don't switch apps…") — timeline communicates duration; warning reads as paranoid for a one-click flow. Removed `playReadyMsg` pre-play instruction ("First click JX buttons, then hit Play below…") — title + body copy already say this. Removed `(button 13)` / `(button 16)` from instruction text — the key-diagram in the cause→effect row already highlights the right key visually. Centered modal body (`text-align: center`).
  - **New OUTPUT DEVICE section in Send modal**: visual parallel to the Save modal's INPUT DEVICE block (`.send-jx-device-section` / `.send-jx-device-label` / `.send-jx-device-display`). Sits between cause→effect row and timeline. Read-only display of the system default output device (Send always uses system default; no real picker today). The built-in-speaker warning (`.send-jx-output-warning`) lives inside this section.
  - **`loading:` → `complete:` prefix swap** in the package-label below the JX-3P logo when the transfer ends. Wired into the `audioEl.addEventListener('ended', ...)` handler alongside the existing `.complete` class additions.
  - **Memory Protect hint** added to both Send-modal instruction strings as a sub-line: `<br><em>Make sure Memory Protect is off on the JX-3P.</em>`. Surfaces a silent-failure gotcha (Memory Protect on the JX silently discards tape-load writes — audio plays, JX accepts, nothing saves — see pitfall #21).
  - **Record-from-JX capture-mode two-state shift**: was `opacity: 0` (jpLogo + arrow still occupied flex space → diagram off-center waiting), now `display: none` initially → `display: flex` on `.playing` with a brief keyframe fade-in (`cal-row-element-reveal`). Diagram visually CENTERS when alone, then SHIFTS when the JP logo + arrow re-enter layout on signal detection. Matches the Send modal's "centered → shift left to make room for destination logo" pattern. Calibration mode unchanged (gain knob + meter need to be pre-visible — chicken-and-egg with gain dial).
  - **Three-button post-capture warning in Record modal**: was Try-again (green) + Use-anyway (blue), now Try-again (green, recommended) + Calibrate (blue, new — drops to calibration screen via `clearCalibratedGain` + `configureForCurrentDevice` re-call so the user can dial gain down) + Use-anyway (red — `modal-btn-danger`, "are you sure?"). Surfaces the corrective action when the warning's "consider lowering input gain next time" actually applies — previously the user had to cancel + reopen to get to calibration.

  **What this all enables (when v0.6.4 ships):** users hear their tape dumps in both directions, can diagnose the silent-fail-after-macOS-update case via Help menu, get a hint about the Memory Protect gotcha before they fall into it, and have a one-click corrective action when capture clips. Modal copy is leaner across the family; the cause→effect visual pattern (centered → shifted) is consistent.

- **Public site at jx-3p.com + release automation + logo redesign** (May 28–29) — Built a Tier-3 Jekyll site from scratch in `docs/`, no theme — custom layout (`_layouts/default.html`) + custom stylesheet (`assets/css/style.css`) carrying every Roland design-system token. Header structurally integrates the JX-3P A/B/C/D bank-indicator motif (green + blue swoops on top of a dark band with stripes extending right; red C/D parallelograms bleeding into the body below at y=195; full-width red stripe at the band's bottom). Header download button is a panel-button SVG primitive (44×44 cream face + LED + caret + label) that arms its LED to Roland red on click before navigating. Four download CTAs distributed through the page — header panel button + three body buttons (red / green / blue parallelograms via CSS clip-path) — all pointing at `/releases/latest` so the site auto-updates with every release. 2×2 screenshot gallery with click-to-lightbox (prev/next chevrons + arrow keys + Escape). Vertical YouTube Short embedded at the page bottom (320×568, youtube-nocookie variant; switched away from `aspect-ratio` CSS after browser-rendering issues). URL tracking-param stripper (`fbclid`/`gclid`/`utm_*` removed via `history.replaceState`). Mobile layout drops the swoops + panel button to keep just logo + subtitle. Custom domain `jx-3p.com` purchased via Squarespace registrar, configured via `docs/CNAME`. **Logo redesign:** identified the JX-3P sub-text font as Helvetica Bold (via panel close-up); built a logo comparison HTML (`/tmp/font-preview.html`) of 14 free fonts (Orbitron, Audiowide, Michroma, Anta, Russo One, Wallpoet, Saira Stencil One, Black Ops One, Iceberg, Stalinist One, Major Mono Display, Ruda 800, system Helvetica Bold) plus 4 commercial references (Eurostile Extended, Microgramma D, Square Sans Serif 7, Aldo the Apache); Daniel ultimately supplied a transparent-cream PNG (1306×872) that replaced the old chrome-on-black 1354×1026 version in BOTH `renderer/assets/jp-logo.png` AND `docs/assets/img/jp-logo.png`. Favicons (32, 192, apple-touch 180) regenerated via `sips` center-crop. **Release automation:** `scripts/release.sh` is now a one-command release — version bump (package.json + CLAUDE.md Status line), test run with rollback on failure, DMG build via `npm run dist:unsigned`, confirmation prompt, commit + lightweight tag + push + `gh release create` with notes + DMG + blockmap attached. `docs/RELEASE.md` documents the workflow (3-step quick reference + recovery procedures). Pitfall: the logo lives in two places that must stay in sync — `renderer/assets/jp-logo.png` is what the panel embeds, `docs/assets/img/jp-logo.png` is what the website uses. Update both together.
- **Sequencer visualizer becomes an editor** (May 26) — single-page-view editing across the whole roll. Click empty area to toggle a NOTE/REST/TIE insert tooltip (replaces Ctrl+click, more discoverable, anchors near cursor). Drag a note vertically to pitch-shift with live preview. Marquee drag on empty area for column-constrained multi-select with live note highlights (no dashed rect — the notes themselves indicate selection). Group pitch-drag preserves Δpitch across selected members. Keyboard Delete removes selection. Playhead is grabbable directly. JX-faithful insert rules per pitfall #16: polyphonic REST ties EVERY prev-column attack; polyphonic TIE uses canonical `{tied,attack}` pairs when N≤3 fits the 6-voice budget, falls back to fresh-attacks-only for N≥4 (matches JX firmware fallback); NOTE blocked when column has any tied voice (symmetric gate). Hover tooltip + insert buttons use JX-panel music symbols (♪/⌣/SVG rest). Refactor: insert rules extracted to `renderer/seq-insert-rules.js` with 33 unit tests pinning JX-derived properties; `app.js` shrank by 77 lines on the extraction. New module `renderer/synth-preview.js` (triangle-wave note preview, 5 tests). Bug: Custom Bank C15→C16 reorder was a no-op (bucket drop handler was missing the top-half/bottom-half cursor convention the 3 other reorder paths use) — fixed by mirroring the convention + `.drag-over-bottom` CSS. Test count: 127 → 199. **Real-JX round-trip validation (May 26):** Daniel edited two sequences in JP, sent each to a real JX-3P via tape-load, listened to playback, recorded back to JP, and visually compared the round-tripped data — match in both cases. Coverage by edit type: NOTE inserts + chord stacking ✓, polyphonic REST (4- and 5-voice chord continuations) ✓, canonical single-voice TIE (`{tied,attack}` pair, renders BLUE) ✓, **polyphonic TIE fallback (N≥4, fresh attacks only, renders RED) ✓** — the last was the one path the editor could produce that had only been observed in one direction (JX→JP decode); now also confirmed JP→JX playback. Pitfall #16 is closed end-to-end: every encoding path the editor produces is JX-loadable, JX-playable, and JX-recordable, validated on hardware.
- **v0.6.0 polish + release prep** (May 27) — small UX fixes layered on top of the May 26 editor work, then the version cut. **Write-flow Cancel loop fixed:** pressing Cancel on the "Save this new patch to *slot*?" confirm modal used to dismiss the modal but leave the user stuck in the slot-picker banner (clicking any slot re-popped the modal — felt like a loop). `showConfirmModal` gained an optional `onCancel` callback that fires on any dismissal without an explicit Confirm/Tertiary choice (Cancel button, Escape, or overlay click); `commitWriteTo` uses it to exit Write mode cleanly. **MIDI Memory "coming soon" modal:** flipping the Tape/MIDI dropdown to MIDI Memory now pops an informational modal explaining Phase 3 status (gated on the Series Circuits MIDI Upgrade Kit). Dropdown stays on MIDI after dismiss so the preference persists; the existing `midiBlocked` console-warn still applies to subsequent button clicks. Required adding a `hideCancel` option to `showConfirmModal` for single-button info modals. **Restored "X of N pages populated"** text in the sequence-visualizer header (removed earlier May 26 on the theory that the dimmed page-button row communicated the same info; the explicit count is more glanceable). **Listener-leak spot-check:** connected to the Electron renderer via CDP on port 9222, snapshotted document-level event listeners before/after a stress cycle of the editor (page-zoom toggles + tip open/close + Escape dismiss) — **delta = 0** across every event type. The `setupSeq*Once` guards work; `activeInsertTipDismiss` correctly disposes per-tip listeners; no leak. `docs/smoke-test.md` gained a new Section 4 "Sequencer editor" with 25 rows covering all the editor flows + an N≥4 polyphonic-TIE fallback row + an optional real-JX round-trip row; Section 9 (Custom Bank Builder) got two rows for the C15→C16 reorder fix. **Editor Cmd+Z / Cmd+Shift+Z undo + redo:** every editor mutation (NOTE/REST/TIE insert, deleteNoteAtStep, pitch-drag, group pitch-drag) snapshots the entire affected sequence via `cloneSeq` before mutating and pushes one entry onto the existing app-wide `pushUndo` stack (already used by patch-list / bucket reorders). Multi-note Delete via marquee selection passes `skipUndo: true` to `deleteNoteAtStep` and pushes one batched entry covering the whole loop. Snapshot-level approach (vs per-mutation inverse logic) handles every editor mutation shape including never-touched-page init and group drags across pages, at a max cost of ~200KB (50 × 4KB sequences). **QA caught a bug during Test A:** the redo path bypassed the `originalSequenceSnapshots` capture, so after Cmd+Z back to baseline followed by Cmd+Shift+Z forward, `hasSnapshot` was incorrectly `false` — would have broken the SAVE flow's restore step. Fixed in `applySeqUndoOrRedo` (commit `4dd84ab`) by capturing the current state as the snapshot before mutating if none exists. Known limitation: undo entries become stale after a Save/Discard nav-away (could re-mark dirty without restoring meaningful state) — edge case, future work could clear editor entries on resolve. **Also a known issue (intermittent, not reproducible after first occurrence):** during QA, navigating Library→Bank C/D with a dirty sequence skipped the `guardSeqNav` modal that fired correctly on the return path; root cause not yet identified. Both directions go through the same handler, so the asymmetry should be impossible. Documented in `release-notes-0.6.0.md` Known Issues; smoke test gained a row to watch for it. Released as **v0.6.0** (commit `8dbd150`); release notes in `docs/release-notes-0.6.0.md`.
- **Capture-pipeline reliability sweep + internal refactor** (v0.5.13, May 25 night) — fixed ~12 silent-failure bugs across the Record-from-JX flow (scope errors, leaked devicechange listeners, unhandled rejections, IPC contract mismatches); added a renderer-wide error banner so future silent failures become visible; added per-capture telemetry to `library.captureLog`; recalibrate now seeds the slider with prior gain instead of resetting to 1×; CoreAudio-based sample-rate advisory; downgraded sample-rate warning from "will fail" to "advisory" after real-world testing proved 48→44.1 resample survivable. Refactor: 6 new pure-logic modules (`record-trim.js`, `capture-warnings.js`, `capture-state.js`, `audio-capture.js`, `send-timeline.js` + the pre-existing math modules) with 77 new unit tests (50 → 127). The two biggest modals (`showRecordFromJxModal`, `showSendToJxFlow`) shrunk by ~550 lines total. Visualizer now distinguishes REST from TIE via the voice[1]-new-attack signature (pitfall #16 was rewritten — earlier conclusion was wrong).
- Modified-patch indicator + revert + save-and-load rescue (v0.5.12, May 25 morning) — per-slot red dot for unsaved edits with click-to-revert; 3-button confirm modal when loading a library over unsaved active C/D; Logic-style hover/double-click knob value editing; patch-switch knob spin animation.
- Record-from-JX-3P + two-pass auto-calibration + JX key-sequence diagrams (v0.5.11, May 23–24)
- Custom WAV-name embedding (jPpS RIFF chunk) for cross-user sharing (v0.5.11)
- App menu cleanup + View zoom presets (v0.5.10)
- Shift-click range select, inline LOAD, modal polish (v0.5.9)
- Patch history modal + per-package createdAt + origin tracking
- Send-to-JX-3P from inside the app (v0.5.7)
- First-run seed content — Spils Sounds + Spils Sequence (v0.5.5–v0.5.6)
- Fullscreen toggle + UI polish pass (v0.5.4)
- Vintage cream palette + JX-3P key tabs (v0.5.2–v0.5.3)
- Custom Bank Builder + Custom Banks redesign (v0.5.0–v0.5.2)
- Drag-and-drop WAV import (v0.4.0) + Electron 32+ fix (v0.4.2)
- Sequencer save/load (v0.3.0) — sequencer codec shipped upstream in `jx3p`
- App icon + animation polish (v0.2.0)
- First public build (v0.1.0)

## Common pitfalls

1. **`node_modules/` symlinks can vanish** after some npm operations. If `npm start` fails with `electron: command not found`, run `npm install` to restore the `.bin/` symlinks.
2. **`~/Desktop/patches.json` is a legacy boot source.** Absence is no longer fatal — first-run empty state + seed handle it gracefully — but the hard-coded path is still in `main.js`.
3. **The `jx3p` Python tool path is hard-coded** to `~/JP-Patches/` when running from source. In packaged DMGs, `extraResources/jx3p/` is used. From-source clones need `~/JP-Patches/` present (or `JX3P_SRC=/path` for `setup-vendor.sh`).
4. **macOS filesystem is case-insensitive.** `~/JP-Patches` and `~/jp-patches` are the same directory. Don't try to create a sibling clone with only-case differences.
5. **Don't commit `node_modules/`, `vendor/`, `dist/`, or `build/` outputs.** The first commit in repo history did include node_modules and required a `git filter-branch` rewrite to undo (GitHub rejected the push due to Electron Framework being >100 MB). `.gitignore` handles this now but stay vigilant.
6. **Window can't grow past 1140×710** on Daniel's machine — his logical display is 1147×719. Anything wider will be partially offscreen. The View menu 75% preset is the workaround for tighter screens until adaptive sizing lands.
7. **Knobs cap at ±140° rotation.** The `paramToAngle` math expects continuous params in 0–255 and discrete params indexed into `DISCRETE[param]`. Always clamp before applying.
8. **Loop suppression matters in Phase 3.** When MIDI lands, inbound CC must not trigger outbound CC. See spec §3.5.1.
9. **Apple Silicon arm64 only.** `electron-builder` is configured for `--mac --arm64`. Intel build target intentionally not shipped.
10. **macOS auto-injects items into the Edit menu** when it detects standard text-editing `role:` strings. Manual click handlers (current approach) prevent it. Don't switch back to `role:` unless you also want Substitutions/Speech/Writing Tools/Dictation back.
11. **Quiet-recording auto-boost lives in our `jx3p` fork.** `_load_wav_mono_float` in `~/JP-Patches/jx3p/codec.py` scales any WAV whose peak amplitude is below `AUTO_BOOST_TARGET = 0.92` so the post-load peak hits the target. This rescues tape dumps recorded with too little Mac/interface input gain — without it, the FSK detector's `QUIESCENCE_THRESHOLD = 0.15` Schmitt-trigger band swallows the whole signal and every record decodes to None. Loud-enough recordings (peak ≥ 0.92) are untouched; pure digital silence (peak = 0) is left alone. If a real-world recording ever decodes as garbage rather than empty, suspect the boost amplified the noise floor enough to look like FSK to the demodulator — temporarily lower `AUTO_BOOST_TARGET` or gate the boost behind a peak floor (e.g. only boost when 0.02 < peak < target) to isolate. **Bug history**: introduced May 2026 at 0.7 after Daniel's "Sequence 2" recording at peak 0.053 decoded to 8 None pages. **Raised 0.7 → 0.92 in v0.8.1 (2026-06-12)**: the app calibrates capture peak to ~0.78, so 0.7 sat *below* the calibration aim and never fired for a calibrated user — leaving weak passages near the ±0.15 band on quieter JX units (Daniel's downstairs unit; sequences failed first, decoding only after he cranked INPUT GAIN into the clipping zone). 0.92 lifts every loaded WAV hot at decode time. The deeper fix (auto-converging decode that eliminates the calibration step via a decode-time gain/limiter sweep) is parked in future-features.md.

12. **Record-from-JX thresholds (both LIVE and TRIM) scale with current gain.** Two parallel scaling sites — keep them in sync.
    - **`stopRecording`'s trim classifier** (post-capture, ~line 4493): `SILENCE = max(0.05, 0.012 × gain)`, `SIGNAL = max(0.10, 0.025 × gain)`, capped at 20× gain.
    - **`tickMeter`'s live classifier** (during capture, via `liveThresholdsFor(g)` ~line 4106): `SILENCE = max(0.03, 0.012 × gain)`, `SIGNAL = max(0.10, 0.025 × gain)`, same cap.

    The analyser sees POST-gain audio (`source → gainNode → analyserNode`). The JX's between-dumps idle tone has a roughly fixed pre-gain amplitude (~0.005–0.010); at saved gains > ~4× the post-gain idle crosses the default 0.05/0.10 thresholds, with two distinct failure modes:

    - **Trim mode** (original 2026-05-24 bug, tone-only manifestation): silence detector finds no pre-FSK gap, trim falls through to the "longest signal run" fallback (which **includes** the idle tone), jx3p's demodulator calibrates `long_width` against idle-tone cycle widths → 0/32 valid records.
    - **Live mode** (2026-05-24 sequence bug): `firstSignalMs` sets the instant the modal opens (idle counted as signal), `totalSignalMs` accumulates the entire pre-Save idle period, and the auto-stop trigger `totalSignalMs >= EXPECTED_SIGNAL_MS` fires DURING the dump. Tones at 33 s usually escaped by budget margin alone; sequences at 21 s did not → "Recording didn't decode cleanly" recalibrate prompt for sequences specifically.

    If you ever add a third threshold-comparison site (e.g. a new heuristic during capture), scale it the same way. Hardcoded 0.05/0.10 anywhere is a smell.

15. **JX-3P sequence tape dumps are content-variable in duration** — anywhere from ~6 s (dense zero-bit data) to ~28 s (sparse / empty pages, lots of one-bits). Each dump is 1 pilot + 16 records (each of 8 pages transmitted twice for redundancy) + 16 separators. The asymmetry comes from `_AUDIO_BIT_ONE = 50 samples` vs `_AUDIO_BIT_ZERO = 11 samples` in `~/JP-Patches/jx3p/codec.py` — a 4.5× wall-clock difference per bit. Empty/default page bytes encode to many 1-bits. The Record-from-JX modal's `EXPECTED_SIGNAL_MS = 30000` (sequences) sizes the auto-stop budget for the long end; the comparable patches value is 33000. Bug history: was 21000 ms, which cut Daniel's 27.65 s Spils Sequence dump off mid-transmission → 0/8 pages decoded → recalibrate prompt loop that calibration couldn't fix because the bug wasn't gain-related. Tone dumps don't have this asymmetry as steeply because they have 2 banks separated by a long pilot, and the budget had headroom — the bug only manifested on sequences.

13. **Tone vs Sequencer use different numeric keys on the JX-3P.** Tape Memory + Tone maps keys 14/15/16 to Save/Verify/Load. Tape Memory + Sequencer maps keys 11/12/13 to Save/Verify/Load (NOT 14/15/16). The `buildJxKeyDiagram({ action, kind })` helper handles the swap based on `kind === 'sequence'`; don't hardcode "14/15/16" in any modal copy. Confirmed against the actual JX-3P panel by Daniel on 2026-05-24.

14. **Record-from-JX calibration modal hides its Stop button.** Auto-stop fires from `tickMeter` when cumulative FSK signal time hits the expected dump duration or when end-of-dump silence is detected. Exposing Stop during calibration confused users (they'd click it expecting to "confirm calibration done" and instead truncate the measurement). Two-pass flow is cleaner with no Stop control in pass 1.

17. **Chromium aggressively caches `getUserMedia` streams per `deviceId`.** This bit us hard during the 2026-05-25 sample-rate-mismatch debug: a `getUserMedia({deviceId: X})` probe to read the device's native sample rate returns the SAME cached stream — with the SAME negotiated sampleRate — on subsequent calls, even after the user has changed the device's Format in Audio MIDI Setup. Cache-busting attempts (random `latency` constraint, fresh AudioContext per probe) failed to reliably defeat the cache.

    **Workaround that DOES work:** query CoreAudio directly via `system_profiler SPAudioDataType -json` from the main process. CoreAudio reads the device's live state; no Chromium layer in the path. JP does this via the `audio-input-rates` IPC handler in `main.js`. The renderer's `probeDeviceSampleRate` helper compares the picker's selected `deviceId` (or "default" → falls back to `isDefaultInput`) against the `system_profiler` device list by name-substring match (Chromium's label is "Default - KT USB Audio (31b2:2024)"; system_profiler's name is the bare "KT USB Audio"). Surfaced as an advisory amber notice, not an alarm — because Daniel's KT input is locked at 48 kHz and transfers decode fine anyway.

    If you ever need to ALSO read other live audio-device properties (channel count, current bit depth, exclusive-mode availability), the same `system_profiler` path is the right answer — don't try to wrest the info out of `navigator.mediaDevices.enumerateDevices()`.

19. **The JP Patches logo lives in two places that must stay in sync.** `renderer/assets/jp-logo.png` is what the app's panel chrome embeds; `docs/assets/img/jp-logo.png` is what jx-3p.com uses. They are independent files — updating one does not update the other. If you redesign the logo, copy the new PNG to BOTH paths and regenerate the favicons (`docs/assets/img/favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png`) from the docs copy via `sips` center-crop → resize. Same goes for any future asset that lives in both the renderer and the site (currently only the logo, but the pattern applies).

20. **The website's download CTAs all point at `/releases/latest` — never edit them per release.** All 4 download buttons on jx-3p.com (header panel-button + 3 body parallelogram buttons in red/green/blue) link to `https://github.com/danielspils/JP-Patches-App/releases/latest`, which GitHub redirects to whatever the most recent release is. Don't hardcode a version into a button href — the site is meant to auto-update with each `scripts/release.sh` run, with zero manual site changes. If you need a "previous releases" page in the future, add it as a separate route, don't downgrade the primary CTAs.

21. **JX-3P Memory Protect silently discards tape-load writes.** The JX has a physical front-panel Memory Protect switch. When ON, the JX accepts the incoming tape FSK audio AND completes the load operation (no error, no indicator) BUT silently drops the data — nothing actually writes to its patch banks. From JP Patches' perspective everything succeeds: audio plays through the cable, the timeline completes, "complete:" prefix appears. Only verification is the user checking the JX afterward and finding the patches unchanged. We can't detect Memory Protect state in tape mode (no return channel; the JX never reports anything back). Surfaced via a sub-line in both Send-modal instruction strings: `<br><em>Make sure Memory Protect is off on the JX-3P.</em>`. Discovered 2026-05-30 when Daniel tested a basement JX-3P; spent an hour chasing a Tape Dump Sounds audio-routing red herring before realizing nothing was actually saving. **MIDI (Phase 3) MAY unlock detection** if the Series Circuits kit's SysEx implementation exposes the switch state — most synth MIDI implementations don't expose physical front-panel switches, but worth checking. Even without read access, MIDI's SysEx Data Set messages bypass the tape-load gate entirely, so Memory Protect becomes irrelevant for MIDI-routed patches.

22. **macOS CoreAudio "dormancy" can make `setSinkId` silently fail to route audio.** Background: Tape Dump Sounds + Audio Diagnostics both depend on `setSinkId` to route a second audio stream to the Mac's built-in speakers (in parallel with the cable transmission). The API can return RESOLVED (no error, no exception) while NOT actually routing audio to the target device — the audio just goes silent. Repro pattern surfaces after a macOS major update OR after extended periods where the speakers haven't been the system default OR after Electron renderer reload (Cmd+R recreates the AudioContext, forcing setSinkId to re-acquire the device). Audio Diagnostics modal still reads "All systems go!" green during this — because the device IS in `enumerateDevices()` and the allowlist matches — but the actual audio path is dead.

    **Workaround** (user-driven, until we automate detection): System Settings → Sound → Output → click MacBook Pro Speakers (which "wakes up" the speakers in CoreAudio's routing graph) → click your USB device (KT USB Audio / interface / etc.) back. Now `setSinkId(speakers)` succeeds AND actually routes. Stays addressable for the rest of the session unless something dormants it again.

    Confirmed manually 2026-05-30 via a direct CDP probe that played a 440 Hz beep through `setSinkId(MacBook Pro Speakers)` — beep was inaudible, then audible after the System Settings toggle, then setting was identical. This is below the layer JP Patches can fix. Document the workaround when the recipe lands in user-facing docs.

    Adjacent observation: turning USB audio devices off/on (Daniel did this with his audio interface as a separate troubleshooting step) ALSO seems to nudge CoreAudio to re-evaluate routing. Plausible mechanism: device re-enumeration on USB reconnect forces Core Audio to refresh its routing graph. Either workaround should achieve the same thing.

18. **Shadow-bug class: two-file global override on script-tag-injected modules.** Both `isDecodeAllDefault` and `computeTrimThresholds` shipped at one point in BOTH `calibration-math.js` AND a second file (`app.js` and `record-trim.js` respectively). Because `renderer/index.html` loads modules via `<script>` tags in order, and each module uses `Object.assign(root, exports)` to publish its exports to the shared `window` global, the later-loaded module's definition silently overrode the earlier one. The earlier definition was dead code; the later one was the runtime authority. Both bugs cleaned up 2026-05-26.

    ESLint's `no-redeclare` rule doesn't catch this because the function definitions are inside per-module IIFEs (scoped locally to each module's closure), and the global override happens via runtime `Object.assign`. We caught these manually during the JSDoc-annotation pass when documenting both versions and noticing they were near-identical. Prevention: when adding a new export to a pure-logic module, do a project-wide grep for the exported name to confirm no other file defines it. Or build the modules into the dependency graph properly (ES modules with explicit imports — bigger refactor, out of v1 scope).

16. **JX-3P REST and TIE encode differently — but both produce a tied voice[0].** Earlier analysis (based on incomplete test data) concluded they were indistinguishable. They're not. After a proper TIE test (note held WHILE pressing TIE WHILE the previous note still sounds — the procedure in the JX-3P owner's manual), the wire encoding revealed:
    - **REST press** → `voices: [{note: prev, tied: true}, null, null, null, null, null, null]` — voice[0] tied to the previous pitch, all other voice slots null. Matches Bruce's `sequence.py` comment ("a rest entered via the JX REST button is encoded as a tied continuation").
    - **TIE press (while holding the note)** → `voices: [{note: prev, tied: true}, {note: prev, tied: false}, null, ...]` — voice[0] tied to the previous pitch AND voice[1] is a NEW attack at the SAME pitch. The new attack in voice[1] is the discriminator.
    - **Full-empty step (e.g. user never programmed beyond step N)** → `voices: [null × 7], byte7: 127`. byte7=127 is the "step never written" sentinel; populated steps have byte7=1.

    So the discriminator for tooltip / visual coding is: at any step where voice[0] is tied at pitch X, check whether any other voice slot has pitch X as a new attack. If yes → TIE. If no → REST (or polyphonic continuation — see below).

    Caveat: a tied voice without a same-pitch new attack is still ambiguous between (a) a REST button press and (b) a normal polyphonic note continuation from a prior step. The wire data doesn't carry the user's intent. JP's tooltip uses "rest" as the dominant case (REST button is the common single-voice path); the distinction would only matter if JP added polyphonic-aware editing.

    Users coming from other sequencers (where REST creates literal silence in voice[0]) will still report "I recorded rests but they're not showing as blue" — it's a Roland firmware decision, not a JP bug. The blue rest column only appears for fully-empty steps (byte7=127). Bug history: surfaced 2026-05-25 with an inadequate test (`C, REST, C, REST, C-key, C-key`) that didn't capture a TIE event at all, leading to the incorrect "indistinguishable" conclusion. Corrected same day after a proper test sequence (`C, REST, C, TIE+C, C, REST, C`) decoded with the voice[1] new-attack signature for the TIE event.

    **Polyphonic (chord) REST/TIE behavior — empirically verified 2026-05-26:** the single-voice descriptions above don't fully capture the JX firmware's behavior in polyphonic contexts. Daniel recorded a test sequence (`5-voice chord + REST + 3-voice chord + REST + 4-voice chord + REST + 5-voice chord + TIE + TIE + TIE + TIE`) on the actual JX-3P and imported it. The wire encoding showed:

    - **Polyphonic REST** (REST after a held chord) → `voices: [{prev_note_1, tied: true}, {prev_note_2, tied: true}, ..., {prev_note_N, tied: true}, null...]` — ALL chord voices get tied into the next step, not just voice[0]. A 5-voice chord followed by REST produces 5 green cells in the next column, not 1.
    - **Polyphonic TIE** (TIE after a held chord) → `voices: [{prev_note_1, tied: false}, {prev_note_2, tied: false}, ..., {prev_note_N, tied: false}, null...]` — ALL chord voices get fresh new-attacks. NO tied voices included. The canonical single-voice TIE encoding (tied + new-attack pair per pitch) can't fit polyphonic in the 7-voice budget (2N voices needed for N-note chord); the JX firmware falls back to just re-attacking.
    - **Consequence for polyphonic TIE**: data-shape-identical to "user played the chord again." There's no distinct polyphonic-TIE signature in the wire data — only single-voice TIE has the tied+new-attack-at-same-pitch discriminator. A polyphonic TIE column renders as all red attack cells (looks like a chord re-strike).
    - **JX-3P 7-voice-slot budget per step** is the constraint forcing this divergence. Single-voice TIE uses 2/7 slots. Polyphonic-TIE-in-canonical-form would need 2N/7 slots — overflows past N=3.
    - **Editor must match.** JP's `insertRestAtStep` and `insertTieAtStep` (renderer/app.js) now use `previousColumnAttackPitches` to write one voice per prev-column new-attack (REST → tied voices; TIE → fresh attacks). Earlier versions wrote only voice[0] (REST) or voice[0]+voice[1] (TIE) and produced data shapes the JX itself wouldn't record.
    - **NOTE insert is also gated symmetrically (2026-05-26).** The JX itself can't record a step that mixes a note attack with a rest/tie continuation — REST and TIE are whole-step events on the front panel. So `insertNoteAtStep` rejects (and the tooltip's NOTE button is disabled) when the column has any tied voice. Stacking notes on a column that has only other notes (chord) is still allowed up to the 6-voice polyphony cap.

    **JP's rendering + tooltip rules (2026-05-26):**
    - **Cell color is determined by raw data shape — no heuristics:**
      - New attack with no same-pitch tied voice in step → **RED**
      - Tied voice with same-pitch new attack in step (single-voice TIE signature) → **BLUE**
      - Tied voice with no same-pitch new attack → **GREEN** (REST / polyphonic continuation)
      - Fully-empty step (all voices null OR page null) → full-column **BLUE TINT** at 18% opacity (silent step marker)
    - **Tooltip uses a heuristic for polyphonic TIE** because the data doesn't distinguish it from chord re-attack: when hovering a new-attack cell, if THIS column's full set of new-attack pitches matches the IMMEDIATELY PREVIOUS column's set exactly, tooltip reads `tie` (otherwise pitch name like `C4`). Single-voice TIE's data signature always reads `tie` regardless of context.
    - **Why color stays red but tooltip says "tie":** the data really IS just a chord re-attack — there's no distinct polyphonic-TIE signature to color off of. But the user probably pressed TIE on the JX (or our editor's TIE button) to produce it, AND it does sound musically like a re-articulation. So we acknowledge the user intent in the tooltip while keeping the cell color data-truthful.
    - **Acceptable false positive:** if user intentionally plays the same chord twice in a row (no TIE involved), the tooltip will also say "tie." In practice rare — most music has at least one pitch change between adjacent chords.
    - **Audible difference between single-voice and polyphonic TIE:** single-voice TIE uses 2 voices (tied + new-attack at same pitch) so the held continuation's release tail bleeds into the new attack — smoother re-articulation. Polyphonic TIE uses N voices (all fresh attacks) so every envelope restarts from zero — cleaner chord re-strike. Subtle but real, more apparent on long-release patches (pads, plucks).

23. **Relay-filed lending issues are authored by Daniel's own PAT — GitHub never notifies you of your own activity.** EVERY lending submission (Daniel's or a stranger's from the site) lands as "danielspils opened this issue" and would be silent. `.github/workflows/lending-notify.yml` has the Actions bot @mention Daniel per `community-*` issue — mentions from another actor DO email. Don't remove that workflow without replacing the notification path. Related: the Worker's `GITHUB_TOKEN` secret (fine-grained PAT `jp-patches-lend-relay`, Issues-only) expires ~June 2027 — renew on github.com then `cd relay && npx wrangler secret put GITHUB_TOKEN`.

24. **`sanitizeWavFilename` APPENDS `.wav`** — it's the WAV-export helper. Using it to clean a name for any non-WAV file gives `Name.wav.json`-style double extensions (borrowed packages briefly labeled "Spils Sounds.wav", 2026-06-10). Strip the suffix back off, or extract a base sanitizer if a third caller appears.

25. **A WAV that decodes to nothing real must be REJECTED, never applied or re-routed in a loop.** Two adjacent failure modes, both hit 2026-06-14 from one user's bad WAV. **The exact chain (so it doesn't mislead):** user Dirk sent an **MP3** → Daniel converted it to WAV in Logic, which accidentally **baked in a metronome click** → that *click* broke the decode. A click-free re-export of the same audio decoded fine, so **the MP3→WAV conversion itself was OK — the click was the culprit, not the MP3.** (Lossy re-encoding *can* destroy FSK in general, so the guards + warnings still mention it, but it wasn't the cause here.) Either way the result is the same: extra audio or lossy re-encoding leaves a file that still *sounds* like a tape dump but whose FSK zero-crossing timing is gone, so it decodes as neither a patch bank nor a sequence:
    - **Reroute loop:** `handleTonesDropImport` ⇄ `handleSequenceDropImport` auto-reroute to each other when a decode "looks misrouted" (tones → 32 all-identical patches; sequence → empty pages). A WAV that trips BOTH ping-ponged forever. Guarded by a one-shot `rerouted` flag via `planImportReroute` (renderer/record-flow.js, tested).
    - **Silent clobber:** every path that applies a decode to the **active C/D banks** (`handleBankDropImport`, `doToneSaveFromFile` → `applyToneResult` → `applyWavData`) must first check `decodedToInMemoryBanks(...)` for `null`/`allPatchesIdentical` and reject (`UNREADABLE_WAV_MSG`) BEFORE snapshotting or applying — otherwise junk overwrites the user's banks (the file-dialog path had no safety snapshot at all).
    - **Rule for any NEW import entry point:** gate the filename with `describeUnsupportedImport` (names MP3/MP4/etc.), and before applying-to-banks run the all-default/identical guard. The Record-from-JX capture path is already covered by `isDecodeAllDefault` → recalibrate prompt. Don't add a conditional reroute without a once-only flag.

26. **Record-from-JX "didn't decode cleanly" — troubleshooting playbook.** When a capture fails to decode, get DATA before theorizing (the 2026-06-26 session burned two wrong theories first). 

    **Diagnostic toolkit:**
    - **The failing WAV is on disk** — the renderer writes the trimmed capture to `os.tmpdir()/jp_seq_record_<ts>.wav` (sequences) or `jp_patches_record_<ts>.wav` (tones); it's NOT cleaned up immediately, so grab it right after the failure modal (`find $(node -e 'console.log(require("os").tmpdir())') -name 'jp_*record_*.wav' -mmin -30`).
    - **Per-capture telemetry** in `library.captureLog` (`~/Library/Application Support/jp-patches/library.json`): `{timestamp, gain, capturePeak, decode, populatedPages}`. `gain: null` = auto-decode path; a number = the old calibrated path. **Compare a failing run against a past SUCCESS at the same `capturePeak`** — that isolates signal-quality regressions from level.
    - **Known-good reference**: `~/JP-Patches/tests/fixtures/quiet-unit-seq.wav` decodes to 8 pages. Run the suspect WAV and this fixture through the codec side-by-side.
    - **Analyze via codec internals** (`uv run python` from `~/JP-Patches`): `codec._load_wav_mono_float(path)` (applies the auto-boost) → `_detect_crossings` (returns inter-crossing **intervals in samples**, NOT indices — don't `np.diff` them) → `_demodulate_bits` → `_decode_sequence_records`. A healthy dump shows a **bimodal interval histogram**: a short cluster ~6 samples (bit-0, the high-freq tone) + a long cluster ~25 samples (bit-1 / pilot).

    **Ruled OUT (2026-06-26 — don't re-chase):**
    - **Sample rate** — the on-disk WAV is always 44.1 kHz even when the KT device is at 48 kHz (Chromium resamples during capture). The "prefers 44.1 kHz" warning is real but is NOT the decode culprit; the codec sees clean 44.1 k.
    - **Clipping** — check `clip% = mean(|sample| ≥ 0.99)`. Real failures showed 0%. Clipping is rare and usually decodes anyway (preserves zero-crossings).

    **Leading mechanism — explains "only decodes well below the yellow target":** the crossing detector threshold (`QUIESCENCE_THRESHOLD = 0.15`) is FIXED, but the auto-boost normalizes to the **peak**, which is set by the strong long/bit-1 tone. So a **weak high-freq bit-0 tone** interacts with capture level: a LOUD capture (near the ~0.78 yellow target) → small boost → bit-0 stays below 0.15 → undetected → demod emits **all/mostly 1-bits → "all-null" decode**. A QUIET capture → big boost → bit-0 lifted above 0.15 → decodes. Failure fingerprints: `bits` all/mostly ones, and the interval histogram **missing the short cluster** = bit-0 too weak.

    **Open (unconfirmed as of 2026-06-26):** whether the weak bit-0 is *physical* (KT-cable/contact high-freq rolloff — directional, since Load-to-JX still works fine) or *content* (a denser sequence needs more bit-0s; a near-empty sequence decodes despite the weakness). **Proposed fix direction:** auto-cal should aim LOW, not at a hot peak — or decode-verify during calibration and settle on the level that actually decodes (what the pre-auto-cal two-pass flow effectively did). See pitfalls [#11](boost), [#12](gain-scaled thresholds), [#15](sequence dump duration), [#17](48 kHz advisory).

## When in doubt

- Read the spec doc before designing a new feature.
- Skim recent Releases on GitHub before changing user-visible behavior — the established voice and the established invariants both live there.
- Ask Daniel before making destructive changes (force-push, history rewrite, file deletes).
- Don't touch `panel.svg` for cosmetic-only changes — it's locked.
- Verify visual changes in the running app, not just by file inspection — the SVG injection + JS tagging at runtime can hide subtle issues.
