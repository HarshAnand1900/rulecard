//! Stakes between wallets: Duel (two holders stake the same tokens on whether the coin is a net buyer for an hour) and Bounty
//! (holders pledge tokens to a goal; a met goal pays a bonus from the reward pool, a missed one burns 10%).
//! Staked tokens are held aside like Prophecy bets (`bets_held`) and nothing here loops over holders: a Bounty has at most 50 pledges.
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId};

pub const DUEL_OPEN: u64 = 15 * MIN;
pub const DUEL_LEN: u64 = HOUR;
pub const DUEL_MIN_VALUE: u128 = GN / 2;
pub const DUEL_MAX_VALUE: u128 = 25 * GN;
pub const DUEL_BURN_BPS: u128 = 1_000;
pub const BOUNTY_LEN: u64 = 6 * HOUR;
pub const BOUNTY_MAX_PLEDGES: usize = 50;
pub const BOUNTY_BONUS_BPS: u128 = 1_000;
pub const BOUNTY_MISS_BURN_BPS: u128 = 1_000;

/// phase: 0 waiting for the opponent, 1 on, 2 done
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Duel {
    pub id: u32, pub a: AccountId, pub b: AccountId, pub stake: U128, pub a_yes: bool,
    pub phase: u8, pub created: u64, pub start: u64, pub end: u64, pub snapshot: U128, pub result: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Pledge { pub account: AccountId, pub amount: U128 }

/// phase: 0 open, 1 done
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Bounty {
    pub id: u32, pub sponsor: AccountId, pub question: Question, pub snapshot: U128, pub created: u64, pub end: u64,
    pub pledges: Vec<Pledge>, pub total: U128, pub phase: u8, pub result: String,
}

#[near]
impl Coin {
    /// Duel (a Rare, 20 Energy): challenge one holder. You each stake the same amount of tokens (0.5 to 25 NEAR worth) and
    /// you pick Yes or No on "will this coin be a net buyer over the next hour?". The loser's stake goes to the winner,
    /// minus 10% burned. Both of you can't trade until it is over, so the answer comes from everyone else.
    pub fn duel_challenge(&mut self, opponent: AccountId, stake: U128, yes: bool) -> u32 {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        require!(!self.graduated, "the game ended at graduation");
        self.touch(now);
        require!(a != opponent, "you can't duel yourself");
        require!(self.is_registered(&opponent), "your opponent must hold this coin");
        require!(self.energy >= Card::Duel.energy(), "not enough Energy");
        require!(self.duels.iter().filter(|d| d.phase < 2).count() < 3, "three duels are already open");
        let v = self.pool().value(stake.0);
        require!(v >= DUEL_MIN_VALUE && v <= DUEL_MAX_VALUE, "stake 0.5 to 25 NEAR worth");
        let mut h = self.settle(&a, now);
        require!(now >= h.no_trade_until, "you have a live bet");
        require!(h.bal >= stake.0, "not enough unlocked balance");
        let exp = self.take_card(&mut h, Card::Duel, now); self.free_stock(Card::Duel, exp);
        h.bal -= stake.0; h.no_trade_until = h.no_trade_until.max(now + DUEL_OPEN + DUEL_LEN);
        self.save(&a, h);
        self.energy -= Card::Duel.energy();
        self.bets_held += stake.0;
        let id = self.next_duel; self.next_duel += 1;
        self.duels.push(Duel { id, a: a.clone(), b: opponent.clone(), stake, a_yes: yes, phase: 0, created: now, start: 0, end: 0, snapshot: U128(0), result: String::new() });
        events::ft_transfer(&a, &env::current_account_id(), stake.0, Some("duel stake"));
        events::rulecard("duel_challenged", json!({ "id": id, "a": a, "b": opponent, "stake": stake, "a_yes": yes }));
        id
    }

    /// Accept a duel against you, within 15 minutes. You stake the same amount and take the other side.
    pub fn duel_accept(&mut self, id: u32) {
        let now = env::block_timestamp_ms();
        let b = env::predecessor_account_id();
        self.touch(now);
        let i = self.duels.iter().position(|d| d.id == id).unwrap_or_else(|| env::panic_str("no such duel"));
        let d = self.duels[i].clone();
        require!(d.b == b && d.phase == 0 && now < d.created + DUEL_OPEN, "this duel is closed, or not for you");
        let mut h = self.settle(&b, now);
        require!(now >= h.no_trade_until, "you have a live bet");
        require!(h.bal >= d.stake.0, "not enough unlocked balance");
        h.bal -= d.stake.0; h.no_trade_until = h.no_trade_until.max(now + DUEL_LEN);
        self.save(&b, h);
        self.bets_held += d.stake.0;
        let snap = self.snapshot(&Question::Tide);
        let x = &mut self.duels[i]; x.phase = 1; x.start = now; x.end = now + DUEL_LEN; x.snapshot = U128(snap);
        events::ft_transfer(&b, &env::current_account_id(), d.stake.0, Some("duel stake"));
        events::rulecard("duel_accepted", json!({ "id": id }));
    }

    /// Bounty (a Rare, 20 Energy): pledge tokens (0.5 to 25 NEAR worth) to a goal for 6 hours. Others can add theirs.
    /// If the goal is met everyone gets their tokens back plus 10% more from the reward pool, shared by pledge;
    /// if not, everyone gets 90% back and 10% burns.
    pub fn bounty_open(&mut self, question: Question, amount: U128) -> u32 {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        require!(!self.graduated, "the game ended at graduation");
        self.touch(now);
        self.check_question(&question);
        require!(self.energy >= Card::Bounty.energy(), "not enough Energy");
        require!(self.bounties.iter().filter(|b| b.phase == 0).count() < 2, "two bounties are already open");
        let v = self.pool().value(amount.0);
        require!(v >= DUEL_MIN_VALUE && v <= DUEL_MAX_VALUE, "pledge 0.5 to 25 NEAR worth");
        let mut h = self.settle(&a, now);
        require!(h.bal >= amount.0, "not enough unlocked balance");
        let exp = self.take_card(&mut h, Card::Bounty, now); self.free_stock(Card::Bounty, exp);
        h.bal -= amount.0; self.save(&a, h);
        self.energy -= Card::Bounty.energy();
        self.bets_held += amount.0;
        let snap = self.snapshot(&question);
        let id = self.next_bounty; self.next_bounty += 1;
        self.bounties.push(Bounty { id, sponsor: a.clone(), question, snapshot: U128(snap), created: now, end: now + BOUNTY_LEN, pledges: vec![Pledge { account: a.clone(), amount }], total: amount, phase: 0, result: String::new() });
        events::ft_transfer(&a, &env::current_account_id(), amount.0, Some("bounty pledge"));
        events::rulecard("bounty_opened", json!({ "id": id, "sponsor": a, "amount": amount }));
        id
    }

    /// Add your tokens to an open bounty (at least 0.1 NEAR worth).
    pub fn bounty_pledge(&mut self, id: u32, amount: U128) {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        self.touch(now);
        let i = self.bounties.iter().position(|b| b.id == id).unwrap_or_else(|| env::panic_str("no such bounty"));
        require!(self.bounties[i].phase == 0 && now < self.bounties[i].end, "this bounty is closed");
        require!(self.pool().value(amount.0) >= GN / 10, "minimum pledge 0.1 NEAR worth");
        let mut h = self.settle(&a, now);
        require!(h.bal >= amount.0, "not enough unlocked balance");
        require!(self.bounties[i].pledges.len() < BOUNTY_MAX_PLEDGES || self.bounties[i].pledges.iter().any(|p| p.account == a), "this bounty has 50 pledges already");
        h.bal -= amount.0; self.save(&a, h);
        self.bets_held += amount.0;
        let b = &mut self.bounties[i];
        match b.pledges.iter_mut().find(|p| p.account == a) { Some(p) => p.amount = U128(p.amount.0 + amount.0), None => b.pledges.push(Pledge { account: a.clone(), amount }) }
        b.total = U128(b.total.0 + amount.0);
        events::ft_transfer(&a, &env::current_account_id(), amount.0, Some("bounty pledge"));
    }

    pub fn get_duels(&self) -> Vec<Duel> { self.duels.clone() }
    pub fn get_bounties(&self) -> Vec<Bounty> { self.bounties.clone() }
}

impl Coin {
    /// Close every duel and bounty whose time has come.
    pub(crate) fn step_stakes(&mut self, now: u64) {
        let me = env::current_account_id();
        for i in 0..self.duels.len() {
            let d = self.duels[i].clone();
            if d.phase == 0 && now >= d.created + DUEL_OPEN {
                let mut h = self.settle(&d.a, now); h.bal += d.stake.0; self.save(&d.a, h);
                self.bets_held -= d.stake.0;
                events::ft_transfer(&me, &d.a, d.stake.0, Some("duel refund"));
                let x = &mut self.duels[i]; x.phase = 2; x.result = "refunded: not accepted".into();
            } else if d.phase == 1 && now >= d.end {
                let net_buyer = self.answer(&Question::Tide, d.snapshot.0);
                let winner = if d.a_yes == net_buyer { d.a.clone() } else { d.b.clone() };
                let total = d.stake.0 * 2; let burn = bps(total, DUEL_BURN_BPS);
                let mut h = self.settle(&winner, now); h.bal += total - burn; self.save(&winner, h);
                self.bets_held -= total;
                events::ft_transfer(&me, &winner, total - burn, Some("duel win"));
                if burn > 0 { self.burn_circ(now, &me, burn, "Duel"); }
                let x = &mut self.duels[i]; x.phase = 2; x.result = format!("winner: {} (the coin was {})", winner, if net_buyer { "a net buyer" } else { "not a net buyer" });
                self.push_log(now, "duel", Some(winner), 0, 0, "won a duel");
            }
        }
        while self.duels.len() > 10 { match self.duels.iter().position(|d| d.phase == 2) { Some(p) => { self.duels.remove(p); } None => break } }
        for i in 0..self.bounties.len() {
            let b = self.bounties[i].clone();
            if b.phase != 0 || now < b.end { continue; }
            let met = self.answer(&b.question, b.snapshot.0);
            let total = b.total.0;
            let (mut paid, mut bonus) = (0u128, 0u128);
            if met { bonus = bps(total, BOUNTY_BONUS_BPS).min(self.reward_pool); if bonus > 0 { self.reward_pool -= bonus; self.with_pool(|q| q.release(bonus)); } }
            for p in &b.pledges {
                let back = if met { p.amount.0 + mul_div(bonus, p.amount.0, total.max(1)) } else { p.amount.0 - bps(p.amount.0, BOUNTY_MISS_BURN_BPS) };
                let mut h = self.settle(&p.account, now); h.bal += back; self.save(&p.account, h);
                events::ft_transfer(&me, &p.account, back, Some("bounty payout"));
                paid += back;
            }
            self.bets_held -= total;
            let burn = (total + bonus).saturating_sub(paid);
            if burn > 0 { self.burn_circ(now, &me, burn, "Bounty missed"); }
            let x = &mut self.bounties[i]; x.phase = 1; x.result = if met { format!("goal met: bonus {} tokens", bonus) } else { "goal missed: 10% burned".to_string() };
            self.push_log(now, "bounty", Some(b.sponsor.clone()), 0, 0, if met { "goal met" } else { "goal missed" });
        }
        while self.bounties.len() > 6 { match self.bounties.iter().position(|b| b.phase == 1) { Some(p) => { self.bounties.remove(p); } None => break } }
    }
}
