#!/usr/bin/env bash
# Fetch Trezu's custom-proposal-template engine at the commit pinned in
# integrations/trezu/engine.lock.json into a temp dir OUTSIDE the repo, verify every sha256,
# and install its five MIT dependencies (exact versions, no lifecycle scripts).
# Trezu has no license file, so its source is never copied into this repository.
# Usage: bash scripts/trezu/fetch-engine.sh   (prints the engine dir; TREZU_ENGINE_DIR overrides it)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCK="$ROOT/integrations/trezu/engine.lock.json"
COMMIT="$(node -e 'console.log(require(process.argv[1]).commit)' "$LOCK")"
DIR="${TREZU_ENGINE_DIR:-$(node -e 'console.log(require("os").tmpdir())')/commonkit-trezu-engine-${COMMIT:0:7}}"
case "$DIR" in "$ROOT"/*) echo "refusing to place third-party code inside the repo: $DIR" >&2; exit 1 ;; esac
mkdir -p "$DIR"
node -e 'for (const [f, h] of Object.entries(require(process.argv[1]).files)) console.log(f, h)' "$LOCK" |
  while read -r file sha; do
    mkdir -p "$DIR/$(dirname "$file")"
    if [ ! -f "$DIR/$file" ] || [ "$(shasum -a 256 "$DIR/$file" | cut -d' ' -f1)" != "$sha" ]; then
      curl -fsSL "https://raw.githubusercontent.com/NEAR-DevHub/trezu/$COMMIT/$file" -o "$DIR/$file"
    fi
    got="$(shasum -a 256 "$DIR/$file" | cut -d' ' -f1)"
    [ "$got" = "$sha" ] || { echo "sha256 mismatch for $file: $got" >&2; exit 1; }
  done
node -e '
  const lock = require(process.argv[1]);
  const fs = require("fs");
  fs.writeFileSync(process.argv[2] + "/package.json", JSON.stringify({ private: true, type: "module", dependencies: lock.dependencies }, null, 2));
  fs.writeFileSync(process.argv[2] + "/tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["nt-fe/*"] } } }, null, 2));
' "$LOCK" "$DIR"
if [ ! -d "$DIR/node_modules/zod" ]; then
  (cd "$DIR" && npm install --ignore-scripts --no-audit --no-fund --no-package-lock --loglevel=error >/dev/null)
fi
echo "$DIR"
