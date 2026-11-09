# Rulecard game spec v4.1

The single source of truth for every card, meter and rule. It replaces `research/rules-v3.md` and
`research/rules-v4.md` wherever they disagree. Numbers are starting values, to be tuned by the simulation.

Markers: ✅ decided by you · 🟡 my decision or proposal, not confirmed · 🔧 changed after the red-team review

---

## 1. Glossary

| Word | Meaning |
|---|---|
| **Coin** | a memecoin launched on Rulecard. Each coin has its own curve, deck, pot and reward pool |
| **Curve** | the contract that sells and buys the coin before graduation. Price = NEAR in curve ÷ tokens in curve |
| **Real NEAR** | NEAR buyers actually paid into the curve. Every holder can always sell back against it |
| **Market cap** | price × 1B tokens. A paper number |
| **Holding** | value of your tokens in NEAR, plus how long you've held at that level. Unlocks actions. Nothing locked |
| **Conviction** | Holding × hours. Your weight in rewards and draws |
| **Bet** | tokens you choose to lock in a position. Can be won or lost |
| **Pot** | NEAR that price cards spend (buy then burn). One per coin |
| **Reward pool** | 5% of supply locked at launch. Released only as rewards for risk |
| **Protocol** | Rulecard's revenue |
| **Play** | using a card from your hand |
| **Warn** | delay between a play and its effect. Everyone sees it and can react |
| **Effect** | what a card does once it fires |

---

## 2. Coin economics

### 2.1 Supply 🟡 (split to re-tune in the sim)

| Part | Tokens | What happens |
|---|---|---|
| Curve | ~760M | sold to buyers before graduation |
| DEX pool | ~190M | paired with the real NEAR at graduation so the price doesn't jump |
| Reward pool | 50M (5%) | locked; released only by card results; leftover burned at graduation |
| **Total** | **1,000M, fixed** | nothing can ever be minted. Only burns reduce it |

Targets: launch market cap ~840 NEAR, graduation ~2,500 real NEAR at ~12,000 market cap.

### 2.2 Money flows

| Flow | Rate | Goes to |
|---|---|---|
| Trade fee (every buy and sell) | 1% ✅ | **protocol** |
| Creator Seed (at launch) | 10–100 NEAR, min 10 🔧 | **pot** |
| Paper Tax (creator rule) | +2% on selling tokens bought < 15 min ago | **pot** 🔧 |
| Whale Tax (card) | +1% sell fee for big wallets, 2h | pot |
| Hold the Line sell fee | +2% on sells during the event | event prize |
| Diamond Pool exit penalty | 20% of the lock | half to stayers, half burned |
| Card Market royalty | 5% of each sale | pot |

🔧 **Why the Seed exists:** with the whole fee going to the protocol, the pot had no fuel. The Seed gives every coin
a starting pot, and it's a strong anti-rug signal: the creator gives up NEAR to their own holders.

### 2.3 Price levers (the only three)

1. NEAR into the curve (buys, pot buys) → up
2. NEAR out of the curve (sells) → down
3. Burning **paid-for** tokens → up (the same NEAR now backs fewer tokens)

Releasing reward-pool tokens → slightly down for everyone; the winner gains. The curve re-prices on every release
so that selling every token still pays out exactly the real NEAR (the solvency invariant).

---

## 3. Player measures

### 3.1 Holding ✅

`Holding = max(NEAR put in − NEAR taken out, current value of tokens)`

The "held for" clock starts when your Holding first reaches a threshold, and **resets** if it falls below.

| Action | Holding ≥ | Held for |
|---|---|---|
| Check in ("gm") | 1 NEAR | 1h |
| Claim a pack | 1 NEAR | 1h |
| Play a Common or tactic | 1 NEAR | 30 min |
| Play a Rare | 3 NEAR | 1h |
| Play an Epic | 5 NEAR 🔧 | 2h |
| Play a Mythic | 10 NEAR 🔧 | 4h |
| Sacrifice | 3 NEAR | 1h |

🔧 Epic and Mythic thresholds lowered (sim: whales made 82–100% of Epic plays).

### 3.2 Conviction 🟡

