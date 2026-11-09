# Rulecard

A memecoin launchpad where every coin plays **rule cards**. Built at NEAR HACKATHON.

Coins trade on a bonding curve. Cards that holders earn and play can move the price, but only with NEAR that is really there:
burns trigger a *floor lift*, which raises the price so that selling every token still pays out exactly the NEAR in the curve.
No minting, no NEAR taken out of the curve, selling is never blocked, and every big card is announced before it fires.

## Run it locally

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm test         # engine tests, including a random fuzz of the money rules
```

The local app runs the game engine in your browser with test NEAR and a crowd of bot players. Use the clock controls
(1×, 60×, 10m/s, 1h/s, +1h) to fast-forward. **Reset** rebuilds the world.

## How the game works

- **Levels** unlock cards as a coin grows (real NEAR in the curve): L2 at 5 NEAR unlocks Rare, L3 at 20 unlocks Epic, L4 at 60 unlocks Mythic, L5 at 120 graduates.
  A coin must stay above a level for 15 minutes to reach it. Level-ups drop cards to wallets that held for 1h *before* the level was crossed.
- **Rulebook**: the creator picks up to 3 rules at launch, locked forever: Launch Guard, Paper Tax, Hold the Line, Vault Seal.
- **Cards** are per-coin NFTs. Commons can't be transferred; Rare and above can be traded. Playing a card burns it and mints a Relic you can't transfer.
- **Pacing**: Commons and raid tactics use the Spark meter, Rares one slot per 15 min, Epics a full Ult meter, Mythics an Eclipse window twice a day.
  Each wallet can play once per 30 min and play one Epic or Mythic per 24h.
- **Caps**: card burns are limited to 5% of supply per 24h, pot spending to 50% per 24h, and the total sell fee to 3%.
- **Raids**: coin vs coin, 2h in 4 rounds. Score = net NEAR inflow relative to coin size × the round's tactic (Rally / Curse / Ward / Mirror).

## NEAR contract

`contract/` is the on-chain version of the same rules (Rust, near-sdk 5.30): exact integer math (yoctoNEAR, 18-decimal tokens,
256-bit intermediates, rounding in the pool's favour). Work that would loop over every holder is claim-based:

- **Hold the Line**: holders call `htl_register` during the event and `htl_claim` after it.
- **Level-up drops**: `claim_level_drop`, with the tier set by Conviction share.
- **Raids**: stakers call `raid_claim` after the raid; burns and spoils use per-side totals.

Anyone can call `crank` to advance a coin's drips and timers.

Live on-chain now: buy/sell with min-out, fee pot, floor lift, burn and pot caps, the 4 rules, levels, Spark/Ult/Rare/Eclipse pacing,
per-wallet limits, card NFTs (Card of the Day, level drops, sacrifice, craft, transfer of Rare+), and Tax Holiday, Roll Call, Hype Siren,
Rebrand, Slow Burn, Happy Hour, Diamond Pool, Inferno, Black Hole, Supernova, and **raids** (Friendly / Hard, Rally / Curse / Ward / Mirror
tactics, hard-raid spoils dripped over 1h, claim-based payouts via `raid_claim`). Summoning Circle and Prophecy still run only in the local engine.

The contract builds and tests inside Docker (on this Windows machine, Smart App Control blocks Cargo's build scripts on the host):

```bash
cd contract
docker build -t rulecard-builder -f Dockerfile.build .
./dcargo.sh test                                   # 16 tests incl. a random fuzz of the money rules
./dcargo.sh 'near build non-reproducible-wasm && mkdir -p /work/out && cp /target/near/rulecard.wasm /work/out/'
```

## Play it on a local NEAR chain

A local NEAR sandbox node runs in Docker. The app's **Sandbox chain** mode (bottom-right switch) sends real transactions to it.

```bash
npm run sandbox:start     # NEAR sandbox node on http://127.0.0.1:3030 (Docker)
npm run sandbox:deploy    # deploys contract/out/rulecard.wasm, creates you/alice/bob + 8 bot accounts
npm run sandbox:seed      # optional: demo world, $MOTH and $ZAP at level 2, a Friendly Raid card for you
npm run sandbox:bots      # optional: bots trade, check in and play cards on-chain
npm run dev               # open http://127.0.0.1:5173 and pick "Sandbox chain"
npm run sandbox:reset     # wipe the chain and its keys
```

Use **+15m** and **+1h** in the app to fast-forward blocks, so timers, level-ups and drips can be seen without waiting.
Test keys are generated locally into `sandbox/.keys/` (gitignored) and served only by the dev server.

## Layout

```
src/engine/   TypeScript game engine + tests (source of truth for the rules)
src/app/      local React app and bot crowd
contract/     NEAR contract (Rust) + tests
sandbox/      local NEAR node, deploy and bot scripts
src/app/chain on-chain mode of the app
research/     design lab and the simulations that set the numbers
```

Status: local prototype. Nothing is deployed.
