use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const T0: u64 = 1_793_836_800_000; // 2026-11-05 00:00 UTC in ms

struct W { c: Rulecard, t: u64 }
fn acc(s: &str) -> AccountId { s.parse().unwrap() }
fn near(n: f64) -> u128 { (n * 1e6) as u128 * (ONE_NEAR / 1_000_000) }

impl W {
    fn new() -> Self { let mut w = W { c: { ctx("dev", 0, T0); Rulecard::new() }, t: T0 }; w.at("dev", 0); w }
    fn at(&mut self, who: &str, dep: u128) { ctx(who, dep, self.t); }
    fn wait(&mut self, ms: u64) { self.t += ms; }
    fn launch(&mut self, rules: Vec<Rule>) -> u32 { self.at("dev", 0); self.c.launch_coin("Test".into(), format!("T{}", self.c.next_coin), 100, rules) }
    fn buy(&mut self, who: &str, coin: u32, n: f64) -> u128 { self.at(who, near(n)); self.c.buy(coin, U128(0)).0 }
    fn sell(&mut self, who: &str, coin: u32, t: u128) -> u128 { self.at(who, 0); self.c.sell(coin, U128(t), U128(0)).0 }
    fn bal(&self, coin: u32, who: &str) -> u128 { self.c.holders.get(&hk(coin, &acc(who))).map(|h| h.bal.0).unwrap_or(0) }
    fn coin(&mut self, id: u32) -> Coin { self.at("dev", 0); self.c.crank(id); self.c.coins.get(&id).unwrap().clone() }
    fn give_card(&mut self, coin: u32, who: &str, card: CardType) -> U64 { self.c.mint_card(coin, &acc(who), card, false).unwrap().id }
    fn cast(&mut self, who: &str, id: U64, lock: Option<u8>) -> u32 { self.at(who, 0); self.c.cast(id, lock, None, None) }
    fn cast_at(&mut self, who: &str, id: U64, target: u32) -> u32 { self.at(who, 0); self.c.cast(id, None, None, Some(target)) }
    fn check(&mut self, who: &str, id: U64) -> Option<String> { self.at(who, 0); self.c.cast_check(acc(who), id, None) }
    fn grow(&mut self, rules: Vec<Rule>, n: f64) -> u32 {
        let id = self.launch(rules); for i in 0..8 { self.buy(&format!("u{i}"), id, n / 8.0); }
        for _ in 0..8 { self.wait(15 * MIN); self.coin(id); } id
    }
}
fn ctx(who: &str, dep: u128, t: u64) {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(acc(who)).signer_account_id(acc(who)).current_account_id(acc("rulecard"))
        .attached_deposit(NearToken::from_yoctonear(dep)).block_timestamp(t * 1_000_000).random_seed([7u8; 32]);
    testing_env!(b.build());
}
fn ledger_ok(w: &mut W, id: u32, accounts: &[&str]) {
    let c = w.coin(id); assert!(c.pool().solvent(), "insolvent");
    let mut held = 0u128; for a in accounts { if let Some(h) = w.c.holders.get(&hk(id, &acc(a))) { held += h.bal.0 + h.vest.iter().map(|v| v.0 .0).sum::<u128>(); } }
    let esc: u128 = c.effects.iter().filter(|e| !e.done || e.card == CardType::DiamondPool).map(|e| e.total.0).sum();
    assert!(held <= c.circ + 10, "tokens appeared from nowhere: held {held} circ {}", c.circ);
    assert!(held + esc + 10 >= c.circ.saturating_sub(c.effects.iter().map(|e| e.forfeit.0).sum::<u128>()), "tokens went missing");
}

#[test]
fn buy_sell_fee_and_solvency() {
    let mut w = W::new(); let id = w.launch(vec![]);
    let a = w.buy("u0", id, 10.0); w.buy("u1", id, 5.0);
    let c = w.coin(id); assert_eq!(c.pot, near(0.15)); assert!(c.pool().solvent());
    let out = w.sell("u0", id, a); let b = w.bal(id, "u1"); let out2 = w.sell("u1", id, b);
    assert!(out + out2 < near(15.0) - near(0.15), "round trip can't create NEAR"); assert!(w.coin(id).pool().solvent());
}

#[test]
#[should_panic(expected = "Launch Guard")]
fn launch_guard() { let mut w = W::new(); let id = w.launch(vec![Rule::LaunchGuard]); w.buy("u0", id, 0.6); w.buy("u0", id, 0.6); }

