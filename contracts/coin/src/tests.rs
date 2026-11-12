use crate::*;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const T0: u64 = 1_800_000_000_000; // ms, a fixed start time

fn ctx(who: usize, deposit: u128, ms: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id("frog.rulecard.testnet".parse().unwrap())
        .predecessor_account_id(acc(who))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(10_000_000)) // the mock contract can pay out any sell
        .block_timestamp(ms * 1_000_000)
        .prepaid_gas(near_sdk::Gas::from_tgas(300));
    testing_env!(b.build());
}
fn acc(i: usize) -> AccountId { if i < 6 { accounts(i) } else { format!("user{i}.testnet").parse().unwrap() } }
fn n(x: u128) -> u128 { x * GN }
/// Equal within one part in a billion (Vault shares round down).
fn close(a: u128, b: u128) -> bool { a.abs_diff(b) <= b / 1_000_000_000 + 2 }

fn launch(rules: Vec<Rule>) -> Coin {
    ctx(0, n(20), T0);
    Coin::new("Frog".into(), "FROG".into(), None, acc(0), "protocol.testnet".parse().unwrap(), rules)
}
fn buy(c: &mut Coin, who: usize, near: u128, ms: u64) -> u128 { ctx(who, near, ms); c.buy(None).0 }
fn bal(c: &Coin, who: usize) -> u128 { c.ft_balance_of(acc(who)).0 }

/// Every token is somewhere: holders + the contract = total supply.
fn check_supply(c: &mut Coin, holders: &[usize], ms: u64) {
    for &h in holders { ctx(h, 0, ms); let _ = c.claim_vault(); }
    let held: u128 = holders.iter().map(|&h| bal(c, h)).sum(); // locked tokens sit in the contract's balance
    let total = held + c.contract_balance();
    let supply = c.ft_total_supply().0;
    assert!(total.abs_diff(supply) <= holders.len() as u128 * 10, "supply {supply} vs found {total}");
    assert!(c.pool().solvent(), "curve not fully backed");
}

#[test]
fn launch_mints_full_supply_and_has_no_admin() {
    let c = launch(vec![Rule::PaperTax]);
    assert_eq!(c.ft_total_supply().0, SUPPLY);
    assert_eq!(c.ft_balance_of("frog.rulecard.testnet".parse().unwrap()).0, SUPPLY);
    let p = c.get_params();
    assert!(p.admin.is_none());
    assert_eq!(p.params.seed.0, n(20));
    assert_eq!(c.get_coin().pot.0, n(20));
    assert_eq!(c.ft_metadata().decimals, 18);
}

#[test]
#[should_panic(expected = "seed must be 5 to 100 NEAR")]
fn seed_below_minimum_fails() {
    ctx(0, n(4), T0);
    let _ = Coin::new("Frog".into(), "FROG".into(), None, acc(0), "protocol.testnet".parse().unwrap(), vec![]);
}

#[test]
#[should_panic(expected = "Paper Tax and Soft Tax can't combine")]
fn paper_and_soft_tax_dont_combine() { let _ = launch(vec![Rule::PaperTax, Rule::SoftTax]); }

#[test]
fn buy_and_sell_split_fees_and_stay_solvent() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(10), T0 + 1000);
    assert!(t > 0);
    let net = n(10) - STORAGE_COST;
    let fee = bps(net, FEE_BPS);
    assert_eq!(c.protocol_owed, bps(net, FEE_BPS) * 30 / 200);
    assert_eq!(c.escrow, fee * 20 / 200);
    assert_eq!(c.pot, n(20) + fee - fee * 30 / 200 - fee * 20 / 200);
    check_supply(&mut c, &[1], T0 + 2000);
    ctx(1, 1, T0 + 3000);
    let out = c.sell(U128(t), None).0;
    assert!(out < net, "a round trip can't profit");
    assert!(out > net * 95 / 100, "round trip costs about 4% in fees");
    assert_eq!(bal(&c, 1), 0);
    assert!(c.pool().solvent());
}

#[test]
fn transfers_need_registration_and_move_tokens() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(5), T0 + 1000);
    ctx(2, STORAGE_COST, T0 + 2000); c.storage_deposit(None, None);
    ctx(1, 1, T0 + 3000); c.ft_transfer(acc(2), U128(t / 4), None);
    assert_eq!(bal(&c, 2), t / 4);
    assert_eq!(bal(&c, 1), t - t / 4);
    check_supply(&mut c, &[1, 2], T0 + 4000);
}

#[test]
#[should_panic(expected = "receiver is not registered")]
fn transfer_to_unregistered_fails() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(5), T0 + 1000);
    ctx(1, 1, T0 + 2000); c.ft_transfer(acc(3), U128(t), None);
}

#[test]
fn idle_burn_starts_after_12h_and_respects_the_daily_cap() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(10), T0);
    // 12h grace + first 6h tick = 18h
    assert_eq!(c.ft_balance_of(acc(1)).0, t, "nothing burns in the grace time");
    ctx(1, 0, T0 + 18 * HOUR - 1); assert_eq!(bal(&c, 1), t);
    ctx(1, 0, T0 + 18 * HOUR); assert_eq!(bal(&c, 1), t - t / 100, "1% after 18h");
    // ten days away: at most 8% a day, and roughly 4% a day (4 ticks of 1%)
    ctx(1, 0, T0 + 10 * DAY);
    let left = bal(&c, 1);
    assert!(left < t * 75 / 100 && left > t * 60 / 100, "left {}%", left * 100 / t);
    check_supply(&mut c, &[1], T0 + 10 * DAY);
    assert!(c.burned > 0);
}

