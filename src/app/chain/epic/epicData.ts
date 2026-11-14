// @ts-nocheck
// Card face text from the design file: [no, name, how played, stat, colour name, accent, deep, rule]
const kico = inner => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`)}")`;
export const EPICS: any[] = [
  [22, 'Inferno', 'Needs signers', 'BURN 10%+', 'Ember orange', '#ff6a1f', '#5a1205', 'The crowd fuels (locked 24h, +5%), then the pot burns 10% plus half the fuel.'],
  [23, 'Black Hole', 'Needs signers', '40% BACK', 'Void violet', '#a855ff', '#1d0647', 'Holders throw tokens in and all of it burns. The reward pool gives back 40% (+5% per Heat). The top 3 throwers get a pack.'],
  [24, 'Harvest', 'Needs signers', '25 SHARES', 'Wheat gold', '#ffc23d', '#4a2a00', 'For 1 hour, wallets that checked in today take one share (0.01% of supply) from the reward pool. 25 shares.'],
  [25, 'Hard Raid', 'Starts a raid', '×2 SPOILS', 'Blood red', '#ff2e4d', '#4a0012', 'A raid with double spoils both ways. The loser flies the winner’s banner for 12 hours.'],
  [26, 'Whale Tax', 'Needs signers', '+1% SELL', 'Deep-sea blue', '#2fb8ff', '#062a4a', 'For 2 hours, wallets holding over 2% of supply pay +1% on sells, to the pot.'],
  [27, 'Alliance', 'Needs signers', '6H PACT', 'Pact green', '#35e0a1', '#04382a', 'A 6-hour pact with another coin: no raids between the two.'],
  [28, 'Squeeze', 'Crowd window', '+50% POT', 'Squeeze pink', '#ff4fd8', '#4a0a3e', 'Only when an open Prophecy has No stakes over 1.5× Yes. Opens a Stampede where the pot adds 50%.'],
];
export const RARES: any[] = [
  [11, 'Prophecy', 'Needs 2–3 backers', 'YES / NO', '#5cffc8', '#6fe7ff', 'Mint + cyan', 'Ask the crowd a 2-hour question. Losers lose half: 60% to winners, 20% to you, 20% burned.'],
  [12, 'Mirror', 'Raid tactic', 'COPY R-1', '#3dff9a', '#e8fff0', 'Spring green', 'In round 2 or 3 it copies the enemy’s tactic from the round before.'],
  [13, 'Counterspell', 'Raid tactic / on a card', 'CANCEL', '#b8ff3d', '#ff6ad5', 'Acid lime + magenta', 'Cancels the enemy tactic that round, or cancels a Common or Rare still gathering backers.'],
  [14, 'Last Stand', 'Play alone', 'BURN 10%', '#2cff6a', '#ffb347', 'Emerald + amber', 'Only when the price is 25% below its 24h high: the pot buys and burns 10% of itself. Once a day.'],
  [15, 'Slow Burn', 'Play alone', '1% / TRADE', '#d4ff4a', '#ff9a3d', 'Chartreuse + orange', 'For 1 hour, 1% of the tokens in every trade burn.'],
  [16, 'Duel', 'Challenge a holder', 'WINNER ×2', '#4be3a0', '#ff5a6a', 'Jade + red', 'You and one holder stake the same tokens on “net buyer for 1h?”. The winner takes both, minus 10% burned.'],
  [17, 'Diamond Pool', 'Play alone', '×1.25 LOCK', '#5effb5', '#9fe8ff', 'Sea green + ice', 'For 24 hours, new locks of 24h or more get ×1.25 weight and +1% bonus tokens.'],
  [18, 'Bounty', 'Pledge to a goal', '+10% / −10%', '#7dffa6', '#ffd36b', 'Classic phosphor + gold', 'Pledge tokens to a goal for 6 hours. Goal met: +10% from the reward pool. Missed: 10% burns.'],
  [19, 'Friendly Raid', 'Starts a raid', 'NO SPOILS', '#00ff9c', '#c9a6ff', 'Neon spring + lilac', 'A raid with no spoils either way. Winners still earn their win pack.'],
  [20, 'Recruit', 'Play alone', '+5% BONUS', '#c6ff4a', '#ffcf4a', 'Lime + gold', 'For 1 hour a wallet’s first buy of 3 NEAR or more gets +5% bonus tokens, locked 6 hours.'],
  [21, 'Stampede', 'Crowd window', '+20% POT', '#3dffd0', '#b6ff3d', 'Teal + lime', '10 minutes: holders put in NEAR and it all buys as one batch. With 10+ wallets the pot adds 20%.'],
];
export const COMMONS: any[] = [
  [1, 'Rally', 'raid', 'RAID TACTIC', 0, 'Your score ×1.10', '×1.05 – ×1.10 · beats Ward, loses to Curse', '#5b4bf0', '#ff9fd6', 'Cotton candy', 'rally', 'Your raid score ×1.05–1.10. Beats Ward, loses to Curse.', '#ff4fd8', '#a77bff'],
  [2, 'Curse', 'raid', 'RAID TACTIC', 0, 'Their score ×0.90', 'Cancels their Rally · loses to Ward', '#0e4656', '#86e6bc', 'Aurora', 'curse', 'Their score ×0.95–0.90 and cancels their Rally. Loses to Ward.', '#a46bff', '#1f8a72'],
  [3, 'Ward', 'raid', 'RAID TACTIC', 0, 'Turn their Curse back', 'Beats Curse · loses to Rally', '#3a76cc', '#8cc2f2', 'Clear sky', 'ward', 'Turns their Curse back on them. Loses to Rally.', '#a855ff', '#5f9ee2'],
  [4, 'Decoy', 'raid', 'RAID TACTIC', 0, 'A fake play', 'Looks real to a Scout · does nothing', '#6c4fd0', '#ecdcff', 'Lilac haze', 'decoy', 'A fake play that looks real to a Scout but does nothing.', '#4d7cff', '#a98af2'],
  [5, 'Ember', 'backed', 'NEEDS 3 COPIES', 5, 'The pot burns 1–3%', '3 / 6 / 10 copies · anyone can stoke', '#33246e', '#ff96ae', 'Dusk rose', 'ember', 'The pot burns 1%, 2% or 3% (3, 6 or 10 copies). Anyone can stoke it.', '#ffb3e0', '#a2449f'],
  [6, 'Roll Call', 'solo', 'PLAY ALONE', 5, 'Every gm gives ×2 Energy', 'Lasts 1 hour', '#1663c9', '#b6f2ff', 'Morning lagoon', 'rollcall', 'For 1 hour every gm gives ×2 Energy.', '#2ff2ff', '#31b4e4'],
  [7, 'Hype Siren', 'solo', 'PLAY ALONE', 5, 'Pin the coin on Trending', '15 minutes on the Trending list', '#140d45', '#c04aff', 'Neon night', 'siren', 'Pins the coin on Trending for 15 minutes.', '#ff3dc8', '#4a1ea6'],
  [8, 'Kindle', 'solo', 'PLAY ALONE', 5, 'Heat +1', 'Max 3 · cools 1 an hour · pot cards +10% per Heat', '#281458', '#e070ae', 'Violet glow', 'kindle', 'Heat +1 (max 3, cools 1 an hour). Pot cards spend 10% more per Heat.', '#ff86c8', '#76309e'],
  [9, 'Scout', 'raid', 'RAID ACTION', 5, 'Peek at their next tactic', 'Raid only · reveals the next round', '#052752', '#3fcfe0', 'Deep sea', 'scout', 'In a raid, ask the enemy what tactic it planned for the next round.', '#6ffff0', '#0d6a9c'],
  [10, 'Hedge', 'bet', 'ON YOUR BET', 5, 'Lose a quarter, win less', 'On a Prophecy bet · wins gain 25% less', '#1a6f86', '#c6f6e2', 'Mint sky', 'hedge', 'On a Prophecy bet: a loss costs a quarter instead of half, a win gains 25% less.', '#5b7cff', '#45b9ab'],
];
export const KWAY: Record<string, string> = {
  raid: kico('<path d="M4 4l16 16M20 4L4 20M6 15l3 3M18 15l-3 3"/>'),
  backed: kico('<path d="M5 22V11a2 2 0 0 1 4 0v11zM15 22V11a2 2 0 0 1 4 0v11zM3 7l2 2M9 4v3M15 4v3M21 7l-2 2"/>'),
  solo: kico('<path d="M14 2L5 14h6l-2 8 9-12h-6z" fill="#000"/>'),
  bet: kico('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9 9.5h4.5a2 2 0 0 1 0 4H10a2 2 0 0 0 0 4h4.5"/>'),
};
export const kdim = (hex, k) => { const n = parseInt(hex.slice(1), 16); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(c => Math.round(c * k).toString(16).padStart(2, '0')).join(''); };
export const symKey = (n: string) => ({ 'Roll Call': 'rollcall', 'Hype Siren': 'siren', 'Counterspell': 'counter', 'Last Stand': 'laststand', 'Slow Burn': 'slowburn', 'Diamond Pool': 'diamond', 'Friendly Raid': 'friendlyraid', 'Black Hole': 'blackhole', 'Hard Raid': 'war', 'Whale Tax': 'whale' } as Record<string, string>)[n] || n.toLowerCase().replace(/\s+/g, '');
