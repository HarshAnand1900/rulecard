// First screen of a hosted build: two doors into the same game.
import { useState } from 'react';
import type { Door } from './net';
import { play } from './sound';

export default function Landing({ onPick }: { onPick: (d: Door) => void }) {
  const [more, setMore] = useState(false);
  const pick = (d: Door) => { play('click'); onPick(d); };
  return (
    <div className="landing">
      <div className="landing-inner">
        <h1 className="landing-title">RULECARD</h1>
        <p className="landing-line">A league of memecoins whose communities go to war. Show up every day or your bag burns, and the coin that shows up bigger raids the other.</p>
        <button className="play-btn" onClick={() => pick('practice')}><span aria-hidden="true">▶</span> TRY THE DEMO</button>
        <button className="door-btn" onClick={() => pick('wallet')}>FULL TESTNET WITH MY OWN WALLET</button>
        <p className="landing-foot">Play is free with no wallet: we make you a practice wallet · your own wallet uses your own testnet NEAR</p>
        <button className="linkish small muted" onClick={() => setMore(m => !m)} aria-expanded={more}>{more ? 'Hide' : 'Two ways in, one game'} ▾</button>
        {more && (
          <div className="landing-more">
            <div className="way"><strong>DEMO (practice wallet)</strong><span>About two minutes, free. A practice wallet is made in your browser and a little testnet NEAR is sent to it, so there are no popups and nothing to install. Every move is a real transaction on NEAR testnet, and the coins have no value.</span></div>
            <div className="way"><strong>FULL TESTNET (my own wallet)</strong><span>Connect MyNearWallet or Meteor with your own testnet account. The full game, including launching your own coin, and your account signs.</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
