// Sound effects, synthesized with the Web Audio API: no audio files to load or license. Browsers keep audio locked until the
// player interacts, so it starts on the first click or tap. A mute switch in the header is remembered.
export type Sfx = 'click' | 'gm' | 'lock' | 'unlock' | 'buy' | 'sell' | 'pack' | 'burn' | 'inferno' | 'siren' | 'oracle' | 'ritualMade' | 'ritualMissed'
  | 'raidStart' | 'horn' | 'raidWin' | 'raidLose' | 'levelUp' | 'error' | 'omen';

const KEY = 'rulecard-muted';
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* no storage: sound stays on */ }
let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

function ac(): AudioContext | null {
  try {
    if (!ctx) { const C = (window as any).AudioContext ?? (window as any).webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx!.state === 'suspended') void ctx!.resume();
    return ctx;
  } catch { return null; }
}
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { ac(); }, { once: true });

type ToneOpts = { type?: OscillatorType; vol?: number; to?: number; attack?: number };
function tone(c: AudioContext, t: number, f: number, d: number, o: ToneOpts = {}) {
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + d);
  const vol = o.vol ?? 0.12, a = o.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  osc.connect(g).connect(c.destination); osc.start(t); osc.stop(t + d + 0.03);
}
/** a burst of filtered noise: whooshes, card swishes */
function noise(c: AudioContext, t: number, d: number, from: number, to: number, vol = 0.12) {
  const n = Math.max(1, Math.floor(c.sampleRate * d)), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f).connect(g).connect(c.destination); src.start(t);
}
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const arp = (c: AudioContext, t: number, notes: number[], gap: number, o: ToneOpts & { d?: number } = {}) => notes.forEach((n, i) => tone(c, t + i * gap, midi(n), o.d ?? 0.35, o));

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
  ritualMade: (c, t) => { arp(c, t, [72, 76, 79, 84], 0.11, { type: 'triangle', vol: 0.13, d: 0.5 }); tone(c, t + 0.5, midi(84), 1.0, { vol: 0.08 }); },
  ritualMissed: (c, t) => arp(c, t, [57, 53, 50], 0.22, { type: 'sawtooth', vol: 0.05, d: 0.6 }),   // low and falling
  raidStart: (c, t) => { tone(c, t, 196, 0.7, { type: 'sawtooth', vol: 0.09 }); tone(c, t, 294, 0.7, { type: 'sawtooth', vol: 0.06 }); }, // a war horn
  horn: (c, t) => tone(c, t, 247, 0.35, { type: 'sawtooth', vol: 0.08 }),
  raidWin: (c, t) => arp(c, t, [67, 71, 74, 79, 83], 0.08, { type: 'triangle', vol: 0.12, d: 0.4 }),
  raidLose: (c, t) => arp(c, t, [62, 58, 55, 50], 0.16, { type: 'sawtooth', vol: 0.06, d: 0.5 }),
  levelUp: (c, t) => { arp(c, t, [67, 72, 76, 79, 84], 0.1, { type: 'triangle', vol: 0.13, d: 0.55 }); tone(c, t + 0.55, midi(91), 1.2, { vol: 0.07 }); },
  error: (c, t) => { tone(c, t, 160, 0.16, { type: 'square', vol: 0.06 }); tone(c, t + 0.17, 120, 0.2, { type: 'square', vol: 0.06 }); },
  omen: (c, t) => { tone(c, t, 311, 1.6, { vol: 0.07, to: 196 }); tone(c, t, 317, 1.6, { vol: 0.07, to: 200 }); },  // reserved for Omens (roadmap)
};

export function play(name: Sfx) {
  if (muted) return;
  const c = ac(); if (!c) return;
  try { SOUNDS[name](c, c.currentTime + 0.01); } catch { /* audio is a nicety: never break the app */ }
}
export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach(f => f());
  if (!m) play('click');
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
