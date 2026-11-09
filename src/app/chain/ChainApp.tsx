// On-chain mode: the same game, every action is a real transaction on the local NEAR sandbox.
import { useEffect, useRef, useState } from 'react';
import { CARDS, CardType, RULES, RuleId, LEVELS, LEVEL_NAMES, HOUR, MIN } from '../../engine/cards';
import { Chain, toNear, toTok, nearToYocto, fmtTok, TOKEN } from './near';

interface Effect { id: number; card: CardType; tier: string; caster: string; starts: number; ends: number; done: boolean; chunks: number; chunks_done: number; burned: string; lock_ms: number; total: string; forfeit: string; bonus: string; }
interface CoinV {
  id: number; name: string; ticker: string; creator: string; created: number; fee_bps: number; rules: RuleId[];
  price_yocto_per_token: string; real: string; circ: string; pot: string; prize_pot: string; burned: string; mcap_yocto: string;
  level: number; spark: number; ult: number; rare_free_at: number; in_eclipse: boolean; pulse_ppm: number;
  effects: Effect[]; htl: null | { start: number; end: number; dip_budget: string; dip_done: number; total_w: string }; last_htl: number;
  graduated: boolean; skin: string; solvent: boolean; now: number; level_pending: number | null;
  raid: number | null; banner_of: number | null; banner_until: number;
}
interface RaidSide { coin: number; total: string; score: string; tactics: (CardType | null)[]; mvp: string | null; }
interface Raid { id: number; hard: boolean; status: 'Pending' | 'Active' | 'Settling' | 'Done' | 'Expired'; caster: string; accept_by: number; starts: number; ends: number; round: number; sides: RaidSide[]; winner: number | null; spoils_chunks: number; raider_pool: string; log: string[]; }
interface Nft { id: string; kind: string; coin: number; owner: string; card: CardType | null; tier: string | null; shiny: boolean; title: string; soulbound: boolean; }
interface Holding { bal: string; acq: number; last_checkin: number; last_cast: number; locked_until: number; vest: [string, number][]; }

const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);
const dur = (ms: number) => { ms = Math.max(0, ms); const h = Math.floor(ms / HOUR), m = Math.floor((ms % HOUR) / MIN); return h ? `${h}h ${m}m` : `${m}m ${Math.floor((ms % MIN) / 1000)}s`; };
const short = (a: string) => a.replace(/\.test\.near$/, '');

