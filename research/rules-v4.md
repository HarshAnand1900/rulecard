# Rulecard v4: the strategy layer (design draft, not built, numbers to be tuned by the sim)

v4 keeps the v3 curve, levels, deck and graduation, and changes **how cards create strategy and move price**.
The Vault from earlier talk is dropped. After graduation nothing applies (hard stop).

---

## 0. Physics: the only 3 ways a price can move

On a bonding curve the price depends only on the curve's state. Cards cannot "set" a price. They can only:

| Lever | Example | Who pays |
|---|---|---|
| **Buy with NEAR** | pot buys tokens | the pot (fee money) |
| **Burn tokens** | Sacrifice, losing stakes, Black Hole | whoever's tokens burn |
| **Change behaviour** | fees, locks, warnings, rewards for holding | traders change what they do |

Every card in v4 says which lever it pulls. If a card pulls none, it is a tool (it sets up another card).

## 1. Money: two buckets only

| Bucket | Filled by | Used for |
|---|---|---|
| **Coin pot** (per coin) | 0.75% of every trade (creator can raise the total fee to 1.5%, extra goes to pot) | Price cards. At graduation the leftover goes into the DEX pool, 20% to the creator |
| **Protocol** | 0.25% of every trade + all Paper Tax | Rulecard revenue |

No Vault, no vesting, no post-graduation payouts.

## 2. Five resources (what makes it a strategy game)

| Resource | Scope | Gained by | Spent on | Decision it creates |
|---|---|---|---|---|
| **Tokens / Conviction** | you | buying and holding (NEAR at risk × hours) | stakes in positions, burns | risk your bag in a position or stay liquid? |
| **Cards** | you, tied to one coin | packs, drops, sacrifice, craft, market | playing | play now, save for a combo, or sell? |
| **Spark** | coin, shared | check-ins, buys | Commons, tactics | who on the team spends the shared Spark? |
| **Heat** (0–3) | coin, shared | Kindle cards; decays 1 per hour | the next Price card spends ×(1 + 0.25·Heat) of the pot | build Heat now, fire later; risk it decays |
| **Pot** | coin, shared | fees | Price cards (cap 50% of pot per 24h) | spend on a pump, or save it for defence? |

## 3. Coin Mood (read the board)

Computed every 15 min from the last hour, shown on the coin page. Cards get a bonus in their Mood.

| Mood | When | Strong cards (+25% effect) | Weak cards (−25%) |
|---|---|---|---|
| **Calm** | net flow within ±2% of real NEAR | setup: Kindle, Diamond Pool, Bounty, Prophecy | Inferno |
| **Euphoria** | net buying > +5% | raids, Prophecy *Fade*, Squeeze | Last Stand |
| **Panic** | net selling > 5% | Last Stand, Hold the Line, Diamond Pool | Raids, Whale Tax |

Skill = reading the Mood and holding the right card for it. Moods also counter each other:
pumping a coin into Euphoria makes it vulnerable to raids and Fades.

## 4. Card roles

| Role | What it does | Makes money? |
|---|---|---|
| **Tool** | sets up Heat, Spark, info, tempo | no |
| **Price** | pulls a price lever with pot NEAR or burns | indirectly (your bag goes up) |
| **Position** | you stake tokens against other players; losers pay winners and part burns | **yes, from opponents only** |
| **Tactic** | modifies a raid round | helps a position win |
| **Counter** | cancels or blunts another card | protects positions |

Positions are the only way to *win* tokens from others. Every position burns part of the losing side,
so **every position also moves price** (more tokens at stake = bigger burn).

## 5. Card list v4 (27 cards)

Stake and wait rules from v3 still apply. "Warn" = time between play and effect (counter window).

### Commons (cost 5 Spark, no warn)

| Card | Role | Effect |
|---|---|---|
| Rally | Tactic | raid round ×1.07 (×1.035 if Cursed) |
| Ward | Tactic | blocks Curse, reflects ×0.93 on the curser |
| **Kindle** (new) | Tool | Heat +1 (max 3). Two Kindles from the same wallet in 6h don't stack |
| Roll Call | Tool | check-ins fill Spark/Ult 2× for 1h |
| Hype Siren | Tool | pinned on Trending 15 min |
| **Scout** (new) | Tool / Counter | in a raid: see if the enemy sealed a tactic this round and its tier. Outside raids: see the next pending card in its warn window early |
| Tax Holiday | Tool | 0% fee 10 min (pot and protocol earn nothing) |

Removed: Rebrand (becomes a cosmetic skin NFT, not a card), Echo.

### Rares (warn 2 min, one Rare per coin per 15 min)

