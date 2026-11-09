import { describe, it, expect } from 'vitest';
import * as G from './game';
import { CardType, HOUR, MIN, DAY, CARDS } from './cards';

type S = G.State;
function setup(n = 8, near = 500, cfg: Partial<G.Config> = { circleMinWallets: 3 }) {
  const s = G.newGame(Date.UTC(2026, 10, 10, 0, 0), cfg, 7);
  G.addAccount(s, 'dev', near); for (let i = 0; i < n; i++) G.addAccount(s, 'u' + i, near);
  return s;
}
const later = (s: S, ms: number) => G.tick(s, s.now + ms);
function invariants(s: S) {
  for (const c of Object.values(s.coins)) {
    expect(G.solvent(c), `${c.ticker} solvent`).toBe(true);
    const L = G.tokenLedger(s, c); expect(Math.abs(L.circ - L.accounted)).toBeLessThan(1 + 1e-6 * L.circ);
    expect(c.pot).toBeGreaterThanOrEqual(-1e-9); expect(c.prizePot).toBeGreaterThanOrEqual(-1e-9);
    for (const h of Object.values(c.holders)) expect(h.bal).toBeGreaterThanOrEqual(-1e-6);
  }
}
function give(s: S, coin: string, a: string, type: CardType) { return G.mintCard(s, coin, a, type)!; }
function grownCoin(s: S, rules: any[] = [], to = 25) {
  const c = G.launchCoin(s, 'dev', { name: 'Test Coin', ticker: 'TEST', rules });
  for (let i = 0; i < 8; i++) G.buy(s, 'u' + i, c.id, to / 8);
  later(s, 2 * HOUR); // levels climb one per 15m and tokens age past 1h
  return c;
}

describe('curve and floor lift', () => {
  it('selling everything after a burn pays out exactly the real NEAR', () => {
    const s = setup(); const c = G.launchCoin(s, 'dev', { name: 'A', ticker: 'AA' });
    G.buy(s, 'u0', c.id, 10); G.buy(s, 'u1', c.id, 5);
    const p0 = G.price(c); const h1 = c.holders.u1; const burn = h1.bal * 0.4; h1.bal -= burn;
    (G as any); // burn through the public path: sacrifice needs a card type for the tier
    c.circ -= burn; c.burned += burn; const nx = c.real * (c.y + c.circ) / c.circ; c.x = nx; c.K = c.x * c.y;
    expect(G.price(c)).toBeGreaterThan(p0);
    const r0 = c.real; G.sell(s, 'u0', c.id, c.holders.u0.bal); G.sell(s, 'u1', c.id, c.holders.u1.bal);
    expect(c.real).toBeCloseTo(0, 6); expect(r0).toBeGreaterThan(0);
  });
  it('graduates at 800M sold and refuses more buys', () => {
    const s = setup(2, 1000); const c = G.launchCoin(s, 'dev', { name: 'A', ticker: 'AA' });
    G.buy(s, 'u0', c.id, 500); expect(c.graduated).toBe(true); expect(G.sold(c)).toBeCloseTo(G.CAP, 0);
    expect(() => G.buy(s, 'u1', c.id, 1)).toThrow(/graduated/);
    expect(s.accounts.u0.near).toBeGreaterThan(300); // unused NEAR was not taken
  });
});

describe('rulebook', () => {
  it('Launch Guard caps each wallet at 1 NEAR for 10 minutes', () => {
    const s = setup(); const c = G.launchCoin(s, 'dev', { name: 'A', ticker: 'AA', rules: ['launchGuard'] });
    G.buy(s, 'u0', c.id, 0.6); expect(() => G.buy(s, 'u0', c.id, 0.6)).toThrow(/Launch Guard/);
    later(s, 11 * MIN); G.buy(s, 'u0', c.id, 5);
  });
  it('Paper Tax charges quick flips more', () => {
    const s = setup(); const c = G.launchCoin(s, 'dev', { name: 'A', ticker: 'AA', rules: ['paperTax'] });
    G.buy(s, 'u1', c.id, 5); later(s, 20 * MIN);
    const t = G.buy(s, 'u0', c.id, 2); const pot0 = c.pot; G.sell(s, 'u0', c.id, t); const quick = c.pot - pot0;
    const t2 = G.buy(s, 'u0', c.id, 2); later(s, 20 * MIN); const pot1 = c.pot; G.sell(s, 'u0', c.id, t2); const slow = c.pot - pot1;
    expect(quick).toBeGreaterThan(slow * 2);
  });
  it('Vault Seal stops the creator selling for 24h', () => {
    const s = setup(); const c = G.launchCoin(s, 'dev', { name: 'A', ticker: 'AA', rules: ['vaultSeal'], firstBuy: 1 });
    expect(() => G.sell(s, 'dev', c.id, 10)).toThrow(/Vault Seal/); later(s, DAY + MIN); G.sell(s, 'dev', c.id, 10);
  });
  it('rejects more than 3 rules and fees outside 1-2%', () => {
    const s = setup();
    expect(() => G.launchCoin(s, 'dev', { name: 'A', ticker: 'AA', rules: ['launchGuard', 'paperTax', 'holdTheLine', 'vaultSeal'] })).toThrow();
    expect(() => G.launchCoin(s, 'dev', { name: 'A', ticker: 'AB', feeRate: 0.05 })).toThrow();
  });
});

