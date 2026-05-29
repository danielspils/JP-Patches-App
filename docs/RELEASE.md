# How to ship a JP Patches release

The whole release dance is mostly automated by [`scripts/release.sh`](../scripts/release.sh). You only have to do three things by hand:

1. Write the release notes (the script can't make these up — they need your voice)
2. Walk through the [smoke test](smoke-test.md) (the script can't QA the app)
3. Verify the DMG installs from the GitHub release page (catches DMG corruption)

The script handles everything else: version bumps, tests, DMG build, git tag, GitHub release, asset upload.

---

## Quick reference

```bash
# 1. Write release notes for the new version (your judgment)
$EDITOR docs/release-notes-X.Y.Z.md

# 2. Smoke test (in the running dev app — your judgment)
npm start    # walk through docs/smoke-test.md

# 3. Ship it
./scripts/release.sh X.Y.Z
```

The script asks for confirmation before it touches `main` or creates the GitHub release. Safe to run as a dry-rehearsal — say `n` at the prompt and it rolls back the local version bump.

---

## Step 1 — Write the release notes

Create `docs/release-notes-X.Y.Z.md`. The format is established — copy the most recent existing file and adapt:

```markdown
# vX.Y.Z — One-line theme of this release

Opening paragraph: what this release is about, ~2-3 sentences.

## What's improved

### Feature group 1
- bullet points
- focused on user-visible changes

### Feature group 2
- ...

## Internal changes

Things developers/contributors care about (refactors, tests, etc.).

## Known issues

(omit this section if there aren't any.)

## Install

Standard install paragraph + macOS Gatekeeper note. Copy from the
previous release notes — this part doesn't change between releases.
```

The H1 (first line) becomes the GitHub release title automatically. Write it well.

## Step 2 — Smoke test

Open the app via `npm start` (NOT the just-built DMG — that's the next step). Walk through [`docs/smoke-test.md`](smoke-test.md). Mark each row ✅ / ❌ / ⏭️. If anything's ❌, fix it BEFORE running `release.sh`.

The smoke test takes ~15 minutes if nothing regresses, longer if something does. Don't skip — this is the only catch-all between you and shipping broken software.

## Step 3 — Run the script

```bash
./scripts/release.sh 0.6.1
```

The script will:

1. Pre-flight: tooling installed, on `main`, working tree clean, in sync with origin, release notes exist, tag doesn't already exist
2. Bump `package.json` version
3. Bump `CLAUDE.md` "Current version" Status line + today's date
4. Run `npm test` (aborts if any test fails)
5. Build the DMG via `npm run dist:unsigned` (takes ~2 minutes)
6. **Prompt for confirmation** — last chance to bail
7. Commit + push the version bump
8. Tag + push `vX.Y.Z`
9. Create the GitHub release with notes file as body
10. Upload DMG + blockmap to the release
11. Print the release URL

If anything fails before the confirmation prompt, the script rolls back the version bump and exits cleanly. After the confirmation prompt, errors are not auto-recoverable — see Recovery below.

## Step 4 — Post-release verification

After `release.sh` finishes, do this in a fresh browser:

1. Open the release URL the script printed
2. Click the DMG to download it
3. Open the DMG, drag JP Patches to Applications
4. Right-click → Open → Open (Gatekeeper bypass)
5. App launches, panel renders, seeded library appears

If any step fails: the DMG is corrupted or there's a packaging regression. See Recovery below.

If you're announcing the release somewhere (Facebook group, etc.), now's the time.

---

## What does NOT need updating per release

The site (`jx-3p.com`) auto-updates — all download buttons point at `https://github.com/danielspils/JP-Patches-App/releases/latest` which redirects to whatever the newest release is. No site changes needed per release.

---

## Recovery

### Tests failed during the script
Fix the tests, re-run the script.

### DMG build failed during the script
Usually a dependency issue. Try `npm install` and re-run.

### Pushed the tag, then realized something's wrong
```bash
# Delete the bad tag locally + on remote
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z

# Delete the GitHub release (and its assets)
gh release delete vX.Y.Z --yes

# Revert the version-bump commit
git revert HEAD
git push origin main

# Now you're back to pre-release state. Fix the issue, try again.
```

### Released the wrong DMG
```bash
gh release upload vX.Y.Z "dist/JP Patches-X.Y.Z.dmg" --clobber
gh release upload vX.Y.Z "dist/JP Patches-X.Y.Z.dmg.blockmap" --clobber
```

### Wrote bad release notes
```bash
# Edit docs/release-notes-X.Y.Z.md, then:
gh release edit vX.Y.Z --notes-file docs/release-notes-X.Y.Z.md
```
