// Drop tables by level: how many Rare / Epic / Mythic cards enter a coin per day vs how many can be played.
// Monte Carlo over a 72h coin. Run: node research/drop-tables-sim.cjs
let S = 7; const rnd = () => (S = (S * 16807) % 2147483647) / 2147483647;
const roll = (t) => { let r = rnd() * 100; for (const k of ['C', 'R', 'E', 'M']) { r -= t[k] || 0; if (r <= 0) return k; } return 'C'; };

// Coin: hours per level, card players at the END of each level (half active, half casual)
const LV = { 1: { h: 6, pop: 15 }, 2: { h: 18, pop: 40 }, 3: { h: 18, pop: 80 }, 4: { h: 30, pop: 120 } };
const COST = { C: 5, R: 20, E: 50, M: 100 };
const DECK = { R: 150, E: 20, M: 4 }; // total ever per coin
const HAND = { R: 3, E: 3, M: 1 };

const D = {
  pack: { 1: { C: 100 }, 2: { C: 92, R: 8 }, 3: { C: 86, R: 11, E: 3 }, 4: { C: 80, R: 14, E: 5, M: 1 } },
  win: { 2: { C: 75, R: 25 }, 3: { C: 62, R: 30, E: 8 }, 4: { C: 52, R: 34, E: 12, M: 2 } },
  level: { 2: { C: 75, R: 25 }, 3: { C: 66, R: 30, E: 4 }, 4: { C: 64, R: 30, E: 6 } },
  jackpot: { 3: 'E', 4: 'M' }, // one guaranteed card to one random qualified wallet at the crossing
};

function life(cfg, seed) {
  S = seed;
  const out = {}; for (const L of [1, 2, 3, 4]) out[L] = { R: 0, E: 0, M: 0, dropped: { R: 0, E: 0, M: 0 }, played: { C: 0, R: 0, E: 0, M: 0 }, energy: 0, hours: LV[L].h };
  const players = []; let deck = { ...DECK }, energy = 0, raidWait = 0;
  const give = (p, k, L) => {
    if (k === 'C') return;
    if (deck[k] <= 0) k = k === 'M' ? 'E' : k === 'E' ? 'R' : 'C'; // out of stock -> next tier down
    if (k === 'C' || deck[k] <= 0) return;
    if (p.hand[k] >= HAND[k]) { out[L].dropped[k]++; return; } // player drops one to make room (net zero in hand)
    deck[k]--; p.hand[k]++; out[L][k]++;
  };
  let h = 0;
  for (const L of [1, 2, 3, 4]) {
    const start = players.length, target = LV[L].pop, prevPop = L === 1 ? 0 : LV[L - 1].pop;
    if (L > 1) { // level crossing: drops + jackpot
      const q = players.filter((p) => p.join < h - 1);
      for (const p of q) for (let i = 0; i < 3; i++) give(p, roll(cfg.level[L]), L);
      if (cfg.jackpot[L] && q.length) give(q[Math.floor(rnd() * q.length)], cfg.jackpot[L], L);
    }
    for (let t = 0; t < LV[L].h; t++, h++) {
      while (players.length < prevPop + (target - prevPop) * (t + 1) / LV[L].h) players.push({ join: h, active: rnd() < 0.5, off: Math.floor(rnd() * 24), last: -99, hand: { R: 0, E: 0, M: 0 } });
      for (const p of players) {
        if (p.join > h - 1) continue;
        const gm = p.active ? (h - p.off) % 6 === 0 : (h - p.off) % 24 === 0;
        if (gm) { energy = Math.min(100, energy + 1); out[L].energy++; }
        if (gm && h - p.last >= 6) { p.last = h; for (let i = 0; i < 2; i++) give(p, roll(cfg.pack[L]), L); }
      }
      energy = Math.min(100, energy + (cfg.buyEnergy ? cfg.buyEnergy[L] / 24 : 0));
      // raids: one per 8h from L2, win half
      if (L >= 2 && --raidWait <= 0) { raidWait = 8; if (rnd() < 0.5) for (const p of players) if (p.join < h - 1 && rnd() < 0.5) for (let i = 0; i < 3; i++) give(p, roll(cfg.win[L]), L); }
      // spend energy: holders play the best card they can afford (Mythic > Epic > Rare > Common), within table limits
      const hourOfDay = h % 24; if (hourOfDay === 0) out._epicToday = 0;
      for (const k of ['M', 'E', 'R']) {
        if (L < { R: 2, E: 3, M: 4 }[k]) continue;
        if ((k === 'E' || k === 'M') && (out._epicToday || 0) >= 3) continue;
        const holder = players.find((p) => p.hand[k] > 0);
        if (holder && energy >= COST[k] && rnd() < 0.5) { energy -= COST[k]; holder.hand[k]--; deck[k]++; out[L].played[k]++; if (k !== 'R') out._epicToday = (out._epicToday || 0) + 1; }
      }
      if (energy >= COST.C + 40) { energy -= COST.C; out[L].played.C++; }
    }
  }
  out.held = { R: players.reduce((a, p) => a + p.hand.R, 0), E: players.reduce((a, p) => a + p.hand.E, 0), M: players.reduce((a, p) => a + p.hand.M, 0) };
  return out;
}

