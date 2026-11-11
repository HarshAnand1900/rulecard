// v7 card odds: the user's new drop tables, pyramid limits, adaptive eligibility and adaptive signers.
// Full coin life, 40 runs, 3 coin sizes. Compares v6 odds with v7 odds and the fallbacks.
// Run: node research/odds-v7-sim.cjs [options letters]
let S = 1; const rnd = () => (S = (S * 16807) % 2147483647) / 2147483647;
const logn = (m, s) => Math.exp(Math.log(m) + s * Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd()));
const roll = (t) => { let r = rnd() * 100; for (const k of ['C', 'R', 'E', 'M']) { r -= t[k] || 0; if (r <= 0) return k; } return 'C'; };

const ELIG = { R: [3, 1], E: [5, 2], M: [10, 4] };        // NEAR held, hours held
const ELIG_FLOOR = { R: 1, E: 2, M: 4 };                  // adaptive: never below this NEAR
const ELIG_MIN_N = { R: 10, E: 6, M: 4 };                 // adaptive: lower the bar until this many qualify
const HAND = { C: 12, R: 3, E: 3, M: 1 };
const COST = { C: 5, R: 20, E: 50, M: 100 };
const RATIO = { R: 2, E: 5, M: 12 }, MIN = { R: 8, E: 4, M: 2 };
const SIGN_FIXED = { 1: { R: 10, E: 25, M: 60 }, 2: { R: 10, E: 25, M: 60 }, 3: { R: 20, E: 25, M: 60 }, 4: { R: 30, E: 40, M: 60 } };
const SIGN_ADAPT = { R: [5, 0.2, 30], E: [8, 0.3, 40], M: [12, 0.4, 60] }; // min, share of active qualified wallets, max
const TACTIC = 0.6; // share of Common draws that are Rally / Curse / Ward (20% each)

const ODDS = {
  v6: {
    PACK: { 1: { C: 100 }, 2: { C: 96, R: 4 }, 3: { C: 93, R: 5, E: 2 }, 4: { C: 90, R: 6, E: 3, M: 1 } },
    WIN: { 2: { C: 75, R: 25 }, 3: { C: 62, R: 30, E: 8 }, 4: { C: 52, R: 34, E: 12, M: 2 } },
    DROP: { 2: { C: 75, R: 25 }, 3: { C: 66, R: 30, E: 4 }, 4: { C: 64, R: 30, E: 6 } },
    UNLOCK: { R: 2, E: 3, M: 4 },
  },
  v7: {
    PACK: { 1: { C: 90, R: 8, E: 2 }, 2: { C: 85, R: 10, E: 5 }, 3: { C: 50, R: 20, E: 20, M: 10 }, 4: { C: 40, R: 25, E: 25, M: 10 } },
    WIN: { 2: { C: 70, R: 15, E: 10, M: 5 }, 3: { C: 45, R: 20, E: 20, M: 15 }, 4: { C: 35, R: 25, E: 25, M: 15 } },
    DROP: { 2: { C: 65, R: 20, E: 10, M: 5 }, 3: { C: 40, R: 25, E: 20, M: 15 }, 4: { C: 25, R: 20, E: 30, M: 25 } },
    UNLOCK: { R: 1, E: 1, M: 2 },
  },
};

const SIZES = {
  small: { lvl: [6, 18, 18, 30], pop: [15, 30, 55, 80], buyE: [10, 70, 250, 600] },
  normal: { lvl: [6, 18, 18, 30], pop: [15, 40, 80, 120], buyE: [15, 90, 360, 950] },
  big: { lvl: [4, 12, 16, 36], pop: [25, 80, 160, 260], buyE: [30, 160, 700, 1800] },
};

