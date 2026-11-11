// Deploy the DEMO-scale Rulecard world to NEAR testnet from your own funded testnet account.
// Dry run by default: it checks your balance and prints exactly what it will do and what it costs. Add --yes to send.
//
//   node sandbox/deploy-testnet.mjs --account YOU.testnet [--coins 2] [--bots 8] [--bot-near 1.2] [--yes]
//
// Your key: put your account's credentials in a file OUTSIDE the repo, in the near-cli format
//   { "account_id": "YOU.testnet", "private_key": "ed25519:..." }
// at ~/.near-credentials/testnet/YOU.testnet.json (or pass --credentials PATH). This script only reads it; it never
// prints it or writes it anywhere. Keys it creates for the new factory and bot accounts go to sandbox/.keys/testnet.json
// (gitignored), which the bot runner uses: RULECARD_KEYS=sandbox/.keys/testnet.json npm run bots -- --mode demo
import { connect, keyStores, KeyPair, utils, transactions } from 'near-api-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const YES = process.argv.includes('--yes');
const ACCOUNT = arg('account', process.env.RULECARD_TESTNET_ACCOUNT);
const COINS = Number(arg('coins', '2'));
const BOTS = Number(arg('bots', '8'));
const BOT_NEAR = Number(arg('bot-near', '1.2'));
const nodeUrl = process.env.RULECARD_TESTNET_RPC ?? 'https://rpc.testnet.near.org';
const out = join(here, '..', 'contracts', 'out');
const keyFile = join(here, '.keys', 'testnet.json');
const N = n => BigInt(utils.format.parseNearAmount(String(n)));
const TGAS = n => BigInt(n) * 1_000_000_000_000n;
const fmt = y => (Number(BigInt(y) / 10n ** 21n) / 1000).toFixed(3);

if (!ACCOUNT) { console.error('Pass --account YOU.testnet'); process.exit(1); }
const credPath = arg('credentials', join(homedir(), '.near-credentials', 'testnet', `${ACCOUNT}.json`));
const factoryWasm = readFileSync(join(out, 'rulecard_factory_demo.wasm'));
const coinWasm = readFileSync(join(out, 'rulecard_coin_demo.wasm'));

// costs (storage is 1 NEAR per 100 KB)
const FACTORY_NEAR = Math.ceil(((factoryWasm.length + coinWasm.length) / 100_000 + 0.4) * 10) / 10;
const COIN_SEED = 0.1;
const COINS_META = [['Frog Pond', 'FROG', ['PaperTax']], ['Moth Lamp', 'MOTH', ['WarCoin']], ['Zap Cat', 'ZAP', ['Ruthless']]].slice(0, COINS);

const rpc = async (method, params) => { const r = await (await fetch(nodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json(); if (r.error) throw new Error(JSON.stringify(r.error)); return r.result; };
const exists = async id => { try { await rpc('query', { request_type: 'view_account', finality: 'final', account_id: id }); return true; } catch { return false; } };

const acct = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: ACCOUNT });
const factoryId = `demo.${ACCOUNT}`;
const coinDeposit = 5 + COIN_SEED; // the demo factory asks 5 NEAR storage (each coin carries its own code) + the seed
const total = FACTORY_NEAR + COINS * coinDeposit + BOTS * BOT_NEAR + 0.3;

