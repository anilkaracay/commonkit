#!/usr/bin/env bash
# Read-only, keyless verification of every on-chain claim in deployments/testnet.json (TEST_PLAN §6).
# Needs no keys and sends no transactions. Exits non-zero on any ❌.
#   ./scripts/verify.sh [--allow-pending]
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "installing script dependencies (pnpm install)…" >&2
  (cd .. && pnpm install --frozen-lockfile >/dev/null)
fi
exec ./node_modules/.bin/tsx verify.ts "$@"
