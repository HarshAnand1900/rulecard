//! The deck: packs, level drops, the hand, deck limits that grow with eligible holders, Fade and "make room first".
//! Demo deck: Commons Rally, Curse, Ward, Ember, Roll Call, Hype Siren; Rare Prophecy; Epic Inferno.
//! A roll for a tier with no card (or no stock) falls to the tier below.
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId};

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Card { Rally, Curse, Ward, Ember, RollCall, HypeSiren, Prophecy, Inferno }

pub const COMMONS: [Card; 6] = [Card::Rally, Card::Curse, Card::Ward, Card::Ember, Card::RollCall, Card::HypeSiren];
/// 60% raid tactics, 40% the others (Ember gets the share of the unbuilt Hedge).
pub const COMMON_W: [u32; 6] = [20, 20, 20, 20, 10, 10];
pub const HAND_COMMONS: u8 = 12;
pub const HAND: [usize; 3] = [3, 3, 1]; // Rare, Epic, Mythic
pub const FADE: u64 = DAY;
/// Eligibility per tier: NEAR held and hours held. Deck limit per tier: 1 per N eligible holders, with a minimum.
pub const ELIG_NEAR: [u128; 3] = [3 * GN, 5 * GN, 10 * GN];
pub const ELIG_HOLD: [u64; 3] = [HOUR, 2 * HOUR, 4 * HOUR];
pub const CAP_RATIO: [u32; 3] = [2, 5, 12];
pub const CAP_MIN: [u32; 3] = [8, 4, 2];
pub const PACK_EVERY: u64 = 6 * HOUR;
pub const MAX_CUT: u64 = HOUR;
pub const CUT_BACK: u64 = 10 * MIN;
pub const CUT_CHIP: u64 = 15 * MIN;

/// Tier odds [Common, Rare, Epic, Mythic] in % by level (index 0 = L1).
pub const PACK_ODDS: [[u32; 4]; 4] = [[90, 8, 2, 0], [85, 10, 5, 0], [50, 20, 20, 10], [40, 25, 25, 10]];
pub const WIN_ODDS: [[u32; 4]; 4] = [[70, 15, 10, 5], [70, 15, 10, 5], [45, 20, 20, 15], [35, 25, 25, 15]];
pub const DROP_ODDS: [[u32; 4]; 4] = [[65, 20, 10, 5], [65, 20, 10, 5], [40, 25, 20, 15], [25, 20, 30, 25]];

impl Card {
    /// 0 = Common, 1 = Rare, 2 = Epic, 3 = Mythic
    pub fn tier(self) -> usize { match self { Card::Prophecy => 1, Card::Inferno => 2, _ => 0 } }
    pub fn common_index(self) -> Option<usize> { COMMONS.iter().position(|c| *c == self) }
    pub fn energy(self) -> u32 { [5, 20, 50, 100][self.tier()] }
}
/// Rare+ cards in the demo deck for a tier (Mythics: none yet, so Mythic rolls fall to Epic).
pub fn tier_cards(t: usize) -> &'static [Card] { match t { 1 => &[Card::Prophecy], 2 => &[Card::Inferno], _ => &[] } }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct HandCard { pub card: Card, pub exp: u64 }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct StockEntry { pub card: Card, pub exp: u64 }

#[near(serializers = [json])]
pub struct DeckView { pub tier: u8, pub out: u32, pub limit: u32, pub eligible: u32 }

#[near(serializers = [json])]
pub struct HandView { pub commons: Vec<(Card, u8)>, pub cards: Vec<HandCard>, pub next_pack: u64, pub cut_used: u64, pub starter: bool, pub drops_claimed: u8, pub no_trade_until: u64, pub tagged: U128, pub tag_until: u64 }

#[near]
impl Coin {
    /// Claim your pack: 2 cards every 6h, after a gm in the last 6h. You need room for everything the pack could hold.
    pub fn claim_pack(&mut self) -> Vec<Card> {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        require!(self.is_registered(&a), "buy first");
        self.touch(now);
        let mut h = self.settle(&a, now);
        require!(h.last_gm > 0 && now < h.last_gm + GM_EVERY, "gm first (a pack needs a gm in the last 6h)");
        require!(now >= h.next_pack, "next pack is not ready yet");
        let lvl = self.level as usize - 1;
        let odds = PACK_ODDS[lvl];
        let mut got = vec![];
        if !h.starter && self.pool().value(h.bal + self.locked_of(&h)) >= QUALIFIED_VALUE && h.since > 0 && now >= h.since + QUALIFIED_HOLD {
            h.starter = true;
            for c in [Card::Rally, Card::Curse, Card::Ward] { if Self::commons_held(&h) < HAND_COMMONS { h.commons[c.common_index().unwrap()] += 1; got.push(c); } }
        }
        self.require_room(&h, &odds, 2, now);
        let gold = self.omen_now(now) == 9 && !self.omen.used; // Omen: Gold Rush
        for i in 0..2 {
            let c = if i == 0 && gold { self.roll_min(&mut h, &odds, now, 1) } else { self.roll(&mut h, &odds, now) };
            if i == 0 && gold && c.tier() >= 1 { self.omen.used = true; }
            got.push(c);
        }
        h.next_pack = now + PACK_EVERY; h.cut_used = 0;
        self.save(&a, h);
        events::rulecard("pack", json!({ "account_id": a, "cards": got }));
        got
    }