console.log(`\nRulecard testnet deploy (demo scale) ${YES ? '' : '— DRY RUN, nothing is sent'}
  your account      ${ACCOUNT}: ${fmt(acct.amount)} NEAR available
  credentials       ${existsSync(credPath) ? 'found at ' + credPath : 'NOT FOUND at ' + credPath}
  1. create         ${factoryId} with ${FACTORY_NEAR} NEAR, deploy the demo factory and store the demo coin code (one transaction)
  2. create         ${BOTS} bots bot1..bot${BOTS}.${ACCOUNT} with ${BOT_NEAR} NEAR each (= ${(BOTS * BOT_NEAR).toFixed(1)} NEAR)
  3. launch         ${COINS_META.map(c => '$' + c[1]).join(', ')} from ${ACCOUNT}: ${coinDeposit} NEAR each (5 storage + ${COIN_SEED} seed)
  4. write          sandbox/.keys/testnet.json (keys of the new accounts only; gitignored) and print your .env.testnet
  protocol fees go to ${ACCOUNT}. Estimated total ${total.toFixed(1)} NEAR (+ gas).
  To reach L2 (raids), bots must put ~7 NEAR into each coin's curve; they get most of it back by selling.
`);
if (BigInt(acct.amount) < N(total.toFixed(3))) console.log(`  ⚠ not enough NEAR: get about ${(total - Number(fmt(acct.amount))).toFixed(1)} more from the faucet, or use --coins 1 / --bots 5 / --bot-near 0.6\n`);
if (!YES) { console.log('Add --yes to send these transactions.'); process.exit(0); }
if (!existsSync(credPath)) { console.error('No credentials file. See the top of this script.'); process.exit(1); }
if (await exists(factoryId)) { console.error(`${factoryId} already exists. Delete it or deploy from another account.`); process.exit(1); }

const cred = JSON.parse(readFileSync(credPath, 'utf8'));
const ks = new keyStores.InMemoryKeyStore();
await ks.setKey('testnet', ACCOUNT, KeyPair.fromString(cred.private_key ?? cred.secret_key));
const near = await connect({ networkId: 'testnet', nodeUrl, keyStore: ks });
const me = await near.account(ACCOUNT);
const keys = { nodeUrl, networkId: 'testnet', factories: { demo: factoryId }, protocolId: ACCOUNT, accounts: {} };
const save = () => { mkdirSync(dirname(keyFile), { recursive: true }); writeFileSync(keyFile, JSON.stringify(keys, null, 2)); };
async function make(id, amount) {
  const kp = KeyPair.fromRandom('ed25519');
  await me.createAccount(id, kp.getPublicKey(), N(amount));
  await ks.setKey('testnet', id, kp);
  return { accountId: id, secretKey: kp.toString() };
}

console.log(`1. ${factoryId}`);
keys.accounts.factory_demo = await make(factoryId, FACTORY_NEAR); save();
const factory = await near.account(factoryId);
await factory.signAndSendTransaction({ receiverId: factoryId, actions: [
  transactions.deployContract(factoryWasm),
  transactions.functionCall('new', { code_hash: null, protocol: ACCOUNT }, TGAS(50), 0n),
  transactions.functionCall('store_code', new Uint8Array(coinWasm), TGAS(250), 0n),
] });
const params = await factory.viewFunction({ contractId: factoryId, methodName: 'get_params', args: {} });
console.log(`   mode ${params.mode}, code stored ${params.code_stored}, admin ${params.admin}, coin storage ${fmt(params.deploy_deposit)} NEAR`);

console.log(`2. ${BOTS} bots`);
for (let i = 1; i <= BOTS; i++) { keys.accounts[`bot${i}`] = await make(`bot${i}.${ACCOUNT}`, BOT_NEAR); save(); }

console.log('3. coins');
for (const [name, symbol, rules] of COINS_META) {
  await me.functionCall({ contractId: factoryId, methodName: 'create_coin', args: { name, symbol, icon: null, rules }, gas: TGAS(300), attachedDeposit: BigInt(params.deploy_deposit) + N(COIN_SEED) });
  console.log(`   $${symbol} → ${symbol.toLowerCase()}.${factoryId}`);
}
save();
console.log(`\nDone. Put this in .env.testnet:\n  VITE_NETWORK=testnet\n  VITE_FACTORY_DEMO=${factoryId}\nThen: npx vite --mode testnet\nBots: RULECARD_KEYS=sandbox/.keys/testnet.json npm run bots -- --mode demo --every 90`);
