# Rulecard v6 redesign (proposal)

> **Build scope:** the hackathon demo builds only part of this. See [`build-plan.md`](build-plan.md).

Status: **proposal, not simulated, not built.** It replaces Parts B–F of `reference.md` if you approve it. Part A (curve, fees, levels, $70k graduation, creator escrow) stays as it is.

Why a redesign: v5 had too many separate systems (Spark, Ult, Heat, Rare slot, Eclipse, stakes, sealed votes, chests), and each card had its own timing. v6 keeps the same ideas but runs them on **one clock, one meter, four ways to play a card and three player actions**.

---

## 1. The whole game on one page

**What a coin shows (4 things):**

| Thing | What it is |
|---|---|
| **Energy** (0–100) | the coin's fuel for cards. +1 for every holder check-in, +1 per 10 NEAR of net buying |
| **Pot** | NEAR from fees. Push cards spend it to buy and burn |
| **Mood** | Calm / Euphoria / Panic, worked out automatically from the last hour's buying |
| **Omen clock** | 1h Omen, 2h break, repeat (8 a day). See section 3b |

Gone: Spark, Ult, Heat, Rare slot, Eclipse windows, Kindle.

**What a player can do (3 actions, plus trading):**

| Action | What it means |
|---|---|
| **gm** (check in) | free tap, once every 6h. Gives the coin +1 Energy, moves your pack timer, resets your idle clock |
| **Lock** | put tokens in the coin's **Vault** for 6h, 24h or 72h. You can't sell them. They are safe from idle burn and Storms, and they earn |
| **Bet** | put tokens on one side of a Prophecy, Duel or raid. You get them back if you win; you lose part if you lose. *This is all "stake" ever meant* |

**Where a card's power comes from.** A card creates nothing. It only decides *when* one of these four sources is used:

| Source | Used by |
|---|---|
| Pot NEAR (buy and burn) | Ember, Inferno, Last Stand, Supernova |
| Tokens of holders who didn't respond | Storm, idle burn |
| Bets of the losing side | Prophecy, Duel, raids |
| Reward pool (locked 5%) | bonuses on top of the above |

---

## 2. How cards are played (four ways, by how much the card matters)

The old four steps (propose → back → warn → resolve) for every card are gone. Each card uses **one** of four ways to play. No card waits through a warn unless someone can fight it.

| Way | Cards | What it takes | Then |
|---|---|---|---|
| **Solo** | Counterspell, Hedge, Roll Call, Hype Siren | just play it | fires at once |
| **Backed** | Commons (Ember) and Rares (Prophecy, Recruit, Diamond Rush, Last Stand, Slow Burn) | Commons: the same card from 3 wallets (3 / 6 / 10 tiers). Rares: **2 backers** (L1–L2) or **3 backers** (L3+), any holder, a free tap within 15 min | fires at a random block in the next 2 min |
| **Signed** | Epics (Inferno, Harvest, War, Alliance) and Mythics, plus **raids** | signers in 15 min (table below) | fires at a random block in the next 2 min |
| **Contested** | Storm, Black Hole, Whale Tax, Heist, Supernova | backers or signers as above, then a **15-min contest** where holders chip NEAR to **Fire** or **Stop** | the side with more NEAR wins |

**Signers needed** (picked from `research/signers-sim.cjs`: how many qualified holders actually answer within 15 min)

| | L1 | L2 | L3 | L4 |
|---|---|---|---|---|
| Raid | – | 3 | 5 | 8 |
| Epic | 3 | 3 | 5 | 8 |
| Mythic | – | – | 8 | 10 |

- At L2–L4 these counts are reached in **66–100%** of hours on small coins and **71–100%** on normal coins. The old counts (10 / 20 / 30 / 60) were almost never reached below a big coin's L4.
- At L1 only about 1 signer answers in 15 min, so an Epic drawn at L1 is usually played after the coin reaches L2. Its 24h Fade covers that.
- Signing is a free tap by a qualified holder (≥ 2 NEAR for 1h), one proposal per 30 min.

