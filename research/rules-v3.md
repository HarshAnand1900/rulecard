# Rulecard rules v3 (design spec, not built yet)

Everything here is what `sim-v3.js` simulates. Numbers are first guesses, tuned by the sim.

## 1. Curve (pump.fun shape, priced in NEAR; 1 SOL ≈ 30 NEAR assumed)

| | Value |
|---|---|
| Virtual reserves | 900 NEAR, 1.073B tokens |
| Total supply | 1B tokens |
| Sold on the curve | 793.1M |
| Held back for the graduation pool | 206.9M |
| Launch market cap | ~840 NEAR |
| Graduation | when the curve sells out: ~2,550 real NEAR, ~12,300 NEAR market cap |
| Trade fee | 1% (creator can pick up to 2%), to the coin's pot |

Burns lift the price but selling every token always pays out exactly the real NEAR (no minting,
no NEAR taken out, sells never blocked).

## 2. Stake: what a wallet has put in (replaces "1M tokens held 1h")

**Stake = the larger of (NEAR bought − NEAR got back from sells) and (current value of the wallet's tokens).**
Raw trade volume is not used, because buying and selling in a loop would farm it.
The wait clock starts when a wallet's stake first reaches a threshold and resets if it falls below.

| To… | Stake at least | Held at that stake for |
|---|---|---|
| Claim a Pack | 1 NEAR | 1h |
| Play a Common or tactic | 1 NEAR | 30 min |
| Play a Rare | 3 NEAR | 1h |
| Play an Epic | 10 NEAR | 2h |
| Play a Mythic | 25 NEAR | 4h |
| Sacrifice | 3 NEAR | 1h |
| L2 drop | 3 NEAR | 30 min before L2 was crossed |
| L3 drop | 5 NEAR | 1h before L3 was crossed |
| L4 drop | 5 NEAR | 2h before L4 was crossed |

The same stake thresholds decide which wallets count for each level's "Wallets" rule.

## 3. Levels (all rules at once, for the hold time)

| | L2 Rising | L3 Hot | L4 Legendary | L5 Graduated |
|---|---|---|---|---|
| Market cap (NEAR) | 1,500 | 3,000 | 6,000 | sale sold out |
| Real NEAR backing | 250 | 650 | 1,200 | |
| Wallets (stake ≥) | 30 (≥3) | 80 (≥5) | 200 (≥5) | |
| Crowd share (each wallet counts ≤1% of supply) | 20% | 30% | 40% | |
| Volume 24h (NEAR) | 500 | 2,000 | 6,000 | |
| Different wallets checked in, 24h | 15 | 40 | 100 | |
| Net buying, last 1h | ≥ 0 | ≥ 0 | ≥ 0 | |
| Coin age | 30 min | 3h | 12h | |
| Milestone | none | a Rare effect finished | won a raid or survived a Hold the Line | |
| Hold time | 15 min | 30 min | 60 min | |
| Unlocks | Rare | Epic | Mythic | ordinary coin, cards end |

## 4. Pacing and caps

- Spark meter (0–30): check-ins and buys fill it; Commons and tactics cost 5.
- Rare: one Rare play per coin every 15 min.
- Ult meter (0–100): check-ins and buys fill it; an Epic needs it full and empties it.
- Mythic: only in Eclipse windows, 06:00–06:30 and 18:00–18:30 UTC.
- Per wallet: 1 play per 30 min, 1 Epic or Mythic per 24h. Creator can't play in the first hour.
- Warning before a card starts: Common 0, Rare 2 min, Epic 5 min, Mythic 10 min.
- Per coin, per 24h: card burns ≤ 5% of supply, pot spending ≤ 50% of the pot, total sell fee ≤ 3%.
- Only one Epic or Mythic effect active at a time.

## 5. Deck (per coin)

| Tier | Unplayed at once (L1/L2/L3/L4) | Total ever made | Max per wallet | Deck earns |
|---|---|---|---|---|
| Common | 3 per wallet for Packs; hand limit 7 | unlimited | 3 (Packs) | unlimited |
| Rare | 4 / 8 / 20 / 40 | 150 | 3 | 1 per 50 NEAR volume or 10 check-ins, max 30/day |
| Epic | 1 / 1 / 3 / 6 | 20 | 1 | 1 per Ult fill, max 4/day |
| Mythic | 0 / 0 / 0 / 1 | 3 | 1 | 1 per Eclipse window at L4 |

## 6. Getting cards

| Source | Rule |
|---|---|
| Pack | every 6h after a check-in; 95% Common / 5% Rare; blocked while you hold 3 unplayed Commons |
| Level drop | one per qualifying wallet. L2: 75C/25R. L3: 65C/30R/5E. L4: 78C/18R/3E/1M. Out of stock → next tier down |
| Sacrifice | burn tokens, roll odds by share of supply (below), pick 1 of 2 types, pity after 5 misses, 1 per hour |
| Craft | 3 cards of one tier (2 with high reputation) → 1 of the next tier, your choice of type, needs deck stock |
| Events | Hold the Line: 1 in 10 shields gets a Rare. Raid MVP and Black Hole top feeder: a Rare |
| Card Market | Rare and above; 5% of each sale to the coin's pot |
| Wild | salvage cards from dead (24h no trades) or graduated coins into Shards (C1/R4/E12/M30); Wild Common 3, Wild Rare 10; attunes to a coin on first play; 1 Wild play per coin per 6h |

Sacrifice odds (blend between rows):

| Burn | Common | Rare | Epic | Mythic |
|---|---|---|---|---|
| 0.05% | 90 | 9 | 1 | 0 |
| 0.2% | 60 | 35 | 5 | 0 |
| 1% | 30 | 45 | 22 | 3 |
| 3% | 10 | 40 | 40 | 10 |

## 7. Creator rules (pick up to 3 at launch, locked)

| Rule | Effect |
|---|---|
| Launch Guard | max 30 NEAR per wallet in the first 10 min |
| Paper Tax | selling tokens bought in the last 15 min costs +2%, to the pot |
| Hold the Line | a 20% drop within 1h (coin ≥1h old, L2+) starts 6h: sellers pay +2% into a prize, the pot buys and burns the dip, shield holders who don't sell share the prize |
| Vault Seal | the creator can't sell for 24h |

## 8. Cards (25)

| Card | Tier | Effect | Notes / counter |
|---|---|---|---|
| Ward | Common | Raid tactic: blocks a Curse and reflects −7% | beats Curse |
| Rally | Common | Raid tactic: +7% score this round | halved by Curse |
| Tax Holiday | Common | 0% fee for 10 min | pot earns nothing meanwhile |
| Roll Call | Common | check-ins fill meters 2× for 1h | |
| Hype Siren | Common | pinned to Trending for 15 min | |
| Rebrand | Common | new mascot skin for 1h | cosmetic |
| Echo | Common | repeats the last Common played on this coin | can't echo an Echo |
| Curse | Rare | Raid tactic: −10% to the enemy, halves their Rally | blocked by Ward |
| Mirror | Rare | Raid tactic: copies the enemy's last-round card | |
| Counterspell | Rare | Raid tactic: cancels the enemy's tactic this round | costs a Rare |
| Slow Burn | Rare | 1% of every trade's tokens burn for 1h | |
| Happy Hour | Rare | 15 min: pot buys +10% bonus tokens for buyers, vesting 6h, burned if sold early | pot cap |
| Diamond Pool | Rare | lock 1/6/24h; leaving early costs 20% (half burned, half to stayers) | |
| Summoning Circle | Rare | 30-min chant; if 25+ wallets join, 10% of stakes burn and 5 early chanters get cards | |
| Prophecy | Rare | hit a net-inflow target in 6h and up to 3 believers get Rares | |
| Friendly Raid | Rare | 2h, 4 rounds vs another coin; 30% of losing stakes burn | target must accept |
| Recruit | Rare | 1h: new wallets buying ≥3 NEAR get +5% bonus tokens (pot-bought, vest 6h) | |
| Liquidity Rain | Rare | pot buys tokens over 30 min, shared among today's check-ins | pot cap |
| Last Stand | Rare | only when price ≥30% below its 24h high: 30 min of 2× pot dip buy-and-burn | counters a dump |
| Inferno | Epic | pot buys and burns in 12 chunks over 1h; player can't sell for 2h | |
| Black Hole | Epic | 1h: holders throw tokens in, then all burn | burn cap |
| Hard Raid | Epic | like Friendly Raid, but half the losing stakes buy and burn the winner; loser shows the winner's banner 12h | target must accept |
| Whale Tax | Epic | 2h: wallets holding >3% pay extra sell fee to the pot (total sell fee still ≤3%) | 5-min warning |
| Alliance | Epic | 6h pact with another coin: 10% of both pots' fee income buys and burns both; no raids between them | other coin accepts |
| Supernova | Mythic | pot spends everything it is allowed to, burning over 2h | Eclipse only |

## 9. Graduation

When the curve sells out: trading pauses a few blocks, running effects wrap up (drips stop,
Black Hole burns, Diamond Pool unlocks free, raids refund, Hold the Line pays out, vesting
bonuses vest), the pool gets the real NEAR + the pot's leftover + up to 206.9M tokens (any
excess burned so the price doesn't jump), the coin becomes a NEP-141 token, unplayed cards
become Hall of Fame collectibles, and no card or rule ever applies again.

## 10. Simulation findings (sim-v3.cjs, results in sim-v3-results.txt)

Candidate changes tested as "+fixes" (not adopted yet):
fee 2% to the pot · Liquidity Rain and Hold the Line prize split by capped holdings, not per wallet ·
Epic needs stake 5 / Mythic 10 · Epic max 3 per wallet (so 3 Epics can craft a Mythic) ·
Wallets rule L2 25 (≥2) / L3 60 (≥3) / L4 120 (≥3) · Packs every 12h · check-ins fill Spark at 0.4 ·
1 Mythic added to the deck on reaching L4, Eclipse every 6h · Inferno spends up to 50% of the pot ·
creator first buy max 10 NEAR, Vault Seal = locked 24h then unlocks over 48h.

Still open after the fixes: pot cards barely move price (pot ~25–50 NEAR vs a curve of hundreds),
Commons are ~90% of plays and do little, Epics are mostly played by whales, a 40-wallet farm can
buy the Wallets rule, and once the Wallets rule is lower, wash volume can buy the Volume rule.
