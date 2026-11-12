# Deploy: testnet world, hosted app, bots

Everything here is **testnet** (free faucet NEAR). Nothing in this repo touches mainnet.

## 1. The testnet world (one command, dry run first)

```bash
npm run contracts:build                       # once; needs Docker
# put your testnet key in ~/.near-credentials/testnet/<account>.json  { "account_id": "...", "private_key": "ed25519:..." }
node sandbox/deploy-testnet.mjs --account YOU.testnet --credentials "C:/path/to/file.json"        # dry run: prints the plan and the cost
node sandbox/deploy-testnet.mjs --account YOU.testnet --credentials "C:/path/to/file.json" --yes  # sends it
```

It creates `demo.YOU.testnet` (the demo-scale factory), **deletes that account's only key in the same transaction**, creates 16
bots with 1.3 NEAR each, and launches `$FROG` and `$MOTH`. It prints the two `.env.testnet` lines. Cost: about 37 NEAR (6 for the
factory's code, 21 for the bots, 10 for two coins, plus gas), mostly storage that stays locked in the accounts.

Check the "no admin" proof on the explorer: `https://testnet.nearblocks.io/address/demo.YOU.testnet` shows **0 access keys**.

## 2. Push the coins to L2 and keep them alive

```bash
export RULECARD_KEYS=sandbox/.keys/testnet.json        # PowerShell: $env:RULECARD_KEYS="sandbox/.keys/testnet.json"
node sandbox/bots.mjs --mode demo --bootstrap --ticks 1   # all 16 bots buy in, wait ~6 min, check in, buy a second round for volume (about 12 min)
node sandbox/bots.mjs --mode demo --every 600              # then: a tick every 10 min, forever
```

- L2 needs 15 qualified check-ins inside the 2-hour window, ~6.25 NEAR in each curve and ~9 NEAR of volume. The bootstrap supplies all three.
- Gas is real testnet NEAR: a bot spends roughly 0.02 NEAR an hour at `--every 600`. Bots keep about 0.3 NEAR of gas money after buying in and sell a little of their tokens when they run low; top bots up
  from your account if judging runs longer (or lower the rate with `--every 900`).
- The bots must keep running through judging. Your laptop is fine while you're awake; for 24/7 use any small always-on machine
  (a VPS, a Raspberry Pi, a free-tier container): clone the repo, copy `sandbox/.keys/testnet.json` there (never commit it), `npm install`, run the command above under `pm2`, `tmux` or a systemd unit.

## 3. Host the app

The app is a static site. Build it with the factory address baked in:

```bash
VITE_NETWORK=testnet VITE_FACTORY_DEMO=demo.YOU.testnet npm run build     # → dist/
```

On Vercel or Netlify: import the repo, build command `npm run build`, output `dist`, and set the environment variables
`VITE_NETWORK=testnet` and `VITE_FACTORY_DEMO=demo.YOU.testnet` (optionally `VITE_NODE_URL`; the default is FastNEAR's public testnet RPC).
Then put the live URL at the top of the README ("Live demo").

A judge connects MyNearWallet or Meteor (testnet), buys with faucet NEAR, and can try one-tap gm.
The Real/Demo switch only appears when both `VITE_FACTORY_DEMO` and `VITE_FACTORY_REAL` are set; the hosted app is Demo only.
