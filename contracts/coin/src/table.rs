//! Playing cards. Solo cards fire at once; Backed and Signed cards go on the Table first.
//! Ember: Backed by 3 / 6 / 10 copies in 10 min, anyone can stoke; Prophecy: Backed by 2-3 holders, then a bet window and 2h;
//! Inferno: Signed, then a 15-min fuel window. Pot cards fire at a random moment in the 2 min after their window.
//! Nothing here loops over holders except a Prophecy's own bettors (at most 100).
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise};

pub const EMBER_WINDOW: u64 = 10 * MIN;
pub const BACK_WINDOW: u64 = 15 * MIN;
pub const BET_WINDOW: u64 = 20 * MIN;
pub const PROPHECY_LEN: u64 = 2 * HOUR;
pub const FUEL_WINDOW: u64 = 15 * MIN;
pub const FIRE_JITTER_MS: u64 = 2 * MIN;
pub const STOKE_MAX: u128 = 5 * GN;
pub const FUEL_MAX: u128 = 20 * GN;
pub const FUEL_CAP_BPS: u128 = 1_000; // fuel total <= 10% of the curve's real NEAR
pub const FUEL_BONUS_BPS: u128 = 500;
pub const FUEL_BONUS_CAP: u128 = SUPPLY / 1_000; // 0.1% of supply per Inferno
pub const INFERNO_SIGNERS: [u32; 4] = [3, 3, 5, 8];
pub const SIGN_EVERY: u64 = 30 * MIN;
pub const BET_MIN_VALUE: u128 = GN / 2;
pub const BET_MAX_VALUE: u128 = 25 * GN;
pub const PROPHECY_MIN_WALLETS: usize = 8;
pub const MAX_BETTORS: usize = 100;
pub const TAG_FEE_BPS: u128 = 1_000;
pub const FAIL_COOLDOWN: u64 = HOUR;
pub const EPICS_PER_DAY: u32 = 3;
pub const RUSH_WINDOW: u64 = 10 * MIN;
pub const RUSH_MAX: u128 = 10 * GN;
pub const RUSH_MATCH_BPS: u128 = 2_000; // Stampede: with 10 or more wallets the pot adds 20% of the crowd's NEAR
pub const SQUEEZE_MATCH_BPS: u128 = 5_000; // Squeeze: 50%
pub const RUSH_MATCH_WALLETS: usize = 10;
pub const RUSH_POT_CAP_BPS: u128 = 3_000; // a match never takes more than 30% of the pot
pub const THROW_WINDOW: u64 = 15 * MIN;
pub const SUPERNOVA_SIGNERS: [u32; 4] = [8, 8, 8, 12];
pub const HARVEST_WINDOW: u64 = HOUR;
pub const HARVEST_CLAIMS: u32 = 25;
pub const HARVEST_EACH: u128 = SUPPLY / 10_000; // 0.01% of supply a share, 0.25% in all
pub const ALLIANCE_LEN: u64 = 6 * HOUR;
pub const WHALE_TAX_LEN: u64 = 2 * HOUR;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Harvest { pub id: u32, pub until: u64, pub claims: u32 }

