/* Rulecard deck balance simulator. Run: node deck-sim.js
   Curve = constant product with virtual NEAR, plus "floor lift": after a burn, virtual NEAR is raised
   so that selling every circulating token pays out exactly the real NEAR in the curve. */
'use strict';
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const n2 = v => (Math.abs(v) < 10 ? v.toFixed(3) : v.toFixed(1));

class Curve {
  constructor(o = {}) {
    this.X0 = 30; this.x = 30; this.y = 1e9; this.K = this.x * this.y;
    this.real = 0; this.circ = 0; this.pot = o.pot || 0; this.fee = o.fee || 0.01;
    this.burned = 0; this.prizePot = 0;
  }
  price() { return this.x / this.y; }
  buy(n, feeless) {
    const f = feeless ? 0 : n * this.fee; this.pot += f; const net = n - f;
    const nx = this.x + net, ny = this.K / nx, t = this.y - ny;
    this.x = nx; this.y = ny; this.real += net; this.circ += t; return t;
  }
  sell(t, extra = 0) { // extra = Toll Gate surcharge, goes to the prize pot
    t = Math.min(t, this.circ); if (t <= 0) return 0;
    const ny = this.y + t, nx = this.K / ny, out = this.x - nx;
    this.x = nx; this.y = ny; this.real -= out; this.circ -= t;
    this.pot += out * this.fee; this.prizePot += out * extra; return out * (1 - this.fee - extra);
  }
  burn(t) { t = Math.min(t, this.circ); this.circ -= t; this.burned += t; this.lift(); return t; }
  lift() { if (this.circ <= 0) return; const nx = this.real * (this.y + this.circ) / this.circ; if (nx > this.x) { this.x = nx; this.K = this.x * this.y; } }
  potBuy(p) { p = Math.min(p, this.pot); this.pot -= p; return this.buy(p, true); }      // pot buys tokens (feeless)
  potBurn(p) { return this.burn(this.potBuy(p)); }                                       // ...and burns them
  maxPayout() { return this.x - this.K / (this.y + this.circ); }
  solvent() { return this.maxPayout() <= this.real * (1 + 1e-9) + 1e-9; }
  clone() { return Object.assign(Object.create(Curve.prototype), this); }
}
// a coin that has already traded a bit: ~60 NEAR real, pot ~ 4 NEAR
function warmCoin(real = 60, pot = 4) { const c = new Curve({ pot }); c.buy(real / (1 - c.fee)); c.pot = pot; return c; }


// ---------------------------------------------------------------- memecoin-speed timing (v2: hours, not days)
const T = {
  holdAge: '1h', convictionFull: '24h (1x -> 3x)', cooldown: { Common: '5m', Rare: '30m', Epic: '2h', Mythic: '12h' },
  announce: { Common: 'instant', Rare: '2m', Epic: '5m', Mythic: '10m' }, infernoDrip: '1h in 12 x 5m chunks', casterLock: '2h',
  holdTheLine: 'trigger: -20% within 1h, event 6h', happyHour: '15m, bonus vests 6h', diamondPool: '1h / 6h / 24h',
  raid: '2h, 4 rounds of 30m, spoils drip 1h', bloodMoon: '10m commit + 5m reveal', exorcism: 'vote 30m, excluded 24h', cultOath: 'lock 24h',
};
// coin levels by real NEAR in the curve (graduation at 120 NEAR, when 800M are sold). Must stay above for 15m; never re-locks.
const LEVELS = [{ lvl: 1, near: 0, unlock: 'Common' }, { lvl: 2, near: 5, unlock: 'Rare' }, { lvl: 3, near: 20, unlock: 'Epic' }, { lvl: 4, near: 60, unlock: 'Mythic' }, { lvl: 5, near: 120, unlock: 'Graduation' }];
const COST = { Common: 5, Rare: 15, Epic: 40, Mythic: 100 }; // Charge meter 0-100

const out = [];
const H = s => out.push('\n=== ' + s + ' ===');
const L = s => out.push(s);

