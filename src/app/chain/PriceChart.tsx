// Price chart for a coin, in the style of a trading terminal: market cap or price candles, volume bars, a price scale on the right,
// a live last-price tag, a crosshair with value and time labels, and game events marked on the chart.
// Everything is read from the chain: one price point per trade or burn, and trade sizes from the coin's log.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { LogEntry } from './types';

export interface PricePoint { at: number; price: string; mcap: string; }
const MIN = 60_000, HOUR = 60 * MIN;
const RANGES: [string, number][] = [['1h', HOUR], ['6h', 6 * HOUR], ['24h', 24 * HOUR], ['All', Infinity]];
const EVENT: Record<string, string> = { level_up: '⬆', card: '🃏', raid: '⚔', ritual_made: '🕯', graduated: '🎓' };
export const toMicro = (y: string) => Number(BigInt(y) / 10n ** 12n) / 1e6; // yocto NEAR per token → NEAR per 1M tokens
const toN = (y: string) => Number(BigInt(y) / 10n ** 21n) / 1e3;
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);
const fmtV = (v: number, unit: 'mcap' | 'price') => unit === 'price' ? v.toFixed(v < 10 ? 4 : 2) : v >= 1000 ? `${(v / 1000).toFixed(2)}k` : v.toFixed(v < 10 ? 2 : 1);
const fmtVol = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v >= 10 ? v.toFixed(0) : v.toFixed(2);

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number; buy: number }