function life(opt, size, seed) {
  S = seed;
  const O = ODDS[opt.odds], Z = SIZES[size], ends = []; let acc = 0; for (const d of Z.lvl) ends.push(acc += d);
  const T = ends[3], levelAt = (h) => ends.findIndex((e) => h < e) + 1 || 4;
  const players = []; const stock = { R: 0, E: 0, M: 0 }; let energy = 0, epicToday = 0, raidClock = 0;
  const m = { 1: {}, 2: {}, 3: {}, 4: {} }; const M = (L, k, v = 1) => { m[L][k] = (m[L][k] || 0) + v; };
  const timeOk = (p, k, h) => h - p.join >= ELIG[k][1];
  let bar = { ...Object.fromEntries(Object.entries(ELIG).map(([k, v]) => [k, v[0]])) };
  const updateBars = (h) => {
    for (const k of ['R', 'E', 'M']) {
      bar[k] = ELIG[k][0];
      if (!opt.adaptElig) continue;
      const holds = players.filter((p) => timeOk(p, k, h)).map((p) => p.hold).sort((a, b) => b - a);
      const n = holds.filter((x) => x >= ELIG[k][0]).length;
      if (n < ELIG_MIN_N[k]) bar[k] = Math.max(ELIG_FLOOR[k], holds[ELIG_MIN_N[k] - 1] ?? ELIG_FLOOR[k]);
    }
  };
  const eligible = (p, k, h) => p.hold >= bar[k] && timeOk(p, k, h);
  const cap = (k, L, h) => (L < O.UNLOCK[k] ? 0 : Math.max(MIN[k], Math.floor(players.filter((p) => eligible(p, k, h)).length / RATIO[k])));
  const tierCanRoll = (t, L) => ['R', 'E', 'M'].filter((k) => (t[k] || 0) > 0 && L >= O.UNLOCK[k]);
  const claim = (p, t, n, L, h) => {
    // make room first: n Common slots + 1 slot in each higher tier the claim can roll (that you are eligible for)
    const need = tierCanRoll(t, L).filter((k) => eligible(p, k, h));
    if (need.some((k) => p.hand[k] >= HAND[k])) { M(L, 'claimBlocked'); return false; }
    while (p.hand.C > HAND.C - n) { p.hand.C--; p.tac = Math.max(0, p.tac - (rnd() < TACTIC ? 1 : 0)); M(L, 'dropC'); }
    M(L, 'claims');
    for (let i = 0; i < n; i++) give(p, roll(t), L, h);
    return true;
  };
  const give = (p, k, L, h) => {
    M(L, 'rolls');
    while (k !== 'C') {
      if (L >= O.UNLOCK[k] && eligible(p, k, h) && p.hand[k] < HAND[k] && stock[k] < cap(k, L, h)) {
        stock[k]++; p.hand[k]++; p.cards.push([k, h]); M(L, 'got' + k); return;
      }
      M(L, 'down' + k); k = k === 'M' ? 'E' : k === 'E' ? 'R' : 'C';
    }
    p.hand.C++; M(L, 'gotC'); if (rnd() < TACTIC) p.tac++;
  };
  const removeCard = (p, i) => { const [k] = p.cards[i]; p.cards.splice(i, 1); stock[k]--; p.hand[k]--; };
  for (let h = 0; h < T; h++) {
    const L = levelAt(h), prevEnd = L === 1 ? 0 : ends[L - 2], prevPop = L === 1 ? 0 : Z.pop[L - 2];
    const want = prevPop + (Z.pop[L - 1] - prevPop) * (h - prevEnd + 1) / (ends[L - 1] - prevEnd);
    while (players.length < want) players.push({ join: h, hold: logn(4, 1.0), active: rnd() < 0.5, off: Math.floor(rnd() * 24), last: -99, lastGm: -99, hand: { C: 0, R: 0, E: 0, M: 0 }, tac: 0, cards: [] });
    for (const p of players) if (rnd() < 0.01) p.hold *= rnd() < 0.5 ? 0.5 : 1.6; // some holders sell or add
    updateBars(h);
    if (h > 0 && levelAt(h - 1) !== L) for (const p of players) if (p.join < h - 1) claim(p, O.DROP[L], 3, L, h);
    for (const p of players) {
      if (p.join > h - 1) continue;
      if (p.hand.C === 0 && !p.starter && p.hold >= 2) { p.starter = 1; p.hand.C += 3; p.tac += 3; }
      const gm = p.active ? (h - p.off) % 6 === 0 : (h - p.off) % 24 === 0;
      if (gm) { energy = Math.min(100, energy + 1); p.lastGm = h; }
      if (gm && h - p.last >= 6 && claim(p, O.PACK[L], 2, L, h)) p.last = h;
      for (let i = p.cards.length - 1; i >= 0; i--) if (h - p.cards[i][1] >= 24) { removeCard(p, i); M(L, 'faded'); }
    }
    energy = Math.min(100, energy + Z.buyE[L - 1] / 24);
    if (h % 24 === 0) epicToday = 0;
    // signers available in a backing window: qualified wallets (>= 2 NEAR, 1h) that checked in within 6h, 60% of them answer
    const activeQ = players.filter((p) => p.hold >= 2 && h - p.join >= 1 && h - p.lastGm < 6);
    const need = (k) => (opt.adaptSign ? Math.min(SIGN_ADAPT[k][2], Math.max(SIGN_ADAPT[k][0], Math.ceil(activeQ.length * SIGN_ADAPT[k][1]))) : SIGN_FIXED[L][k]);
    // raids every 8h from L2: tactic cards on hand at raid start, then each participant uses about 2
    if (L >= 2 && ++raidClock >= 8) {
      raidClock = 0;
      const part = players.filter((p) => p.join < h - 1 && (p.active || rnd() < 0.4));
      for (const p of part) { M(L, 'raidP'); if (p.tac >= 1) M(L, 'tac1'); if (p.tac >= 3) M(L, 'tac3'); const use = Math.min(p.tac, 2); p.tac -= use; p.hand.C -= use; }
      if (rnd() < 0.5) for (const p of part) if (p.active) claim(p, O.WIN[L], 3, L, h);
    }
    // card plays: try the best tier someone holds, half the hours; blocked if Energy or signers fall short
    for (const k of ['M', 'E', 'R']) {
      if (L < O.UNLOCK[k] || (k !== 'R' && epicToday >= 3)) continue;
      const owner = players.find((p) => p.cards.some((x) => x[0] === k));
      if (!owner || rnd() >= 0.5) continue;
      M(L, 'try' + k);
      const signers = Math.round(activeQ.length * 0.6);
      if (energy < COST[k]) { M(L, 'noE' + k); continue; }
      if (signers < need(k)) { M(L, 'noSign' + k); continue; }
      energy -= COST[k]; removeCard(owner, owner.cards.findIndex((x) => x[0] === k)); M(L, 'played' + k); if (k !== 'R') epicToday++;
    }
    for (const k of ['R', 'E', 'M']) {
      if (L < O.UNLOCK[k]) continue;
      const el = players.filter((p) => eligible(p, k, h));
      M(L, 'elig' + k, el.length); M(L, 'cap' + k, cap(k, L, h)); M(L, 'hold' + k, el.filter((p) => p.hand[k] > 0).length); M(L, 'hours' + k); M(L, 'bar' + k, bar[k]);
    }
    M(L, 'commons', players.reduce((a, p) => a + p.hand.C, 0) / Math.max(1, players.length)); M(L, 'hrs');
  }
  for (const L of [1, 2, 3, 4]) m[L].h = Z.lvl[L - 1];
  return m;
}