- Every hour you gain Conviction = your Holding in NEAR (capped at the value of 1% of supply).
- Selling X% of your tokens removes X% of your Conviction.
- It's per coin. It's used for reward shares, draw tickets and Liquidity Rain.
- Splitting into many wallets earns exactly the same total, so sybil wallets gain nothing.

### 3.3 Rewards: half fair, half luck 🟡

Every reward-pool payout is split:

- **50% pro rata**: everyone eligible gets a share by tickets.
- **50% as 3 lucky draws**: 60% / 25% / 15% of that half. Chance = your tickets ÷ all tickets.

Tickets = Conviction (or the amount you bet or burned, depending on the card). Expected value stays proportional,
so splitting doesn't help, but a small player can win big.
Draws use the random seed of a **later block** than the one that closes entries.

### 3.4 Reputation (account-wide)

Earned from relics and badges (raid wins, Hold the Line survived, graduation participation).

| Reputation | Perk |
|---|---|
| 10 | +1% drop odds toward Rare |
| 25 | craft 2 → 1 for Common to Rare |
| 50 | craft 2 → 1 for Rare to Epic |

---

## 4. Coin measures (meters)

| Meter | Range | Fills from | Spent by | Notes |
|---|---|---|---|---|
| **Spark** | 0–30 | +1 per check-in, +1 per 5 NEAR bought | Commons and tactics, 5 each | stops Common spam |
| **Ult** | 0–100 | +2 per check-in, +1 per 2 NEAR bought | an Epic needs 100 and empties it | about 2–4 Epics a day on an active coin |
| **Heat** | 0–3 | Kindle +1 | consumed by Inferno, Black Hole, Supernova | −1 every hour |
| **Rare slot** | open / cooldown | – | one Rare per coin every 15 min | |
| **Eclipse** | open / closed | 30 min at 00:00, 06:00, 12:00, 18:00 UTC 🔧 | Mythic plays | site-wide event |
| **Mood** | Calm / Euphoria / Panic | last hour's net buying ÷ real NEAR, recomputed every 15 min | – | Euphoria > +5%, Panic < −5% |
| **Pot** | NEAR | Seed, game taxes, royalties | price cards | max 50% spent per 24h |
| **Reward pool** | tokens | – | rewards | usable share by level, max 0.5% of supply per day |
| **Deck** | per tier | earned by volume, check-ins, Ult fills, Eclipses | drops and crafts | caps how many cards exist |

### 4.1 Mood effects 🟡

| Mood | +25% | −25% |
|---|---|---|
| Calm | Inferno, Prophecy pool bonus, Diamond Pool | – |
| Euphoria | Raid scores of the **attacker**, Squeeze | Inferno, Last Stand |
| Panic | Last Stand, Hold the Line prize, Diamond Pool penalty | Raid scores of both sides |

### 4.2 Reward pool unlocks 🟡

| Level | Usable share of the 50M |
|---|---|
| L1 | 0% |
| L2 | 30% |
| L3 | 60% |
| L4 | 100% |

Daily release cap: 0.5% of supply (5M tokens). Rewards vest 6h (selling early returns them to the pool).

---

## 5. Levels 🔧

All rules at once, continuously, for the hold time.

| Rule | L2 Rising | L3 Hot | L4 Legendary |
|---|---|---|---|
| Market cap | 1,500 | 3,000 | 6,000 |
| Real NEAR in curve 🔧 | 300 | 800 | 1,500 |
| **Qualified wallets** 🔧 | 25 (Holding ≥ 2 NEAR, held ≥ 1h) | 60 (≥ 3, held ≥ 3h) | 120 (≥ 3, held ≥ 6h) |
| Crowd share (each wallet counts ≤ 1% of supply) | 20% | 30% | 40% |
| Volume 24h, excluding round-trips inside 1h 🔧 | 500 | 2,000 | 6,000 |
| Check-ins 24h (distinct qualified wallets) | 15 | 40 | 100 |
| Net buying last 1h | ≥ 0 | ≥ 0 | ≥ 0 |
| Coin age | 30 min | 3h | 12h |
| Milestone | – | a Rare effect finished | won a raid or survived Hold the Line |
| Hold time | 15 min | 30 min | 60 min |
| **Unlocks** | Rare cards, 30% of reward pool | Epic cards, 60% | Mythic, 100%, +1 Mythic in deck |

