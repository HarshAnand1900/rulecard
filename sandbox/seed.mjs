// Demo world on the sandbox: two coins at level 2+, holders aged past 1h, and a Friendly Raid card for "you" (earned by Sacrifice).
// Usage: node sandbox/seed.mjs   (after sandbox:start and sandbox:deploy)
import { call, view, NEAR, idOf, rpc } from './lib.mjs';

const quiet = console.log; console.log = () => {}; console.warn = () => {};
async function forward(minutes) {
  const now = async () => Number((await rpc('block', { finality: 'final' })).header.timestamp_nanosec) / 1e6;
  const target = (await now()) + minutes * 60_000;
  for (let i = 0; i < 6 && (await now()) < target; i++) await rpc('sandbox_fast_forward', { delta_height: Math.ceil((target - (await now())) / 1200) + 5 });
}

const moth = await call('bot1', 'launch_coin', { name: 'Moth Lamp', ticker: 'MOTH', fee_bps: 100, rules: ['holdTheLine', 'paperTax'] }, NEAR(1));
const zap = await call('bot2', 'launch_coin', { name: 'Zap Cat', ticker: 'ZAP', fee_bps: 100, rules: ['holdTheLine', 'vaultSeal'] }, NEAR(1));
quiet(`launched $MOTH (${moth}) and $ZAP (${zap})`);
for (const [who, coin, n] of [['you', moth, 6], ['bob', moth, 3], ['bot3', moth, 3], ['alice', zap, 6], ['bob', zap, 2], ['bot4', zap, 4]]) await call(who, 'buy', { coin_id: coin, min_tokens: '0' }, NEAR(n));
quiet('players bought in; fast-forwarding 90 minutes so levels and holding ages tick over');
await forward(90);
for (const c of [moth, zap]) await call('bot5', 'crank', { coin_id: c });
await forward(20);
for (const c of [moth, zap]) await call('bot5', 'crank', { coin_id: c });
for (const who of ['you', 'bob']) await call(who, 'check_in', { coin_id: moth });
for (const who of ['alice', 'bob']) await call(who, 'check_in', { coin_id: zap });
const m = await view('get_coin', { coin_id: moth });
const burn = (BigInt(m.circ) * 25n) / 10_000n; // 0.25% of supply earns a Rare
await call('you', 'sacrifice', { coin_id: moth, amount: burn.toString(), card: 'friendlyRaid' });
const coins = await view('list_coins', {});
quiet(coins.map(c => `$${c.ticker}: level ${c.level}, ${(Number(BigInt(c.real) / 10n ** 21n) / 1000).toFixed(2)} NEAR in curve`).join(' | '));
quiet(`you hold: ${(await view('nfts_for_owner', { account_id: idOf('you') })).filter(n => n.kind === 'card').map(n => n.title).join(', ')}`);
