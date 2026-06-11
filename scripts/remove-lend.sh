#!/usr/bin/env bash
# Take a lending-library entry down from the catalog (post-moderation
# companion to the auto-publish workflow). Removes the payload file +
# its YAML entry, runs the catalog consistency test, commits, pushes.
#
# Usage: ./scripts/remove-lend.sh <entry-id>
set -euo pipefail
cd "$(dirname "$0")/.."

ID="${1:?usage: remove-lend.sh <entry-id>}"

FILE=$(ls docs/library/patches/"$ID".json docs/library/sequences/"$ID".json 2>/dev/null | head -1 || true)
[ -n "$FILE" ] || { echo "no payload file for id '$ID'"; exit 1; }
case "$FILE" in
  *patches*)   YAML=docs/_data/patches.yml ;;
  *sequences*) YAML=docs/_data/sequences.yml ;;
esac

# Drop the entry block (from "- id: <ID>" up to the next "- id:" or EOF).
python3 - "$YAML" "$ID" <<'PY'
import re, sys
path, eid = sys.argv[1], sys.argv[2]
s = open(path).read()
pattern = re.compile(rf"\n?- id: {re.escape(eid)}\n(?:  .*\n?)*", re.M)
new, n = pattern.subn("", s)
assert n == 1, f"expected exactly 1 YAML entry for {eid}, found {n}"
open(path, "w").write(new)
PY

rm "$FILE"
node --test test/community-catalog.test.js > /dev/null
git add "$YAML" "$FILE"
git commit -m "catalog: remove lending entry '$ID' (takedown)"
git push
echo "removed '$ID' — site updates in ~1-2 min (hearts/borrow counts in KV are left as-is)"
