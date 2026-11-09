/* Rulecard launch engine: the first 72 hours, hour by hour, with trader agents on the bonding curve.
   Runs in Node (module.exports) and in the page (window.RulecardLaunch).
   Agents: snipers, a whale, momentum traders, community holders, and a farmer who front-runs predictable treasury buybacks.
   Behaviour rules are invented; use the results to compare card designs, not to predict a real coin. */
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poisson(r, lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 200); return k - 1; }

  const C = { X0: 30, Y0: 1e9, CAP: 8e8, HOURS: 72, HAPPY: [6, 30, 54] };
  C.K = C.X0 * C.Y0;
  C.P0 = C.X0 / C.Y0;

  const PRESETS = [
    { id: 'plain', name: 'Plain curve', desc: 'No cards. The 1% fee piles up in the pot and is never used.', cards: {} },
    { id: 'lump', name: 'Daily buyback + Phoenix', desc: 'Buys back 30% of the pot at a known hour each day. Phoenix buys back 20% after a 35% drop.', cards: { buyback: 'lump', phoenix: true } },
    { id: 'drip', name: 'Drip buyback', desc: 'Same daily budget, spent in small amounts at random points every hour. No Phoenix.', cards: { buyback: 'drip' } },
    { id: 'pulse', name: 'Drip + Pulse Fee', desc: 'Sell fee rises from 1% toward 3% when token-weighted check-ins drop below the threshold.', cards: { buyback: 'drip', pulseFee: true } },
    { id: 'happy', name: '+ Happy Hour', desc: 'Announced 1-hour windows at hours 6, 30 and 54: no buy fee and extra attention.', cards: { buyback: 'drip', pulseFee: true, happy: true } },
    { id: 'full', name: '+ Launch Guard (cap)', desc: 'Everything above, plus a per-account buy cap in the first hour.', cards: { buyback: 'drip', pulseFee: true, happy: true, guard: true } },
    { id: 'lock', name: '+ Launch Lock', desc: 'Everything above except the cap: tokens bought in the first 2 hours cannot be sold until hour 12. It applies to tokens, so splitting wallets does not dodge it.', cards: { buyback: 'drip', pulseFee: true, happy: true, lock: true } },
    { id: 'vest', name: '+ Launch Vest', desc: 'Same as Launch Lock, but early tokens unlock gradually from hour 2 to hour 24 instead of all at once.', cards: { buyback: 'drip', pulseFee: true, happy: true, lock: true, vest: true } },
    { id: 'tax', name: '+ Early Sell Tax', desc: 'Happy Hour setup plus a sell fee that starts at 10% and falls to 1% by hour 12. The extra goes to the pot. It applies to tokens, so splitting wallets does not dodge it.', cards: { buyback: 'drip', pulseFee: true, happy: true, earlyTax: true } },
  ];

  const DEFAULTS = { virtualNear: 30, hype: 1, snipers: 15, sniperSize: 1.5, farmerSize: 5, buybackPct: 30, pulseThr: 40, pulseMax: 2, guardCap: 0.3 };
  const GROUPS = ['snp', 'whale', 'mom', 'comm', 'farm'];

  function run(preset, G, seed) {
    const r = rng(seed), cards = preset.cards, H = C.HOURS;
    const X0 = G.virtualNear || C.X0, K = X0 * C.Y0, P0 = X0 / C.Y0;
    let x = X0, y = C.Y0, pot = 0, burned = 0, spentBuyback = 0, feesIn = 0, phoenixCd = 0, phoenixFires = 0, bump = 0, pulse = 1, snpShare3 = 0, curH = 0;
    const sold = () => C.Y0 - y, circ = () => Math.max(1, sold() - burned), px = () => x / y;
    const agents = [];
    const mk = (g, extra) => { const a = Object.assign({ g, tok: 0, cost: 0, got: 0, entry: 0, peak: 0, last: -99 }, extra || {}); agents.push(a); return a; };

    function curveBuy(n) { // returns [tokens, NEAR actually used]
      if (n <= 0 || sold() >= C.CAP) return [0, 0];
      let nx = x + n, ny = K / nx;
      if (C.Y0 - ny > C.CAP) { ny = C.Y0 - C.CAP; nx = K / ny; n = nx - x; }
      const t = y - ny; x = nx; y = ny; return [t, n];
    }
    function buy(a, n, h) {
      const rate = cards.happy && C.HAPPY.includes(h) ? 0 : 0.01;
      const fee = n * rate, [t, used] = curveBuy(n - fee);
      if (t <= 0) return 0;
      const paid = used + fee * used / ((n - fee) || 1);
      pot += paid - used; feesIn += paid - used;
      a.entry = (a.entry * a.tok + px() * t) / (a.tok + t); a.tok += t; if (cards.lock && h <= 1) a.locked = (a.locked || 0) + t; a.cost += paid; a.peak = Math.max(a.peak, px());
      return t;
    }
    function sellFee() {
      let f = 0.01;
      if (cards.pulseFee) { const thr = G.pulseThr / 100; f += G.pulseMax / 100 * Math.max(0, Math.min(1, (thr - pulse) / thr)); }
      if (cards.earlyTax) f = Math.max(f, 0.10 - 0.09 * Math.min(1, curH / 12));
      return f;
    }
    function sell(a, t) {
      const stillLocked = !cards.lock ? 0 : cards.vest ? 1 - Math.max(0, Math.min(1, (curH - 2) / 22)) : (curH < 12 ? 1 : 0);
      const avail = a.tok - Math.min(a.tok, (a.locked || 0) * stillLocked);
      t = Math.min(t, avail); if (t <= 0) return 0;
      const ny = y + t, nx = K / ny, out = x - nx, fee = out * sellFee();
      x = nx; y = ny; pot += fee; feesIn += fee; a.tok -= t; a.got += out - fee;
      if (a.tok < 1) { a.tok = 0; a.entry = 0; a.peak = 0; }
      return out - fee;
    }
    function treasuryBuy(n) { n = Math.min(n, pot); if (n <= 0) return; pot -= n; const [t, used] = curveBuy(n); pot += n - used; burned += t; spentBuyback += used; }

    const farmer = mk('farm');
    const whale = mk('whale');
    const moms = []; for (let i = 0; i < 25; i++) moms.push(mk('mom'));
    const comm = [];
    const prices = [], pulses = [], pots = [];

    // hour 0: snipers land first
    for (let i = 0; i < G.snipers; i++) {
      const a = mk('snp', { sellBy: 6 + Math.floor(r() * 10) });
      let n = G.sniperSize * (0.8 + r() * 0.4); if (cards.guard) n = Math.min(n, G.guardCap);
      buy(a, n, 0);
    }

    for (let h = 0; h < H; h++) {
      curH = h;
      const p3 = prices.length >= 3 ? prices[prices.length - 3] : P0;
      const hi6 = Math.max(P0, ...prices.slice(-6));
      if (bump > 0) bump--; else if (r() < 0.05) bump = 3;
      const hh = cards.happy && C.HAPPY.includes(h);
      const attention = G.hype * (6 * Math.exp(-h / 14) + 1) * (hh ? 2.5 : 1) * (bump ? 2.5 : 1);

      // predictable buyback events, front-run by the farmer
      const lumpNow = cards.buyback === 'lump' && h % 24 === 12;
      const phoenixNow = cards.phoenix && phoenixCd === 0 && prices.length > 0 && px() < hi6 * 0.65;
      if (h % 24 === 12 || phoenixNow) buy(farmer, G.farmerSize, h); // farmer always tries; it only pays off if a buyback follows
      if (lumpNow) treasuryBuy(pot * G.buybackPct / 100);
      if (phoenixNow) { treasuryBuy(pot * 0.2); phoenixCd = 6; phoenixFires++; }
      if (farmer.tok > 0) sell(farmer, farmer.tok);
      if (phoenixCd > 0) phoenixCd--;

      // everything else this hour, in random order
      const acts = [];
      const nNew = poisson(r, attention);
      for (let i = 0; i < nNew; i++) acts.push(() => {
        const a = mk('comm', { last: h }); comm.push(a);
        let n = Math.exp(Math.log(0.4) + (r() - 0.5) * 1.6); if (cards.guard && h === 0) n = Math.min(n, G.guardCap);
        buy(a, n, h);
      });
      if (h === 1) acts.push(() => buy(whale, 8, h));
      if (h === 24) acts.push(() => sell(whale, whale.tok));
      if (cards.buyback === 'drip') acts.push(() => treasuryBuy(pot * G.buybackPct / 100 / 24 * (0.5 + r())));
      agents.forEach(a => {
        if (a.tok <= 0 && a.g !== 'mom') return;
        if (a.g === 'snp') acts.push(() => {
          if (!a.tok) return; a.peak = Math.max(a.peak, px());
          if (px() >= 2.5 * a.entry || (h >= 2 && px() < 0.8 * a.peak) || h >= a.sellBy) sell(a, a.tok);
        });
        else if (a.g === 'mom') acts.push(() => {
          if (!a.tok) { if (px() / p3 - 1 > 0.15 && r() < 0.35 * Math.min(2, attention / 3)) buy(a, 1 + 2 * r(), h); return; }
          a.peak = Math.max(a.peak, px());
          if (px() < 0.85 * a.peak || px() > 1.6 * a.entry) sell(a, a.tok);
        });
        else if (a.g === 'comm') acts.push(() => {
          const ratio = px() / a.entry;
          if (r() < 0.0375 * (ratio < 0.5 ? 0.5 : 1)) a.last = h;
          if (ratio < 0.5 && r() < 0.05) sell(a, a.tok);
          else if (ratio > 3 && r() < 0.03) sell(a, a.tok / 2);
          else if (r() < 0.006) sell(a, a.tok);
        });
      });
      for (let i = acts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [acts[i], acts[j]] = [acts[j], acts[i]]; }
      acts.forEach(f => f());
      if (h === 2) { let st = 0; agents.forEach(a => { if (a.g === 'snp') st += a.tok; }); snpShare3 = st / circ() * 100; }

      let live = 0; comm.forEach(a => { if (a.tok && h - a.last < 24) live += a.tok; });
      pulse = live / circ();
      prices.push(px()); pulses.push(pulse * 100); pots.push(pot);
    }

    const pFinal = px(), pnl = {}; GROUPS.forEach(g => pnl[g] = 0);
    agents.forEach(a => { pnl[a.g] += a.got + a.tok * pFinal - a.cost; });
    let peak = 0, dd = 0; prices.forEach(p => { peak = Math.max(peak, p); dd = Math.max(dd, 1 - p / peak); });
    const commTok = comm.reduce((s, a) => s + a.tok, 0);
    return {
      price: prices.map(p => p / P0), pulse: pulses, pot: pots,
      summary: {
        peak: Math.max(...prices) / P0, final: pFinal / P0, drawdown: dd * 100,
        pnlSnp: pnl.snp, pnlWhale: pnl.whale, pnlMom: pnl.mom, pnlComm: pnl.comm, pnlFarm: pnl.farm,
        commShare: commTok / circ() * 100, snpShare3, phoenixFires, fees: feesIn, buyback: spentBuyback, holders: comm.length,
      },
    };
  }

  function quantile(arr, q) { const s = arr.slice().sort((a, b) => a - b); const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
  function runMany(preset, G, n) {
    n = n || 40;
    const runs = []; for (let i = 0; i < n; i++) runs.push(run(preset, G, 7000 + i));
    const out = {};
    ['price', 'pulse', 'pot'].forEach(k => {
      out[k] = { p10: [], p50: [], p90: [] };
      for (let h = 0; h < C.HOURS; h++) { const col = runs.map(ru => ru[k][h]); out[k].p10.push(quantile(col, .1)); out[k].p50.push(quantile(col, .5)); out[k].p90.push(quantile(col, .9)); }
    });
    out.summary = {}; Object.keys(runs[0].summary).forEach(k => out.summary[k] = quantile(runs.map(ru => ru.summary[k]), .5));
    out.farmWinRate = runs.filter(ru => ru.summary.pnlFarm > 0).length / n * 100;
    return out;
  }

  const api = { C, PRESETS, DEFAULTS, run, runMany };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RulecardLaunch = api;
})(typeof window !== 'undefined' ? window : globalThis);