#[test]
fn vault_tokens_are_safe_and_earn_half_of_idle_burn() {
    let mut c = launch(vec![]);
    let a = buy(&mut c, 1, n(10), T0);
    let b = buy(&mut c, 2, n(10), T0);
    ctx(1, 1, T0 + 1000); c.lock(U128(a), 72);
    // wallet 2 goes idle for 2 days, wallet 1 is fully locked
    let later = T0 + 2 * DAY;
    ctx(2, 0, later); let _ = c.claim_vault(); // settles wallet 2's idle burn
    let lost = b - bal(&c, 2);
    assert!(lost > 0);
    let v = c.get_holder(acc(1)).unwrap();
    assert_eq!(v.locked.0, a, "locked tokens never burn");
    assert!(close(v.vault_earned.0, lost / 2), "the Vault gets half: {} vs {}", v.vault_earned.0, lost / 2);
    ctx(1, 0, T0 + 73 * HOUR);
    let got = c.unlock(0).0;
    assert!(close(got, a + lost / 2));
    check_supply(&mut c, &[1, 2], T0 + 73 * HOUR);
}

#[test]
fn leaving_the_vault_early_costs_20_percent() {
    let mut c = launch(vec![]);
    let a = buy(&mut c, 1, n(10), T0);
    let b = buy(&mut c, 2, n(10), T0);
    ctx(1, 1, T0 + 1000); c.lock(U128(a), 24);
    ctx(2, 1, T0 + 1000); c.lock(U128(b), 24);
    ctx(1, 1, T0 + HOUR); let back = c.leave_early(0).0;
    assert_eq!(back, a - a / 5);
    let v = c.get_holder(acc(2)).unwrap();
    assert!(close(v.vault_earned.0, a / 10), "half the penalty goes to the stayers");
    check_supply(&mut c, &[1, 2], T0 + HOUR);
}

#[test]
fn gm_resets_the_idle_clock_and_is_once_per_6h() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(10), T0);
    ctx(1, 0, T0 + 11 * HOUR); c.gm();
    assert_eq!(c.energy, 1);
    ctx(1, 0, T0 + 11 * HOUR + 18 * HOUR - 1); assert_eq!(bal(&c, 1), t, "the clock restarted at the gm");
    ctx(1, 0, T0 + 17 * HOUR); c.gm();
    assert_eq!(c.energy, 2);
}

#[test]
#[should_panic(expected = "gm once every 6h")]
fn gm_twice_in_6h_fails() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0);
    ctx(1, 0, T0 + HOUR); c.gm();
    ctx(1, 0, T0 + 2 * HOUR); c.gm();
}

#[test]
fn ritual_made_burns_from_the_pot() {
    let mut c = launch(vec![]);
    let day0 = T0 / DAY * DAY + DAY; // start of the next UTC day
    let mut ids = vec![];
    for i in 1..=10 { buy(&mut c, i, n(5) + STORAGE_COST, day0 + i as u64 * 1000); ids.push(i); }
    for i in 1..=10 { ctx(i, 0, day0 + HOUR); c.gm(); }
    ctx(1, 1, day0 + 2 * HOUR); let half = bal(&c, 1) / 2; c.lock(U128(half), 24);
    ctx(2, 1, day0 + 2 * HOUR); let b2 = bal(&c, 2); c.lock(U128(b2), 24);
    ctx(3, 1, day0 + 2 * HOUR); let b3 = bal(&c, 3); c.lock(U128(b3), 24);
    assert!(c.ritual.lock_near.0 >= RITUAL_LOCK_MIN, "locked {}", c.ritual.lock_near.0 / GN);
    let pot = c.pot; let burned = c.burned;
    ctx(5, 0, day0 + DAY + 1); c.poke();
    assert_eq!(c.ritual.last_made, Some(true));
    assert!(c.pot < pot && c.burned > burned, "pot burned on a made Ritual");
    assert_eq!(c.ritual.streak, 1);
    check_supply(&mut c, &ids, day0 + DAY + 2);
}

#[test]
fn ritual_missed_doubles_idle_burn_for_6h() {
    let mut c = launch(vec![]);
    let day0 = T0 / DAY * DAY + DAY;
    let t = buy(&mut c, 1, n(10), day0 - 13 * HOUR); // grace ends at day0 - 1h; ticks at day0+5h, day0+11h ...
    ctx(2, 0, day0 + 1); c.poke(); // settles the previous day: missed
    assert_eq!(c.ritual.last_made, Some(false));
    // tick at day0 + 5h is inside the 6h double window: 2% instead of 1%
    ctx(1, 0, day0 + 5 * HOUR);
    assert_eq!(bal(&c, 1), t - t * 2 / 100);
    ctx(1, 0, day0 + 11 * HOUR);
    let b = t - t * 2 / 100; assert_eq!(bal(&c, 1), b - b / 100, "back to 1% after the window");
}

