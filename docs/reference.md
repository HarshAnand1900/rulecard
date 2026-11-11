# Rulecard full reference (v5)

Everything in the current design, in one place: every card and every mechanism.
It merges `game-spec.md` (v4.1), `cards-v5.md` and the decisions since. Where they disagree, **this file wins**.

> **Build plan:** [`build-plan.md`](build-plan.md) lists what the hackathon demo builds and the track requirements.

> **Proposed v6:** [`v6-redesign.md`](v6-redesign.md) redesigns Parts B–F (one meter, one card lifecycle, Vault, new Epics). Not approved yet; until then this file is current.

Markers: ✅ you decided · 🟡 proposed and simulated, not confirmed · ❓ open
Nothing here is built in the contract yet. Card art: **Joker deck only** (no copyrighted memes anywhere).

---

## Part A. The coin

### A1. Supply 🟡

| Part | Tokens | Purpose |
|---|---|---|
| Curve | ~760M | sold to buyers before graduation |
| DEX pool | ~190M | paired with the real NEAR at graduation so the price doesn't jump |
| Reward pool | 50M (5%) | locked; released only as rewards for risk; leftover burned at graduation |
| **Total** | **1,000M, fixed** | nothing can ever be minted; burns only reduce it |

### A2. Price ✅

- Before graduation the coin trades only on its **curve**. Price = NEAR in the curve ÷ tokens in the curve.
- Buying pushes the price up, selling pushes it down. The curve always holds the **real NEAR** buyers paid, so every holder can always sell back.
- Only three things move price: NEAR in (buys, pot buys), NEAR out (sells), and burning **paid-for** tokens.
- Burning tokens nobody paid for does nothing. Releasing reward-pool tokens lowers the price slightly for everyone (the curve re-prices so it stays fully backed).

### A3. Money flows 🟡

| Flow | Rate | Goes to |
|---|---|---|
| Trade fee (every buy and sell) | **2%** | **0.3% protocol**, **0.2% creator escrow**, **1.5% coin pot** |
| Creator escrow | 0.2% of all volume | paid to the creator **only at graduation**; if the coin dies it goes into the final buy and burn |
| Creator Seed | 5–100 NEAR at launch (min 5, suggested 20) | pot |
| War Chest buys | players' NEAR, max 20 per wallet per chest | curve (tokens locked 24h for the buyers) |
| Raid spoils | 15% (Friendly) / 30% (Hard) of the losing coin's pot | winner's curve, bought and burned at once |
| Paper Tax (creator rule) | +2% on selling tokens bought < 15 min ago | pot |
| Whale Tax (card) | +1% on sells by wallets > 2% of supply, 2h | pot |
| Hold the Line sell fee | +2% during the event | event prize |
| Card Market royalty | 5% of each sale | pot |
| Idle burn | 0.5%/day of tokens in wallets with no check-in in the last 24h | burned |
| Losing stakes | 35% of the stake: 20% to winners, 15% burned | winners / burned |
| Dead coin's pot | whatever is left when a coin dies (24h no trades) | one last buy and burn, so holders exit higher |

**Pot** = NEAR for Push cards (buy then burn). Daily cap: **75% of the pot per 24h**.
**Reward pool** = locked tokens for bonuses. Usable share by level: L1 0% · L2 30% · L3 60% · L4 100%. Max release **0.5% of supply per day**. Rewards vest 6h.

**Rule of thumb:** a push moves the price by about *(NEAR spent ÷ real NEAR in the curve)*. The pot alone is only 5–12% of the curve, so a pot-only push gives ~5–15%. The three boosts below add NEAR from players, rival coins and the creator.

### A3b. Boosting pushes 🟡

**1. War Chest (players chip in)**
1. Opened by the **War Chest** card (was Stampede), and automatically during the warn of **Inferno** and **Supernova**. The window lasts 10 min.
2. Qualified holders (Holding ≥ 2 NEAR, held ≥ 1h) commit NEAR, **max 20 per wallet**. Commits are sealed until the window closes.
3. At a **random block** after the window, all of it buys as **one batch at one average price**. No one gets a better price by being first.
4. The bought tokens go to the chippers but are **locked 24h**. They can't be sold into the pump they created.
5. If 10+ wallets joined: the card's pot spend fires in the same block (bought and burned), and chippers get a **+5% token bonus** from the reward pool, paid when the lock ends.
6. Fewer than 10 wallets: the buy still happens, with no pot match and no bonus.