#[test]
#[should_panic(expected = "Vault Seal")]
fn vault_seal() { let mut w = W::new(); w.at("dev", ONE_NEAR); let id = w.c.launch_coin("V".into(), "VV".into(), 100, vec![Rule::VaultSeal]); let b = w.bal(id, "dev"); w.sell("dev", id, b); }

#[test]
fn paper_tax_charges_quick_flips() {
    let mut w = W::new(); let id = w.launch(vec![Rule::PaperTax]); w.buy("u1", id, 5.0);
    let t = w.buy("u0", id, 2.0); let p0 = w.coin(id).pot; w.sell("u0", id, t); let quick = w.coin(id).pot - p0;
    let t2 = w.buy("u0", id, 2.0); w.wait(20 * MIN); let p1 = w.coin(id).pot; w.sell("u0", id, t2); let slow = w.coin(id).pot - p1;
    assert!(quick > slow * 2, "quick {quick} slow {slow}");
}

#[test]
fn levels_and_drops() {
    let mut w = W::new(); let id = w.launch(vec![]);
    w.buy("u0", id, 2.0); w.wait(2 * HOUR);
    w.buy("u1", id, 25.0); // crosses L2 and L3
    w.wait(10 * MIN); assert_eq!(w.coin(id).level, 1);
    w.wait(6 * MIN); assert_eq!(w.coin(id).level, 2);
    w.wait(16 * MIN); w.coin(id); w.wait(16 * MIN); assert_eq!(w.coin(id).level, 3);
    w.at("u0", 0); let n = w.c.claim_level_drop(id, 3).unwrap(); assert!(n.tier.unwrap() >= Tier::Rare);
    w.at("u1", 0); let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { w.c.claim_level_drop(id, 3); })); assert!(r.is_err());
}

#[test]
fn casting_limits() {
    let mut w = W::new(); let id = w.launch(vec![]); w.buy("u0", id, 3.0);
    let tax = w.give_card(id, "u0", CardType::TaxHoliday); let sb = w.give_card(id, "u0", CardType::SlowBurn);
    assert!(w.check("u0", tax).unwrap().contains("held 1h"));
    w.wait(HOUR + MIN);
    assert!(w.check("u0", sb).unwrap().contains("level 2"));
    w.cast("u0", tax, None); assert_eq!(w.coin(id).fee_bps(w.t), 0);
    let rc = w.give_card(id, "u0", CardType::RollCall); assert!(w.check("u0", rc).unwrap().contains("30 minutes"));
    let curse = w.give_card(id, "u0", CardType::Curse); assert!(w.check("u0", curse).is_some(), "tactics need a level-2 coin in a raid");
    assert!(w.c.nfts.get(&tax.0).is_none(), "played card burns");
}

#[test]
fn inferno_drips_lifts_price_locks_caster_and_respects_caps() {
    let mut w = W::new(); let id = w.grow(vec![], 40.0);
    w.buy("u3", id, 30.0); let half = w.bal(id, "u3") / 2; w.sell("u3", id, half); w.wait(HOUR + MIN);
    let c0 = w.coin(id); let p0 = c0.price();
    let mut c = c0.clone(); c.ult_m = 100_000; w.c.coins.insert(id, c);
    let card = w.give_card(id, "u0", CardType::Inferno); let fx = w.cast("u0", card, None);
    w.at("u0", 0); assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { w.c.sell(id, U128(1000 * TOKEN), U128(0)); })).is_err());
    for _ in 0..14 { w.wait(5 * MIN); w.coin(id); }
    let c = w.coin(id); let e = c.effects.iter().find(|e| e.id == fx).unwrap();
    assert_eq!(e.chunks_done, 12); assert!(e.burned.0 > 0); assert!(c.price() > p0); assert!(c.pool().solvent());
    assert!(c.caps_burned <= (c.circ + c.caps_burned) / 20 + 1);
}

#[test]
fn happy_hour_bonus_vests_and_burns_if_sold_early() {
    let mut w = W::new(); let id = w.grow(vec![], 25.0);
    let card = w.give_card(id, "u0", CardType::HappyHour); w.cast("u0", card, None); w.wait(3 * MIN);
    w.buy("u5", id, 2.0); assert_eq!(w.c.holders.get(&hk(id, &acc("u5"))).unwrap().vest.len(), 1);
    let b0 = w.coin(id).burned; let bal = w.bal(id, "u5"); w.sell("u5", id, bal / 2); assert!(w.coin(id).burned > b0);
    w.buy("u6", id, 2.0); let b6 = w.bal(id, "u6"); w.wait(7 * HOUR); w.at("u6", 0); w.c.check_in(id); assert!(w.bal(id, "u6") > b6);
}

