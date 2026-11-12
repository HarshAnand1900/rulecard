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
const hue = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
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

const ago = (ms: number) => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

export default function WarMap({ ch, coins, tick, go }: { ch: Net; coins: CoinEntry[]; tick: number; go: (id: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
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

  return (
    <section>
      <h1>War Map</h1>
      <p className="muted">One block per coin, sized by war points: 10 to join, +3 for every level above L1, and each raid moves the raid's level in points (L2 = 2, L3 = 3, L4 = 4) from the loser to the winner. Nobody drops below 4.</p>
      {!rows.length && <div className="panel muted">No coins to rank yet.</div>}

      {!!rows.length && <div className="treemap" role="img" aria-label="War Map: each coin's block is sized by its points">
        {blocks.map(b => {
          const r = rows.find(x => x.id === b.id)!, win = lastWin(b.id), loss = lastLoss(b.id), raiding = r.raid?.phase === 2;
          const big = b.w > 22 && b.h > 28;
          return (
            <button key={b.id} className={`tm-block ${raiding ? 'raiding' : ''} ${b.id === champion ? 'champ' : ''}`} onClick={() => go(b.id)}
              style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, ['--hue' as any]: hue(b.id) }}
              title={`$${b.sym}: ${b.v} points. ${r.won}–${r.lost} in raids.`}>
              <span className="tm-in">
                <span className="tm-head">
                  {r.icon ? <img className="tm-icon" src={r.icon} alt="" width={big ? 40 : 24} height={big ? 40 : 24} /> : null}
                  <strong className="tm-sym">{b.id === champion ? '👑 ' : ''}${b.sym}</strong>
                  <span className="mono tm-pts">{b.v}</span>
                </span>
                {big && <span className="small tm-meta">L{r.c.level} {LEVEL_NAME[r.c.level]} · 🔥 {r.r.streak} · 🏆 {Math.max(r.r.best_streak ?? 0, r.r.streak)} · raids {r.won}–{r.lost}</span>}
                <span className="tm-tags">
                  {raiding && <span className="tm-tag hot">⚔ {r.raid!.attacking ? 'attacking' : 'defending'} ${sym(r.raid!.attacking ? r.raid!.defender : r.raid!.attacker)}</span>}
                  {win && <span className="tm-tag up">+{win.level} from ${sym(win.loser)}</span>}
                  {loss && <span className="tm-tag down">Conquered by ${sym(loss.winner)} · {ago(now - loss.at)}</span>}
                  {r.c.graduated && <span className="tm-tag">🎓 graduated</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>}

      <div className="panel">
        <h2>Standings</h2>
        <table className="log war">
          <thead><tr><th>#</th><th>Coin</th><th>Points</th><th>Level</th><th>Ritual streak</th><th>High score</th><th>Last day</th><th>Raids W–L</th><th>Now</th></tr></thead>
          <tbody>
            {[...rows].sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0)).map((r, i) => (
              <tr key={r.id}>
                <td className="mono">{i + 1}</td>
                <td><button className="linkish" onClick={() => go(r.id)}><strong>${r.sym}</strong></button> <span className="muted small">{fmtNear(toNear(r.c.mcap))} N mcap</span></td>
                <td className="mono"><strong>{Math.max(FLOOR_POINTS, points.get(r.id) ?? JOIN_POINTS)}</strong></td>
                <td>L{r.c.level} {LEVEL_NAME[r.c.level]}</td>
                <td>🔥 {r.r.streak}</td>
                <td className="mono">🏆 {Math.max(r.r.best_streak ?? 0, r.r.streak)}</td>
                <td>{r.r.last_made === null ? '·' : r.r.last_made ? <span className="up">made ✓</span> : <span className="down">missed ✗</span>}</td>
                <td className="mono">{r.won}–{r.lost}</td>
                <td>{r.raid && r.raid.phase === 2 ? <span className="chip hot">⚔ {r.raid.attacking ? 'attacking' : 'defending'} ${sym(r.raid.attacking ? r.raid.defender : r.raid.attacker)}</span> : r.raid && r.raid.phase < 2 ? <span className="chip">forming a raid</span> : <span className="muted small">at peace</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Latest raids</h2>
        {!feed.length && <p className="muted small">No raid has finished yet.</p>}
        {feed.map((e, i) => (
          <div key={i} className="row between small past-raid">
            <span><strong>${sym(e.x.attacker)}</strong> raided <strong>${sym(e.x.defender)}</strong> (L{e.level})</span>
            <span><strong className="up">${sym(e.winner)} +{e.level}</strong> · <span className="down">${sym(e.loser)} −{e.level}</span> · rounds {e.x.result!.rounds.map(n => (n > 0 ? 'W' : n < 0 ? 'L' : 'T')).join('')} (W win, L loss, T tie) · spoils {fmtNear(toNear(e.x.result!.spoils))} N · {ago(now - e.at)}</span>
          </div>
        ))}
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
  for (const e of r.log) {
    if (e.kind === 'ritual_made') lines.push({ at: e.at, tone: 'up', text: `Made its Ritual (${e.memo}): the pot burned ${fmtNear(toNear(e.near))} NEAR.` });
    else if (e.kind === 'ritual_missed') lines.push({ at: e.at, tone: 'down', text: `Missed its Ritual (${e.memo}): sleepers' bags burn twice as fast for a while.` });
    else if (e.kind === 'level_up') lines.push({ at: e.at, tone: 'up', text: `Reached ${e.memo}.` });
    else if (e.kind === 'graduated') lines.push({ at: e.at, tone: 'up', text: 'Graduated: the curve sold out.' });
    else if (e.kind === 'omen') lines.push({ at: e.at, text: `Omen: ${e.memo}.` });
  }
  for (const x of r.raids) {
    if (!x.result || x.result.outcome === 0) { if (x.result) lines.push({ at: x.end, text: `Tied a raid with $${sym(x.attacking ? x.defender : x.attacker)}.` }); continue; }
    const other = sym(x.attacking ? x.defender : x.attacker), won = x.result.outcome > 0;
    lines.push({ at: x.end, tone: won ? 'up' : 'down', text: x.attacking ? (won ? `Raided $${other} and won.` : `Raided $${other} and lost.`) : (won ? `Held against a raid by $${other}.` : `Was raided by $${other} and lost.`) });
  }
  lines.sort((a, b) => b.at - a.at);
  const shown = lines.slice(0, 6);
  return (
    <div className="chron-card">
      <h3>${r.sym} <span className="muted small">L{r.c.level} · 🔥 {r.r.streak} · 🏆 {Math.max(r.r.best_streak ?? 0, r.r.streak)}</span></h3>
      {!shown.length && <p className="small muted">Nothing to tell yet: the story starts with the first Ritual or raid.</p>}
      {shown.map((l, i) => <div key={i} className={`small chron-line ${l.tone ?? ''}`}><span className="mono muted">{ago(now - l.at)}</span> {l.text}</div>)}
    </div>
  );
}
