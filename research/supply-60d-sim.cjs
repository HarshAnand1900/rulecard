// 60-day supply simulation for the v7 coin (the track asks: "simulate 60 days, show supply over time under a few scenarios").
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
    const rate = (first && doubled ? 0.02 : 0.01); if (first) doubled = false;
    for (const x of hs) {
      if (h - x.lastGm < 18 || x.bal <= 0) continue;
      const room = x.lossBase * 0.08 - x.lossUsed; const b = Math.max(0, Math.min(x.bal * rate, room));
      x.bal -= b; x.lossUsed += b; pool += b / 2; burnNow += b / 2;
    }
    if (W > 0) for (const x of hs) x.bal += pool * (x.locked * 1.5) / W; else burnNow += pool;
    burned += burnNow; out.burn.idle += burnNow;
    if (step % 4 === 3) {                         // end of the UTC day: the Ritual
      const gmT = Math.max(10, Math.ceil(yGm * 0.6)), lockT = Math.max(10, yLock * 0.5);
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

const RUNS = 20, res = {};
for (const n of Object.keys(SCEN)) {
  const all = Array.from({ length: RUNS }, (_, i) => run(n, 1000 + i));
  const avg = a => a[0].map((_, k) => a.reduce((s, x) => s + x[k], 0) / a.length);
  res[n] = { supply: avg(all.map(r => r.supply)), circ: avg(all.map(r => r.circ)), floor: avg(all.map(r => r.floor)), ret: Object.fromEntries(Object.keys(TYPES).map(t => [t, avg(all.map(r => r.retained[t]))])), made: all.reduce((a, r) => a + r.madeShare, 0) / RUNS, burn: Object.fromEntries(['idle', 'ritual', 'cards'].map(k => [k, all.reduce((a, r) => a + r.burn[k], 0) / RUNS])) };
}

console.log(`60-day supply simulation (${RUNS} runs per community, 120 holders at the start, 1,000M supply)\n`);
console.log('community | day | total supply | circulating | floor ×* | Ritual made | faithful | regular | casual | drifter   (share of day-1 tokens each kind of wallet still holds)');
for (const n of Object.keys(res)) for (const day of [1, 7, 14, 30, 60]) {
  const r = res[n], i = day - 1;
  console.log(`${n.padEnd(9)} | ${String(day).padStart(3)} | ${r.supply[i].toFixed(2).padStart(7)}%     | ${(r.circ[i] / 1e6).toFixed(0).padStart(6)}M    | ${r.floor[i].toFixed(2).padStart(5)}    | ${(day === 60 ? r.made.toFixed(0) + '% of days' : '').padEnd(11)} | ${r.ret.faithful[i].toFixed(0).padStart(5)}%  | ${r.ret.regular[i].toFixed(0).padStart(5)}%  | ${r.ret.casual[i].toFixed(0).padStart(4)}%  | ${r.ret.drifter[i].toFixed(0).padStart(4)}%`);
}
console.log('\n* floor x = (tokens ever bought) / (tokens still circulating), relative to day 1: how much more NEAR backs each surviving token if nobody sells. New buyers add NEAR, so a growing coin stays near 1.');
for (const n of Object.keys(res)) console.log(`${n}: burned by idle burn ${(res[n].burn.idle / 1e6).toFixed(1)}M · Ritual ${(res[n].burn.ritual / 1e6).toFixed(2)}M · cards ${(res[n].burn.cards / 1e6).toFixed(2)}M tokens`);

// ---------- chart (SVG, Okabe-Ito colours, legend + direct labels) ----------
const C = { active: '#0072B2', fading: '#E69F00', dead: '#CC79A7', faithful: '#0072B2', regular: '#009E73', casual: '#E69F00', drifter: '#CC79A7' };
function panel(x0, y0, w, h, title, sub, series, ymin, ymax, ystep, fmt) {
  const X = d => x0 + (d / (DAYS - 1)) * w, Y = v => y0 + h - ((v - ymin) / (ymax - ymin)) * h; let s = '';
  s += `<text x="${x0}" y="${y0 - 26}" class="t">${title}</text><text x="${x0}" y="${y0 - 10}" class="st">${sub}</text>`;
  for (let v = ymin; v <= ymax + 1e-9; v += ystep) s += `<line x1="${x0}" x2="${x0 + w}" y1="${Y(v)}" y2="${Y(v)}" class="g"/><text x="${x0 - 8}" y="${Y(v) + 4}" text-anchor="end" class="a">${fmt(v)}</text>`;
  for (const d of [0, 10, 20, 30, 40, 50, 59]) s += `<text x="${X(d)}" y="${y0 + h + 18}" text-anchor="middle" class="a">${d + 1}</text>`;
  s += `<text x="${x0 + w / 2}" y="${y0 + h + 36}" text-anchor="middle" class="a">day</text>`;
  for (const [name, vals, col] of series) {
    s += `<polyline fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" points="${vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
    s += `<circle cx="${X(DAYS - 1)}" cy="${Y(vals[DAYS - 1])}" r="4" fill="${col}" stroke="#fff" stroke-width="2"/>`;
  }
  return s;
}
const W = 980, H = 380;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="60-day simulation: total supply under three communities, and how much of a bag each kind of holder keeps">
<style>.t{font:600 15px system-ui,sans-serif;fill:#1b1f24}.st{font:12px system-ui,sans-serif;fill:#57606a}.a{font:11px ui-monospace,monospace;fill:#57606a}.g{stroke:#d0d7de;stroke-width:1}.l{font:13px system-ui,sans-serif;fill:#1b1f24}</style>
<rect width="${W}" height="${H}" fill="#ffffff" rx="10"/>`;
const sNames = Object.keys(res);
const lo = Math.floor(Math.min(...sNames.map(n => res[n].supply[DAYS - 1])) / 5) * 5;
svg += panel(70, 70, 380, 230, 'Total supply over 60 days', 'share of the 1,000M minted that still exists (mean of 20 runs)', sNames.map(n => [n, res[n].supply, C[n]]), lo, 100, 5, v => v + '%');
svg += panel(560, 70, 380, 230, 'What a wallet keeps (active community)', 'share of its day-1 tokens, by how often it checks in', ['faithful', 'regular', 'casual', 'drifter'].map(t => [t, res.active.ret[t], C[t]]), 0, 200, 50, v => v + '%');
let lx = 70; for (const n of sNames) { svg += `<rect x="${lx}" y="338" width="14" height="4" fill="${C[n]}"/><text x="${lx + 20}" y="344" class="l">${n} community</text>`; lx += 150; }
lx = 540; for (const t of ['faithful', 'regular', 'casual', 'drifter']) { svg += `<rect x="${lx}" y="338" width="14" height="4" fill="${C[t]}"/><text x="${lx + 20}" y="344" class="l">${t}</text>`; lx += 100; }
svg += '</svg>';
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'supply-60d.svg'), svg);
console.log('\nwrote docs/supply-60d.svg');
