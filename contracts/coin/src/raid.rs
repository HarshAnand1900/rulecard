//! Raids between two coin contracts made by the same factory (siblings trust each other because they run the same
//! fixed code). Each coin scores its own rounds; at the end the attacker asks the defender for its scores once,
//! decides the result, and the loser's pot pays the spoils, which the winner buys and burns.
//!
//! Timeline: signers back the raid (15 min) → the defender accepts automatically if its limits allow → Muster 30 min →
//! 3 rounds of 20 min with 5-min breaks. Round score = (100 + Buy + Crowd + Lock) × tactic.
//! Demo limit: raid plans are stored on-chain, and views hide them, but raw contract state is public.
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise, PromiseResult};

pub const RAID_BACK: u64 = 15 * MIN;
pub const MUSTER: u64 = 30 * MIN;
pub const ROUND: u64 = 20 * MIN;
pub const BREAK: u64 = 5 * MIN;
pub const RAID_LEN: u64 = MUSTER + 3 * ROUND + 2 * BREAK;
pub const RAID_SIGNERS: [u32; 4] = [0, 3, 5, 8];
pub const RAID_GAP: u64 = 8 * HOUR;
pub const SHIELD: u64 = 12 * HOUR;
pub const WAR_SHIELD: u64 = 6 * HOUR;
pub const ATTACK_GAP: u64 = 12 * HOUR;
pub const SPOILS_BPS: u128 = 1_500;
pub const WAR_COIN_BONUS_BPS: u128 = 500;
pub const DESERT_BPS: u128 = 300;
pub const RAID_WALLET_NEAR: i128 = 20 * GN as i128;
pub const SOLD_LIMIT_BPS: u128 = 9_000;
pub const RALLY: [u128; 3] = [10_500, 10_800, 11_000];
pub const CURSE: [u128; 3] = [9_500, 9_200, 9_000];
const GAS_CALL: Gas = Gas::from_tgas(40);
const GAS_BACK: Gas = Gas::from_tgas(60);

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct RaidResult { pub outcome: i8, pub rounds: Vec<i8>, pub mine: Vec<U128>, pub theirs: Vec<U128>, pub spoils: U128 }

/// phase: 0 backing (attacker) · 1 waiting for the defender · 2 on · 3 settling · 4 done · 5 cancelled
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Raid {
    pub seq: u32, pub id: u32, pub attacker: AccountId, pub defender: AccountId, pub attacking: bool,
    pub phase: u8, pub created: u64, pub backers: Vec<AccountId>, pub needed: u32,
    pub start: u64, pub real_start: U128, pub circ_start: U128, pub qualified: u32, pub level: u8, pub war: bool,
    pub net_pos: Vec<U128>, pub net_neg: Vec<U128>, pub taps: Vec<u32>, pub lock: Vec<U128>,
    pub votes: Vec<Vec<u32>>, pub planners: u32,
    pub result: Option<RaidResult>, pub note: String,
}

#[near(serializers = [json])]
pub struct RaidReport { pub base: Vec<U128>, pub tactic: Vec<u8>, pub war: bool }

#[near(serializers = [json])]
pub struct RaidView {
    pub seq: u32, pub id: u32, pub attacker: AccountId, pub defender: AccountId, pub attacking: bool, pub phase: u8,
    pub backers: u32, pub needed: u32, pub start: u64, pub muster_end: u64, pub end: u64, pub round: Option<u8>,
    pub live_base: Vec<U128>, pub buy: Vec<i64>, pub crowd: Vec<u32>, pub lock: Vec<u32>,
    /// revealed only for finished rounds: 0 none, else tactic*10 + tier (1 Rally, 2 Curse, 3 Ward; tier 0-2)
    pub tactic: Vec<u8>, pub planners: u32, pub result: Option<RaidResult>, pub note: String,
}

