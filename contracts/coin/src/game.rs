//! gm check-ins, Energy, the Vault, idle burn (with the one daily loss cap), the Daily Ritual and levels.
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId};

pub struct IdleDue { pub burn: u128, pub applied_to: u64, pub loss_day: u64, pub loss_base: u128, pub loss_used: u128 }

const MAX_TICKS: u64 = 200; // ~50 days of ticks per settlement; older ones are skipped

#[near]
impl Coin {
    /// Check in. Once every 6h for a wallet holding at least 1 NEAR worth. Gives the coin +1 Energy,
    /// resets your idle clock, and counts toward today's Ritual.
    pub fn gm(&mut self) {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        require!(self.is_registered(&a), "buy first");
        self.touch(now);
        let mut h = self.settle(&a, now);
        require!(h.last_gm == 0 || now >= h.last_gm + GM_EVERY, "gm once every 6h");
        let value = self.pool().value(h.bal + self.locked_of(&h));
        require!(value >= GM_MIN_VALUE, "hold at least 1 NEAR worth to gm");
        h.last_gm = now; h.idle_from = now; h.idle_applied = now;
        let mut gain = if now < self.rollcall_until { self.rollcall_mult } else { 1 };
        if self.omen_now(now) == 1 { gain *= 2; } // Omen: Full Moon
        self.energy = (self.energy + gain).min(ENERGY_MAX);
        self.count_eligibility(&mut h, now);
        let today = now / DAY;
        if h.ritual_day != today + 1 { h.ritual_day = today + 1; self.ritual.gm_count += 1; } // stored +1 so day 0 isn't "already counted"
        let qualified = value >= QUALIFIED_VALUE && h.since > 0 && now >= h.since + QUALIFIED_HOLD;
        if qualified && (h.counted_checkin_at == 0 || now >= h.counted_checkin_at + DAY) { h.counted_checkin_at = now; self.checkins.add(now, 1); }
        // Omen: Treasure. One lucky gm of the hour gets a pack that is ready to open now.
        if self.omen_now(now) == 4 {
            self.omen.gms += 1;
            if self.omen.gms == self.omen.lucky && h.next_pack > now { h.next_pack = 0; self.push_log(now, "omen", Some(a.clone()), 0, 0, "Treasure: a free pack"); }
        }
        self.save(&a, h);
        events::rulecard("gm", json!({ "account_id": a, "energy": self.energy, "ritual_gm": self.ritual.gm_count }));
        self.touch_level(now);
    }

    /// Lock tokens in the Vault for 6, 24 or 72 hours (weight ×1, ×1.5, ×2). Locked tokens are safe from idle burn
    /// and earn half of everything idle burn takes.
    #[payable]
    pub fn lock(&mut self, amount: U128, hours: u8) -> u32 {
        near_sdk::assert_one_yocto();
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        let mut mult: u8 = match hours { 6 => 10, 24 => 15, 72 => 20, _ => env::panic_str("lock for 6, 24 or 72 hours") };
        let ok = self.omen_now(now);
        let diamond = now < self.diamond_until && hours >= 24; // Card: Diamond Pool
        if ok == 7 || (ok == 13 && self.raid.is_none()) || diamond { mult = (mult as u32 * 5 / 4) as u8; } // Omen: Iron Vault (and Fog with no raid on)
        require!(amount.0 > 0, "amount must be positive");
        self.touch(now);
        let mut h = self.settle(&a, now);
        require!(h.bal >= amount.0, "not enough unlocked balance");
        h.bal -= amount.0;
        let mut bonus = 0u128;
        if diamond { bonus = (amount.0 / 100).min(self.reward_pool).min(100_000 * TOKEN); if bonus > 0 { self.reward_pool -= bonus; self.with_pool(|q| q.release(bonus)); } }
        h.locks.push(Lock { amount: U128(amount.0 + bonus), mult, until: now + hours as u64 * HOUR });
        require!(h.locks.len() <= 10, "at most 10 locks per wallet");
        self.vault_locked += amount.0 + bonus;
        self.reweigh(&mut h);
        self.raid_lock(&mut h, now, amount.0);
        let value = self.pool().value(amount.0);
        // Ritual: count only locked tokens above the most this wallet already had counted today, so unlocking and
        // relocking the same tokens doesn't count twice.
        let today = now / DAY;
        let locked_now = self.locked_of(&h);
        if h.rl_day != today + 1 { h.rl_day = today + 1; h.rl_counted = locked_now - amount.0; } // older locks don't count again
        let new_tokens = locked_now.saturating_sub(h.rl_counted);
        h.rl_counted = h.rl_counted.max(locked_now);
        self.ritual.lock_near = U128(self.ritual.lock_near.0 + self.pool().value(new_tokens));
        let idx = (h.locks.len() - 1) as u32;
        self.save(&a, h);
        events::rulecard("lock", json!({ "account_id": a, "amount": amount, "hours": hours, "near_value": U128(value) }));
        self.push_log(now, "lock", Some(a), amount.0, value, &format!("{hours}h"));
        idx
    }

