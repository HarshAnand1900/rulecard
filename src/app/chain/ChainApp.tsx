// Rulecard app: Discover, Launch and the coin page. Every action is a real transaction (local sandbox in dev).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toNear, toTok, nearToYocto, tokToUnits, fmtTok, fmtNear } from './near';
import Ticker from './Ticker';
import { InfoDot, CardInfo, OmenInfo } from './Info';
import { openNet, savedDoor, saveDoor, needsDoor, type Net, type Door } from './net';
import Landing from './Landing';
import Onboard from './Onboard';
import Guide, { guideWarVisited, markWarVisited } from './Guide';
import { play, sfxForCall, isMuted, setMuted, onMuteChange, getVolume, setVolume, SFX_LIST } from './sound';
import type {
  CoinEntry, CoinView, HolderView, Ritual, LevelView, LogEntry, HandView, Proposal, RaidView, Card, Question, BuyQuote, OmenView, Duel, Bounty,
} from './types';
import { TIER_OF, TIER_NAME, CARD_TEXT, CARD_SYMBOL, RULE_TEXT, LEVEL_NAME } from './types';
import PriceChart, { type PricePoint, toMicro } from './PriceChart';
import Proof from './Proof';
import WarMap from './WarMap';
import Profile from './Profile';
import Docs from './Docs';
import Launch from './Launch';
import CardPlay from './CardPlay';

const MIN = 60_000, HOUR = 60 * MIN;
const dur = (ms: number) => { ms = Math.max(0, ms); const d = Math.floor(ms / (24 * HOUR)), h = Math.floor((ms % (24 * HOUR)) / HOUR), m = Math.floor((ms % HOUR) / MIN); const sec = Math.floor((ms % MIN) / 1000); return d ? `${d}d ${h}h` : h ? (m ? `${h}h ${m}m` : `${h}h`) : sec ? `${m}m ${sec}s` : `${m}m`; };
// Demo scale: game NEAR ÷100 and time ÷12. Labels that state a rule use these so they match the contract.
let NS = 1, TS = 1;
const nearAmt = (x: number) => fmtNear(x / NS);
const hrs = (h: number) => dur((h * HOUR) / TS);
const shortAcct = (a: string) => (/^[0-9a-f]{64}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const short = (a: string) => (/^bot\d+\./.test(a) ? '🤖 ' + a.split('.')[0] : a.replace(/\.test\.near$/, '').replace(/\.rulecard$/, ''));
const pct = (a: number, b: number) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);
const TACTIC = ['', 'Rally', 'Curse', 'Ward', 'Mirror', 'Counterspell', 'Decoy'];
const TACTIC_CARDS: Card[] = ['Rally', 'Curse', 'Ward', 'Mirror', 'Counterspell', 'Decoy'];
const SIGNED: Card[] = ['Inferno', 'BlackHole', 'Harvest', 'WhaleTax', 'Alliance', 'Supernova'];
const tacticName = (code: number) => (code ? `${TACTIC[Math.floor(code / 10)]} ×${['1', '2', '3'][code % 10]}` : '—');

type Page = { kind: 'discover' } | { kind: 'profile' } | { kind: 'docs' } | { kind: 'launch' } | { kind: 'proof' } | { kind: 'war' } | { kind: 'coin'; id: string };
type Tab = 'trade' | 'today' | 'cards' | 'vault' | 'raid' | 'log';

export default function ChainApp() {
  const [door, setDoor] = useState<Door | null>(savedDoor());
  const askDoor = needsDoor() && !door;
  const [ch, setCh] = useState<Net | null>(null);
  const [err, setErr] = useState('');
  const [me, setMe] = useState('you');
  const [page, setPage] = useState<Page>({ kind: 'discover' });
  const [coins, setCoins] = useState<CoinEntry[]>([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [bal, setBal] = useState(0);
  const [listErr, setListErr] = useState('');
  const [ready, setReady] = useState(false); // practice mode: the wallet exists and holds its first bag
  const [modal, setModal] = useState<'ways' | 'key' | null>(null);
  const [muted, setMutedState] = useState(isMuted());

  useEffect(() => onMuteChange(() => setMutedState(isMuted())), []);
  useEffect(() => {
    if (askDoor) return;
    openNet(door).then(n => { n.onChange?.(() => setMe(n.me() ?? '')); setMe(n.me() ?? ''); setReady(n.mode !== 'practice' || !!n.me()); setCh(n); }).catch(e => setErr(e.message));
  }, [door, askDoor]);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => { if (!ch) return; ch.view<CoinEntry[]>(ch.factoryId, 'list_coins', {}).then(c => { setCoins(c); setListErr(''); }).catch(e => setListErr(`Can't read the factory ${ch.factoryId}: ${e.message}`)); ch.balance().then(setBal); }, [ch, tick, me]);
  useEffect(() => { const i = setInterval(refresh, ch && ch.mode !== 'sandbox' ? 10_000 : 5000); return () => clearInterval(i); }, [refresh, ch]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (page.kind === 'war' && me) markWarVisited(me); }, [page.kind, me]);
  const switchDoor = (d: Door | null) => { saveDoor(d); location.reload(); };

  const act = useCallback(async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try { await fn(); setToast({ ok: true, text: done ?? `${label}: done` }); }
    catch (e: any) { play('error'); setToast({ ok: false, text: `${label}: ${e.message}` }); }
    finally { setBusy(''); refresh(); }
  }, [refresh]);

  if (askDoor) return <Landing onPick={d => { saveDoor(d); setDoor(d); }} />;
  if (err) return <div className="panel" style={{ margin: 16 }}><h2>Can't reach the chain</h2><p>{err}</p>{needsDoor() && <button className="btn" onClick={() => switchDoor(door === 'practice' ? 'wallet' : 'practice')}>{door === 'practice' ? 'Use my own wallet instead' : 'Try practice mode instead'}</button>}</div>;
  if (ch) { NS = ch.scale === 'demo' ? 100 : 1; TS = ch.scale === 'demo' ? 12 : 1; }
  if (!ch) return <div className="panel" style={{ margin: 16 }}>Connecting…</div>;
  const ctx = { ch, me, act, busy, tick, coins, go: setPage };
  // the guide lives on coin pages: from anywhere else, open the first coin and then show it
  const openGuide = () => { if (page.kind !== 'coin' && coins.length) { setPage({ kind: 'coin', id: coins[0].account_id }); setTimeout(() => window.dispatchEvent(new Event('rulecard-guide-open')), 1500); } else window.dispatchEvent(new Event('rulecard-guide-open')); };
  const practice = ch.mode === 'practice';

  return (
    <>
      <header className="top">
        <div className="tb-left">
          <button className="logo linkish" onClick={() => setPage({ kind: 'discover' })}>RULECARD</button>
          {me ? <button className={`profchip ${page.kind === 'profile' ? 'on' : ''}`} onClick={() => setPage({ kind: 'profile' })} title={`${me} · open your profile`} aria-label="Open your profile">
            <span className="pc-av" aria-hidden="true">{me.slice(0, 2).toUpperCase()}</span>
            <span className="pc-text"><b className="mono">{shortAcct(me)}</b><small className="mono">{fmtNear(bal)} NEAR · {practice ? 'Practice' : ch.mode === 'sandbox' ? 'Sandbox' : 'Wallet'}</small></span>
          </button> : <button className="btn primary" onClick={() => ch.signIn?.()}>Connect wallet</button>}
          {ch.players && <label className="small muted">As <select value={ch.player} onChange={e => { ch.setPlayer!(e.target.value); setMe(ch.me() ?? ''); }}>{ch.players().map(pl => <option key={pl} value={pl}>{pl}</option>)}</select></label>}
        </div>
        <nav className="seg tb-nav" aria-label="Pages">
          <button aria-pressed={page.kind === 'discover'} onClick={() => setPage({ kind: 'discover' })}>Discover</button>
          <button aria-pressed={page.kind === 'war'} onClick={() => setPage({ kind: 'war' })}>War Map</button>
          <button aria-pressed={page.kind === 'proof'} onClick={() => setPage({ kind: 'proof' })}>Judges</button>
          <button aria-pressed={page.kind === 'docs'} onClick={() => setPage({ kind: 'docs' })}>Docs</button>
        </nav>
        <div className="tb-right">
        {ch.scales.length > 1 && <div className="seg scale" role="group" aria-label="Game scale">
          {ch.scales.map(sc => <button key={sc} aria-pressed={ch.scale === sc} title={sc === 'demo' ? 'NEAR amounts ÷100, time 12× faster: a whole game in minutes' : 'Full-size numbers, real time'} onClick={() => { ch.setScale(sc); setCoins([]); setPage({ kind: 'discover' }); refresh(); }}>{sc === 'demo' ? 'Demo' : 'Real'}</button>)}
        </div>}
          <button className={`plusbtn ${page.kind === 'launch' ? 'on' : ''}`} aria-label="Launch a coin" title="Launch a coin" onClick={() => setPage({ kind: 'launch' })}><span aria-hidden="true">+</span></button>
          <button className="iconbtn" aria-label="Show the guide" title="Show the guide" onClick={openGuide}>?</button>
          <details className="menu"><summary className="btn small ghost" aria-label="Sound settings" title={muted ? 'Sound is off' : 'Sound is on'}>{muted ? '🔇' : '🔊'}</summary><div className="menu-body" style={{ minWidth: 250 }}>
            <button onClick={() => setMuted(!muted)}>{muted ? 'Turn sound on' : 'Mute all sound'}</button>
            <label className="small" style={{ padding: '4px 10px', display: 'block' }}>Volume <input type="range" min="0.05" max="1" step="0.05" defaultValue={getVolume()} onChange={e => setVolume(Number(e.target.value))} onPointerUp={() => play('gm')} /></label>
            <div className="small muted" style={{ padding: '4px 10px' }}>Tap to hear each one</div>
            {SFX_LIST.map(x => <button key={x.id} onClick={() => play(x.id)}><strong>{x.label}</strong> <span className="small muted">· {x.when}</span></button>)}
          </div></details>
          {needsDoor() && <details className="menu"><summary className="btn small ghost">{practice ? 'Practice' : 'Wallet'} ▾</summary><div className="menu-body">
            <button onClick={() => setModal('ways')}>Two ways in: what is the difference?</button>
            {practice ? <>
              <button onClick={() => switchDoor('wallet')}>Switch to my own wallet</button>
              <button onClick={() => setModal('key')}>Back up my practice key</button>
              <button onClick={() => { if (confirm('Start over with a brand-new practice wallet? The current one is forgotten.')) { ch.resetWallet!(); location.reload(); } }}>Start over with a new wallet</button>
            </> : <button onClick={() => switchDoor('practice')}>Switch to practice (free, no wallet)</button>}
          </div></details>}
          {ch.fastForward && <span className="seg small" role="group" aria-label="Move sandbox time">
            {[[15, '+15m'], [60, '+1h'], [360, '+6h'], [1440, '+1d']].map(([m, l]) => (
              <button key={l} disabled={!!busy} onClick={() => act(`Time ${l}`, () => ch.fastForward!(m as number, coins.map(c => c.account_id)), `Moved the chain clock ${l}`)}>{l}</button>
            ))}
          </span>}
        </div>
      </header>
      {(!practice || ready) && <Ticker ch={ch} coins={coins} tick={tick} go={id => setPage({ kind: 'coin', id })} />}
      {practice && !ready && coins.length > 0 && <Onboard ch={ch} coins={coins} onDone={id => { setMe(ch.me() ?? ''); setReady(true); setPage({ kind: 'coin', id }); refresh(); }} onUseWallet={() => switchDoor('wallet')} />}
      {practice && !ready && coins.length === 0 && !listErr && <div className="onboard"><div className="onboard-card">Looking for coins…</div></div>}
      {modal && <div className="onboard" onClick={() => setModal(null)}><div className="onboard-card" onClick={e => e.stopPropagation()}>
        {modal === 'ways' && <>
          <h2 className="onboard-title">TWO WAYS IN, ONE GAME</h2>
          <div className="way"><strong>PRACTICE</strong><span>Free. A practice wallet is made for you in this browser and sent a little testnet NEAR. Coins have no value. No popups.</span></div>
          <div className="way"><strong>MY OWN WALLET</strong><span>Your own NEAR testnet account (MyNearWallet or Meteor). Same coins, same rules.</span></div>
          <p className="small muted">Both run on NEAR testnet with real transactions. Neither uses real money.</p>
        </>}
        {modal === 'key' && <>
          <h2 className="onboard-title">BACK UP YOUR PRACTICE KEY</h2>
          <p className="small">This key is your practice wallet. It only lives in this browser: clear your browser data and it is gone. Anyone who has it can use this wallet, so do not share it. It has no value beyond this practice game.</p>
          <textarea readOnly className="keybox" value={ch.exportKey?.() ?? ''} onFocus={e => e.currentTarget.select()} />
        </>}
        <button className="btn" onClick={() => setModal(null)}>Close</button>
      </div></div>}
      {busy && <div className="busy" role="status">⏳ {busy}…</div>}
      {toast && <div className={`toast ${toast.ok ? 'ok' : 'bad'}`} role="status">{toast.text}</div>}
      <main className="page" key={page.kind === 'coin' ? page.id : page.kind}>
        {ch.scale === 'demo' && !practice && <div className="demo-banner"><strong>Demo mode</strong>: same contract rules, but every NEAR amount is ÷100 and time runs 12× faster (gm every 30 min, a Ritual day is 2h, raid rounds 100 s). Separate factory and coins. Switch to <em>Real</em> for full-size numbers.</div>}
        {listErr && <div className="warn">{listErr}</div>}
        {page.kind === 'discover' && <Discover {...ctx} />}
        {page.kind === 'launch' && <Launch ch={ch} me={me} act={act} busy={busy} go={setPage} coins={coins} />}
        {page.kind === 'docs' && <Docs />}
        {page.kind === 'profile' && <Profile ch={ch} me={me} bal={bal} coins={coins} tick={tick} go={id => setPage({ kind: 'coin', id })} onBackup={() => setModal('key')} onSwitch={() => switchDoor(practice ? 'wallet' : 'practice')}
          onReset={() => { if (confirm('Start over with a brand-new practice wallet? The current one is forgotten.')) { ch.resetWallet!(); location.reload(); } }} onGuide={openGuide} />}
        {page.kind === 'proof' && <Proof ch={ch} coins={coins} tick={tick} />}
        {page.kind === 'war' && <WarMap ch={ch} coins={coins} tick={tick} go={id => setPage({ kind: 'coin', id })} />}
        {page.kind === 'coin' && <CoinPage {...ctx} id={page.id} />}
      </main>
    </>
  );
}

