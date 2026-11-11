// Price chart for a coin: on-chain price history (one point per trade or burn) with game events marked on the line.
// One series, so no legend: the title names it. Hover shows a crosshair and a tooltip with the price, market cap and any event.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { LogEntry } from './types';

export interface PricePoint { at: number; price: string; mcap: string; }
const MIN = 60_000, HOUR = 60 * MIN;
const RANGES: [string, number][] = [['1h', HOUR], ['6h', 6 * HOUR], ['24h', 24 * HOUR], ['All', Infinity]];
const EVENT: Record<string, string> = { level_up: '⬆', card: '🃏', raid: '⚔', ritual_made: '🕯', graduated: '🎓' };
const toMicro = (y: string) => Number(BigInt(y) / 10n ** 12n) / 1e6; // yocto NEAR per token → µNEAR per token
const toN = (y: string) => Number(BigInt(y) / 10n ** 21n) / 1e3;
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

export default function PriceChart({ points, log, now }: { points: PricePoint[]; log: LogEntry[]; now: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [range, setRange] = useState(6 * HOUR);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(e => setW(Math.max(280, Math.floor(e[0].contentRect.width))));
    ro.observe(wrap.current); return () => ro.disconnect();
  }, []);

  const H = 220, padL = 52, padR = 12, padT = 14, padB = 26;
  const data = useMemo(() => {
    const from = range === Infinity ? 0 : now - range;
    const all = points.map(p => ({ t: p.at, p: toMicro(p.price), m: toN(p.mcap) }));
    const before = all.filter(x => x.t < from).pop();
    const inside = all.filter(x => x.t >= from);
    const pts = before ? [{ ...before, t: from }, ...inside] : inside;
    if (pts.length) pts.push({ ...pts[pts.length - 1], t: Math.max(now, pts[pts.length - 1].t) }); // hold the last price until now
    return pts;
  }, [points, range, now]);
  const events = useMemo(() => log.filter(e => EVENT[e.kind] && data.length && e.at >= data[0].t).map(e => ({ t: e.at, icon: EVENT[e.kind], text: e.kind === 'card' ? e.memo : e.kind === 'raid' ? `raid ${e.memo}` : e.kind === 'level_up' ? `level up ${e.memo}` : e.kind === 'ritual_made' ? 'Ritual made: pot burn' : e.kind })), [log, data]);

  if (data.length < 2) return <div className="panel chart"><h2>Price</h2><p className="muted small">No trades yet.</p></div>;
  const t0 = data[0].t, t1 = Math.max(data[data.length - 1].t, t0 + MIN);
  let lo = Math.min(...data.map(d => d.p)), hi = Math.max(...data.map(d => d.p));
  const padV = (hi - lo) * 0.12 || hi * 0.05; lo = Math.max(0, lo - padV); hi += padV;
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (w - padL - padR);
  const y = (p: number) => padT + (1 - (p - lo) / (hi - lo)) * (H - padT - padB);
  const priceAt = (t: number) => { let v = data[0].p; for (const d of data) { if (d.t <= t) v = d.p; else break; } return v; };
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`).join('');
  const area = `${path}L${x(t1).toFixed(1)},${H - padB}L${x(t0).toFixed(1)},${H - padB}Z`;
  const yTicks = [0, 1, 2, 3].map(i => lo + ((hi - lo) * i) / 3);
  const xTicks = [0, 1, 2, 3].map(i => t0 + ((t1 - t0) * i) / 3);
  const first = data[0].p, last = data[data.length - 1].p, change = first ? ((last - first) / first) * 100 : 0;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    const t = t0 + ((px - padL) / (w - padL - padR)) * (t1 - t0);
    setHover(Math.min(t1, Math.max(t0, t)));
  };
  const hp = hover !== null ? data.reduce((a, d) => (d.t <= hover ? d : a), data[0]) : null;
  const hEvent = hover !== null ? events.find(ev => Math.abs(x(ev.t) - x(hover)) < 8) : undefined;
  const tipLeft = hover !== null && x(hover) > w * 0.6;

  return (
    <div className="panel chart">
      <div className="row between wrap">
        <div><h2>Price</h2><span className="mono">{last.toFixed(3)} µN</span> <span className={`mono small ${change >= 0 ? 'up' : 'down'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%</span> <span className="muted small">over {RANGES.find(r => r[1] === range)?.[0]}</span></div>
        <div className="seg small" role="group" aria-label="Time range">{RANGES.map(([l, v]) => <button key={l} aria-pressed={range === v} onClick={() => setRange(v)}>{l}</button>)}</div>
      </div>
      <div ref={wrap} className="chart-wrap">
        <svg width={w} height={H} role="img" aria-label={`Price over ${RANGES.find(r => r[1] === range)?.[0]}: from ${first.toFixed(3)} to ${last.toFixed(3)} µNEAR per token`}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs><linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".22" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
          {yTicks.map((v, i) => <g key={i}><line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} className="grid" /><text x={padL - 6} y={y(v) + 4} textAnchor="end" className="axis">{v.toFixed(v < 10 ? 3 : 1)}</text></g>)}
          {xTicks.map((t, i) => <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'} className="axis">{hhmm(t)}</text>)}
          <path d={area} fill="url(#pc-fill)" />
          <path d={path} className="line" />
          {events.map((ev, i) => <g key={i}><line x1={x(ev.t)} x2={x(ev.t)} y1={padT} y2={H - padB} className="ev-line" /><circle cx={x(ev.t)} cy={y(priceAt(ev.t))} r={5} className="ev-dot" /><text x={x(ev.t)} y={padT + 10} textAnchor="middle" className="ev-icon">{ev.icon}</text></g>)}
          {hp && hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} className="cross" /><circle cx={x(hover)} cy={y(hp.p)} r={4.5} className="hover-dot" /></g>}
        </svg>
        {hp && hover !== null && (
          <div className="chart-tip" style={{ left: tipLeft ? undefined : x(hover) + 12, right: tipLeft ? w - x(hover) + 12 : undefined }}>
            <div className="mono small">{new Date(hover).toISOString().slice(5, 16).replace('T', ' ')} UTC</div>
            <div className="mono">{hp.p.toFixed(4)} µN</div>
            <div className="mono small muted">mcap {hp.m.toFixed(0)} N</div>
            {hEvent && <div className="small">{hEvent.icon} {hEvent.text}</div>}
          </div>
        )}
      </div>
      <p className="small muted">Every point is on-chain (one per trade or burn). Markers: ⬆ level up · 🃏 card fired · ⚔ raid · 🕯 Ritual burn.</p>
    </div>
  );
}