#[test]
fn diamond_pool_penalty_goes_to_stayers() {
    let mut w = W::new(); let id = w.grow(vec![], 25.0);
    let card = w.give_card(id, "u0", CardType::DiamondPool); let fx = w.cast("u0", card, Some(1)); w.wait(3 * MIN);
    let a = w.bal(id, "u1") / 2; let b = w.bal(id, "u2") / 2;
    w.at("u1", 0); w.c.join_diamond(id, fx, U128(a)); w.at("u2", 0); w.c.join_diamond(id, fx, U128(b));
    let b2 = w.bal(id, "u2"); w.at("u1", 0); w.c.leave_diamond(id, fx);
    w.wait(2 * HOUR + 5 * MIN); w.at("u2", 0); let got = w.c.claim_diamond(id, fx).0;
    assert_eq!(got, b + (a / 5 - a / 5 / 2)); assert_eq!(w.bal(id, "u2"), b2 + got);
}

#[test]
fn black_hole_burns_everything_thrown_in() {
    let mut w = W::new(); let id = w.grow(vec![], 30.0);
    let mut c = w.coin(id); c.ult_m = 100_000; w.c.coins.insert(id, c);
    let card = w.give_card(id, "u0", CardType::BlackHole); let fx = w.cast("u0", card, None); w.wait(6 * MIN);
    w.at("u1", 0); w.c.feed_black_hole(id, fx, U128(1_000_000 * TOKEN)); w.at("u2", 0); w.c.feed_black_hole(id, fx, U128(2_000_000 * TOKEN));
    let b0 = w.coin(id).burned; let p0 = w.coin(id).price(); w.wait(HOUR);
    let c = w.coin(id); assert_eq!(c.burned - b0, 3_000_000 * TOKEN); assert!(c.price() > p0); assert!(c.pool().solvent());
    assert!(w.c.nfts_for_owner(acc("u1")).iter().any(|n| n.title == "Black Hole contributor"));
}

#[test]
fn hold_the_line_register_sell_claim() {
    let mut w = W::new(); let id = w.grow(vec![Rule::HoldTheLine], 40.0);
    w.buy("u7", id, 25.0); w.wait(2 * HOUR); w.coin(id);
    let all = w.bal(id, "u7"); w.sell("u7", id, all);
    let c = w.coin(id); assert!(c.htl.is_some(), "drop should trigger Hold the Line"); let start = c.htl.as_ref().unwrap().start;
    w.at("u2", 0); w.c.htl_register(id); w.at("u1", 0); w.c.htl_register(id);
    let b1 = w.bal(id, "u1"); w.sell("u1", id, b1 / 3); // sells after registering: out, pays the toll
    assert!(w.coin(id).prize_pot > 0);
    w.wait(6 * HOUR + MIN); assert!(w.coin(id).htl.is_none());
    w.at("u2", 0); let paid = w.c.htl_claim(id, start).0; assert!(paid > 0);
    w.at("u1", 0); assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { w.c.htl_claim(id, start); })).is_err());
}

#[test]
fn craft_sacrifice_and_soulbound() {
    let mut w = W::new(); let id = w.grow(vec![], 25.0);
    let ids: Vec<U64> = [CardType::TaxHoliday, CardType::RollCall, CardType::Rebrand].iter().map(|c| w.give_card(id, "u0", *c)).collect();
    w.at("u0", 0); let r = w.c.craft(ids.clone(), CardType::SlowBurn).unwrap(); assert_eq!(r.tier, Some(Tier::Rare));
    let circ = w.coin(id).circ; w.at("u1", 0); let n = w.c.sacrifice(id, U128(circ * 3 / 1000), CardType::HappyHour).unwrap(); assert_eq!(n.tier, Some(Tier::Rare));
    let common = w.give_card(id, "u1", CardType::TaxHoliday);
    w.at("u1", 0); assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { w.c.nft_transfer(acc("u2"), common); })).is_err());
    w.at("u1", 0); w.c.nft_transfer(acc("u2"), n.id); assert_eq!(w.c.nfts.get(&n.id.0).unwrap().owner, acc("u2"));
}

