/* Rulecard v3 world simulator (spec: rules-v3.md).  Run: node sim-v3.js [seeds]
   A world of 8 coins launched 4h apart, simulated minute by minute for 5 days, with an
   arriving crowd of agents (crowd, degens, whales, snipers, collectors, sybil farms, wash
   traders, creators). Every card, rule, level gate, deck limit, pack, drop, sacrifice, craft,
   card market sale, raid, alliance, Wild card and graduation from the spec is modelled.
   Invariants are checked every hour: the curve stays solvent and every token is accounted for. */
'use strict';

// ------------------------------------------------------------------ rng & helpers
let R = Math.random;
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const U = (a = 0, b = 1) => a + (b - a) * R();
const expo = m => -Math.log(1 - R()) * m;
const gauss = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
const logn = (med, s) => med * Math.exp(s * gauss());
function pois(l) { if (l <= 0) return 0; if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; }
const pick = a => a[Math.floor(R() * a.length)];
const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';
const f1 = v => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
function gini(a) { const s = [...a].filter(v => v >= 0).sort((x, y) => x - y); const n = s.length, tot = s.reduce((x, y) => x + y, 0); if (!n || !tot) return 0; let g = 0; s.forEach((v, i) => { g += (2 * (i + 1) - n - 1) * v; }); return g / (n * tot); }

// ------------------------------------------------------------------ spec constants
const HOUR = 60, DAY = 1440, SIM = 5 * DAY;
// CURVE=1.5 scales the whole curve (all prices and graduation NEAR); LVL=1.5 raises only the L2-L4 targets
const CSCALE = +process.env.CURVE || 1, LSCALE = +process.env.LVL || 1;
const V = 900 * CSCALE, YV = 1.073e9, SALE = 793.1e6, YEND = YV - SALE, POOLTOK = 206.9e6, SUPPLY = 1e9, FEE = 0.01;
const LEVELS = [null, null,
  { mcap: 1500, back: 250, wallets: 30, wmin: 3, crowd: 0.20, vol: 500, chk: 15, age: 30, ms: null, hold: 15, wait: 30 },
  { mcap: 3000, back: 650, wallets: 80, wmin: 5, crowd: 0.30, vol: 2000, chk: 40, age: 180, ms: 'rare', hold: 30, wait: 60 },
  { mcap: 6000, back: 1200, wallets: 200, wmin: 5, crowd: 0.40, vol: 6000, chk: 100, age: 720, ms: 'raidOrHtl', hold: 60, wait: 120 }];
for (const g of LEVELS) if (g) { g.mcap *= CSCALE * LSCALE; g.back *= CSCALE * LSCALE; g.vol *= CSCALE * LSCALE; }
// LVLM="2703,6757,10811" sets L2-L4 market caps directly (NEAR); backing = 90% of the real NEAR that cap needs; volume scales with the cap
if (process.env.LVLM) process.env.LVLM.split(',').map(Number).forEach((m, i) => {
  const g = LEVELS[i + 2], m0 = V / YV * 1e9, real = V * (Math.sqrt(m / m0) - 1);
  g.vol *= m / g.mcap; g.mcap = m; g.back = 0.9 * real;
});
const THR = [1, 2, 3, 5, 10, 25];
let FIX = false, PACK_EVERY = 360, POTFEE = FEE;
const PLAY = { C: [1, 30], R: [3, 60], E: [10, 120], M: [25, 240] };
const TIERS = ['C', 'R', 'E', 'M'], TLEVEL = { C: 1, R: 2, E: 3, M: 4 }, ANNOUNCE = { C: 0, R: 2, E: 5, M: 10 };
const CARDS = { ward: 'C', rally: 'C', taxHoliday: 'C', rollCall: 'C', hypeSiren: 'C', rebrand: 'C', echo: 'C',
  curse: 'R', mirror: 'R', counterspell: 'R', slowBurn: 'R', happyHour: 'R', diamondPool: 'R', summoningCircle: 'R', prophecy: 'R', friendlyRaid: 'R', recruit: 'R', liquidityRain: 'R', lastStand: 'R',
  inferno: 'E', blackHole: 'E', hardRaid: 'E', whaleTax: 'E', alliance: 'E', supernova: 'M' };
const BYTIER = { C: [], R: [], E: [], M: [] }; for (const [k, t] of Object.entries(CARDS)) BYTIER[t].push(k);
const TACTICS = new Set(['ward', 'rally', 'curse', 'mirror', 'counterspell']);
const DECK = { R: { live: [0, 4, 8, 20, 40], life: 150, per: 3, day: 30 }, E: { live: [0, 1, 1, 3, 6], life: 20, per: 1, day: 4 }, M: { live: [0, 0, 0, 0, 1], life: 3, per: 1, day: 1 } };
const DROP = { 2: [0.75, 0.25, 0, 0], 3: [0.65, 0.30, 0.05, 0], 4: [0.78, 0.18, 0.03, 0.01] };
const SAC = [[0.0005, [90, 9, 1, 0]], [0.002, [60, 35, 5, 0]], [0.01, [30, 45, 22, 3]], [0.03, [10, 40, 40, 10]]];
const SHARDS = { C: 1, R: 4, E: 12, M: 30 };
const PERSONA = {
  crowd: { int: 90, play: 0.5, chk: 0.9, sac: 0.03, craft: 0.7, shield: 0.7, join: 0.5 },
  degen: { int: 25, play: 0.3, chk: 0.35, sac: 0.01, craft: 0.3, shield: 0.2, join: 0.2 },
  whale: { int: 40, play: 0.9, chk: 0.6, sac: 0.06, craft: 1, shield: 0.3, join: 0.25 },
  creator: { int: 60, play: 0.6, chk: 0.9, sac: 0.02, craft: 0.8, shield: 0.8, join: 0.5 },
  sniper: { int: 3, play: 0, chk: 0, sac: 0, craft: 0, shield: 0, join: 0 },
  sybil: { int: 360, play: 0.1, chk: 1, sac: 0, craft: 1, shield: 1, join: 0 },
  wash: { int: 2, play: 0, chk: 0, sac: 0, craft: 0, shield: 0, join: 0 },
  collector: { int: 240, play: 0, chk: 0, sac: 0, craft: 0, shield: 0, join: 0 },
};
// what each persona prefers when choosing a card type (crafting, pick 1 of 2)
const PREF = {
  whale: { inferno: 5, supernova: 9, blackHole: 3, slowBurn: 2, happyHour: 2, lastStand: 1, whaleTax: 0.01, alliance: 1 },
  crowd: { lastStand: 3, whaleTax: 3, happyHour: 2, liquidityRain: 3, recruit: 2, inferno: 3, supernova: 4, diamondPool: 2, friendlyRaid: 2 },
};

const SCEN = {
  base: { arr: 0.35 },
  whales: { arr: 0.35, whaleW: 0.08, whaleMed: 2000 },
  sybils: { arr: 0.35, sybils: 6 },
  bear: { arr: 0.15 },
  mania: { arr: 1.0 },
  noCards: { arr: 0.35, cards: false },
  'base+fixes': { arr: 0.35, fix: true },
  'whales+fixes': { arr: 0.35, whaleW: 0.08, whaleMed: 2000, fix: true },
  'sybils+fixes': { arr: 0.35, sybils: 6, fix: true },
  'bear+fixes': { arr: 0.15, fix: true },
  'mania+fixes': { arr: 1.0, fix: true },
  'noCards+fixes': { arr: 0.35, cards: false, fix: true },
};

