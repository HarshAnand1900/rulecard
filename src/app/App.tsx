import { useEffect, useMemo, useRef, useState } from 'react';
import * as G from '../engine/game';
import { CARDS, CardType, RULES, RuleId, HOUR, MIN, DAY, LEVELS, LEVEL_NAMES, TIERS, Tier, ANNOUNCE } from '../engine/cards';
import { HUMANS, seedWorld, step, save, load, wipe } from './world';

const SPEEDS: [string, number][] = [['Pause', 0], ['1×', 1], ['60×', 60], ['10m/s', 600], ['1h/s', 3600]];
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);
const dur = (ms: number) => { ms = Math.max(0, ms); const h = Math.floor(ms / HOUR), m = Math.floor((ms % HOUR) / MIN), s = Math.floor((ms % MIN) / 1000); return h ? `${h}h ${m}m` : m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`; };
const nearF = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(3));
const priceF = (p: number) => (p * 1e9).toFixed(2); // NEAR per 1B tokens = market cap in NEAR

export default function App() {
  const world = useRef<G.State>(load() ?? seedWorld());
  const [, setV] = useState(0); const redraw = () => setV(v => v + 1);
  const [speed, setSpeed] = useState(60);
  const [me, setMe] = useState('you');
  const [sel, setSel] = useState<string>(() => Object.keys(world.current.coins)[0]);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [launching, setLaunching] = useState(false);
  const acc = useRef(0), lastSave = useRef(0);
  const s = world.current;

  useEffect(() => {
    const id = setInterval(() => {
      if (speed > 0) { acc.current += 250 * speed; let n = 0; while (acc.current >= MIN && n < 120) { step(world.current); acc.current -= MIN; n++; } if (n === 120) acc.current = 0; }
      if (Date.now() - lastSave.current > 3000) { save(world.current); lastSave.current = Date.now(); }
      redraw();
    }, 250);
    return () => clearInterval(id);
  }, [speed]);

  const act = (label: string, f: () => unknown) => {
    try { f(); setToast({ ok: true, text: label }); } catch (e: any) { setToast({ ok: false, text: e.message }); }
    redraw(); setTimeout(() => setToast(null), 3500);
  };
  const skip = (ms: number) => { for (let i = 0; i < ms / MIN; i++) step(s); redraw(); };
  const coin = s.coins[sel] ?? Object.values(s.coins)[0];

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="logo">RULECARD</span><span className="tag">localhost · test NEAR · not real money</span></div>
        <div className="clock">
          <span className="mono big">{hhmm(s.now + acc.current)} UTC</span>
          <div className="seg">{SPEEDS.map(([l, v]) => <button key={l} aria-pressed={speed === v} onClick={() => setSpeed(v)}>{l}</button>)}</div>
          <button className="btn ghost" onClick={() => skip(HOUR)}>+1h</button>
        </div>
        <div className="who">
          <select value={me} onChange={e => setMe(e.target.value)} aria-label="Player">{HUMANS.map(h => <option key={h}>{h}</option>)}</select>
          <span className="mono">{nearF(s.accounts[me].near)} NEAR</span>
          <button className="btn ghost" onClick={() => { if (confirm('Reset the local world?')) { wipe(); world.current = seedWorld(); setSel(Object.keys(world.current.coins)[0]); redraw(); } }}>Reset</button>
        </div>
      </header>

      <div className="layout">
        <aside className="side">
          <button className="btn primary wide" onClick={() => setLaunching(true)}>+ Launch a coin</button>
          <CoinList s={s} sel={coin?.id} onSel={setSel} />
          <Collection s={s} me={me} />
        </aside>
        {coin ? <CoinPage s={s} c={coin} me={me} act={act} /> : <main className="main">No coins yet.</main>}
      </div>

      {launching && <LaunchForm s={s} me={me} onClose={() => setLaunching(false)} onDone={id => { setSel(id); setLaunching(false); }} act={act} />}
      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`} role="status">{toast.text}</div>}
    </div>
  );
}

type Act = (label: string, f: () => unknown) => void;