function report(name, opt, runs = 40) {
  console.log(`\n=== ${name} ===`);
  console.log('size   lvl | eligible R/E/M | bar NEAR R/E/M | limit R/E/M | eligible holding R/E/M | got per day R/E/M | rolls pushed down R/E/M | claims blocked | tactic>=1 / >=3 | plays blocked by signers R/E/M');
  for (const size of Object.keys(SIZES)) for (const L of [1, 2, 3, 4]) {
    const s = {}; for (let r = 0; r < runs; r++) { const m = life(opt, size, 900 + r)[L]; for (const [k, v] of Object.entries(m)) if (typeof v === 'number') s[k] = (s[k] || 0) + v / runs; }
    const f = (k, x) => (s['hours' + x] ? (s[k + x] / s['hours' + x]).toFixed(k === 'bar' ? 1 : 0) : '–');
    const hold = (k) => (s['elig' + k] ? (s['hold' + k] / s['elig' + k] * 100).toFixed(0) + '%' : '–');
    const d = 24 / s.h; const got = (k) => ((s['got' + k] || 0) * d).toFixed(1);
    const dn = (k) => { const a = s['down' + k] || 0, b = s['got' + k] || 0; return a + b ? (a / (a + b) * 100).toFixed(0) + '%' : '–'; };
    const pct = (a, b) => (s[b] ? ((s[a] || 0) / s[b] * 100).toFixed(0) + '%' : '–');
    const blk = (k) => (s['try' + k] ? ((s['noSign' + k] || 0) / s['try' + k] * 100).toFixed(0) + '%' : '–');
    console.log(`${size.padEnd(6)} L${L}  | ${['R', 'E', 'M'].map((k) => f('elig', k)).join('/').padEnd(14)} | ${['R', 'E', 'M'].map((k) => f('bar', k)).join('/').padEnd(14)} | ${['R', 'E', 'M'].map((k) => f('cap', k)).join('/').padEnd(11)} | ${['R', 'E', 'M'].map(hold).join(' / ').padEnd(22)} | ${['R', 'E', 'M'].map(got).join(' / ').padEnd(17)} | ${['R', 'E', 'M'].map(dn).join(' / ').padEnd(23)} | ${pct('claimBlocked', 'claims').padEnd(14)} | ${(pct('tac1', 'raidP') + ' / ' + pct('tac3', 'raidP')).padEnd(15)} | ${['R', 'E', 'M'].map(blk).join(' / ')}`);
  }
}

const only = process.argv[2];
const OPTS = {
  A: ['A. v6 odds, fixed eligibility, fixed signers (today)', { odds: 'v6' }],
  B: ['B. v7 odds (user tables), fixed eligibility, fixed signers', { odds: 'v7' }],
  C: ['C. (rejected) v7 odds + adaptive eligibility', { odds: 'v7', adaptElig: true }],
  D: ['D. (rejected) v7 odds + adaptive eligibility + adaptive signers', { odds: 'v7', adaptElig: true, adaptSign: true }],
};
for (const [k, [n, o]] of Object.entries(OPTS)) if (!only || only.includes(k)) report(n, o);
