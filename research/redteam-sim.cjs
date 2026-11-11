// Red-team checks on the v6/v7 design before the build.
// 1. How much of a bag each player type loses per day to coin-imposed hits.
// 2. How fast the reward pool (5% of supply) drains over a coin life.
// 3. Front-running the 1h spread buys of Inferno fuel and contests.
// 4. Contest sniping: chipping the winning side at the last moment.
// Run: node research/redteam-sim.cjs
let S = 7; const rnd = () => (S = (S * 16807) % 2147483647) / 2147483647;
const pct = (x) => (x * 100).toFixed(1) + '%';

// ---------- 1. Daily loss by player type ----------
// Event rates per day on an L3-L4 coin (from the design):
//  idle burn 1% / 6h after 12h idle; Storm once per 24h max (4% L3, 6% L4), assume it fires 70% of days;
//  Squall Omen 10% x 8 Omens = 0.8 a day (1%); Black Hole: no daily limit except 3 Epics/Mythics a day, assume 0.5 a day (1-3%);
//  raids 1 per 8h, lost half the time -> Plunder 1% (0.5% if you fought); Draft 0.25% max a day for big holders.
// Current cap: 8% a day, covering idle burn + Storms only.
function day(type, L, cap, capAll) {
  let capped = 0, other = 0;
  const idle = type === 'idle', casual = type === 'casual', active = type === 'active';
  // idle burn: idle = never gm (4 burns a day after grace), casual = 1 gm a day (2 burns), active = 0
  capped += idle ? 0.04 : casual ? 0.02 : 0;
  if (rnd() < 0.3 && casual) capped += 0.01; // Drought doubles a burn now and then
  if (rnd() < 0.7) { // Storm: active players Brace/Dodge (Dodge 70% safe), casual and idle miss the 15-min contest
    const hit = L === 3 ? 0.04 : 0.06;
    if (active) { if (rnd() < 0.5 && rnd() < 0.3) capped += hit; } else capped += hit;
  }
  for (let i = 0; i < 8; i++) if (rnd() < 0.1) capped += active ? (rnd() < 0.3 ? 0.01 : 0) : 0.01; // Squall
  if (rnd() < 0.5) other += active ? 0 : (L === 3 ? 0.01 + rnd() * 0.01 : 0.015 + rnd() * 0.015); // Black Hole (active feed 1% instead)
  if (rnd() < 0.5 && active) other += 0.01; // the 1% feed
  for (let r = 0; r < 3; r++) if (rnd() < 0.5) other += active ? 0.005 : 0.01; // Plunder
  if (type !== 'active' && rnd() < 0.3) other += 0.0025; // Draft (big holders)
  if (capAll) return Math.min(cap, capped + other);
  return Math.min(cap, capped) + other;
}
console.log('\n=== 1. Share of an UNLOCKED bag lost per day (L3-L4, 4000 days each) ===');
console.log('player   | rule today (8% cap on idle burn + Storms only): mean / worst 5% | one 8% cap on everything: mean / worst 5% | after a 3-day coin (today vs one cap)');
for (const type of ['active', 'casual', 'idle']) {
  const a = [], b = [];
  for (let i = 0; i < 4000; i++) { const L = i % 2 ? 3 : 4; a.push(day(type, L, 0.08, false)); b.push(day(type, L, 0.08, true)); }
  const st = (x) => { const s = [...x].sort((p, q) => p - q); return [s.reduce((p, q) => p + q, 0) / s.length, s[Math.floor(s.length * 0.95)]]; };
  const [am, aw] = st(a), [bm, bw] = st(b);
  console.log(`${type.padEnd(8)} | ${pct(am).padStart(6)} / ${pct(aw).padStart(6)}${' '.repeat(42)} | ${pct(bm).padStart(6)} / ${pct(bw).padStart(6)}${' '.repeat(22)} | ${pct(1 - (1 - am) ** 3)} vs ${pct(1 - (1 - bm) ** 3)}`);
}

// ---------- curve helpers (sizing A: virtual 1,392 NEAR / 1,073M tokens, 2% fee each way) ----------
const X0 = 1392, Y0 = 1073e6, K = X0 * Y0;
const curve = (real) => ({ x: X0 + real, y: K / (X0 + real) });
const buy = (c, near, fee = 0.02) => { const n = near * (1 - fee); const y2 = K / (c.x + n); const out = c.y - y2; c.x += n; c.y = y2; return out; };
const sell = (c, tok, fee = 0.02) => { const x2 = K / (c.y + tok); const out = c.x - x2; c.x = x2; c.y += tok; return out * (1 - fee); };
const priceNear = (c) => c.x / c.y;

