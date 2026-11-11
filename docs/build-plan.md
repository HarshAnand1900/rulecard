# Rulecard build plan (hackathon demo core)

Status: **building. Done: `contracts/coin` (NEP-141, curve, fees, events, get_params, gm, Energy, Vault, idle burn with the one 8% cap, Daily Ritual, levels, packs, deck limits, Fade, level drops, card table with Ember, Roll Call, Hype Siren, Prophecy, Inferno, tags and bet locks, raids between sibling coins with plans, Battle cry, Buy/Crowd/Lock scoring, spoils and win packs; 41 tests) and `contracts/factory` (global-contract launches, registry, no admin; 5 tests, wasm 167 KB). Web app (`src/app/chain`): Discover, Launch, and the coin page with Trade, Today, Cards, Vault, Raid and Log tabs, tested end to end on the local sandbox (launch, buy, lock prompt, level drop, Prophecy backing and bets, a full raid between two coin contracts with spoils, mint/burn log). Next: testnet deploy (needs your OK), wallet sign-in for testnet, README. Design frozen after the red team (2026-11-11, `research/redteam-sim.cjs`).** Deadline: submission closes **2026-11-14 23:59 UTC**.
Design source: [`v6-redesign.md`](v6-redesign.md) (game) + Part A of [`reference.md`](reference.md) (curve, fees, levels). Everything not listed under "In the build" stays in the README as the roadmap.

---

## 1. What the track judges (Memecoins With Mechanics)

> "Build memecoins where the meme does something: supply that reacts to the community, treasuries with rules, onchain rituals and challenges. Judges score the mechanic, and the price chart doesn't count."

| Requirement (track text) | How we meet it | Status |
|---|---|---|
| An **NEP-141 token** with the mechanic **in the contract**, not a backend | every coin is a real NEP-141 from launch; all game logic is on-chain | ❌ current contract has no NEP-141 |
| **All parameters set at launch** and readable by anyone; **no admin key** that can change them | parameters stored at launch, exposed by a `get_params` view; no owner methods, no upgrade key | ❌ to build |
| **Sybil resistance** good enough for a demo, limits written plainly in the README | Holding thresholds + hold time, per-wallet caps, signers limited to 1 per 30 min; README section "What this does and doesn't stop" | ❌ to write |
| **A page** with the current state, today's progress and a **log of every mint and burn** | coin page with Energy, check-ins today, Vault, pot, level progress, and an event log | ❌ to build |
| **Simulate first**, then pick parameters | `research/*.cjs`; charts in the README | ✅ done, charts to make |

**Pitch rule:** lead with the mechanics (rituals, Vault, idle burn, raids, Prophecy), not price pushes. The price chart doesn't score.

---

## 2. In the build (demo core)

| # | Feature | From | Notes |
|---|---|---|---|
| 1 | **Launch a coin**: name, ticker, image, creator rules (pick up to 3), seed ≥ 5 NEAR | ref A3c, v6 §7 | parameters frozen at launch |
| 2 | **NEP-141 token** per coin: `ft_transfer`, `ft_transfer_call`, `ft_balance_of`, `ft_total_supply`, `ft_metadata`, storage management | track | 1,000M supply minted once at launch to the curve and the reward pool (one `ft_mint` event) |
| 3 | **Bonding curve** buy / sell, 2% fee (0.3% protocol / 0.2% creator escrow / 1.5% pot), solvency invariant | ref A2–A3 | virtual 1,392 NEAR / 1,073M tokens; graduation at $70k market cap |
| 4 | **Levels L1–L4** with the rule checklist and hold time | ref A4 | |
| 5 | **gm check-in** every 6h → +1 Energy, pack timer, idle clock | v6 §1 | |
| 6 | **Energy** from check-ins and net buying | v6 §1 | |
| 7 | **Vault** (lock 6h / 24h / 72h), **idle burn** (1% per 6h after 12h), one 8% daily loss cap, "Lock 24h?" after each buy | v6 §3 | burns emit `ft_burn` when they are applied (see "How hits work" below) |
| 7b | **Daily Ritual**: gm + lock goal per UTC day, pot burn 5% if made, idle burn ×2 for 6h if missed | v6 §3c | the page's "today's progress" bar |
| 8 | **Packs** (2 cards / 6h), v7 drop tables, make-room-first, pyramid limits (fixed eligibility), live stock per card, 24h Fade | v6 §4 card supply | cards stored in the coin contract (not NEP-171) |
| 9 | **Playing cards**: Solo / Backed / Signed, small fixed signer counts, pack timer cut for helpers (−10 / −15 min), tagged buys (tag follows transfers) | v6 §2 | one state machine: backing → fire. Contests are roadmap |
| 10 | **Cards**: Rally, Curse, Ward, Ember (pot + stoke), Prophecy (Bold bets, caster cut, no Draft), Inferno (pot + fuel, fuel capped at 10% of curve NEAR) | v6 §5 | Safe bets, pack Duel and the Draft are roadmap |
| 11 | **Raids** (cut first if behind): started by 3 / 5 / 8 signers, Muster, 3-slot hidden plan, 3 rounds, score = Buy + Crowd + Lock (1 point per wallet max), settings frozen at start, pot spoils | v6 §4 | each coin scores its own rounds; **one cross-contract settlement at the end**. Plunder is roadmap |
| 12 | **Events (NEP-297)** for every mint, burn, reward release, card play and raid result | track | the page's log reads these |
| 13 | **Coin page**: state, today's progress, Energy, Vault, pot, level checklist, mint/burn log | ui-guide 4.3 | |
| 14 | **README**: every parameter, sybil limits, simulation charts, what's in the demo vs the roadmap | track | |