// ------------------------------------------------------------------ world
function world(sc, seed) {
  R = seeded(seed); FIX = !!sc.fix; PACK_EVERY = FIX ? 720 : 360; POTFEE = FIX ? 0.02 : FEE;
  DECK.E.per = FIX ? 3 : 1; PLAY.E = FIX ? [5, 120] : [10, 120]; PLAY.M = FIX ? [10, 240] : [25, 240];
  Object.assign(LEVELS[2], FIX ? { wallets: 25, wmin: 2 } : { wallets: 30, wmin: 3 });
  Object.assign(LEVELS[3], FIX ? { wallets: 60, wmin: 3 } : { wallets: 80, wmin: 5 });
  Object.assign(LEVELS[4], FIX ? { wallets: 120, wmin: 3 } : { wallets: 200, wmin: 5 });
  const W = { t: 0, sc: Object.assign({ arr: 1, whaleW: 0.025, whaleMed: 1000, sybils: 2, wash: 2, cards: true }, sc), coins: [], agents: [], byP: {}, sched: Array.from({ length: SIM + 2 }, () => []), nid: 1,
    st: { downgrade: 0, stockout: { R: 0, E: 0, M: 0 }, handFull: 0, packBlocked: 0, packs: 0, src: {}, plays: {}, fx: {}, violations: 0, maxLedgerErr: 0, crafts: 0, sacs: 0, mkt: 0, mktNear: 0, royalty: 0, wildMade: 0, wildPlayed: 0, salvaged: 0, raids: 0, raidsHard: 0, alliances: 0, htl: 0, htlSurvived: 0, levelUps: 0, rugs: 0, rugBlocked: 0 } };
  for (let i = 0; i < 8; i++) W.coins.push(newCoin(W, i, i * 4 * HOUR));
  for (let i = 0; i < 20; i++) newAgent(W, 'collector', 150);
  return W;
}
function newCoin(W, id, born) {
  const rules = new Set(['launchGuard', 'paperTax', 'holdTheLine', 'vaultSeal'].filter(() => R() < 0.55));
  while (rules.size > 3) rules.delete(pick([...rules]));
  return { id, born, live: false, q: logn(0.7, 1.0), rules, x: V, y: YV, k: V * YV, real: 0, circ: 0, burned: 0, pot: 0, grad: false, gradT: null, amm: null, dead: false,
    level: 1, metSince: null, crossed: { 1: born }, holders: new Map(), volR: new Float64Array(DAY), netR: new Float64Array(HOUR), vol24: 0, net1h: 0, cumNet: 0, totalVol: 0,
    pr: [], peak: 0, peakAll: 0, spark: 0, ult: 0, ultCharged: false, lastRare: -1e9, bigUntil: 0, effects: [], burns: [], spends: [],
    htl: null, lastHtl: -1e9, deck: { made: { C: 0, R: 0, E: 0, M: 0 }, live: { C: 0, R: 0, E: 0, M: 0 }, budget: { R: 2, E: 0, M: 0 }, earned: { R: [], E: [] }, volAcc: 0, chkAcc: 0 },
    ms: { rare: false, raidOrHtl: false }, raid: null, ally: null, allyPot: 0, lastCommon: null, lastWild: -1e9,
    until: { hype: 0, rebrand: 0, roll: 0, tax: 0, slow: 0, happy: 0, recruit: 0, whale: 0, banner: 0, win: 0 },
    diamond: null, bh: null, circle: null, proph: null, lastTrade: born, creator: null, wash: false, sybil: false,
    fails: { 2: {}, 3: {}, 4: {} }, cnt: { wallets: 0, crowd: 0, chk: 0 }, stats: { plays: 0, playsT: { C: 0, R: 0, E: 0, M: 0 }, raids: 0, htl: 0, peakMcap: 0 } };
}
function newAgent(W, p, cash, extra = {}) {
  const a = Object.assign({ id: W.agents.length, p, cash, cash0: cash, hand: [], shards: 0, wild: [], rep: 0, coins: new Set(),
    st: { cards: { C: 0, R: 0, E: 0, M: 0 }, plays: { C: 0, R: 0, E: 0, M: 0 }, mktIn: 0, mktOut: 0, crafted: 0, sacNear: 0, played: 0 } }, extra);
  W.agents.push(a); (W.byP[p] || (W.byP[p] = [])).push(a); return a;
}
const price = c => c.grad ? c.amm.x / c.amm.y : c.x / c.y;
const mcap = c => price(c) * (SUPPLY - c.burned);
const eclipse = t => { if (FIX) return t % 360 < 30; const m = t % DAY; return (m >= 360 && m < 390) || (m >= 1080 && m < 1110); };
function holder(c, a) { let H = c.holders.get(a.id); if (!H) { H = { a, bal: 0, vest: [], locked: 0, escrow: 0, netIn: 0, cost: 0, qs: THR.map(() => null), init: 0, soldC: 0, lastBuy: -1e9, lastChk: -1e9, lastPack: -1e9, lastPlay: -1e9, lastBig: -1e9, lastSac: -1e9, noSell: 0, first: true, guard: 0, pity: 0, entered: 0 }; c.holders.set(a.id, H); a.coins.add(c.id); } return H; }
const tokTotal = H => H.bal + H.locked + H.escrow + H.vest.reduce((s, v) => s + v.amt, 0);
function stake(c, H) { return Math.max(H.netIn, tokTotal(H) * price(c)); }
function updQual(c, H, t) { const s = stake(c, H); for (let i = 0; i < THR.length; i++) { if (s >= THR[i]) { if (H.qs[i] === null) H.qs[i] = t; } else H.qs[i] = null; } }
const qual = (H, thr, wait, t) => { const q = H.qs[THR.indexOf(thr)]; return q !== null && q <= t - wait; };

// ------------------------------------------------------------------ curve primitives
function curveBuy(W, c, near) {
  if (c.grad) { const a = c.amm, ny = a.x * a.y / (a.x + near), tok = a.y - ny; a.x += near; a.y = ny; c.circ += tok; return { tok, used: near }; }
  let nx = c.x + near, ny = c.k / nx;
  if (ny < YEND) { ny = YEND; nx = c.k / YEND; }
  const used = nx - c.x, tok = c.y - ny; c.x = nx; c.y = ny; c.real += used; c.circ += tok;
  return { tok, used };
}
function curveSell(c, tok) {
  tok = Math.min(tok, c.circ); if (tok <= 0) return 0;
  if (c.grad) { const a = c.amm, nx = a.x * a.y / (a.y + tok), out = a.x - nx; a.x = nx; a.y += tok; c.circ -= tok; return out; }
  const ny = c.y + tok, nx = c.k / ny, out = c.x - nx; c.x = nx; c.y = ny; c.real -= out; c.circ -= tok; return out;
}
function liftCurve(c) { if (c.grad || c.circ <= 1) return; const nx = c.real * (c.y + c.circ) / c.circ; if (nx > c.x) { c.x = nx; c.k = c.x * c.y; } }
function rolling(arr, t) { while (arr.length && arr[0][0] < t - DAY) arr.shift(); let s = 0; for (const e of arr) s += e[1]; return s; }
function burnRoom(c, t) { const b = rolling(c.burns, t); return Math.max(0, 0.05 * (c.circ + b) - b); }
// burn tokens that were already taken out of a wallet (escrow/penalty/slow burn) - capped; returns burned amount
function cardBurn(c, t, tok) { if (c.grad) return 0; const r = Math.min(tok, burnRoom(c, t), c.circ); if (r > 0) { c.circ -= r; c.burned += r; c.burns.push([t, r]); liftCurve(c); } return r; }
function potRoom(c, t) { const s = rolling(c.spends, t); return Math.max(0, Math.min(c.pot, 0.5 * (c.pot + s) - s)); }
function potBuy(W, c, t, near) {
  if (c.grad) return 0; near = Math.min(near, potRoom(c, t)); if (near <= 1e-9) return 0;
  c.pot -= near; c.spends.push([t, near]); const r = curveBuy(W, c, near); c.pot += near - r.used; gradCheck(W, c, t); return r.tok;
}
function potBuyBurn(W, c, t, near) {
  if (c.grad) return 0; const p0 = price(c); try { return potBuyBurn0(W, c, t, near); } finally { if (W.cur) W.cur.lift += price(c) / p0 - 1; }
}
function potBuyBurn0(W, c, t, near) {
  if (c.grad) return 0; const room = burnRoom(c, t); if (room <= 0) return 0;
  const est = near / price(c); if (est > room) near *= 0.97 * room / est;
  const tok = potBuy(W, c, t, near); if (c.grad) return 0;
  const b = cardBurn(c, t, tok); if (tok - b > 1e-6) { c.circ -= 0; spreadToCrowd(c, t, tok - b); } return b;
}
function spreadToCrowd(c, t, tok) { // tokens the pot bought but could not burn go to today's check-ins
  const rec = [...c.holders.values()].filter(H => H.lastChk >= t - DAY);
  if (!rec.length) { c.circ -= tok; c.burned += tok; return; } // nobody to give to: burn (tiny edge case)
  if (FIX) { const w = rec.map(H => Math.min(tokTotal(H), 0.01 * SUPPLY)), tw = w.reduce((s, v) => s + v, 0) || 1; rec.forEach((H, i) => { H.bal += tok * w[i] / tw; }); return; }
  for (const H of rec) H.bal += tok / rec.length;
}

// ------------------------------------------------------------------ trading
function addFlow(c, t, near, signed) { c.volR[t % DAY] += near; c.vol24 += near; c.totalVol += near; c.netR[t % HOUR] += signed; c.net1h += signed; c.cumNet += signed; c.lastTrade = t; if (c.raid && c.raid.status === 'active') c.raid.net[c.raid.a === c ? 0 : 1] += signed; }
function buy(W, a, c, near) {
  const t = W.t; if (!c.live) return 0;
  const H = holder(c, a);
  if (c.rules.has('launchGuard') && !c.grad && t - c.born < 10) near = Math.min(near, 30 - H.guard);
  near = Math.min(near, a.cash); if (near < 0.05) return 0;
  if (c.grad) { const fee = near * FEE; const r = curveBuy(W, c, near - fee); a.cash -= near; H.bal += r.tok; H.netIn += near; H.cost += near; addFlow(c, t, near, near); updQual(c, H, t); return r.tok; }
  const feeRate = t < c.until.tax ? 0 : POTFEE, fee = near * feeRate;
  if (c.ally) { const s = fee * 0.1; c.allyPot += s; c.pot += fee - s; } else c.pot += fee;
  const r = curveBuy(W, c, near - fee), spent = fee + r.used; a.cash -= spent; let tok = r.tok;
  if (t < c.until.slow) tok -= cardBurn(c, t, tok * 0.01);
  H.bal += tok; H.netIn += spent; H.cost += spent; H.lastBuy = t; if (t - c.born < 10) H.guard += spent;
  if (t < c.until.happy) { const b = potBuy(W, c, t, tok * 0.1 * price(c)); if (b > 0) H.vest.push({ amt: b, until: t + 360 }); }
  if (t < c.until.recruit && H.first && spent >= 3) { const b = potBuy(W, c, t, tok * 0.05 * price(c)); if (b > 0) H.vest.push({ amt: b, until: t + 360 }); W.st.fx.recruitBonus = (W.st.fx.recruitBonus || 0) + 1; }
  H.first = false;
  addFlow(c, t, spent, spent);
  if (spent >= 0.5) c.spark = Math.min(30, c.spark + 0.5);
  meterUlt(W, c, t, spent / 5);
  const d = c.deck; d.volAcc += spent; while (d.volAcc >= 50) { d.volAcc -= 50; earn(c, t, 'R'); }
  updQual(c, H, t); gradCheck(W, c, t);
  return tok;
}
function sell(W, a, c, tok) {
  const t = W.t, H = c.holders.get(a.id); if (!H || !c.live) return 0;
  if (H.noSell > t) return 0;
  if (a.p === 'creator' && c.rules.has('vaultSeal')) {
    if (!FIX && t - c.born < DAY) { if (a.rugger) W.st.rugBlocked++; return 0; }
    if (FIX) { const cap = H.init * Math.max(0, Math.min(1, (t - c.born - DAY) / (2 * DAY))) - H.soldC; if (cap <= 0) { if (a.rugger) W.st.rugBlocked++; return 0; } tok = Math.min(tok, cap); H.soldC += Math.min(tok, H.bal); }
  }
  tok = Math.min(tok, H.bal); if (tok <= 0) return 0;
  if (!c.grad) { // selling early burns unvested bonus tokens
    const unv = H.vest.filter(v => v.until > t); if (unv.length) { const amt = unv.reduce((s, v) => s + v.amt, 0); H.vest = H.vest.filter(v => v.until <= t); c.circ -= amt; c.burned += amt; liftCurve(c); }
  }
  H.bal -= tok;
  if (!c.grad && t < c.until.slow) tok -= cardBurn(c, t, tok * 0.01);
  const before = tokTotal(H) + tok;
  const out = curveSell(c, tok);
  let fee;
  if (c.grad) fee = out * FEE;
  else {
    const base = t < c.until.tax ? 0 : POTFEE; let extra = 0, toPrize = 0, room = 0.03 - base;
    if (c.htl) { const e = Math.min(0.02, room); toPrize = e; room -= e; }
    if (c.rules.has('paperTax') && t - H.lastBuy < 15) { const e = Math.min(0.02, room); extra += e; room -= e; }
    if (t < c.until.whale && before / (SUPPLY - c.burned) > 0.03) { const e = Math.min(0.03, room); extra += e; room -= e; W.st.fx.whaleTaxPaid = (W.st.fx.whaleTaxPaid || 0) + out * e; }
    const potPart = out * (base + extra);
    if (c.ally) { c.allyPot += potPart * 0.1; c.pot += potPart * 0.9; } else c.pot += potPart;
    if (c.htl) { c.htl.prize += out * toPrize; c.htl.sellers.add(a.id); }
    fee = out * (base + extra + toPrize);
  }
  const got = out - fee; a.cash += got; H.netIn -= got; H.cost *= Math.max(0, 1 - tok / Math.max(before, 1e-9));
  addFlow(c, t, out, -out); updQual(c, H, t);
  return got;
}
function gradCheck(W, c, t) { if (!c.grad && c.y <= YEND * (1 + 1e-9)) graduate(W, c, t); }