// ---------------------------------------------------------------- A. solvency fuzz
H('A. Solvency fuzz: 3000 random runs x 400 actions, every card mixed with trades');
{
  const good = ['buy', 'sell', 'slowBuy', 'slowSell', 'inferno', 'stakeForfeit', 'blackHole', 'happyHourPot', 'tollSell', 'prizePayout', 'raidHard'];
  const bad = { steepen: c => { c.x *= 1.1; c.K = c.x * c.y; }, reserveBonus: c => { c.circ += c.circ * 0.02; }, phoenixMint: c => { c.circ += c.burned * 0.5; c.burned *= 0.5; }, flatten: c => { c.x *= 0.9; c.K = c.x * c.y; } };
  let fails = 0, potNeg = 0, maxSurplus = 0;
  for (let run = 0; run < 3000; run++) {
    const r = rng(run + 1), A = new Curve({ pot: 2 }), B = new Curve({ pot: 2 }); A.buy(5); B.buy(5);
    for (let i = 0; i < 400; i++) {
      const c = r() < 0.5 ? A : B, o = c === A ? B : A, op = good[Math.floor(r() * good.length)];
      if (op === 'buy') c.buy(0.01 + r() * 5);
      else if (op === 'sell') c.sell(c.circ * r() * 0.3);
      else if (op === 'slowBuy') { const t = c.buy(0.01 + r() * 3); c.burn(t * 0.01); }
      else if (op === 'slowSell') { const t = c.circ * r() * 0.2; c.burn(t * 0.01); c.sell(t * 0.99); }
      else if (op === 'inferno') c.potBurn(c.pot * 0.1);
      else if (op === 'stakeForfeit' || op === 'blackHole') c.burn(c.circ * r() * 0.02);
      else if (op === 'happyHourPot') c.potBuy(Math.min(c.pot * 0.05, 0.2)); // bonus tokens bought from the curve
      else if (op === 'tollSell') c.sell(c.circ * r() * 0.1, 0.02);
      else if (op === 'prizePayout') c.prizePot = 0; // paid out to holders, outside the curve
      else if (op === 'raidHard') { const near = c.sell(c.circ * r() * 0.02); const t = o.buy(near); o.burn(t / 2); }
      if (!c.solvent() || !o.solvent()) fails++;
      if (c.pot < -1e-9) potNeg++;
      maxSurplus = Math.max(maxSurplus, (c.real - c.maxPayout()) / (c.real || 1));
    }
  }
  L(`Allowed cards: insolvent states = ${fails}, negative pot = ${potNeg} (out of 1.2M actions). Largest unbacked surplus ${pct(maxSurplus, 4)} (floor lift hands it back).`);
  for (const [name, fn] of Object.entries(bad)) {
    let broke = 0, drop = 0;
    for (let run = 0; run < 500; run++) { const c = warmCoin(); c.burn(c.circ * 0.05); const p0 = c.price(); fn(c); if (!c.solvent()) broke++; if (c.price() < p0) drop++; }
    L(`  Rejected card ${name.padEnd(13)}: insolvent in ${broke}/500, price cut for every holder in ${drop}/500`);
  }
}

// ---------------------------------------------------------------- B. Inferno
H('B. Inferno: what a pot burn does to price, and who can profit by trading ahead of it');
{
  L('Coin: 60 NEAR real in curve. Front-runner buys 3 NEAR before and sells after. Round trip fees = 2%.');
  L('pot spent | price lift | lump: front-run profit | drip 12 chunks: per-chunk sandwich profit | caster lock');
  for (const P of [1, 2, 4, 8]) {
    const base = warmCoin(60, P), p0 = base.price();
    const a = base.clone(); a.potBurn(P); const lift = a.price() / p0 - 1;
    const b = base.clone(); const t = b.buy(3); b.potBurn(P); const fr = b.sell(t) - 3;
    // sandwich one chunk of a 12-chunk drip
    const c = base.clone(); const tc = c.buy(3); c.potBurn(P / 12); const sw = c.sell(tc) - 3;
    L(`${String(P).padStart(4)} NEAR | ${pct(lift).padStart(6)} | ${n2(fr).padStart(7)} NEAR (${pct(fr / 3)}) | ${n2(sw).padStart(7)} NEAR (${pct(sw / 3)}) | caster must hold 24h`);
  }
  L('Reading: a public lump Inferno is a free trade for whoever is fastest (bots). Dripped in chunks small enough that each');
  L('chunk moves price by less than the 2% round-trip fee, nobody can sandwich a chunk; the total lift is the same.');
  L('Buying on the announcement still profits, but that is open to everyone at once (it IS the hype), not to an insider.');
}

