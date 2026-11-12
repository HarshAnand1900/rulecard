// Sound effects, synthesized with the Web Audio API: no audio files to load or license. Browsers keep audio locked until the
// player interacts, so it starts on the first click or tap. A volume control and a mute switch are remembered.
//
// Design: sparing and readable. Routine actions get a tiny tick or chime; the moments that matter get a character:
//   gm = sunrise chime, lock = vault thud, buy/sell = coin, burn = flame whoosh, Ritual made = fanfare and a crowd cheer,
//   Ritual missed = a jester's laugh (the joke is on you), raid won = fanfare, raid lost = sad trombone.
export type Sfx = 'click' | 'gm' | 'lock' | 'unlock' | 'buy' | 'sell' | 'pack' | 'burn' | 'inferno' | 'siren' | 'oracle' | 'ritualMade' | 'ritualMissed'
  | 'raidStart' | 'horn' | 'raidWin' | 'raidLose' | 'levelUp' | 'error' | 'omen' | 'laugh' | 'wah' | 'cheer';

const MUTE_KEY = 'rulecard-muted', VOL_KEY = 'rulecard-volume';
let muted = false, volume = 0.7;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; const v = Number(localStorage.getItem(VOL_KEY)); if (Number.isFinite(v) && v > 0) volume = Math.min(1, v); } catch { /* no storage: defaults */ }
let ctx: AudioContext | null = null, master: GainNode | null = null;
const listeners = new Set<() => void>();

function ac(): AudioContext | null {
  try {
    if (!ctx) { const C = (window as any).AudioContext ?? (window as any).webkitAudioContext; if (!C) return null; ctx = new C(); master = ctx!.createGain(); master.gain.value = volume; master.connect(ctx!.destination); }
    if (ctx!.state === 'suspended') void ctx!.resume();
    return ctx;
  } catch { return null; }
}
const out = (c: AudioContext): AudioNode => master ?? c.destination;
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { ac(); }, { once: true });

type ToneOpts = { type?: OscillatorType; vol?: number; to?: number; attack?: number };
function tone(c: AudioContext, t: number, f: number, d: number, o: ToneOpts = {}) {
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + d);
  const vol = o.vol ?? 0.12, a = o.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  osc.connect(g).connect(out(c)); osc.start(t); osc.stop(t + d + 0.03);
}
/** a burst of filtered noise: whooshes, card swishes, breath, a crowd */
function noise(c: AudioContext, t: number, d: number, from: number, to: number, vol = 0.12, q = 1.2) {
  const n = Math.max(1, Math.floor(c.sampleRate * d)), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f).connect(g).connect(out(c)); src.start(t);
}
/** a voiced sound shaped by two vowel resonances (formants): the trick behind a synthetic "ha" */
function voice(c: AudioContext, t: number, f0: number, d: number, f1: number, f2: number, vol = 0.18, vibrato = 0, glide = 0.88) {
  const osc = c.createOscillator(), g = c.createGain(), a = c.createBiquadFilter(), b = c.createBiquadFilter(), bg = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(40, f0 * glide), t + d);
  if (vibrato) { const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 6.5; lg.gain.value = f0 * 0.035; lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(t + d + 0.05); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  a.type = 'bandpass'; a.frequency.value = f1; a.Q.value = 7;
  b.type = 'bandpass'; b.frequency.value = f2; b.Q.value = 9; bg.gain.value = 0.65;
  osc.connect(g); g.connect(a); g.connect(b); a.connect(out(c)); b.connect(bg).connect(out(c));
  osc.start(t); osc.stop(t + d + 0.05);
}
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const arp = (c: AudioContext, t: number, notes: number[], gap: number, o: ToneOpts & { d?: number } = {}) => notes.forEach((n, i) => tone(c, t + i * gap, midi(n), o.d ?? 0.35, o));