// ------------------------------------------------------------------ meters & deck
function meterUlt(W, c, t, amt) {
  c.ult = Math.min(100, c.ult + amt);
  if (c.ult >= 100 && !c.ultCharged) { c.ultCharged = true; earn(c, t, 'E'); }
}
function earn(c, t, T) {
  const d = c.deck, list = d.earned[T];
  if (list) { while (list.length && list[0] < t - DAY) list.shift(); if (list.length >= DECK[T].day) return; list.push(t); }
  if (d.made[T] + d.budget[T] < DECK[T].life) d.budget[T]++;
}
const handOf = (a, c) => a.hand.filter(k => k.coin === c.id);
const tierCount = (a, c, T) => a.hand.reduce((s, k) => s + (k.coin === c.id && k.tier === T ? 1 : 0), 0);
function stockOk(c, T) { if (T === 'C') return true; const d = c.deck, D = DECK[T]; return d.live[T] < D.live[c.level] && d.made[T] < D.life && d.budget[T] >= 1; }
function chooseType(a, T, two) {
  const opts = two ? [pick(BYTIER[T]), pick(BYTIER[T])] : BYTIER[T];
  const pref = PREF[a.p] || PREF.crowd; let best = opts[0], bw = -1;
  for (const o of opts) { const w = (pref[o] || 1) * U(0.6, 1.4); if (w > bw) { bw = w; best = o; } }
  return two ? best : (R() < 0.5 ? best : pick(BYTIER[T]));
}
function grant(W, a, c, T, src, opt = {}) {
  if (!W.sc.cards || c.grad) return null;
  for (let i = TIERS.indexOf(T); i >= 0; i--) {
    const tt = TIERS[i];
    if (handOf(a, c).length >= 7) { W.st.handFull++; return null; }
    if (tt !== 'C' && tierCount(a, c, tt) >= DECK[tt].per) { if (tt !== T || i === 0) W.st.downgrade++; continue; }
    if (!stockOk(c, tt)) { if (tt !== 'C') W.st.stockout[tt]++; continue; }
    if (tt !== T) W.st.downgrade++;
    const type = opt.type && CARDS[opt.type] === tt ? opt.type : chooseType(a, tt, opt.two);
    const d = c.deck; d.made[tt]++; d.live[tt]++; if (tt !== 'C') d.budget[tt]--;
    const card = { id: W.nid++, coin: c.id, type, tier: tt, serial: d.made[tt] };
    a.hand.push(card); a.st.cards[tt]++;
    const s = W.st.src[src] || (W.st.src[src] = { C: 0, R: 0, E: 0, M: 0 }); s[tt]++;
    return card;
  }
  return null;
}
function removeCard(a, c, card) { a.hand.splice(a.hand.indexOf(card), 1); if (c && !c.grad) c.deck.live[card.tier]--; }
function rollTier(odds, rep = 0) { let r = R() * odds.reduce((s, v) => s + v, 0), i = 0; for (; i < odds.length; i++) { r -= odds[i]; if (r < 0) break; } i = Math.min(i, 3); if (i < 3 && R() < Math.min(0.05, rep * 0.002)) i++; return TIERS[i]; }
function sacOdds(share) {
  if (share <= SAC[0][0]) return SAC[0][1];
  for (let i = 1; i < SAC.length; i++) if (share <= SAC[i][0]) { const [s0, o0] = SAC[i - 1], [s1, o1] = SAC[i]; const f = Math.log(share / s0) / Math.log(s1 / s0); return o0.map((v, j) => v + (o1[j] - v) * f); }
  return SAC[SAC.length - 1][1];
}

// ------------------------------------------------------------------ check-in, packs, sacrifice, craft
function checkIn(W, a, c, H) {
  const t = W.t; if (c.grad || t - H.lastChk < 60) return false;
  H.lastChk = t; const m = t < c.until.roll ? 2 : 1;
  c.spark = Math.min(30, c.spark + (FIX ? 0.4 : 1) * m); meterUlt(W, c, t, m);
  const d = c.deck; d.chkAcc += 1; while (d.chkAcc >= 10) { d.chkAcc -= 10; earn(c, t, 'R'); }
  return true;
}
function claimPack(W, a, c, H) {
  const t = W.t; if (!W.sc.cards || c.grad || H.lastChk < t - PACK_EVERY || t - H.lastPack < PACK_EVERY || !qual(H, 1, 60, t)) return;
  if (tierCount(a, c, 'C') >= 3) { W.st.packBlocked++; return; }
  H.lastPack = t; W.st.packs++; grant(W, a, c, R() < 0.95 ? 'C' : 'R', 'pack');
}
function sacrifice(W, a, c, H, share) {
  const t = W.t; if (!W.sc.cards || c.grad || t - H.lastSac < 60 || !qual(H, 3, 60, t)) return;
  const tok = Math.min(H.bal, share * (SUPPLY - c.burned)); if (tok <= 0 || tok > burnRoom(c, t)) return;
  H.bal -= tok; const b = cardBurn(c, t, tok); H.bal += tok - b; if (b <= 0) return;
  H.lastSac = t; W.st.sacs++; a.st.sacNear += b * price(c);
  let T = rollTier(sacOdds(b / (SUPPLY - c.burned)), a.rep);
  if (T === 'C') { H.pity++; if (H.pity >= 5) { T = 'R'; H.pity = 0; } } else H.pity = 0;
  grant(W, a, c, T, 'sacrifice', { two: true }); updQual(c, H, t);
}
function craft(W, a, c) {
  if (!W.sc.cards || c.grad) return;
  const need = a.rep >= 15 ? 2 : 3;
  for (const T of ['C', 'R', 'E']) {
    const same = handOf(a, c).filter(k => k.tier === T); if (same.length < need) continue;
    const up = TIERS[TIERS.indexOf(T) + 1];
    if (!stockOk(c, up) || tierCount(a, c, up) >= DECK[up].per) continue;
    if (T === 'E' && a.p !== 'whale' && a.p !== 'creator' && R() < 0.5) continue;
    for (const k of same.slice(0, need)) removeCard(a, c, k);
    const card = grant(W, a, c, up, 'craft', { type: chooseType(a, up, false) }); if (card) { W.st.crafts++; a.st.crafted++; } return;
  }
}