type Ctx = { ch: Net; me: string; act: (l: string, f: () => Promise<unknown>, d?: string) => Promise<void>; busy: string; tick: number; coins: CoinEntry[]; go: (p: Page) => void };

// ------------------------------------------------------------------ Discover
type DRow = { icon: string | null; c: CoinView; r: Ritual; raid: RaidView | null; raids: RaidView[]; gradAt: number | null; log: LogEntry[]; prices: PricePoint[] };
type Sort = 'mcap' | 'vol' | 'chg' | 'holders' | 'new';
const VIEW_KEY = 'rulecard-discover-view';
const sgn = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(Math.abs(n) < 10 ? 2 : 1)}%`;

function Discover({ ch, coins, tick, go }: Ctx) {
  const [rows, setRows] = useState<Record<string, DRow>>({});
  const [show, setShow] = useState<'live' | 'grad'>('live');
  const [view, setView] = useState<'grid' | 'list'>(() => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } });
  const [sort, setSort] = useState<Sort>('mcap');
  const pick = (v: 'grid' | 'list') => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };
  useEffect(() => {
    (async () => {
      const out: Record<string, DRow> = {};
      for (const e of coins) {
        try {
          const [c, r, raid, log, prices, md] = await Promise.all([ch.view<CoinView>(e.account_id, 'get_coin'), ch.view<Ritual>(e.account_id, 'get_ritual'), ch.view<RaidView | null>(e.account_id, 'get_raid'),
            ch.view<LogEntry[]>(e.account_id, 'get_log', { limit: 100 }), ch.view<PricePoint[]>(e.account_id, 'get_prices').catch(() => [] as PricePoint[]), ch.view<{ icon: string | null }>(e.account_id, 'ft_metadata').catch(() => ({ icon: null }))]);
          const raids = c.graduated ? await ch.view<RaidView[]>(e.account_id, 'get_raids') : [];
          out[e.account_id] = { icon: md.icon ?? null, c, r, raid, raids, gradAt: log.find(l => l.kind === 'graduated')?.at ?? null, log, prices };
        } catch { /* skip */ }
      }
      setRows(out);
    })();
  }, [ch, coins, tick]);

  // 24h numbers come from each coin's own log and price history (game time: a day is 2h in demo mode)
  const metrics = (x: DRow) => {
    const now = x.c.now, from = now - (24 * HOUR) / TS;
    const trades = x.log.filter(l => (l.kind === 'buy' || l.kind === 'sell') && l.at >= from);
    const vol = trades.reduce((a, l) => a + toNear(l.near), 0);
    const capped = x.log.length >= 100 && x.log[x.log.length - 1].at >= from;
    const pts = x.prices;
    const start = pts.length ? toMicro((pts.filter(p => p.at <= from).pop() ?? pts[0]).price) : 0, last = toMicro(x.c.price);
    const chg = start > 0 ? ((last - start) / start) * 100 : 0;
    return { vol, trades: trades.length, capped, chg, price: last, age: now - x.c.created_ms, ritual: (pct(x.r.gm_count, x.r.gm_target) + pct(toNear(x.r.lock_near), toNear(x.r.lock_target))) / 2 };
  };
  const loaded = coins.filter(e => rows[e.account_id]);
  const live = loaded.filter(e => !rows[e.account_id].c.graduated), grad = loaded.filter(e => rows[e.account_id].c.graduated);
  const keyOf = (id: string): number => { const x = rows[id], m = metrics(x); return sort === 'mcap' ? toNear(x.c.mcap) : sort === 'vol' ? m.vol : sort === 'chg' ? m.chg : sort === 'holders' ? x.c.holders : x.c.created_ms; };
  const list = [...(show === 'live' ? live : grad)].sort((a, b) => keyOf(b.account_id) - keyOf(a.account_id));
  const totalVol = live.reduce((a, e) => a + metrics(rows[e.account_id]).vol, 0), totalMcap = live.reduce((a, e) => a + toNear(rows[e.account_id].c.mcap), 0);
  return (
    <section>
      <div className="row between wrap"><h1>Discover</h1>
        <div className="row gap wrap">
          <div className="seg" role="group" aria-label="Which coins">
            <button aria-pressed={show === 'live'} onClick={() => setShow('live')}>Live · {live.length}</button>
            <button aria-pressed={show === 'grad'} onClick={() => setShow('grad')}>Graduated · {grad.length}</button>
          </div>
          <div className="seg" role="group" aria-label="Layout">
            <button aria-pressed={view === 'grid'} onClick={() => pick('grid')} title="Grid view">Grid</button>
            <button aria-pressed={view === 'list'} onClick={() => pick('list')} title="List view">List</button>
          </div>
          <label className="sortpick small muted">Sort <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort coins">
            <option value="mcap">Market cap</option><option value="vol">24h volume</option><option value="chg">24h change</option><option value="holders">Holders</option><option value="new">Newest</option>
          </select></label>
        </div>
      </div>
      <p className="muted">{show === 'live' ? 'Coins still on their curve: rituals, cards and raids are on. Every coin is its own NEP-141 contract with no admin key.' : 'Hall of Fame: coins whose curve sold out. The game is over for them; their history stays on-chain. Listing on a DEX (Ref Finance) is the next step on the roadmap.'}</p>
      {!!live.length && show === 'live' && <div className="panel strip disc-strip">
        <div><small>LIVE COINS</small><b className="mono">{live.length}</b></div>
        <div><small>TOTAL MARKET CAP</small><b className="mono">{fmtNear(totalMcap)} N</b></div>
        <div><small>24H VOLUME</small><b className="mono">{fmtNear(totalVol)} N</b></div>
        <div><small>RAIDS LIVE</small><b className="mono">{live.filter(e => rows[e.account_id].raid?.phase === 2).length}</b></div>
        <div><small>HOLDERS</small><b className="mono">{live.reduce((a, e) => a + rows[e.account_id].c.holders, 0)}</b></div>
      </div>}
      {!coins.length && <div className="panel">No coins yet. <button className="btn" onClick={() => go({ kind: 'launch' })}>Launch the first one</button></div>}
      {coins.length > 0 && loaded.length < coins.length && <p className="small muted">Loading {coins.length - loaded.length} more…</p>}
      {coins.length > 0 && !list.length && loaded.length === coins.length && <div className="panel muted">{show === 'live' ? 'Every coin has graduated.' : 'No coin has graduated yet: a curve sells out at ~' + nearAmt(3946) + ' NEAR.'}</div>}

      {view === 'list' && !!list.length && <div className="coin-list" role="table" aria-label="Coins">
        <div className="cl-row cl-head mono" role="row"><span>#</span><span>COIN</span><span>MARKET CAP</span><span>24H</span><span>VOL 24H</span><span>TRADES</span><span>HOLDERS</span><span>RITUAL</span><span>AGE</span></div>
        {list.map((e, i) => {
          const x = rows[e.account_id], m = metrics(x), c = x.c;
          return (
            <button key={e.account_id} role="row" className="cl-row" style={{ ['--m' as any]: jokerOf(c.symbol) }} onClick={() => go({ kind: 'coin', id: e.account_id })}>
              <span className="mono muted">{i + 1}</span>
              <span className="cl-coin">{x.icon ? <img className="mini-av img" src={x.icon} alt="" width={34} height={34} /> : <span className="mini-av" aria-hidden="true" />}<span><strong>${c.symbol}</strong><small className="muted">{c.name}</small></span><span className={`lvl l${c.level}`}>L{c.level}</span>{x.raid?.phase === 2 && <span className="chip hot">raid</span>}{c.graduated && <span className="chip gold">graduated</span>}</span>
              <span className="mono">{fmtNear(toNear(c.mcap))} N</span>
              <span className={`mono ${m.chg >= 0 ? 'up' : 'down'}`}>{sgn(m.chg)}</span>
              <span className="mono">{fmtNear(m.vol)} N</span>
              <span className="mono">{m.trades}{m.capped ? '+' : ''}</span>
              <span className="mono">{c.holders}</span>
              <span className="cl-rit" aria-label={`Ritual ${Math.round(m.ritual)}%`}><i><b style={{ width: `${m.ritual}%` }} /></i><span className="mono small">{Math.round(m.ritual)}%</span></span>
              <span className="mono muted">{dur(m.age)}</span>
            </button>
          );
        })}
      </div>}

      {view === 'grid' && <div className="coin-grid">
        {list.map(e => {
          const x = rows[e.account_id], { c, raid, raids, gradAt } = x, m = metrics(x);
          const stats = <div className="cc-stats mono">
            <div><small>PRICE</small><b>{m.price.toFixed(3)} N/1M</b></div>
            <div><small>24H</small><b className={m.chg >= 0 ? 'up' : 'down'}>{sgn(m.chg)}</b></div>
            <div><small>VOL 24H</small><b>{fmtNear(m.vol)} N</b></div>
            <div><small>TRADES</small><b>{m.trades}{m.capped ? '+' : ''}</b></div>
          </div>;
          if (c.graduated) {
            const won = raids.filter(z => z.result && z.result.outcome > 0).length, lost = raids.filter(z => z.result && z.result.outcome < 0).length;
            return (
              <button key={e.account_id} style={{ ['--m' as any]: jokerOf(c.symbol) }} className="panel coin-card grad" onClick={() => go({ kind: 'coin', id: e.account_id })}>
                <div className="row between"><strong className="big coin-title">{x.icon && <img className="coin-ico" src={x.icon} alt="" width={28} height={28} />}${c.symbol}</strong><span className="chip gold">🎓 Graduated</span></div>
                <div className="muted small">{c.name} · by {short(c.creator)}{gradAt ? ` · ${new Date(gradAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}</div>
                <div className="row between mono"><span>{fmtNear(toNear(c.mcap))} NEAR final mcap</span><span>{c.holders} holders</span></div>
                <div className="row between small"><span>🔥 burned {fmtTok(toTok(c.burned))}</span><span>⚔ {won}W / {lost}L</span></div>
                <div className="small muted">Creator escrow {toNear(c.escrow) > 0 ? `${fmtNear(toNear(c.escrow))} N to claim` : 'paid'}</div>
              </button>
            );
          }
          return (
            <button key={e.account_id} style={{ ['--m' as any]: jokerOf(c.symbol) }} className="panel coin-card" onClick={() => go({ kind: 'coin', id: e.account_id })}>
              <div className="row between"><strong className="big coin-title">{x.icon && <img className="coin-ico" src={x.icon} alt="" width={28} height={28} />}${c.symbol}</strong><span className={`lvl l${c.level}`}>L{c.level} {LEVEL_NAME[c.level]}</span></div>
              <div className="muted small">{c.name} · by {short(c.creator)} · {dur(m.age)} old</div>
              <div className="row between mono"><span>{fmtNear(toNear(c.mcap))} NEAR mcap</span><span>{c.holders} holders</span></div>
              {stats}
              <Ring value={m.ritual} label="Ritual" />
              <div className="chips">
                <span className="chip">⚡ {c.energy}</span><span className="chip">🜂 pot {fmtNear(toNear(c.pot))}</span>
                {raid && raid.phase === 2 && <span className="chip hot">⚔ in a raid</span>}
                {c.hype_until > c.now && <span className="chip hot">📣 Trending</span>}
                {c.rules.map(z => <span key={z} className="chip" title={RULE_TEXT[z]}>{z}</span>)}
              </div>
            </button>
          );
        })}
      </div>}
    </section>
  );
}

