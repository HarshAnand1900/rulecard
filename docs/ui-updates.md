# Rulecard UI updates (v6/v7 design, hackathon demo)

This file says what changes from [`ui-guide.md`](ui-guide.md). Where the two disagree, **this file wins**.
Game rules: [`v6-redesign.md`](v6-redesign.md). What gets built: [`build-plan.md`](build-plan.md). Card faces: [`card-designs.md`](card-designs.md).

Tags used below: **[demo]** = build for the hackathon · **[roadmap]** = design only, show as "coming soon" or leave out.

---

## 1. What's gone from the old guide

Remove these everywhere (screens, meters, components, copy):

| Removed | Replaced by |
|---|---|
| Spark, Ult, Heat meters, HeatFlames | one **Energy** meter (0–100) |
| Rare slot, Eclipse windows and the global Eclipse chip | nothing (Mythics need signers instead) |
| Forge (Sacrifice, Salvage, Wild cards), crafting | packs only |
| Diamond Pool screen | the **Vault** |
| Bounty screen | Recruit (a Rare card) |
| Summoning Circle | removed |
| Sealed tactics, Scout, Decoy, Mirror, "Reveal" buttons | the **3-slot raid plan** |
| Call vs Fade, Squeeze | **Prophecy** Yes / No |
| Friendly Raid card | raids need no card, just signers |
| Conviction, Relics, reputation levels | removed for the demo |
| Warn timeline for every card | only **contests** have a countdown [roadmap]; other cards fire within 2 min |

---

## 2. Design tokens (updated)

### Tiers
| Tier | Colour | Card frame |
|---|---|---|
| Common | silver / grey | plain frame |
| Rare | blue | frame with a gem |
| Epic | purple | frame with a glowing edge |
| Mythic | gold | animated shimmer |

### How a card is played (icon on every card, replaces "roles")
| Way | Icon | Short label | Meaning |
|---|---|---|---|
| Solo | lightning bolt | "Play alone" | fires at once |
| Backed | two raised hands | "Needs 3 backers" / "Needs 3 copies" | other holders tap Back |
| Signed | quill | "Needs 5 signers" | qualified holders sign |
| Contested | tug-of-war rope | "Fire vs Stop" | 15-min NEAR contest [roadmap] |

### Coin systems (icons used across screens)
| Thing | Icon idea | Colour |
|---|---|---|
| Energy | battery / bolt | yellow |
| Pot | cauldron | orange |
| Vault | safe / lock | teal |
| Idle burn | ember / hourglass | red-orange |
| Reward pool | gift | pink |
| Daily Ritual | candle / sun ring | amber |
| Omen [roadmap] | eye | violet |

### Levels (unchanged names)
L1 Launched · L2 Rising · L3 Hot · L4 Legendary · Graduated.

---

## 3. Site map (demo)

```
Home / Discover
 ├── Coin page ─┬── Header (price, level, gm button, Ritual ring)
 │              ├── Price chart (on-chain history + event markers)
 │              ├── Trade panel (+ "Lock 24h?" after buy)
 │              ├── Today (Daily Ritual progress)          [demo]
 │              ├── Level checklist
 │              ├── Coin stats strip (Energy, Pot, Vault, Reward pool, deck stock)
 │              ├── Vault panel                            [demo]
 │              ├── Hand + Play sheet                      [demo]
 │              ├── Table (cards being backed/signed, live Prophecies, raid)
 │              ├── Raid arena                             [demo, cut first]
 │              └── Log (every mint and burn, trades, card plays)  [demo, required by the track]
 ├── Launch a coin (wizard)
 ├── Profile (holdings, hand per coin, claims)
 └── How to play
```

Card Market, Events, Omens screen: [roadmap].

---

## 4. Screens

