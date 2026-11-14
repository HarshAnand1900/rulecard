import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Card } from '../types';
import { art, outlineArt, shade, lightOf, eyesFor, GG, decU } from './epicArt';
import { EPICS, RARES, COMMONS, KWAY, kdim, symKey } from './epicData';
import epicCss from './epic.css?inline';
import symCss from './epicSyms.css?inline';

const BOLT = '<svg viewBox="0 0 24 24"><path d="M14 2L5 14h6l-2 8 9-12h-6z"/></svg>';
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const find = (rows: any[], card: string) => rows.find(r => norm(r[1]) === norm(card));

const back = (tier: string, label: string, name: string, rule: string, foot: string) =>
  `<div class="bx bx-${tier}"><div class="bxe"><span class="ring"></span><i></i></div><span class="bxl"><i></i>${label}</span></div>`
  + `<div class="bxp bx-${tier}"><b>${name}</b><p>${rule}</p><span>${foot}</span></div>`;

/** The front and back markup for one card, straight from the design file. */
function markup(card: Card): { tier: 'epic' | 'rare' | 'common' | 'mythic'; html: string; vars: Record<string, string>; sym: string } {
  if (card === 'Supernova') {
    return {
      tier: 'mythic', sym: 'supernova',
      vars: { '--msil': art('starry', 4), '--jsil': outlineArt('starry', 3, '#000', '#000'), '--engr': `url("data:image/svg+xml,${encodeURIComponent(decU(outlineArt('starry', 3, '#fff3c8', 'url(#gg)')).replace(/(<svg[^>]*>)/, '$1' + GG))}")` },
      html: `<div class="inner">
        <div class="bc"><div class="bcin">
          <div class="tone"></div><div class="eng"></div><div class="lit"></div><div class="spot"></div>
          <div class="rays"></div><div class="aura"></div><div class="dust"></div>
          <div class="jk"><div class="eg"></div><div class="shine"></div></div>
          <div class="hair"></div>
          <div class="mk t"><span><i></i>MYTHIC</span><span>1 / 1</span></div>
          <div class="mk b"><span>JOKER · 29</span><span class="chip">${BOLT}100</span></div>
          <div class="sweep"></div><div class="glare"></div>
        </div></div>
        <div class="bc back"><div class="bcin">
          <div class="tone"></div><div class="eng"></div><div class="lit"></div><div class="spot"></div><div class="hair"></div>
          <div class="bkcenter"><div class="emb"><span class="ring"></span><i></i></div><div class="mk" style="position:static;justify-content:center"><span><i></i>MYTHIC · 1 / 1</span></div></div>
          <div class="bkrule"><p>The pot spends as much as the daily cap allows in one go, and Heat jumps to 3. Level 3 coins only.</p><span>100 ENERGY · NEEDS MANY SIGNERS</span></div>
          <div class="sweep"></div>
        </div></div>
      </div>`,
    };
  }
  let r = find(EPICS, card);
  if (r) {
    const [no, name, how, stat, , a, d, rule] = r;
    return {
      tier: 'epic', sym: symKey(name),
      vars: { '--a': a, '--d': d, '--art': art('wink', 2), '--eyes': eyesFor(lightOf(a, .55)) },
      html: `<div class="inner">
        <div class="face front">
          <div class="dots"></div><div class="glow"></div>
          <div class="art"><div class="ht"></div><div class="eyes"></div></div>
          <div class="top"><span class="lbl">JOKER / ${no}</span><span class="pill"><i></i>EPIC</span></div>
          <div class="bottom"><span class="how">${how}</span><span class="name">${name}</span>
            <div class="row"><span class="stat">${stat}</span><span class="nrg">${BOLT}50 ENERGY</span></div></div>
          <div class="escan"></div><div class="eroll"></div><div class="evig"></div><div class="edge"></div><div class="glare"></div>
        </div>
        <div class="face back"><div class="dots"></div>${back('epic', `EPIC · JOKER / ${no}`, name, rule, `${String(how).toUpperCase()} · 50 ENERGY`)}<div class="edge"></div></div>
      </div>`,
    };
  }
  r = find(RARES, card);
  if (r) {
    const [no, name, how, stat, p, s2, , rule] = r;
    return {
      tier: 'rare', sym: symKey(name),
      vars: { '--p': p, '--s': s2, '--bg1': shade(p, .16), '--bg0': shade(p, .03), '--sil': outlineArt('laugh', 1, '#000', '#000'), '--lines': outlineArt('laugh', 1, p, '#000') },
      html: `<div class="inner">
        <div class="rface"><div class="scr">
          <div class="px"></div><div class="aura"></div><div class="big">${String(no).padStart(2, '0')}</div>
          <div class="rhead"><div><b>JOKER.SYS / ${no}</b><small>(c) $JEST TREASURY</small></div><span class="rtag">RARE</span></div>
          <div class="rj"><div class="fill"></div><div class="glo"></div><div class="lin"></div></div>
          <div class="rbody">
            <div class="rrow"><span class="k">fx</span><span class="lead"></span><span class="v">${stat}</span></div>
            <div class="rrow"><span class="k">cost</span><span class="lead"></span><span class="v">20 NRG</span></div>
            <div class="rrow"><span class="k">play</span><span class="lead"></span><span class="v">${String(how).toUpperCase()}</span></div>
            <div class="rname">&gt; ${name}<span class="cur"></span></div>
          </div>
          <div class="scan"></div><div class="roll"></div><div class="vig"></div><div class="rglare"></div>
        </div></div>
        <div class="rface back"><div class="scr"><div class="px"></div>${back('rare', `RARE · JOKER.SYS / ${no}`, name, rule, `${String(how).toUpperCase()} · 20 NRG`)}<div class="scan"></div><div class="vig"></div></div></div>
      </div>`,
    };
  }
  r = find(COMMONS, card)!;
  const [no, name, way, wayL, en, face, detail, t, b, , , rule, ac, mid] = r;
  return {
    tier: 'common', sym: symKey(name),
    vars: { '--t': t, '--m': mid, '--b': b, '--ac': ac, '--bd': kdim(t, .7), '--sil': art('grin', 0), '--way': KWAY[way], '--holo': holoOf(140) },
    html: `<div class="inner">
      <div class="kface"><div class="ksky">
        <div class="ksun"></div><div class="kcl c1"></div><div class="kcl c2"></div><div class="grain"></div>
        <div class="ktop"><span class="kbat"><span>${BOLT}${en}</span><i></i></span><span class="kname">${name}</span><span class="kway"><span></span></span></div>
        <div class="kwin"><div class="kaura"></div><div class="kpat"></div><div class="kcl c1"></div><div class="kwm"></div><div class="kj"></div><div class="kbadge"><span></span></div></div>
        <div class="ktier"><span class="gem"></span><span>COMMON</span><span class="sp"></span><span class="lv">L1+</span><span class="stk">∞</span></div>
        <div class="kdiv"></div><div class="kface-t">${face}</div><div class="kscale">${detail}</div>
        <div class="kfoot"><span class="w">${wayL}</span><span class="tk"><i></i>$JEST</span></div>
        <div class="kgrain"></div><div class="kedge"></div><div class="kglare"></div>
      </div></div>
      <div class="kface back"><div class="ksky"><div class="ksun"></div><div class="kcl c1"></div><div class="kcl c2"></div>${back('common', `COMMON · No.${String(no).padStart(2, '0')}`, name, rule, `${wayL} · ${en} ENERGY`)}</div></div>
    </div>`,
  };
}
const holoOf = (ang: number) => `conic-gradient(from ${ang}deg,#9ff0ff,#c8a6ff,#ffb3e6,#fff4b0,#b6ffd9,#9ff0ff)`;

