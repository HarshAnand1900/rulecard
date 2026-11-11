# Rulecard

**A memecoin that only survives if its holders show up.**

```
 every 6h: holders say gm ──► today's Ritual (X wallets gm + Y NEAR locked)
                                   │
              made ◄───────────────┴───────────────► missed
   the pot buys & burns 5% of itself            idle burn ×2 for 6h
   (supply drops, price floor rises)            (sleeping bags shrink faster)

 don't show up for 12h ──► 1% of your unlocked bag burns every 6h (half burned, half paid to the Vault)
 lock in the Vault     ──► safe from every burn, and you earn what the sleepers lose
```

That loop is the coin. Everything else (rule cards the crowd plays together, raids against other coins, levels) is how it
gets wild. Every NEP-141 coin is its own contract, every number is fixed at launch, and nobody holds an admin key: the factory
deletes its own key in its deploy transaction.

Live demo: *(link added after the testnet deploy)* · Track: **Memecoins With Mechanics** (NEAR). Judges score the mechanic,
so this README is mostly about the mechanic.

---

## The mechanic in one minute

| Ritual | What you do | What the coin does |
|---|---|---|
| **gm** | tap once every 6h | +1 Energy for the coin, your idle clock resets, counts toward today's Ritual |
| **Daily Ritual** | the coin needs X wallets to gm and Y NEAR to be locked today | made: the pot buys and burns 5% (7% on a 3-day streak). Missed: idle burn ×2 for 6h |
| **Vault** | lock tokens for 6h / 24h / 72h | locked tokens are safe from every burn and earn half of what idle burn and early exits take |
| **Idle burn** | nothing (that's the point) | after 12h without a gm, 1% of your *unlocked* tokens every 6h: half burned, half to the Vault |
| **Cards** | claim 2 cards every 6h; play them with other holders | Ember and Inferno burn from the pot; Prophecy is a 2h crowd bet; raid tactics fight other coins |
| **Raids** | sign, plan 3 hidden tactics, buy, lock and Battle cry in 3 rounds | the loser's pot pays 15% to the winner, which buys and burns its own tokens |

**Supply reacts to the community:** active wallets and lockers keep their tokens; idle wallets shrink; the Ritual and pot cards
burn supply when the crowd shows up. Every mint and burn is logged on-chain and shown on the coin page.

## Demo mode and Real mode

The same contract code is compiled twice, and the app has a **Demo / Real** switch:

| | Demo | Real |
|---|---|---|
| Game NEAR amounts (curve, levels, seeds, caps) | ÷100: L2 needs ~6 NEAR in the curve, a seed is 0.05–1 NEAR | full size: L2 needs 625 NEAR, seeds 5–100 NEAR |
| Time | ÷12: gm every 30 min, a Ritual "day" is 2h, raid rounds 100 s | real: gm every 6h, Ritual per UTC day, raid rounds 20 min |
| Rules, percentages, caps, odds | identical | identical |
| Contracts | its own factory and coins; `get_params` says `mode: "demo"`, `near_scale: 100`, `time_scale: 12` | its own factory and coins, `mode: "real"` |

Demo mode exists so judges can play a whole game (rituals, levels, cards, a raid) with faucet testnet NEAR and in minutes.
In demo mode the coin page has a **Demo tour**: Buy → gm → Lock → Claim a pack → Back or play a card → Join a raid, each step
ticked from the player's real on-chain state. A **bot runner** (`npm run bots -- --mode demo`) keeps the demo world alive: bots
check in, trade, lock, claim packs, back and fuel cards, bet, start raids, fill plans, Battle cry and settle.

**Discover** has two lists: **Live** coins (still on their curve, the game is on) and **Graduated** coins (a Hall of Fame:
final market cap, graduation time, burns, raid record, creator escrow). Graduated coins close buys and the game; holders can
still sell back to the curve. Moving graduated liquidity into a Ref Finance pool is the next roadmap step.
Real mode is the same game with the numbers we'd ship. Storage deposits are real NEAR in both.

## How the track requirements are met

| Requirement | Where |
|---|---|
| An NEP-141 token with the mechanic **in the contract** | every coin is its own contract `<symbol>.<factory>` ([contracts/coin](contracts/coin/src/lib.rs)): `ft_transfer`, `ft_transfer_call`, `ft_balance_of`, `ft_total_supply`, `ft_metadata`, storage registration. All game logic is in the same contract |
| All parameters set at launch and readable; **no admin key** | constants in the code + creator choices frozen in `new`; read them all with `get_params` (it returns `admin: null`). No owner methods, no upgrade path. The factory has no owner methods, the coin code it deploys is stored once, and **its only access key is deleted in the same deploy transaction** (check: the factory account has zero access keys on the explorer), so nobody can create an impostor coin account under it |
| Sybil resistance, limits written plainly | [below](#sybil-resistance-what-this-does-and-doesnt-stop) |
| A page with current state, today's progress and a log of every mint and burn | the coin page: stats strip, **Today** tab (Ritual + level checklist), **Log** tab (every mint and burn, from `get_log`), price chart with event markers. Every mint/burn is also a NEP-297 `nep141` event |
| Simulate first, then pick parameters | [`research/`](research) and [below](#simulations) |

## Architecture

```
factory (rulecard.<network>)          one per deployment, no admin
  └── create_coin(name, symbol, rules) + seed  ──►  <symbol>.rulecard.<network>   one contract per coin
                                                     ├─ NEP-141 token (1,000M minted once at launch)
                                                     ├─ bonding curve + pot + creator escrow
                                                     ├─ gm, Energy, Daily Ritual, levels
                                                     ├─ Vault, idle burn (one 8% daily loss cap)
                                                     ├─ deck, packs, card table (Ember, Prophecy, Inferno…)
                                                     └─ raids ◄── cross-contract with sibling coins ──►
```

- **No loops over holders.** Idle burn, Vault earnings and raid cards are applied to a wallet *when that wallet is next used*;
  `ft_balance_of` already shows what's due. Anything time-based moves forward on the next call, and anyone can call `poke()`.
- **Raids between contracts.** Coins trust only siblings created by the same factory (they run the same fixed code). Each coin
  scores its own rounds; at the end one cross-contract exchange settles the raid and moves the spoils.
- **The curve always pays out.** Burns raise the price so that selling every circulating token pays out exactly the real NEAR
  in the curve ("floor lift"); reward-pool releases lower it the same way. Tested on every path.

## Parameters (all fixed, all readable with `get_params`)

Values below are **Real mode**. Demo mode divides every game NEAR amount by 100 and every duration by 12.

| Group | Values |
|---|---|
| Supply | 1,000,000,000 tokens, 18 decimals: 793.2M sold by the curve, 50M reward pool (locked), 156.8M kept for the DEX pool at graduation |
| Curve | virtual reserves 1,392 NEAR / 1,073M tokens. Graduates when the curve sells out: ~3,946 NEAR in the curve, ~19,074 NEAR market cap |
| Fees | 2% per trade: 0.3% protocol · 0.2% creator escrow (paid only at graduation) · 1.5% pot. Creator seed 5–100 NEAR, all into the pot |
| Levels (L2 / L3 / L4) | market cap 2,725 / 5,450 / 9,537 NEAR · real NEAR 625 / 1,461 / 2,382 · volume 24h 900 / 3,600 / 9,500 · check-ins 24h 15 / 40 / 100 · net buying 1h ≥ 0 · age 30m / 3h / 12h · held 15 / 30 / 60 min |
| gm | once per 6h, wallet worth ≥ 1 NEAR. Qualified holder = ≥ 2 NEAR held for 1h |
| Idle burn | after 12h without gm: 1% per 6h (2% with the Ruthless rule), half burned, half to the Vault |
| Daily loss cap | one cap: at most 8% of a wallet's unlocked tokens per UTC day, for everything the coin takes |
| Vault | 6h / 24h / 72h at weight ×1 / ×1.5 / ×2; a wallet counts for at most 0.5% of supply; leaving early costs 20% (half to lockers, half burned) |
| Energy | +1 per gm, +1 per 10 NEAR of net buying (a trade counts for at most 20 NEAR); max 100. Cards cost 5 / 20 / 50 |
| Pot | spends at most 75% of itself per day |
| Ritual | gm target = 60% of yesterday's gm wallets (min 10); lock target = 50% of yesterday's new locks (min 10 NEAR); burn 5% (7% on a 3-day streak) |
| Packs | 2 cards per 6h after a gm; starter set Rally, Curse, Ward; level drops 3 cards. Odds by level: L1 C90 R8 E2 · L2 C85 R10 E5 · L3 C50 R20 E20 M10 · L4 C40 R25 E25 M10 |
| Deck limits | Rares 1 per 2 eligible holders (min 8), Epics 1 per 5 (min 4), Mythics 1 per 12 (min 2). Unplayed Rare+ cards fade back to the deck after 24h. Hand: 12 Commons, 3 Rares, 3 Epics, 1 Mythic |
| Cards | Ember: 3 / 6 / 10 copies → pot burns 1 / 2 / 3%, stoke ≤ 5 NEAR. Prophecy: 2–3 backers, 20-min bets, 2h answer, losers lose half (30% winners, 10% caster, 10% burned), min 8 wallets. Inferno: 3 / 3 / 5 / 8 signers, fuel ≤ 20 NEAR each and ≤ 10% of curve NEAR in total, locked 24h at ×2 with +5%, pot burns 10% + half the fuel (max 50%, 75% at L4) |
| Anti front-running | tokens bought while Ember or Inferno is on the table are tagged; selling them before 1h after it fires pays 10% to the pot (the tag follows transfers). Prophecy bettors can't trade until it resolves |
| Raids | from L2; signers 3 / 5 / 8; Muster 30 min, 3 rounds × 20 min; score = 100 + Buy (±12) + Crowd (0–6) + Lock (0–6), × the side's tactic (Rally ×1.05–1.10, Curse ×0.95–0.90, Ward reflects Curse); spoils 15% of the loser's pot (20% with War Coin); +3% on sells during a raid; one raid per 8h, 12h shield, one attack per 12h, none at ≥ 90% sold |
| Creator rules (up to 3) | Launch Guard, Paper Tax, Soft Tax, Whale Cap, Creator Lock, Ruthless, War Coin, Peace Coin (+ Fair Launch, Hold the Line, Wild Coin on the roadmap) |

## Sybil resistance: what this does and doesn't stop

**What it stops**
- **Free farming of check-ins.** gm needs a wallet worth ≥ 1 NEAR; level and Ritual counts need ≥ 2 NEAR held for 1h. A fake crowd costs real NEAR that sits in the curve.
- **Whales carrying a raid or the Vault.** One wallet counts for at most 20 NEAR of Buy per round, 0.5% of supply of Lock per round and 0.5% of supply of Vault weight.
- **One wallet firing coin-wide cards.** Ember needs 3 wallets with their own copies; Prophecy needs backers; Inferno needs qualified signers who can sign once per 30 min.
- **Draining the reward pool.** Every payout is capped (Inferno bonus 0.1% of supply per play; Vault earnings come only from tokens taken from others).
- **Counting the same tokens twice for the Ritual.** A wallet's locks count only above what it already had counted that day, so unlock-relock loops add nothing.
- **Sandwiching pot burns.** Fuel is capped at 10% of the curve's NEAR and buys during a pot card are tagged; with both, the simulated sandwich loses money.
- **Hedging a Prophecy with two wallets.** 20% of the losing side always leaves (10% burned, 10% to the caster), so betting both sides loses.

**What it doesn't stop (honest limits)**
- **Storage is paid per holder.** Each wallet pays 0.0125 NEAR once (1.25 KB, the largest a holder record gets) and the coin account starts with 5 NEAR for its code and fixed-size logs, so holder growth never eats curve NEAR. If a future change made records bigger without raising that charge, storage could start locking curve NEAR and the last sellers' transactions could fail.
- **Contracts can't gm.** Tokens held by another contract (an escrow, a future DEX pool, NEAR Intents) are a normal holder here and would idle-burn. The coin's own reserves (curve stock, reward pool, DEX reserve, Vault, bets) are never burned. Exempting pool accounts is part of the Ref Finance graduation work.
- A whale can split a bag across many wallets. Per-wallet caps then apply per wallet; it costs gas and storage, not much more.
- A bot can gm every 6h forever and never be idle. That is allowed: being there is the ritual. The Vault exists so humans can be safe without being online.
- Raid plans are hidden from the app, but contract state is public: a determined player can read the other side's plan. Commit-reveal is on the roadmap.
- **Raids trust sibling coins**, i.e. accounts directly under the factory. That's safe only because the factory has no key and deploys one fixed code; the defender also works out the spoils rate itself and never takes it from the caller.
- A bettor can fake a Prophecy **Crowd** answer with fresh wallets that each buy 1 NEAR worth and sell it back: about 0.05 NEAR per fake wallet (fees + storage), against a payout of 30% of the losing side. Registering alone no longer counts, but small Crowd markets are still gameable.
- A bettor can push a Prophecy **Line** or **Vault** answer with a second wallet (buying or locking). It costs real fees, slippage and a 6h+ lock, and bettors' own wallets can't trade, but it isn't impossible.
- Randomness (card rolls, fire times) uses NEAR's block random seed. Good enough for a demo, not for large stakes.
- "Eligible holders" for deck limits are counted as wallets that checked in within 24h while eligible (to avoid loops), so they can lag reality by up to a day.

## Simulations

Every parameter above came out of a simulator in [`research/`](research) (Node, no dependencies: `node research/<file>`).

| Simulator | Question | What it decided |
|---|---|---|
| `card-supply-sim.cjs` | Do players have the raid cards their side wants? | 2 cards per 6h + 3-card raid-win pack: 83–97% full raid plans, but 1 slot in 3 still missing the wanted card (pacing matters) |
| `pyramid-sim.cjs`, `odds-v7-sim.cjs` | How many Rare / Epic / Mythic cards should exist? | limits that grow with eligible holders keep ~1 in 3 eligible holders with a Rare, 1 in 6 with an Epic at every coin size; at L3–L4 89–99% of Rare+ rolls hit the limit, so the limit (not the odds) decides supply |
| `signers-sim.cjs` | How many signers can a coin really gather in 15 min? | 3 / 5 / 8 are reached 66–100% of hours on small coins; the first guess (10 / 20 / 30) blocked 80–100% of plays |
| `redteam-sim.cjs` | What breaks? | uncapped fuel let a bot earn +20–25% by sandwiching → fuel cap + tag; casual players lost 8.6%/day with separate caps → one 8% cap; last-block contest sniping won 92% → bonus only for early chips |
| `drop-tables-sim.cjs`, `mix-sim.cjs`, `fund-sim.cjs`, `sim-v3.cjs` | earlier versions (pot sizing, push sizes, fee split) | sizing A ($70k graduation), the 2% fee split, the 75% daily pot cap |

## What's in this build vs the roadmap

**Built and tested** (`npm test`: 49 coin tests and 7 factory tests, each run at real and demo scale): factory, NEP-141 coins, curve and fees, gm, Energy, Daily Ritual,
levels and level drops, Vault, idle burn, the daily cap, packs, deck limits, Fade, make-room-first, Ember, Roll Call, Hype Siren,
Prophecy (Bold bets), Inferno, tags and bet locks, raids with plans, Battle cry, scoring, spoils and win packs, price history, the log.

**Roadmap (designed in [`docs/v6-redesign.md`](docs/v6-redesign.md))**: Fire-vs-Stop contests and the contested cards (Storm,
Black Hole, Whale Tax, Heist, Supernova), Plunder, Omens, Prophecy Safe bets and pack Duels, more Rares and Epics, Mythics, Card
NFTs and a market, Hold the Line, commit-reveal raid plans, graduation into a DEX pool.

## Run it locally

Needs Node 20+ and Docker (contracts build and the local NEAR sandbox run in containers).

```bash
npm install
docker build -t rulecard-builder -f contracts/Dockerfile.build contracts   # once
npm test                       # contract tests (coin + factory, real and demo scale)
npm run contracts:build        # 4 wasm files → contracts/out/ (coin and factory, real and demo)
./sandbox/start.sh             # local NEAR sandbox on 127.0.0.1:3030
node sandbox/deploy.mjs        # real + demo factories and test accounts (local test keys, gitignored)
node sandbox/seed.mjs          # 3 coins in each mode (+ a graduated demo coin), trading history, packs
npm run bots -- --mode demo --forward 5   # keep the world moving (sandbox: +5 min of chain time per tick)
npm run dev                    # http://127.0.0.1:5173
```

In sandbox mode the header has a player switcher and buttons that move the chain clock (+15m … +1d) so timers can be shown live.
`./sandbox/reset.sh` wipes the local chain.

## Run against testnet

```bash
cp .env.example .env.testnet   # set VITE_FACTORY_DEMO and VITE_FACTORY_REAL to the deployed factories
npx vite --mode testnet         # Connect wallet: MyNearWallet or Meteor
```

## Repo map

| Path | What |
|---|---|
| `contracts/coin` | the coin contract (Rust, near-sdk 5) |
| `contracts/factory` | the factory |
| `src/app/chain` | the web app (React + Vite): Discover, Launch, coin page, price chart, wallet sign-in |
| `sandbox/` | local chain scripts |
| `research/` | simulators |
| `docs/` | design (`v6-redesign.md`), build plan, UI spec (`ui-updates.md`), card designs |