#[test]
fn level_two_after_rules_hold_for_15_min() {
    let mut c = launch(vec![]);
    let mut ids = vec![];
    for i in 1..=16 { buy(&mut c, i, n(60), T0 + 40 * MIN + i as u64 * 1000); ids.push(i); }
    assert_eq!(c.level, 1);
    for i in 1..=16 { ctx(i, 0, T0 + 2 * HOUR); c.gm(); }
    let lp = c.get_level_progress();
    assert!(lp.rules.iter().all(|r| r.met), "{:?}", lp.rules.iter().filter(|r| !r.met).map(|r| r.name.clone()).collect::<Vec<_>>());
    ctx(1, 0, T0 + 2 * HOUR + 16 * MIN); c.poke();
    assert_eq!(c.level, 2);
    check_supply(&mut c, &ids, T0 + 2 * HOUR + 17 * MIN);
}

#[test]
fn paper_tax_charges_quick_flips_into_the_pot() {
    let mut c = launch(vec![Rule::PaperTax]);
    let t = buy(&mut c, 1, n(10) + STORAGE_COST, T0);
    let pot = c.pot;
    ctx(1, 1, T0 + 10 * MIN); let out = c.sell(U128(t), None).0;
    assert!(out < n(9) && out > n(8), "10% tax + fees: {}", out);
    assert!(c.pot > pot + n(9) / 100 * 9, "tax went to the pot");
}

#[test]
fn graduation_closes_buys_and_frees_the_creator_escrow() {
    let mut c = launch(vec![]);
    for i in 1..=10 { if !c.graduated { buy(&mut c, i, n(450), T0 + i as u64 * 1000); } }
    assert!(c.graduated);
    assert!(c.real > n(3_900));
    ctx(0, 0, T0 + HOUR); let e = c.claim_creator_escrow().0;
    assert!(e > 0);
    check_supply(&mut c, &(1..=10).collect::<Vec<_>>(), T0 + HOUR);
}

#[test]
fn log_keeps_mints_and_burns() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0);
    ctx(1, 0, T0 + 3 * DAY); let _ = c.claim_vault();
    let log = c.get_log(None, Some(100));
    assert!(log.iter().any(|e| e.kind == "mint"));
    assert!(log.iter().any(|e| e.kind == "burn" && e.memo == "idle burn"));
}

// ------------------------------------------------------------------ cards
fn give(c: &mut Coin, who: usize, card: Card, ms: u64) {
    let mut h = c.holder(&acc(who));
    if let Some(i) = card.common_index() { h.commons[i] += 1; } else { let exp = ms + FADE; c.stock.push(StockEntry { card, exp }); h.cards.push(HandCard { card, exp }); }
    c.save(&acc(who), h);
}

#[test]
fn pack_needs_a_gm_and_gives_the_starter_set() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0);
    ctx(1, 0, T0 + 2 * HOUR); c.gm();
    let got = c.claim_pack();
    assert_eq!(got.len(), 5, "starter Rally, Curse, Ward + 2 pack cards");
    let hand = c.get_hand(acc(1)).unwrap();
    let commons: u8 = hand.commons.iter().map(|x| x.1).sum();
    assert_eq!(commons as usize + hand.cards.len(), 5);
    assert_eq!(hand.next_pack, T0 + 2 * HOUR + PACK_EVERY);
}

#[test]
#[should_panic(expected = "next pack is not ready yet")]
fn one_pack_per_6h() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0);
    ctx(1, 0, T0 + 2 * HOUR); c.gm(); c.claim_pack(); c.claim_pack();
}

#[test]
#[should_panic(expected = "make room: drop a Common")]
fn a_full_hand_must_make_room_first() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0);
    for _ in 0..12 { give(&mut c, 1, Card::Ember, T0); }
    ctx(1, 0, T0 + 2 * HOUR); c.gm(); c.claim_pack();
}

#[test]
fn dropping_a_common_makes_room() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0);
    for _ in 0..11 { give(&mut c, 1, Card::Ember, T0); }
    let mut h = c.holder(&acc(1)); h.starter = true; c.save(&acc(1), h);
    ctx(1, 0, T0 + 2 * HOUR); c.gm(); c.drop_card(Card::Ember);
    assert_eq!(c.claim_pack().len(), 2);
}

#[test]
fn the_deck_limit_caps_rares_and_fade_frees_them() {
    let mut c = launch(vec![]);
    for i in 1..=20 { buy(&mut c, i, n(10), T0 + i as u64); }
    let now = T0 + 2 * HOUR;
    ctx(1, 0, now);
    let all_rare = [0, 100, 0, 0];
    let mut rares = 0;
    for i in 1..=20 { let mut h = c.holder(&acc(i)); if c.roll(&mut h, &all_rare, now) == Card::Prophecy { rares += 1; } c.save(&acc(i), h); }
    assert_eq!(rares, CAP_MIN[0] as usize, "only the deck limit's worth of Rares exist (8 on a small coin)");
    assert_eq!(c.stock_out(Card::Prophecy, now), 8);
    ctx(1, 0, now + FADE + 1);
    assert_eq!(c.stock_out(Card::Prophecy, now + FADE + 1), 0, "unplayed Rares fade back to the deck after 24h");
    assert!(c.get_hand(acc(1)).unwrap().cards.is_empty());
}

