//! Rulecard coin contract: one memecoin, one contract.
//! - A real NEP-141 token. The full supply is minted once at launch (one `ft_mint` event).
//! - Bonding curve with a 2% fee (0.3% protocol, 0.2% creator escrow, 1.5% pot).
//! - gm check-ins, Energy, the Vault, idle burn with one 8% daily loss cap, the Daily Ritual, levels.
//! - Every parameter is fixed at launch and readable with `get_params`. There are no owner methods and no upgrade path.
//! - Nothing loops over holders: per-wallet effects (idle burn, Vault earnings) are applied when that wallet is next used.
use near_sdk::json_types::U128;
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

pub mod math;
mod events;
mod game;
mod token;
mod trade;
mod cards;
mod table;
mod raid;
mod omens;
pub use raid::*;
pub use omens::*;
pub use cards::*;
pub use table::*;
#[cfg(test)]
mod tests;

use math::*;

// ------------------------------------------------------------------ constants (all public in get_params)
/// Demo builds run the clock 12× faster: gm every 30 min, a Ritual "day" is 2h, raid rounds 100 s.
#[cfg(feature = "demo")]
pub const TIME_SCALE: u64 = 12;
#[cfg(not(feature = "demo"))]
pub const TIME_SCALE: u64 = 1;
pub const MIN: u64 = 60_000 / TIME_SCALE;
pub const HOUR: u64 = 60 * MIN;
pub const DAY: u64 = 24 * HOUR;

pub const FEE_PROTOCOL_BPS: u128 = 30;
pub const FEE_ESCROW_BPS: u128 = 20;
pub const FEE_POT_BPS: u128 = 150;
pub const FEE_BPS: u128 = FEE_PROTOCOL_BPS + FEE_ESCROW_BPS + FEE_POT_BPS;
pub const SEED_MIN: u128 = 5 * GN;
pub const SEED_MAX: u128 = 100 * GN;
pub const STORAGE_COST: u128 = ONE_NEAR / 80; // 0.0125 NEAR per registered wallet = 1.25 KB, the most a holder record can use (with 10 locks)

pub const GM_EVERY: u64 = 6 * HOUR;
pub const GM_MIN_VALUE: u128 = GN; // hold >= 1 NEAR worth to gm
pub const QUALIFIED_VALUE: u128 = 2 * GN; // >= 2 NEAR held for 1h counts for levels
pub const QUALIFIED_HOLD: u64 = HOUR;

pub const IDLE_GRACE: u64 = 12 * HOUR;
pub const IDLE_TICK: u64 = 6 * HOUR;
pub const IDLE_BPS: u128 = 100; // 1% per tick; Ruthless rule: 2%
pub const DAILY_LOSS_CAP_BPS: u128 = 800; // one 8% cap on everything the coin takes from a wallet in a UTC day

pub const VAULT_EARLY_BPS: u128 = 2_000; // leaving early costs 20%: half to stayers, half burned
pub const VAULT_WEIGHT_CAP: u128 = 5_000_000 * TOKEN; // a wallet counts for at most 0.5% of supply
pub const VAULT_SCALE: u128 = 1_000_000_000_000_000_000; // accumulator precision

pub const ENERGY_MAX: u32 = 100;
pub const ENERGY_NEAR: u128 = 10 * GN; // +1 Energy per 10 NEAR of net buying
pub const ENERGY_TRADE_CAP: u128 = 20 * GN; // one trade counts for at most 20 NEAR

pub const POT_DAILY_BPS: u128 = 7_500; // the pot spends at most 75% of itself per day

pub const RITUAL_GM_MIN: u32 = 10;
pub const RITUAL_GM_PCT: u32 = 60;
pub const RITUAL_LOCK_MIN: u128 = 10 * GN;
pub const RITUAL_LOCK_PCT: u128 = 50;
pub const RITUAL_BURN_BPS: u128 = 500;
pub const RITUAL_STREAK_BURN_BPS: u128 = 700;
pub const RITUAL_DOUBLE: u64 = 6 * HOUR;

