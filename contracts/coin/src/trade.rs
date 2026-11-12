//! Buying and selling on the curve, with fees and the creator rules that touch trading.
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, NearToken, Promise};

pub const PAPER_TAX_BPS: u128 = 1_000; // 10% on selling tokens bought < 1h ago
pub const SOFT_TAX_BPS: u128 = 500; // 5% on selling tokens bought < 30 min ago
pub const LAUNCH_GUARD_NEAR: u128 = 30 * GN;
pub const LAUNCH_GUARD_MS: u64 = 10 * MIN;
pub const WHALE_CAP_BPS: u128 = 200; // no wallet over 2% of supply before L3
pub const CREATOR_LOCK_MS: u64 = DAY;
pub const CREATOR_UNLOCK_MS: u64 = 2 * DAY;

#[near(serializers = [json])]
pub struct BuyQuote { pub tokens: U128, pub fee: U128, pub storage: U128, pub near_used: U128, pub refund: U128, pub price_after: U128, pub impact_bps: u32 }

#[near(serializers = [json])]
pub struct SellQuote { pub near_out: U128, pub fee: U128, pub tax: U128, pub price_after: U128, pub impact_bps: u32 }

#[near]
impl Coin {
    /// Buy with the attached NEAR. Registers the wallet on its first buy (storage cost taken from the deposit).
    #[payable]
    pub fn buy(&mut self, min_tokens: Option<U128>) -> U128 {
        let now = env::block_timestamp_ms();
        require!(!self.graduated, "graduated: trading on the curve is closed for buys");
        let a = env::predecessor_account_id();
        let mut dep = env::attached_deposit().as_yoctonear();
        if !self.is_registered(&a) { require!(dep > STORAGE_COST, "deposit too small"); dep -= STORAGE_COST; self.register(&a, now); }
        require!(dep >= GN / 100, "minimum buy 0.01 NEAR");
        self.touch(now);
        let mut h = self.settle(&a, now);
        require!(now >= h.no_trade_until, "you have a live Prophecy bet: no trading until it resolves");
        if self.has(Rule::LaunchGuard) && now < self.p.created_ms + LAUNCH_GUARD_MS {
            require!(h.launch_spent + dep <= LAUNCH_GUARD_NEAR, "Launch Guard: max 30 NEAR per wallet in the first 10 min");
            h.launch_spent += dep;
        }
        let fee = bps(dep, FEE_BPS);
        let net = dep - fee;
        let p0 = self.pool().price();
        let (t, used) = self.with_pool(|p| p.buy(net));
        require!(t > 0, "nothing bought");
        if let Some(m) = min_tokens { require!(t >= m.0, "slippage: fewer tokens than min_tokens"); }
        // fees on the part that was used (the rest is refunded with its fee)
        let fee_used = if used == net { fee } else { mul_div(fee, used, net) };
        self.split_fee(fee_used);
        let refund = (net - used) + (fee - fee_used);
        if h.bal == 0 && h.w == 0 { h.since = now; if h.last_gm == 0 { h.idle_from = now; h.idle_applied = now; } }
        h.bal += t;
        if h.bought_near < GN { h.bought_near += used + fee_used; if h.bought_near >= GN { self.buyers += 1; } }
        // tokens bought in the last hour (for Paper / Soft Tax)
        if now >= h.recent_buy_at + HOUR { h.recent_buy = 0; }
        h.recent_buy += t; h.recent_buy_at = now;
        // tokens bought while a pot card is on the table are tagged until 1h after it fires
        if self.table.iter().any(|p| p.phase < 3 && matches!(p.card, Card::Ember | Card::Inferno)) {
            if now >= h.tag_until { h.tagged = 0; }
            h.tagged += t; h.tag_until = h.tag_until.max(self.tag_until);
        }
        self.raid_trade(&mut h, now, used as i128);
        if self.has(Rule::WhaleCap) && self.level < 3 { require!(h.bal + self.locked_of(&h) <= bps(SUPPLY, WHALE_CAP_BPS), "Whale Cap: max 2% of supply before L3"); }
        self.save(&a, h);
        self.on_trade_energy(used as i128);
        self.buys.add(now, used); self.total_bought += used;
        let me = env::current_account_id();
        events::ft_transfer(&me, &a, t, Some("buy"));
        events::rulecard("buy", json!({ "account_id": a, "near": U128(used + fee_used), "tokens": U128(t), "price_before": U128(p0), "price_after": U128(self.pool().price()) }));
        self.push_log(now, "buy", Some(a.clone()), t, used + fee_used, "");
        if self.pool().room() == 0 { self.graduate(now); }
        if refund > 0 { let _ = Promise::new(a).transfer(NearToken::from_yoctonear(refund)); }
        self.touch_level(now);
        U128(t)
    }

    /// Attach 1 yoctoNEAR (like ft_transfer) so only a full-access key can sell your tokens.
    #[payable]
    pub fn sell(&mut self, amount: U128, min_near: Option<U128>) -> U128 {
        near_sdk::assert_one_yocto();
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        let t = amount.0; require!(t > 0, "amount must be positive");
        self.touch(now);
        let mut h = self.settle(&a, now);
        require!(h.bal >= t, "not enough unlocked balance");
        require!(now >= h.no_trade_until, "you have a live Prophecy bet: no trading until it resolves");
        self.check_creator_lock(&a, &h, t, now);
        let out = self.with_pool(|p| p.sell(t));
        let fee = bps(out, FEE_BPS);
        let mut tax = self.sell_tax(&mut h, t, out, now) + self.tag_fee(&mut h, t, out, now) + self.desert_fee(out, now);
        if self.omen_now(now) == 2 { tax += bps(out, THUNDER_BPS); } // Omen: Thunder
        self.raid_trade(&mut h, now, -(out as i128));
        let pay = out - fee - tax;
        if let Some(m) = min_near { require!(pay >= m.0, "slippage: less NEAR than min_near"); }
        self.split_fee(fee);
        self.pot += tax;
        h.bal -= t; if h.bal == 0 && h.w == 0 { h.since = 0; }
        self.save(&a, h);
        self.on_trade_energy(-(out as i128));
        self.sells.add(now, out); self.total_sold += out;
        let me = env::current_account_id();
        events::ft_transfer(&a, &me, t, Some("sell"));
        events::rulecard("sell", json!({ "account_id": a, "tokens": U128(t), "near": U128(pay), "fee": U128(fee), "tax": U128(tax) }));
        self.push_log(now, "sell", Some(a.clone()), t, pay, "");
        let _ = Promise::new(a).transfer(NearToken::from_yoctonear(pay));
        self.touch_level(now);
        U128(pay)
    }

