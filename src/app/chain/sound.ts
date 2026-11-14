// One sound only: a short voucher chime, played when a buy or a sell goes through. There are no other sound effects.
// A volume control and a mute switch are remembered.
export type Sfx = 'buy' | 'sell';

const SRC = '/sounds/balatro_voucher.mp3';
const MUTE_KEY = 'rulecard-muted', VOL_KEY = 'rulecard-volume';
let muted = false, volume = 0.7;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; const v = Number(localStorage.getItem(VOL_KEY)); if (Number.isFinite(v) && v > 0) volume = Math.min(1, v); } catch { /* no storage: defaults */ }
const listeners = new Set<() => void>();

let base: HTMLAudioElement | null = null;
const load = () => { if (!base && typeof Audio !== 'undefined') { base = new Audio(SRC); base.preload = 'auto'; } return base; };
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { load(); }, { once: true });

let last = 0;
/** play the chime (the same one for buy and sell); it never repeats within a second */
export function play(_name: Sfx = 'buy') {
  if (muted) return;
  const now = Date.now(); if (now - last < 900) return; last = now;
  const b = load(); if (!b) return;
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
