# Rulecard cards v5: skill + luck + money in balance

This replaces section 8 (Cards) of `docs/game-spec.md`. Everything else in the spec still applies unless this file
says otherwise. Numbers are starting values for the edge-test simulator to tune.

**Goal:** a player who learns the game gets an edge that grows over time, luck keeps every game open, and money
lets you play **bigger** but never gives better **odds**. Most players will still lose money: this is a memecoin game.

---

## 1. The balance rules (apply to every card)

### 1.1 Money buys reach, not odds

| What money (Conviction) gives you | What it never gives you |
|---|---|
| Access to a tier (low, flat thresholds: 1 / 3 / 5 / 10 NEAR) | Better odds in any bet, draw or duel |
| Bigger stakes, paid back **at the same % as everyone** | A bigger % return than a small player making the same call |
| More draw tickets, **up to a cap** that patient small players also reach | Control of a position or a raid side |

Concretely:

- **Linear payouts.** Every payout is proportional to what you staked. Same call, same % result, any bag size.
- **Stake cap per position:** a wallet can stake at most **10% of its side** or **0.5% of supply**, whichever is
  larger. A whale can play, but can't *be* a side.
- **Ticket cap:** draw tickets = Conviction (NEAR × hours held), **capped at 100 NEAR-hours per draw**.
  5 NEAR held for 20h reaches the same cap as 500 NEAR held for 12 min. Time substitutes for money.
- **No speed edge:** sealed choices, batch execution and random-block timing mean bots gain nothing by being first.
- **No sybil edge:** wallets count only after holding for a while; rewards are linear, so splitting gains nothing.
- **No insider edge:** in any bet, **the trades of everyone who bet are excluded** from the result. You can't buy your way to a win.

### 1.2 Where skill shows up

| Skill | Cards that test it |
|---|---|
| Prediction | Call, Duel, raids |
| Timing | Inferno, Last Stand, Stampede, Squeeze, Omen windows |
| Reading and bluffing | sealed tactics, Decoy, Scout |
| Risk sizing | Hedge, stake size, when to cash out |
| Counterplay | Ward, Counterspell, Squeeze, Mirror |
| Coordination | Kindle → Inferno, Stampede, Black Hole, raid tactic votes |
| Resource management | Spark, Ult, Heat, cards in hand, saving the pot |

### 1.3 Where luck shows up

- **Omens** (section 4): random events every 6h that change the board.
- **Lucky draws** in reward payouts (half fair share, half 3 prizes).
- **Card pulls:** packs, drops, Sacrifice odds, foils.
- **Hidden information:** sealed plays you can only guess at.

### 1.4 Skill grows: Mastery

Each account has a **Mastery** rating (Elo-style) that goes up when you win Calls, Duels and raids against
higher-rated players and down when you lose.

| Mastery | Perk (never better odds or payouts) |
|---|---|
| Apprentice | – |
| Adept | +1 card in hand, see your own past calls' accuracy |
| Expert | 1 extra play per day |
| Master | Mastery frame on cards, name on the coin's leaderboard |

### 1.5 Funding (from the simulations)

| Source | Rate | Used by |
|---|---|---|
| Trade fee | 2%: **0.5% protocol**, **1.5% pot** | Push cards |
| Creator Seed | 10–100 NEAR, at launch, to the pot | Push cards |
| Reward pool | 5% of supply, locked; unlocks by level; max 0.5% of supply per day | position bonuses, Harvest, Recruit |
| Idle burn | 0.5%/day of tokens in wallets that **don't check in** | price, small |
| Losing stakes | 30% of a losing stake: 20% to winners, 10% burned | positions |

The pot daily cap goes up from 50% to **75%**: the pot now saves up for big plays instead of slicing itself thin.

---

## 2. Card types

| Type | Icon | Job |
|---|---|---|
| **Tool** | wrench | set up, inform, charge meters |
| **Push** | flame | move the price (pot, burns, group buys) |
| **Call** | scales | a position: stake against other players |
| **Tactic** | swords | raid round modifier (sealed) |
| **Counter** | shield | cancel, blunt or punish |

Status column: **kept** (unchanged), **changed** (reworked), **new**.

---

## 3. The 28 cards

