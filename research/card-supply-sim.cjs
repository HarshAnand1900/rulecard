// Card supply vs raid demand (v6 raid plan: 3 slots, Rally/Curse/Ward, matched cards used up).
// Question: do players get enough Commons to fill raid plans at each level?
// Run: node research/card-supply-sim.cjs
let S = 1; const rnd = () => (S = (S * 16807) % 2147483647) / 2147483647;
const pick = (w) => { let r = rnd() * w.reduce((a, b) => a + b[1], 0); for (const [k, v] of w) { r -= v; if (r <= 0) return k; } return w[0][0]; };
const TACT = ['Rally', 'Curse', 'Ward'], OTHER = ['Ember', 'RollCall', 'Siren', 'Hedge'];

function run(cfg, seed) {
  S = seed;
  const ends = []; let t = 0; for (const d of cfg.lvl) ends.push(t += d); // end hour of L1..L4
  const T = ends[3], levelAt = (h) => ends.findIndex((e) => h < e) + 1 || 4;
  const W = cfg.weights;
  const commonType = () => pick(W);
  // players join so that by the end of L1/L2/L3/L4 there are ~cfg.pop[i] card players
  const P = []; let target = 0;
  for (let h = 0; h < T; h++) {
    const L = levelAt(h), prevEnd = L === 1 ? 0 : ends[L - 2], want = (L === 1 ? 0 : cfg.pop[L - 2]) + (cfg.pop[L - 1] - (L === 1 ? 0 : cfg.pop[L - 2])) * (h - prevEnd + 1) / (ends[L - 1] - prevEnd);
    while (target < want) { target++; P.push({ join: h, joinL: L, kind: rnd() < 0.5 ? 'active' : 'casual', hand: {}, lastPack: -99, gmOff: Math.floor(rnd() * 24), stats: [0, 1, 2, 3, 4].map(() => ({ got: 0, tact: 0, rare: 0, raids: 0, slots: 0, full: 0, hadCall: 0, calls: 0, handAtRaid: 0, allAtRaid: 0, waste: 0 })) }); }
  }
  const add = (p, c, L) => { if (c === 'Rare') { p.stats[L].rare++; return; } const n = Object.values(p.hand).reduce((a, b) => a + b, 0); p.stats[L].got++; if (TACT.includes(c)) p.stats[L].tact++; if (n >= cfg.handMax) { p.stats[L].waste++; return; } p.hand[c] = (p.hand[c] || 0) + 1; };
  const tactics = (p) => TACT.reduce((a, k) => a + (p.hand[k] || 0), 0);
  const raids = []; for (let h = ends[0] + 2; h < T - 2; h += cfg.raidEvery) raids.push(h);
  const side = { slots: 0, tactic: 0 };
  for (let h = 0; h < T; h++) {
    const L = levelAt(h);
    // level drop at each crossing into L2..L4: 3 cards to wallets that joined before
    if (h > 0 && levelAt(h - 1) !== L) { const cOdds = { 2: 0.75, 3: 0.65, 4: 0.78 }[L]; for (const p of P) if (p.join < h - 1) for (let i = 0; i < cfg.dropN; i++) add(p, rnd() < cOdds ? commonType() : 'Rare', L); }
    for (const p of P) {
      if (p.join > h - 1) continue;
      if (cfg.starter && p.join === h - 1) for (const k of TACT) add(p, k, L); // starter: 1 Rally, 1 Curse, 1 Ward after 1h holding
      const gm = p.kind === 'active' ? (h - p.gmOff) % (cfg.activeGm || 6) === 0 : (h - p.gmOff) % 24 === 0;
      if (gm && h - p.lastPack >= (cfg.packEvery || 12)) { p.lastPack = h; for (let i = 0; i < cfg.packN; i++) add(p, rnd() < 0.95 ? commonType() : 'Rare', L); }
      // non-tactic Commons get used outside raids: one every 12h if held
      if (h % 12 === 0) { const o = OTHER.find((k) => p.hand[k] > 0); if (o) p.hand[o]--; }
    }
    if (!raids.includes(h)) continue;
    // a raid: the side calls one tactic per slot (coordination in chat); players fill what they can
    const joiners = P.filter((p) => p.join < h - 1 && rnd() < (p.kind === 'active' ? 0.9 : 0.5));
    const call = [0, 1, 2].map(() => TACT[Math.floor(rnd() * 3)]);
    const plans = joiners.map((p) => {
      const left = { ...p.hand }, plan = [];
      p.stats[L].raids++; p.stats[L].handAtRaid += tactics(p); p.stats[L].allAtRaid += Object.values(p.hand).reduce((a, b) => a + b, 0);
      for (const c of call) {
        p.stats[L].calls++;
        if ((left[c] || 0) > 0) p.stats[L].hadCall++;
        let use = null;
        if ((left[c] || 0) > 0 && rnd() < 0.75) use = c;
        else { const own = TACT.filter((k) => (left[k] || 0) > 0); if (own.length) use = own[Math.floor(rnd() * own.length)]; }
        if (use) { left[use]--; p.stats[L].slots++; }
        plan.push(use);
      }
      if (plan.every(Boolean)) p.stats[L].full++;
      return [p, plan];
    });
    for (let s = 0; s < 3; s++) {
      const count = {}; for (const [, plan] of plans) if (plan[s]) count[plan[s]] = (count[plan[s]] || 0) + 1;
      const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
      side.slots++;
      if (!sorted.length || sorted[0][1] < 3 || (sorted[1] && sorted[1][1] === sorted[0][1])) continue;
      side.tactic++; const win = sorted[0][0];
      for (const [p, plan] of plans) if (plan[s] === win) p.hand[win]--;
    }
    if (cfg.loot && rnd() < 0.5) for (const [p, plan] of plans) if (plan.some(Boolean)) add(p, TACT[Math.floor(rnd() * 3)], L);
    const won = rnd() < 0.5;
    if (cfg.lootPack && won) for (const [p, plan] of plans) if (plan.filter(Boolean).length >= 2) for (let i = 0; i < (cfg.lootN || cfg.packN); i++) add(p, rnd() < 0.95 ? commonType() : 'Rare', L);
    if (cfg.loseN && !won) for (const [p, plan] of plans) if (plan.filter(Boolean).length === 3) for (let i = 0; i < cfg.loseN; i++) add(p, TACT[Math.floor(rnd() * 3)], L);
  }
  return { P, side, raids: raids.length, ends };
}

