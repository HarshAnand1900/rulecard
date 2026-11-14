# Rulecard: UI handoff (current build)

Everything a designer needs to restyle the app as it is today (Nov 12). The code is React + plain CSS: all styling is in one file,
[`src/app/styles.css`](../src/app/styles.css) (about 290 lines). Screens are in `src/app/chain/*.tsx`. Older docs
(`ui-guide.md`, `ui-updates.md`) describe the earlier design; this one is the source of truth for what exists now.

**The pitch the UI has to carry:** *a league of memecoins whose communities go to war.* First screen = PLAY. First thing a judge should
see after PLAY = the War Map and a raid happening. The daily Ritual is how a coin gets stronger, not the headline.

## 1. Design tokens (in `:root`)
| Token | Value | Use |
|---|---|---|
| `--bg` / `--panel` / `--sunk` / `--line` | #0f1218 / #171c26 / #11151d / #273042 | page, cards, inputs, borders |
| `--ink` / `--muted` | #e8edf6 / #8e98ab | text |
| `--accent` | #ff7a1a | primary buttons, logo, selected tab (orange) |
| `--up` / `--down` / `--gold` | #46d18c / #ff6262 / #ffcc33 | good / bad / Ritual, Omens, Mythic |
| `--t-common/rare/epic/mythic` | #a5adbd / #5aa2ff / #b77bff / #ffcc33 | card tiers (the colour always means the tier) |
| Fonts | Bungee (display), IBM Plex Sans (body), IBM Plex Mono (numbers) | headings / text / all numbers |

## 2. Site map
`Landing (hosted builds only)` → `Onboarding overlay (practice only)` → app with header tabs **Discover · War Map · Judges · Launch a coin**.
Coin page tabs: **Ritual · Trade · Vault · Raids · Cards · Log**.

## 3. Screens (what is on each, top to bottom)

### 3.0 The marketing site (`index.html`, `public/*`)
The public landing page. Its hero is a turning spiral of eight real cards (the same designs as the app, drawn by `src/landing-cards.ts`).
"The deck" section is one **stacked deck**: the top card flies off to the bottom on the arrows (or by itself every few seconds), with the
card's name and rule under it and a counter such as `1 / 29`. Tabs All / Rare / Epic / Mythic / Common show their card counts. A new visitor
lands on All, which deals the big cards first: Rares, then Epics, then the Mythic, then the Commons.

