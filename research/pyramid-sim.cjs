// Pyramid card supply: Rare / Epic / Mythic limits grow with how many holders are ELIGIBLE for that tier.
// Commons are unlimited. Full coin life, 40 runs per option, 3 coin sizes.
// Run: node research/pyramid-sim.cjs
let S = 1; const rnd = () => (S = (S * 16807) % 2147483647) / 2147483647;
const logn = (m, s) => Math.exp(Math.log(m) + s * Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd()));
const roll = (t) => { let r = rnd() * 100; for (const k of ['C', 'R', 'E', 'M']) { r -= t[k] || 0; if (r <= 0) return k; } return 'C'; };

// Eligibility to hold (and roll) a tier: Holding >= NEAR for >= hours. Same as the play thresholds.
const ELIG = { R: [3, 1], E: [5, 2], M: [10, 4] };
const UNLOCK = { R: 2, E: 3, M: 4 };
const HAND = { R: 3, E: 3, M: 1 };
const COST = { C: 5, R: 20, E: 50, M: 100 };
// cards in each tier with a weight (share of the tier's copies)
const CARDS = {
  R: { Raid: 3, Prophecy: 3, Duel: 2, Counterspell: 2, LastStand: 2, Recruit: 2, DiamondRush: 1, SlowBurn: 1 },
  E: { Inferno: 2, Storm: 2, BlackHole: 1, Heist: 1, War: 1, WhaleTax: 1, Alliance: 1, Harvest: 1 },
  M: { Supernova: 1, Conquest: 1 },
};
const EPIC_L4_ONLY = ['War', 'Alliance', 'Harvest'];
const PACK = { 1: { C: 100 }, 2: { C: 96, R: 4 }, 3: { C: 93, R: 5, E: 2 }, 4: { C: 90, R: 6, E: 3, M: 1 } };
const WIN = { 2: { C: 75, R: 25 }, 3: { C: 62, R: 30, E: 8 }, 4: { C: 52, R: 34, E: 12, M: 2 } };
const DROP = { 2: { C: 75, R: 25 }, 3: { C: 66, R: 30, E: 4 }, 4: { C: 64, R: 30, E: 6 } };

const SIZES = {
  small: { lvl: [6, 18, 18, 30], pop: [15, 30, 55, 80], buyE: [0, 70, 250, 600] },
  normal: { lvl: [6, 18, 18, 30], pop: [15, 40, 80, 120], buyE: [0, 90, 360, 950] },
  big: { lvl: [4, 12, 16, 36], pop: [25, 80, 160, 260], buyE: [0, 160, 700, 1800] },
};

