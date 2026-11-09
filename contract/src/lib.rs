//! Rulecard on NEAR: a memecoin launchpad where every coin plays rule cards.
//! Same rules as the TypeScript engine in src/engine. Things that would need a loop over every holder
//! (Hold the Line payouts, level-up drops) are claim-based here, so every call does bounded work.
use near_sdk::json_types::{U128, U64};
use near_sdk::store::{IterableMap, LookupMap, LookupSet};
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

pub mod cards;
pub mod math;
pub mod raids;
use cards::*;
use raids::*;
use math::*;

const MIN_BAL: u128 = 100_000 * TOKEN;
const HAND_LIMIT: u32 = 7;
const BURN_CAP_BPS: u128 = 500; // 5% of supply per 24h for card burns
const POT_CAP_BPS: u128 = 5_000; // 50% of the pot per 24h
const MAX_SELL_BPS: u128 = 300; // total sell fee incl. tolls

// ----------------------------------------------------------------- stored types
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Holding {
    pub bal: U128, pub acq: u64, pub recent_buy: U128, pub recent_at: u64, pub launch_bought: U128,
    pub last_checkin: u64, pub last_cast: u64, pub last_big: u64, pub locked_until: u64, pub vest: Vec<(U128, u64)>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Effect {
    pub id: u32, pub card: CardType, pub tier: Tier, pub caster: AccountId, pub cast_at: u64, pub starts: u64, pub ends: u64, pub done: bool,
    pub chunks: u8, pub chunks_done: u8, pub budget: U128, pub burned: U128,
    pub lock_ms: u64, pub total: U128, pub forfeit: U128, pub skin: String, pub bonus: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Htl { pub start: u64, pub end: u64, pub dip_budget: U128, pub dip_done: u8, pub total_w: U128 }
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct HtlRound { pub pool: U128, pub total_w: U128 }
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct HtlReg { pub w: U128, pub bal: U128, pub out: bool }

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Coin {
    pub id: u32, pub name: String, pub ticker: String, pub creator: AccountId, pub created: u64, pub fee_bps: u16, pub rules: Vec<Rule>,
    pub x: u128, pub y: u128, pub k: [u64; 4], pub real: u128, pub circ: u128,
    pub pot: u128, pub prize_pot: u128, pub burned: u128, pub inflow_in: u128, pub inflow_out: u128,
    pub level: u8, pub level_pending: Option<u64>, pub crossed_at: Vec<u64>,
    pub spark_m: u32, pub ult_m: u32, pub meter_at: u64, pub rare_free_at: u64, pub eclipse_used: u64,
    pub caps_start: u64, pub caps_burned: u128, pub caps_pot: u128,
    pub effects: Vec<Effect>, pub next_fx: u32,
    pub peak: u128, pub peak_at: u64, pub pre_trade: u128, pub htl: Option<Htl>, pub htl_cooldown: u64, pub last_htl: u64,
    pub raid: Option<u32>, pub banner_of: Option<u32>, pub banner_until: u64,
    pub chk_hour: u64, pub chk_cur: u128, pub chk_prev: u128, pub graduated: bool,
}

impl Coin {
    fn pool(&self) -> Pool { Pool { x: self.x, y: self.y, k: U256(self.k), real: self.real, circ: self.circ } }
    fn set_pool(&mut self, p: Pool) { self.x = p.x; self.y = p.y; self.k = p.k.0; self.real = p.real; self.circ = p.circ; }
    fn with_pool<R>(&mut self, f: impl FnOnce(&mut Pool) -> R) -> R { let mut p = self.pool(); let r = f(&mut p); self.set_pool(p); r }
    fn price(&self) -> u128 { self.pool().price_per_token() }
    fn has(&self, r: Rule) -> bool { self.rules.contains(&r) }
    fn active(&self, card: CardType, now: u64) -> Option<&Effect> { self.effects.iter().find(|e| e.card == card && !e.done && now >= e.starts && now < e.ends) }
    fn fee_bps(&self, now: u64) -> u128 { if self.active(CardType::TaxHoliday, now).is_some() { 0 } else { self.fee_bps as u128 } }
    fn roll_caps(&mut self, now: u64) { if now >= self.caps_start + DAY { self.caps_start = now; self.caps_burned = 0; self.caps_pot = 0; } }
    fn burn_room(&mut self, now: u64) -> u128 { self.roll_caps(now); mul_div(self.circ + self.caps_burned, BURN_CAP_BPS, 10_000).saturating_sub(self.caps_burned) }
    fn pot_room(&mut self, now: u64) -> u128 { self.roll_caps(now); mul_div(self.pot + self.caps_pot, POT_CAP_BPS, 10_000).saturating_sub(self.caps_pot) }
    fn capped_burn(&mut self, now: u64, t: u128) -> u128 { let b = t.min(self.burn_room(now)); let b = self.with_pool(|p| p.burn(b)); self.caps_burned += b; self.burned += b; b }
    fn raw_burn(&mut self, t: u128) -> u128 { let b = self.with_pool(|p| p.burn(t)); self.burned += b; b }
    /// Pot buys tokens on the curve without a fee.
    fn pot_buy(&mut self, now: u64, near: u128) -> u128 {
        let near = near.min(self.pot).min(self.pot_room(now)); if near == 0 { return 0; }
        let (t, used) = self.with_pool(|p| p.buy(near)); self.pot -= used; self.caps_pot += used; if self.pool().room() == 0 { self.graduated = true; } t
    }
    /// Pot buys and burns, sized so the tokens fit the burn cap.
    fn pot_burn(&mut self, now: u64, near: u128) -> u128 {
        let room = self.burn_room(now); if room == 0 { return 0; }
        let max_near = self.pool().near_for_tokens(room);
        let t = self.pot_buy(now, near.min(max_near)); self.capped_burn(now, t)
    }
    fn pulse_ppm(&self, now: u64) -> u128 {
        if self.circ == 0 { return 0; }
        let h = now / HOUR;
        let (cur, prev) = if h == self.chk_hour { (self.chk_cur, self.chk_prev) } else if h == self.chk_hour + 1 { (0, self.chk_cur) } else { (0, 0) };
        let w = cur + mul_div(prev, (HOUR - now % HOUR) as u128, HOUR as u128);
        mul_div(w, 1_000_000, self.circ).min(1_000_000)
    }
    fn outflow(&self) -> u128 { self.inflow_out }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Nft {
    pub id: U64, pub kind: String, pub coin: u32, pub owner: AccountId, pub card: Option<CardType>, pub tier: Option<Tier>,
    pub shiny: bool, pub title: String, pub created: u64, pub soulbound: bool,
}

// ----------------------------------------------------------------- views
#[near(serializers = [json])]
pub struct CoinView {
    pub id: u32, pub name: String, pub ticker: String, pub creator: AccountId, pub created: u64, pub fee_bps: u16, pub rules: Vec<Rule>,
    pub price_yocto_per_token: U128, pub real: U128, pub circ: U128, pub pot: U128, pub prize_pot: U128, pub burned: U128,
    pub level: u8, pub spark: u32, pub ult: u32, pub rare_free_at: u64, pub in_eclipse: bool, pub pulse_ppm: u32,
    pub effects: Vec<Effect>, pub htl: Option<Htl>, pub last_htl: u64, pub graduated: bool, pub skin: String, pub solvent: bool,
    pub now: u64, pub level_pending: Option<u64>, pub mcap_yocto: U128,
    pub raid: Option<u32>, pub banner_of: Option<u32>, pub banner_until: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Rulecard {
    coins: IterableMap<u32, Coin>,
    holders: LookupMap<String, Holding>,
    nfts: IterableMap<u64, Nft>,
    owned: LookupMap<AccountId, Vec<u64>>,
    hand_count: LookupMap<String, u32>,
    stakes: LookupMap<String, u128>,
    htl_regs: LookupMap<String, HtlReg>,
    htl_rounds: LookupMap<String, HtlRound>,
    claims: LookupSet<String>,
    next_coin: u32,
    next_nft: u64,
    nonce: u64,
    raids: LookupMap<u32, Raid>,
    next_raid: u32,
}

fn level_watch(c: &mut Coin, t: u64) {
    if c.level >= 5 { return; }
    let above = c.real >= LEVELS_NEAR[c.level as usize] * ONE_NEAR;
    if above && c.level_pending.is_none() { c.level_pending = Some(t); } else if !above { c.level_pending = None; }
}
fn hk(coin: u32, a: &AccountId) -> String { format!("{coin}:{a}") }
fn now() -> u64 { env::block_timestamp_ms() }
/// Token-weighted average acquisition time, without overflowing: acq + (t - acq) * add / (bal + add).
fn blend_acq(bal: u128, acq: u64, add: u128, t: u64) -> u64 { if bal == 0 || acq == 0 { return t; } if bal + add == 0 { return acq; } acq + mul_div(t.saturating_sub(acq) as u128, add, bal + add) as u64 }
fn yocto(n: u128) -> NearToken { NearToken::from_yoctonear(n) }

#[near]
impl Rulecard {
    #[init]
    pub fn new() -> Self {
        Self {
            coins: IterableMap::new(b"c"), holders: LookupMap::new(b"h"), nfts: IterableMap::new(b"n"), owned: LookupMap::new(b"o"),
            hand_count: LookupMap::new(b"k"), stakes: LookupMap::new(b"s"), htl_regs: LookupMap::new(b"r"), htl_rounds: LookupMap::new(b"q"),
            claims: LookupSet::new(b"l"), next_coin: 1, next_nft: 1, nonce: 0, raids: LookupMap::new(b"x"), next_raid: 1,
        }
    }

    // ------------------------------------------------------------- launch & trade
    /// Launch a coin. Attached NEAR (max 1) is the creator's first buy; anything above 1 NEAR is refunded.
    #[payable]
    pub fn launch_coin(&mut self, name: String, ticker: String, fee_bps: u16, rules: Vec<Rule>) -> u32 {
        let creator = env::predecessor_account_id(); let t = now();
        require!(!name.trim().is_empty() && name.len() <= 32, "name: 1-32 chars");
        require!((2..=8).contains(&ticker.len()) && ticker.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()), "ticker: 2-8 A-Z/0-9");
        require!(!self.coins.values().any(|c| c.ticker == ticker), "ticker taken");
        require!((100..=200).contains(&fee_bps), "fee must be 1-2%");
        let mut rs = rules.clone(); rs.dedup(); require!(rs.len() <= 3, "at most 3 rules");
        let id = self.next_coin; self.next_coin += 1;
        let p = Pool::new();
        let c = Coin {
            id, name: name.trim().to_string(), ticker: ticker.clone(), creator: creator.clone(), created: t, fee_bps, rules: rs,
            x: p.x, y: p.y, k: p.k.0, real: 0, circ: 0, pot: 0, prize_pot: 0, burned: 0, inflow_in: 0, inflow_out: 0,
            level: 1, level_pending: None, crossed_at: vec![t, t, 0, 0, 0, 0], spark_m: 15_000, ult_m: 0, meter_at: t, rare_free_at: 0, eclipse_used: u64::MAX,
            caps_start: t, caps_burned: 0, caps_pot: 0, effects: vec![], next_fx: 1, peak: p.price_per_token(), peak_at: t, pre_trade: p.price_per_token(), htl: None, htl_cooldown: 0, last_htl: 0, raid: None, banner_of: None, banner_until: 0,
            chk_hour: t / HOUR, chk_cur: 0, chk_prev: 0, graduated: false,
        };
        self.coins.insert(id, c);
        for card in [CardType::TaxHoliday, CardType::RollCall, CardType::HypeSiren, CardType::SlowBurn] { self.mint_card(id, &creator, card, false); }
        env::log_str(&format!("launch ${ticker} id={id}"));
        let dep = env::attached_deposit().as_yoctonear();
        if dep > 0 {
            let first = dep.min(ONE_NEAR);
            self.do_buy(id, &creator, first, 0);
            if dep > first { let _ = Promise::new(creator).transfer(yocto(dep - first)); }
        }
        id
    }

    #[payable]
    pub fn buy(&mut self, coin_id: u32, min_tokens: U128) -> U128 {
        let a = env::predecessor_account_id(); let dep = env::attached_deposit().as_yoctonear();
        require!(dep > 0, "attach NEAR to buy");
        U128(self.do_buy(coin_id, &a, dep, min_tokens.0))
    }

    pub fn sell(&mut self, coin_id: u32, tokens: U128, min_near: U128) -> U128 {
        let a = env::predecessor_account_id(); let t = now();
        let mut c = self.load(coin_id); let mut h = self.hold(&c, &a);
        let tokens = tokens.0; require!(tokens > 0 && tokens <= h.bal.0, "not enough tokens");
        require!(t >= h.locked_until, "your tokens are locked (caster lock)");
        require!(!(a == c.creator && c.has(Rule::VaultSeal) && t < c.created + DAY), "Vault Seal: creator cannot sell in the first 24h");
        // unvested Happy Hour bonus is forfeited and burned
        let unv: u128 = h.vest.iter().map(|v| v.0 .0).sum();
        if unv > 0 { h.vest.clear(); c.raw_burn(unv); }
        c.pre_trade = c.price();
        let fee = c.fee_bps(t);
        let room = MAX_SELL_BPS.saturating_sub(fee);
        let toll = if c.htl.is_some() { 200u128.min(room) } else { 0 };
        let recent = if t < h.recent_at + 15 * MIN { h.recent_buy.0 } else { 0 };
        let paper = if c.has(Rule::PaperTax) { mul_div(200, recent.min(tokens), tokens).min(room - toll) } else { 0 };
        h.bal = U128(h.bal.0 - tokens);
        let mut sold = tokens;
        if c.active(CardType::SlowBurn, t).is_some() { sold -= c.capped_burn(t, tokens / 100); }
        let out = c.with_pool(|p| p.sell(sold));
        let f = mul_div_up(out, fee, 10_000); let tl = mul_div_up(out, toll, 10_000); let pp = mul_div_up(out, paper, 10_000);
        let net = out - f - tl - pp;
        require!(net >= min_near.0, "slippage: less NEAR than your minimum");
        c.pot += f + pp; c.prize_pot += tl; c.inflow_out += out;
        // Hold the Line: a registered holder who drops below their registered balance is out
        if let Some(htl) = c.htl.as_mut() {
            let key = format!("{}:{}:{}", c.id, htl.start, a);
            if let Some(mut reg) = self.htl_regs.get(&key).cloned() {
                if !reg.out && h.bal.0 < reg.bal.0 { reg.out = true; htl.total_w = U128(htl.total_w.0 - reg.w.0); self.htl_regs.insert(key, reg); }
            }
        }
        self.after_trade(&mut c, t);
        self.save_hold(&c, &a, h); self.coins.insert(coin_id, c);
        let _ = Promise::new(a).transfer(yocto(net));
        U128(net)
    }

    pub fn check_in(&mut self, coin_id: u32) {
        let a = env::predecessor_account_id(); let t = now();
        let mut c = self.load(coin_id); let mut h = self.hold(&c, &a);
        require!(h.bal.0 >= MIN_BAL, "hold at least 100k tokens to check in");
        require!(t >= h.last_checkin + 30 * MIN || h.last_checkin == 0, "already checked in (every 30 min)");
        h.last_checkin = t;
        let hr = t / HOUR;
        if hr != c.chk_hour { c.chk_prev = if hr == c.chk_hour + 1 { c.chk_cur } else { 0 }; c.chk_cur = 0; c.chk_hour = hr; }
        c.chk_cur += h.bal.0;
        self.save_hold(&c, &a, h); self.coins.insert(coin_id, c);
    }

    /// Anyone can push a coin's clock forward: drips, effect ends, level-ups, Hold the Line.
    pub fn crank(&mut self, coin_id: u32) { let c = self.load(coin_id); let r = c.raid; self.coins.insert(coin_id, c); if let Some(r) = r { self.advance_raid(r); } }

    // ------------------------------------------------------------- cards
    pub fn claim_card_of_day(&mut self, coin_id: u32) -> Option<Nft> {
        let a = env::predecessor_account_id(); let t = now();
        let c = self.load(coin_id); let h = self.hold(&c, &a);
        require!(self.eligible(&h, t), "need 100k tokens held for 1h");
        require!(h.last_checkin > 0 && t < h.last_checkin + DAY, "check in first");
        let key = format!("cotd:{}:{}:{}", coin_id, t / DAY, a); require!(!self.claims.contains(&key), "already claimed today");
        self.claims.insert(key); self.coins.insert(coin_id, c);
        let card = self.random_card(Tier::Common); let shiny = self.rand() % 20 == 0; self.mint_card(coin_id, &a, card, shiny)
    }

    /// Level-up drop. Only for wallets that held 1h before the level was crossed. Tier by Conviction share of supply.
    pub fn claim_level_drop(&mut self, coin_id: u32, level: u8) -> Option<Nft> {
        let a = env::predecessor_account_id(); let t = now();
        let c = self.load(coin_id); let h = self.hold(&c, &a);
        require!((2..=c.level).contains(&level), "that level hasn't been reached");
        let crossed = c.crossed_at[level as usize];
        require!(h.bal.0 >= MIN_BAL && h.acq + HOUR <= crossed, "you must have held 1h before the level was crossed");
        let key = format!("lvl:{coin_id}:{level}:{a}"); require!(!self.claims.contains(&key), "already claimed");
        let conv = self.conviction(&h, t);
        let tier = if level >= 3 && conv * 100 >= c.circ { Tier::Epic } else if conv * 500 >= c.circ { Tier::Rare } else { Tier::Common };
        self.claims.insert(key); self.coins.insert(coin_id, c);
        let card = self.random_card(tier); self.mint_card(coin_id, &a, card, false)
    }

    /// Returns why a card can't be played right now, or null if it can.
    pub fn cast_check(&self, account_id: AccountId, card_id: U64, target: Option<u32>) -> Option<String> {
        let n = self.nfts.get(&card_id.0)?; let mut c = self.coins.get(&n.coin)?.clone();
        let t = now(); self.view_meters(&mut c, t);
        let h = self.holders.get(&hk(c.id, &account_id)).cloned().unwrap_or_default();
        self.why_not(&c, &h, n, &account_id, t, None, target).err()
    }

    pub fn cast(&mut self, card_id: U64, lock_hours: Option<u8>, skin: Option<String>, target: Option<u32>) -> u32 {
        let a = env::predecessor_account_id(); let t = now();
        let n = self.nfts.get(&card_id.0).cloned().unwrap_or_else(|| env::panic_str("no such card"));
        if let Some(rid) = self.coins.get(&n.coin).and_then(|c| c.raid) { self.advance_raid(rid); }
        let mut c = self.load(n.coin); let mut h = self.hold(&c, &a);
        if let Err(why) = self.why_not(&c, &h, &n, &a, t, lock_hours, target) { env::panic_str(&why); }
        let card = n.card.unwrap(); let tier = card.tier(); let big = tier >= Tier::Epic;
        require!(card != CardType::DiamondPool || lock_hours.is_some(), "pick a lock of 1, 6 or 24 hours");
        require!(!card.is_raid() || target.is_some(), "pick a coin to raid");
        if card.is_tactic() {
            // hidden until the round ends; costs 5 Spark like a Common
            c.spark_m -= 5_000; self.burn_nft(card_id.0); h.last_cast = t;
            let mut r = self.raid(c.raid.unwrap()); let side = r.sides.iter().position(|s| s.coin == c.id).unwrap();
            let round = r.round as usize; r.sides[side].tactics[round] = Some(card); self.raids.insert(r.id, r);
            self.save_hold(&c, &a, h); self.coins.insert(c.id, c);
            return round as u32;
        }
        match tier {
            Tier::Common => c.spark_m -= 5_000,
            Tier::Rare => c.rare_free_at = t + 15 * MIN,
            Tier::Epic => c.ult_m = 0,
            Tier::Mythic => c.eclipse_used = t / (12 * HOUR),
        }
        self.burn_nft(card_id.0);
        h.last_cast = t; if big { h.last_big = t; }
        let starts = t + tier.announce();
        let mut e = Effect {
            id: c.next_fx, card, tier, caster: a.clone(), cast_at: t, starts, ends: starts + card.duration(), done: false,
            chunks: 0, chunks_done: 0, budget: U128(0), burned: U128(0), lock_ms: 0, total: U128(0), forfeit: U128(0), skin: String::new(), bonus: U128(0),
        };
        c.next_fx += 1;
        match card {
            CardType::Inferno | CardType::Supernova => { h.locked_until = h.locked_until.max(t + 2 * HOUR); e.chunks = if card == CardType::Inferno { 12 } else { 24 }; }
            CardType::DiamondPool => e.lock_ms = lock_hours.unwrap() as u64 * HOUR,
            CardType::Rebrand => e.skin = skin.filter(|s| ["neon", "gold", "void"].contains(&s.as_str())).unwrap_or_else(|| "neon".into()),
            _ => {}
        }
        if card.is_raid() { e.starts = t; e.ends = t + 15 * MIN + 3 * HOUR; }
        let id = e.id; c.effects.push(e);
        if card.is_raid() { self.open_raid(&mut c, &a, card, target.unwrap(), id, t); }
        env::log_str(&format!("cast {} on ${} by {} starts {}", card.name(), c.ticker, a, starts));
        self.save_hold(&c, &a, h); self.coins.insert(c.id, c);
        id
    }

    pub fn join_diamond(&mut self, coin_id: u32, fx_id: u32, amount: U128) {
        let (a, t) = (env::predecessor_account_id(), now());
        let mut c = self.load(coin_id); let i = self.fx(&c, fx_id, CardType::DiamondPool);
        require!(t >= c.effects[i].starts && t < c.effects[i].ends, "join window is closed");
        self.take_stake(&mut c, &a, amount.0, t);
        let key = format!("{coin_id}:{fx_id}:{a}"); let cur = self.stakes.get(&key).copied().unwrap_or(0); self.stakes.insert(key, cur + amount.0);
        c.effects[i].total = U128(c.effects[i].total.0 + amount.0); self.coins.insert(coin_id, c);
    }
    /// Leave before the unlock: 20% penalty, half burned, half to the people who stay.
    pub fn leave_diamond(&mut self, coin_id: u32, fx_id: u32) {
        let (a, t) = (env::predecessor_account_id(), now());
        let mut c = self.load(coin_id); let i = self.fx(&c, fx_id, CardType::DiamondPool);
        require!(t < c.effects[i].ends + c.effects[i].lock_ms, "already unlocked: claim instead");
        let key = format!("{coin_id}:{fx_id}:{a}"); let st = self.stakes.remove(&key).unwrap_or_else(|| env::panic_str("you are not in this pool"));
        let pen = st / 5; c.raw_burn(pen / 2);
        let e = &mut c.effects[i]; e.forfeit = U128(e.forfeit.0 + pen - pen / 2); e.total = U128(e.total.0 - st);
        self.give(&mut c, &a, st - pen, false, t); self.after_trade(&mut c, t); self.coins.insert(coin_id, c);
    }
    pub fn claim_diamond(&mut self, coin_id: u32, fx_id: u32) -> U128 {
        let (a, t) = (env::predecessor_account_id(), now());
        let mut c = self.load(coin_id); let i = self.fx(&c, fx_id, CardType::DiamondPool);
        require!(t >= c.effects[i].ends + c.effects[i].lock_ms, "still locked");
        let key = format!("{coin_id}:{fx_id}:{a}"); let st = self.stakes.remove(&key).unwrap_or_else(|| env::panic_str("nothing to claim"));
        let share = mul_div(c.effects[i].forfeit.0, st, c.effects[i].total.0.max(1));
        self.give(&mut c, &a, st + share, false, t); self.coins.insert(coin_id, c);
        U128(st + share)
    }
    pub fn feed_black_hole(&mut self, coin_id: u32, fx_id: u32, amount: U128) {
        let (a, t) = (env::predecessor_account_id(), now());
        let mut c = self.load(coin_id); let i = self.fx(&c, fx_id, CardType::BlackHole);
        require!(t >= c.effects[i].starts && t < c.effects[i].ends, "the Black Hole is not open");
        self.take_stake(&mut c, &a, amount.0, t);
        let key = format!("{coin_id}:{fx_id}:{a}"); let first = !self.stakes.contains_key(&key);
        let cur = self.stakes.get(&key).copied().unwrap_or(0); self.stakes.insert(key, cur + amount.0);
        c.effects[i].total = U128(c.effects[i].total.0 + amount.0); self.coins.insert(coin_id, c);
        if first { self.mint(coin_id, &a, "badge", None, "Black Hole contributor".into(), false); let card = self.random_card(Tier::Common); self.mint_card(coin_id, &a, card, false); }
    }

    // ------------------------------------------------------------- Hold the Line
    /// Raise your shield: register for the prize. Must have held 1h before the drop; selling below this balance drops you out.
    pub fn htl_register(&mut self, coin_id: u32) {
        let (a, t) = (env::predecessor_account_id(), now());
        let mut c = self.load(coin_id); let h = self.hold(&c, &a);
        let htl = c.htl.clone().unwrap_or_else(|| env::panic_str("Hold the Line is not running"));
        require!(h.bal.0 >= MIN_BAL && h.acq + HOUR <= htl.start, "you must have held 1h before the drop");
        let key = format!("{}:{}:{}", coin_id, htl.start, a); require!(!self.htl_regs.contains_key(&key), "already registered");
        let w = self.conviction(&h, t);
        self.htl_regs.insert(key, HtlReg { w: U128(w), bal: h.bal, out: false });
        c.htl.as_mut().unwrap().total_w = U128(htl.total_w.0 + w); self.coins.insert(coin_id, c);
    }
    pub fn htl_claim(&mut self, coin_id: u32, start: u64) -> U128 {
        let a = env::predecessor_account_id();
        let c = self.load(coin_id); self.coins.insert(coin_id, c);
        let round = self.htl_rounds.get(&format!("{coin_id}:{start}")).cloned().unwrap_or_else(|| env::panic_str("that Hold the Line hasn't ended"));
        let key = format!("{coin_id}:{start}:{a}"); let reg = self.htl_regs.remove(&key).unwrap_or_else(|| env::panic_str("not registered or already claimed"));
        require!(!reg.out, "you sold during Hold the Line");
        let pay = mul_div(round.pool.0, reg.w.0, round.total_w.0.max(1));
        self.mint(coin_id, &a, "badge", None, "Survivor".into(), false);
        let tier = if reg.w.0 * 10 >= round.total_w.0 { Tier::Rare } else { Tier::Common };
        let card = self.random_card(tier); self.mint_card(coin_id, &a, card, false);
        if pay > 0 { let _ = Promise::new(a).transfer(yocto(pay)); }
        U128(pay)
    }

    // ------------------------------------------------------------- sacrifice, craft, transfer
    pub fn sacrifice(&mut self, coin_id: u32, amount: U128, card: CardType) -> Option<Nft> {
        let (a, t) = (env::predecessor_account_id(), now());
        require!(card.on_chain(), "that card isn't live on-chain yet");
        let mut c = self.load(coin_id); let mut h = self.hold(&c, &a);
        let amt = amount.0; require!(amt > 0 && amt <= h.bal.0, "not enough tokens");
        let held = t.saturating_sub(h.acq);
        let tier = if amt * 100 >= c.circ * 3 && held >= DAY { Tier::Mythic } else if amt * 100 >= c.circ && held >= 6 * HOUR { Tier::Epic }
            else if amt * 500 >= c.circ { Tier::Rare } else if amt * 2000 >= c.circ { Tier::Common } else { env::panic_str("burn at least 0.05% of supply") };
        require!(card.tier() == tier, "that burn earns a different tier");
        require!(self.hand_of(coin_id, &a) < HAND_LIMIT, "hand is full");
        h.bal = U128(h.bal.0 - amt); c.raw_burn(amt); self.after_trade(&mut c, t);
        self.save_hold(&c, &a, h); self.coins.insert(coin_id, c);
        let shiny = self.rand() % 20 == 0; self.mint_card(coin_id, &a, card, shiny)
    }
    pub fn craft(&mut self, ids: Vec<U64>, card: CardType) -> Option<Nft> {
        let a = env::predecessor_account_id();
        require!(ids.len() == 3 && ids[0] != ids[1] && ids[1] != ids[2] && ids[0] != ids[2], "pick 3 different cards");
        require!(card.on_chain(), "that card isn't live on-chain yet");
        let ns: Vec<Nft> = ids.iter().map(|i| self.nfts.get(&i.0).cloned().unwrap_or_else(|| env::panic_str("no such card"))).collect();
        require!(ns.iter().all(|n| n.owner == a && n.card.is_some()), "not your cards");
        require!(ns.iter().all(|n| n.tier == ns[0].tier && n.coin == ns[0].coin), "same coin and tier only");
        require!(Some(card.tier()) == ns[0].tier.unwrap().next(), "3 cards make 1 of the next tier");
        for i in &ids { self.burn_nft(i.0); }
        self.mint_card(ns[0].coin, &a, card, false)
    }
    /// Rare and above can be traded. Commons, relics and badges cannot.
    pub fn nft_transfer(&mut self, receiver_id: AccountId, token_id: U64) {
        let a = env::predecessor_account_id();
        let mut n = self.nfts.get(&token_id.0).cloned().unwrap_or_else(|| env::panic_str("no such NFT"));
        require!(n.owner == a, "not your NFT"); require!(!n.soulbound, "this NFT cannot be transferred");
        require!(self.hand_of(n.coin, &receiver_id) < HAND_LIMIT, "their hand is full");
        self.unindex(&a, n.id.0); self.bump_hand(n.coin, &a, -1);
        n.owner = receiver_id.clone(); self.index(&receiver_id, n.id.0); self.bump_hand(n.coin, &receiver_id, 1);
        self.nfts.insert(token_id.0, n);
    }

    // ------------------------------------------------------------- views
    pub fn get_coin(&self, coin_id: u32) -> Option<CoinView> { self.coins.get(&coin_id).map(|c| self.view(c)) }
    pub fn list_coins(&self, from: Option<u32>, limit: Option<u32>) -> Vec<CoinView> {
        self.coins.values().skip(from.unwrap_or(0) as usize).take(limit.unwrap_or(50) as usize).map(|c| self.view(c)).collect()
    }
    pub fn get_holding(&self, coin_id: u32, account_id: AccountId) -> Option<Holding> { self.holders.get(&hk(coin_id, &account_id)).cloned() }
    pub fn nfts_for_owner(&self, account_id: AccountId) -> Vec<Nft> {
        self.owned.get(&account_id).map(|v| v.iter().filter_map(|i| self.nfts.get(i).cloned()).collect()).unwrap_or_default()
    }
    /// Hold the Line registration for a round (start = the event's start time).
    pub fn get_htl_reg(&self, coin_id: u32, start: u64, account_id: AccountId) -> Option<HtlReg> { self.htl_regs.get(&format!("{coin_id}:{start}:{account_id}")).cloned() }
    pub fn htl_round(&self, coin_id: u32, start: u64) -> Option<HtlRound> { self.htl_rounds.get(&format!("{coin_id}:{start}")).cloned() }
    /// Tokens an account has in a Diamond Pool or Black Hole.
    pub fn get_stake(&self, coin_id: u32, fx_id: u32, account_id: AccountId) -> U128 { U128(self.stakes.get(&format!("{coin_id}:{fx_id}:{account_id}")).copied().unwrap_or(0)) }
    /// Levels whose drop this account already claimed, and whether Card of the Day is claimed today.
    pub fn claims_of(&self, coin_id: u32, account_id: AccountId) -> (Vec<u8>, bool) {
        let lv = (2..=5u8).filter(|l| self.claims.contains(&format!("lvl:{coin_id}:{l}:{account_id}"))).collect();
        (lv, self.claims.contains(&format!("cotd:{}:{}:{}", coin_id, now() / DAY, account_id)))
    }
    pub fn quote_buy(&self, coin_id: u32, near: U128) -> U128 {
        let c = self.coins.get(&coin_id).unwrap_or_else(|| env::panic_str("no such coin"));
        let net = near.0 - mul_div(near.0, c.fee_bps(now()), 10_000); U128(c.pool().quote_buy(net))
    }
}

// ----------------------------------------------------------------- internals
impl Rulecard {
    fn load(&mut self, id: u32) -> Coin { let mut c = self.coins.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such coin")); self.tick(&mut c, now()); c }
    fn hold(&self, c: &Coin, a: &AccountId) -> Holding {
        let mut h = self.holders.get(&hk(c.id, a)).cloned().unwrap_or_default(); let t = now();
        let ready: u128 = h.vest.iter().filter(|v| v.1 <= t).map(|v| v.0 .0).sum();
        if ready > 0 { h.vest.retain(|v| v.1 > t); h.bal = U128(h.bal.0 + ready); }
        h
    }
    fn save_hold(&mut self, c: &Coin, a: &AccountId, h: Holding) { self.holders.insert(hk(c.id, a), h); }
    fn eligible(&self, h: &Holding, t: u64) -> bool { h.bal.0 >= MIN_BAL && h.acq > 0 && t >= h.acq + HOUR }
    fn conviction(&self, h: &Holding, t: u64) -> u128 { let age = t.saturating_sub(h.acq).min(DAY) as u128; h.bal.0 + mul_div(2 * h.bal.0, age, DAY as u128) }
    fn rand(&mut self) -> u64 {
        // block seed + per-call nonce so several draws in one transaction differ; good enough for card types and shiny art, not for money
        self.nonce += 1; let s = env::random_seed(); let mut x = u64::from_le_bytes(s[0..8].try_into().unwrap()) ^ self.nonce.wrapping_mul(0x9E3779B97F4A7C15);
        x ^= x >> 33; x = x.wrapping_mul(0xff51afd7ed558ccd); x ^= x >> 33; x
    }
    fn random_card(&mut self, tier: Tier) -> CardType { let p = CardType::pool(tier); p[(self.rand() % p.len() as u64) as usize] }
    fn hand_of(&self, coin: u32, a: &AccountId) -> u32 { self.hand_count.get(&hk(coin, a)).copied().unwrap_or(0) }
    fn bump_hand(&mut self, coin: u32, a: &AccountId, d: i32) { let k = hk(coin, a); let v = self.hand_count.get(&k).copied().unwrap_or(0) as i32 + d; self.hand_count.insert(k, v.max(0) as u32); }
    fn index(&mut self, a: &AccountId, id: u64) { let mut v = self.owned.get(a).cloned().unwrap_or_default(); v.push(id); self.owned.insert(a.clone(), v); }
    fn unindex(&mut self, a: &AccountId, id: u64) { if let Some(v) = self.owned.get_mut(a) { v.retain(|x| *x != id); } }
    fn mint(&mut self, coin: u32, owner: &AccountId, kind: &str, card: Option<CardType>, title: String, shiny: bool) -> Option<Nft> {
        if card.is_some() && self.hand_of(coin, owner) >= HAND_LIMIT { env::log_str(&format!("{owner}'s hand is full")); return None; }
        let id = self.next_nft; self.next_nft += 1;
        let tier = card.map(|c| c.tier());
        let n = Nft { id: U64(id), kind: kind.into(), coin, owner: owner.clone(), card, tier, shiny, title, created: now(), soulbound: card.is_none() || tier == Some(Tier::Common) };
        self.nfts.insert(id, n.clone()); self.index(owner, id); if card.is_some() { self.bump_hand(coin, owner, 1); }
        Some(n)
    }
    fn mint_card(&mut self, coin: u32, owner: &AccountId, card: CardType, shiny: bool) -> Option<Nft> { self.mint(coin, owner, "card", Some(card), card.name().into(), shiny) }
    fn burn_nft(&mut self, id: u64) { if let Some(n) = self.nfts.remove(&id) { self.unindex(&n.owner, id); if n.card.is_some() { self.bump_hand(n.coin, &n.owner, -1); } } }
    fn fx(&self, c: &Coin, fx_id: u32, card: CardType) -> usize { c.effects.iter().position(|e| e.id == fx_id && e.card == card).unwrap_or_else(|| env::panic_str("no such effect")) }
    fn take_stake(&mut self, c: &mut Coin, a: &AccountId, amt: u128, t: u64) {
        let mut h = self.hold(c, a); require!(amt > 0 && amt <= h.bal.0, "not enough tokens"); require!(t >= h.locked_until, "your tokens are locked");
        h.bal = U128(h.bal.0 - amt); self.save_hold(c, a, h);
    }
    fn give(&mut self, c: &mut Coin, a: &AccountId, amt: u128, fresh: bool, t: u64) {
        let mut h = self.hold(c, a);
        if fresh || h.acq == 0 { h.acq = blend_acq(h.bal.0, h.acq, amt, t); }
        h.bal = U128(h.bal.0 + amt); self.save_hold(c, a, h);
    }

    fn do_buy(&mut self, coin_id: u32, a: &AccountId, dep: u128, min_tokens: u128) -> u128 {
        let t = now(); let mut c = self.load(coin_id); let mut h = self.hold(&c, a);
        require!(!c.graduated, "curve is full: this coin graduated");
        let early = t < c.created + 10 * MIN;
        if c.has(Rule::LaunchGuard) && early { require!(h.launch_bought.0 + dep <= ONE_NEAR, "Launch Guard: max 1 NEAR per wallet in the first 10 minutes"); }
        c.pre_trade = c.price();
        let fee = c.fee_bps(t);
        let net = dep - mul_div_up(dep, fee, 10_000);
        let (got, used) = c.with_pool(|p| p.buy(net));
        if c.pool().room() == 0 { c.graduated = true; }
        let f = if used == net { dep - net } else { mul_div_up(used, fee, 10_000 - fee) };
        let refund = dep - used - f;
        require!(got >= min_tokens, "slippage: fewer tokens than your minimum");
        c.pot += f; c.inflow_in += used;
        if early { h.launch_bought = U128(h.launch_bought.0 + used + f); }
        let mut tk = got;
        if c.active(CardType::SlowBurn, t).is_some() { tk -= c.capped_burn(t, got / 100); }
        h.acq = blend_acq(h.bal.0, h.acq, tk, t);
        h.bal = U128(h.bal.0 + tk);
        h.recent_buy = U128(if t < h.recent_at + 15 * MIN { h.recent_buy.0 + tk } else { tk }); h.recent_at = t;
        c.ult_m = (c.ult_m as u128 + mul_div(used, 2_000, ONE_NEAR)).min(100_000) as u32;
        if let Some(i) = c.effects.iter().position(|e| e.card == CardType::HappyHour && !e.done && t >= e.starts && t < e.ends) {
            let bonus = c.pot_buy(t, used / 10);
            if bonus > 0 { h.vest.push((U128(bonus), t + 6 * HOUR)); c.effects[i].bonus = U128(c.effects[i].bonus.0 + bonus); }
        }
        self.after_trade(&mut c, t);
        self.save_hold(&c, a, h); self.coins.insert(coin_id, c);
        if refund > 0 { let _ = Promise::new(a.clone()).transfer(yocto(refund)); }
        tk
    }

    /// Price peak for the last hour + Hold the Line trigger.
    fn after_trade(&mut self, c: &mut Coin, t: u64) {
        let p = c.price();
        self.htl_check(c, t, p);
        if p > c.peak || t >= c.peak_at + HOUR { c.peak = p; c.peak_at = t; }
        level_watch(c, t);
    }
    fn htl_check(&mut self, c: &mut Coin, t: u64, p: u128) {
        if !c.has(Rule::HoldTheLine) || c.htl.is_some() || t < c.htl_cooldown || t < c.created + HOUR || c.level < 2 || c.circ == 0 { return; }
        let reference = if t < c.peak_at + HOUR { c.peak.max(c.pre_trade) } else { c.pre_trade };
        if p * 10 <= reference * 8 {
            let budget = c.pot_room(t);
            c.htl = Some(Htl { start: t, end: t + 6 * HOUR, dip_budget: U128(budget), dip_done: 0, total_w: U128(0) });
            env::log_str(&format!("HOLD THE LINE on ${}", c.ticker));
        }
    }

    fn view_meters(&self, c: &mut Coin, t: u64) {
        let dt = t.saturating_sub(c.meter_at) as u128; if dt == 0 { return; }
        let mut pulse = c.pulse_ppm(t); if c.active(CardType::RollCall, t).is_some() { pulse *= 2; }
        c.spark_m = (c.spark_m as u128 + mul_div(24_000 * pulse, dt, 1_000_000 * HOUR as u128)).min(30_000) as u32;
        c.ult_m = (c.ult_m as u128 + mul_div(30_000 * pulse, dt, 1_000_000 * HOUR as u128)).min(100_000) as u32;
        c.meter_at = t;
    }

    /// Lazy clock: meters, levels, card drips and endings, Hold the Line. Bounded work per call.
    fn tick(&mut self, c: &mut Coin, t: u64) {
        self.view_meters(c, t);
        // catch up: each level needs 15 minutes above its threshold, one after another
        while c.level < 5 {
            let need = LEVELS_NEAR[c.level as usize] * ONE_NEAR;
            match c.level_pending {
                Some(s) if c.real >= need && t >= s + 15 * MIN => {
                    c.level += 1; c.crossed_at[c.level as usize] = s; env::log_str(&format!("${} level {}", c.ticker, c.level));
                    c.level_pending = if c.level < 5 && c.real >= LEVELS_NEAR[c.level as usize] * ONE_NEAR { Some(s + 15 * MIN) } else { None };
                }
                _ => { level_watch(c, t); break; }
            }
        }
        let mut relics: Vec<(AccountId, String)> = vec![];
        for i in 0..c.effects.len() {
            let e = c.effects[i].clone(); if e.done || t < e.starts { continue; }
            if e.chunks > 0 {
                let step = (e.ends - e.starts) / e.chunks as u64;
                let mut done = e.chunks_done; let mut burned = e.burned.0; let mut budget = e.budget.0;
                if done == 0 { budget = mul_div(c.pot_room(t), if e.card == CardType::Inferno { 5_000 } else { 10_000 }, 10_000); }
                while done < e.chunks && t >= e.starts + done as u64 * step { burned += c.pot_burn(t, budget / e.chunks as u128); done += 1; }
                let ee = &mut c.effects[i]; ee.chunks_done = done; ee.burned = U128(burned); ee.budget = U128(budget);
            }
            let end = if e.card == CardType::DiamondPool { e.ends + e.lock_ms } else { e.ends };
            if t >= end {
                if e.card == CardType::BlackHole { c.raw_burn(e.total.0); }
                if e.card == CardType::DiamondPool && e.total.0 == 0 && e.forfeit.0 > 0 { c.raw_burn(e.forfeit.0); }
                c.effects[i].done = true; relics.push((e.caster.clone(), format!("Played {} on ${}", e.card.name(), c.ticker)));
            }
        }
        // keep finished Diamond Pools until claims are likely done; drop other finished effects after 6h
        c.effects.retain(|e| !e.done || t < e.ends + e.lock_ms + if e.card == CardType::DiamondPool { 7 * DAY } else { 6 * HOUR });
        if let Some(mut h) = c.htl.clone() {
            while h.dip_done < 36 && t >= h.start + h.dip_done as u64 * 10 * MIN { c.pot_burn(t, h.dip_budget.0 / 36); h.dip_done += 1; }
            if t >= h.end {
                let bonus = (c.pot / 5).min(c.pot_room(t)); c.pot -= bonus; c.caps_pot += bonus;
                let pool = c.prize_pot + bonus; c.prize_pot = 0;
                if h.total_w.0 == 0 { c.pot += pool; } else { self.htl_rounds.insert(format!("{}:{}", c.id, h.start), HtlRound { pool: U128(pool), total_w: h.total_w }); }
                c.htl = None; c.htl_cooldown = t + 6 * HOUR; c.last_htl = h.start;
            } else { c.htl = Some(h); }
        }
        for (a, title) in relics { self.mint(c.id, &a, "relic", None, title, false); }
    }

    #[allow(clippy::too_many_arguments)]
    fn why_not(&self, c: &Coin, h: &Holding, n: &Nft, a: &AccountId, t: u64, lock_hours: Option<u8>, target: Option<u32>) -> Result<(), String> {
        let card = n.card.ok_or("that NFT is not a card")?;
        if &n.owner != a { return Err("not your card".into()); }
        if !card.on_chain() { return Err(format!("{} plays in the local engine; on-chain support comes in the next contract version", card.name())); }
        let tier = card.tier();
        if c.level < tier.level() { return Err(format!("{:?} cards unlock at level {}", tier, tier.level())); }
        if h.bal.0 < MIN_BAL { return Err("hold at least 100k tokens".into()); }
        if t < h.acq + HOUR { return Err("tokens must be held 1h".into()); }
        if a == &c.creator && t < c.created + HOUR { return Err("the creator cannot play cards in the first hour".into()); }
        if h.last_cast > 0 && t < h.last_cast + 30 * MIN { return Err("one play per wallet every 30 minutes".into()); }
        let big = tier >= Tier::Epic;
        if big && h.last_big > 0 && t < h.last_big + DAY { return Err("one Epic or Mythic per wallet per 24h".into()); }
        let tactic = card.is_tactic();
        match tier {
            Tier::Common | Tier::Rare if tactic && c.spark_m < 5_000 => return Err("Spark meter too low (needs 5)".into()),
            Tier::Common if c.spark_m < 5_000 => return Err("Spark meter too low (needs 5)".into()),
            Tier::Rare if !tactic && t < c.rare_free_at => return Err("one Rare per coin every 15 minutes".into()),
            Tier::Epic if c.ult_m < 100_000 => return Err("Ult meter must be full".into()),
            Tier::Mythic => {
                let m = t % (12 * HOUR); if !(6 * HOUR..6 * HOUR + 30 * MIN).contains(&m) { return Err("Mythic cards only during an Eclipse (06:00-06:30 and 18:00-18:30 UTC)".into()); }
                if c.eclipse_used == t / (12 * HOUR) { return Err("this Eclipse was already used".into()); }
            }
            _ => {}
        }
        if big && c.effects.iter().any(|e| !e.done && e.tier >= Tier::Epic) { return Err("only one Epic or Mythic effect at a time".into()); }
        if !tactic && !card.is_raid() && c.effects.iter().any(|e| !e.done && e.card == card) { return Err(format!("{} is already running", card.name())); }
        if tactic {
            let r = c.raid.and_then(|id| self.raids.get(&id)).filter(|r| r.status == RaidStatus::Active).ok_or("tactics are played during a raid")?;
            let round = (t.saturating_sub(r.starts) / raids::ROUND).min(4) as usize;
            if round >= 4 { return Err("the raid is over".into()); }
            let side = r.sides.iter().position(|s| s.coin == c.id).unwrap();
            if round == r.round as usize && r.sides[side].tactics[round].is_some() { return Err("your side already played a tactic this round".into()); }
        }
        if card.is_raid() {
            if c.raid.is_some() { return Err("this coin is already in a raid".into()); }
            if let Some(tid) = target {
                let tc = self.coins.get(&tid).ok_or("no such coin to raid")?;
                if tid == c.id { return Err("pick another coin to raid".into()); }
                if tc.level < 2 { return Err("the target must be level 2+".into()); }
                if card == CardType::HardRaid && tc.level < 3 { return Err("hard raids need both coins at level 3".into()); }
                if tc.raid.is_some() { return Err("the target is already in a raid".into()); }
            }
        }
        if card == CardType::DiamondPool && lock_hours.is_some() && ![1u8, 6, 24].contains(&lock_hours.unwrap()) { return Err("pick a lock of 1, 6 or 24 hours".into()); }
        Ok(())
    }

    fn view(&self, c: &Coin) -> CoinView {
        let mut c = c.clone(); let t = now(); self.view_meters(&mut c, t);
        let skin = c.active(CardType::Rebrand, t).map(|e| e.skin.clone()).unwrap_or_else(|| "classic".into());
        let m = t % (12 * HOUR);
        CoinView {
            id: c.id, name: c.name.clone(), ticker: c.ticker.clone(), creator: c.creator.clone(), created: c.created, fee_bps: c.fee_bps, rules: c.rules.clone(),
            price_yocto_per_token: U128(c.price()), real: U128(c.real), circ: U128(c.circ), pot: U128(c.pot), prize_pot: U128(c.prize_pot), burned: U128(c.burned),
            level: c.level, spark: c.spark_m / 1000, ult: c.ult_m / 1000, rare_free_at: c.rare_free_at, in_eclipse: (6 * HOUR..6 * HOUR + 30 * MIN).contains(&m),
            pulse_ppm: c.pulse_ppm(t) as u32, effects: c.effects.clone(), htl: c.htl.clone(), last_htl: c.last_htl, graduated: c.graduated, skin, solvent: c.pool().solvent(),
            now: t, level_pending: c.level_pending, mcap_yocto: U128(mul_div(c.x, Y0, c.y)),
            raid: c.raid, banner_of: if t < c.banner_until { c.banner_of } else { None }, banner_until: c.banner_until,
        }
    }
}

#[cfg(test)]
mod tests;