function report(name, cfg, runs = 30) {
  const agg = {}; let sideT = 0, sideS = 0, nRaids = 0;
  for (let r = 0; r < runs; r++) {
    const { P, side, raids } = run(cfg, 1000 + r); sideT += side.tactic; sideS += side.slots; nRaids += raids;
    for (const p of P) for (let L = 1; L <= 4; L++) {
      const k = `${p.kind}|joined L${p.joinL}|L${L}`, s = p.stats[L], a = agg[k] || (agg[k] = { n: 0, got: 0, tact: 0, rare: 0, raids: 0, slots: 0, full: 0, hadCall: 0, calls: 0, hand: 0 });
      if (L < p.joinL) continue;
      a.n++; a.got += s.got; a.tact += s.tact; a.rare += s.rare; a.raids += s.raids; a.slots += s.slots; a.full += s.full; a.hadCall += s.hadCall; a.calls += s.calls; a.hand += s.handAtRaid;
    }
  }
  console.log(`\n=== ${name} ===  levels ${cfg.lvl.join('/')}h, raid every ${cfg.raidEvery}h (${(nRaids / runs).toFixed(1)} raids per coin), pack ${cfg.packN}, drop ${cfg.dropN}, tactic share ${(cfg.weights.filter(([k]) => TACT.includes(k)).reduce((a, b) => a + b[1], 0) / cfg.weights.reduce((a, b) => a + b[1], 0) * 100).toFixed(0)}%${cfg.loot ? ', raid loot' : ''}`);
  console.log(`side had a tactic in ${(sideT / sideS * 100).toFixed(0)}% of slots`);
  console.log('player                    level | Commons got | tactics got | raids | tactics in hand at raid | slots filled /3 | full plan | had the called card');
  for (const kind of ['active', 'casual']) for (const jl of [1, 2, 3]) for (let L = Math.max(2, jl); L <= 4; L++) {
    const a = agg[`${kind}|joined L${jl}|L${L}`]; if (!a || !a.n) continue; const per = (v) => (v / a.n).toFixed(1);
    console.log(`${(kind + ', joined L' + jl).padEnd(25)} L${L}  | ${per(a.got).padStart(11)} | ${per(a.tact).padStart(11)} | ${per(a.raids).padStart(5)} | ${(a.raids ? a.hand / a.raids : 0).toFixed(1).padStart(23)} | ${(a.raids ? a.slots / a.raids : 0).toFixed(1).padStart(15)} | ${(a.raids ? a.full / a.raids * 100 : 0).toFixed(0).padStart(8)}% | ${(a.calls ? a.hadCall / a.calls * 100 : 0).toFixed(0).padStart(18)}%`);
  }
}

