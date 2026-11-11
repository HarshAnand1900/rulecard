// Mix funding: fees (pot) + locked reward pool + small idle dilution, with skill and luck.
// Question: can skilled/lucky players outperform, with only small losses for everyone else, and stay solvent?
// Units: NEAR, millions of tokens. Run: node research/mix-sim.cjs
let S = 1; const rnd = () => (S = (S * 16807) % 2147483647) / 2147483647;
const logn = (m, s) => Math.exp(Math.log(m) + s * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()));

class Coin {
  constructor(o) {
    this.x = 900; this.y = 1073; this.k = this.x * this.y; this.real = 0; this.circ = 0;
    this.pot = o.seed || 0; this.protocol = 0; this.pool = o.pool || 0; this.fee = o.fee; this.potShare = o.potShare;
    this.bal = new Map(); this.paid = new Map(); this.recv = new Map(); this.released = 0; this.burned = 0;
  }
  price() { return this.x / this.y; }
  add(m, w, v) { m.set(w, (m.get(w) || 0) + v); }
  takeFee(v) { const f = v * this.fee; this.pot += f * this.potShare; this.protocol += f * (1 - this.potShare); return f; }
  reprice() { if (this.circ > 1e-9) { this.x = this.real * (this.y + this.circ) / this.circ; this.k = this.x * this.y; } }
  buy(w, n) { const net = n - this.takeFee(n); this.x += net; const ny = this.k / this.x; const got = this.y - ny; this.y = ny; this.real += net; this.circ += got; this.add(this.bal, w, got); this.add(this.paid, w, n); }
  sell(w, t) { t = Math.min(t, this.bal.get(w) || 0); if (t <= 0) return; const ny = this.y + t, nx = this.k / ny, out = this.x - nx; this.x = nx; this.y = ny; this.real -= out; this.circ -= t; this.add(this.bal, w, -t); this.add(this.recv, w, out - this.takeFee(out)); }
  potBuyBurn(N) { N = Math.min(N, this.pot); if (N <= 0) return; this.pot -= N; this.x += N; this.y = this.k / this.x; this.real += N; this.reprice(); }
  move(from, to, t) { this.add(this.bal, from, -t); if (to) this.add(this.bal, to, t); else { this.circ -= t; this.burned += t; } }
  release(w, t) { t = Math.min(t, this.pool); this.pool -= t; this.released += t; this.add(this.bal, w, t); this.circ += t; }
  quote(w) { const t = this.bal.get(w) || 0; return t > 0 ? this.x - this.k / (this.y + t) : 0; }
  pnl(w) { return (this.recv.get(w) || 0) + this.quote(w) - (this.paid.get(w) || 0); }
  solvent() { // sell every holder in turn on a copy: the curve must pay out exactly what it holds
    const c = Object.assign(Object.create(Coin.prototype), this, { bal: new Map(this.bal), recv: new Map() });
    for (const w of [...c.bal.keys()]) c.sell(w, c.bal.get(w)); return Math.abs(c.real) < 1e-6;
  }
}

// Wallet types: 25% skilled players, 35% casual players, 40% passive holders (never play, rarely check in)
const kind = (w) => { const i = ((+w.slice(1) + 3) * 2654435761 % 4294967296) % 20; return i < 5 ? 'skilled' : i < 12 ? 'casual' : 'passive'; };
const SKILL = { skilled: 0.65, casual: 0.5 }; // chance of picking the right side of a position

