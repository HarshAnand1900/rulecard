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
const DEADLINE = Date.now() + Number(arg('max-minutes', 'Infinity')) * 60_000; // stop cleanly after this many minutes (the GitHub workflow uses it)
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
// cards that need signers, and the ones a bot can play with a plain play_card call
const SIGNED = ['Inferno', 'BlackHole', 'Harvest', 'WhaleTax', 'Alliance', 'Supernova'];
const PLAYABLE = ['Inferno', 'Prophecy', 'Ember', 'RollCall', 'HypeSiren', 'Kindle', 'SlowBurn', 'Recruit', 'DiamondPool', 'Harvest', 'WhaleTax', 'Stampede', 'BlackHole'];

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
    // payouts from Prophecies, Black Holes and Bounties wait to be claimed (and burn if nobody does)
    const owed = await view(coin, 'get_pending', { account_id: me }).catch(() => []);
    if (owed && owed.length) await act(bot, coin, 'claim_payouts', {}, 0n, true);
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

/** Make the coin's Daily Ritual: the lock half of the target is NEAR locked in the Vault today. Bots free their expired locks,
 *  then lock a quarter of what they hold until the target is met (the gm half is covered by every bot's check-ins). */
async function ritualHelp(coin) {
  const r = await view(coin, 'get_ritual');
  let need = BigInt(r.lock_target) - BigInt(r.lock_near);
  if (need <= 0n) return;
  const c = await view(coin, 'get_coin');
  let locked = 0;
  for (const bot of [...bots].sort(() => Math.random() - 0.5)) {
    const me = idOf(bot);
    const h = await view(coin, 'get_holder', { account_id: me });
    if (!h) continue;
    for (let i = h.locks.length - 1; i >= 0; i--) if (c.now >= h.locks[i].until) await act(bot, coin, 'unlock', { index: i }, 0n, true);
    const bal = BigInt(await view(coin, 'ft_balance_of', { account_id: me }));
    if (bal === 0n || h.locks.length >= 6) continue;
    const price = BigInt(c.price); // yocto NEAR per whole token (1e18 units)
    const part = bal / 4n, value = part * price / 10n ** 18n;
    if (value === 0n) continue;
    if (await act(bot, coin, 'lock', { amount: part.toString(), hours: 24 }, 1n, true)) { need -= value; locked++; }
    if (need <= 0n) break;
  }
  if (locked) log(`${sym(coin)}: ${locked} bots locked tokens for the Ritual`);
}

/** Omens roll when anyone touches a coin near the start of a cycle: poke the coins that are waiting, so players see the Omen coming. */
async function omenPoke(coin) {
  let o; try { o = await view(coin, 'get_omen'); } catch { return; } // coins from before Omens don't have it
  if (o?.needs_roll) { await act(bots[0], coin, 'poke', {}, 0n, true); log(`${sym(coin)}: rolled the next Omen`); }
}

/** A card that needs backers or signers fires only if enough wallets join inside its short window, and a bot tick is longer than that
 *  window. So when a bot plays one, the other bots join in the same tick: the card really fires and the pot, supply and log move. */
async function gather(coin, proposer, id, card) {
  const t0 = (await view(coin, 'get_table')).find(x => x.id === id && x.card === card);
  if (!t0 || t0.phase !== 0 || !t0.needed) return;
  let have = t0.backers.length;
  for (const bot of [...bots].filter(b => b !== proposer).sort(() => Math.random() - 0.5)) {
    if (have >= t0.needed) break;
    if (await act(bot, coin, SIGNED.includes(card) ? 'sign' : 'back', { id }, 0n, true)) have++;
  }
  log(`${sym(coin)}: ${card} has ${have}/${t0.needed} ${SIGNED.includes(card) ? 'signers' : 'backers'}${have >= t0.needed ? ', it will fire' : ''}`);
}

/** A Prophecy is refunded unless 8 or more wallets bet, so once it is taking bets enough bots bet on both sides in one tick. */
async function fillProphecy(coin, t) {
  const have = new Set(t.bets.map(b => b.account));
  let placed = t.bets.length, yes = t.bets.filter(b => b.yes).length;
  for (const bot of [...bots].sort(() => Math.random() - 0.5)) {
    if (placed >= 10) break;
    const me = idOf(bot); if (have.has(me)) continue;
    const bal = BigInt(await view(coin, 'ft_balance_of', { account_id: me }));
    if (bal === 0n) continue;
    const side = yes <= placed - yes; // keep both sides filled
    if (await act(bot, coin, 'bet', { id: t.id, yes: side, amount: (bal / 12n).toString() }, 1n, true)) { placed++; if (side) yes++; }
  }
  log(`${sym(coin)}: Prophecy has ${placed} bets`);
}