#[test]
fn ember_fires_with_3_copies_and_stokers_get_locked_tokens() {
    let mut c = launch(vec![]);
    for i in 1..=4 { buy(&mut c, i, n(10), T0 + i as u64); }
    for i in 1..=3 { give(&mut c, i, Card::Ember, T0); }
    c.energy = 10;
    ctx(1, 0, T0 + HOUR); let id = c.play_card(Card::Ember, None);
    ctx(2, 0, T0 + HOUR + 1000); c.back(id);
    ctx(3, 0, T0 + HOUR + 2000); c.back(id);
    ctx(4, n(5), T0 + HOUR + 3000); c.stoke(id);
    buy(&mut c, 5, n(2), T0 + HOUR + 4000);
    assert!(c.get_hand(acc(5)).unwrap().tagged.0 > 0, "a buy while Ember is on the table is tagged");
    let pot = c.pot; let burned = c.burned;
    ctx(1, 0, T0 + HOUR + EMBER_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    assert!(c.get_table().is_empty() && c.get_history()[0].result.starts_with("pot burned"), "{}", c.get_history()[0].result);
    assert!(c.pot < pot && c.burned > burned);
    let h4 = c.get_holder(acc(4)).unwrap();
    assert!(h4.locked.0 > 0 && h4.locks[0].mult == 10, "stoke is locked 6h");
    assert!(c.energy <= 6, "Ember cost 5 Energy (the stoke buy may add 1 back)");
    check_supply(&mut c, &[1, 2, 3, 4, 5], T0 + 2 * HOUR);
}

#[test]
fn ember_without_3_copies_fails_and_returns_the_cards() {
    let mut c = launch(vec![]);
    for i in 1..=2 { buy(&mut c, i, n(10), T0 + i as u64); give(&mut c, i, Card::Ember, T0); }
    c.energy = 10;
    ctx(1, 0, T0 + HOUR); let id = c.play_card(Card::Ember, None);
    ctx(2, 0, T0 + HOUR + 1); c.back(id);
    ctx(1, 0, T0 + HOUR + EMBER_WINDOW + 1); c.poke();
    assert!(c.get_history()[0].result.starts_with("failed"));
    assert_eq!(c.holder(&acc(1)).commons[3], 1); assert_eq!(c.holder(&acc(2)).commons[3], 1);
    assert_eq!(c.energy, 10, "no Energy spent on a failed card");
}

#[test]
fn prophecy_pays_winners_caster_and_burns() {
    let mut c = launch(vec![]);
    for i in 1..=11 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Prophecy, T0 + HOUR);
    c.energy = 30;
    let t0 = T0 + 2 * HOUR;
    ctx(1, 0, t0); let id = c.play_card(Card::Prophecy, Some(Question::Tide));
    ctx(2, 0, t0 + 1); c.back(id);
    ctx(3, 0, t0 + 2); c.back(id);
    ctx(4, 0, t0 + BACK_WINDOW + 1); c.poke();
    assert_eq!(c.get_table()[0].phase, 1);
    let stake = bal(&c, 2) / 10;
    for i in 2..=9 { ctx(i, 1, t0 + BACK_WINDOW + 10 + i as u64); c.bet(id, i <= 6, U128(stake)); } // 5 Yes, 3 No
    buy(&mut c, 10, n(5), t0 + BACK_WINDOW + BET_WINDOW + HOUR); // a non-bettor buys: net buying, Yes wins
    let before_caster = bal(&c, 1); let before_yes = bal(&c, 2); let before_no = bal(&c, 8);
    ctx(11, 0, t0 + BACK_WINDOW + BET_WINDOW + PROPHECY_LEN + 1); c.poke();
    assert_eq!(c.get_history()[0].result, "answer: Yes");
    let lose_total = 3 * stake;
    assert_eq!(bal(&c, 8) - before_no, stake - stake / 2, "a loser gets half back");
    assert!(close(bal(&c, 2) - before_yes, stake + lose_total * 3 / 10 / 5), "a winner gets its bet + its share of 30%");
    assert!(close(bal(&c, 1) - before_caster, lose_total / 10), "the caster gets 10%");
    assert_eq!(c.bets_held, 0);
    check_supply(&mut c, &(1..=11).collect::<Vec<_>>(), t0 + 4 * HOUR);
}

#[test]
#[should_panic(expected = "live Prophecy bet")]
fn bettors_cant_sell_until_it_resolves() {
    let mut c = launch(vec![]);
    for i in 1..=3 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Prophecy, T0 + HOUR); c.energy = 30;
    let t0 = T0 + 2 * HOUR;
    ctx(1, 0, t0); let id = c.play_card(Card::Prophecy, Some(Question::Tide));
    ctx(2, 0, t0 + 1); c.back(id);
    ctx(3, 0, t0 + 2); c.back(id);
    ctx(3, 0, t0 + BACK_WINDOW + 1); c.poke();
    ctx(3, 1, t0 + BACK_WINDOW + 2); let s = bal(&c, 3) / 10; c.bet(id, true, U128(s));
    ctx(3, 1, t0 + BACK_WINDOW + 100); c.sell(U128(s), None);
}

