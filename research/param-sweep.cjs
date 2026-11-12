// PARAMETER SWEEP built on supply-60d-sim.cjs: the same rules, run over a grid of the three numbers we had to choose.
// Run: node research/param-sweep.cjs   (prints the table used in the README)
// (original header) 60-day supply simulation for the v7 coin (the track asks: "simulate 60 days, show supply over time under a few scenarios").
// Rules are the contract's: gm every 6h, idle burn 1% per 6h after 12h without a gm (first burn at 18h) with the one 8%
// daily cap, half of idle burn burned and half paid to the Vault, the Vault protecting locked tokens for 24h at ×1.5 weight,
// the Daily Ritual (made: pot burns 5%, 7% from a 3-day streak; missed: idle burn ×2 for 6h), Ember when 20+ wallets checked in.
// Three communities: active (stays engaged and keeps recruiting), fading (engagement decays, recruiting stops after day 10),
// dead (engaged for 5 days, then nearly everyone stops).
// Run: node research/supply-60d-sim.cjs   → prints a table and writes docs/supply-60d.svg
const fs = require('fs'); const path = require('path');
let S = 1; const rnd = () => (S = (S * 16807) % 2147483647) / 2147483647;
const logn = (m, s) => Math.exp(Math.log(m) + s * Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd()));

const SUPPLY = 1e9, PRICE = 3e-6;            // tokens; NEAR per token (≈ 3 µN, as on the demo coins)
const START_HOLDERS = 120, BAG = 3e6;        // a bag of 3M tokens ≈ 9 NEAR
// How people check in. faithful: about every 6h. regular: a routine every 12h (the grace time covers it), sometimes skipping a slot.
// casual: once a day, sometimes skipping. drifter: random and rare. `every` is in 6h steps, `skip` the chance to miss a slot.
const TYPES = {
  faithful: { every: 1, skip: 0.1, lock: 0.5 },
  regular: { every: 2, skip: 0.1, lock: 0.25 },
  casual: { every: 4, skip: 0.15, lock: 0.1 },
  drifter: { random: 0.05, lock: 0 },
};
const SCEN = {
  active: { m: () => 1, joins: () => 2 },
  fading: { m: d => Math.exp(-d / 18), joins: d => (d < 10 ? 2 : 0) },
  dead: { m: d => (d < 5 ? 1 : 0.02), joins: () => 0 },
};
const DAYS = 60, STEPS = DAYS * 4;

