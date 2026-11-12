// Create the practice-mode sponsor ("faucet") account on testnet and fund it from your own testnet account.
// Dry run by default: it shows exactly what it would do. Add --yes to send.
//
//   node sandbox/create-faucet.mjs --account YOU.testnet --credentials PATH [--amount 6] [--yes]
//
// It creates faucet.YOU.testnet with --amount NEAR, writes its key to sandbox/.keys/faucet.json (gitignored) and prints the names of
// the environment variables to set on your host. It never prints the key. Put the key from that file into the host's secret
// settings only (FUND_PRIVATE_KEY); never commit it. A separate account means a drained sponsor can never touch your main account.
import { connect, keyStores, KeyPair, utils } from 'near-api-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const YES = process.argv.includes('--yes');
const ACCOUNT = arg('account', process.env.RULECARD_TESTNET_ACCOUNT);
const AMOUNT = Number(arg('amount', '6'));
const nodeUrl = process.env.RULECARD_TESTNET_RPC ?? 'https://test.rpc.fastnear.com';
const keyFile = join(here, '.keys', 'faucet.json');
const fmt = y => (Number(BigInt(y) / 10n ** 21n) / 1000).toFixed(3);

if (!ACCOUNT) { console.error('Pass --account YOU.testnet'); process.exit(1); }
const credPath = arg('credentials', join(homedir(), '.near-credentials', 'testnet', `${ACCOUNT}.json`));
const faucetId = `faucet.${ACCOUNT}`;
const rpc = async (method, params) => { const r = await (await fetch(nodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json(); if (r.error) throw new Error(JSON.stringify(r.error)); return r.result; };
const exists = async id => { try { await rpc('query', { request_type: 'view_account', finality: 'final', account_id: id }); return true; } catch { return false; } };

const acct = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: ACCOUNT });
console.log(`\nPractice faucet ${YES ? '' : '— DRY RUN, nothing is sent'}
  your account   ${ACCOUNT}: ${fmt(acct.amount)} NEAR available
  credentials    ${existsSync(credPath) ? 'found' : 'NOT FOUND at ' + credPath}
  create         ${faucetId} with ${AMOUNT} NEAR (about ${Math.floor((AMOUNT - 1) / 0.25)} practice wallets at 0.25 NEAR each; it keeps 1 NEAR back)
  write          sandbox/.keys/faucet.json (its key; gitignored)
  then, on your host, set: FUND_ACCOUNT_ID=${faucetId}  FUND_PRIVATE_KEY=<the key from that file>  (and VITE_NETWORK, VITE_FACTORY_DEMO)
`);
if (BigInt(acct.amount) < BigInt(utils.format.parseNearAmount(String(AMOUNT + 0.2)))) console.log('  ⚠ not enough NEAR for that amount.\n');
if (!YES) { console.log('Add --yes to send.'); process.exit(0); }
if (!existsSync(credPath)) { console.error('No credentials file.'); process.exit(1); }
if (await exists(faucetId)) { console.error(`${faucetId} already exists.`); process.exit(1); }

const cred = JSON.parse(readFileSync(credPath, 'utf8'));
const ks = new keyStores.InMemoryKeyStore();
await ks.setKey('testnet', ACCOUNT, KeyPair.fromString(cred.private_key ?? cred.secret_key));
const near = await connect({ networkId: 'testnet', nodeUrl, keyStore: ks });
const kp = KeyPair.fromRandom('ed25519');
await (await near.account(ACCOUNT)).createAccount(faucetId, kp.getPublicKey(), BigInt(utils.format.parseNearAmount(String(AMOUNT))));
mkdirSync(dirname(keyFile), { recursive: true });
writeFileSync(keyFile, JSON.stringify({ account_id: faucetId, private_key: kp.toString() }, null, 2));
console.log(`Created ${faucetId} with ${AMOUNT} NEAR. Its key is in sandbox/.keys/faucet.json (not printed here, not committed).`);
