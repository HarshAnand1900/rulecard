// Deploy the Rulecard factory to the local sandbox, store the coin code in it, and create test accounts.
// Keys are generated here, for the local sandbox only, and written to sandbox/.keys/keys.json (gitignored).
// Usage: ./sandbox/reset.sh && ./sandbox/start.sh && node sandbox/deploy.mjs
import { connect, keyStores, KeyPair, utils, transactions } from 'near-api-js';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nodeUrl = 'http://127.0.0.1:3030';
const out = join(here, '..', 'contracts', 'out');
const factoryWasm = join(out, 'rulecard_factory.wasm');
const coinWasm = join(out, 'rulecard_coin.wasm');
const keyFile = join(here, '.keys', 'keys.json');
const PLAYERS = ['you', 'alice', 'bob'];
const BOTS = Array.from({ length: 12 }, (_, i) => `bot${i + 1}`);
const TGAS = n => BigInt(n) * 1_000_000_000_000n;

for (const f of [factoryWasm, coinWasm]) if (!existsSync(f)) throw new Error(`build the contracts first: ${f} is missing`);
const root = JSON.parse(execSync('docker exec rulecard-sandbox cat /data/validator_key.json').toString());
const status = await (await fetch(nodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'status', params: [] }) })).json();
const networkId = status.result.chain_id;

const ks = new keyStores.InMemoryKeyStore();
await ks.setKey(networkId, root.account_id, KeyPair.fromString(root.secret_key ?? root.private_key));
const near = await connect({ networkId, nodeUrl, keyStore: ks });
const rootAcc = await near.account(root.account_id);

const keys = { nodeUrl, networkId, factoryId: `rulecard.${root.account_id}`, protocolId: `protocol.${root.account_id}`, accounts: {} };
async function make(name, amount) {
  const id = `${name}.${root.account_id}`;
  const kp = KeyPair.fromRandom('ed25519');
  try { await rootAcc.createAccount(id, kp.getPublicKey(), BigInt(utils.format.parseNearAmount(String(amount)))); }
  catch (e) { if (/already exists|AccountAlreadyExists/i.test(String(e))) throw new Error(`${id} already exists: run ./sandbox/reset.sh first`); throw e; }
  await ks.setKey(networkId, id, kp);
  return { accountId: id, secretKey: kp.toString() };
}

console.log(`sandbox ${networkId}: deploying the factory as ${keys.factoryId}`);
keys.accounts.factory = await make('rulecard', 50);
await make('protocol', 5);
const factory = await near.account(keys.factoryId);
// One transaction: deploy, init, store the coin code. Nobody can store different code in between.
await factory.signAndSendTransaction({
  receiverId: keys.factoryId,
  actions: [
    transactions.deployContract(readFileSync(factoryWasm)),
    transactions.functionCall('new', { code_hash: null, protocol: keys.protocolId }, TGAS(50), 0n),
    transactions.functionCall('store_code', new Uint8Array(readFileSync(coinWasm)), TGAS(250), 0n),
  ],
});
for (const p of PLAYERS) keys.accounts[p] = await make(p, 2000);
for (const b of BOTS) keys.accounts[b] = await make(b, 1000);

mkdirSync(dirname(keyFile), { recursive: true });
writeFileSync(keyFile, JSON.stringify(keys, null, 2));
const params = await factory.viewFunction({ contractId: keys.factoryId, methodName: 'get_params', args: {} });
console.log(`deployed. code stored: ${params.code_stored}, admin: ${params.admin}. ${PLAYERS.length} players + ${BOTS.length} bots. Keys: sandbox/.keys/keys.json (local test keys, gitignored)`);
