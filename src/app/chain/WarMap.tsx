// War Map: every coin as a block sized by its war points, the standings, the latest raids and each coin's chronicle.
// Communities fighting communities. Everything is computed here from what the coins report (get_coin, get_raids, get_log): no extra contract state.
//
// Points: joining 10 · +3 for each level above L1 · a raid win +L and a loss -L (L = the raid's level: 2, 3 or 4) · never below 4.
// Raids are replayed in the order they ended, so anyone can recompute the same map from the chain.
import { useEffect, useMemo, useState } from 'react';
import type { Net } from './net';
import type { CoinEntry, CoinView, Ritual, RaidView, LogEntry } from './types';
import { toNear, fmtNear } from './near';
import { LEVEL_NAME } from './types';

const JOIN_POINTS = 10, LEVEL_POINTS = 3, FLOOR_POINTS = 4;
const TAG_MS = 12 * 3_600_000; // "Conquered by" and "+N" tags last 12h (game time; 1h in demo mode)

interface Row { id: string; sym: string; c: CoinView; r: Ritual; raid: RaidView | null; raids: RaidView[]; log: LogEntry[]; icon: string | null; won: number; lost: number }
interface Block { id: string; sym: string; v: number; x: number; y: number; w: number; h: number }
interface Event { at: number; winner: string; loser: string; level: number; x: RaidView }

const sym = (id: string) => id.split('.')[0].toUpperCase();
const PALETTE = ['#ff7a1a', '#4c8dff', '#f0518c', '#f5b729', '#2dd4bf', '#a78bfa'];
const JOKERS = ['1-common-grin', '2-rare-laugh', '3-epic-wink', '4-mythic-starry', '5-wild-shades'];
const hsh = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const accent = (id: string) => PALETTE[hsh(id) % PALETTE.length];
const joker = (id: string) => `url(/bg/jokers/${JOKERS[hsh(id) % JOKERS.length]}.png)`;
const art = (id: string) => ({ ['--ac' as any]: accent(id), ['--m' as any]: joker(id) });
const levelAt = (c: CoinView, t: number) => Math.max(1, c.level_at.filter(a => a <= t).length);

/** Split the items into two groups of about equal weight and recurse, alternating the cut direction by the box's shape. */
function layout(items: { id: string; sym: string; v: number }[], x: number, y: number, w: number, h: number, out: Block[]) {
  if (!items.length) return;
  if (items.length === 1) { out.push({ ...items[0], x, y, w, h }); return; }
  const total = items.reduce((a, i) => a + i.v, 0);
  let acc = 0, k = 1;
  for (let i = 0; i < items.length - 1; i++) { acc += items[i].v; k = i + 1; if (acc >= total / 2) break; }
  const left = items.slice(0, k), right = items.slice(k);
  const frac = left.reduce((a, i) => a + i.v, 0) / total;
  if (w >= h) { layout(left, x, y, w * frac, h, out); layout(right, x + w * frac, y, w * (1 - frac), h, out); }
  else { layout(left, x, y, w, h * frac, out); layout(right, x, y + h * frac, w, h * (1 - frac), out); }
}

