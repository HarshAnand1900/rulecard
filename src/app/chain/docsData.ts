// Docs content for the in-app Docs page. Plain data: pages hold parts, parts hold blocks. Numbers match the contracts and the app;
// where a number depends on the demo scale (time 12 times faster, NEAR divided by 100) the text says so.
export type Block = { p: string } | { ul: string[] } | { note: string } | { table: { head: string[]; rows: string[][] } } | { steps: string[] };
export interface Part { id: string; title: string; blocks: Block[] }
export interface DocPage { id: string; group: string; title: string; summary: string; parts: Part[] }

export const DOCS: DocPage[] = [
  {
    id: 'welcome', group: 'Start here', title: 'What is Rulecard', summary: 'A memecoin game where each coin is its own community.',
    parts: [
      { id: 'idea', title: 'The idea', blocks: [
        { p: 'Rulecard is a memecoin launchpad built as a game. Every coin is its own NEP 141 token contract on NEAR with the game rules built in. Holders keep their coin alive by showing up every day, play rule cards together, and the coin that shows up bigger can raid another coin and take a share of its pot.' },
        { p: 'There is no admin key. After a coin launches nobody can change its rules, mint more, or freeze anyone, including the creator.' } ] },
      { id: 'loop', title: 'The loop in one minute', blocks: [
        { steps: ['Buy a small bag of a coin.', 'Say gm to check in. This builds the coin\'s daily Ritual and stops your bag from burning.', 'Lock some tokens in the Vault to keep them safe and earn a share of what sleepers lose.', 'Open packs of rule cards and play them together with other holders.', 'Join raids against other coins and watch the War Map.'] } ] },
      { id: 'testnet', title: 'Testnet only', blocks: [
        { note: 'Everything runs on NEAR testnet. Testnet NEAR and every coin have no value. Nothing here is financial advice.' } ] },
    ],
  },
  {
    id: 'modes', group: 'Start here', title: 'Demo and full testnet', summary: 'Two ways in, one game.',
    parts: [
      { id: 'demo', title: 'Demo (practice wallet)', blocks: [
        { p: 'The demo needs no wallet. A practice wallet is made in your browser and sent a little testnet NEAR. Every move is still a real transaction on NEAR testnet, signed in your browser with no popups.' },
        { ul: ['NEAR amounts are divided by 100.', 'Time runs 12 times faster: gm every 30 minutes, a Ritual day is 2 hours, raid rounds last about 100 seconds.', 'The practice wallet lives in this browser only. Clearing site data forgets it, so back up the key from Profile if you care.'] } ] },
      { id: 'wallet', title: 'Full testnet (your wallet)', blocks: [
        { p: 'Connect your own testnet account with MyNearWallet or Meteor. Your wallet signs each move, and your coins and history follow your account in any browser.' },
        { ul: ['Launching a coin needs your own account.', 'One tap mode adds a limited key per coin so gm, packs, backing and Battle cry skip the popup.', 'Selling, locking, betting and buying always ask your wallet.'] } ] },
      { id: 'switch', title: 'Switching', blocks: [{ p: 'Use the menu next to the mode label in the top bar to switch between the two. Your practice wallet is kept in this browser until you start over.' }] },
    ],
  },
  {
    id: 'first-steps', group: 'Start here', title: 'Your first five minutes', summary: 'The guided first run, step by step.',
    parts: [
      { id: 'guide', title: 'The guide', blocks: [
        { p: 'A small guide card sits in the bottom left. Each step ticks off by itself when the chain shows you did it. Use Back and Next to read ahead, the cross to hide it, and the ? button in the top bar to bring it back.' } ] },
      { id: 'steps', title: 'The seven steps', blocks: [
        { steps: ['You have a wallet: practice or your own.', 'Your first bag: buy a small amount of a coin. A bag is your ticket in.', 'Say gm: check in once to start your idle clock fresh.', 'Lock in the Vault: lock half of your tokens for 24 hours.', 'Open a pack: claim your first rule cards.', 'See the fight: open the War Map and see how coins raid each other.', 'Your goal: keep the coin\'s Ritual alive every day.'] } ] },
      { id: 'tips', title: 'Tips', blocks: [{ ul: ['Start with a small bag. You need a little NEAR left for network fees.', 'If a button says it is blocked, it tells you why, for example "Not enough NEAR".', 'The (i) buttons on cards and omens explain them in place.'] }] },
    ],
  },
  {
    id: 'ritual', group: 'Core ideas', title: 'The daily Ritual, gm and Energy', summary: 'How a coin stays alive.',
    parts: [
      { id: 'gm', title: 'gm', blocks: [
        { p: 'gm is a check in. You can say it once every 6 hours (30 minutes in the demo). Each gm adds to today\'s Ritual, adds Energy to the coin, and resets your personal idle clock.' } ] },
      { id: 'ritual', title: 'The Ritual', blocks: [
        { p: 'Each day the whole coin has a target: enough wallets saying gm and enough NEAR locked in the Vault. The Ritual page shows both numbers and a countdown.' },
        { ul: ['Made it: the pot buys and burns 5% of itself, or 7% once the coin has a streak of 2 or more days.', 'Missed it: sleepers\' bags burn twice as fast for the next 6 hours.', 'A streak counts days in a row the coin made its Ritual. The best streak is kept as a high score.'] } ] },
      { id: 'energy', title: 'Energy', blocks: [
        { p: 'Energy is the coin\'s shared budget for cards, from 0 to 100. It goes up by 1 for every gm and by 1 for every 10 NEAR bought. Cards cost the coin\'s Energy when they are played.' } ] },
    ],
  },
  {
    id: 'burn', group: 'Core ideas', title: 'Idle burn and the Vault', summary: 'What happens if you go quiet, and how to stay safe.',
    parts: [
      { id: 'idle', title: 'Idle burn', blocks: [
        { p: 'If you stay silent for 24 hours, idle burn starts taking 1% of your unlocked tokens every 6 hours, never more than 8% in a day. Saying gm stops it at once. A coin with the Ruthless rule burns 2% every 6 hours instead.' },
        { p: 'Locked holders earn half of what idle burn takes. Every burn is logged onchain with its source.' } ] },
      { id: 'vault', title: 'The Vault', blocks: [
        { p: 'Locked tokens are safe from every burn and share what idle burn takes from sleepers. You choose how long to lock. Locking also counts toward today\'s Ritual.' },
        { ul: ['Locked amounts show on your Profile and on the coin page.', 'Locks end on their own at the time shown. After that the tokens are free again.'] } ] },
      { id: 'pot', title: 'The pot', blocks: [
        { p: 'The pot is NEAR the coin keeps for itself. It grows from 1.5% of every trade and is spent on buy and burn when the Ritual is made and by some cards.' } ] },
    ],
  },
  {
    id: 'trading', group: 'Core ideas', title: 'Buying and selling', summary: 'The curve, fees and what you see before you sign.',
    parts: [
      { id: 'curve', title: 'The bonding curve', blocks: [
        { p: 'Every coin trades against its own curve. The price rises as people buy and falls as they sell. The curve holds the NEAR buyers paid, so holders can always sell back, and the creator\'s seed cannot be pulled out.' },
        { p: 'When the curve sells out the coin graduates. Buys, rituals, cards and raids end, holders can still sell back, and the creator\'s escrow becomes claimable. Listing on a DEX such as Ref Finance is a future step, not built yet.' } ] },
      { id: 'order', title: 'Reading the trade panel', blocks: [
        { table: { head: ['Line', 'Meaning'], rows: [
          ['You receive', 'What your order gets you after the fee.'],
          ['Average price', 'Your price for this order, shown as NEAR per 1 million tokens.'],
          ['Price after', 'The curve price once your order has gone through.'],
          ['Fee', 'The trade fee in NEAR.'],
          ['Price impact', 'How far your order moves the price. Big orders move it more.'],
          ['First buy storage', 'A small one time NEAR deposit to register your account with the coin.'] ] } } ] },
      { id: 'fees', title: 'Fees', blocks: [{ p: 'The trade fee is 2%. 1.5% goes to the pot and the rest to the protocol. Keep a little NEAR aside for network fees: the app reserves a small amount when you press Max.' }] },
      { id: 'limits', title: 'Limits and taxes', blocks: [
        { ul: ['Paper Tax: selling tokens bought less than 1 hour ago pays 10% to the pot.', 'Soft Tax: selling tokens bought less than 30 minutes ago pays 5%.', 'Tagged tokens: tokens bought while a pot card is on the Table pay 10% to the pot if sold before the tag ends.', 'A live Prophecy bet locks your trading until it resolves.', 'During a raid, selling pays +3% and lowers your side\'s Buy score.'] } ] },
    ],
  },
  {
    id: 'levels', group: 'Core ideas', title: 'Levels', summary: 'Launched, Rising, Hot and Legendary.',
    parts: [
      { id: 'levels', title: 'The four levels', blocks: [
        { p: 'Coins level up as they grow. Levels unlock more of the game: omens begin at level 2, and a PeaceCoin cannot be raided before level 3.' },
        { table: { head: ['Level', 'Name'], rows: [['L1', 'Launched'], ['L2', 'Rising'], ['L3', 'Hot'], ['L4', 'Legendary']] } } ] },
      { id: 'rules', title: 'What it takes', blocks: [
        { p: 'The Next level panel on a coin lists every requirement with a tick. All of them must hold at once, and then stay true for a hold time before the level changes.' },
        { ul: ['Market cap', 'Real NEAR in the curve', 'Volume in the last 24 hours', 'Check ins in the last 24 hours', 'Net buying in the last hour (buys at least equal sells)', 'Coin age'] } ] },
    ],
  },
  {
    id: 'cards', group: 'Play', title: 'Rule cards', summary: 'All 29 cards: how they are used and what they do.',
    parts: [
      { id: 'deck', title: 'The deck', blocks: [
        { p: 'Each coin has its own limited deck of 29 cards in four rarities: 10 Commons, 11 Rares, 7 Epics and 1 Mythic. The Deck figure on a coin shows how many of each rarity are out. Energy is the coin\'s shared budget: a card costs the coin that much Energy when it is played.' },
        { table: { head: ['Card', 'Rarity', 'Energy', 'How it is used', 'What it does'], rows: [
          ['Rally', 'Common', '0', 'Raid plan', 'Your raid score ×1.05 to 1.10. Beats Ward, loses to Curse.'],
          ['Curse', 'Common', '0', 'Raid plan', 'Their score ×0.95 to 0.90 and cancels their Rally. Loses to Ward.'],
          ['Ward', 'Common', '0', 'Raid plan', 'Turns their Curse back on them. Loses to Rally.'],
          ['Ember', 'Common', '5', 'Table, 3 copies', 'The pot burns 1%, 2% or 3% at 3, 6 or 10 copies. Anyone can stoke it.'],
          ['Roll Call', 'Common', '5', 'Solo', 'For 1 hour every gm gives double Energy.'],
          ['Hype Siren', 'Common', '5', 'Solo', 'Pins the coin on Trending for 15 minutes.'],
          ['Kindle', 'Common', '5', 'Solo', 'Heat +1 (max 3, cools 1 an hour). Pot cards spend 10% more per Heat. Once per wallet per 6 hours.'],
          ['Scout', 'Common', '5', 'In a raid', 'Ask the enemy coin what tactic it planned for the next round. A Decoy looks like a real card.'],
          ['Decoy', 'Common', '0', 'Raid plan', 'A fake play: looks real to a Scout, does nothing and does not protect you.'],
          ['Hedge', 'Common', '5', 'On your bet', 'On a Prophecy bet, while it still takes bets: a loss costs a quarter instead of half, a win gains 25% less.'],
          ['Pledge', 'Tokens a holder puts into a Bounty.'],
        ['Prophecy', 'Rare', '20', 'Table, 2 to 3 backers', 'Ask the crowd a 2 hour question. Losers lose half: 60% of it to winners, 20% to you, 20% burned.'],
          ['Mirror', 'Rare', '20', 'Raid plan', 'In round 2 or 3 it copies the enemy tactic from the round before.'],
          ['Counterspell', 'Rare', '20', 'Raid plan, or on a card', 'Cancels the enemy tactic that round, or cancels a Common or Rare card still gathering backers.'],
          ['Last Stand', 'Rare', '20', 'Solo', 'Only when the price is 25% below its 24 hour high: the pot buys and burns 10% of itself. Once a day.'],
          ['Slow Burn', 'Rare', '20', 'Solo', 'For 1 hour, 1% of the tokens in every trade burn.'],
          ['Duel', 'Rare', '20', 'Challenge a holder', 'Two holders stake the same tokens on "net buyer for 1 hour?". The winner takes both, minus 10% burned.'],
          ['Diamond Pool', 'Rare', '20', 'Solo', 'For 24 hours, new locks of 24 hours or more get ×1.25 weight and +1% bonus tokens.'],
          ['Bounty', 'Rare', '20', 'Pledge to a goal', 'Pledge tokens to a goal for 6 hours. Met: +10% from the reward pool. Missed: 10% burns.'],
          ['Friendly Raid', 'Rare', '20', 'Starts a raid', 'A raid with no spoils either way. Winners still earn their win pack.'],
          ['Recruit', 'Rare', '20', 'Solo', 'For 1 hour a wallet\'s first buy of 3 NEAR or more gets +5% bonus tokens, locked 6 hours.'],
          ['Stampede', 'Rare', '20', 'Crowd window', '10 minutes: holders put in NEAR and it buys as one batch at one price. With 10 or more wallets the pot adds 20%.'],
          ['Inferno', 'Epic', '50', 'Table, signers', 'The crowd fuels, locked 24 hours with +5%. Then the pot burns 10% plus half the fuel.'],
          ['Black Hole', 'Epic', '50', 'Table, signers', 'Holders throw tokens in and all of it burns. The reward pool gives back 40% (+5% per Heat). The top 3 throwers get a pack ready.'],
          ['Harvest', 'Epic', '50', 'Table, signers', 'For 1 hour wallets that checked in today take one share (0.01% of supply) from the reward pool. 25 shares.'],
          ['Hard Raid', 'Epic', '50', 'Starts a raid', 'A raid with double spoils both ways. The loser flies the winner\'s banner for 12 hours.'],
          ['Whale Tax', 'Epic', '50', 'Table, signers', 'For 2 hours wallets holding over 2% of supply pay +1% on sells, to the pot.'],
          ['Alliance', 'Epic', '50', 'Table, signers', 'A 6 hour pact with another coin: no raids between the two.'],
          ['Squeeze', 'Epic', '50', 'Crowd window', 'Only when an open Prophecy has No stakes over 1.5 times Yes. A Stampede where the pot adds 50%.'],
          ['Supernova', 'Mythic', '100', 'Table, many signers', 'The pot spends as much as the daily cap allows in one go, and Heat jumps to 3. Level 3 coins, 8 signers.'] ] } } ] },
      { id: 'packs', title: 'Packs and your hand', blocks: [
        { p: 'A pack arrives every few hours. You can hold up to 12 Commons, 3 Rares, 3 Epics and 1 Mythic. Rare and better cards fade after 24 hours if you do not play them, so play or drop what you do not need. Backing and signing other people\'s cards makes your next pack come sooner, up to an hour in total. The Rare, Epic and Mythic limits grow with the number of eligible holders.' } ] },
      { id: 'table', title: 'The Table', blocks: [
        { p: 'Cards that need other people go on the Table: Ember, Prophecy, the Epics and the Mythic. Other holders back, sign, stoke, fuel, throw in or join in. Each card on the Table shows its phase and a countdown. Only one Epic can be on the Table at a time, and three Epics can fire per day.' } ] },
      { id: 'solo', title: 'Cards you play on your own', blocks: [
        { ul: ['Kindle adds Heat. Heat lasts a few hours and makes every pot card spend 10% more per Heat, up to 30%.', 'Slow Burn burns 1% of every trade for an hour, on both buys and sells, which lifts the price a little each time.', 'Recruit rewards new wallets: for an hour their first buy of 3 NEAR or more comes with 5% extra tokens, locked for 6 hours.', 'Diamond Pool rewards patient holders: for 24 hours every lock of 24 hours or more gets ×1.25 weight and 1% extra tokens.', 'Last Stand fights a crash: when the price is 25% below its 24 hour high, the pot buys and burns 10% of itself.', 'Roll Call and Hype Siren boost Energy and Trending.'] } ] },
      { id: 'crowd', title: 'Cards that need the crowd', blocks: [
        { ul: ['Stampede and Squeeze open a 10 minute window. Up to 40 wallets can put in, each up to 10 NEAR (one entry per wallet). At a random moment after it closes, all of it buys together at one average price, and everyone gets the same price. With 10 or more wallets the pot adds 20% (Squeeze 50%), never more than 30% of the pot.', 'Squeeze can only be played when an open Prophecy has No stakes over 1.5 times its Yes stakes.', 'Black Hole: holders throw tokens in, up to 40 throws. All of it burns. The reward pool gives back 40% of the amount (5% more per Heat), shared by what each wallet threw and capped at 0.2% of supply, and the three biggest throwers get a pack ready to open. Both are claimed with Claim payouts.', 'Harvest: after it fires, any wallet that did a gm in the last 24 hours can take one share, 0.01% of supply, from the reward pool. 25 shares in all.', 'Whale Tax, Alliance and Supernova act once their signers are in. Whale Tax adds 1% to sells by wallets over 2% of supply for 2 hours. Alliance makes a 6 hour no raid pact with another coin. Supernova spends the pot up to the daily cap.'] } ] },
      { id: 'stakes', title: 'Stakes between wallets', blocks: [
        { p: 'Prophecy: the player asks one of four questions: Tide (net buying in 2 hours), Line (price above or below a line), Crowd (a number of new buyers) or Vault (locked share up by some points). Holders bet tokens on Yes or No. A loser loses half of its bet, a hedged loser a quarter. Of what is lost, 60% goes to winners, 20% to the player and 20% is burned. A bet locks your trading until the question resolves, and with fewer than 8 wallets every bet is refunded. At most 40 wallets can bet on one Prophecy. Winnings, refunds and the player’s share are claimed by each wallet, see Claiming payouts below.' },
        { p: 'Duel: you and one named holder stake the same amount of tokens (0.5 to 25 NEAR worth). You pick a side on "will the coin be a net buyer over the next hour?". They have 15 minutes to accept. Neither of you can trade until it ends, so the answer comes from everyone else. The winner takes both stakes minus 10%, which burns. If nobody accepts, your stake comes back and your trading lock is lifted.' },
        { p: 'Bounty: you pledge tokens to a goal for 6 hours. Others can add theirs. If the goal is met, everyone gets their tokens back plus 10% more from the reward pool, shared by pledge. If it is missed, everyone gets 90% back and 10% burns. Payouts wait for you: press Claim payouts on the coin page (unclaimed after 3 days they burn). A Bounty cannot ask the Tide question, and the bonus is capped and paid once a day.' } ] },
      { id: 'claims', title: 'Claiming payouts', blocks: [
        { p: 'Prophecy, Black Hole and Bounty never push tokens into wallets when they close, because looping over every wallet in one transaction could jam a coin. Instead each wallet’s share is put on a waiting list, and you collect yours with one press of Claim payouts. A banner at the top of the coin page shows what is waiting for you, and a top thrower’s ready pack comes with it.' },
        { ul: ['Unclaimed payouts are burned after 3 days (6 hours in the demo), so claim when you win.', 'The waiting list holds at most 200 entries. While it is nearly full, a new Prophecy, Black Hole or Bounty cannot be opened, and an Oracle Omen stays quiet.', 'Claiming needs no deposit and settles your idle burn first, like any other action.', 'The contract measures worst cases on the real chain build: closing a full 40 bettor Prophecy, a 40 throw Black Hole or a 20 pledge Bounty costs under 6 Tgas of the 300 available.'] } ] },
      { id: 'raidcards', title: 'Cards for raids', blocks: [
        { ul: ['Mirror, Counterspell and Decoy go in the raid plan next to Rally, Curse and Ward.', 'Scout asks the enemy coin for its planned tactic in the next round. The answer is written into the raid for your whole side.', 'Friendly Raid and Hard Raid start a raid from the Raids tab or from the card. They need the usual signers and spend the card and its Energy.'] } ] },
    ],
  },
  {
    id: 'raids', group: 'Play', title: 'Raids and the War Map', summary: 'Coins fighting coins.',
    parts: [
      { id: 'raid', title: 'How a raid works', blocks: [
        { steps: ['Enough holders sign to start a raid on a rival coin.', 'A muster period lets both sides prepare.', 'Three rounds follow. In each round the two coins\' scores are compared.', 'The side that wins more rounds wins the raid and takes spoils from the rival pot.'] } ] },
      { id: 'score', title: 'What makes a score', blocks: [
        { p: 'A round score is built from four things, and each side tries to be bigger than the other:' },
        { ul: ['Buy: net buying during the round.', 'Crowd: how many holders show up, including Battle cry.', 'Lock: NEAR locked in the Vault.', 'Tactic: the card you planned for that round (Rally, Curse or Ward).'] } ] },
      { id: 'tactics', title: 'Tactics', blocks: [{ p: 'Plan your tactic cards in the Raids tab before a round starts. Rally beats Ward, Ward beats Curse and Curse beats Rally. Mirror copies the enemy tactic from the round before, Counterspell cancels the enemy tactic that round, and Decoy does nothing but looks real to a Scout. Scout asks the enemy coin what it planned for the next round. Rally, Curse, Ward and Decoy cost no Energy; Mirror and Counterspell are Rares.' }] },
      { id: 'kinds', title: 'Friendly, Hard and allied raids', blocks: [{ ul: ['Friendly Raid: no spoils either way. Winners still earn their win pack.', 'Hard Raid: spoils are doubled both ways and the loser flies the winning coin banner for 12 hours.', 'Alliance: a 6 hour pact with another coin. Neither coin can raid the other until it ends.', 'Blood Moon (an Omen) doubles the spoils a coin pays if it loses a raid that starts within 8 hours.'] }] },
      { id: 'warmap', title: 'The War Map', blocks: [
        { p: 'The War Map ranks coins by war points. A coin gets 10 points to join and 3 for every level above L1. Each raid moves its level in points from the loser to the winner (L2 is 2, L3 is 3, L4 is 4). Nobody drops below 4. Anyone can recompute the map from the chain.' } ] },
      { id: 'coins', title: 'War rules', blocks: [{ ul: ['WarCoin: a 6 hour raid shield after a raid and spoils of 20% both ways.', 'PeaceCoin: no raids before level 3.'] }] },
    ],
  },
  {
    id: 'omens', group: 'Play', title: 'Omens', summary: 'All 13 luck events.',
    parts: [
      { id: 'clock', title: 'How they run', blocks: [
        { p: 'From level 2, a coin gets an Omen that lasts 1 hour, then a 2 hour break, and it repeats. The next Omen is rolled from public chain randomness and announced 15 minutes before it starts, so nobody can order one and everyone can plan. The top banner shows the one that is incoming or active, with a countdown and an (i) that explains it.' },
        { p: 'There are two groups. Wild Omens (40% of rolls) are the coin acting on itself. Weather Omens (60%) change the rules for the hour. A coin with the WildCoin rule rolls Wild Omens 60% of the time instead.' } ] },
      { id: 'list', title: 'The 13 Omens', blocks: [
        { table: { head: ['Omen', 'Group', 'Chance', 'Effect'], rows: [
          ['Ghost Ember', 'Wild', '12%', 'The pot burns 3% of itself at the first move of the hour.'],
          ['Squall', 'Wild', '10%', 'A mini Storm: 1% of unlocked bags is hit when each wallet is next used. Half burns, half goes to the Vault. It counts toward the one 8% daily cap.'],
          ['Treasure', 'Wild', '10%', 'One lucky wallet that does a gm this hour gets a free pack, ready to open.'],
          ['Oracle', 'Wild', '8%', 'The coin opens a Prophecy on itself: will it be a net buyer over 2 hours? With fewer than 8 wallets all bets are refunded. The caster share burns.'],
          ['Full Moon', 'Weather', '8%', 'Energy gains are doubled, from gm and from buying.'],
          ['Iron Vault', 'Weather', '8%', 'New Vault locks get ×1.25 weight.'],
          ['Windfall', 'Weather', '7%', 'The next Ember or Inferno that fires this hour spends 25% more from the pot.'],
          ['Thunder', 'Weather', '7%', 'Sells pay 1% more, and it goes to the pot.'],
          ['Gold Rush', 'Weather', '6%', 'The next pack claimed this hour rolls Rare or better on its first card, if the deck has stock.'],
          ['Drought', 'Weather', '6%', 'Idle burn is doubled for the hour.'],
          ['Low Tide', 'Weather', '6%', 'Cards played this hour get half the backing and fuel time, so the crowd has to be quick.'],
          ['Blood Moon', 'Weather', '6%', 'If this coin loses a raid that starts within 8 hours, the spoils it pays are doubled.'],
          ['Fog', 'Weather', '6%', 'Live raid scores are hidden this hour. With no raid on, locks get ×1.25 weight like Iron Vault.'] ] } } ] },
      { id: 'limits', title: 'Limits', blocks: [
        { ul: ['An Omen never stacks with itself.', 'Omens that spend the pot count toward the 75% daily cap.', 'Squall counts toward each wallet\'s one 8% a day loss cap.', 'Omens only run on coins at level 2 or higher.'] } ] },
    ],
  },
  {
    id: 'coin-rules', group: 'Play', title: 'Coin rules', summary: 'Rules a creator picks at launch.',
    parts: [
      { id: 'list', title: 'The rules', blocks: [
        { p: 'A creator picks up to three rules when launching. They are fixed forever.' },
        { table: { head: ['Rule', 'Effect'], rows: [
          ['FairLaunch', 'All buys in the first 5 minutes at one price'],
          ['LaunchGuard', 'Max 30 NEAR per wallet in the first 10 minutes'],
          ['PaperTax', '10% on selling tokens bought less than 1 hour ago, to the pot'],
          ['SoftTax', '5% on selling tokens bought less than 30 minutes ago'],
          ['WhaleCap', 'No wallet over 2% of supply before level 3'],
          ['HoldTheLine', 'Price drops start a Hold the Line event'],
          ['CreatorLock', 'Creator cannot sell for 24 hours, then unlocks over 48 hours'],
          ['Ruthless', 'Idle burn is 2% every 6 hours'],
          ['WildCoin', 'Wild omens 60% of the time'],
          ['WarCoin', 'Raid shield 6 hours, spoils 20% both ways'],
          ['PeaceCoin', 'No raids before level 3'] ] } } ] },
    ],
  },
  {
    id: 'launch', group: 'Build', title: 'Launching a coin', summary: 'Name it, pick rules, add a seed.',
    parts: [
      { id: 'steps', title: 'Steps', blocks: [
        { steps: ['Connect a wallet. Use your own testnet account so the coin is tied to you.', 'Open Launch from the + button in the top bar.', 'Pick a name, a symbol and up to three rules.', 'Add a seed. It goes into the bonding curve as the first liquidity.', 'Sign. The factory deploys the coin as its own contract.'] } ] },
      { id: 'cost', title: 'What it costs', blocks: [
        { ul: ['Seed: between 5 and 100 NEAR at full size. The demo factory uses one hundredth of that.', 'Storage deposit: held by the coin account to pay for its code. The launch screen shows the exact amount.', 'Gas: a small network fee.'] } ] },
      { id: 'cannot', title: 'What you cannot do', blocks: [{ ul: ['Pull the seed back out.', 'Change a rule, mint more, or freeze anyone\'s tokens.', 'Take the creator escrow before the coin graduates.'] }] },
    ],
  },
  {
    id: 'account', group: 'Your account', title: 'Profile and wallet', summary: 'Balance, holdings, receipts and safety.',
    parts: [
      { id: 'profile', title: 'The profile page', blocks: [
        { p: 'Click your address chip on the left of the top bar. It shows your balance, the value of your coins, what you hold in each coin, your recent receipts and wallet actions.' } ] },
      { id: 'backup', title: 'Backing up a practice wallet', blocks: [{ p: 'The practice key lives only in this browser. Use Back up my practice key on your profile and keep the text safe. Anyone who has it can use that wallet, so do not share it.' }] },
      { id: 'onetap', title: 'One tap mode', blocks: [
        { p: 'With your own wallet, one approval adds a limited key for a single coin. It can check in, claim packs, back cards and use Battle cry. It can never sell, lock, bet or buy, and it cannot touch your other tokens or NEAR. You can turn it off any time.' } ] },
    ],
  },
  {
    id: 'trust', group: 'Trust', title: 'Safety and proof', summary: 'Why the rules can be trusted.',
    parts: [
      { id: 'nokey', title: 'No admin key', blocks: [{ p: 'The factory deletes its own key after it launches a coin, and a coin has no owner function. A bug cannot be patched either, which is why the contracts were tested heavily before launch.' }] },
      { id: 'tests', title: 'Tests', blocks: [{ ul: ['116 coin tests and 7 factory tests, each run at real and demo scale.', 'Random fuzz runs, including one that plays every card, stake, omen and claim, check that the contract rules hold, that the coin stays fully backed and that the escrow and payout lists always add up.', 'A gas probe on the real chain build closes full size Prophecies, Black Holes and Bounties and records the cost.', 'The Judges page lets you try transactions that must be refused and see the contract refuse them.'] }] },
      { id: 'risks', title: 'Honest limits', blocks: [{ ul: ['The 5% reward pool pays for Harvest, Black Hole, Bounty and Diamond Pool, each capped, but a very busy coin could drain it in about a week.', 'This is testnet only. Nothing has value.', 'The contracts are not audited. Do not use them with real money.', 'Not everyone profits in a game like this. Skill and luck both matter.', 'Duels and Bounties can be gamed with a second wallet: a friend or alt takes the other side. The 10% burn and the stake caps make it costly, not impossible.', 'Prophecy, Black Hole and Bounty payouts are claimed by each wallet with Claim payouts. Anything unclaimed for 3 days is burned.', 'Randomness (card rolls, fire times) comes from the chain’s random seed. It is fine for a game, not for large stakes. Raid plans are readable from contract state.', 'The log in the app shows the latest 200 entries per coin. Every entry is also a public event, so full history can be rebuilt.'] }] },
    ],
  },
  {
    id: 'trouble', group: 'Help', title: 'Troubleshooting', summary: 'When something does not work.',
    parts: [
      { id: 'blocked', title: 'A button is blocked', blocks: [{ table: { head: ['Message', 'What to do'], rows: [
        ['Not enough NEAR', 'Try a smaller amount. You need some NEAR left for network fees.'],
        ['Enter an amount', 'Type an amount above zero.'],
        ['More than you hold', 'Lower the amount or use a percent preset.'],
        ['Locked by your bet', 'A live Prophecy bet blocks trading until it resolves.'],
        ['Curve sold out', 'The coin graduated, so buying is over. You can still sell.'],
        ['Nothing to claim', 'You have no waiting payout. Claim only shows when a Prophecy, Black Hole or Bounty paid you.'],
        ['Too many payouts are waiting to be claimed', 'Wallets have not claimed yet. Try again in a few minutes, or claim yours to help clear the list.'],
        ['The hole is full / too many bettors / 20 pledges already', 'Black Holes take 40 throws, Prophecies 40 wallets and Bounties 20 pledges. Start or join another.'],
        ['A Bounty cannot ask the Tide question', 'Pick Line, Crowd or Vault. One buy would make a Tide goal true.'] ] } }] },
      { id: 'funds', title: 'My practice wallet has no NEAR', blocks: [{ p: 'The practice wallet is sent a small amount of testnet NEAR once. If it runs out, start over with a new practice wallet from your profile, or use your own wallet.' }] },
      { id: 'slow', title: 'Things look slow', blocks: [{ p: 'The app talks to public NEAR testnet nodes. If one is busy it tries another. Wait a few seconds and the page refreshes by itself.' }] },
    ],
  },
  {
    id: 'faq', group: 'Help', title: 'FAQ', summary: 'Quick answers.',
    parts: [
      { id: 'q1', title: 'Is this real money?', blocks: [{ p: 'No. It runs on NEAR testnet and nothing has value.' }] },
      { id: 'q2', title: 'Can the creator rug?', blocks: [{ p: 'No. The curve holds the NEAR buyers paid, and the creator\'s seed cannot come back out. There is no admin key.' }] },
      { id: 'q3', title: 'Why do I need to say gm?', blocks: [{ p: 'It keeps your bag from idle burn and it counts toward the coin\'s daily Ritual.' }] },
      { id: 'q4', title: 'Can I lose everything?', blocks: [{ p: 'Idle burn takes at most 8% of your unlocked tokens in a day, and locked tokens are safe from it. Prices can still fall like any market.' }] },
      { id: 'q6', title: 'Why is the price shown as N/1M?', blocks: [{ p: 'Every coin has a supply of 1 billion tokens, so one token costs a tiny fraction of a NEAR. Showing the price per 1 million tokens keeps the numbers readable, for example 0.027 N/1M instead of 0.000000027 NEAR per token.' }] },
      { id: 'q5', title: 'Is it on mainnet?', blocks: [{ p: 'No. A mainnet launch would need an audit and legal advice first.' }] },
    ],
  },
  {
    id: 'dev', group: 'Build', title: 'For developers', summary: 'Contracts and views.',
    parts: [
      { id: 'contracts', title: 'Contracts', blocks: [{ p: 'Two contracts: a factory that deploys coins, and the coin contract (NEP 141 plus the game). The source, tests and build scripts are in the project repository.' }] },
      { id: 'views', title: 'Useful view methods on a coin', blocks: [{ ul: ['get_coin: price, market cap, pot, energy, level, holders.', 'get_holder: a wallet\'s balance, locks and idle burn clock.', 'get_ritual: today\'s targets, counts and streak.', 'get_log: the latest events, newest first.', 'get_prices: the price history the chart draws.', 'get_raid and get_raids: the live raid and past raids.', 'get_table, get_hand, get_omen, get_level_progress.', 'get_duels and get_bounties: open and finished stakes between wallets.', 'get_pending: payouts waiting for a wallet. claim_payouts collects them.'] }] },
      { id: 'factory', title: 'Factory', blocks: [{ p: 'list_coins lists every coin. get_params returns the seed bounds and the storage deposit. create_coin deploys a new coin with a name, symbol and rules.' }] },
    ],
  },
  {
    id: 'glossary', group: 'Reference', title: 'Glossary A to Z', summary: 'Every term in one list.',
    parts: [
      { id: 'terms', title: 'Terms', blocks: [{ table: { head: ['Term', 'Meaning'], rows: [
        ['Alliance', 'An Epic pact between two coins that lets both fight a common rival.'],
        ['Bag', 'Your holding of one coin.'],
        ['Battle cry', 'A raid action that adds to your side\'s Crowd score.'],
        ['Bonding curve', 'The price rule that every coin trades against.'],
        ['Bounty', 'A Rare where wallets pledge tokens to a goal for 6 hours.'],
        ['Burn', 'Tokens removed from supply for good, logged onchain.'],
        ['Card', 'A rule card played alone or with the crowd.'],
        ['Claim payouts', 'The button that collects what a Prophecy, Black Hole or Bounty owes you.'],
        ['Crowd', 'A raid score component: how many holders show up.'],
        ['Duel', 'A Rare where two named wallets stake the same amount on a one hour question.'],
        ['Energy', 'The coin\'s shared budget for cards, 0 to 100.'],
        ['Graduation', 'When a curve sells out and the coin\'s game ends.'],
        ['gm', 'A check in, once every 6 hours.'],
        ['Harvest', 'An Epic that lets 25 wallets take a share from the reward pool.'],
        ['Hand', 'The cards you hold.'],
        ['Hedge', 'A Common that cuts a Prophecy loss from half of a bet to a quarter.'],
        ['Heat', 'A 0 to 3 counter from Kindle that makes pot cards spend 10% more per point.'],
        ['Idle burn', 'Tokens burned from wallets that go silent.'],
        ['Level', 'Launched, Rising, Hot or Legendary.'],
        ['Muster', 'The preparation period before raid rounds.'],
        ['Omen', 'A short luck event on a coin.'],
        ['Pending payout', 'Tokens waiting on a list for a wallet to claim, burned after 3 days.'],
        ['Pot', 'NEAR the coin keeps for buy and burn.'],
        ['Prophecy', 'A card that asks the crowd a question to bet on.'],
        ['Raid', 'A fight between two coins over part of a pot.'],
        ['Ritual', 'The coin\'s daily target: gm count and locked NEAR.'],
        ['Seed', 'The creator\'s first liquidity in the curve.'],
        ['Spoils', 'What a raid winner takes from the loser\'s pot.'],
        ['Stake', 'Tokens set aside for a bet, duel, throw or pledge until it resolves.'],
        ['Streak', 'Days in a row the coin made its Ritual.'],
        ['Table', 'Cards in play that need other holders.'],
        ['Vault', 'Locked tokens that are safe from burn and earn a share.'],
        ['War points', 'The score the War Map ranks coins by.'] ] } }] },
    ],
  },
];
