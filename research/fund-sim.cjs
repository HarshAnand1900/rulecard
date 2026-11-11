// Who pays for card price effects? Compares funding designs on the real curve maths.
// Units: NEAR and millions of tokens. Curve: x*y = k with virtual reserves (900 NEAR, 1073M).
// Solvency invariant after every burn/release: x = real*(y+circ)/circ  => selling every held token returns exactly `real`.
// Run: node research/fund-sim.cjs
let S = 1; const rnd = () => (S = (S * 16807) % 2147483647) / 2147483647;
const logn = (m, s) => Math.exp(Math.log(m) + s * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()));

class Coin {
  constructor(feeToPot) {
    this.x = 900; this.y = 1073; this.k = this.x * this.y; this.real = 0; this.circ = 0;
    this.pot = 0; this.protocol = 0; this.reserve = 50; this.feeToPot = feeToPot;
    this.bal = new Map(); this.paid = new Map(); this.recv = new Map();
  }
  price() { return this.x / this.y; } // NEAR per 1M tokens
  add(m, w, v) { m.set(w, (m.get(w) || 0) + v); }
  fee(v) { const f = v * 0.01; if (this.feeToPot) this.pot += f; else this.protocol += f; return f; }
  reprice() { if (this.circ > 1e-9) { this.x = this.real * (this.y + this.circ) / this.circ; this.k = this.x * this.y; } }
  buy(w, n) {
    const net = n - this.fee(n); this.x += net; const ny = this.k / this.x; const got = this.y - ny;
    this.y = ny; this.real += net; this.circ += got; this.add(this.bal, w, got); this.add(this.paid, w, n);
  }
  sell(w, t) {
    t = Math.min(t, this.bal.get(w) || 0); if (t <= 0) return;
    const ny = this.y + t, nx = this.k / ny, out = this.x - nx;
    this.x = nx; this.y = ny; this.real -= out; this.circ -= t; this.add(this.bal, w, -t);
    this.add(this.recv, w, out - this.fee(out));
  }
  potBuyBurn(N) { // pot NEAR buys tokens, tokens burned
    N = Math.min(N, this.pot); if (N <= 0) return 0; this.pot -= N;
    this.x += N; this.y = this.k / this.x; this.real += N; this.reprice(); return N;
  }
  burnAll(frac, only) { // burn the same % from every holder (optionally only some wallets)
    let burned = 0;
    for (const [w, b] of this.bal) if (!only || only(w)) { const d = b * frac; this.bal.set(w, b - d); burned += d; }
    this.circ -= burned; this.reprice(); return burned;
  }
  release(w, t) { t = Math.min(t, this.reserve); this.reserve -= t; this.add(this.bal, w, t); this.circ += t; this.reprice(); }
  quote(w) { const t = this.bal.get(w) || 0; return t > 0 ? this.x - this.k / (this.y + t) : 0; }
  pnl(w) { return (this.recv.get(w) || 0) + this.quote(w) - (this.paid.get(w) || 0); }
  solvencyGap() { // NEAR left over (should be ~0) if every holder sells, in order
    const c = Object.assign(Object.create(Coin.prototype), this, { bal: new Map(this.bal), recv: new Map() });
    for (const w of [...c.bal.keys()]) c.sell(w, c.bal.get(w));
    return c.real;
  }
}

// ---------- Part 1: one card play at L3, side by side ----------
function buildL3(feeToPot) {
  S = 11; const c = new Coin(feeToPot); let i = 0;
  while (c.real < 800) c.buy('w' + (i++ % 120), logn(5, 0.9));
  c.pot = 20; // same pot in every design, to compare effects fairly
  return c;
}
const designs1 = {
  'A. Pot buys & burns 20 NEAR': (c) => c.potBuyBurn(20),
  'B. Burn 2% of EVERY holder equally': (c) => c.burnAll(0.02),
  'C. Release 0.5% supply (5M) to card player': (c) => c.release('w0', 5),
  'D. Burn 2% of passive holders only': (c) => c.burnAll(0.02, (w) => w !== 'w0'),
  'E. Mix: pot 10 + burn 1% all + release 2M': (c) => { c.potBuyBurn(10); c.burnAll(0.01); c.release('w0', 2); },
};
console.log('PART 1: one card play at L3 (800 real NEAR, 120 holders). Player = w0, passive = w1.');
console.log('design'.padEnd(46) + 'price'.padStart(8) + '  passive value' + '  player value' + '  all holders' + '  solvent?');
for (const [name, f] of Object.entries(designs1)) {
  const c = buildL3(false);
  const p0 = c.price(), a0 = c.quote('w0'), b0 = c.quote('w1'), r0 = c.real;
  f(c);
  const pct = (a, b) => ((b / a - 1) * 100).toFixed(1).padStart(6) + '%';
  console.log(name.padEnd(46) + pct(p0, c.price()).padStart(8) + pct(b0, c.quote('w1')).padStart(15) +
    pct(a0, c.quote('w0')).padStart(14) + pct(r0, c.real).padStart(13) + (Math.abs(c.solvencyGap()) < 1e-6 ? '      yes' : '  GAP ' + c.solvencyGap().toFixed(3)));
}

