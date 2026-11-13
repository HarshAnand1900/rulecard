// The play controls for one card in your hand. What shows depends on how the card is used: a raid tactic is planned in the Raids tab,
// a solo card fires at once, a table card goes to the crowd, and a few cards (Duel, Bounty, Hedge, Counterspell, Alliance, the raid
// starters) have a small form of their own.
import { useState } from 'react';
import type { Card, CoinEntry, Proposal, Question } from './types';
import { CARD_TEXT, TIER_OF, USE_OF } from './types';
import { tokToUnits } from './near';

type Call = (label: string, m: string, a?: object, dep?: bigint, done?: string) => Promise<void>;
interface Props { card: Card; call: Call; busy: string; table: Proposal[]; me: string; coins: CoinEntry[]; selfId: string; price: string; raidOn: boolean }

const short = (a: string) => a.split('.')[0].toUpperCase();

export default function CardPlay({ card, call, busy, table, me, coins, selfId, price, raidOn }: Props) {
  const use = USE_OF[card], name = CARD_TEXT[card].name;
  const [q, setQ] = useState<'Tide' | 'Line' | 'Crowd' | 'Vault'>('Tide');
  const [qv, setQv] = useState(7);
  const [target, setTarget] = useState('');
  const [opp, setOpp] = useState('');
  const [amt, setAmt] = useState(50);
  const [yes, setYes] = useState(true);
  const [pid, setPid] = useState('');
  const question = (): Question => q === 'Tide' ? 'Tide' : q === 'Line' ? { Line: { price: ((BigInt(price) * BigInt(100 + qv)) / 100n).toString() } } : q === 'Crowd' ? { Crowd: { n: qv } } : { Vault: { bps: qv * 100 } };
  const others = coins.filter(x => x.account_id !== selfId);
  const qpick = (
    <div className="stack small">
      <select value={q} onChange={e => setQ(e.target.value as any)} aria-label="Question">
        <option value="Tide">Tide: net buying?</option><option value="Line">Line: price above +X%?</option><option value="Crowd">Crowd: N new buyers?</option><option value="Vault">Vault: locked share +X points?</option>
      </select>
      {q !== 'Tide' && <input className="tiny" type="number" value={qv} onChange={e => setQv(Number(e.target.value))} title={q === 'Line' ? '5–10 (%) above, or -10 to -5 below' : q === 'Crowd' ? '3–30 wallets' : '1–10 points'} />}
    </div>
  );
  const play = (card2: Card, qq: Question | null = null) => call(`Play ${name}`, 'play_card', { card: card2, question: qq });

  if (use === 'raid') return <span className="small muted">{card === 'Counterspell' ? '' : 'Plan it in the Raids tab.'}{card === 'Counterspell' && <CounterBox call={call} busy={busy} table={table} me={me} pid={pid} setPid={setPid} />}</span>;
  if (card === 'Prophecy') return <>{qpick}<button className="btn small" disabled={!!busy} onClick={() => play(card, question())}>Play</button></>;
  if (card === 'Alliance') return <div className="stack small"><select value={target} onChange={e => setTarget(e.target.value)} aria-label="Ally"><option value="">Ally with…</option>{others.map(o => <option key={o.account_id} value={o.account_id}>${o.symbol}</option>)}</select>
    <button className="btn small" disabled={!!busy || !target} onClick={() => call('Play Alliance', 'play_alliance', { target })}>Propose pact</button></div>;
  if (card === 'Scout') return <span className="small muted">{raidOn ? 'Use it from the Raids tab.' : 'Use it during a raid.'}</span>;
  if (card === 'Hedge') {
    const mine = table.filter(p => p.card === 'Prophecy' && p.phase >= 1 && p.phase <= 2 && p.bets.some(b => b.account === me && !b.hedged));
    return <div className="stack small"><select value={pid} onChange={e => setPid(e.target.value)} aria-label="Prophecy to hedge"><option value="">{mine.length ? 'Hedge which bet?' : 'No open bet to hedge'}</option>{mine.map(p => <option key={p.id} value={p.id}>Prophecy #{p.id}</option>)}</select>
      <button className="btn small" disabled={!!busy || pid === ''} onClick={() => call('Hedge', 'hedge', { id: Number(pid) }, 0n, 'Hedged: a loss costs a quarter instead of half')}>Hedge it</button></div>;
  }
  if (card === 'Duel') return <div className="stack small">
    <input value={opp} onChange={e => setOpp(e.target.value)} placeholder="opponent account" aria-label="Opponent" />
    <div className="row gap wrap"><input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} title="tokens (thousands)" /><span className="muted">k tokens</span>
      <select value={yes ? 'y' : 'n'} onChange={e => setYes(e.target.value === 'y')} aria-label="Your side"><option value="y">net buyer</option><option value="n">not a net buyer</option></select></div>
    <button className="btn small" disabled={!!busy || !opp} onClick={() => call('Duel', 'duel_challenge', { opponent: opp, stake: tokToUnits(amt * 1000).toString(), yes }, 0n, 'Challenge sent: they have 15 minutes')}>Challenge</button></div>;
  if (card === 'Bounty') return <div className="stack small">{qpick}
    <div className="row gap"><input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} title="tokens (thousands)" /><span className="muted">k tokens</span></div>
    <button className="btn small" disabled={!!busy} onClick={() => call('Bounty', 'bounty_open', { question: question(), amount: tokToUnits(amt * 1000).toString() }, 0n, 'Bounty open for 6 hours')}>Open bounty</button></div>;
  if (card === 'FriendlyRaid' || card === 'HardRaid') return <div className="stack small"><select value={target} onChange={e => setTarget(e.target.value)} aria-label="Target"><option value="">Raid which coin?</option>{others.map(o => <option key={o.account_id} value={o.account_id}>${o.symbol}</option>)}</select>
    <button className="btn small" disabled={!!busy || !target} onClick={() => call(name, card === 'FriendlyRaid' ? 'start_friendly_raid' : 'start_hard_raid', { target })}>Propose</button></div>;
  // solo and table cards: one button
  return <button className="btn small" disabled={!!busy} onClick={() => play(card)}>{use === 'table' ? 'Put on the table' : 'Play'}</button>;
}

function CounterBox({ call, busy, table, me, pid, setPid }: { call: Call; busy: string; table: Proposal[]; me: string; pid: string; setPid: (s: string) => void }) {
  const targets = table.filter(p => p.phase === 0 && TIER_OF[p.card] <= 1 && p.proposer !== me);
  return <span className="stack small"><span className="muted">Plan it in a raid, or cancel a card:</span>
    <select value={pid} onChange={e => setPid(e.target.value)} aria-label="Card to counter"><option value="">{targets.length ? 'Counter which card?' : 'Nothing to counter'}</option>{targets.map(p => <option key={p.id} value={p.id}>{CARD_TEXT[p.card].name} (by {short(p.proposer)})</option>)}</select>
    <button className="btn small" disabled={!!busy || pid === ''} onClick={() => call('Counterspell', 'counterspell_card', { id: Number(pid) }, 0n, 'Countered')}>Counter it</button></span>;
}