L5 = graduation: the curve sells out.

**Level drop:** one card to each wallet that qualified **before** the crossing (L2: Holding 3 NEAR for 30 min,
L3: 5 NEAR for 1h, L4: 5 NEAR for 2h).

| Drop odds | Common | Rare | Epic | Mythic |
|---|---|---|---|---|
| L2 | 75% | 25% | – | – |
| L3 | 65% | 30% | 5% | – |
| L4 | 78% | 18% | 3% | 1% |

---

## 6. Getting cards

| Source | Rule |
|---|---|
| **Pack** | every 12h 🔧 after a check-in. 95% Common, 5% Rare. Blocked while you hold 3 unplayed Commons. Hand limit 7 Commons |
| **Level drop** | see section 5 |
| **Sacrifice** | burn tokens, roll for a card (table below). Pick 1 of 2 offered types. Guaranteed Rare+ after 5 misses. 1 per hour |
| **Craft** | 3 cards of one tier → 1 of the next tier, your choice of type. Needs deck stock |
| **Card Market** | Rare and above. 5% royalty to the coin's pot |
| **Black Hole** | top 3 throwers get a Rare |
| **Summoning Circle** | first 5 chanters get a card (75% Common, 25% Rare) |
| **Wild** | salvage cards from dead or graduated coins into Shards: C 1 / R 4 / E 12 / M 30. Wild Common = 3 Shards, Wild Rare = 10. A Wild card bonds to a coin on first play. 1 Wild play per coin per 6h |

**Sacrifice odds** (blend between rows):

| Burn (% of supply) | Common | Rare | Epic | Mythic |
|---|---|---|---|---|
| 0.05% | 90 | 9 | 1 | 0 |
| 0.2% | 60 | 35 | 5 | 0 |
| 1% | 30 | 45 | 22 | 3 |
| 3% | 10 | 40 | 40 | 10 |

### 6.1 Deck (per coin)

| Tier | Unplayed at once (L1 / L2 / L3 / L4) | Total ever | Max per wallet | Deck earns |
|---|---|---|---|---|
| Common | unlimited (limited by packs and hand) | unlimited | 7 in hand | – |
| Rare | 4 / 8 / 20 / 40 | 150 | 3 | 1 per 50 NEAR volume or 10 check-ins, max 30/day |
| Epic | 1 / 1 / 3 / 6 | 20 | 3 🔧 | 1 per Ult fill, max 4/day |
| Mythic | 0 / 0 / 0 / 2 | 4 | 1 | 1 on reaching L4, then 1 per Eclipse at L4 |

Out of stock → the drop becomes the next tier down.

### 6.2 Card NFT

- NEP-171 token: name, tier, role, coin id, serial ("#3 of 20"), 5% foil, art.
- Works only on its coin (except Wild).
- When the coin graduates, unplayed cards become **Hall of Fame** collectibles: same NFT, inactive.

---

## 7. Play limits

| Limit | Value |
|---|---|
| Per wallet | 1 play per 30 min; 1 Epic or Mythic per 24h |
| Creator | can't play in the coin's first hour |
| One big effect | only one Epic or Mythic effect active per coin |
| Warn | Common 0 · Rare 2 min · Epic 5 min · Mythic 10 min |
| Daily caps per coin | pot spend ≤ 50% · burns ≤ 5% of supply · price lift from cards ≤ +20%/hour · reward release ≤ 0.5% of supply |
| Positions | ≤ 3 open per coin; 1 per wallet as caster |
| Hard Raid, Squeeze | 1 each per coin per 24h |

If a cap is hit, the effect shrinks to fit. It never fails silently: the UI says "capped".

---

## 8. Cards (27)

Format for each card:
- **Who:** Holding needed.
- **Cost:** what the play spends.
- **Fuel:** where any NEAR or tokens come from.
- **Lever:** how it moves price.
- **Counter:** what answers it.

### Commons (L1+, Holding 1 NEAR for 30 min, cost 5 Spark, no warn)

**1. Rally**: Tactic (raids only)
- Your side's round score ×1.07. Only ×1.035 if the enemy plays Curse that round.
- Sealed: committed hidden, revealed at round end.
- Counter: Curse.