// ---------------------------------------------------------------- C. Whale Shield / global caps
H('C. Shield variants: global buy cap and global sell cap per 10-minute window (first hour of launch)');
{
  function launch(capNear, seed) {
    const r = rng(seed), c = new Curve(); let botTok = 0, comTok = 0, comWanted = 0, comGot = 0;
    for (let w = 0; w < 6; w++) {
      let room = capNear === Infinity ? Infinity : capNear;
      for (let b = 0; b < 15; b++) { const want = 1.5; const n = Math.min(want, room); if (n > 0) { botTok += c.buy(n); room -= n; } } // bots land first
      const arrivals = 3 + Math.floor(r() * 6);
      for (let k = 0; k < arrivals; k++) { const want = 0.2 + r() * 0.8; comWanted += want; const n = Math.min(want, room); if (n > 0) { comTok += c.buy(n); room -= n; comGot += n; } }
    }
    return { botShare: botTok / (botTok + comTok), filled: comGot / comWanted };
  }
  for (const cap of [Infinity, 10, 5, 3]) {
    let bs = 0, fl = 0; for (let s = 0; s < 200; s++) { const o = launch(cap, s); bs += o.botShare; fl += o.filled; }
    L(`buy cap ${cap === Infinity ? 'none ' : (cap + ' N').padEnd(5)}: bots own ${pct(bs / 200)} of hour-1 tokens, community orders filled ${pct(fl / 200)}`);
  }
  // sell cap: whale dumps first, panic holders queue
  const c = warmCoin(80); const whale = c.circ * 0.2, others = c.circ * 0.1, capTok = c.circ * 0.03;
  let q = [['whale', whale], ['holders', others]], win = 0, done = {};
  while (q.length) { let room = capTok; while (room > 0 && q.length) { const n = Math.min(room, q[0][1]); c.sell(n); q[0][1] -= n; room -= n; if (q[0][1] <= 1e-6) { done[q[0][0]] = win + 1; q.shift(); } } win++; }
  L(`sell cap 3% of supply / 10 min: whale finishes dumping in window ${done.whale}; ordinary holders cannot sell at all until window ${done.holders - 1}+ (${(done.holders - 1) * 10} min locked in a crash).`);
  L('Reading: a global buy cap hands the whole cap to whoever is fastest each window, so bots win harder. A global sell cap is a honeypot.');
}

// ---------------------------------------------------------------- D. Happy Hour
H('D. Happy Hour paid by the pot: +10% bonus tokens on buys for 30 min (vs the same trades with no Happy Hour)');
{
  function hh(mode) { // mode: 'off' | 'instant' | 'vest'
    const c = warmCoin(60, 4), p0 = c.price(), pot0 = c.pot; let farmerPnl = 0; const farmers = [];
    for (let i = 0; i < 25; i++) {
      const isF = i % 5 === 0, n = isF ? 2 : 0.5, t = c.buy(n);
      let bonus = 0; if (mode !== 'off') bonus = c.potBuy(Math.min(c.pot, n * 0.99 * 0.10));
      if (isF) farmers.push({ n, t, bonus });
    }
    const lift = c.price() / p0 - 1;
    for (const f of farmers) { const back = c.sell(f.t + (mode === 'instant' ? f.bonus : 0)); if (mode === 'vest') c.burn(f.bonus); farmerPnl += back - f.n; }
    return { lift, farmerPnl, potUsed: pot0 - c.pot + (c.pot - pot0 > 0 ? 0 : 0), end: c.price() / p0 - 1 };
  }
  const off = hh('off');
  for (const m of ['instant', 'vest']) {
    const o = hh(m);
    L(`${m === 'instant' ? 'bonus paid instantly ' : 'bonus vests 72h      '}: extra price lift vs no HH ${pct((1 + o.lift) / (1 + off.lift) - 1)}, farmers' gain vs no HH ${n2(o.farmerPnl - off.farmerPnl)} NEAR on 10 NEAR flipped`);
  }
  L('Reading: the pot buying bonus tokens adds a little real buy pressure. Paid instantly, flippers pocket the bonus;');
  L('vested (sell early = bonus burned), flipping earns only the small pot-driven lift and the forfeits burn, which lifts the floor.');
}

