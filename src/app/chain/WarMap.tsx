// War Map: every coin ranked, with its Ritual streak and raid record, plus the latest raid results. Communities fighting communities.
import { useEffect, useState } from 'react';
import type { Net } from './net';
import type { CoinEntry, CoinView, Ritual, RaidView } from './types';
import { toNear, fmtNear } from './near';
import { LEVEL_NAME } from './types';

interface Row { id: string; sym: string; c: CoinView; r: Ritual; raid: RaidView | null; raids: RaidView[]; won: number; lost: number }
const sym = (id: string) => id.split('.')[0].toUpperCase();

export default function WarMap({ ch, coins, tick, go }: { ch: Net; coins: CoinEntry[]; tick: number; go: (id: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const out: Row[] = [];
      for (const e of coins) {
        try {
          const [c, r, raid, raids] = await Promise.all([ch.view<CoinView>(e.account_id, 'get_coin'), ch.view<Ritual>(e.account_id, 'get_ritual'), ch.view<RaidView | null>(e.account_id, 'get_raid'), ch.view<RaidView[]>(e.account_id, 'get_raids')]);
          const done = raids.filter(x => x.result);
          // a raid is recorded on both coins, each from its own side (outcome > 0: this coin won)
          const won = done.filter(x => x.result!.outcome > 0).length;
          const lost = done.filter(x => x.result!.outcome < 0).length;
          out.push({ id: e.account_id, sym: sym(e.account_id), c, r, raid, raids, won, lost });
        } catch { /* skip a coin that can't be read */ }
      }
      out.sort((a, b) => b.c.level - a.c.level || b.r.streak - a.r.streak || Number(BigInt(b.c.mcap) - BigInt(a.c.mcap)));
      if (live) setRows(out);
    })();
    return () => { live = false; };
  }, [ch, coins, tick]);

  // every finished raid once: from the attacker's side
  const feed = rows.flatMap(r => r.raids.filter(x => x.attacking && x.result).map(x => ({ at: x.end, from: r.sym, to: sym(x.defender), x }))).sort((a, b) => b.at - a.at).slice(0, 12);
  return (
    <section>
      <h1>War Map</h1>
      <p className="muted">Every coin has to show up for its own Ritual, and coins raid each other for their pots. Ranked by level, then Ritual streak.</p>
      {!rows.length && <div className="panel muted">No coins to rank yet.</div>}
      <div className="panel">
        <table className="log war">
          <thead><tr><th>#</th><th>Coin</th><th>Level</th><th>Ritual streak</th><th>High score</th><th>Last day</th><th>Raids W–L</th><th>Now</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="mono">{i + 1}</td>
                <td><button className="linkish" onClick={() => go(r.id)}><strong>${r.sym}</strong></button> <span className="muted small">{fmtNear(toNear(r.c.mcap))} N mcap</span></td>
                <td>L{r.c.level} {LEVEL_NAME[r.c.level]}</td>
                <td>🔥 {r.r.streak}</td>
                <td className="mono">🏆 {Math.max(r.r.best_streak ?? 0, r.r.streak)}</td>
                <td>{r.r.last_made === null ? '·' : r.r.last_made ? <span className="up">made ✓</span> : <span className="down">missed ✗</span>}</td>
                <td className="mono">{r.won}–{r.lost}</td>
                <td>{r.raid && r.raid.phase === 2 ? <span className="chip hot">⚔ {r.raid.attacking ? 'attacking' : 'defending'} ${sym(r.raid.attacking ? r.raid.defender : r.raid.attacker)}</span> : r.raid && r.raid.phase < 2 ? <span className="chip">raid forming</span> : <span className="muted small">at peace</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Latest raids</h2>
        {!feed.length && <p className="muted small">No raid has finished yet.</p>}
        {feed.map((f, i) => (
          <div key={i} className="row between small past-raid">
            <span><strong>${f.from}</strong> raided <strong>${f.to}</strong></span>
            <span>{f.x.result!.outcome > 0 ? <strong className="up">${f.from} won</strong> : f.x.result!.outcome < 0 ? <strong className="up">${f.to} held</strong> : <strong>tie</strong>} · rounds {f.x.result!.rounds.map(n => (n > 0 ? 'W' : n < 0 ? 'L' : '=')).join('')} · spoils {fmtNear(toNear(f.x.result!.spoils))} N · {new Date(f.at).toISOString().slice(5, 16).replace('T', ' ')} UTC</span>
          </div>
        ))}
      </div>
    </section>
  );
}