**2. Ward**: Tactic (raids only)
- Blocks an enemy Curse this round and reflects ×0.93 onto the side that cursed.
- No Curse means no effect.

**3. Kindle**: Tool
- Coin Heat +1 (max 3). Heat drops 1 per hour.
- A wallet can add at most 1 Heat per 6h.
- Heat is used by the next Inferno, Black Hole or Supernova.

**4. Roll Call**: Tool
- For 1h, check-ins fill Spark and Ult 2×.
- Not stackable.

**5. Hype Siren**: Tool
- Pins the coin at the top of Trending with a banner for 15 min.
- Site-wide max 3 pinned (others queue). 1 per coin per hour.

**6. Scout** 🔧: Counter (raids only)
- Forces the enemy to reveal this round's sealed tactic now. They have 3 min, or it's void.
- You may change your own sealed tactic after seeing it.
- Counter: play your tactic late (less time to Scout).

**7. Tax Holiday**: Tool
- 0% trade fee for 10 min. The protocol gives up that fee.
- 1 per coin per 24h.

### Rares (L2+, Holding 3 NEAR for 1h, uses the Rare slot, warn 2 min)

**8. Curse**: Tactic
- Enemy round score ×0.90, unless they played Ward.
- Halves their Rally.

**9. Mirror**: Tactic
- Becomes a copy of the tactic the enemy used last round. Nothing in round 1.

**10. Counterspell**: Counter
- Outside raids: cancels a Rare card that's still in its 2-min warn. That card returns to its owner, but their Rare slot stays spent.
- In a raid (as your tactic): cancels the enemy's tactic this round; you get no tactic yourself.

**11. Last Stand**: Price (defence)
- Only when the price is ≥ 25% below its 24h high.
- For 30 min, each time price drops ≥ 3% within 5 min, the pot buys up to 10% of itself and burns the tokens.
- Fuel: pot. Mood: +25% in Panic, −25% in Euphoria.

**12. Slow Burn**: Price
- For 1h, 1% of the tokens in every trade burn: buyers get 99%; sellers have 1% burned before the sale.
- Fuel: traders. Counts toward the burn cap.

**13. Happy Hour**: Reward
- For 15 min, buyers get +10% bonus tokens from the reward pool.
- Vests 6h; selling early returns it to the pool.
- Cap 0.1% of supply per play.

**14. Diamond Pool**: Position
- Opens a pool for 24h. Holders lock tokens for 1h, 6h or 24h.
- Leaving early costs 20% of the lock: half to the stayers (by lock × time), half burned.
- Stayers also share a reward-pool bonus of 0.05% of supply (fair + luck split).
- Mood: penalty +25% in Panic.

**15. Prophecy**: Position
- The caster picks a target:
  - net buying ≥ 5 / 10 / 20% of real NEAR in 6h;
  - or price ≥ +10 / 20 / 30% in 6h.
- Bets in tokens on **Call** (yes) or **Fade** (no) during the first 2h. Minimum 1 NEAR worth per side total, or it refunds.
- The caster's own buys don't count toward the target.
- Settle: losers lose 30% (20% to winners, 10% burned). Winners also get a reward-pool bonus of 10% of winning bets. The caster gets +10% on their winnings.
- Counter: Squeeze (if Fade is crowded).

**16. Bounty** 🔧: Position (sponsored)
- The sponsor locks tokens on a goal:
  - N new qualified wallets buy ≥ 3 NEAR each in 3h;
  - or X check-ins in 3h;
  - or net buying ≥ X in 3h.
- Met: the bounty is split by contribution. Not met: 90% back to the sponsor, 10% burned.
- 🔧 **No reward-pool match.** A match would let a sponsor pay their own wallets and collect free pool tokens.

**17. Friendly Raid**: Position
- Challenge another L2+ coin. The caster must bet ≥ 3 NEAR worth; the accepter (an eligible holder of the target) must also bet ≥ 3 NEAR worth within 15 min. Otherwise the card returns.
- 4 rounds × 30 min. Round score = 100 + net NEAR bought this round ÷ real NEAR at start × 100, × tactic.
- Each side gets one sealed tactic per round; the first sealer takes the slot.
- Result:
  - Losers get back 70% of their bets; 30% is burned.
  - Winners get their bets back plus a reward-pool bonus of 10% of the losing bets, and a relic.
  - MVP badge for the biggest bettor on the winning side.
