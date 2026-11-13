//! Omens: the coin's luck layer. On every level 2+ coin there is one Omen window an hour long, every 3 hours (2h break).
//! The next Omen is rolled from the block's random seed by whoever first touches the coin within 15 minutes of its start
//! (any buy, gm, sell or poke), so it is announced before it begins. Omens use only systems the coin already has (Energy, the
//! pot, sells' fee path, packs): no new meter, nothing that loops over holders, nothing that can break the supply or solvency maths.
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near};

pub const OMEN_CYCLE: u64 = 3 * HOUR;
pub const OMEN_LEN: u64 = HOUR;
pub const OMEN_WARN: u64 = 15 * MIN;
pub const OMEN_MIN_LEVEL: u8 = 2;
pub const GHOST_EMBER_BPS: u128 = 300; // the pot burns 3% of itself
pub const THUNDER_BPS: u128 = 100; // sells pay 1% more, into the pot

pub const SQUALL_BPS: u128 = 100; // a mini Storm: 1% of unlocked bags
pub const BLOOD_WINDOW: u64 = 8 * HOUR;
/// 0 quiet, 1 Full Moon, 2 Thunder, 3 Ghost Ember, 4 Treasure, 5 Squall, 6 Oracle, 7 Iron Vault, 8 Windfall,
/// 9 Gold Rush, 10 Drought, 11 Low Tide, 12 Blood Moon, 13 Fog
pub const OMEN_NAMES: [&str; 14] = ["Quiet", "Full Moon", "Thunder", "Ghost Ember", "Treasure", "Squall", "Oracle", "Iron Vault", "Windfall", "Gold Rush", "Drought", "Low Tide", "Blood Moon", "Fog"];
pub const OMEN_TEXT: [&str; 14] = [
    "Nothing special this hour.",
    "Energy gains are doubled (gm and buying).",
    "Sells pay 1% more, and it goes to the pot.",
    "The pot burns 3% of itself at the first move of the hour.",
    "One lucky wallet that does a gm this hour gets a free pack, ready to open.",
    "A mini Storm: 1% of unlocked bags is hit when each wallet is next used. Half is burned, half goes to the Vault.",
    "The coin opens a Prophecy on itself: will it be a net buyer over 2h? With fewer than 8 wallets all bets are refunded.",
    "New Vault locks this hour get a x1.25 weight.",
    "The next Ember or Inferno that fires this hour spends 25% more from the pot.",
    "The next pack claimed this hour rolls Rare or better on its first card, if the deck has stock.",
    "Idle burn is doubled for this hour.",
    "Cards played this hour get half the backing and fuel time, so the crowd has to be quick.",
    "If this coin loses a raid that starts within 8h, the spoils it pays are doubled.",
    "Live raid scores are hidden this hour. With no raid on, locks get x1.25 weight like Iron Vault.",
];
/// Wild Omens (the coin acts on itself) and Weather Omens (the rules change), with their weights. Wild adds up to 40.
const WILD: [(u8, u64); 4] = [(3, 12), (5, 10), (4, 10), (6, 8)];
const WEATHER: [(u8, u64); 9] = [(1, 8), (7, 8), (8, 7), (2, 7), (9, 6), (10, 6), (11, 6), (12, 6), (13, 6)];