// ------------------------------------------------------------------ playing cards
function liftOf(c, type, t) {
  const p = potRoom(c, t);
  switch (type) {
    case 'inferno': return 2.6 * Math.min(p, 0.35 * c.pot) / c.x;
    case 'supernova': return 2.6 * p / c.x;
    case 'lastStand': return 2.6 * Math.min(p, 0.3 * c.pot) / c.x;
    case 'liquidityRain': return 2 * Math.min(p, 0.2 * c.pot) / c.x;
    case 'blackHole': return 0.015; case 'hardRaid': return 0.02; case 'whaleTax': return 0.01; case 'alliance': return 0.01;
    default: return CARDS[type] === 'R' ? 0.006 : 0.002;
  }
}
function whyNot(W, a, c, H, card, target) {
  const t = W.t, T = card.tier, type = card.type;
  if (c.grad || !c.live) return 'graduated';
  if (TLEVEL[T] > c.level) return 'level';
  if (!H || !qual(H, PLAY[T][0], PLAY[T][1], t)) return 'stake';
  if (a.p === 'creator' && t - c.born < 60) return 'creator';
  if (t - H.lastPlay < 30) return 'cooldown';
  if ((T === 'E' || T === 'M') && t - H.lastBig < DAY) return 'big24';
  if (TACTICS.has(type)) {
    const r = c.raid; if (!r || r.status !== 'active') return 'noRaid';
    const side = r.a === c ? 0 : 1; if (r.tac[side]) return 'tacticTaken';
    if (c.spark < 5) return 'spark'; return null;
  }
  if (T === 'C' && c.spark < 5) return 'spark';
  if (T === 'R' && t - c.lastRare < 15) return 'rareSlot';
  if (T === 'E' && (!c.ultCharged || c.bigUntil > t)) return 'ult';
  if (T === 'M' && (!eclipse(t) || c.bigUntil > t)) return 'eclipse';
  if (type === 'echo' && !c.lastCommon) return 'nothingToEcho';
  if (type === 'lastStand' && price(c) > 0.7 * c.peak) return 'noDip';
  if (type === 'whaleTax' && ![...c.holders.values()].some(h => tokTotal(h) > 0.03 * SUPPLY)) return 'noWhale';
  if ((type === 'friendlyRaid' || type === 'hardRaid' || type === 'alliance') && (c.raid || c.ally || !target)) return 'noTarget';
  if ((type === 'friendlyRaid' || type === 'hardRaid' || type === 'summoningCircle' || type === 'blackHole' || type === 'diamondPool' || type === 'prophecy') && (c.raid && type.endsWith('Raid') || (type === 'blackHole' && c.bh) || (type === 'diamondPool' && c.diamond) || (type === 'summoningCircle' && c.circle) || (type === 'prophecy' && c.proph))) return 'busy';
  return null;
}
function findTarget(W, c) { const opts = W.coins.filter(o => o !== c && o.live && !o.grad && !o.dead && o.level >= 2 && !o.raid && !o.ally && o.ally !== c); return opts.length ? pick(opts) : null; }
function play(W, a, c, H, card) {
  const t = W.t, T = card.tier;
  removeCard(a, c, card); H.lastPlay = t; if (T === 'E' || T === 'M') { H.lastBig = t; }
  a.rep++; a.st.plays[T]++; a.st.played++; c.stats.plays++; c.stats.playsT[T]++;
  W.st.plays[card.type] = (W.st.plays[card.type] || 0) + 1;
  if (TACTICS.has(card.type) || T === 'C') c.spark -= 5;
  if (T === 'R' && !TACTICS.has(card.type)) c.lastRare = t;
  if (T === 'E') { c.ultCharged = false; c.ult = 0; }
  const start = t + ANNOUNCE[T];
  if (TACTICS.has(card.type)) { const r = c.raid; r.tac[r.a === c ? 0 : 1] = card.type; return; }
  if (card.type === 'friendlyRaid' || card.type === 'hardRaid') { const tg = findTarget(W, c); c.raid = tg.raid = { a: c, b: tg, hard: card.type === 'hardRaid', status: 'pending', by: t + 15, card, caster: a, round: 0, roundEnd: 0, net: [0, 0], score: [0, 0], tac: [null, null], last: [null, null], stakes: [new Map(), new Map()] }; return; }
  if (card.type === 'alliance') { const tg = findTarget(W, c); c.ally = tg.ally = { a: c, b: tg, status: 'pending', by: t + 15, card, caster: a, until: 0 }; return; }
  const e = { type: card.type, tier: T, c, start, by: a, p0: null, done: false, end: start + (FXDUR[card.type] || 0), next: start };
  if (T === 'E' || T === 'M') c.bigUntil = e.end;
  if (T === 'C' && card.type !== 'echo') c.lastCommon = card.type;
  c.effects.push(e);
}
const FXDUR = { taxHoliday: 10, rollCall: 60, hypeSiren: 15, rebrand: 60, echo: 0, slowBurn: 60, happyHour: 15, diamondPool: 60, summoningCircle: 30, prophecy: 360, recruit: 60, liquidityRain: 30, lastStand: 30, inferno: 60, blackHole: 60, whaleTax: 120, supernova: 120 };
function fxStart(W, c, e, t) {
  e.p0 = price(c);
  const set = (k, d) => { c.until[k] = Math.max(c.until[k], t + d); };
  switch (e.type) {
    case 'taxHoliday': set('tax', 10); break; case 'rollCall': set('roll', 60); break; case 'hypeSiren': set('hype', 15); break; case 'rebrand': set('rebrand', 60); break;
    case 'echo': if (c.lastCommon) { const k = { taxHoliday: ['tax', 10], rollCall: ['roll', 60], hypeSiren: ['hype', 15], rebrand: ['rebrand', 60] }[c.lastCommon]; set(k[0], k[1]); } break;
    case 'slowBurn': set('slow', 60); break; case 'happyHour': set('happy', 15); break; case 'recruit': set('recruit', 60); break; case 'whaleTax': set('whale', 120); break;
    case 'diamondPool': c.diamond = { until: t + 60, m: new Map() }; break;
    case 'blackHole': c.bh = { end: t + 60, fed: new Map() }; break;
    case 'summoningCircle': c.circle = { end: t + 30, j: [] }; break;
    case 'prophecy': c.proph = { end: t + 360, target: 0.15 * c.real, base: c.cumNet, bel: new Set() }; break;
    case 'inferno': e.spend = Math.min(potRoom(c, t), (FIX ? 0.5 : 0.35) * c.pot); e.chunks = 12; e.every = 5; break;
    case 'supernova': e.spend = potRoom(c, t); e.chunks = 24; e.every = 5; break;
    case 'lastStand': e.spend = Math.min(potRoom(c, t), 0.3 * c.pot); e.chunks = 6; e.every = 5; break;
    case 'liquidityRain': e.spend = Math.min(potRoom(c, t), 0.2 * c.pot); e.chunks = 6; e.every = 5; e.rain = true; break;
  }
}
function fxStep(W, c, e, t) {
  if (e.chunks && t >= e.next && e.chunks > 0) {
    e.next = t + e.every; e.chunks--;
    const part = e.spend / (FXDUR[e.type] / e.every);
    W.cur = e; e.lift = e.lift || 0;
    if (e.rain) { const p0 = price(c); const tok = potBuy(W, c, t, part); e.lift += price(c) / p0 - 1; if (tok > 0) spreadToCrowd(c, t, tok); }
    else potBuyBurn(W, c, t, part);
    W.cur = null;
  }
}
function fxEnd(W, c, e, t) {
  e.done = true;
  const s = W.st.fx[e.type] || (W.st.fx[e.type] = { n: 0, chg: [] }); s.n++; if (e.p0) s.chg.push(price(c) / e.p0 - 1); if (e.lift !== undefined) (s.lift || (s.lift = [])).push(e.lift); (s.pot || (s.pot = [])).push(c.pot + (e.spend || 0));
  if (e.tier === 'R' && !c.grad) c.ms.rare = true;
  if (e.type === 'blackHole' && c.bh) { const bh = c.bh; c.bh = null; let tot = 0, top = null, tv = 0; for (const [, v] of bh.fed) tot += v.amt;
    const burn = Math.min(tot, burnRoom(c, t)); for (const [, v] of bh.fed) { const share = v.amt / Math.max(tot, 1e-9); v.H.escrow -= v.amt; v.H.bal += v.amt - burn * share; if (v.amt > tv) { tv = v.amt; top = v; } }
    if (burn > 0) cardBurn(c, t, burn); if (top) { grant(W, top.H.a, c, 'R', 'blackHoleTop'); top.H.a.rep++; } }
  if (e.type === 'summoningCircle' && c.circle) { const ci = c.circle; c.circle = null; const ok = ci.j.length >= 25; let burnTot = 0;
    for (const j of ci.j) { const b = ok ? j.amt * 0.1 : 0; j.H.escrow -= j.amt; j.H.bal += j.amt - b; burnTot += b; }
    if (ok) { // tokens left wallets above; burn them (cap: anything over the cap goes back)
      for (const j of ci.j) j.H.bal -= 0; const done = burnTot > 0 ? burnCapped(c, t, burnTot, ci.j) : 0;
      ci.j.slice(0, 5).forEach(j => grant(W, j.H.a, c, R() < 0.5 ? 'C' : 'R', 'circle')); W.st.fx.circleOk = (W.st.fx.circleOk || 0) + 1; void done;
    } }
  if (e.type === 'prophecy' && c.proph) { const p = c.proph; c.proph = null; if (c.cumNet - p.base >= p.target && p.bel.size) { const bel = [...p.bel]; for (let i = 0; i < 3 && bel.length; i++) { const H = bel.splice(Math.floor(R() * bel.length), 1)[0]; grant(W, H.a, c, 'R', 'prophecy'); } W.st.fx.prophecyHit = (W.st.fx.prophecyHit || 0) + 1; } }
}
// burn `tot` tokens that were taken from these joiners; whatever exceeds the cap is handed back pro rata
function burnCapped(c, t, tot, joins) { const b = cardBurn(c, t, tot); const back = tot - b; if (back > 0) for (const j of joins) j.H.bal += back * (j.amt / joins.reduce((s, x) => s + x.amt, 0)); return b; }