/** a jester's "ha-ha-ha-ha-haaa": five voiced "ha"s, each a little lower, the last one long with a wobble */
function laugh(c: AudioContext, t: number) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t0 = t + i * 0.17, last = i === n - 1;
    noise(c, t0 - 0.015, 0.06, 1800, 3500, 0.05, 2);                                   // the breath of the "h"
    voice(c, t0, 330 - i * 24, last ? 0.42 : 0.12, 780 - i * 25, 1280 - i * 30, 0.2, last ? 1 : 0, last ? 0.8 : 0.9);
  }
}
/** the classic sad trombone: "wah, wah, wah, waaaah" */
function wah(c: AudioContext, t: number) {
  const lens = [0.3, 0.3, 0.3, 0.75], notes = [58, 57, 56, 55];
  let at = t;
  notes.forEach((m, i) => { const f = midi(m), d = lens[i]; const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, at); if (i === 3) { o.frequency.exponentialRampToValueAtTime(f * 0.86, at + d); const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.5; lg.gain.value = f * 0.025; lfo.connect(lg).connect(o.frequency); lfo.start(at); lfo.stop(at + d); }
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, at); lp.frequency.linearRampToValueAtTime(1500, at + 0.06); lp.frequency.linearRampToValueAtTime(700, at + d);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.13, at + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(lp).connect(g).connect(out(c)); o.start(at); o.stop(at + d + 0.05); at += d + 0.04; });
}
/** a small crowd cheering: a swelling band of noise with a flutter, then a few claps */
function cheer(c: AudioContext, t: number) {
  noise(c, t, 1.1, 900, 2600, 0.11, 0.6);
  noise(c, t + 0.1, 0.9, 1500, 3500, 0.07, 0.5);
  for (let i = 0; i < 6; i++) noise(c, t + 0.15 + i * 0.09 + Math.random() * 0.03, 0.05, 2500, 4500, 0.06, 2);
}

const SOUNDS: Record<Sfx, (c: AudioContext, t: number) => void> = {
  click: (c, t) => tone(c, t, 900, 0.05, { type: 'square', vol: 0.04 }),
  gm: (c, t) => arp(c, t, [72, 76, 79], 0.09, { type: 'triangle', vol: 0.11, d: 0.45 }),            // a sunrise chime
  lock: (c, t) => { tone(c, t, 140, 0.28, { vol: 0.22, to: 55 }); tone(c, t + 0.05, 1500, 0.06, { type: 'square', vol: 0.05 }); }, // a vault door
  unlock: (c, t) => { tone(c, t, 1100, 0.06, { type: 'square', vol: 0.05 }); tone(c, t + 0.06, 90, 0.3, { vol: 0.18, to: 160 }); },
  buy: (c, t) => arp(c, t, [83, 88], 0.07, { type: 'triangle', vol: 0.1, d: 0.25 }),                // a coin
  sell: (c, t) => arp(c, t, [88, 79], 0.07, { type: 'triangle', vol: 0.09, d: 0.22 }),
  pack: (c, t) => { noise(c, t, 0.18, 2500, 6000, 0.08); arp(c, t + 0.12, [76, 83], 0.08, { type: 'triangle', vol: 0.09, d: 0.3 }); }, // a card swish
  burn: (c, t) => { noise(c, t, 0.7, 300, 2400, 0.16); tone(c, t, 160, 0.6, { type: 'sawtooth', vol: 0.05, to: 60 }); },  // a whoosh of flame
  inferno: (c, t) => { noise(c, t, 1.3, 200, 3000, 0.2); tone(c, t, 90, 1.2, { type: 'sawtooth', vol: 0.09, to: 38 }); tone(c, t + 0.4, 60, 0.9, { vol: 0.2, to: 30 }); },
  siren: (c, t) => { for (let i = 0; i < 4; i++) tone(c, t + i * 0.28, i % 2 ? 560 : 840, 0.28, { type: 'triangle', vol: 0.08, to: i % 2 ? 840 : 560 }); },
  oracle: (c, t) => arp(c, t, [84, 88, 91, 96], 0.12, { vol: 0.07, d: 0.9 }),                       // a shimmer
  ritualMade: (c, t) => { arp(c, t, [72, 76, 79, 84], 0.11, { type: 'triangle', vol: 0.13, d: 0.5 }); tone(c, t + 0.5, midi(84), 1.0, { vol: 0.08 }); cheer(c, t + 0.3); },
  ritualMissed: (c, t) => laugh(c, t),                                                              // the joke is on you
  raidStart: (c, t) => { tone(c, t, 196, 0.7, { type: 'sawtooth', vol: 0.09 }); tone(c, t, 294, 0.7, { type: 'sawtooth', vol: 0.06 }); }, // a war horn
  horn: (c, t) => tone(c, t, 247, 0.35, { type: 'sawtooth', vol: 0.08 }),
  raidWin: (c, t) => arp(c, t, [67, 71, 74, 79, 83], 0.08, { type: 'triangle', vol: 0.12, d: 0.4 }),
  raidLose: (c, t) => wah(c, t),                                                                    // sad trombone
  levelUp: (c, t) => { arp(c, t, [67, 72, 76, 79, 84], 0.1, { type: 'triangle', vol: 0.13, d: 0.55 }); tone(c, t + 0.55, midi(91), 1.2, { vol: 0.07 }); },
  error: (c, t) => { tone(c, t, 160, 0.16, { type: 'square', vol: 0.06 }); tone(c, t + 0.17, 120, 0.2, { type: 'square', vol: 0.06 }); },
  omen: (c, t) => { tone(c, t, 311, 1.6, { vol: 0.07, to: 196 }); tone(c, t, 317, 1.6, { vol: 0.07, to: 200 }); },  // reserved for Omens (roadmap)
  laugh: (c, t) => laugh(c, t),
  wah: (c, t) => wah(c, t),
  cheer: (c, t) => cheer(c, t),
};