#[test]
fn inferno_fuel_is_capped_and_buys_before_the_pot_burns() {
    let mut c = launch(vec![]);
    for i in 1..=6 { buy(&mut c, i, n(30), T0 + i as u64); }
    give(&mut c, 1, Card::Inferno, T0 + HOUR); c.energy = 60;
    let t0 = T0 + 3 * HOUR;
    ctx(1, 0, t0); let id = c.play_card(Card::Inferno, None);
    for i in 1..=3 { ctx(i, 0, t0 + i as u64); c.sign(id); }
    ctx(4, 0, t0 + BACK_WINDOW + 1); c.poke();
    assert_eq!(c.get_table()[0].phase, 1);
    let cap = bps(c.real, crate::table::FUEL_CAP_BPS);
    for i in 4..=6 { ctx(i, n(5), t0 + BACK_WINDOW + 10 + i as u64); c.fuel(id); }
    ctx(2, n(20), t0 + BACK_WINDOW + 20); c.fuel(id); // only what's left under the cap is taken, the rest refunded
    assert!(c.get_table()[0].chip_total.0 <= cap, "fuel total stays under 10% of the curve's NEAR");
    let pot = c.pot;
    ctx(1, 0, t0 + BACK_WINDOW + FUEL_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    let h = c.get_holder(acc(4)).unwrap();
    assert!(h.locked.0 > 0 && h.locks[0].mult == 20, "fuel is locked 24h at x2 weight");
    assert!(c.pot < pot, "the pot burned");
    assert!(c.reward_pool < REWARD_POOL, "fuellers got a reward-pool bonus");
    assert!(c.energy <= 12, "Inferno cost 50 Energy");
    check_supply(&mut c, &[1, 2, 3, 4, 5, 6], t0 + 2 * HOUR);
}

#[test]
fn roll_call_doubles_gm_energy_for_an_hour() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0); buy(&mut c, 2, n(10), T0);
    give(&mut c, 1, Card::RollCall, T0); c.energy = 5;
    ctx(1, 0, T0 + HOUR); assert_eq!(c.play_card(Card::RollCall, None), 0);
    assert_eq!(c.energy, 0);
    ctx(2, 0, T0 + HOUR + 1); c.gm();
    assert_eq!(c.energy, 2);
}

// ------------------------------------------------------------------ raids
fn ctx_as(who: AccountId, deposit: u128, ms: u64, results: Vec<near_sdk::PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id("frog.rulecard.testnet".parse().unwrap()).predecessor_account_id(who)
        .attached_deposit(NearToken::from_yoctonear(deposit)).block_timestamp(ms * 1_000_000).prepaid_gas(near_sdk::Gas::from_tgas(300));
    testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), results);
}
fn me() -> AccountId { "frog.rulecard.testnet".parse().unwrap() }
fn moth() -> AccountId { "moth.rulecard.testnet".parse().unwrap() }
fn ok_json(v: &str) -> near_sdk::PromiseResult { near_sdk::PromiseResult::Successful(v.as_bytes().to_vec()) }

/// A coin at L2 with 6 qualified holders that each have tactic cards.
fn raid_ready() -> (Coin, u64) {
    let mut c = launch(vec![]);
    for i in 1..=6 { buy(&mut c, i, n(30), T0 + i as u64); for card in [Card::Rally, Card::Rally, Card::Curse, Card::Curse, Card::Ward] { give(&mut c, i, card, T0); } }
    c.level = 2; c.level_at.push(T0 + HOUR);
    (c, T0 + 2 * HOUR)
}

#[test]
fn score_rounds_follows_rally_curse_ward() {
    let base = [10_000u128, 10_000, 10_000];
    // round 1: my Curse vs their Rally -> their Rally cancelled, they get x0.95
    // round 2: my Curse vs their Ward -> turned back on me
    // round 3: my Rally vs their Ward -> Ward wasted, I get x1.05
    let (a, b, r) = score_rounds(&base, &[20, 20, 10], &base, &[10, 30, 30]);
    assert_eq!((a[0], b[0], r[0]), (10_000, 9_500, 1));
    assert_eq!((a[1], b[1], r[1]), (9_500, 10_000, -1));
    assert_eq!((a[2], b[2], r[2]), (10_500, 10_000, 1));
    assert_eq!(tactic_code(&[3, 0, 0]), 10);
    assert_eq!(tactic_code(&[6, 6, 0]), 0, "a tie means no tactic");
    assert_eq!(tactic_code(&[0, 10, 2]), 22);
    assert_eq!(tactic_code(&[2, 0, 0]), 0, "fewer than 3 wallets means no tactic");
}

#[test]
fn attacker_raid_from_signers_to_win_pack() {
    let (mut c, t) = raid_ready();
    ctx(1, 0, t); let id = c.start_raid(moth());
    for i in 2..=3 { ctx(i, 0, t + i as u64); c.sign_raid(); }
    ctx(4, 0, t + 10); let _ = c.launch_raid();
    assert_eq!(c.get_raid().unwrap().phase, 1);
    ctx_as(me(), 0, t + 20, vec![ok_json("true")]);
    assert!(c.on_raid_accept(id, t + 10));
    let start = t + 10;
    // plans: 4 wallets Curse in round 1, Rally in rounds 2 and 3
    for i in 1..=4 { ctx(i, 0, start + MIN); c.set_plan(vec![Some(Card::Curse), Some(Card::Rally), Some(Card::Rally)]); }
    ctx(5, 0, start + MIN); c.set_plan(vec![Some(Card::Ward), None, None]);
    assert_eq!(c.get_raid().unwrap().tactic, vec![0, 0, 0], "tactics stay hidden before their round ends");
    // round 1: buys and Battle cries
    let r1 = start + MUSTER + MIN;
    for i in 1..=4 { ctx(i, 0, r1 + i as u64); c.battle_cry(); }
    buy(&mut c, 6, n(10), r1 + 100);
    let v = c.get_raid().unwrap();
    assert!(v.buy[0] > 0 && v.crowd[0] == 4, "live score shows Buy and Crowd");
    // selling during a raid pays +3% to the pot
    let pot = c.pot; ctx(6, 1, r1 + 200); let s = bal(&c, 6) / 10; c.sell(U128(s), None);
    assert!(c.pot > pot);
    // settle after the last round
    let end = start + RAID_LEN;
    ctx(2, 0, end + 1); let _ = c.settle_raid();
    assert_eq!(c.get_raid().unwrap().phase, 3);
    let report = r#"{"base":["9800","9900","10000"],"tactic":[0,0,0],"war":false}"#;
    ctx_as(me(), 0, end + 2, vec![ok_json(report)]);
    assert!(c.on_raid_report(id).is_some());
    let last = c.get_raids().pop().unwrap();
    assert_eq!(last.result.as_ref().unwrap().outcome, 1, "{:?}", last.result.as_ref().unwrap().rounds);
    assert_eq!(last.tactic, vec![20, 10, 10], "tactics revealed after the raid");
    // win pack for a wallet that filled 3 slots; not for one that filled 1
    ctx(1, 0, end + 3); let mut h = c.holder(&acc(1)); h.commons = [0; 6]; c.save(&acc(1), h);
    let got = c.claim_raid_pack(); assert_eq!(got.len(), 3);
    // cards matching the side's tactic were used; wallet 5's Ward (not the side's tactic) came back
    ctx(5, 0, end + 4); let _ = c.claim_vault();
    assert_eq!(c.holder(&acc(5)).commons[2], 1, "the unused Ward returns to the hand");
    assert_eq!(c.holder(&acc(2)).commons[1], 1, "one of two Curses was used in round 1");
    assert_eq!(c.holder(&acc(2)).commons[0], 0, "both Rallies were used in rounds 2 and 3");
}

