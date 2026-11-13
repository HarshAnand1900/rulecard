// Shapes returned by the coin and factory contracts' view calls.
export type Rule = 'FairLaunch' | 'LaunchGuard' | 'PaperTax' | 'SoftTax' | 'WhaleCap' | 'HoldTheLine' | 'CreatorLock' | 'Ruthless' | 'WildCoin' | 'WarCoin' | 'PeaceCoin';
export type Card =
  | 'Rally' | 'Curse' | 'Ward' | 'Ember' | 'RollCall' | 'HypeSiren' | 'Kindle' | 'Scout' | 'Decoy' | 'Hedge'
  | 'Prophecy' | 'Mirror' | 'Counterspell' | 'LastStand' | 'SlowBurn' | 'Duel' | 'DiamondPool' | 'Bounty' | 'FriendlyRaid' | 'Recruit' | 'Stampede'
  | 'Inferno' | 'BlackHole' | 'Harvest' | 'HardRaid' | 'WhaleTax' | 'Alliance' | 'Squeeze'
  | 'Supernova';
export type Question = { Line: { price: string } } | 'Tide' | { Crowd: { n: number } } | { Vault: { bps: number } };

export interface CoinEntry { account_id: string; name: string; symbol: string; creator: string; created_ms: number; seed: string; }
export interface DeckView { tier: number; out: number; limit: number; eligible: number; }
export interface CoinView {
  name: string; symbol: string; creator: string; rules: Rule[]; created_ms: number; now: number;
  price: string; mcap: string; real: string; circulating: string; total_supply: string; burned: string;
  pot: string; pot_spent_today: string; escrow: string; protocol_owed: string; reward_pool: string;
  vault_locked: string; vault_weight: string; energy: number; level: number; level_at: number[];
  holders: number; graduated: boolean; solvent: boolean; curve_room: string;
  hype_until: number; rollcall_until: number; tag_until: number; deck: DeckView[];
  heat: number; slowburn_until: number; recruit_until: number; diamond_until: number; whale_until: number;
  harvest_until: number; harvest_claims: number; ally: string | null; ally_until: number; banner_by: string | null; banner_until: number;
}
export interface Lock { amount: string; mult: number; until: number; }
export interface HolderView {
  balance: string; pending_idle_burn: string; locked: string; locks: Lock[]; vault_weight: string; vault_earned: string;
  since: number; last_gm: number; next_gm: number; idle_burn_starts: number; lost_today: string; loss_cap_today: string; value: string; qualified: boolean;
}
export interface Ritual { day: number; gm_target: number; lock_target: string; gm_count: number; lock_near: string; streak: number; best_streak?: number; best_streak_day?: number; last_made: boolean | null; made_days: number[]; double_from: number[]; }
export interface RuleCheck { name: string; current: string; target: string; met: boolean; }
export interface LevelView { level: number; next: number | null; rules: RuleCheck[]; all_met_since: number | null; hold_ms: number; }
export interface LogEntry { seq: number; at: number; kind: string; account: string | null; amount: string; near: string; memo: string; }
export interface HandCard { card: Card; exp: number; }
export interface HandView { commons: [Card, number][]; cards: HandCard[]; next_pack: number; cut_used: number; starter: boolean; drops_claimed: number; no_trade_until: number; tagged: string; tag_until: number; }
export interface Bet { account: string; yes: boolean; amount: string; hedged: boolean; }
export interface Chip { account: string; near: string; }
export interface Proposal {
  id: number; card: Card; proposer: string; created: number; phase: number; phase_end: number; needed: number; backers: string[]; card_exp: number;
  chips: Chip[]; chip_total: string; question: Question | null; snapshot: string; bets: Bet[]; result: string; target: string | null;
}
export interface Duel { id: number; a: string; b: string; stake: string; a_yes: boolean; phase: number; created: number; start: number; end: number; snapshot: string; result: string; }
export interface Pledge { account: string; amount: string; }
export interface Payout { account: string; tokens: string; pack: boolean; at: number; what: string; }
/** One colour per omen. While an omen is active the background mesh turns this colour. */
export const OMEN_COLOR: Record<string, string> = {
  'Full Moon': '#C9D6FF', Thunder: '#6C8CFF', 'Ghost Ember': '#FF7A3D', Treasure: '#FFC83D', Squall: '#35E0CC', Oracle: '#B57BFF', 'Iron Vault': '#9FB0C8',
  Windfall: '#5BE6A4', 'Gold Rush': '#FFD24A', Drought: '#E0A640', 'Low Tide': '#3FA7FF', 'Blood Moon': '#FF3B3B', Fog: '#B4BAC4',
};
export interface Bounty { id: number; sponsor: string; question: Question; snapshot: string; created: number; end: number; pledges: Pledge[]; total: string; phase: number; result: string; }
export interface RaidResult { outcome: number; rounds: number[]; mine: string[]; theirs: string[]; spoils: string; }
export interface RaidView {
  seq: number; id: number; attacker: string; defender: string; attacking: boolean; phase: number; backers: number; needed: number;
  start: number; muster_end: number; end: number; round: number | null; live_base: string[]; buy: number[]; crowd: number[]; lock: number[];
  tactic: number[]; planners: number; result: RaidResult | null; note: string; kind: number; scout: number[];
}
export interface BuyQuote { tokens: string; fee: string; storage: string; near_used: string; refund: string; price_after: string; impact_bps: number; }
export interface SellQuote { near_out: string; fee: string; tax: string; price_after: string; impact_bps: number; }

