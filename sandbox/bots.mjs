// Bot runner: keeps a Rulecard world alive. Every tick, a few bots on each live coin check in, claim packs, trade,
// lock, back and sign cards, fuel, bet, play cards, start raids, fill raid plans, Battle cry and settle, then poke timers.
// Usage: node sandbox/bots.mjs [--mode demo|real] [--ticks N] [--every SECONDS] [--forward MINUTES] [--per-coin N]
//   --forward only works on the local sandbox (it moves the chain clock between ticks).
//   RULECARD_KEYS=path/to/keys.json points it at another network (same file format as sandbox/.keys/keys.json).
import { call, view, NEAR, idOf, keys, forward, errMsg } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODE = arg('mode', 'demo');
const TICKS = Number(arg('ticks', 'Infinity'));
const EVERY = Number(arg('every', '60'));
const FWD = Number(arg('forward', '0'));
const PER = Number(arg('per-coin', '5'));
const S = MODE === 'demo' ? 100 : 1;
const G = n => NEAR((n / S).toFixed(6));
const F = keys.factories[MODE];
const bots = Object.keys(keys.accounts).filter(n => n.startsWith('bot'));
const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
const log = (...a) => process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}\n`);
console.log = () => {}; console.warn = () => {}; // near-api-js receipt logs
const sym = id => id.split('.')[0].toUpperCase();

async function act(bot, coin, method, args = {}, deposit = 0n, quiet = false) {
  try { const r = await call(bot, coin, method, args, deposit); if (!quiet) log(`${bot} ${sym(coin)} ${method}`); return r ?? true; }
  catch (e) { return null; }
}

async function playCoin(coin, liveCoins) {
  const c = await view(coin, 'get_coin');
  for (const bot of [...bots].sort(() => Math.random() - 0.5).slice(0, PER)) {
    const me = idOf(bot);
    const bal = BigInt(await view(coin, 'ft_balance_of', { account_id: me }));
    // join or trade
    if (bal === 0n || chance(0.45)) await act(bot, coin, 'buy', {}, G(1 + Math.random() * 7));
    else if (chance(0.25)) await act(bot, coin, 'sell', { amount: (bal / 5n).toString() });
    else if (chance(0.2)) await act(bot, coin, 'lock', { amount: (bal / 4n).toString(), hours: pick([6, 24, 72]) });
    await act(bot, coin, 'gm', {}, 0n, true) && log(`${bot} ${sym(coin)} gm`);
    if (!(await act(bot, coin, 'claim_pack', {}, 0n, true))) {
      const hand = await view(coin, 'get_hand', { account_id: me });
      const full = hand?.commons.find(([, n]) => n > 1);
      if (full && hand.commons.reduce((a, [, n]) => a + n, 0) >= 11) { await act(bot, coin, 'drop_card', { card: full[0] }, 0n, true); await act(bot, coin, 'claim_pack'); }
    } else log(`${bot} ${sym(coin)} claimed a pack`);
    // the table
    for (const t of await view(coin, 'get_table')) {
      if (t.phase === 0 && t.proposer !== me && !t.backers.includes(me)) await act(bot, coin, t.card === 'Inferno' ? 'sign' : 'back', { id: t.id });
      if (t.card === 'Ember' && t.phase === 0 && chance(0.3)) await act(bot, coin, 'stoke', { id: t.id }, G(1 + Math.random() * 3));
      if (t.card === 'Inferno' && t.phase === 1 && chance(0.6)) await act(bot, coin, 'fuel', { id: t.id }, G(2 + Math.random() * 8));
      if (t.card === 'Prophecy' && t.phase === 1 && !t.bets.some(b => b.account === me) && bal > 0n) await act(bot, coin, 'bet', { id: t.id, yes: chance(0.55), amount: (bal / 20n).toString() });
    }
    // play a card now and then
    const hand = await view(coin, 'get_hand', { account_id: me });
    if (hand && chance(0.35)) {
      const has = k => hand.commons.some(([n, x]) => n === k && x > 0) || hand.cards.some(x => x.card === k);
      const card = ['Inferno', 'Prophecy', 'Ember', 'RollCall', 'HypeSiren'].find(has);
      if (card) await act(bot, coin, 'play_card', { card, question: card === 'Prophecy' ? 'Tide' : null });
    }
    // raids
    const raid = await view(coin, 'get_raid');
    if (!raid && c.level >= 2 && chance(0.15)) {
      const targets = liveCoins.filter(x => x.id !== coin && x.level >= c.level);
      if (targets.length) await act(bot, coin, 'start_raid', { target: pick(targets).id });
    } else if (raid) {
      if (raid.attacking && raid.phase === 0) { await act(bot, coin, 'sign_raid', {}, 0n, true); if ((await view(coin, 'get_raid'))?.backers >= raid.needed) await act(bot, coin, 'launch_raid'); }
      if (raid.phase === 2) {
        const plan = await view(coin, 'get_my_plan', { account_id: me });
        if (!plan.length || plan.every(x => x === 0)) {
          const tact = (hand?.commons ?? []).filter(([k, n]) => ['Rally', 'Curse', 'Ward'].includes(k) && n > 0).map(([k]) => k);
          if (tact.length) await act(bot, coin, 'set_plan', { slots: [pick(tact), pick(tact), null] });
        }
        if (raid.round !== null) await act(bot, coin, 'battle_cry', {}, 0n, true);
        if (raid.attacking && Date.now() > 0) await act(bot, coin, 'settle_raid', {}, 0n, true) && log(`${bot} ${sym(coin)} settled the raid`);
      }
    }
    await act(bot, coin, 'claim_raid_pack', {}, 0n, true);
  }
  await act(bots[0], coin, 'poke', {}, 0n, true);
}

log(`bots on the ${MODE} factory ${F}: ${bots.length} bots, ${PER} per coin per tick, every ${EVERY}s${FWD ? `, +${FWD} min per tick` : ''}`);
for (let tick = 1; tick <= TICKS; tick++) {
  const entries = await view(F, 'list_coins', {});
  const live = [];
  for (const e of entries) { const v = await view(e.account_id, 'get_coin'); if (!v.graduated) live.push({ id: e.account_id, level: v.level }); }
  for (const x of live) await playCoin(x.id, live);
  log(`tick ${tick} done (${live.length} live coins)`);
  if (tick < TICKS) { if (FWD) await forward(FWD); else await new Promise(r => setTimeout(r, EVERY * 1000)); }
}
