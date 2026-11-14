// Price chart for a coin, in the style of a trading terminal: market cap or price candles, volume bars, a price scale on the right,
// a live last-price tag, a crosshair with value and time labels, and game events marked on the chart.
// Drag to pan back and forth in time, zoom with the buttons, Ctrl + scroll, or scroll once you have clicked the chart, double click to reset.
// Everything is read from the chain: one price point per trade or burn, and trade sizes from the coin's log.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { LogEntry } from './types';

export interface PricePoint { at: number; price: string; mcap: string; }
const MIN = 60_000, HOUR = 60 * MIN;
const RANGES: [string, number][] = [['1h', HOUR], ['6h', 6 * HOUR], ['24h', 24 * HOUR], ['All', Infinity]];
const EVENT: Record<string, string> = { level_up: 'level up', card: 'card', raid: 'raid', ritual_made: 'ritual', graduated: 'graduated' };
const EV_COLOR: Record<string, string> = { 'level up': '#5BE6A4', card: '#FF8B25', raid: '#FF5C5C', ritual: '#FFC83D', graduated: '#6C8CFF' };
/** a small drawn marker for each kind of event (no emoji): a card, crossed blades, an arrow, a flame, a star */
const EvMark = ({ kind, cx, cy }: { kind: string; cx: number; cy: number }) => {
  const c = EV_COLOR[kind] ?? '#FF8B25';
  const shape = kind === 'card' ? <g transform="rotate(-8)"><rect x={-4.5} y={-6} width={9} height={12} rx={1.8} fill="#0B0C10" stroke={c} strokeWidth={1.4} /><path d="M0 -2.8L2 0L0 2.8L-2 0Z" fill={c} /></g>
    : kind === 'raid' ? <g stroke={c} strokeWidth={1.6} strokeLinecap="round"><path d="M-5 -5L5 5M5 -5L-5 5" /></g>
    : kind === 'level up' ? <path d="M0 -6L5.5 4H-5.5Z" fill={c} />
    : kind === 'ritual' ? <path d="M0 -6C3 -2 5 0 5 3A5 5 0 0 1 -5 3C-5 0 -2 -1 0 -6Z" fill={c} />
    : <path d="M0 -6L1.8 -1.8L6 -1.5L2.8 1.3L3.8 5.5L0 3.2L-3.8 5.5L-2.8 1.3L-6 -1.5L-1.8 -1.8Z" fill={c} />;
  return <g transform={`translate(${cx} ${cy})`} className="ev-mark">{shape}</g>;
};
export const toMicro = (y: string) => Number(BigInt(y) / 10n ** 12n) / 1e6; // yocto NEAR per token → NEAR per 1M tokens
const toN = (y: string) => Number(BigInt(y) / 10n ** 21n) / 1e3;
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);
const fmtV = (v: number, unit: 'mcap' | 'price') => unit === 'price' ? v.toFixed(v < 10 ? 4 : 2) : v >= 1000 ? `${(v / 1000).toFixed(2)}k` : v.toFixed(v < 10 ? 2 : 1);
const fmtVol = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v >= 10 ? v.toFixed(0) : v.toFixed(2);
const spanLabel = (ms: number) => ms >= 36 * HOUR ? `${(ms / (24 * HOUR)).toFixed(1)}d` : ms >= HOUR ? `${(ms / HOUR).toFixed(1)}h` : `${Math.max(1, Math.round(ms / MIN))}m`;

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number; buy: number; empty: boolean }

