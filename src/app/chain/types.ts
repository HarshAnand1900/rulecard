// Shapes returned by the coin and factory contracts' view calls.
export type Rule = 'FairLaunch' | 'LaunchGuard' | 'PaperTax' | 'SoftTax' | 'WhaleCap' | 'HoldTheLine' | 'CreatorLock' | 'Ruthless' | 'WildCoin' | 'WarCoin' | 'PeaceCoin';
export type Card = 'Rally' | 'Curse' | 'Ward' | 'Ember' | 'RollCall' | 'HypeSiren' | 'Prophecy' | 'Inferno';
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
}
export interface Lock { amount: string; mult: number; until: number; }
export interface HolderView {
  balance: string; pending_idle_burn: string; locked: string; locks: Lock[]; vault_weight: string; vault_earned: string;
  since: number; last_gm: number; next_gm: number; idle_burn_starts: number; lost_today: string; loss_cap_today: string; value: string; qualified: boolean;
}
export interface Ritual { day: number; gm_target: number; lock_target: string; gm_count: number; lock_near: string; streak: number; last_made: boolean | null; made_days: number[]; double_from: number[]; }
export interface RuleCheck { name: string; current: string; target: string; met: boolean; }
export interface LevelView { level: number; next: number | null; rules: RuleCheck[]; all_met_since: number | null; hold_ms: number; }
export interface LogEntry { seq: number; at: number; kind: string; account: string | null; amount: string; near: string; memo: string; }
export interface HandCard { card: Card; exp: number; }
export interface HandView { commons: [Card, number][]; cards: HandCard[]; next_pack: number; cut_used: number; starter: boolean; drops_claimed: number; no_trade_until: number; tagged: string; tag_until: number; }
export interface Bet { account: string; yes: boolean; amount: string; }
export interface Chip { account: string; near: string; }
export interface Proposal {
  id: number; card: Card; proposer: string; created: number; phase: number; phase_end: number; needed: number; backers: string[]; card_exp: number;
  chips: Chip[]; chip_total: string; question: Question | null; snapshot: string; bets: Bet[]; result: string;
}
export interface RaidResult { outcome: number; rounds: number[]; mine: string[]; theirs: string[]; spoils: string; }
export interface RaidView {
  seq: number; id: number; attacker: string; defender: string; attacking: boolean; phase: number; backers: number; needed: number;
  start: number; muster_end: number; end: number; round: number | null; live_base: string[]; buy: number[]; crowd: number[]; lock: number[];
  tactic: number[]; planners: number; result: RaidResult | null; note: string;
}
export interface BuyQuote { tokens: string; fee: string; storage: string; near_used: string; refund: string; price_after: string; impact_bps: number; }
export interface SellQuote { near_out: string; fee: string; tax: string; price_after: string; impact_bps: number; }

export const TIER_OF: Record<Card, number> = { Rally: 0, Curse: 0, Ward: 0, Ember: 0, RollCall: 0, HypeSiren: 0, Prophecy: 1, Inferno: 2 };
export const TIER_NAME = ['Common', 'Rare', 'Epic', 'Mythic'];
export const CARD_TEXT: Record<Card, { name: string; way: string; text: string; energy: number }> = {
  Rally: { name: 'Rally', way: 'Raid tactic', text: 'Your raid score ×1.05–1.10. Beats Ward, loses to Curse.', energy: 0 },
  Curse: { name: 'Curse', way: 'Raid tactic', text: 'Their score ×0.95–0.90 and cancels their Rally. Loses to Ward.', energy: 0 },
  Ward: { name: 'Ward', way: 'Raid tactic', text: 'Turns their Curse back on them. Loses to Rally.', energy: 0 },
  Ember: { name: 'Ember', way: 'Needs 3 copies', text: 'The pot burns 1% / 2% / 3% (3 / 6 / 10 copies). Anyone can stoke it.', energy: 5 },
  RollCall: { name: 'Roll Call', way: 'Play alone', text: 'For 1h every gm gives ×2 Energy.', energy: 5 },
  HypeSiren: { name: 'Hype Siren', way: 'Play alone', text: 'Pins the coin on Trending for 15 min.', energy: 5 },
  Prophecy: { name: 'Prophecy', way: 'Needs 2–3 backers', text: 'Ask the crowd a 2h question. Losers lose half: 30% to winners, 10% to you, 10% burned.', energy: 20 },
  Inferno: { name: 'Inferno', way: 'Needs signers', text: 'The crowd fuels (locked 24h, +5%), then the pot burns 10% + half the fuel.', energy: 50 },
};
export const RULE_TEXT: Record<Rule, string> = {
  FairLaunch: 'All buys in the first 5 min at one price', LaunchGuard: 'Max 30 NEAR per wallet in the first 10 min',
  PaperTax: '10% on selling tokens bought < 1h ago, to the pot', SoftTax: '5% on selling tokens bought < 30 min ago',
  WhaleCap: 'No wallet over 2% of supply before L3', HoldTheLine: 'Price drops start a Hold the Line event',
  CreatorLock: "Creator can't sell for 24h, then unlocks over 48h", Ruthless: 'Idle burn is 2% every 6h',
  WildCoin: 'Wild Omens 60% of the time', WarCoin: 'Raid shield 6h, spoils 20% both ways', PeaceCoin: 'No raids before L3',
};
export const LEVEL_NAME = ['', 'Launched', 'Rising', 'Hot', 'Legendary'];
