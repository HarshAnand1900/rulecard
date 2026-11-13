# What a mainnet launch would cost

Nothing in this repo touches mainnet. This is an estimate from the built contract sizes and NEAR's storage price (1 NEAR locks 100 KB, so 0.00001 NEAR per byte). Multiply by the NEAR price on the day. Figures marked (check) should be confirmed against NEAR's current docs before spending anything.

## Onchain, one time

| Item | Size | Cost |
|---|---|---|
| Factory contract code | 171 KB | about 1.7 NEAR locked in the factory account |
| Coin code stored once in the factory (no global contract) | 407 KB | about 4.1 NEAR locked in the factory account |
| Deploy and init gas | | well under 1 NEAR |
| **Factory total, no global contract** | | **about 6 to 7 NEAR** |

Locked NEAR is not spent: it stays in the account for as long as the code is stored. Because the factory deletes its own key, it stays locked for good.

## Onchain, per coin

- **Without a global contract (what testnet uses):** every coin carries its own 407 KB copy of the code, about 4.1 NEAR, plus state. The factory asks the creator for a 5 NEAR storage deposit. The creator pays it, so the project pays nothing per coin.
- **With a global contract:** the code is published once, then each coin points at it and needs about 1 NEAR. Publishing costs more up front. Roughly 10 times the normal storage price is burned, so about 40 NEAR for this wasm (check). It pays off after about 10 coins.
- On top of the deposit the creator adds a seed of 5 to 100 NEAR, which goes into the bonding curve. That is liquidity, not a fee.

## Running costs

- **Gas:** a normal call burns a fraction of a milli NEAR, so players pay cents. Launching a coin and settling a raid use more, still well under 0.1 NEAR.
- **Bots:** the 16 bots would need real NEAR on mainnet. At a call every couple of minutes expect a few NEAR a month, plus the NEAR they play with. You can leave them out.
- **Hosting:** the site is static. Vercel's free tier is for non commercial use, so a real product would use a paid plan, about 20 USD a month (check). A domain is about 10 to 15 USD a year.
- **Faucet:** there is none on mainnet. The practice wallet only works on testnet, so a mainnet site would only offer the wallet door. Keep the demo on testnet.

## The costs that matter more

- **Audit.** Contracts that hold other people's NEAR should be audited first. Independent audits of a codebase this size typically run from 15,000 to 60,000 USD. The tests here (116 coin tests and 7 factory tests at both scales, plus long random fuzz runs that play every card, stake and omen) are not a substitute.
- **Legal.** Prophecy bets and a launchpad can count as gambling or securities activity in some places. Get advice for the countries you serve.
- **Immutability.** There is no admin key, so a bug cannot be patched. A fix means a new factory and new coins.

## Minimum to launch, in plain numbers

Technical minimum is about 7 NEAR for the factory, or about 50 NEAR if you publish a global contract, plus a few NEAR of gas headroom. A responsible launch adds the audit and legal advice, which cost far more than the chain does.