// ---------- Part 2: a coin's whole life with many card plays ----------
function life(design, seed) {
  S = seed; const c = new Coin(design.feeToPot); c.pot = design.seedPot || 0;
  const ACTIVE = (w) => +w.slice(1) % 10 < 4; // 40% of wallets play cards
  const wallets = []; let plays = 0, peak = 0;
  for (let h = 0; h < 72; h++) {
    const arrivals = 2 + Math.floor(rnd() * 3);
    for (let a = 0; a < arrivals; a++) { const w = 'w' + wallets.length; wallets.push(w); c.buy(w, logn(6, 0.9)); }
    for (const w of wallets) { // churn: some buy more, some sell part
      const r = rnd();
      if (r < 0.03) c.buy(w, logn(3, 0.8));
      else if (r < 0.055) c.sell(w, (c.bal.get(w) || 0) * (0.3 + 0.7 * rnd()));
    }
    if (c.real >= 300 && h % 2 === 0) { // a card play every 2h after L2
      const actives = wallets.filter((w) => ACTIVE(w) && (c.bal.get(w) || 0) > 0);
      const player = actives[Math.floor(rnd() * actives.length)];
      design.play(c, player, ACTIVE); plays++;
    }
    peak = Math.max(peak, c.price());
  }
  const grp = (f) => { const ws = wallets.filter(f); const pnl = ws.reduce((s, w) => s + c.pnl(w), 0), paid = ws.reduce((s, w) => s + (c.paid.get(w) || 0), 0); return pnl / paid * 100; };
  return { price: c.price(), real: c.real, active: grp(ACTIVE), passive: grp((w) => !ACTIVE(w)), gap: c.solvencyGap(), pot: c.pot, protocol: c.protocol, plays };
}
const designs2 = {
  '0. No price cards (baseline)': { feeToPot: false, play: () => {} },
  'A. Pot (1% fee to pot, Seed 10), spend 40%': { feeToPot: true, seedPot: 10, play: (c) => c.potBuyBurn(c.pot * 0.4) },
  'B. Burn 1% of every holder per play': { feeToPot: false, play: (c) => c.burnAll(0.01) },
  'C. Reserve: 0.2% supply to the player': { feeToPot: false, play: (c, p) => c.release(p, 2) },
  'D. Burn 1% of passive holders only': { feeToPot: false, play: (c, p, A) => c.burnAll(0.01, (w) => !A(w)) },
  'E. Mix: pot 40% + burn 0.5% all + 0.1% to player': { feeToPot: true, seedPot: 10, play: (c, p) => { c.potBuyBurn(c.pot * 0.4); c.burnAll(0.005); c.release(p, 1); } },
};
console.log('\nPART 2: 72h coin life, ~250 wallets (40% play cards), a card every 2h after L2. Median of 50 runs.');
console.log('design'.padEnd(52) + 'price vs base' + '  active PnL' + '  passive PnL' + '  protocol' + '  solvent');
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
let base = null;
for (const [name, d] of Object.entries(designs2)) {
  const runs = Array.from({ length: 50 }, (_, i) => life(d, 100 + i));
  const pr = med(runs.map((r) => r.price));
  if (!base) base = pr;
  const ok = runs.every((r) => Math.abs(r.gap) < 1e-6);
  console.log(name.padEnd(52) + (((pr / base - 1) * 100).toFixed(1) + '%').padStart(13) +
    (med(runs.map((r) => r.active)).toFixed(1) + '%').padStart(12) + (med(runs.map((r) => r.passive)).toFixed(1) + '%').padStart(13) +
    med(runs.map((r) => r.protocol)).toFixed(0).padStart(10) + (ok ? '      yes' : '       NO'));
}
