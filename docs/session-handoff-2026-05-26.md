# Session handoff — 2026-05-26 mid-day

**What this document is:** the cold-start snapshot for a fresh Claude
Code session. CLAUDE.md gives you the durable architecture + pitfall
context; THIS doc gives you the in-progress threads + recent design
decisions a new chat would otherwise need to reconstruct by reading
git log.

**Currency note:** updated end of a long 2-day session that shipped
v0.5.13 (capture-pipeline reliability sweep + 6-module refactor).
Past this date, prefer git log + the GitHub Releases page; supersede
this doc whenever its info goes stale.

## TL;DR — where the app is right now

- **Version:** 0.5.13 — published 2026-05-25 evening (release notes:
  [`release-notes-0.5.13.md`](release-notes-0.5.13.md))
- **Lint:** zero errors, zero warnings (`npm run lint`)
- **Tests:** 122/122 passing (`npm test`)
- **CI:** GitHub Actions runs lint + tests on every push to main
- **Editor type-checking:** JSDoc `@param/@returns` on all 17 pure-
  module exports; `jsconfig.json` enables VS Code's TS-LSP checking
- **`app.js`:** ~7,400 lines (down ~700 from session start after the
  refactor + cleanup); 6 pure-logic modules sit alongside

## The 2025-05-25 / 2025-05-26 debug + refactor saga in one paragraph

Daniel hit a long string of "Record-from-JX-3P silent failure" bugs
that took most of a day to root-cause. The fixes laddered: a scope
error (`runningPeak` invisible to `stopRecording` because declared
inside `startRecording`); a latent `recordBtn` ReferenceError; an
`onDeviceChange` handler that tore down in-flight captures on every
spurious Chromium `devicechange`; a recalibrate flow that reset gain
to 1.0× instead of preserving the prior value; a sample-rate-
mismatch theory that turned out to be largely wrong (KT USB Audio
input is locked at 48 kHz; transfers decode fine through Chromium's
resample anyway). Then a 3-agent Tier 1 audit found a `saveLibrary`
silent-failure data-loss risk + 6 IPC handlers that could throw
instead of returning shaped errors + 7 fire-and-forget async sites in
the record modal. Then a 4-step (becoming 5) refactor pulled the
two biggest modal functions apart into testable pure modules
(`record-trim`, `capture-warnings`, `capture-state`, `audio-capture`,
`send-timeline` + existing `calibration-math` + `library-math`),
went from 50 tests to 127 to 122 (cleanup), and shipped a global
error banner + per-capture telemetry as permanent safety scaffolding.
Day capped with ESLint v9 + GitHub Actions CI + JSDoc type
annotations — three independent layers of pre-runtime correctness
checks. Result: v0.5.13 shipped, codebase meaningfully cleaner, the
silent-failure bug class is now detectable at write/lint/CI time
instead of "user trips on it and we guess."

Full bug timeline: read v0.5.13 release notes + the 18 commits
between `d7f71dd` and `444e92b`. Don't try to reconstruct from
memory — the commits are detailed and chronological.

## Open threads (pickup-ready next moves)

### Immediate (~minutes each)

- **README screenshots** — 4 PNGs to drop into `docs/screenshots/`.
  Capture brief at [`docs/screenshots/README.md`](screenshots/README.md).
  Slots wired in `README.md`; broken images render until Daniel
  captures and commits the PNGs. ~5-minute task for Daniel.

