// Two sounds only: a short voucher chime when a buy or a sell goes through, and an opening sting when an Omen is about to start.
// A volume control and a mute switch are remembered.
export type Sfx = 'buy' | 'sell' | 'omen';

const FILES: Record<Sfx, string> = { buy: '/sounds/balatro_voucher.mp3', sell: '/sounds/balatro_voucher.mp3', omen: '/sounds/balatro_open.mp3' };
const MUTE_KEY = 'rulecard-muted', VOL_KEY = 'rulecard-volume';
let muted = false, volume = 0.7;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; const v = Number(localStorage.getItem(VOL_KEY)); if (Number.isFinite(v) && v > 0) volume = Math.min(1, v); } catch { /* no storage: defaults */ }
const listeners = new Set<() => void>();

const bases = new Map<string, HTMLAudioElement>();
const load = (src: string) => { let b = bases.get(src); if (!b && typeof Audio !== 'undefined') { b = new Audio(src); b.preload = 'auto'; bases.set(src, b); } return b; };
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { Object.values(FILES).forEach(load); }, { once: true });

const lastAt = new Map<string, number>();
/** play a sound; the same file never repeats within a second */
export function play(name: Sfx = 'buy') {
  if (muted) return;
  const src = FILES[name], now = Date.now(); if (now - (lastAt.get(src) ?? 0) < 900) return; lastAt.set(src, now);
  const b = load(src); if (!b) return;
  try {
    const a = b.cloneNode(true) as HTMLAudioElement; a.volume = volume;
    void a.play().catch(() => { /* the browser blocked audio until the first click: stay quiet */ });
  } catch { /* audio is a nicety: never break the app */ }
}
export const isMuted = () => muted;
export const getVolume = () => volume;
const emit = () => listeners.forEach(f => f());
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
  emit();
}
export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0.05, v));
  try { localStorage.setItem(VOL_KEY, String(volume)); } catch { /* ignore */ }
  emit();
}
export function onMuteChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
