#!/usr/bin/env bash
# Run cargo for a contract crate inside a Linux container (Windows Smart App Control blocks Cargo build scripts on the host).
# Usage: ./contracts/dcargo.sh coin test
#        ./contracts/dcargo.sh coin build --target wasm32-unknown-unknown --release
set -euo pipefail
crate="$1"; shift
here="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$here:/work" -w "/work/$crate" \
  -v rulecard-cargo-registry:/usr/local/cargo/registry \
  -v rulecard-target:/target -e CARGO_TARGET_DIR=/target \
  rulecard-builder bash -c "cargo $*"
