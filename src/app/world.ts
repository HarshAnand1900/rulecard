// Local world: accounts, seed coins, the minute-by-minute driver and the bot crowd that keeps coins alive.
import * as G from '../engine/game';
import { CARDS, CardType, HOUR, MIN } from '../engine/cards';

export const HUMANS = ['you', 'alice', 'bob'];
export const BOTS = Array.from({ length: 24 }, (_, i) => 'bot' + (i + 1));
const KEY = 'rulecard-world-v1';

type Persona = 'degen' | 'holder' | 'sniper';
const persona = (b: string): Persona => { const n = +b.slice(3); return n % 3 === 0 ? 'sniper' : n % 3 === 1 ? 'holder' : 'degen'; };

let r = 987654321; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const tryIt = (f: () => unknown) => { try { f(); return true; } catch { return false; } };

export function seedWorld(): G.State {
  const s = G.newGame(Date.UTC(2026, 10, 10, 1, 0), { circleMinWallets: 5, circleWalletCap: 0.03 }, 1234);
  HUMANS.forEach(h => G.addAccount(s, h, 100)); BOTS.forEach(b => G.addAccount(s, b, 150));
  const moth = G.launchCoin(s, 'bot1', { name: 'Moth Lamp', ticker: 'MOTH', rules: ['holdTheLine', 'paperTax', 'vaultSeal'] });
  const zap = G.launchCoin(s, 'bot2', { name: 'Zap Cat', ticker: 'ZAP', rules: ['launchGuard', 'holdTheLine'] });
  G.tick(s, s.now + 11 * MIN);
  G.buy(s, 'you', moth.id, 3); G.buy(s, 'alice', zap.id, 2); G.buy(s, 'bob', moth.id, 1.5); G.buy(s, 'bob', zap.id, 1.5);
  for (const t of ['happyHour', 'rally', 'ward'] as CardType[]) G.mintCard(s, moth.id, 'you', t);
  for (const t of ['diamondPool', 'curse'] as CardType[]) G.mintCard(s, zap.id, 'alice', t);
  G.mintCard(s, moth.id, 'bob', 'summoningCircle');
  s.log.push({ t: s.now, coin: null, kind: 'info', text: 'Welcome packs: you got Happy Hour, Rally and Ward for $MOTH' });
  for (let m = 0; m < 4 * 60; m++) step(s); // 4h of crowd activity before you arrive
  return s;
}

export function step(s: G.State) { G.tick(s, Math.floor(s.now / MIN) * MIN + MIN); bots(s); }

export function save(s: G.State) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } }
export function load(): G.State | null { try { const t = localStorage.getItem(KEY); return t ? JSON.parse(t) : null; } catch { return null; } }
export function wipe() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

// ----------------------------------------------------------------- the crowd
const hype: Record<string, number> = {};
function bots(s: G.State) {
  const coins = Object.values(s.coins);
  for (const c of coins) {
    hype[c.id] = Math.max(0.3, Math.min(3, (hype[c.id] ?? 1.2) * (0.995 + rnd() * 0.01) + (rnd() < 0.003 ? 1 : 0)));
    const age = (s.now - c.createdAt) / HOUR, fresh = age < 1;
    for (const b of BOTS) {
      const p = persona(b), h = c.holders[b], bal = h?.bal || 0, a = s.accounts[b];
      const buyP = (p === 'degen' ? 0.012 : p === 'holder' ? 0.006 : fresh ? 0.08 : 0.002) * hype[c.id];
      if (rnd() < buyP && a.near > 1) tryIt(() => G.buy(s, b, c.id, Math.min(a.near * 0.5, 0.1 + rnd() * (p === 'sniper' ? 2 : 1.2))));
      if (bal > 0) {
        const panic = c.htl ? (p === 'degen' ? 0.02 : 0.001) : 0;
        const sellP = (p === 'degen' ? 0.01 : p === 'holder' ? 0.0015 : age > 1 ? 0.03 : 0.004) + panic;
        if (rnd() < sellP) tryIt(() => G.sell(s, b, c.id, bal * (p === 'sniper' ? 1 : 0.2 + rnd() * 0.6)));
        if (p !== 'sniper' && rnd() < 0.03) { tryIt(() => G.checkIn(s, b, c.id)); tryIt(() => G.claimCardOfDay(s, b, c.id)); }
      }
      if (rnd() < 0.004) botCast(s, b, c);
      joinStuff(s, b, c, p);
    }
  }
  for (const rd of Object.values(s.raids)) {
    if (rd.status === 'pending' && rnd() < 0.15) { const holder = BOTS.find(b => G.eligible(s, s.coins[rd.sides[1].coin], b)); if (holder) tryIt(() => G.acceptRaid(s, holder, rd.id)); }
    if (rd.status === 'active') for (const sd of rd.sides) { const b = pick(BOTS), bal = s.coins[sd.coin].holders[b]?.bal || 0; if (bal && rnd() < 0.05) tryIt(() => G.stakeRaid(s, b, rd.id, sd.coin, bal * 0.3)); }
  }
  if (rnd() < 1 / (8 * 60) && coins.length < 6) {
    const names = [['Pixel Yak', 'PYAK'], ['Moon Sock', 'MSOCK'], ['Grumpy Bean', 'BEAN'], ['Laser Duck', 'LDUCK'], ['Tiny Kraken', 'TKRK']];
    const n = names.find(([, t]) => !coins.some(c => c.ticker === t)); const dev = pick(BOTS);
    if (n) tryIt(() => G.launchCoin(s, dev, { name: n[0], ticker: n[1], rules: [pick(['holdTheLine', 'paperTax']), pick(['launchGuard', 'vaultSeal'])] as any, firstBuy: 1 }));
  }
}
function botCast(s: G.State, b: string, c: G.Coin) {
  for (const n of G.hand(s, c.id, b)) {
    const t = n.type as CardType, targets = Object.values(s.coins).filter(x => x.id !== c.id && x.level >= (t === 'hardRaid' ? 3 : 2));
    const o = { target: targets.length ? pick(targets).id : undefined, lock: pick([HOUR, 6 * HOUR]), goal: Math.max(1, 0.05 * c.real) * 1.4, skin: pick(['neon', 'gold', 'void']) };
    if (G.castCheck(s, b, n.id, o).ok && tryIt(() => G.cast(s, b, n.id, o))) return;
  }
}
function joinStuff(s: G.State, b: string, c: G.Coin, p: Persona) {
  const bal = c.holders[b]?.bal || 0; if (!bal || rnd() > 0.02) return;
  for (const e of c.effects) {
    if (e.status !== 'active') continue;
    if (e.type === 'diamondPool' && s.now < e.endsAt && p === 'holder') tryIt(() => G.joinDiamond(s, b, c.id, bal * 0.4));
    if (e.type === 'summoningCircle') tryIt(() => G.chant(s, b, c.id, bal * 0.2));
    if (e.type === 'blackHole' && p !== 'sniper') tryIt(() => G.feedBlackHole(s, b, c.id, bal * 0.05));
    if (e.type === 'prophecy') tryIt(() => G.joinProphecy(s, b, c.id));
  }
  if (p === 'degen' && rnd() < 0.05) tryIt(() => G.leaveDiamond(s, b, c.id));
}
export const cardName = (t: string) => (CARDS as any)[t]?.name ?? t;