    /// Take a finished lock back (and its Vault earnings).
    pub fn unlock(&mut self, index: u32) -> U128 {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        self.touch(now);
        let mut h = self.settle(&a, now);
        let i = index as usize; require!(i < h.locks.len(), "no such lock");
        require!(now >= h.locks[i].until, "still locked (leave_early costs 20%)");
        let l = h.locks.remove(i);
        self.vault_locked -= l.amount.0;
        self.reweigh(&mut h);
        h.bal += l.amount.0;
        let earned = self.pay_earned(&mut h);
        self.save(&a, h);
        events::rulecard("unlock", json!({ "account_id": a, "amount": l.amount, "earned": U128(earned) }));
        self.push_log(now, "unlock", Some(a), l.amount.0, 0, "");
        U128(l.amount.0 + earned)
    }

    /// Leave a lock early: 20% penalty, half to the other lockers, half burned.
    #[payable]
    pub fn leave_early(&mut self, index: u32) -> U128 {
        near_sdk::assert_one_yocto();
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        self.touch(now);
        let mut h = self.settle(&a, now);
        let i = index as usize; require!(i < h.locks.len(), "no such lock");
        let l = h.locks.remove(i);
        self.vault_locked -= l.amount.0;
        self.reweigh(&mut h);
        let pen = if now >= l.until { 0 } else { bps(l.amount.0, VAULT_EARLY_BPS) };
        let keep = l.amount.0 - pen;
        h.bal += keep;
        let earned = self.pay_earned(&mut h);
        self.save(&a, h);
        if pen > 0 {
            let half = pen / 2;
            self.add_vault_reward(now, &a, half, "Vault early exit");
            self.burn_circ(now, &a, pen - half, "Vault early exit");
        }
        U128(keep + earned)
    }

    /// Move Vault earnings into your balance.
    pub fn claim_vault(&mut self) -> U128 {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        let mut h = self.settle(&a, now);
        let e = self.pay_earned(&mut h);
        self.save(&a, h);
        U128(e)
    }

    pub fn get_holder(&self, account_id: AccountId) -> Option<HolderView> {
        let h = self.holders.get(&account_id)?;
        let now = env::block_timestamp_ms();
        let due = self.idle_due(h, now);
        let earned = h.earned + mul_div(h.w, self.vault_acc, VAULT_SCALE).saturating_sub(h.debt);
        let locked = self.locked_of(h);
        let pool = self.pool();
        let value = pool.value(h.bal - due.burn + locked);
        let today = now / DAY;
        let (lost, base) = if due.loss_day == today { (due.loss_used, due.loss_base) } else { (0, h.bal - due.burn) };
        Some(HolderView {
            balance: U128(h.bal - due.burn), pending_idle_burn: U128(due.burn), locked: U128(locked), locks: h.locks.clone(),
            vault_weight: U128(h.w), vault_earned: U128(earned), since: h.since, last_gm: h.last_gm,
            next_gm: if h.last_gm == 0 { now } else { h.last_gm + GM_EVERY }, idle_burn_starts: h.idle_from + IDLE_GRACE + IDLE_TICK,
            lost_today: U128(lost), loss_cap_today: U128(bps(base, DAILY_LOSS_CAP_BPS)),
            value: U128(value), qualified: value >= QUALIFIED_VALUE && h.since > 0 && now >= h.since + QUALIFIED_HOLD,
        })
    }

    pub fn get_level_progress(&self) -> LevelView {
        let now = env::block_timestamp_ms();
        if self.level >= 4 { return LevelView { level: self.level, next: None, rules: vec![], all_met_since: None, hold_ms: 0 }; }
        let rules = self.level_rules(now);
        LevelView { level: self.level, next: Some(self.level + 1), rules, all_met_since: self.level_ok_since, hold_ms: LVL_HOLD[(self.level - 1) as usize] }
    }
}

impl Coin {
    pub(crate) fn locked_of(&self, h: &Holder) -> u128 { h.locks.iter().map(|l| l.amount.0).sum() }