function CoinList({ s, sel, onSel }: { s: G.State; sel?: string; onSel: (id: string) => void }) {
  const coins = Object.values(s.coins).map(c => {
    const h = c.priceHist, old = [...h].reverse().find(p => s.now - p.t >= HOUR) ?? h[0];
    return { c, ch: G.price(c) / old.p - 1, pinned: !!G.activeEffect(c, 'hypeSiren', s.now) };
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || G.mcap(b.c) - G.mcap(a.c));
  return (
    <nav className="coins" aria-label="Coins">
      <h3>Trending</h3>
      {coins.map(({ c, ch, pinned }) => (
        <button key={c.id} className={`coinrow ${c.id === sel ? 'on' : ''}`} onClick={() => onSel(c.id)}>
          <Mascot c={c} size={30} />
          <span className="cr-main"><b>${c.ticker}</b> <span className="lvl">L{c.level}</span>{pinned && <span className="pin">📌</span>}{c.htl && <span className="htlmini">HOLD</span>}
            <span className="muted small">{nearF(G.mcap(c))} N mcap</span></span>
          <span className={`mono small ${ch >= 0 ? 'up' : 'down'}`}>{ch >= 0 ? '+' : ''}{(ch * 100).toFixed(1)}%</span>
        </button>
      ))}
    </nav>
  );
}

function Mascot({ c, size = 64 }: { c: G.Coin; size?: number }) {
  const skins: Record<string, [string, string]> = { classic: ['#ffb347', '#7a3e00'], neon: ['#39ff9f', '#003d22'], gold: ['#ffd700', '#5a4300'], void: ['#8a5cff', '#1b0040'] };
  const [f, e] = skins[c.skin] ?? skins.classic; const hue = [...c.ticker].reduce((x, ch) => x + ch.charCodeAt(0), 0) % 360;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="mascot">
      <circle cx="32" cy="34" r={18 + c.level * 2} fill={c.skin === 'classic' ? `hsl(${hue} 80% 62%)` : f} />
      <circle cx="25" cy="31" r="4" fill={e} /><circle cx="39" cy="31" r="4" fill={e} />
      <path d={c.htl ? 'M24 44 Q32 38 40 44' : 'M24 40 Q32 47 40 40'} stroke={e} strokeWidth="3" fill="none" strokeLinecap="round" />
      {c.level >= 3 && <path d="M20 14 L26 22 L32 12 L38 22 L44 14 L42 24 L22 24 Z" fill="#ffd700" />}
      {c.level >= 5 && <circle cx="32" cy="34" r="30" fill="none" stroke="#ffd700" strokeDasharray="3 4" />}
    </svg>
  );
}