const uniform = [...TACT, ...OTHER].map((k) => [k, 1]);
const tactic60 = [...TACT.map((k) => [k, 20]), ...OTHER.map((k) => [k, 10])];
const base = { lvl: [6, 18, 18, 30], pop: [15, 40, 80, 120], raidEvery: 8, packN: 3, dropN: 3, handMax: 12, weights: uniform, loot: false };
const only = process.argv[2];
const SC = {
  A: ['A. Old supply: 1-card packs, 1-card drops, equal odds', { ...base, packN: 1, dropN: 1 }],
  B: ['B. 3-card packs and drops, equal odds', base],
  C: ['C. B + tactics 60% of Commons', { ...base, weights: tactic60 }],
  D: ['D. C + raid loot', { ...base, weights: tactic60, loot: true }],
  E: ['E. D with raids every 4h (busy coin)', { ...base, weights: tactic60, loot: true, raidEvery: 4 }],
  F: ['F. D on a fast coin (graduates in 33h)', { ...base, weights: tactic60, loot: true, lvl: [3, 8, 8, 14] }],
  G: ['G. D + starter set (1 Rally, 1 Curse, 1 Ward after 1h holding)', { ...base, weights: tactic60, loot: true, starter: true }],
  H: ['H. G with raids every 4h (busy coin)', { ...base, weights: tactic60, loot: true, starter: true, raidEvery: 4 }],
  I: ['I. G on a fast coin (graduates in 33h)', { ...base, weights: tactic60, loot: true, starter: true, lvl: [3, 8, 8, 14] }],
};
for (const [k, [n, c]] of Object.entries(SC)) if (!only || only.includes(k)) report(n, c);

// ---- v6.1 comparison: compact summary per scenario. Run: node research/card-supply-sim.cjs v61
function summary(name, cfg, runs = 30) {
  const g = {}; let sideT = 0, sideS = 0;
  for (let r = 0; r < runs; r++) {
    const { P, side } = run(cfg, 2000 + r); sideT += side.tactic; sideS += side.slots;
    for (const p of P) {
      const key = `${p.kind} ${p.joinL < 3 ? 'early' : 'late (L3)'}`, a = g[key] || (g[key] = { n: 0, got: 0, raids: 0, full: 0, had: 0, calls: 0, tact: 0, all: 0, waste: 0 });
      a.n++;
      for (let L = 1; L <= 4; L++) { const s = p.stats[L]; a.got += s.got; a.raids += s.raids; a.full += s.full; a.had += s.hadCall; a.calls += s.calls; a.tact += s.handAtRaid; a.all += s.allAtRaid; a.waste += s.waste; }
    }
  }
  console.log(`\n${name}   [side has a tactic in ${(sideT / sideS * 100).toFixed(0)}% of slots]`);
  console.log('  player           | Commons got in coin life | raids | full plan | had the wanted card | tactics in hand | whole hand | cards wasted (hand full)');
  for (const k of ['active early', 'active late (L3)', 'casual early', 'casual late (L3)']) {
    const a = g[k]; if (!a) continue;
    console.log(`  ${k.padEnd(16)} | ${(a.got / a.n).toFixed(1).padStart(24)} | ${(a.raids / a.n).toFixed(1).padStart(5)} | ${(a.full / a.raids * 100).toFixed(0).padStart(8)}% | ${(a.had / a.calls * 100).toFixed(0).padStart(18)}% | ${(a.tact / a.raids).toFixed(1).padStart(15)} | ${(a.all / a.raids).toFixed(1).padStart(10)} | ${(a.waste / a.n).toFixed(1).padStart(6)}`);
  }
}
if (only === 'v61') {
  const v = { ...base, weights: tactic60, starter: true, loot: false, lootPack: true };
  const list = [
    ['0. Current v6 (pack 3 cards / 12h, +1 card per raid win)', { ...base, weights: tactic60, starter: true, loot: true }],
    ['1. Pack 3 cards / 6h, raid-win pack (2+ rounds played)', { ...v, packEvery: 6, activeGm: 6 }],
    ['2. Pack 3 cards / 4h, raid-win pack', { ...v, packEvery: 4, activeGm: 4 }],
    ['3. Pack 2 cards / 6h, raid-win pack', { ...v, packEvery: 6, activeGm: 6, packN: 2 }],
    ['4. Pack 2 cards / 4h, raid-win pack', { ...v, packEvery: 4, activeGm: 4, packN: 2 }],
    ['5. Pack 1 card / 4h, raid-win pack of 3', { ...v, packEvery: 4, activeGm: 4, packN: 1, lootN: 3 }],
    ['6. Pack 2 cards / 6h, hand limit 8', { ...v, packEvery: 6, activeGm: 6, packN: 2, handMax: 8 }],
    ['7. Option 3 with a raid every 6h', { ...v, packEvery: 6, activeGm: 6, packN: 2, raidEvery: 6 }],
    ['8. Option 3 on a fast coin (33h)', { ...v, packEvery: 6, activeGm: 6, packN: 2, lvl: [3, 8, 8, 14] }],
  ];
  for (const [n, c] of list) summary(n, c);
}
if (only === 'spicy') {
  const v = { ...base, weights: tactic60, starter: true, lootPack: true, packEvery: 6, activeGm: 6, packN: 2 };
  for (const [n, c] of [
    ['A. 2 cards / 6h, win pack 2 (current)', v],
    ['B. 2 cards / 6h, win pack 3', { ...v, lootN: 3 }],
    ['C. B + losers who filled all 3 slots get 1 tactic card', { ...v, lootN: 3, loseN: 1 }],
    ['D. C with hand limit 10', { ...v, lootN: 3, loseN: 1, handMax: 10 }],
  ]) summary(n, c);
}