// ------------------------------------------------------------------ Coin page
interface CoinData { c: CoinView; h: HolderView | null; r: Ritual; lv: LevelView; hand: HandView | null; table: Proposal[]; hist: Proposal[]; raid: RaidView | null; raids: RaidView[]; log: LogEntry[]; plan: number[]; prices: PricePoint[]; omen: OmenView | null; duels: Duel[]; bounties: Bounty[]; }

function CoinPage(p: Ctx & { id: string }) {
  const { ch, me, act, busy, tick, id } = p;
  const [d, setD] = useState<CoinData | null>(null);
  const [tab, setTab] = useState<Tab>('trade');
  const [lockPrompt, setLockPrompt] = useState<bigint | null>(null);
  useEffect(() => {
    (async () => {
      const acc = ch.me(); const v = <T,>(m: string, a: object = {}) => ch.view<T>(id, m, a);
      const mine = <T,>(m: string): Promise<T | null> => (acc ? v<T>(m, { account_id: acc }) : Promise.resolve(null));
      const [c, h, r, lv, hand, table, hist, raid, raids, log, plan, prices, omen, duels, bounties] = await Promise.all([
        v<CoinView>('get_coin'), mine<HolderView>('get_holder'), v<Ritual>('get_ritual'), v<LevelView>('get_level_progress'),
        mine<HandView>('get_hand'), v<Proposal[]>('get_table'), v<Proposal[]>('get_history'), v<RaidView | null>('get_raid'), v<RaidView[]>('get_raids'),
        v<LogEntry[]>('get_log', { limit: 100 }), mine<number[]>('get_my_plan').then(x => x ?? []), v<PricePoint[]>('get_prices'),
        v<OmenView>('get_omen').catch(() => null), // coins launched before Omens existed don't have it
        v<Duel[]>('get_duels').catch(() => [] as Duel[]), v<Bounty[]>('get_bounties').catch(() => [] as Bounty[]),
      ]);
      setD({ c, h, r, lv, hand, table, hist, raid, raids, log, plan, prices, omen, duels, bounties });
    })().catch(() => {});
  }, [ch, me, id, tick]);
  const prev = useRef<CoinData | null>(null), prevId = useRef(id), lastBurn = useRef(0);
  useEffect(() => {
    if (prevId.current !== id) { prev.current = null; prevId.current = id; }
    const q = prev.current;
    if (d && q) {
      if (d.c.level > q.c.level) play('levelUp');
      if (d.r.streak > q.r.streak) play('ritualMade');
      else if (d.r.day !== q.r.day && d.r.last_made === false) play('ritualMissed');
      if (BigInt(d.c.burned) - BigInt(q.c.burned) >= 2_000_000n * 10n ** 18n && Date.now() - lastBurn.current > 20_000) { lastBurn.current = Date.now(); play('burn'); }
      if (d.omen?.phase === 'active' && d.omen.kind && !(q.omen?.phase === 'active' && q.omen.starts_at === d.omen.starts_at)) play('omen');
      if (d.raid?.phase === 2 && q.raid?.phase !== 2) play('raidStart');
      const lr = d.raids[d.raids.length - 1], pr = q.raids[q.raids.length - 1];
      if (lr?.result && (!pr || pr.seq !== lr.seq || !pr.result)) play(lr.result.outcome > 0 ? 'raidWin' : 'raidLose');
    }
    prev.current = d;
  }, [d, id]);
  if (!d) return <div className="panel skel">Loading…</div>;
  const { c, h } = d;
  const now = c.now;
  const call = (label: string, m: string, a: object = {}, dep = 0n, done?: string) => act(label, async () => {
    const r = await ch.call(id, m, a, dep);
    const sfx = sfxForCall(m, a); if (sfx) play(sfx);
    return r;
  }, done);
  const gmReady = !h || h.last_gm === 0 || now >= h.next_gm;
  const idleBurning = h && h.last_gm > 0 && now >= h.idle_burn_starts;
  const ritualPct = (pct(d.r.gm_count, d.r.gm_target) + pct(toNear(d.r.lock_near), toNear(d.r.lock_target))) / 2;
  const tabs: [Tab, string][] = [['trade', 'Trade'], ['today', 'Ritual'], ['vault', 'Vault'], ['raid', 'Raids'], ['cards', 'Cards'], ['log', 'Log']];
  const props = { ...p, d, now, call, setTab };

  return (
    <section>
      <div className="panel coin-hero">
        <div className="ch-main">
          <span className="avatar" style={{ ['--m' as any]: jokerOf(c.symbol) }} aria-hidden="true"><b>{c.symbol.slice(0, 4)}</b></span>
          <div className="ch-id">
            <div className="row gap wrap"><h1>${c.symbol}</h1><span className="muted small">{c.name}</span>{!c.graduated && <span className="live"><i />LIVE</span>}<span className={`lvl l${c.level}`}>L{c.level} {LEVEL_NAME[c.level]}</span>{c.graduated && <span className="chip gold">Graduated</span>}{c.rules.map(x => <span key={x} className="chip" title={RULE_TEXT[x]}>{x}</span>)}{c.hype_until > now && <span className="chip hot">Trending</span>}{c.heat > 0 && <span className="chip hot" title="Heat: pot cards spend 10% more per Heat">Heat {c.heat}</span>}{c.slowburn_until > now && <span className="chip" title="1% of every trade burns">Slow Burn {dur(c.slowburn_until - now)}</span>}{c.recruit_until > now && <span className="chip" title="First buys of 3 NEAR or more get +5%">Recruit {dur(c.recruit_until - now)}</span>}{c.diamond_until > now && <span className="chip" title="24h locks get x1.25 and +1%">Diamond Pool {dur(c.diamond_until - now)}</span>}{c.whale_until > now && <span className="chip down" title="Wallets over 2% pay +1% on sells">Whale Tax {dur(c.whale_until - now)}</span>}{c.ally && <span className="chip up" title="No raids between the two coins">Allied with ${c.ally.split('.')[0].toUpperCase()}</span>}{c.banner_by && c.banner_until > now && <span className="chip down" title="Lost a Hard Raid">Flying ${c.banner_by.split('.')[0].toUpperCase()}'s banner</span>}{c.harvest_until > now && <span className="chip up">Harvest open</span>}</div>
            <div className="ch-stats mono">
              <div><small>MCAP</small><b className="up">{fmtNear(toNear(c.mcap))} N</b></div>
              <div><small>PRICE</small><b title="NEAR per 1 million tokens">{toMicro(c.price).toFixed(3)} N/1M</b></div>
              <div><small>IN CURVE</small><b>{fmtNear(toNear(c.real))} N</b></div>
              <div><small>HOLDERS</small><b>{c.holders}</b></div>
              <div><small>BURNED</small><b>{fmtTok(toTok(c.burned))}</b></div>
            </div>
          </div>
        </div>
        <div className="ch-side">
          {d.omen && d.omen.phase !== 'none' && d.omen.kind > 0
            ? <div className={`omencard ${d.omen.phase}`} role="status" title={d.omen.text}><span className="oc-top mono"><span>{d.omen.phase === 'active' ? 'OMEN ACTIVE' : 'OMEN INCOMING'}</span><InfoDot title={d.omen.name} align="left"><OmenInfo name={d.omen.name} text={d.omen.text} phase={d.omen.phase} /></InfoDot></span><strong>{d.omen.name}</strong><small className="mono">{d.omen.phase === 'active' ? `ends in ${dur(d.omen.ends_at - now)}` : `starts in ${dur(d.omen.starts_at - now)}`}</small></div>
            : <div className="omencard none" title="Omens are short luck events every few hours"><span className="oc-top mono"><span>OMENS</span><InfoDot title="Omens" align="left"><OmenInfo name="" text="" phase="none" /></InfoDot></span><strong>{c.level < 2 ? 'From level 2' : 'None right now'}</strong><small className="mono">luck events</small></div>}
          <button className={`btn gm ${idleBurning ? 'burning' : ''}`} disabled={!h || !gmReady || !!busy} onClick={() => call('gm', 'gm', {}, 0n, 'gm! +Energy, idle clock reset')}>
            gm{h && !gmReady ? ` in ${dur(h.next_gm - now)}` : ''}
            <small>{!h ? 'Buy to join' : idleBurning ? 'idle burn running' : h.last_gm ? `idle burn in ${dur(h.idle_burn_starts - now)}` : `every ${hrs(6)}`}</small>
          </button>
          <button className="ritualcard" onClick={() => setTab('today')}><Ring value={ritualPct} label="" small /><span><strong>Ritual</strong><small className="muted mono">{dur(((d.r.day + 1) * (24 * HOUR) / TS) - now)}</small></span></button>
        </div>
        {ch.enableOneTap && h && <div className="ch-onetap small">{ch.oneTapReady!(id)
          ? <span className="up" title="gm, packs, backing and Battle cry sign without a wallet popup. Selling, locking, betting and buying still ask your wallet.">one tap on · <button className="linkish small muted" onClick={() => act('Turn off one-tap', async () => ch.disableOneTap!(id), 'One-tap is off for this coin')}>turn off</button></span>
          : <button className="linkish small" title="One wallet approval adds a limited key for this coin: it can check in, claim packs, back cards and Battle cry. It can never sell, lock, bet or buy, and it can't touch your other tokens or NEAR." onClick={() => act('Enable one-tap', () => ch.enableOneTap!(id), 'One-tap is on for this coin')}>Enable one tap gm</button>}</div>}
      </div>

      {c.graduated && <div className="grad-banner">🎓 <strong>${c.symbol} graduated</strong>: its curve sold out, so buys, rituals, cards and raids are over. Holders can still sell back to the curve. The creator's escrow ({fmtNear(toNear(c.escrow))} N) is claimable now. Next on the roadmap: graduating into a Ref Finance pool.
        {ch.me() === c.creator && toNear(c.escrow) > 0 && <button className="btn small primary" disabled={!!busy} onClick={() => call('Claim escrow', 'claim_creator_escrow')}>Claim escrow</button>}</div>}
      {d.raid?.phase === 2 && <button className="raid-live" onClick={() => setTab('raid')}><span className="rl-dot" /><span className="mono small rl-tag">RAID LIVE</span><strong>${d.raid.attacker.split('.')[0].toUpperCase()} vs ${d.raid.defender.split('.')[0].toUpperCase()}</strong><span className="small">{d.raid.round !== null ? `round ${d.raid.round + 1} of 3` : 'mustering'} · ends in {dur(d.raid.end - now)}</span><span className="rl-go">Open arena →</span></button>}
      {c.level < 2 && <p className="small muted">Omens (short luck events every few hours) begin when the coin reaches level 2.</p>}

      {ch.scale === 'demo' && !c.graduated && <Guide ch={ch} me={ch.me()} coinId={id} h={h} hand={d.hand} r={d.r} busy={busy} visitedWar={guideWarVisited(ch.me())}
        doCall={call} go={w => (w === 'war' ? p.go({ kind: 'war' }) : setTab(w))} fmtLock={() => (h ? BigInt(h.balance) / 2n : 0n)} />}

            {lockPrompt !== null && (
        <div className="panel lock-prompt">
          <strong>Lock {hrs(24)}?</strong> Locked tokens are safe from idle burn and earn half of what idle burn takes.
          <div className="row gap"><button className="btn primary" onClick={() => { const a = lockPrompt; setLockPrompt(null); call('Lock', 'lock', { amount: a.toString(), hours: 24 }, 1n); }}>Lock {fmtTok(toTok(lockPrompt))} for {hrs(24)}</button><button className="btn" onClick={() => setLockPrompt(null)}>Not now</button></div>
        </div>
      )}
      <TradeTab {...props} onBought={t => setLockPrompt(t)} below={<div className="tabzone">
        <nav className="tabs tabbar" aria-label="Coin sections">{tabs.map(([t, l]) => {
        const badge = t === 'today' ? `streak ${d.r.streak}` : t === 'vault' ? `${d.c.vault_locked !== '0' && h ? Math.round(pct(toTok(d.c.vault_locked), toTok(d.c.circulating))) + '% locked' : ''}` : t === 'raid' ? (d.raid?.phase === 2 ? 'live' : `${d.raids.length} total`) : t === 'cards' ? (h && d.hand ? `${d.hand.cards.length + d.hand.commons.reduce((a, [, n]) => a + n, 0)} held` : '') : t === 'log' ? `${d.log.length}` : t === 'trade' ? (d.table.length ? `${d.table.length} on table` : '') : '';
        return <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}><span>{l}</span>{badge && <small className={`tbadge ${t === 'raid' && d.raid?.phase === 2 ? 'hot' : ''}`}>{badge}</small>}</button>;
      })}</nav>
        {tab === 'trade' && <RecentTrades d={d} now={now} />}
        {tab === 'today' && <TodayTab {...props} />}
        {tab === 'cards' && <CardsTab {...props} />}
        {tab === 'vault' && <VaultTab {...props} />}
        {tab === 'raid' && <RaidTab {...props} />}
        {tab === 'log' && <LogTab {...props} />}
      </div>} />
    </section>
  );
}

