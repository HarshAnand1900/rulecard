// The guided first run: "STEP 3 OF 7". Each step is ticked from what the chain says you did, not from clicks, and links its receipt.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Net } from './net';
import type { HandView, HolderView, Ritual } from './types';
import { play } from './sound';

interface Props {
  ch: Net; me: string | null; coinId: string; h: HolderView | null; hand: HandView | null; r: Ritual;
  busy: string; visitedWar: boolean;
  doCall: (label: string, method: string, args?: object, deposit?: bigint, done?: string) => Promise<void>;
  go: (what: 'trade' | 'vault' | 'raid' | 'war') => void;
  fmtLock: () => bigint; // half of the wallet's unlocked tokens, in token units
}

const key = (me: string | null, k: string) => `rulecard-guide:${me ?? ''}:${k}`;
const get = (me: string | null, k: string) => { try { return localStorage.getItem(key(me, k)) === '1'; } catch { return false; } };
const set = (me: string | null, k: string) => { try { localStorage.setItem(key(me, k), '1'); } catch { /* ignore */ } };

export default function Guide(p: Props) {
  const { ch, me, h, hand, r, busy } = p;
  const [, bump] = useState(0);
  const [manual, setManual] = useState<number | null>(null);
  const [pend, setPend] = useState<string | null>(null);
  useEffect(() => { if (!pend) return; const t = setTimeout(() => setPend(null), 20_000); return () => clearTimeout(t); }, [pend]);
  useEffect(() => { const open = () => { try { localStorage.removeItem(key(me, 'skip')); } catch { /* ignore */ } setManual(0); bump(n => n + 1); }; window.addEventListener('rulecard-guide-open', open); return () => window.removeEventListener('rulecard-guide-open', open); }, [me]);
  const skipped = get(me, 'skip'), goalSeen = get(me, 'goal');
  const bag = !!h && (BigInt(h.balance) > 0n || BigInt(h.locked) > 0n);
  const receipt = (m: string) => { const x = ch.receipts?.[m]; return x && ch.explorer ? <a className="small" href={`${ch.explorer}/txns/${x.hash}`} target="_blank" rel="noreferrer">receipt ↗</a> : null; };

  const steps: { title: string; text: string; done: boolean; cta?: { label: string; run: () => void }; receipt?: ReactNode }[] = [
    { title: ch.mode === 'practice' ? 'YOU HAVE A WALLET' : 'YOU\'RE CONNECTED', done: !!me, text: ch.mode === 'practice' ? 'We made you a practice wallet and sent it a little NEAR. It lives in this browser; no popups.' : 'Your own testnet wallet signs everything you do here.', receipt: receipt('fund') },
    { title: 'YOUR FIRST BAG', done: bag, text: 'A bag of this coin is your ticket in. You can only stay if you show up.', cta: { label: 'Buy a bag', run: () => p.go('trade') }, receipt: receipt('buy') },
    { title: 'SAY GM', done: !!h && h.last_gm > 0, text: 'Check in with the ☀ gm button. It adds to today\'s Ritual, and it stops your bag from burning while you sleep.', cta: { label: 'gm', run: () => void p.doCall('gm', 'gm', {}, 0n, 'gm! +1 Energy, idle clock reset') }, receipt: receipt('gm') },
    { title: 'LOCK IN THE VAULT', done: !!h && h.locks.length > 0, text: 'Locked tokens are safe from every burn, and they earn what sleepers lose. Locking also counts toward today\'s Ritual.', cta: { label: 'Lock half', run: () => void p.doCall('Lock', 'lock', { amount: p.fmtLock().toString(), hours: 24 }, 1n, 'Locked: safe from idle burn') }, receipt: receipt('lock') },
    { title: 'OPEN A PACK', done: !!hand && hand.next_pack > 0, text: 'Every few hours a pack of rule cards: the crowd plays them together to burn supply and fight other coins.', cta: { label: 'Claim a pack', run: () => void p.doCall('Claim pack', 'claim_pack', {}, 0n, 'Pack opened') }, receipt: receipt('claim_pack') },
    { title: 'SEE THE FIGHT', done: p.visitedWar, text: 'Coins raid each other. The one that shows up in bigger numbers takes part of the other coin\'s pot. Take a look at the War Map.', cta: { label: 'Open the War Map', run: () => p.go('war') } },
    { title: 'YOUR GOAL', done: goalSeen, text: `Keep this coin's Ritual alive: ${r.gm_target} wallets saying gm and enough NEAR locked, every day. Make it and the pot burns supply; miss it and sleepers burn twice as fast.`, cta: { label: 'Got it', run: () => { set(me, 'goal'); play('ritualMade'); bump(n => n + 1); } } },
  ];
  const first = steps.findIndex(s => !s.done);
  if (skipped || !me) return null;
  if (first === -1 && manual === null) return null;
  const n = steps.length, i = Math.min(n - 1, manual ?? first), s = steps[i];
  const skip = () => { set(me, 'skip'); setManual(null); bump(k => k + 1); };
  return createPortal(
    <div className="guide gd2" role="region" aria-label="Guided first run">
      <div className="gd-top"><span className="gd-label">GUIDE · {i + 1} / {n}</span><button className="gd-x" aria-label="Skip guide" title="Skip guide" onClick={skip}>×</button></div>
      <div className="gd-title">{s.title.charAt(0) + s.title.slice(1).toLowerCase()}{s.done && <span className="gd-done">Done</span>}</div>
      <p>{s.text}</p>
      {s.done && s.receipt && <div className="gd-receipt small muted">{s.receipt}</div>}
      <div className="gd-bar" aria-hidden="true">{steps.map((x, k) => <i key={k} className={k === i ? 'now' : x.done ? 'on' : ''} />)}</div>
      <div className="gd-foot">
        <button className="gd-back" disabled={i === 0} onClick={() => setManual(i - 1)}>Back</button>
        <span className="gd-spacer" />
        {s.cta && !s.done && <button className="btn primary small" disabled={!!busy || pend === s.title} onClick={() => { play('click'); setManual(null); setPend(s.title); s.cta!.run(); }}>{pend === s.title ? 'Working…' : s.cta.label}</button>}
        <button className="gd-next" onClick={() => (i === n - 1 ? skip() : setManual(i + 1))}>{i === n - 1 ? 'Finish' : 'Next'}</button>
      </div>
    </div>,
    document.body
  );
}

export const guideWarVisited = (me: string | null) => get(me, 'war');
export const markWarVisited = (me: string | null) => set(me, 'war');
