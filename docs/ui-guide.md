# Rulecard UI design guide

What every screen shows, which components it needs, and what each state looks like. This guide is about
**content and structure**: the visual style is yours. All game numbers come from `docs/game-spec.md`.

---

## 1. Design principles

1. **Show the rules, not just the price.** Every coin page answers: what level is it, what's missing for the next one,
   what's about to happen (warns), and what can I play right now.
2. **Everything is a countdown.** Warns, raid rounds, hold timers, Eclipse, vesting. Use one consistent countdown chip.
3. **Explain by role.** 27 cards is a lot, so group them by 5 roles with an icon each. Players learn roles, not cards.
4. **Locked ≠ hidden.** Show locked things greyed out with *why* ("Unlocks at L3", "Need Holding 3 NEAR for 1h, 22 min left").
5. **Honest numbers.** Show what a card will do before playing ("Pot will spend ~6 NEAR, est. +2%"). Show when a cap shrinks it.
6. **Mobile-first.** Most memecoin traders are on phones. The coin page must work at 375px wide.

---

## 2. Design tokens

### Tiers

| Tier | Suggested colour | Use |
|---|---|---|
| Common | grey / silver | card border, badge |
| Rare | blue | |
| Epic | purple | |
| Mythic | gold, animated shimmer | |
| Foil (5% of cards) | rainbow sheen overlay | any tier |

### Roles (icon on every card)

| Role | Icon idea | Meaning |
|---|---|---|
| Tool | wrench / spark | sets things up |
| Price | flame | moves price |
| Position | scales | bet against other players |
| Tactic | crossed swords | raid round modifier |
| Counter | shield | cancels or answers |
| Reward | gift | pays out reward-pool tokens |

### Coin Mood

| Mood | Colour | Icon |
|---|---|---|
| Calm | teal | wave |
| Euphoria | green | rocket |
| Panic | red | alarm |

### Levels

| Level | Name | Badge idea |
|---|---|---|
| L1 | Launched | seed |
| L2 | Rising | sprout |
| L3 | Hot | flame |
| L4 | Legendary | crown |
| L5 | Graduated | diploma; the page switches to "normal coin" mode |

---

## 3. Site map

```
Home / Discover
 ├── Coin page ─┬── Trade panel
 │              ├── Level checklist
 │              ├── Meters (Spark, Ult, Heat, Mood, Pot, Reward pool)
 │              ├── Effects timeline (warns + active effects)
 │              ├── Positions board ──► Raid arena / Prophecy / Diamond Pool / Bounty / Circle
 │              ├── Play card (hand drawer + play modal)
 │              ├── Holders & crowd share
 │              └── Activity feed
 ├── Launch a coin (wizard)
 ├── Forge (Sacrifice · Salvage/Wild)
 ├── Card Market
 ├── Profile (hand, holdings, relics, claims)
 ├── Events (raids live, Eclipse countdown, leaderboards)
 └── How to play
```

Global: top bar with wallet connect (NEAR wallet selector), a site-wide **Eclipse countdown** chip,
notifications (your warns, raid rounds, claims ready).

---

## 4. Screens

### 4.1 Home / Discover

**Purpose:** find coins worth joining.

| Block | Content |
|---|---|
| Live ticker | "$MOTH raiding $ZAP: Round 2", "Inferno on $FROG in 3:12", "$CAT reached L3" |
| Pinned (Hype Siren) | up to 3 coins with a banner and time left |
| Coin grid / list | coin card per coin (below) |
| Filters | Level, Mood, "close to next level", "in a raid", newest, graduated |
| Eclipse banner | when a Mythic window is open: "Eclipse open: 18:12 left" |

**Coin card:** image, name, ticker · level badge · market cap · 1h change · Mood icon · progress to next level (e.g. "5/9 rules") ·
small icons for active effects (raid, Hold the Line, Inferno warn).

### 4.2 Launch a coin (wizard, 4 steps)

1. **Identity:** name, ticker, image, description, links.
2. **Creator rules:** pick up to 3 of Launch Guard, Paper Tax, Hold the Line, Creator Lock. Each tile explains it in one line.
   Show "locked forever" clearly.