function CoinPage({ s, c, me, act }: { s: G.State; c: G.Coin; me: string; act: Act }) {
  const h = c.holders[me]; const myBal = h?.bal || 0;
  const raids = Object.values(s.raids).filter(r => r.sides.some(sd => sd.coin === c.id) && (r.status !== 'done' || s.now - r.endsAt < 3 * HOUR));
  return (
    <main className="main">
      {c.bannerOf && <div className="banner takeover">🏴 Conquered by ${s.coins[c.bannerOf]?.ticker} for {dur(c.bannerUntil - s.now)}</div>}
      {c.htl && <HoldTheLine s={s} c={c} me={me} />}
      <section className="coinhead panel">
        <Mascot c={c} size={84} />
        <div className="ch-text">
          <h1>${c.ticker} <span className="muted">{c.name}</span></h1>
          <div className="chips">
            {c.rules.map(r => <span key={r} className="chip rule" title={RULES[r].text}>{RULES[r].name}</span>)}
            <span className="chip">fee {(c.feeRate * 100).toFixed(1)}%</span>
            <span className="chip">by {c.creator}</span>
            {c.graduated && <span className="chip gold">Graduated</span>}
          </div>
        </div>
        <div className="stats">
          <Stat l="Market cap" v={`${nearF(G.mcap(c))} N`} />
          <Stat l="Real NEAR in curve" v={nearF(c.real)} />
          <Stat l="Pot" v={nearF(c.pot)} />
          <Stat l="Burned" v={G.fmtTok(c.burned)} />
          <Stat l="Holders" v={String(Object.values(c.holders).filter(x => x.bal > 0).length)} />
          <Stat l="Pulse" v={`${(G.pulse(s, c) * 100).toFixed(0)}%`} />
        </div>
      </section>

      <div className="grid2">
        <section className="panel"><Chart c={c} now={s.now} /><Levels s={s} c={c} /></section>
        <section className="panel"><Meters s={s} c={c} /><Trade s={s} c={c} me={me} act={act} /></section>
      </div>

      {raids.map(r => <RaidPanel key={r.id} s={s} r={r} me={me} act={act} />)}
      <Effects s={s} c={c} me={me} act={act} />

      <section className="panel">
        <div className="row-between"><h2>Your hand <span className="muted small">({G.hand(s, c.id, me).length}/{s.cfg.handLimit}) · ${c.ticker} cards only</span></h2>
          <span className="muted small">You hold {G.fmtTok(myBal)} · Conviction ×{h && myBal ? (G.conviction(s, c, me) / myBal).toFixed(2) : '1.00'}{h && s.now < h.lockedUntil ? ` · locked ${dur(h.lockedUntil - s.now)}` : ''}</span></div>
        <Hand s={s} c={c} me={me} act={act} />
        <Workshop s={s} c={c} me={me} act={act} />
      </section>

      <Log s={s} c={c} />
    </main>
  );
}

const Stat = ({ l, v }: { l: string; v: string }) => <div className="stat"><div className="l">{l}</div><div className="v mono">{v}</div></div>;

function Chart({ c, now }: { c: G.Coin; now: number }) {
  const [win, setWin] = useState(6 * HOUR);
  const pts = c.priceHist.filter(p => now - p.t <= win); const data = pts.length > 1 ? pts : c.priceHist.slice(-2);
  const W = 560, H = 180, t0 = now - win, ps = data.map(p => p.p), lo = Math.min(...ps) * 0.97, hi = Math.max(...ps) * 1.03 || 1;
  const X = (t: number) => ((t - t0) / win) * W, Y = (p: number) => H - ((p - lo) / (hi - lo || 1)) * H;
  const d = data.map((p, i) => `${i ? 'L' : 'M'}${X(Math.max(p.t, t0)).toFixed(1)},${Y(p.p).toFixed(1)}`).join(' ');
  const up = ps[ps.length - 1] >= ps[0];
  return (
    <div>
      <div className="row-between"><h3>Price <span className="mono">{priceF(G.price(c))}</span> <span className="muted small">NEAR per 1B</span></h3>
        <div className="seg small">{[[HOUR, '1h'], [6 * HOUR, '6h'], [DAY, '24h']].map(([v, l]) => <button key={l} aria-pressed={win === v} onClick={() => setWin(v as number)}>{l}</button>)}</div></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Price chart">
        <path d={`${d} L${W},${H} L0,${H} Z`} className={up ? 'area up' : 'area down'} />
        <path d={d} className={up ? 'line up' : 'line down'} />
      </svg>
    </div>
  );
}

function Levels({ s, c }: { s: G.State; c: G.Coin }) {
  return (
    <div className="levels">
      {LEVELS.map((n, i) => {
        const lv = i + 1, done = c.level >= lv, next = c.level + 1 === lv;
        const pct = done ? 100 : next ? Math.min(100, (c.real / n) * 100) : 0;
        return (
          <div key={lv} className={`lv ${done ? 'done' : ''}`} title={`${n} NEAR`}>
            <div className="lv-bar"><i style={{ width: pct + '%' }} /></div>
            <b>L{lv} {LEVEL_NAMES[i]}</b>
            <span className="muted small">{n}N · {['Common', 'Rare', 'Epic', 'Mythic', 'DEX'][i]}</span>
            {next && c.levelPendingSince !== null && <span className="small up">holding {dur(s.now - c.levelPendingSince)}/15m</span>}
          </div>
        );
      })}
    </div>
  );
}

