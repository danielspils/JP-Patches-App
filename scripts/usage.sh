#!/usr/bin/env bash
#
# usage.sh — JP Patches download / active-usage stats from GitHub Releases.
#
# GitHub tracks a `download_count` per release asset (it's in the API, not
# shown in the web UI). This summarizes the two useful signals:
#
#   1. Per-release .dmg downloads + a grand total — rough "manual installs."
#      Spot adoption spikes (a shared link, a forum post) by the per-release
#      column. NOTE: newer releases read LOW not because interest dropped but
#      because auto-update (v0.6.2+) pulls the .zip silently — existing users
#      never re-download the .dmg. So .dmg counts under-represent the active
#      base for recent releases.
#
#   2. `latest-mac.yml` on the NEWEST release — the active-usage proxy. Every
#      installed app fetches this file on launch to check for updates, so its
#      count ≈ how many installs launched + phoned home. It resets each
#      release, so note the value right before each `release.sh` run to build
#      a trend over time.
#
# Downloads != unique people (multiple Macs / re-downloads / bots all count;
# GitHub gives no dedup). For site interest use GoatCounter (jx-3p.com).
#
# Usage:  ./scripts/usage.sh        (or: npm run stats)
# Requires: gh (authenticated), jq.

set -euo pipefail

REPO="danielspils/JP-Patches-App"

command -v gh >/dev/null 2>&1 || { echo "✗ gh CLI not found — brew install gh"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "✗ jq not found — brew install jq"; exit 1; }

JSON="$(gh api "repos/$REPO/releases" --paginate)"

echo "JP Patches — download stats   ($REPO)"
echo "─────────────────────────────────────────────"

echo "Per-release .dmg downloads (newest first):"
echo "$JSON" | jq -r '
  sort_by(.created_at) | reverse | .[]
  | .tag_name as $t
  | .assets[] | select(.name | endswith(".dmg"))
  | "  \($t)\t\(.download_count)"
' | column -t -s "$(printf '\t')"

TOTAL_DMG="$(echo "$JSON" | jq '[ .[].assets[] | select(.name | endswith(".dmg")) | .download_count ] | add // 0')"
echo "─────────────────────────────────────────────"
printf "  TOTAL .dmg downloads (all releases): %s\n" "$TOTAL_DMG"
echo

# Active-usage proxy: latest-mac.yml on the most-recent release.
LATEST_TAG="$(echo "$JSON" | jq -r 'sort_by(.created_at) | last | .tag_name')"
YML="$(echo "$JSON" | jq -r --arg t "$LATEST_TAG" '
  .[] | select(.tag_name == $t) | .assets[]
  | select(.name == "latest-mac.yml") | .download_count')"
echo "Active-usage proxy"
printf "  latest-mac.yml on %s: %s update checks\n" "$LATEST_TAG" "${YML:-n/a (no auto-update asset)}"
echo "  (each installed app fetches this on launch — note it before each release"
echo "   to track active installs over time.)"