### 4.1 Home / Discover [demo]
- Coin card adds: **Ritual ring** (today's progress %), Energy, "in a raid" badge, deck stock "R 3/9".
- Ticker lines: "$MOTH made its Ritual: pot burned 2.1 NEAR", "$ZAP raiding $CAT: Round 2", "Inferno fuelled on $FROG: 12 wallets".
- Remove the Eclipse banner.

### 4.2 Launch a coin [demo]
1. **Identity:** name, ticker, image, description.
2. **Creator rules:** pick up to 3 of 11 (v6 §7). Each tile: name, one line, and a badge preview. "Locked forever" in bold.
3. **Seed:** min 5, suggested 20, max 100 NEAR, all into the pot. Copy: "The pot is your coin's fuel for burn cards. You can't take it back."
4. **Review:** fees (2% = 0.3% protocol · 0.2% creator escrow, paid at graduation · 1.5% pot), supply split (curve / reward pool 5%), "No admin key: nobody can change these numbers, not even you." Confirm.

### 4.3 Coin page [demo]

**Mobile tabs:** Trade · Today · Cards · Vault · Log. Header and the stats strip stay pinned.

#### Header
Image, name, ticker, level badge, price, market cap, 1h change, creator-rule badges, and two big buttons:
- **gm** button with the time until the next one ("gm in 2:14"), and your idle clock ("burn starts in 9h").
- **Ritual ring** (today's progress), tap → Today tab.

#### Price chart [demo]
Directly under the header and stats strip, visible on every tab.
- **Data:** the coin contract's `get_prices` view: one on-chain point per trade or burn (at most one per minute, last 400 points). No indexer needed.
- **Line:** one series (price in µNEAR per token), 2px accent line with a faint area fill, 4 recessive grid lines, time axis in UTC. No legend (the title names it).
- **Header:** current price and the change over the chosen range (▲/▼ with %).
- **Range buttons** in one row above the plot: 1h · 6h · 24h · All.
- **Event markers** on the line from the coin's log: ⬆ level up · 🃏 card fired · ⚔ raid result · 🕯 Ritual burn · 🎓 graduation. A dashed vertical rule marks each one.
- **Hover:** crosshair + tooltip with time, price, market cap, and the event if the cursor is on a marker.
- **Empty state:** "No trades yet." Mobile: full width, same height (220px).
- Discover cards may later show a small sparkline from the same view.

#### Trade panel
- Buy / Sell, amount, tokens or NEAR out, price impact, fee 2%.
- Inline warnings (new):
  - "Tagged: you bought during an Inferno. Selling before 18:40 pays 10%."
  - "A raid is on: selling pays +3% and lowers your side's score."
  - "Paper Tax: +10% on tokens bought under 1h ago." (if the creator picked it)
- **After every buy: a "Lock 24h?" sheet** with one tap: "Locked tokens are safe from idle burn and Storms, and earn from them." Buttons: Lock 24h · Not now.

#### Today (Daily Ritual) [demo]
```
Today's Ritual                          ends in 6:12:04
gm      ███████████░░░░   31 / 40 wallets
Locked  ████████░░░░░░░   28 / 50 NEAR
Reward if made: pot burns 5% (≈ 2.4 NEAR) · your next pack 1h sooner
If missed: idle burn ×2 for 6h
Streak: 🔥 2 days (3rd day burns 7%)
```
- When made: a full-width celebration banner + the burn appears in the Log.
- When missed: a red banner "Ritual missed: idle burn ×2 until 06:00".

#### Level checklist
Same as the old guide, but the rules come from reference A4 (market cap, real NEAR, volume, wallets, hold time). Keep the hold timer.

#### Coin stats strip (replaces the meters strip)
| Chip | Shows |
|---|---|
| Energy | 0–100 bar, "+1 per gm, +1 per 10 NEAR bought" on tap |
| Pot | NEAR amount, today's spend vs the 75% cap |
| Vault | % of supply locked, number of lockers |
| Reward pool | tokens left |
| Deck | stock per tier: "R 7/9 · E 2/4 · M 0/2" |
| Mood | Calm / Euphoria / Panic |

#### Vault panel [demo]
- Lock form: amount, 6h / 24h / 72h (weight ×1 / ×1.5 / ×2), "Unlocks at <time>".
- Your locks: amount, weight, unlock countdown, earned so far, **Leave early** (red, "costs 20%: half to stayers, half burned").
- Coin totals: locked %, lockers, earned by the Vault today (from idle burn and Storms).
- Your idle status: "Last gm 7h ago · burn starts in 5h · today's losses 0% of your 8% cap".

#### Cards tab: hand + play sheet [demo]
- **HandCounter** at the top: "Commons 9/12 · Rares 1/3 · Epics 0/3 · Mythic 0/1".
- **Claim pack** button with the next-pack countdown; shows helper cuts ("−25 min from backing and fuel").
- Hand grid of **CardTile**s. Status line per card: "Ready", "Needs 3 copies (you + 1 more)", "Needs 5 signers", "Energy 20 (coin has 14)", "Fades in 3h".
- **Play sheet:**
  1. Card face (big).
  2. Requirements checklist: tier eligibility, Energy, backers/signers needed, table limit.
  3. Inputs if any (Prophecy question and line; Ember tier is automatic).
  4. Preview from the contract: "Pot burns ≈ 1.2 NEAR, est. +0.4%". Never compute effects in the app.
  5. Confirm → the card goes on the **Table**.

#### Table [demo]
Cards waiting or live on this coin, one row each:
- **Being backed / signed:** card, proposer, "3/5 signers", 15-min countdown, **Back** or **Sign** button (shows "−10 min to your next pack").
- **Firing:** "Fires within 2 min" with a pulse.
- **Inferno fuel window:** total fuel / cap bar ("120 / 146 NEAR"), wallets fuelled, **Fuel** button (max 20 NEAR, "−15 min to your next pack, +5% bonus, locked 24h").
- **Prophecy live:** question in big text, Yes / No totals (hidden until the window closes, then shown), countdown, **Bet** button.
- **Done:** result line ("Ember ×6: pot burned 2.4 NEAR, 1.9M tokens").

#### Prophecy sheet [demo: Bold bets only]
- Question + line ("Will $FROG be above 0.0041 NEAR at 21:40?"), live price vs the line.
- Bet form: Yes / No, amount (min 0.5 NEAR worth). Warning: "You can't trade $FROG until this resolves."
- Payout explainer: "If you lose, you lose half: 30% to winners, 10% to the caster, 10% burned."
- Result screen with your payout and a Claim button.

#### Raid arena [demo, cut first]
- Coin A vs coin B header, round dots (3), current phase (Muster / Round 2 / break) and countdown.
- **Raid plan**: 3 slots, drag a Rally / Curse / Ward from your hand into each, "you can change later slots in the break". Your coin shows only "34 wallets have plans".
- Live base score per side for the current round: **Buy** (−12…+12), **Crowd** (0…+6), **Lock** (0…+6), with a "+tactic hidden" chip.
- Round reveal animation: both sides' tactic cards flip at once, then ×1.10 / ×0.90 applied.
- **Battle cry** button (one tap per round) and "Lock for the raid" shortcut.
- Result: winner banner, spoils ("8.6 NEAR from $CAT's pot burned on $MOTH"), your win pack (if you filled ≥ 2 rounds), Claim.

#### Log [demo, required by the track]
- Every **mint** and **burn** with source: launch mint, idle burn, Ritual burn, Ember, Inferno, Vault early exit, raid spoils, Prophecy burn.
- Filters: Mints & burns · Trades · Cards · Mine.
- Each row: time, type icon, amount, source, tx link.
- Top line: "Total supply 1,000,000,000 → 987,412,330 (−1.26%)".

#### Graduated state
Same as the old guide (Hall of Fame), minus Relics.

### 4.4 Profile [demo]
Per coin: tokens, locked, last gm, idle clock, today's losses vs 8% cap, hand counts, pending claims (packs, Prophecy, raid packs).

### 4.5 How to play [demo]
Six panels: **Buy → gm every 6h → Lock in the Vault → Open packs → Play cards with friends → Raid other coins**. One line each.

---

## 5. Components (new and changed)

| Component | Data | Notes |
|---|---|---|
| PriceChart | price points, log events, range | line + markers + crosshair tooltip; see §4.3 Price chart |
| GmButton | next gm time, idle clock | turns red when burn has started |
| RitualRing | gm count/target, lock NEAR/target, ends at, streak | small ring in header, full card in Today |
| EnergyBar | 0–100 | replaces MeterRing/Spark |
| VaultCard | lock amount, weight, unlock time, earned | "Leave early" in red |
| LockPrompt | default 24h, amount = the buy | bottom sheet after buys |
| DeckStock | per tier held / limit | "falls to Epic" hint when a tier is empty |
| CardTile | art, name, tier, play-way icon, Energy cost, short text, stock "2/4", status line | see card-designs.md |
| TableRow | card, proposer, backers/signers x/y, countdown, action button | |
| FuelBar | fuel / cap, wallets | |
| ProphecyCard | question, line, totals, countdown | |
| RaidPlan | 3 slots, hand of tactics | drag or tap to place |
| ScoreParts | Buy / Crowd / Lock per side | tactic chip stays hidden |
| LogRow | type, amount, source, tx | |
| TagChip | "Tagged until 18:40" | in Trade panel |
| CapMeter | today's losses / 8% | in Vault panel and Profile |
| HandCounter, ClaimButton, MakeRoomSheet | as in ui-guide §5 | unchanged |

Remove: HeatFlames, MeterRing (Ult), OddsBars for Forge, PositionCard for Bounty/Diamond Pool.

---

## 6. States to design for (new)

| State | Example |
|---|---|
| Idle burn running | header gm button red: "Burning 1% every 6h · gm to stop" |
| Daily cap reached | "You've lost 8% today: nothing more can be taken until 00:00" |
| Tagged tokens | Trade panel chip + 10% shown in the sell quote |
| Ritual made / missed | gold banner / red banner |
| Card being backed | pulsing Table row; push to holders "Back $FROG's Ember? 2/3" |
| Fuel cap full | "Fuel full: extra refunded" |
| Prophecy bettor | Trade panel disabled with "You have a live Prophecy bet until 21:40" |
| Raid live | raid banner on the coin header; sell warning |
| Deck tier empty | "Mythic 0/2 left: rolls fall to Epic" |
| Card about to fade | "Fades in 1h: play it or it goes back to the deck" |

---

## 7. Key flows (demo)

1. **First buy:** Discover → coin → Buy 5 NEAR → **Lock 24h?** → Lock → toast "Safe from idle burn until tomorrow 14:00".
2. **Daily loop:** open coin → **gm** → Ritual ring ticks up → Claim pack → 2 cards fly in.
3. **Back a card:** push "Ember needs 1 more copy" → Cards → Back → Table row "Fires within 2 min" → Log "pot burned 1.1 NEAR".
4. **Inferno:** proposer plays Inferno → 5 signers sign → fuel window → you Fuel 10 NEAR → fires → Log shows the pot burn and your locked tokens.
5. **Prophecy:** play → pick "Line" + price → others bet → 2h → result → Claim.
6. **Ritual made:** at 00:00 the first visitor's call settles it → banner + burn in Log.
7. **Raid:** propose raid → 3 signers → Muster → fill 3 slots → rounds → reveal → spoils → claim win pack.

---

## 8. View calls the UI uses (demo contract)

| View | Returns |
|---|---|
| `ft_metadata`, `ft_balance_of`, `ft_total_supply` | NEP-141 standard |
| `get_params()` | every number frozen at launch (the "no admin" proof) |
| `get_coin()` | curve, price, mcap, real NEAR, level, Energy, pot, Vault totals, reward pool, Mood, deck stock |
| `get_level_progress()` | each rule: current, target, met; hold timer |
| `get_ritual()` | today's targets and counts, ends at, streak, yesterday's result |
| `get_holder(account)` | balance, locked, locks list, last gm, idle clock, pending burn, losses today, tags, next pack time |
| `get_hand(account)` | cards with status flags |
| `get_table()` | proposals, fuel windows, Prophecies, raid |
| `get_log(from, limit)` | mint / burn / card / trade events (also emitted as NEP-297 events) |
| `get_prices()` | price history for the chart (time, price, market cap) |
| `quote_buy(near)`, `quote_sell(tokens, account)` | output, impact, fees, tag fee, warnings |
| `preview_card(account, card, args)` | playable?, reasons, estimated effect |

The app shows only what these views return. It never works out card effects, burns or caps on its own.

---

## 9. Omens [roadmap]

When built: an **Omen banner** under the header ("Full Moon: Energy ×2 · 42 min left"), announced 15 min before. One icon per Omen (see card-designs.md §6).
