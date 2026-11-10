#!/usr/bin/env bash
# COMMONKIT simulation: the whole upkeep loop on your machine — no keys, no testnet, no hardware.
#
#   ./scripts/simulate.sh                 list the 12 profiles
#   ./scripts/simulate.sh washer          one profile on a local NEAR sandbox (real contracts + Sputnik DAO)
#   ./scripts/simulate.sh all             all 12, then a table
#   ./scripts/simulate.sh washer --fake   without a sandbox binary: in-memory fake chains (contracts not exercised)
#
# Everything it does is SIMULATED (private sandbox chain, simulated/emulated devices). D-420.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSX="$ROOT/scripts/node_modules/.bin/tsx"
if [ ! -x "$TSX" ]; then
  echo "dependencies missing: run 'pnpm install' in $ROOT first" >&2
  exit 2
fi
exec "$TSX" "$ROOT/scripts/simulate/main.ts" "$@"