    /// Claim the 3-card drop for a level the coin reached, if you held (≥ 2 NEAR for 1h) before it crossed.
    pub fn claim_level_drop(&mut self, level: u8) -> Vec<Card> {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        require!((2..=self.level).contains(&level), "the coin hasn't reached that level");
        self.touch(now);
        let mut h = self.settle(&a, now);
        let bit = 1u8 << level; require!(h.drops & bit == 0, "already claimed");
        let crossed = self.level_at[(level - 1) as usize];
        require!(h.since > 0 && h.since + QUALIFIED_HOLD <= crossed, "you weren't holding before the coin crossed");
        let odds = DROP_ODDS[(level - 1) as usize];
        self.require_room(&h, &odds, 3, now);
        let mut got = vec![];
        for _ in 0..3 { let c = self.roll(&mut h, &odds, now); got.push(c); }
        h.drops |= bit;
        self.save(&a, h);
        events::rulecard("level_drop", json!({ "account_id": a, "level": level, "cards": got }));
        got
    }

    /// Drop a card to make room. A Common is destroyed; a Rare or better goes back to the coin's deck.
    pub fn drop_card(&mut self, card: Card) {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        let mut h = self.settle(&a, now);
        if let Some(i) = card.common_index() {
            require!(h.commons[i] > 0, "you don't have that card"); h.commons[i] -= 1;
        } else {
            let i = h.cards.iter().position(|c| c.card == card && c.exp > now).unwrap_or_else(|| env::panic_str("you don't have that card"));
            let hc = h.cards.remove(i); self.free_stock(hc.card, hc.exp);
        }
        self.save(&a, h);
        events::rulecard("drop", json!({ "account_id": a, "card": card }));
    }

    pub fn get_hand(&self, account_id: AccountId) -> Option<HandView> {
        let h = self.holders.get(&account_id)?;
        let now = env::block_timestamp_ms();
        Some(HandView {
            commons: COMMONS.iter().enumerate().map(|(i, c)| (*c, h.commons[i])).collect(),
            cards: h.cards.iter().filter(|c| c.exp > now).cloned().collect(),
            next_pack: h.next_pack, cut_used: h.cut_used, starter: h.starter, drops_claimed: h.drops,
            no_trade_until: h.no_trade_until, tagged: U128(if now < h.tag_until { h.tagged } else { 0 }), tag_until: h.tag_until,
        })
    }
}

impl Coin {
    pub(crate) fn rand(&mut self) -> u64 {
        self.nonce += 1;
        let s = env::random_seed();
        let mut x = u64::from_le_bytes(s[0..8].try_into().unwrap()) ^ self.nonce.wrapping_mul(0x9E37_79B9_7F4A_7C15);
        x ^= x >> 30; x = x.wrapping_mul(0xBF58_476D_1CE4_E5B9); x ^= x >> 27; x = x.wrapping_mul(0x94D0_49BB_1331_11EB); x ^ (x >> 31)
    }

    pub(crate) fn commons_held(h: &Holder) -> u8 { h.commons.iter().sum() }
    fn held_in_tier(h: &Holder, t: usize, now: u64) -> usize { h.cards.iter().filter(|c| c.card.tier() == t && c.exp > now).count() }

    /// Holders eligible for a tier, counted as wallets that did a gm in the last 24h while eligible.
    pub(crate) fn eligible_count(&self, t: usize, now: u64) -> u32 { self.elig[t - 1].sum(now, 24) as u32 }
    pub(crate) fn tier_limit(&self, t: usize, now: u64) -> u32 { CAP_MIN[t - 1].max(self.eligible_count(t, now) / CAP_RATIO[t - 1]) }
    pub(crate) fn stock_out(&self, card: Card, now: u64) -> u32 { self.stock.iter().filter(|s| s.card == card && s.exp > now).count() as u32 }
    pub(crate) fn is_eligible(&self, h: &Holder, t: usize, now: u64) -> bool {
        self.pool().value(h.bal + self.locked_of(h)) >= ELIG_NEAR[t - 1] && h.since > 0 && now >= h.since + ELIG_HOLD[t - 1]
    }
    pub(crate) fn free_stock(&mut self, card: Card, exp: u64) {
        if let Some(i) = self.stock.iter().position(|s| s.card == card && s.exp == exp) { self.stock.remove(i); }
    }