// ---------------------------------------------------------------- E. Hold the Line exploit
H('E. Hold the Line + Dip Catcher: can a whale farm it with two wallets?');
{
  // Whale: wallet A 15% dumps to trigger, wallet B 5% was holding before the drop and claims the prize. Others hold 80%.
  for (const panicPct of [0, 5, 15]) {
    const c = warmCoin(80, 6), total = c.circ; let A = total * 0.15; const B = total * 0.05, others = total * 0.8;
    const pPre = c.price(), nearA = c.sell(A); const drop = 1 - c.price() / pPre;
    const pn = others * panicPct / 100; c.sell(pn, 0.02);                     // panic sellers pay the 2% toll
    const pool = c.prizePot + c.pot * 0.2; const prizeB = pool * B / (B + others - pn);
    // cost of the dump itself: sell A and buy straight back with nothing else happening
    const d = warmCoin(80, 6); const got = d.sell(d.circ * 0.15); const back = d.buy(got); const cost = (d.circ * 0 + (total * 0.15 - back)) * d.price();
    L(`panic ${String(panicPct).padStart(2)}% of others sell: drop from dump ${pct(drop)} (triggers at 20%), prize to wallet B ${n2(prizeB)} NEAR, dump round-trip cost ${n2(cost)} NEAR -> ${prizeB > cost ? 'PROFITABLE, fix needed' : 'loses money'}`);
  }
  L('Reading: the wallet-B prize stays well below what the dump costs in fees and slippage, so farming it loses money.');
  L('Rules that keep it so: eligibility snapshot taken BEFORE the drop, 1h holding age, prize = tolls + at most 20% of pot.');
  L('Note: a whale can still dump first and rebuy after a panic; that is ordinary market risk and exists with or without the card.');
}

// ---------------------------------------------------------------- F. Blood Moon as a minority game
H('F. Blood Moon as a minority game (pick Red or Blue in secret; smaller side by tokens wins, 20% of losers\' stakes burn)');
{
  const strategies = ['sit out', 'all on one side', 'split 50/50'];
  const res = strategies.map(() => ({ ev: 0 })); let smallEv = 0, smallN = 0;
  for (let s = 0; s < 20000; s++) {
    const r = rng(s), players = [];
    for (let i = 0; i < 60; i++) players.push({ st: Math.exp(r() * 3), side: r() < 0.5 ? 0 : 1 });
    const crowd = players.reduce((a, p) => a + p.st, 0), whaleSt = crowd * 0.43; // whale = 30% of all stake
    strategies.forEach((st, k) => {
      const sides = [0, 0]; players.forEach(p => sides[p.side] += p.st);
      let w = [0, 0]; if (st === 'all on one side') w[r() < 0.5 ? 0 : 1] = whaleSt; if (st === 'split 50/50') w = [whaleSt / 2, whaleSt / 2];
      const tot = [sides[0] + w[0], sides[1] + w[1]], win = tot[0] < tot[1] ? 0 : 1, lose = 1 - win, prize = tot[lose] * 0.8;
      res[k].ev += (w[win] / tot[win] * prize - w[lose]) / whaleSt;
      if (k === 0) players.forEach(p => { smallEv += (p.side === win ? p.st / tot[win] * prize : -p.st) / p.st; smallN++; });
    });
  }
  strategies.forEach((st, k) => L(`whale ${st.padEnd(16)}: expected return ${st === 'sit out' ? '  0.0%' : pct(res[k].ev / 20000)} of stake`));
  L(`ordinary player (no whale): expected return ${pct(smallEv / smallN)} of stake (the 20% burn, shared)`);
  L('Reading: a whale that joins one side makes it the majority and loses; splitting just pays the burn. Size cannot buy a win here.');
}

