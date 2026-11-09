#!/usr/bin/env bash
# Stop the sandbox and delete its chain state (accounts, contract, coins). Keys in sandbox/.keys go too.
docker rm -f rulecard-sandbox >/dev/null 2>&1; docker volume rm rulecard-sandbox-data >/dev/null 2>&1; rm -rf "$(dirname "$0")/.keys"; echo "sandbox reset"
