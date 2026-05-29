#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# JP Patches — release automation script
#
# Usage:  ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.6.1
#
# What it does (in order):
#   1. Pre-flight checks — tooling installed, working tree clean,
#      on main branch, up to date with origin, release notes exist
#   2. Bumps package.json version
#   3. Bumps CLAUDE.md "Current version" Status line + date
#   4. Runs the test suite (must pass)
#   5. Builds the signed + notarized DMG (electron-builder)
#   6. Asks for confirmation before any destructive step
#   7. Commits the version bump
#   8. Tags + pushes (both main and the tag)
#   9. Creates the GitHub release with notes + DMG attached
#
# What it does NOT do (manual steps remain — see docs/RELEASE.md):
#   - Writing the release notes (must exist before running this)
#   - Running the smoke test (docs/smoke-test.md)
#   - Installing the DMG to verify Gatekeeper bypass works
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Parse + validate args ────────────────────────────────────────
VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 0.6.1"
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ Version must be in semver format (e.g. 0.6.1)."
  echo "   Got: '$VERSION'"
  exit 1
fi

# ─── Locate the repo + cd to root ─────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

NOTES_FILE="docs/release-notes-$VERSION.md"
DMG_FILE="dist/JP Patches-$VERSION.dmg"
BLOCKMAP_FILE="dist/JP Patches-$VERSION.dmg.blockmap"

echo "═══ JP Patches release: v$VERSION ═══"
echo "Repo:        $REPO_ROOT"
echo "Notes:       $NOTES_FILE"
echo "DMG output:  $DMG_FILE"
echo ""

# ─── Pre-flight checks ────────────────────────────────────────────

echo "── Pre-flight checks ──"

# 1. Required tools
for tool in git gh npm; do
  if ! command -v "$tool" &>/dev/null; then
    echo "❌ Missing required tool: $tool"
    exit 1
  fi
done
echo "✓ git, gh, npm present"

# 2. gh CLI authenticated
if ! gh auth status &>/dev/null; then
  echo "❌ gh CLI not authenticated. Run: gh auth login"
  exit 1
fi
echo "✓ gh authenticated"

# 3. On main branch
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "❌ Not on main branch (currently on '$CURRENT_BRANCH'). Releases go from main."
  exit 1
fi
echo "✓ on main"

# 4. Working tree clean
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree has uncommitted changes. Commit or stash first."
  git status --short
  exit 1
fi
echo "✓ working tree clean"

# 5. Up to date with origin
git fetch origin main --quiet
LOCAL_SHA="$(git rev-parse main)"
REMOTE_SHA="$(git rev-parse origin/main)"
if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
  echo "❌ Local main is not in sync with origin/main."
  echo "   Local:  $LOCAL_SHA"
  echo "   Remote: $REMOTE_SHA"
  echo "   Run: git pull --rebase origin main"
  exit 1
fi
echo "✓ in sync with origin/main"

# 6. Release notes exist
if [[ ! -f "$NOTES_FILE" ]]; then
  echo "❌ Release notes not found: $NOTES_FILE"
  echo "   Create this file before running release.sh."
  echo "   See docs/release-notes-0.6.0.md for the template."
  exit 1
fi
echo "✓ release notes present: $NOTES_FILE"

# 7. Tag doesn't already exist
if git rev-parse "v$VERSION" &>/dev/null; then
  echo "❌ Tag v$VERSION already exists. Pick a different version."
  exit 1
fi
echo "✓ tag v$VERSION is available"

# 8. Signing + notarization prerequisites
if [[ ! -f .env ]]; then
  echo "❌ .env not found. Copy .env.example to .env and fill in"
  echo "   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID."
  exit 1
fi
# Load Apple credentials for electron-builder's notarize step.
set -a
# shellcheck disable=SC1091
source .env
set +a
for var in APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do
  if [[ -z "${!var:-}" ]]; then
    echo "❌ $var is not set in .env"
    exit 1
  fi
done
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
  echo "❌ No 'Developer ID Application' certificate in your keychain."
  echo "   Create one at developer.apple.com → Certificates, then double-click the .cer."
  exit 1