// ---------------------------------------------------------------- G. raid counters (rock-paper-scissors)
H('G. Raid tactics: Rally / Curse / Ward each round. Does any one dominate?');
function matrix(R, C, W) {
  // score multipliers for the round. Rally +R; Curse -C on opponent and halves their Rally; Ward blocks Curse and reflects W.
  const cards = ['Rally', 'Curse', 'Ward'];
  const sc = (me, op) => { let m = 1; if (me === 'Rally') m *= 1 + (op === 'Curse' ? R / 2 : R); if (op === 'Curse' && me !== 'Ward') m *= 1 - C; if (me === 'Curse' && op === 'Ward') m *= 1 - W; return m; };
  return cards.map(a => cards.map(b => sc(a, b) - sc(b, a)));
}
function solve2(M) { // exact mix for 3x3 cyclic game via fictitious play, fewer iterations
  const n = 3, cnt = [1, 1, 1]; for (let it = 0; it < 20000; it++) { const tot = cnt[0] + cnt[1] + cnt[2]; let best = 0, bv = -1e9; for (let i = 0; i < n; i++) { let v = 0; for (let j = 0; j < n; j++) v += M[i][j] * cnt[j] / tot; if (v > bv) { bv = v; best = i; } } cnt[best]++; } const tot = cnt[0] + cnt[1] + cnt[2]; return cnt.map(c => c / tot); }
function solve(M) { // fictitious play for a symmetric zero-sum game
  const n = M.length, cnt = Array(n).fill(1);
  for (let it = 0; it < 200000; it++) { const tot = cnt.reduce((a, b) => a + b); let best = 0, bv = -1e9; for (let i = 0; i < n; i++) { let v = 0; for (let j = 0; j < n; j++) v += M[i][j] * cnt[j] / tot; if (v > bv) { bv = v; best = i; } } cnt[best]++; }
  const tot = cnt.reduce((a, b) => a + b); return cnt.map(c => c / tot);
}
{
  let bestT = null; for (let R = 0.06; R <= 0.16; R += 0.01) for (let W = 0.05; W <= 0.25; W += 0.01) { const m = solve2(matrix(R, 0.10, W)); const sp = Math.max(...m) - Math.min(...m); if (!bestT || sp < bestT[0]) bestT = [sp, R, W]; }
  for (const [R, C, W, tag] of [[0.20, 0.15, 0.05, 'first guess'], [0.10, 0.10, 0.10, 'all 10%'], [bestT[1], 0.10, bestT[2], 'tuned']]) {
    const M = matrix(R, C, W), mix = solve(M);
    L(`${tag.padEnd(11)} Rally +${(R * 100).toFixed(0)}%, Curse -${(C * 100).toFixed(0)}%, Ward reflect -${(W * 100).toFixed(0)}% -> best mix: Rally ${pct(mix[0], 0)}, Curse ${pct(mix[1], 0)}, Ward ${pct(mix[2], 0)}`);
  }
  // how big a money gap can good reads close? 4 rounds, underdog reads the opponent (always counters), favourite plays a fixed card
  const M = matrix(bestT[1], 0.10, bestT[2]);
  const best = Math.max(...[0, 1, 2].map(j => Math.max(...[0, 1, 2].map(i => M[i][j]))));
  L(`Max swing per round from a perfect read: ${pct(best)} of score. Reading the opponent right in 2 of 4 rounds closes a money gap of about ${pct(Math.pow(1 + best, 2) - 1, 0)}.`);
  L('Reading: with the first guess, Curse is played twice as often as anything else (overpowered). Tuned, it is a fair');
  L('rock-paper-scissors: no card dominates, smart play beats a ~15% bigger wallet, but money still beats bad reads.');
  L('Mirror (copy last round\'s card) beats opponents who repeat themselves and loses to ones who adapt; it stays a Rare tech card.');
}