/// Cards that need signers (qualified holders, one signature per 30 min) before they go any further.
pub fn is_signed(card: Card) -> bool { matches!(card, Card::Inferno | Card::BlackHole | Card::Harvest | Card::WhaleTax | Card::Alliance | Card::Supernova) }
pub const HEAT_MAX: u8 = 3;
pub const RECRUIT_CAP: u128 = SUPPLY / 1_000; // 0.1% of supply of bonus tokens per Recruit
pub const LAST_STAND_BPS: u128 = 1_000; // the pot spends 10% of itself

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum Question {
    /// Will the price be at or above `price` (yocto NEAR per token) when it resolves? Line must be 5-10% from now.
    Line { price: U128 },
    /// Will the coin be a net buyer over the 2h? (Bettors can't trade.)
    Tide,
    /// Will at least `n` new wallets buy in, each at least 1 NEAR worth in total (3-30)? Registering alone doesn't count.
    Crowd { n: u32 },
    /// Will the Vault's share of circulating supply rise by `bps` (100-1000 = 1-10 points)?
    Vault { bps: u32 },
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Bet { pub account: AccountId, pub yes: bool, pub amount: U128 }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Chip { pub account: AccountId, pub near: U128 }

/// phase: 0 backing / signing · 1 bet or fuel window · 2 waiting (fire time or Prophecy result) · 3 done
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Proposal {
    pub id: u32, pub card: Card, pub proposer: AccountId, pub created: u64,
    pub phase: u8, pub phase_end: u64, pub needed: u32, pub backers: Vec<AccountId>, pub card_exp: u64,
    pub chips: Vec<Chip>, pub chip_total: U128,
    pub question: Option<Question>, pub snapshot: U128, pub bets: Vec<Bet>,
    pub result: String,
    /// Alliance: the coin it is made with
    pub target: Option<AccountId>,
}

#[near]
impl Coin {
    /// Play a card from your hand. Solo cards (Roll Call, Hype Siren) fire now and return 0; others go on the Table
    /// and return the proposal id. Prophecy needs a question.
    pub fn play_card(&mut self, card: Card, question: Option<Question>) -> u32 { self.play_inner(card, question, None) }

    /// Alliance: a 6h pact with another Rulecard coin. Signed by holders; when it fires, neither coin can raid the other.
    pub fn play_alliance(&mut self, target: AccountId) -> u32 {
        require!(self.is_sibling(&target) && target != env::current_account_id(), "the ally must be another Rulecard coin");
        self.play_inner(Card::Alliance, None, Some(target))
    }

    fn play_inner(&mut self, card: Card, question: Option<Question>, target: Option<AccountId>) -> u32 {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        require!(!self.graduated, "the game ended at graduation");
        self.touch(now);
        let mut h = self.settle(&a, now);
        require!(now >= h.cooldown_until, "your last card failed: wait 1h");
        require!(self.energy >= card.energy(), "not enough Energy");
        match card {
            Card::Rally | Card::Curse | Card::Ward | Card::Mirror | Card::Counterspell | Card::Decoy => env::panic_str("raid tactics are played in a raid plan"),
            Card::Kindle => {
                require!(h.kindle_at == 0 || now >= h.kindle_at + 6 * HOUR, "Kindle: once per wallet per 6h");
                self.take_card(&mut h, card, now); h.kindle_at = now; self.save(&a, h);
                self.energy -= card.energy();
                self.heat = (self.heat_now(now) + 1).min(HEAT_MAX); self.heat_at = now;
                let what = format!("Heat +1 (now {}): pot cards spend 10% more per Heat, and Heat cools 1 an hour", self.heat);
                self.fired(now, &a, card, what);
                return 0;
            }
            Card::SlowBurn => {
                require!(now >= self.slowburn_until, "Slow Burn is already running");
                let exp = self.take_card(&mut h, card, now); self.save(&a, h); self.free_stock(card, exp);
                self.energy -= card.energy(); self.slowburn_until = now + HOUR;
                self.fired(now, &a, card, "1% of the tokens in every trade burn for 1h".into());
                return 0;
            }
            Card::Recruit => {
                require!(now >= self.recruit_until, "Recruit is already running");
                let exp = self.take_card(&mut h, card, now); self.save(&a, h); self.free_stock(card, exp);
                self.energy -= card.energy(); self.recruit_until = now + HOUR; self.recruit_left = RECRUIT_CAP;
                self.fired(now, &a, card, "1h: a wallet's first buy of 3 NEAR or more gets +5% bonus tokens, locked 6h".into());
                return 0;
            }
            Card::DiamondPool => {
                require!(now >= self.diamond_until, "Diamond Pool is already open");
                let exp = self.take_card(&mut h, card, now); self.save(&a, h); self.free_stock(card, exp);
                self.energy -= card.energy(); self.diamond_until = now + DAY;
                self.fired(now, &a, card, "24h: new locks of 24h or more get x1.25 weight and +1% bonus tokens".into());
                return 0;
            }
            Card::LastStand => {
                require!(now >= self.last_stand_at + DAY, "Last Stand: once per coin per day");
                let high = self.hi.iter().filter(|x| x.0 + 24 > now / HOUR).map(|x| x.1).max().unwrap_or(0);
                let price = self.pool().price();
                require!(high > 0 && price * 100 <= high * 75, "Last Stand needs the price to be 25% or more below its 24h high");
                let exp = self.take_card(&mut h, card, now); self.save(&a, h); self.free_stock(card, exp);
                self.energy -= card.energy(); self.last_stand_at = now;
                let spent = self.pot_burn(now, bps(self.pot, LAST_STAND_BPS), "Last Stand");
                self.tag_until = self.tag_until.max(now + HOUR);
                self.fired(now, &a, card, format!("the pot bought and burned {} yoctoNEAR of the dip", spent));
                return 0;
            }
            Card::Scout | Card::Hedge | Card::Duel | Card::Bounty | Card::FriendlyRaid | Card::HardRaid => env::panic_str("this card has its own action: see the card's text"),
            Card::RollCall => {
                self.take_card(&mut h, card, now); self.save(&a, h);
                self.energy -= card.energy(); self.rollcall_until = now + HOUR; self.rollcall_mult = 2;
                self.fired(now, &a, card, "gm gives ×2 Energy for 1h".into());
                return 0;
            }
            Card::HypeSiren => {
                require!(now >= self.hype_last + HOUR, "Hype Siren: once per coin per hour");
                self.take_card(&mut h, card, now); self.save(&a, h);
                self.energy -= card.energy(); self.hype_until = now + 15 * MIN; self.hype_last = now;
                self.fired(now, &a, card, "pinned on Trending for 15 min".into());
                return 0;
            }
            _ => {}
        }
        // Table limits: 1 Epic and 2 smaller cards at once; the same Common effect only once.
        let active: Vec<&Proposal> = self.table.iter().filter(|p| p.phase < 3).collect();
        if card.tier() >= 2 { require!(!active.iter().any(|p| p.card.tier() >= 2), "an Epic is already on the table"); }
        else { require!(active.iter().filter(|p| p.card.tier() < 2).count() < 2, "the table is full"); }
        require!(!active.iter().any(|p| p.card == card), "that card is already on the table");
        if card == Card::Ember { require!(now >= self.last_ember + HOUR, "Ember: once per coin per hour"); }
        if card.tier() >= 2 { self.roll_epic_day(now); require!(self.epics_today < EPICS_PER_DAY, "3 Epics a day already"); }
        if card == Card::Squeeze {
            let hot = self.table.iter().any(|p| p.card == Card::Prophecy && p.phase == 1 && { let y: u128 = p.bets.iter().filter(|b| b.yes).map(|b| b.amount.0).sum(); let n: u128 = p.bets.iter().filter(|b| !b.yes).map(|b| b.amount.0).sum(); n * 10 > y * 15 && n > 0 });
            require!(hot, "Squeeze needs an open Prophecy where the No side is more than 1.5 times the Yes side");
        }
        let card_exp = self.take_card(&mut h, card, now);
        let (needed, window, backers) = match card {
            Card::Ember => (3, EMBER_WINDOW, vec![a.clone()]),
            Card::Prophecy => {
                let q = question.clone().unwrap_or_else(|| env::panic_str("Prophecy needs a question"));
                self.check_question(&q);
                (if self.level <= 2 { 2 } else { 3 }, BACK_WINDOW, vec![])
            }
            Card::Inferno | Card::BlackHole | Card::Harvest | Card::WhaleTax | Card::Alliance => (INFERNO_SIGNERS[self.level as usize - 1], BACK_WINDOW, vec![]),
            Card::Supernova => { require!(self.level >= 3, "Supernova needs a level 3 coin"); (SUPERNOVA_SIGNERS[self.level as usize - 1], BACK_WINDOW, vec![]) }
            Card::Stampede | Card::Squeeze => (0, RUSH_WINDOW, vec![]),
            _ => env::panic_str("this card can't be played that way"),
        };
        let window = if self.omen_now(now) == 11 { window / 2 } else { window }; // Omen: Low Tide
        let id = self.next_prop; self.next_prop += 1;
        let rush = matches!(card, Card::Stampede | Card::Squeeze);
        if rush { self.energy -= card.energy(); if card == Card::Squeeze { self.epics_today += 1; } }
        if matches!(card, Card::Ember | Card::Inferno) {
            let est = now + window + if card == Card::Inferno { FUEL_WINDOW } else { 0 } + FIRE_JITTER_MS;
            self.tag_until = self.tag_until.max(est + HOUR);
        }
        self.table.push(Proposal {
            id, card, proposer: a.clone(), created: now, phase: if rush { 1 } else { 0 }, phase_end: now + window, needed, backers, card_exp,
            chips: vec![], chip_total: U128(0), question: if card == Card::Prophecy { question } else { None }, snapshot: U128(0), bets: vec![], result: String::new(),
            target: if card == Card::Alliance { target } else { None },
        });
        self.save(&a, h);
        events::rulecard("card_proposed", json!({ "id": id, "card": card, "proposer": a, "needed": needed }));
        id
    }

    /// Back a card on the Table. Ember: add your own Ember copy. Prophecy: a free tap by any holder.
    pub fn back(&mut self, id: u32) {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        self.touch(now);
        let i = self.find(id); let p = &self.table[i];
        require!(p.phase == 0 && now < p.phase_end, "backing is closed");
        require!(matches!(p.card, Card::Ember | Card::Prophecy), "this card needs signers, not backers");
        require!(p.proposer != a && !p.backers.contains(&a), "already backing");
        let card = p.card;
        let mut h = self.settle(&a, now);
        require!(h.bal + self.locked_of(&h) > 0, "hold the coin to back");
        if card == Card::Ember { self.take_card(&mut h, Card::Ember, now); }
        self.pack_cut(&mut h, CUT_BACK);
        self.save(&a, h);
        self.table[i].backers.push(a.clone());
        events::rulecard("card_backed", json!({ "id": id, "account_id": a, "backers": self.table[i].backers.len() }));
    }

    /// Sign an Inferno. Qualified holders (>= 2 NEAR for 1h), one signature per 30 min.
    pub fn sign(&mut self, id: u32) {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        self.touch(now);
        let i = self.find(id); let p = &self.table[i];
        require!(p.phase == 0 && now < p.phase_end, "signing is closed");
        require!(is_signed(p.card), "this card needs backers, not signers");
        require!(!p.backers.contains(&a), "already signed");
        let mut h = self.settle(&a, now);
        require!(self.pool().value(h.bal + self.locked_of(&h)) >= QUALIFIED_VALUE && h.since > 0 && now >= h.since + QUALIFIED_HOLD, "signers must hold >= 2 NEAR for 1h");
        require!(h.last_sign == 0 || now >= h.last_sign + SIGN_EVERY, "one signature per 30 min");
        h.last_sign = now;
        self.pack_cut(&mut h, CUT_BACK);
        self.save(&a, h);
        self.table[i].backers.push(a.clone());
        events::rulecard("card_signed", json!({ "id": id, "account_id": a, "signers": self.table[i].backers.len() }));
    }

    /// Stoke an Ember with up to 5 NEAR while it's being backed (bought for you and locked 6h; the pot adds half).
    #[payable]
    pub fn stoke(&mut self, id: u32) { self.chip_in(id, Card::Ember, 0, STOKE_MAX) }

    /// Fuel an Inferno with up to 20 NEAR in its fuel window (bought for you, locked 24h at ×2 weight, +5% bonus).
    #[payable]
    pub fn fuel(&mut self, id: u32) { self.chip_in(id, Card::Inferno, 1, FUEL_MAX) }

    /// Bet tokens on a Prophecy (Bold: if you lose, you lose half). You can't trade this coin until it resolves.
    #[payable]
    pub fn bet(&mut self, id: u32, yes: bool, amount: U128) {
        near_sdk::assert_one_yocto();
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        self.touch(now);
        let i = self.find(id); let p = &self.table[i];
        require!(p.card == Card::Prophecy && p.phase == 1 && now < p.phase_end, "betting is closed");
        let resolve_at = p.phase_end + PROPHECY_LEN;
        let mine: u128 = p.bets.iter().filter(|b| b.account == a).map(|b| b.amount.0).sum();
        require!(p.bets.iter().all(|b| b.account != a || b.yes == yes), "you already bet the other side");
        require!(mine > 0 || p.bets.iter().map(|b| &b.account).collect::<std::collections::HashSet<_>>().len() < MAX_BETTORS, "too many bettors");
        let mut h = self.settle(&a, now);
        require!(h.bal >= amount.0, "not enough unlocked balance");
        let pool = self.pool();
        require!(pool.value(amount.0) >= BET_MIN_VALUE || mine > 0, "minimum bet 0.5 NEAR worth");
        require!(pool.value(mine + amount.0) <= BET_MAX_VALUE, "max 25 NEAR worth per wallet");
        h.bal -= amount.0; h.no_trade_until = h.no_trade_until.max(resolve_at);
        self.save(&a, h);
        self.bets_held += amount.0;
        self.table[i].bets.push(Bet { account: a.clone(), yes, amount });
        let me = env::current_account_id();
        events::ft_transfer(&a, &me, amount.0, Some("prophecy bet"));
    }

    /// Stampede / Squeeze: put NEAR into the crowd batch (up to 10 NEAR, min 0.1). It all buys together at one average price.
    #[payable]
    pub fn rush(&mut self, id: u32) { self.chip_in(id, Card::Stampede, 1, RUSH_MAX) }

    /// Black Hole: throw tokens in during the window. When it fires everything thrown is burned, and the reward pool
    /// gives back 40% (+5% per Heat) of it, shared by the throwers; the 3 biggest throwers get a pack that is ready to open.
    #[payable]
    pub fn throw_in(&mut self, id: u32, amount: U128) {
        near_sdk::assert_one_yocto();
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        self.touch(now);
        let i = self.find(id); let p = &self.table[i];
        require!(p.card == Card::BlackHole && p.phase == 1 && now < p.phase_end, "the throwing window is closed");
        require!(p.bets.len() < 150, "the hole is full");
        let mut h = self.settle(&a, now);
        require!(h.bal >= amount.0, "not enough unlocked balance");
        require!(self.pool().value(amount.0) >= GN / 10, "minimum throw 0.1 NEAR worth");
        h.bal -= amount.0; self.save(&a, h);
        self.bets_held += amount.0;
        self.table[i].bets.push(Bet { account: a.clone(), yes: true, amount });
        events::ft_transfer(&a, &env::current_account_id(), amount.0, Some("black hole"));
    }

    /// Harvest: while it is open, a wallet that did a gm in the last 24h takes one share (0.01% of supply) from the reward pool. 25 shares in all.
    pub fn harvest_claim(&mut self) -> U128 {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        require!(self.is_registered(&a), "buy first");
        self.touch(now);
        let hv = self.harvest.clone().unwrap_or_else(|| env::panic_str("no Harvest is open"));
        require!(now < hv.until, "the Harvest is over");
        require!(hv.claims < HARVEST_CLAIMS, "all 25 shares are taken");
        let mut h = self.settle(&a, now);
        require!(h.harvest_id != hv.id + 1, "you already took your share");
        require!(h.last_gm > 0 && now < h.last_gm + DAY, "you need a gm in the last 24h");
        let pay = HARVEST_EACH.min(self.reward_pool);
        require!(pay > 0, "the reward pool is empty");
        self.reward_pool -= pay; self.with_pool(|q| q.release(pay));
        h.bal += pay; if h.since == 0 { h.since = now; } h.harvest_id = hv.id + 1;
        self.save(&a, h);
        self.harvest.as_mut().unwrap().claims += 1;
        events::ft_transfer(&env::current_account_id(), &a, pay, Some("harvest"));
        U128(pay)
    }

    /// Called by an allied coin when its Alliance fires. Takes the pact if this coin has none running.
    pub fn ally_accept(&mut self, until: u64) -> bool {
        let from = env::predecessor_account_id();
        require!(self.is_sibling(&from), "only Rulecard coins");
        let now = env::block_timestamp_ms();
        if matches!(&self.ally, Some((_, u)) if now < *u) { return false; }
        self.ally = Some((from, until.min(now + ALLIANCE_LEN)));
        true
    }

    /// Move a card forward if its time has come. Anyone can call it.
    pub fn resolve(&mut self, id: u32) { let now = env::block_timestamp_ms(); self.touch(now); if let Some(i) = self.table.iter().position(|p| p.id == id) { self.step(i, now); self.archive(); } }

    pub fn get_table(&self) -> Vec<Proposal> { self.table.clone() }
    pub fn get_history(&self) -> Vec<Proposal> { self.history.clone() }
}

impl Coin {
    /// Heat cools by 1 every hour.
    pub(crate) fn heat_now(&self, now: u64) -> u8 { self.heat.saturating_sub((now.saturating_sub(self.heat_at) / HOUR).min(10) as u8) }
    fn find(&self, id: u32) -> usize { self.table.iter().position(|p| p.id == id).unwrap_or_else(|| env::panic_str("no such card on the table")) }
    fn roll_epic_day(&mut self, now: u64) { if self.epics_day != now / DAY { self.epics_day = now / DAY; self.epics_today = 0; } }

    fn check_question(&self, q: &Question) {
        match q {
            Question::Line { price } => {
                let p = self.pool().price(); let d = p.abs_diff(price.0) * 10_000 / p.max(1);
                require!((500..=1_000).contains(&d), "the line must be 5-10% from the current price");
            }
            Question::Crowd { n } => require!((3..=30).contains(n), "Crowd: 3-30 new wallets"),
            Question::Vault { bps } => require!((100..=1_000).contains(bps), "Vault: 1-10 points"),
            Question::Tide => {}
        }
    }

    fn vault_share_bps(&self) -> u128 { if self.circ == 0 { 0 } else { self.vault_locked * 10_000 / self.circ } }

    pub(crate) fn snapshot(&self, q: &Question) -> u128 {
        match q {
            Question::Line { .. } => 0,
            Question::Tide => (self.total_bought as i128 - self.total_sold as i128 + i128::MAX / 2) as u128,
            Question::Crowd { .. } => self.buyers as u128,
            Question::Vault { .. } => self.vault_share_bps(),
        }
    }

    fn answer(&self, q: &Question, snap: u128) -> bool {
        match q {
            Question::Line { price } => self.pool().price() >= price.0,
            Question::Tide => (self.total_bought as i128 - self.total_sold as i128 + i128::MAX / 2) as u128 > snap,
            Question::Crowd { n } => self.buyers as u128 >= snap + *n as u128,
            Question::Vault { bps } => self.vault_share_bps() >= snap + *bps as u128,
        }
    }

    fn chip_in(&mut self, id: u32, card: Card, phase: u8, max: u128) {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        let mut dep = env::attached_deposit().as_yoctonear();
        if !self.is_registered(&a) { require!(dep > STORAGE_COST, "deposit too small"); dep -= STORAGE_COST; self.register(&a, now); }
        self.touch(now);
        let i = self.find(id); let p = &self.table[i];
        require!((p.card == card || (card == Card::Stampede && p.card == Card::Squeeze)) && p.phase == phase && now < p.phase_end, "this window is closed");
        let mine: u128 = p.chips.iter().filter(|c| c.account == a).map(|c| c.near.0).sum();
        let mut take = dep.min(max.saturating_sub(mine));
        if matches!(card, Card::Inferno | Card::Stampede) { take = take.min(bps(self.real, FUEL_CAP_BPS).saturating_sub(p.chip_total.0)); }
        require!(take >= GN / 10, "nothing left to add (min 0.1 NEAR, per-wallet and total caps)");
        let mut h = self.settle(&a, now);
        require!(now >= h.no_trade_until, "you have a live Prophecy bet");
        self.pack_cut(&mut h, CUT_CHIP);
        self.save(&a, h);
        let p = &mut self.table[i];
        p.chips.push(Chip { account: a.clone(), near: U128(take) }); p.chip_total = U128(p.chip_total.0 + take);
        events::rulecard(if card == Card::Ember { "stoke" } else if card == Card::Inferno { "fuel" } else { "rush" }, json!({ "id": id, "account_id": a, "near": U128(take), "total": p.chip_total }));
        if dep > take { let _ = Promise::new(a).transfer(NearToken::from_yoctonear(dep - take)); }
    }

    /// Step every proposal whose time has come (at most a few are ever open).
    pub(crate) fn step_all(&mut self, now: u64) {
        for i in 0..self.table.len() { if self.table[i].phase < 3 && now >= self.table[i].phase_end { self.step(i, now); } }
        self.archive();
    }

    fn archive(&mut self) {
        let (done, open): (Vec<Proposal>, Vec<Proposal>) = std::mem::take(&mut self.table).into_iter().partition(|p| p.phase == 3);
        self.table = open;
        for p in done { self.history.push(p); }
        while self.history.len() > 10 { self.history.remove(0); }
    }

    fn step(&mut self, i: usize, now: u64) {
        loop {
            let p = self.table[i].clone();
            if p.phase >= 3 || now < p.phase_end { return; }
            match (p.phase, p.card) {
                (0, _) => {
                    let ok = p.backers.len() as u32 >= p.needed && self.energy >= p.card.energy() && !(p.card.tier() >= 2 && { self.roll_epic_day(now); self.epics_today >= EPICS_PER_DAY });
                    if !ok { self.fail(i, now, if (p.backers.len() as u32) < p.needed { "not enough backers" } else { "not enough Energy" }); return; }
                    self.energy -= p.card.energy();
                    match p.card {
                        Card::Ember => { let j = self.nonce_jitter(); let t = &mut self.table[i]; t.phase = 2; t.phase_end = p.phase_end + j; }
                        Card::Prophecy => {
                            let q = p.question.clone().unwrap();
                            let snap = self.snapshot(&q);
                            let t = &mut self.table[i]; t.phase = 1; t.phase_end = p.phase_end + BET_WINDOW; t.snapshot = U128(snap);
                        }
                        Card::Inferno => { self.epics_today += 1; let t = &mut self.table[i]; t.phase = 1; t.phase_end = p.phase_end + FUEL_WINDOW; }
                        Card::BlackHole => { self.epics_today += 1; let t = &mut self.table[i]; t.phase = 1; t.phase_end = p.phase_end + THROW_WINDOW; }
                        Card::Harvest | Card::WhaleTax | Card::Alliance | Card::Supernova => { self.epics_today += 1; let j = self.nonce_jitter(); let t = &mut self.table[i]; t.phase = 2; t.phase_end = p.phase_end + j; }
                        _ => {}
                    }
                }
                (1, Card::Prophecy) => { let t = &mut self.table[i]; t.phase = 2; t.phase_end = p.phase_end + PROPHECY_LEN; }
                (1, Card::Inferno) | (1, Card::BlackHole) | (1, Card::Stampede) | (1, Card::Squeeze) => { let j = self.nonce_jitter(); let t = &mut self.table[i]; t.phase = 2; t.phase_end = p.phase_end + j; }
                (2, Card::BlackHole) => { self.fire_black_hole(i, now); return; }
                (2, Card::Stampede) | (2, Card::Squeeze) => { self.fire_rush(i, now); return; }
                (2, Card::Harvest) | (2, Card::WhaleTax) | (2, Card::Alliance) | (2, Card::Supernova) => { self.fire_instant(i, now); return; }
                (2, Card::Ember) | (2, Card::Inferno) => { self.fire_pot_card(i, now); return; }
                (2, Card::Prophecy) => { self.settle_prophecy(i, now); return; }
                _ => return,
            }
        }
    }

    fn nonce_jitter(&mut self) -> u64 { self.rand() % FIRE_JITTER_MS }

    fn fail(&mut self, i: usize, now: u64, why: &str) {
        let p = self.table[i].clone();
        let mut h = self.holder(&p.proposer); self.return_card(&mut h, p.card, p.card_exp); h.cooldown_until = now + FAIL_COOLDOWN; self.save(&p.proposer, h);
        if p.card == Card::Ember { for b in p.backers.iter().skip(1) { let mut h = self.holder(b); self.return_card(&mut h, Card::Ember, 0); self.save(b, h); } }
        for c in &p.chips { let _ = Promise::new(c.account.clone()).transfer(NearToken::from_yoctonear(c.near.0)); }
        let t = &mut self.table[i]; t.phase = 3; t.result = format!("failed: {why}");
        events::rulecard("card_failed", json!({ "id": p.id, "card": p.card, "why": why }));
    }

    pub(crate) fn fired(&mut self, now: u64, who: &AccountId, card: Card, what: String) {
        events::rulecard("card_fired", json!({ "card": card, "account_id": who, "result": what }));
        self.push_log(now, "card", Some(who.clone()), 0, 0, &format!("{card:?}: {what}"));
    }

    /// Ember and Inferno: the crowd's NEAR buys first (one batch, one price, locked in the Vault), then the pot burns.
    fn fire_pot_card(&mut self, i: usize, now: u64) {
        let p = self.table[i].clone();
        let (lock_ms, mult) = if p.card == Card::Inferno { (DAY, 20u8) } else { (6 * HOUR, 10u8) };
        // crowd buy
        let total = p.chip_total.0;
        let mut bought = 0u128;
        if total > 0 && self.graduated {
            for c in &p.chips { let _ = Promise::new(c.account.clone()).transfer(NearToken::from_yoctonear(c.near.0)); }
        }
        if total > 0 && !self.graduated {
            let fee = bps(total, FEE_BPS); let net = total - fee;
            let (t, used) = self.with_pool(|q| q.buy(net));
            let fee_used = mul_div(fee, used, net.max(1)); self.split_fee(fee_used);
            let unused = total - used - fee_used;
            self.buys.add(now, used); self.total_bought += used; self.on_trade_energy(used as i128);
            bought = t;
            let mut bonus_total = 0u128;
            if p.card == Card::Inferno { bonus_total = bps(t, FUEL_BONUS_BPS).min(FUEL_BONUS_CAP).min(self.reward_pool); if bonus_total > 0 { self.reward_pool -= bonus_total; self.with_pool(|q| q.release(bonus_total)); } }
            for c in &p.chips {
                let mine = mul_div(t, c.near.0, total);
                let bonus = mul_div(bonus_total, c.near.0, total);
                let refund = mul_div(unused, c.near.0, total);
                let mut h = self.settle(&c.account, now);
                if h.bal == 0 && h.w == 0 && h.since == 0 { h.since = now; }
                h.locks.push(Lock { amount: U128(mine + bonus), mult, until: now + lock_ms });
                self.vault_locked += mine + bonus;
                self.reweigh(&mut h);
                self.save(&c.account, h);
                if refund > 0 { let _ = Promise::new(c.account.clone()).transfer(NearToken::from_yoctonear(refund)); }
            }
            if self.pool().room() == 0 { self.graduate(now); }
        }
        // pot burn
        let pot = self.pot;
        let spend = match p.card {
            Card::Ember => {
                let n = p.backers.len(); let pct = if n >= 10 { 300 } else if n >= 6 { 200 } else { 100 };
                let base = bps(pot, pct); base + (total / 2).min(base)
            }
            _ => { let max = if self.level >= 4 { 7_500 } else { 5_000 }; (bps(pot, 1_000) + total / 2).min(bps(pot, max)) }
        };
        let spend = spend + spend * self.heat_now(now) as u128 / 10; // Kindle's Heat: +10% per Heat
        let spend = if self.omen_now(now) == 8 { spend + spend / 4 } else { spend }; // Omen: Windfall
        let spent = self.pot_burn(now, spend, &format!("{:?}", p.card));
        if p.card == Card::Ember { self.last_ember = now; }
        self.free_stock(p.card, p.card_exp);
        self.tag_until = self.tag_until.max(now + HOUR);
        let what = format!("pot burned {} yoctoNEAR; crowd bought {} tokens", spent, bought);
        let t = &mut self.table[i]; t.phase = 3; t.result = what.clone();
        let proposer = p.proposer.clone();
        self.fired(now, &proposer, p.card, what);
    }

    /// Epics that act at once when their signers are in: Harvest, Whale Tax, Alliance, Supernova.
    fn fire_instant(&mut self, i: usize, now: u64) {
        let p = self.table[i].clone();
        let what: String = match p.card {
            Card::WhaleTax => { self.whale_until = now + WHALE_TAX_LEN; "2h: wallets over 2% of supply pay +1% on sells, to the pot".into() }
            Card::Harvest => { self.harvest = Some(Harvest { id: p.id, until: now + HARVEST_WINDOW, claims: 0 }); "1h: wallets that checked in today can take a share (25 shares) from the reward pool".into() }
            Card::Supernova => {
                let spent = self.pot_burn(now, self.pot, "Supernova");
                self.heat = HEAT_MAX; self.heat_at = now;
                format!("the pot spent {} yoctoNEAR, as much as the daily cap allows; Heat is 3", spent)
            }
            Card::Alliance => {
                let t = p.target.clone().unwrap_or_else(|| env::panic_str("no ally"));
                self.ally = Some((t.clone(), now + ALLIANCE_LEN));
                let _ = Promise::new(t.clone()).function_call("ally_accept".to_string(), json!({ "until": now + ALLIANCE_LEN }).to_string().into_bytes(), NearToken::from_yoctonear(0), Gas::from_tgas(10));
                format!("6h pact with {t}: no raids between the two coins")
            }
            _ => return,
        };
        self.free_stock(p.card, p.card_exp);
        let t = &mut self.table[i]; t.phase = 3; t.result = what.clone();
        let who = p.proposer.clone();
        self.fired(now, &who, p.card, what);
    }

    /// Black Hole: everything thrown in burns, the reward pool gives some back to the throwers, the top 3 get a pack ready.
    fn fire_black_hole(&mut self, i: usize, now: u64) {
        let p = self.table[i].clone();
        let total: u128 = p.bets.iter().map(|b| b.amount.0).sum();
        let me = env::current_account_id();
        self.bets_held -= total;
        if total > 0 { self.burn_circ(now, &me, total, "Black Hole"); }
        let ret = bps(total, 4_000 + 500 * self.heat_now(now) as u128).min(self.reward_pool);
        if ret > 0 { self.reward_pool -= ret; self.with_pool(|q| q.release(ret)); }
        let mut by: Vec<(AccountId, u128)> = vec![];
        for b in &p.bets { match by.iter_mut().find(|x| x.0 == b.account) { Some(x) => x.1 += b.amount.0, None => by.push((b.account.clone(), b.amount.0)) } }
        for (acct, thrown) in &by {
            let share = if total > 0 { mul_div(ret, *thrown, total) } else { 0 };
            if share > 0 { let mut h = self.settle(acct, now); h.bal += share; if h.since == 0 { h.since = now; } self.save(acct, h); events::ft_transfer(&me, acct, share, Some("black hole return")); }
        }
        by.sort_by(|a, b| b.1.cmp(&a.1));
        for (acct, _) in by.iter().take(3) { let mut h = self.settle(acct, now); h.next_pack = 0; self.save(acct, h); }
        self.free_stock(p.card, p.card_exp);
        let what = format!("{} tokens burned, {} returned from the reward pool", total, ret);
        let t = &mut self.table[i]; t.phase = 3; t.result = what.clone();
        let who = p.proposer.clone();
        self.fired(now, &who, p.card, what);
    }

    /// Stampede / Squeeze: the crowd's NEAR buys as one batch at one average price. With 10 or more wallets the pot adds 20% (Squeeze 50%).
    fn fire_rush(&mut self, i: usize, now: u64) {
        let p = self.table[i].clone();
        let total = p.chip_total.0;
        let wallets = p.chips.iter().map(|c| &c.account).collect::<std::collections::HashSet<_>>().len();
        let mut bought = 0u128; let mut matched = 0u128;
        if total > 0 && self.graduated {
            for c in &p.chips { let _ = Promise::new(c.account.clone()).transfer(NearToken::from_yoctonear(c.near.0)); }
        } else if total > 0 {
            let d = now / DAY; if d != self.pot_day { self.pot_day = d; self.pot_spent_today = 0; }
            let rate = if p.card == Card::Squeeze { SQUEEZE_MATCH_BPS } else { RUSH_MATCH_BPS };
            let room = bps(self.pot + self.pot_spent_today, POT_DAILY_BPS).saturating_sub(self.pot_spent_today);
            let m = if wallets >= RUSH_MATCH_WALLETS { bps(total, rate).min(bps(self.pot, RUSH_POT_CAP_BPS)).min(room) } else { 0 };
            let fee = bps(total, FEE_BPS); let net = total - fee;
            let (t, used) = self.with_pool(|q| q.buy(net + m));
            let pot_used = mul_div(used, m, (net + m).max(1));
            let crowd_used = used - pot_used;
            let fee_used = mul_div(fee, crowd_used, net.max(1)); self.split_fee(fee_used);
            self.pot -= pot_used; self.pot_spent_today += pot_used; matched = pot_used;
            let unused = total - crowd_used - fee_used;
            self.buys.add(now, crowd_used); self.total_bought += crowd_used; self.on_trade_energy(crowd_used as i128);
            bought = t;
            let me = env::current_account_id();
            for c in &p.chips {
                let mine = mul_div(t, c.near.0, total);
                let refund = mul_div(unused, c.near.0, total);
                let mut h = self.settle(&c.account, now);
                if h.bal == 0 && h.w == 0 && h.since == 0 { h.since = now; }
                h.bal += mine;
                self.save(&c.account, h);
                events::ft_transfer(&me, &c.account, mine, Some("stampede"));
                if refund > 0 { let _ = Promise::new(c.account.clone()).transfer(NearToken::from_yoctonear(refund)); }
            }
            if self.pool().room() == 0 { self.graduate(now); }
        }
        let what = format!("{} wallets bought {} tokens in one batch{}", wallets, bought, if matched > 0 { format!(", the pot matched {} yoctoNEAR", matched) } else { String::new() });
        let t = &mut self.table[i]; t.phase = 3; t.result = what.clone();
        let who = p.proposer.clone();
        self.fired(now, &who, p.card, what);
    }

    fn settle_prophecy(&mut self, i: usize, now: u64) {
        let p = self.table[i].clone();
        let q = p.question.clone().unwrap();
        let wallets: std::collections::HashSet<&AccountId> = p.bets.iter().map(|b| &b.account).collect();
        let yes_total: u128 = p.bets.iter().filter(|b| b.yes).map(|b| b.amount.0).sum();
        let no_total: u128 = p.bets.iter().filter(|b| !b.yes).map(|b| b.amount.0).sum();
        let me = env::current_account_id();
        self.free_stock(p.card, p.card_exp);
        if wallets.len() < PROPHECY_MIN_WALLETS || yes_total == 0 || no_total == 0 {
            for b in &p.bets { let mut h = self.settle(&b.account, now); h.bal += b.amount.0; self.save(&b.account, h); events::ft_transfer(&me, &b.account, b.amount.0, Some("prophecy refund")); }
            self.bets_held -= yes_total + no_total;
            let t = &mut self.table[i]; t.phase = 3; t.result = "refunded: fewer than 8 wallets or one side empty".into();
            return;
        }
        let yes = self.answer(&q, p.snapshot.0);
        let (win_total, lose_total) = if yes { (yes_total, no_total) } else { (no_total, yes_total) };
        let to_winners = lose_total * 3 / 10; let to_caster = lose_total / 10; let to_burn = lose_total / 2 - to_winners - to_caster;
        let mut paid = 0u128;
        for b in &p.bets {
            let back = if b.yes == yes { b.amount.0 + mul_div(to_winners, b.amount.0, win_total) } else { b.amount.0 - b.amount.0 / 2 };
            paid += back;
            let mut h = self.settle(&b.account, now); h.bal += back; self.save(&b.account, h);
            events::ft_transfer(&me, &b.account, back, Some("prophecy payout"));
        }
        let oracle = p.proposer == me; // an Oracle Prophecy is opened by the coin itself: no caster to pay, that share burns too
        if !oracle {
            let mut c = self.settle(&p.proposer, now); c.bal += to_caster; self.save(&p.proposer, c);
            events::ft_transfer(&me, &p.proposer, to_caster, Some("prophecy caster share"));
        }
        let held = yes_total + no_total;
        self.bets_held -= held;
        let burn = held - paid - if oracle { 0 } else { to_caster }; // to_burn plus rounding dust
        let _ = to_burn;
        self.burn_circ(now, &me, burn, "Prophecy losers");
        let what = format!("answer: {}", if yes { "Yes" } else { "No" });
        let t = &mut self.table[i]; t.phase = 3; t.result = what.clone();
        self.fired(now, &p.proposer, Card::Prophecy, what);
    }
}