3. **Seed:** NEAR into the pot (min 10, max 100). Show "Your Seed fuels this coin's price cards. You can't take it back."
   Optional first buy (max 10 NEAR).
4. **Review:** summary, fee (1% to protocol), supply split chart (curve / DEX pool / reward pool), confirm.

After launch: a success screen with share buttons and "Your coin can't be played by you for the first hour."

### 4.3 Coin page (the main screen)

**Desktop layout:** left = chart + trade · centre = effects timeline + positions · right = level checklist + meters + hand.
**Mobile:** tabs: **Trade · Play · Level · Positions · Activity**, with header and meters always visible at the top.

#### Header
Image, name, ticker, level badge, price, market cap, real NEAR in curve, 1h/24h change, Mood chip,
creator rules as small chips, "Check in (gm)" button with a streak count.

#### Chart
Price chart with **event markers**: card fired (icon by role), raid start/end, level up, Hold the Line period (shaded red),
Eclipse windows (shaded gold). Tapping a marker shows what happened.

#### Trade panel
- Buy / Sell tabs, amount input (NEAR or tokens), estimated tokens / NEAR, price impact, fee (1%).
- Warnings inline:
  - "Paper Tax: +2% because you bought 9 min ago."
  - "Selling now resets your Holding clock (Rare unlock in 12 min)."
  - "Whale Tax active: +1% for wallets > 2%."
  - "Selling during a raid lowers $MOTH's score."
- After buying: show the new Holding and what it unlocks next, and when.

#### Level checklist
One row per rule: name · current value · target · progress bar · ✓ or ✗. Example:

```
L3 Hot                                      held 12:40 / 30:00  ⏳
✓ Market cap          3,120 / 3,000
✓ Real NEAR             845 / 800
✗ Qualified wallets      54 / 60      (6 more holding ≥3 NEAR for 3h)
✓ Crowd share           33% / 30%
✓ Volume 24h          2,410 / 2,000
✓ Check-ins 24h          47 / 40
✓ Net buying 1h         +12 / ≥ 0
✓ Coin age               5h / 3h
✗ Milestone          Rare effect finished: not yet
```

- If all ✓, show the hold timer. If one fails, the timer resets with a short animation.
- Show "You'll get a level drop" if the viewer qualifies.