#[near]
impl Coin {
    /// Propose a raid on another coin from the same factory. Needs signers (3 / 5 / 8 at L2 / L3 / L4); no card, no Energy.
    pub fn start_raid(&mut self, target: AccountId) -> u32 {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        self.touch(now);
        require!(self.is_sibling(&target) && target != env::current_account_id(), "the target must be another Rulecard coin");
        require!(self.raid.is_none(), "a raid is already proposed or on");
        self.require_can_raid(now, true);
        let mut h = self.settle(&a, now);
        require!(self.is_qualified(&h, now), "raiders must hold >= 2 NEAR for 1h");
        require!(h.last_sign == 0 || now >= h.last_sign + crate::table::SIGN_EVERY, "one signature per 30 min");
        h.last_sign = now; self.save(&a, h);
        self.raid_seq += 1;
        let r = self.new_raid(self.raid_seq, self.raid_seq, env::current_account_id(), target.clone(), true, now, vec![a.clone()], RAID_SIGNERS[self.level as usize - 1]);
        self.raid = Some(r);
        events::rulecard("raid_proposed", json!({ "id": self.raid_seq, "target": target, "by": a }));
        self.raid_seq
    }

    pub fn sign_raid(&mut self) {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        let r = self.raid.as_ref().unwrap_or_else(|| env::panic_str("no raid"));
        require!(r.attacking && r.phase == 0 && now < r.created + RAID_BACK, "signing is closed");
        require!(!r.backers.contains(&a), "already signed");
        let mut h = self.settle(&a, now);
        require!(self.is_qualified(&h, now), "signers must hold >= 2 NEAR for 1h");
        require!(h.last_sign == 0 || now >= h.last_sign + crate::table::SIGN_EVERY, "one signature per 30 min");
        h.last_sign = now; self.pack_cut(&mut h, crate::cards::CUT_BACK); self.save(&a, h);
        self.raid.as_mut().unwrap().backers.push(a);
    }

    /// Once enough signers have signed, anyone sends the raid to the target. The target accepts if its limits allow.
    pub fn launch_raid(&mut self) -> near_sdk::PromiseOrValue<bool> {
        let now = env::block_timestamp_ms();
        let r = self.raid.clone().unwrap_or_else(|| env::panic_str("no raid"));
        require!(r.attacking && r.phase == 0, "nothing to launch");
        if (r.backers.len() as u32) < r.needed {
            require!(now >= r.created + RAID_BACK, "still gathering signers");
            self.end_raid(now, "not enough signers"); return near_sdk::PromiseOrValue::Value(false);
        }
        self.require_can_raid(now, true);
        self.raid.as_mut().unwrap().phase = 1;
        let args = json!({ "id": r.id, "level": self.level, "start": now, "war": self.has(Rule::WarCoin) }).to_string().into_bytes();
        Promise::new(r.defender.clone()).function_call("raid_accept".to_string(), args, NearToken::from_yoctonear(0), GAS_CALL)
            .then(Promise::new(env::current_account_id()).function_call("on_raid_accept".to_string(), json!({ "id": r.id, "start": now }).to_string().into_bytes(), NearToken::from_yoctonear(0), GAS_CALL))
            .into()
    }

    /// Called by the attacking coin. Returns whether this coin takes the raid (it can't decline if its limits allow).
    pub fn raid_accept(&mut self, id: u32, level: u8, start: u64, war: bool) -> bool {
        let now = env::block_timestamp_ms();
        let att = env::predecessor_account_id();
        require!(self.is_sibling(&att), "only Rulecard coins");
        self.touch(now);
        if self.level < level || self.level < 2 || self.raid_blocked(now, false).is_some() { return false; }
        self.raid_seq += 1;
        let mut r = self.new_raid(self.raid_seq, id, att.clone(), env::current_account_id(), false, now, vec![], 0);
        r.war = war || self.has(Rule::WarCoin);
        self.begin(&mut r, start);
        self.raid = Some(r);
        events::rulecard("raid_started", json!({ "attacker": att, "id": id, "start": start }));
        true
    }

