// Demo world on the sandbox: $FROG and $MOTH at L2 (raids possible), $ZAP at L1, holders aged past their hold times,
// everyone checked in, packs claimed, some tokens locked.
// Usage: node sandbox/seed.mjs   (after ./sandbox/start.sh and node sandbox/deploy.mjs)
import { call, view, NEAR, idOf, keys, coinId, forward, errMsg } from './lib.mjs';

const say = console.log; console.log = () => {}; console.warn = () => {};
const F = keys.factoryId;
const bots = Array.from({ length: 12 }, (_, i) => `bot${i + 1}`);
const players = ['you', 'alice', 'bob'];
const all = [...players, ...bots];
const tryCall = async (...a) => { try { return await call(...a); } catch (e) { say(`  (skipped ${a[0]} ${a[2]}: ${errMsg(e)})`); } };

const launches = [['you', 'Frog Pond', 'FROG', 20, ['PaperTax']], ['alice', 'Moth Lamp', 'MOTH', 30, ['WarCoin']], ['bob', 'Zap Cat', 'ZAP', 10, ['Ruthless']]];
const storage = BigInt((await view(F, 'get_params')).deploy_deposit);
for (const [who, name, sym, seed, rules] of launches) {
  await call(who, F, 'create_coin', { name, symbol: sym, icon: null, rules }, NEAR(seed) + storage);
  say(`launched $${sym} by ${who}`);
}
const FROG = coinId('FROG'), MOTH = coinId('MOTH'), ZAP = coinId('ZAP');

say('buying in...');
for (const w of all) { await call(w, FROG, 'buy', {}, NEAR(w === 'you' ? 80 : 55)); await call(w, MOTH, 'buy', {}, NEAR(55)); }
for (const w of bots.slice(0, 6)) await call(w, ZAP, 'buy', {}, NEAR(20));
for (const w of bots.slice(0, 4)) { const b = await view(FROG, 'ft_balance_of', { account_id: idOf(w) }); await call(w, FROG, 'buy', {}, NEAR(40)); await tryCall(w, FROG, 'sell', { amount: (BigInt(b) / 4n).toString() }); }
for (const w of bots.slice(0, 4)) { await call(w, MOTH, 'buy', {}, NEAR(40)); }

say('aging holders 65 min, then everyone checks in...');
await forward(65);
for (const c of [FROG, MOTH, ZAP]) for (const w of all) await tryCall(w, c, 'gm');
await forward(16);
for (const c of [FROG, MOTH, ZAP]) await call('bot1', c, 'poke');
for (const c of [FROG, MOTH]) for (const w of all) await tryCall(w, c, 'claim_pack');
for (const w of ['alice', 'bot5', 'bot6']) { const b = await view(FROG, 'ft_balance_of', { account_id: idOf(w) }); await call(w, FROG, 'lock', { amount: (BigInt(b) / 3n).toString(), hours: 24 }); }

say('some trading over the next hours so the charts have history...');
let r = 7;
const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
for (let step = 0; step < 10; step++) {
  await forward(12);
  for (const c of [FROG, MOTH, ZAP]) {
    const w = bots[Math.floor(rnd() * 6)];
    if (rnd() < 0.62) await tryCall(w, c, 'buy', {}, NEAR(3 + Math.floor(rnd() * 15)));
    else { const b = await view(c, 'ft_balance_of', { account_id: idOf(w) }); if (BigInt(b) > 0n) await tryCall(w, c, 'sell', { amount: (BigInt(b) / 5n).toString() }); }
  }
}

for (const c of [FROG, MOTH, ZAP]) {
  const v = await view(c, 'get_coin');
  say(`$${v.symbol}: L${v.level}, ${(Number(BigInt(v.real) / 10n ** 21n) / 1000).toFixed(1)} NEAR in curve, pot ${(Number(BigInt(v.pot) / 10n ** 21n) / 1000).toFixed(2)} NEAR, energy ${v.energy}, ${v.holders} holders`);
}