// ---------------------------------------------------------------- H. stacking / combo caps
H('H. Worst case stacking in 24h: every burn card chained back to back');
{
  const caseRun = (cap) => {
    const c = warmCoin(80, 8), p0 = c.price(), c0 = c.circ; let budget = cap ? c0 * 0.05 : Infinity;
    const doBurn = t => { const b = Math.min(t, budget); budget -= b; c.burn(b); };
    for (let i = 0; i < (cap ? 1 : 5); i++) { const t = c.potBuy(c.pot * (cap ? 0.5 : 1)); doBurn(t); }   // Inferno(s)
    doBurn(c0 * 0.03); doBurn(c0 * 0.04); doBurn(c0 * 0.03 * (cap ? 1 : 2));                        // Black Hole, stake forfeits, Echo doubles
    return { lift: c.price() / p0 - 1, burned: (c0 - c.circ) / c0, solvent: c.solvent() };
  };
  const u = caseRun(false), k = caseRun(true);
  L(`no caps : price ${pct(u.lift)}, ${pct(u.burned)} of circulating supply burned in a day, solvent=${u.solvent}`);
  L(`with caps (5% burn/24h, pot spend 50%/24h, one Epic+ at a time): price ${pct(k.lift)}, burned ${pct(k.burned)}, solvent=${k.solvent}`);
  L('Reading: even uncapped it stays solvent (all backed), but a +20% one-day pump from cards alone invites a dump. Caps keep effects big but readable.');
}

// ---------------------------------------------------------------- I. rarity economy over 60 days
H('I. Card supply after 60 days: 500 holders, earn + craft (3 of a tier -> 1 of the next)');
{
  const r = rng(7), tiers = ['Common', 'Rare', 'Epic', 'Mythic'], have = [0, 0, 0, 0];
  for (let d = 1; d <= 60; d++) {
    for (let h = 0; h < 500; h++) {
      const active = r() < 0.4;
      if (active && d % 7 === 0) have[0]++;                     // 7-day streak -> Common
      if (active && d % 30 === 0 && r() < 0.5) have[1]++;       // 30-day streak (half make it) -> Rare
    }
    if (d % 7 === 0) { have[2] += 1; have[1] += 3; }            // weekly contest winner Epic, 3 runners-up Rare
    if (d % 3 === 0) have[1] += 1;                              // raid MVP
    if (d % 5 === 0) { have[1] += 2; }                          // Hold the Line survivor top / Sacrifice tiers
    for (let t = 0; t < 3; t++) { const crafted = Math.floor(have[t] * 0.05 / 3); have[t] -= crafted * 3; have[t + 1] += crafted; } // 5% of owners craft
  }
  const tot = have.reduce((a, b) => a + b);
  L(tiers.map((t, i) => `${t}: ${have[i]} (${pct(have[i] / tot)})`).join('   '));
}

// ---------------------------------------------------------------- J. level unlocks
H('J. Market-cap levels: can someone pump the coin to unlock big cards or farm the level-up card drop?');
{
  L('Levels (real NEAR in curve): ' + LEVELS.map(l => `L${l.lvl} ${l.near}N=${l.unlock}`).join(', '));
  for (const [from, to] of [[3, 20], [10, 60]]) {
    const c = new Curve(); c.buy(from / 0.99); const before = c.circ;
    const need = (to - c.real) / 0.99 + 0.01; const t = c.buy(need);
    // level-up drop by Conviction = tokens x (1 + 2 * hoursHeld/24). Pumper's tokens are 0h old (1x).
    const holders = 200, r = rng(from), ranks = [];
    for (let i = 0; i < holders; i++) ranks.push({ w: (before / holders) * (0.2 + r() * 1.6) * (1 + 2 * Math.min(1, (1 + r() * 23) / 24)), p: false });
    ranks.push({ w: t, p: true }); ranks.sort((a, b) => b.w - a.w);
    const pos = ranks.findIndex(x => x.p) + 1;
    const back = c.sell(t);
    L(`pump ${from}N -> ${to}N: round trip costs ${n2(need - back)} NEAR (${pct((need - back) / need)}). Without an age rule the pumper ranks #${pos}/${holders + 1} by Conviction -> ${pos <= 2 ? 'wins an Epic drop' : pos <= 20 ? 'wins a Rare drop' : 'Common only'}. With "held 1h before the level": no drop.`);
  }
  L('Reading: pumping to a level only costs fees, and that money stays in the coin, so unlocking that way is fine. The level-up');
  L('drop is what needs protecting: only wallets that held 1h BEFORE the level was crossed get drops, ranked by Conviction.');
}