**The contest (Fire vs Stop)**
- Anyone can chip NEAR on **Fire** or **Stop**: min 0.5, max 20 NEAR per wallet.
- The card starts with a head start on Fire: **10 NEAR** (Rare), **20 NEAR** (Epic), **50 NEAR** (Mythic). Stop wins only if Stop NEAR > Fire NEAR + head start.
- **Every chip buys the coin, whichever side wins.** All chipped NEAR is spent as small buys **spread evenly over the next 1h**. The tokens go to each chipper, locked in the Vault for 6h (so they're also safe from the card).
- The winning side gets +5% bonus tokens from the reward pool, **but only on chips made in the first 10 minutes**. Late chips still buy and still count toward the result; they just earn no bonus. (A bot that waits for the last block picks the winner 92% of the time, `research/redteam-sim.cjs`.)
- The losing side loses nothing; it just bought tokens.
- **Cap:** a contest buys at most **5% of the real NEAR in the curve** (about 31 NEAR at L2, 73 at L3, 119 at L4). The winner is decided on **everything chipped**; only then are chips past the cap refunded pro rata, so one contest can't jump the price.
- So countering a harmful card costs nothing but a buy and a 6h lock, and every fight pushes buying into the coin.

**Helping pays:** each time you back, sign or chip in (≥ 1 NEAR), your **next pack comes sooner**: −10 min for backing or signing, −15 min for chipping or fuelling. At most −1h off any one pack.

**Other rules**
- **No front-running:** tokens bought from the moment a pot card (Ember, Inferno, Supernova, Last Stand) or a contested card is proposed **until its spread buys finish** are **tagged**. Selling tagged tokens before 1h after the spread buys end pays 10% to the pot. The tag follows the tokens if they are sent to another wallet. Contest and fuel buys are already locked, so they're not affected.
- **Counterspell** cancels any Backed or Signed card before it fires (in its backing time or its 2-min fire window). Contested cards are fought with NEAR instead.
- **Personal cards** (Hedge) affect only you and cost no Energy.
- **Table limits per coin:** 1 Epic or Mythic and 2 smaller cards in play at once; at most 3 Epics or Mythics a day; the same Common effect can't be active twice.
- All v5 balance rules stay: bets are capped per wallet, bettors' trades are excluded from results, and every payout names its source.

| Tier | Energy |
|---|---|
| Common | 5 |
| Rare | 20 |
| Epic | 50 |
| Mythic | 100 |

---

## 3. The Vault, idle burn and Storms (one defence system)

**Vault** (on every L2+ coin; it's a feature, not a card)
- Lock any amount for 6h / 24h / 72h. Weight ×1 / ×1.5 / ×2.
- Locked tokens are **safe from idle burn and Storms**.
- The Vault earns half of everything Storms, Black Holes **and idle burn** take, split by weight (the other half is burned). Each wallet counts for at most 0.5% of supply, so a whale can't take it all.
- Leaving early costs 20% (half to the stayers, half burned).
- Nobody has to lock. The choice is: stay liquid and show up, or lock and relax.

**Idle burn**
- Clock: time since your last gm.
- After **12h** with no gm, your unlocked tokens burn **1% every 6h** until you check in. The 12h grace covers a night's sleep.
- A creator can pick the **Ruthless** rule: 2% every 6h.
- **One daily cap:** a wallet's unlocked bag can lose at most **8% a day to everything the coin does to it**: idle burn, Storm, Squall, Black Hole, Plunder and the Draft together. Without one cap, casual players (one gm a day) lost 8.6% a day on average and 12.5% on bad days (`research/redteam-sim.cjs`).
- **Lock prompt:** after every buy the app offers "Lock 24h?" in one tap, so new buyers meet the Vault on day one.

**Storm** (Epic, see section 5) is the same idea as an event: respond during its 15-min contest or lose part of your bag.

---

## 3b. Omens (the luck layer)

**Clock:** on every L2+ coin, a **1h Omen, then a 2h break**, repeating (8 a day). Each Omen is rolled from a future block's random seed and **announced 15 min before** it starts, so players can plan in the break.

**Only current systems:** every Omen below works through something v6 already has (pot, packs, Prophecy, Storm rules, Energy, Vault, raids, contests, idle burn). No Omen adds a new meter or a new kind of card.

**Wild Omens: the coin plays a card on itself (40%)**

| Omen | Chance | Effect | Uses |
|---|---|---|---|
| **Ghost Ember** | 12% | at a random block in the hour, the pot burns **3%** of itself | pot (buy and burn) |
| **Squall** | 10% | a mini Storm: **1%** hit on unlocked bags; Brace and Dodge work as usual; half burned, half to the Vault | Storm rules, Vault |
| **Treasure** | 10% | one random wallet that does a gm this hour gets a **free pack** (two wallets at L3+). Make room first applies | packs |
| **Oracle** | 8% | the coin opens a **Prophecy** itself on a random question with a default line. The caster's 10% goes to the pot. No Draft: if fewer than 8 wallets join, all bets are refunded | Prophecy |

**Weather Omens: the rules change for the hour (60%)**

| Omen | Chance | Effect | Uses |
|---|---|---|---|
| **Full Moon** | 8% | Energy gains ×2 (gm and buying) | Energy |
| **Iron Vault** | 8% | new Vault locks get ×1.25 weight | Vault |
| **Windfall** | 7% | the pot's share of the next pot card (Ember, Inferno, Supernova) ×1.25 | pot cards |
| **Thunder** | 7% | sells pay +1%, to the pot | fees, pot |
| **Gold Rush** | 6% | the next pack claimed rolls Rare or better on its first card, if there's stock | packs, deck stock |
| **Drought** | 6% | idle burn ×2 this hour | idle burn |
| **Low Tide** | 6% | contest head starts are halved (Stop wins more easily) | contests |
| **Blood Moon** | 6% | the next raid this coin is in (within 8h) has **Plunder ×2**. No raid within 8h: nothing happens | raids, Plunder |
| **Fog** | 6% | during a raid round that overlaps this hour, the live base score is hidden until the round ends. No raid: acts as Iron Vault | raids |

**Limits**
- Omens that spend the pot (Ghost Ember, Windfall) use **at most 3% of the pot each** and count toward the 75% daily cap.
- Squall counts toward each wallet's one **8% a day** cap.
- Omen effects never stack with themselves: a second Full Moon while the first is running does nothing extra.
- **Wild Coin** (creator rule): Wild Omens come up **60%** of the time instead of 40%. The chances inside each group keep their proportions.

---

## 3c. Daily Ritual (the coin's shared goal)

Every coin has **one goal per UTC day**, set at 00:00 from yesterday's numbers, and shown as **today's progress** on the coin page.

| Part | Rule |
|---|---|
| Goal | **gm count** + **NEAR newly locked in the Vault**. Gm target = 60% of yesterday's distinct gm wallets (min 10); lock target = 50% of yesterday's new locks (min 10 NEAR) |
| Made it | the pot burns **5%** (counts toward the 75% daily cap) (a pack bonus for that day's gm wallets is roadmap) |
| Missed it | idle burn is **×2 for the next 6h** (still inside the one 8% daily cap) |
| Streak | 3 days in a row: the next day's pot burn is 7% |

- Two daily counters and one check at 00:00 (by whoever calls first), so it's cheap to build.
- It's the track's "onchain rituals and challenges" in one line, and it fills the page's "today's progress" bar.

---

## 4. Raids, start to finish

**Starting one**
1. Any qualified holder of coin A proposes a raid on coin B. **No card and no Energy needed.**
2. It needs A's signers (3 / 5 / 8 at L2 / L3 / L4, section 2). One wallet can't start a raid.
3. B **cannot decline**. B gets a 30-min **Muster** to get ready.
- Limits: B must be the same level or higher; B is shielded for 12h after any raid; A can attack once per 12h; **a coin is in at most 1 raid per 8h** (attacking or defending), so tactic cards can keep up; no raids when either curve is ≥ 90% sold.

**Timeline (about 1h45)**

| Time | What happens |
|---|---|
| 0–15 min | backing |
| 15–45 min | Muster: holders of both coins fill their **raid plan** (3 hidden slots) and may place bets on their own coin (optional) |
| 3 rounds × 20 min | buy and tap **Battle cry**. At the end of the round, **only that round's slot** is revealed on both sides at once, and the round is scored |
| 5 min between rounds | you can change your *later* slots |
| End | best of 3 rounds wins (total score breaks a tie) |

**Round score** = (100 + Buy + Crowd + Lock) × tactic
- **Buy** (−12 to +12): net NEAR bought this round ÷ real NEAR in the curve. Each wallet counts for at most 20 NEAR, so a whale can't carry a round. Selling counts against your side.
- **Crowd** (0 to +6): share of the coin's qualified wallets that tapped Battle cry this round.
- **Lock** (0 to +6): tokens newly locked in the Vault this round for ≥ 6h, +1 per 0.5% of circulating supply. **Each wallet counts for at most 0.5% (1 point)**, so one whale can't max it alone. Holding is a way to fight.
- Buying is worth the most (it costs money), but taps and locks together can match it.
- **What's visible:** the base score (Buy, Crowd, Lock) is live and public, because trades are public. The tactic (×0.90 to ×1.10) stays hidden until the round ends. A side 5% behind can still win the round with a Curse or Rally.
- **Settings freeze at the start:** spoils %, level and the real NEAR used for Buy are fixed when the raid starts. If a coin levels up mid-raid, its holders still get the level drop and the raid carries on unchanged.
- **Deserting:** while a raid is on, sells by either coin's holders pay +3%, burned. Bets are locked until the raid ends. Selling mid-raid doesn't dodge Plunder: Plunder takes a share of what you hold at the end, and you'd sell into the falling price anyway.

**Raid plan: 3 slots, one per round**
- Each player puts at most one tactic card (**Rally**, **Curse** or **Ward**) in each slot. You can leave slots empty. You see only your own plan; your coin shows only how many wallets have plans.
- Each slot works like a vote: the card the most wallets put there (minimum 3) is the side's tactic for that round. Fewer than 3, or a tie, means no tactic.
- Only cards that matched the side's tactic are used up. The rest go back to your hand.
- What each side used is public after each round; what's left in hands is hidden. A side that spends all its Curses early has none for later.
- Both sides reveal at the same moment. **Nobody plays first or second.**

| Tactic | Effect (3 / 6 / 10 wallets) | Beats | Loses to |
|---|---|---|---|
| Rally | your score ×1.05 / ×1.08 / ×1.10 | Ward (their Ward is wasted) | Curse |
| Curse | their score ×0.95 / ×0.92 / ×0.90, and it cancels their Rally | Rally | Ward |
| Ward | blocks their Curse and turns it back on them. Does nothing otherwise | Curse | Rally |

- Rally cards are not stacked one by one. Ten Rallies give ×1.10, not ×1.07 ten times.
- Ward only works if the enemy side's tactic is Curse **in that same round**. You have to read them.
- A won raid gives a **3-card pack** to each wallet on the winning side that filled slots in at least 2 rounds.

**Results**
- **The loser pays in three ways:**
  1. **Pot spoils:** 15% of the loser's pot buys the winner's tokens, which are burned.
  2. **Plunder (holders' tokens):** up to **1%** of every unlocked bag on the losing side is seized. Wallets that fought (Battle cry, or slots filled in at least 2 rounds) pay half, 0.5%. **Vault tokens are never plundered.**
  3. **Curve hit (NEAR in the curve):** the plundered tokens are **sold into the loser's own curve**. That pulls real NEAR out of it, so the loser's price drops. The NEAR goes to the winner, buys its tokens, and they're burned.
- **Plunder cap:** at most **2% of the loser's real NEAR in the curve**. If 1% of the bags would raise more, everyone's share shrinks by the same amount. Selling through the curve keeps it solvent; it's an ordinary sell with no fee.
- **What the loser feels:**

  | Loser's level | Most NEAR pulled from its curve | Its price drop |
  |---|---|---|
  | L2 | 12.5 | about 1.2% |
  | L3 | 29 | about 2.0% |
  | L4 | 48 | about 2.5% |
  | near graduation | 79 | about 2.9% |

- The winner's price rises by roughly the same amount from the burn. Every holder of the losing coin feels the price drop; idle holders also lose tokens, and Vault lockers lose nothing from their locked tokens.
- **Bets (optional):** minimum 1 NEAR worth, capped per wallet. Losing bettors lose 30% of their bet (burned). Winning bettors get their bet back plus a reward-pool bonus worth 10% of the losing bets.
- You don't have to bet to help. Buying and Battle cry move the score either way.
- If one side has no bettors, the raid still runs for the spoils.
- If nobody on B shows up, B simply loses and pays the spoils and the full Plunder. That is the cost of being asleep.

### Card supply (simulated: `research/card-supply-sim.cjs`)

| Source | Rule |
|---|---|
| **Starter set** | 1 Rally, 1 Curse, 1 Ward, once per coin, after you've held ≥ 2 NEAR for 1h |
| **Pack** | **2 cards every 6h**, claimed with a gm (gm is once per 6h too) |
| **Card odds** | each card rolls its **tier** from the tables below, then its **type** within the tier. Commons: **60% the raid tactics** (Rally, Curse, Ward 20% each), **40% the other four** (Ember, Roll Call, Hype Siren, Hedge 10% each). Rares, Epics, Mythics: random among the cards of that tier that still have stock and can be played at the coin's level |
| **Level drop** | 3 cards per wallet that qualified before the crossing |
| **Raid win** | a **3-card** pack for each winning wallet that filled slots in at least 2 rounds (losers get nothing) |
| **Hand limit** (per coin) | 12 Commons · 3 Rares · 3 Epics · 1 Mythic. See "Make room first" below |

**Drop tables by level** (v7, tier chance per card; simulated in `research/odds-v7-sim.cjs`)

| Source | L1 | L2 | L3 | L4 |
|---|---|---|---|---|
| **Pack** (2 cards / 6h) | C 90 · R 8 · E 2 | C 85 · R 10 · E 5 | C 50 · R 20 · E 20 · M 10 | C 40 · R 25 · E 25 · M 10 |
| **Raid-win pack** (3 cards) | – | C 70 · R 15 · E 10 · M 5 | C 45 · R 20 · E 20 · M 15 | C 35 · R 25 · E 25 · M 15 |
| **Level drop** (3 cards) | – | C 65 · R 20 · E 10 · M 5 | C 40 · R 25 · E 20 · M 15 | C 25 · R 20 · E 30 · M 25 |

- These are the odds **while the deck has stock**. When a tier's stock is empty, the roll falls to the tier below (Mythic → Epic → Rare → Common). The page shows the live stock next to the odds, e.g. "Mythic 10% · 0 of 2 left → falls to Epic".
- In the simulation the deck limit is what really decides how many good cards exist: at L3–L4, **89–99% of Rare+ rolls fall a tier** because the stock is already out. Higher odds mean a freed card (played, faded, dropped) is picked up again within minutes, not that more exist.
- **Cards that can drop early:** at L1 only Rares and Epics playable at L1 drop (Prophecy, Counterspell, Recruit, Slow Burn; Inferno, Whale Tax). Mythics first drop at L2 (from raid wins and the level drop) and can be played from L3.

**Limits only for Rare, Epic and Mythic: a pyramid that grows with the coin**

Commons (including Rally, Curse, Ward) have **no limit**. Raids need **no card** (section 4).

Each higher tier has a limit that grows with the number of holders **eligible** for that tier:

| Tier | Eligible holder | Limit on the coin | Minimum | Unlocks at |
|---|---|---|---|---|
| Rare | Holding ≥ 3 NEAR for 1h | **1 per 2 eligible holders** | 8 | L1 |
| Epic | Holding ≥ 5 NEAR for 2h | **1 per 5 eligible holders** | 4 | L1 |
| Mythic | Holding ≥ 10 NEAR for 4h | **1 per 12 eligible holders** | 2 | L2 |

- **The deck grows in a straight line** with eligible holders. Each card shows its own stock on the coin page ("Prophecy 2 of 4 · Storm 1 of 2"). Eligibility needs NEAR held, so the deck grows with both players and NEAR in the curve.
- You can only get a card of a tier you're eligible for. If you aren't, that roll drops a tier.
- The tier's limit is split across its cards by weight. Rares: Prophecy 3, Counterspell 2, Last Stand 2, Recruit 2, Diamond Rush 1, Slow Burn 1. Epics: Inferno 2, Storm 2, the rest 1 each. Mythics: 1 each. Every card has at least 1 copy.
- A roll picks its tier, then a random card of that tier that still has copies. Only when the whole tier is full does the roll drop a tier.
- **Fade:** a Rare, Epic or Mythic not played within **24h** of claiming goes back to the deck.
- A played, dropped or faded card frees its copy. The coin page shows stock, e.g. "Rares 23/23 · Epics 4/6".

Simulated over a whole coin life, 3 coin sizes, 40 runs each (`research/pyramid-sim.cjs`, option F):

| Coin | Level | Eligible R / E / M | Limit R / E / M | Eligible players holding one R / E / M |
|---|---|---|---|---|
| Small (80 players at L4) | L2 | 18 / – / – | 9 / – / – | 28% |
| | L3 | 34 / 25 / – | 17 / 5 / – | 24% / 10% |
| | L4 | 53 / 40 / 20 | 26 / 8 / 2 | 29% / 13% / 4% |
| Normal (120) | L2 | 22 / – / – | 11 / – / – | 25% |
| | L3 | 47 / 34 / – | 23 / 6 / – | 24% / 10% |
| | L4 | 78 / 58 / 27 | 39 / 11 / 2 | 30% / 14% / 3% |
| Big (260) | L2 | 39 / – / – | 19 / – / – | 19% |
| | L3 | 91 / 65 / – | 45 / 13 / – | 26% / 9% |
| | L4 | 163 / 119 / 57 | 81 / 23 / 4 | 30% / 15% / 4% |

**v7 odds, same pyramid, fixed eligibility** (`research/odds-v7-sim.cjs`, option B, 40 runs):

| Coin | Level | Eligible R / E / M | Limit R / E / M | Eligible holding one R / E / M |
|---|---|---|---|---|
| Small (80) | L1 | 4 / 2 / – | 8 / 4 / – | 2% / 2% / – |
| | L2 | 13 / 9 / 4 | 8 / 4 / 2 | 39% / 27% / 6% |
| | L3 | 25 / 17 / 7 | 12 / 4 / 2 | 31% / 19% / 22% |
| | L4 | 40 / 27 / 12 | 20 / 5 / 2 | 34% / 16% / 14% |
| Normal (120) | L2 | 16 / 10 / 4 | 9 / 4 / 2 | 35% / 23% / 9% |
| | L3 | 36 / 23 / 9 | 18 / 5 / 2 | 33% / 15% / 17% |
| | L4 | 59 / 39 / 17 | 29 / 7 / 2 | 33% / 16% / 10% |
| Big (260) | L2 | 31 / 19 / 7 | 15 / 4 / 2 | 28% / 17% / 6% |
| | L3 | 72 / 47 / 19 | 36 / 9 / 2 | 30% / 15% / 10% |
| | L4 | 127 / 85 / 37 | 63 / 17 / 3 | 31% / 16% / 6% |

- The pyramid holds with the new odds: about **1 in 3 eligible holders has a Rare, 1 in 6 an Epic, 1 in 10 a Mythic**. The new odds mostly make cards come back into play faster.
- Raid tactics are unharmed: 91–96% of raid players hold at least one tactic card, because rolls that fall from an empty tier land on Commons.
- Make room first blocks 4–6% of claims at L3–L4 (a full Rare/Epic/Mythic hand), up from 1–3%.
- The deck keeps growing with eligible holders: the limit only rises, never shrinks, as a coin gets bigger.

Earlier results (v6 odds, option F): at every size about **1 in 4 eligible holders has a Rare, 1 in 8 an Epic, 1 in 30 a Mythic**. A big coin gets far more good cards in total, and the odds per player stay the same.
- With the old fixed limits, the share fell to 13% / 6% / 2% on a big coin.
- Plays are limited by Energy (about 5–12 Rares and 2–8 Epics a day), and more good cards drop than get played, so there's always a choice of what to fire.
- Raid as a Rare card blocked **45–59% of a coin's own raids at L2** (no one held one), and a 20-Energy raid cost still blocked ~40%. So raids now need only signers.

**Energy also comes from buying:** +1 Energy per 10 NEAR of net buying (round trips inside 1h ignored; each wallet counts for at most 20 NEAR per hour). Check-ins alone only paid for about 3 Rare plays a day at L2; with buying it's about 7 at L2 and 11 at L3–L4, plus 1–4 Epics a day.

**Make room first** (no waiting, no lost cards)
1. Every card source is a **claim**: the pack, the level drop and the raid-win pack each have a Claim button.
2. **You can claim only if your hand has room for everything it could contain:**

   | Claim | Room needed |
   |---|---|
   | Pack (2 cards) | 2 free Common slots + 1 free slot in each higher tier the pack can roll at this level |
   | Raid-win pack (3 cards) | 3 free Common slots + 1 free slot in each higher tier it can roll |
   | Level drop (3 cards) | 3 free Common slots + 1 free slot in each higher tier it can roll |

3. Not enough room: the Claim button changes to **"Drop 1 Common to claim"** (or Rare, and so on). You pick which cards to drop, then claim.
4. Unclaimed packs don't stack: the next 6h pack timer starts only after you claim. Level drops and raid-win packs stay claimable until the coin graduates or dies.
5. A dropped Common is burned. A dropped Rare, Epic or Mythic goes **back to the coin's deck stock**, so it can drop for someone else. Rare and above can be listed on the Card Market instead.
6. A full Rare hand blocks every pack, so holding 3 Rares pushes you to play or sell one.

Why a 3-card win pack and nothing for losers (`card-supply-sim.cjs spicy`): it makes winning matter (+2 cards per win for active players) while keeping shortage. Giving losers a card too made hands too full (players had the wanted card 80% of the time, so less to plan).

Result (72h coin, a raid every 8h from L2, 30 runs; full table in `research/card-supply-sim.cjs v61`):

| Pack | Full raid plans | Had the card the side wanted | Cards wasted (active player) | Verdict |
|---|---|---|---|---|
| 3 cards / 12h | 89–96% | 66–76% | 0.7 | fine, slower |
| 3 cards / 6h | 89–98% | 68–81% | 16 | too many: hands overflow |
| 3 cards / 4h | 88–100% | 68–85% | 30 | far too many |
| **2 cards / 6h** | **83–97%** | **62–75%** | **5** | **chosen: enough to play, short enough to plan** |
| 2 cards / 4h | 83–99% | 61–78% | 14 | too many |
| 1 card / 4h + 3-card win pack | 81–93% | 61–74% | 4 | close second; rewards winning more |

- Active players get about 34 Commons over a coin's life, casual players about 16. Both fill most plans: 97% vs 85%.
- In about 1 slot in 3 you don't have the card your side wants, so pacing cards still matters.
- At a raid every 6h, casual players fall to 74–79% full plans, so the limit stays at 1 raid per 8h.
- On a fast coin (33h), 92–99% full plans.

---

## 5. The cards (24)

### Commons (L1+, 3 wallets to fire, tiers 3 / 6 / 10)

| # | Card | Effect by tier |
|---|---|---|
| 1 | **Rally** | raid tactic (section 4) |
| 2 | **Curse** | raid tactic (now a Common, so the three tactics are equal) |
| 3 | **Ward** | raid tactic |
| 4 | **Ember** | **pot + crowd:** the pot burns 1% / 2% / 3% of itself, and for 10 min anyone can **stoke** it with up to 5 NEAR: stokes buy for the stoker (Vault 6h) and the pot adds 1 NEAR per 2 NEAR stoked, up to double the tier %. Once per coin per hour |
| 5 | **Roll Call** | for 1h each gm gives ×2 / ×3 / ×4 Energy |
| 6 | **Hype Siren** | pins the coin on Trending for 15 / 30 / 45 min. Only 3 coins are pinned site-wide; later ones wait in a queue. Once per coin per hour |
| 7 | **Hedge** (personal) | attach to one of your bets: lose half as much if it loses, win 25% less if it wins |

### Rares (L2+)

**10. Prophecy** (was Call; Duel is now inside it)
- **The caster writes the bet** by picking a question and setting its line. Every question must be checkable on-chain after 2h:

  | Question | Caster sets |
  |---|---|
  | **Line:** will the price be above X in 2h? | X, within ±5–10% of now |
  | **Tide:** will wallets that didn't bet be net buyers? | – |
  | **Crowd:** will at least N new holders arrive (first buy ≥ 1 NEAR)? | N, 3–30 |
  | **Vault:** will the locked share of supply rise by X points? | X, 1–10 |
  | **Raid:** will we win the raid that's on now? | – (only during a raid) |
  | **Burn:** will idle burn and Storms burn more than X tokens? | X, within a range set by the level |

- 20-min betting window. Bets are hidden until it closes. Bettors' own trades don't count toward the answer.
- **Two ways to bet:**
  - **Bold:** min 0.5 NEAR worth, capped per wallet. Losers lose half: **30% to the winners** by bet size, **10% to the caster**, 10% burned.
  - **Safe (no loss):** lock tokens on Yes or No for the 2h. You always get them back. Safe winners share a small reward-pool prize (at most 0.01% of supply per Prophecy). It's a coin flip where the worst case is getting your tokens back.
- **Duel:** any bettor can challenge one bettor on the other side. The stake is **your next pack**, not tokens: the winner gets the loser's next pack as an extra pack, the loser's pack timer restarts. No money is lost.
- **The caster pays nothing** (the coin pays 20 Energy) and earns 10% of the losers' bets whatever happens.
- **The Draft (if too few join):** a Prophecy needs 8 wallets with both sides filled. If it's short when the window closes, the **5 biggest holders who didn't bet pay a turnout tax**: 0.25% of each one's *unlocked* bag, **half burned, half to the Vault**. It never goes to bettors or the caster, so nobody profits from forcing a Draft with a one-sided line. Then the Prophecy is refunded. Tokens in the Vault can't be drafted; a wallet is drafted at most once a day.
- **Bold bettors can't trade the coin** from their bet until the Prophecy resolves (a trade voids the bet and it loses 10%, burned). "Bettors' trades don't count" can't be checked for a price question, so bettors simply can't trade.
- Betting both Bold sides with two wallets always loses (20% of the losing side leaves to the caster and the burn).

**11. Duel:** merged into Prophecy (above).


**13. Last Stand:** starts a **Hold the Line** event (section 6) when the price is ≥ 15% below its 24h high.

**14. Recruit** (Gold Rush; Bounty merged in)
- When it fires, the reward pool sets aside a **hidden bonus pot** of random size: 0.05–0.15% of supply (L1–L2), up to 0.25% at L4. Nobody knows the size.
- **First come, first served:** every buy of ≥ 1 NEAR gets +5% bonus tokens (each wallet counted up to 20 NEAR) until the pot runs out or 1h passes. The page shows only "Open" or "Empty".
- The bonus **unlocks after 3h** and is lost if you sell first. Unused bonus goes back to the reward pool.
- Any holder can **top up** the pot with their own tokens; 10% of a top-up is burned.

**15. Diamond Rush**
- When it fires, a **random target** appears: lock at least **T tokens** (worth 5–25 NEAR, picked at random).
- For 30 min, anyone who locks ≥ T in the Vault for **≥ 24h** gets **+10%** of the locked amount (counted up to 2×T) from the reward pool, paid at unlock.
- Total per play is capped at a random **1–1.5% of supply**, and never more than 25% of what's left in the reward pool (so the first play pays at most 1.25%); if more lock, everyone's bonus shrinks by the same share. Leaving the Vault early loses the bonus.

**16. Counterspell** (no signers)
- Any holder with the card plays it alone (Solo), against a Backed or Signed card before it fires. The target is cancelled and goes back to its owner, who can't propose it again for 1h.
- Contested cards (Storm, Black Hole, Whale Tax, Heist, Supernova) can't be Counterspelled; they're fought with NEAR in their contest.
- One Counterspell per target. Costs no Energy.
- Counterspell has its own stock limit (weight 2 of the Rares), so a coin has only a few.

**18. Slow Burn:** for 1h, 1% of the tokens in every trade burn.

### Epics (drop from L1; Inferno and Whale Tax play from L1, the rest from L3). Effects grow with level.

| # | Card | What holders do before it fires | L3 | L4 |
|---|---|---|---|---|
| 19 | **Inferno** | **Fuel** it for 15 min: chip in up to 20 NEAR. **Total fuel is capped at 10% of the real NEAR in the curve** (146 NEAR at L3, 238 at L4); extra is refunded pro rata. Fuel buys evenly over the next 1h, goes to each fueller and sits in the Vault for 24h at ×2 weight. Fuellers get +5% bonus tokens from the reward pool (max 0.1% of supply per Inferno) | **pot + crowd:** the pot burns a base 10%, plus **1 NEAR for every 2 NEAR of fuel**, up to **50%** of the pot. No fuel: just the base 10% | up to **75%** |
| 20 | **Storm** | **Contested.** In the same 15 min: chip to Fire or Stop, and pick **Brace** (lock your bag 6h, safe) · **Dodge** (stay liquid, 70% safe) · do nothing (hit) | hit = **4%** of your unlocked bag | **6%** |
| 21 | **Black Hole** | **Contested.** During the contest you can also **Feed** it 1% of your unlocked bag to be spared. Vault tokens are always spared | at resolve a **random size** appears: **1–2%** of every unspared unlocked bag, pulled **evenly over 6h** (like vesting in reverse). Half burned, half to the Vault. Selling during the pull takes what's still owed first. 3 random feeders get a Rare. **Once per coin per 24h** | **1.5–3%** |
| 22 | **Heist** | **Contested across two coins:** the attacker's holders chip to Fire (buys the attacker's coin), the target's holders chip to Stop (buys the target's coin) | Fire wins: steal **10%** of the target's pot, bought and burned on the attacker. Stop wins: the attacker pays the target 5% of its pot | **15%** |
| 23 | **War** (was Hard Raid) | a raid with bigger stakes | spoils **30%**; Plunder up to **2%** of bags, capped at **4%** of curve NEAR (price drop about 2.5–5.8%); losing bets lose 50% | same, plus "Conquered by" for 12h |
| 24 | **Whale Tax** | **Contested** (whales can chip to Stop it) | for **30 min**, a wallet selling more than 0.5% of supply in an hour pays **15%** on the extra, to the pot | same |
| 25 | **Alliance** | coin B accepts with its own signers within 30 min | 12h pact: no raids or Heists between them; each coin's holders can Battle cry and Guard for the other; a helping ally gets 25% of spoils | same |
| 26 | **Harvest** | – | reward pool pays **2% of what's left in it** to wallets that checked in during the last 6h (half shared by capped tickets, half 3 draws). The caster takes 10% of the Harvest; signers get double tickets | **3%** of what's left |

Notes:
- **Inferno** is the biggest price mover because the crowd brings new NEAR and the pot adds half as much again. Example at L3 with a 50 NEAR pot: no fuel burns 5 NEAR (about +0.4%); 10 fuellers × 20 NEAR buy 200 NEAR and the pot burns 25 NEAR (its 50% max), about +15% in all.
- **Every contest is a buy:** Fire and Stop chips both buy the coin over 1h, capped at 5% of the real NEAR in the curve.
- **Why fuel is capped:** with no cap, a bot buying before 400 NEAR of fuel and selling after it made +20–25%, and still +7–13% after the 10% tag. With the cap and the tag the trade loses money (`research/redteam-sim.cjs`).
- **Storm:** of the tokens taken, half are burned and half go to the Vault. Wallets that bought in the last 30 min are exempt. Once per coin per 24h. It moves the price only about +0.5%; what it really does is move 2–4% more tokens to the holders who locked.
- **Reward pool never runs dry:** Prophecy, Recruit, Diamond Rush, Inferno fuel, Harvest and Black Hole all pay from the same locked 5%. Each payout is capped as a share of what's *left* in the pool, so it shrinks as the pool empties instead of hitting zero.
- **Whale Tax** applies from the moment it's proposed (held aside, and returned if the card fails), so whales can't dump during backing.

### Mythics (drop from L2, play from L3; 8 / 10 signers at L3 / L4; full Energy)

| # | Card | Effect |
|---|---|---|
| 27 | **Supernova** | Inferno and Storm at once, at full strength: contested; the pot burns a base 30% plus 1 NEAR per 2 NEAR of fuel, up to everything the daily cap allows, and the Storm hit is 8%. Once per coin per 48h |
| 28 | **Conquest** | total war on any coin of the same or higher level, ignoring its shield: 5 rounds, spoils 40%. If the attacker loses, it pays 20% of its own pot |

Removed: Kindle, War Chest (now Inferno's Fuel), Bounty (inside Recruit), Squeeze, Diamond Pool (now the Vault), the Counterspell raid mode.

---

## 6. Hold the Line (one event, two triggers)

- **Auto trigger** (if the creator picked the rule): price ≤ 80% of the price one hour ago.
- **Card trigger:** Last Stand.
- The event lasts 3h.
  - Sells pay +3%, into a prize.
  - The pot spends 20% at a random block, bought and burned.
- **Who wins:** wallets that held before the drop and made no sell from 1h before the trigger until the end.
- **Reward:** up to **+5%** of the bag they held, paid from the sell-fee prize plus up to 0.25% of supply from the reward pool. If that isn't enough for a full 5%, everyone gets the same lower %.
- **How it's worked out without a rush:** each wallet already stores its last sell time and its balance before its first trade in the event. The reward is calculated per wallet **when that wallet claims**, any time after the event. The trigger is a single price comparison checked on every trade.
- Once per coin per 24h.

---

## 7. Creator rules (pick up to 3 of 11, locked forever, shown as badges)

| Rule | Effect |
|---|---|
| **Fair Launch** | all buys in the first 5 min go through as one batch at one price (no snipers) |
| **Launch Guard** | max 30 NEAR per wallet in the first 10 min |
| **Paper Tax** | 10% on selling tokens bought less than 1h ago, to the pot |
| **Soft Tax** | 5% on selling tokens bought less than 30 min ago (can't combine with Paper Tax) |
| **Whale Cap** | no wallet can hold more than 2% of supply before L3 |
| **Hold the Line** | the auto trigger in section 6 |
| **Creator Lock** | the creator can't sell for 24h, then unlocks over 48h |
| **Ruthless** | idle burn is 2% per 6h |
| **Wild Coin** | Wild Omens come up 60% of the time (more luck) |
| **War Coin** | raid shield 6h instead of 12h; spoils **20% instead of 15%**, both when it wins and when it loses |
| **Peace Coin** | can't be raided or raid before L3 |

---

## 8. What I'm unsure about

1. **Partly simulated.** Card supply, odds and signer counts are simulated. Energy costs, contest head starts, Storm sizes and the idle burn are first guesses.
2. **Bots.** A bot can gm every 6h and Dodge every Storm. The Vault is the answer for humans (lock and you're safe), but always-online wallets still do a little better.
3. **Paper Tax at 10%** stops flippers but also cuts the trading that fills the pot. It's a creator choice, with a badge so buyers see it.
4. **Whale Tax** can be avoided by splitting a bag across wallets beforehand.
5. **Small coins:** a coin with under 10 active wallets can't fire Rares. That's intended, but it makes L2 feel quiet.
6. **Build size.** Four ways to play is still one state machine (backing → optional contest → fire). It is still large for the days left.