Play limits from the spec still apply (Rare slot, Ult, Eclipse, per-wallet limits, warn times).
Holding to play: Common 1 NEAR / 30 min · Rare 3 NEAR / 1h · Epic 5 NEAR / 2h · Mythic 10 NEAR / 4h.

### Commons (L1+, cost 5 Spark)

| # | Card | Type | Status | Effect | Skill · Money · Luck | Counter |
|---|---|---|---|---|---|---|
| 1 | **Rally** | Tactic | kept | Your side's raid round ×1.07 (×1.035 if Cursed) | reading | Curse |
| 2 | **Ward** | Tactic | kept | Blocks a Curse and reflects ×0.93 to the curser | reading | bait it with Rally |
| 3 | **Kindle** | Tool | kept | Coin Heat +1 (max 3, −1/hour). 1 per wallet per 6h | coordination | let it decay |
| 4 | **Roll Call** | Tool | kept | Check-ins fill Spark and Ult 2× for 1h | resource | – |
| 5 | **Hype Siren** | Tool | kept | Pinned on Trending for 15 min | timing | – |
| 6 | **Scout** | Counter | changed | Forces one random sealed enemy play (tactic or Call side) to reveal now. If it's a Decoy, you see that | reading | Decoy |
| 7 | **Decoy** | Tool | **new** | Seal a fake play. It looks identical to a real sealed card until revealed. Adds 0 weight | bluffing | Scout |
| 8 | **Hedge** | Counter | **new** | Attach to one of your open stakes: if it loses you lose 15% instead of 30%; if it wins you get 25% less | risk sizing | – |

Removed: Tax Holiday (cost the protocol, gave nothing back), Echo, Rebrand (now a cosmetic skin).

### Rares (L2+, Rare slot, warn 2 min)

| # | Card | Type | Status | Effect | Skill · Money · Luck | Counter |
|---|---|---|---|---|---|---|
| 9 | **Curse** | Tactic | kept | Enemy round ×0.90 unless Ward; halves their Rally | reading | Ward |
| 10 | **Mirror** | Tactic | kept | Copies the enemy's tactic from last round | reading | change tactic |
| 11 | **Counterspell** | Counter | kept | Cancels a Rare still in its warn (card returns, slot stays spent). As a raid tactic: cancels the enemy tactic | timing | Decoy, play late |
| 12 | **Last Stand** | Push | kept | Only if price ≥ 25% below its 24h high: for 30 min the pot buys each ≥ 3% dip (up to 10% of pot per dip) and burns | timing | – |
| 13 | **Slow Burn** | Push | kept | 1h: 1% of the tokens in every trade burn | timing | trade later |
| 14 | **Call** | Call | changed (was Prophecy) | Opens a 6h prediction on this coin from a menu (net buying ≥ X, price ≥ Y%, new qualified wallets ≥ Z). Stakes on **Yes / No** are **sealed** for the first 2h, then locked. Settles: losers −30% (20% to winners, 10% burned), winners +20% reward-pool bonus (half fair, half draws). **All bettors' trades are excluded from the result.** Caster +10% on winnings | prediction | Squeeze, Scout |
| 15 | **Duel** | Call | **new** | Challenge one holder of the same coin. Both stake the **same amount** (max 50 NEAR worth) and seal a pick: will *other wallets'* net buying in the next hour be up or down? Same pick → refund. Winner takes 90% of the loser's stake, 10% burned | prediction | decline |
| 16 | **Diamond Pool** | Call | kept | 24h pool: lock for 1/6/24h. Leaving early costs 20% (half to stayers, half burned). Stayers share a small pool bonus | patience | – |
| 17 | **Bounty** | Call | kept | Sponsor locks tokens on a goal; met → split by contribution, else 90% back, 10% burned. No pool match | coordination | – |
| 18 | **Friendly Raid** | Call | changed | As before, plus: min stake 3 NEAR to cast and accept; stake cap per wallet (1.1); raid tactics are chosen by a **sealed vote**: each holder commits a tactic, weighted by capped tickets, and the most-backed tactic is played (no speed race) | prediction, coordination | Alliance |
| 19 | **Recruit** | Push | kept | 1h: a wallet's first buy ≥ 3 NEAR gets +5% bonus tokens from the reward pool, vesting 6h. Cap 0.1% of supply per play | timing | – |
| 20 | **Stampede** | Push | **new** | Opens a 10-min window. Holders commit NEAR; at a random block after it closes, **all of it buys as one batch at one average price**. If 10+ wallets join, the pot adds a 20% match that is bought and burned. Max 20 NEAR per wallet | coordination, timing | sell into it |

