// @ts-nocheck
// Ported from the card design file: builds the joker silhouettes as SVG data URIs.
const CACHE: Record<string, string> = {};
export function art(face, lv) {
  const key = face + lv;
  if (CACHE[key]) return CACHE[key];
  const P = (d, a = 1) => `<path d="${d}" fill="#fff" fill-opacity="${a}"/>`;
  const C = (d, w) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const K = d => `<path d="${d}" fill="#000"/>`;
  const Wl = (d, w) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round"/>`;
  const dot = (x, y, r, a = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity="${a}"/>`;
  const dia = (x, y, rx, ry) => `M${x} ${y - ry}L${x + rx} ${y}L${x} ${y + ry}L${x - rx} ${y}Z`;
  const zg = (n, x0, x1, top, tip) => { let d = `M${x0} ${top}`; const w = (x1 - x0) / n; for (let i = 0; i < n; i++) d += `L${(x0 + w * (i + .5)).toFixed(1)} ${tip}L${(x0 + w * (i + 1)).toFixed(1)} ${top}`; return d + 'Z'; };
  let sh = '', cut = '';
  sh += P('M60 60C79 60 87 75 86 92C85 108 73 120 60 125C47 120 35 108 34 92C33 75 41 60 60 60Z');
  cut += C('M35 80C34 100 46 119 60 125C74 119 86 100 85 80', 2.4);
  sh += P('M34 64C28 44 16 26 2 12C22 18 42 30 52 52Z', .58) + P('M86 64C92 44 104 26 118 12C98 18 78 30 68 52Z', .58);
  const bells = [[2, 12], [118, 12], [60, 0]];
  if (lv >= 3) {
    const ml = 'M42 60C38 42 30 26 24 8C34 22 46 36 54 54Z', mr = 'M78 60C82 42 90 26 96 8C86 22 74 36 66 54Z';
    sh += P(ml, .8) + P(mr, .8); cut += C(ml, 1.6) + C(mr, 1.6);
    bells.push([24, 8], [96, 8]);
  }
  if (lv >= 4) {
    const il = 'M50 56C48 40 45 26 41 12C47 24 53 38 57 54Z', ir = 'M70 56C72 40 75 26 79 12C73 24 67 38 63 54Z';
    sh += P(il, .9) + P(ir, .9); cut += C(il, 1.5) + C(ir, 1.5);
    bells.push([41, 12], [79, 12]);
    const spark = (x, y, s, a) => P(`M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`, a);
    sh += spark(9, 58, 6, .95) + spark(111, 58, 6, .95) + spark(4, 96, 4, .7) + spark(116, 96, 4, .7) + spark(16, 36, 3, .6) + spark(104, 36, 3, .6);
  }
  const cn = 'M46 56C50 36 55 18 60 0C65 18 70 36 74 56Z';
  sh += P(cn); cut += C(cn, 1.8);
  if (lv >= 2) [[14.5, 20.5], [26, 31], [35.5, 43]].forEach(([x, y]) => cut += K(dia(x, y, 1.8, 2.6)) + K(dia(120 - x, y, 1.8, 2.6)));
  if (lv >= 2) cut += K(dia(60, 22, 1.8, 3)) + K(dia(60, 36, 2, 3.2));
  const band = 'M30 68C44 54 76 54 90 68L88 75C74 62 46 62 32 75Z';
  sh += P(band); cut += C(band, 2);
  if (lv >= 1) [[45, 63], [75, 63]].forEach(([x, y]) => cut += K(dia(x, y, 2.2, 2.6)));
  if (lv >= 4) cut += K('M51.5 61.4Q60 55.6 68.5 61.4Q60 67.2 51.5 61.4Z') + dot(60, 61.4, 2.3) + K(dia(60, 61.4, .7, 1.3));
  else if (lv >= 3) cut += K(dia(60, 61.4, 3.6, 4.6)) + dot(60, 61.4, 1.4);
  else if (lv >= 1) cut += K(dia(60, 61.4, 2.2, 2.6));
  bells.forEach(([x, y]) => { const r = lv === 0 ? 3.4 : 4.8; sh += dot(x, y, r); if (lv >= 1) cut += C(`M${x - 2.2} ${y + 1.6}L${x + 2.2} ${y + 1.6}`, 1.1); });
  if (face === 'cool') {
    cut += K('M36 79Q60 74 84 79L82 89Q72 92 62 86L58 86Q48 92 38 89Z') + Wl('M42 81Q49 79 55 80', 1.2);
  } else {
    if (lv === 0) cut += C('M40 77Q47 75 55 78', 2) + C('M80 77Q73 75 65 78', 2);
    else cut += C('M39 77Q47 73 55 79', 2.2) + C(face === 'starry' ? 'M81 77Q73 73 65 79' : 'M81 74Q73 69 65 77', 2.2);
    const star = (x, y) => K(`M${x} ${y - 6.5}Q${x} ${y} ${x + 6.5} ${y}Q${x} ${y} ${x} ${y + 6.5}Q${x} ${y} ${x - 6.5} ${y}Q${x} ${y} ${x} ${y - 6.5}Z`);
    const L = K('M55 87Q48 81 41 82Q46 89 55 87Z') + dot(51, 85.4, 1.7);
    const R = K('M65 87Q72 81 79 82Q74 89 65 87Z') + dot(75, 84.6, 1.6);
    if (face === 'laugh') cut += C('M41 87Q48 80 55 87', 2.4) + C('M65 87Q72 80 79 87', 2.4);
    else if (face === 'wink') cut += L + C('M65 86Q72 80 79 84', 2.4);
    else if (face === 'starry') cut += star(48, 86) + star(72, 86);
    else cut += L + R;
  }
  if (lv >= 1) cut += K(dia(47, 95.5, 2.4, 4.6)) + K(dia(73, 95.5, 2.4, 4.6));
  if (lv >= 3) cut += K(dia(47, 104, 1.2, 1.6)) + K(dia(73, 104, 1.2, 1.6));
  cut += C('M60.5 89Q58 96 61.5 98.5', 1.4);
  if (lv === 0) cut += K('M47 105Q60 111 74 102Q61 107.5 47 105Z') + C('M74 102Q78 100 77 96', 1.6);
  else if (lv === 1) cut += K('M45 104Q60 114 75 104Q60 109 45 104Z') + C('M45 104Q41 102 42 98', 1.6) + C('M75 104Q79 102 78 98', 1.6);
  else if (lv === 2) cut += K('M42 104Q60 120 78 104Q60 112 42 104Z') + Wl('M48 107.4Q60 112.6 72 107.4', 1.2) + C('M42 104Q38 102 39 97', 1.8) + C('M78 104Q82 102 81 97', 1.8);
  else cut += K('M39 101Q60 129 81 101Q60 109 39 101Z') + Wl('M45 104.4Q60 110.5 75 104.4', 2.2) + `<path d="M51 115Q60 122 69 115Q60 111.5 51 115Z" fill="#fff" fill-opacity=".45"/>` + C('M39 101Q35 99 36 94', 1.8) + C('M81 101Q85 99 84 94', 1.8);
  if (lv >= 4) cut += `<path d="M47.5 104.2L50.5 111.5L53.5 105.4Z" fill="#fff"/><path d="M72.5 104.2L69.5 111.5L66.5 105.4Z" fill="#fff"/>` + K(dia(37, 95, 1.3, 2.2)) + K(dia(83, 95, 1.3, 2.2));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -8 132 138"><defs><mask id="k" maskUnits="userSpaceOnUse" x="-6" y="-8" width="132" height="138"><rect x="-6" y="-8" width="132" height="138" fill="#fff"/>${cut}</mask></defs><g mask="url(#k)">${sh}</g></svg>`;
  return (CACHE[key] = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}

const url = svg => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const OCACHE = {};
export function outlineArt(face, lv, ink, paper) {
  const key = [face, lv, ink, paper].join('|');
  if (OCACHE[key]) return OCACHE[key];
  const P = d => `<path d="${d}" fill="${paper}" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>`;
  const C = (d, w) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${Math.max(1.1, w * .7).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const K = d => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
  const dot = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${paper}" stroke="${ink}" stroke-width="1.2"/>`;
  const dia = (x, y, rx, ry) => `M${x} ${y - ry}L${x + rx} ${y}L${x} ${y + ry}L${x - rx} ${y}Z`;
  const zg = (n, x0, x1, top, tip) => { let d = `M${x0} ${top}`; const w = (x1 - x0) / n; for (let i = 0; i < n; i++) d += `L${(x0 + w * (i + .5)).toFixed(1)} ${tip}L${(x0 + w * (i + 1)).toFixed(1)} ${top}`; return d + 'Z'; };
  let sh = '', cut = '';
  sh += P('M34 64C28 44 16 26 2 12C22 18 42 30 52 52Z') + P('M86 64C92 44 104 26 118 12C98 18 78 30 68 52Z');
  const bells = [[2, 12], [118, 12], [60, 0]];
  if (lv >= 3) { sh += P('M42 60C38 42 30 26 24 8C34 22 46 36 54 54Z') + P('M78 60C82 42 90 26 96 8C86 22 74 36 66 54Z'); bells.push([24, 8], [96, 8]); }
  if (lv >= 4) {
    sh += P('M50 56C48 40 45 26 41 12C47 24 53 38 57 54Z') + P('M70 56C72 40 75 26 79 12C73 24 67 38 63 54Z');
    bells.push([41, 12], [79, 12]);
    const spark = (x, y, s) => K(`M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`);
    sh += spark(9, 58, 6) + spark(111, 58, 6) + spark(4, 96, 4) + spark(116, 96, 4) + spark(16, 36, 3) + spark(104, 36, 3);
  }
  sh += P('M46 56C50 36 55 18 60 0C65 18 70 36 74 56Z');
  sh += P('M60 60C79 60 87 75 86 92C85 108 73 120 60 125C47 120 35 108 34 92C33 75 41 60 60 60Z');
  sh += P('M30 68C44 54 76 54 90 68L88 75C74 62 46 62 32 75Z');
  if (lv >= 2) [[14.5, 20.5], [26, 31], [35.5, 43]].forEach(([x, y]) => cut += K(dia(x, y, 1.8, 2.6)) + K(dia(120 - x, y, 1.8, 2.6)));
  if (lv >= 2) cut += K(dia(60, 22, 1.8, 3)) + K(dia(60, 36, 2, 3.2));
  if (lv >= 4) cut += K('M51.5 61.4Q60 55.6 68.5 61.4Q60 67.2 51.5 61.4Z') + dot(60, 61.4, 2.3);
  else if (lv >= 3) cut += K(dia(60, 61.4, 3.6, 4.6));
  bells.forEach(([x, y]) => { cut += dot(x, y, lv === 0 ? 3.4 : 4.8); if (lv >= 1) cut += C(`M${x - 2.2} ${y + 1.6}L${x + 2.2} ${y + 1.6}`, 1.4); });
  cut += C('M35 80C34 100 46 119 60 125C74 119 86 100 85 80', 1.8);
  if (face === 'cool') {
    cut += K('M36 79Q60 74 84 79L82 89Q72 92 62 86L58 86Q48 92 38 89Z') + C('M42 81Q49 79 55 80', 1.4);
  } else {
    if (lv === 0) cut += C('M40 77Q47 75 55 78', 2) + C('M80 77Q73 75 65 78', 2);
    else cut += C('M39 77Q47 73 55 79', 2.2) + C(face === 'starry' ? 'M81 77Q73 73 65 79' : 'M81 74Q73 69 65 77', 2.2);
    const star = (x, y) => K(`M${x} ${y - 6.5}Q${x} ${y} ${x + 6.5} ${y}Q${x} ${y} ${x} ${y + 6.5}Q${x} ${y} ${x - 6.5} ${y}Q${x} ${y} ${x} ${y - 6.5}Z`);
    const L = K('M55 87Q48 81 41 82Q46 89 55 87Z') + dot(51, 85.4, 1.5);
    const R = K('M65 87Q72 81 79 82Q74 89 65 87Z') + dot(75, 84.6, 1.4);
    if (face === 'laugh') cut += C('M41 87Q48 80 55 87', 2.4) + C('M65 87Q72 80 79 87', 2.4);
    else if (face === 'wink') cut += L + C('M65 86Q72 80 79 84', 2.4);
    else if (face === 'starry') cut += star(48, 86) + star(72, 86);
    else cut += L + R;
  }
  if (lv >= 4) cut += K(dia(37, 95, 1.3, 2.2)) + K(dia(83, 95, 1.3, 2.2));
  cut += C('M60.5 89Q58 96 61.5 98.5', 1.6);
  if (lv === 0) cut += K('M47 105Q60 111 74 102Q61 107.5 47 105Z') + C('M74 102Q78 100 77 96', 1.6);
  else if (lv === 1) cut += K('M45 104Q60 114 75 104Q60 109 45 104Z') + C('M45 104Q41 102 42 98', 1.6) + C('M75 104Q79 102 78 98', 1.6);
  else if (lv === 2) cut += K('M42 104Q60 120 78 104Q60 112 42 104Z') + C('M48 107.4Q60 112.6 72 107.4', 1.2) + C('M42 104Q38 102 39 97', 1.8) + C('M78 104Q82 102 81 97', 1.8);
  else cut += K('M39 101Q60 129 81 101Q60 109 39 101Z') + C('M45 104.4Q60 110.5 75 104.4', 1.4) + K('M51 115Q60 122 69 115Q60 111.5 51 115Z') + C('M39 101Q35 99 36 94', 1.8) + C('M81 101Q85 99 84 94', 1.8);
  if (lv >= 4) cut += K('M47.5 104.2L50.5 111.5L53.5 105.4Z') + K('M72.5 104.2L69.5 111.5L66.5 105.4Z');
  return (OCACHE[key] = url(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -10 136 140">${sh}${cut}</svg>`));
}

export const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(c => Math.round(c * k).toString(16).padStart(2, '0')).join(''); };
export const lightOf = (hex, k) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, m = c => Math.round(c + (255 - c) * k); return '#' + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join(''); };
export const eyesFor = col => {
  const st = (d, w) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -8 132 138">`
    + `<path d="M55.5 87.2Q48 80.4 40.5 81.8Q45.8 89.6 55.5 87.2Z" fill="${col}"/>`
    + `<circle cx="50.6" cy="85.2" r="2.1" fill="#050507"/><circle cx="51.4" cy="84.4" r=".7" fill="#fff"/>`
    + st('M65 86.2Q72 79.8 79.5 84.2', 2.6)
    + st('M66.5 86.2L65 88.6M72 83.4L71.6 86M77.4 83.6L78.4 86', 1.2)
    + st('M39 77Q47 73 55 79', 2.4) + st('M81 74Q73 69 65 77', 2.4)
    + `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};
export const GG = "<defs><linearGradient id=\"gg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f6cf6a\"/><stop offset=\".3\" stop-color=\"#d9a23c\"/><stop offset=\".55\" stop-color=\"#f1c35a\"/><stop offset=\".8\" stop-color=\"#c98f2c\"/><stop offset=\"1\" stop-color=\"#e9b84e\"/></linearGradient></defs>";
export const decU = u => decodeURIComponent(u.replace(/^url\("data:image\/svg\+xml,/, '').replace(/"\)$/, ''));