// ------------------------------------------------------------------ raids & alliances
function raidStep(W, c, t) {
  const r = c.raid; if (!r || r.a !== c) return;
  if (r.status === 'pending') { if (t > r.by) { r.caster.hand.push(r.card); if (!c.grad) c.deck.live[r.card.tier]++; r.a.raid = r.b.raid = null; W.st.fx.raidExpired = (W.st.fx.raidExpired || 0) + 1; } return; }
  if (t < r.roundEnd) return;
  // end of a round
  const mult = [1, 1], [x, y] = r.tac;
  const eff = (me, op, i) => {
    let m = 1; const mine = me === 'mirror' ? r.last[1 - i] : me, theirs = op === 'mirror' ? r.last[i] : op;
    if (theirs === 'counterspell') return 1;
    if (mine === 'rally') m += theirs === 'curse' ? 0.035 : 0.07;
    if (theirs === 'curse' && mine !== 'ward' && mine !== 'counterspell') m -= 0.10;
    if (mine === 'curse' && theirs === 'ward') m -= 0.07;
    return m;
  };
  mult[0] = eff(x, y, 0); mult[1] = eff(y, x, 1);
  for (let i = 0; i < 2; i++) { const cc = i ? r.b : r.a; r.score[i] += 100 * (1 + Math.max(-0.9, r.net[i] / Math.max(cc.real, 5))) * mult[i]; }
  r.last = [x, y]; r.tac = [null, null]; r.net = [0, 0]; r.round++;
  if (r.round < 4) { r.roundEnd = t + 30; return; }
  settleRaid(W, r, t);
}
function settleRaid(W, r, t, refund = false) {
  const sides = [r.a, r.b]; W.st.raids++; if (r.hard) W.st.raidsHard++; r.a.stats.raids++; r.b.stats.raids++;
  const w = refund || Math.abs(r.score[0] - r.score[1]) < 1e-6 ? -1 : (r.score[0] > r.score[1] ? 0 : 1);
  for (let i = 0; i < 2; i++) {
    const c = sides[i], lose = w >= 0 && i !== w;
    let pool = 0; for (const [, s] of r.stakes[i]) pool += s.amt;
    for (const [, s] of r.stakes[i]) {
      s.H.escrow -= s.amt;
      if (!lose) { s.H.bal += s.amt; if (w === i) s.H.a.rep++; continue; }
      if (!r.hard) { const b = cardBurn(c, t, s.amt * 0.3); s.H.bal += s.amt - b; }
      else { const half = s.amt * 0.5; s.H.bal += s.amt - half; const near = curveSell(c, half); const wc = sides[w]; if (!wc.grad) { const got = curveBuy(W, wc, near); const b = cardBurn(wc, t, got.tok); const left = got.tok - b; if (left > 0) { const ws = [...r.stakes[w].values()]; const tot = ws.reduce((q, z) => q + z.amt, 0) || 1; for (const z of ws) z.H.bal += left * z.amt / tot; } gradCheck(W, wc, t); } }
    }
    void pool;
  }
  if (w >= 0) {
    const wc = sides[w]; wc.ms.raidOrHtl = true; wc.until.win = t + 720; if (r.hard) sides[1 - w].until.banner = t + 720;
    let mvp = null, mv = 0; for (const [, s] of r.stakes[w]) if (s.amt > mv) { mv = s.amt; mvp = s.H; }
    if (mvp) { grant(W, mvp.a, wc, 'R', 'raidMvp'); mvp.a.rep++; }
  }
  r.a.raid = r.b.raid = null;
}
function allyStep(W, c, t) {
  const al = c.ally; if (!al || al.a !== c) return;
  if (al.status === 'pending') { if (t > al.by) { al.caster.hand.push(al.card); if (!c.grad) c.deck.live[al.card.tier]++; al.a.ally = al.b.ally = null; } return; }
  if ((t - al.start) % 30 === 0) for (const cc of [al.a, al.b]) { const s = (al.a.allyPot + al.b.allyPot) / 2; void s; }
  if ((t - al.start) % 30 === 0) { const pot = al.a.allyPot + al.b.allyPot; al.a.allyPot = al.b.allyPot = 0; for (const cc of [al.a, al.b]) if (!cc.grad) { cc.pot += pot / 2; potBuyBurn(W, cc, t, pot / 2); } }
  if (t >= al.until || al.a.grad || al.b.grad) { for (const cc of [al.a, al.b]) { cc.pot += cc.allyPot; cc.allyPot = 0; } al.a.ally = al.b.ally = null; }
}

// ------------------------------------------------------------------ Hold the Line
function htlStep(W, c, t) {
  if (c.grad) return;
  if (!c.htl) {
    if (!c.rules.has('holdTheLine') || c.level < 2 || t - c.born < 60 || t - c.lastHtl < DAY || c.pr.length < 6) return;
    const hi = Math.max(...c.pr.slice(-6)); if (price(c) > 0.8 * hi) return;
    c.htl = { start: t, end: t + 360, prize: 0, trig: price(c), shields: new Set(), sellers: new Set(), dip: 0.3 * potRoom(c, t), chunks: 6 }; c.lastHtl = t; W.st.htl++; c.stats.htl++; return;
  }
  const h = c.htl;
  if (h.chunks > 0 && (t - h.start) % 10 === 0) { h.chunks--; potBuyBurn(W, c, t, h.dip / 6); }
  if (t >= h.end) {
    c.htl = null;
    const win = [...h.shields].filter(id => !h.sellers.has(id)).map(id => c.holders.get(id)).filter(Boolean);
    const ww = win.map(H => FIX ? Math.min(tokTotal(H), 0.01 * SUPPLY) : 1), tw = ww.reduce((s, v) => s + v, 0) || 1;
    win.forEach((H, i) => { H.a.cash += h.prize * ww[i] / tw; H.a.rep++; if (R() < 0.1) grant(W, H.a, c, 'R', 'htlSurvivor'); });
    if (!win.length) c.pot += h.prize;
    if (price(c) >= 0.9 * h.trig) { c.ms.raidOrHtl = true; W.st.htlSurvived++; }
  }
}

// ------------------------------------------------------------------ levels & graduation
function countGates(c, t) {
  let wallets = THR.map(() => 0), crowd = 0, chk = 0; const cap = 0.01 * SUPPLY;
  for (const H of c.holders.values()) {
    if (H.a.p === 'creator') continue;
    for (let i = 0; i < THR.length; i++) if (H.qs[i] !== null) wallets[i]++;
    crowd += Math.min(tokTotal(H), cap); if (H.lastChk >= t - DAY) chk++;
  }
  c.cnt = { wallets, crowd: c.circ > 0 ? crowd / c.circ : 0, chk };
}
function evalLevel(W, c, t) {
  if (c.grad || c.level >= 4) return;
  countGates(c, t);
  const L = c.level + 1, g = LEVELS[L], fails = [];
  if (mcap(c) < g.mcap) fails.push('mcap'); if (c.real < g.back) fails.push('backing');
  if (c.cnt.wallets[THR.indexOf(g.wmin)] < g.wallets) fails.push('wallets'); if (c.cnt.crowd < g.crowd) fails.push('crowd');
  if (c.vol24 < g.vol) fails.push('volume'); if (c.cnt.chk < g.chk) fails.push('checkins'); if (c.net1h < 0) fails.push('netBuying');
  if (t - c.born < g.age) fails.push('age'); if (g.ms && !c.ms[g.ms]) fails.push('milestone');
  if (fails.length) { c.metSince = null; for (const f of fails) c.fails[L][f] = (c.fails[L][f] || 0) + 1; if (fails.length === 1) c.fails[L]['only:' + fails[0]] = (c.fails[L]['only:' + fails[0]] || 0) + 1; return; }
  if (c.metSince === null) c.metSince = t;
  if (t - c.metSince >= g.hold) levelUp(W, c, L, c.metSince, t);
}
function levelUp(W, c, L, cross, t) {
  c.level = L; c.crossed[L] = t; c.metSince = null; W.st.levelUps++;
  (c.snap || (c.snap = {}))[L] = { t: t - c.born, vol: c.totalVol, real: c.real, pot: c.pot };
  if (FIX && L === 4) earn(c, t, 'M');
  if (!W.sc.cards) return;
  const g = LEVELS[L];
  for (const H of c.holders.values()) if (qual(H, g.wmin, g.wait, cross)) grant(W, H.a, c, rollTier(DROP[L], H.a.rep), 'levelDrop');
}
function graduate(W, c, t) {
  (c.snap || (c.snap = {}))[5] = { t: t - c.born, vol: c.totalVol, real: c.real, pot: c.pot };
  c.grad = true; c.gradT = t; c.level = Math.max(c.level, 4);
  // wrap up everything still running
  for (const e of c.effects) e.done = true; c.effects = [];
  if (c.bh) { for (const [, v] of c.bh.fed) { v.H.escrow -= v.amt; v.H.bal += v.amt; } c.bh = null; }
  if (c.circle) { for (const j of c.circle.j) { j.H.escrow -= j.amt; j.H.bal += j.amt; } c.circle = null; }
  if (c.diamond) { for (const [, m] of c.diamond.m) { m.H.locked -= m.amt; m.H.bal += m.amt; } c.diamond = null; }
  if (c.raid) settleRaid(W, c.raid, t, true);
  if (c.ally) { const al = c.ally; for (const cc of [al.a, al.b]) { cc.pot += cc.allyPot; cc.allyPot = 0; } al.a.ally = al.b.ally = null; }
  if (c.htl) { const h = c.htl; c.htl = null; const win = [...h.shields].filter(id => !h.sellers.has(id)).map(id => c.holders.get(id)).filter(Boolean); for (const H of win) H.a.cash += h.prize / win.length; if (!win.length) c.pot += h.prize; }
  for (const H of c.holders.values()) { for (const v of H.vest) H.bal += v.amt; H.vest = []; }
  // pool at the curve's last price; any held-back tokens beyond that are burned
  const p = c.x / c.y, toCreator = c.pot * 0.2; if (c.creator) c.creator.cash += toCreator;
  const nearIn = c.real + c.pot - toCreator, tokNeed = Math.min(POOLTOK, nearIn / p);
  c.burned += POOLTOK - tokNeed; c.amm = { x: nearIn, y: tokNeed }; c.pot = 0;
  for (const H of c.holders.values()) if (H.lastBuy < t - 60 || H.entered < t - 60) H.a.rep++;
}