const left = (ms: number) => { const t = Math.max(0, Math.round(ms / 1000)), m = Math.floor(t / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m ${t % 60}s` : `${t}s`; };
const ago = (ms: number) => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

export default function WarMap({ ch, coins, tick, go }: { ch: Net; coins: CoinEntry[]; tick: number; go: (id: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [view, setView] = useState<'arena' | 'blocks'>('arena');
  useEffect(() => {
    let live = true;
    (async () => {
      const out: Row[] = [];
      for (const e of coins) {
        try {
          const [c, r, raid, raids, log, md] = await Promise.all([
            ch.view<CoinView>(e.account_id, 'get_coin'), ch.view<Ritual>(e.account_id, 'get_ritual'), ch.view<RaidView | null>(e.account_id, 'get_raid'),
            ch.view<RaidView[]>(e.account_id, 'get_raids'), ch.view<LogEntry[]>(e.account_id, 'get_log', { limit: 100 }),
            ch.view<{ icon: string | null }>(e.account_id, 'ft_metadata').catch(() => ({ icon: null })),
          ]);
          const done = raids.filter(x => x.result);
          // a raid is recorded on both coins, each from its own side (outcome > 0: this coin won)
          const won = done.filter(x => x.result!.outcome > 0).length;
          const lost = done.filter(x => x.result!.outcome < 0).length;
          out.push({ id: e.account_id, sym: sym(e.account_id), c, r, raid, raids, log, icon: md.icon ?? null, won, lost });
        } catch { /* skip a coin that can't be read */ }
      }
      out.sort((a, b) => b.c.level - a.c.level || b.r.streak - a.r.streak || Number(BigInt(b.c.mcap) - BigInt(a.c.mcap)));
      if (live) setRows(out);
    })();
    return () => { live = false; };
  }, [ch, coins, tick]);

  // every finished raid once (from the attacker's side), oldest first, with the raid's level taken from the attacker's level at its start
  const { events, points, blocks } = useMemo(() => {
    const byId = new Map(rows.map(r => [r.id, r]));
    const events: Event[] = [];
    for (const r of rows) for (const x of r.raids) {
      if (!x.attacking || !x.result || x.result.outcome === 0 || !byId.has(x.defender)) continue;
      const level = Math.min(4, Math.max(2, levelAt(r.c, x.start)));
      events.push({ at: x.end, winner: x.result.outcome > 0 ? r.id : x.defender, loser: x.result.outcome > 0 ? x.defender : r.id, level, x });
    }
    events.sort((a, b) => a.at - b.at);
    const points = new Map(rows.map(r => [r.id, JOIN_POINTS + LEVEL_POINTS * (r.c.level - 1)]));
    for (const e of events) {
      points.set(e.winner, (points.get(e.winner) ?? 0) + e.level);
      points.set(e.loser, Math.max(FLOOR_POINTS, (points.get(e.loser) ?? 0) - e.level));
    }
    const items = rows.map(r => ({ id: r.id, sym: r.sym, v: Math.max(FLOOR_POINTS, points.get(r.id) ?? JOIN_POINTS) })).sort((a, b) => b.v - a.v);
    const blocks: Block[] = []; layout(items, 0, 0, 100, 100, blocks);
    return { events, points, blocks };
  }, [rows]);

  const now = rows[0]?.c.now ?? 0;
  const tag = ch.scale === 'demo' ? TAG_MS / 12 : TAG_MS;
  const lastWin = (id: string) => [...events].reverse().find(e => e.winner === id && now - e.at < tag);
  const lastLoss = (id: string) => [...events].reverse().find(e => e.loser === id && now - e.at < tag);
  const champion = blocks.length > 1 && blocks[0].v > blocks[1].v ? blocks[0].id : blocks.length === 1 ? blocks[0].id : undefined; // only a strict leader is crowned
  const feed = [...events].reverse().slice(0, 12);
  const liveRaids = rows.filter(r => r.raid?.phase === 2 && r.raid.attacking);

  return (
    <section>
      <div className="row between wrap"><h1>War Map</h1>
        <div className="seg" role="group" aria-label="Map style"><button aria-pressed={view === 'arena'} onClick={() => setView('arena')}>Arena</button><button aria-pressed={view === 'blocks'} onClick={() => setView('blocks')}>Blocks</button></div>
      </div>
      <p className="muted">Coins fight coins. Points: 10 to join, +3 for every level above L1, and each raid moves its level in points (L2 = 2, L3 = 3, L4 = 4) from the loser to the winner. Nobody drops below 4.</p>
      {!!rows.length && <div className="panel strip war-strip">
        <div><small>COINS AT WAR</small><b className="mono">{rows.length}</b></div>
        <div><small>RAIDS LIVE</small><b className="mono">{liveRaids.length}</b></div>
        <div><small>RAIDS FOUGHT</small><b className="mono">{events.length}</b></div>
        <div><small>WAR POINTS</small><b className="mono">{blocks.reduce((a, x) => a + x.v, 0)}</b></div>
        <div><small>LEADER</small><b className="mono">{champion ? `$${sym(champion)}` : 'none yet'}</b></div>
      </div>}
      {!!liveRaids.length && <div className="live-raids">{liveRaids.map(r => {
        const rd = r.raid!, a1 = rd.attacker, d1 = rd.defender;
        return (
          <button key={r.id} className="lraid" onClick={() => go(r.id)}>
            <span className="lr-tag mono"><i className="rl-dot" />RAID LIVE</span>
            <span className="lr-vs"><strong style={{ color: accent(a1) }}>${sym(a1)}</strong><em className="vs">vs</em><strong style={{ color: accent(d1) }}>${sym(d1)}</strong></span>
            <span className="pips" aria-label="Rounds">{[0, 1, 2].map(k => <i key={k} className={`pip ${rd.round === null ? '' : k < rd.round ? 'w' : k === rd.round ? 'live' : ''}`} />)}</span>
            <span className="lr-meta mono">{rd.round === null ? 'MUSTERING' : `ROUND ${rd.round + 1} OF 3`} · ENDS IN {left(rd.end - now)}</span>
            <span className="lr-go">Open →</span>
          </button>
        );
      })}</div>}
      {!rows.length && <div className="panel muted">No coins to rank yet.</div>}

      {!!rows.length && view === 'blocks' && <div className="treemap" role="img" aria-label="War Map: each coin's block is sized by its points">
        {blocks.map(b => {
          const r = rows.find(x => x.id === b.id)!, win = lastWin(b.id), loss = lastLoss(b.id), raiding = r.raid?.phase === 2;
          const big = b.w > 22 && b.h > 28;
          return (
            <button key={b.id} className={`tm-block ${raiding ? 'raiding' : ''} ${b.id === champion ? 'champ' : ''}`} onClick={() => go(b.id)}
              style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, ...art(b.id) }}
              title={`$${b.sym}: ${b.v} points. ${r.won}–${r.lost} in raids.`}>
              <span className="tm-in">
                <span className="tm-art" aria-hidden="true" />
                <span className="tm-head">
                  {r.icon ? <img className="tm-icon" src={r.icon} alt="" width={big ? 36 : 22} height={big ? 36 : 22} /> : null}
                  <strong className="tm-sym">${b.sym}</strong>
                  {b.id === champion && <span className="tm-crown">Leader</span>}
                </span>
                <span className="tm-pts mono">{b.v}<small>pts</small></span>
                {big && <span className="tm-chips"><span className="tm-chip">L{r.c.level} {LEVEL_NAME[r.c.level]}</span><span className="tm-chip">streak {r.r.streak}</span><span className="tm-chip">{r.won}W {r.lost}L</span></span>}
                <span className="tm-tags">
                  {raiding && <span className="tm-tag hot">{r.raid!.attacking ? 'Attacking' : 'Defending'} ${sym(r.raid!.attacking ? r.raid!.defender : r.raid!.attacker)}</span>}
                  {win && <span className="tm-tag up">+{win.level} from ${sym(win.loser)}</span>}
                  {loss && <span className="tm-tag down">Conquered by ${sym(loss.winner)} · {ago(now - loss.at)}</span>}
                  {r.c.graduated && <span className="tm-tag">Graduated</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>}

      {!!rows.length && view === 'arena' && <Arena blocks={blocks} rows={rows} events={events} liveRaids={liveRaids} champion={champion} go={go} />}

      <div className="panel">
        <h2>Standings</h2>
        <div className="stand" role="list">
          {[...rows].sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0)).map((r, i) => {
            const pts = Math.max(FLOOR_POINTS, points.get(r.id) ?? JOIN_POINTS), top = Math.max(...rows.map(x => Math.max(FLOOR_POINTS, points.get(x.id) ?? JOIN_POINTS)));
            return (
              <button key={r.id} role="listitem" className={`srow ${i === 0 ? 'first' : ''}`} style={art(r.id)} onClick={() => go(r.id)}>
                <span className="rank mono">{i + 1}</span>
                <span className="swho"><strong>${r.sym}</strong><small className="muted">L{r.c.level} {LEVEL_NAME[r.c.level]} · {fmtNear(toNear(r.c.mcap))} NEAR mcap</small></span>
                <span className="pbar" aria-hidden="true"><i style={{ width: `${Math.max(6, (pts / top) * 100)}%` }} /></span>
                <span className="spts mono">{pts}<small>pts</small></span>
                <span className="wl mono"><b className="up">{r.won}W</b><b className="down">{r.lost}L</b></span>
                <span className="sstreak"><small className="muted">streak</small><b className="mono">{r.r.streak}</b><small className="muted">best {Math.max(r.r.best_streak ?? 0, r.r.streak)}</small></span>
                <span className="sday">{r.r.last_made === null ? <span className="pill">no data</span> : r.r.last_made ? <span className="pill ok">Ritual made</span> : <span className="pill bad">Ritual missed</span>}</span>
                <span className="snow">{r.raid && r.raid.phase === 2 ? <span className="pill hot">{r.raid.attacking ? 'Attacking' : 'Defending'} ${sym(r.raid.attacking ? r.raid.defender : r.raid.attacker)}</span> : r.raid && r.raid.phase < 2 ? <span className="pill">Forming a raid</span> : <span className="pill">At peace</span>}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h2>Latest raids</h2>
        {!feed.length && <p className="muted small">No raid has finished yet.</p>}
        <div className="raidfeed">
          {feed.map((e, i) => (
            <div key={i} className="rraid">
              <div className="rr-top">
                <span className={`side ${e.winner === e.x.attacker ? 'win' : 'lose'}`} style={art(e.x.attacker)}>${sym(e.x.attacker)}</span>
                <span className="vs" aria-label="raided">vs</span>
                <span className={`side ${e.winner === e.x.defender ? 'win' : 'lose'}`} style={art(e.x.defender)}>${sym(e.x.defender)}</span>
                <span className="pill">L{e.level}</span>
                <span className="muted small rr-ago">{ago(now - e.at)}</span>
              </div>
              <div className="rr-mid">
                <span className="pips" aria-label={`Rounds: ${e.x.result!.rounds.map(n => (n > 0 ? 'won' : n < 0 ? 'lost' : 'tied')).join(', ')}`}>{e.x.result!.rounds.map((n, k) => <i key={k} className={`pip ${n > 0 ? 'w' : n < 0 ? 'l' : 't'}`} />)}</span>
                <span className="rr-res"><b className="up">${sym(e.winner)} +{e.level}</b><b className="down">${sym(e.loser)} −{e.level}</b></span>
                <span className="muted small">spoils {fmtNear(toNear(e.x.result!.spoils))} NEAR</span>
              </div>
            </div>
          ))}
        </div>
        {!!rows.length && !feed.length && <p className="small muted">Ties move no points.</p>}
      </div>

      {!!rows.length && <div className="panel">
        <h2>Chronicle</h2>
        <p className="small muted">Each coin's story, written from its own on-chain log and raid record.</p>
        <div className="chronicle">
          {rows.map(r => <Chronicle key={r.id} r={r} now={now} />)}
        </div>
      </div>}
    </section>
  );
}

function Chronicle({ r, now }: { r: Row; now: number }) {
  const lines: { at: number; text: string; tone?: 'up' | 'down' }[] = [];
  let omenSeen = false; // the log is newest first: keep the latest Omen only, or they crowd out everything else
  for (const e of r.log) {
    if (e.kind === 'ritual_made') lines.push({ at: e.at, tone: 'up', text: `Made its Ritual (${e.memo}): the pot burned ${fmtNear(toNear(e.near))} NEAR.` });
    else if (e.kind === 'ritual_missed') lines.push({ at: e.at, tone: 'down', text: `Missed its Ritual (${e.memo}): sleepers' bags burn twice as fast for a while.` });
    else if (e.kind === 'level_up') lines.push({ at: e.at, tone: 'up', text: `Reached ${e.memo}.` });
    else if (e.kind === 'graduated') lines.push({ at: e.at, tone: 'up', text: 'Graduated: the curve sold out.' });
    else if (e.kind === 'omen' && !omenSeen) { omenSeen = true; lines.push({ at: e.at, text: `Latest Omen: ${e.memo}.` }); }
  }
  for (const x of r.raids) {
    if (!x.result || x.result.outcome === 0) { if (x.result) lines.push({ at: x.end, text: `Tied a raid with $${sym(x.attacking ? x.defender : x.attacker)}.` }); continue; }
    const other = sym(x.attacking ? x.defender : x.attacker), won = x.result.outcome > 0;
    lines.push({ at: x.end, tone: won ? 'up' : 'down', text: x.attacking ? (won ? `Raided $${other} and won.` : `Raided $${other} and lost.`) : (won ? `Held against a raid by $${other}.` : `Was raided by $${other} and lost.`) });
  }
  lines.sort((a, b) => b.at - a.at);
  const shown = lines.slice(0, 6);
  return (
    <div className="chron-card" style={art(r.id)}>
      <div className="ch-head"><strong>${r.sym}</strong><span className="pill">L{r.c.level}</span><span className="pill">streak {r.r.streak}</span><span className="pill">best {Math.max(r.r.best_streak ?? 0, r.r.streak)}</span></div>
      {!shown.length && <p className="small muted">Nothing to tell yet: the story starts with the first Ritual or raid.</p>}
      <ol className="tl">{shown.map((l, i) => <li key={i} className={`tl-item ${l.tone ?? ''}`}><span className="tl-dot" aria-hidden="true" /><span className="tl-text">{l.text}</span><span className="mono muted tl-time">{ago(now - l.at)}</span></li>)}</ol>
    </div>
  );
}