- Tie: everyone refunded.
- Counts as the L4 milestone.

**18. Recruit**: Reward
- For 1h, a wallet whose **first ever** buy on this coin is ≥ 3 NEAR gets +5% bonus tokens from the reward pool.
- Vests 6h. Cap 0.1% of supply per play.

**19. Summoning Circle**: Price (group burn)
- 30-min chant. Wallets join by betting tokens.
- If 25+ qualified wallets join: 10% of all joined tokens burn, the rest return, and the first 5 chanters get a card.
- Fewer than 25: full refund.

### Epics (L3+, Holding 5 NEAR for 2h, Ult full, warn 5 min, one big effect at a time)

**20. Inferno**: Price
- The pot spends 30% × (1 + 0.25 × Heat) of itself.
- It buys at a **random block** within a 10-min window after the warn, then burns everything. Uses up all Heat.
- The caster can't sell for 2h.
- Mood: +25% in Calm, −25% in Euphoria.

**21. Black Hole**: Price
- For 1h, holders throw tokens in (min 0.01% of supply). Then all burn.
- The reward pool returns 40% + 5% per Heat of the thrown total (fair + luck split, tickets = amount thrown).
- Top 3 throwers get a Rare.
- Net burn is at least 45%.

**22. Liquidity Rain**: Price + Reward
- The pot spends 20% of itself buying over 30 min.
- The bought tokens (not burned) go to wallets that checked in today, by Conviction, each capped at 1%.

**23. Hard Raid**: Position
- Like Friendly Raid, except:
  - Losers get back 50%. The other 50% is sold in 12 chunks over 1h; that NEAR buys the winner's token; half of it is burned, half goes to the winning bettors.
  - The loser shows "Conquered by $X" for 12h.
- 1 per coin per 24h.

**24. Whale Tax**: Price
- For 2h, wallets holding > 2% of supply pay +1% extra sell fee to the pot (total sell fee ≤ 3%).

**25. Alliance** 🔧: Tool
- Pact with another coin, which must accept within 15 min. Lasts 6h.
- No raids between them.
- Holders of either coin can bet and play tactics in raids that involve the ally (2-coin team).

**26. Squeeze**: Position counter
- Only when an open Prophecy has Fade bets > 1.5 × Call bets.
- The pot spends 15% of itself buying over 15 min. If price rises ≥ 10% in that window, the Prophecy settles early for Call.
- Mood: +25% in Euphoria.

### Mythic (L4, Holding 10 NEAR for 4h, Eclipse only, warn 10 min)

**27. Supernova**: Price
- Heat is set to 3. The pot spends everything the daily cap allows, in 12 chunks over 2h, and burns it all.
- Every holder who checked in today gets a "Witnessed Supernova" badge.

### Creator rules (choose up to 3 at launch, locked forever)

| Rule | Effect |
|---|---|
| **Launch Guard** | max 30 NEAR bought per wallet in the first 10 min |
| **Paper Tax** | +2% when selling tokens bought < 15 min ago, to the pot |
| **Hold the Line** | when price drops ≥ 20% within 1h (coin ≥ 1h old, L2+), a 6h event starts. Sellers pay +2% into a prize. The pot buys dips with up to 20% of itself and burns. Holders from before the trigger who don't sell share the prize plus a reward-pool bonus of 0.25% of supply (fair + luck). Wallets that sold in the drop are excluded. Counts as the L4 milestone if survived |
| **Creator Lock** | the creator can't sell for 24h, then unlocks linearly over 48h |

---

## 9. Raids in detail

