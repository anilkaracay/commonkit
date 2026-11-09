#!/usr/bin/env bash
# Build both contracts with cargo-near. Output: contracts/target/near/{asset,commons}/*.wasm
set -euo pipefail
cd "$(dirname "$0")/../contracts"
MODE="${BUILD_MODE:-non-reproducible-wasm}"   # set BUILD_MODE=reproducible-wasm when Docker is available
for c in asset commons; do
  echo "==> cargo near build $MODE ($c)"
  (cd "$c" && cargo near build "$MODE" --locked 2>/dev/null || cargo near build "$MODE")
done