function Meters({ s, c }: { s: G.State; c: G.Coin }) {
  const ecl = G.inEclipse(s), nextE = G.nextEclipse(s);
  return (
    <div className="meters">
      <Meter label="Spark" sub="Common + tactics · 5 each" v={c.spark} max={30} cls="spark" />
      <Meter label="Ult" sub="Epic · needs full" v={c.ult} max={100} cls="ult" />
      <div className="mrow"><span>Rare slot</span><b className="mono">{s.now >= c.rareFreeAt ? 'ready' : dur(c.rareFreeAt - s.now)}</b></div>
      <div className="mrow"><span>Eclipse <span className="muted small">(Mythic, L4)</span></span><b className={`mono ${ecl ? 'gold' : ''}`}>{ecl ? (c.eclipseUsed === G.eclipseWindow(s) ? 'used' : 'OPEN NOW') : `in ${dur(nextE - s.now)}`}</b></div>
      <div className="mrow"><span>Caps today</span><span className="mono small">burn room {G.fmtTok(G.burnRoom(s, c))} · pot room {nearF(G.potRoom(s, c))} N</span></div>
    </div>
  );
}
const Meter = ({ label, sub, v, max, cls }: { label: string; sub: string; v: number; max: number; cls: string }) => (
  <div className="meter"><div className="mrow"><span>{label} <span className="muted small">{sub}</span></span><b className="mono">{v.toFixed(0)}/{max}</b></div><div className={`mbar ${cls}`}><i style={{ width: (100 * v / max) + '%' }} /></div></div>
);

function Trade({ s, c, me, act }: { s: G.State; c: G.Coin; me: string; act: Act }) {
  const [amt, setAmt] = useState('1'); const h = c.holders[me]; const bal = h?.bal || 0;
  const n = parseFloat(amt) || 0; const est = n > 0 ? estBuy(c, n * (1 - G.feeRate(s, c))) : 0;
  const canCheck = h && bal >= s.cfg.minBal && s.now - h.lastCheckin >= 30 * MIN;
  return (
    <div className="trade">
      <h3>Trade</h3>
      <div className="trow"><input aria-label="NEAR to spend" value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" /><span className="muted">NEAR</span>
        <button className="btn buy" onClick={() => act('Bought', () => G.buy(s, me, c.id, n, est * 0.98))}>Buy ≈ {G.fmtTok(est)}</button></div>
      <div className="trow">{[0.25, 0.5, 1].map(f => <button key={f} className="btn sell" disabled={!bal} onClick={() => act('Sold', () => G.sell(s, me, c.id, bal * f))}>Sell {f * 100}%</button>)}</div>
      <div className="trow">
        <button className="btn" disabled={!canCheck} onClick={() => act('Checked in', () => G.checkIn(s, me, c.id))}>✓ Check in{h && !canCheck && bal ? ` (${dur(h.lastCheckin + 30 * MIN - s.now)})` : ''}</button>
        <button className="btn" onClick={() => act('Card of the Day claimed', () => G.claimCardOfDay(s, me, c.id))}>🎴 Card of the Day</button>
      </div>
      <p className="muted small">Fee {(G.feeRate(s, c) * 100).toFixed(1)}%{G.feeRate(s, c) === 0 ? ' (Tax Holiday!)' : ''}. Min-out 2% below the quote. Check-ins fill the meters.</p>
    </div>
  );
}
function estBuy(c: G.Coin, net: number) { const nx = c.x + net, ny = c.K / nx; return Math.min(c.y - ny, c.y - (G.Y0 - G.CAP)); }

function HoldTheLine({ s, c, me }: { s: G.State; c: G.Coin; me: string }) {
  const H = c.htl!; const inSnap = H.snap[me] !== undefined, out = H.out[me];
  return (
    <div className="banner htl">
      <div><b>HOLD THE LINE</b> · {dur(H.end - s.now)} left · prize {nearF(c.prizePot + Math.min(c.pot * 0.2, G.potRoom(s, c)))} NEAR · {Object.keys(H.snap).length - Object.keys(H.out).length} holding</div>
      <div className="small">{inSnap ? (out ? 'You sold, so you are out of this prize.' : 'You are in. Don\'t sell and you share the prize + get a Survivor badge.') : 'You weren\'t holding before the drop. Buy the dip for a Dip Catcher badge + card.'} The pot is buying and burning the dip ({nearF(H.dipBudget - Math.max(0, H.dipLeft))}/{nearF(H.dipBudget)} N).</div>
    </div>
  );
}

