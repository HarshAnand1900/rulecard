# Rulecard card designs

Everything needed to draw the cards: the card frame, then one entry per card with its face text, full rules and an art brief.
Rules source: [`v6-redesign.md`](v6-redesign.md) §5. Screens: [`ui-updates.md`](ui-updates.md).

**[demo]** cards are built for the hackathon; the rest are roadmap but should share the same frame.

---

## 1. The card frame

**Size:** 5:7 (e.g. 500 × 700 px master, shown at 120 × 168 in the hand, 300 × 420 in the play sheet).

```
┌──────────────────────────────┐
│ [Energy]   NAME        [Way] │  ← top bar: Energy cost (left), play-way icon (right)
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │          ART             │ │  ← 55% of the height
│ │                          │ │
│ └──────────────────────────┘ │
│  ◆ TIER        L1+   2 / 4   │  ← tier gem + name, level it plays from, live stock on this coin
│ ──────────────────────────── │
│  Face text (max 2 lines)     │  ← the short effect, big type
│  small: tier scaling line    │  ← e.g. "3 / 6 / 10 copies: 1% / 2% / 3%"
│                     $TICKER  │  ← the coin this card belongs to (cards are per coin)
└──────────────────────────────┘
```

| Part | Spec |
|---|---|
| Energy cost | a battery chip: Common 5 · Rare 20 · Epic 50 · Mythic 100. Personal cards and raid tactics show "0" |
| Play-way icon | Solo = lightning bolt · Backed = two raised hands · Signed = quill · Contested = rope tug · Raid tactic = crossed swords |
| Tier frame | Common silver, flat · Rare blue with a cut gem · Epic purple with an inner glow · Mythic gold, animated shimmer |
| Stock | "2 / 4" = copies out / limit on this coin (Commons show ∞) |
| Coin tag | the coin's ticker and small coin image, because a card only works on its own coin |
| Back of card | one shared back: dark card with the Rulecard mark; tier colour only on the edge (so a face-down raid slot doesn't leak the card) |

**Raid tactics must look alike from the back**, and the three faces should share one layout so the reveal is a clean flip.

**States to draw:** normal · playable (soft glow) · not playable (desaturated + reason line) · fading (cracks creeping in from the corners, last 3h) · dropped (Common shatters; Rare+ flies to the deck stack) · revealed in a raid (flip animation).

---

## 2. Commons (silver) — 60% raid tactics, 40% others

| # | Card | Way | Face text | Full rule | Art brief | Demo |
|---|---|---|---|---|---|---|
| 1 | **Rally** | Raid tactic | "Your score ×1.10" | In a raid slot. If your side's tactic for the round is Rally: ×1.05 / ×1.08 / ×1.10 with 3 / 6 / 10 wallets. Beats Ward, loses to Curse | A war horn blown on a hill, crowd behind it, banners up. Warm orange light | ✅ |
| 2 | **Curse** | Raid tactic | "Their score ×0.90" | Enemy score ×0.95 / ×0.92 / ×0.90 and cancels their Rally. Beats Rally, loses to Ward | A hooded figure dropping a hex sigil on an enemy banner. Sickly green | ✅ |
| 3 | **Ward** | Raid tactic | "Turn their Curse back" | Blocks the enemy's Curse and turns it back on them. Does nothing otherwise. Beats Curse, loses to Rally | A round shield with a mirror face, a green hex bouncing off it. Cool blue-white | ✅ |
| 4 | **Ember** | Backed (3 copies) | "The pot burns 1–3%" | Same card from 3 / 6 / 10 wallets: the pot burns 1% / 2% / 3% of itself. For 10 min anyone can stoke with up to 5 NEAR (bought for them, Vault 6h); the pot adds 1 NEAR per 2 NEAR stoked, up to double. Once per coin per hour | A single glowing coal held in cupped hands, sparks rising. Orange on dark | ✅ |
| 5 | **Roll Call** | Solo | "gm counts ×2–4 for 1h" | For 1h each gm gives ×2 / ×3 / ×4 Energy | A bell tower ringing, small figures running toward it at dawn | – |
| 6 | **Hype Siren** | Solo | "Pin the coin on Trending" | Pins the coin on Trending for 15 / 30 / 45 min; only 3 coins pinned site-wide (queue). Once per coin per hour | A siren on a rooftop throwing a spotlight beam into the sky | – |
| 7 | **Hedge** | Solo (personal) | "Lose half, win less" | Attach to one of your bets: lose half as much if it loses, win 25% less if it wins | A hedge maze seen from above, one path lit | – |

---

## 3. Rares (blue)

| # | Card | Way | Face text | Full rule | Art brief | Demo |
|---|---|---|---|---|---|---|
| 8 | **Prophecy** | Backed (2–3 backers) | "Ask the crowd. Bet Yes or No." | Caster picks a question (Line ±5–10%, Tide, Crowd, Vault, Raid, Burn) for the next 2h. Bold bets: losers lose half (30% winners, 10% caster, 10% burned). Bettors can't trade until it resolves. Caster pays nothing | An oracle's eye inside a crystal ball, two hands (Yes / No) reaching toward it | ✅ (Bold only) |
| 9 | **Recruit** | Backed | "Gold Rush: first buyers +5%" | A hidden bonus pot (0.05–0.25% of supply). Buys ≥ 1 NEAR get +5% until it's empty or 1h passes. Unlocks after 3h; lost if you sell first | A gold vein cracking open in a mine, a line of miners rushing in | – |
| 10 | **Diamond Rush** | Backed | "Lock T for 24h: +10%" | A random target T (5–25 NEAR worth). Lock ≥ T for 24h within 30 min: +10% at unlock. Cap 1–1.5% of supply per play | A vault door half open, diamonds pouring out, a countdown ring around it | – |
| 11 | **Last Stand** | Backed | "Hold the Line" | When price is ≥ 15% below its 24h high: starts Hold the Line (sellers pay +3% into a prize; holders who don't sell win up to +5%) | A lone soldier planting a flag on a crumbling wall, storm behind | – |
| 12 | **Counterspell** | Solo | "Cancel a card" | Cancel a Backed or Signed card before it fires; it returns to its owner (1h cooldown) | A hand snapping shut around a spell, the spell's sparks scattering | – |
| 13 | **Slow Burn** | Backed | "1% of every trade burns" | For 1h, 1% of the tokens in every trade burn | A long fuse burning slowly across the card | – |

---

## 4. Epics (purple)

| # | Card | Way | Face text | Full rule | Art brief | Demo |
|---|---|---|---|---|---|---|
| 14 | **Inferno** | Signed | "The crowd fuels, the pot burns" | 15-min fuel window: up to 20 NEAR each, total capped at 10% of the curve's NEAR; fuel buys for the fuellers (Vault 24h, ×2 weight, +5% bonus). The pot burns 10% + 1 NEAR per 2 NEAR of fuel, up to 50% (L3) / 75% (L4) | A huge bonfire, many small figures throwing logs in, embers forming the coin's logo | ✅ |
| 15 | **Storm** | Contested | "Brace, Dodge or get hit" | Fire vs Stop contest. Same 15 min: Brace (lock 6h, safe), Dodge (70% safe), nothing (hit 4% L3 / 6% L4). Half burned, half to the Vault | Lightning over a sea of tiny boats; some tied down (Brace), some swerving (Dodge) | – |
| 16 | **Black Hole** | Contested | "Feed it or get pulled" | Feed 1% to be spared. Random 1–2% (L3) / 1.5–3% (L4) pulled from unspared unlocked bags over 6h. Half burned, half to the Vault. Once per 24h | A black hole bending the card frame inward, coins spiralling in | – |
| 17 | **Heist** | Contested (two coins) | "Steal 10% of their pot" | Attackers chip Fire, the target's holders chip Stop. Fire wins: 10% (L3) / 15% (L4) of the target's pot is burned on the attacker. Stop wins: attacker pays 5% of its pot | Masked crew lowering on ropes into a cauldron vault | – |
| 18 | **War** | Signed | "A raid with higher stakes" | Spoils 30%, Plunder 2% (cap 4% of curve NEAR), losing bets lose 50%. L4: "Conquered by" for 12h | Two armies clashing under two coin banners, the sky split in two colours | – |
| 19 | **Whale Tax** | Contested | "Big sellers pay 15%" | For 30 min, a wallet selling > 0.5% of supply in an hour pays 15% on the extra, to the pot. Applies from the moment it's proposed | A whale caught in a net of coins, a tax stamp on the net | – |
| 20 | **Alliance** | Signed (both coins) | "12h pact" | No raids/Heists between the two coins; holders can Battle cry for each other; a helping ally gets 25% of spoils | Two coin banners tied together with a rope knot | – |
| 21 | **Harvest** | Signed | "Pay the faithful" | Reward pool pays 2% (L3) / 3% (L4) of what's left to wallets that did a gm in the last 6h; caster takes 10%, signers get double tickets | A scythe and wheat field at sunset, coins as the grain | – |

---

## 5. Mythics (gold)

| # | Card | Way | Face text | Full rule | Art brief | Demo |
|---|---|---|---|---|---|---|
| 22 | **Supernova** | Contested + signed | "Inferno and Storm at once" | Pot burns 30% + 1 NEAR per 2 NEAR fuel (up to the daily cap) and a Storm with an 8% hit. Once per 48h | A star exploding behind the coin's logo, the shockwave cracking the frame | – |
| 23 | **Conquest** | Signed | "Total war, no shield" | Raid any coin of the same or higher level, ignoring its shield: 5 rounds, spoils 40%. Lose: pay 20% of your own pot | A crown on a sword planted in a map, the target coin's banner burning | – |

---

## 6. Omen icons [roadmap]

Omens aren't cards; they show as a banner. One round icon each (64 px), violet ring.

| Omen | Icon brief |
|---|---|
| Ghost Ember | a translucent coal |
| Squall | a small rain cloud with a lightning tick |
| Treasure | a chest with a sparkle |
| Oracle | an eye in a circle |
| Full Moon | full moon with a bolt |
| Iron Vault | a lock with a rivet ring |
| Windfall | a leaf blown by wind with a coin |
| Thunder | a thunderbolt on a sell arrow |
| Gold Rush | a pickaxe with a blue gem |
| Drought | a cracked ground tile with an ember |
| Low Tide | a wave line dropping |
| Blood Moon | a red moon |
| Fog | three wavy grey lines |

---

## 7. Other art the demo needs

| Asset | Brief |
|---|---|
| Pack | a sealed card pack with the coin's colour and ticker; tear animation on open |
| Deck stack | a small stack of face-down cards on the coin page (Rare+ drops fly back here) |
| gm button | a sun rising over a coin |
| Ritual ring | a ring of candles filling up; lit candles = progress |
| Vault | a round safe door; spinning dial when locking |
| Raid slot | an empty card outline with "Round 1/2/3" |
| Level badges | seed (L1), sprout (L2), flame (L3), crown (L4), diploma (graduated) |
