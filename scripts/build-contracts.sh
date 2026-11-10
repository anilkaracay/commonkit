#!/usr/bin/env bash
# Build both contracts with cargo-near. Output: contracts/target/near/commonkit_{asset,commons}/*.wasm
#
#   bash scripts/build-contracts.sh                              # default: host build (non-reproducible-wasm)
#   BUILD_MODE=reproducible-wasm bash scripts/build-contracts.sh # Docker build in the pinned image
#
# The deployed testnet code is the host build (rustc 1.98.1, cargo-near 0.23.0). The Docker
# reproducible build (image pinned by digest in contracts/*/Cargo.toml) needs Docker and a clean,
# committed git tree, and yields different hashes from the deployed code (D-218).
set -euo pipefail
cd "$(dirname "$0")/../contracts"
MODE="${BUILD_MODE:-non-reproducible-wasm}"
for c in asset commons; do
  echo "==> cargo near build $MODE ($c)"
  (cd "$c" && cargo near build "$MODE" --locked 2>/dev/null || cargo near build "$MODE")
done