fi
echo "✓ signing cert + notarization credentials present"

echo ""

# ─── Update version in source files ───────────────────────────────

CURRENT_VERSION="$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')"
echo "── Bumping version: $CURRENT_VERSION → $VERSION ──"

# package.json
sed -i.bak "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$VERSION\"/" package.json
rm package.json.bak
echo "✓ package.json"

# CLAUDE.md — Status line: "Current version: **X.Y.Z** (Month DD, YYYY)."
TODAY="$(date '+%B %-d, %Y')"
sed -i.bak "s/Current version: \*\*[0-9][0-9.]*\*\* ([^)]*)/Current version: **$VERSION** ($TODAY)/" CLAUDE.md
rm CLAUDE.md.bak
echo "✓ CLAUDE.md Status line (date: $TODAY)"

echo ""

# ─── Run tests ────────────────────────────────────────────────────

echo "── Running tests ──"
if ! npm test --silent; then
  echo "❌ Tests failed. Aborting release."
  # Restore version bumps
  git checkout -- package.json CLAUDE.md
  exit 1
fi
echo "✓ tests pass"
echo ""

# ─── Build DMG ────────────────────────────────────────────────────

echo "── Building signed + notarized DMG (this takes a few minutes — uploads to Apple) ──"
if ! npm run dist --silent; then
  echo "❌ DMG build failed. Aborting release."
  git checkout -- package.json CLAUDE.md
  exit 1
fi

if [[ ! -f "$DMG_FILE" ]]; then
  echo "❌ Expected DMG not found at: $DMG_FILE"
  git checkout -- package.json CLAUDE.md
  exit 1
fi
echo "✓ DMG built: $DMG_FILE ($(du -h "$DMG_FILE" | cut -f1))"
echo ""

# ─── Confirmation gate ───────────────────────────────────────────

RELEASE_TITLE="$(head -1 "$NOTES_FILE" | sed 's/^# //')"

echo "═══ Ready to ship v$VERSION ═══"
echo ""
echo "About to:"
echo "  1. Commit version bump  (package.json + CLAUDE.md)"
echo "  2. git push origin main"
echo "  3. Create + push tag v$VERSION"
echo "  4. Create GitHub release '$RELEASE_TITLE'"
echo "  5. Upload DMG + blockmap to the release"
echo ""
read -p "Proceed? [y/N] " -n 1 -r
echo ""
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  echo "Aborted. Reverting version bump."
  git checkout -- package.json CLAUDE.md
  exit 0
fi

# ─── Commit + tag + push ─────────────────────────────────────────

echo ""
echo "── Committing version bump ──"
git add package.json CLAUDE.md
git commit -m "chore: cut v$VERSION

Co-Authored-By: release.sh <noreply@anthropic.com>"
echo "✓ committed"

echo "── Pushing to origin/main ──"
git push origin main
echo "✓ pushed"

echo "── Tagging v$VERSION ──"
git tag "v$VERSION"
git push origin "v$VERSION"
echo "✓ tagged + pushed"

# ─── GitHub release ───────────────────────────────────────────────

echo "── Creating GitHub release ──"
gh release create "v$VERSION" \
  --title "$RELEASE_TITLE" \
  --notes-file "$NOTES_FILE" \
  --latest
echo "✓ release created"

echo "── Uploading DMG + blockmap ──"
gh release upload "v$VERSION" "$DMG_FILE" "$BLOCKMAP_FILE"
echo "✓ assets uploaded"

# ─── Done ─────────────────────────────────────────────────────────

RELEASE_URL="$(gh release view "v$VERSION" --json url -q .url)"

echo ""
echo "═══ v$VERSION SHIPPED ═══"
echo "Release URL: $RELEASE_URL"
echo ""
echo "Don't forget:"
echo "  - Walk through docs/smoke-test.md if you haven't"
echo "  - Open the DMG, drag to Applications, right-click → Open"
echo "  - Announce in JX-3P Facebook group if it's a notable release"
