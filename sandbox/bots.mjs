// Bot runner: keeps a Rulecard world alive.
//   Every tick: EVERY bot checks in and claims its pack when one is due (so a coin keeps its 15 qualified check-ins),
//   then a few bots per coin trade, lock, back and sign cards, fuel, bet, play cards, start raids, fill plans, Battle cry,
//   settle, and finally anyone pokes the coin so timers fire.
//   --bootstrap first pushes every live coin toward L2: all bots buy in, wait out the hold time, then all check in.
//
// Usage: node sandbox/bots.mjs [--mode demo|real] [--ticks N] [--every SECONDS] [--forward MINUTES] [--per-coin N]
//                              [--bootstrap [--buy NEAR] [--extra NEAR] [--hold MINUTES] [--only FROG,MOTH]]
//   --forward only works on the local sandbox (it moves the chain clock between ticks and during the bootstrap wait).
//   RULECARD_KEYS=path/to/keys.json points it at another network (same file format as sandbox/.keys/keys.json).
//   Gas costs real (testnet) NEAR: on testnet use --every 600 or more. A bot spends roughly 0.02 NEAR an hour.
import { call, view, NEAR, idOf, keys, forward, errMsg, acct } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODE = arg('mode', 'demo');
const TICKS = Number(arg('ticks', 'Infinity'));
const EVERY = Number(arg('every', '300'));
const FWD = Number(arg('forward', '0'));
const PER = Number(arg('per-coin', '5'));
const BOOT = process.argv.includes('--bootstrap');
const S = MODE === 'demo' ? 100 : 1;
const G = n => NEAR((n / S).toFixed(6));
const F = keys.factories[MODE];
// a check-in every ~75 min (demo) / 12h (real) keeps a bot inside the 18h-equivalent idle-burn grace; more would only burn gas
const GM_GAP = (MODE === 'demo' ? 75 : 12 * 60) * 60_000;
const bots = Object.keys(keys.accounts).filter(n => n.startsWith('bot'));
const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}\n`);
console.log = () => {}; console.warn = () => {}; // near-api-js receipt logs
const sym = id => id.split('.')[0].toUpperCase();

async function act(bot, coin, method, args = {}, deposit = 0n, quiet = false) {
  try { const r = await call(bot, coin, method, args, deposit); if (!quiet) log(`${bot} ${sym(coin)} ${method}`); return r ?? true; }
  catch (e) { return null; }
}

/** Every bot: gm when it is due, claim the pack when it is ready (dropping a Common first if the hand is full). */
async function housekeeping(coin) {
  const c = await view(coin, 'get_coin');
  let gms = 0, packs = 0;
  for (const bot of bots) {
    const me = idOf(bot);
    const h = await view(coin, 'get_holder', { account_id: me });
    if (!h) continue;
    let gmOk = false;
    if ((h.last_gm === 0 || (c.now >= h.next_gm && c.now - h.last_gm >= GM_GAP)) && (await act(bot, coin, 'gm', {}, 0n, true))) { gms++; gmOk = true; }
    const hand = await view(coin, 'get_hand', { account_id: me });
    if (hand && c.now >= hand.next_pack && (h.last_gm > 0 || gmOk) && (gmOk || chance(0.3))) {
      let ok = await act(bot, coin, 'claim_pack', {}, 0n, true);
      if (!ok) {
        const dup = hand.commons.find(([, n]) => n > 1);
        if (dup) { await act(bot, coin, 'drop_card', { card: dup[0] }, 0n, true); ok = await act(bot, coin, 'claim_pack', {}, 0n, true); }
      }
      if (ok) packs++;
    }
  }
  if (gms || packs) log(`${sym(coin)}: ${gms} check-ins, ${packs} packs`);
}

async function playCoin(coin, liveCoins) {
  const c = await view(coin, 'get_coin');
  for (const bot of [...bots].sort(() => Math.random() - 0.5).slice(0, PER)) {
    const me = idOf(bot);
    const bal = BigInt(await view(coin, 'ft_balance_of', { account_id: me }));
    const near = Number(BigInt((await (await acct(bot)).getAccountBalance()).available) / 10n ** 21n) / 1000;
    if (near < 0.3 && bal > 0n) { await act(bot, coin, 'sell', { amount: (bal * 3n / 10n).toString() }, 1n); continue; } // low on gas money: sell 30%
    if (near < 0.3) continue;
    if (bal === 0n || chance(0.45)) await act(bot, coin, 'buy', {}, G(1 + Math.random() * 7));
    else if (chance(0.25)) await act(bot, coin, 'sell', { amount: (bal / 5n).toString() }, 1n);
    else if (chance(0.2)) await act(bot, coin, 'lock', { amount: (bal / 4n).toString(), hours: pick([6, 24, 72]) }, 1n);
    // the table
    for (const t of await view(coin, 'get_table')) {
      if (t.phase === 0 && t.proposer !== me && !t.backers.includes(me)) await act(bot, coin, t.card === 'Inferno' ? 'sign' : 'back', { id: t.id });
      if (t.card === 'Ember' && t.phase === 0 && chance(0.3)) await act(bot, coin, 'stoke', { id: t.id }, G(1 + Math.random() * 3));
      if (t.card === 'Inferno' && t.phase === 1 && chance(0.6)) await act(bot, coin, 'fuel', { id: t.id }, G(2 + Math.random() * 8));
      if (t.card === 'Prophecy' && t.phase === 1 && !t.bets.some(b => b.account === me) && bal > 0n) await act(bot, coin, 'bet', { id: t.id, yes: chance(0.55), amount: (bal / 20n).toString() }, 1n);
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

async function liveCoins() {
  const out = [];
  for (const e of await view(F, 'list_coins', {})) { const v = await view(e.account_id, 'get_coin'); if (!v.graduated) out.push({ id: e.account_id, level: v.level }); }
  return out;
}

/** Push every live coin toward L2 with buys only: round 1 puts ~7 NEAR in each curve, the hold time passes, every bot checks in,
 *  round 2 adds the volume L2 asks for. (Selling back would lower the curve below the target, so there is none.) */
async function bootstrap() {
  const buy = Number(arg('buy', MODE === 'demo' ? '0.45' : '45'));
  const extra = Number(arg('extra', MODE === 'demo' ? '0.14' : '14'));
  const holdMin = Number(arg('hold', MODE === 'demo' ? '6' : '75')); // a qualified wallet must have held 1h of game time
  const only = arg('only', '').split(',').filter(Boolean).map(x => x.toUpperCase());
  const coins = (await liveCoins()).filter(c => !only.length || only.includes(sym(c.id)));
  log(`bootstrap: ${bots.length} bots buy ${buy} NEAR into each of ${coins.map(c => sym(c.id)).join(', ')}, wait ${holdMin} min, check in, then buy ${extra} more`);
  // safe to re-run: a bot that already holds this coin doesn't buy again
  for (const c of coins) for (const bot of bots) {
    if (BigInt(await view(c.id, 'ft_balance_of', { account_id: idOf(bot) })) === 0n) await act(bot, c.id, 'buy', {}, NEAR(buy.toFixed(6)), true);
  }
  log('bought; waiting for the holding time...');
  if (FWD) await forward(holdMin); else await sleep(holdMin * 60_000);
  for (const c of coins) { await housekeeping(c.id); }
  for (const c of coins) {
    const lv = await view(c.id, 'get_level_progress');
    if (lv.rules.some(r => r.name === 'volume_24h' && !r.met)) for (const bot of bots) await act(bot, c.id, 'buy', {}, NEAR(extra.toFixed(6)), true);
  }
  await sleep(1500);
  for (const c of coins) {
    await act(bots[0], c.id, 'poke', {}, 0n, true);
    const v = await view(c.id, 'get_coin'), lv = await view(c.id, 'get_level_progress');
    log(`${sym(c.id)}: L${v.level}, curve ${(Number(BigInt(v.real) / 10n ** 21n) / 1000).toFixed(2)} NEAR; unmet: ${lv.rules.filter(r => !r.met).map(r => r.name).join(', ') || 'none (level-up when the hold time ends)'}`);
  }
}

log(`bots on the ${MODE} factory ${F}: ${bots.length} bots, ${PER} per coin per tick, every ${EVERY}s${FWD ? `, +${FWD} min per tick` : ''}`);
if (BOOT) await bootstrap();
for (let tick = 1; tick <= TICKS; tick++) {
  const live = await liveCoins();
  for (const x of live) { await housekeeping(x.id); await playCoin(x.id, live); }
  log(`tick ${tick} done (${live.length} live coins: ${live.map(x => sym(x.id) + ' L' + x.level).join(', ')})`);
  if (tick < TICKS) { if (FWD) await forward(FWD); else await sleep(EVERY * 1000); }
}