    #[private]
    pub fn on_raid_accept(&mut self, id: u32, start: u64) -> bool {
        let now = env::block_timestamp_ms();
        let ok = matches!(env::promise_result(0), PromiseResult::Successful(v) if v == b"true");
        let Some(mut r) = self.raid.clone() else { return false };
        if r.id != id || r.phase != 1 { return false; }
        if !ok { self.end_raid(now, "the target is shielded, lower level, busy or near graduation"); return false; }
        r.war = r.war || self.has(Rule::WarCoin);
        self.begin(&mut r, start);
        self.last_attack = now;
        self.raid = Some(r);
        events::rulecard("raid_started", json!({ "defender": self.raid.as_ref().unwrap().defender, "id": id, "start": start }));
        true
    }

    /// Fill your raid plan: one tactic card (Rally, Curse, Ward) or nothing per round. Slots for rounds that haven't
    /// started can be changed; cards are held until the raid ends and only those matching your side's tactic are used.
    pub fn set_plan(&mut self, slots: Vec<Option<Card>>) {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        require!(slots.len() == 3, "3 slots");
        self.touch(now);
        let r = self.raid.clone().unwrap_or_else(|| env::panic_str("no raid on"));
        require!(r.phase == 2 && now < r.start + RAID_LEN, "no raid on");
        let mut h = self.settle(&a, now);
        require!(h.bal + self.locked_of(&h) > 0, "hold the coin to raid");
        self.join_raid(&mut h, &r);
        let mut votes = r.votes.clone();
        let was_planner = h.slots.iter().any(|s| *s != 0);
        for (i, s) in slots.iter().enumerate() {
            let code = match s { None => 0u8, Some(Card::Rally) => 1, Some(Card::Curse) => 2, Some(Card::Ward) => 3, _ => env::panic_str("only Rally, Curse or Ward") };
            if code == h.slots[i] { continue; }
            require!(now < round_start(&r, i), "that round has started");
            if h.slots[i] != 0 { votes[i][(h.slots[i] - 1) as usize] -= 1; let c = tactic_card(h.slots[i]); self.return_card(&mut h, c, 0); }
            if code != 0 { let c = tactic_card(code); self.take_card(&mut h, c, now); votes[i][(code - 1) as usize] += 1; }
            h.slots[i] = code;
        }
        let is_planner = h.slots.iter().any(|s| *s != 0);
        h.slots_filled = h.slots.iter().filter(|s| **s != 0).count() as u8;
        self.save(&a, h);
        let rr = self.raid.as_mut().unwrap(); rr.votes = votes;
        if is_planner && !was_planner { rr.planners += 1; } else if !is_planner && was_planner { rr.planners -= 1; }
    }

    /// One tap per round for qualified holders: adds to your side's Crowd score.
    pub fn battle_cry(&mut self) {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        let r = self.raid.clone().unwrap_or_else(|| env::panic_str("no raid on"));
        let rd = current_round(&r, now).unwrap_or_else(|| env::panic_str("no round is running"));
        let mut h = self.settle(&a, now);
        require!(self.is_qualified(&h, now), "hold >= 2 NEAR for 1h to Battle cry");
        self.join_raid(&mut h, &r);
        require!(h.cry & (1 << rd) == 0, "already cried this round");
        h.cry |= 1 << rd; self.save(&a, h);
        self.raid.as_mut().unwrap().taps[rd] += 1;
    }

    /// After the last round, anyone asks the defender for its scores and settles the raid.
    pub fn settle_raid(&mut self) -> Promise {
        let now = env::block_timestamp_ms();
        let r = self.raid.clone().unwrap_or_else(|| env::panic_str("no raid"));
        require!(r.attacking && r.phase == 2 && now >= r.start + RAID_LEN, "the raid isn't over");
        self.raid.as_mut().unwrap().phase = 3;
        Promise::new(r.defender.clone()).function_call("raid_report".to_string(), json!({ "id": r.id }).to_string().into_bytes(), NearToken::from_yoctonear(0), GAS_CALL)
            .then(Promise::new(env::current_account_id()).function_call("on_raid_report".to_string(), json!({ "id": r.id }).to_string().into_bytes(), NearToken::from_yoctonear(0), Gas::from_tgas(120)))
    }

