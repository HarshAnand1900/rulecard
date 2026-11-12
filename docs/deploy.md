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
- Public testnet RPCs rate-limit (HTTP 429). The bot scripts space their requests (250 ms; change with `RULECARD_RPC_GAP_MS`) and back off on 429; the app retries too and polls every 10 s on testnet. For heavier use put a dedicated RPC in `VITE_NODE_URL` and the bots' keys file.
- Gas is real testnet NEAR: a bot spends roughly 0.02 NEAR an hour at `--every 600`. Bots keep about 0.3 NEAR of gas money after buying in and sell a little of their tokens when they run low; top bots up
  from your account if judging runs longer (or lower the rate with `--every 900`).
- The bots must keep running through judging. Your laptop is fine while you're awake; for 24/7 use any small always-on machine
  (a VPS, a Raspberry Pi, a free-tier container): clone the repo, copy `sandbox/.keys/testnet.json` there (never commit it), `npm install`, run the command above under `pm2`, `tmux` or a systemd unit.

## 2b. Keeping the bots running without your laptop

You need *something* that stays on. What kind depends on what you want judges to be able to do:

| Option | Cost | Keeps the world alive (check-ins, trades, packs, Ritual, burns) | Answers a judge's raid or card in time |
|---|---|---|---|
| **GitHub Actions** (`.github/workflows/bots.yml`) | free in a public repo | yes, one tick every 30 min (GitHub can run it late) | **no**: demo-mode windows are 75 s to 15 min, a tick every 30 min is too slow |
| **An always-on machine** running `Dockerfile.bots` (a $4-5/month VPS, Oracle Cloud's Always Free VM, Fly.io, Railway, a spare PC or Raspberry Pi) | $0-5 a month | yes | **yes**: a tick every 2 minutes |
| Your laptop | free | only while it's awake | only while it's awake |

Recommended: turn on the Actions workflow now (free, nothing to host) so the world never goes fully dead, and put `Dockerfile.bots`
on an always-on machine if you want judges to be able to start a raid or play a card and see bots respond.

**GitHub Actions:** push the repo, then in *Settings → Secrets and variables → Actions* add a secret `BOT_KEYS` whose value is the
whole contents of `sandbox/.keys/testnet.json` (16 testnet bot keys; never commit that file). Run the **Bots** workflow once by hand
from the Actions tab to check it works.

**Always-on machine:**
```bash
docker build -f Dockerfile.bots -t rulecard-bots .
docker run -d --restart unless-stopped -e BOT_KEYS="$(cat sandbox/.keys/testnet.json)" rulecard-bots     # BOT_EVERY=120 seconds by default
docker logs -f $(docker ps -q --filter ancestor=rulecard-bots)
```
The keys are passed at run time and are not baked into the image. The bots make each day's Ritual (they check in and lock enough
NEAR), so the coin page shows "made" and a growing streak.

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

## 4. Practice mode: play with no wallet

The hosted app opens on two doors: **PLAY** (practice) and **PLAY WITH MY OWN TESTNET WALLET**.

**PLAY** makes a throwaway wallet in the visitor's browser (an ordinary NEAR key kept in local storage), asks a small sponsor
function for 0.5 testnet NEAR, buys a first bag and walks them through a 7-step guided first run. Every step is a real transaction
signed locally, so there are no popups. The coins have no value. A visitor can back up the key from the *Practice* menu.

The sponsor is `api/fund.mjs`, a Vercel Node function. Set it up once:

```bash
# 1. a separate faucet account, funded from your own (dry run first, then --yes)
node sandbox/create-faucet.mjs --account YOU.testnet --credentials "C:/path/to/your-key.json" --amount 6
node sandbox/create-faucet.mjs --account YOU.testnet --credentials "C:/path/to/your-key.json" --amount 6 --yes
```
2. On Vercel, add these environment variables (Project → Settings → Environment Variables). The key is in `sandbox/.keys/faucet.json`:

| Variable | Value |
|---|---|
| `FUND_ACCOUNT_ID` | `faucet.YOU.testnet` |
| `FUND_PRIVATE_KEY` | the `private_key` from `sandbox/.keys/faucet.json` (a secret: never commit it) |
| `FUND_AMOUNT_NEAR` | `0.25` (sent to each new practice wallet) |
| `FUND_KEEP_NEAR` | `1` (the sponsor stops when its balance would fall below this) |
| `FUND_PER_IP_HOUR` | `3` (wallets one visitor address can fund per hour) |
| `VITE_NETWORK` / `VITE_FACTORY_DEMO` | `testnet` / `demo.YOU.testnet` |

What the sponsor will and won't do: it only funds brand-new accounts (a 64-hex-character implicit name), at most once each, never more
than `FUND_AMOUNT_NEAR`, and it stops when it is nearly empty, answering "use your own wallet instead". Testnet NEAR has no value, so
the worst abuse is draining the sponsor; refill it from your account whenever it runs low (about 10 practice wallets per 6 NEAR).

**Testing it locally without spending anything:** `npm run dev -- --mode practice` runs the same flow against the local sandbox, with
one of the sandbox accounts as the sponsor (needs `./sandbox/start.sh`, `node sandbox/deploy.mjs` and `node sandbox/seed.mjs`).

## 5. Sounds

The app plays short synthesized sound effects (gm, lock, buy and sell, packs, burns, Inferno, sirens, Ritual made or missed, raids,
level-ups, a jester's laugh when a coin misses its Ritual, a sad trombone when a raid is lost, an Omen sting). They're generated with the Web Audio API, so there are no audio files, and the 🔊 button in the header mutes them (the
choice is remembered). Browsers keep audio locked until the first click, so nothing plays before that. The 🔊 menu has a volume slider and a list to
preview every sound.