function Effects({ s, c, me, act }: { s: G.State; c: G.Coin; me: string; act: Act }) {
  const [amt, setAmt] = useState('25');
  const list = c.effects.filter(e => e.status !== 'done' || (e.type === 'diamondPool' && !e.data.settled));
  if (!list.length) return null;
  const bal = c.holders[me]?.bal || 0, part = bal * (parseFloat(amt) || 0) / 100;
  return (
    <section className="panel">
      <div className="row-between"><h2>On the table</h2><label className="small muted">stake <input className="tiny" value={amt} onChange={e => setAmt(e.target.value)} />% of your bag ({G.fmtTok(part)})</label></div>
      <div className="fx">
        {list.map(e => {
          const def = CARDS[e.type]; const live = e.status === 'active'; let body: any = null;
          if (e.type === 'inferno' || e.type === 'supernova') body = <>{e.data.done}/{e.data.chunks} chunks · {G.fmtTok(e.data.burned)} burned</>;
          if (e.type === 'diamondPool') { const mine = e.data.stakes[me]; body = <>{Object.keys(e.data.stakes).length} lockers · lock {dur(e.data.lock)} after join · unlocks {hhmm(e.endsAt + e.data.lock)}{live && s.now < e.endsAt && <button className="btn sm" onClick={() => act('Locked in the pool', () => G.joinDiamond(s, me, c.id, part))}>Join</button>}{mine && <button className="btn sm sell" onClick={() => act('Left early (20% penalty)', () => G.leaveDiamond(s, me, c.id))}>Leave ({G.fmtTok(mine)})</button>}</>; }
          if (e.type === 'summoningCircle') { const ch = e.data.chants; const w = ch.reduce((x: number, v: any) => x + v.w, 0); body = <>{ch.length}/{s.cfg.circleMinWallets} chanters · {(100 * w / (c.circ || 1)).toFixed(1)}%/{s.cfg.circleTarget * 100}% weight{live && <button className="btn sm" onClick={() => act('You chanted', () => G.chant(s, me, c.id, part))}>Chant</button>}</>; }
          if (e.type === 'blackHole') body = <>{G.fmtTok(e.data.total)} in the pit · {Object.keys(e.data.pit).length} feeders{live && <button className="btn sm" onClick={() => act('Fed the Black Hole', () => G.feedBlackHole(s, me, c.id, part))}>Throw in</button>}</>;
          if (e.type === 'prophecy') { const got = live ? c.inflow - e.data.base : 0; body = <>{nearF(got)}/{e.data.goal.toFixed(1)} NEAR net inflow · {e.data.joined.length} believers{live && !e.data.joined.includes(me) && <button className="btn sm" onClick={() => act('You believe', () => G.joinProphecy(s, me, c.id))}>Believe</button>}</>; }
          if (e.type === 'happyHour') body = <>{G.fmtTok(e.data.bonus || 0)} bonus tokens bought by the pot · vest 6h</>;
          if (e.type === 'slowBurn') body = <>1% of every trade burns</>;
          if (e.type === 'taxHoliday') body = <>0% fees</>;
          return (
            <div key={e.id} className={`fxcard t-${e.tier} ${live ? 'live' : 'soon'}`}>
              <div className="row-between"><b>{def.name}</b><span className="mono small">{live ? (s.now < e.endsAt ? `${dur(e.endsAt - s.now)} left` : 'locked') : `starts in ${dur(e.startsAt - s.now)}`}</span></div>
              <div className="small muted">by {e.caster}</div>
              <div className="small">{body}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RaidPanel({ s, r, me, act }: { s: G.State; r: G.Raid; me: string; act: Act }) {
  const [A, B] = r.sides.map(sd => s.coins[sd.coin]); const [amt, setAmt] = useState('25');
  const total = r.sides[0].score + r.sides[1].score || 1;
  const mySide = r.sides.findIndex(sd => (s.coins[sd.coin].holders[me]?.bal || 0) > 0);
  return (
    <section className={`panel raid ${r.mode}`}>
      <div className="row-between"><h2>⚔️ {r.mode === 'hard' ? 'HARD' : 'Friendly'} raid: ${A.ticker} vs ${B.ticker}</h2>
        <span className="mono small">{r.status === 'pending' ? `waiting for $${B.ticker} · ${dur(r.acceptBy - s.now)}` : r.status === 'active' ? `round ${r.round + 1}/4 · ${dur(r.startsAt + (r.round + 1) * 30 * MIN - s.now)}` : r.status === 'settling' ? 'paying spoils' : r.winner === null ? 'tie' : `$${s.coins[r.sides[r.winner].coin].ticker} won`}</span></div>
      <div className="raidbar"><i style={{ width: (100 * r.sides[0].score / total) + '%' }} /><span>{r.sides[0].score.toFixed(0)}</span><span>{r.sides[1].score.toFixed(0)}</span></div>
      <div className="small muted">Score each round = 100 × (1 + net NEAR in / coin size) × tactic. Tactics stay hidden until the round ends.</div>
      <div className="trow">
        {r.status === 'pending' && <button className="btn primary" onClick={() => act('Raid accepted', () => G.acceptRaid(s, me, r.id))}>Accept for ${B.ticker}</button>}
        {r.status === 'active' && mySide >= 0 && <>
          <input className="tiny" value={amt} onChange={e => setAmt(e.target.value)} />% of your ${s.coins[r.sides[mySide].coin].ticker}
          <button className="btn" onClick={() => act('Staked for the raid', () => G.stakeRaid(s, me, r.id, r.sides[mySide].coin, (s.coins[r.sides[mySide].coin].holders[me]?.bal || 0) * (parseFloat(amt) || 0) / 100))}>Stake</button>
          <span className="small muted">tactics this round: {r.sides.map((sd, i) => `$${s.coins[sd.coin].ticker} ${sd.tactics[r.round] ? (i === mySide ? CARDS[sd.tactics[r.round]!].name : 'played') : '—'}`).join(' · ')}</span>
        </>}
      </div>
      {r.log.length > 0 && <ul className="raidlog">{r.log.map((l, i) => <li key={i} className="small">{l}</li>)}</ul>}
    </section>
  );
}

function CardView({ n, onPlay, why, children }: { n: G.Nft; onPlay?: () => void; why?: string; children?: any }) {
  const def = CARDS[n.type as CardType];
  return (
    <div className={`card t-${n.tier} ${n.shiny ? 'shiny' : ''}`}>
      <div className="c-top"><span>{n.tier}{n.shiny ? ' ✦' : ''}</span><span>{def.kind}</span></div>
      <div className="c-name">{def.name}</div>
      <div className="c-text">{def.text}</div>
      <div className="c-foot">{children}
        {onPlay && <button className="btn sm primary" disabled={!!why} title={why} onClick={onPlay}>Play</button>}
        {why && <span className="why">{why}</span>}
        {!n.soulbound && <span className="muted small">tradeable</span>}
      </div>
    </div>
  );
}

function Hand({ s, c, me, act }: { s: G.State; c: G.Coin; me: string; act: Act }) {
  const [opt, setOpt] = useState<Record<string, any>>({});
  const cards = G.hand(s, c.id, me).sort((a, b) => TIERS.indexOf(b.tier!) - TIERS.indexOf(a.tier!));
  const targets = Object.values(s.coins).filter(x => x.id !== c.id);
  if (!cards.length) return <p className="muted">No ${c.ticker} cards yet. Hold through a level-up, check in for Card of the Day, survive Hold the Line, or sacrifice tokens.</p>;
  return (
    <div className="hand">
      {cards.map(n => {
        const t = n.type as CardType, o = { target: opt[n.id]?.target ?? targets[0]?.id, lock: opt[n.id]?.lock ?? HOUR, goal: opt[n.id]?.goal ?? Math.max(1, 0.05 * c.real) * 1.5, skin: opt[n.id]?.skin ?? 'neon' };
        const chk = G.castCheck(s, me, n.id, o); const set = (k: string, v: any) => setOpt({ ...opt, [n.id]: { ...o, [k]: v } });
        return (
          <CardView key={n.id} n={n} why={chk.ok ? undefined : chk.why} onPlay={() => act(`Played ${CARDS[t].name}${ANNOUNCE[CARDS[t].tier] ? ' (announced)' : ''}`, () => G.cast(s, me, n.id, o))}>
            {CARDS[t].kind === 'raid' && <select value={o.target} onChange={e => set('target', e.target.value)}>{targets.map(x => <option key={x.id} value={x.id}>${x.ticker} L{x.level}</option>)}</select>}
            {t === 'diamondPool' && <select value={o.lock} onChange={e => set('lock', +e.target.value)}>{[HOUR, 6 * HOUR, DAY].map(v => <option key={v} value={v}>lock {dur(v)}</option>)}</select>}
            {t === 'prophecy' && <label className="small">goal <input className="tiny" value={o.goal.toFixed(1)} onChange={e => set('goal', parseFloat(e.target.value) || 0)} /> N</label>}
            {t === 'rebrand' && <select value={o.skin} onChange={e => set('skin', e.target.value)}>{['neon', 'gold', 'void'].map(v => <option key={v}>{v}</option>)}</select>}
          </CardView>
        );
      })}
    </div>
  );
}

function Workshop({ s, c, me, act }: { s: G.State; c: G.Coin; me: string; act: Act }) {
  const [pct, setPct] = useState('0.3'); const [type, setType] = useState<CardType>('slowBurn'); const [pickd, setPick] = useState<string[]>([]); const [craftTo, setCraftTo] = useState<CardType>('slowBurn');
  const bal = c.holders[me]?.bal || 0, tokens = c.circ * (parseFloat(pct) || 0) / 100, tier = G.sacrificeTier(s, c, me, tokens);
  const hand = G.hand(s, c.id, me); const sameTier = pickd.length ? s.nfts[pickd[0]]?.tier : undefined;
  const nextTier: Tier | undefined = sameTier ? ({ Common: 'Rare', Rare: 'Epic', Epic: 'Mythic' } as any)[sameTier] : undefined;
  return (
    <details className="workshop">
      <summary>Workshop: sacrifice tokens or craft cards</summary>
      <div className="grid2">
        <div>
          <h3>Sacrifice</h3>
          <p className="small muted">Burn tokens for a card. Tier by share of supply: 0.05% Common · 0.2% Rare · 1% Epic (held 6h) · 3% Mythic (held 24h). You pick the card; luck only decides a 5% shiny.</p>
          <div className="trow"><input className="tiny" value={pct} onChange={e => setPct(e.target.value)} />% of supply = {G.fmtTok(tokens)} {tokens > bal && <span className="down small">(you have {G.fmtTok(bal)})</span>}</div>
          <div className="trow">
            <select value={type} onChange={e => setType(e.target.value as CardType)}>{Object.values(CARDS).filter(d => d.tier === tier).map(d => <option key={d.type} value={d.type}>{d.name}</option>)}</select>
            <button className="btn" disabled={!tier || CARDS[type]?.tier !== tier} onClick={() => act('Sacrificed', () => G.sacrifice(s, me, c.id, tokens, type))}>Burn for a {tier ?? '—'} card</button>
          </div>
        </div>
        <div>
          <h3>Craft</h3>
          <p className="small muted">3 cards of one tier make 1 of the next. The 3 burn.</p>
          <div className="pickrow">{hand.map(n => <label key={n.id} className={`pick t-${n.tier}`}><input type="checkbox" checked={pickd.includes(n.id)} onChange={e => setPick(e.target.checked ? [...pickd, n.id].slice(-3) : pickd.filter(x => x !== n.id))} />{CARDS[n.type as CardType].name}</label>)}</div>
          <div className="trow">
            <select value={craftTo} onChange={e => setCraftTo(e.target.value as CardType)}>{Object.values(CARDS).filter(d => d.tier === nextTier).map(d => <option key={d.type} value={d.type}>{d.name}</option>)}</select>
            <button className="btn" disabled={pickd.length !== 3 || CARDS[craftTo]?.tier !== nextTier} onClick={() => act('Crafted', () => { G.craft(s, me, pickd, craftTo); setPick([]); })}>Craft</button>
          </div>
        </div>
      </div>
    </details>
  );
}

function Collection({ s, me }: { s: G.State; me: string }) {
  const items = Object.values(s.nfts).filter(n => n.owner === me && n.kind !== 'card');
  return (
    <section className="collection">
      <h3>Your relics & badges</h3>
      {!items.length && <p className="muted small">None yet. Play cards, win raids, survive Hold the Line.</p>}
      <ul>{items.slice(-30).reverse().map(n => <li key={n.id} className="small"><span className={n.kind === 'badge' ? 'badge' : 'relic'}>{n.kind === 'badge' ? '🏅' : '🗿'}</span> {n.title} <span className="muted">${s.coins[n.coin]?.ticker}</span></li>)}</ul>
    </section>
  );
}

function Log({ s, c }: { s: G.State; c: G.Coin }) {
  const [trades, setTrades] = useState(false);
  const rows = useMemo(() => s.log.filter(l => (l.coin === c.id || l.coin === null) && (trades || (l.kind !== 'buy' && l.kind !== 'sell'))).slice(-60).reverse(), [s.log.length, c.id, trades]);
  return (
    <section className="panel">
      <div className="row-between"><h2>Activity</h2><label className="small"><input type="checkbox" checked={trades} onChange={e => setTrades(e.target.checked)} /> show trades</label></div>
      <ul className="log">{rows.map((l, i) => <li key={i}><span className="mono muted">{hhmm(l.t)}</span><span className={`k-${l.kind}`}>{l.text}</span></li>)}</ul>
    </section>
  );
}

function LaunchForm({ s, me, onClose, onDone, act }: { s: G.State; me: string; onClose: () => void; onDone: (id: string) => void; act: Act }) {
  const [name, setName] = useState(''); const [ticker, setTicker] = useState(''); const [fee, setFee] = useState(0.01); const [rules, setRules] = useState<RuleId[]>(['holdTheLine']); const [first, setFirst] = useState('0.5');
  const toggle = (r: RuleId) => setRules(rules.includes(r) ? rules.filter(x => x !== r) : rules.length < 3 ? [...rules, r] : rules);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Launch a coin" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel sheet">
        <h2>Launch a coin as {me}</h2>
        <label>Name <input value={name} onChange={e => setName(e.target.value)} placeholder="Laser Duck" /></label>
        <label>Ticker <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="LDUCK" /></label>
        <label>Fee <select value={fee} onChange={e => setFee(+e.target.value)}>{[0.01, 0.015, 0.02].map(f => <option key={f} value={f}>{f * 100}%</option>)}</select></label>
        <fieldset><legend>Rulebook (pick up to 3, locked forever)</legend>
          {(Object.keys(RULES) as RuleId[]).map(r => <label key={r} className="rulepick"><input type="checkbox" checked={rules.includes(r)} onChange={() => toggle(r)} /> <b>{RULES[r].name}</b> <span className="muted small">{RULES[r].text}</span></label>)}
        </fieldset>
        <label>Your first buy (max 1 NEAR) <input value={first} onChange={e => setFirst(e.target.value)} /></label>
        <p className="small muted">You start with 4 cards. You can't play cards in your coin's first hour, and you follow the same limits as everyone.</p>
        <div className="trow"><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => act('Launched!', () => { const c = G.launchCoin(s, me, { name, ticker, feeRate: fee, rules, firstBuy: parseFloat(first) || 0 }); onDone(c.id); })}>Launch</button></div>
      </div>
    </div>
  );
}
