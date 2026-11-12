// "Try to cheat it": real transactions the contract must refuse. Each button sends one to a live coin and shows NEAR's own answer.
import { useState } from 'react';
import type { Net } from './net';
import type { CoinEntry } from './types';

type Attempt = { id: string; title: string; why: string; run: (ch: Net, coin: string) => Promise<void> };
const ATTEMPTS: Attempt[] = [
  { id: 'yocto', title: 'Sell without the 1 yoctoNEAR deposit', why: 'This is exactly what a one-tap key can do: it can never attach a deposit, so it can never sell your tokens.', run: (ch, c) => ch.call(c, 'sell', { amount: '1' }, 0n).then(() => {}) },
  { id: 'admin', title: 'Make myself the admin', why: 'There is no admin method, and no key to sign one.', run: (ch, c) => ch.call(c, 'set_admin', { account_id: ch.me() }, 0n).then(() => {}) },
  { id: 'reinit', title: 'Re-launch the coin to change its rules', why: 'Parameters are frozen at launch.', run: (ch, c) => ch.call(c, 'new', { name: 'Mine now', symbol: 'MINE', icon: null, creator: ch.me(), protocol: ch.me(), rules: [] }, 0n).then(() => {}) },
  { id: 'gm2', title: 'Check in twice in a row (gm, gm)', why: 'One check-in per wallet every 6 hours (30 minutes in demo mode). The first may succeed or be refused; the second never works.', run: async (ch, c) => { try { await ch.call(c, 'gm', {}, 0n); } catch { /* the first one may be refused too: only the second answer matters */ } await ch.call(c, 'gm', {}, 0n); } },
  { id: 'unlock', title: 'Take Vault tokens out before the lock ends', why: 'Locked tokens can only leave early by paying the 20% penalty.', run: async (ch, c) => {
      // lock a little first (6 hours; 30 minutes in demo mode) so there is a real lock to try to cheat
      const me = ch.me()!, now = (await ch.view<any>(c, 'get_coin')).now as number;
      let h = await ch.view<any>(c, 'get_holder', { account_id: me });
      let idx = (h?.locks ?? []).findIndex((l: any) => l.until > now);
      if (idx < 0) {
        const bal = BigInt(await ch.view<string>(c, 'ft_balance_of', { account_id: me }));
        if (bal < 100n) throw new Error('buy a little of this coin first');
        await ch.call(c, 'lock', { amount: (bal / 50n).toString(), hours: 6 }, 1n);
        h = await ch.view<any>(c, 'get_holder', { account_id: me }); idx = h.locks.length - 1;
      }
      await ch.call(c, 'unlock', { index: idx }, 0n);
    } },
  { id: 'escrow', title: 'Claim the creator escrow before graduation', why: 'The creator fee is paid only when the curve sells out.', run: (ch, c) => ch.call(c, 'claim_creator_escrow', {}, 0n).then(() => {}) },
];

export default function Cheat({ ch, coins }: { ch: Net; coins: CoinEntry[] }) {
  const [res, setRes] = useState<Record<string, { state: 'busy' | 'rejected' | 'accepted'; text: string }>>({});
  const coin = coins[coins.length - 1]?.account_id;
  const canSend = ch.mode !== 'wallet' && !!ch.me();
  const go = async (a: Attempt) => {
    if (!coin) return;
    setRes(r => ({ ...r, [a.id]: { state: 'busy', text: '' } }));
    try { await a.run(ch, coin); setRes(r => ({ ...r, [a.id]: { state: 'accepted', text: 'The chain accepted it.' } })); }
    catch (e: any) { setRes(r => ({ ...r, [a.id]: { state: 'rejected', text: String(e?.message ?? e).slice(0, 220) } })); }
  };
  return (
    <div className="panel stack">
      <h2>Try to cheat it</h2>
      <p className="small muted">Each button sends a real transaction to {coin ? <code>{coin}</code> : 'a coin'} that the contract has to refuse. You see NEAR's own error, not ours.
        {!canSend && ' Open the app with Practice mode (or sign in) first; with your own wallet each one would ask you to approve it.'}</p>
      {ATTEMPTS.map(a => {
        const r = res[a.id];
        return (
          <div key={a.id} className="cheat-row">
            <div><strong>{a.title}</strong><br /><span className="small muted">{a.why}</span></div>
            <div className="cheat-out">
              <button className="btn small" disabled={!canSend || !coin || r?.state === 'busy'} onClick={() => go(a)}>{r?.state === 'busy' ? 'Sending…' : 'Try it'}</button>
              {r?.state === 'rejected' && <div><span className="stamp">REJECTED BY NEAR</span><div className="small mono">{r.text}</div>{ch.explorer && ch.me() && <a className="small" href={`${ch.explorer}/address/${ch.me()}`} target="_blank" rel="noreferrer">your account's transactions ↗</a>}</div>}
              {r?.state === 'accepted' && <div className="warn small">⚠ {r.text} (that is not supposed to happen)</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