describe('levels and drops', () => {
  it('needs 15 minutes above the threshold and never re-locks', () => {
    const s = setup(); const c = G.launchCoin(s, 'dev', { name: 'A', ticker: 'AA' });
    G.buy(s, 'u0', c.id, 6); later(s, 10 * MIN); expect(c.level).toBe(1); later(s, 6 * MIN); expect(c.level).toBe(2);
    G.sell(s, 'u0', c.id, c.holders.u0.bal * 0.9); later(s, HOUR); expect(c.level).toBe(2);
  });
  it('level-up drops skip wallets that bought less than 1h before the level was crossed', () => {
    const s = setup(); const c = G.launchCoin(s, 'dev', { name: 'A', ticker: 'AA' });
    G.buy(s, 'u0', c.id, 2); later(s, 2 * HOUR);
    G.buy(s, 'u1', c.id, 50); // pumper crosses L2 and L3
    later(s, HOUR);
    expect(c.level).toBe(3);
    expect(G.hand(s, c.id, 'u1').length).toBe(0);
    expect(G.hand(s, c.id, 'u0').length).toBeGreaterThan(0);
  });
});

describe('casting limits', () => {
  it('enforces level, hold age, per-wallet cooldown and meters', () => {
    const s = setup(); const c = G.launchCoin(s, 'dev', { name: 'A', ticker: 'AA' });
    G.buy(s, 'u0', c.id, 3); const tax = give(s, c.id, 'u0', 'taxHoliday'), sb = give(s, c.id, 'u0', 'slowBurn');
    expect(G.castCheck(s, 'u0', tax.id)).toMatchObject({ ok: false, why: /held 1h/ });
    later(s, HOUR + MIN);
    expect(G.castCheck(s, 'u0', sb.id)).toMatchObject({ ok: false, why: /level 2/ });
    G.cast(s, 'u0', tax.id); expect(G.feeRate(s, c)).toBe(0);
    const t2 = give(s, c.id, 'u0', 'rollCall'); expect(G.castCheck(s, 'u0', t2.id)).toMatchObject({ ok: false, why: /30 minutes/ });
    c.spark = 2; later(s, 31 * MIN); c.spark = 2; expect(G.castCheck(s, 'u0', t2.id)).toMatchObject({ ok: false, why: /Spark/ });
  });
  it('Epic needs a full Ult meter; one Epic per wallet per day; Mythic only in an Eclipse', () => {
    const s = setup(); const c = grownCoin(s, [], 30); expect(c.level).toBeGreaterThanOrEqual(3);
    const inf = give(s, c.id, 'u0', 'inferno'); c.ult = 50;
    expect(G.castCheck(s, 'u0', inf.id)).toMatchObject({ ok: false, why: /Ult/ }); c.ult = 100; G.cast(s, 'u0', inf.id);
    const bh = give(s, c.id, 'u1', 'blackHole'); c.ult = 100; expect(G.castCheck(s, 'u1', bh.id)).toMatchObject({ ok: false, why: /one Epic/ });
    const nova = give(s, c.id, 'u2', 'supernova');
    expect(G.castCheck(s, 'u2', nova.id).ok).toBe(false);
  });
});

