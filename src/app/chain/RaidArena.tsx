// The Arena: the full view of one live raid. Both coins face each other, with the muster and round timeline, every round's score
// (buy, crowd and lock for each side), the tactics once they are revealed, and the controls for your own side.
// Each coin records its own side of a raid, so the opponent's numbers are read from the opponent coin.
import { useEffect, useState } from 'react';
import type { Net } from './net';
import type { CoinEntry, CoinView, RaidView } from './types';
import { toNear, fmtNear } from './near';

const TACTIC = ['', 'Rally', 'Curse', 'Ward', 'Mirror', 'Counterspell', 'Decoy'];
const tacticName = (code: number) => (code ? `${TACTIC[Math.floor(code / 10)]} ×${['1', '2', '3'][code % 10]}` : '—');
const sym = (id: string) => id.split('.')[0].toUpperCase();
const dur = (ms: number) => { const t = Math.max(0, Math.round(ms / 1000)), m = Math.floor(t / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m ${t % 60}s` : `${t}s`; };
const clock = (t: number) => new Date(t).toISOString().slice(11, 16);
const C_ME = '#FF7A1A', C_THEM = '#4C8DFF';

interface Side { id: string; c: CoinView; raid: RaidView | null; icon: string | null }

export default function RaidArena({ ch, me, id, coins, tick, act, busy, back, go }: {
  ch: Net; me: string; id: string; coins: CoinEntry[]; tick: number; act: (l: string, f: () => Promise<unknown>, d?: string) => Promise<void>; busy: string;
  back: () => void; go: (id: string) => void;
}) {
  const [a, setA] = useState<Side | null>(null);
  const [b, setB] = useState<Side | null>(null);
  const [past, setPast] = useState<RaidView[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const read = async (cid: string): Promise<Side> => {
          const [c, raid, md] = await Promise.all([ch.view<CoinView>(cid, 'get_coin'), ch.view<RaidView | null>(cid, 'get_raid'), ch.view<{ icon: string | null }>(cid, 'ft_metadata').catch(() => ({ icon: null }))]);
          return { id: cid, c, raid, icon: md.icon ?? null };
        };
        const mine = await read(id);
        const raids = await ch.view<RaidView[]>(id, 'get_raids').catch(() => [] as RaidView[]);
        const other = mine.raid ? (mine.raid.attacking ? mine.raid.defender : mine.raid.attacker) : null;
        const theirs = other && coins.some(x => x.account_id === other) ? await read(other).catch(() => null) : null;
        if (!live) return; setA(mine); setB(theirs); setPast(raids); setErr('');
      } catch (e: any) { if (live) setErr(String(e?.message ?? e).slice(0, 160)); }
    })();
    return () => { live = false; };
  }, [ch, id, coins, tick]);

  if (err) return <section><button className="btn ghost small" onClick={back}>← Back</button><div className="panel warn">Can't read this raid: {err}</div></section>;
  if (!a) return <div className="panel skel">Loading the arena…</div>;
  const raid = a.raid, now = a.c.now;
  const live = !!raid && raid.phase === 2;
  const last = [...past].reverse().find(x => x.result);
  const oppId = raid ? (raid.attacking ? raid.defender : raid.attacker) : '';
  // rounds start 25 units apart and each lasts 20, and the raid ends 20 units after the last one starts (70 units after the muster):
  // one unit is a minute at full scale and 5 seconds in demo mode, so the timeline works at either scale
  const unit = raid ? Math.max(1, (raid.end - raid.muster_end) / 70) : 1;
  const rStart = (i: number) => (raid ? raid.muster_end + i * 25 * unit : 0);
  const rLen = 20 * unit;
  const roundState = (i: number) => (!raid ? 'idle' : raid.round === i ? 'live' : now >= rStart(i) + rLen ? 'done' : 'next');
  const phase = !raid ? 'No raid is live' : raid.phase === 0 ? 'Signing' : raid.phase === 1 ? 'Waiting for the target' : raid.phase === 3 ? 'Settling'
    : now < raid.muster_end ? `Muster · ${dur(raid.muster_end - now)}` : raid.round !== null ? `Round ${raid.round + 1} of 3 · ${dur(rStart(raid.round) + rLen - now)} left` : now >= raid.end ? 'Over · settle it' : 'Between rounds';
  const total = raid ? Math.max(1, raid.end - raid.start) : 1;
  const pos = raid ? Math.min(100, Math.max(0, ((now - raid.start) / total) * 100)) : 0;
  const musterPct = raid ? ((raid.muster_end - raid.start) / total) * 100 : 0;
  const rb = (r: RaidView | null | undefined, i: number) => (r ? Number(r.live_base[i]) / 100 : 0);

  return (
    <section className="arena-page">
      <div className="row between wrap">
        <div className="row gap wrap"><button className="btn ghost small" onClick={back}>← ${a.c.symbol}</button><h1>Arena</h1></div>
        {raid && <span className="row gap">{raid.kind === 1 && <span className="chip">Friendly</span>}{raid.kind === 2 && <span className="chip hot">Hard raid</span>}<span className="chip hot">{phase}</span></span>}
      </div>

      {!live && <div className="panel stack">
        <h2>{raid ? 'The raid is not under way yet' : 'No raid is live right now'}</h2>
        <p className="muted small">{raid ? 'It is still being signed or waiting for the target to accept. The arena opens when the muster starts.' : 'When this coin or a rival starts a raid, its arena opens here with every round, score and tactic.'}</p>
        {last && <p className="small">Last raid: {last.result!.outcome > 0 ? <strong className="up">won</strong> : last.result!.outcome < 0 ? <strong className="down">lost</strong> : 'a tie'} against ${sym(last.attacking ? last.defender : last.attacker)}.</p>}
      </div>}

      {live && raid && <>
        <div className="panel arena-hero">
          <Fighter side={a} color={C_ME} tag={raid.attacking ? 'Attacker' : 'Defender'} onOpen={() => go(a.id)} planners={raid.planners} />
          <div className="vs-col"><span className="vs-big">VS</span><strong className="vs-phase mono">{phase}</strong><small className="muted mono">ends in {dur(raid.end - now)}</small></div>
          {b ? <Fighter side={b} color={C_THEM} tag={raid.attacking ? 'Defender' : 'Attacker'} onOpen={() => go(b.id)} planners={b.raid?.planners} right />
            : <div className="fighter right off"><strong>${sym(oppId)}</strong><small className="muted">Can't read this coin right now.</small></div>}
        </div>

        <div className="panel arena-time">
          <div className="at-bar" role="img" aria-label="Raid timeline">
            <i className="at-muster" style={{ width: `${musterPct}%` }} />
            {[0, 1, 2].map(i => <i key={i} className={`at-round ${roundState(i)}`} style={{ left: `${((rStart(i) - raid.start) / total) * 100}%`, width: `${(rLen / total) * 100}%` }}><span className="mono">R{i + 1}</span></i>)}
            <i className="at-now" style={{ left: `${pos}%` }} />
          </div>
          <div className="at-labels mono small muted"><span>{clock(raid.start)}</span><span>muster ends {clock(raid.muster_end)}</span><span>{clock(raid.end)}</span></div>
        </div>

        <div className="arena-rounds">
          {[0, 1, 2].map(i => {
            const st = roundState(i), mine = rb(raid, i), theirs = rb(b?.raid, i), top = Math.max(mine, theirs, 1);
            const lead = mine === theirs ? null : mine > theirs ? 'me' : 'them';
            const metrics: [string, number, number, (n: number) => string][] = [
              ['Buy', raid.buy[i] / 100, (b?.raid?.buy[i] ?? 0) / 100, n => n.toFixed(1)],
              ['Crowd', raid.crowd[i], b?.raid?.crowd[i] ?? 0, n => String(n)],
              ['Lock', raid.lock[i] / 100, (b?.raid?.lock[i] ?? 0) / 100, n => n.toFixed(1)],
            ];
            return (
              <div key={i} className={`panel arena-round ${st}`}>
                <div className="row between"><strong>Round {i + 1}</strong><span className={`pill ${st === 'live' ? 'hot' : st === 'done' ? 'ok' : ''}`}>{st === 'live' ? 'Live' : st === 'done' ? 'Finished' : `Starts ${clock(rStart(i))}`}</span></div>
                <div className="ar-score">
                  <b className="mono" style={{ color: C_ME }}>{mine.toFixed(1)}</b>
                  <span className="ar-vs">{st === 'next' ? 'not yet' : lead === 'me' ? `${a.c.symbol} leads` : lead === 'them' ? `${sym(oppId)} leads` : 'level'}</span>
                  <b className="mono" style={{ color: C_THEM }}>{theirs.toFixed(1)}</b>
                </div>
                <div className="ar-split" aria-hidden="true"><i style={{ width: `${(mine / top) * 50}%`, background: C_ME }} /><i style={{ width: `${(theirs / top) * 50}%`, background: C_THEM }} /></div>
                <div className="ar-metrics">{metrics.map(([k, m, t, f]) => <div key={k}><small className="muted">{k}</small><span className="mono"><b style={{ color: C_ME }}>{f(m)}</b><i>·</i><b style={{ color: C_THEM }}>{f(t)}</b></span></div>)}</div>
                <div className="ar-tactics small">
                  <span>You: {raid.tactic[i] ? tacticName(raid.tactic[i]) : st === 'next' ? 'hidden' : 'none'}</span>
                  <span>Them: {b?.raid?.tactic[i] ? tacticName(b.raid.tactic[i]) : st === 'next' ? 'hidden' : 'none'}</span>
                </div>
                {raid.scout[i] ? <div className="small gold">Scouted: {raid.scout[i] === 255 ? 'no tactic' : tacticName(raid.scout[i])}</div> : null}
              </div>
            );
          })}
        </div>

        <div className="panel stack">
          <h2>Your side</h2>
          <p className="small muted">Scores shown are each coin's own report. Tactics (Rally, Curse, Ward, Mirror, Counterspell, Decoy) are applied when the raid settles. Change your plan from the coin's Raids tab before a round starts.</p>
          <div className="row gap wrap">
            {now < raid.end && <button className="btn primary" disabled={!!busy || !me || raid.round === null} onClick={() => act('Battle cry', () => ch.call(a.id, 'battle_cry', {}, 0n), 'Battle cry! +Crowd')}>Battle cry</button>}
            {now < raid.end && <button className="btn" onClick={() => { try { sessionStorage.setItem('rc-open-tab', 'raid'); } catch { /* optional */ } go(a.id); }}>Edit your plan</button>}
            {now >= raid.end && <span className="small gold">This raid has ended: plans and Battle cry are closed. Press Settle raid to lock in the result.</span>}
            {now >= raid.end && raid.attacking && <button className="btn" disabled={!!busy} onClick={() => act('Settle', () => ch.call(a.id, 'settle_raid', {}, 0n), 'Raid settled')}>Settle raid</button>}
            {now >= raid.end && !raid.attacking && <button className="btn" disabled={!!busy} onClick={() => act('Settle', () => ch.call(oppId, 'settle_raid', {}, 0n), 'Raid settled')}>Settle raid</button>}
          </div>
        </div>
      </>}

      {!!past.length && <div className="panel">
        <h2>Past raids of ${a.c.symbol}</h2>
        {past.slice().reverse().map(r => <div key={r.seq} className="row between small past-raid">
          <span>{r.attacking ? `attacked ${sym(r.defender)}` : `defended vs ${sym(r.attacker)}`}</span>
          <span>{r.result ? <><strong className={r.result.outcome > 0 ? 'up' : r.result.outcome < 0 ? 'down' : ''}>{r.result.outcome > 0 ? 'won' : r.result.outcome < 0 ? 'lost' : 'tie'}</strong> · spoils {fmtNear(toNear(r.result.spoils))} N</> : r.note}</span>
        </div>)}
      </div>}
    </section>
  );
}

function Fighter({ side, color, tag, onOpen, planners, right }: { side: Side; color: string; tag: string; onOpen: () => void; planners?: number; right?: boolean }) {
  const c = side.c;
  return (
    <button className={`fighter ${right ? 'right' : ''}`} style={{ ['--fc' as any]: color }} onClick={onOpen} aria-label={`Open $${c.symbol}`}>
      <span className="f-av">{side.icon ? <img src={side.icon} alt="" /> : <b>{c.symbol.slice(0, 4)}</b>}</span>
      <span className="f-main">
        <small className="mono f-tag">{tag.toUpperCase()}</small>
        <strong>${c.symbol}</strong>
        <span className="f-stats mono"><span>L{c.level}</span><span>{fmtNear(toNear(c.mcap))} N</span><span>{c.holders} holders</span>{planners !== undefined && <span>{planners} plans</span>}</span>
      </span>
    </button>
  );
}