type TabProps = Ctx & { id: string; d: CoinData; now: number; call: (label: string, m: string, a?: object, dep?: bigint, done?: string) => Promise<void> };


function TradeTab({ ch, me, id, d, now, busy, act, onBought, setTab, below }: TabProps & { onBought: (t: bigint) => void; setTab: (t: Tab) => void; below: ReactNode }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amt, setAmt] = useState(5 / NS);
  const [q, setQ] = useState<BuyQuote | null>(null);
  const [sq, setSq] = useState<any>(null);
  const { c, h, hand, lv } = d;
  useEffect(() => {
    if (side === 'buy' && amt > 0) ch.view<BuyQuote>(id, 'quote_buy', { near: nearToYocto(amt).toString(), account_id: ch.me() }).then(setQ).catch(() => setQ(null));
    if (side === 'sell' && amt > 0) ch.view(id, 'quote_sell', { amount: tokToUnits(amt).toString(), account_id: ch.me() }).then(setSq).catch(() => setSq(null));
  }, [ch, id, me, side, amt, d]);
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => { ch.balance().then(setBal).catch(() => {}); }, [ch, d]);
  const myTok = h ? toTok(h.balance) : 0;
  const locked = hand && now < hand.no_trade_until;
  const reserve = 0.05; // keep a little NEAR for network fees
  const reason = c.graduated && side === 'buy' ? 'Curve sold out' : locked ? 'Locked by your bet'
    : amt <= 0 ? 'Enter an amount'
    : side === 'buy' && bal !== null && amt + reserve > bal ? 'Not enough NEAR'
    : side === 'sell' && amt > myTok ? (myTok > 0 ? 'More than you hold' : `You hold no $${c.symbol}`) : '';
  const maxAmt = () => (side === 'buy' ? Math.max(0, Math.floor(((bal ?? 0) - reserve) * 100) / 100) : Math.floor(myTok));
  const unit = side === 'buy' ? 'NEAR' : `$${c.symbol}`;
  const recv = side === 'buy' ? (q ? `${fmtTok(toTok(q.tokens))} $${c.symbol}` : '·') : (sq ? `${fmtNear(toNear(sq.near_out))} NEAR` : '·');
  const sold = 100 - pct(toTok(c.curve_room), 793_191_832);
  const lockedPct = h && toTok(h.balance) + toTok(h.locked) > 0 ? pct(toTok(h.locked), toTok(h.balance) + toTok(h.locked)) : 0;
  const nm: Record<string, string> = { market_cap: 'Market cap', real_near: 'Real NEAR in curve', volume_24h: 'Volume 24h', checkins_24h: 'Check-ins 24h', net_buying_1h: 'Net buying 1h', coin_age_ms: 'Coin age' };
  const val = (k: string, v: string) => k === 'checkins_24h' ? v : k === 'coin_age_ms' ? dur(Number(v)) : fmtNear(toNear(v));
  const presets = [1, 5, 10, 25].map(x => x / NS);
  return (
    <div className="trade-grid">
      <div className="tg-left">
        <PriceChart points={d.prices} log={d.log} now={now} />
        <div className="panel strip">
          <div><small>ENERGY</small><b className="mono">{c.energy}<i>/100</i></b><span className="meter"><i style={{ width: `${c.energy}%` }} /></span></div>
          <div><small>POT</small><b className="mono">{fmtNear(toNear(c.pot))} N</b><span className="muted small">spent today {fmtNear(toNear(c.pot_spent_today))}</span></div>
          <div><small>VAULT</small><b className="mono">{pct(toTok(c.vault_locked), toTok(c.circulating)).toFixed(1)}%</b><span className="muted small">locked</span></div>
          <div><small>REWARD POOL</small><b className="mono">{fmtTok(toTok(c.reward_pool))}</b><span className="muted small">tokens left</span></div>
          <div><small>DECK</small><b className="mono deckline">{c.deck.filter(x => x.limit).map(x => `${TIER_NAME[x.tier][0]} ${x.out}/${x.limit}`).join(' · ') || '·'}</b></div>
        </div>
        <div className="panel">
          <div className="row between wrap"><h2>The Table <span className="muted small mono">{d.table.length} IN PLAY</span></h2><button className="btn small" onClick={() => setTab('cards')}>Hand and market →</button></div>
          {!d.table.length && <p className="muted small">Nothing on the table. Cards that need backers or signers show here.</p>}
          <div className="minis">
            {d.table.map(t => {
              const tier = TIER_OF[t.card], info = CARD_TEXT[t.card];
              const phase = t.phase === 0 ? (SIGNED.includes(t.card) ? 'Being signed' : 'Being backed') : t.phase === 1 ? (t.card === 'Prophecy' ? 'Prophecy live' : t.card === 'BlackHole' ? 'Throwing' : t.card === 'Stampede' || t.card === 'Squeeze' ? 'Crowd window' : 'Fuel window') : 'Resolving';
              return (
                <div key={t.id} role="button" tabIndex={0} className={`mini t${tier}`} style={{ ['--m' as any]: `url(/bg/symbols/${CARD_SYMBOL[t.card]}.png)` }} onClick={() => setTab('cards')} onKeyDown={e => { if (e.key === 'Enter') setTab('cards'); }}>
                  <span className="mini-top mono"><span>{TIER_NAME[tier]}</span><span className="row gap"><span>{dur(t.phase_end - now)}</span><InfoDot title={info.name}><CardInfo card={t.card} /></InfoDot></span></span>
                  <span className="mini-art" aria-hidden="true" />
                  <strong>{info.name}</strong>
                  <small className="mono">{phase}</small>
                  {t.phase === 0 && <span className="meter"><i style={{ width: `${pct(t.backers.length, t.needed)}%` }} /></span>}
                </div>
              );
            })}
          </div>
        </div>
        {below}
      </div>

      <div className="tg-right">
        <div className="panel trade-panel">
          <div className="tp-head"><span className="mono muted small">MARKET ORDER</span><span className="tp-bal mono">{bal !== null ? `Balance ${fmtNear(bal)} N` : ''}</span></div>
          <div className="side-tabs" role="group" aria-label="Buy or sell"><button className="buy" aria-pressed={side === 'buy'} onClick={() => { setSide('buy'); setAmt(5 / NS); }}>Buy</button><button className="sell" aria-pressed={side === 'sell'} onClick={() => { setSide('sell'); setAmt(Math.floor(myTok / 2)); }}>Sell</button></div>
          <div className="amt-box">
            <div className="amt-top"><span className="mono muted small">{side === 'buy' ? 'YOU PAY' : `YOU SELL · HOLD ${fmtTok(myTok)}`}</span><button className="maxbtn" onClick={() => setAmt(maxAmt())} disabled={maxAmt() <= 0}>MAX</button></div>
            <label className="amt"><input type="number" min={0} value={amt} onChange={e => setAmt(Number(e.target.value))} aria-label={side === 'buy' ? 'NEAR to spend' : 'Tokens to sell'} /><span className="unit">{unit}</span></label>
            <div className="amt-sub mono"><span className="muted">You receive</span><b>{recv}</b></div>
          </div>
          {side === 'buy' ? <div className="presets">{presets.map(x => <button key={x} className={amt === x ? 'on' : ''} onClick={() => setAmt(x)}>{x} N</button>)}</div>
            : <div className="presets">{[25, 50, 75, 100].map(x => <button key={x} onClick={() => setAmt(Math.floor(myTok * x / 100))}>{x}%</button>)}</div>}
          <div className="xrows details">
            {side === 'buy' && q && <>
              <Row k="Average price" v={`${((toNear(q.near_used) / Math.max(1e-9, toTok(q.tokens))) * 1e6).toFixed(3)} N/1M`} />
              <Row k="Price after" v={`${toMicro(q.price_after).toFixed(3)} N/1M`} />
              <Row k="Fee" v={`${fmtNear(toNear(q.fee))} N`} />
              {toNear(q.storage) > 0 && <Row k="First buy storage" v={`${toNear(q.storage)} N`} />}
              <Row k="Price impact" v={<span className={q.impact_bps > 300 ? 'down' : 'up'}>+{(q.impact_bps / 100).toFixed(2)}%</span>} />
            </>}
            {side === 'sell' && sq && <>
              <Row k="Average price" v={`${amt > 0 ? ((toNear(sq.near_out) / amt) * 1e6).toFixed(3) : '·'} N/1M`} />
              <Row k="Price after" v={`${toMicro(sq.price_after).toFixed(3)} N/1M`} />
              <Row k="Fee" v={`${fmtNear(toNear(sq.fee))} N`} />
              {toNear(sq.tax) > 0 && <Row k="Taxes" v={<span className="down">{fmtNear(toNear(sq.tax))} N</span>} />}
              <Row k="Price impact" v={<span className="down">−{(sq.impact_bps / 100).toFixed(2)}%</span>} />
            </>}
            <p className="fine">Trade fee is 2%. 1.5% goes to the pot, which later buys and burns supply.</p>
          </div>
          {locked && <div className="warn">You have a live Prophecy bet: no trading until {new Date(hand!.no_trade_until).toISOString().slice(11, 16)}.</div>}
          {hand && toTok(hand.tagged) > 0 && <div className="warn">Tagged: {fmtTok(toTok(hand.tagged))} tokens bought while a pot card was on the table. Selling them before {dur(hand.tag_until - now)} pays 10% to the pot.</div>}
          {d.raid?.phase === 2 && <div className="warn">A raid is on: selling pays +3% and lowers your side's Buy score.</div>}
          {c.rules.includes('PaperTax') && <div className="fine">Paper Tax: 10% on selling tokens bought less than {hrs(1)} ago.</div>}
          <button className={`btn big-cta ${side} ${reason ? 'blocked' : ''}`} disabled={!!busy || !!reason} onClick={() => side === 'buy'
            ? act('Buy', async () => { const t: string = await ch.call(id, 'buy', {}, nearToYocto(amt)); play('buy'); onBought(BigInt(t)); }, 'Bought')
            : act('Sell', async () => { await ch.call(id, 'sell', { amount: tokToUnits(amt).toString() }, 1n); play('sell'); }, 'Sold')}>
            {busy ? `${busy}…` : reason ? reason : side === 'buy' ? `Buy $${c.symbol}` : `Sell $${c.symbol}`}
          </button>
          {reason === 'Not enough NEAR' && <p className="fine center">{ch.mode === 'practice' ? 'Your practice wallet is out of testnet NEAR. Try a smaller amount.' : 'Add testnet NEAR to your wallet, or try a smaller amount.'}</p>}
        </div>

        <div className="panel">
          <div className="row between"><span className="muted small mono">YOUR POSITION</span>{h && <span className="muted small mono">{pct(toTok(h.balance) + toTok(h.locked), toTok(c.total_supply)).toFixed(2)}% of supply</span>}</div>
          {!h ? <p className="muted">You don't hold ${c.symbol} yet. Buy to join the coin.</p> : <>
            <div className="bignum mono">{fmtNear(toNear(h.value))} <i>N</i></div>
            <div className="split" aria-hidden="true"><i style={{ width: `${100 - lockedPct}%` }} /><b style={{ width: `${lockedPct}%` }} /></div>
            <div className="three mono"><div><small>FREE</small><b>{fmtTok(myTok)}</b></div><div><small>LOCKED</small><b className="teal">{fmtTok(toTok(h.locked))}</b></div><div><small>QUALIFIED</small><b>{h.qualified ? 'yes' : 'not yet'}</b></div></div>
            <div className="xrows"><Row k="Lost today / cap" v={`${fmtTok(toTok(h.lost_today))} / ${fmtTok(toTok(h.loss_cap_today))}`} />{toTok(h.pending_idle_burn) > 0 && <Row k="Idle burn due" v={<span className="down">{fmtTok(toTok(h.pending_idle_burn))}</span>} />}</div>
          </>}
        </div>

        <div className="panel">
          <div className="row between"><h2>Bonding curve</h2><b className="up mono">{sold.toFixed(1)}%</b></div>
          <div className="curve" aria-hidden="true"><i style={{ width: `${sold}%` }} /></div>
          <p className="muted small">Graduates at ~{nearAmt(3946)} N mcap. {c.solvent ? 'Fully backed.' : <span className="down">Not fully backed.</span>}</p>
        </div>

        <div className="panel">
          <div className="row between"><h2>{lv.next ? `Next: L${lv.next} ${LEVEL_NAME[lv.next]}` : 'Top level'}</h2>{lv.all_met_since && <span className="chip hot">hold {dur(lv.all_met_since + lv.hold_ms - now)}</span>}</div>
          <div className="checks">{lv.rules.map(x => <div key={x.name} className={`check ${x.met ? 'met' : ''}`}><span className="tick" aria-hidden="true">{x.met ? '✓' : '·'}</span><span className="ck-main"><strong>{nm[x.name] ?? x.name}</strong><small className="muted mono">{val(x.name, x.current)} / {val(x.name, x.target)}</small></span></div>)}</div>
        </div>

        <div className="panel">
          <h2>Coin info</h2>
          <div className="xrows info">
            <Row k="Contract" v={<span className="mono">{id}</span>} />
            <Row k="Creator" v={short(c.creator)} />
            <Row k="Created" v={new Date(c.created_ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'} />
            <Row k="Supply" v={Math.round(toTok(c.total_supply)).toLocaleString()} />
            <Row k="Trade fee" v="2% · 1.5% to pot" />
          </div>
          <div className="muted small mono" style={{ marginTop: 12 }}>CREATOR RULES · LOCKED</div>
          <div className="chips">{c.rules.map(x => <span key={x} className="chip mono" title={RULE_TEXT[x]}>{x}</span>)}</div>
        </div>
      </div>
    </div>
  );
}

function RecentTrades({ d, now }: { d: CoinData; now: number }) {
  return (
    <div className="panel">
          <div className="row between"><h2>Recent trades</h2><span className="muted small mono">ON-CHAIN</span></div>
          {!d.log.some(e => e.kind === 'buy' || e.kind === 'sell') && <p className="muted small">No trades yet.</p>}
          <div className="trades">
            {d.log.filter(e => e.kind === 'buy' || e.kind === 'sell').slice(0, 8).map(e => (
              <div key={e.seq} className={`trade-row ${e.kind}`}><span className="tr-side mono">{e.kind === 'buy' ? 'BUY' : 'SELL'}</span><span className="tr-who">{e.account ? short(e.account) : '·'}</span><span className="mono tr-amt">{fmtNear(toNear(e.near))} N</span><span className="mono muted tr-time">{dur(Math.max(0, now - e.at))} ago</span></div>
            ))}
          </div>
        </div>
  );
}

function TodayTab({ d, now }: TabProps) {
  const { r, lv, c } = d;
  const DAYMS = (24 * HOUR) / TS; // a Ritual day is 24h, or 2h in demo mode
  const end = (r.day + 1) * DAYMS;
  const gmOk = r.gm_count >= r.gm_target, lockOk = toNear(r.lock_near) >= toNear(r.lock_target);
  const first = Math.floor(c.created_ms / DAYMS);
  const dots = [7, 6, 5, 4, 3, 2, 1].map(i => { const day = r.day - i; return day < first ? 'none' : r.made_days.includes(day) ? 'made' : 'missed'; });
  const progress = (pct(r.gm_count, r.gm_target) + pct(toNear(r.lock_near), toNear(r.lock_target))) / 2;
  const nm: Record<string, string> = { market_cap: 'Market cap (NEAR)', real_near: 'Real NEAR in curve', volume_24h: 'Volume 24h (NEAR)', checkins_24h: 'Check-ins 24h', net_buying_1h: 'Net buying 1h (buys ≥ sells)', coin_age_ms: 'Coin age' };
  const val = (k: string, v: string) => k === 'checkins_24h' ? v : k === 'coin_age_ms' ? dur(Number(v)) : fmtNear(toNear(v));
  return (
    <div className="stack">
      <div className={`panel ritual-hero ${gmOk && lockOk ? 'ok' : ''}`}>
        <div className="row between wrap"><span className="small muted">TODAY'S RITUAL</span><span className="mono">{dur(end - now)} left</span></div>
        <div className="hero-nums">
          <div><b>{r.gm_count}/{r.gm_target}</b><span>wallets said gm {gmOk ? '✓' : ''}</span></div>
          <div><b>{fmtNear(toNear(r.lock_near))}/{fmtNear(toNear(r.lock_target))}</b><span>NEAR locked in the Vault {lockOk ? '✓' : ''}</span></div>
        </div>
        <div className="meter hero-meter"><i style={{ width: `${progress}%` }} /></div>
        <p>{gmOk && lockOk ? <>On track: when the day ends the pot buys and burns <strong>{r.streak >= 2 ? '7%' : '5%'}</strong> of itself.</> : <>The whole coin has to show up. Miss it and sleepers burn twice as fast for {hrs(6)}.</>}</p>
        <div className="row gap wrap">
          <span title="days in a row the coin made its Ritual">🔥 streak {r.streak}</span>
          <span className="dots" role="img" aria-label="last 7 days, oldest first">{dots.map((k, i) => <i key={i} className={`dot ${k}`} title={k === 'made' ? 'made' : k === 'missed' ? 'missed' : 'before launch'} />)}</span>
          <span className="small muted">last 7 days</span>
        </div>
        {r.double_from.some(s => now > s && now <= s + (6 * HOUR) / TS) && <div className="warn">Ritual missed: idle burn ×2 right now.</div>}
      </div>
      <div className="grid2">
      <div className="panel stack">
        <div className="row between"><h2>The numbers</h2><span className="mono small">ends in {dur(end - now)}</span></div>
        <Bar label="gm" value={r.gm_count} max={r.gm_target} text={`${r.gm_count} / ${r.gm_target} wallets`} />
        <Bar label="Locked" value={toNear(r.lock_near)} max={toNear(r.lock_target)} text={`${fmtNear(toNear(r.lock_near))} / ${fmtNear(toNear(r.lock_target))} NEAR`} />
        <p className="small">Made it: the pot burns <strong>{r.streak >= 2 ? '7%' : '5%'}</strong> Missed: idle burn ×2 for the next {hrs(6)}.</p>
        <p className="small muted">Streak: 🔥 {r.streak} day{r.streak === 1 ? '' : 's'} · best ever {Math.max(r.best_streak ?? 0, r.streak)}{r.last_made !== null && ` · yesterday ${r.last_made ? 'made ✓' : 'missed ✗'}`}</p>
      </div>
      <div className="panel stack">
        <div className="row between"><h2>{lv.next ? `To L${lv.next} ${LEVEL_NAME[lv.next]}` : 'Top level'}</h2>{lv.all_met_since && <span className="chip hot">hold {dur(lv.all_met_since + lv.hold_ms - now)}</span>}</div>
        {lv.rules.map(x => <div key={x.name} className={`rule-row ${x.met ? 'met' : ''}`}><span>{x.met ? '✓' : '✗'} {nm[x.name] ?? x.name}</span><span className="mono small">{val(x.name, x.current)} / {val(x.name, x.target)}</span></div>)}
      </div>
      </div>
    </div>
  );
}

const JOKERS = ['1-common-grin', '2-rare-laugh', '3-epic-wink', '4-mythic-starry', '5-wild-shades'];
const jokerOf = (s: string) => `url(/bg/jokers/${JOKERS[[...s].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 5]}.png)`;
function CardTile({ card, count, exp, now, actions }: { card: Card; count?: number; exp?: number; now: number; actions?: ReactNode }) {
  const t = TIER_OF[card]; const info = CARD_TEXT[card];
  return (
    <div className={`card t${t}`} style={{ ['--m' as any]: `url(/bg/symbols/${CARD_SYMBOL[card]}.png)` }}>
      <span className="sym" aria-hidden="true" />
      <div className="row between small"><span className="energy">⚡{info.energy}</span><span className="row gap"><span className="muted">{info.way}</span><InfoDot title={info.name}><CardInfo card={card} /></InfoDot></span></div>
      <div className="card-name">{info.name}{count && count > 1 ? <span className="count">×{count}</span> : null}</div>
      <div className="small tier">{TIER_NAME[t]}</div>
      <div className="small">{info.text}</div>
      {exp ? <div className={`small ${exp - now < 3 * HOUR ? 'down' : 'muted'}`}>fades in {dur(exp - now)}</div> : null}
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  );
}

function CardsTab({ ch, me, id, d, now, busy, call, coins }: TabProps) {
  const { hand, c } = d;
  const [snap, setSnap] = useState<HandView | null>(null);
  const [dealt, setDealt] = useState<Card[] | null>(null);
  // after a pack is claimed, work out which cards are new and show them
  useEffect(() => {
    if (!snap || !hand || hand.next_pack === snap.next_pack) return;
    const out: Card[] = [];
    for (const [k, n] of hand.commons) { const before = snap.commons.find(([x]) => x === k)?.[1] ?? 0; for (let i = 0; i < n - before; i++) out.push(k); }
    const had = new Set(snap.cards.map(x => `${x.card}:${x.exp}`));
    for (const x of hand.cards) if (!had.has(`${x.card}:${x.exp}`)) out.push(x.card);
    setDealt(out); setSnap(null);
  }, [hand, snap]);
  const commons = hand ? hand.commons.filter(([, n]) => n > 0) : [];
  const held = commons.reduce((a, [, n]) => a + n, 0);
  const levelDrops = [2, 3, 4].filter(l => l <= c.level && hand && !(hand.drops_claimed & (1 << l)));
  return (
    <div className="stack">
      {dealt && <div className="onboard" role="dialog" aria-label="Pack opened" onClick={() => setDealt(null)}>
        <div className="onboard-card reveal" onClick={e => e.stopPropagation()}>
          <h2 className="onboard-title">{dealt.length ? (dealt.length === 1 ? 'You drew a card' : `You drew ${dealt.length} cards`) : 'Pack opened'}</h2>
          {!dealt.length && <p className="muted small">Nothing new to show: your hand was full, so the pack may have replaced a card.</p>}
          <div className="reveal-row">{dealt.map((k, i) => <div key={i} className="reveal-card" style={{ ['--i' as any]: i }}><CardTile card={k} now={now} /></div>)}</div>
          <button className="btn primary" onClick={() => setDealt(null)}>Nice</button>
        </div>
      </div>}
      <div className="panel row between wrap">
        <div className="small">{hand ? <>Commons {held}/12 · Rares {hand.cards.filter(x => TIER_OF[x.card] === 1).length}/3 · Epics {hand.cards.filter(x => TIER_OF[x.card] === 2).length}/3</> : 'Buy to collect cards'}</div>
        <div className="row gap">
          {levelDrops.map(l => <button key={l} className="btn" disabled={!!busy} onClick={() => call(`L${l} drop`, 'claim_level_drop', { level: l })}>Claim L{l} drop</button>)}
          <button className="btn primary" disabled={!hand || !!busy || now < (hand?.next_pack ?? 0)} onClick={() => { setSnap(hand); call('Claim pack', 'claim_pack', {}, 0n, 'Pack opened'); }}>
            {hand && now < hand.next_pack ? `Next pack in ${dur(hand.next_pack - now)}` : 'Claim pack'}
          </button>
        </div>
      </div>
      {hand && hand.cut_used > 0 && <p className="small muted">Helping cut {dur(hand.cut_used)} off this pack's wait (max {hrs(1)}).</p>}
      <div className="panel">
        <h2>Your hand</h2>
        {!commons.length && !hand?.cards.length && <p className="muted">No cards yet: gm, then claim a pack.</p>}
        <div className="hand">
          {commons.map(([card, n]) => <CardTile key={card} card={card} count={n} now={now} actions={<>
            <CardPlay card={card} call={call} busy={busy} table={d.table} me={ch.me() ?? ''} coins={coins} selfId={id} price={c.price} raidOn={d.raid?.phase === 2} />
            <button className="btn small ghost" disabled={!!busy} onClick={() => call('Drop', 'drop_card', { card })}>Drop</button></>} />)}
          {hand?.cards.map((x, i) => <CardTile key={i} card={x.card} exp={x.exp} now={now} actions={<>
            <CardPlay card={x.card} call={call} busy={busy} table={d.table} me={ch.me() ?? ''} coins={coins} selfId={id} price={c.price} raidOn={d.raid?.phase === 2} />
            <button className="btn small ghost" disabled={!!busy} onClick={() => call('Drop', 'drop_card', { card: x.card })}>Drop</button></>} />)}
        </div>
      </div>
      <div className="panel">
        <h2>Table</h2>
        {!d.table.length && <p className="muted small">Nothing on the table. Cards that need backers or signers show here.</p>}
        {d.table.map(t => <TableRow key={t.id} t={t} now={now} me={(ch.me() ?? '')} busy={busy} call={call} />)}
        {!!d.hist.length && <><h3>Recent</h3>{d.hist.slice().reverse().map(t => <div key={t.id} className="small row between"><span>{CARD_TEXT[t.card].name} by {short(t.proposer)}</span><span className="muted">{t.result}</span></div>)}</>}
      </div>
      {c.harvest_until > now && <div className="panel row between wrap"><div><h2>Harvest is open</h2><p className="small muted">{c.harvest_claims} of 25 shares taken · ends in {dur(c.harvest_until - now)} · you need a gm in the last 24h</p></div>
        <button className="btn primary" disabled={!!busy || c.harvest_claims >= 25} onClick={() => call('Harvest', 'harvest_claim', {}, 0n, 'Share taken from the reward pool')}>Take my share</button></div>}
      <DuelsAndBounties d={d} now={now} me={ch.me() ?? ''} busy={busy} call={call} />
    </div>
  );
}

/** Open duels and bounties: accept a duel against you, pledge to a bounty. */
function DuelsAndBounties({ d, now, me, busy, call }: { d: CoinData; now: number; me: string; busy: string; call: TabProps['call'] }) {
  const [amt, setAmt] = useState(20);
  const duels = d.duels.filter(x => x.phase < 2), bounties = d.bounties.filter(x => x.phase === 0);
  const goal = (q: Question) => typeof q === 'string' ? 'the coin is a net buyer' : 'Line' in q ? `price above ${toMicro(q.Line.price).toFixed(3)} N/1M` : 'Crowd' in q ? `${q.Crowd.n}+ new buyers` : `Vault share +${q.Vault.bps / 100} points`;
  if (!duels.length && !bounties.length && !d.duels.length && !d.bounties.length) return null;
  return (
    <div className="panel stack">
      <h2>Duels and bounties</h2>
      {duels.map(x => <div key={x.id} className="table-row"><div className="row between wrap"><strong>Duel: {short(x.a)} vs {short(x.b)}</strong><span className="small muted">{fmtTok(toTok(x.stake))} each · {x.a_yes ? `${short(x.a)} says net buyer` : `${short(x.a)} says not a net buyer`} · {x.phase === 0 ? `waiting, ${dur(x.created + 15 * MIN / TS - now)} left` : `ends in ${dur(x.end - now)}`}</span></div>
        {x.phase === 0 && x.b === me && <button className="btn small primary" disabled={!!busy} onClick={() => call('Accept duel', 'duel_accept', { id: x.id }, 0n, 'Duel accepted')}>Accept the duel</button>}</div>)}
      {bounties.map(x => <div key={x.id} className="table-row"><div className="row between wrap"><strong>Bounty by {short(x.sponsor)}</strong><span className="small muted">goal: {goal(x.question)} · {fmtTok(toTok(x.total))} pledged by {x.pledges.length} · ends in {dur(x.end - now)}</span></div>
        <div className="row gap small"><input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} title="tokens (thousands)" /> k tokens <button className="btn small" disabled={!!busy} onClick={() => call('Pledge', 'bounty_pledge', { id: x.id, amount: tokToUnits(amt * 1000).toString() }, 0n, 'Pledged')}>Pledge</button></div></div>)}
      {[...d.duels.filter(x => x.phase === 2), ...d.bounties.filter(x => x.phase === 1)].slice(-4).map((x, i) => <div key={i} className="small row between"><span>{'a' in x ? `Duel ${short(x.a)} vs ${short(x.b)}` : `Bounty by ${short(x.sponsor)}`}</span><span className="muted">{x.result}</span></div>)}
    </div>
  );
}

function TableRow({ t, now, me, busy, call }: { t: Proposal; now: number; me: string; busy: string; call: TabProps['call'] }) {
  const [amt, setAmt] = useState(t.card === 'Ember' ? 2 / NS : t.card === 'BlackHole' ? 50 : 5 / NS);
  const [yes, setYes] = useState(true);
  const signed = SIGNED.includes(t.card), rush = t.card === 'Stampede' || t.card === 'Squeeze';
  const phaseName = t.phase === 0 ? (signed ? 'signing' : 'backing') : t.phase === 1 ? (t.card === 'Prophecy' ? 'betting' : t.card === 'BlackHole' ? 'throwing window' : rush ? 'crowd window' : 'fuel window') : t.card === 'Prophecy' ? 'waiting for the answer' : 'fires within 2 min';
  const mine = t.backers.includes(me) || t.proposer === me;
  const yesT = t.bets.filter(b => b.yes).reduce((a, b) => a + toTok(b.amount), 0), noT = t.bets.filter(b => !b.yes).reduce((a, b) => a + toTok(b.amount), 0);
  return (
    <div className={`table-row t${TIER_OF[t.card]}`}>
      <div className="row between wrap">
        <strong>{CARD_TEXT[t.card].name}</strong>
        <span className="small muted">by {short(t.proposer)} · {phaseName} · {dur(t.phase_end - now)}</span>
      </div>
      {t.question && <div className="small">Q: {typeof t.question === 'string' ? 'Will the coin be a net buyer over 2h?' : 'Line' in t.question ? `Price above ${toMicro(t.question.Line.price).toFixed(3)} N/1M?` : 'Crowd' in t.question ? `${t.question.Crowd.n}+ new buyers (≥ 1 NEAR each)?` : `Vault share +${t.question.Vault.bps / 100} points?`}</div>}
      {t.phase === 0 && <div className="row gap small"><Bar label={signed ? 'signers' : t.card === 'Ember' ? 'copies' : 'backers'} value={t.backers.length} max={t.needed} text={`${t.backers.length}/${t.needed}`} />
        {!mine && <button className="btn small" disabled={!!busy} onClick={() => call(signed ? 'Sign' : 'Back', signed ? 'sign' : 'back', { id: t.id }, 0n, 'Thanks: your next pack comes 10 min sooner')}>{signed ? 'Sign' : t.card === 'Ember' ? 'Add my Ember' : 'Back'}</button>}</div>}
      {t.card === 'Ember' && t.phase === 0 && <div className="row gap small">Stoke: <input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} /> NEAR (max {nearAmt(5)}) <button className="btn small" disabled={!!busy} onClick={() => call('Stoke', 'stoke', { id: t.id }, nearToYocto(amt))}>Stoke</button> <span className="muted">stoked {fmtNear(toNear(t.chip_total))}</span></div>}
      {t.card === 'Inferno' && t.phase === 1 && <div className="row gap small">Fuel: <input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} /> NEAR (max {nearAmt(20)}) <button className="btn small" disabled={!!busy} onClick={() => call('Fuel', 'fuel', { id: t.id }, nearToYocto(amt), `Fuelled: locked ${hrs(24)} with +5%`)}>Fuel</button> <span className="muted">{fmtNear(toNear(t.chip_total))} N from {t.chips.length} wallets</span></div>}
      {t.target && <div className="small">Pact with ${short(t.target).split('.')[0].toUpperCase()}</div>}
      {rush && t.phase === 1 && <div className="row gap small">Put in: <input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} /> NEAR (max {nearAmt(10)}) <button className="btn small" disabled={!!busy} onClick={() => call('Join the batch', 'rush', { id: t.id }, nearToYocto(amt), 'You are in the batch')}>Join</button> <span className="muted">{fmtNear(toNear(t.chip_total))} in · pot adds {t.card === 'Squeeze' ? '50%' : '20%'} with 10+ wallets</span></div>}
      {t.card === 'BlackHole' && t.phase === 1 && <div className="row gap small">Throw: <input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} title="tokens (thousands)" />k tokens <button className="btn small" disabled={!!busy} onClick={() => call('Throw in', 'throw_in', { id: t.id, amount: tokToUnits(amt * 1000).toString() }, 1n, 'Thrown in')}>Throw in</button> <span className="muted">{fmtTok(t.bets.reduce((a, b) => a + toTok(b.amount), 0))} thrown</span></div>}
      {t.card === 'Prophecy' && t.phase >= 1 && <div className="row gap small wrap">
        <span>Yes {fmtTok(yesT)} · No {fmtTok(noT)} · {new Set(t.bets.map(b => b.account)).size} wallets (min 8)</span>
        {t.phase === 1 && <><select value={yes ? 'y' : 'n'} onChange={e => setYes(e.target.value === 'y')}><option value="y">Yes</option><option value="n">No</option></select>
          <input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} title="tokens (thousands)" />k tokens
          <button className="btn small" disabled={!!busy} onClick={() => call('Bet', 'bet', { id: t.id, yes, amount: tokToUnits(amt * 1000).toString() }, 1n, 'Bet placed: no trading until it resolves')}>Bet</button></>}
      </div>}
    </div>
  );
}