function report(name, cfg, runs = 40) {
  const sum = {}; const add = (k, v) => (sum[k] = (sum[k] || 0) + v / runs);
  for (let r = 0; r < runs; r++) {
    const o = life(cfg, 100 + r);
    for (const L of [2, 3, 4]) { const d = 24 / LV[L].h; for (const k of ['R', 'E', 'M']) { add(`in${L}${k}`, o[L][k] * d); add(`pl${L}${k}`, o[L].played[k] * d); add(`dr${L}${k}`, o[L].dropped[k] * d); } add(`en${L}`, o[L].energy * d); add(`plC${L}`, o[L].played.C * d); }
    for (const k of ['R', 'E', 'M']) add(`held${k}`, o.held[k]);
  }
  console.log(`\n=== ${name} ===`);
  console.log('level | per day: Rares in / played / dropped | Epics in / played / dropped | Mythics in / played | Commons fired | check-in Energy');
  for (const L of [2, 3, 4]) {
    const f = (k) => (sum[k] || 0).toFixed(1).padStart(5);
    console.log(`  L${L}  | ${f(`in${L}R`)} / ${f(`pl${L}R`)} / ${f(`dr${L}R`)}            | ${f(`in${L}E`)} / ${f(`pl${L}E`)} / ${f(`dr${L}E`)}          | ${f(`in${L}M`)} / ${f(`pl${L}M`)}         | ${f(`plC${L}`)}         | ${f(`en${L}`)}`);
  }
  console.log(`  still held at graduation: Rares ${sum.heldR.toFixed(0)}, Epics ${sum.heldE.toFixed(1)}, Mythics ${sum.heldM.toFixed(1)}`);
}

report('A. Check-in Energy only', D);
report('B. + Energy from net buying (+1 per 10 NEAR, ~L2 90 / L3 360 / L4 950 a day)', { ...D, buyEnergy: { 1: 0, 2: 90, 3: 360, 4: 950 } });