function Arena({ blocks, rows, events, liveRaids, champion, go }: { blocks: Block[]; rows: Row[]; events: Event[]; liveRaids: Row[]; champion?: string; go: (id: string) => void }) {
  const W = 900, H = 440, cx = W / 2, cy = H / 2, rx = Math.min(330, 130 + blocks.length * 40), ry = Math.min(150, 70 + blocks.length * 18);
  const maxV = Math.max(...blocks.map(b => b.v), 1);
  const pos = new Map<string, { x: number; y: number; r: number; v: number }>();
  blocks.forEach((b, i) => {
    const a = -Math.PI / 2 + (i / Math.max(blocks.length, 1)) * Math.PI * 2;
    pos.set(b.id, { x: blocks.length === 1 ? cx : cx + Math.cos(a) * rx, y: blocks.length === 1 ? cy : cy + Math.sin(a) * ry, r: 34 + 36 * Math.sqrt(b.v / maxV), v: b.v });
  });
  const recent = events.slice(-10);
  return (
    <div className="panel arena">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="War Map arena: coins as circles sized by war points, lines show raids">
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="ar-ring" /><ellipse cx={cx} cy={cy} rx={rx * 0.55} ry={ry * 0.55} className="ar-ring faint" />
        {recent.map((e, i) => { const a = pos.get(e.winner), b = pos.get(e.loser); if (!a || !b) return null; return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="ar-hist" style={{ ['--ac' as any]: accent(e.winner), opacity: 0.18 + (i / recent.length) * 0.4 }} />; })}
        {liveRaids.map(r => { const a = pos.get(r.raid!.attacker), b = pos.get(r.raid!.defender); if (!a || !b) return null; return <g key={r.id}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="ar-live" /><circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={6} className="ar-spark" /></g>; })}
        {blocks.map(b => {
          const q = pos.get(b.id)!, r = rows.find(x => x.id === b.id)!, col = accent(b.id), raiding = r.raid?.phase === 2;
          return (
            <g key={b.id} className={`ar-node ${b.id === champion ? 'champ' : ''} ${raiding ? 'raiding' : ''}`} transform={`translate(${q.x},${q.y})`} onClick={() => go(b.id)} tabIndex={0} role="button" aria-label={`$${b.sym}, ${b.v} points`} onKeyDown={e => { if (e.key === 'Enter') go(b.id); }}>
              <circle r={q.r + 8} className="ar-halo" style={{ fill: col }} />
              <circle r={q.r} className="ar-disc" style={{ stroke: col, fill: `color-mix(in srgb, ${col} 14%, #0b0b0e)` }} />
              {r.icon
                ? <><clipPath id={`ic-${b.sym}`}><circle r={q.r - 2} /></clipPath><image href={r.icon} x={-q.r} y={-q.r} width={q.r * 2} height={q.r * 2} clipPath={`url(#ic-${b.sym})`} preserveAspectRatio="xMidYMid slice" opacity="0.5" /></>
                : <image href={`/bg/jokers/${JOKERS[hsh(b.id) % JOKERS.length]}.png`} x={-q.r * 0.7} y={-q.r * 0.9} width={q.r * 1.4} height={q.r * 1.4} opacity="0.16" />}
              <text y={-2} textAnchor="middle" className="ar-sym">${b.sym}</text>
              <text y={q.r * 0.42} textAnchor="middle" className="ar-pts" style={{ fill: col }}>{b.v}</text>
              {b.id === champion && <text y={-q.r - 12} textAnchor="middle" className="ar-crown">LEADER</text>}
            </g>
          );
        })}
      </svg>
      <div className="ar-legend small muted"><span><i className="lg live" />Live raid</span><span><i className="lg hist" />Past raid, winner to loser</span><span>Circle size is war points. Click a coin to open it.</span></div>
    </div>
  );
}