// ------------------------------------------------------------------ agents
function arrive(W, c) {
  const t = W.t, r = R(), whaleW = W.sc.whaleW;
  const p = r < whaleW ? 'whale' : r < whaleW + 0.26 ? 'degen' : 'crowd';
  let a = null;
  if (R() < 0.45 && W.byP[p]) { const pool = W.byP[p]; for (let i = 0; i < 8; i++) { const x = pick(pool); if (x.cash > 3 && !x.coins.has(c.id)) { a = x; break; } } }
  if (!a) a = newAgent(W, p, p === 'whale' ? logn(W.sc.whaleMed, 0.5) : p === 'degen' ? logn(30, 0.8) : Math.max(2, logn(12, 0.7)));
  const amt = p === 'whale' ? a.cash0 * U(0.08, 0.2) : a.cash * U(0.3, 0.6);
  const H = holder(c, a); H.entered = t; if (a.firstAge === undefined) a.firstAge = t - c.born; buy(W, a, c, Math.max(1, amt));
  schedule(W, a, c);
}
function schedule(W, a, c, d) { const at = W.t + Math.max(1, Math.round(d ?? expo(PERSONA[a.p].int))); if (at <= SIM) W.sched[at].push([a, c]); }
function act(W, a, c) {
  const t = W.t, H = c.holders.get(a.id); if (!H) return;
  const P = PERSONA[a.p], px = price(c), avg = H.cost / Math.max(tokTotal(H), 1e-9), held = tokTotal(H);
  let stay = true;
  salvage(W, a);
  // ---- trading
  switch (a.p) {
    case 'crowd': case 'creator': {
      if (a.p === 'creator') {
        if (a.rugger && c.level >= 2 && px >= 2 * avg && held > 0) { const before = H.bal; sell(W, a, c, H.bal); if (H.bal < before) W.st.rugs++; }
        if (c.grad && R() < 0.1) sell(W, a, c, H.bal * 0.3);
        break;
      }
      if (c.dead && R() < 0.5) { sell(W, a, c, H.bal); stay = false; break; }
      if (c.grad && R() < 0.12) sell(W, a, c, H.bal * 0.5);
      else if (px >= 3 * avg && R() < 0.4) sell(W, a, c, H.bal * 0.5);
      else if (px <= 0.5 * avg && R() < 0.25) { sell(W, a, c, H.bal); stay = false; }
      else if (R() < 0.015) { sell(W, a, c, H.bal); stay = false; }
      else if (c.net1h > 0 && px < 2 * avg && R() < 0.15 && a.cash > 1) buy(W, a, c, a.cash * U(0.1, 0.3));
      break;
    }
    case 'degen': {
      if (held > 0 && (px >= 1.4 * avg && R() < 0.7 || px <= 0.75 * avg && R() < 0.6 || t - H.entered > 360 && R() < 0.3)) { sell(W, a, c, H.bal); stay = false; }
      else if (c.net1h > 0 && R() < 0.3 && a.cash > 1) buy(W, a, c, a.cash * U(0.2, 0.5));
      break;
    }
    case 'whale': {
      if (held > 0 && px >= 4 * avg && R() < 0.6) sell(W, a, c, H.bal * 0.5);
      else if (held > 0 && px >= 2 * avg && c.net1h > 0 && R() < 0.4) sell(W, a, c, H.bal * U(0.2, 0.3));
      else if (held > 0 && px <= 0.6 * avg && R() < 0.3) { sell(W, a, c, H.bal); stay = false; }
      else if (c.net1h > 0 && t - H.entered < 12 * HOUR && R() < 0.2 && a.cash > 5) buy(W, a, c, a.cash0 * 0.05);
      if (c.grad && R() < 0.2) sell(W, a, c, H.bal * 0.5);
      break;
    }
    case 'sniper': {
      if (px >= 1.5 * avg || t - H.entered > a.hold) { sell(W, a, c, H.bal); stay = false; }
      break;
    }
    case 'wash': {
      if (t - H.entered > 12 * HOUR || a.cash < 25 && H.bal <= 0) { sell(W, a, c, H.bal); stay = false; break; }
      if (H.bal > 0) sell(W, a, c, H.bal); else buy(W, a, c, 20);
      break;
    }
    case 'sybil': {
      if ((c.grad || c.dead) && R() < 0.5 || t - H.entered > 3 * DAY || px >= 3 * avg && R() < 0.5) { sell(W, a, c, H.bal); stay = false; }
      break;
    }
  }
  if (!W.sc.cards) { if (P.chk && R() < P.chk) checkIn(W, a, c, H); if (stay) schedule(W, a, c); return; }
  // ---- daily life
  if (P.chk && R() < P.chk && checkIn(W, a, c, H)) claimPack(W, a, c, H);
  if (c.htl && P.shield && R() < P.shield) c.htl.shields.add(a.id);
  // join running effects
  if (P.join && H.bal > 0 && !c.grad) {
    if (c.diamond && t < c.diamond.until && !c.diamond.m.has(a.id) && R() < P.join) { const amt = H.bal * 0.2; H.bal -= amt; H.locked += amt; c.diamond.m.set(a.id, { H, amt, unlock: t + 360, p0: px }); }
    if (c.bh && t < c.bh.end && R() < P.join * 0.8) { const amt = H.bal * 0.1; H.bal -= amt; H.escrow += amt; const v = c.bh.fed.get(a.id) || { H, amt: 0 }; v.amt += amt; c.bh.fed.set(a.id, v); }
    if (c.circle && t < c.circle.end && R() < P.join && !c.circle.j.some(j => j.H === H)) { const amt = Math.min(H.bal * 0.05, 0.01 * SUPPLY); H.bal -= amt; H.escrow += amt; c.circle.j.push({ H, amt }); }
    if (c.proph && R() < P.join) c.proph.bel.add(H);
    const r = c.raid; if (r && r.status === 'active' && R() < P.join * 0.6) { const side = r.a === c ? 0 : 1; const amt = H.bal * U(0.1, 0.25); H.bal -= amt; H.escrow += amt; const s = r.stakes[side].get(a.id) || { H, amt: 0 }; s.amt += amt; r.stakes[side].set(a.id, s); }
    if (r && r.status === 'pending' && r.b === c && R() < 0.6) { r.status = 'active'; r.roundEnd = t + 30; }
    const al = c.ally; if (al && al.status === 'pending' && al.b === c && R() < 0.7) { al.status = 'active'; al.start = t; al.until = t + 360; W.st.alliances++; }
    if (c.diamond) { const m = c.diamond.m.get(a.id); if (m && px <= 0.7 * m.p0 && R() < 0.3) { // leaves early: 20% penalty
      c.diamond.m.delete(a.id); H.locked -= m.amt; const pen = m.amt * 0.2; H.bal += m.amt - pen; const b = cardBurn(c, t, pen / 2); const rest = pen - b; const stay2 = [...c.diamond.m.values()]; const tot = stay2.reduce((s, x) => s + x.amt, 0); if (tot > 0) for (const x of stay2) { const g = rest * x.amt / tot; x.amt += g; x.H.locked += g; } else H.bal += rest; } }
  }
  // ---- cards
  if (R() < P.craft) craft(W, a, c);
  if (P.sac && R() < P.sac && H.bal > 0) sacrifice(W, a, c, H, a.p === 'whale' ? U(0.01, 0.03) : U(0.0005, 0.002));
  if (R() < P.play) tryPlay(W, a, c, H);
  if (stay || H.bal > 0) schedule(W, a, c);
}
function tryPlay(W, a, c, H) {
  const t = W.t, target = findTarget(W, c);
  const mine = handOf(a, c).sort((x, y) => TIERS.indexOf(y.tier) - TIERS.indexOf(x.tier));
  for (const card of mine) { if (!whyNot(W, a, c, H, card, target)) { play(W, a, c, H, card); return; } }
  // Wild card: attune to this coin
  if (a.wild.length && t - c.lastWild >= 360 && !c.grad && c.level >= 1) {
    const T = a.wild.sort((x, y) => TIERS.indexOf(y) - TIERS.indexOf(x))[0];
    if (TLEVEL[T] <= c.level && qual(H, PLAY[T][0], PLAY[T][1], t) && stockOk(c, T) && tierCount(a, c, T) < (DECK[T] ? DECK[T].per : 3)) {
      const card = grant(W, a, c, T, 'wild', { type: chooseType(a, T, false) });
      if (card) { a.wild.splice(a.wild.indexOf(T), 1); c.lastWild = t; W.st.wildPlayed++; if (!whyNot(W, a, c, H, card, target)) play(W, a, c, H, card); }
    }
  }
}
function salvage(W, a) {
  if (!W.sc.cards || !a.hand.length) return;
  for (const card of [...a.hand]) { const c = W.coins[card.coin]; if (!(c.dead || c.grad)) continue;
    if (a.p === 'collector' && c.grad && card.tier !== 'C') continue; // collectors keep Hall of Fame cards
    a.hand.splice(a.hand.indexOf(card), 1); a.shards += SHARDS[card.tier]; W.st.salvaged++; }
  while (a.shards >= 10) { a.shards -= 10; a.wild.push('R'); W.st.wildMade++; }
  if (a.shards >= 3 && a.wild.length === 0) { a.shards -= 3; a.wild.push('C'); W.st.wildMade++; }
}

// ------------------------------------------------------------------ card market (every 30 min per coin)
function market(W, c, t) {
  if (!W.sc.cards || c.grad || c.dead) return;
  const sellers = [];
  for (const a of W.agents) { if (!a.hand.length) continue; for (const k of a.hand) { if (k.coin !== c.id || k.tier === 'C') continue;
    const H = c.holders.get(a.id); const canPlay = H && H.bal > 0 && stake(c, H) >= PLAY[k.tier][0];
    const wants = a.p === 'sybil' || (a.p === 'degen' && R() < 0.5) || (!canPlay && a.p !== 'collector') || (a.p === 'collector' && R() < 0.05);
    if (!wants) continue;
    const own = canPlay ? liftOf(c, k.type, t) * tokTotal(H) * price(c) : 0;
    sellers.push({ a, k, res: Math.max({ R: 0.2, E: 1, M: 4 }[k.tier], own) }); } }
  if (!sellers.length) return;
  const buyers = [];
  for (const H of c.holders.values()) { const a = H.a; if (a.p === 'sybil' || a.p === 'wash' || a.p === 'sniper' || a.cash < 0.2 || H.bal <= 0) continue; buyers.push({ a, H, v: tokTotal(H) * price(c) }); }
  for (const a of W.byP.collector || []) if (a.cash > 0.2) buyers.push({ a, H: null, v: 0 });
  sellers.sort((x, y) => x.res - y.res);
  for (const s of sellers) {
    let best = null, bv = 0;
    for (const b of buyers) {
      if (b.a === s.a || tierCount(b.a, c, s.k.tier) >= DECK[s.k.tier].per) continue;
      let v;
      if (b.H) { if (stake(c, b.H) < PLAY[s.k.tier][0]) continue; v = liftOf(c, s.k.type, t) * b.v * 0.8 * (b.a.p === 'whale' ? 1.2 : 1); }
      else v = { R: 0.3, E: 2, M: 10 }[s.k.tier] * Math.min(3, mcap(c) / 3000) * (c.level >= 2 ? 1 : 0);
      v = Math.min(v, b.a.cash); if (v > bv) { bv = v; best = b; }
    }
    if (!best || bv <= s.res) continue;
    const pr = (bv + s.res) / 2; best.a.cash -= pr; s.a.cash += pr * 0.95; c.pot += pr * 0.05; W.st.royalty += pr * 0.05;
    s.a.hand.splice(s.a.hand.indexOf(s.k), 1); best.a.hand.push(s.k); W.st.mkt++; W.st.mktNear += pr;
    s.a.st.mktIn += pr * 0.95; best.a.st.mktOut += pr;
    if (best.H === null) best.a.coins.add(c.id);
  }
}

