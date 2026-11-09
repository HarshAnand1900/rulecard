# Rulecard: how the whole thing works (current version)

This is the full picture in one place, in plain words. Each part is marked:

- ✅ **Decided**: you've agreed to it.
- 🟡 **Proposed**: designed but you haven't said yes yet.
- ❓ **Open**: still to decide.

Nothing in v3/v4 is built in the contract yet. The contract today still runs the older version.

---

## Part 1. The big idea in one paragraph

Anyone can launch a memecoin. Every coin comes with its own **deck of cards**. Holders of that coin collect cards and play them to
pump the price, defend against dumps, raid other coins and bet against each other. Cards can only do things that are
**public, rule-bound and always backed by real NEAR**, so nobody can rug through a card. A coin climbs **levels** (L1 → L4) by
meeting several goals at once. When its sale sells out it **graduates**: it becomes a normal coin on a DEX, and the card game for
that coin ends forever.

---

## Part 2. The coin and its price ✅

### 2.1 What the curve is

Each coin has a **curve contract**. It's the only place to buy or sell before graduation. It holds two numbers:

- **x** = NEAR in the curve (starts with 900 "virtual" NEAR so the first price isn't zero)
- **y** = tokens in the curve, not yet sold

**Price = x ÷ y.** Every trade keeps **x × y** the same.

- **Buy:** you put NEAR in (x goes up), you take tokens out (y goes down), so **price goes up**.
- **Sell:** you put tokens in, you take NEAR out, so **price goes down**.

The curve always holds exactly the **real NEAR** buyers paid (minus what sellers took out). If every holder sold,
everyone gets paid. It can't be rugged.

### 2.2 Numbers (pump.fun shape)

| | Value |
|---|---|
| Total supply | 1,000M tokens |
| Sold through the curve | 793M |
| Held back for the DEX pool at graduation | 207M |
| Price at launch | market cap ≈ 840 NEAR |
| At graduation | ≈ 2,550 real NEAR in the curve, market cap ≈ 12,300 NEAR (≈ 15× from launch) |

### 2.3 The only 3 things that move price

| Lever | Example | Price |
|---|---|---|
| NEAR goes **in** | someone buys, the pot buys | ↑ |
| NEAR goes **out** | someone sells | ↓ |
| **Paid-for** tokens are burned | Sacrifice, Black Hole, burned losing bets | ↑ (fewer tokens share the same NEAR) |

Burning tokens **nobody paid for** (e.g. locked at creation) does **nothing** to price, because they were never part of x or y.
Giving such tokens to someone **lowers** price a little for everyone (more tokens share the same NEAR).

### 2.4 Fees ✅ (amount ❓)

Every trade pays **1%**:

| Part | Goes to | Used for |
|---|---|---|
| 0.75% | **Coin pot** (NEAR, one per coin) | price cards: the pot buys tokens and burns them |
| 0.25% | **Protocol** | Rulecard revenue |

**Paper Tax** (optional creator rule): +2% on selling tokens bought less than 15 min ago, goes to the **protocol**.

There is **no Vault** and **no vesting after graduation**. Both were dropped.

❓ Open: raise the fee to ~1.5% so the pot is big enough to matter (see 2.5).

### 2.5 How much the pot can actually move price

The pot is small. By L3 it's typically **25–50 NEAR**, while the curve holds **650 NEAR**.

| Pot spent at L3 (buy, then burn) | Price |
|---|---|
| 10 NEAR | +2% |
| 25 NEAR | +4.5% |
| 50 NEAR | +9% |
| 100 NEAR | +18% |

So pot cards give a real but small push. Big moves have to come from **players** (bets and burns).

---

## Part 3. The player ✅

### 3.1 Holding

Your **Holding** is just how much your tokens are worth, weighted by how long you've held them (Conviction).
**Nothing is locked.** It only decides **what you're allowed to do**:

| To… | Holding at least | Held for |
|---|---|---|
| Claim a pack | 1 NEAR | 1h |
| Play a Common | 1 NEAR | 30 min |
| Play a Rare | 3 NEAR | 1h |
| Play an Epic | 10 NEAR | 2h |
| Play a Mythic | 25 NEAR | 4h |

If you sell below the line, the wait clock restarts.

### 3.2 Bet

A **Bet** is when you **choose** to lock some of your tokens into a position card (raid, Prophecy, Diamond Pool…).
Locked tokens can't be sold until it ends. Winners get them back plus a share of the losers'. Losers get back less, and part is burned.
Most holders never bet.

### 3.3 Conviction (anti-cheat) 🟡

All rewards scale with **Conviction = NEAR at risk × hours held**, capped per wallet.
40 small wallets earn exactly what 1 big wallet earns, so splitting into fake wallets gains nothing.

---

## Part 4. Levels ✅

A coin moves up a level only when **all** rules are met **at the same time** for the hold time.

| | L2 Rising | L3 Hot | L4 Legendary | L5 Graduated |
|---|---|---|---|---|
| Market cap | 1,500 NEAR | 3,000 | 6,000 | sale sells out |
| Real NEAR in curve | 250 | 650 | 1,200 | ~2,550 |
| Wallets with Holding ≥ | 30 (≥3 NEAR) | 80 (≥5) | 200 (≥5) | |
| Held by the crowd (each wallet counts ≤1%) | 20% | 30% | 40% | |
| Volume, last 24h | 500 NEAR | 2,000 | 6,000 | |
| Different wallets checked in, 24h | 15 | 40 | 100 | |
| Net buying, last 1h | ≥ 0 | ≥ 0 | ≥ 0 | |
| Coin age | 30 min | 3h | 12h | |
| Milestone | – | a Rare effect finished | won a raid or survived Hold the Line | |
| Must hold for | 15 min | 30 min | 60 min | |
| **Unlocks** | Rare cards | Epic cards | Mythic cards | normal coin |

Each level-up drops **one free card** to every wallet that qualified before the crossing.

---

## Part 5. Cards

### 5.1 What a card is ✅

- A card is an **NFT** (NEP-171) tied to **one coin**. It works only on that coin.
- Unplayed cards stay in your wallet. You can sell Rare+ on the **Card Market** (5% royalty to the coin's pot).
- Each coin has a **deck**, so only a limited number of each tier can exist (e.g. 150 Rares and 20 Epics per coin over its life).
- When the coin graduates, unplayed cards become **Hall of Fame** collectibles. They no longer do anything.

### 5.2 Getting cards ✅

| Way | How |
|---|---|
| **Pack** | free every 6h if your Holding qualifies. 95% Common, 5% Rare |
| **Level drop** | one card per qualified wallet at L2/L3/L4, better odds at higher levels |
| **Sacrifice** | burn some of your tokens to roll for a card. Bigger burn = better **odds** (not a guaranteed card) |
| **Craft** | 3 cards of one tier → 1 card of the next tier, your choice |
| **Card Market** | buy from other players |
| **Wild** | turn cards from dead/graduated coins into Shards, buy a Wild card, which works on any one coin |

### 5.3 What limits playing ✅

| Limit | Rule |
|---|---|
| **Spark** (coin meter, 0–30) | filled by check-ins and buys; Commons cost 5 |
| **Rare slot** | one Rare per coin every 15 min |
| **Ult meter** (0–100) | an Epic needs it full |
| **Eclipse** | Mythic only 06:00–06:30 and 18:00–18:30 UTC |
| Per wallet | 1 play per 30 min, 1 Epic/Mythic per 24h |
| **Warning** | Rare 2 min, Epic 5 min, Mythic 10 min before it fires, so others can react or counter |

### 5.4 New strategy layer 🟡 (v4)

| Thing | What it is |
|---|---|
| **Heat** (0–3) | Kindle cards raise it. The next price card spends up to 1.75× more pot. Fades 1 per hour |
| **Coin Mood** | Calm / Euphoria (buying fast) / Panic (selling fast). Each card is stronger in some moods |
| **Card roles** | Tool (setup), Price (moves price), Position (bet vs other players), Tactic (raid), Counter (cancel) |

### 5.5 The cards 🟡 (v4 list, 27)

**Commons:** Rally, Ward (raid tactics) · Kindle (+Heat) · Roll Call (meters fill 2×) · Hype Siren (trending) · Scout (see what's coming) · Tax Holiday (0% fee 10 min)

**Rares:** Curse, Mirror (raid tactics) · Counterspell (cancel a card during its warning) · Last Stand (pot buys the dip in a crash) ·
Slow Burn (1% of each trade burns for 1h) · Happy Hour (bonus tokens for buyers) · Diamond Pool (lock; leavers pay stayers) ·
Prophecy (bet market: Call vs Fade) · Bounty (sponsor a goal) · Friendly Raid · Recruit (bonus for new buyers) · Summoning Circle (group burn)

**Epics:** Inferno (big pot buy-and-burn) · Black Hole (holders throw tokens in, all burn) · Liquidity Rain (pot buys, shared with check-ins) ·
Hard Raid · Whale Tax (big holders pay more to sell) · Alliance (pact with another coin) · Squeeze (punishes heavy Fade bets)

**Mythic:** Supernova (pot spends everything allowed over 2h)

Full table with numbers: `research/rules-v4.md`.

### 5.6 Creator rules ✅ (pick up to 3 at launch, can't change later)

Launch Guard (max 30 NEAR per wallet in the first 10 min) · Paper Tax · Hold the Line (a sudden 20% drop starts a 6h defence event) ·
Creator Lock (creator can't sell for 24h, then unlocks over 48h)

---

## Part 6. Positions: how skilled players win from others

These are the only cards where you can **win tokens from other players**. All of them follow one rule:
**the winners are paid by the losers' bets, and part of the losing bets is burned** (so the price also goes up).

### 6.1 Raid (Friendly or Hard) ✅

1. A holder of $MOTH plays a Raid card targeting $ZAP.
2. Any $ZAP holder has 15 min to accept. If nobody does, the card goes back to the challenger's hand.
3. 4 rounds of 30 min. **Score each round = 100 + (net NEAR bought this round ÷ coin's NEAR at the start × 100).**
   It's in %, so a small coin can beat a big one. Selling during the raid hurts your own side.
4. Each side plays one tactic per round (Rally / Curse / Ward / Mirror) to multiply its score.
5. Holders can **bet** tokens on their own side. Betting doesn't change the score, it's only the wager.
6. **Result:**
   - Friendly: losers get back 70%, 30% burned.
   - Hard: losers get back 50%, the other 50% is sold to buy and burn the winner; winners share the bought tokens; the loser shows the winner's banner for 12h.

🟡 Proposed: a minimum bet to start or accept, so a raid always has something at stake.

### 6.2 Prophecy 🟡

A 6h market on a goal, e.g. "net buying ≥ 50 NEAR in 6h". Players bet tokens on **Call** (yes) or **Fade** (no).
Losers lose 30%: 20% to winners, 10% burned. The caster's own buys don't count toward the goal.

### 6.3 Diamond Pool ✅

Holders lock tokens for 1/6/24h. Leaving early costs 20%: half goes to those who stay, half is burned.

### 6.4 Bounty 🟡

A player locks tokens on a goal ("40 new wallets buy ≥3 NEAR in 3h"). If it's met, the bounty is split among those who did it.
If not, the sponsor gets 90% back and 10% is burned.

---

## Part 7. Reward pool 🟡 (proposed last, not decided)

- At creation, **10% of supply (100M tokens)** is locked in the coin's contract. Nobody owns it.
- Only **card and position results** can release it: raid winners, correct Prophecy side, Hold the Line survivors, level-up rewards,
  and **50% back to players who burn** with Black Hole or Sacrifice.
- Releasing tokens **moves value from passive holders to the winner**. Example at L3: releasing 10M tokens gives the winner ~24 NEAR
  of value and lowers everyone else by ~1.3%. The curve lowers its price slightly so it stays fully backed.
- Pairing rewards with burns (burn 2%, get 1% back) keeps the price going **up** overall.
- Guardrails: unlocks by level (L2 30%, L3 60%, L4 100%), max 0.5% of supply released per day, rewards vest 6h, public counter,
  and whatever is left is **burned at graduation**.

| Resource | Made of | Job |
|---|---|---|
| Pot | NEAR from fees | pushes price **up** |
| Reward pool | locked tokens | **pays winners** |
| Bets | players' own tokens | players bet against each other |

❓ Open: should rewards be paid only alongside burns and bets (price stays net up), or also as free rewards like level-ups (passive holders pay)?

---

## Part 8. Anti-cheat rules 🟡

1. Rewards scale with **Conviction**, so fake wallets gain nothing.
2. **You can't collect from something you caused alone.** Your own buys don't count for your Prophecy, and dumpers are excluded from Hold the Line prizes.
3. **Every payout comes from a named source** (pot, reward pool, or opposing bets). Empty source = no payout. No money from nothing.
4. Betting on both sides only loses you the burn.
5. Daily caps: pot spend ≤ 50%, burns ≤ 5% of supply, price change from cards ≤ +20% per hour.

---

## Part 9. Graduation ✅

When the curve's 793M tokens are all sold:

1. Trading pauses for a few blocks.
2. Everything open finishes or refunds (bets returned, raids refunded, warnings cancelled).
3. The **real NEAR (~2,550) + the pot's leftover** go into a DEX pool with up to 207M tokens. 20% of the pot goes to the creator.
   Extra tokens are burned so the price doesn't jump. Nobody owns the pool's liquidity (it can't be pulled).
4. The coin becomes a plain **NEP-141 token**. Unplayed cards become Hall of Fame collectibles. (🟡 Any unreleased reward pool is burned.)
5. **From now on no card, rule or fee from Rulecard applies.** It's a normal coin. ✅

If a coin **dies** (no trades for 24h), holders can still sell back to the curve at any time and get NEAR for their tokens.

---

## Part 10. A coin's life, as a story

**Hour 0 – launch.** Mira launches $MOTH with Launch Guard + Hold the Line + Creator Lock. Market cap 840 NEAR.
Launch Guard caps everyone at 30 NEAR for 10 min, so bots can't grab everything.

**Hour 1.** Ravi buys 10 NEAR and holds. After an hour his Holding unlocks a pack: a Common **Kindle**.
Each buy adds 0.75% to the pot and 0.25% to the protocol.

**Hour 3 – L2.** 30 wallets with ≥3 NEAR, 250 real NEAR, 500 NEAR of volume… all rules hold for 15 min, so **L2**.
Everyone who qualified gets a drop card. Ravi gets a **Rare: Prophecy**. Rares are now playable.

**Hour 5.** Ravi opens a Prophecy: "net buying ≥ 50 NEAR in 6h". He bets 2M tokens on **Call**.
Doubters bet 3M on **Fade**. Players use Hype Siren and Recruit to pull buyers in. The goal is hit:
Fade loses 30%, Ravi's side takes 20% of it, 10% is burned and the price ticks up. A Rare effect has finished,
which is one of the L3 rules.

**Hour 9 – dump.** A whale sells and the price falls 22% in under an hour. **Hold the Line** starts: for 6h sellers pay +2%
into a prize, the pot buys the dip and burns it, and holders who don't sell share the prize.
A holder plays **Last Stand**. The coin survives, which counts as the L4 milestone.

**Hour 14 – L3.** Epics unlock. Three holders each play **Kindle** (Heat 3), then one plays **Inferno**:
the pot spends 1.75× its normal amount at a random moment and burns everything it buys. Price +5–9%.

**Hour 20 – raid.** $MOTH holders cast a **Friendly Raid** on $ZAP. Over 4 rounds both communities buy their own coin.
$MOTH plays Curse in round 2, $ZAP answers with Ward in round 3. $MOTH wins: $ZAP's bettors lose 30% (burned) and
$MOTH completes "won a raid".

**Day 2 – L4.** 200 wallets, 1,200 real NEAR, and the milestone done. **L4**: Mythic unlocks at the next Eclipse.

**Day 3 – graduation.** The last of the 793M tokens sells. Trading pauses, open bets refund, the NEAR + pot leftover go into a
DEX pool, and $MOTH becomes a normal coin. Ravi bought at a 1,500 NEAR market cap and $MOTH now trades around 12,300:
about 8× on paper. From now on it's a normal coin, and whether he sells or holds is up to him.

---

## Part 11. What's still open (decide these, then build)

1. Fee size: 1% or ~1.5%? (decides how strong pot cards are)
2. Reward pool: yes/no, and only with burns/bets or also free rewards?
3. Adopt the v4 card list (27 cards, Heat, Mood)?
4. Minimum bet to start/accept a raid?
5. Rename "stake" everywhere to **Holding** (eligibility) and **Bet** (locked wager)?

After these: run the simulation on v4, then build the contract.
