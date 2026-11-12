// Sell every bot's tokens in the OLD coins back to the curve, so the bots get their NEAR back before a redeploy.
// Dry run by default (prints what it would sell). Add --yes to send. Only the bots' own accounts sign; your main account is not touched.
//
//   node sandbox/drain-bots.mjs --factory demo.harshtest1.testnet [--yes]
//
// Keys: sandbox/.keys/testnet.json (the file deploy-testnet.mjs wrote). Each sale needs 1 yoctoNEAR, like ft_transfer.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, keyStores, KeyPair } from 'near-api-js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const YES = process.argv.includes('--yes');
const keys = JSON.parse(readFileSync(join(here, '.keys', 'testnet.json'), 'utf8'));
const factory = arg('factory', keys.factories.demo);
const nodeUrl = keys.nodeUrl ?? 'https://test.rpc.fastnear.com';
const fmt = y => (Number(BigInt(y) / 10n ** 21n) / 1000).toFixed(3);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ks = new keyStores.InMemoryKeyStore();
const bots = Object.entries(keys.accounts).filter(([n]) => /^bot\d+$/.test(n));
for (const [, a] of bots) await ks.setKey('testnet', a.accountId, KeyPair.fromString(a.secretKey));
const near = await connect({ networkId: 'testnet', nodeUrl, keyStore: ks });
const view = async (c, m, args = {}) => { for (let i = 0; i < 5; i++) { try { return await (await near.account(bots[0][1].accountId)).viewFunction({ contractId: c, methodName: m, args }); } catch (e) { if (i === 4) throw e; await sleep(800 * (i + 1)); } } };

const coins = await view(factory, 'list_coins');
console.log(`\nDrain bots from ${factory}: ${coins.length} coins, ${bots.length} bots ${YES ? '' : '— DRY RUN, nothing is sent'}`);
let before = 0n; for (const [, a] of bots) before += BigInt((await (await near.account(a.accountId)).getAccountBalance()).available);
console.log(`bots hold ${fmt(before)} NEAR now`);
let sells = 0;
for (const [name, a] of bots) {
  const acct = await near.account(a.accountId);
  for (const c of coins) {
    try {
      const h = await view(c.account_id, 'get_holder', { account_id: a.accountId });
      if (!h) continue;
      const now = (await view(c.account_id, 'get_coin')).now;
      if (YES) for (let i = h.locks.length - 1; i >= 0; i--) if (now >= h.locks[i].until) { await acct.functionCall({ contractId: c.account_id, methodName: 'unlock', args: { index: i }, gas: 100_000_000_000_000n }); await sleep(500); }
      const bal = BigInt(await view(c.account_id, 'ft_balance_of', { account_id: a.accountId }));
      if (bal === 0n) continue;
      sells++;
      if (!YES) { console.log(`  ${name} would sell ${c.account_id}: ${(bal / 10n ** 24n).toString()}M tokens`); continue; }
      await acct.functionCall({ contractId: c.account_id, methodName: 'sell', args: { amount: bal.toString() }, gas: 100_000_000_000_000n, attachedDeposit: 1n });
      console.log(`  ${name} sold ${c.account_id}`);
      await sleep(600);
    } catch (e) { console.log(`  ${name} ${c.account_id}: skipped (${String(e?.message ?? e).slice(0, 80)})`); }
  }
}
if (!YES) { console.log(`\n${sells} sales would be sent. Add --yes to send.`); process.exit(0); }
let after = 0n; for (const [, a] of bots) after += BigInt((await (await near.account(a.accountId)).getAccountBalance()).available);
console.log(`\nbots hold ${fmt(after)} NEAR now (was ${fmt(before)})`);