const P = { idle: 0.01, grace: 24, pct: 0.6 };
function run(name, seed) {
  S = seed; const sc = SCEN[name];
  const mk = (cohort) => { const r = rnd(); const type = r < 0.25 ? 'faithful' : r < 0.50 ? 'regular' : r < 0.75 ? 'casual' : 'drifter'; const bal = logn(BAG, 0.7); bought += bal; return { type, off: Math.floor(rnd() * 4), bal, locked: 0, unlockAt: 0, lastGm: -rnd() * 6, gmDay: -1, b0: bal, cohort, lossBase: bal, lossUsed: 0 }; };
  let bought = 0;
  const hs = Array.from({ length: START_HOLDERS }, () => mk(true));
  const bought0 = bought, circ0 = hs.reduce((a, x) => a + x.bal, 0);
  let burned = 0, pot = 20, streak = 0, doubled = false, yGm = 0, yLock = 0, made = 0, days = 0;
  const out = { supply: [], circ: [], floor: [], retained: { faithful: [], regular: [], casual: [], drifter: [] }, burn: { idle: 0, ritual: 0, cards: 0 } };
  let gmToday = 0, lockToday = 0;
  for (let step = 0; step < STEPS; step++) {
    const h = step * 6, d = Math.floor(step / 4), first = step % 4 === 0;
    if (first) { for (let i = 0; i < sc.joins(d); i++) hs.push(mk(false)); for (const x of hs) { x.lossBase = x.bal; x.lossUsed = 0; } gmToday = 0; lockToday = 0; }
    const m = sc.m(d);
    for (const x of hs) {
      if (x.locked > 0 && h >= x.unlockAt) { x.bal += x.locked; x.locked = 0; }
      const T = TYPES[x.type];
      const wants = T.random !== undefined ? rnd() < T.random * m : ((step + x.off) % T.every === 0 && rnd() > T.skip * (2 - m) && rnd() < m + (1 - m) * 0.02);
      if (wants) {
        x.lastGm = h; if (x.gmDay !== d) { x.gmDay = d; gmToday++; }
        const lk = T.lock; if (lk > 0 && x.locked === 0 && x.bal > 0) { x.locked = x.bal * lk; x.bal -= x.locked; x.unlockAt = h + 24; lockToday += x.locked; }
      }
    }
    // idle burn: half burned, half to the Vault by weight (burned if nobody is locked)
    const W = hs.reduce((a, x) => a + x.locked * 1.5, 0); let pool = 0, burnNow = 0;
    const rate = (first && doubled ? 2 * P.idle : P.idle); if (first) doubled = false;
    for (const x of hs) {
      if (h - x.lastGm < P.grace + 6 || x.bal <= 0) continue;
      const room = x.lossBase * 0.08 - x.lossUsed; const b = Math.max(0, Math.min(x.bal * rate, room));
      x.bal -= b; x.lossUsed += b; pool += b / 2; burnNow += b / 2;
    }
    if (W > 0) for (const x of hs) x.bal += pool * (x.locked * 1.5) / W; else burnNow += pool;
    burned += burnNow; out.burn.idle += burnNow;
    if (step % 4 === 3) {                         // end of the UTC day: the Ritual
      const gmT = Math.max(10, Math.ceil(yGm * P.pct)), lockT = Math.max(10, yLock * 0.5);
      const ok = gmToday >= gmT && lockToday * PRICE >= lockT;
      if (ok) { streak++; made++; const r = streak >= 3 ? 0.07 : 0.05; const nearBurn = pot * r; pot -= nearBurn; burned += nearBurn / PRICE; out.burn.ritual += nearBurn / PRICE; }
      else { streak = 0; doubled = true; }
      if (gmToday >= 20 && rnd() < 0.5) { const nearBurn = pot * 0.02; pot -= nearBurn; burned += nearBurn / PRICE; out.burn.cards += nearBurn / PRICE; } // an Ember
      pot += 0.015 * gmToday * 1.5;               // 1.5% of the day's volume (each checked-in wallet trades ~1.5 NEAR)
      yGm = gmToday; yLock = lockToday * PRICE; days++;
      const circ = hs.reduce((a, x) => a + x.bal + x.locked, 0);
      out.supply.push((SUPPLY - burned) / SUPPLY * 100); out.circ.push(circ); out.floor.push((bought / circ) / (bought0 / circ0));
      for (const t of Object.keys(TYPES)) { const c = hs.filter(x => x.cohort && x.type === t); out.retained[t].push(c.reduce((a, x) => a + x.bal + x.locked, 0) / c.reduce((a, x) => a + x.b0, 0) * 100); }
    }
  }
  out.madeShare = made / DAYS * 100; return out;
}


const RUNS = 12;
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const rows = [];
for (const idle of [0.005, 0.01, 0.02]) for (const grace of [6, 12, 24]) for (const pct of [0.4, 0.6, 0.8]) {
  Object.assign(P, { idle, grace, pct });
  const act = Array.from({ length: RUNS }, (_, i) => run('active', 1000 + i));
  const dead = Array.from({ length: RUNS }, (_, i) => run('fading', 2000 + i));
  rows.push({ idle, grace, pct,
    supplyActive: avg(act.map(r => r.supply[DAYS - 1])),
    supplyDead: avg(dead.map(r => r.supply[DAYS - 1])),
    madeFading: avg(dead.map(r => r.madeShare)),
    made: avg(act.map(r => r.madeShare)),
    regular: avg(act.map(r => r.retained.regular[DAYS - 1])),   // checks in about every 12h
    casual: avg(act.map(r => r.retained.casual[DAYS - 1])),     // once a day
    faithful: avg(act.map(r => r.retained.faithful[DAYS - 1])),
  });
}
console.log('idle/6h | grace | Ritual target | supply left (active) | supply left (fading) | Ritual made (active) | Ritual made (fading) | faithful keeps | regular keeps | once-a-day keeps');
for (const r of rows) console.log(`${(r.idle * 100).toFixed(1)}%`.padEnd(7), '|', `${r.grace}h`.padEnd(5), '|', `${r.pct * 100}%`.padEnd(13), '|', `${r.supplyActive.toFixed(1)}%`.padEnd(20), '|', `${r.supplyDead.toFixed(1)}%`.padEnd(18), '|', `${r.made.toFixed(0)}%`.padEnd(11), '|', `${r.madeFading.toFixed(0)}%`.padEnd(11), '|', `${r.faithful.toFixed(0)}%`.padEnd(14), '|', `${r.regular.toFixed(0)}%`.padEnd(13), '|', `${r.casual.toFixed(0)}%`);