// ---- Version 2: circulation caps. Only N cards of a tier can exist on a coin at once; a played card frees a spot.
function life2(cfg, seed) {
  S = seed;
  const out = {}; for (const L of [1, 2, 3, 4]) out[L] = { R: 0, E: 0, M: 0, down: { R: 0, E: 0, M: 0 }, played: { C: 0, R: 0, E: 0, M: 0 } };
  const players = []; const circ = { R: 0, E: 0, M: 0 }; let energy = 0, raidWait = 0, epicToday = 0, h = 0;
  const give = (p, k, L) => {
    while (k !== 'C' && (circ[k] >= (cfg.cap[L][k] || 0) || p.hand[k] >= HAND[k])) { if (circ[k] >= (cfg.cap[L][k] || 0)) out[L].down[k]++; k = k === 'M' ? 'E' : k === 'E' ? 'R' : 'C'; }
    if (k === 'C') return; circ[k]++; p.hand[k]++; p.ever[k] = 1; out[L][k]++;
  };
  for (const L of [1, 2, 3, 4]) {
    const prevPop = L === 1 ? 0 : LV[L - 1].pop, target = LV[L].pop;
    if (L > 1) { const q = players.filter((p) => p.join < h - 1); for (const p of q) for (let i = 0; i < 3; i++) give(p, roll(cfg.level[L]), L); if (cfg.jackpot[L] && q.length) give(q[Math.floor(rnd() * q.length)], cfg.jackpot[L], L); }
    for (let t = 0; t < LV[L].h; t++, h++) {
      while (players.length < prevPop + (target - prevPop) * (t + 1) / LV[L].h) players.push({ join: h, joinL: L, active: rnd() < 0.5, off: Math.floor(rnd() * 24), last: -99, hand: { R: 0, E: 0, M: 0 }, ever: {} });
      for (const p of players) {
        if (p.join > h - 1) continue;
        const gm = p.active ? (h - p.off) % 6 === 0 : (h - p.off) % 24 === 0;
        if (gm) energy = Math.min(100, energy + 1);
        if (gm && h - p.last >= 6) { p.last = h; for (let i = 0; i < 2; i++) give(p, roll(cfg.pack[L]), L); }
      }
      energy = Math.min(100, energy + cfg.buyEnergy[L] / 24);
      if (L >= 2 && --raidWait <= 0) { raidWait = 8; if (rnd() < 0.5) for (const p of players) if (p.join < h - 1 && rnd() < 0.5) for (let i = 0; i < 3; i++) give(p, roll(cfg.win[L]), L); }
      if (h % 24 === 0) epicToday = 0;
      for (const k of ['M', 'E', 'R']) {
        if (L < { R: 2, E: 3, M: 4 }[k]) continue;
        if (k !== 'R' && epicToday >= 3) continue;
        const holder = players.find((p) => p.hand[k] > 0);
        if (holder && energy >= COST[k] && rnd() < 0.5) { energy -= COST[k]; holder.hand[k]--; circ[k]--; out[L].played[k]++; if (k !== 'R') epicToday++; }
      }
      if (energy >= COST.C + 40) { energy -= COST.C; out[L].played.C++; }
    }
    out[L].ever = { R: players.filter((p) => p.ever.R).length / players.length, E: players.filter((p) => p.ever.E).length / players.length, M: players.filter((p) => p.ever.M).length / players.length };
  }
  return out;
}
function report2(name, cfg, runs = 40) {
  const s = {}; const add = (k, v) => (s[k] = (s[k] || 0) + v / runs);
  for (let r = 0; r < runs; r++) { const o = life2(cfg, 300 + r); for (const L of [2, 3, 4]) { const d = 24 / LV[L].h; for (const k of ['R', 'E', 'M']) { add(`in${L}${k}`, o[L][k] * d); add(`pl${L}${k}`, o[L].played[k] * d); add(`dn${L}${k}`, o[L].down[k] * d); add(`ev${L}${k}`, o[L].ever[k] * 100); } } }
  console.log(`\n=== ${name} ===`);
  console.log('level | per day: Rares dropped / played / rolls blocked by cap | Epics dropped / played / blocked | Mythics dropped / played | players who have ever held R / E / M');
  for (const L of [2, 3, 4]) { const f = (k) => (s[k] || 0).toFixed(1).padStart(5); console.log(`  L${L}  | ${f(`in${L}R`)} / ${f(`pl${L}R`)} / ${f(`dn${L}R`)}                        | ${f(`in${L}E`)} / ${f(`pl${L}E`)} / ${f(`dn${L}E`)}              | ${f(`in${L}M`)} / ${f(`pl${L}M`)}              | ${f(`ev${L}R`)}% / ${f(`ev${L}E`)}% / ${f(`ev${L}M`)}%`); }
}
const CAP = { 1: {}, 2: { R: 8 }, 3: { R: 15, E: 3 }, 4: { R: 25, E: 6, M: 2 } };
const BUY = { 1: 0, 2: 90, 3: 360, 4: 950 };
report2('C. Circulation caps (R 8/15/25, E 3/6, M 2) + buy Energy, same odds', { ...D, cap: CAP, buyEnergy: BUY });
report2('D. C with lower pack odds', { ...D, cap: CAP, buyEnergy: BUY, pack: { 1: { C: 100 }, 2: { C: 96, R: 4 }, 3: { C: 93, R: 5, E: 2 }, 4: { C: 90, R: 6, E: 3, M: 1 } } });