/// Level targets for L2, L3, L4.
pub const LVL_MCAP: [u128; 3] = [2_725 * GN, 5_450 * GN, 9_537 * GN];
pub const LVL_REAL: [u128; 3] = [625 * GN, 1_461 * GN, 2_382 * GN];
pub const LVL_VOLUME: [u128; 3] = [900 * GN, 3_600 * GN, 9_500 * GN];
pub const LVL_CHECKINS: [u32; 3] = [15, 40, 100];
pub const LVL_AGE: [u64; 3] = [30 * MIN, 3 * HOUR, 12 * HOUR];
pub const LVL_HOLD: [u64; 3] = [15 * MIN, 30 * MIN, 60 * MIN];

pub const LOG_KEEP: u64 = 200;
/// Price points kept for the chart (one per trade or burn, at most one per minute).
pub const PRICE_KEEP: u64 = 400;

// ------------------------------------------------------------------ creator rules
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Rule { FairLaunch, LaunchGuard, PaperTax, SoftTax, WhaleCap, HoldTheLine, CreatorLock, Ruthless, WildCoin, WarCoin, PeaceCoin }

// ------------------------------------------------------------------ stored types
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Params {
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub creator: AccountId,
    pub protocol: AccountId,
    pub rules: Vec<Rule>,
    pub seed: U128,
    pub created_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Lock { pub amount: U128, pub mult: u8, pub until: u64 }

#[near(serializers = [borsh])]
#[derive(Clone, Default)]
pub struct Holder {
    pub bal: u128,
    pub since: u64,
    pub last_gm: u64,
    pub idle_from: u64,
    pub idle_applied: u64,
    pub loss_day: u64,
    pub loss_base: u128,
    pub loss_used: u128,
    pub locks: Vec<Lock>,
    pub w: u128,
    pub debt: u128,
    pub earned: u128,
    pub recent_buy: u128,
    pub recent_buy_at: u64,
    pub launch_spent: u128,
    pub counted_checkin_at: u64,
    pub ritual_day: u64,
    // cards
    pub commons: [u8; 6],
    pub cards: Vec<HandCard>,
    pub next_pack: u64,
    pub cut_used: u64,
    pub starter: bool,
    pub drops: u8,
    pub elig_at: [u64; 3],
    pub last_sign: u64,
    pub cooldown_until: u64,
    // anti front-running and bets
    pub tagged: u128,
    pub tag_until: u64,
    pub no_trade_until: u64,
    // raids
    pub raid_seq: u32,
    pub slots: [u8; 3],
    pub slots_filled: u8,
    pub slots_done: bool,
    pub r_round: u8,
    pub r_net: i128,
    pub cry: u8,
    pub r_lock_round: u8,
    pub r_lock: u128,
    pub raid_pack: u32,
    // Ritual lock counting (day + 1, tokens counted that day)
    pub rl_day: u64,
    pub rl_counted: u128,
    pub bought_near: u128,
}

/// 24 hourly buckets (rolling day).
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Ring { pub hour: u64, pub b: Vec<U128> }
impl Ring {
    fn roll(&mut self, h: u64) {
        if self.b.len() != 24 { self.b = vec![U128(0); 24]; self.hour = h; }
        if h <= self.hour { return; }
        let n = (h - self.hour).min(24);
        for i in 1..=n { let idx = ((self.hour + i) % 24) as usize; self.b[idx] = U128(0); }
        self.hour = h;
    }
    pub fn add(&mut self, now: u64, v: u128) { let h = now / HOUR; self.roll(h); let i = (h % 24) as usize; self.b[i] = U128(self.b[i].0 + v); }
    /// Sum of the last `hours` hourly buckets including the current one.
    pub fn sum(&self, now: u64, hours: u64) -> u128 {
        if self.b.len() != 24 { return 0; }
        let h = now / HOUR; let mut s = 0;
        for i in 0..hours.min(24) {
            if h < i { break; }
            let hh = h - i; if hh > self.hour || self.hour - hh >= 24 { continue; }
            s += self.b[(hh % 24) as usize].0;
        }
        s
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Ritual {
    pub day: u64,
    pub gm_target: u32,
    pub lock_target: U128,
    pub gm_count: u32,
    pub lock_near: U128,
    pub streak: u32,
    /// the longest run of made Rituals so far (the coin's high score) and the day it was reached
    pub best_streak: u32,
    pub best_streak_day: u64,
    pub last_made: Option<bool>,
    pub made_days: Vec<u64>,
    pub double_from: Vec<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct LogEntry { pub seq: u64, pub at: u64, pub kind: String, pub account: Option<AccountId>, pub amount: U128, pub near: U128, pub memo: String }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct PricePoint { pub at: u64, pub price: U128, pub mcap: U128 }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Coin {
    pub(crate) p: Params,
    pub(crate) x: u128, pub(crate) y: u128, pub(crate) k: [u64; 4], pub(crate) real: u128, pub(crate) circ: u128,
    pub(crate) burned: u128,
    pub(crate) pot: u128,
    pub(crate) pot_day: u64, pub(crate) pot_spent_today: u128,
    pub(crate) protocol_owed: u128,
    pub(crate) escrow: u128,
    pub(crate) reward_pool: u128,
    pub(crate) holders: LookupMap<AccountId, Holder>,
    pub(crate) holder_count: u32,
    /// wallets whose buys added up to at least 1 game NEAR (used by the Crowd question; registering alone doesn't count)
    pub(crate) buyers: u32,
    pub(crate) vault_locked: u128,
    pub(crate) vault_w: u128,
    pub(crate) vault_acc: u128,
    pub(crate) vault_rewards: u128,
    pub(crate) energy: u32,
    pub(crate) energy_acc: i128,
    pub(crate) buys: Ring, pub(crate) sells: Ring, pub(crate) checkins: Ring,
    pub(crate) level: u8,
    pub(crate) level_ok_since: Option<u64>,
    pub(crate) level_at: Vec<u64>,
    pub(crate) ritual: Ritual,
    pub(crate) graduated: bool,
    pub(crate) log: Vector<LogEntry>,
    pub(crate) log_seq: u64,
    // cards
    pub(crate) nonce: u64,
    pub(crate) stock: Vec<StockEntry>,
    pub(crate) elig: Vec<Ring>,
    pub(crate) table: Vec<Proposal>,
    pub(crate) history: Vec<Proposal>,
    pub(crate) next_prop: u32,
    pub(crate) epics_day: u64, pub(crate) epics_today: u32,
    pub(crate) last_ember: u64,
    pub(crate) hype_until: u64, pub(crate) hype_last: u64,
    pub(crate) rollcall_until: u64, pub(crate) rollcall_mult: u32,
    pub(crate) tag_until: u64,
    pub(crate) bets_held: u128,
    pub(crate) total_bought: u128, pub(crate) total_sold: u128,
    // raids
    pub(crate) raid: Option<Raid>,
    pub(crate) raids: Vec<Raid>,
    pub(crate) raid_seq: u32,
    pub(crate) last_raid_end: u64,
    pub(crate) last_raid_start: u64,
    pub(crate) last_attack: u64,
    pub(crate) omen: Omen,
    // chart
    pub(crate) prices: Vector<PricePoint>,
    pub(crate) price_seq: u64,
}

// ------------------------------------------------------------------ views
#[near(serializers = [json])]
pub struct ParamsView {
    pub params: Params,
    pub supply: U128, pub curve_cap: U128, pub reward_pool: U128, pub dex_reserve: U128,
    pub virtual_near: U128, pub virtual_tokens: U128,
    pub fee_bps: u32, pub fee_protocol_bps: u32, pub fee_escrow_bps: u32, pub fee_pot_bps: u32,
    pub gm_every_ms: u64, pub idle_grace_ms: u64, pub idle_tick_ms: u64, pub idle_bps: u32, pub daily_loss_cap_bps: u32,
    pub vault_early_bps: u32, pub vault_weight_cap: U128, pub energy_near: U128, pub pot_daily_bps: u32,
    pub ritual_gm_min: u32, pub ritual_gm_pct: u32, pub ritual_lock_min: U128, pub ritual_lock_pct: u32,
    pub ritual_burn_bps: u32, pub ritual_streak_burn_bps: u32,
    pub level_mcap: Vec<U128>, pub level_real: Vec<U128>, pub level_volume: Vec<U128>, pub level_checkins: Vec<u32>,
    pub level_age_ms: Vec<u64>, pub level_hold_ms: Vec<u64>,
    pub admin: Option<AccountId>,
    /// "demo" builds divide every game NEAR amount by `near_scale` and every duration by `time_scale`.
    pub mode: String, pub near_scale: u32, pub time_scale: u32,
}

#[near(serializers = [json])]
pub struct CoinView {
    pub name: String, pub symbol: String, pub creator: AccountId, pub rules: Vec<Rule>, pub created_ms: u64, pub now: u64,
    pub price: U128, pub mcap: U128, pub real: U128, pub circulating: U128, pub total_supply: U128, pub burned: U128,
    pub pot: U128, pub pot_spent_today: U128, pub escrow: U128, pub protocol_owed: U128, pub reward_pool: U128,
    pub vault_locked: U128, pub vault_weight: U128, pub energy: u32, pub level: u8, pub level_at: Vec<u64>,
    pub holders: u32, pub graduated: bool, pub solvent: bool, pub curve_room: U128,
    pub hype_until: u64, pub rollcall_until: u64, pub tag_until: u64, pub deck: Vec<DeckView>,
}

#[near(serializers = [json])]
pub struct HolderView {
    pub balance: U128, pub pending_idle_burn: U128, pub locked: U128, pub locks: Vec<Lock>, pub vault_weight: U128, pub vault_earned: U128,
    pub since: u64, pub last_gm: u64, pub next_gm: u64, pub idle_burn_starts: u64, pub lost_today: U128, pub loss_cap_today: U128,
    pub value: U128, pub qualified: bool,
}

#[near(serializers = [json])]
pub struct RuleCheck { pub name: String, pub current: U128, pub target: U128, pub met: bool }

#[near(serializers = [json])]
pub struct LevelView { pub level: u8, pub next: Option<u8>, pub rules: Vec<RuleCheck>, pub all_met_since: Option<u64>, pub hold_ms: u64 }

#[near]
impl Coin {
    /// Launch: freezes every parameter, mints the full supply to this contract (the curve's stock, the reward pool and the
    /// DEX reserve) and puts the attached seed into the pot.
    #[init]
    #[payable]
    pub fn new(name: String, symbol: String, icon: Option<String>, creator: AccountId, protocol: AccountId, rules: Vec<Rule>) -> Self {
        let seed = env::attached_deposit().as_yoctonear();
        require!((SEED_MIN..=SEED_MAX).contains(&seed), "seed must be 5 to 100 NEAR");
        require!(!name.is_empty() && name.len() <= 32, "name 1-32 chars");
        require!(!symbol.is_empty() && symbol.len() <= 10, "symbol 1-10 chars");
        require!(rules.len() <= 3, "at most 3 creator rules");
        for (i, r) in rules.iter().enumerate() { require!(!rules[..i].contains(r), "duplicate rule"); }
        require!(!(rules.contains(&Rule::PaperTax) && rules.contains(&Rule::SoftTax)), "Paper Tax and Soft Tax can't combine");
        let now = env::block_timestamp_ms();
        let pool = Pool::new();
        let mut c = Self {
            p: Params { name, symbol, icon, creator, protocol, rules, seed: U128(seed), created_ms: now },
            x: pool.x, y: pool.y, k: pool.k.0, real: 0, circ: 0, burned: 0,
            pot: seed, pot_day: now / DAY, pot_spent_today: 0, protocol_owed: 0, escrow: 0, reward_pool: REWARD_POOL,
            holders: LookupMap::new(b"h"), holder_count: 0, buyers: 0,
            vault_locked: 0, vault_w: 0, vault_acc: 0, vault_rewards: 0,
            energy: 0, energy_acc: 0, buys: Ring::default(), sells: Ring::default(), checkins: Ring::default(),
            level: 1, level_ok_since: None, level_at: vec![now],
            ritual: Ritual { day: now / DAY, gm_target: RITUAL_GM_MIN, lock_target: U128(RITUAL_LOCK_MIN), gm_count: 0, lock_near: U128(0), streak: 0, best_streak: 0, best_streak_day: 0, last_made: None, made_days: vec![], double_from: vec![] },
            graduated: false, log: Vector::new(b"l"), log_seq: 0,
            nonce: 0, stock: vec![], elig: vec![Ring::default(), Ring::default(), Ring::default()], table: vec![], history: vec![], next_prop: 0,
            epics_day: 0, epics_today: 0, last_ember: 0, hype_until: 0, hype_last: 0, rollcall_until: 0, rollcall_mult: 1, tag_until: 0,
            bets_held: 0, total_bought: 0, total_sold: 0,
            raid: None, raids: vec![], raid_seq: 0, last_raid_end: 0, last_raid_start: 0, last_attack: 0, omen: Omen::default(),
            prices: Vector::new(b"p"), price_seq: 0,
        };
        let me = env::current_account_id();
        events::ft_mint(&me, SUPPLY, "launch: curve stock, reward pool and DEX reserve");
        c.push_log(now, "mint", Some(me), SUPPLY, 0, "launch");
        c.push_log(now, "seed", Some(c.p.creator.clone()), 0, seed, "creator seed into the pot");
        c.record_price(now);
        c
    }

    /// Price history for the chart, oldest first (at most 400 points; one per minute at most).
    pub fn get_prices(&self) -> Vec<PricePoint> {
        let n = self.price_seq.min(PRICE_KEEP);
        (self.price_seq - n..self.price_seq).filter_map(|s| self.prices.get((s % PRICE_KEEP) as u32).cloned()).collect()
    }

    pub fn get_params(&self) -> ParamsView {
        ParamsView {
            params: self.p.clone(),
            supply: U128(SUPPLY), curve_cap: U128(CAP), reward_pool: U128(REWARD_POOL), dex_reserve: U128(DEX_RESERVE),
            virtual_near: U128(X0), virtual_tokens: U128(Y0),
            fee_bps: FEE_BPS as u32, fee_protocol_bps: FEE_PROTOCOL_BPS as u32, fee_escrow_bps: FEE_ESCROW_BPS as u32, fee_pot_bps: FEE_POT_BPS as u32,
            gm_every_ms: GM_EVERY, idle_grace_ms: IDLE_GRACE, idle_tick_ms: IDLE_TICK, idle_bps: self.idle_bps() as u32, daily_loss_cap_bps: DAILY_LOSS_CAP_BPS as u32,
            vault_early_bps: VAULT_EARLY_BPS as u32, vault_weight_cap: U128(VAULT_WEIGHT_CAP), energy_near: U128(ENERGY_NEAR), pot_daily_bps: POT_DAILY_BPS as u32,
            ritual_gm_min: RITUAL_GM_MIN, ritual_gm_pct: RITUAL_GM_PCT, ritual_lock_min: U128(RITUAL_LOCK_MIN), ritual_lock_pct: RITUAL_LOCK_PCT as u32,
            ritual_burn_bps: RITUAL_BURN_BPS as u32, ritual_streak_burn_bps: RITUAL_STREAK_BURN_BPS as u32,
            level_mcap: LVL_MCAP.iter().map(|v| U128(*v)).collect(), level_real: LVL_REAL.iter().map(|v| U128(*v)).collect(),
            level_volume: LVL_VOLUME.iter().map(|v| U128(*v)).collect(), level_checkins: LVL_CHECKINS.to_vec(),
            level_age_ms: LVL_AGE.to_vec(), level_hold_ms: LVL_HOLD.to_vec(),
            admin: None,
            mode: if NEAR_SCALE > 1 { "demo".into() } else { "real".into() }, near_scale: NEAR_SCALE as u32, time_scale: TIME_SCALE as u32,
        }
    }

    pub fn get_coin(&self) -> CoinView {
        let pool = self.pool(); let now = env::block_timestamp_ms();
        CoinView {
            name: self.p.name.clone(), symbol: self.p.symbol.clone(), creator: self.p.creator.clone(), rules: self.p.rules.clone(), created_ms: self.p.created_ms, now,
            price: U128(pool.price()), mcap: U128(pool.mcap()), real: U128(self.real), circulating: U128(self.circ),
            total_supply: U128(SUPPLY - self.burned), burned: U128(self.burned),
            pot: U128(self.pot), pot_spent_today: U128(if self.pot_day == now / DAY { self.pot_spent_today } else { 0 }),
            escrow: U128(self.escrow), protocol_owed: U128(self.protocol_owed), reward_pool: U128(self.reward_pool),
            vault_locked: U128(self.vault_locked), vault_weight: U128(self.vault_w), energy: self.energy, level: self.level, level_at: self.level_at.clone(),
            holders: self.holder_count, graduated: self.graduated, solvent: pool.solvent(), curve_room: U128(pool.room()),
            hype_until: self.hype_until, rollcall_until: self.rollcall_until, tag_until: self.tag_until, deck: self.deck_view(now),
        }
    }

    pub fn get_ritual(&self) -> Ritual { self.ritual.clone() }

    /// Newest first.
    pub fn get_log(&self, before_seq: Option<u64>, limit: Option<u32>) -> Vec<LogEntry> {
        let end = before_seq.unwrap_or(self.log_seq).min(self.log_seq);
        let start = end.saturating_sub(LOG_KEEP).max(self.log_seq.saturating_sub(LOG_KEEP));
        let n = limit.unwrap_or(50).min(100) as u64;
        let mut out = vec![];
        let mut s = end;
        while s > start && (out.len() as u64) < n { s -= 1; if let Some(e) = self.log.get((s % LOG_KEEP) as u32) { out.push(e.clone()); } }
        out
    }

    /// Moves time-based things forward (Ritual day settlement, level checks). Anyone can call it.
    pub fn poke(&mut self) { let now = env::block_timestamp_ms(); self.touch(now); self.touch_level(now); }

    /// Sends the protocol's fee share to the fixed protocol account. Anyone can call it.
    pub fn withdraw_protocol_fees(&mut self) -> U128 {
        let a = self.protocol_owed; require!(a > 0, "nothing owed"); self.protocol_owed = 0;
        let _ = Promise::new(self.p.protocol.clone()).transfer(NearToken::from_yoctonear(a));
        U128(a)
    }

    /// The creator escrow (0.2% of volume) is paid only after graduation.
    pub fn claim_creator_escrow(&mut self) -> U128 {
        require!(self.graduated, "paid at graduation only");
        let a = self.escrow; require!(a > 0, "nothing to claim"); self.escrow = 0;
        let _ = Promise::new(self.p.creator.clone()).transfer(NearToken::from_yoctonear(a));
        U128(a)
    }
}

// ------------------------------------------------------------------ internal helpers
impl Coin {
    pub(crate) fn pool(&self) -> Pool { Pool { x: self.x, y: self.y, k: U256(self.k), real: self.real, circ: self.circ } }
    pub(crate) fn set_pool(&mut self, p: Pool) { self.x = p.x; self.y = p.y; self.k = p.k.0; self.real = p.real; self.circ = p.circ; }
    pub(crate) fn with_pool<R>(&mut self, f: impl FnOnce(&mut Pool) -> R) -> R { let mut p = self.pool(); let r = f(&mut p); self.set_pool(p); r }
    pub(crate) fn has(&self, r: Rule) -> bool { self.p.rules.contains(&r) }
    pub(crate) fn idle_bps(&self) -> u128 { if self.has(Rule::Ruthless) { 2 * IDLE_BPS } else { IDLE_BPS } }

    pub(crate) fn push_log(&mut self, at: u64, kind: &str, account: Option<AccountId>, amount: u128, near: u128, memo: &str) {
        let e = LogEntry { seq: self.log_seq, at, kind: kind.to_string(), account, amount: U128(amount), near: U128(near), memo: memo.to_string() };
        let i = (self.log_seq % LOG_KEEP) as u32;
        if (self.log.len() as u64) < LOG_KEEP { self.log.push(e); } else { self.log.set(i, e); }
        self.log_seq += 1;
        if matches!(kind, "buy" | "sell" | "burn") { self.record_price(at); }
    }

    /// One point per trade or burn; several in the same minute replace each other.
    pub(crate) fn record_price(&mut self, at: u64) {
        let pool = self.pool();
        let pt = PricePoint { at, price: U128(pool.price()), mcap: U128(pool.mcap()) };
        if self.price_seq > 0 {
            let last = ((self.price_seq - 1) % PRICE_KEEP) as u32;
            if let Some(prev) = self.prices.get(last) { if prev.at / MIN == at / MIN { self.prices.set(last, pt); return; } }
        }
        let i = (self.price_seq % PRICE_KEEP) as u32;
        if (self.prices.len() as u64) < PRICE_KEEP { self.prices.push(pt); } else { self.prices.set(i, pt); }
        self.price_seq += 1;
    }

    /// Burns circulating tokens (raises the price) and records it.
    pub(crate) fn burn_circ(&mut self, now: u64, owner: &AccountId, t: u128, memo: &str) -> u128 {
        let b = self.with_pool(|p| p.burn(t));
        if b > 0 { self.burned += b; events::ft_burn(owner, b, memo); self.push_log(now, "burn", Some(owner.clone()), b, 0, memo); }
        b
    }

    /// The pot buys tokens from the curve and burns them, within the 75% daily cap. Returns NEAR spent.
    pub(crate) fn pot_burn(&mut self, now: u64, near: u128, memo: &str) -> u128 {
        if self.graduated { return 0; }
        let d = now / DAY; if d != self.pot_day { self.pot_day = d; self.pot_spent_today = 0; }
        let room = bps(self.pot + self.pot_spent_today, POT_DAILY_BPS).saturating_sub(self.pot_spent_today);
        let near = near.min(self.pot).min(room); if near == 0 { return 0; }
        let (t, used) = self.with_pool(|p| p.buy(near));
        self.pot -= used; self.pot_spent_today += used;
        let b = self.with_pool(|p| p.burn(t)); self.burned += b;
        let me = env::current_account_id();
        events::ft_burn(&me, b, memo);
        self.push_log(now, "burn", Some(me), b, used, memo);
        if self.pool().room() == 0 { self.graduate(now); }
        used
    }

    pub(crate) fn graduate(&mut self, now: u64) {
        if self.graduated { return; }
        self.graduated = true;
        events::rulecard("graduated", near_sdk::serde_json::json!({ "at": now, "real": U128(self.real), "mcap": U128(self.pool().mcap()) }));
        self.push_log(now, "graduated", None, 0, self.real, "curve sold out");
    }

    pub(crate) fn holder(&self, a: &AccountId) -> Holder { self.holders.get(a).cloned().unwrap_or_default() }
    pub(crate) fn is_registered(&self, a: &AccountId) -> bool { self.holders.contains_key(a) }
    pub(crate) fn save(&mut self, a: &AccountId, h: Holder) { self.holders.insert(a.clone(), h); }
}