export default function ChainApp() {
  const [ch, setCh] = useState<Chain | null>(null); const [err, setErr] = useState('');
  const [me, setMe] = useState('you'); const [coins, setCoins] = useState<CoinV[]>([]); const [sel, setSel] = useState<number | null>(null);
  const [mine, setMine] = useState<Mine>({ bal: 0, hold: null, nfts: [], claims: [[], false], stakes: {}, reg: null, round: null, checks: {}, raids: [] });
  const [busy, setBusy] = useState(''); const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const hist = useRef<Record<number, { t: number; p: number }[]>>({});
  const [launching, setLaunching] = useState(false);

  useEffect(() => { Chain.open().then(setCh).catch(e => setErr(e.message)); }, []);
  const coin = coins.find(c => c.id === sel) ?? coins[0];

  async function refresh(c = ch) {
    if (!c) return;
    const list: CoinV[] = await c.view('list_coins', {});
    setCoins(list);
    for (const k of list) { const h = (hist.current[k.id] ||= []); const p = toNear(k.mcap_yocto); if (!h.length || h[h.length - 1].t !== k.now) h.push({ t: k.now, p }); if (h.length > 2000) h.shift(); }
    const cur = list.find(x => x.id === sel) ?? list[0]; const acc = c.id(me);
    const [bal, nfts] = await Promise.all([c.balance(me), c.view<Nft[]>('nfts_for_owner', { account_id: acc })]);
    let hold = null, claims: [number[], boolean] = [[], false], stakes: Record<number, number> = {}, reg = null, round = null; const checks: Record<string, string | null> = {};
    const raids: { r: Raid; mine: number[] }[] = [];
    if (cur) {
      [hold, claims] = await Promise.all([c.view('get_holding', { coin_id: cur.id, account_id: acc }), c.view('claims_of', { coin_id: cur.id, account_id: acc })]);
      for (const e of cur.effects.filter(e => e.card === 'diamondPool' || e.card === 'blackHole')) stakes[e.id] = toTok(await c.view('get_stake', { coin_id: cur.id, fx_id: e.id, account_id: acc }));
      const start = cur.htl?.start ?? cur.last_htl;
      if (start) { reg = await c.view('get_htl_reg', { coin_id: cur.id, start, account_id: acc }); round = cur.htl ? null : await c.view('htl_round', { coin_id: cur.id, start }); }
      const target = list.find(x => x.id !== cur.id && x.level >= 2 && !x.raid)?.id ?? null;
      for (const n of nfts.filter(n => n.coin === cur.id && n.kind === 'card')) checks[n.id] = await c.view('cast_check', { account_id: acc, card_id: n.id, target: n.card === 'friendlyRaid' || n.card === 'hardRaid' ? target : null });
      // raids this coin took part in (the contract keeps them for claims)
      for (let id = 1; id <= 40; id++) { const r: Raid | null = await c.view('get_raid', { raid_id: id }); if (!r) break; if (r.sides.some(s => s.coin === cur.id) && r.status !== 'Expired') { const m = [toTok(await c.view('get_raid_stake', { raid_id: id, side: 0, account_id: acc })), toTok(await c.view('get_raid_stake', { raid_id: id, side: 1, account_id: acc }))]; raids.push({ r, mine: m }); } }
    }
    setMine({ bal, hold, nfts, claims, stakes, reg, round, checks, raids: raids.filter(x => x.r.status !== 'Done' || x.mine[0] + x.mine[1] > 0).slice(-3) });
  }
  useEffect(() => { if (!ch) return; refresh(); const t = setInterval(() => refresh().catch(() => {}), 2500); return () => clearInterval(t); }, [ch, me, sel]);

  async function act(label: string, f: () => Promise<unknown>) {
    setBusy(label);
    try { await f(); setToast({ ok: true, text: label }); } catch (e: any) { setToast({ ok: false, text: e.message }); }
    setBusy(''); refresh(); setTimeout(() => setToast(null), 4000);
  }

  if (err) return <div className="panel" style={{ margin: 16 }}><h2>Sandbox not ready</h2><p>{err}</p><pre className="mono small">./sandbox/start.sh{'\n'}node sandbox/deploy.mjs</pre></div>;
  if (!ch) return <div className="panel" style={{ margin: 16 }}>Connecting to the local NEAR sandbox…</div>;
  const now = coin?.now ?? Date.now();

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="logo">RULECARD</span><span className="tag">NEAR sandbox · {ch.keys.contractId}</span></div>
        <div className="clock">
          <span className="mono big">{coin ? hhmm(now) : '--:--'} UTC</span>
          <button className="btn ghost" disabled={!!busy} onClick={() => act('+15 min of blocks', () => ch.fastForward(15, me))}>+15m</button>
          <button className="btn ghost" disabled={!!busy} onClick={() => act('+1h of blocks', () => ch.fastForward(60, me))}>+1h</button>
          {coin && <button className="btn ghost" disabled={!!busy} onClick={() => act('Cranked', () => ch.call(me, 'crank', { coin_id: coin.id }))}>Crank</button>}
          {busy && <span className="small muted">⏳ {busy}…</span>}
        </div>
        <div className="who">
          <select value={me} onChange={e => setMe(e.target.value)} aria-label="Player">{ch.players().map(p => <option key={p}>{p}</option>)}</select>
          <span className="mono">{mine.bal.toFixed(2)} NEAR</span>
        </div>
      </header>
      <div className="layout">
        <aside className="side">
          <button className="btn primary wide" onClick={() => setLaunching(true)}>+ Launch a coin</button>
          <nav className="coins" aria-label="Coins"><h3>On-chain coins</h3>
            {!coins.length && <p className="muted small">No coins yet. Launch one, or run the bots: node sandbox/bots.mjs</p>}
            {coins.map(c => <button key={c.id} className={`coinrow ${c.id === coin?.id ? 'on' : ''}`} onClick={() => setSel(c.id)}>
              <span className="lvl">L{c.level}</span><span className="cr-main"><b>${c.ticker}</b>{c.htl && <span className="htlmini">HOLD</span>}<span className="muted small">{toNear(c.mcap_yocto).toFixed(1)} N mcap</span></span><span />
            </button>)}
          </nav>
          <section className="collection"><h3>Your relics & badges</h3>
            <ul>{mine.nfts.filter(n => n.kind !== 'card').map(n => <li key={n.id} className="small">{n.kind === 'badge' ? '🏅' : '🗿'} {n.title}</li>)}</ul>
          </section>
        </aside>
        {coin ? <Coin ch={ch} c={coin} coins={coins} me={me} mine={mine} hist={hist.current[coin.id] || []} act={act} busy={!!busy} /> : <main className="main" />}
      </div>
      {launching && <Launch onClose={() => setLaunching(false)} onLaunch={(name, ticker, fee, rules, first) => act('Launched', async () => { const id = await ch.call(me, 'launch_coin', { name, ticker, fee_bps: fee, rules }, nearToYocto(first)); setSel(id); setLaunching(false); })} />}
      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`} role="status">{toast.text}</div>}
    </div>
  );
}

type Act = (l: string, f: () => Promise<unknown>) => void;
interface Mine { bal: number; hold: Holding | null; nfts: Nft[]; claims: [number[], boolean]; stakes: Record<number, number>; reg: any; round: any; checks: Record<string, string | null>; raids: { r: Raid; mine: number[] }[]; }
function Coin({ ch, c, coins, me, mine, hist, act, busy }: { ch: Chain; c: CoinV; coins: CoinV[]; me: string; mine: Mine; hist: { t: number; p: number }[]; act: Act; busy: boolean }) {
  const [amt, setAmt] = useState('1'); const [pct, setPct] = useState('25'); const [opt, setOpt] = useState<Record<string, any>>({});
  const bal = mine.hold ? toTok(mine.hold.bal) : 0; const now = c.now; const part = BigInt(Math.floor(bal * (parseFloat(pct) || 0) / 100 * 1000)) * (TOKEN / 1000n);
  const cards: Nft[] = mine.nfts.filter((n: Nft) => n.coin === c.id && n.kind === 'card');
  const sellPart = (f: number) => (BigInt(mine.hold?.bal ?? '0') * BigInt(Math.round(f * 100))) / 100n;
  return (
    <main className="main">
      {c.banner_of && <div className="banner takeover">🏴 Conquered by ${coins.find(x => x.id === c.banner_of)?.ticker} for {dur(c.banner_until - now)}</div>}
      {mine.raids.map(x => <RaidPanel key={x.r.id} ch={ch} r={x.r} mine={x.mine} coins={coins} c={c} me={me} act={act} busy={busy} now={now} hold={bal} />)}
      {c.htl && <div className="banner htl"><div><b>HOLD THE LINE</b> · {dur(c.htl.end - now)} left · prize {toNear(c.prize_pot).toFixed(3)} N + 20% of pot · dip buys {c.htl.dip_done}/36</div>
        <div className="small">{mine.reg ? (mine.reg.out ? 'You sold below your shield. You are out.' : 'Shield up. Don\'t sell and claim your share when it ends.') : 'Held 1h before the drop? Raise your shield to join the prize.'}
          {!mine.reg && <button className="btn sm primary" disabled={busy} onClick={() => act('Shield raised', () => ch.call(me, 'htl_register', { coin_id: c.id }))}>Raise shield</button>}</div></div>}
      {!c.htl && c.last_htl > 0 && mine.reg && !mine.reg.out && <div className="banner takeover">You survived Hold the Line. Pool {mine.round ? toNear(mine.round.pool).toFixed(3) : '?'} N <button className="btn sm primary" disabled={busy} onClick={() => act('Prize claimed', () => ch.call(me, 'htl_claim', { coin_id: c.id, start: c.last_htl }))}>Claim prize</button></div>}

      <section className="coinhead panel" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <div className="ch-text"><h1>${c.ticker} <span className="muted">{c.name}</span></h1>
          <div className="chips">{c.rules.map(r => <span key={r} className="chip rule" title={RULES[r].text}>{RULES[r].name}</span>)}<span className="chip">fee {c.fee_bps / 100}%</span><span className="chip">by {short(c.creator)}</span><span className={`chip ${c.solvent ? '' : 'gold'}`}>{c.solvent ? 'solvent ✓' : 'INSOLVENT'}</span>{c.skin !== 'classic' && <span className="chip gold">skin: {c.skin}</span>}</div></div>
        <div className="stats">
          <S l="Market cap" v={`${toNear(c.mcap_yocto).toFixed(2)} N`} /><S l="Real NEAR" v={toNear(c.real).toFixed(3)} /><S l="Pot" v={toNear(c.pot).toFixed(3)} />
          <S l="Burned" v={fmtTok(toTok(c.burned))} /><S l="Circulating" v={fmtTok(toTok(c.circ))} /><S l="Pulse" v={`${(c.pulse_ppm / 1e4).toFixed(0)}%`} />
        </div>
      </section>

      <div className="grid2">
        <section className="panel"><Spark hist={hist} />
          <div className="levels">{LEVELS.map((n, i) => { const lv = i + 1, done = c.level >= lv, next = c.level + 1 === lv; return (
            <div key={lv} className={`lv ${done ? 'done' : ''}`}><div className="lv-bar"><i style={{ width: (done ? 100 : next ? Math.min(100, toNear(c.real) / n * 100) : 0) + '%' }} /></div>
              <b>L{lv} {LEVEL_NAMES[i]}</b><span className="muted small">{n}N</span>{next && c.level_pending && <span className="small up">holding {dur(now - c.level_pending)}/15m</span>}
              {done && lv >= 2 && mine.hold && !mine.claims[0].includes(lv) && <button className="btn sm" disabled={busy} onClick={() => act(`L${lv} drop claimed`, () => ch.call(me, 'claim_level_drop', { coin_id: c.id, level: lv }))}>claim drop</button>}
            </div>); })}</div>
        </section>
        <section className="panel">
          <div className="meters">
            <M label="Spark" v={c.spark} max={30} cls="spark" /><M label="Ult" v={c.ult} max={100} cls="ult" />
            <div className="mrow"><span>Rare slot</span><b className="mono">{now >= c.rare_free_at ? 'ready' : dur(c.rare_free_at - now)}</b></div>
            <div className="mrow"><span>Eclipse</span><b className={`mono ${c.in_eclipse ? 'gold' : ''}`}>{c.in_eclipse ? 'OPEN' : 'closed'}</b></div>
          </div>
          <div className="trade"><h3>Trade (real transactions)</h3>
            <div className="trow"><input aria-label="NEAR to spend" value={amt} onChange={e => setAmt(e.target.value)} /><span className="muted">NEAR</span>
              <button className="btn buy" disabled={busy} onClick={() => act('Bought', async () => { const q = await ch.view('quote_buy', { coin_id: c.id, near: nearToYocto(parseFloat(amt) || 0).toString() }); await ch.call(me, 'buy', { coin_id: c.id, min_tokens: (BigInt(q) * 98n / 100n).toString() }, nearToYocto(parseFloat(amt) || 0)); })}>Buy</button></div>
            <div className="trow">{[0.25, 0.5, 1].map(f => <button key={f} className="btn sell" disabled={busy || !bal} onClick={() => act('Sold', () => ch.call(me, 'sell', { coin_id: c.id, tokens: sellPart(f).toString(), min_near: '0' }))}>Sell {f * 100}%</button>)}</div>
            <div className="trow">
              <button className="btn" disabled={busy} onClick={() => act('Checked in', () => ch.call(me, 'check_in', { coin_id: c.id }))}>✓ Check in</button>
              <button className="btn" disabled={busy || mine.claims[1]} onClick={() => act('Card of the Day', () => ch.call(me, 'claim_card_of_day', { coin_id: c.id }))}>🎴 Card of the Day{mine.claims[1] ? ' ✓' : ''}</button>
            </div>
            <p className="muted small">You hold {fmtTok(bal)}{mine.hold?.vest?.length ? ` + ${fmtTok(mine.hold.vest.reduce((x: number, v: [string, number]) => x + toTok(v[0]), 0))} vesting` : ''}{mine.hold && now < mine.hold.locked_until ? ` · locked ${dur(mine.hold.locked_until - now)}` : ''}</p>
          </div>
        </section>
      </div>

      {c.effects.some(e => !e.done) && <section className="panel">
        <div className="row-between"><h2>On the table</h2><label className="small muted">stake <input className="tiny" value={pct} onChange={e => setPct(e.target.value)} />% of your bag</label></div>
        <div className="fx">{c.effects.filter(e => !e.done || e.card === 'diamondPool').map(e => { const live = now >= e.starts; const st = mine.stakes[e.id] || 0; const unlock = e.ends + e.lock_ms; return (
          <div key={e.id} className={`fxcard t-${e.tier} ${live ? 'live' : 'soon'}`}>
            <div className="row-between"><b>{CARDS[e.card].name}</b><span className="mono small">{!live ? `starts in ${dur(e.starts - now)}` : now < e.ends ? `${dur(e.ends - now)} left` : e.card === 'diamondPool' && now < unlock ? `unlocks in ${dur(unlock - now)}` : 'ended'}</span></div>
            <div className="small muted">by {short(e.caster)}</div>
            <div className="small">
              {e.chunks > 0 && <>{e.chunks_done}/{e.chunks} chunks · {fmtTok(toTok(e.burned))} burned</>}
              {e.card === 'happyHour' && <>{fmtTok(toTok(e.bonus))} bonus bought by the pot</>}
              {e.card === 'blackHole' && <>{fmtTok(toTok(e.total))} in the pit{live && now < e.ends && <button className="btn sm" disabled={busy} onClick={() => act('Fed the Black Hole', () => ch.call(me, 'feed_black_hole', { coin_id: c.id, fx_id: e.id, amount: part.toString() }))}>Throw in</button>}</>}
              {e.card === 'diamondPool' && <>{fmtTok(toTok(e.total))} locked · you {fmtTok(st)}
                {live && now < e.ends && <button className="btn sm" disabled={busy} onClick={() => act('Joined the pool', () => ch.call(me, 'join_diamond', { coin_id: c.id, fx_id: e.id, amount: part.toString() }))}>Join</button>}
                {st > 0 && now < unlock && <button className="btn sm sell" disabled={busy} onClick={() => act('Left early', () => ch.call(me, 'leave_diamond', { coin_id: c.id, fx_id: e.id }))}>Leave (-20%)</button>}
                {st > 0 && now >= unlock && <button className="btn sm primary" disabled={busy} onClick={() => act('Claimed', () => ch.call(me, 'claim_diamond', { coin_id: c.id, fx_id: e.id }))}>Claim</button>}</>}
            </div>
          </div>); })}</div>
      </section>}

      <section className="panel"><h2>Your hand <span className="muted small">({cards.length}/7) · ${c.ticker} cards, real NFTs</span></h2>
        {!cards.length && <p className="muted">No cards for this coin yet.</p>}
        <div className="hand">{cards.map(n => { const t = n.card!; const why = mine.checks[n.id]; const o = opt[n.id] || {}; return (
          <div key={n.id} className={`card t-${n.tier} ${n.shiny ? 'shiny' : ''}`}>
            <div className="c-top"><span>{n.tier}{n.shiny ? ' ✦' : ''}</span><span>#{n.id}</span></div>
            <div className="c-name">{CARDS[t].name}</div><div className="c-text">{CARDS[t].text}</div>
            <div className="c-foot">
              {t === 'diamondPool' && <select value={o.lock ?? 1} onChange={e => setOpt({ ...opt, [n.id]: { ...o, lock: +e.target.value } })}>{[1, 6, 24].map(h => <option key={h} value={h}>lock {h}h</option>)}</select>}
              {(t === 'friendlyRaid' || t === 'hardRaid') && <select value={o.target ?? ''} onChange={e => setOpt({ ...opt, [n.id]: { ...o, target: +e.target.value } })}><option value="">target…</option>{coins.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.id}>${x.ticker} L{x.level}</option>)}</select>}
              {t === 'rebrand' && <select value={o.skin ?? 'neon'} onChange={e => setOpt({ ...opt, [n.id]: { ...o, skin: e.target.value } })}>{['neon', 'gold', 'void'].map(s => <option key={s}>{s}</option>)}</select>}
              <button className="btn sm primary" disabled={busy || !!why} title={why ?? ''} onClick={() => act(`Played ${CARDS[t].name}`, () => ch.call(me, 'cast', { card_id: n.id, lock_hours: t === 'diamondPool' ? (o.lock ?? 1) : null, skin: t === 'rebrand' ? (o.skin ?? 'neon') : null, target: t === 'friendlyRaid' || t === 'hardRaid' ? (o.target ?? coins.find(x => x.id !== c.id && x.level >= 2 && !x.raid)?.id ?? null) : null }))}>Play</button>
              {why && <span className="why">{why}</span>}
            </div>
          </div>); })}</div>
      </section>
    </main>
  );
}

function RaidPanel({ ch, r, mine, coins, c, me, act, busy, now, hold }: { ch: Chain; r: Raid; mine: number[]; coins: CoinV[]; c: CoinV; me: string; act: Act; busy: boolean; now: number; hold: number }) {
  const [pct, setPct] = useState('25');
  const tk = (i: number) => coins.find(x => x.id === r.sides[i].coin)?.ticker ?? '?';
  const sc = r.sides.map(s => Number(BigInt(s.score) / 10000n) / 100); const tot = sc[0] + sc[1] || 1;
  const side = r.sides.findIndex(s => s.coin === c.id);
  const status = r.status === 'Pending' ? `waiting for $${tk(1)} · ${dur(r.accept_by - now)}` : r.status === 'Active' ? `round ${Math.min(4, r.round + 1)}/4 · ends in ${dur(r.ends - now)}` : r.status === 'Settling' ? `paying spoils (${12 - r.spoils_chunks}/12)` : r.winner === null ? 'tie' : `$${tk(r.winner)} won`;
  const amount = BigInt(Math.floor(hold * (parseFloat(pct) || 0) / 100 * 1000)) * (TOKEN / 1000n);
  return (
    <section className={`panel raid ${r.hard ? 'hard' : 'friendly'}`}>
      <div className="row-between"><h2>⚔️ {r.hard ? 'HARD' : 'Friendly'} raid #{r.id}: ${tk(0)} vs ${tk(1)}</h2><span className="mono small">{status}</span></div>
      <div className="raidbar"><i style={{ width: (100 * sc[0] / tot) + '%' }} /><span>{sc[0].toFixed(1)}</span><span>{sc[1].toFixed(1)}</span></div>
      <div className="small muted">Staked: ${tk(0)} {fmtTok(toTok(r.sides[0].total))} · ${tk(1)} {fmtTok(toTok(r.sides[1].total))}{mine[0] + mine[1] > 0 ? ` · yours ${fmtTok(mine[0] + mine[1])}` : ''}. Tactics stay hidden until the round ends; play Rally / Curse / Ward / Mirror from your hand.</div>
      <div className="trow">
        {r.status === 'Pending' && side === 1 && <button className="btn primary" disabled={busy} onClick={() => act('Raid accepted', () => ch.call(me, 'raid_accept', { raid_id: r.id }))}>Accept for ${tk(1)}</button>}
        {r.status === 'Active' && <><input className="tiny" value={pct} onChange={e => setPct(e.target.value)} aria-label="Percent to stake" />% of your ${c.ticker}
          <button className="btn" disabled={busy || !hold} onClick={() => act('Staked for the raid', () => ch.call(me, 'raid_stake', { raid_id: r.id, coin_id: c.id, amount: amount.toString() }))}>Stake</button></>}
        {r.status === 'Done' && mine[0] + mine[1] > 0 && <button className="btn primary" disabled={busy} onClick={() => act('Raid payout claimed', () => ch.call(me, 'raid_claim', { raid_id: r.id }))}>Claim payout</button>}
        {(r.status === 'Active' || r.status === 'Settling') && <button className="btn ghost" disabled={busy} onClick={() => act('Raid advanced', () => ch.call(me, 'crank', { coin_id: c.id }))}>Advance</button>}
      </div>
      <ul className="raidlog">{r.log.map((l, i) => <li key={i} className="small">{l}</li>)}</ul>
    </section>
  );
}

const S = ({ l, v }: { l: string; v: string }) => <div className="stat"><div className="l">{l}</div><div className="v mono">{v}</div></div>;
const M = ({ label, v, max, cls }: { label: string; v: number; max: number; cls: string }) => <div className="meter"><div className="mrow"><span>{label}</span><b className="mono">{v}/{max}</b></div><div className={`mbar ${cls}`}><i style={{ width: (100 * v / max) + '%' }} /></div></div>;

function Spark({ hist }: { hist: { t: number; p: number }[] }) {
  if (hist.length < 2) return <p className="muted small">Market cap chart fills in as blocks come in.</p>;
  const W = 560, H = 160, t0 = hist[0].t, t1 = hist[hist.length - 1].t || t0 + 1, ps = hist.map(h => h.p), lo = Math.min(...ps) * 0.97, hi = Math.max(...ps) * 1.03;
  const d = hist.map((h, i) => `${i ? 'L' : 'M'}${((h.t - t0) / (t1 - t0 || 1) * W).toFixed(1)},${(H - (h.p - lo) / (hi - lo || 1) * H).toFixed(1)}`).join(' ');
  const up = ps[ps.length - 1] >= ps[0];
  return <div><h3>Market cap <span className="mono">{ps[ps.length - 1].toFixed(2)} N</span></h3><svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Market cap chart"><path d={d} className={up ? 'line up' : 'line down'} /></svg></div>;
}

function Launch({ onClose, onLaunch }: { onClose: () => void; onLaunch: (n: string, t: string, fee: number, rules: RuleId[], first: number) => void }) {
  const [name, setName] = useState(''); const [ticker, setTicker] = useState(''); const [fee, setFee] = useState(100); const [rules, setRules] = useState<RuleId[]>(['holdTheLine']); const [first, setFirst] = useState('0.5');
  const toggle = (r: RuleId) => setRules(rules.includes(r) ? rules.filter(x => x !== r) : rules.length < 3 ? [...rules, r] : rules);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Launch a coin" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel sheet"><h2>Launch on-chain</h2>
        <label>Name <input value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Ticker <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} /></label>
        <label>Fee <select value={fee} onChange={e => setFee(+e.target.value)}>{[100, 150, 200].map(f => <option key={f} value={f}>{f / 100}%</option>)}</select></label>
        <fieldset><legend>Rulebook (max 3)</legend>{(Object.keys(RULES) as RuleId[]).map(r => <label key={r} className="rulepick"><input type="checkbox" checked={rules.includes(r)} onChange={() => toggle(r)} /> <b>{RULES[r].name}</b> <span className="muted small">{RULES[r].text}</span></label>)}</fieldset>
        <label>First buy (attached, max 1 NEAR) <input value={first} onChange={e => setFirst(e.target.value)} /></label>
        <div className="trow"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onLaunch(name, ticker, fee, rules, parseFloat(first) || 0)}>Launch</button></div>
      </div>
    </div>
  );
}