function VaultTab({ d, now, busy, call }: TabProps) {
  const { h, c } = d;
  const [amt, setAmt] = useState(0); const [hours, setHours] = useState(24);
  if (!h) return <div className="panel muted">Buy to use the Vault.</div>;
  return (
    <div className="grid2">
      <div className="panel stack">
        <h2>Lock</h2>
        <p className="small muted">Locked tokens can't be sold. They're safe from idle burn and earn half of everything idle burn and early exits take, by weight.</p>
        <label>Tokens (you have {fmtTok(toTok(h.balance))}) <input type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} /></label>
        <div className="seg" role="group">{[6, 24, 72].map(x => <button key={x} aria-pressed={hours === x} onClick={() => setHours(x)}>{hrs(x)} ×{x === 6 ? '1' : x === 24 ? '1.5' : '2'}</button>)}</div>
        <div className="row gap"><button className="btn ghost small" onClick={() => setAmt(Math.floor(toTok(h.balance)))}>All</button>
          <button className="btn primary" disabled={!!busy || amt <= 0} onClick={() => call('Lock', 'lock', { amount: tokToUnits(amt).toString(), hours }, 1n, `Locked for ${hrs(hours)}`)}>Lock {fmtTok(amt)} for {hrs(hours)}</button></div>
        <h3>Coin Vault</h3>
        <Row k="Locked" v={`${fmtTok(toTok(c.vault_locked))} (${pct(toTok(c.vault_locked), toTok(c.circulating)).toFixed(1)}% of circulating)`} />
      </div>
      <div className="panel stack">
        <h2>Your locks</h2>
        {!h.locks.length && <p className="muted small">No locks.</p>}
        {h.locks.map((l, i) => <div key={i} className="row between lock-row">
          <span className="mono">{fmtTok(toTok(l.amount))} ×{l.mult / 10}</span>
          {now >= l.until ? <button className="btn small primary" disabled={!!busy} onClick={() => call('Unlock', 'unlock', { index: i })}>Unlock</button>
            : <span className="row gap small"><span className="muted">{dur(l.until - now)}</span><button className="btn small danger" disabled={!!busy} onClick={() => call('Leave early', 'leave_early', { index: i }, 1n, 'Left early: 20% penalty')}>Leave early (−20%)</button></span>}
        </div>)}
        <Row k="Earned so far" v={fmtTok(toTok(h.vault_earned))} />
        <button className="btn" disabled={!!busy || toTok(h.vault_earned) <= 0} onClick={() => call('Claim', 'claim_vault')}>Claim earnings</button>
        <h3>Idle burn</h3>
        <Row k="Last gm" v={h.last_gm ? `${dur(now - h.last_gm)} ago` : 'never'} />
        <Row k="Burn starts" v={now >= h.idle_burn_starts ? <span className="down">running (1% every {hrs(6)})</span> : `in ${dur(h.idle_burn_starts - now)}`} />
        <Row k="Lost today / 8% cap" v={`${fmtTok(toTok(h.lost_today))} / ${fmtTok(toTok(h.loss_cap_today))}`} />
      </div>
    </div>
  );
}

