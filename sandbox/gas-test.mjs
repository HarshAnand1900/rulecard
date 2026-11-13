// Worst-case gas probe. Needs the gastest coin build:  RULECARD_GASTEST=1 node sandbox/deploy.mjs   (local sandbox only)
// For each card it fabricates a full, already-due Prophecy / Black Hole / Bounty, then measures the gas of one ordinary call that has to close it.
import { call, view, NEAR, idOf, keys, coinId, errMsg, forward } from './lib.mjs';
import { acct } from './lib.mjs';
const F = keys.factories.demo;
const storage = BigInt((await view(F, 'get_params')).deploy_deposit);
await call('you', F, 'create_coin', { name: 'Gas Cat', symbol: 'GAS', icon: null, rules: [] }, NEAR(0.2) + storage);
const C = coinId('GAS', 'demo');
for (const w of ['you', 'alice', 'bob']) await call(w, C, 'buy', {}, NEAR(0.1));
const tgas = async (who, method, args = {}, dep = 0n) => {
  const a = await acct(who);
  const r = await a.functionCall({ contractId: C, methodName: method, args, gas: 300n * 10n ** 12n, attachedDeposit: dep });
  const g = [r.transaction_outcome, ...r.receipts_outcome].reduce((t, o) => t + BigInt(o.outcome.gas_burnt), 0n);
  return Number(g / 10n ** 9n) / 1000;
};
const rows = [];
for (const [kind, n] of [['prophecy', 0], ['prophecy', 8], ['prophecy', 40], ['blackhole', 40], ['bounty', 20], ['stampede', 40], ['inferno', 40], ['ember', 40]]) {
  if (n === 0) { rows.push(['baseline poke', await tgas('you', 'poke')]); continue; }
  await call('alice', C, 'gas_fill', { kind, n });
  await forward(0.2);
  const close = await tgas('bob', 'buy', {}, NEAR(0.01));            // an ordinary buy has to close it
  const pend = await view(C, 'get_pending', { account_id: `w0.${C}` }).catch(() => []);
  rows.push([`${kind} x${n}: closing inside a buy`, close]);
  const after = await tgas('bob', 'buy', {}, NEAR(0.01));            // the next ordinary call carries the queued payouts
  rows.push([`  next buy afterwards`, after]);
}
console.table(rows.map(([what, tg]) => ({ what, Tgas: tg.toFixed(1), 'of 300': (tg / 3).toFixed(1) + '%' })));