    /// Idle burn due for a wallet, without changing anything. Applies 1% (2% with Ruthless) per 6h after 12h without a gm,
    /// doubled inside a missed-Ritual window, and never more than 8% of the day's starting unlocked balance per UTC day.
    pub(crate) fn idle_due(&self, h: &Holder, now: u64) -> IdleDue {
        let mut d = IdleDue { burn: 0, applied_to: h.idle_applied, loss_day: h.loss_day, loss_base: h.loss_base, loss_used: h.loss_used };
        if h.bal == 0 { d.applied_to = now; return d; }
        let start = h.idle_from + IDLE_GRACE;
        if now < start + IDLE_TICK { return d; }
        let from = h.idle_applied.max(start);
        let k_to = (now - start) / IDLE_TICK;
        let mut k = (from - start) / IDLE_TICK + 1;
        if k_to >= k + MAX_TICKS { k = k_to + 1 - MAX_TICKS; }
        let mut bal = h.bal;
        let base_rate = self.idle_bps();
        while k <= k_to {
            let t = start + k * IDLE_TICK;
            let day = t / DAY;
            if day != d.loss_day { d.loss_day = day; d.loss_base = bal; d.loss_used = 0; }
            let doubled = self.ritual.double_from.iter().any(|s| t > *s && t <= *s + RITUAL_DOUBLE) || self.droughts.iter().any(|s| t > *s && t <= *s + OMEN_LEN); // Omen: Drought
            let rate = if doubled { base_rate * 2 } else { base_rate };
            let room = bps(d.loss_base, DAILY_LOSS_CAP_BPS).saturating_sub(d.loss_used);
            let amt = bps(bal, rate).min(room);
            bal -= amt; d.loss_used += amt; d.burn += amt;
            k += 1;
        }
        d.applied_to = start + k_to * IDLE_TICK;
        d
    }

    /// Load a wallet and apply everything that is due: idle burn (half burned, half to the Vault) and Vault accrual.
    pub(crate) fn settle(&mut self, a: &AccountId, now: u64) -> Holder {
        let mut h = self.holder(a);
        let d = self.idle_due(&h, now);
        h.idle_applied = d.applied_to.max(h.idle_applied); h.loss_day = d.loss_day; h.loss_base = d.loss_base; h.loss_used = d.loss_used;
        if d.burn > 0 {
            h.bal -= d.burn;
            if h.bal == 0 && h.w == 0 { h.since = 0; }
            self.save(a, h.clone());
            let half = d.burn / 2;
            self.add_vault_reward(now, a, half, "idle burn to the Vault");
            self.burn_circ(now, a, d.burn - half, "idle burn");
            h = self.holder(a);
        }
        let sq = self.squall_due(&mut h);
        if sq > 0 {
            if h.bal == 0 && h.w == 0 { h.since = 0; }
            self.save(a, h.clone());
            let half = sq / 2;
            self.add_vault_reward(now, a, half, "Squall to the Vault");
            self.burn_circ(now, a, sq - half, "Squall");
            h = self.holder(a);
        }
        self.accrue(&mut h);
        self.settle_raid_cards(&mut h);
        h
    }

    fn accrue(&self, h: &mut Holder) {
        let acc = mul_div(h.w, self.vault_acc, VAULT_SCALE);
        h.earned += acc.saturating_sub(h.debt); h.debt = acc;
    }

    /// Recompute a wallet's Vault weight from its locks (capped at 0.5% of supply).
    pub(crate) fn reweigh(&mut self, h: &mut Holder) {
        self.accrue(h);
        let raw: u128 = h.locks.iter().map(|l| l.amount.0 * l.mult as u128 / 10).sum();
        let w = raw.min(VAULT_WEIGHT_CAP);
        self.vault_w = self.vault_w - h.w + w;
        h.w = w;
        h.debt = mul_div(h.w, self.vault_acc, VAULT_SCALE);
    }

    fn pay_earned(&mut self, h: &mut Holder) -> u128 {
        self.accrue(h);
        let e = h.earned.min(self.vault_rewards);
        h.earned = 0; self.vault_rewards -= e; h.bal += e;
        if e > 0 && h.since == 0 { h.since = env::block_timestamp_ms(); }
        e
    }

    /// Tokens for the Vault, shared by weight. With nobody locked they are burned instead.
    pub(crate) fn add_vault_reward(&mut self, now: u64, from: &AccountId, t: u128, memo: &str) {
        if t == 0 { return; }
        if self.vault_w == 0 { self.burn_circ(now, from, t, memo); return; }
        self.vault_acc += mul_div(t, VAULT_SCALE, self.vault_w);
        self.vault_rewards += t;
        let me = env::current_account_id();
        events::ft_transfer(from, &me, t, Some(memo));
        self.push_log(now, "to_vault", Some(from.clone()), t, 0, memo);
    }

