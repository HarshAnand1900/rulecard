/* Rulecard background: a grid that bends toward the pointer (it wanders by itself when there is none), ripples, and card, joker and
   symbol outlines at the nodes that glow as the grid bends near them. The field scrolls with the page at a slower speed. */
(() => {
  if (window.__rcbg) return; window.__rcbg = {};
  const J = ['1-common-grin', '2-rare-laugh', '3-epic-wink', '4-mythic-starry', '5-wild-shades'];
  const SY = ['rally', 'curse', 'ward', 'ember', 'rollcall', 'siren', 'hedge', 'prophecy', 'recruit', 'diamond', 'laststand', 'counter', 'slowburn', 'inferno', 'storm', 'blackhole', 'heist', 'war', 'whale', 'alliance', 'harvest', 'supernova', 'conquest', 'wildcard', 'way-solo', 'way-backed', 'way-signed', 'way-contested', 'way-raid'];
  const CD = ['01-common-rally', '02-common-curse', '03-common-ward', '04-common-ember', '05-common-rollcall', '06-common-siren', '07-common-hedge', '08-rare-prophecy', '09-rare-recruit', '10-rare-diamond', '11-rare-laststand', '12-rare-counter', '13-rare-slowburn', '14-epic-inferno', '15-epic-storm', '16-epic-blackhole', '17-epic-heist', '18-epic-war', '19-epic-whale', '20-epic-alliance', '21-epic-harvest', '22-mythic-supernova', '23-mythic-conquest'];
  const JT = ['#F3E6CC', '#FF9A5C', '#5AA9FF', '#B57BFF', '#FF7AC6'], CT = { common: '#CFC6B4', rare: '#5AA9FF', epic: '#B57BFF', mythic: '#FFC24B' };
  const LILAC = '#B9ABFF', GOLD = '#FFD68C', BASE = [160, 140, 245];
  // omen tint: the whole mesh (lines, pulses, icons, drifting jokers) eases toward one colour while an omen is active, and back when it ends
  const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const toHex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  let TG = null, TA = 0, TT = 0, TQ = 0; // target colour, current amount, target amount, amount in steps of 0.2 (keeps the sprite cache small)
  const mixHex = (hex, k) => (TG && TQ > 0 ? toHex(mixc(hex2rgb(hex), TG, TQ * k)) : hex);
  window.__rcbg.tint = hex => { if (hex) { TG = hex2rgb(hex); TT = 1; } else TT = 0; if (reduce) { TA = TT; TQ = Math.round(TA * 5) / 5; draw(performance.now()); } };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cv = document.createElement('canvas'); cv.id = 'bg'; cv.setAttribute('aria-hidden', 'true');
  Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '0', pointerEvents: 'none', display: 'block' });
  document.body.insertBefore(cv, document.body.firstChild);
  const ctx = cv.getContext('2d');

  const IM = {}, TC = {};
  const load = (pre, dir, names) => names.forEach(n => { const i = new Image(); i.decoding = 'async'; i.src = '/bg/' + dir + '/' + n + '.png'; IM[pre + n] = i; });
  load('j', 'jokers', J); load('s', 'symbols', SY);  const tint = (key, col, blur, W) => {
    const k = key + col + blur, im = IM[key]; if (!im || !im.complete || !im.naturalWidth) return null;
    if (!TC[k]) {
      const H = Math.round(W * im.naturalHeight / im.naturalWidth), pad = blur ? 30 : 0, o = document.createElement('canvas'); o.width = W + pad * 2; o.height = H + pad * 2;
      const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d'); tg.drawImage(im, 0, 0, W, H); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, W, H);
      const g = o.getContext('2d'); if (blur) g.filter = 'blur(' + blur + 'px)'; g.drawImage(t, pad, pad); TC[k] = o;
    }
    return TC[k];
  };
  const rnd = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  let w = 0, h = 0, S = 68, cols = 0, rows = 0, far = [];
  const m = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };
  let ripples = [], nextBurn = 1600, t0 = performance.now(), sy = 0;
  function build() {
    const dpr = Math.min(2, devicePixelRatio || 1); w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = w < 700 ? 56 : 68; cols = Math.ceil(w / S) + 3; rows = Math.ceil(h / S) + 3;
    far = Array.from({ length: w < 700 ? 4 : 7 }, (_, i) => ({ x: rnd(i, 1, 7), y: rnd(i, 2, 7), j: Math.floor(rnd(i, 3, 7) * 5), s: 150 + rnd(i, 4, 7) * 130, ph: rnd(i, 5, 7) * 6.28, sp: 0.01 + rnd(i, 6, 7) * 0.012, rot: (rnd(i, 7, 7) - 0.5) * 0.5 }));
  }
  addEventListener('resize', () => { build(); if (reduce) draw(performance.now()); });
  addEventListener('pointermove', e => { m.tx = e.clientX; m.ty = e.clientY; if (!m.active) { m.x = e.clientX; m.y = e.clientY; } m.active = true; }, { passive: true });
  addEventListener('pointerdown', e => { ripples.push({ x: e.clientX, y: e.clientY, t: performance.now(), gold: false }); }, { passive: true });
  document.addEventListener('pointerleave', () => { m.active = false; });
  addEventListener('scroll', () => { sy = scrollY * 0.25; if (reduce) draw(performance.now()); }, { passive: true });

  function draw(now) {
    const t = (now - t0) / 1000;
    TA += (TT - TA) * 0.045; if (TT === 0 && TA < 0.01) { TA = 0; if (!TQ) TG = null; } TQ = Math.round(TA * 5) / 5;
    if (!m.active) { m.tx = w * (0.7 + 0.14 * Math.sin(t * 0.21)); m.ty = h * (0.36 + 0.16 * Math.cos(t * 0.17)); }
    const kk = m.x < -999 ? 1 : 0.08; m.x += (m.tx - m.x) * kk; m.y += (m.ty - m.y) * kk;
    if (!reduce && now - t0 > nextBurn) { ripples.push({ x: Math.random() * w, y: Math.random() * h * 0.85, t: now, gold: true }); nextBurn = now - t0 + 4200 + Math.random() * 3000; }
    ripples = ripples.filter(rp => now - rp.t < 3400);
    ctx.clearRect(0, 0, w, h);

    // big faint jokers drifting far behind
    for (const f of far) {
      const im = tint('j' + J[f.j], mixHex(JT[f.j], 0.8), 14, 110); if (!im) continue;
      const yy = ((f.y - t * f.sp * (reduce ? 0 : 1)) % 1.3 + 1.3) % 1.3 - 0.15, px = f.x * w + (m.x - w / 2) * -0.03, py = yy * h - sy * 0.3, sc = f.s / 110;
      ctx.save(); ctx.translate(px, py); ctx.rotate(f.rot + Math.sin(t * 0.2 + f.ph) * 0.08); ctx.globalAlpha = 0.07; ctx.drawImage(im, -im.width * sc / 2, -im.height * sc / 2, im.width * sc, im.height * sc); ctx.restore();
    }

    // nodes: the field is infinite upward and downward, so scrolling slides the same icons through
    const sig = Math.min(w, h) * 0.24, sig2 = 2 * sig * sig, j0 = Math.floor(sy / S), oy = -(sy % S), P = new Array(rows * cols);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const ja = j0 + j, q = rnd(i, ja, 1), x0 = (i - 1) * S, y0 = (j - 1) * S + oy;
      const p = { x0, y0, ph: rnd(i, ja, 3) * 6.28, kind: 0, glow: 0, gold: 0 };
      if (q < 0.06) { p.kind = 1; const k = Math.floor(rnd(i, ja, 2) * 5); p.key = 'j' + J[k]; p.ti = k; }
      else if (q < 0.28) { p.kind = 2; p.key = 's' + SY[Math.floor(rnd(i, ja, 2) * SY.length)]; }
      else if (q > 0.95) p.kind = 3;
      const dx = m.x - x0, dy = m.y - y0, pull = Math.exp(-(dx * dx + dy * dy) / sig2);
      let x = x0 + dx * pull * 0.4, y = y0 + dy * pull * 0.4, glow = pull;
      if (!reduce) { y += Math.sin(t * 0.6 + x0 * 0.012 + y0 * 0.004) * 3; x += Math.cos(t * 0.5 + y0 * 0.01) * 2; }
      for (const rp of ripples) {
        const age = Math.max(0, (now - rp.t) / 1000), R = age * 430, rx = x - rp.x, ry = y - rp.y, rd = Math.hypot(rx, ry) || 1, band = Math.exp(-((rd - R) ** 2) / (2 * 40 * 40)) * (1 - age / 3.4);
        x += rx / rd * band * 15; y += ry / rd * band * 15; p.gold = Math.max(p.gold, band * (rp.gold ? 1 : 0.7)); glow = Math.max(glow, band * 0.8);
      }
      p.x = x; p.y = y; p.glow = glow; P[j * cols + i] = p;
    }

    // grid lines: quiet ones in one stroke, lit ones one by one
    const tcs = (TG ? mixc(BASE, TG, TA * 0.9) : BASE).join(','), gcs = (TG ? mixc([232, 194, 122], TG, TA * 0.8) : [232, 194, 122]).join(','), hot = [];
    ctx.lineWidth = 1; ctx.beginPath();
    const edge = (a, b) => { const gl = (a.glow + b.glow) / 2, gd = Math.max(a.gold, b.gold), al = 0.08 + gl * 0.4 + gd * 0.35; if (al < 0.14 && gd < 0.1) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } else hot.push([a, b, al, gd]); };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const p = P[j * cols + i]; if (i < cols - 1) edge(p, P[j * cols + i + 1]); if (j < rows - 1) edge(p, P[(j + 1) * cols + i]); }
    ctx.strokeStyle = 'rgba(' + tcs + ',0.11)'; ctx.stroke();
    for (const [a, b, al, gd] of hot) { ctx.strokeStyle = gd > 0.15 ? 'rgba(' + gcs + ',' + Math.min(0.7, al) + ')' : 'rgba(' + tcs + ',' + Math.min(0.6, al) + ')'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

    // icons at the nodes
    for (const p of P) {
      if (p.kind === 3) { ctx.fillStyle = 'rgba(' + tcs + ',' + (0.12 + p.glow * 0.6) + ')'; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); continue; }
      if (!p.kind) continue;
      const isJ = p.kind === 1, isC = p.kind === 4;
      const col = p.gold > 0.15 ? mixHex(GOLD, 0.8) : isJ ? mixHex(JT[p.ti], 0.8) : isC ? mixHex(p.ct, 0.8) : (p.glow > 0.45 ? mixHex('#E9E3FF', 0.85) : mixHex(LILAC, 0.9));
      const im = tint(p.key, col, 0, isC ? 100 : 110); if (!im) continue;
      const base = isJ ? 40 : isC ? 34 : 22, sc = (1 + p.glow * 0.7 + p.gold * 0.35) * base / im.width * (isJ || isC ? 1 : 1.2), al = Math.min(0.95, (isJ ? 0.34 : isC ? 0.3 : 0.26) + p.glow * 0.8 + p.gold * 0.6);
      const bob = reduce ? 0 : Math.sin(t * 0.9 + p.ph) * 3, flip = p.gold > 0.05 ? Math.cos(p.gold * Math.PI * 2) : 1, rot = (reduce ? 0 : Math.sin(t * 0.5 + p.ph) * 0.1) + (m.x - p.x) / w * p.glow * 0.8;
      ctx.save(); ctx.translate(p.x, p.y + bob); ctx.rotate(rot); ctx.scale(flip, 1); ctx.globalAlpha = al;
      if (p.glow > 0.4 || p.gold > 0.3) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
      ctx.drawImage(im, -im.width * sc / 2, -im.height * sc / 2, im.width * sc, im.height * sc); ctx.restore();
    }

    for (const rp of ripples) { const age = Math.max(0, (now - rp.t) / 1000); ctx.strokeStyle = rp.gold ? 'rgba(' + gcs + ',' + (0.22 * (1 - age / 3.4)) + ')' : 'rgba(' + tcs + ',' + (0.2 * (1 - age / 3.4)) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(rp.x, rp.y, age * 430, 0, 6.29); ctx.stroke(); }
    if (m.x > -999) { const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, sig); gr.addColorStop(0, 'rgba(' + tcs + ',0.11)'); gr.addColorStop(1, 'rgba(' + tcs + ',0)'); ctx.fillStyle = gr; ctx.fillRect(m.x - sig, m.y - sig, sig * 2, sig * 2); }
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.8); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  }

  build();
  if (reduce) { const first = () => draw(performance.now()); first(); setTimeout(first, 600); setTimeout(first, 1800); }
  else { const loop = now => { requestAnimationFrame(loop); if (document.hidden) return; draw(now); }; requestAnimationFrame(loop); }
})();
