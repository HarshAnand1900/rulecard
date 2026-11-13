// The small (i) button: click it to open a short explanation next to it, click again, press Escape or click elsewhere to close.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CARD_TEXT, TIER_NAME, TIER_OF, type Card } from './types';

export function InfoDot({ title, children, align = 'right' }: { title: string; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'left' | 'right'>(align);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <span className="infodot" ref={ref} onClick={e => e.stopPropagation()}>
      <button type="button" className="idot" aria-label={`About ${title}`} aria-expanded={open} onClick={() => { if (!open && ref.current) { const r = ref.current.getBoundingClientRect(); const room = 300; setSide(r.right - room >= 8 ? 'right' : r.left + room <= innerWidth - 8 ? 'left' : 'right'); } setOpen(o => !o); }}>i</button>
      {open && <span className={`infopop ${side}`} role="dialog" aria-label={title}><strong>{title}</strong>{children}</span>}
    </span>
  );
}

const HOW: Record<string, string> = {
  'Raid tactic': 'Pick it as a plan for a raid round in the Raids tab, before that round starts. It costs no Energy.',
  'Needs 3 copies': 'Play it from your hand. It only fires once enough copies are on the table, and anyone can add theirs or stoke it with NEAR.',
  'Play alone': 'Play it yourself from your hand. It fires on its own and costs Energy.',
  'Needs 2–3 backers': 'Play it, then other holders back it. Once it has backers, the crowd bets Yes or No on your question.',
  'Needs signers': 'Put it on the table and enough qualified holders must sign. Then it acts, after a short random delay. Some Epics (Inferno, Black Hole) open a crowd window first.',
  'Needs many signers': 'Put it on the table: it needs 8 signers (12 at level 4) from qualified holders, and a level 3 coin.',
  'Raid action': 'Use it from the Raids tab during a raid. It asks the enemy coin about its plan, and the answer is written into the raid.',
  'On your bet': 'Attach it to one of your bets on an open Prophecy. It cuts what you lose, and trims what you win.',
  'Raid tactic or on a card': 'Plan it in a raid to cancel the enemy tactic that round, or use it from your hand to cancel a Common or Rare card that is still gathering backers.',
  'Challenge a holder': 'Name a holder, stake tokens and pick a side. They have 15 minutes to accept with the same stake.',
  'Pledge to a goal': 'Choose a goal and pledge tokens. Other holders can add theirs for 6 hours.',
  'Starts a raid': 'Pick a target coin from the Raids tab or from the card. It needs the usual raid signers and uses this card and its Energy.',
  'Opens a crowd window': 'Play it and for 10 minutes any holder can put in NEAR. It all buys as one batch at one average price.',
};

export function CardInfo({ card }: { card: Card }) {
  const t = CARD_TEXT[card], tier = TIER_NAME[TIER_OF[card]];
  return (
    <>
      <span className="ip-row"><em>{tier}</em><em>{t.energy ? `Energy ${t.energy}` : 'No Energy cost'}</em></span>
      <span className="ip-line"><b>What it does</b>{t.text}</span>
      <span className="ip-line"><b>How you play it</b>{HOW[t.way] ?? t.way}</span>
      <span className="ip-line muted">Cards expire after a while if you don't use them.</span>
    </>
  );
}

export function OmenInfo({ name, text, phase }: { name: string; text: string; phase: string }) {
  return (
    <>
      <span className="ip-line"><b>{phase === 'none' ? 'Omens' : name}</b>{phase === 'none' ? 'Short luck events that start every few hours once a coin reaches level 2.' : text}</span>
      <span className="ip-line"><b>How an omen is chosen</b>It comes from public chain randomness, so nobody can order one, and the coin gets a warning before it starts.</span>
    </>
  );
}