- **Bruce's `jx3p` PR** — flagged via spawn_task chip in Daniel's UI.
  Docs-only PR to clarify the REST vs TIE wire encoding (CLAUDE.md
  pitfall #16). Prompt is self-contained: includes the verified test
  sequence, proposed PR title + body + diff, and a multi-pitch test
  to run on Daniel's JX first. Don't include the local quiet-
  recording auto-boost patch (pitfall #11) in the same PR.

### Higher-leverage, queued ("logical next steps" from chat)

In Daniel's stated priority order (from a long discussion late
2026-05-25):

1. ✅ ESLint + `no-undef` — shipped 2026-05-25 (commit `6d4d11d`)
2. ✅ GitHub Actions CI — shipped 2026-05-25 (commit `5437f51`)
3. ✅ JSDoc type annotations on pure modules — shipped 2026-05-25
   (commit `b21d493`)
4. **Apple Developer ID + notarization** — $99/yr + ~1 session. Drops
   the "damaged" Gatekeeper dialog. Biggest user-facing reliability
   win remaining. Not a code change — DevID setup + signing config
   in electron-builder + notarization upload.
5. **Integration tests for modal flows** — JSDOM + tiny harness that
   asserts "modal opens → button click → next modal appears or
   error surfaces." Would have caught today's silent-failure bug
   class at test time, not at "Daniel tries the feature and it
   doesn't work." ~3-4 hours.
6. **AudioWorklet migration** — replace `ScriptProcessor` (deprecated,
   Chromium will eventually remove). Lower latency, off-main-thread.
   Now captured in `future-features.md`.
7. **Library schema versioning + migrations** — `library.json` grew
   organically (8+ piecemeal fields). Add a `version` field + a
   migration list before the next field gets added ad-hoc. ~2 hours.
   Now captured in `future-features.md`.
8. **More `app.js` extractions** — `setupInteraction` (~280 lines,
   untested knob/switch/button wiring), `renderPatchList` family,
   shared modal infrastructure. Same pattern as today's refactors.
   Now captured in `future-features.md`.

### Deferred

- **Step 3e: full capture-lifecycle factory** (`createCaptureSession`
  with `onTick`/`onAutoStop` callbacks) — I deferred this Tuesday
  night. After Steps 1-4 + 3a/3b/3c/3d, the modal's lifecycle is
  already mostly delegated to extracted modules. The remaining
  inline lifecycle is ~12 lines. The bigger version (factory owns
  the raf loop, modal subscribes via callbacks) is ~3 hours of
  meaningful-risk work for modest gain. Worth doing eventually as
  its own focused session, not at the tail of a long day.

## Recent design decisions (verbal calls that don't show in code)

These came up in conversation and Daniel chose explicitly. Worth
preserving so a fresh Claude doesn't propose to undo them.

- **Plain JS only.** No TypeScript, no React/Vue/Svelte. JSDoc
  comments are the type-safety lever (per `jsconfig.json`).
- **Sample-rate warning is advisory, not alarming.** Daniel's KT
  input is locked at 48 kHz and captures work fine; the original
  Roland-red "will fail" warning was reframed amber + advisory after
  empirical testing. Don't restore the alarmist version.
- **TIE cells in the visualizer are Roland blue** (not amber).
  Daniel's call after the initial implementation. Keeps the
  visualizer on the brand triad (red/green/blue, nothing else).
- **REST encoding label is "rest" not "hold" or "hold or rest"** —
  final wording after the REST vs TIE encoding discovery (CLAUDE.md
  pitfall #16). The data-level ambiguity exists but "rest" is the
  dominant single-voice case so it's the most honest label.
- **No Tier 3 (manual smoke test) auto-run.** It's a markdown
  checklist Daniel runs by hand before each release; CI doesn't
  attempt to script Electron flows.
- **Stop verbose acknowledgments of `pkill` SIGTERM
  notifications.** Background-task-exit notifications fire when I
  reboot Electron via `pkill && npm start`; the prior chat had me
  acknowledging each one verbosely, which felt like spam. Going
  forward: ignore silently unless the exit code is unexpected.

## Sequencer-editor design — open questions Daniel hasn't answered

Came up in conversation, never resolved. Capture so we don't re-ask:

1. **In all-view mode, auto-zoom into a page when entering edit
   mode, or stay in all-view?** Affects how the editor looks at
   pages 1-8 vs page 0.
2. **v1 scope: pitch-only edits, or also add/delete steps + toggle
   tied?** The minimal viable editor is "click note → cycle pitch";
   anything more requires per-voice slot handling.
3. **Multi-voice handling: edit one voice at a time, or all voices
   at a step at once?** The JX is 6-voice polyphonic so this matters
   for chord-input flow.

If/when sequencer editor work resumes (parked in
`future-features.md`), surface these to Daniel before designing.

## User working style (from cross-session memory)

- First-time OSS author; vibe-coded with Claude Code; values
  "findings before code on non-trivial tasks"
- Prefers tight, opinionated proposals over open-ended Q&A
- Says "push through" when wanting more decisive execution
- Catches noise/spam from me quickly and tells me to stop —
  respect that signal immediately
- macOS-only for v1 (Apple Silicon arm64 specifically)

## Where today's work lives

- **Code commits:** 18 commits between `d7f71dd` (start of session)
  and `444e92b` (lint cleanup)
- **Release notes:** [`docs/release-notes-0.5.13.md`](release-notes-0.5.13.md)
- **Smoke test:** [`docs/smoke-test.md`](smoke-test.md)
- **Screenshots brief:** [`docs/screenshots/README.md`](screenshots/README.md)
- **CLAUDE.md pitfalls** new entries this session: #16 (REST/TIE),
  #17 (Chromium probe cache), #18 (shadow bug class)
- **future-features.md** new entries this session: AudioWorklet,
  library schema migrations, integration tests, more `app.js`
  extractions, capture-lifecycle factory (3e)

---

## How to use this doc

A fresh Claude reads CLAUDE.md at session start. CLAUDE.md links
here. The reading order I'd recommend for a fresh session:

1. CLAUDE.md (architecture + pitfalls) — required
2. This doc (current state + open threads) — required
3. `docs/release-notes-0.5.13.md` — for the recent-bug context
4. `docs/future-features.md` — when planning next feature work
5. `docs/design-system.md` — before touching any UI
6. `docs/library-and-midi-spec.md` — when working on Library or MIDI
7. `docs/record-from-jx.md` — when working on the capture flow

Skip the rest until needed.