    /// The defender's scores, asked for by its attacker once the raid is over.
    pub fn raid_report(&self, id: u32) -> RaidReport {
        let r = self.raid.as_ref().unwrap_or_else(|| env::panic_str("no raid"));
        require!(!r.attacking && r.id == id && env::predecessor_account_id() == r.attacker, "not your raid");
        require!(env::block_timestamp_ms() >= r.start + RAID_LEN, "the raid isn't over");
        RaidReport { base: (0..3).map(|i| U128(base_score(r, i) as u128)).collect(), tactic: (0..3).map(|i| tactic_code(&r.votes[i])).collect(), war: r.war }
    }

    #[private]
    pub fn on_raid_report(&mut self, id: u32) -> Option<Promise> {
        let now = env::block_timestamp_ms();
        let Some(r) = self.raid.clone() else { return None };
        if r.id != id || r.phase != 3 { return None; }
        let rep: Option<RaidReport> = match env::promise_result(0) { PromiseResult::Successful(v) => near_sdk::serde_json::from_slice(&v).ok(), _ => None };
        let Some(rep) = rep else { self.raid.as_mut().unwrap().phase = 2; return None; }; // try again later
        let mine_t: Vec<u8> = (0..3).map(|i| tactic_code(&r.votes[i])).collect();
        let (mine, theirs, rounds) = score_rounds(&(0..3).map(|i| base_score(&r, i) as u128).collect::<Vec<_>>(), &mine_t, &rep.base.iter().map(|b| b.0).collect::<Vec<_>>(), &rep.tactic);
        let won_r = rounds.iter().filter(|x| **x > 0).count(); let lost_r = rounds.iter().filter(|x| **x < 0).count();
        let (sm, st): (u128, u128) = (mine.iter().sum(), theirs.iter().sum());
        let outcome: i8 = if won_r > lost_r || (won_r == lost_r && sm > st) { 1 } else if lost_r > won_r || st > sm { -1 } else { 0 };
        let rate = SPOILS_BPS + if r.war || rep.war { WAR_COIN_BONUS_BPS } else { 0 };
        let mut spoils = 0u128;
        let mut p = Promise::new(r.defender.clone());
        let args = json!({ "id": id, "outcome": -outcome, "rate": rate as u32, "mine": theirs.iter().map(|x| U128(*x)).collect::<Vec<_>>(), "theirs": mine.iter().map(|x| U128(*x)).collect::<Vec<_>>() }).to_string().into_bytes();
        if outcome < 0 { spoils = bps(self.pot, rate); self.pot -= spoils; }
        p = p.function_call("raid_finish".to_string(), args, NearToken::from_yoctonear(spoils), GAS_BACK);
        self.record_result(now, RaidResult { outcome, rounds, mine: mine.into_iter().map(U128).collect(), theirs: theirs.into_iter().map(U128).collect(), spoils: U128(spoils) });
        Some(p)
    }

    /// The attacker tells the defender the result. If the defender lost, it sends the spoils from its pot;
    /// if it won, the attached spoils are bought and burned here.
    #[payable]
    pub fn raid_finish(&mut self, id: u32, outcome: i8, rate: u32, mine: Vec<U128>, theirs: Vec<U128>) {
        let now = env::block_timestamp_ms();
        let r = self.raid.clone().unwrap_or_else(|| env::panic_str("no raid"));
        require!(!r.attacking && r.id == id && env::predecessor_account_id() == r.attacker && r.phase == 2, "not your raid");
        let got = env::attached_deposit().as_yoctonear();
        let mut spoils = 0;
        if outcome < 0 {
            spoils = bps(self.pot, rate as u128); self.pot -= spoils;
            let _ = Promise::new(r.attacker.clone()).function_call("raid_spoils".to_string(), json!({ "id": id }).to_string().into_bytes(), NearToken::from_yoctonear(spoils), GAS_CALL);
        } else if got > 0 { self.spoils_burn(now, got); }
        let rounds = mine.iter().zip(theirs.iter()).map(|(a, b)| if a.0 > b.0 { 1 } else if a.0 < b.0 { -1 } else { 0 }).collect();
        self.record_result(now, RaidResult { outcome, rounds, mine, theirs, spoils: U128(if outcome < 0 { spoils } else { got }) });
    }