function RaidTab({ ch, id, d, now, busy, call, coins, act, me }: TabProps) {
  const { raid, c, hand } = d;
  const [target, setTarget] = useState('');
  const others = coins.filter(x => x.account_id !== id);
  const [slots, setSlots] = useState<(Card | null)[]>([null, null, null]);
  useEffect(() => { setSlots(d.plan.length === 3 ? d.plan.map(x => (x ? TACTIC_CARDS[x - 1] : null)) : [null, null, null]); }, [d.plan.join()]);
  const tactics: [Card, number][] = [...(hand ? hand.commons.filter(([k]) => TACTIC_CARDS.includes(k)) : []), ...TACTIC_CARDS.filter(k => TIER_OF[k] === 1).map(k => [k, hand?.cards.filter(x => x.card === k).length ?? 0] as [Card, number])].filter(([, n]) => n > 0);
  const has = (k: Card) => !!hand && (hand.commons.some(([x, n]) => x === k && n > 0) || hand.cards.some(x => x.card === k));
  const roundStart = (i: number) => raid ? raid.muster_end + i * 25 * MIN : 0;
  const phase = raid ? (raid.phase === 0 ? 'signing' : raid.phase === 1 ? 'waiting for the target' : raid.phase === 3 ? 'settling' : now < raid.muster_end ? `Muster: ${dur(raid.muster_end - now)}` : raid.round !== null ? `Round ${raid.round + 1}: ${dur(roundStart(raid.round) + 20 * MIN - now)}` : now >= raid.end ? 'over: settle it' : 'break') : '';
  const other = raid ? (raid.attacking ? raid.defender : raid.attacker) : '';
  return (
    <div className="stack">
      {!raid && <div className="panel stack">
        <h2>Start a raid</h2>
        <p className="small muted">Needs {[0, 0, 3, 5, 8][c.level] || 3} signers at L{c.level}. A normal raid needs no card and no Energy. The target can't decline if it's the same level or higher, not shielded and not near graduation. A Friendly Raid (no spoils) or Hard Raid (double spoils, a banner) uses its card.</p>
        <div className="row gap"><select value={target} onChange={e => setTarget(e.target.value)}><option value="">Pick a coin…</option>{others.map(o => <option key={o.account_id} value={o.account_id}>${o.symbol}</option>)}</select>
          <button className="btn primary" disabled={!target || !!busy || c.level < 2} onClick={() => call('Propose raid', 'start_raid', { target })}>Propose raid</button>
          {has('FriendlyRaid') && <button className="btn" disabled={!target || !!busy || c.level < 2} onClick={() => call('Friendly raid', 'start_friendly_raid', { target })}>Friendly raid</button>}
          {has('HardRaid') && <button className="btn" disabled={!target || !!busy || c.level < 2} onClick={() => call('Hard raid', 'start_hard_raid', { target })}>Hard raid</button>}</div>
        {c.level < 2 && <p className="small down">Raids start at L2.</p>}
      </div>}
      {raid && <div className="panel stack">
        <div className="row between wrap"><h2>{raid.attacking ? `$${c.symbol} ⚔ ${short(other).split('.')[0].toUpperCase()}` : `${short(other).split('.')[0].toUpperCase()} ⚔ $${c.symbol}`}</h2><span className="row gap">{raid.kind === 1 && <span className="chip">Friendly</span>}{raid.kind === 2 && <span className="chip hot">Hard</span>}<span className="chip hot">{phase}</span></span></div>
        {raid.phase === 0 && <div className="row gap"><Bar label="signers" value={raid.backers} max={raid.needed} text={`${raid.backers}/${raid.needed}`} />
          <button className="btn" disabled={!!busy} onClick={() => call('Sign raid', 'sign_raid')}>Sign</button>
          <button className="btn primary" disabled={!!busy} onClick={() => call('Launch raid', 'launch_raid', {}, 0n, 'Raid sent to the target')}>Launch</button></div>}
        {raid.phase === 2 && <>
          <div className="rounds">{[0, 1, 2].map(i => <div key={i} className={`round ${raid.round === i ? 'live' : ''}`}>
            <div className="small muted">Round {i + 1}</div>
            <div className="mono">{(Number(raid.live_base[i]) / 100).toFixed(1)}</div>
            <div className="small">Buy {(raid.buy[i] / 100).toFixed(1)} · Crowd {raid.crowd[i]} · Lock {(raid.lock[i] / 100).toFixed(1)}</div>
            <div className="small">{raid.tactic[i] ? `tactic: ${tacticName(raid.tactic[i])}` : 'tactic hidden'}</div>
            {raid.scout[i] ? <div className="small gold">scouted: {raid.scout[i] === 255 ? 'no tactic' : tacticName(raid.scout[i])}</div> : null}
          </div>)}</div>
          <h3>Your plan <span className="muted small">({raid.planners} wallets have plans)</span></h3>
          <div className="row gap wrap">{slots.map((s, i) => <label key={i} className="small">R{i + 1}{' '}
            <select disabled={now >= roundStart(i)} value={s ?? ''} onChange={e => setSlots(x => x.map((y, j) => (j === i ? ((e.target.value || null) as Card | null) : y)))}>
              <option value="">empty</option>{TACTIC_CARDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select></label>)}
            <button className="btn" disabled={!!busy} onClick={() => call('Save plan', 'set_plan', { slots })}>Save plan</button>
            <span className="small muted">In hand: {tactics.map(([k, n]) => `${k} ×${n}`).join(', ') || 'none'}</span></div>
          <div className="row gap wrap"><button className="btn primary" disabled={!!busy || raid.round === null} onClick={() => call('Battle cry', 'battle_cry', {}, 0n, 'Battle cry! +Crowd')}>📯 Battle cry</button>
            {has('Scout') && <button className="btn" disabled={!!busy} onClick={() => call('Scout', 'scout', {}, 0n, 'Scouting: the answer lands in a few seconds')}>Scout the next round</button>}
            {now >= raid.end && raid.attacking && <button className="btn" disabled={!!busy} onClick={() => call('Settle', 'settle_raid', {}, 0n, 'Raid settled')}>Settle raid</button>}
            {now >= raid.end && !raid.attacking && <button className="btn" disabled={!!busy} onClick={() => act('Settle', () => ch.call(other, 'settle_raid'), 'Raid settled')}>Settle raid</button>}</div>
        </>}
      </div>}
      {!!d.raids.length && <div className="panel"><h2>Past raids</h2>{d.raids.slice().reverse().map(r => <div key={r.seq} className="row between small past-raid">
        <span>{r.attacking ? `attacked ${short(r.defender).split('.')[0].toUpperCase()}` : `defended vs ${short(r.attacker).split('.')[0].toUpperCase()}`}</span>
        <span>{r.result ? <><strong className={r.result.outcome > 0 ? 'up' : r.result.outcome < 0 ? 'down' : ''}>{r.result.outcome > 0 ? 'won' : r.result.outcome < 0 ? 'lost' : 'tie'}</strong> · spoils {fmtNear(toNear(r.result.spoils))} N · tactics {r.tactic.map(tacticName).join(' / ')}</> : r.note}</span>
        {r.result && r.result.outcome > 0 && <button className="btn small" disabled={!!busy} onClick={() => call('Win pack', 'claim_raid_pack', {}, 0n, 'Win pack opened')}>Claim win pack</button>}
      </div>)}</div>}
    </div>
  );
}

function LogTab({ d }: TabProps) {
  const { c, log } = d;
  const [f, setF] = useState<'mb' | 'all'>('mb');
  const rows = useMemo(() => log.filter(e => f === 'all' || ['mint', 'burn', 'to_vault'].includes(e.kind)), [log, f]);
  return (
    <div className="panel">
      <div className="row between wrap"><h2>Every mint and burn</h2><div className="seg small" role="group"><button aria-pressed={f === 'mb'} onClick={() => setF('mb')}>Mints & burns</button><button aria-pressed={f === 'all'} onClick={() => setF('all')}>Everything</button></div></div>
      <p className="mono small">Total supply 1,000,000,000 → {Math.round(toTok(c.total_supply)).toLocaleString()} (−{(toTok(c.burned) / 1e7).toFixed(3)}%)</p>
      <table className="log"><thead><tr><th>Time (UTC)</th><th>What</th><th>Tokens</th><th>NEAR</th><th>Who / why</th></tr></thead>
        <tbody>{rows.map(e => <tr key={e.seq} className={e.kind}>
          <td className="mono">{new Date(e.at).toISOString().slice(5, 16).replace('T', ' ')}</td>
          <td>{({ mint: '🌱 mint', burn: '🔥 burn', to_vault: '🔒 to Vault', buy: 'buy', sell: 'sell', lock: 'lock', unlock: 'unlock', card: '🃏 card', raid: '⚔ raid', ritual_made: '🕯 ritual made', ritual_missed: 'ritual missed', level_up: '⬆ level', seed: 'seed', graduated: '🎓 graduated' } as Record<string, string>)[e.kind] ?? e.kind}</td>
          <td className="mono">{toTok(e.amount) ? fmtTok(toTok(e.amount)) : ''}</td>
          <td className="mono">{toNear(e.near) ? fmtNear(toNear(e.near)) : ''}</td>
          <td className="small">{e.account ? short(e.account) : ''} {e.memo}</td>
        </tr>)}</tbody></table>
      <p className="small muted">Also emitted as NEP-297 events (nep141 ft_mint / ft_burn / ft_transfer and rulecard game events) for any indexer.</p>
    </div>
  );
}

// ------------------------------------------------------------------ small pieces
function Ring({ value, label, small }: { value: number; label: string; small?: boolean }) {
  const r = small ? 16 : 22, c = 2 * Math.PI * r, s = small ? 40 : 54;
  return (
    <span className="ring-wrap" title={`${label}: ${value.toFixed(0)}%`}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
        <circle cx={s / 2} cy={s / 2} r={r} className="ring-bg" />
        <circle cx={s / 2} cy={s / 2} r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform={`rotate(-90 ${s / 2} ${s / 2})`} />
      </svg>
      <span className="small">{label} {value.toFixed(0)}%</span>
    </span>
  );
}
function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  return <div className="bar"><span className="small">{label}</span><div className="meter"><i style={{ width: `${pct(value, max)}%` }} /></div><span className="mono small">{text}</span></div>;
}
function Row({ k, v }: { k: string; v: ReactNode }) { return <div className="row between small"><span className="muted">{k}</span><span className="mono">{v}</span></div>; }