let sheets: CSSStyleSheet[] | null = null;
function adopt(root: ShadowRoot) {
  try {
    if (!sheets) { sheets = [epicCss, symCss].map(t => { const x = new CSSStyleSheet(); x.replaceSync(t); return x; }); }
    (root as any).adoptedStyleSheets = sheets;
  } catch {
    for (const t of [epicCss, symCss]) { const st = document.createElement('style'); st.textContent = t; root.appendChild(st); }
  }
}

/** One card, drawn in its rarity's design inside its own shadow root so the app's styles cannot leak in. Hover tilts and lights it; click turns it over. */
export function EpicCard({ card, scale = 1 }: { card: Card; scale?: number }) {
  const m = useMemo(() => markup(card), [card]);
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const h = host.current; if (!h) return;
    const root = h.shadowRoot ?? h.attachShadow({ mode: 'open' });
    root.innerHTML = '';
    adopt(root);
    const wrap = document.createElement('div');
    wrap.className = `ec ec-${m.tier} ec-sym-${m.sym}`;
    wrap.style.transform = `scale(${scale})`; wrap.style.transformOrigin = 'top left';
    const el = document.createElement('div');
    el.className = 'ecard'; el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${card} card, click to turn over`);
    for (const [k, v] of Object.entries(m.vars)) el.style.setProperty(k, v);
    el.innerHTML = m.html;
    wrap.appendChild(el); root.appendChild(wrap);
    const inner = el.querySelector('.inner') as HTMLElement;
    let flipped = false, rx = 0, ry = 0, raf = 0;
    const apply = () => { inner.style.transform = `rotateY(${flipped ? 180 : 0}deg) rotateX(${rx}deg) rotateY(${ry}deg)`; };
    const sp = (k: string, v: string) => el.style.setProperty(k, v);
    if (m.tier === 'mythic') {
      let t = 0;
      const rim = (a: number) => `conic-gradient(from ${a}deg, #7a5418, #fff1c2, #c8973e, #fbe6a6, #5e4012, #f3cf7a, #fff8e0, #a87a2e, #7a5418)`;
      const loop = () => {
        t += 1; sp('--rimg', rim((t * .5) % 360));
        if (!el.classList.contains('hover')) { sp('--lx', (50 + Math.cos(t / 90) * 42).toFixed(1) + '%'); sp('--ly', (46 + Math.sin(t / 70) * 40).toFixed(1) + '%'); }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.classList.add('hover'); sp('--gx', (x * 100).toFixed(1)); sp('--gy', (y * 100).toFixed(1));
      if (m.tier === 'common') { sp('--holo', holoOf(Math.round(x * 240 + y * 80))); sp('--px', ((0.5 - x) * 14).toFixed(1) + 'px'); }
      if (m.tier === 'mythic') { sp('--lx', (x * 100).toFixed(1) + '%'); sp('--ly', (y * 100).toFixed(1) + '%'); sp('--jx', ((x - .5) * 10).toFixed(1) + 'px'); sp('--jy', ((y - .5) * 8).toFixed(1) + 'px'); }
      rx = (0.5 - y) * 16; ry = (x - 0.5) * 18; apply();
    };
    const leave = () => {
      el.classList.remove('hover');
      if (m.tier === 'common') { sp('--holo', holoOf(140)); sp('--px', '0px'); }
      if (m.tier === 'mythic') { sp('--jx', '0px'); sp('--jy', '0px'); }
      rx = ry = 0; apply();
    };
    const flip = () => { flipped = !flipped; apply(); };
    el.addEventListener('mousemove', move); el.addEventListener('mouseleave', leave); el.addEventListener('click', flip);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave); el.removeEventListener('click', flip); };
  }, [m, scale, card]);

  return <div className="ec-host" ref={host} style={{ width: 240 * scale, height: 340 * scale, flex: 'none' }} />;
}