    /// Spoils sent by a defender that lost: bought and burned on this coin.
    #[payable]
    pub fn raid_spoils(&mut self, id: u32) {
        let now = env::block_timestamp_ms();
        let from = env::predecessor_account_id();
        let ok = self.raids.iter().any(|r| r.attacking && r.id == id && r.defender == from);
        require!(ok && self.is_sibling(&from), "unknown raid");
        let n = env::attached_deposit().as_yoctonear();
        if n > 0 { self.spoils_burn(now, n); }
        if let Some(r) = self.raids.iter_mut().rev().find(|r| r.attacking && r.id == id) { if let Some(res) = r.result.as_mut() { res.spoils = U128(n); } }
    }

    /// The 3-card raid-win pack, for wallets on the winning side that filled slots in at least 2 rounds.
    pub fn claim_raid_pack(&mut self) -> Vec<Card> {
        let now = env::block_timestamp_ms();
        let a = env::predecessor_account_id();
        let mut h = self.settle(&a, now);
        let seq = h.raid_seq;
        let r = self.raids.iter().find(|r| r.seq == seq).cloned().unwrap_or_else(|| env::panic_str("no finished raid for you"));
        require!(r.result.as_ref().map(|x| x.outcome > 0).unwrap_or(false), "your side didn't win");
        require!(h.slots_filled >= 2, "fill slots in at least 2 rounds to earn the win pack");
        require!(h.raid_pack != seq, "already claimed");
        let odds = WIN_ODDS[(r.level as usize).max(1) - 1];
        self.require_room(&h, &odds, 3, now);
        let mut got = vec![];
        for _ in 0..3 { let c = self.roll(&mut h, &odds, now); got.push(c); }
        h.raid_pack = seq;
        self.save(&a, h);
        got
    }

    pub fn get_raid(&self) -> Option<RaidView> { self.raid.as_ref().map(|r| self.raid_view(r)) }
    pub fn get_raids(&self) -> Vec<RaidView> { self.raids.iter().map(|r| self.raid_view(r)).collect() }
    /// Your own plan (hidden from views of other wallets).
    pub fn get_my_plan(&self, account_id: AccountId) -> Vec<u8> { self.holders.get(&account_id).filter(|h| self.raid.as_ref().map(|r| r.seq == h.raid_seq).unwrap_or(false)).map(|h| h.slots.to_vec()).unwrap_or_default() }
}

pub fn round_start(r: &Raid, i: usize) -> u64 { r.start + MUSTER + i as u64 * (ROUND + BREAK) }
pub fn current_round(r: &Raid, now: u64) -> Option<usize> {
    if r.phase != 2 { return None; }
    (0..3).find(|&i| now >= round_start(r, i) && now < round_start(r, i) + ROUND)
}
fn tactic_card(code: u8) -> Card { [Card::Rally, Card::Curse, Card::Ward][(code - 1) as usize] }

/// The side's tactic for a round: the card most wallets put there (min 3, ties = none). Returns tactic*10 + tier.
pub fn tactic_code(v: &[u32]) -> u8 {
    let m = *v.iter().max().unwrap_or(&0);
    if m < 3 || v.iter().filter(|x| **x == m).count() > 1 { return 0; }
    let t = v.iter().position(|x| *x == m).unwrap() as u8 + 1;
    let tier = if m >= 10 { 2 } else if m >= 6 { 1 } else { 0 };
    t * 10 + tier
}