#[test]
#[should_panic(expected = "fill slots in at least 2 rounds")]
fn win_pack_needs_two_filled_rounds() {
    let (mut c, t) = raid_ready();
    ctx(1, 0, t); let id = c.start_raid(moth());
    for i in 2..=3 { ctx(i, 0, t + i as u64); c.sign_raid(); }
    ctx(4, 0, t + 10); let _ = c.launch_raid();
    ctx_as(me(), 0, t + 20, vec![ok_json("true")]); c.on_raid_accept(id, t + 10);
    ctx(5, 0, t + 10 + MIN); c.set_plan(vec![Some(Card::Ward), None, None]);
    let end = t + 10 + RAID_LEN;
    ctx(2, 0, end + 1); let _ = c.settle_raid();
    ctx_as(me(), 0, end + 2, vec![ok_json(r#"{"base":["9000","9000","9000"],"tactic":[0,0,0],"war":false}"#)]); c.on_raid_report(id);
    ctx(5, 0, end + 3); c.claim_raid_pack();
}

#[test]
fn raid_needs_enough_signers() {
    let (mut c, t) = raid_ready();
    ctx(1, 0, t); c.start_raid(moth());
    ctx(2, 0, t + 1); c.sign_raid();
    ctx(3, 0, t + RAID_BACK + 1);
    assert!(matches!(c.launch_raid(), near_sdk::PromiseOrValue::Value(false)));
    assert!(c.get_raid().is_none());
    assert_eq!(c.get_raids().pop().unwrap().note, "not enough signers");
}

#[test]
fn defender_accepts_then_is_shielded_and_pays_spoils_when_it_loses() {
    let (mut c, t) = raid_ready();
    ctx_as(moth(), 0, t, vec![]);
    assert!(c.raid_accept(7, 2, t, false));
    assert!(c.get_raid().is_some());
    ctx_as("toad.rulecard.testnet".parse().unwrap(), 0, t + 1, vec![]);
    assert!(!c.raid_accept(3, 2, t + 1, false), "already in a raid");
    let pot = c.pot;
    ctx_as(moth(), 0, t + RAID_LEN + 5, vec![]);
    c.raid_finish(7, -1, 1_500, vec![U128(9_000); 3], vec![U128(10_000); 3]);
    assert_eq!(c.pot, pot - bps(pot, 1_500), "15% of the pot goes to the winner");
    assert_eq!(c.get_raids().pop().unwrap().result.unwrap().outcome, -1);
    ctx_as("toad.rulecard.testnet".parse().unwrap(), 0, t + RAID_LEN + 6 * HOUR, vec![]);
    assert!(!c.raid_accept(4, 2, t + RAID_LEN + 6 * HOUR, false), "shielded for 12h after a raid");
    ctx_as("toad.rulecard.testnet".parse().unwrap(), 0, t + RAID_LEN + 13 * HOUR, vec![]);
    assert!(c.raid_accept(5, 2, t + RAID_LEN + 13 * HOUR, false), "shield over");
}

#[test]
fn defender_that_wins_burns_the_spoils() {
    let (mut c, t) = raid_ready();
    ctx_as(moth(), 0, t, vec![]); c.raid_accept(7, 2, t, false);
    let burned = c.burned;
    ctx_as(moth(), n(3), t + RAID_LEN + 5, vec![]);
    c.raid_finish(7, 1, 1_500, vec![U128(10_000); 3], vec![U128(9_000); 3]);
    assert!(c.burned > burned, "the attacker's spoils are bought and burned here");
    check_supply(&mut c, &[1, 2, 3, 4, 5, 6], t + RAID_LEN + 10);
}

#[test]
#[should_panic(expected = "only Rulecard coins")]
fn only_sibling_coins_can_raid() {
    let (mut c, t) = raid_ready();
    ctx_as("evil.testnet".parse().unwrap(), 0, t, vec![]); c.raid_accept(1, 2, t, false);
}

#[test]
fn a_lower_level_coin_cant_be_raided_by_a_higher_one() {
    let (mut c, t) = raid_ready();
    ctx_as(moth(), 0, t, vec![]);
    assert!(!c.raid_accept(1, 3, t, false));
}

#[test]
fn price_history_records_trades_and_burns() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0 + MIN);
    buy(&mut c, 2, n(10), T0 + MIN + 1000); // same minute: replaces the last point
    buy(&mut c, 3, n(10), T0 + 3 * MIN);
    let p = c.get_prices();
    assert_eq!(p.len(), 3, "launch + 2 minutes with trades");
    assert!(p[1].price.0 < p[2].price.0 && p[0].price.0 < p[1].price.0, "price rises with buys");
    assert_eq!(p.last().unwrap().price.0, c.pool().price());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn selling_needs_one_yocto() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(10), T0);
    ctx(1, 0, T0 + 1000); c.sell(U128(t), None);
}