| Card | Role | Effect |
|---|---|---|
| Curse | Tactic | enemy round ×0.90 unless Ward |
| Mirror | Tactic | copies the enemy's last-round tactic |
| **Counterspell** (new) | Counter | cancels a Common or Rare card still in its warn window. The cancelled card returns to its owner's hand |
| Last Stand | Price | only if price ≥ 25% below 24h high: pot buys dips for 30 min, max 10% of pot per 5 min, tokens burned |
| Slow Burn | Price | 1% of every trade's tokens burn for 1h |
| Happy Hour | Price | 15 min: buyers get +10% bonus tokens from the pot, vest 6h, burned if sold early |
| Diamond Pool | Position | holders lock tokens 1/6/24h. Leaving early: 20% of your lock, half to stayers, half burned |
| **Prophecy** (reworked) | Position | opens a 6h market on a target ("net inflow ≥ X" or "price ≥ Y"). Anyone stakes tokens on **Call** (yes) or **Fade** (no). Losers lose 30%: 20% to winners pro rata, 10% burned. Caster gets +10% on their winning share |
| **Bounty** (new) | Position | sponsor locks tokens on a goal (e.g. "40 new wallets ≥3 NEAR in 3h"). Met: bounty split by Conviction among the wallets that met it (sponsor's own wallets excluded). Not met: 90% back, 10% burned |
| Friendly Raid | Position | 4×30 min vs another coin; min stake 3 NEAR to cast and to accept; losing stakes 30% burned |
| Recruit | Tool | 1h: new wallets buying ≥3 NEAR get +5% bonus tokens (pot-bought, vest 6h) |
| Summoning Circle | Price | 30-min chant; if 25+ wallets join, 10% of joined stakes burn and 5 early chanters get a card |

### Epics (warn 5 min, need Ult full, one Epic/Mythic effect at a time)

| Card | Role | Effect |
|---|---|---|
| Inferno | Price | pot spends up to 30% × (1 + 0.25·Heat), buys at a **random block** in a 10-min window, burns all. Consumes Heat. Player can't sell 2h |
| Black Hole | Price | 1h: holders throw tokens in, then all burn. Top 3 throwers get a Rare |
| Liquidity Rain (moved up) | Price | pot buys over 30 min, shared by Conviction among today's check-ins |
| Hard Raid | Position | like Friendly, but half the losing stakes are sold to buy and burn the winner; loser shows the winner's banner 12h |
| Whale Tax | Price | 2h: wallets > 3% of supply pay +1% sell fee to the pot |
| Alliance | Tool | 6h pact; 10% of both pots' income buys and burns both; no raids between them |
| **Squeeze** (new) | Position counter | only if Fade stakes > Call stakes on an open Prophecy: pot buys for 15 min; if price rises ≥ 10% in that time, the Prophecy settles early for Call |

### Mythic (Eclipse windows, warn 10 min)

| Card | Role | Effect |
|---|---|---|
| Supernova | Price | Heat set to 3, then the pot spends everything allowed over 2h, burned |

### Creator rules (pick up to 3 at launch, locked)

Launch Guard · Paper Tax (+2% on sells of tokens bought < 15 min ago, **to protocol**) · Hold the Line ·
**Creator Lock** (was Vault Seal; renamed so it isn't confused with the dropped Vault): creator can't sell 24h, then unlocks over 48h.

## 6. Counter map (everything has an answer)

| If they play… | You answer with… |
|---|---|
| Curse | Ward |
| Rally spam | Curse, or Mirror |
| any Rare/Common in warn | Counterspell |
| Counterspell | Scout first (see it coming), bait with a cheap card |
| Prophecy Call stacked high | Fade it, or wait for Euphoria to fade |
| Heavy Fade | Squeeze |
| Inferno pump | sell into it (it's random-timed, so hard) or raid them while they're in Euphoria |
| Dump | Last Stand, Hold the Line, Diamond Pool |
| Whale | Whale Tax, Diamond Pool (the whale pays to leave) |

## 7. Combos (examples of team play)

- **Firestorm:** 3 Kindles from 3 wallets over 1h → Inferno at Heat 3 spends 1.75× → biggest single pump.
- **Trap:** open Prophecy *Call* in Calm → play Recruit and Hype Siren → inflow target hit → Fade side pays you.
- **Siege:** opponent coin in Euphoria → Friendly Raid (their buyers are tapped out) → Curse in round 2, hold Ward.
- **Fortress:** Panic → Last Stand + Diamond Pool → sellers who leave pay stayers and burn.

## 8. Anti-loop rules (kept from the redesign talk)

1. Rewards scale with **Conviction** (NEAR at risk × hours), capped per wallet. Splitting into sybils gains nothing.
2. **No reward for a condition you can cause alone.** Caster's own buys don't count for Prophecy/Bounty; trigger-ers are excluded from Hold the Line prizes.
3. **Every payout names its pool** (pot, or the opposing stakes). Empty pool → zero reward.
4. Self-positions net zero: if you take both sides, you pay yourself and lose the burn.
5. Raids and Prophecies need a minimum stake on **both** sides, else they refund.

## 9. Balance guardrails

| Guardrail | Value |
|---|---|
| Pot spend per 24h | ≤ 50% of the pot |
| Card + position burns per 24h | ≤ 5% of supply (extra burns refund) |
| Card-driven price change per hour | ≤ +20% (Price cards pause until next hour) |
| Positions open per coin | ≤ 3 at once, 1 per wallet as caster |
| Hard Raid / Squeeze per coin | 1 per 24h |
| Per wallet | 1 play per 30 min, 1 Epic/Mythic per 24h |

## 10. Rough price impact (to verify in the sim)

At L3 (650 real NEAR), with a pot of ~40 NEAR:

| Play | Pot / burn | Rough price change |
|---|---|---|
| Inferno, Heat 0 | 12 NEAR | +2–3% |
| Inferno, Heat 3 | 21 NEAR | +4–5% |
| Supernova | 20 NEAR over 2h | +4–5% |
| Last Stand in a −30% dump | up to 20 NEAR | softens the drop ~5% |
| Friendly Raid, 10M tokens lost | 3M burned | +1–2% |
| Prophecy, 20M on the losing side | 2M burned | +0.5–1% |

Price effects stay real but bounded: cards tilt a coin, they can't carry a dead one.

## 11. Graduation

Hard stop. Open positions refund in full, warn windows cancel and cards return to hand
(then become Hall of Fame collectibles), the pot goes to the pool (20% to the creator), and the coin becomes a plain NEP-141.

## 12. Open questions

- Is the pot (0.75%) big enough, or should the default total fee be 1.25%?
- Random-block Inferno needs on-chain randomness (`env::random_seed`). Good enough for a hackathon, not for big money.
- Raid tactics should be **sealed** (commit, then reveal) so Scout matters. That's a contract change.