function life(opt, size, seed) {
  S = seed;
  const Z = SIZES[size], ends = []; let acc = 0; for (const d of Z.lvl) ends.push(acc += d);
  const T = ends[3], levelAt = (h) => ends.findIndex((e) => h < e) + 1 || 4;
  const players = [], circ = {}; let energy = 0, epicToday = 0, raidClock = 0;
  const m = { 1: {}, 2: {}, 3: {}, 4: {} }; const M = (L, k, v = 1) => { m[L][k] = (m[L][k] || 0) + v; };
  const eligible = (p, k, h) => p.hold >= ELIG[k][0] && h - p.join >= ELIG[k][1];
  const tierCap = (k, L, h) => {
    if (L < UNLOCK[k]) return 0;
    if (opt.fixedCap) return opt.fixedCap[L][k] || 0;
    const n = players.filter((p) => eligible(p, k, h)).length;
    return Math.max(opt.min[k], Math.floor(n / opt.ratio[k]));
  };
  const cardCap = (k, c, L, h) => {
    if (opt.raidNoCard && c === 'Raid') return 0;
    if (k === 'E' && L < 4 && EPIC_L4_ONLY.includes(c)) return 0;
    const cards = Object.keys(CARDS[k]).filter((x) => !(k === 'E' && L < 4 && EPIC_L4_ONLY.includes(x)) && !(opt.raidNoCard && x === 'Raid'));
    const W = cards.reduce((a, x) => a + CARDS[k][x], 0);
    return Math.max(1, Math.round(tierCap(k, L, h) * CARDS[k][c] / W));
  };
  const inTier = (k) => Object.keys(CARDS[k]).reduce((a, c) => a + (circ[c] || 0), 0);
  const give = (p, k, L, h) => {
    M(L, 'rolls');
    while (k !== 'C') {
      if (L >= UNLOCK[k] && eligible(p, k, h) && p.hand[k] < HAND[k] && inTier(k) < tierCap(k, L, h)) {
        const open = Object.keys(CARDS[k]).filter((c) => (circ[c] || 0) < cardCap(k, c, L, h));
        if (open.length) { const c = open[Math.floor(rnd() * open.length)]; circ[c] = (circ[c] || 0) + 1; p.hand[k]++; p.cards.push([c, k, h]); p.ever[k] = 1; M(L, 'got' + k); return; }
      }
      M(L, 'down' + k); k = k === 'M' ? 'E' : k === 'E' ? 'R' : 'C';
    }
  };
  const removeCard = (p, i) => { const [c, k] = p.cards[i]; p.cards.splice(i, 1); circ[c]--; p.hand[k]--; };
  for (let h = 0; h < T; h++) {
    const L = levelAt(h), prevEnd = L === 1 ? 0 : ends[L - 2], prevPop = L === 1 ? 0 : Z.pop[L - 2];
    const want = prevPop + (Z.pop[L - 1] - prevPop) * (h - prevEnd + 1) / (ends[L - 1] - prevEnd);
    while (players.length < want) players.push({ join: h, hold: logn(6, 0.9), active: rnd() < 0.5, off: Math.floor(rnd() * 24), last: -99, hand: { R: 0, E: 0, M: 0 }, cards: [], ever: {} });
    if (h > 0 && levelAt(h - 1) !== L) for (const p of players) if (p.join < h - 1) for (let i = 0; i < 3; i++) give(p, roll(DROP[L]), L, h);
    for (const p of players) {
      if (p.join > h - 1) continue;
      const gm = p.active ? (h - p.off) % 6 === 0 : (h - p.off) % 24 === 0;
      if (gm) energy = Math.min(100, energy + 1);
      if (gm && h - p.last >= 6) { p.last = h; for (let i = 0; i < 2; i++) give(p, roll(PACK[L]), L, h); }
      for (let i = p.cards.length - 1; i >= 0; i--) if (h - p.cards[i][2] >= opt.fade) { removeCard(p, i); if (L >= 2) M(L, 'faded'); }
    }
    energy = Math.min(100, energy + Z.buyE[L - 1] / 24);
    if (h % 24 === 0) epicToday = 0;
    // raids every 8h from L2; half are our attacks and need a Raid card in someone's hand
    if (L >= 2 && ++raidClock >= 8) {
      raidClock = 0; let happens = true;
      if (rnd() < 0.5) {
        M(L, 'attackTry');
        const owner = opt.raidNoCard ? null : players.find((p) => p.cards.some((x) => x[0] === 'Raid'));
        if (opt.raidNoCard && energy >= COST.R) { energy -= COST.R; M(L, 'attackOk'); }
        else if (owner && energy >= COST.R) { energy -= COST.R; removeCard(owner, owner.cards.findIndex((x) => x[0] === 'Raid')); M(L, 'attackOk'); M(L, 'playedR'); } else happens = false;
      }
      if (happens && rnd() < 0.5) for (const p of players) if (p.join < h - 1 && rnd() < 0.5) for (let i = 0; i < 3; i++) give(p, roll(WIN[L]), L, h);
    }
    // other plays: best affordable card, half the time each hour (backing does not always succeed)
    for (const k of ['M', 'E', 'R']) {
      if (L < UNLOCK[k] || (k !== 'R' && epicToday >= 3)) continue;
      const owner = players.find((p) => p.cards.some((x) => x[1] === k && x[0] !== 'Raid'));
      if (owner && energy >= COST[k] && rnd() < 0.5) { energy -= COST[k]; removeCard(owner, owner.cards.findIndex((x) => x[1] === k && x[0] !== 'Raid')); M(L, 'played' + k); if (k !== 'R') epicToday++; }
    }
    // snapshot each hour: eligible players, cap, holders
    if (L >= 2) for (const k of ['R', 'E', 'M']) {
      if (L < UNLOCK[k]) continue;
      const el = players.filter((p) => eligible(p, k, h));
      M(L, 'elig' + k, el.length); M(L, 'cap' + k, tierCap(k, L, h)); M(L, 'hold' + k, el.filter((p) => p.hand[k] > 0).length); M(L, 'hours' + k);
    }
  }
  for (const L of [2, 3, 4]) { m[L].h = Z.lvl[L - 1]; m[L].types = new Set(); }
  for (const c of Object.keys(circ)) {} // (types seen tracked below)
  return m;
}