#[test]
fn relocking_the_same_tokens_counts_once_for_the_ritual() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(10), T0);
    ctx(1, 1, T0 + 1000); c.lock(U128(t), 6);
    let once = c.ritual.lock_near.0;
    ctx(1, 1, T0 + 7 * HOUR); c.leave_early(0); // lock is over: no penalty
    let b = bal(&c, 1);
    ctx(1, 1, T0 + 7 * HOUR + 1000); c.lock(U128(b), 6);
    if (T0 + 7 * HOUR) / DAY == T0 / DAY { assert_eq!(c.ritual.lock_near.0, once, "same tokens, same day: counted once"); }
}

#[test]
fn a_losing_defender_pays_the_fixed_rate_whatever_the_caller_says() {
    let (mut c, t) = raid_ready();
    ctx_as(moth(), 0, t, vec![]); c.raid_accept(7, 2, t, false);
    let pot = c.pot;
    ctx_as(moth(), 0, t + RAID_LEN + 5, vec![]);
    c.raid_finish(7, -1, 10_000, vec![U128(9_000); 3], vec![U128(10_000); 3]);
    assert_eq!(c.pot, pot - bps(pot, SPOILS_BPS), "a caller can't ask for 100% of the pot");
}

#[test]
fn failed_spoils_go_back_to_the_pot() {
    let mut c = launch(vec![]);
    let pot = c.pot;
    ctx_as(me(), 0, T0 + 1, vec![near_sdk::PromiseResult::Failed]);
    c.on_spoils_sent(U128(n(3)));
    assert_eq!(c.pot, pot + n(3));
}

#[test]
fn crowd_counts_buyers_not_registrations() {
    let mut c = launch(vec![]);
    for i in 1..=3 { ctx(i, STORAGE_COST, T0 + i as u64); c.storage_deposit(None, None); }
    assert_eq!(c.buyers, 0, "registering alone doesn't count");
    buy(&mut c, 4, STORAGE_COST + n(1) / 2, T0 + 10);
    assert_eq!(c.buyers, 0, "half a NEAR isn't enough yet");
    buy(&mut c, 4, n(1), T0 + 20);
    buy(&mut c, 5, STORAGE_COST + n(2), T0 + 30);
    assert_eq!(c.buyers, 2);
}

#[test]
fn old_locks_dont_count_again_the_next_day() {
    let mut c = launch(vec![]);
    let day0 = T0 / DAY * DAY + DAY;
    let t = buy(&mut c, 1, n(10), day0 + 1);
    ctx(1, 1, day0 + 2); c.lock(U128(t - t / 100), 72);
    ctx(9, 0, day0 + DAY + 1); c.poke(); // next day
    let before = c.ritual.lock_near.0;
    ctx(1, 1, day0 + DAY + 2); let top = bal(&c, 1) / 2; c.lock(U128(top), 24); // small top-up
    let added = c.ritual.lock_near.0 - before;
    assert!(added <= c.pool().value(top) + 1, "only the top-up counts, not the 72h lock again: {added}");
}

#[test]
fn prophecy_caster_share_settles_idle_burn_first() {
    // the caster share arrives on a wallet that has idle burn due: the burn applies to the old balance only
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(10), T0);
    let later = T0 + 2 * DAY;
    let mut h = c.settle(&acc(1), later); // what idle burn leaves
    let left = h.bal; h.bal += 1_000; c.save(&acc(1), h);
    assert!(left < t);
    ctx(1, 0, later); assert_eq!(bal(&c, 1), left + 1_000, "nothing more burns on the new tokens for the past");
}


// ------------------------------------------------------------------ fuzz: random operations, invariants after every one
/// An empty mock chain (the testing_env! macro would carry the previous test's storage over).
fn fresh_storage() {
    let b = VMContextBuilder::new();
    near_sdk::env::set_blockchain_interface(near_sdk::MockedBlockchain::new(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), Default::default(), Default::default(), None));
}

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 { self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); self.0 >> 33 }
    fn below(&mut self, n: u64) -> u64 { self.next() % n.max(1) }
}

/// Refusals a valid player can run into. Any other panic from a call the fuzzer thought was fine is a bug.
const REFUSALS: [&str; 16] = [
    "gm once every 6h", "hold at least 1 NEAR worth", "buy first", "next pack is not ready", "gm first", "make room", "not enough unlocked balance",
    "graduated", "still locked", "nothing bought", "deposit too small", "minimum buy", "at most 10 locks", "receiver is not registered", "amount must be positive", "no such lock",
];

