// Deploy the Rulecard contract to the local sandbox and create test accounts.
// Keys are generated here, for the local sandbox only, and written to sandbox/.keys/keys.json (gitignored).
// Usage: node sandbox/deploy.mjs   (sandbox must be running: ./sandbox/start.sh)
import { connect, keyStores, KeyPair, utils } from 'near-api-js';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nodeUrl = 'http://127.0.0.1:3030';
const wasmPath = join(here, '..', 'contract', 'out', 'rulecard.wasm');
const keyFile = join(here, '.keys', 'keys.json');
const PLAYERS = ['you', 'alice', 'bob'];
const BOTS = Array.from({ length: 8 }, (_, i) => `bot${i + 1}`);

if (!existsSync(wasmPath)) throw new Error('build the contract first: contract/out/rulecard.wasm is missing');
const root = JSON.parse(execSync('docker exec rulecard-sandbox cat /data/validator_key.json').toString());
const status = await (await fetch(nodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'status', params: [] }) })).json();
const networkId = status.result.chain_id;

const ks = new keyStores.InMemoryKeyStore();
await ks.setKey(networkId, root.account_id, KeyPair.fromString(root.secret_key ?? root.private_key));
const near = await connect({ networkId, nodeUrl, keyStore: ks });
const rootAcc = await near.account(root.account_id);

const keys = { nodeUrl, networkId, contractId: `rulecard.${root.account_id}`, accounts: {} };
async function make(name, amount) {
  const id = `${name}.${root.account_id}`;
  const kp = KeyPair.fromRandom('ed25519');
  try { await rootAcc.createAccount(id, kp.getPublicKey(), BigInt(utils.format.parseNearAmount(String(amount)))); }
  catch (e) { if (!/already exists|AccountAlreadyExists/i.test(String(e))) throw e; throw new Error(`${id} already exists: run ./sandbox/reset.sh first`); }
  await ks.setKey(networkId, id, kp);
  return { accountId: id, secretKey: kp.toString() };
}

console.log(`sandbox ${networkId}: deploying as ${keys.contractId}`);
const c = await make('rulecard', 100); keys.accounts.contract = c;
const contract = await near.account(c.accountId);
await contract.deployContract(readFileSync(wasmPath));
await contract.functionCall({ contractId: c.accountId, methodName: 'new', args: {}, gas: 100_000_000_000_000n });
for (const p of PLAYERS) keys.accounts[p] = await make(p, 1000);
for (const b of BOTS) keys.accounts[b] = await make(b, 500);

mkdirSync(dirname(keyFile), { recursive: true });
writeFileSync(keyFile, JSON.stringify(keys, null, 2));
console.log(`deployed. ${PLAYERS.length} players + ${BOTS.length} bots. Keys: sandbox/.keys/keys.json (local test keys, gitignored)`);