export default function PriceChart({ points, log, now }: { points: PricePoint[]; log: LogEntry[]; now: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [range, setRange] = useState(6 * HOUR);
  const [hover, setHover] = useState<number | null>(null);
  const [mode, setMode] = useState<'candles' | 'line'>('candles');
  const [unit, setUnit] = useState<'mcap' | 'price'>('mcap');
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(e => setW(Math.max(300, Math.floor(e[0].contentRect.width))));
    ro.observe(wrap.current); return () => ro.disconnect();
  }, []);

  // a tall chart: the price pane gets most of the height, volume sits under it
  const H = Math.round(Math.min(520, Math.max(340, w * 0.58)));
  const padL = 8, padR = 62, padT = 12, padB = 24;
  const volH = Math.round(H * 0.15), gap = 8;
  const priceBottom = H - padB - volH - gap;

  const data = useMemo(() => {
    const from = range === Infinity ? 0 : now - range;
    const all = points.map(p => ({ t: p.at, p: toMicro(p.price), m: toN(p.mcap) }));
    const before = all.filter(x => x.t < from).pop();
    const inside = all.filter(x => x.t >= from);
    const pts = before ? [{ ...before, t: from }, ...inside] : inside;
    if (pts.length) pts.push({ ...pts[pts.length - 1], t: Math.max(now, pts[pts.length - 1].t) }); // hold the last price until now
    return pts;
  }, [points, range, now]);
  const val = (d: { p: number; m: number }) => (unit === 'mcap' ? d.m : d.p);

  const CN = Math.max(36, Math.min(96, Math.floor((w - padL - padR) / 8)));
  const candles = useMemo(() => {
    if (data.length < 2) return [] as Candle[];
    const a0 = data[0].t, a1 = Math.max(data[data.length - 1].t, a0 + MIN), step = (a1 - a0) / CN;
    const trades = log.filter(e => (e.kind === 'buy' || e.kind === 'sell') && e.at >= a0).map(e => ({ t: e.at, n: toN(e.near), buy: e.kind === 'buy' }));
    const out: Candle[] = [];
    let prev = val(data[0]);
    for (let i = 0; i < CN; i++) {
      const a = a0 + i * step, b = a + step;
      const inb = data.filter(d => d.t >= a && (d.t < b || (i === CN - 1 && d.t <= b)));
      let h = prev, l = prev, c = prev; const o = prev;
      for (const d of inb) { const v = val(d); h = Math.max(h, v); l = Math.min(l, v); c = v; }
      let v = 0, buy = 0;
      for (const tr of trades) if (tr.t >= a && (tr.t < b || (i === CN - 1 && tr.t <= b))) { v += tr.n; if (tr.buy) buy += tr.n; }
      prev = c; out.push({ t: a, o, h, l, c, v, buy });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, log, unit, CN]);
  const events = useMemo(() => log.filter(e => EVENT[e.kind] && data.length && e.at >= data[0].t).map(e => ({ t: e.at, icon: EVENT[e.kind], text: e.kind === 'card' ? e.memo : e.kind === 'raid' ? `raid ${e.memo}` : e.kind === 'level_up' ? `level up ${e.memo}` : e.kind === 'ritual_made' ? 'Ritual made' : e.kind })), [log, data]);

  if (data.length < 2) return <div className="panel chart"><h2>Chart</h2><p className="muted small">No trades yet.</p></div>;
  const t0 = data[0].t, t1 = Math.max(data[data.length - 1].t, t0 + MIN);
  let lo = Math.min(...data.map(val)), hi = Math.max(...data.map(val));
  const padV = (hi - lo) * 0.14 || hi * 0.05; lo = Math.max(0, lo - padV); hi += padV;
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (priceBottom - padT);
  const maxVol = Math.max(1e-9, ...candles.map(k => k.v));
  const vy = (v: number) => H - padB - (v / maxVol) * volH;
  const valAt = (t: number) => { let v = val(data[0]); for (const d of data) { if (d.t <= t) v = val(d); else break; } return v; };
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(val(d)).toFixed(1)}`).join('');
  const area = `${path}L${x(t1).toFixed(1)},${priceBottom}L${x(t0).toFixed(1)},${priceBottom}Z`;
  const yTicks = [0, 1, 2, 3, 4].map(i => lo + ((hi - lo) * i) / 4);
  const xTicks = [0, 1, 2, 3, 4].map(i => t0 + ((t1 - t0) * i) / 4);
  const first = val(data[0]), last = val(data[data.length - 1]), change = first ? ((last - first) / first) * 100 : 0;
  const upNow = last >= first;
  const bw = Math.max(2.5, ((w - padL - padR) / CN) * 0.66);

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    const t = t0 + ((px - padL) / (w - padL - padR)) * (t1 - t0);
    setHover(Math.min(t1, Math.max(t0, t)));
  };
  const hv = hover !== null ? valAt(hover) : null;
  const hk = hover !== null ? candles.find((k, i) => hover >= k.t && (hover < k.t + (t1 - t0) / CN || i === candles.length - 1)) : undefined;
  const hEvent = hover !== null ? events.find(ev => Math.abs(x(ev.t) - x(hover)) < 8) : undefined;
  const tipLeft = hover !== null && x(hover) > w * 0.6;
  const shown = hk ?? candles[candles.length - 1];
  const tc = (k: Candle) => (k.c >= k.o ? 'up' : 'down');

  return (
    <div className="panel chart chart-pro">
      <div className="chart-head">
        <div className="chart-title">
          <span className="muted small mono">{unit === 'mcap' ? 'MARKET CAP' : 'PRICE'} · N{unit === 'price' ? ' PER 1M' : ''}</span>
          <div className="row gap wrap"><strong className="chart-big mono">{fmtV(last, unit)}</strong><span className={`mono small chart-chg ${upNow ? 'up' : 'down'}`}>{upNow ? '▲' : '▼'} {Math.abs(change).toFixed(2)}% <span className="muted">{RANGES.find(r => r[1] === range)?.[0]}</span></span></div>
        </div>
        <div className="chart-ctl">
          <div className="seg small" role="group" aria-label="Chart value"><button aria-pressed={unit === 'mcap'} onClick={() => setUnit('mcap')}>Market cap</button><button aria-pressed={unit === 'price'} onClick={() => setUnit('price')}>Price</button></div>
          <div className="seg small" role="group" aria-label="Chart type"><button aria-pressed={mode === 'candles'} onClick={() => setMode('candles')}>Candles</button><button aria-pressed={mode === 'line'} onClick={() => setMode('line')}>Line</button></div>
          <div className="seg small" role="group" aria-label="Time range">{RANGES.map(([l, v]) => <button key={l} aria-pressed={range === v} onClick={() => setRange(v)}>{l}</button>)}</div>
        </div>
      </div>
      {shown && <div className="chart-ohlc mono small"><span className="muted">{hover !== null && hk ? hhmm(hk.t) : 'Latest'}</span><span>O <b className={tc(shown)}>{fmtV(shown.o, unit)}</b></span><span>H <b className={tc(shown)}>{fmtV(shown.h, unit)}</b></span><span>L <b className={tc(shown)}>{fmtV(shown.l, unit)}</b></span><span>C <b className={tc(shown)}>{fmtV(shown.c, unit)}</b></span><span>Vol <b>{fmtVol(shown.v)} N</b></span></div>}
      <div ref={wrap} className="chart-wrap">
        <svg width={w} height={H} role="img" aria-label={`${unit === 'mcap' ? 'Market cap' : 'Price'} over ${RANGES.find(r => r[1] === range)?.[0]}: from ${fmtV(first, unit)} to ${fmtV(last, unit)}`}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs><linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={upNow ? 'var(--up)' : 'var(--down)'} stopOpacity=".28" /><stop offset="1" stopColor={upNow ? 'var(--up)' : 'var(--down)'} stopOpacity="0" /></linearGradient></defs>
          {yTicks.map((v, i) => <g key={i}><line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} className="grid" /><text x={w - padR + 8} y={y(v) + 4} className="axis">{fmtV(v, unit)}</text></g>)}
          {xTicks.map((t, i) => <g key={i}><line x1={x(t)} x2={x(t)} y1={padT} y2={H - padB} className="grid v" /><text x={x(t)} y={H - 7} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} className="axis">{hhmm(t)}</text></g>)}
          {mode === 'line' && <><path d={area} fill="url(#pc-fill)" /><path d={path} className={`line ${upNow ? 'up' : 'down'}`} /></>}
          {mode === 'candles' && candles.map((k, i) => {
            const cx = x(k.t) + (x(t1) - x(t0)) / CN / 2, up = k.c >= k.o, top = Math.min(y(k.o), y(k.c)), hgt = Math.max(1.5, Math.abs(y(k.o) - y(k.c)));
            return <g key={i} className={up ? 'cndl up' : 'cndl down'}><line x1={cx} x2={cx} y1={y(k.h)} y2={y(k.l)} /><rect x={cx - bw / 2} y={top} width={bw} height={hgt} rx={1} /></g>;
          })}
          {candles.map((k, i) => k.v > 0 && <rect key={`v${i}`} className={`vbar ${k.c >= k.o ? 'up' : 'down'}`} x={x(k.t) + (x(t1) - x(t0)) / CN / 2 - bw / 2} y={vy(k.v)} width={bw} height={H - padB - vy(k.v)} rx={1} />)}
          <line x1={padL} x2={w - padR} y1={priceBottom + gap / 2} y2={priceBottom + gap / 2} className="grid" />
          <line x1={padL} x2={w - padR} y1={y(last)} y2={y(last)} className={`last-line ${upNow ? 'up' : 'down'}`} />
          <g className={`last-tag ${upNow ? 'up' : 'down'}`}><rect x={w - padR + 2} y={y(last) - 10} width={padR - 4} height={20} rx={5} /><text x={w - padR + 2 + (padR - 4) / 2} y={y(last) + 4} textAnchor="middle">{fmtV(last, unit)}</text></g>
          {events.map((ev, i) => <g key={i}><line x1={x(ev.t)} x2={x(ev.t)} y1={padT} y2={priceBottom} className="ev-line" /><circle cx={x(ev.t)} cy={y(valAt(ev.t))} r={4} className="ev-dot" /><text x={x(ev.t)} y={padT + 10} textAnchor="middle" className="ev-icon">{ev.icon}</text></g>)}
          {hv !== null && hover !== null && <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} className="cross" />
            <line x1={padL} x2={w - padR} y1={y(hv)} y2={y(hv)} className="cross" />
            <circle cx={x(hover)} cy={y(hv)} r={4} className="hover-dot" />
            <g className="cross-tag"><rect x={w - padR + 2} y={y(hv) - 10} width={padR - 4} height={20} rx={5} /><text x={w - padR + 2 + (padR - 4) / 2} y={y(hv) + 4} textAnchor="middle">{fmtV(hv, unit)}</text></g>
            <g className="cross-tag"><rect x={Math.min(w - padR - 44, Math.max(padL, x(hover) - 22))} y={H - padB + 2} width={44} height={18} rx={5} /><text x={Math.min(w - padR - 22, Math.max(padL + 22, x(hover)))} y={H - padB + 15} textAnchor="middle">{hhmm(hover)}</text></g>
          </g>}
        </svg>
        {hv !== null && hover !== null && (
          <div className="chart-tip" style={{ left: tipLeft ? undefined : x(hover) + 14, right: tipLeft ? w - x(hover) + 14 : undefined }}>
            <div className="mono small">{new Date(hover).toISOString().slice(5, 16).replace('T', ' ')} UTC</div>
            <div className="mono">{fmtV(hv, unit)} <span className="muted small">{unit === 'mcap' ? 'N mcap' : 'N/1M'}</span></div>
            {hk && hk.v > 0 && <div className="mono small muted">vol {fmtVol(hk.v)} N · {fmtVol(hk.buy)} bought</div>}
            {hEvent && <div className="small">{hEvent.icon} {hEvent.text}</div>}
          </div>
        )}
      </div>
      <p className="small muted">Every point is on-chain (one per trade or burn). Volume bars use the trades in the coin's recent log. Markers: ⬆ level up · 🃏 card fired · ⚔ raid · 🕯 Ritual burn.</p>
    </div>
  );
}