    /// Called at gm: count the wallet toward each tier it is eligible for (once per 24h per tier).
    pub(crate) fn count_eligibility(&mut self, h: &mut Holder, now: u64) {
        for t in 1..=3 {
            if self.is_eligible(h, t, now) && (h.elig_at[t - 1] == 0 || now >= h.elig_at[t - 1] + DAY) { h.elig_at[t - 1] = now; self.elig[t - 1].add(now, 1); }
        }
    }

    /// "Make room first": free Common slots for every card, and a free slot in each higher tier the claim could roll
    /// (for tiers you're eligible for and the deck has).
    pub(crate) fn require_room(&self, h: &Holder, odds: &[u32; 4], n: u8, now: u64) {
        require!(Self::commons_held(h) + n <= HAND_COMMONS, "make room: drop a Common to claim");
        for t in 1..=3usize {
            if odds[t] == 0 || tier_cards(t).is_empty() || !self.is_eligible(h, t, now) { continue; }
            if Self::held_in_tier(h, t, now) >= HAND[t - 1] { env::panic_str(["", "make room: drop a Rare to claim", "make room: drop an Epic to claim", "make room: drop a Mythic to claim"][t]); }
        }
    }

    /// Roll one card: tier from the odds, then a card of that tier with stock. Falls a tier when it can't give one.
    pub(crate) fn roll(&mut self, h: &mut Holder, odds: &[u32; 4], now: u64) -> Card { self.roll_min(h, odds, now, 0) }

    /// Like `roll`, but never starts below `min_tier` (it still falls down when that tier has no stock).
    pub(crate) fn roll_min(&mut self, h: &mut Holder, odds: &[u32; 4], now: u64, min_tier: usize) -> Card {
        self.stock.retain(|s| s.exp > now);
        let r = (self.rand() % 100) as u32;
        let mut t = 0; let mut acc = 0;
        for (i, o) in odds.iter().enumerate() { acc += o; if r < acc { t = i; break; } }
        if t < min_tier { t = min_tier; }
        while t > 0 {
            let cards = tier_cards(t);
            if !cards.is_empty() && self.is_eligible(h, t, now) && Self::held_in_tier(h, t, now) < HAND[t - 1] {
                let limit = self.tier_limit(t, now);
                let out: u32 = cards.iter().map(|c| self.stock_out(*c, now)).sum();
                if out < limit {
                    let open: Vec<Card> = cards.iter().copied().filter(|c| self.stock_out(*c, now) < (limit / cards.len() as u32).max(1)).collect();
                    if !open.is_empty() {
                        let c = open[(self.rand() % open.len() as u64) as usize];
                        let exp = now + FADE;
                        self.stock.push(StockEntry { card: c, exp }); h.cards.push(HandCard { card: c, exp });
                        return c;
                    }
                }
            }
            t -= 1;
        }
        let total: u32 = COMMON_W.iter().sum();
        let mut r = (self.rand() % total as u64) as u32;
        for (i, w) in COMMON_W.iter().enumerate() { if r < *w { if Self::commons_held(h) < HAND_COMMONS { h.commons[i] += 1; } return COMMONS[i]; } r -= w; }
        Card::Rally
    }

    /// Take a card out of a hand to play it. Returns the expiry for Rare+ (to free its stock later).
    pub(crate) fn take_card(&self, h: &mut Holder, card: Card, now: u64) -> u64 {
        if let Some(i) = card.common_index() { require!(h.commons[i] > 0, "you don't have that card"); h.commons[i] -= 1; return 0; }
        let i = h.cards.iter().position(|c| c.card == card && c.exp > now).unwrap_or_else(|| env::panic_str("you don't have that card (or it faded)"));
        h.cards.remove(i).exp
    }
    pub(crate) fn return_card(&self, h: &mut Holder, card: Card, exp: u64) {
        if let Some(i) = card.common_index() { if Self::commons_held(h) < HAND_COMMONS { h.commons[i] += 1; } } else if exp > env::block_timestamp_ms() { h.cards.push(HandCard { card, exp }); }
    }
    /// Your next pack comes sooner for helping (back, sign: 10 min; stoke, fuel: 15 min), at most 1h per pack.
    pub(crate) fn pack_cut(&self, h: &mut Holder, cut: u64) {
        let c = cut.min(MAX_CUT.saturating_sub(h.cut_used)); h.cut_used += c; h.next_pack = h.next_pack.saturating_sub(c);
    }

    pub(crate) fn deck_view(&self, now: u64) -> Vec<DeckView> {
        (1..=3).map(|t| DeckView { tier: t as u8, out: tier_cards(t).iter().map(|c| self.stock_out(*c, now)).sum(), limit: if tier_cards(t).is_empty() { 0 } else { self.tier_limit(t, now) }, eligible: self.eligible_count(t, now) }).collect()
    }
}

