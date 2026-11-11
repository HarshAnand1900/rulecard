#!/usr/bin/env bash
# Build the coin and factory contracts at both scales into contracts/out/:
#   rulecard_{coin,factory}_real.wasm  (mainnet-sized numbers)
#   rulecard_{coin,factory}_demo.wasm  (game NEAR ÷100, time ÷12: a full game fits in testnet NEAR and minutes)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
mkdir -p "$(dirname "$0")/out"
for c in coin factory; do
  for m in real demo; do
    f=""; [ "$m" = demo ] && f="--features demo"
    bash "$(dirname "$0")/dcargo.sh" "$c" near build non-reproducible-wasm --no-abi $f
    MSYS_NO_PATHCONV=1 docker run --rm -v rulecard-target:/target -v "$here:/out" rulecard-builder bash -c "cp /target/near/rulecard_$c.wasm /out/out/rulecard_${c}_$m.wasm"
  done
done
ls -la "$(dirname "$0")/out"
