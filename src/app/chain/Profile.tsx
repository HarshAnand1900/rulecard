// Profile: who you are in the game. Wallet, balance, what you hold in each coin, your receipts, and the wallet actions in one place.
// Everything comes from the chain (get_holder per coin) and from this browser's receipts; nothing here is stored elsewhere.
import { useEffect, useState } from 'react';
import type { Net } from './net';
import type { CoinEntry, CoinView, HolderView } from './types';
import { toNear, toTok, fmtNear, fmtTok } from './near';

const JOKERS = ['1-common-grin', '2-rare-laugh', '3-epic-wink', '4-mythic-starry', '5-wild-shades'];
const COLORS = ['#ff7a1a', '#4c8dff', '#f0518c', '#f5b729', '#2dd4bf', '#a78bfa'];
const hsh = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const shortAcct = (a: string) => (/^[0-9a-f]{64}$/.test(a) ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const ago = (t: number) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

interface Held { id: string; sym: string; c: CoinView; h: HolderView }

export default function Profile({ ch, me, bal, coins, tick, go, onBackup, onSwitch, onReset, onGuide }: {
  ch: Net; me: string; bal: number; coins: CoinEntry[]; tick: number; go: (id: string) => void;
  onBackup: () => void; onSwitch: () => void; onReset: () => void; onGuide: () => void;
}) {
  const [held, setHeld] = useState<Held[] | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!me) { setHeld([]); return; }
    let live = true;
    (async () => {
      const out: Held[] = [];
      for (const e of coins) {
        try {
          const [c, h] = await Promise.all([ch.view<CoinView>(e.account_id, 'get_coin'), ch.view<HolderView | null>(e.account_id, 'get_holder', { account_id: me })]);
          if (h && (BigInt(h.balance) > 0n || BigInt(h.locked) > 0n)) out.push({ id: e.account_id, sym: c.symbol, c, h });
        } catch { /* skip */ }
      }
      if (live) setHeld(out);
    })();
    return () => { live = false; };
  }, [ch, coins, me, tick]);

  const total = (held ?? []).reduce((a, x) => a + toNear(x.h.value), 0);
  const lockedPos = (held ?? []).filter(x => BigInt(x.h.locked) > 0n).length;
  const practice = ch.mode === 'practice';
  const color = COLORS[hsh(me || 'x') % COLORS.length], joker = JOKERS[hsh(me || 'x') % JOKERS.length];
  const receipts = Object.entries(ch.receipts ?? {}).sort((a, b) => b[1].at - a[1].at).slice(0, 8);
  const copy = () => { try { navigator.clipboard.writeText(me); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };

  if (!me) return (
    <section>
      <h1>Profile</h1>
      <div className="panel stack"><p className="muted">Connect a wallet to see your balance and your coins.</p><div className="row gap"><button className="btn primary" onClick={() => ch.signIn?.()}>Connect wallet</button></div></div>
    </section>
  );

  return (
    <section className="profile">
      <h1>Profile</h1>
      <div className="panel prof-head" style={{ ['--ac' as any]: color, ['--m' as any]: `url(/bg/jokers/${joker}.png)` }}>
        <span className="avatar big" aria-hidden="true"><b>{me.slice(0, 2).toUpperCase()}</b></span>
        <div className="ph-id">
          <div className="row gap wrap"><strong className="ph-name mono" title={me}>{shortAcct(me)}</strong><span className="pill">{practice ? 'Practice wallet' : 'Your wallet'}</span><span className="pill">{ch.scale === 'demo' ? 'Demo scale' : 'Full scale'}</span><span className="pill">{ch.mode === 'sandbox' ? 'Local sandbox' : 'NEAR testnet'}</span></div>
          <div className="row gap wrap ph-actions">
            <button className="btn small" onClick={copy}>{copied ? 'Copied' : 'Copy address'}</button>
            {ch.explorer && <a className="btn small" href={`${ch.explorer}/address/${me}`} target="_blank" rel="noreferrer">View on explorer ↗</a>}
            <button className="btn small" onClick={onGuide}>Show the guide</button>
          </div>
        </div>
      </div>

      <div className="panel strip prof-strip">
        <div><small>WALLET BALANCE</small><b className="mono">{fmtNear(bal)} N</b><span className="muted small">for gas and buying</span></div>
        <div><small>COINS VALUE</small><b className="mono up">{fmtNear(total)} N</b><span className="muted small">if sold back, with locks</span></div>
        <div><small>COINS HELD</small><b className="mono">{held ? held.length : '·'}</b><span className="muted small">of {coins.length} live</span></div>
        <div><small>VAULT POSITIONS</small><b className="mono">{held ? lockedPos : '·'}</b><span className="muted small">safe from idle burn</span></div>
        <div><small>NETWORK</small><b className="mono">{ch.mode === 'sandbox' ? 'sandbox' : 'testnet'}</b><span className="muted small">coins have no value</span></div>
      </div>

      <div className="trade-grid prof-grid">
        <div className="tg-left">
          <div className="panel">
            <div className="row between"><h2>What you hold</h2><span className="muted small mono">{held ? `${held.length} COINS` : 'LOADING'}</span></div>
            {held && !held.length && <p className="muted">You don't hold any coin yet. Pick one in Discover and buy a small bag.</p>}
            <div className="holdings">
              {(held ?? []).map(x => {
                const gmDue = x.h.last_gm === 0 || x.c.now >= x.h.next_gm, burning = x.h.last_gm > 0 && x.c.now >= x.h.idle_burn_starts;
                return (
                  <button key={x.id} className="hold" style={{ ['--ac' as any]: COLORS[hsh(x.sym) % COLORS.length], ['--m' as any]: `url(/bg/jokers/${JOKERS[hsh(x.sym) % JOKERS.length]}.png)` }} onClick={() => go(x.id)}>
                    <span className="hold-sym"><strong>${x.sym}</strong><small className="muted">L{x.c.level} · {x.c.holders} holders</small></span>
                    <span className="hold-num mono"><small>BALANCE</small><b>{fmtTok(toTok(x.h.balance))}</b></span>
                    <span className="hold-num mono"><small>VALUE</small><b>{fmtNear(toNear(x.h.value))} N</b></span>
                    <span className="hold-num mono"><small>LOCKED</small><b>{fmtTok(toTok(x.h.locked))}</b></span>
                    <span className="hold-st">{burning ? <span className="pill bad">Idle burn running</span> : gmDue ? <span className="pill hot">gm ready</span> : <span className="pill ok">Checked in</span>}{x.h.qualified && <span className="pill">Qualified</span>}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="panel">
            <div className="row between"><h2>Your receipts</h2><span className="muted small mono">THIS BROWSER</span></div>
            {!receipts.length && <p className="muted small">Your last transactions show here with a link to the explorer.</p>}
            <div className="trades">
              {receipts.map(([k, r]) => (
                <div key={k} className="trade-row"><span className="tr-side mono">{k.replace(/_/g, ' ').toUpperCase()}</span><span className="tr-who mono muted">{r.hash.slice(0, 10)}…</span>{ch.explorer ? <a className="mono small" href={`${ch.explorer}/txns/${r.hash}`} target="_blank" rel="noreferrer">receipt ↗</a> : <span />}<span className="mono muted tr-time">{ago(r.at)}</span></div>
              ))}
            </div>
          </div>
        </div>

        <div className="tg-right">
          <div className="panel">
            <h2>Wallet</h2>
            <div className="xrows">
              <div className="row between small"><span className="muted">Address</span><span className="mono ph-addr">{me}</span></div>
              <div className="row between small"><span className="muted">Type</span><span>{practice ? 'Made in this browser' : 'Signed by your wallet app'}</span></div>
              <div className="row between small"><span className="muted">Balance</span><span className="mono">{fmtNear(bal)} NEAR</span></div>
            </div>
            <div className="stack" style={{ marginTop: 12 }}>
              {practice ? <>
                <button className="btn" onClick={onBackup}>Back up my practice key</button>
                <button className="btn" onClick={onSwitch}>Switch to my own wallet</button>
                <button className="btn danger" onClick={onReset}>Start over with a new wallet</button>
              </> : <>
                <button className="btn" onClick={onSwitch}>Switch to practice (free)</button>
                <button className="btn" onClick={() => ch.signOut?.()}>Sign out</button>
              </>}
            </div>
          </div>
          <div className="panel">
            <h2>Good to know</h2>
            <ul className="tips small">
              <li>Say gm in each coin you hold, or part of the bag burns.</li>
              <li>Locking tokens in the Vault keeps them safe from idle burn.</li>
              <li>{practice ? 'Clearing this browser\'s data forgets the practice wallet. Back up the key first.' : 'Your wallet app holds your keys. Rulecard never sees them.'}</li>
              <li>Everything you do is a public transaction on NEAR testnet.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