// ------------------------------------------------------------------ coin minute loop
function coinMinute(W, c, t) {
  if (!c.live) {
    if (t !== c.born) return;
    c.live = true;
    const cr = newAgent(W, 'creator', 60, { rugger: R() < 0.3 }); c.creator = cr; const H = holder(c, cr); H.entered = t; H.init = buy(W, cr, c, FIX ? 10 : 30); schedule(W, cr, c, 60);
    const ns = 3 + Math.floor(R() * 4); for (let i = 0; i < ns; i++) { const s = newAgent(W, 'sniper', 60, { hold: U(10, 90) }); holder(c, s).entered = t; buy(W, s, c, 60); schedule(W, s, c, 1); }
    return;
  }
  // ring buffers
  const iD = t % DAY, iH = t % HOUR; c.vol24 -= c.volR[iD]; c.volR[iD] = 0; c.net1h -= c.netR[iH]; c.netR[iH] = 0;
  if (t % 10 === 0) { c.pr.push(price(c)); if (c.pr.length > 144) c.pr.shift(); c.peak = Math.max(...c.pr); c.peakAll = Math.max(c.peakAll, price(c)); c.stats.peakMcap = Math.max(c.stats.peakMcap, mcap(c)); }
  if (!c.grad) {
    for (const e of c.effects) { if (e.done) continue; if (!e.started && t >= e.start) { e.started = true; fxStart(W, c, e, t); } if (t >= e.start) fxStep(W, c, e, t); if (t >= e.end && !e.done) fxEnd(W, c, e, t); if (c.grad) break; }
    c.effects = c.effects.filter(e => !e.done);
    if (c.diamond) { for (const [id, m] of c.diamond.m) if (t >= m.unlock) { m.H.locked -= m.amt; m.H.bal += m.amt; c.diamond.m.delete(id); } if (t >= c.diamond.until && !c.diamond.m.size) c.diamond = null; }
    raidStep(W, c, t); allyStep(W, c, t); htlStep(W, c, t);
    if (c.level >= 4 && (FIX ? t % 360 === 0 : t % DAY % 720 === 360)) earn(c, t, 'M');
    if (t % 5 === 0) evalLevel(W, c, t);
    if (t % 30 === 0) market(W, c, t);
  }
  // arrivals
  if (!c.dead) {
    const age = t - c.born, lvl = c.grad ? 1.2 : [1, 1, 1.4, 1.9, 2.6][c.level];
    let lam = 0.22 * W.sc.arr * c.q * lvl * (c.net1h > 0 ? 1.3 : 0.7) * Math.exp(-age / (16 * HOUR));
    if (t < c.until.hype) lam *= 2; if (t < c.until.rebrand) lam *= 1.1; if (t < c.until.banner) lam *= 0.85; if (t < c.until.win) lam *= 1.15;
    if (price(c) < 0.4 * c.peakAll) lam *= 0.5;
    const n = pois(lam); for (let i = 0; i < n; i++) arrive(W, c);
  }
  // special actors
  if (W.sc.cards || true) {
    if (t - c.born === 30 && c.id < W.sc.wash) { c.wash = true; const a = newAgent(W, 'wash', 300); holder(c, a).entered = t; schedule(W, a, c, 1); }
    if (t - c.born === 60 && c.id >= 2 && c.id < 2 + W.sc.sybils) { c.sybil = true; const ctrl = { id: 'farm' + c.id }; for (let i = 0; i < 40; i++) { const a = newAgent(W, 'sybil', 6, { ctrl }); const H = holder(c, a); H.entered = t; buy(W, a, c, 5.5); schedule(W, a, c, 60 + Math.floor(R() * 60)); } }
  }
  if (t % 60 === 0) {
    if (!c.grad && !c.dead && t - c.born > DAY && c.vol24 < 10) c.dead = true;
    check(W, c);
  }
}
function check(W, c) {
  let held = 0; for (const H of c.holders.values()) { held += tokTotal(H); if (H.bal < -1e-3 || H.escrow < -1e-3 || H.locked < -1e-3) W.st.violations++; }
  const inCurve = c.grad ? c.amm.y : (c.y - YEND) + POOLTOK;
  const err = Math.abs(held + inCurve + c.burned - SUPPLY) / SUPPLY; W.st.maxLedgerErr = Math.max(W.st.maxLedgerErr, err); if (err > 1e-6) W.st.violations++;
  if (Math.abs(held - c.circ) / SUPPLY > 1e-6) W.st.violations++;
  if (!c.grad) { const payout = c.x - c.k / (c.y + c.circ); if (payout > c.real * (1 + 1e-9) + 1e-6) W.st.violations++; }
  if (c.pot < -1e-6) W.st.violations++;
}

// ------------------------------------------------------------------ run
function run(scName, seed) {
  const W = world(SCEN[scName], seed);
  for (let t = 0; t <= SIM; t++) {
    W.t = t;
    for (const c of W.coins) coinMinute(W, c, t);
    const due = W.sched[t]; W.sched[t] = null;
    for (const [a, c] of due) act(W, a, c);
  }
  return summarize(W);
}
function summarize(W) {
  const out = { coins: [], persona: {}, st: W.st, farms: {}, wash: [], creators: [] };
  for (const c of W.coins) {
    const holders = [...c.holders.values()].filter(H => tokTotal(H) > 0).length;
    out.coins.push({ id: c.id, q: c.q, level: c.level, grad: c.grad, gradT: c.gradT && c.gradT - c.born, dead: c.dead, crossed: Object.fromEntries(Object.entries(c.crossed).map(([k, v]) => [k, v - c.born])), peak: c.stats.peakMcap, end: mcap(c), holders, plays: c.stats.plays, playsT: c.stats.playsT, raids: c.stats.raids, htl: c.stats.htl, fails: c.fails, wash: c.wash, sybil: c.sybil, rules: [...c.rules], made: c.deck.made, vol: c.totalVol, snap: c.snap || {} });
  }
  const val = (a) => { let v = a.cash; for (const cid of a.coins) { const c = W.coins[cid], H = c.holders.get(a.id); if (H) v += tokTotal(H) * price(c) * 0.9; } return v; };
  for (const a of W.agents) {
    const P = out.persona[a.p] || (out.persona[a.p] = { n: 0, in: 0, pnl: [], pnlAbs: 0, cards: { C: 0, R: 0, E: 0, M: 0 }, plays: { C: 0, R: 0, E: 0, M: 0 }, mktIn: 0, mktOut: 0, crafted: 0, played1: 0, gotEpic: 0, sacNear: 0 });
    const v = val(a), spent = a.cash0; P.n++; P.in += spent; P.pnl.push(v / spent - 1); P.pnlAbs += v - spent;
    for (const T of TIERS) { P.cards[T] += a.st.cards[T]; P.plays[T] += a.st.plays[T]; }
    P.mktIn += a.st.mktIn; P.mktOut += a.st.mktOut; P.crafted += a.st.crafted > 0 ? 1 : 0; P.played1 += a.st.played > 0 ? 1 : 0; P.gotEpic += a.st.cards.E + a.st.cards.M > 0 ? 1 : 0; P.sacNear += a.st.sacNear;
    if (a.p === 'sybil') { const f = out.farms[a.ctrl.id] || (out.farms[a.ctrl.id] = { in: 0, v: 0, cards: 0, mkt: 0 }); f.in += spent; f.v += v; f.cards += a.st.cards.R + a.st.cards.E + a.st.cards.M; f.mkt += a.st.mktIn; }
    if (a.p === 'wash') out.wash.push(spent - v);
    if (a.p === 'crowd' && a.firstAge !== undefined && a.firstAge < 120) (out.early || (out.early = [])).push(v / spent - 1);
    if (a.p === 'creator') out.creators.push({ rugger: a.rugger, pnl: v - spent, vault: W.coins.find(c => c.creator === a).rules.has('vaultSeal') });
  }
  return out;
}

