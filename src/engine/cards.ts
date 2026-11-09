// Card catalogue. Every number here is a rule the contract enforces the same way.
export type Tier = 'Common' | 'Rare' | 'Epic' | 'Mythic';
export type CardType =
  | 'ward' | 'rally' | 'taxHoliday' | 'rollCall' | 'hypeSiren' | 'rebrand'
  | 'curse' | 'mirror' | 'slowBurn' | 'happyHour' | 'diamondPool' | 'summoningCircle' | 'prophecy' | 'friendlyRaid'
  | 'inferno' | 'blackHole' | 'hardRaid'
  | 'supernova';
export type RuleId = 'launchGuard' | 'paperTax' | 'holdTheLine' | 'vaultSeal';
export type CardKind = 'hand' | 'tactic' | 'cosmetic' | 'raid';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export interface CardDef { type: CardType; name: string; tier: Tier; kind: CardKind; text: string; duration: number; }

export const CARDS: Record<CardType, CardDef> = {
  ward:        { type: 'ward', name: 'Ward', tier: 'Common', kind: 'tactic', duration: 0, text: 'Raid tactic. Blocks the opponent\'s Curse this round and reflects -7% back.' },
  rally:       { type: 'rally', name: 'Rally', tier: 'Common', kind: 'tactic', duration: 0, text: 'Raid tactic. +7% to your raid score this round (halved by Curse).' },
  taxHoliday:  { type: 'taxHoliday', name: 'Tax Holiday', tier: 'Common', kind: 'hand', duration: 10 * MIN, text: '0% trading fee for 10 minutes.' },
  rollCall:    { type: 'rollCall', name: 'Roll Call', tier: 'Common', kind: 'hand', duration: HOUR, text: 'For 1h, check-ins charge the meters twice as fast.' },
  hypeSiren:   { type: 'hypeSiren', name: 'Hype Siren', tier: 'Common', kind: 'cosmetic', duration: 15 * MIN, text: 'Pins the coin to the top of Trending for 15 minutes.' },
  rebrand:     { type: 'rebrand', name: 'Rebrand', tier: 'Common', kind: 'cosmetic', duration: HOUR, text: 'Gives the mascot a new skin for 1h.' },
  curse:       { type: 'curse', name: 'Curse', tier: 'Rare', kind: 'tactic', duration: 0, text: 'Raid tactic. -10% to the opponent\'s score this round and halves their Rally.' },
  mirror:      { type: 'mirror', name: 'Mirror', tier: 'Rare', kind: 'tactic', duration: 0, text: 'Raid tactic. Copies the card the opponent played last round.' },
  slowBurn:    { type: 'slowBurn', name: 'Slow Burn', tier: 'Rare', kind: 'hand', duration: HOUR, text: 'For 1h, 1% of the tokens in every trade burn. Floor lift follows.' },
  happyHour:   { type: 'happyHour', name: 'Happy Hour', tier: 'Rare', kind: 'hand', duration: 15 * MIN, text: 'For 15m the pot buys +10% bonus tokens for buyers. Bonus vests over 6h; sell early and it burns.' },
  diamondPool: { type: 'diamondPool', name: 'Diamond Pool', tier: 'Rare', kind: 'hand', duration: HOUR, text: 'Opens a 1h join window to lock tokens for 1h / 6h / 24h. Leaving early costs 20%: half burns, half goes to those who stay.' },
  summoningCircle: { type: 'summoningCircle', name: 'Summoning Circle', tier: 'Rare', kind: 'hand', duration: 30 * MIN, text: 'For 30m holders chant with a stake. Enough wallets and 10% of supply (Conviction, max 1% per wallet) and 10% of stakes burn; early chanters earn cards.' },
  prophecy:    { type: 'prophecy', name: 'Prophecy', tier: 'Rare', kind: 'hand', duration: 6 * HOUR, text: 'Sets a net-inflow target for 6h. Hit it and every participant gets a Rare card, and the Ult meter jumps +50.' },
  friendlyRaid:{ type: 'friendlyRaid', name: 'Friendly Raid', tier: 'Rare', kind: 'raid', duration: 2 * HOUR, text: 'Challenge another coin. 2h, 4 rounds. Loser\'s raid stakes: 30% burn on their own coin.' },
  inferno:     { type: 'inferno', name: 'Inferno', tier: 'Epic', kind: 'hand', duration: HOUR, text: 'The pot spends 50% of what it may spend buying and burning tokens, in 12 chunks over 1h. Caster cannot sell for 2h.' },
  blackHole:   { type: 'blackHole', name: 'Black Hole', tier: 'Epic', kind: 'hand', duration: HOUR, text: 'Opens a pit for 1h. Holders throw in tokens; at the end it all burns and contributors get a badge and a card.' },
  hardRaid:    { type: 'hardRaid', name: 'Hard Raid', tier: 'Epic', kind: 'raid', duration: 2 * HOUR, text: 'Challenge another coin. Half the loser\'s stakes are sold and buy the winner\'s token over 1h (half burned, half to raiders). Loser shows the winner\'s banner for 12h.' },
  supernova:   { type: 'supernova', name: 'Supernova', tier: 'Mythic', kind: 'hand', duration: 2 * HOUR, text: 'The pot spends everything it may spend buying and burning tokens, in 24 chunks over 2h. Caster cannot sell for 2h.' },
};

export const RULES: Record<RuleId, { name: string; text: string }> = {
  launchGuard: { name: 'Launch Guard', text: 'Each wallet may buy at most 1 NEAR in the first 10 minutes.' },
  paperTax:    { name: 'Paper Tax', text: 'Selling tokens bought in the last 15 minutes costs +2% (to the pot).' },
  holdTheLine: { name: 'Hold the Line', text: 'A 20% drop within 1h triggers 6h of Hold the Line: +2% sell toll to a prize, the pot buys and burns the dip, holders who don\'t sell share the prize.' },
  vaultSeal:   { name: 'Vault Seal', text: 'The creator cannot sell for 24h after launch.' },
};

export const TIER_LEVEL: Record<Tier, number> = { Common: 1, Rare: 2, Epic: 3, Mythic: 4 };
export const ANNOUNCE: Record<Tier, number> = { Common: 0, Rare: 2 * MIN, Epic: 5 * MIN, Mythic: 10 * MIN };
export const LEVELS = [0, 5, 20, 60, 120]; // real NEAR in curve for L1..L5
export const LEVEL_NAMES = ['Spark', 'Flame', 'Blaze', 'Inferno', 'Graduate'];
export const TIERS: Tier[] = ['Common', 'Rare', 'Epic', 'Mythic'];
export const byTier = (t: Tier) => (Object.values(CARDS).filter(c => c.tier === t).map(c => c.type));