    /// Settle every Ritual day that has ended. Bounded: at most 30 days per call.
    pub(crate) fn touch(&mut self, now: u64) {
        let today = now / DAY;
        let mut n = 0;
        while self.ritual.day < today && n < 30 {
            self.settle_ritual_day(now);
            n += 1;
        }
        if self.ritual.day < today { self.ritual.day = today; }
        self.touch_omen(now);
        self.step_all(now);
        self.step_stakes(now);
        self.expire_raid(now);
    }

    fn settle_ritual_day(&mut self, now: u64) {
        let r = &self.ritual;
        let made = r.gm_count >= r.gm_target && r.lock_near.0 >= r.lock_target.0;
        let day = r.day;
        let (gm_count, lock_near) = (r.gm_count, r.lock_near.0);
        let mut burned_near = 0;
        if made {
            self.ritual.streak += 1;
            if self.ritual.streak > self.ritual.best_streak { self.ritual.best_streak = self.ritual.streak; self.ritual.best_streak_day = day; }
            let rate = if self.ritual.streak >= 3 { RITUAL_STREAK_BURN_BPS } else { RITUAL_BURN_BPS };
            burned_near = self.pot_burn(now, bps(self.pot, rate), "Daily Ritual made");
            self.ritual.made_days.push(day); if self.ritual.made_days.len() > 7 { self.ritual.made_days.remove(0); }
        } else {
            self.ritual.streak = 0;
            self.ritual.double_from.push((day + 1) * DAY); if self.ritual.double_from.len() > 8 { self.ritual.double_from.remove(0); }
        }
        events::rulecard("ritual", json!({ "day": day, "made": made, "gm": gm_count, "gm_target": self.ritual.gm_target, "lock_near": U128(lock_near), "lock_target": self.ritual.lock_target, "pot_burn_near": U128(burned_near) }));
        self.push_log(now, if made { "ritual_made" } else { "ritual_missed" }, None, 0, burned_near, &format!("day {day}"));
        self.ritual.gm_target = RITUAL_GM_MIN.max((gm_count * RITUAL_GM_PCT).div_ceil(100));
        self.ritual.lock_target = U128(RITUAL_LOCK_MIN.max(lock_near * RITUAL_LOCK_PCT / 100));
        self.ritual.gm_count = 0; self.ritual.lock_near = U128(0);
        self.ritual.last_made = Some(made);
        self.ritual.day = day + 1;
    }

    fn level_rules(&self, now: u64) -> Vec<RuleCheck> {
        let i = (self.level - 1) as usize;
        let pool = self.pool();
        let vol = self.buys.sum(now, 24) + self.sells.sum(now, 24);
        let net_ok = self.buys.sum(now, 1) >= self.sells.sum(now, 1);
        let age = now.saturating_sub(self.p.created_ms);
        let rc = |name: &str, cur: u128, target: u128| RuleCheck { name: name.into(), current: U128(cur), target: U128(target), met: cur >= target };
        vec![
            rc("market_cap", pool.mcap(), LVL_MCAP[i]),
            rc("real_near", self.real, LVL_REAL[i]),
            rc("volume_24h", vol, LVL_VOLUME[i]),
            rc("checkins_24h", self.checkins.sum(now, 24), LVL_CHECKINS[i] as u128),
            RuleCheck { name: "net_buying_1h".into(), current: U128(self.buys.sum(now, 1)), target: U128(self.sells.sum(now, 1)), met: net_ok },
            rc("coin_age_ms", age as u128, LVL_AGE[i] as u128),
        ]
    }

    /// Level up after every rule has held for the hold time.
    pub(crate) fn touch_level(&mut self, now: u64) {
        if self.level >= 4 || self.graduated { return; }
        let ok = self.level_rules(now).iter().all(|r| r.met);
        if !ok { self.level_ok_since = None; return; }
        match self.level_ok_since {
            None => self.level_ok_since = Some(now),
            Some(s) if now >= s + LVL_HOLD[(self.level - 1) as usize] => {
                self.level += 1; self.level_at.push(now); self.level_ok_since = None;
                events::rulecard("level_up", json!({ "level": self.level, "at": now }));
                self.push_log(now, "level_up", None, 0, 0, &format!("L{}", self.level));
            }
            _ => {}
        }
    }
}
