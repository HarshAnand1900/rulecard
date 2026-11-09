/* Rulecard 60-day scenario engine. Same file runs in Node (module.exports) and in the page (window.RulecardSim).
   Rulebook under test: Heartbeat (supply) + Streak (ritual) + Meme Contest (treasury), optional Shield.
   Everything is a model with made-up behaviour; numbers are for comparing parameter choices, not predictions. */
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

  const C = { X0: 30, Y0: 1e9, CAP: 8e8, FEE: 0.01, RESERVE: 2e8, TOTAL: 1e9, GAS_CHECKIN: 0.0003 };
  C.K = C.X0 * C.Y0;

  const SCENARIOS = [
    { id: 'steady', name: 'Steady community', desc: '8 NEAR of buys a day, 2% sold a day, 60% check in.',
      buy: d => 8, sell: d => 2, chk: d => 60 },
    { id: 'hype', name: 'Hype, then fade', desc: 'Big launch week (30 NEAR/day) decaying to 2. Check-ins slide from 75% to 25%.',
      buy: d => 2 + 30 * Math.exp(-d / 10), sell: d => (d < 15 ? 1.5 : 4), chk: d => 75 - 50 * d / 60 },
    { id: 'dying', name: 'Slow death', desc: 'Weak buying that dries up, 3% sold a day, check-ins from 40% down to 10%.',
      buy: d => 4 * Math.exp(-d / 20), sell: d => 3, chk: d => 40 - 30 * d / 60 },
    { id: 'whale', name: 'Whale exits on day 25', desc: 'Steady, then one holder dumps 25% of supply. Buys halve and check-ins drop for about a week.',
      buy: d => (d >= 25 && d < 35 ? 4 : 8), sell: d => 2, chk: d => (d >= 25 && d < 32 ? 40 : 60), dump: { day: 25, pct: 25 } },
    { id: 'bots', name: 'Quiet coin + 300 bots', desc: 'Only 30% of real holders check in. From day 5, 300 bot wallets holding the minimum balance check in every day.',
      buy: d => 5, sell: d => 2, chk: d => 30, bots: { n: 300, start: 5 } },
  ];

  const DEFAULTS = {
    hbThr: 40,          // Heartbeat: pulse threshold, %
    hbBurn: 3,          // Heartbeat: burn per firing, % of the source
    burnFrom: 'reserve',// 'reserve' = burn from the 200M non-curve tokens; 'buyback' = spend fee pot buying back on the curve
    stPool: 1,          // Streak: % of fee pot paid out per day
    stCap: 30,          // Streak: cap in days
    ctShare: 40,        // Meme Contest: % of fee pot each week
    weighting: 'token', // 'wallet' = pulse and Streak count wallets; 'token' = count tokens
    minBal: 1e5,        // tokens a wallet must hold to count at all
    shield: false,
  };

  function run(sc, P, seed, days) {
    days = days || 60;
    const r = rng(seed);
    let x = C.X0, y = C.Y0, fee = 0, reserve = C.RESERVE, burnedCirc = 0, burnedRes = 0;
    let holders = 1, paidReal = 0, paidBots = 0, fires = 0, shieldUsed = false;
    let botTok = 0, botCapital = 0, botGas = 0;
    const sold = () => C.Y0 - y;
    const circ = () => Math.max(0, sold() - burnedCirc);
    const price = () => x / y;
    function buy(n, feeless) {
      if (n <= 0 || sold() >= C.CAP) return 0;
      let f = feeless ? 0 : n * C.FEE, net = n - f;
      let nx = x + net, ny = C.K / nx;
      if (C.Y0 - ny > C.CAP) { ny = C.Y0 - C.CAP; nx = C.K / ny; net = nx - x; f = feeless ? 0 : net * C.FEE / (1 - C.FEE); }
      const t = y - ny; x = nx; y = ny; if (!feeless) fee += f; return t;
    }
    function sell(t) {
      t = Math.min(t, circ()); if (t <= 0) return 0;
      const ny = y + t, nx = C.K / ny, out = x - nx, f = out * C.FEE;
      x = nx; y = ny; fee += f; return out - f;
    }

    const o = { supply: [], circ: [], fee: [], price: [], pulse: [], realPulse: [], fires: [], paidReal: [], paidBots: [] };
    buy(1, false); // creator's capped first buy

    for (let d = 1; d <= days; d++) {
      const bv = sc.buy(d) * (0.6 + r() * 0.8);
      const bought = buy(bv, false);
      if (bought > 0) holders += Math.round(bv * (2 + r() * 4));
      const sp = sc.sell(d) * (0.5 + r());
      sell((circ() - botTok) * sp / 100);
      holders = Math.max(1, Math.round(holders - holders * sp / 100 * 0.5));
      if (sc.dump && d === sc.dump.day) sell((circ() - botTok) * sc.dump.pct / 100);

      const B = sc.bots && d >= sc.bots.start ? sc.bots.n : 0;
      if (sc.bots && d === sc.bots.start) {
        const need = sc.bots.n * P.minBal * price() * 1.03;
        botCapital = need; botTok = buy(need, false);
      }
      botGas += B * C.GAS_CHECKIN;

      const rr = Math.max(0, Math.min(100, sc.chk(d) + (r() - 0.5) * 16)) / 100;
      const realTok = Math.max(0, circ() - botTok);
      const pulse = P.weighting === 'wallet'
        ? (holders * rr + B) / (holders + B)
        : (realTok * rr + botTok) / ((realTok + botTok) || 1);

      if (d % 7 === 1) shieldUsed = false;
      // Heartbeat
      if (pulse * 100 < P.hbThr) {
        if (P.shield && !shieldUsed) shieldUsed = true;
        else {
          fires++;
          if (P.burnFrom === 'reserve') { const b = reserve * P.hbBurn / 100; reserve -= b; burnedRes += b; }
          else { const n = fee * P.hbBurn / 100; fee -= n; burnedCirc += buy(n, true); }
        }
      }
      // Streak
      const pool = fee * P.stPool / 100; fee -= pool;
      const sr = Math.min(P.stCap, rr / (1 - rr + 1e-9)), mr = 1 + sr / P.stCap;
      const sb = B ? Math.min(P.stCap, d - sc.bots.start + 1) : 0, mb = 1 + sb / P.stCap;
      const wReal = P.weighting === 'wallet' ? holders * rr * mr : realTok * rr * mr;
      const wBot = P.weighting === 'wallet' ? B * mb : botTok * mb;
      const botShare = wBot / ((wReal + wBot) || 1);
      paidBots += pool * botShare; paidReal += pool * (1 - botShare);
      // Meme Contest
      if (d % 7 === 0) { const prize = fee * P.ctShare / 100; fee -= prize; paidReal += prize; }

      o.supply.push(C.TOTAL - burnedCirc - burnedRes);
      o.circ.push(circ());
      o.fee.push(fee);
      o.price.push(price());
      o.pulse.push(pulse * 100);
      o.realPulse.push(rr * 100);
      o.fires.push(fires);
      o.paidReal.push(paidReal);
      o.paidBots.push(paidBots);
    }
    o.summary = {
      supply: C.TOTAL - burnedCirc - burnedRes, burnedPct: (burnedCirc + burnedRes) / C.TOTAL * 100,
      circ: circ(), fee, price: price(), fires, paidReal, paidBots,
      botShare: paidBots / ((paidReal + paidBots) || 1) * 100,
      botProfit: paidBots - botGas - botCapital * 0.02, // gas + ~2% round-trip trading fees
      botCapital, holders,
    };
    return o;
  }

  function quantile(arr, q) { const s = arr.slice().sort((a, b) => a - b); const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }

  function runMany(sc, P, n, days) {
    n = n || 30; days = days || 60;
    const runs = []; for (let i = 0; i < n; i++) runs.push(run(sc, P, 1000 + i, days));
    const keys = ['supply', 'circ', 'fee', 'price', 'pulse', 'realPulse', 'fires', 'paidReal', 'paidBots'];
    const out = {};
    keys.forEach(k => {
      out[k] = { p10: [], p50: [], p90: [] };
      for (let d = 0; d < days; d++) {
        const col = runs.map(ru => ru[k][d]);
        out[k].p10.push(quantile(col, 0.1)); out[k].p50.push(quantile(col, 0.5)); out[k].p90.push(quantile(col, 0.9));
      }
    });
    out.summary = {};
    Object.keys(runs[0].summary).forEach(k => out.summary[k] = quantile(runs.map(ru => ru.summary[k]), 0.5));
    return out;
  }

  // Grid of median % of supply burned by day 60, for Heartbeat threshold × burn.
  function sweep(sc, P, thrs, burns, n) {
    return thrs.map(t => burns.map(b => runMany(sc, Object.assign({}, P, { hbThr: t, hbBurn: b }), n || 10).summary.burnedPct));
  }

  const api = { C, SCENARIOS, DEFAULTS, run, runMany, sweep };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RulecardSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