// ---------- 2. Reward pool drain over a coin life ----------
// Plays over L2-L4 (66h) from earlier sims: Rares ~8 a day, Epics ~3 a day (cap), Omens 8 a day.
console.log('\n=== 2. Reward pool (50M tokens = 5% of supply) over one normal coin life, 200 runs ===');
const SUP = 1e9;
function pool(dr) {
  let P = 0.05 * SUP; const paid = {}; const pay = (k, v) => { v = Math.min(v, P); P -= v; paid[k] = (paid[k] || 0) + v; };
  const hours = [[2, 18], [3, 18], [4, 30]];
  const real = { 2: 625, 3: 1461, 4: 2382 };
  for (const [L, h] of hours) {
    const c = curve(real[L]); const tokPerNear = 1 / priceNear(c);
    for (let t = 0; t < h; t++) {
      if (rnd() < 8 / 24) { // a Rare play: Prophecy 3, Counterspell 2, Last Stand 2, Recruit 2, Diamond Rush 1, Slow Burn 1 (of 11)
        const r = rnd() * 11;
        if (r < 3) pay('Prophecy Safe prize', 0.0001 * SUP);
        else if (r < 5) {} // Counterspell
        else if (r < 7) pay('Hold the Line', 0.0025 * SUP);
        else if (r < 9) pay('Recruit', (L === 4 ? 0.0015 + rnd() * 0.001 : 0.0005 + rnd() * 0.001) * SUP);
        else if (r < 10) pay('Diamond Rush', Math.min(dr[0] + rnd() * (dr[1] - dr[0]), 0.25 * P / SUP) * SUP);
      }
      if (L >= 3 && rnd() < 3 / 24) { // an Epic: Inferno 2, Storm 2, Black Hole 1, Heist 1, War 1, Whale Tax 1, Alliance 1, Harvest 1 (of 10)
        const r = rnd() * 10;
        if (r < 2) pay('Inferno fuel +5%', Math.min(0.001 * SUP, 0.05 * 150 * tokPerNear));
        else if (r < 3) pay('Harvest', (L === 4 ? 0.03 : 0.02) * P);
        if (r >= 2 && r < 4 || r >= 4 && r < 5 || r >= 5 && r < 6 || r >= 7 && r < 8) pay('Contest winner +5%', 0.05 * 0.6 * 0.05 * real[L] * tokPerNear);
      }
      if (rnd() < 8 / 24 * 0.08) pay('Oracle Omen Safe prize', 0.0001 * SUP);
      if (rnd() < 3 / 24) pay('Raid bets +10%', 0.1 * 20 * tokPerNear); // ~20 NEAR of losing bets per raid
    }
  }
  return { left: P, paid };
}
for (const [name, dr] of [['Diamond Rush cap 1-1.5% (now)', [0.01, 0.015]], ['Diamond Rush cap 0.2-0.3%', [0.002, 0.003]]]) {
  const agg = {}; let left = 0;
  for (let i = 0; i < 200; i++) { const r = pool(dr); left += r.left / 200; for (const [k, v] of Object.entries(r.paid)) agg[k] = (agg[k] || 0) + v / 200; }
  const tot = Object.values(agg).reduce((a, b) => a + b, 0);
  console.log(`${name}: pool left at graduation ${pct(left / (0.05 * SUP))}`);
  for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(24)} ${(v / 1e6).toFixed(2).padStart(6)}M tokens  ${pct(v / tot).padStart(6)} of all payouts`);
}

// ---------- 3. Front-running the 1h spread buys ----------
console.log('\n=== 3. Front-running Inferno fuel / contest buys (bot buys before the hour, sells at its end) ===');
console.log('level | crowd NEAR bought over 1h + pot burn | bot buys | bot profit, no tag | profit if its sell pays 10% (tag covers the hour)');
for (const [L, real, crowd, potBurn] of [[3, 1461, 73, 0], [3, 1461, 200, 25], [3, 1461, 400, 25], [4, 2382, 119, 0], [4, 2382, 400, 60]]) {
  for (const botN of [20, 100]) {
    const run = (tagFee) => { const c = curve(real); const t = buy(c, botN); buy(c, crowd); const burned = buy(c, potBurn, 0); c.y += 0; /* burned tokens leave supply; curve keeps reserves */ void burned; return sell(c, t, 0.02 + tagFee) - botN; };
    console.log(`L${L}    | ${String(crowd).padStart(4)} + ${String(potBurn).padStart(3)} pot${' '.repeat(23)} | ${String(botN).padStart(4)}     | ${(run(0) >= 0 ? '+' : '') + run(0).toFixed(1)} NEAR (${pct(run(0) / botN)})${' '.repeat(4)} | ${(run(0.1) >= 0 ? '+' : '') + run(0.1).toFixed(1)} NEAR (${pct(run(0.1) / botN)})`);
  }
}

// ---------- 4. Contest sniping ----------
console.log('\n=== 4. Contest sniping: chips are public, a bot waits for the last block and chips the leading side ===');
let right = 0; const N = 5000;
for (let i = 0; i < N; i++) { const lead = rnd() - 0.5; const lateSwing = (rnd() - 0.5) * 0.3; if (Math.sign(lead) === Math.sign(lead + lateSwing)) right++; }
console.log(`bot picks the winning side ${pct(right / N)} of the time -> +5% bonus tokens on a buy it would make anyway, at no risk`);