// ---- Version 3: per-card caps (each card has its own copy limit on a coin) + luck (pity), no jackpot.
const CARDS = {
  R: { Raid: [2, 3, 4], Prophecy: [2, 3, 4], Duel: [1, 2, 4], Counterspell: [1, 2, 3], LastStand: [1, 2, 3], Recruit: [1, 1, 3], DiamondRush: [0, 1, 2], SlowBurn: [0, 1, 2] }, // caps at L2 / L3 / L4
  E: { Inferno: [0, 1, 1], Storm: [0, 1, 1], BlackHole: [0, 1, 1], Heist: [0, 1, 1], War: [0, 0, 1], WhaleTax: [0, 1, 1], Alliance: [0, 0, 1], Harvest: [0, 0, 1] },
  M: { Supernova: [0, 0, 1], Conquest: [0, 0, 1] },
};
function life3(cfg, seed) {
  S = seed;
  const out = {}; for (const L of [1, 2, 3, 4]) out[L] = { R: 0, E: 0, M: 0, blocked: 0, rolls: 0, played: { R: 0, E: 0, M: 0 }, types: new Set() };
  const players = []; const circ = {}; let energy = 0, raidWait = 0, epicToday = 0, h = 0;
  const capOf = (k, c, L) => (L < 2 ? 0 : CARDS[k][c][L - 2]);
  const give = (p, k, L) => {
    out[L].rolls++;
    while (k !== 'C') {
      const open = Object.keys(CARDS[k]).filter((c) => (circ[c] || 0) < capOf(k, c, L));
      if (open.length && p.hand[k] < HAND[k]) { const c = open[Math.floor(rnd() * open.length)]; circ[c] = (circ[c] || 0) + 1; p.hand[k]++; p.cards.push(c); p.cardT.push(h); p.ever[k] = 1; out[L][k]++; out[L].types.add(c); return true; }
      out[L].blocked++; k = k === 'M' ? 'E' : k === 'E' ? 'R' : 'C';
    }
    return false;
  };
  const claim = (p, n, table, L) => {
    let good = false;
    for (let i = 0; i < n; i++) {
      let k = roll(table);
      if (i === 0 && cfg.pity && p.luck >= cfg.pity && L >= 2) { k = L === 4 ? (rnd() < 0.2 ? 'E' : 'R') : L === 3 ? (rnd() < 0.15 ? 'E' : 'R') : 'R'; }
      if (give(p, k, L)) good = true;
    }
    p.luck = good ? 0 : p.luck + 1;
  };
  for (const L of [1, 2, 3, 4]) {
    const prevPop = L === 1 ? 0 : LV[L - 1].pop, target = LV[L].pop;
    if (L > 1) for (const p of players.filter((p) => p.join < h - 1)) claim(p, 3, cfg.level[L], L);
    for (let t = 0; t < LV[L].h; t++, h++) {
      while (players.length < prevPop + (target - prevPop) * (t + 1) / LV[L].h) players.push({ join: h, active: rnd() < 0.5, off: Math.floor(rnd() * 24), last: -99, hand: { R: 0, E: 0, M: 0 }, cards: [], cardT: [], ever: {}, luck: 0 });
      for (const p of players) {
        if (p.join > h - 1) continue;
        const gm = p.active ? (h - p.off) % 6 === 0 : (h - p.off) % 24 === 0;
        if (gm) energy = Math.min(100, energy + 1);
        if (gm && h - p.last >= 6) { p.last = h; claim(p, 2, cfg.pack[L], L); }
      }
      energy = Math.min(100, energy + cfg.buyEnergy[L] / 24);
      if (cfg.expire) for (const p of players) for (let i = p.cards.length - 1; i >= 0; i--) if (h - p.cardT[i] >= cfg.expire) { const c = p.cards[i], k = Object.keys(CARDS).find((q) => c in CARDS[q]); p.cards.splice(i, 1); p.cardT.splice(i, 1); circ[c]--; p.hand[k]--; out[L].expired = (out[L].expired || 0) + 1; }
      if (L >= 2 && --raidWait <= 0) { raidWait = 8; if (rnd() < 0.5) for (const p of players) if (p.join < h - 1 && rnd() < 0.5) claim(p, 3, cfg.win[L], L); }
      if (h % 24 === 0) epicToday = 0;
      for (const k of ['M', 'E', 'R']) {
        if (L < { R: 2, E: 3, M: 4 }[k] || (k !== 'R' && epicToday >= 3)) continue;
        const holder = players.find((p) => p.hand[k] > 0);
        if (holder && energy >= COST[k] && rnd() < 0.5) {
          energy -= COST[k]; holder.hand[k]--;
          const c = holder.cards.find((x) => Object.keys(CARDS[k]).includes(x)); const ix = holder.cards.indexOf(c); holder.cards.splice(ix, 1); holder.cardT.splice(ix, 1); circ[c]--;
          out[L].played[k]++; if (k !== 'R') epicToday++;
        }
      }
    }
    out[L].ever = { R: players.filter((p) => p.ever.R).length / players.length, E: players.filter((p) => p.ever.E).length / players.length, M: players.filter((p) => p.ever.M).length / players.length };
    out[L].nTypes = out[L].types.size;
  }
  return out;
}
function report3(name, cfg, runs = 40) {
  const s = {}; const add = (k, v) => (s[k] = (s[k] || 0) + v / runs);
  for (let r = 0; r < runs; r++) { const o = life3(cfg, 500 + r); for (const L of [2, 3, 4]) { const d = 24 / LV[L].h; for (const k of ['R', 'E', 'M']) { add(`in${L}${k}`, o[L][k] * d); add(`pl${L}${k}`, o[L].played[k] * d); add(`ev${L}${k}`, o[L].ever[k] * 100); } add(`bl${L}`, o[L].blocked / o[L].rolls * 100); add(`ty${L}`, o[L].nTypes); } }
  console.log(`\n=== ${name} ===`);
  console.log('level | per day: Rares in / played | Epics in / played | Mythics in / played | rolls pushed down a tier | different Rare+ cards seen | players who have ever held R / E / M');
  for (const L of [2, 3, 4]) { const f = (k, d = 1) => (s[k] || 0).toFixed(d).padStart(5); console.log(`  L${L}  | ${f(`in${L}R`)} / ${f(`pl${L}R`)}       | ${f(`in${L}E`)} / ${f(`pl${L}E`)}     | ${f(`in${L}M`)} / ${f(`pl${L}M`)}       | ${f(`bl${L}`, 0)}%                   | ${f(`ty${L}`)}                     | ${f(`ev${L}R`, 0)}% / ${f(`ev${L}E`, 0)}% / ${f(`ev${L}M`, 0)}%`); }
}
const P3 = { ...D, buyEnergy: BUY, pack: { 1: { C: 100 }, 2: { C: 96, R: 4 }, 3: { C: 93, R: 5, E: 2 }, 4: { C: 90, R: 6, E: 3, M: 1 } } };
report3('P1. Per-card caps (Rares 8/15/25, Epics 1 copy each: 5 at L3, 8 at L4; Mythics 1 each), no jackpot', P3);
report3('P2. P1 + Luck: after 6 claims with no Rare+, the next claim\'s first card is Rare+', { ...P3, pity: 6 });
report3('P3. P1 + Luck after 4 claims', { ...P3, pity: 4 });

report3('P4. P1 + unplayed Rare+ returns to the deck after 24h', { ...P3, expire: 24 });
report3('P5. P1 + returns after 12h', { ...P3, expire: 12 });