/** for the sound test list in the menu */
export const SFX_LIST: { id: Sfx; label: string; when: string }[] = [
  { id: 'gm', label: 'gm chime', when: 'you check in' },
  { id: 'lock', label: 'Vault thud', when: 'you lock tokens' },
  { id: 'buy', label: 'Coin', when: 'you buy (and sell)' },
  { id: 'pack', label: 'Card swish', when: 'you open a pack' },
  { id: 'burn', label: 'Flame whoosh', when: 'supply burns' },
  { id: 'inferno', label: 'Inferno', when: 'a big pot burn' },
  { id: 'ritualMade', label: 'Fanfare and cheer', when: 'the coin makes its Ritual' },
  { id: 'ritualMissed', label: 'Jester\'s laugh', when: 'the coin misses its Ritual' },
  { id: 'raidStart', label: 'War horn', when: 'a raid starts' },
  { id: 'raidWin', label: 'Victory', when: 'your coin wins a raid' },
  { id: 'raidLose', label: 'Sad trombone', when: 'your coin loses a raid' },
  { id: 'levelUp', label: 'Level up', when: 'the coin levels up' },
  { id: 'siren', label: 'Hype Siren', when: 'the card is played' },
  { id: 'oracle', label: 'Oracle', when: 'a Prophecy is played' },
  { id: 'error', label: 'Nope', when: 'something is refused' },
];

const lastPlayed = new Map<Sfx, number>();
export function play(name: Sfx) {
  if (muted) return;
  const now = Date.now(); // the same sound never repeats within a second: a busy coin must not turn into noise
  if (now - (lastPlayed.get(name) ?? 0) < 900) return; lastPlayed.set(name, now);
  const c = ac(); if (!c) return;
  try { SOUNDS[name](c, c.currentTime + 0.01); } catch { /* audio is a nicety: never break the app */ }
}
export const isMuted = () => muted;
export const getVolume = () => volume;
const emit = () => listeners.forEach(f => f());
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
  emit();
  if (!m) play('click');
}
export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0.05, v));
  try { localStorage.setItem(VOL_KEY, String(volume)); } catch { /* ignore */ }
  if (master) master.gain.value = volume;
  emit();
}
export function onMuteChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** which sound goes with a successful contract call */
export function sfxForCall(method: string, args: any = {}): Sfx | null {
  switch (method) {
    case 'gm': return 'gm';
    case 'lock': return 'lock';
    case 'unlock': case 'leave_early': case 'claim_vault': return 'unlock';
    case 'buy': return 'buy';
    case 'sell': return 'sell';
    case 'claim_pack': case 'claim_level_drop': case 'claim_raid_pack': return 'pack';
    case 'play_card': return ({ Ember: 'burn', Inferno: 'inferno', HypeSiren: 'siren', Prophecy: 'oracle', RollCall: 'gm' } as Record<string, Sfx>)[args.card] ?? 'click';
    case 'start_raid': case 'launch_raid': return 'raidStart';
    case 'battle_cry': case 'settle_raid': return 'horn';
    case 'back': case 'sign': case 'stoke': case 'fuel': case 'bet': case 'set_plan': case 'sign_raid': case 'drop_card': return 'click';
    default: return null;
  }
}
