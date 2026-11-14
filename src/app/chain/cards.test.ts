// @ts-nocheck (uses node:fs; the app's tsconfig has no node types)
// A card-by-card check of the UI against the contract, for all 29 cards:
//  1. every card has text, a symbol, a face design and a play control that says what it does;
//  2. every contract method the play controls call really exists in the coin contract;
//  3. the sound and play lists only name methods that exist.
// The contract side of each card is covered by contracts/coin/src/tests.rs (see docs/card-coverage.md).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CardPlay from './CardPlay';
import { CARD_TEXT, TIER_OF, USE_OF, CARD_SYMBOL, type Card } from './types';
import { EPICS, RARES, COMMONS } from './epic/epicData';
import { symKey } from './epic/epicData';

const CARDS = Object.keys(TIER_OF) as Card[];
const contract = ['cards', 'table', 'raid', 'stakes', 'game', 'trade', 'lib', 'omens'].map(f => readFileSync(`contracts/coin/src/${f}.rs`, 'utf8')).join('\n');
const hasFn = (m: string) => new RegExp(`pub fn ${m}\\b`).test(contract);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const render = (card: Card, raidOn = false) => renderToStaticMarkup(createElement(CardPlay, { card, call: async () => {}, busy: '', table: [], me: 'me.testnet', coins: [{ account_id: 'moth.f', name: 'Moth', symbol: 'MOTH', creator: 'x', created_ms: 0, seed: '0' }], selfId: 'frog.f', price: '1000000000000000000000000', raidOn, goRaids: () => {} }));

// what the player should be offered for each card
const OFFER: Record<Card, RegExp> = {
  Rally: /Play it in the raid/, Curse: /Play it in the raid/, Ward: /Play it in the raid/, Decoy: /Play it in the raid/, Mirror: /Play it in the raid/, Counterspell: /in the raid[\s\S]*Counter it/, Scout: /Play it in the raid/,
  Ember: /Put on the table/, Prophecy: />Play</, Inferno: /Put on the table/, BlackHole: /Put on the table/, Harvest: /Put on the table/, WhaleTax: /Put on the table/,
  Supernova: /Put on the table/, Stampede: /Put on the table/, Squeeze: /Put on the table/, Alliance: /Propose pact/,
  RollCall: />Play</, HypeSiren: />Play</, Kindle: />Play</, SlowBurn: />Play</, Recruit: />Play</, DiamondPool: />Play</, LastStand: />Play</,
  Hedge: /Hedge it/, Duel: /Challenge/, Bounty: /Open bounty/, FriendlyRaid: /Propose/, HardRaid: /Propose/,
};

describe('all 29 cards: the UI', () => {
  it('knows exactly 29 cards: 10 Commons, 11 Rares, 7 Epics, 1 Mythic', () => {
    expect(CARDS.length).toBe(29);
    const tiers = [0, 1, 2, 3].map(t => CARDS.filter(c => TIER_OF[c] === t).length);
    expect(tiers).toEqual([10, 11, 7, 1]);
  });
  for (const card of CARDS) {
    it(`${card}: has text, a symbol, a face design and a play control`, () => {
      const t = CARD_TEXT[card];
      expect(t.name.length).toBeGreaterThan(1); expect(t.text.length).toBeGreaterThan(10); expect(CARD_SYMBOL[card]).toBeTruthy();
      // the design file's data covers it (the Mythic is drawn by its own template)
      if (card !== 'Supernova') {
        const rows = TIER_OF[card] === 0 ? COMMONS : TIER_OF[card] === 1 ? RARES : EPICS;
        const row = rows.find((r: any[]) => norm(r[1]) === norm(card));
        expect(row, `${card} has a face in the design data`).toBeTruthy();
        expect(symKey(row[1]).length).toBeGreaterThan(0);
      }
      const html = render(card, true);
      expect(html, `${card} offers an action`).toMatch(OFFER[card]);
    });
  }
  it('raid cards say whether a raid is live', () => {
    expect(render('Rally', true)).toMatch(/Play it in the raid/);
    expect(render('Rally', false)).toMatch(/No raid is live/);
    expect(render('Scout', false)).toMatch(/No raid is live/);
  });
});

describe('all 29 cards: the UI only calls contract methods that exist', () => {
  const src = readFileSync('src/app/chain/CardPlay.tsx', 'utf8');
  const used = [...new Set([...src.matchAll(/call\([^;]*?'([a-z_]+)'/g)].map(m => m[1]))];
  it('finds the play methods in CardPlay', () => { expect(used.length).toBeGreaterThanOrEqual(6); });
  for (const m of used) it(`CardPlay calls ${m}, which exists in the contract`, () => { expect(hasFn(m), m).toBe(true); });

  const chain = readFileSync('src/app/chain/ChainApp.tsx', 'utf8');
  const list = (name: string) => [...(chain.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  for (const name of ['TABLE_PLAYS', 'BACKINGS']) for (const m of list(name)) it(`${name} lists ${m}, which exists in the contract`, () => { expect(hasFn(m), m).toBe(true); });
  for (const m of ['claim_pack', 'claim_level_drop', 'claim_raid_pack', 'claim_payouts', 'drop_card', 'gm']) it(`the Cards tab uses ${m}, which exists`, () => { expect(hasFn(m), m).toBe(true); });
});

describe('the UI sends the arguments the contract expects', () => {
  const src = readFileSync('src/app/chain/CardPlay.tsx', 'utf8');
  const params = (m: string) => { const sig = contract.match(new RegExp(`pub fn ${m}\\(&mut self(?:, ([^)]*))?\\)`)); return sig && sig[1] ? sig[1].split(',').map(p => p.trim().split(':')[0].trim()) : []; };
  for (const m of ['play_card', 'play_alliance', 'hedge', 'duel_challenge', 'bounty_open', 'start_friendly_raid', 'start_hard_raid', 'counterspell_card']) {
    it(`${m}: every contract parameter is sent by the UI`, () => {
      const names = params(m);
      expect(names.length).toBeGreaterThan(0);
      for (const p of names) expect(src, `${m} needs "${p}"`).toMatch(new RegExp(`\\b${p}\\b`));
    });
  }
});