describe('effects', () => {
  it('Inferno burns in 12 chunks, lifts price, locks the caster 2h and respects the burn cap', () => {
    const s = setup(); const c = grownCoin(s, [], 40); G.buy(s, 'u3', c.id, 30); G.sell(s, 'u3', c.id, c.holders.u3.bal / 2); later(s, HOUR + MIN);
    const p0 = G.price(c), circ0 = c.circ; c.ult = 100; const card = give(s, c.id, 'u0', 'inferno'); const e = G.cast(s, 'u0', card.id)!;
    expect(() => G.sell(s, 'u0', c.id, 1000)).toThrow(/locked/);
    later(s, 70 * MIN); expect(e.data.done).toBe(12); expect(e.data.burned).toBeGreaterThan(0);
    expect(G.price(c)).toBeGreaterThan(p0); expect(c.burned).toBeLessThanOrEqual(0.05 * circ0 + 1);
    invariants(s);
  });
  it('Happy Hour bonus vests; selling early burns it', () => {
    const s = setup(); const c = grownCoin(s); const card = give(s, c.id, 'u0', 'happyHour'); G.cast(s, 'u0', card.id); later(s, 3 * MIN);
    G.buy(s, 'u5', c.id, 2); expect(c.holders.u5.vest.length).toBe(1);
    const burned0 = c.burned; G.sell(s, 'u5', c.id, 1000); expect(c.burned).toBeGreaterThan(burned0); expect(c.holders.u5.vest.length).toBe(0);
    G.buy(s, 'u6', c.id, 2); const b6 = c.holders.u6.bal; later(s, 7 * HOUR); expect(c.holders.u6.bal).toBeGreaterThan(b6);
    invariants(s);
  });
  it('Diamond Pool: leaving early burns 10% and pays 10% to stayers', () => {
    const s = setup(); const c = grownCoin(s); const card = give(s, c.id, 'u0', 'diamondPool'); G.cast(s, 'u0', card.id, { lock: HOUR }); later(s, 3 * MIN);
    const a = c.holders.u1.bal / 2, b = c.holders.u2.bal / 2; G.joinDiamond(s, 'u1', c.id, a); G.joinDiamond(s, 'u2', c.id, b);
    const b2 = c.holders.u2.bal; G.leaveDiamond(s, 'u1', c.id); invariants(s);
    later(s, 2 * HOUR + 5 * MIN); expect(c.holders.u2.bal).toBeCloseTo(b2 + b + a * 0.1, 0); invariants(s);
  });
  it('Summoning Circle succeeds with enough chanters and fails without', () => {
    const s = setup(8, 500, { circleMinWallets: 3, circleWalletCap: 0.03 }); const c = grownCoin(s); const card = give(s, c.id, 'u0', 'summoningCircle'); G.cast(s, 'u0', card.id); later(s, 3 * MIN);
    for (const u of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']) G.chant(s, u, c.id, c.holders[u].bal * 0.5);
    const burned0 = c.burned; later(s, 31 * MIN); expect(c.burned).toBeGreaterThan(burned0); invariants(s);
    const s2 = setup(); const c2 = grownCoin(s2); const k2 = give(s2, c2.id, 'u0', 'summoningCircle'); G.cast(s2, 'u0', k2.id); later(s2, 3 * MIN);
    const bal = c2.holders.u1.bal; G.chant(s2, 'u1', c2.id, bal / 2); later(s2, 31 * MIN); expect(c2.holders.u1.bal).toBeCloseTo(bal, 3);
  });
  it('Black Hole burns everything thrown in and badges contributors', () => {
    const s = setup(); const c = grownCoin(s, [], 30); c.ult = 100; const card = give(s, c.id, 'u0', 'blackHole'); G.cast(s, 'u0', card.id); later(s, 6 * MIN);
    G.feedBlackHole(s, 'u1', c.id, 1e6); G.feedBlackHole(s, 'u2', c.id, 2e6); const b0 = c.burned, p0 = G.price(c); later(s, HOUR);
    expect(c.burned - b0).toBeCloseTo(3e6, 0); expect(G.price(c)).toBeGreaterThan(p0);
    expect(Object.values(s.nfts).filter(n => n.kind === 'badge' && n.type === 'blackHole').length).toBe(2); invariants(s);
  });
  it('Prophecy rewards believers when net inflow hits the goal', () => {
    const s = setup(); const c = grownCoin(s); const card = give(s, c.id, 'u0', 'prophecy'); G.cast(s, 'u0', card.id, { goal: 5 }); later(s, 3 * MIN);
    G.joinProphecy(s, 'u1', c.id); G.buy(s, 'u7', c.id, 8); const h0 = G.hand(s, c.id, 'u1').length; later(s, 6 * HOUR + 5 * MIN);
    expect(G.hand(s, c.id, 'u1').length).toBe(h0 + 1);
  });
});

describe('Hold the Line', () => {
  it('triggers on a 20% drop, pays survivors, skips sellers and fresh wallets', () => {
    const s = setup(); const c = grownCoin(s, ['holdTheLine'], 40);
    G.buy(s, 'u7', c.id, 20); later(s, 2 * HOUR); // u7 is a whale that held 2h
    G.sell(s, 'u7', c.id, c.holders.u7.bal); later(s, MIN);
    expect(c.htl).not.toBeNull(); expect(c.htl!.snap.u7).toBe(undefined);
    G.sell(s, 'u1', c.id, c.holders.u1.bal / 3); // panic seller pays the toll and drops out
    expect(c.prizePot).toBeGreaterThan(0);
    G.buy(s, 'u6', c.id, 0.5); expect(Object.values(s.nfts).some(n => n.owner === 'u6' && n.type === 'dipCatcher')).toBe(true);
    const n2 = s.accounts.u2.near, n1 = s.accounts.u1.near; later(s, 6 * HOUR + MIN);
    expect(s.accounts.u2.near).toBeGreaterThan(n2); expect(s.accounts.u1.near).toBe(n1); expect(c.htl).toBeNull();
    invariants(s);
  });
});

describe('raids', () => {
  function twoCoins(level = 3) {
    const s = setup(10, 500); const a = G.launchCoin(s, 'dev', { name: 'Ape', ticker: 'APE' }), b = G.launchCoin(s, 'dev', { name: 'Bee', ticker: 'BEE' });
    for (let i = 0; i < 5; i++) G.buy(s, 'u' + i, a.id, level >= 3 ? 6 : 2); for (let i = 5; i < 10; i++) G.buy(s, 'u' + i, b.id, level >= 3 ? 6 : 2);
    later(s, 2 * HOUR); return { s, a, b };
  }
  it('friendly raid: tactics, scoring, 30% of losing stakes burn, winners get relics', () => {
    const { s, a, b } = twoCoins(); const card = give(s, a.id, 'u0', 'friendlyRaid'); G.cast(s, 'u0', card.id, { target: b.id });
    later(s, 3 * MIN); const r = Object.values(s.raids)[0]; G.acceptRaid(s, 'u5', r.id);
    G.stakeRaid(s, 'u1', r.id, a.id, 1e6); G.stakeRaid(s, 'u6', r.id, b.id, 2e6);
    const rc = give(s, a.id, 'u2', 'rally'); G.cast(s, 'u2', rc.id);
    G.buy(s, 'u3', a.id, 3); // APE out-raises BEE
    const bBurn0 = b.burned; invariants(s); later(s, 2 * HOUR + 2 * MIN);
    expect(r.status).toBe('done'); expect(r.winner).toBe(0); expect(b.burned - bBurn0).toBeCloseTo(6e5, 0);
    expect(Object.values(s.nfts).some(n => n.kind === 'relic' && n.owner === 'u1')).toBe(true); invariants(s);
  });
  it('hard raid: spoils sell loser tokens and buy + burn the winner over 1h, banner shown', () => {
    const { s, a, b } = twoCoins(); a.ult = 100; const card = give(s, a.id, 'u0', 'hardRaid'); G.cast(s, 'u0', card.id, { target: b.id });
    later(s, 6 * MIN); const r = Object.values(s.raids)[0]; G.acceptRaid(s, 'u5', r.id);
    G.stakeRaid(s, 'u1', r.id, a.id, 1e6); G.stakeRaid(s, 'u6', r.id, b.id, 4e6); G.buy(s, 'u3', a.id, 4);
    const nearTotal = G.totalNear(s), aBurn = a.burned; later(s, 2 * HOUR + 2 * MIN); expect(r.status).toBe('settling'); expect(b.bannerOf).toBe(a.id);
    later(s, 65 * MIN); expect(r.status).toBe('done'); expect(a.burned).toBeGreaterThan(aBurn);
    expect(G.totalNear(s)).toBeCloseTo(nearTotal, 6); invariants(s);
  });
  it('an unaccepted raid returns the card', () => {
    const { s, a, b } = twoCoins(2); const card = give(s, a.id, 'u0', 'friendlyRaid'); G.cast(s, 'u0', card.id, { target: b.id });
    later(s, 20 * MIN); expect(s.nfts[card.id].burned).toBe(false);
  });
  it('tactic triangle has no dominant card', () => {
    const t: CardType[] = ['rally', 'curse', 'ward'];
    for (const me of t) { const wins = t.filter(op => G.tacticMult(me, op) > G.tacticMult(op, me)).length, losses = t.filter(op => G.tacticMult(me, op) < G.tacticMult(op, me)).length; expect(wins).toBe(1); expect(losses).toBe(1); }
  });
});

describe('getting cards', () => {
  it('crafts 3 of a tier into 1 of the next and sacrifices by share of supply', () => {
    const s = setup(); const c = grownCoin(s); const ids = ['ward', 'rally', 'rebrand'].map(t => give(s, c.id, 'u0', t as CardType).id);
    expect(() => G.craft(s, 'u0', ids, 'inferno')).toThrow(/Rare/); const r = G.craft(s, 'u0', ids, 'slowBurn'); expect(r.tier).toBe('Rare');
    const tiny = c.circ * 0.0001; expect(() => G.sacrifice(s, 'u1', c.id, tiny, 'ward')).toThrow();
    const n = G.sacrifice(s, 'u1', c.id, c.circ * 0.003, 'curse'); expect(n.tier).toBe('Rare'); invariants(s);
  });
  it('hand limit, Card of the Day once a day, Commons cannot be transferred', () => {
    const s = setup(); const c = grownCoin(s); G.checkIn(s, 'u1', c.id); const cd = G.claimCardOfDay(s, 'u1', c.id);
    expect(() => G.claimCardOfDay(s, 'u1', c.id)).toThrow(/today/);
    expect(() => G.transferNft(s, 'u1', 'u2', cd.id)).toThrow(/cannot be transferred/);
    while (G.hand(s, c.id, 'u3').length < 7) give(s, c.id, 'u3', 'ward'); expect(G.mintCard(s, c.id, 'u3', 'ward')).toBeNull();
  });
});

describe('fuzz: random play never breaks the money', () => {
  it('2000 random actions across two coins keep every invariant', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = setup(10, 400); const coins = [G.launchCoin(s, 'dev', { name: 'A', ticker: 'AAA', rules: ['holdTheLine', 'paperTax'] }), G.launchCoin(s, 'dev', { name: 'B', ticker: 'BBB', rules: ['launchGuard'] })];
      let r = seed * 99991; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
      const types = Object.keys(CARDS) as CardType[]; const near0 = G.totalNear(s);
      for (let i = 0; i < 2000; i++) {
        const u = 'u' + Math.floor(rnd() * 10), c = coins[Math.floor(rnd() * 2)], k = rnd();
        try {
          if (k < 0.3) G.buy(s, u, c.id, 0.05 + rnd() * 4);
          else if (k < 0.5) { const h = c.holders[u]; if (h?.bal) G.sell(s, u, c.id, h.bal * rnd()); }
          else if (k < 0.58) G.checkIn(s, u, c.id);
          else if (k < 0.66) { const card = G.mintCard(s, c.id, u, types[Math.floor(rnd() * types.length)]); if (card) G.cast(s, u, card.id, { target: coins.find(x => x !== c)!.id, lock: HOUR, goal: 5 }); }
          else if (k < 0.72) { const e = c.effects.find(e => e.status === 'active'); const amt = (c.holders[u]?.bal || 0) * 0.3;
            if (e?.type === 'diamondPool') G.joinDiamond(s, u, c.id, amt); if (e?.type === 'blackHole') G.feedBlackHole(s, u, c.id, amt); if (e?.type === 'summoningCircle') G.chant(s, u, c.id, amt); }
          else if (k < 0.76) { const rd = Object.values(s.raids).find(x => x.status !== 'done'); if (rd?.status === 'pending') G.acceptRaid(s, u, rd.id); else if (rd) G.stakeRaid(s, u, rd.id, c.id, (c.holders[u]?.bal || 0) * 0.3); }
          else if (k < 0.78) G.leaveDiamond(s, u, c.id);
          else later(s, Math.floor(rnd() * 90) * MIN);
        } catch (e: any) { if (!(e instanceof Error) || /undefined|NaN|Cannot read/.test(e.message)) throw e; }
        if (i % 50 === 0) { invariants(s); expect(G.totalNear(s)).toBeCloseTo(near0, 6); }
      }
      later(s, 2 * DAY); invariants(s); expect(G.totalNear(s)).toBeCloseTo(near0, 6);
    }
  });
});
