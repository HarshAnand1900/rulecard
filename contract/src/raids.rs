//! Raids: coin vs coin, 2h in 4 rounds of 30 min. Score per round = 100 x (1 + net NEAR in / coin size) x tactic.
//! Settlement is claim-based: burns and spoils use per-side totals, each staker claims their own result.
use crate::cards::*;
use crate::math::*;
use crate::{now, Coin, Rulecard, RulecardExt};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId};

pub const ROUND: u64 = 30 * MIN;
const RALLY_PPM: u128 = 70_000;
const CURSE_PPM: u128 = 100_000;
const REFLECT_PPM: u128 = 70_000;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct RaidSide {
    pub coin: u32, pub total: U128, pub start_real: U128, pub in_snap: U128, pub out_snap: U128, pub score: U128,
    pub tactics: Vec<Option<CardType>>, pub mvp: Option<AccountId>, pub mvp_amt: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RaidStatus { Pending, Active, Settling, Done, Expired }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Raid {
    pub id: u32, pub hard: bool, pub status: RaidStatus, pub caster: AccountId, pub card: CardType, pub fx_id: u32,
    pub created: u64, pub accept_by: u64, pub starts: u64, pub ends: u64, pub round: u8, pub sides: Vec<RaidSide>, pub winner: Option<u8>,
    pub spoils_left: U128, pub spoils_chunks: u8, pub spoils_next: u64, pub raider_pool: U128, pub log: Vec<String>,
}

/// Score multiplier in ppm for my tactic against theirs (same numbers as the TypeScript engine).
pub fn tactic_ppm(me: Option<CardType>, op: Option<CardType>) -> u128 {
    let mut m: u128 = 1_000_000;
    if me == Some(CardType::Rally) { m = m * (1_000_000 + if op == Some(CardType::Curse) { RALLY_PPM / 2 } else { RALLY_PPM }) / 1_000_000; }
    if op == Some(CardType::Curse) && me != Some(CardType::Ward) { m = m * (1_000_000 - CURSE_PPM) / 1_000_000; }
    if me == Some(CardType::Curse) && op == Some(CardType::Ward) { m = m * (1_000_000 - REFLECT_PPM) / 1_000_000; }
    m
}
pub fn stake_key(id: u32, side: usize, a: &AccountId) -> String { format!("R:{id}:{side}:{a}") }

#[near]
impl Rulecard {
    /// Accept a raid challenge. Any eligible holder of the target coin (100k tokens held 1h) can accept.
    pub fn raid_accept(&mut self, raid_id: u32) {
        let (a, t) = (env::predecessor_account_id(), now());
        self.advance_raid(raid_id);
        let mut r = self.raid(raid_id); require!(r.status == RaidStatus::Pending, "this raid is not waiting for an answer");
        let ca = self.load(r.sides[0].coin); let cb = self.load(r.sides[1].coin);
        require!(self.eligible(&self.hold(&cb, &a), t), "only eligible holders of the challenged coin can accept");
        r.status = RaidStatus::Active; r.starts = t; r.ends = t + 4 * ROUND;
        for (i, c) in [&ca, &cb].into_iter().enumerate() {
            let s = &mut r.sides[i]; s.start_real = U128(c.real.max(5 * ONE_NEAR)); s.in_snap = U128(c.inflow_in); s.out_snap = U128(c.outflow());
        }
        let mut ca = ca; if let Some(e) = ca.effects.iter_mut().find(|e| e.id == r.fx_id) { e.ends = r.ends + HOUR; }
        r.log.push(format!("{} accepted. 4 rounds of 30 min", a));
        self.coins.insert(ca.id, ca); self.coins.insert(cb.id, cb); self.raids.insert(raid_id, r);
    }

    /// Stake tokens of either coin for its side. Stakes come back (or not) through raid_claim.
    pub fn raid_stake(&mut self, raid_id: u32, coin_id: u32, amount: U128) {
        let (a, t) = (env::predecessor_account_id(), now());
        self.advance_raid(raid_id);
        let mut r = self.raid(raid_id); require!(r.status == RaidStatus::Active, "the raid is not running");
        let side = r.sides.iter().position(|s| s.coin == coin_id).unwrap_or_else(|| env::panic_str("stake tokens of one of the two coins"));
        require!(!self.stakes.contains_key(&stake_key(raid_id, 1 - side, &a)), "you already raid for the other side");
        let mut c = self.load(coin_id); self.take_stake(&mut c, &a, amount.0, t); self.coins.insert(coin_id, c);
        let k = stake_key(raid_id, side, &a); let mine = self.stakes.get(&k).copied().unwrap_or(0) + amount.0; self.stakes.insert(k, mine);
        let s = &mut r.sides[side]; s.total = U128(s.total.0 + amount.0);
        if mine > s.mvp_amt.0 { s.mvp = Some(a.clone()); s.mvp_amt = U128(mine); }
        self.raids.insert(raid_id, r);
    }

    /// After a raid ends: winners get their stake + a share of the spoils, losers get 70% (friendly) or 50% (hard) back.
    pub fn raid_claim(&mut self, raid_id: u32) -> U128 {
        let (a, t) = (env::predecessor_account_id(), now());
        self.advance_raid(raid_id);
        let r = self.raid(raid_id); require!(r.status == RaidStatus::Done, "the raid hasn't finished paying out");
        let mut total = 0u128;
        for side in 0..2usize {
            let Some(st) = self.stakes.remove(&stake_key(raid_id, side, &a)) else { continue };
            let other = self.coins.get(&r.sides[1 - side].coin).map(|c| c.ticker.clone()).unwrap_or_default();
            let pay = match r.winner {
                None => st,
                Some(w) if w as usize == side => {
                    self.mint(r.sides[side].coin, &a, "relic", None, format!("Won a {} raid vs ${}", if r.hard { "hard" } else { "friendly" }, other), false);
                    if r.sides[side].mvp.as_ref() == Some(&a) { self.mint(r.sides[side].coin, &a, "badge", None, "Raid MVP".into(), false); let card = self.random_card(Tier::Rare); self.mint_card(r.sides[side].coin, &a, card, false); }
                    st + if r.hard { mul_div(r.raider_pool.0, st, r.sides[side].total.0.max(1)) } else { 0 }
                }
                Some(_) => if r.hard { st / 2 } else { st * 7 / 10 },
            };
            let mut c = self.load(r.sides[side].coin); self.give(&mut c, &a, pay, true, t); self.coins.insert(c.id, c);
            total += pay;
        }
        require!(total > 0, "nothing to claim");
        U128(total)
    }

    pub fn get_raid(&self, raid_id: u32) -> Option<Raid> { self.raids.get(&raid_id).cloned() }
    pub fn get_raid_stake(&self, raid_id: u32, side: u8, account_id: AccountId) -> U128 { U128(self.stakes.get(&stake_key(raid_id, side as usize, &account_id)).copied().unwrap_or(0)) }
}

impl Rulecard {
    pub(crate) fn raid(&self, id: u32) -> Raid { self.raids.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such raid")) }

    /// Start a raid from a cast Friendly Raid / Hard Raid card.
    pub(crate) fn open_raid(&mut self, c: &mut Coin, caster: &AccountId, card: CardType, target: u32, fx_id: u32, t: u64) -> u32 {
        let id = self.next_raid; self.next_raid += 1;
        let side = |coin: u32| RaidSide { coin, total: U128(0), start_real: U128(0), in_snap: U128(0), out_snap: U128(0), score: U128(0), tactics: vec![None; 4], mvp: None, mvp_amt: U128(0) };
        let mut tc = self.load(target); tc.raid = Some(id);
        let r = Raid {
            id, hard: card == CardType::HardRaid, status: RaidStatus::Pending, caster: caster.clone(), card, fx_id, created: t, accept_by: t + 15 * MIN,
            starts: 0, ends: 0, round: 0, sides: vec![side(c.id), side(target)], winner: None, spoils_left: U128(0), spoils_chunks: 0, spoils_next: 0, raider_pool: U128(0),
            log: vec![format!("${} challenges ${} to a {} raid", c.ticker, tc.ticker, if card == CardType::HardRaid { "hard" } else { "friendly" })],
        };
        c.raid = Some(id); self.coins.insert(target, tc); self.raids.insert(id, r);
        env::log_str(&format!("raid {id}: ${} vs coin {target}", c.ticker));
        id
    }

    /// Advance a raid's clock: expiry, rounds, settlement and spoils. Loads and saves both coins.
    pub(crate) fn advance_raid(&mut self, id: u32) {
        let Some(mut r) = self.raids.get(&id).cloned() else { return };
        let t = now();
        if matches!(r.status, RaidStatus::Done | RaidStatus::Expired) { return; }
        if r.status == RaidStatus::Pending && t < r.accept_by { return; }
        let mut a = self.load(r.sides[0].coin); let mut b = self.load(r.sides[1].coin);
        match r.status {
            RaidStatus::Pending => {
                r.status = RaidStatus::Expired; r.log.push("Nobody accepted. Card returned".into());
                a.raid = None; b.raid = None; end_fx(&mut a, r.fx_id);
                let mut h = self.hold(&a, &r.caster); h.last_cast = 0; h.last_big = 0; self.save_hold(&a, &r.caster, h);
                self.mint_card(a.id, &r.caster, r.card, false);
            }
            RaidStatus::Active => {
                while r.round < 4 && t >= r.starts + (r.round as u64 + 1) * ROUND { end_round(&mut r, &a, &b); }
                if r.round >= 4 { self.settle(&mut r, &mut a, &mut b, t); }
            }
            _ => {}
        }
        if r.status == RaidStatus::Settling {
            let w = r.winner.unwrap() as usize;
            while r.spoils_chunks > 0 && t >= r.spoils_next {
                let (wc, lc) = if w == 0 { (&mut a, &mut b) } else { (&mut b, &mut a) };
                spoils_chunk(&mut r, wc, lc);
            }
            if r.spoils_chunks == 0 { r.status = RaidStatus::Done; a.raid = None; b.raid = None; end_fx(&mut a, r.fx_id); r.log.push("Spoils fully paid".into()); }
        }
        self.coins.insert(a.id, a); self.coins.insert(b.id, b); self.raids.insert(id, r);
    }

    fn settle(&mut self, r: &mut Raid, a: &mut Coin, b: &mut Coin, t: u64) {
        let (sa, sb) = (r.sides[0].score.0, r.sides[1].score.0);
        r.winner = if sa == sb { None } else if sa > sb { Some(0) } else { Some(1) };
        let Some(w) = r.winner else { r.status = RaidStatus::Done; a.raid = None; b.raid = None; end_fx(a, r.fx_id); r.log.push("Tie: all stakes come back".into()); return; };
        let lost = r.sides[1 - w as usize].total.0;
        let (wc, lc) = if w == 0 { (&mut *a, &mut *b) } else { (&mut *b, &mut *a) };
        if !r.hard {
            lc.raw_burn(lost * 3 / 10);
            r.log.push(format!("${} wins. 30% of the losing stakes burned on ${}", wc.ticker, lc.ticker));
            r.status = RaidStatus::Done; a.raid = None; b.raid = None; end_fx(a, r.fx_id);
        } else {
            lc.banner_of = Some(wc.id); lc.banner_until = t + 12 * HOUR;
            r.spoils_left = U128(lost / 2); r.spoils_chunks = 12; r.spoils_next = t; r.status = RaidStatus::Settling;
            r.log.push(format!("${} wins the HARD raid. Half the losing stakes are sold over 1h to buy and burn ${}", wc.ticker, wc.ticker));
        }
    }
}

fn end_fx(c: &mut Coin, fx_id: u32) { if let Some(e) = c.effects.iter_mut().find(|e| e.id == fx_id) { e.done = true; } }

fn end_round(r: &mut Raid, a: &Coin, b: &Coin) {
    let k = r.round as usize;
    let raw: Vec<Option<CardType>> = r.sides.iter().map(|s| s.tactics[k]).collect();
    // Mirror copies what the opponent played last round
    let eff: Vec<Option<CardType>> = (0..2).map(|i| if raw[i] == Some(CardType::Mirror) { if k > 0 { r.sides[1 - i].tactics[k - 1] } else { None } } else { raw[i] }).collect();
    for (i, c) in [a, b].into_iter().enumerate() {
        let s = &mut r.sides[i];
        let net = (c.inflow_in as i128 - s.in_snap.0 as i128) - (c.outflow() as i128 - s.out_snap.0 as i128);
        s.in_snap = U128(c.inflow_in); s.out_snap = U128(c.outflow());
        let real = s.start_real.0 as i128; let base = ((real + net).max(0) as u128) * 100_000_000 / real as u128; // 100 points = 1e8
        s.score = U128(s.score.0 + base * tactic_ppm(eff[i], eff[1 - i]) / 1_000_000);
    }
    let name = |x: Option<CardType>| x.map(|c| c.name()).unwrap_or("none");
    r.log.push(format!("Round {}: ${} {} vs ${} {} -> {:.1} : {:.1}", k + 1, a.ticker, name(eff[0]), b.ticker, name(eff[1]), r.sides[0].score.0 as f64 / 1e6, r.sides[1].score.0 as f64 / 1e6));
    r.round += 1;
}

fn spoils_chunk(r: &mut Raid, wc: &mut Coin, lc: &mut Coin) {
    let tk = r.spoils_left.0 / r.spoils_chunks as u128; r.spoils_left = U128(r.spoils_left.0 - tk); r.spoils_chunks -= 1; r.spoils_next += 5 * MIN;
    // escrowed loser stakes are circulating tokens: sell them through the loser's curve like any trader
    let out = lc.with_pool(|p| p.sell(tk)); let fee = mul_div(out, lc.fee_bps as u128, 10_000); lc.pot += fee; lc.inflow_out += out;
    let net = out - fee; let wfee = mul_div(net, wc.fee_bps as u128, 10_000);
    let (got, used) = wc.with_pool(|p| p.buy(net - wfee)); wc.pot += wfee + (net - wfee - used); wc.inflow_in += used;
    if wc.pool().room() == 0 { wc.graduated = true; }
    let burn = got / 2; wc.raw_burn(burn); r.raider_pool = U128(r.raider_pool.0 + got - burn);
}
