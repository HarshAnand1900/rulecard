// Deploy the DEMO-scale Rulecard world to NEAR testnet from your own funded testnet account.
// Dry run by default: it checks your balance and prints exactly what it will do and what it costs. Add --yes to send.
//
//   node sandbox/deploy-testnet.mjs --account YOU.testnet [--coins 2] [--bots 8] [--bot-near 1.2] [--factory-name demo2] [--reuse-bots] [--yes]
//
// A redeploy (new contract code) needs a new factory name, because the old factory has no key left to change it. --reuse-bots keeps the
// bots you already have (their keys stay in sandbox/.keys/testnet.json, the old file is copied to testnet.json.bak first) and only
// creates the missing ones, so a redeploy costs the factory and the coins, not 16 new bots.
//
// Your key: put your account's credentials in a file OUTSIDE the repo, in the near-cli format
//   { "account_id": "YOU.testnet", "private_key": "ed25519:..." }
// at ~/.near-credentials/testnet/YOU.testnet.json (or pass --credentials PATH). This script only reads it; it never
// prints it or writes it anywhere. Keys it creates for the new factory and bot accounts go to sandbox/.keys/testnet.json
// (gitignored), which the bot runner uses: RULECARD_KEYS=sandbox/.keys/testnet.json npm run bots -- --mode demo
import { connect, keyStores, KeyPair, utils, transactions } from 'near-api-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const YES = process.argv.includes('--yes');
const REUSE = process.argv.includes('--reuse-bots');
const BOT_OFFSET = Number(arg('bot-offset', '0')); // new bots are named bot{1+offset}.. when earlier ones exist and their keys are gone
const TOPUP_TO = Number(arg('topup-to', '0')); // bring each kept bot up to this many NEAR (sends only the difference)
const TOPUP = Number(arg('topup', '0')); // NEAR sent to each kept bot (3 coins need more than 2)
const FACTORY_NAME = arg('factory-name', 'demo');
const ACCOUNT = arg('account', process.env.RULECARD_TESTNET_ACCOUNT);
const COINS = Number(arg('coins', '2'));
const BOTS = Number(arg('bots', '16')); // L2 needs 15 qualified wallets checking in within the window
const BOT_NEAR = Number(arg('bot-near', '1.3')); // two coins × 0.59 NEAR of buys each, plus gas for days of judging
const nodeUrl = process.env.RULECARD_TESTNET_RPC ?? 'https://test.rpc.fastnear.com';
const out = join(here, '..', 'contracts', 'out');
const keyFile = join(here, '.keys', 'testnet.json');
const N = n => BigInt(utils.format.parseNearAmount(String(n)));
const TGAS = n => BigInt(n) * 1_000_000_000_000n;
const fmt = y => (Number(BigInt(y) / 10n ** 21n) / 1000).toFixed(3);

if (!ACCOUNT) { console.error('Pass --account YOU.testnet'); process.exit(1); }
const credPath = arg('credentials', join(homedir(), '.near-credentials', 'testnet', `${ACCOUNT}.json`));
// refuse to ship a build that is older than its source: rebuild with `npm run contracts:build` first
import { statSync, readdirSync } from 'node:fs';
const newest = d => Math.max(...readdirSync(d).filter(f => f.endsWith('.rs')).map(f => statSync(join(d, f)).mtimeMs));
for (const [w, src] of [['rulecard_coin_demo.wasm', join(here, '..', 'contracts', 'coin', 'src')], ['rulecard_factory_demo.wasm', join(here, '..', 'contracts', 'factory', 'src')]]) {
  if (statSync(join(out, w)).mtimeMs < newest(src)) { console.error(`${w} is older than the source in ${src}: run npm run contracts:build first`); process.exit(1); }
}
const factoryWasm = readFileSync(join(out, 'rulecard_factory_demo.wasm'));
const coinWasm = readFileSync(join(out, 'rulecard_coin_demo.wasm'));

// costs (storage is 1 NEAR per 100 KB)
const FACTORY_NEAR = Math.ceil(((factoryWasm.length + coinWasm.length) / 100_000 + 0.4) * 10) / 10;
const COIN_SEED = 0.1;
const COINS_META = [['Frog Pond', 'FROG', ['PaperTax']], ['Moth Lamp', 'MOTH', ['WarCoin']], ['Zap Cat', 'ZAP', ['Ruthless']]].slice(0, COINS);

