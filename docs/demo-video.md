# Demo video (90 seconds) and submission text

Record on **demo mode** (testnet, or the local sandbox with the +15m / +1h buttons). Keep every shot to what a judge can repeat.
Say the loop in the first 20 seconds: judges will match this to pump.fun, so show the meme *doing* something right away. Lead with the community and the fight between coins; idle burn is the cost of not showing up, not the headline.

## Shot list

| Time | On screen | Say |
|---|---|---|
| 0:00–0:08 | Discover: 2–3 live coins, then one graduated coin in the Hall of Fame | "Every Rulecard coin is its own NEP-141 contract. A memecoin that only survives if its holders show up." |
| 0:08–0:25 | Coin page → Today tab. Press **gm**, the Ritual ring fills. Move the clock past midnight (+1h / +6h on the sandbox; the next 2h "day" on testnet) → Log tab: **Ritual made, pot burned**, supply number goes down | "gm every few hours. When enough holders check in and lock, the pot buys and burns supply. Every mint and burn is in this log, on-chain." |
| 0:25–0:42 | The cost of not showing up: a wallet that didn't gm, idle burn running (red gm button). Log: **idle burn**, half burned, half to the Vault. Vault tab: your locked tokens earned it | "Sleep for 12 hours and your bag starts shrinking. Lock in the Vault and you're safe, and you earn what sleepers lose." |
| 0:42–0:58 | **60-day chart** from the README (docs/supply-60d.svg): active / fading / dead | "We simulated 60 days: a dead coin deflates about 35%, an active one about 20%, and the faithful gain." |
| 0:58–1:15 | Cards tab: claim a pack, back an Ember (3 wallets) → pot burn in the log; start a raid, fill the 3-slot plan, Battle cry | "Then it gets wild: rule cards the crowd plays together, and coins that raid each other across contracts." |
| 1:15–1:22 | **War Map**: coins ranked by level and Ritual streak, latest raid results | "Every coin is a community, and communities raid each other. The one that shows up in bigger numbers wins the other's pot." |
| 1:22–1:35 | **Proof** page: all checks green; then nearblocks for the factory showing 0 access keys | "No admin key: the factory deleted its own key when it deployed. Supply adds up to the last token, checked live on the chain." |

Optional 5-second clip (if one-tap is enabled in your wallet): press gm with no wallet popup. "The ritual is one tap; money moves always ask your wallet."

## Checklist before recording
1. `docs/supply-60d.svg` open in a tab, the factory's nearblocks page open in another.
2. Bots running (so coins show activity) and at least one coin at L2 (raids need it).
3. Browser zoom 110–125%, hide bookmarks, mobile view for one shot (the layout is phone-first).
4. Post on X with the repo link and the live link. **Post it yourself**: nothing in this repo posts for you.

## "Idea" field (about 80 words)

> A memecoin that only survives if its holders show up. Daily gm rituals burn supply, sleepers' bags shrink into a Vault that
> pays the faithful, and coins raid each other for their pots. Each coin is its own NEP-141 sub-account of a factory whose key
> was deleted in the deploy transaction: no admin, every parameter fixed at launch and readable on-chain. Check-ins are one tap
> through function-call access keys; anything that moves money always asks your wallet. Simulated over 60 days under active,
> fading and dead communities.

(Use the last sentence about one-tap only if the live app has it on.)