/// Pick an Omen from a random number: the group first (Wild 40%, 60% with the Wild Coin rule), then a weighted pick inside it.
pub fn roll_omen(r: u64, wild_pct: u64) -> u8 {
    let wild = r % 100 < wild_pct;
    let list: &[(u8, u64)] = if wild { &WILD } else { &WEATHER };
    let total: u64 = list.iter().map(|x| x.1).sum();
    let mut x = (r / 100) % total;
    for (k, w) in list { if x < *w { return *k; } x -= w; }
    list[0].0
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Omen {
    /// cycle number + 1 (0 = never rolled)
    pub cycle: u64,
    pub kind: u8,
    pub fired: bool,
    /// Gold Rush: the Rare+ pack has been given out
    pub used: bool,
    /// Treasure: the wallet doing this gm (1st, 2nd, ...) wins
    pub lucky: u32,
    pub gms: u32,
}

#[near(serializers = [json])]
pub struct OmenView {
    /// "none" | "incoming" | "active"
    pub phase: String,
    pub kind: u8,
    pub name: String,
    pub text: String,
    pub starts_at: u64,
    pub ends_at: u64,
    /// true when the next Omen could be rolled but nobody has touched the coin yet (any call, or `poke`, does it)
    pub needs_roll: bool,
}

#[near]
impl Coin {
    pub fn get_omen(&self) -> OmenView {
        let now = env::block_timestamp_ms();
        let o = &self.omen;
        let start = o.cycle.saturating_sub(1) * OMEN_CYCLE;
        let needs_roll = self.level >= OMEN_MIN_LEVEL && !self.graduated && o.cycle != (now + OMEN_WARN) / OMEN_CYCLE + 1 && (now + OMEN_WARN) % OMEN_CYCLE < OMEN_WARN + OMEN_LEN;
        let (phase, kind) = if o.cycle == 0 || o.kind == 0 { ("none", 0) }
            else if now < start { ("incoming", o.kind) }
            else if now < start + OMEN_LEN { ("active", o.kind) }
            else { ("none", 0) };
        OmenView { phase: phase.into(), kind, name: OMEN_NAMES[kind as usize].into(), text: OMEN_TEXT[kind as usize].into(), starts_at: start, ends_at: start + OMEN_LEN, needs_roll }
    }
}

impl Coin {
    /// The Omen running right now (0 if none).
    pub(crate) fn omen_now(&self, now: u64) -> u8 {
        if self.omen.cycle == 0 { return 0; }
        let start = (self.omen.cycle - 1) * OMEN_CYCLE;
        if now >= start && now < start + OMEN_LEN { self.omen.kind } else { 0 }
    }

    /// Roll the upcoming Omen if it hasn't been, and fire a Ghost Ember once its hour has started.
    pub(crate) fn touch_omen(&mut self, now: u64) {
        if self.level < OMEN_MIN_LEVEL || self.graduated { return; }
        let target = (now + OMEN_WARN) / OMEN_CYCLE; // the cycle that is running or about to start
        let into = (now + OMEN_WARN) % OMEN_CYCLE; // 0..15min = announcement window; up to 15min + 1h = still inside the hour
        if self.omen.cycle != target + 1 && into < OMEN_WARN + OMEN_LEN {
            let s = env::random_seed();
            let r = u64::from_le_bytes([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]]) % 100;
            let kind = roll_omen(u64::from_le_bytes([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]]), if self.has(Rule::WildCoin) { 60 } else { 40 });
            let _ = r;
            self.omen = Omen { cycle: target + 1, kind, fired: false, used: false, lucky: 1 + (s[8] % 4) as u32, gms: 0 };
            events::rulecard("omen", json!({ "kind": OMEN_NAMES[kind as usize], "starts_at": target * OMEN_CYCLE }));
            if kind != 0 { self.push_log(now, "omen", None, 0, 0, OMEN_NAMES[kind as usize]); }
        }
        let k = self.omen_now(now);
        if k != 0 && !self.omen.fired {
            self.omen.fired = true;
            match k {
                3 => {
                    let used = self.pot_burn(now, bps(self.pot, GHOST_EMBER_BPS), "Omen: Ghost Ember");
                    events::rulecard("omen_fired", json!({ "kind": "Ghost Ember", "pot_burn_near": U128(used) }));
                }
                5 => { self.squalls.push(now); if self.squalls.len() > 8 { self.squalls.remove(0); } events::rulecard("omen_fired", json!({ "kind": "Squall" })); }
                6 => self.omen_oracle(now),
                10 => { self.droughts.push(now); if self.droughts.len() > 8 { self.droughts.remove(0); } events::rulecard("omen_fired", json!({ "kind": "Drought" })); }
                12 => { self.blood_until = now + BLOOD_WINDOW; events::rulecard("omen_fired", json!({ "kind": "Blood Moon", "until": self.blood_until })); }
                _ => {}
            }
        }
    }
}

impl Coin {
    /// Oracle: the coin opens a Prophecy on itself ("will it be a net buyer over 2h?"), already in its betting window.
    /// The caster's usual 10% is burned, since the coin is the caster. With fewer than 8 wallets every bet is refunded.
    pub(crate) fn omen_oracle(&mut self, now: u64) {
        if self.table.iter().any(|p| p.phase < 3 && p.card == Card::Prophecy) { return; }
        let id = self.next_prop; self.next_prop += 1;
        let q = Question::Tide;
        let snap = self.snapshot(&q);
        self.table.push(Proposal {
            id, card: Card::Prophecy, proposer: env::current_account_id(), created: now, phase: 1, phase_end: now + BET_WINDOW,
            needed: 0, backers: vec![], card_exp: 0, chips: vec![], chip_total: U128(0), question: Some(q), snapshot: U128(snap), bets: vec![], result: String::new(), target: None,
        });
        events::rulecard("omen_fired", json!({ "kind": "Oracle", "id": id }));
        self.push_log(now, "omen", None, 0, 0, "Oracle: the coin opened a Prophecy");
    }

    /// Squall: apply every storm hit this wallet hasn't taken yet (1% of its unlocked bag, inside the one daily 8% cap).
    pub(crate) fn squall_due(&self, h: &mut Holder) -> u128 {
        let mut total = 0u128;
        for t in self.squalls.iter() {
            if *t <= h.squall_applied || h.bal == 0 || h.since == 0 || h.since > *t { continue; }
            let day = *t / DAY;
            if h.loss_day != day { h.loss_day = day; h.loss_base = h.bal; h.loss_used = 0; }
            let room = bps(h.loss_base, DAILY_LOSS_CAP_BPS).saturating_sub(h.loss_used);
            let amt = bps(h.bal, SQUALL_BPS).min(room);
            h.bal -= amt; h.loss_used += amt; total += amt;
        }
        if let Some(l) = self.squalls.last() { h.squall_applied = h.squall_applied.max(*l); }
        total
    }
}
