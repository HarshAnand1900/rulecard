#!/usr/bin/env bash
# Local NEAR sandbox node in Docker. RPC on http://127.0.0.1:3030 (bound to localhost only).
# State lives in the Docker volume rulecard-sandbox-data; ./sandbox/reset.sh wipes it.
set -euo pipefail
if docker ps --format '{{.Names}}' | grep -qx rulecard-sandbox; then echo "sandbox already running"; exit 0; fi
docker rm -f rulecard-sandbox >/dev/null 2>&1 || true
MSYS_NO_PATHCONV=1 docker run -d --name rulecard-sandbox -p 127.0.0.1:3030:3030 \
  -v rulecard-sandbox-data:/data -v rulecard-sandbox-npm:/root/.npm \
  node:22-trixie bash -c '
    set -e; mkdir -p /opt/sb && cd /opt/sb && npm init -y >/dev/null && npm i near-sandbox@0.3.5 >/dev/null 2>&1
    BIN=$(find /opt/sb/node_modules -name "near-sandbox" -type f -perm -u+x | head -1)
    [ -n "$BIN" ] || { npx near-sandbox --version || true; BIN=$(find / -name "near-sandbox" -type f -perm -u+x 2>/dev/null | grep -v node_modules/.bin | head -1); }
    if [ ! -f /data/config.json ]; then "$BIN" --home /data init; fi
    sed -i "s/\"addr\": \"[0-9.]*:3030\"/\"addr\": \"0.0.0.0:3030\"/" /data/config.json
    exec "$BIN" --home /data run'
echo "waiting for RPC..."
for i in $(seq 1 90); do
  if curl -s -m 2 -X POST http://127.0.0.1:3030 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"status","params":[]}' | grep -q chain_id; then echo "sandbox up"; exit 0; fi
  sleep 2
done
echo "sandbox did not start; logs:"; docker logs --tail 30 rulecard-sandbox; exit 1