function life(d, seed) {
  S = seed; const c = new Coin(d); const ws = [];
  for (let h = 0; h < 72; h++) {
    const n = 2 + Math.floor(rnd() * 3);
    for (let a = 0; a < n; a++) { const w = 'w' + ws.length; ws.push(w); c.buy(w, logn(6, 0.9)); }
    for (const w of ws) { const r = rnd(); if (r < 0.03) c.buy(w, logn(3, 0.8)); else if (r < 0.055) c.sell(w, (c.bal.get(w) || 0) * (0.3 + 0.7 * rnd())); }
    const L2 = c.real >= 300;
    if (!L2) continue;
    // 1) Pot: one big play whenever the pot reaches 5% of the curve's real NEAR (spends 60% of it)
    if (d.potShare > 0 && c.pot >= 0.05 * c.real) c.potBuyBurn(c.pot * 0.6);
    // 2) Positions every 2h: players bet 15% of their bag on Call/Fade. Losers lose 30%: 20% to winners, 10% burned.
    //    Winners also get a reward-pool bonus = d.bonus x winning bets, half pro rata, half as 3 lucky draws.
    if (h % 2 === 0 && d.positions) {
      const players = ws.filter((w) => kind(w) !== 'passive' && (c.bal.get(w) || 0) > 0 && rnd() < 0.3);
      const truth = rnd() < 0.5, win = [], lose = [];
      for (const w of players) (rnd() < SKILL[kind(w)] ? win : lose).push([w, (c.bal.get(w) || 0) * 0.15]);
      if (win.length && lose.length) {
        const W = win.reduce((s, [, b]) => s + b, 0); let lost = 0;
        for (const [w, b] of lose) { c.move(w, null, b * 0.10); c.move(w, 'tmp', b * 0.20); lost += b * 0.20; }
        for (const [w, b] of win) c.move('tmp', w, lost * b / W);
        c.bal.delete('tmp');
        const bonus = Math.min(W * d.bonus, c.pool, d.dayCap / 12);
        for (const [w, b] of win) c.release(w, bonus * 0.5 * b / W);
        for (const share of [0.6, 0.25, 0.15]) { let r = rnd() * W, pick = win[0][0]; for (const [w, b] of win) { r -= b; if (r <= 0) { pick = w; break; } } c.release(pick, bonus * 0.5 * share); }
        c.reprice();
      }
    }
    // 3) Idle dilution: wallets that don't check in (passive holders) lose d.idle per day, burned
    if (d.idle > 0) { for (const w of ws) if (kind(w) === 'passive') { const b = c.bal.get(w) || 0; if (b > 0) c.move(w, null, b * d.idle / 24); } c.reprice(); }
  }
  const g = (k) => { const s = ws.filter((w) => kind(w) === k); const pnl = s.map((w) => c.pnl(w) / c.paid.get(w) * 100); return { avg: s.reduce((a, w) => a + c.pnl(w), 0) / s.reduce((a, w) => a + c.paid.get(w), 0) * 100, won: pnl.filter((p) => p > 0).length / s.length * 100, best: Math.max(...pnl), worst: Math.min(...pnl) }; };
  return { price: c.price(), skilled: g('skilled'), casual: g('casual'), passive: g('passive'), protocol: c.protocol, released: c.released, burned: c.burned, ok: c.solvent() };
}

const D = {
  '0. No cards (1% fee to protocol)': { fee: 0.01, potShare: 0 },
  '1. Fees only (2% fee, 1.5% to pot)': { fee: 0.02, potShare: 0.75, seed: 10 },
  '2. Light mix: pot + positions + pool bonus 10% + idle 0.25%/day': { fee: 0.02, potShare: 0.75, seed: 10, positions: true, pool: 50, bonus: 0.10, dayCap: 5, idle: 0.0025 },
  '3. Medium mix: pot + positions + pool bonus 20% + idle 0.5%/day': { fee: 0.02, potShare: 0.75, seed: 10, positions: true, pool: 50, bonus: 0.20, dayCap: 5, idle: 0.005 },
  '4. Heavy mix: pot + positions + pool bonus 40% + idle 1%/day': { fee: 0.02, potShare: 0.75, seed: 10, positions: true, pool: 50, bonus: 0.40, dayCap: 10, idle: 0.01 },
};
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const RUNS = 50; let base;
console.log(`72h coin life, ~250 wallets: 25% skilled players, 35% casual players, 40% passive. Median of ${RUNS} runs. PnL = profit as % of NEAR put in.\n`);
for (const [name, d] of Object.entries(D)) {
  const r = Array.from({ length: RUNS }, (_, i) => life(d, 500 + i));
  const p = med(r.map((x) => x.price)); if (!base) base = p;
  const f = (k) => `${med(r.map((x) => x[k].avg)).toFixed(1).padStart(6)}% (${med(r.map((x) => x[k].won)).toFixed(0)}% in profit)`;
  console.log(name);
  console.log(`   price vs no cards ${((p / base - 1) * 100).toFixed(1)}% | skilled ${f('skilled')} | casual ${f('casual')} | passive ${f('passive')}`);
  console.log(`   best skilled wallet ${med(r.map((x) => x.skilled.best)).toFixed(0)}% | worst passive ${med(r.map((x) => x.passive.worst)).toFixed(0)}% | reward pool released ${med(r.map((x) => x.released)).toFixed(1)}M | burned ${med(r.map((x) => x.burned)).toFixed(1)}M | protocol ${med(r.map((x) => x.protocol)).toFixed(0)} NEAR | solvent in all runs: ${r.every((x) => x.ok) ? 'yes' : 'NO'}\n`);
}