#[test]
fn fuzz_random_play_keeps_the_money_safe() {
    for seed in 1..=4u64 {
      // the mocked chain is thread-local: a thread per seed gives each run clean storage
      std::thread::spawn(move || {
        let users = ["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7"];
        let mut w = W::new(); let id = w.launch(vec![Rule::HoldTheLine, Rule::PaperTax]);
        let mut r = seed * 2654435761;
        let mut rnd = move || { r ^= r << 13; r ^= r >> 7; r ^= r << 17; r };
        let cards = [CardType::TaxHoliday, CardType::RollCall, CardType::Rebrand, CardType::SlowBurn, CardType::HappyHour, CardType::DiamondPool, CardType::Inferno, CardType::BlackHole];
        for i in 0..600 {
            let u = users[(rnd() % 8) as usize]; let k = rnd() % 100;
            let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                if k < 30 { w.buy(u, id, 0.05 + (rnd() % 400) as f64 / 100.0); }
                else if k < 50 { let b = w.bal(id, u); if b > 0 { w.sell(u, id, b / (1 + rnd() as u128 % 4)); } }
                else if k < 58 { w.at(u, 0); w.c.check_in(id); }
                else if k < 66 { let card = w.give_card(id, u, cards[(rnd() % 8) as usize]); let mut c = w.coin(id); c.ult_m = 100_000; w.c.coins.insert(id, c); w.cast(u, card, Some(1)); }
                else if k < 74 { let c = w.coin(id); let b = w.bal(id, u) / 3; if let Some(e) = c.effects.iter().find(|e| !e.done) {
                    w.at(u, 0); match e.card { CardType::DiamondPool => w.c.join_diamond(id, e.id, U128(b)), CardType::BlackHole => w.c.feed_black_hole(id, e.id, U128(b)), _ => {} } } }
                else if k < 78 { let c = w.coin(id); if let Some(e) = c.effects.iter().find(|e| e.card == CardType::DiamondPool) { w.at(u, 0); let _ = w.c.leave_diamond(id, e.id); } }
                else if k < 82 { let c = w.coin(id); if let Some(e) = c.effects.iter().find(|e| e.card == CardType::DiamondPool) { w.at(u, 0); w.c.claim_diamond(id, e.id); } }
                else if k < 86 { w.at(u, 0); w.c.htl_register(id); }
                else { w.wait((rnd() % 90) * MIN); }
            }));
            let _ = res; // rejected actions are fine; broken money is not
            let c = w.coin(id); let held: u128 = users.iter().filter_map(|a| w.c.holders.get(&hk(id, &acc(a)))).map(|h| h.bal.0 + h.vest.iter().map(|v| v.0 .0).sum::<u128>()).sum();
            assert!(held <= c.circ + 10, "seed {seed} step {i} action {k} user {u}: held {held} > circ {}", c.circ);
            if i % 25 == 0 { ledger_ok(&mut w, id, &users); }
        }
        w.wait(3 * DAY); ledger_ok(&mut w, id, &users);
      }).join().expect("fuzz seed failed");
    }
}

// ----------------------------------------------------------------- raids
fn two_coins(w: &mut W, near_each: f64) -> (u32, u32) {
    let a = w.launch(vec![]); for i in 0..4 { w.buy(&format!("u{i}"), a, near_each); }
    let b = w.launch(vec![]); for i in 4..8 { w.buy(&format!("u{i}"), b, near_each); }
    for _ in 0..10 { w.wait(15 * MIN); w.coin(a); w.coin(b); }
    (a, b)
}
fn crank_raid(w: &mut W, coin: u32) { w.at("dev", 0); w.c.crank(coin); }
fn raid_of(w: &W, coin: u32) -> Option<u32> { w.c.coins.get(&coin).unwrap().raid }

