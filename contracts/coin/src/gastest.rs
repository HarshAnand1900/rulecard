//! Only compiled with `--features gastest` (a local sandbox build for measuring gas, never deployed to testnet or mainnet).
//! `gas_fill` puts the worst-case closable card on the coin so a single ordinary call has to close it.
use super::*;
use crate::table::{Bet, Proposal};
use crate::stakes::{Bounty, Pledge};

#[near]
impl Coin {
    /// kind: "prophecy" (n bettors, both sides), "blackhole" (n throws) or "bounty" (n pledges). All of them are due on the next call.
    pub fn gas_fill(&mut self, kind: String, n: u32) {
        let now = env::block_timestamp_ms();
        let who = |i: u32| -> AccountId { format!("w{}.{}", i, env::current_account_id()).parse().unwrap() };
        let amt = 1_000_000_000_000_000_000_000u128; // 1000 tokens each
        match kind.as_str() {
            "prophecy" | "blackhole" => {
                let bets: Vec<Bet> = (0..n).map(|i| Bet { account: who(i), yes: i % 2 == 0, amount: U128(amt), hedged: i % 5 == 0 }).collect();
                self.bets_held += amt * n as u128;
                let id = self.next_prop; self.next_prop += 1;
                let bh = kind == "blackhole";
                self.table.push(Proposal {
                    id, card: if bh { Card::BlackHole } else { Card::Prophecy }, proposer: who(999), created: now, phase: if bh { 1 } else { 2 }, phase_end: now,
                    needed: 0, backers: vec![], card_exp: 0, chips: vec![], chip_total: U128(0),
                    question: if bh { None } else { Some(Question::Tide) }, snapshot: U128(0), bets, result: String::new(), target: None,
                });
            }
            "stampede" | "inferno" | "ember" => {
                // n contributors (the contract caps this at 40) on a card that is due to fire
                let card = match kind.as_str() { "stampede" => Card::Stampede, "inferno" => Card::Inferno, _ => Card::Ember };
                let chips: Vec<crate::table::Chip> = (0..n).map(|i| crate::table::Chip { account: who(i), near: U128(200_000_000_000_000_000_000_000u128) }).collect();
                let total = 200_000_000_000_000_000_000_000u128 * n as u128;
                let id = self.next_prop; self.next_prop += 1;
                self.table.push(Proposal {
                    id, card, proposer: who(999), created: now, phase: 2, phase_end: now, needed: 0, backers: vec![who(999)], card_exp: 0,
                    chips, chip_total: U128(total), question: None, snapshot: U128(0), bets: vec![], result: String::new(), target: None,
                });
            }
            "bounty" => {
                let pledges: Vec<Pledge> = (0..n).map(|i| Pledge { account: who(i), amount: U128(amt) }).collect();
                self.bets_held += amt * n as u128;
                let id = self.next_bounty; self.next_bounty += 1;
                self.bounties.push(Bounty { id, sponsor: who(999), question: Question::Crowd { n: 3 }, snapshot: U128(0), created: now, end: now, pledges, total: U128(amt * n as u128), phase: 0, result: String::new() });
            }
            _ => env::panic_str("kind: prophecy, blackhole or bounty"),
        }
    }
}
