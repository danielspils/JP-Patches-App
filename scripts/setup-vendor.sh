#!/usr/bin/env bash
# Populate vendor/ for `npm run dist`:
#   - vendor/uv/uv         (uv binary, macOS arm64)
#   - vendor/jx3p/         (Bruce Oberg's jx3p Python project, copied from ~/JP-Patches)
#
# Both are gitignored so the repo stays small. Run this once after
# `git clone` (or whenever you want to refresh to the latest upstream).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor"
JX3P_SRC="${JX3P_SRC:-$HOME/JP-Patches}"

if [ ! -d "$JX3P_SRC" ]; then
  echo "ERROR: $JX3P_SRC not found. Clone bruceoberg/jx-3p-patches there first," \
       "or set JX3P_SRC=/path/to/your/clone." >&2
  exit 1
fi

mkdir -p "$VENDOR/uv"

if [ ! -x "$VENDOR/uv/uv" ]; then
  echo "Downloading uv (macOS arm64)..."
  curl -fsSL "https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-apple-darwin.tar.gz" \
    | tar -xzf - -C "$VENDOR/uv" --strip-components=1
fi

echo "Copying jx3p source from $JX3P_SRC ..."
rm -rf "$VENDOR/jx3p"
rsync -a \
  --exclude='.git' --exclude='.venv' --exclude='__pycache__' \
  --exclude='*.pyc' --exclude='.pytest_cache' --exclude='.mypy_cache' \
  --exclude='node_modules' \
  "$JX3P_SRC/" "$VENDOR/jx3p/"

echo "vendor/ ready:"
du -sh "$VENDOR/uv" "$VENDOR/jx3p"
