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

/// 0 quiet, 1 Full Moon, 2 Thunder, 3 Ghost Ember, 4 Treasure
pub const OMEN_NAMES: [&str; 5] = ["Quiet", "Full Moon", "Thunder", "Ghost Ember", "Treasure"];
pub const OMEN_TEXT: [&str; 5] = [
    "Nothing special this hour.",
    "Energy gains are doubled (gm and buying).",
    "Sells pay 1% more, and it goes to the pot.",
    "The pot burns 3% of itself at the first move of the hour.",
    "One lucky wallet that does a gm this hour gets a free pack, ready to open.",
];

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Omen {
    /// cycle number + 1 (0 = never rolled)
    pub cycle: u64,
    pub kind: u8,
    pub fired: bool,
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
            let kind = match r { 0..=24 => 1, 25..=44 => 2, 45..=64 => 3, 65..=84 => 4, _ => 0 };
            self.omen = Omen { cycle: target + 1, kind, fired: false, lucky: 1 + (s[8] % 4) as u32, gms: 0 };
            events::rulecard("omen", json!({ "kind": OMEN_NAMES[kind as usize], "starts_at": target * OMEN_CYCLE }));
            if kind != 0 { self.push_log(now, "omen", None, 0, 0, OMEN_NAMES[kind as usize]); }
        }
        if self.omen_now(now) == 3 && !self.omen.fired {
            self.omen.fired = true;
            let used = self.pot_burn(now, bps(self.pot, GHOST_EMBER_BPS), "Omen: Ghost Ember");
            events::rulecard("omen_fired", json!({ "kind": "Ghost Ember", "pot_burn_near": U128(used) }));
        }
    }
}
