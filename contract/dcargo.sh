#!/usr/bin/env bash
# Run cargo for the contract inside a Linux container (Windows Smart App Control blocks Cargo build scripts on the host).
# Usage: ./dcargo.sh test | ./dcargo.sh build --target wasm32-unknown-unknown --release
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$here:/work" -w /work \
  -v rulecard-cargo-registry:/usr/local/cargo/registry \
  -v rulecard-target:/target -e CARGO_TARGET_DIR=/target \
  rulecard-builder bash -c "cargo $*"