#### Meters strip
Spark (0–30, segmented in 5s), Ult (0–100 ring), Heat (3 flames), Mood (chip with the % that drives it),
Pot (NEAR amount + "est. Inferno now: +x%"), Reward pool (tokens left + usable at this level + today's release used),
Rare slot (ready / cooldown time), Eclipse (time to next).

#### Effects timeline
A vertical list, newest at the top:
- **Pending (in warn):** card, who played it, countdown, "Counter" button if you hold Counterspell.
- **Active:** card, time left, live numbers ("Pot spent 4.2 / 6.0 NEAR", "Burned 1.2M").
- **Finished:** result line ("Inferno: +3.1% price, 2.4M burned").

#### Positions board
Cards for each open position: type icon, caster, time left, sizes per side, your bet, a "Join" button.
Opens the detail screen (4.5–4.8).

#### Hand drawer / Play modal
- The hand shows only this coin's cards (plus Wild cards), grouped by role, with playable ones first.
- Each card tile: art, name, tier border, role icon, one-line effect, a status line
  ("Playable", "Needs Ult 100 (72 now)", "Rare slot in 6 min", "Unlocks at L3", "Eclipse only").
- **Play modal:**
  1. Full card text.
  2. Requirement checklist (Holding, meter, slot, per-wallet limit).
  3. Target picker if needed (raid target coin, Prophecy target, Bounty goal).
  4. Preview of the effect with real numbers and any caps.
  5. Mood modifier ("Calm: +25%").
  6. Warn time.
  7. Confirm.

#### Holders & crowd
Top holders (with the 1% cap visualised), crowd share bar, qualified wallets count, your rank and Conviction.

#### Activity feed
Trades, check-ins, card plays, bets, level-ups. Filters: all / cards / trades / mine.

#### Graduated state
Banner "Graduated on <date>: now a normal coin". Trade panel switches to the pool. Cards, meters, level and
positions are hidden. A **Hall of Fame** section shows the coin's history: level dates, biggest card plays, raid record,
top contributors and Hall of Fame cards.

### 4.4 Raid arena

- Two columns: coin A vs coin B (image, ticker, level, real NEAR at start).
- Round tracker: 4 dots, current round countdown, then the reveal window countdown.
- Per round: net NEAR bought each side, base score, tactic (sealed = card back; revealed = card face), final round score.
- Total score bar (tug-of-war style).
- Bets: total per side, number of bettors, your bet, "Bet more" button (your own coin's side only).
- Tactic slot per side: "Sealed by 0x…" or "Open". Buttons: Seal tactic · Reveal · Scout.
- Ally section if an Alliance is active.
- Result screen: winner banner, payouts, relic, MVP, burned amount, "Claim" button.

### 4.5 Prophecy

- Target in big text ("Net buying ≥ 80 NEAR by 21:40"), a live progress bar toward it, and the betting window countdown.
- Call vs Fade bars with totals and implied payout per 1 token on each side.
- Bet form (side, amount), your position, and the Squeeze-available indicator.
- Result: who won, your payout, burned amount.

### 4.6 Diamond Pool

Lock options (1h / 6h / 24h) with the penalty explained, total locked, stayers count, penalties collected so far,
your lock and countdown, and a "Leave early" button with a big penalty warning.

### 4.7 Bounty

Goal, progress, time left, sponsor, bounty size, list of contributors.

### 4.8 Summoning Circle / Black Hole

- Big shared counter (wallets joined / 25, or tokens thrown), countdown, join form.
- Black Hole: estimated return range (fair share + lucky draw chances), Heat bonus, "Top 3 get a Rare".

### 4.9 Forge

| Tab | Content |
|---|---|
| **Sacrifice** | coin picker, burn-amount slider showing live odds (Common / Rare / Epic / Mythic bars), pity counter (x/5), pick 1 of 2 types, cooldown |
| **Salvage / Wild** | cards from dead or graduated coins → Shards; buy Wild Common (3) or Wild Rare (10); Wild cards show "Bonds on first play" |

### 4.10 Card Market

Filters: coin, tier, role, foil, price. Listing tiles with serial and coin level. Buy and list flows. Show "5% royalty
goes to $COIN's pot".

### 4.11 Profile

- Per-coin holdings: tokens, value, Holding, held for, Conviction, what's unlocked.
- Hand across all coins, plus Hall of Fame cards.
- Pending: claims, vesting rewards with countdowns, bets.
- Relics and badges, reputation level and perks.
- History.

### 4.12 Events

Live raids, upcoming Eclipse, leaderboards (raid wins, biggest burns, Prophecy accuracy), recent graduations.

### 4.13 How to play

Short visual guide in 6 cards: Buy & hold → Unlock & check in → Collect cards → Play by role → Positions →
Level up & graduate. Link each to the spec.

---

## 5. Reusable components

| Component | Data |
|---|---|
| CoinCard | image, ticker, level, mcap, change, Mood, rules met x/y, active-effect icons |
| LevelBadge | level, name |
| RuleRow | name, current, target, met, hint |
| MeterBar / MeterRing | value, max, segments, label |
| HeatFlames | 0–3 |
| MoodChip | mood, driving % |
| Countdown | end time, label, urgent state < 1 min |
| CardTile | art, name, tier, role, foil, serial, short text, status line |
| CardDetail | full text, requirements, preview numbers, counters |
| EffectRow | card, player, state (warn / active / done), countdown, live numbers |
| PositionCard | type, sides, sizes, your bet, time left |
| ScoreTug | score A, score B |
| OddsBars | Common / Rare / Epic / Mythic % |
| TxButton | label, pending, success, error |
| Toast | message, link |
| EmptyState | text and action ("No cards yet: check in to earn a pack") |
| HandCounter | per tier: held / limit (e.g. Commons 12/12, Rares 2/3); turns red at the limit |
| ClaimButton | "Claim pack" when there's room; otherwise "Drop 1 Common to claim" (tier colour), which opens MakeRoomSheet |
| MakeRoomSheet | your hand of the blocking tier, "Pick 1 card to drop"; tap a card to mark it, confirm; Rare+ also shows **List on market** |

---

## 6. States to design for

| State | Example |
|---|---|
| Wallet not connected | coin page readable; buttons say "Connect to trade" |
| New holder | "Hold 1 NEAR for 1h to unlock packs: 48 min left" |
| Locked card | greyed, with reason and time |
| Pending tx | button spinner, optimistic row in the activity feed |
| Warn running | pulsing timeline row; counter button if available |
| Cap hit | "Capped: pot daily limit reached, effect reduced to 3.1 NEAR" |
| Raid in progress | coin header shows a raid banner with a link to the arena |
| Hold the Line active | red shaded header, timer, "Don't sell: prize pool 12.4 NEAR" |
| Eclipse open | gold glow on Mythic cards and the global chip |
| Dead coin | "No trades for 24h: you can still sell back to the curve" + Salvage link |
| Graduated | normal-coin mode + Hall of Fame |
| Hand full | the pack icon shakes when tapped and the full tier's counter pulses red ("12/12"); the Claim button reads "Drop 1 Common to claim". Tier colours: Common grey, Rare blue, Epic purple, Mythic gold |
| Drop | the chosen card cracks and fades (Common) or flies back to the coin's deck stack (Rare+), with a toast: "Curse dropped" / "Inferno returned to the $DOGE deck"; then the Claim button lights up |
| Pack open | cards fly from the pack into the hand, one by one, with the tier glow on each |
| Errors | not enough Holding, slot taken, raid already accepted, sold out |

---

## 7. Key user flows

1. **First visit → first buy:** Discover → coin → Buy → "Holding 5 NEAR, Rare unlocks in 1h" toast.
2. **Daily loop:** open coin → Check in → claim pack → see hand → play a Common if Spark allows.
3. **Play an Epic:** hand → Inferno (status "Ult 100, playable") → modal preview "Pot spends 8.4 NEAR, Heat 2 → ×1.5, est. +3%" →
   confirm → 5-min warn row → fires at a random block → result row.
4. **Raid:** Play Friendly Raid → pick target → bet 3 NEAR → wait for accept → arena → seal Curse in round 2 → reveal → settle → claim.
5. **Prophecy:** Play → pick target → bet Call → others bet → progress bar → settle → claim.
6. **Level up:** checklist turns all ✓ → hold timer → level-up celebration → drop card reveal animation.
6b. **Hand full:** tap Claim pack → pack shakes, "Commons 11/12" pulses → button says "Drop 1 Common to claim" → MakeRoomSheet → tap an old Curse → it cracks and fades → Claim lights up → pack opens, 2 cards fly in.
7. **Graduation:** "Graduating…" overlay (trading paused) → pool created → Hall of Fame page.

---

## 8. Data the UI needs from the contract (view calls)

| View | Returns |
|---|---|
| `get_coin(id)` | metadata, curve state, price, mcap, real NEAR, level, rules, Mood, meters, pot, reward pool, active effects, positions |
| `get_level_progress(id)` | each rule: current, target, met; qualified_since |
| `get_holder(id, account)` | tokens, Holding, held since, Conviction, unlocks, pending claims |
| `get_hand(account, coin?)` | cards with status flags |
| `get_effects(id)` | warns, active, recent |
| `get_raid(raid_id)` / `get_position(id)` | full state |
| `list_coins(filter, page)` | coin cards for Discover |
| `get_market(filter)` | listings |
| `quote_buy / quote_sell` | tokens or NEAR out, impact, fees, warnings |
| `preview_card(account, card, target)` | playable?, reasons, estimated effect, caps |

`preview_card` is important: the UI should never compute card effects itself, only show what the contract says.
