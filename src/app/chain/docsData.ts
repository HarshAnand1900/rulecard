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
    id: 'cards', group: 'Play', title: 'Rule cards', summary: 'The deck, packs and the Table.',
    parts: [
      { id: 'deck', title: 'The deck', blocks: [
        { p: 'Each coin has its own limited deck. Cards come in four rarities: Common, Rare, Epic and Mythic. The Deck figure on a coin shows how many of each are out.' },
        { table: { head: ['Card', 'Rarity', 'Energy', 'What it does'], rows: [
          ['Rally', 'Common', '0', 'Your raid score ×1.05 to 1.10. Beats Ward, loses to Curse.'],
          ['Curse', 'Common', '0', 'Their score ×0.95 to 0.90 and cancels their Rally. Loses to Ward.'],
          ['Ward', 'Common', '0', 'Turns their Curse back on them. Loses to Rally.'],
          ['Ember', 'Common', '5', 'The pot burns 1%, 2% or 3% at 3, 6 or 10 copies. Anyone can stoke it.'],
          ['Roll Call', 'Common', '5', 'For 1 hour every gm gives double Energy.'],
          ['Hype Siren', 'Common', '5', 'Pins the coin on Trending for 15 minutes.'],
          ['Prophecy', 'Rare', '20', 'Ask the crowd a 2 hour question. Losers lose half.'],
          ['Inferno', 'Epic', '50', 'The crowd fuels, locked for 24 hours. Then the pot burns 10% plus half the fuel.'] ] } },
        { note: 'Storm, Black Hole, Heist and Supernova are planned and not built yet.' } ] },
      { id: 'packs', title: 'Packs and your hand', blocks: [
        { p: 'A pack arrives every few hours. You can hold up to 12 Commons, 3 Rares and 3 Epics. Cards expire if you sit on them, so play or drop what you do not need. Backing other people\'s cards makes your next pack come sooner, up to an hour in total.' } ] },
      { id: 'table', title: 'The Table', blocks: [
        { p: 'Cards that need other people (Ember, Prophecy, Inferno) go on the Table. Other holders back, sign, stoke or fuel them. Each card on the Table shows its phase and a countdown. Cards that act alone fire straight away.' } ] },
      { id: 'prophecy', title: 'Prophecy in detail', blocks: [
        { p: 'The player asks one of four questions: Tide (net buying in 2 hours), Line (price above or below a line), Crowd (a number of new buyers) or Vault (locked share up by some points). Holders bet tokens on Yes or No. Losers lose half of their bet: 30% goes to winners, 10% to the player and 10% is burned.' },
        { note: 'A bet locks your trading until the question resolves.' } ] },
      { id: 'inferno', title: 'Inferno in detail', blocks: [{ p: 'Enough holders sign. Then a fuel window opens where the crowd adds NEAR, locked for 24 hours with a 5% bonus. When it fires the pot burns 10% of itself plus half of the fuel.' }] },
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
      { id: 'tactics', title: 'Tactics', blocks: [{ p: 'Plan your tactic cards in the Raids tab before a round starts. Rally beats Ward, Ward beats Curse and Curse beats Rally. Tactics cost no Energy.' }] },
      { id: 'warmap', title: 'The War Map', blocks: [
        { p: 'The War Map ranks coins by war points. A coin gets 10 points to join and 3 for every level above L1. Each raid moves its level in points from the loser to the winner (L2 is 2, L3 is 3, L4 is 4). Nobody drops below 4. Anyone can recompute the map from the chain.' } ] },
      { id: 'coins', title: 'War rules', blocks: [{ ul: ['WarCoin: a 6 hour raid shield after a raid and spoils of 20% both ways.', 'PeaceCoin: no raids before level 3.'] }] },
    ],
  },
  {
    id: 'omens', group: 'Play', title: 'Omens', summary: 'Short luck events.',
    parts: [
      { id: 'what', title: 'What they are', blocks: [
        { p: 'From level 2, a coin gets omens every few hours: short luck events such as Full Moon, Thunder, Ghost Ember and Treasure. The top banner shows the omen that is incoming or active, with a countdown and an (i) that explains its effect.' } ] },
      { id: 'fair', title: 'How they are chosen', blocks: [{ p: 'An omen comes from public chain randomness, so nobody can order one, and there is a warning before it starts. WildCoin makes wild omens more likely, 60% of the time.' }] },
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
      { id: 'tests', title: 'Tests', blocks: [{ ul: ['56 coin tests and 7 factory tests, at both scales.', 'A 12,000 operation fuzz run checks that the contract rules hold, including that the coin stays fully backed.', 'The Judges page lets you try transactions that must be refused and see the contract refuse them.'] }] },
      { id: 'risks', title: 'Honest limits', blocks: [{ ul: ['This is testnet only. Nothing has value.', 'The contracts are not audited. Do not use them with real money.', 'Not everyone profits in a game like this. Skill and luck both matter.', 'A coin with its own open raid proposal cannot be raided until that proposal launches or expires. The contracts are final, so this is a known limit.', 'The log in the app shows the latest 200 entries per coin. Every entry is also a public event, so full history can be rebuilt.'] }] },
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
        ['Curve sold out', 'The coin graduated, so buying is over. You can still sell.'] ] } }] },
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
      { id: 'views', title: 'Useful view methods on a coin', blocks: [{ ul: ['get_coin: price, market cap, pot, energy, level, holders.', 'get_holder: a wallet\'s balance, locks and idle burn clock.', 'get_ritual: today\'s targets, counts and streak.', 'get_log: the latest events, newest first.', 'get_prices: the price history the chart draws.', 'get_raid and get_raids: the live raid and past raids.', 'get_table, get_hand, get_omen, get_level_progress.'] }] },
      { id: 'factory', title: 'Factory', blocks: [{ p: 'list_coins lists every coin. get_params returns the seed bounds and the storage deposit. create_coin deploys a new coin with a name, symbol and rules.' }] },
    ],
  },
  {
    id: 'glossary', group: 'Reference', title: 'Glossary A to Z', summary: 'Every term in one list.',
    parts: [
      { id: 'terms', title: 'Terms', blocks: [{ table: { head: ['Term', 'Meaning'], rows: [
        ['Bag', 'Your holding of one coin.'],
        ['Battle cry', 'A raid action that adds to your side\'s Crowd score.'],
        ['Bonding curve', 'The price rule that every coin trades against.'],
        ['Burn', 'Tokens removed from supply for good, logged onchain.'],
        ['Card', 'A rule card played alone or with the crowd.'],
        ['Crowd', 'A raid score component: how many holders show up.'],
        ['Energy', 'The coin\'s shared budget for cards, 0 to 100.'],
        ['Graduation', 'When a curve sells out and the coin\'s game ends.'],
        ['gm', 'A check in, once every 6 hours.'],
        ['Hand', 'The cards you hold.'],
        ['Idle burn', 'Tokens burned from wallets that go silent.'],
        ['Level', 'Launched, Rising, Hot or Legendary.'],
        ['Muster', 'The preparation period before raid rounds.'],
        ['Omen', 'A short luck event on a coin.'],
        ['Pot', 'NEAR the coin keeps for buy and burn.'],
        ['Prophecy', 'A card that asks the crowd a question to bet on.'],
        ['Raid', 'A fight between two coins over part of a pot.'],
        ['Ritual', 'The coin\'s daily target: gm count and locked NEAR.'],
        ['Seed', 'The creator\'s first liquidity in the curve.'],
        ['Spoils', 'What a raid winner takes from the loser\'s pot.'],
        ['Streak', 'Days in a row the coin made its Ritual.'],
        ['Table', 'Cards in play that need other holders.'],
        ['Vault', 'Locked tokens that are safe from burn and earn a share.'],
        ['War points', 'The score the War Map ranks coins by.'] ] } }] },
    ],
  },
];