It's an ordinary buy, not a donation. Chippers carry the risk of the 24h lock; their reward is the pot match on top, the bonus and the price at the moment of the push. Whales are capped at 20 NEAR each, so a chest needs a crowd.

**2. Raid spoils.** The winning coin takes **15% (Friendly) or 30% (Hard)** of the losing coin's pot, and it's bought and burned on the winner straight away. The loser's curve NEAR is never touched, so both coins stay fully backed.

**3. Creator Seed.** See A3c.

**Estimated push size** (sizing A; one Inferno with a War Chest of 5 NEAR average per wallet, plus spoils from one won raid):

| Level | Real NEAR | Pot (normal market) | Pot-only push | + chest + spoils |
|---|---|---|---|---|
| L2 | 625 | ~53 (incl. 20 seed) | +7% | **+16%** (15 wallets, 75 NEAR) |
| L3 | 1,461 | ~83 | +5% | **+18%** (30 wallets, 150 NEAR) |
| L4 | 2,382 | ~274 | +12% | **+31%** (50 wallets, 250 NEAR) |

Bigger chests scale this up. The part from the chest lasts only as long as the chippers hold after the lock ends. The pot and spoils part is permanent (burned).

### A3c. Launching a coin: what the creator pays 🟡

| Item | Amount | Where it goes |
|---|---|---|
| Creator Seed | **min 5 NEAR (~$18)**, suggested 20, max 100 | the coin's own pot |
| Storage deposit | a small NEAR deposit for the coin's on-chain data (estimate ≤ 0.5 NEAR; measured once the contract is built) | NEAR storage |
| First buy | optional, normal curve price + fee | the creator's own tokens |

- The seed is **not a fee to us**. It goes into the coin's pot and is spent pushing the creator's own coin.
- If the coin dies, the leftover pot and the creator escrow do one last buy and burn for holders. The creator gets nothing back, which stops spam launches.
- A bigger seed matters most early: at L2 (625 NEAR in the curve), a 100 NEAR seed alone is about a **+16% push**. By L4 the same seed adds only a few %.

**What the creator earns if the coin graduates** (sizing A, normal market, ~20,000 NEAR of volume to graduate):

| Source | Amount |
|---|---|
| Creator escrow (0.2% of volume) | ~40 NEAR (~$150) |
| 20% of the pot leftover (if ~30% of the pot is left) | ~18 NEAR (~$65) |
| Their own first buy (if they bought 20 NEAR at launch and held) | worth ~270 NEAR (~$1k) at graduation; at risk like anyone's |
| **Total** | **~58 NEAR in earnings + their bag** |
- Badges by seed: ≥ 20 "Backed", ≥ 50 "Well Backed" (shown on Discover).
- Pump.fun is almost free to launch. Our 5 NEAR minimum is the price of a real pot from block one and of fewer junk coins.

### A4. Levels ✅ (sizing A: USD market-cap targets)

All rules at once, continuously, for the hold time. Curve: virtual reserves 1,392 NEAR / 1,073M tokens (the old curve × 1.547).

| Rule | L2 Rising | L3 Hot | L4 Legendary |
|---|---|---|---|
| Market cap (NEAR) | 2,725 (~$10k) | 5,450 (~$20k) | 9,537 (~$35k) |
| Real NEAR in curve | 625 (~$2.3k) | 1,461 (~$5.4k) | 2,382 (~$8.7k) |
| Qualified wallets | 25 (Holding ≥ 2 NEAR, held ≥ 1h) | 60 (≥ 3, ≥ 3h) | 120 (≥ 3, ≥ 6h) |
| Crowd share (each wallet counts ≤ 1% of supply) | 20% | 30% | 40% |
| Volume 24h (round trips inside 1h ignored) | 900 | 3,600 | 9,500 |
| Check-ins 24h (distinct qualified wallets) | 15 | 40 | 100 |
| Net buying last 1h | ≥ 0 | ≥ 0 | ≥ 0 |
| Coin age | 30 min | 3h | 12h |
| Milestone | – | a Rare effect finished | won a raid or survived Hold the Line |
| Hold time | 15 min | 30 min | 60 min |
| **Unlocks** | Rare cards, 30% of reward pool | Epic cards, 60% | Mythic, 100%, +1 Mythic in deck |

