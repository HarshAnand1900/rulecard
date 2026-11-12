// The guided first run: "STEP 3 OF 7". Each step is ticked from what the chain says you did, not from clicks, and links its receipt.
import { useState, type ReactNode } from 'react';
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
  const i = steps.findIndex(s => !s.done);
  if (skipped || !me) return null;
  if (i === -1) return null;
  const s = steps[i];
  return (
    <div className="guide" role="region" aria-label="Guided first run">
      <div className="row between wrap">
        <span className="small muted">STEP {i + 1} OF {steps.length}</span>
        <button className="linkish small muted" onClick={() => { set(me, 'skip'); bump(n => n + 1); }}>Skip guide</button>
      </div>
      <div className="guide-title">{s.title}</div>
      <p>{s.text}</p>
      <div className="row gap wrap">
        {s.cta && <button className="btn primary" disabled={!!busy} onClick={() => { play('click'); s.cta!.run(); }}>{s.cta.label}</button>}
        {i > 0 && steps.slice(0, i).map((x, k) => x.receipt ? <span key={k} className="small muted">✓ {x.title.toLowerCase()} {x.receipt}</span> : null)}
      </div>
      <div className="guide-dots" aria-hidden="true">{steps.map((x, k) => <i key={k} className={x.done ? 'on' : k === i ? 'now' : ''} />)}</div>
    </div>
  );
}

export const guideWarVisited = (me: string | null) => get(me, 'war');
export const markWarVisited = (me: string | null) => set(me, 'war');