/// Base score in hundredths: 100 + Buy (-12..+12) + Crowd (0..+6) + Lock (0..+6).
pub fn base_score(r: &Raid, i: usize) -> i64 {
    let real = r.real_start.0.max(GN) as i128;
    let net = r.net_pos[i].0 as i128 - r.net_neg[i].0 as i128;
    let buy = (net * 10_000 * 2 / real).clamp(-1_200, 1_200) as i64; // 0.5% of the curve's NEAR = 1 point
    let crowd = (r.taps[i] as i64 * 600 / r.qualified.max(r.taps[i]).max(1) as i64).min(600);
    let circ = r.circ_start.0.max(1);
    let lock = ((r.lock[i].0 * 10_000 * 2 / circ) as i64).min(600); // 0.5% of circulating = 1 point
    (10_000 + buy + crowd + lock).max(0)
}

/// Apply both sides' tactics. Rally ×1.05-1.10 (cancelled by a Curse); Curse ×0.95-0.90 on the enemy, turned back by a Ward.
pub fn score_rounds(my_base: &[u128], my_t: &[u8], their_base: &[u128], their_t: &[u8]) -> (Vec<u128>, Vec<u128>, Vec<i8>) {
    let mut a = vec![]; let mut b = vec![]; let mut rounds = vec![];
    for i in 0..3 {
        let (mut x, mut y) = (my_base[i], their_base[i]);
        let (mt, mtier) = (my_t[i] / 10, (my_t[i] % 10) as usize);
        let (tt, ttier) = (their_t[i] / 10, (their_t[i] % 10) as usize);
        if mt == 2 { if tt == 3 { x = bps(x, CURSE[mtier]); } else { y = bps(y, CURSE[mtier]); } }
        if tt == 2 { if mt == 3 { y = bps(y, CURSE[ttier]); } else { x = bps(x, CURSE[ttier]); } }
        if mt == 1 && tt != 2 { x = bps(x, RALLY[mtier]); }
        if tt == 1 && mt != 2 { y = bps(y, RALLY[ttier]); }
        rounds.push(if x > y { 1 } else if x < y { -1 } else { 0 });
        a.push(x); b.push(y);
    }
    (a, b, rounds)
}

impl Coin {
    fn new_raid(&self, seq: u32, id: u32, attacker: AccountId, defender: AccountId, attacking: bool, now: u64, backers: Vec<AccountId>, needed: u32) -> Raid {
        Raid { seq, id, attacker, defender, attacking, phase: if attacking { 0 } else { 2 }, created: now, backers, needed, start: 0,
            real_start: U128(0), circ_start: U128(0), qualified: 0, level: self.level, war: self.has(Rule::WarCoin),
            net_pos: vec![U128(0); 3], net_neg: vec![U128(0); 3], taps: vec![0; 3], lock: vec![U128(0); 3], votes: vec![vec![0; 3]; 3], planners: 0, result: None, note: String::new() }
    }

    /// Settings freeze when the raid starts.
    fn begin(&mut self, r: &mut Raid, start: u64) {
        let now = env::block_timestamp_ms();
        r.phase = 2; r.start = start; r.real_start = U128(self.real); r.circ_start = U128(self.circ);
        r.qualified = self.checkins.sum(now, 24) as u32; r.level = self.level;
        self.last_raid_start = start;
    }

    pub(crate) fn is_sibling(&self, a: &AccountId) -> bool {
        let me = env::current_account_id();
        let parent = me.as_str().split_once('.').map(|x| x.1).unwrap_or("");
        match a.as_str().split_once('.') { Some((head, rest)) => !head.is_empty() && rest == parent, None => false }
    }

    pub(crate) fn is_qualified(&self, h: &Holder, now: u64) -> bool {
        self.pool().value(h.bal + self.locked_of(h)) >= QUALIFIED_VALUE && h.since > 0 && now >= h.since + QUALIFIED_HOLD
    }