fn try_op(what: &str, f: impl FnOnce()) {
    if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        let msg = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
        if !REFUSALS.iter().any(|r| msg.contains(r)) { panic!("`{what}` failed in a way a valid player shouldn't hit: {msg}"); }
    }
}

fn invariants(c: &Coin, users: &[usize], what: &str) {
    assert!(c.pool().solvent(), "{what}: the curve is no longer fully backed");
    // every token is somewhere: held by wallets + unsold on the curve + the reward pool + the DEX reserve = what's left of the supply
    assert_eq!(c.circ + c.pool().room() + c.reward_pool + DEX_RESERVE, SUPPLY - c.burned, "{what}: supply identity broke");
    for &u in users {
        let h = c.holder(&acc(u));
        assert!(h.loss_used <= bps(h.loss_base, DAILY_LOSS_CAP_BPS) + 1, "{what}: wallet {u} lost more than 8% of its day-start balance");
    }
}

fn vault_sums(c: &Coin, users: &[usize], what: &str) {
    let locked: u128 = users.iter().map(|&u| c.locked_of(&c.holder(&acc(u)))).sum();
    assert_eq!(c.vault_locked, locked, "{what}: Vault locked total != sum of the wallets' locks");
    let w: u128 = users.iter().map(|&u| c.holder(&acc(u)).w).sum();
    assert_eq!(c.vault_w, w, "{what}: Vault weight total != sum of the wallets' weights");
}

#[test]
fn random_operations_keep_every_invariant() {
    let rule_sets: [Vec<Rule>; 4] = [vec![], vec![Rule::PaperTax], vec![Rule::Ruthless], vec![Rule::SoftTax]];
    let users: Vec<usize> = (1..=10).collect();
    // RULECARD_FUZZ_SEEDS / RULECARD_FUZZ_STEPS make it bigger (a 12,000-operation run: 8 seeds x 1,500 steps)
    let env = |k: &str, d: u64| std::env::var(k).ok().and_then(|v| v.parse().ok()).unwrap_or(d);
    let (seeds, steps) = (env("RULECARD_FUZZ_SEEDS", 3), env("RULECARD_FUZZ_STEPS", 300) as u32);
    for seed in 0..seeds {
        fresh_storage(); // each seed is a new coin on an empty chain
        let mut c = launch(rule_sets[(seed % 4) as usize].clone());
        let mut rng = Rng(0x9E37_79B9 ^ (seed + 1) * 7919);
        let mut ms = T0 + 1000;
        let mut registered = [false; 11];
        for step in 0..steps {
            ms += 1_000 + rng.below(30_000);
            let u = 1 + rng.below(10) as usize;
            let what = format!("seed {seed} step {step} user {u}");
            match rng.below(100) {
                0..=29 => { // buy
                    let amount = GN * (1 + rng.below(60)) as u128 + STORAGE_COST;
                    ctx(u, amount, ms);
                    try_op(&what, || { c.buy(None); });
                    registered[u] = true;
                }
                30..=44 => { // sell a share of what's there
                    ctx(u, 1, ms);
                    let b = c.ft_balance_of(acc(u)).0;
                    if b > 0 { let a = b / 100 * (1 + rng.below(100)) as u128; if a > 0 { try_op(&what, || { c.sell(U128(a), None); }); } }
                }
                45..=54 => { ctx(u, 0, ms); try_op(&what, || c.gm()); }
                55..=64 => { // lock
                    ctx(u, 1, ms);
                    let b = c.ft_balance_of(acc(u)).0;
                    if b > 0 { let a = b / 100 * (1 + rng.below(60)) as u128; let hours = [6u8, 24, 72][rng.below(3) as usize]; if a > 0 { try_op(&what, || { c.lock(U128(a), hours); }); } }
                }
                65..=69 => { // unlock, or leave early
                    ctx(u, 1, ms);
                    if let Some(h) = c.get_holder(acc(u)) {
                        if !h.locks.is_empty() {
                            let i = rng.below(h.locks.len() as u64) as u32;
                            if ms >= h.locks[i as usize].until { try_op(&what, || { c.unlock(i); }); } else { try_op(&what, || { c.leave_early(i); }); }
                        }
                    }
                }
                70..=77 => { // a transfer to another registered wallet
                    let v = 1 + rng.below(10) as usize;
                    if v != u && registered[v] {
                        ctx(u, 1, ms);
                        let b = c.ft_balance_of(acc(u)).0;
                        let a = b / 100 * (1 + rng.below(100)) as u128;
                        if a > 0 { try_op(&what, || c.ft_transfer(acc(v), U128(a), None)); }
                    }
                }
                78..=84 => { ctx(u, 0, ms); try_op(&what, || { c.claim_pack(); }); }
                85..=88 => { ctx(u, 0, ms); c.poke(); }
                _ => { // time passes: usually minutes, sometimes hours, now and then days
                    ms += match rng.below(20) { 0 => rng.below(3 * 24) * 3_600_000, 1..=5 => rng.below(12 * 60) * 60_000, _ => rng.below(60) * 60_000 };
                }
            }
            invariants(&c, &users, &what);
            if step % 25 == 24 { vault_sums(&c, &users, &what); }
            if step % 200 == 199 { check_supply(&mut c, &users, ms); invariants(&c, &users, &format!("{what} after settling everyone")); }
        }
        ctx(1, 0, ms); c.poke();
        invariants(&c, &users, &format!("seed {seed} end"));
    }
}