export default function PriceChart({ points, log, now }: { points: PricePoint[]; log: LogEntry[]; now: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(720);
  const [range, setRange] = useState(6 * HOUR);
  const [view, setView] = useState<[number, number] | null>(null);   // null: follow "now"; otherwise the user's own window
  const [hover, setHover] = useState<number | null>(null);
  const [mode, setMode] = useState<'candles' | 'line'>('candles');
  const [unit, setUnit] = useState<'mcap' | 'price'>('mcap');
  const [active, setActive] = useState(false);                        // plain scrolling zooms only after you have clicked the chart
  const drag = useRef<{ x: number; a: number; b: number; moved: boolean } | null>(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(e => setW(Math.max(300, Math.floor(e[0].contentRect.width))));
    ro.observe(wrap.current); return () => ro.disconnect();
  }, []);

  const H = Math.round(Math.min(520, Math.max(340, w * 0.58)));
  const padL = 8, padR = 62, padT = 12, padB = 24;
  const volH = Math.round(H * 0.15), gap = 8;
  const priceBottom = H - padB - volH - gap;
  const plotW = w - padL - padR;

  const all = useMemo(() => points.map(p => ({ t: p.at, p: toMicro(p.price), m: toN(p.mcap) })).sort((a, b) => a.t - b.t), [points]);
  const firstT = all.length ? all[0].t : now - HOUR;
  // the visible window: the chosen range ending now, or wherever the user dragged and zoomed to
  const win: [number, number] = view ?? [range === Infinity ? Math.min(firstT, now - 10 * MIN) : now - range, now + (range === Infinity ? (now - firstT) * 0.04 : range * 0.04)];
  const [w0, w1] = win, span = Math.max(1, w1 - w0);
  const clamp = (a: number, b: number): [number, number] => {
    let s = Math.min(Math.max(b - a, 2 * MIN), Math.max(30 * MIN, (now - firstT) * 3 + HOUR));
    const mid = (a + b) / 2; a = mid - s / 2; b = mid + s / 2;
    const lo = firstT - s * 0.25, hi = now + s * 0.35;                    // you can drift a little past the data on either side, not away from it
    if (a < lo) { b += lo - a; a = lo; } if (b > hi) { a -= b - hi; b = hi; }
    return [a, b];
  };
  const zoom = (factor: number, at: number = (w0 + w1) / 2) => { const a = at - (at - w0) * factor, b = at + (w1 - at) * factor; setView(clamp(a, b)); };
  const pan = (dt: number) => setView(clamp(w0 + dt, w1 + dt));

  const data = useMemo(() => {
    const inside = all.filter(x => x.t >= w0 && x.t <= w1);
    const before = [...all].reverse().find(x => x.t < w0);
    const pts = before ? [{ ...before, t: w0 }, ...inside] : inside;
    const last = pts[pts.length - 1];
    const end = Math.min(now, w1);
    if (last && last.t < end) pts.push({ ...last, t: end });                 // hold the last price until now
    return pts;
  }, [all, w0, w1, now]);
  const val = (d: { p: number; m: number }) => (unit === 'mcap' ? d.m : d.p);

  const CN = Math.max(36, Math.min(96, Math.floor(plotW / 8)));
  const step = span / CN;
  const candles = useMemo(() => {
    if (data.length < 1) return [] as Candle[];
    const trades = log.filter(e => (e.kind === 'buy' || e.kind === 'sell') && e.at >= w0 && e.at <= w1).map(e => ({ t: e.at, n: toN(e.near), buy: e.kind === 'buy' }));
    const out: Candle[] = [];
    let prev = val(data[0]);
    for (let i = 0; i < CN; i++) {
      const a = w0 + i * step, b = a + step;
      if (a > now) { out.push({ t: a, o: prev, h: prev, l: prev, c: prev, v: 0, buy: 0, empty: true }); continue; }
      const inb = data.filter(d => d.t >= a && (d.t < b || (i === CN - 1 && d.t <= b)));
      let h = prev, l = prev, c = prev; const o = prev;
      for (const d of inb) { const v = val(d); h = Math.max(h, v); l = Math.min(l, v); c = v; }
      let v = 0, buy = 0;
      for (const tr of trades) if (tr.t >= a && tr.t < b) { v += tr.n; if (tr.buy) buy += tr.n; }
      prev = c; out.push({ t: a, o, h, l, c, v, buy, empty: b < data[0].t });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, log, unit, CN, w0, w1, now]);
  const events = useMemo(() => log.filter(e => EVENT[e.kind] && e.at >= w0 && e.at <= w1).map(e => ({ t: e.at, icon: EVENT[e.kind], text: e.kind === 'card' ? e.memo : e.kind === 'raid' ? `raid ${e.memo}` : e.kind === 'level_up' ? `level up ${e.memo}` : e.kind === 'ritual_made' ? 'Ritual made' : e.kind })), [log, w0, w1]);

  const x = (t: number) => padL + ((t - w0) / span) * plotW;
  const live = candles.filter(k => !k.empty);
  const vis = data.length ? data : all.slice(-1);
  let lo = Math.min(...(live.length ? live.map(k => k.l) : vis.map(val)), ...(vis.length ? [] : [0]));
  let hi = Math.max(...(live.length ? live.map(k => k.h) : vis.map(val)), ...(vis.length ? [] : [1]));
  if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
  const padV = (hi - lo) * 0.14 || hi * 0.05 || 0.1; lo = Math.max(0, lo - padV); hi += padV;
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (priceBottom - padT);
  const maxVol = Math.max(1e-9, ...candles.map(k => k.v));
  const vy = (v: number) => H - padB - (v / maxVol) * volH;
  const valAt = (t: number) => { let v = data.length ? val(data[0]) : 0; for (const d of data) { if (d.t <= t) v = val(d); else break; } return v; };
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(val(d)).toFixed(1)}`).join('');
  const area = data.length ? `${path}L${x(data[data.length - 1].t).toFixed(1)},${priceBottom}L${x(data[0].t).toFixed(1)},${priceBottom}Z` : '';
  const yTicks = [0, 1, 2, 3, 4].map(i => lo + ((hi - lo) * i) / 4);
  const xTicks = [0, 1, 2, 3, 4].map(i => w0 + (span * i) / 4);
  const tickLabel = (t: number) => (span > 30 * HOUR ? new Date(t).toISOString().slice(5, 10) : hhmm(t));
  const lastPt = data.length ? data[data.length - 1] : null;
  const firstPt = data.length ? data[0] : null;
  const last = lastPt ? val(lastPt) : 0, first = firstPt ? val(firstPt) : 0, change = first ? ((last - first) / first) * 100 : 0;
  const upNow = last >= first;
  const bw = Math.max(2.5, (plotW / CN) * 0.66);
  const atEnd = !view || w1 >= now;

  // ---- interaction: drag to pan, wheel / buttons to zoom, double click to reset
  const timeAtX = (clientX: number) => { const r = svgRef.current!.getBoundingClientRect(); const px = ((clientX - r.left) / r.width) * w; return w0 + ((px - padL) / plotW) * span; };
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, a: w0, b: w1, moved: false }; setActive(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x; if (Math.abs(dx) > 3) d.moved = true;
      if (d.moved) { const r = svgRef.current!.getBoundingClientRect(); const dt = -(dx / r.width) * w * ((d.b - d.a) / plotW); setView(clamp(d.a + dt, d.b + dt)); setHover(null); return; }
    }
    setHover(Math.min(w1, Math.max(w0, timeAtX(e.clientX))));
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => { drag.current = null; (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); };
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if (!(active || e.ctrlKey || e.metaKey)) return;                       // otherwise the page scrolls as usual
    e.preventDefault();
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { pan((e.deltaX / plotW) * span); return; }
    zoom(Math.exp(e.deltaY * 0.0016), timeAtX(e.clientX));
  };
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h);
  });

  if (all.length < 2) return <div className="panel chart"><h2>Chart</h2><p className="muted small">No trades yet.</p></div>;

  const hv = hover !== null ? valAt(hover) : null;
  const hk = hover !== null ? candles.find((k, i) => hover >= k.t && (hover < k.t + step || i === candles.length - 1)) : undefined;
  const hEvent = hover !== null ? events.find(ev => Math.abs(x(ev.t) - x(hover)) < 8) : undefined;
  const tipLeft = hover !== null && x(hover) > w * 0.6;
  const shown = (hk && !hk.empty ? hk : undefined) ?? [...candles].reverse().find(k => !k.empty);
  const tc = (k: Candle) => (k.c >= k.o ? 'up' : 'down');

  return (
    <div className="panel chart chart-pro">
      <div className="chart-head">
        <div className="chart-title">
          <span className="muted small mono">{unit === 'mcap' ? 'MARKET CAP' : 'PRICE'} · N{unit === 'price' ? ' PER 1M' : ''}</span>
          <div className="row gap wrap"><strong className="chart-big mono">{fmtV(last, unit)}</strong><span className={`mono small chart-chg ${upNow ? 'up' : 'down'}`}>{upNow ? '▲' : '▼'} {Math.abs(change).toFixed(2)}% <span className="muted">{spanLabel(span)}</span></span></div>
        </div>
        <div className="chart-ctl">
          <div className="seg small" role="group" aria-label="Chart value"><button aria-pressed={unit === 'mcap'} onClick={() => setUnit('mcap')}>Market cap</button><button aria-pressed={unit === 'price'} onClick={() => setUnit('price')}>Price</button></div>
          <div className="seg small" role="group" aria-label="Chart type"><button aria-pressed={mode === 'candles'} onClick={() => setMode('candles')}>Candles</button><button aria-pressed={mode === 'line'} onClick={() => setMode('line')}>Line</button></div>
          <div className="seg small" role="group" aria-label="Time range">{RANGES.map(([l, v]) => <button key={l} aria-pressed={!view && range === v} onClick={() => { setRange(v); setView(null); }}>{l}</button>)}</div>
          <div className="seg small chart-nav" role="group" aria-label="Move and zoom the chart">
            <button onClick={() => pan(-span * 0.3)} aria-label="Earlier" title="Earlier">‹</button>
            <button onClick={() => pan(span * 0.3)} aria-label="Later" title="Later">›</button>
            <button onClick={() => zoom(1.5)} aria-label="Zoom out" title="Zoom out">−</button>
            <button onClick={() => zoom(1 / 1.5)} aria-label="Zoom in" title="Zoom in">+</button>
            <button onClick={() => setView(null)} aria-label="Back to now" title="Back to now" disabled={!view}>Live</button>
          </div>
        </div>
      </div>
      {shown && <div className="chart-ohlc mono small"><span className="muted">{hover !== null && hk && !hk.empty ? hhmm(hk.t) : 'Latest'}</span><span>O <b className={tc(shown)}>{fmtV(shown.o, unit)}</b></span><span>H <b className={tc(shown)}>{fmtV(shown.h, unit)}</b></span><span>L <b className={tc(shown)}>{fmtV(shown.l, unit)}</b></span><span>C <b className={tc(shown)}>{fmtV(shown.c, unit)}</b></span><span>Vol <b>{fmtVol(shown.v)} N</b></span><span className="muted">candle ≈ {spanLabel(step)}</span></div>}
      <div ref={wrap} className="chart-wrap">
        <svg ref={svgRef} width={w} height={H} role="img" aria-label={`${unit === 'mcap' ? 'Market cap' : 'Price'} chart, ${spanLabel(span)} window. Drag to move through time.`} className={drag.current?.moved ? 'dragging' : ''}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { if (!drag.current) { setHover(null); setActive(false); } }} onDoubleClick={() => setView(null)}>
          <defs><linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={upNow ? 'var(--up)' : 'var(--down)'} stopOpacity=".28" /><stop offset="1" stopColor={upNow ? 'var(--up)' : 'var(--down)'} stopOpacity="0" /></linearGradient>
            <clipPath id="pc-clip"><rect x={padL} y={0} width={plotW} height={H} /></clipPath></defs>
          {yTicks.map((v, i) => <g key={i}><line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} className="grid" /><text x={w - padR + 8} y={y(v) + 4} className="axis">{fmtV(v, unit)}</text></g>)}
          {xTicks.map((t, i) => <g key={i}><line x1={x(t)} x2={x(t)} y1={padT} y2={H - padB} className="grid v" /><text x={x(t)} y={H - 7} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} className="axis">{tickLabel(t)}</text></g>)}
          <g clipPath="url(#pc-clip)">
            {mode === 'line' && data.length > 1 && <><path d={area} fill="url(#pc-fill)" /><path d={path} className={`line ${upNow ? 'up' : 'down'}`} /></>}
            {mode === 'candles' && candles.map((k, i) => {
              if (k.empty) return null;
              const cx = x(k.t) + (plotW / CN) / 2, up = k.c >= k.o, top = Math.min(y(k.o), y(k.c)), hgt = Math.max(1.5, Math.abs(y(k.o) - y(k.c)));
              return <g key={i} className={up ? 'cndl up' : 'cndl down'}><line x1={cx} x2={cx} y1={y(k.h)} y2={y(k.l)} /><rect x={cx - bw / 2} y={top} width={bw} height={hgt} rx={1} /></g>;
            })}
            {candles.map((k, i) => !k.empty && k.v > 0 && <rect key={`v${i}`} className={`vbar ${k.c >= k.o ? 'up' : 'down'}`} x={x(k.t) + (plotW / CN) / 2 - bw / 2} y={vy(k.v)} width={bw} height={H - padB - vy(k.v)} rx={1} />)}
            {events.map((ev, i) => <g key={i}><line x1={x(ev.t)} x2={x(ev.t)} y1={padT} y2={priceBottom} className="ev-line" /><circle cx={x(ev.t)} cy={y(valAt(ev.t))} r={4} className="ev-dot" /><EvMark kind={ev.icon} cx={x(ev.t)} cy={padT + 9} /></g>)}
            {now >= w0 && now <= w1 && <line x1={x(now)} x2={x(now)} y1={padT} y2={H - padB} className="now-line" />}
          </g>
          <line x1={padL} x2={w - padR} y1={priceBottom + gap / 2} y2={priceBottom + gap / 2} className="grid" />
          {atEnd && <><line x1={padL} x2={w - padR} y1={y(last)} y2={y(last)} className={`last-line ${upNow ? 'up' : 'down'}`} />
            <g className={`last-tag ${upNow ? 'up' : 'down'}`}><rect x={w - padR + 2} y={y(last) - 10} width={padR - 4} height={20} rx={5} /><text x={w - padR + 2 + (padR - 4) / 2} y={y(last) + 4} textAnchor="middle">{fmtV(last, unit)}</text></g></>}
          {hv !== null && hover !== null && <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} className="cross" />
            <line x1={padL} x2={w - padR} y1={y(hv)} y2={y(hv)} className="cross" />
            <circle cx={x(hover)} cy={y(hv)} r={4} className="hover-dot" />
            <g className="cross-tag"><rect x={w - padR + 2} y={y(hv) - 10} width={padR - 4} height={20} rx={5} /><text x={w - padR + 2 + (padR - 4) / 2} y={y(hv) + 4} textAnchor="middle">{fmtV(hv, unit)}</text></g>
            <g className="cross-tag"><rect x={Math.min(w - padR - 44, Math.max(padL, x(hover) - 22))} y={H - padB + 2} width={44} height={18} rx={5} /><text x={Math.min(w - padR - 22, Math.max(padL + 22, x(hover)))} y={H - padB + 15} textAnchor="middle">{hhmm(hover)}</text></g>
          </g>}
        </svg>
        {hv !== null && hover !== null && !drag.current && (
          <div className="chart-tip" style={{ left: tipLeft ? undefined : x(hover) + 14, right: tipLeft ? w - x(hover) + 14 : undefined }}>
            <div className="mono small">{new Date(hover).toISOString().slice(5, 16).replace('T', ' ')} UTC</div>
            <div className="mono">{fmtV(hv, unit)} <span className="muted small">{unit === 'mcap' ? 'N mcap' : 'N/1M'}</span></div>
            {hk && hk.v > 0 && <div className="mono small muted">vol {fmtVol(hk.v)} N · {fmtVol(hk.buy)} bought</div>}
            {hEvent && <div className="small"><b style={{ color: EV_COLOR[hEvent.icon] }}>{hEvent.icon}</b> {hEvent.text}</div>}
          </div>
        )}
        {!data.length && <div className="chart-empty small muted">No trades in this window. Drag the other way, or press Live.</div>}
      </div>
      <p className="small muted">Drag the chart to move through time. Zoom with − and +, with Ctrl + scroll, or scroll after clicking the chart. Double click to jump back to now. Every point is on-chain; volume bars use the coin's recent log. Markers: ⬆ level up · 🃏 card fired · ⚔ raid · 🕯 Ritual burn.</p>
    </div>
  );
}
