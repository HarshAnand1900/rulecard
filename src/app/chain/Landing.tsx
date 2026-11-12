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
        <p className="landing-line">Most memecoins die when the community stops showing up. Here, that's literally the rule, and coins raid each other to stay alive.</p>
        <button className="play-btn" onClick={() => pick('practice')}><span aria-hidden="true">▶</span> PLAY</button>
        <button className="door-btn" onClick={() => pick('wallet')}>PLAY WITH MY OWN TESTNET WALLET</button>
        <p className="landing-foot">Play is free with no wallet: we make you a practice wallet · your own wallet uses your own testnet NEAR</p>
        <button className="linkish small muted" onClick={() => setMore(m => !m)} aria-expanded={more}>{more ? 'Hide' : 'Two ways in, one game'} ▾</button>
        {more && (
          <div className="landing-more">
            <div className="way"><strong>PLAY (practice)</strong><span>Free. A practice wallet is made in your browser and a little testnet NEAR is sent to it, so there are no popups and nothing to install. Every move is a real transaction on NEAR testnet, and the coins have no value.</span></div>
            <div className="way"><strong>MY OWN WALLET (testnet)</strong><span>Connect MyNearWallet or Meteor with your own testnet account. Same game, same coins, your account signs.</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