## 3. Not in the build (README roadmap)

Fire-vs-Stop contests and every contested card (Storm, Black Hole, Whale Tax, Heist, Supernova); Plunder; the Prophecy Draft, Safe bets and pack Duel; Card NFTs (NEP-171) and the Card Market; Rares beyond Prophecy; other Epics (Black Hole, Heist, War, Whale Tax, Alliance, Harvest); Mythics; Omens; Mastery; Hold the Line; War Chest; Duel; Wild cards and Salvage; graduation to a DEX pool (shown as "graduates here" in the demo).

---

## 4. Contract shape (to decide before coding)

| Option | How | For | Against |
|---|---|---|---|
| **A. Factory + one contract per coin** (recommended) | `rulecard.near` deploys `<ticker>.rulecard.near`; each coin contract holds its token, curve, pot, Vault and cards | each coin is a true NEP-141 that wallets and explorers see; matches the track | raids need cross-contract calls; each deploy costs storage NEAR (check NEAR global contracts to share code) |
| B. One contract, many coins | all coins inside one contract | simplest raids, cheapest | coins are not separate NEP-141 tokens, which fails the track's first requirement |

Raids under option A: each coin contract records its own round scores. At the end, the attacker calls the defender once to read its three round scores, decides the winner, and spoils move NEAR from the loser's pot to the winner by a callback. One cross-contract exchange per raid, not one per round.

**How hits work (no loops over holders).** NEAR has no timer and a transaction can't touch every holder.
- Idle burn, the Daily Ritual's ×2 and (later) Storm, Squall, Black Hole and Plunder are all applied **when a wallet is next used** (buy, sell, transfer, gm, lock), from values stored per wallet (last gm time, last applied hit) and per coin (a list of coin-wide hits). The 8% daily cap is checked at the same moment.
- `ft_balance_of` works out the pending burn in the view, so wallets see the right balance. `ft_total_supply` shows burns already applied; the page says so.
- The only exemption in the demo is tokens in the Vault.
- Anything time-based (random-block fire, Fade, round ends, the Ritual check at 00:00) happens on the next call. A public `poke()` lets anyone move it forward.

**No admin anywhere:** the factory has no owner methods after deploy; coin contracts have none; the protocol fee account is fixed at factory deploy.

---

## 4b. Simplifications in the demo contract (say these in the README)

- **Eligible holders** for deck limits are wallets that did a gm in the last 24h while eligible (no loop over holders).
- **Random fire time** for pot cards comes from the block's random seed when the window closes; good enough for a demo.
- **Prophecy questions:** Line, Tide, Crowd and Vault. Raid and Burn questions come with raids.
- **Deck:** Rares are only Prophecy, Epics only Inferno, no Mythics yet, so a Mythic roll falls to Epic. Hedge's Common share goes to Ember.
- **Creator Lock** limits each move to the unlocked share of the creator's current bag.
- **Raid plans** are hidden from the views, but contract state is public on-chain, so a determined player could read the other side's plan. Commit-reveal is roadmap.
- **Raid trust:** coins accept raid calls only from accounts under the same factory (they all run the same fixed code).
- **Raid settlement** is one cross-contract exchange at the end (`settle_raid`, callable by anyone). A defender whose attacker never settles is freed after 6h.
- **Deserting fee** (+3% on sells during a raid) goes to the pot instead of being burned as NEAR can't be burned; the pot later buys and burns.
- **Coin storage:** the creator attaches 1 NEAR for the coin account; buyers pay 0.0025 NEAR once to register.

## 5. What exists today

- `contract/` (Rust, ~1,300 lines, v4 era): curve math, cards, raids, an NFT transfer, tests. **No NEP-141, no NEP-297 events.** Reuse the curve math and tests; the rest gets rewritten for v6.
- `src/` + `index.html` (Vite app) and `sandbox/` (deploy scripts): reuse the shell.
- `research/`: all simulators.

## 6. Order of work

1. Factory + coin contract with NEP-141, curve, fees, events, `get_params`. Tests for solvency and no-admin.
2. Levels, gm, Energy, Vault, idle burn.
3. Daily Ritual, packs and card play with Rally, Curse, Ward, Ember, Prophecy, Inferno.
4. Raids. **Checkpoint:** if steps 1–2 are not working with tests by the end of Nov 12, skip raids and go to step 5.
5. Coin page with the event log; Discover and Launch screens.
6. Testnet deploy, demo data, README with charts, demo video.
7. Submission (payload shown to you first; nothing sent without your yes).

## 7. Things to check before the build starts

- NEAR global contracts: available on testnet and mainnet, and what a coin deploy costs with and without them.
- NEP-141 storage deposit flow for buyers (who pays, how much).
- `env::random_seed` behaviour for random-block timing on testnet.
- meme.cooking (the track's launchpad partner): any integration or comparison worth a line in the README.