    /// Why this coin can't raid (or be raided) now, if it can't.
    fn raid_blocked(&self, now: u64, attacking: bool) -> Option<&'static str> {
        if self.graduated { return Some("graduated"); }
        if self.level < 2 { return Some("raids start at L2"); }
        if self.has(Rule::PeaceCoin) && self.level < 3 { return Some("Peace Coin: no raids before L3"); }
        if self.raid.as_ref().map(|r| r.phase < 4 && !(attacking && r.attacking && r.phase == 0)).unwrap_or(false) { return Some("already in a raid"); }
        if self.last_raid_start > 0 && now < self.last_raid_start + RAID_GAP { return Some("one raid per 8h"); }
        let shield = if self.has(Rule::WarCoin) { WAR_SHIELD } else { SHIELD };
        if !attacking && self.last_raid_end > 0 && now < self.last_raid_end + shield { return Some("shielded after its last raid"); }
        if attacking && self.last_attack > 0 && now < self.last_attack + ATTACK_GAP { return Some("one attack per 12h"); }
        if bps(CAP, SOLD_LIMIT_BPS) <= CAP - self.pool().room() { return Some("too close to graduation (90% sold)"); }
        None
    }
    fn require_can_raid(&self, now: u64, attacking: bool) { if let Some(why) = self.raid_blocked(now, attacking) { env::panic_str(why) } }

    /// Clears raids that can no longer finish (never launched, or never settled by the attacker).
    pub(crate) fn expire_raid(&mut self, now: u64) {
        let stale = match &self.raid {
            Some(r) if r.attacking && r.phase == 0 => now >= r.created + RAID_BACK + HOUR,
            Some(r) if r.phase == 2 && !r.attacking => now >= r.start + RAID_LEN + 6 * HOUR,
            _ => false,
        };
        if stale { self.end_raid(now, "expired"); self.last_raid_end = now; }
    }

    fn end_raid(&mut self, now: u64, note: &str) {
        if let Some(mut r) = self.raid.take() {
            r.phase = 5; r.note = note.into();
            self.raids.push(r); while self.raids.len() > 5 { self.raids.remove(0); }
        }
        let _ = now;
    }

    fn record_result(&mut self, now: u64, res: RaidResult) {
        let outcome = res.outcome;
        if let Some(mut r) = self.raid.take() {
            r.phase = 4; r.result = Some(res);
            events::rulecard("raid_result", json!({ "id": r.id, "attacker": r.attacker, "defender": r.defender, "me": env::current_account_id(), "outcome": outcome }));
            self.push_log(now, "raid", Some(if r.attacking { r.defender.clone() } else { r.attacker.clone() }), 0, 0, match outcome { 1 => "won", -1 => "lost", _ => "tie" });
            self.raids.push(r); while self.raids.len() > 5 { self.raids.remove(0); }
        }
        self.last_raid_end = now;
    }

    /// Spoils: bought from the curve and burned at once (outside the pot's daily cap).
    fn spoils_burn(&mut self, now: u64, near: u128) {
        if self.graduated { self.pot += near; return; }
        let (t, used) = self.with_pool(|p| p.buy(near));
        if used < near { self.pot += near - used; }
        let b = self.with_pool(|p| p.burn(t)); self.burned += b;
        let me = env::current_account_id();
        events::ft_burn(&me, b, "raid spoils");
        self.push_log(now, "burn", Some(me), b, used, "raid spoils");
        if self.pool().room() == 0 { self.graduate(now); }
    }

    /// Point a wallet at the current raid (and settle its cards from an older one first).
    fn join_raid(&mut self, h: &mut Holder, r: &Raid) {
        if h.raid_seq == r.seq { return; }
        self.settle_raid_cards(h);
        h.raid_seq = r.seq; h.slots = [0; 3]; h.slots_filled = 0; h.slots_done = false; h.cry = 0; h.r_round = 0; h.r_net = 0; h.r_lock_round = 0; h.r_lock = 0;
    }

    /// After a raid: cards that matched the side's tactic are used up, the rest go back to the hand.
    pub(crate) fn settle_raid_cards(&self, h: &mut Holder) {
        if h.slots_done || h.slots.iter().all(|s| *s == 0) { return; }
        if self.raid.as_ref().map(|r| r.seq == h.raid_seq).unwrap_or(false) { return; } // still on
        let r = self.raids.iter().find(|r| r.seq == h.raid_seq);
        for i in 0..3 {
            let s = h.slots[i]; if s == 0 { continue; }
            let used = r.map(|r| r.phase == 4 && tactic_code(&r.votes[i]) / 10 == s).unwrap_or(false);
            if !used { self.return_card(h, tactic_card(s), 0); }
        }
        h.slots_done = true;
    }

    /// Buys and sells during a round count toward Buy (each wallet at most 20 NEAR either way per round).
    pub(crate) fn raid_trade(&mut self, h: &mut Holder, now: u64, delta: i128) {
        let Some(r) = self.raid.clone() else { return };
        let Some(rd) = current_round(&r, now) else { return };
        self.join_raid(h, &r);
        if h.r_round != rd as u8 + 1 { h.r_round = rd as u8 + 1; h.r_net = 0; }
        let before = h.r_net.clamp(-RAID_WALLET_NEAR, RAID_WALLET_NEAR);
        h.r_net += delta;
        let after = h.r_net.clamp(-RAID_WALLET_NEAR, RAID_WALLET_NEAR);
        let d = after - before;
        let rr = self.raid.as_mut().unwrap();
        if d > 0 { rr.net_pos[rd] = U128(rr.net_pos[rd].0 + d as u128); } else if d < 0 { rr.net_neg[rd] = U128(rr.net_neg[rd].0 + (-d) as u128); }
    }

    /// Locks of 6h or more during a round count toward Lock (each wallet at most 0.5% of circulating supply).
    pub(crate) fn raid_lock(&mut self, h: &mut Holder, now: u64, amount: u128) {
        let Some(r) = self.raid.clone() else { return };
        let Some(rd) = current_round(&r, now) else { return };
        self.join_raid(h, &r);
        if h.r_lock_round != rd as u8 + 1 { h.r_lock_round = rd as u8 + 1; h.r_lock = 0; }
        let cap = r.circ_start.0 / 200;
        let add = amount.min(cap.saturating_sub(h.r_lock));
        h.r_lock += add;
        let rr = self.raid.as_mut().unwrap(); rr.lock[rd] = U128(rr.lock[rd].0 + add);
    }

    /// Selling while a raid is on pays +3%, to the pot.
    pub(crate) fn desert_fee(&self, out: u128, now: u64) -> u128 {
        match &self.raid { Some(r) if r.phase == 2 && now >= r.start && now < r.start + RAID_LEN => bps(out, DESERT_BPS), _ => 0 }
    }

    fn raid_view(&self, r: &Raid) -> RaidView {
        let now = env::block_timestamp_ms();
        RaidView {
            seq: r.seq, id: r.id, attacker: r.attacker.clone(), defender: r.defender.clone(), attacking: r.attacking, phase: r.phase,
            backers: r.backers.len() as u32, needed: r.needed, start: r.start, muster_end: r.start + MUSTER, end: r.start + RAID_LEN,
            round: current_round(r, now).map(|x| x as u8),
            live_base: (0..3).map(|i| U128(base_score(r, i) as u128)).collect(),
            buy: (0..3).map(|i| { let real = r.real_start.0.max(GN) as i128; ((r.net_pos[i].0 as i128 - r.net_neg[i].0 as i128) * 20_000 / real).clamp(-1_200, 1_200) as i64 }).collect(),
            crowd: r.taps.clone(), lock: (0..3).map(|i| ((r.lock[i].0 * 20_000 / r.circ_start.0.max(1)) as u32).min(600)).collect(),
            tactic: (0..3).map(|i| if r.phase >= 4 || now >= round_start(r, i) + ROUND { tactic_code(&r.votes[i]) } else { 0 }).collect(),
            planners: r.planners, result: r.result.clone(), note: r.note.clone(),
        }
    }
}