function report(name, opt, runs = 40) {
  console.log(`\n=== ${name} ===  ratio R 1 per ${opt.ratio.R} / E 1 per ${opt.ratio.E} / M 1 per ${opt.ratio.M} eligible, minimum ${opt.min.R}/${opt.min.E}/${opt.min.M}, fade ${opt.fade}h`);
  console.log('size    lvl | eligible R/E/M | limit R/E/M   | eligible holding one R/E/M | per day in vs played: R | E | M          | rolls pushed down R/E/M | own-attack raids blocked (no Raid card)');
  for (const size of Object.keys(SIZES)) for (const L of [2, 3, 4]) {
    const s = {}; for (let r = 0; r < runs; r++) { const m = life(opt, size, 900 + r)[L]; for (const [k, v] of Object.entries(m)) if (typeof v === 'number') s[k] = (s[k] || 0) + v / runs; }
    const per = (k) => (s['hours' + k] ? s[k] / s['hours' + k[k.length - 1]] : 0);
    const av = (k) => (s['hours' + k] ? (s['elig' + k] / s['hours' + k]).toFixed(0) : '–');
    const cap = (k) => (s['hours' + k] ? (s['cap' + k] / s['hours' + k]).toFixed(0) : '–');
    const hold = (k) => (s['elig' + k] ? (s['hold' + k] / s['elig' + k] * 100).toFixed(0) + '%' : '–');
    const d = 24 / s.h; const io = (k) => `${((s['got' + k] || 0) * d).toFixed(1)}/${((s['played' + k] || 0) * d).toFixed(1)}`;
    const dn = (k) => (s.rolls ? ((s['down' + k] || 0) / Math.max(1, (s['down' + k] || 0) + (s['got' + k] || 0)) * 100).toFixed(0) + '%' : '–');
    const blocked = s.attackTry ? ((1 - (s.attackOk || 0) / s.attackTry) * 100).toFixed(0) + '%' : '–';
    console.log(`${size.padEnd(7)} L${L}  | ${[av('R'), av('E'), av('M')].join('/').padEnd(14)} | ${[cap('R'), cap('E'), cap('M')].join('/').padEnd(13)} | ${[hold('R'), hold('E'), hold('M')].join(' / ').padEnd(26)} | ${io('R').padEnd(10)}| ${io('E').padEnd(9)}| ${io('M').padEnd(9)} | ${[dn('R'), dn('E'), dn('M')].join(' / ').padEnd(23)} | ${blocked}`);
  }
}

const only = process.argv[2];
const OPTS = {
  A: ['A. Old fixed caps (R 8/15/25, E 5/8, M 2)', { ratio: { R: '-', E: '-', M: '-' }, min: { R: '-', E: '-', M: '-' }, fade: 24, fixedCap: { 2: { R: 8 }, 3: { R: 15, E: 5 }, 4: { R: 25, E: 8, M: 2 } } }],
  B: ['B. Pyramid 1 per 3 / 8 / 20', { ratio: { R: 3, E: 8, M: 20 }, min: { R: 6, E: 3, M: 1 }, fade: 24 }],
  C: ['C. Pyramid 1 per 2 / 5 / 12', { ratio: { R: 2, E: 5, M: 12 }, min: { R: 8, E: 4, M: 2 }, fade: 24 }],
  D: ['D. Pyramid 1 per 2 / 4 / 8', { ratio: { R: 2, E: 4, M: 8 }, min: { R: 8, E: 4, M: 2 }, fade: 24 }],
  F: ['F. C, and Raid needs no card (holders start it with signers + 20 Energy)', { ratio: { R: 2, E: 5, M: 12 }, min: { R: 8, E: 4, M: 2 }, fade: 24, raidNoCard: true }],
  E: ['E. C with fade 48h', { ratio: { R: 2, E: 5, M: 12 }, min: { R: 8, E: 4, M: 2 }, fade: 48 }],
};
for (const [k, [n, o]] of Object.entries(OPTS)) if (!only || only.includes(k)) report(n, o);