| Phase | Who | What |
|---|---|---|
| Challenge | holder of coin A with a Raid card | picks target B (L2+, not graduated, not in a raid, not allied), bets ≥ 3 NEAR |
| Accept (15 min) | any eligible holder of B | bets ≥ 3 NEAR. No accept: the card returns, cooldowns refund |
| Rounds (4 × 30 min) | anyone | buying a coin raises its score; selling lowers it |
| Bets | holders of A or B | lock tokens on their own coin's side. One side per wallet |
| Tactics | holders with tactic cards | **commit** a hidden tactic during the round; **reveal** in the 5 min after the round. No reveal means no tactic and the card is lost. One per side per round; first commit takes the slot |
| Settle | anyone can push it | Friendly / Hard results (cards 17 and 23) |
| Claim | bettors | payouts, relics, badges |

---

## 10. Graduation ✅

1. The curve sells out, and trading pauses for a few blocks.
2. Open things close: bets refund, raids refund, warns cancel (cards back to hand), vesting rewards vest immediately.
3. A pool is created: real NEAR + the pot's leftover (20% of the pot to the creator), plus tokens to match the curve price. Extra tokens are burned.
4. The unreleased reward pool is burned.
5. The coin becomes a plain NEP-141 token. Cards become Hall of Fame. **No Rulecard rule, card or fee applies ever again.**

🔧 **The pool:** a simple built-in constant-product pool with liquidity nobody can withdraw (it can't be pulled), so the
coin keeps trading. Moving to Ref Finance is on the roadmap.

A coin is **dead** after 24h with no trades. Holders can still sell back to the curve at any time.

---

## 11. Red-team fixes, apart from scope

| Red-team flaw | Fix in this spec |
|---|---|
| Cards can't move price if the fee goes to the protocol | Creator Seed + game taxes fill the pot (2.2) |
| Sybil wallets can buy the level rules | Qualified wallets need Holding **and** time held (1h / 3h / 6h); check-ins count only qualified wallets; volume excludes round-trips inside 1h (5) |
| Crowd share needs a loop over all holders (gas) | Keep a running sum: on each balance change, update only that wallet's capped share: `crowd += min(new, cap) − min(old, cap)`. O(1) |
| Rolling 24h volume and check-ins | 24 hourly buckets in a ring buffer; each wallet stores its last check-in hour so it's counted once |
| "All rules hold for X min" | Store `qualified_since`. Every trade or crank re-checks the rules; any failure resets it. Level up when `now − qualified_since ≥ hold` |
| Reward-pool release could break solvency | The release re-prices the curve with the same floor formula used for burns, plus a property test: "sell everything = real NEAR" after any sequence of trades, burns and releases |
| Hidden raid tactics on a public chain | Commit–reveal (section 9); Scout forces an early reveal |
| Randomness | Draws and random-block Inferno use the seed of a block **after** entries close. Good enough for a hackathon; the README says so |
| Gambling look | Language: "positions", "calls", "rewards for risk". Never "everyone can make money". The pitch is "skill decides who wins; nobody can rug" |
| Bounty, Recruit and Happy Hour farming | No pool match on Bounty; Recruit/Happy Hour capped at 0.1% of supply per play and vest 6h |

---

## 12. Known flaws to check next (before simulation)

1. **Whale Tax warning can cause a dump.** Whales see the 5-min warn and sell before it fires, so the card triggers the drop it
   was meant to tax. Option: no warn for Whale Tax, or the tax also applies to sells during the warn.
2. **Pot is still small early.** A 10 NEAR Seed at L2 gives Inferno ~+1%. Price cards only bite at L3+, or if the Seed is bigger.
3. **Tax Holiday costs the protocol revenue** and the pot gains nothing. It may be pointless now. Candidate to replace.
4. **Front-running of Liquidity Rain and Squeeze.** Both buy over a known window. Random chunk timing may be needed.
5. **Prophecy targets are self-fillable by friends** of the caster (other wallets). Only the caster is excluded.
   Bets on the opposite side are the natural counter, so check in the sim whether Fades show up.
6. **Recruit rewards new wallets**, which can be sybils. A 0.1% cap limits the damage; check the farm return in the sim.
7. **Reward pool + Black Hole:** a 55% return at Heat 3 may make Black Hole a farm for Rares (top 3 throwers). Check net cost per Rare.
8. **Mood edges:** someone can push Mood across ±5% on purpose before playing a card. Fine if it costs real buying or selling; check.
9. **27 cards is a lot for new players.** The UI must teach through roles (section 8 tags) and show only playable cards first.