const rpc = async (method, params) => { const r = await (await fetch(nodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json(); if (r.error) throw new Error(JSON.stringify(r.error)); return r.result; };
const exists = async id => { try { await rpc('query', { request_type: 'view_account', finality: 'final', account_id: id }); return true; } catch { return false; } };

const acct = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: ACCOUNT });
const factoryId = `${FACTORY_NAME}.${ACCOUNT}`;
const old = REUSE && existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, 'utf8')) : null;
const reusable = old ? Object.keys(old.accounts ?? {}).filter(k => /^bot\d+$/.test(k)) : [];
const newBots = Math.max(0, BOTS - reusable.length);
const coinDeposit = 7 + COIN_SEED; // the full factory asks 7 NEAR storage (each coin carries its own code) + the seed
const keptBots = Math.min(BOTS, reusable.length);
const balOf = async id => { try { return BigInt((await rpc('query', { request_type: 'view_account', finality: 'final', account_id: id })).amount); } catch { return 0n; } };
const topups = {}; // bot name -> NEAR to send
for (const k of reusable.slice(0, BOTS)) {
  const id = old.accounts[k].accountId;
  const want = TOPUP_TO > 0 ? Math.max(0, TOPUP_TO - Number(await balOf(id) / 10n ** 21n) / 1000) : TOPUP;
  if (want > 0.005) topups[k] = Number(want.toFixed(3));
}
const topupTotal = Object.values(topups).reduce((a, b) => a + b, 0);
const total = FACTORY_NEAR + COINS * coinDeposit + newBots * BOT_NEAR + topupTotal + 0.3;

console.log(`\nRulecard testnet deploy (demo scale) ${YES ? '' : '— DRY RUN, nothing is sent'}
  your account      ${ACCOUNT}: ${fmt(acct.amount)} NEAR available
  credentials       ${existsSync(credPath) ? 'found at ' + credPath : 'NOT FOUND at ' + credPath}
  1. create         ${factoryId} with ${FACTORY_NEAR} NEAR, deploy the demo factory, store the demo coin code and delete its key (one transaction)
  2. bots           ${REUSE ? `keep ${Math.min(BOTS, reusable.length)} existing bots, create ${newBots} new` : `create ${BOTS} bots bot${1 + BOT_OFFSET}..bot${BOTS + BOT_OFFSET}.${ACCOUNT}`} with ${BOT_NEAR} NEAR each (= ${(newBots * BOT_NEAR).toFixed(1)} NEAR)${topupTotal ? `, and top up ${Object.keys(topups).length} of them${TOPUP_TO ? ` to ${TOPUP_TO} NEAR each` : ` by ${TOPUP} each`} (= ${topupTotal.toFixed(2)} NEAR)` : ''}
  3. launch         ${COINS_META.map(c => '$' + c[1]).join(', ')} from ${ACCOUNT}: ${coinDeposit} NEAR each (5 storage + ${COIN_SEED} seed)
  4. write          sandbox/.keys/testnet.json (keys of the new accounts only; gitignored) and print your .env.testnet
  protocol fees go to ${ACCOUNT}. Estimated total ${total.toFixed(1)} NEAR (+ gas).
  To reach L2 (raids), each coin needs 15 qualified wallets checking in within 2h, ~6.25 NEAR in its curve and ~9 NEAR of volume.
  Bots supply all three (they get most of the NEAR back by selling).
`);
if (BigInt(acct.amount) < N(total.toFixed(3))) console.log(`  ⚠ not enough NEAR: get about ${(total - Number(fmt(acct.amount))).toFixed(1)} more from the faucet, or use --coins 1 / --bots 5 / --bot-near 0.6\n`);
if (!YES) { console.log('Add --yes to send these transactions.'); process.exit(0); }
if (!existsSync(credPath)) { console.error('No credentials file. See the top of this script.'); process.exit(1); }
if (!process.argv.includes("--resume") && await exists(factoryId)) { console.error(`${factoryId} already exists. Delete it, deploy from another account, or add --resume to finish a half-done deploy.`); process.exit(1); }