**Graduation (L5):** when the curve sells out: ~3,946 real NEAR (~$14.5k) and ~19,074 NEAR market cap (**~$70k**), at NEAR $3.67. L4 spans $35k → $70k, so the full game (Epics, Mythics, raids) has a long run before it ends. Targets are fixed in NEAR; the USD values move with the NEAR price.

**Level drop:** one card per wallet that qualified *before* the crossing.

| Drop odds | Common | Rare | Epic | Mythic |
|---|---|---|---|---|
| L2 | 75% | 25% | – | – |
| L3 | 65% | 30% | 5% | – |
| L4 | 78% | 18% | 3% | 1% |

### A5. Graduation ✅

1. The curve sells out, and trading pauses for a few blocks.
2. Open things close:
   - **open raids, Calls and Duels settle early on the result so far** (raid: rounds played plus the current round's score up to that block; Call/Duel: the metric up to that block). Ties refund. This stops a losing side from pushing a coin to graduation just to cancel its loss;
   - other stakes (Diamond Pool, Bounty) refund;
   - warns cancel (cards go back to hand);
   - vesting rewards vest immediately;
   - War Chest locks end immediately, and the +5% bonus is paid.
3. The creator escrow and 20% of the pot leftover are paid to the creator. A pool is created from the real NEAR, the rest of the pot and the matching tokens. Extra tokens are burned. Nobody can pull the liquidity.
4. The unreleased reward pool is burned.
5. The coin becomes a plain NEP-141 token. Cards become Hall of Fame collectibles. **No Rulecard rule, card or fee applies ever again.**

A coin with no trades for 24h is **dead**: holders can still sell back to the curve, and its cards can be salvaged.

---

## Part B. The player

### B1. Holding ✅

`Holding = max(NEAR put in − NEAR taken out, current value of your tokens)`. Nothing is locked. The "held for" clock resets if you drop below a threshold.

| Action | Holding ≥ | Held for |
|---|---|---|
| Check in ("gm") | 1 NEAR | 1h |
| Claim a pack | 1 NEAR | 1h |
| Play a Common | 1 NEAR | 30 min |
| Play a Rare | 3 NEAR | 1h |
| Play an Epic | 5 NEAR | 2h |
| Play a Mythic | 10 NEAR | 4h |
| Sacrifice | 3 NEAR | 1h |

### B2. Conviction and tickets 🟡

- **Conviction** = NEAR at risk × hours held, per coin. Selling X% of your tokens removes X% of it.
- **Draw tickets** = Conviction, **capped at 100 NEAR-hours per draw**. 5 NEAR for 20h equals 500 NEAR for 12 min.

### B3. Stake 🟡

Tokens you choose to lock in a Call-type card (Call, Duel, raid, Diamond Pool, Bounty, War Chest commits). They can be won or lost.
**Cap per wallet per position:** the larger of 10% of your side or 0.5% of supply.

### B4. Rewards: half fair, half luck 🟡

Every reward-pool payout: **50% pro rata** by tickets or stake, **50% as 3 lucky draws** (60% / 25% / 15%).
The draws use a random seed from a block **after** entries close.

### B5. Mastery 🟡 (skill rating, per account)

Goes up when you win Calls, Duels and raids (more against higher-rated players), down when you lose.

| Mastery | Perk (never better odds or payouts) |
|---|---|
| Apprentice | – |
| Adept | +1 card in hand; your call history and accuracy |
| Expert | +1 play per day |
| Master | Mastery card frame, leaderboard name |

### B6. Balance rules 🟡

1. **Money buys reach, not odds:** payouts are proportional to your stake; stake and ticket caps; low, flat thresholds.
2. **No speed edge:** sealed choices, batch buys, random-block timing.
3. **No sybil edge:** wallets count only after holding for a while; rewards are linear, so splitting gains nothing.
4. **No insider edge:** in any bet, **all bettors' trades are excluded** from the result.
5. **No reward for a condition you caused alone;** every payout names its source; an empty source means no payout.

---

## Part C. Coin meters and timers

| Meter | Range | Fills from | Spent by |
|---|---|---|---|
| **Spark** | 0–30 | +1 per check-in, +1 per 5 NEAR bought | Commons, 5 each |
| **Ult** | 0–100 | +2 per check-in, +1 per 2 NEAR bought | an Epic needs 100 and empties it |
| **Heat** | 0–3 | Kindle +1, Full Moon Omen +1 | used up by Inferno, Black Hole, Supernova; −1 per hour |
| **Rare slot** | ready / cooldown | – | one Rare per coin every 15 min |
| **Eclipse** | open / closed | 30 min at 00:00, 06:00, 12:00, 18:00 UTC (+ Eclipse Shard Omen) | Mythic plays |
| **Mood** | Calm / Euphoria / Panic | last hour's net buying ÷ real NEAR, every 15 min (Euphoria > +5%, Panic < −5%) | – |
| **Pot** | NEAR | fee share, Seed, taxes, royalties | Push cards (75%/day cap) |
| **Reward pool** | tokens | – | bonuses (0.5% of supply/day) |
| **Omen** | one active | 1h Omen + 2h break, every 3h at L2+ | – |

### C1. Mood effects

| Mood | +25% | −25% |
|---|---|---|
| Calm | Inferno, Call bonus, Diamond Pool bonus | – |
| Euphoria | attacker's raid score, Squeeze, War Chest match | Inferno, Last Stand |
| Panic | Last Stand, Hold the Line prize, Diamond Pool exit penalty | both raid scores |

### C2. Play limits

| Limit | Value |
|---|---|
| Per wallet | 1 play per 30 min (Expert +1/day); 1 Epic or Mythic per 24h |
| Creator | can't play in the coin's first hour |
| Big effects | one Epic or Mythic effect active per coin |
| Warn | Common 0 · Rare 2 min · Epic 5 min · Mythic 10 min (Whale Tax: none) |
| Daily caps per coin | pot spend ≤ 75% · burns ≤ 5% of supply · price lift from pot and reward-pool spends ≤ +20%/h (War Chest buys are players' own buys and don't count) · reward release ≤ 0.5% of supply |
| Positions | ≤ 3 open per coin; 1 per wallet as caster |
| Hard Raid, Squeeze | 1 each per coin per 24h |

If a cap is hit, the effect shrinks to fit and the UI says "capped".

---

## Part D. Getting cards

| Source | Rule |
|---|---|
| **Pack** | every 12h after a check-in: 95% Common / 5% Rare. Blocked while you hold 3 unplayed Commons. Hand limit 7 Commons (8 at Adept) |
| **Level drop** | see A4 |
| **Sacrifice** | burn tokens, roll for a card (odds below). Pick 1 of 2 types. Guaranteed Rare+ after 5 misses. 1 per hour |
| **Card Market** | Rare and above; 5% royalty to the pot |
| **Events** | Black Hole top 3 → Rare; Gold Rush Omen → Rare+ pack |
| **Wild** | salvage cards from dead or graduated coins into Shards (C 1 / R 4 / E 12 / M 30). Wild Common = 3 Shards, Wild Rare = 10. Bonds to a coin on first play. 1 Wild play per coin per 6h |

**Sacrifice odds** (blend between rows):

| Burn (% of supply) | Common | Rare | Epic | Mythic |
|---|---|---|---|---|
| 0.05% | 90 | 9 | 1 | 0 |
| 0.2% | 60 | 35 | 5 | 0 |
| 1% | 30 | 45 | 22 | 3 |
| 3% | 10 | 40 | 40 | 10 |

**Deck per coin:**

| Tier | Unplayed at once (L1 / L2 / L3 / L4) | Total ever | Max per wallet | Deck earns |
|---|---|---|---|---|
| Common | limited by packs and hand | unlimited | 7 in hand | – |
| Rare | 4 / 8 / 20 / 40 | 150 | 3 | 1 per 50 NEAR volume or 10 check-ins, max 30/day |
| Epic | 1 / 1 / 3 / 6 | 20 | 3 | 1 per Ult fill, max 4/day |
| Mythic | 0 / 0 / 0 / 2 | 4 | 1 | 1 on reaching L4, then 1 per Eclipse at L4 |

Out of stock → the drop becomes the next tier down.

**Card NFT:** NEP-171. It carries the tier, type, coin, serial ("#3 of 20"), finish (halftone / terminal / neon glass / starry; 5% foil) and the coin's own image as a small seal inside the Joker frame. It only works on its coin (except Wild). After graduation it becomes a Hall of Fame collectible.

---

## Part E. The 28 cards

Types:
- **Tool:** sets things up.
- **Push:** moves the price.
- **Call:** stake against other players.
- **Tactic:** raid round modifier.
- **Counter:** cancels or punishes.

Each card lists: **Lv** = level needed · **Cost** · **Funds** = where NEAR or tokens come from · **Skill** = what it tests · **Counter**.

### Commons (L1+, Holding 1 NEAR for 30 min, cost 5 Spark, no warn)

**1. Rally**: Tactic
- Effect: your side's raid round score ×1.07; ×1.035 if the enemy Curses that round.
- Raid tactics are chosen by a sealed vote (see F1).
- Skill: reading. Counter: Curse.

**2. Ward**: Tactic
- Effect: blocks an enemy Curse this round and reflects ×0.93 onto the curser. Does nothing if there's no Curse.
- Skill: reading. Counter: bait it with Rally.

**3. Kindle**: Tool
- Effect: coin Heat +1 (max 3; −1 per hour). A wallet can add 1 Heat per 6h.
- Skill: coordination and timing. Counter: wait for it to decay.

**4. Roll Call**: Tool
- Effect: for 1h, check-ins fill Spark and Ult 2×. Doesn't stack.
- Skill: resource planning.

**5. Hype Siren**: Tool
- Effect: pinned at the top of Trending for 15 min. Max 3 pinned site-wide (others queue); 1 per coin per hour.
- Skill: timing.

**6. Scout**: Counter
- Effect: forces one random sealed enemy play (raid tactic vote or Call side) to reveal now. A Decoy shows as a Decoy.
- Skill: reading. Counter: Decoy.

**7. Decoy**: Tool
- Effect: seal a fake play. It looks identical to a real sealed play until revealed, and counts for nothing.
- Skill: bluffing. Counter: Scout.

**8. Hedge**: Counter
- Effect: attach to one of your open stakes. If it loses, you lose half the normal loss (17.5% instead of 35%); if it wins, you get 25% less.
- Skill: risk sizing.

### Rares (L2+, Holding 3 NEAR for 1h, Rare slot, warn 2 min)

**9. Curse**: Tactic
- Effect: enemy round ×0.90 unless they Ward; halves their Rally.
- Skill: reading. Counter: Ward.

**10. Mirror**: Tactic
- Effect: copies the tactic the enemy used last round (nothing in round 1).
- Skill: reading patterns. Counter: switch tactics.

**11. Counterspell**: Counter
- Effect: cancels a Rare still in its warn. The card returns to its owner, but their Rare slot stays spent. As a raid tactic, it cancels the enemy tactic that round (you get none).
- Skill: timing. Counter: Decoy, or play late.

**12. Last Stand**: Push
- Effect: only when price is ≥ 25% below its 24h high. For 30 min, each ≥ 3% drop within 5 min triggers a pot buy (up to 10% of the pot each), all burned.
- Funds: pot. Mood: Panic +25%, Euphoria −25%. Skill: timing.

**13. Slow Burn**: Push
- Effect: for 1h, 1% of the tokens in every trade burn (buyers get 99%; sellers burn 1% before the sale).
- Funds: traders. Skill: timing.

**14. Call** (was Prophecy): Call
- Effect: opens a 6h prediction from a menu: net buying ≥ X, price ≥ +Y%, or new qualified wallets ≥ Z.
  - **Yes / No** stakes are sealed for the first 2h, then locked.
  - All bettors' trades are excluded from the result.
  - At settlement, losers lose 35% (20% to winners, 15% burned); winners also get a reward-pool bonus of 20% of winning stakes (half fair, half draws); the caster gets +10% on their winnings.
  - Needs ≥ 1 NEAR worth on each side, else it refunds.
- Funds: opposing stakes + reward pool. Mood: Calm +25% bonus. Skill: prediction. Counter: Squeeze, Scout.

**15. Duel**: Call
- Effect: challenge one holder of the same coin. Both stake **the same amount** (max 50 NEAR worth) and seal a pick: will **other wallets'** net buying over the next hour be up or down?
  - Same pick: refund.
  - Otherwise the winner takes 90% of the loser's stake; 10% is burned.
  - The opponent can decline.
- Funds: the opponent. Skill: prediction.

**16. Diamond Pool**: Call
- Effect: opens a 24h pool. Holders lock tokens for 1h, 6h or 24h.
  - Leaving early costs 20% of the lock: half to the stayers, half burned.
  - Stayers also share a 0.05% of supply reward-pool bonus.
- Mood: Calm bonus +25%; Panic penalty +25%. Skill: patience.

**17. Bounty**: Call
- Effect: the sponsor locks tokens on a goal (N new qualified wallets buying ≥ 3 NEAR in 3h, X check-ins in 3h, or net buying ≥ X).
  - Met: the bounty is split by contribution.
  - Not met: 90% back to the sponsor, 10% burned.
  - No reward-pool match.
- Skill: coordination.

**18. Friendly Raid**: Call (see F1)
- Effect: challenge another L2+ coin. Min 3 NEAR stake to cast and to accept. 4 rounds of 30 min.
  - Losers keep 70%; 30% is burned.
  - Winners get their stake back plus a reward-pool bonus of 10% of the losing stakes, and a relic.
  - **Spoils:** 15% of the losing coin's pot is bought and burned on the winner.
  - The MVP is the biggest staker on the winning side (badge only).
  - Counts as the L4 milestone.
- Skill: prediction, coordination. Counter: Alliance.

**19. Recruit**: Push
- Effect: for 1h, a wallet whose **first** buy on this coin is ≥ 3 NEAR gets +5% bonus tokens from the reward pool, vesting 6h. Cap 0.1% of supply per play.
- Skill: timing.

**20. War Chest** (was Stampede): Push
- Effect: opens a War Chest (see A3b). If 10+ wallets joined, the pot adds a match of 30% of the chest (within the daily cap), bought and burned; chippers' tokens lock 24h and earn +5% from the reward pool.
- Funds: participants + pot. Mood: Euphoria +25% match. Skill: coordination. Counter: sell into it.

### Epics (L3+, Holding 5 NEAR for 2h, Ult full, warn 5 min, one big effect at a time)

**21. Inferno**: Push
- Effect: playable only when the pot holds ≥ 5% of the curve's real NEAR. Its warn is a 10-min War Chest window (instead of the usual 5 min). At a **random block** after the window, the chest buys and the pot spends 60% × (1 + 0.25 × Heat) of itself (never more than the pot or the daily cap) in the same block, all burned. Uses up all Heat. The caster can't sell for 2h.
- Funds: pot. Mood: Calm +25%, Euphoria −25%. Skill: timing, coordination.

**22. Black Hole**: Push
- Effect: for 1h holders throw tokens in, then everything burns.
  - The reward pool returns 40% + 5% per Heat of the total thrown (half fair, half draws; tickets = amount thrown).
  - Top 3 throwers get a Rare.
- Funds: participants. Skill: coordination; luck.

**23. Harvest** (was Liquidity Rain): Push
- Effect: the reward pool pays 0.25% of supply to everyone who checked in today: half by capped tickets, half as 3 lucky draws.
- Funds: reward pool. Skill: showing up; luck.

**24. Hard Raid**: Call
- Effect: like Friendly Raid, except:
  - losers keep 50%; the other 50% is sold in 12 chunks over 1h, and the NEAR buys the winner's token (half burned, half to winning stakers);
  - **spoils are 30%** of the losing coin's pot instead of 15%;
  - the loser shows "Conquered by $X" for 12h.
- 1 per coin per 24h. Counter: Alliance.

**25. Whale Tax**: Counter
- Effect: **no warn**. For 2h, wallets holding > 2% of supply pay +1% on sells (total sell fee ≤ 3%), to the pot.
- Skill: timing.

**26. Alliance**: Tool
- Effect: a 6h pact with a coin that accepts within 15 min. No raids between them. Holders of either coin can stake and vote tactics in raids involving the ally.
- Skill: coordination.

**27. Squeeze**: Counter
- Effect: only when an open Call has No stakes > 1.5× Yes stakes. Opens a War Chest where the pot matches 50% instead of 30%. If the price rises ≥ 10% within 15 min, the Call settles early as Yes.
- 1 per coin per 24h. Mood: Euphoria +25%. Skill: timing, counterplay.

### Mythic (L4, Holding 10 NEAR for 4h, Eclipse only, warn 10 min)

**28. Supernova**: Push
- Effect: Heat is set to 3. The pot spends everything the daily cap allows, in 12 random-timed chunks over 2h, all burned. Everyone who checked in today gets a badge.
- Funds: pot. Skill: timing.

**Removed:** Tax Holiday, Happy Hour, Summoning Circle, Echo, Rebrand (Rebrand is now a cosmetic skin).

### Creator rules (pick up to 3 at launch, locked forever)

| Rule | Effect |
|---|---|
| **Launch Guard** | max 30 NEAR per wallet in the first 10 min |
| **Paper Tax** | +2% on selling tokens bought < 15 min ago, to the pot |
| **Hold the Line** | if price drops ≥ 20% within 1h (coin ≥ 1h old, L2+), a 6h event starts. Sellers pay +2% into a prize; the pot buys dips with up to 20% of itself and burns; holders from before the drop who don't sell share the prize plus 0.25% of supply from the reward pool (half fair, half draws); wallets that sold in the drop are excluded. Survived = L4 milestone |
| **Creator Lock** | creator can't sell for 24h, then unlocks linearly over 48h |

---

## Part F. Systems in detail

### F1. Raids

| Phase | Who | What |
|---|---|---|
| Challenge | holder of coin A with a Raid card | picks target B (L2+, not graduated, not in a raid, not allied); stakes ≥ 3 NEAR |
| Accept (15 min) | any eligible holder of B | stakes ≥ 3 NEAR. No accept: the card returns, cooldowns refund |
| 4 rounds × 30 min | anyone | round score = 100 + (net NEAR bought this round ÷ real NEAR at start × 100), × the tactic. Buying raises your side's score; selling lowers it |
| Stakes | holders of A or B | lock tokens on their own coin's side; one side per wallet; capped |
| **Tactic vote** | holders with tactic cards | during the round, each **commits** a sealed tactic (or a Decoy), weighted by capped tickets. In the 5 min after the round everyone reveals; the most-backed real tactic is played. Unrevealed = void (the card is lost) |
| Settle | anyone can push it | Friendly or Hard results |
| Claim | stakers | payouts, relics, badges, Mastery |

Tie: everyone refunded. Alliance lets the ally's holders join one side.

**Near graduation:** no new raid can be started on or by a coin whose curve is ≥ 90% sold. If either coin graduates mid-raid, the raid settles on the score so far (see A5).

### F2. Calls and Duels

| Step | Call | Duel |
|---|---|---|
| Open | caster picks a target from a menu | challenger picks an opponent and stake |
| Stakes | anyone, Yes or No, sealed 2h | equal stakes, sealed pick |
| Result based on | the coin metric, **excluding all bettors' trades** | other wallets' net buying over 1h |
| Losers | −35% (20% to winners, 15% burned) | −100% of stake (90% to winner, 10% burned) |
| Bonus | reward pool 20% of winning stakes (half draws) | – |

### F3. Omens (luck layer)

> **Superseded by section 3b of [`v6-redesign.md`](v6-redesign.md)**, which rebuilds the Omen list on v6 systems only. The list below uses removed v5 systems (Heat, Spark, Ult, Scout, War Chest, Calls).

**3-hour cycle** on every L2+ coin: **1h Omen, then a 2h break**, then the next Omen. That's 8 Omens a day.
- The Omen is rolled from a future block's random seed and **announced 15 min before** it starts (during the break), so players can plan.
- The 2h break has no Omen: it's the time to set up sealed plays, chests and raids for the next one.
- Omens that spend the pot use **at most 5% of the pot each** and count toward the 75% daily cap.

**Wild Omens: the coin plays a card on itself** (42%)

| Omen | Chance | Effect |
|---|---|---|
| Ghost Rally | 10% | at a random block in the hour, the coin spends 5% of its pot, bought and burned |
| Wild Chest | 8% | the coin opens a free War Chest (no card needed); the pot matches 20% if 10+ wallets join |
| Mirror Hour | 8% | the first Push card played this hour fires a second time at half strength (from the pot, within the cap) |
| Trickster | 8% | at the end of the hour, one random sealed play on this coin is forced to reveal (a free Scout) |
| Treasure | 8% | one random wallet that checks in during the hour gets a Common card (two wallets at L3+) |

**Weather Omens: change the rules for the hour** (58%)

| Omen | Chance | Effect |
|---|---|---|
| Full Moon | 10% | Heat +1 |
| Windfall | 8% | next Push card's pot spend ×1.25 |
| Fog | 8% | new Call stakes stay sealed until settlement |
| Gold Rush | 6% | next pack opened on this coin is Rare+ |
| Blood Moon | 6% | next raid's losing side loses 10% more (to the winners) |
| Tailwind | 6% | Duels and Calls settled this hour pay winners +10% from the reward pool |
| Thunder | 6% | sells pay +1% for the hour, to the pot |
| Drought | 4% | Spark and Ult fill at half speed |
| Eclipse Shard | 4% | a Mythic window opens for 30 min (L4 only, else Windfall) |

### F4. Check-in ("gm")

A free tap on the coin page, for holders with ≥ 1 NEAR Holding held 1h. **You can check in once every 8h** (up to 3 a day). Each check-in:
- fills Spark and Ult;
- counts for the Check-ins rule (distinct wallets in 24h);
- gives 1 Harvest ticket (max 3 counted in any 24h);
- if done during an active Omen hour, enters you for that Omen's Treasure roll and gives +1 extra Spark.

Your first check-in of the day unlocks your pack. **Any check-in in the last 24h protects you from the idle burn.**

### F5. Sealed plays (how hiding works on a public chain)

Everything on a blockchain is public. If you stake "Yes" on a Call or vote "Curse" in a raid in the open, others see it and copy or counter it. Sealed plays stop that.

1. **Commit:** the app sends a hash of (your choice + a random secret). Everyone sees *that* you played and how much, not *what*.
2. **Reveal:** when the window closes, the app sends the choice and secret. The contract checks they match the hash.
3. Unrevealed plays are void (the card is lost; staked tokens are returned minus 10%, burned).

**Scout** (Common): pick one coin; one random sealed enemy play on it must reveal within 5 min or it's void. Everyone sees the result. A Decoy shows as "Decoy".
**Decoy** (Common): commits a sealed play that does nothing. It looks the same as a real one, so the other side can't tell how many real plays you have. If Scouted it's exposed, and it wasted their Scout.

### F6. Randomness

Omens, draws, Inferno timing and War Chest timing all use the random seed of a block **after** entries close (`env::random_seed`). Good enough for the hackathon; the README says so.

---

## Part G. Simulation results so far

| Finding | Number |
|---|---|
| Fees by level (1%, normal market) | L2 ~11 · L3 ~31 · L4 ~116 · graduation ~130 NEAR |
| One saved-up pot play at a 1.5% pot share | L2–L3 ~+8% · L4 ~+16% |
| Burning every holder equally | chart +19%, holders ~9 points *poorer*, so rejected |
| Mix (pot + stakes + reward pool + idle burn) | skilled players ~+5 points over casual; passive ≈ unchanged; always solvent |
| Graduation rate (sim) | 6–11% normal, 30–48% hype (pump.fun real world: < 2%) |

---

## Part H. Open decisions

1. ❓ Level and graduation sizes (A4 options a / b / c).
2. 🟡 Confirm the 2% fee split (0.5% protocol / 1.5% pot).
3. 🟡 Confirm the 5% reward pool and the 0.5%/day idle burn.
4. 🟡 Confirm the v5 card list, Omens and Mastery.
5. Next: an edge-test simulator for v5 in a realistic market (most coins die) that checks the balance targets in `cards-v5.md` section 5.