export const TIER_OF: Record<Card, number> = {
  Rally: 0, Curse: 0, Ward: 0, Ember: 0, RollCall: 0, HypeSiren: 0, Kindle: 0, Scout: 0, Decoy: 0, Hedge: 0,
  Prophecy: 1, Mirror: 1, Counterspell: 1, LastStand: 1, SlowBurn: 1, Duel: 1, DiamondPool: 1, Bounty: 1, FriendlyRaid: 1, Recruit: 1, Stampede: 1,
  Inferno: 2, BlackHole: 2, Harvest: 2, HardRaid: 2, WhaleTax: 2, Alliance: 2, Squeeze: 2,
  Supernova: 3,
};
export const TIER_NAME = ['Common', 'Rare', 'Epic', 'Mythic'];
/** How a card is used: raid = goes in a raid plan, solo = fires at once, table = goes on the Table and needs the crowd, special = has its own form. */
export type Use = 'raid' | 'solo' | 'table' | 'special';
export const USE_OF: Record<Card, Use> = {
  Rally: 'raid', Curse: 'raid', Ward: 'raid', Mirror: 'raid', Counterspell: 'raid', Decoy: 'raid',
  Ember: 'table', Prophecy: 'table', Inferno: 'table', BlackHole: 'table', Harvest: 'table', WhaleTax: 'table', Supernova: 'table', Stampede: 'table', Squeeze: 'table', Alliance: 'table',
  RollCall: 'solo', HypeSiren: 'solo', Kindle: 'solo', SlowBurn: 'solo', Recruit: 'solo', DiamondPool: 'solo', LastStand: 'solo',
  Scout: 'special', Hedge: 'special', Duel: 'special', Bounty: 'special', FriendlyRaid: 'special', HardRaid: 'special',
};
export const CARD_TEXT: Record<Card, { name: string; way: string; text: string; energy: number }> = {
  Rally: { name: 'Rally', way: 'Raid tactic', text: 'Your raid score ×1.05–1.10. Beats Ward, loses to Curse.', energy: 0 },
  Curse: { name: 'Curse', way: 'Raid tactic', text: 'Their score ×0.95–0.90 and cancels their Rally. Loses to Ward.', energy: 0 },
  Ward: { name: 'Ward', way: 'Raid tactic', text: 'Turns their Curse back on them. Loses to Rally.', energy: 0 },
  Ember: { name: 'Ember', way: 'Needs 3 copies', text: 'The pot burns 1% / 2% / 3% (3 / 6 / 10 copies). Anyone can stoke it.', energy: 5 },
  RollCall: { name: 'Roll Call', way: 'Play alone', text: 'For 1h every gm gives ×2 Energy.', energy: 5 },
  HypeSiren: { name: 'Hype Siren', way: 'Play alone', text: 'Pins the coin on Trending for 15 min.', energy: 5 },
  Kindle: { name: 'Kindle', way: 'Play alone', text: 'Heat +1 (max 3, cools 1 an hour). Pot cards spend 10% more per Heat. Once per wallet per 6h.', energy: 5 },
  Scout: { name: 'Scout', way: 'Raid action', text: 'In a raid, ask the enemy coin what tactic it planned for the next round. A Decoy shows up as a real card.', energy: 5 },
  Decoy: { name: 'Decoy', way: 'Raid tactic', text: 'A fake play: looks like a real tactic to a Scout, but does nothing and does not protect you.', energy: 0 },
  Hedge: { name: 'Hedge', way: 'On your bet', text: 'Attach to your bet on a Prophecy: if it loses you lose a quarter instead of half; if it wins you gain 25% less.', energy: 5 },
  Prophecy: { name: 'Prophecy', way: 'Needs 2–3 backers', text: 'Ask the crowd a 2h question. Losers lose half: 60% of it to winners, 20% to you, 20% burned.', energy: 20 },
  Mirror: { name: 'Mirror', way: 'Raid tactic', text: 'In round 2 or 3 it copies the enemy tactic from the round before. In round 1 it does nothing.', energy: 20 },
  Counterspell: { name: 'Counterspell', way: 'Raid tactic or on a card', text: 'As a raid tactic it cancels the enemy tactic that round. Or cancel a Common or Rare card that is still gathering backers.', energy: 20 },
  LastStand: { name: 'Last Stand', way: 'Play alone', text: 'Only when the price is 25% below its 24h high: the pot buys and burns 10% of itself. Once a day.', energy: 20 },
  SlowBurn: { name: 'Slow Burn', way: 'Play alone', text: 'For 1h, 1% of the tokens in every trade burn.', energy: 20 },
  Duel: { name: 'Duel', way: 'Challenge a holder', text: 'You and one holder stake the same tokens on "net buyer for 1h?". The winner takes both, minus 10% burned.', energy: 20 },
  DiamondPool: { name: 'Diamond Pool', way: 'Play alone', text: 'For 24h new locks of 24h or more get ×1.25 weight and +1% bonus tokens from the reward pool.', energy: 20 },
  Bounty: { name: 'Bounty', way: 'Pledge to a goal', text: 'Pledge tokens to a goal for 6h. Goal met: everyone gets +10% from the reward pool. Missed: 10% burns.', energy: 20 },
  FriendlyRaid: { name: 'Friendly Raid', way: 'Starts a raid', text: 'A raid with no spoils either way. Winners still earn their win pack.', energy: 20 },
  Recruit: { name: 'Recruit', way: 'Play alone', text: 'For 1h a wallet\'s first buy of 3 NEAR or more gets +5% bonus tokens, locked 6h.', energy: 20 },
  Stampede: { name: 'Stampede', way: 'Opens a crowd window', text: '10 minutes: holders put in NEAR and it all buys as one batch at one average price. With 10+ wallets the pot adds 20%.', energy: 20 },
  Inferno: { name: 'Inferno', way: 'Needs signers', text: 'The crowd fuels (locked 24h, +5%), then the pot burns 10% + half the fuel.', energy: 50 },
  BlackHole: { name: 'Black Hole', way: 'Needs signers', text: 'Holders throw tokens in, all of it burns, the reward pool gives back 40% (+5% per Heat). The top 3 throwers get a pack ready.', energy: 50 },
  Harvest: { name: 'Harvest', way: 'Needs signers', text: 'For 1h, wallets that checked in today take one share (0.01% of supply) from the reward pool. 25 shares.', energy: 50 },
  HardRaid: { name: 'Hard Raid', way: 'Starts a raid', text: 'A raid with double spoils both ways. The loser flies the winner\'s banner for 12h.', energy: 50 },
  WhaleTax: { name: 'Whale Tax', way: 'Needs signers', text: 'For 2h wallets holding over 2% of supply pay +1% on sells, to the pot.', energy: 50 },
  Alliance: { name: 'Alliance', way: 'Needs signers', text: 'A 6h pact with another coin: no raids between the two.', energy: 50 },
  Squeeze: { name: 'Squeeze', way: 'Opens a crowd window', text: 'Only when an open Prophecy has No stakes over 1.5× Yes. Opens a Stampede where the pot adds 50%.', energy: 50 },
  Supernova: { name: 'Supernova', way: 'Needs many signers', text: 'The pot spends as much as the daily cap allows in one go, and Heat jumps to 3. Level 3 coins.', energy: 100 },
};
export const RULE_TEXT: Record<Rule, string> = {
  FairLaunch: 'All buys in the first 5 min at one price', LaunchGuard: 'Max 30 NEAR per wallet in the first 10 min',
  PaperTax: '10% on selling tokens bought < 1h ago, to the pot', SoftTax: '5% on selling tokens bought < 30 min ago',
  WhaleCap: 'No wallet over 2% of supply before L3', HoldTheLine: 'Price drops start a Hold the Line event',
  CreatorLock: "Creator can't sell for 24h, then unlocks over 48h", Ruthless: 'Idle burn is 2% every 6h',
  WildCoin: 'Wild Omens 60% of the time', WarCoin: 'Raid shield 6h, spoils 20% both ways', PeaceCoin: 'No raids before L3',
};
export const LEVEL_NAME = ['', 'Launched', 'Rising', 'Hot', 'Legendary'];

export interface OmenView { phase: 'none' | 'incoming' | 'active'; kind: number; name: string; text: string; starts_at: number; ends_at: number; needs_roll: boolean; }

/** Which outline symbol (public/bg/symbols/NAME.png) stands for each card. */
export const CARD_SYMBOL: Record<Card, string> = {
  Rally: 'rally', Curse: 'curse', Ward: 'ward', Ember: 'ember', RollCall: 'rollcall', HypeSiren: 'siren', Kindle: 'wildcard', Scout: 'way-signed', Decoy: 'way-solo', Hedge: 'hedge',
  Prophecy: 'prophecy', Mirror: 'way-contested', Counterspell: 'counter', LastStand: 'laststand', SlowBurn: 'slowburn', Duel: 'war', DiamondPool: 'diamond', Bounty: 'conquest',
  FriendlyRaid: 'way-backed', Recruit: 'recruit', Stampede: 'storm', Inferno: 'inferno', BlackHole: 'blackhole', Harvest: 'harvest', HardRaid: 'way-raid', WhaleTax: 'whale',
  Alliance: 'alliance', Squeeze: 'heist', Supernova: 'supernova',
};
