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

### 3.6 Coin page
- **Header strip:** icon, name, $SYMBOL, creator, rule chips; price (µN), mcap, in curve; the **gm button** (☀ gm, shows "idle burn starts in …"
  or "gm every 30m"), the one-tap ⚡ toggle, and the **Ritual ring**.
- **Omen banner** (new): only when an Omen is incoming or running. `✦ OMEN · Full Moon` + one-line effect + `ends in 41m`. Dashed border
  while incoming, pulsing gold name while active. Line for level-1 coins: "Omens begin when the coin reaches level 2."
- **Stats row:** Energy bar, Pot, Vault %, Reward pool, Deck, Burned.
- **Price chart:** 1h / 6h / 24h / All, with event markers (🕯 burn, ⚔ raid, ⬆ level-up).
- **Tabs:**
  - **Ritual** (default): a big hero. Today's progress (gm count bar + NEAR-locked bar), time left, **Streak: 🔥 N · best ever M**, last 7 days
    as dots (made / missed / not yet), then the level-progress checklist.
  - **Trade:** buy/sell with a quote, slippage and fees, and a "Lock 24h?" prompt after buying.
  - **Vault:** lock 6 / 24 / 72 h, the list of locks with unlock / leave early (−20%), earnings.
  - **Raids:** the current raid timeline (Muster → 3 rounds → result), signers, the 3-slot plan, Battle cry, past raids.
  - **Cards:** pack timer, hand (Commons + Rares/Epics), the table of live proposals (Ember, Inferno, Siren, Prophecy), history.
  - **Log:** the last 200 on-chain events (mint, burn, buy, sell, lock, ritual, omen …). Bots show as `🤖 bot3`.

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