const cred = JSON.parse(readFileSync(credPath, 'utf8'));
const ks = new keyStores.InMemoryKeyStore();
await ks.setKey('testnet', ACCOUNT, KeyPair.fromString(cred.private_key ?? cred.secret_key));
const near = await connect({ networkId: 'testnet', nodeUrl, keyStore: ks });
const me = await near.account(ACCOUNT);
if (old) copyFileSync(keyFile, keyFile + '.bak');
const keys = { nodeUrl, networkId: 'testnet', factories: { demo: factoryId }, protocolId: ACCOUNT, accounts: old ? { ...old.accounts } : {} };
const save = () => { mkdirSync(dirname(keyFile), { recursive: true }); writeFileSync(keyFile, JSON.stringify(keys, null, 2)); };
async function make(id, amount) {
  const kp = KeyPair.fromRandom('ed25519');
  await me.createAccount(id, kp.getPublicKey(), N(amount));
  await ks.setKey('testnet', id, kp);
  return { accountId: id, secretKey: kp.toString() };
}

console.log(`1. ${factoryId}`);
let factory = await near.account(factoryId);
let resumed = false;
if (await exists(factoryId)) {
  // a previous run already created this factory: resume only if it is the finished, keyless kind
  const left0 = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: factoryId });
  const p0 = await factory.viewFunction({ contractId: factoryId, methodName: 'get_params', args: {} }).catch(() => null);
  if (left0.keys.length !== 0 || !p0 || !p0.code_stored) { console.error(`${factoryId} exists but is not a finished keyless factory: pick another --factory-name`); process.exit(1); }
  resumed = true; console.log(`   ${factoryId} already exists with 0 keys and its code stored: resuming`);
}
if (!resumed) {
const fkp = KeyPair.fromRandom('ed25519');
await me.createAccount(factoryId, fkp.getPublicKey(), N(FACTORY_NEAR));
await ks.setKey('testnet', factoryId, fkp);
factory = await near.account(factoryId);
// One transaction: deploy, init, store the coin code, then DELETE the factory's only key. After this nobody can sign
// for the factory, so nobody can create an impostor <name>.<factory> account or change the code new coins run.
await factory.signAndSendTransaction({ receiverId: factoryId, actions: [
  transactions.deployContract(factoryWasm),
  transactions.functionCall('new', { code_hash: null, protocol: ACCOUNT }, TGAS(50), 0n),
  transactions.functionCall('store_code', new Uint8Array(coinWasm), TGAS(250), 0n),
  transactions.deleteKey(fkp.getPublicKey()),
] });
}
const left = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: factoryId });
console.log(`   access keys left on ${factoryId}: ${left.keys.length} (explorer: https://testnet.nearblocks.io/address/${factoryId})`);
const params = await factory.viewFunction({ contractId: factoryId, methodName: 'get_params', args: {} });
console.log(`   mode ${params.mode}, code stored ${params.code_stored}, admin ${params.admin}, coin storage ${fmt(params.deploy_deposit)} NEAR`);

console.log(`2. ${BOTS} bots`);
for (let i = 1; i <= BOTS; i++) { if (keys.accounts[`bot${i}`]) { const t = topups[`bot${i}`]; if (t) await me.sendMoney(`bot${i + BOT_OFFSET}.${ACCOUNT}`, N(t)); console.log(`   bot${i}: kept${t ? `, +${t} NEAR` : ''}`); continue; } keys.accounts[`bot${i}`] = await make(`bot${i + BOT_OFFSET}.${ACCOUNT}`, BOT_NEAR); save(); }

console.log('3. coins');
for (const [name, symbol, rules] of COINS_META) {
  await me.functionCall({ contractId: factoryId, methodName: 'create_coin', args: { name, symbol, icon: null, rules }, gas: TGAS(300), attachedDeposit: BigInt(params.deploy_deposit) + N(COIN_SEED) });
  console.log(`   $${symbol} → ${symbol.toLowerCase()}.${factoryId}`);
}
save();
console.log(`
Done. Put this in .env.testnet:
  VITE_NETWORK=testnet
  VITE_FACTORY_DEMO=${factoryId}
Then: npx vite --mode testnet

Push the coins to L2 (about 15 minutes), then keep the world moving (gas is real NEAR: use --every 600 or more):
  RULECARD_KEYS=sandbox/.keys/testnet.json node sandbox/bots.mjs --mode demo --bootstrap --ticks 1
  RULECARD_KEYS=sandbox/.keys/testnet.json node sandbox/bots.mjs --mode demo --every 600`);