async function playCoin(coin, liveCoins) {
  const c = await view(coin, 'get_coin');
  for (const t of await view(coin, 'get_table')) if (t.card === 'Prophecy' && t.phase === 1 && t.bets.length < 9) await fillProphecy(coin, t);
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
      if (t.phase === 0 && t.proposer !== me && !t.backers.includes(me)) await act(bot, coin, SIGNED.includes(t.card) ? 'sign' : 'back', { id: t.id });
      if (t.card === 'Ember' && t.phase === 0 && chance(0.3)) await act(bot, coin, 'stoke', { id: t.id }, G(1 + Math.random() * 3));
      if (t.card === 'Inferno' && t.phase === 1 && chance(0.6)) await act(bot, coin, 'fuel', { id: t.id }, G(2 + Math.random() * 8));
      if ((t.card === 'Stampede' || t.card === 'Squeeze') && t.phase === 1 && chance(0.7)) await act(bot, coin, 'rush', { id: t.id }, G(1 + Math.random() * 3));
      if (t.card === 'BlackHole' && t.phase === 1 && bal > 0n && chance(0.6)) await act(bot, coin, 'throw_in', { id: t.id, amount: (bal / 30n).toString() }, 1n);
      if (t.card === 'Prophecy' && t.phase === 1 && !t.bets.some(b => b.account === me) && bal > 0n) await act(bot, coin, 'bet', { id: t.id, yes: chance(0.55), amount: (bal / 20n).toString() }, 1n);
    }
    // play a card now and then
    const hand = await view(coin, 'get_hand', { account_id: me });
    if (hand && chance(0.35)) {
      const has = k => hand.commons.some(([n, x]) => n === k && x > 0) || hand.cards.some(x => x.card === k);
      const card = PLAYABLE.filter(has).sort(() => Math.random() - 0.5)[0];
      if (card) { const id = await act(bot, coin, 'play_card', { card, question: card === 'Prophecy' ? 'Tide' : null }); if (typeof id === 'number') await gather(coin, bot, id, card); }
      if (c.harvest_until > c.now) await act(bot, coin, 'harvest_claim', {}, 0n, true);
    }
    // raids
    const raid = await view(coin, 'get_raid');
    // (raids are started by raidTick below, one at a time: random proposals on every coin made each target "busy")
    if (raid) {
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

/** One coordinated raid at a time. A coin that has its own open proposal cannot be raided ("already in a raid"), so proposals are
 *  only made when NO coin has one: pick an attacker and a target that are both free, have enough bots sign in the same tick
 *  (the proposer counts as the first signature), then launch at once. Tries a few pairs, since the contract refuses a pair that
 *  is shielded, on cooldown or too far apart in level. */
async function raidTick(live) {
  const state = [];
  for (const x of live) state.push({ ...x, raid: await view(x.id, 'get_raid') });
  if (state.some(x => x.raid && x.raid.phase < 4)) return; // a raid is forming or running: let it finish first
  const eligible = state.filter(x => x.level >= 2);
  const pairs = [];
  for (const a of eligible) for (const b of eligible) if (a.id !== b.id && b.level >= a.level) pairs.push([a, b]);
  pairs.sort(() => Math.random() - 0.5);
  for (const [a, b] of pairs.slice(0, 6)) {
    let proposer = null;
    for (const bot of [...bots].sort(() => Math.random() - 0.5).slice(0, 8)) {
      if (await act(bot, a.id, 'start_raid', { target: b.id }, 0n, true)) { proposer = bot; break; }
    }
    if (!proposer) continue;
    let r = await view(a.id, 'get_raid');
    for (const bot of bots) {
      if (!r || r.backers >= r.needed) break;
      if (bot === proposer) continue;
      if (await act(bot, a.id, 'sign_raid', {}, 0n, true)) r = await view(a.id, 'get_raid');
    }
    if (r && r.backers >= r.needed) {
      const ok = await act(proposer, a.id, 'launch_raid', {}, 0n, true);
      const after = await view(a.id, 'get_raid');
      log(`${sym(a.id)} raids ${sym(b.id)}: ${r.backers}/${r.needed} signed, ${ok && after && after.phase >= 1 ? 'launched' : 'launch was refused'}`);
      if (after && after.phase >= 1) return;
    } else log(`${sym(a.id)} proposed a raid on ${sym(b.id)} but only ${r?.backers ?? 0}/${r?.needed ?? '?'} could sign this tick`);
    return; // a proposal is open: leave it to expire or finish before trying another pair
  }
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
if (BOOT) {
  // the bootstrap is safe to repeat (a bot that already holds a coin doesn't buy again), so a network error just means: wait and go on
  for (let attempt = 1; attempt <= 8; attempt++) {
    try { await bootstrap(); break; }
    catch (e) { log(`bootstrap hit a network error (${String(e?.cause?.code ?? e?.message ?? e).slice(0, 60)}); retrying in 20s (${attempt}/8)`); await sleep(20_000); }
  }
}
// A tick that hits a network error (DNS, RPC down, rate limit) is logged and retried after a pause instead of ending the loop:
// this has to run for days.
let tick = 1, failures = 0;
while (tick <= TICKS && Date.now() < DEADLINE) {
  try {
    const live = await liveCoins();
    for (const x of live) { await housekeeping(x.id); await ritualHelp(x.id); await omenPoke(x.id); await playCoin(x.id, live); }
    await raidTick(live);
    log(`tick ${tick} done (${live.length} live coins: ${live.map(x => sym(x.id) + ' L' + x.level).join(', ')})`);
    failures = 0; tick++;
    if (tick <= TICKS) { if (FWD) await forward(FWD); else await sleep(EVERY * 1000); }
  } catch (e) {
    failures++;
    const wait = Math.min(300, 20 * failures);
    log(`tick ${tick} failed (${String(e?.cause?.code ?? e?.message ?? e).slice(0, 90)}); retrying in ${wait}s`);
    await sleep(wait * 1000);
  }
}
