// "Making your wallet": the first-visit stepper of practice mode. Every step is a real thing happening on the chain.
import { useEffect, useRef, useState } from 'react';
import type { Net } from './net';
import type { CoinEntry } from './types';
import { nearToYocto } from './near';
import { play } from './sound';

type Phase = 'wallet' | 'funding' | 'waiting' | 'buying' | 'done';
const ORDER: Phase[] = ['wallet', 'funding', 'buying', 'done'];
const LABEL: Record<string, string> = { wallet: 'Making your wallet', funding: 'Sending it a little NEAR', buying: 'Buying your first bag', done: 'Ready' };
const FIRST_BUY_NEAR = 0.09; // demo scale: enough to qualify and check in, and it leaves gas money

export default function Onboard({ ch, coins, onDone, onUseWallet }: { ch: Net; coins: CoinEntry[]; onDone: (coinId: string) => void; onUseWallet: () => void }) {
  const [phase, setPhase] = useState<Phase>('wallet');
  const [err, setErr] = useState('');
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1), mounted = useRef(true);
  // the parent re-renders (and reloads its coin list) every few seconds: the run must not restart or be cancelled by that
  const coinsRef = useRef(coins), doneRef = useRef(onDone);
  coinsRef.current = coins; doneRef.current = onDone;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (started.current === attempt) return; started.current = attempt;
    setErr(''); setPhase('wallet');
    (async () => {
      try {
        await ch.ensureWallet!(s => { if (mounted.current) setPhase(s === 'ready' ? 'buying' : s === 'waiting' ? 'funding' : s); });
        const target = coinsRef.current[coinsRef.current.length - 1]; // the oldest coin: the one with the most going on
        if (!target) throw new Error('There are no coins to play with yet.');
        const have = BigInt(await ch.view<string>(target.account_id, 'ft_balance_of', { account_id: ch.me()! }));
        if (have === 0n) await ch.call(target.account_id, 'buy', {}, nearToYocto(FIRST_BUY_NEAR));
        play('buy');
        if (!mounted.current) return;
        setPhase('done');
        setTimeout(() => mounted.current && doneRef.current(target.account_id), 700);
      } catch (e: any) { if (mounted.current) { play('error'); setErr(String(e?.message ?? e)); } }
    })();
  }, [attempt, ch]);

  const at = ORDER.indexOf(phase);
  const link = (key: string) => { const r = ch.receipts?.[key]; return r && ch.explorer ? <a className="small" href={`${ch.explorer}/txns/${r.hash}`} target="_blank" rel="noreferrer">receipt ↗</a> : null; };
  return (
    <div className="onboard" role="dialog" aria-label="Setting up your practice wallet">
      <div className="onboard-card">
        <div className="small muted">PRACTICE · FREE, NO WALLET</div>
        <h2 className="onboard-title">{phase === 'done' ? 'YOU\'RE IN' : 'GETTING YOU IN'}</h2>
        <p className="small">We make you a practice wallet, send it a little testnet NEAR and buy your first bag. These are real transactions on NEAR testnet; the coins have no value.</p>
        <ol className="onboard-steps">
          {ORDER.map((p, i) => {
            const state = err && i === at ? 'bad' : i < at || phase === 'done' ? 'done' : i === at ? 'now' : 'todo';
            return <li key={p} className={state}><span className="mark">{state === 'done' ? '✓' : state === 'bad' ? '✗' : state === 'now' ? <i className="spin" /> : '○'}</span><span>{LABEL[p]}</span>{p === 'funding' && state === 'done' && link('fund')}{p === 'buying' && state === 'done' && link('buy')}</li>;
          })}
        </ol>
        {err && <div className="warn">{err}</div>}
        {err && <div className="row gap wrap"><button className="btn primary" onClick={() => setAttempt(a => a + 1)}>Try again</button><button className="btn" onClick={onUseWallet}>Use my own wallet instead</button></div>}
        {!err && phase !== 'done' && <p className="small muted">This takes about 10–20 seconds.</p>}
      </div>
    </div>
  );
}