#[test]
fn friendly_raid_end_to_end() {
    let mut w = W::new(); let (a, b) = two_coins(&mut w, 3.0);
    assert!(w.coin(a).level >= 2 && w.coin(b).level >= 2);
    let card = w.give_card(a, "u0", CardType::FriendlyRaid); w.cast_at("u0", card, b);
    let rid = raid_of(&w, a).unwrap(); assert_eq!(raid_of(&w, b), Some(rid));
    w.wait(MIN); w.at("u4", 0); w.c.raid_accept(rid);
    w.at("u1", 0); w.c.raid_stake(rid, a, U128(1_000_000 * TOKEN));
    w.at("u5", 0); w.c.raid_stake(rid, b, U128(2_000_000 * TOKEN));
    w.at("u5", 0); assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { w.c.raid_stake(rid, a, U128(TOKEN)); })).is_err(), "can't back both sides");
    let mut c = w.coin(a); c.spark_m = 30_000; w.c.coins.insert(a, c);
    let rally = w.give_card(a, "u2", CardType::Rally); w.cast("u2", rally, None);
    let ward = w.give_card(a, "u3", CardType::Ward); assert!(w.check("u3", ward).unwrap().contains("already played"));
    w.buy("u3", a, 3.0); // APE out-raises the other side
    let b_burn = w.coin(b).burned;
    for _ in 0..5 { w.wait(30 * MIN); crank_raid(&mut w, a); }
    let r = w.c.get_raid(rid).unwrap(); assert_eq!(r.status, RaidStatus::Done); assert_eq!(r.winner, Some(0));
    assert_eq!(w.coin(b).burned - b_burn, 600_000 * TOKEN); assert!(w.coin(b).pool().solvent());
    assert_eq!(raid_of(&w, a), None);
    let b1 = w.bal(a, "u1"); w.at("u1", 0); assert_eq!(w.c.raid_claim(rid).0, 1_000_000 * TOKEN); assert_eq!(w.bal(a, "u1"), b1 + 1_000_000 * TOKEN);
    assert!(w.c.nfts_for_owner(acc("u1")).iter().any(|n| n.title == "Raid MVP"));
    w.at("u5", 0); assert_eq!(w.c.raid_claim(rid).0, 1_400_000 * TOKEN);
    w.at("u5", 0); assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { w.c.raid_claim(rid); })).is_err(), "no double claim");
}

#[test]
fn hard_raid_spoils_buy_and_burn_the_winner() {
    let mut w = W::new(); let (a, b) = two_coins(&mut w, 6.0);
    assert!(w.coin(a).level >= 3 && w.coin(b).level >= 3);
    let mut c = w.coin(a); c.ult_m = 100_000; w.c.coins.insert(a, c);
    let card = w.give_card(a, "u0", CardType::HardRaid); w.cast_at("u0", card, b); let rid = raid_of(&w, a).unwrap();
    w.at("u4", 0); w.c.raid_accept(rid);
    w.at("u1", 0); w.c.raid_stake(rid, a, U128(1_000_000 * TOKEN));
    w.at("u5", 0); w.c.raid_stake(rid, b, U128(4_000_000 * TOKEN));
    w.buy("u3", a, 4.0);
    let a_burn = w.coin(a).burned; let a_real = w.coin(a).real; let b_real = w.coin(b).real;
    for _ in 0..5 { w.wait(30 * MIN); crank_raid(&mut w, a); }
    assert_eq!(w.c.get_raid(rid).unwrap().status, RaidStatus::Settling);
    assert_eq!(w.c.get_coin(b).unwrap().banner_of, Some(a));
    for _ in 0..14 { w.wait(5 * MIN); crank_raid(&mut w, a); }
    let r = w.c.get_raid(rid).unwrap(); assert_eq!(r.status, RaidStatus::Done);
    let (ca, cb) = (w.coin(a), w.coin(b));
    assert!(ca.burned > a_burn); assert!(ca.real > a_real); assert!(cb.real < b_real);
    assert!(ca.pool().solvent() && cb.pool().solvent());
    w.at("u1", 0); assert!(w.c.raid_claim(rid).0 > 1_000_000 * TOKEN, "winner gets stake + spoils");
    w.at("u5", 0); assert_eq!(w.c.raid_claim(rid).0, 2_000_000 * TOKEN, "loser gets half back");
}

#[test]
fn unaccepted_raid_returns_the_card() {
    let mut w = W::new(); let (a, b) = two_coins(&mut w, 3.0);
    let card = w.give_card(a, "u0", CardType::FriendlyRaid); w.cast_at("u0", card, b); let rid = raid_of(&w, a).unwrap();
    assert!(w.c.nfts.get(&card.0).is_none());
    w.wait(20 * MIN); crank_raid(&mut w, a);
    assert_eq!(w.c.get_raid(rid).unwrap().status, RaidStatus::Expired); assert_eq!(raid_of(&w, a), None); assert_eq!(raid_of(&w, b), None);
    assert!(w.c.nfts_for_owner(acc("u0")).iter().any(|n| n.card == Some(CardType::FriendlyRaid)));
}

#[test]
fn tactic_triangle_has_no_dominant_card() {
    use CardType::*;
    let t = [Rally, Curse, Ward];
    for me in t { let wins = t.iter().filter(|&&op| tactic_ppm(Some(me), Some(op)) > tactic_ppm(Some(op), Some(me))).count();
        let loses = t.iter().filter(|&&op| tactic_ppm(Some(me), Some(op)) < tactic_ppm(Some(op), Some(me))).count(); assert_eq!((wins, loses), (1, 1), "{:?}", me); }
}