### Epics (L3+, Ult full, warn 5 min, one big effect at a time)

| # | Card | Type | Status | Effect | Skill · Money · Luck | Counter |
|---|---|---|---|---|---|---|
| 21 | **Inferno** | Push | changed | Playable only when the pot ≥ 5% of the curve's real NEAR. Spends 60% × (1 + 0.25·Heat) of the pot (max the pot) at a **random block** in a 10-min window, all burned | timing, coordination | sell into it (hard) |
| 22 | **Black Hole** | Push | kept | 1h: holders throw tokens in, then all burn. Reward pool returns 40% + 5% per Heat (half fair, half draws). Top 3 throwers get a Rare | coordination, luck | – |
| 23 | **Harvest** | Push | changed (was Liquidity Rain) | Reward pool pays 0.25% of supply to everyone who checked in today: half by capped tickets, half as 3 lucky draws | luck | – |
| 24 | **Hard Raid** | Call | changed | Like Friendly Raid; losers keep 50%, the other 50% buys and burns the winner; the loser shows the winner's banner 12h | prediction, coordination | Alliance |
| 25 | **Whale Tax** | Counter | changed | **No warn.** 2h: wallets > 2% of supply pay +1% on sells, to the pot | timing | – |
| 26 | **Alliance** | Tool | kept | 6h pact with a coin that accepts: no raids between them; holders of either can stake and vote tactics in raids involving the ally | coordination | – |
| 27 | **Squeeze** | Counter | changed | Only when an open Call has No-stakes > 1.5× Yes-stakes. Opens a Stampede where the pot matches 50% instead of 20%; if price rises ≥ 10% within 15 min, the Call settles early as Yes | timing, counterplay | stay out of crowded No |

### Mythic (L4, Eclipse only, warn 10 min)

| # | Card | Type | Status | Effect | Skill · Money · Luck | Counter |
|---|---|---|---|---|---|---|
| 28 | **Supernova** | Push | changed | Heat set to 3; the pot spends everything the daily cap allows, in 12 random chunks over 2h, all burned. Everyone who checked in today gets a badge | timing | – |

Removed from v4: Tax Holiday, Happy Hour (Recruit covers it), Summoning Circle (Black Hole and Stampede cover group plays).

---

## 4. Omens (the luck layer)

Every 6h, each L2+ coin rolls one Omen from a **future block's random seed**. It's announced 15 min before it starts, so
skilled players can prepare. It lasts 1h unless noted.

| Omen | Chance | Effect |
|---|---|---|
| Calm Skies | 30% | nothing happens |
| Full Moon | 10% | Heat +1 |
| Windfall | 10% | the next Push card's pot spend ×1.25 |
| Fog | 10% | all new Call stakes stay sealed until settlement |
| Drought | 10% | Spark and Ult fill at half speed |
| Gold Rush | 8% | the next pack anyone opens on this coin is Rare or better |
| Blood Moon | 8% | the next raid's losing side loses 10% more (and the winners get it) |
| Tailwind | 8% | Duels and Calls pay winners +10% from the reward pool |
| Eclipse Shard | 6% | a Mythic window opens on this coin for 30 min (L4 only, else Windfall) |

---

## 5. How each layer balances

| Layer | Weight | Kept in check by |
|---|---|---|
| **Skill** | decides who wins Calls, Duels, raids, timing plays | luck (draws, Omens, hidden plays) so newcomers still win sometimes |
| **Money** | decides *how much* you can stake and how fast you unlock | linear payouts, stake cap per side, ticket cap, flat thresholds |
| **Luck** | decides single outcomes: draws, Omens, pulls | skill wins over many games (Mastery tracks it) |

Target, to be checked by the edge-test simulator:

- A skilled player beats a casual one in **~55–60% of single games** and clearly over 20 games.
- A whale's **% return** is the same as a small player's for the same decisions.
- Bots, sybils and creators gain ≈ 0 extra edge.
- Most coins still die; most players still lose. The edge is the only reliable way to beat that.