// ------------------------------------------------------------------ report
function report(name, runs) {
  const L = [];
  const coins = runs.flatMap(r => r.coins), n = coins.length;
  const lv = [1, 2, 3, 4].map(l => coins.filter(c => c.level >= l).length / n);
  L.push(`\n=== ${name}  (${runs.length} worlds × 8 coins = ${n} coins, 5 days each)`);
  L.push(`Coins reaching L2 ${pct(lv[1])} · L3 ${pct(lv[2])} · L4 ${pct(lv[3])} · graduated ${pct(coins.filter(c => c.grad).length / n)} · died ${pct(coins.filter(c => c.dead).length / n)}`);
  const tt = l => median(coins.filter(c => c.crossed[l] !== undefined).map(c => c.crossed[l] / 60));
  L.push(`Median hours to L2 ${f1(tt(2))} · L3 ${f1(tt(3))} · L4 ${f1(tt(4))} · graduation ${f1(median(coins.filter(c => c.grad).map(c => c.gradT / 60)))}`);
  L.push(`Median peak market cap ${f1(median(coins.map(c => c.peak)))} NEAR · median holders at end ${median(coins.map(c => c.holders))}`);
  for (const l of [2, 3, 4]) { const agg = {}; for (const c of coins) if (c.level === l - 1) for (const [k, v] of Object.entries(c.fails[l])) if (k.startsWith('only:')) agg[k.slice(5)] = (agg[k.slice(5)] || 0) + v; const tot = Object.values(agg).reduce((s, v) => s + v, 0);
    if (tot) L.push(`  stuck below L${l}: when only one rule was missing it was ` + Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${pct(v / tot)}`).join(', ')); }
  const S = k => runs.reduce((s, r) => s + (typeof r.st[k] === 'number' ? r.st[k] : 0), 0);
  L.push(`Invariant violations: ${S('violations')} · worst token-ledger error ${runs.reduce((m, r) => Math.max(m, r.st.maxLedgerErr), 0).toExponential(1)}`);
  if (runs[0].st.packs || S('crafts')) {
    const src = {}; for (const r of runs) for (const [k, v] of Object.entries(r.st.src)) { const s = src[k] || (src[k] = { C: 0, R: 0, E: 0, M: 0 }); for (const T of TIERS) s[T] += v[T]; }
    L.push(`Cards made per world by source: ` + Object.entries(src).map(([k, v]) => `${k} ${f1((v.C + v.R + v.E + v.M) / runs.length)} (R ${f1(v.R / runs.length)}, E ${f1(v.E / runs.length)}, M ${f1(v.M / runs.length)})`).join(' · '));
    L.push(`Per world: plays ${f1(mean(runs.map(r => Object.values(r.st.plays).reduce((s, v) => s + v, 0))))}, crafts ${f1(S('crafts') / runs.length)}, sacrifices ${f1(S('sacs') / runs.length)}, market sales ${f1(S('mkt') / runs.length)} (${f1(S('mktNear') / runs.length)} NEAR, ${f1(S('royalty') / runs.length)} to pots), raids ${f1(S('raids') / runs.length)} (${f1(S('raidsHard') / runs.length)} hard), alliances ${f1(S('alliances') / runs.length)}, Hold the Line ${f1(S('htl') / runs.length)} (survived ${f1(S('htlSurvived') / runs.length)}), Wild made ${f1(S('wildMade') / runs.length)} / played ${f1(S('wildPlayed') / runs.length)}`);
    L.push(`Deck pressure per world: downgrades ${f1(S('downgrade') / runs.length)}, out of stock R ${f1(runs.reduce((s, r) => s + r.st.stockout.R, 0) / runs.length)} / E ${f1(runs.reduce((s, r) => s + r.st.stockout.E, 0) / runs.length)} / M ${f1(runs.reduce((s, r) => s + r.st.stockout.M, 0) / runs.length)}, packs ${f1(S('packs') / runs.length)} (blocked by 3 Commons ${f1(S('packBlocked') / runs.length)}), hand full ${f1(S('handFull') / runs.length)}`);
    const plays = {}; for (const r of runs) for (const [k, v] of Object.entries(r.st.plays)) plays[k] = (plays[k] || 0) + v;
    L.push(`Plays by card (per world): ` + Object.entries(plays).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f1(v / runs.length)}`).join(', '));
    const fx = {}, lf = {}; for (const r of runs) for (const [k, v] of Object.entries(r.st.fx)) if (v && v.chg) { const s = fx[k] || (fx[k] = []); s.push(...v.chg); if (v.lift) (lf[k] || (lf[k] = [])).push(...v.lift); }
    L.push(`Direct price lift from the pot's buy-and-burn (median per play): ` + Object.entries(lf).map(([k, v]) => `${k} +${pct(median(v), 1)}`).join(', '));
    L.push(`Median price change while the effect ran: ` + Object.entries(fx).sort((a, b) => median(b[1]) - median(a[1])).map(([k, v]) => `${k} ${pct(median(v), 1)}`).join(', '));
  }
  L.push(`Persona outcomes (median PnL %, share of all profit, cards per wallet, Epic+Mythic share of plays, played ≥1 card, card market net NEAR per wallet):`);
  const P = {}; for (const r of runs) for (const [k, v] of Object.entries(r.persona)) { const s = P[k] || (P[k] = { n: 0, in: 0, pnl: [], pnlAbs: 0, cards: { C: 0, R: 0, E: 0, M: 0 }, plays: { C: 0, R: 0, E: 0, M: 0 }, mktIn: 0, mktOut: 0, crafted: 0, played1: 0, gotEpic: 0, sacNear: 0 }); s.n += v.n; s.in += v.in; s.pnl.push(...v.pnl); s.pnlAbs += v.pnlAbs; for (const T of TIERS) { s.cards[T] += v.cards[T]; s.plays[T] += v.plays[T]; } s.mktIn += v.mktIn; s.mktOut += v.mktOut; s.crafted += v.crafted; s.played1 += v.played1; s.gotEpic += v.gotEpic; s.sacNear += v.sacNear; }
  const bigPlays = Object.values(P).reduce((s, v) => s + v.plays.E + v.plays.M, 0) || 1, allIn = Object.values(P).reduce((s, v) => s + v.in, 0);
  for (const [k, v] of Object.entries(P).sort((a, b) => b[1].in - a[1].in)) {
    const cards = v.cards.C + v.cards.R + v.cards.E + v.cards.M;
    L.push(`  ${k.padEnd(9)} n=${String(Math.round(v.n / runs.length)).padStart(4)}/world  capital ${pct(v.in / allIn).padStart(4)}  PnL ${pct(median(v.pnl)).padStart(5)} (mean ${pct(mean(v.pnl))})  profit ${f1(v.pnlAbs / runs.length).padStart(7)} NEAR/world  cards/wallet ${f1(cards / v.n)} (R+ ${f1((v.cards.R + v.cards.E + v.cards.M) / v.n)})  Epic+ plays ${pct((v.plays.E + v.plays.M) / bigPlays)}  played ${pct(v.played1 / v.n)}  crafted ${pct(v.crafted / v.n)}  market ${f1((v.mktIn - v.mktOut) / v.n)}`);
  }
  const early = runs.flatMap(r => r.early || []); L.push(`Crowd wallets that entered in a coin's first 2h: median PnL ${pct(median(early))} (n=${Math.round(early.length / runs.length)}/world)`);
  const farms = runs.flatMap(r => Object.values(r.farms));
  if (farms.length) L.push(`Sybil farms (40 wallets × 5.5 NEAR): median return ${pct(median(farms.map(f => f.v / f.in - 1)))}, R+ cards per farm ${f1(mean(farms.map(f => f.cards)))}, card sales ${f1(mean(farms.map(f => f.mkt)))} NEAR per farm`);
  const wash = runs.flatMap(r => r.wash); if (wash.length) { const wc = coins.filter(c => c.wash), oc = coins.filter(c => !c.wash);
    L.push(`Wash traders: cost ${f1(median(wash))} NEAR each in fees/slippage; coins with a wash trader reached L2 ${pct(wc.filter(c => c.level >= 2).length / wc.length)} vs ${pct(oc.filter(c => c.level >= 2).length / oc.length)} without`); }
  const cr = runs.flatMap(r => r.creators); const rug = cr.filter(c => c.rugger);
  L.push(`Creators: honest median profit ${f1(median(cr.filter(c => !c.rugger).map(c => c.pnl)))} NEAR, ruggers ${f1(median(rug.map(c => c.pnl)))} NEAR (with Vault Seal ${f1(median(rug.filter(c => c.vault).map(c => c.pnl)))}, without ${f1(median(rug.filter(c => !c.vault).map(c => c.pnl)))}); rug sells ${S('rugs')}, blocked by Vault Seal ${S('rugBlocked')}`);
  const pp = Object.values(P).flatMap(v => v.pnl.map(x => Math.max(0, x)));
  L.push(`Inequality: Gini of card ownership by wallet n/a · share of wallets with PnL > 0: ${pct(Object.values(P).flatMap(v => v.pnl).filter(x => x > 0).length / Object.values(P).reduce((s, v) => s + v.n, 0))} · Gini of gains ${gini(pp).toFixed(2)}`);
  return L.join('\n');
}

const seeds = +process.argv[2] || 10, only = process.argv[3];
// FEES=1 node sim-v3.cjs 10 -> fee accumulated per level (printed, results file untouched)
if (process.env.FEES) {
  const md = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const n0 = (v) => v.toFixed(0).padStart(6);
  for (const name of (process.env.SCN ? process.env.SCN.split(',') : ['base+fixes', 'bear+fixes', 'mania+fixes', 'whales+fixes'])) {
    const coins = []; for (let s = 1; s <= seeds; s++) coins.push(...run(name, s * 7919).coins);
    console.log(`\n${name}: ${coins.length} coins (${seeds} worlds). Medians [averages] at the moment each level is reached. Fee = total volume × rate.`);
    console.log('level   reached   time(h)   real NEAR    total volume       fee @1%       fee @2%   fee/day while at this level @1%');
    for (const L of [2, 3, 4, 5]) {
      const got = coins.filter(c => c.snap[L]); if (!got.length) { console.log(`L${L}`.padEnd(8) + '    0%'); continue; }
      const s = got.map(c => c.snap[L]);
      const perDay = got.filter(c => c.snap[L + 1] || L === 5).map(c => { const a = c.snap[L], b = c.snap[L + 1]; return b ? (b.vol - a.vol) * 0.01 / Math.max((b.t - a.t) / 1440, 1 / 24) : null; }).filter(v => v !== null);
      const f = (k, m = 1) => `${n0(md(s.map(x => x[k] * m)))} [${avg(s.map(x => x[k] * m)).toFixed(0)}]`.padStart(14);
      console.log((L === 5 ? 'Grad' : `L${L}`).padEnd(8) + `${(got.length / coins.length * 100).toFixed(0)}%`.padStart(7) + (md(s.map(x => x.t / 60)).toFixed(1)).padStart(10) +
        f('real') + f('vol') + f('vol', 0.01) + f('vol', 0.02) + (perDay.length ? `${n0(md(perDay))} [${avg(perDay).toFixed(0)}]` : '   – (no next level)').padStart(18));
    }
    const stuck = coins.filter(c => !c.grad && c.level >= 2);
    console.log(`coins that stopped below graduation: median lifetime fees @1% = ${md(stuck.map(c => c.vol * 0.01)).toFixed(0)} NEAR (by level ${[2, 3, 4].map(l => `L${l}: ${md(stuck.filter(c => c.level === l).map(c => c.vol * 0.01)).toFixed(0)}`).join(', ')})`);
  }
  process.exit(0);
}
const t0 = Date.now(); const lines = [`Rulecard v3 simulation — ${new Date().toISOString().slice(0, 10)} — ${seeds} worlds per scenario`];
for (const name of Object.keys(SCEN)) { if (only && name !== only) continue; const runs = []; for (let s = 1; s <= seeds; s++) runs.push(run(name, s * 7919)); const r = report(name, runs); console.log(r); lines.push(r); }
lines.push(`\n(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
require('fs').writeFileSync(require('path').join(__dirname, 'sim-v3-results.txt'), lines.join('\n') + '\n');