// ---------------------------------------------------------------- K. who gets to cast
H('K. Casting for 24h: a whale with 20 cards and a bot (always first) vs 150 holders with 1-2 cards each');
{
  // v3 pacing: Common = Spark meter (fast). Rare = coin-wide slot, 1 per 15m. Epic = Ult meter (100, fills with activity).
  // Mythic = Eclipse window every 12h (Level 4 only). Big casts: optional "1 Epic+ per wallet per 24h".
  function day(mode) {
    const r = rng(11); let spark = 20, ult = 40, rareFree = 0, eclipseUsed = -1; const casts = { whale: 0, crowd: 0 }, by = { Common: 0, Rare: 0, Epic: 0, Mythic: 0 }, wby = { Common: 0, Rare: 0, Epic: 0, Mythic: 0 };
    const bigUsed = { whale: 0 }; const crowdBig = new Array(150).fill(0);
    const whaleHand = ['Mythic', 'Mythic', 'Epic', 'Epic', 'Epic', 'Rare', 'Rare', 'Rare', ...Array(12).fill('Common')];
    const crowdHand = Array.from({ length: 150 }, () => (r() < 0.04 ? ['Mythic', 'Common'] : r() < 0.1 ? ['Epic', 'Common'] : r() < 0.35 ? ['Rare', 'Common'] : ['Common']));
    const rank = { Mythic: 3, Epic: 2, Rare: 1, Common: 0 };
    for (let m = 0; m < 24 * 60; m += 5) {
      const pulse = 0.35 + 0.3 * Math.sin(m / 1440 * Math.PI * 2) ** 2;
      spark = Math.min(30, spark + 24 * pulse / 12); ult = Math.min(100, ult + 30 * pulse / 12);
      const win = Math.floor(m / 720), eclipse = (m % 720) >= 360 && (m % 720) < 390; // 30m window, twice a day
      const tryCast = (who, hand, i) => {
        hand.sort((x, y) => rank[y] - rank[x]);
        for (let k = 0; k < hand.length; k++) {
          const t = hand[k];
          const bigOk = mode !== 'cap' || (who === 'whale' ? bigUsed.whale < 1 : crowdBig[i] < 1);
          let ok = false;
          if (t === 'Common' && spark >= 5) { spark -= 5; ok = true; }
          else if (t === 'Rare' && m >= rareFree) { rareFree = m + 15; ok = true; }
          else if (t === 'Epic' && ult >= 100 && bigOk) { ult = 0; ok = true; }
          else if (t === 'Mythic' && eclipse && eclipseUsed !== win && bigOk) { eclipseUsed = win; ok = true; }
          if (!ok) continue;
          if (t === 'Epic' || t === 'Mythic') { if (who === 'whale') bigUsed.whale++; else crowdBig[i]++; }
          hand.splice(k, 1); by[t]++; casts[who]++; if (who === 'whale') wby[t]++; return;
        }
      };
      if (m % 5 === 0) tryCast('whale', whaleHand);
      for (let i = 0; i < 150; i++) if (r() < 0.02) tryCast('crowd', crowdHand[i], i);
    }
    return { casts, by, wby };
  }
  for (const [mode, label] of [['first', 'big cards first-come'], ['cap', '1 Epic+ per wallet per 24h']]) {
    const o = day(mode), tot = o.casts.whale + o.casts.crowd, big = o.by.Epic + o.by.Mythic, wbig = o.wby.Epic + o.wby.Mythic;
    L(`${label.padEnd(27)}: ${tot} casts (${Object.entries(o.by).map(([k, v]) => k + ' ' + v).join(', ')}); whale made ${pct(o.casts.whale / tot)} of casts, ${wbig}/${big} of the Epic+Mythic`);
  }
  L('Reading: separate pacing per tier keeps all tiers alive (no tier starves another): ~1 Rare every 15m, an Epic every few');
  L('hours, 2 Mythic Eclipses a day. The per-wallet daily cap on big casts stops one whale+bot from owning every big moment.');
}

console.log(out.join('\n'));