### 3.1 Landing (`Landing.tsx`)
Big RULECARD wordmark; one-line pitch ("A league of memecoins whose communities go to war. Show up every day or your bag burns, and the
coin that shows up bigger raids the other."); **▶ PLAY** (large, orange); a quieter **PLAY WITH MY OWN TESTNET WALLET**; a footer line
("free with no wallet… / your own wallet uses your own testnet NEAR"); a collapsible "Two ways in, one game" with two short cards.
*Design note:* PLAY must be unmissable and feel like pressing start. Nothing else competes with it.

### 3.2 Onboarding overlay (`Onboard.tsx`), first PLAY only
Card titled **GETTING YOU IN** → **YOU'RE IN**. A 4-step list, each a real transaction: *Making your wallet → Sending it a little NEAR →
Buying your first bag → Ready*. Each step has 4 states (todo ○, now ⟳ spinner, done ✓, bad ✗) and a "receipt ↗" link when done. The error
state shows the message with **Try again** / **Use my own wallet instead**. It takes under a minute, so it should feel like progress, not waiting.

### 3.3 Header (`ChainApp.tsx`)
Left: logo + tag (**PRACTICE** pill, or "testnet · your wallet"). Centre: page tabs. Right: short wallet address (`9fac34…e92d`),
NEAR balance, **🔊 sound menu**, and a "Practice ▾" menu (Two ways in, switch to my own wallet, back up my practice key, start over).
The Demo/Real scale switch exists only in the local build.

### 3.4 Discover
Two lists: **Live** (coins still on their curve) and **Graduated** (Hall of Fame). Each coin card: icon, name, $SYMBOL, level badge,
rule chips, price, market cap, holders, Ritual ring. *New:* the coin's **icon is drawn by the contract** (see 4.5).

### 3.5 War Map (`WarMap.tsx`): the hero page
Title + one line. A table ranked by level then streak: `# · Coin (mcap) · Level · 🔥 Ritual streak · 🏆 High score · Last day made/missed · Raids W–L · Now`.
"Now" shows a hot chip when the coin is raiding or being raided (`⚔ attacking $MOTH`). Below: **Latest raids** feed:
`$FROG raided $MOTH · $FROG won · rounds WLT (W win, L loss, T tie) · spoils · time`.
*Wanted next (design these even if not built yet):* a **map** view (each coin a territory, raid wins flip tiles), a **next raid in 12 min**
countdown, and a **chronicle** (three lines of story per coin).

### 3.5b Discover: card effects
A coin pinned by a **Hype Siren** sorts to the top of Discover, glows orange and shows "Trending · Xm left" (15 minutes of game time, about 75 seconds on the testnet world, which runs 12× faster). Every
coin card also shows "Last play: <card> · <time> ago", so a play never leaves the page looking unchanged.

### 3.6 Coin page
- **Header strip:** icon, name, $SYMBOL, creator, rule chips; price (µN), mcap, in curve; the **gm button** (☀ gm, shows "idle burn starts in …"
  or "gm every 30m"), the one-tap ⚡ toggle, and the **Ritual ring**.
- **Omen banner** (new): only when an Omen is incoming or running. `✦ OMEN · Full Moon` + one-line effect + `ends in 41m`. Dashed border
  while incoming, pulsing gold name while active. Line for level-1 coins: "Omens begin when the coin reaches level 2."
- **Stats row:** Energy bar, Pot, Vault %, Reward pool, Deck, Burned.
- **Price chart:** pan, zoom, candles or line, with drawn event markers (no emoji): an orange card for a card play, a red cross for a raid, a green triangle for a level-up, a flame for a Ritual, a star for graduation. Hover a marker for its name.
- **Tabs:** six equal columns (Trade, Ritual, Vault, Raids, Cards, Log) with the badge under the label, so nothing scrolls or is cut off. Under 900 px they wrap into two rows of three.
  - **Ritual** (default): a big hero. Today's progress (gm count bar + NEAR-locked bar), time left, **Streak: 🔥 N · best ever M**, last 7 days
    as dots (made / missed / not yet), then the level-progress checklist.
  - **Trade:** buy/sell with a quote, slippage and fees, and a "Lock 24h?" prompt after buying.
  - **Vault:** lock 6 / 24 / 72 h, the list of locks with unlock / leave early (−20%), earnings.
  - **Raids:** the current raid timeline (Muster → 3 rounds → result), signers, the 3-slot plan, Battle cry, past raids. Plans, Battle cry and Scout close when the raid's time is up and the page says to press **Settle raid** (the contract refuses them after that with "no raid on").
  - **Cards:** the **pack** (a 3D black box with every face filled with glowing card symbols; it sways, turns on hover, shows READY, LOCKED, NEEDS GM, HAND FULL or a countdown, and a ×N badge when
    several packs are waiting). **Claim pack** only shows when a pack can really be claimed. Otherwise a checklist says what is missing: you hold some of the coin, you said gm in the last 6 hours
    (30 minutes on testnet), the pack timer is done, and you have room for 2 more Commons, each with what to do next (a Say gm button, Drop a Common, Buy in the Trade tab, or just wait). A level
    drop (L2, L3, L4) is offered only to wallets that held the coin for an hour before it reached that level; otherwise the page says why it isn't theirs. Below: **Your hand**, grouped Commons /
    Rares / Epics / Mythic with counts, each card drawn in its rarity design (hover to tilt, click to turn it over for the rule), with Play, Put on the table, a small form, or for raid cards a
    button that opens the Raids tab and says whether a raid is live. Then **The Table** (live proposals) with **Recent plays** (who played what and when: solo cards such as Hype Siren never sit on
    the Table), and the history.
  - **Log:** the last 100 on-chain events, opening on **Everything** (card plays, raids, Rituals, omens, mints, burns and trades), with a Mints & burns filter. Bots show as `🤖 bot3`.

### 3.7 Guided first run (`Guide.tsx`)
A floating card on the coin page for new practice players, one step at a time, ticking from chain state: *You have a wallet → Your first bag →
Say gm → Lock in the Vault → Open a pack → See the fight (War Map) → Your goal.* Each step: a title (display font), one sentence, a primary
button, and receipt links for finished steps. A **Skip guide** link. This is the main teaching tool: keep it short and friendly.

### 3.8 Judges page (`Proof.tsx` + `Cheat.tsx`): the renamed "Proof" page
1. **Judges: start here:** a 2-column table (the track asks for → where to see it).
2. **Try to cheat it:** 6 rows, each with a title, a one-line why, a **Try it** button, and the result: a red stamp **REJECTED BY NEAR**
   (rotated slightly) + the contract's real error in mono text + "your account's transactions ↗". If a cheat ever succeeds: a warning box.
3. **Live proof:** a header like "27 of 27 checks pass", then a panel for the factory and one per coin, each row `✓ label` + a grey detail line.
4. The 60-day chart (SVG) and "What this page does not prove".

*Design note:* this page is where a judge decides to trust us. The green ✓ rows and the stamp are the signature visuals.

### 3.9 Launch a coin
Name, symbol, seed (5–100 NEAR), up to 3 creator rules as selectable tiles (each with one line of text), the cost summary, a Launch button.

## 4. Components and states

### 4.1 Buttons
`.btn` (default), `.btn.primary` (orange), `.btn.small`, `.btn.ghost`, `.btn.danger`; `.linkish` for text buttons; the big `.play-btn`.

### 4.2 Chips and tags
`.tag` (pill, mono), `.chip` (`.hot` for live raids), `.rule` tiles, tier colours for cards.

### 4.3 Ring
A circular progress with a centre label ("Ritual 31%"), used in the coin header and the Ritual tab.

### 4.4 Toasts and banners
Wallet and contract refusals are turned into one plain sentence that says what to do (for example "you closed the wallet window, so nothing was sent" or "say gm first: a pack needs a gm in the
last 6 hours"). The old "Demo mode" banner was removed; the README and Docs explain the ÷100 amounts and the 12× clock instead.

Toast at the bottom of the screen (ok / error); `.grad-banner` (graduated coin); `.omen-banner`; `.warn` box.

### 4.5 The coin icon (new, drawn on chain)
A 128×128 SVG made by the contract: a dark disc, a ring coloured by level (grey L1, green L2, blue L3, gold L4), the symbol (up to 4 letters),
an `L2 STREAK 4` line, seven dots for the last 7 Rituals (orange = made, grey = missed), and a red cross of swords during a raid. The app
should show this same icon everywhere a coin appears. A designer can restyle the *app's* coin tiles around it; the icon's own look can
only change in the contract (`live_icon` in `contracts/coin/src/token.rs`), so tell me **before the redeploy** if you want it changed.

### 4.6 Sound menu (new)
The 🔊 button opens a popover: **Mute all sound**, a **Volume** slider and five buttons to hear the voucher chime (a buy or sell goes through), backed or signed (you back or sign a card, heard only by you), the card played (a card goes on the Table), the pack opening (a pack is opened) and the Omen sting (an Omen is about to start). Those are the only sounds in the app.

### 4.7 States to design
Loading ("Connecting…", "Loading…"), empty lists, error ("Can't reach the chain" with an alternate door), idle burn running (red text on the
gm button), gm ready vs waiting, graduated coin, raid phases (muster / round n / settled), faucet empty ("use your own wallet"), wallet low on NEAR,
muted / sound on, and mobile (single column under 900 px).

## 5. Copy rules
Plain words, short sentences, no jargon in the first run. Numbers are always monospace. "NEAR" is spelled out; µN only for token prices.
Bots are always marked 🤖. Say "practice wallet", never "burner".

## 6. Files to hand to a designer
- `src/app/styles.css`: all styles and tokens.
- `src/app/chain/Landing.tsx`, `Onboard.tsx`, `Guide.tsx`, `WarMap.tsx`, `Proof.tsx`, `Cheat.tsx`, `ChainApp.tsx` (header, Discover, coin page, tabs), `PriceChart.tsx`.
- `docs/supply-60d.svg`: the chart used on the Judges page.

Run it: `npx vite --mode testnet` (or `npm run dev` for the local sandbox); the practice build is the `rulecard-practice` entry in `.claude/launch.json`.