    pub fn quote_buy(&self, near: U128, account_id: Option<AccountId>) -> BuyQuote {
        let mut dep = near.0;
        let storage = match &account_id { Some(a) if self.is_registered(a) => 0, _ => STORAGE_COST.min(dep) };
        dep -= storage;
        let fee = bps(dep, FEE_BPS); let net = dep - fee;
        let mut p = self.pool(); let p0 = p.price(); let (t, used) = p.buy(net);
        let fee_used = if used == net { fee } else { mul_div(fee, used, net.max(1)) };
        BuyQuote { tokens: U128(t), fee: U128(fee_used), storage: U128(storage), near_used: U128(used + fee_used), refund: U128(net - used + fee - fee_used), price_after: U128(p.price()), impact_bps: impact(p0, p.price()) }
    }

    pub fn quote_sell(&self, amount: U128, account_id: Option<AccountId>) -> SellQuote {
        let mut p = self.pool(); let p0 = p.price();
        let t = amount.0.min(p.circ); let out = p.sell(t);
        let fee = bps(out, FEE_BPS);
        let now = env::block_timestamp_ms();
        let mut tax = match account_id { Some(a) => { let mut h = self.holder(&a); self.sell_tax(&mut h, t, out, now) + self.tag_fee(&mut h, t, out, now) } None => 0 };
        if self.omen_now(now) == 2 { tax += bps(out, THUNDER_BPS); } // Omen: Thunder, so the quote matches what the sale pays
        SellQuote { near_out: U128(out - fee - tax), fee: U128(fee), tax: U128(tax), price_after: U128(p.price()), impact_bps: impact(p0, p.price()) }
    }
}

fn impact(a: u128, b: u128) -> u32 { if a == 0 { 0 } else { (a.abs_diff(b) * 10_000 / a) as u32 } }

impl Coin {
    pub(crate) fn split_fee(&mut self, fee: u128) {
        let proto = mul_div(fee, FEE_PROTOCOL_BPS, FEE_BPS);
        let esc = mul_div(fee, FEE_ESCROW_BPS, FEE_BPS);
        self.protocol_owed += proto; self.escrow += esc; self.pot += fee - proto - esc;
    }

    /// Paper Tax / Soft Tax on the part of the sale that was bought recently. Goes to the pot.
    pub(crate) fn sell_tax(&self, h: &mut Holder, t: u128, out: u128, now: u64) -> u128 {
        let (rate, window) = if self.has(Rule::PaperTax) { (PAPER_TAX_BPS, HOUR) } else if self.has(Rule::SoftTax) { (SOFT_TAX_BPS, 30 * MIN) } else { return 0 };
        if h.recent_buy == 0 || now >= h.recent_buy_at + window { return 0; }
        let taxed = t.min(h.recent_buy);
        h.recent_buy -= taxed;
        bps(mul_div(out, taxed, t), rate)
    }

    /// Selling tagged tokens (bought while a pot card was on the table) before the tag ends pays 10% to the pot.
    pub(crate) fn tag_fee(&self, h: &mut Holder, t: u128, out: u128, now: u64) -> u128 {
        if h.tagged == 0 || now >= h.tag_until { return 0; }
        let taxed = t.min(h.tagged); h.tagged -= taxed;
        bps(mul_div(out, taxed, t), crate::table::TAG_FEE_BPS)
    }

    /// Creator Lock: the creator can't move tokens for 24h, then unlocks evenly over 48h.
    pub(crate) fn check_creator_lock(&self, a: &AccountId, h: &Holder, amount: u128, now: u64) {
        if !self.has(Rule::CreatorLock) || *a != self.p.creator { return; }
        let age = now.saturating_sub(self.p.created_ms);
        require!(age >= CREATOR_LOCK_MS, "Creator Lock: the creator can't sell or move tokens for 24h");
        let free_pct = (((age - CREATOR_LOCK_MS) as u128) * 10_000 / CREATOR_UNLOCK_MS as u128).min(10_000);
        if free_pct < 10_000 {
            // what the creator holds now plus what it already moved is unknown here; keep it simple: each move <= unlocked share of the current bag
            require!(amount <= bps(h.bal, free_pct), "Creator Lock: still unlocking");
        }
    }

    pub(crate) fn on_trade_energy(&mut self, near: i128) {
        let cap = ENERGY_TRADE_CAP as i128;
        self.energy_acc += near.clamp(-cap, cap);
        let unit = ENERGY_NEAR as i128;
        if self.energy_acc >= unit {
            let mut n = (self.energy_acc / unit) as u32;
            if self.omen_now(env::block_timestamp_ms()) == 1 { n *= 2; } // Omen: Full Moon
            self.energy = (self.energy + n).min(ENERGY_MAX);
            self.energy_acc %= unit;
        }
        if self.energy_acc < -5 * unit { self.energy_acc = -5 * unit; }
    }
}
