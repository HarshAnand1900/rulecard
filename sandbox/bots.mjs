// On-chain bot crowd for the local sandbox. Real transactions from bot1..bot8.
// Usage: node sandbox/bots.mjs [minutes]   (default runs until stopped)
import { call, view, NEAR, idOf, keys, errMsg } from './lib.mjs';

const BOTS = Object.keys(keys.accounts).filter(n => n.startsWith('bot'));
const until = process.argv[2] ? Date.now() + Number(process.argv[2]) * 60_000 : Infinity;
const pick = a => a[Math.floor(Math.random() * a.length)];
const names = [['Moth Lamp', 'MOTH'], ['Zap Cat', 'ZAP'], ['Pixel Yak', 'PYAK'], ['Grumpy Bean', 'BEAN']];
let n = 0, ok = 0;
const quiet = console.log; console.log = (...a) => { if (!String(a[0]).startsWith('Receipt') && !String(a[0]).includes('Retrying')) quiet(...a); };
console.warn = () => {};

async function step() {
  const coins = await view('list_coins', {});
  const b = pick(BOTS), r = Math.random();
  if (coins.length < 2 || (coins.length < names.length && r < 0.01)) {
    const [name, ticker] = names.find(([, t]) => !coins.some(c => c.ticker === t)) ?? [];
    if (name) { await call(b, 'launch_coin', { name, ticker, fee_bps: 100, rules: [pick(['holdTheLine', 'paperTax']), pick(['vaultSeal', 'launchGuard'])] }, NEAR(1)); return `${b} launched $${ticker}`; }
  }
  const c = pick(coins); if (!c) return 'no coins';
  const h = await view('get_holding', { coin_id: c.id, account_id: idOf(b) });
  const bal = h ? BigInt(h.bal) : 0n;
  if (r < 0.40) { const amt = (0.2 + Math.random() * 2.5).toFixed(2); await call(b, 'buy', { coin_id: c.id, min_tokens: '0' }, NEAR(amt)); return `${b} bought $${c.ticker} for ${amt} NEAR`; }
  if (r < 0.58 && bal > 0n) { await call(b, 'sell', { coin_id: c.id, tokens: (bal * BigInt(20 + Math.floor(Math.random() * 60)) / 100n).toString(), min_near: '0' }); return `${b} sold $${c.ticker}`; }
  if (r < 0.70) { await call(b, 'check_in', { coin_id: c.id }); try { await call(b, 'claim_card_of_day', { coin_id: c.id }); } catch { /* not eligible yet */ } return `${b} checked in on $${c.ticker}`; }
  if (r < 0.78) { for (let lv = 2; lv <= c.level; lv++) { try { await call(b, 'claim_level_drop', { coin_id: c.id, level: lv }); return `${b} claimed L${lv} drop`; } catch { /* not eligible */ } } return 'no drop'; }
  if (c.raid) {
    const rd = await view('get_raid', { raid_id: c.raid });
    if (rd.status === 'Pending' && rd.sides[1].coin === c.id && Math.random() < 0.5) { await call(b, 'raid_accept', { raid_id: rd.id }); return `${b} accepted raid #${rd.id}`; }
    if (rd.status === 'Active' && bal > 0n && Math.random() < 0.4) { await call(b, 'raid_stake', { raid_id: rd.id, coin_id: c.id, amount: (bal / 4n).toString() }); return `${b} staked in raid #${rd.id}`; }
  }
  if (r < 0.81) { for (let id = 1; id <= 40; id++) { const rd = await view('get_raid', { raid_id: id }); if (!rd) break; if (rd.status === 'Done') { try { await call(b, 'raid_claim', { raid_id: id }); return `${b} claimed raid #${id}`; } catch { /* nothing staked */ } } } }
  if (r < 0.86) {
    const cards = (await view('nfts_for_owner', { account_id: idOf(b) })).filter(x => x.kind === 'card' && x.coin === c.id);
    const target = coins.find(x => x.id !== c.id && x.level >= 2 && !x.raid)?.id ?? null;
    for (const k of cards) { const raidCard = k.card === 'friendlyRaid' || k.card === 'hardRaid'; if (!(await view('cast_check', { account_id: idOf(b), card_id: k.id, target: raidCard ? target : null }))) { await call(b, 'cast', { card_id: k.id, lock_hours: k.card === 'diamondPool' ? 6 : null, skin: k.card === 'rebrand' ? pick(['neon', 'gold', 'void']) : null, target: raidCard ? target : null }); return `${b} played ${k.title} on $${c.ticker}`; } }
    return 'nothing playable';
  }
  if (r < 0.94 && bal > 0n) {
    const e = c.effects.find(x => !x.done && c.now >= x.starts && c.now < x.ends && (x.card === 'diamondPool' || x.card === 'blackHole'));
    if (e) { await call(b, e.card === 'diamondPool' ? 'join_diamond' : 'feed_black_hole', { coin_id: c.id, fx_id: e.id, amount: (bal / 5n).toString() }); return `${b} joined ${e.card} on $${c.ticker}`; }
    if (c.htl) { await call(b, 'htl_register', { coin_id: c.id }); return `${b} raised a shield on $${c.ticker}`; }
  }
  await call(b, 'crank', { coin_id: c.id }); return `${b} cranked $${c.ticker}`;
}

console.log(`bots: ${BOTS.join(', ')} on ${keys.contractId}. Ctrl+C to stop.`);
while (Date.now() < until) {
  n++;
  try { const msg = await step(); ok++; if (n % 5 === 0 || /launched|played|drop|shield|raid/.test(msg)) quiet(`[${n}] ${msg}`); }
  catch (e) { if (n % 10 === 0) quiet(`[${n}] rejected: ${errMsg(e)}`); }
  await new Promise(r => setTimeout(r, 1200));
}
quiet(`done: ${ok}/${n} actions went through`);
