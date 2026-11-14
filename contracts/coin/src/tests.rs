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
        .random_seed({ let mut sd = [0u8; 32]; sd[..8].copy_from_slice(&(ms / 997).wrapping_mul(0x9E37_79B9_7F4A_7C15).to_le_bytes()); sd[8] = (ms / 31) as u8; sd })
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

/// Everyone with something waiting collects it (Prophecy, Black Hole and Bounty payouts are claimed, not pushed).
fn claim_all(c: &mut Coin, holders: &[usize], ms: u64) {
    for &h in holders { if !c.get_pending(acc(h)).is_empty() { ctx(h, 0, ms); c.claim_payouts(); } }
}

/// Every token is somewhere: holders + the contract = total supply.
fn check_supply(c: &mut Coin, holders: &[usize], ms: u64) {
    for &h in holders { ctx(h, 0, ms); let _ = c.claim_vault(); }
    let held: u128 = holders.iter().map(|&h| bal(c, h)).sum(); // locked tokens sit in the contract's balance
    let total = held + c.contract_balance();
    let supply = c.ft_total_supply().0;
    assert!(total.abs_diff(supply) <= holders.len() as u128 * 10, "supply {supply} vs found {total}");
    assert!(c.pool().solvent(), "curve not fully backed");
    assert_eq!(c.burned, c.burned_by.iter().sum::<u128>(), "burns by kind must add up to the total burned");
    let st = c.get_stats(); assert_eq!(st.minted.0 - st.burned.0, c.ft_total_supply().0, "minted - burned = total supply");
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
fn idle_burn_starts_after_24h_and_respects_the_daily_cap() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(10), T0);
    // 24h grace + first 6h tick = 30h
    assert_eq!(c.ft_balance_of(acc(1)).0, t, "nothing burns in the grace time");
    ctx(1, 0, T0 + 30 * HOUR - 1); assert_eq!(bal(&c, 1), t);
    ctx(1, 0, T0 + 30 * HOUR); assert_eq!(bal(&c, 1), t - t / 100, "1% after 30h");
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
    assert_eq!((c.ritual.best_streak, c.ritual.best_streak_day), (1, day0 / DAY), "the high score is kept");
    check_supply(&mut c, &ids, day0 + DAY + 2);
}

#[test]
fn ritual_missed_doubles_idle_burn_for_6h() {
    let mut c = launch(vec![]);
    let day0 = T0 / DAY * DAY + DAY;
    let t = buy(&mut c, 1, n(10), day0 - 25 * HOUR); // grace ends at day0 - 1h; ticks at day0+5h, day0+11h ...
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
    for i in 1..=20 { let mut h = c.holder(&acc(i)); if c.roll(&mut h, &all_rare, now).tier() == 1 { rares += 1; } c.save(&acc(i), h); }
    assert_eq!(rares, CAP_MIN[0] as usize, "only the deck limit's worth of Rares exist (8 on a small coin)");
    let out: u32 = tier_cards(1).iter().map(|k| c.stock_out(*k, now)).sum();
    assert_eq!(out, 8);
    assert!(tier_cards(1).iter().all(|k| c.stock_out(*k, now) <= 1), "with 11 Rares each card has at most one copy out on a small coin");
    ctx(1, 0, now + FADE + 1);
    let out: u32 = tier_cards(1).iter().map(|k| c.stock_out(*k, now + FADE + 1)).sum();
    assert_eq!(out, 0, "unplayed Rares fade back to the deck after 24h");
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
    claim_all(&mut c, &(1..=11).collect::<Vec<_>>(), t0 + 3 * HOUR);
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
    ctx(1, 0, end + 3); let mut h = c.holder(&acc(1)); h.commons = [0; N_COMMONS]; c.save(&acc(1), h);
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
    assert!(c.raid_accept(7, 2, t, false, 0));
    assert!(c.get_raid().is_some());
    ctx_as("toad.rulecard.testnet".parse().unwrap(), 0, t + 1, vec![]);
    assert!(!c.raid_accept(3, 2, t + 1, false, 0), "already in a raid");
    let pot = c.pot;
    ctx_as(moth(), 0, t + RAID_LEN + 5, vec![]);
    c.raid_finish(7, -1, 1_500, vec![U128(9_000); 3], vec![U128(10_000); 3]);
    assert_eq!(c.pot, pot - bps(pot, 1_500), "15% of the pot goes to the winner");
    assert_eq!(c.get_raids().pop().unwrap().result.unwrap().outcome, -1);
    ctx_as("toad.rulecard.testnet".parse().unwrap(), 0, t + RAID_LEN + 6 * HOUR, vec![]);
    assert!(!c.raid_accept(4, 2, t + RAID_LEN + 6 * HOUR, false, 0), "shielded for 12h after a raid");
    ctx_as("toad.rulecard.testnet".parse().unwrap(), 0, t + RAID_LEN + 13 * HOUR, vec![]);
    assert!(c.raid_accept(5, 2, t + RAID_LEN + 13 * HOUR, false, 0), "shield over");
}

#[test]
fn defender_that_wins_burns_the_spoils() {
    let (mut c, t) = raid_ready();
    ctx_as(moth(), 0, t, vec![]); c.raid_accept(7, 2, t, false, 0);
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
    ctx_as("evil.testnet".parse().unwrap(), 0, t, vec![]); c.raid_accept(1, 2, t, false, 0);
}

#[test]
fn a_lower_level_coin_cant_be_raided_by_a_higher_one() {
    let (mut c, t) = raid_ready();
    ctx_as(moth(), 0, t, vec![]);
    assert!(!c.raid_accept(1, 3, t, false, 0));
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
    ctx_as(moth(), 0, t, vec![]); c.raid_accept(7, 2, t, false, 0);
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
        c.level = 2; // Omens run from level 2: the fuzz run covers them too
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

// ------------------------------------------------------------------ Omens
fn omen_base() -> u64 { (T0 / OMEN_CYCLE + 4) * OMEN_CYCLE }
fn force_omen(c: &mut Coin, base: u64, kind: u8) { c.omen = Omen { cycle: base / OMEN_CYCLE + 1, kind, fired: false, used: false, lucky: 1, gms: 0 }; }

#[test]
fn omen_is_announced_ahead_and_only_on_level_2_and_up() {
    let mut c = launch(vec![]);
    let base = omen_base();
    ctx(1, 0, base - 10 * MIN); c.poke();
    assert_eq!(c.omen.cycle, 0, "level 1 coins have no Omens");
    c.level = 2;
    ctx(1, 0, base - 10 * MIN); c.poke();
    assert_eq!(c.omen.cycle, base / OMEN_CYCLE + 1, "rolled for the cycle that starts in 10 minutes");
    let before = c.omen.kind;
    ctx(1, 0, base - 5 * MIN); c.poke();
    assert_eq!(c.omen.kind, before, "one roll per cycle");
    // far from any Omen window (break): nothing is rolled
    let mut d = launch(vec![]); d.level = 2;
    ctx(1, 0, base + 2 * HOUR); d.poke();
    assert_eq!(d.omen.cycle, 0, "no roll in the middle of a break");
}

#[test]
fn full_moon_doubles_energy_from_gm() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    buy(&mut c, 1, n(10), base - 3 * HOUR); buy(&mut c, 2, n(10), base - 3 * HOUR);
    force_omen(&mut c, base, 1);
    let e0 = c.energy;
    ctx(1, 0, base + 10 * MIN); c.gm();
    assert_eq!(c.energy, e0 + 2, "gm during Full Moon");
    ctx(2, 0, base + 2 * HOUR); c.gm();
    assert_eq!(c.energy, e0 + 3, "gm after the hour is normal");
}

#[test]
fn thunder_sells_pay_one_percent_more_into_the_pot() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    let t = buy(&mut c, 1, n(10), base - 3 * HOUR);
    force_omen(&mut c, base, 2);
    ctx(1, 0, base + 10 * MIN); let q = c.quote_sell(U128(t / 2), Some(acc(1)));
    let pot0 = c.pot;
    ctx(1, 1, base + 10 * MIN); let pay = c.sell(U128(t / 2), None).0;
    let gross = q.near_out.0 + q.fee.0 + q.tax.0;
    assert_eq!(q.near_out.0, pay, "the quote already includes Thunder");
    assert_eq!(q.tax.0, bps(gross, THUNDER_BPS), "Thunder takes 1% of the sale");
    assert!(c.pot - pot0 >= bps(gross, THUNDER_BPS), "and it goes to the pot");
    assert!(c.pool().solvent());
    check_supply(&mut c, &[1], base + 20 * MIN);
}

#[test]
fn ghost_ember_burns_three_percent_of_the_pot_once() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    buy(&mut c, 1, n(10), base - 3 * HOUR);
    force_omen(&mut c, base, 3);
    let (pot0, burned0) = (c.pot, c.burned);
    ctx(2, 0, base + MIN); c.poke();
    assert!(c.omen.fired && c.burned > burned0);
    assert!(pot0 - c.pot <= bps(pot0, GHOST_EMBER_BPS) + 1 && pot0 - c.pot >= bps(pot0, GHOST_EMBER_BPS) - 1, "3% of the pot");
    let after = (c.pot, c.burned);
    ctx(2, 0, base + 5 * MIN); c.poke();
    assert_eq!((c.pot, c.burned), after, "fires once");
    check_supply(&mut c, &[1], base + 10 * MIN);
}

#[test]
fn treasure_makes_the_lucky_gm_pack_ready() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    buy(&mut c, 1, n(10), base - 7 * HOUR);
    ctx(1, 0, base - 6 * HOUR); c.gm();
    ctx(1, 0, base - 3 * HOUR); let _ = c.claim_pack(); // opened late: the next pack is still 3h away when the next gm comes
    assert!(c.holder(&acc(1)).next_pack > base + 5 * MIN, "pack on cooldown");
    force_omen(&mut c, base, 4);
    ctx(1, 0, base + 5 * MIN); c.gm();
    assert_eq!(c.holder(&acc(1)).next_pack, 0, "the lucky gm gets a pack ready");
    ctx(1, 0, base + 6 * MIN); assert!(!c.claim_pack().is_empty());
}

#[test]
fn the_icon_is_drawn_from_the_coin_state_and_is_safe() {
    let mut c = launch(vec![]);
    let a = c.ft_metadata().icon.unwrap();
    assert!(a.starts_with("data:image/svg+xml;utf8,%3Csvg"));
    assert!(!a.contains('<') && !a.contains('#') && a.contains("STREAK 0"));
    c.ritual.streak = 4; c.level = 3;
    let b = c.ft_metadata().icon.unwrap();
    assert!(b.contains("STREAK 4") && b.contains("L3") && a != b, "the face changes with the coin");
    assert!(a.len() < 2_000, "small enough for a wallet");
}


// ------------------------------------------------------------------ the other nine Omens
#[test]
fn omen_roll_covers_all_thirteen_and_wild_coin_shifts_the_mix() {
    let mix = |wild_pct: u64| {
        let mut seen = [0u32; 14]; let mut wild = 0u32;
        for r in 0..30_000u64 {
            let mut x = r.wrapping_mul(0x9E37_79B9_7F4A_7C15); x ^= x >> 29; x = x.wrapping_mul(0xBF58_476D_1CE4_E5B9); x ^= x >> 32;
            let k = roll_omen(x, wild_pct); seen[k as usize] += 1; if matches!(k, 3 | 4 | 5 | 6) { wild += 1; }
        }
        (seen, wild)
    };
    let (seen, wild) = mix(40);
    assert_eq!(seen[0], 0, "every cycle rolls a real Omen");
    for k in 1..14 { assert!(seen[k] > 0, "Omen {} never rolled", OMEN_NAMES[k]); }
    assert!((11_000..13_000).contains(&wild), "Wild is about 40%: {wild}");
    let (_, wild60) = mix(60);
    assert!((17_000..19_000).contains(&wild60), "Wild Coin makes Wild Omens about 60%: {wild60}");
}

#[test]
fn squall_hits_one_percent_of_wallets_that_held_before_it_and_not_later_buyers() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    let t1 = buy(&mut c, 1, n(10), base - HOUR);
    force_omen(&mut c, base, 5);
    ctx(5, 0, base + MIN); c.poke();
    assert_eq!(c.squalls.len(), 1, "Squall fired once");
    let t2 = buy(&mut c, 2, n(10), base + 10 * MIN);
    let burned0 = c.burned;
    ctx(1, 0, base + 2 * HOUR); let _ = c.claim_vault();
    ctx(2, 0, base + 2 * HOUR); let _ = c.claim_vault();
    assert_eq!(bal(&c, 1), t1 - bps(t1, SQUALL_BPS), "the earlier holder takes the 1% hit");
    assert_eq!(bal(&c, 2), t2, "a wallet that bought after the Squall is not hit");
    assert!(c.burned > burned0, "with nobody in the Vault the hit burns");
    ctx(1, 0, base + 3 * HOUR); let _ = c.claim_vault();
    assert_eq!(bal(&c, 1), t1 - bps(t1, SQUALL_BPS), "taken once");
    check_supply(&mut c, &[1, 2], base + 4 * HOUR);
}

#[test]
fn squall_half_goes_to_the_vault_and_counts_toward_the_daily_cap() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    let t1 = buy(&mut c, 1, n(10), base - HOUR);
    let t2 = buy(&mut c, 2, n(10), base - HOUR);
    ctx(2, 1, base - 2 * HOUR); c.lock(U128(t2 / 2), 24);
    force_omen(&mut c, base, 5);
    ctx(5, 0, base + MIN); c.poke();
    ctx(1, 0, base + 2 * HOUR); let _ = c.claim_vault();
    let hit = bps(t1, SQUALL_BPS);
    assert_eq!(bal(&c, 1), t1 - hit);
    assert!(c.vault_rewards >= hit / 2 - 1, "half of the hit is shared with the Vault");
    let h = c.holder(&acc(1)); assert_eq!(h.loss_used, hit, "the hit uses the one daily cap");
    check_supply(&mut c, &[1, 2], base + 4 * HOUR);
}

#[test]
fn drought_doubles_idle_burn_for_its_hour() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(10), T0);
    c.droughts.push(T0 + 30 * HOUR - MIN); // the first idle tick (30h) falls inside the Drought hour
    ctx(1, 0, T0 + 30 * HOUR); assert_eq!(bal(&c, 1), t - bps(t, 2 * IDLE_BPS), "2% instead of 1%");
    let mut d = launch(vec![]);
    let t = buy(&mut d, 2, n(10), T0);
    d.droughts.push(T0 + 10 * HOUR);
    ctx(2, 0, T0 + 30 * HOUR); assert_eq!(d.ft_balance_of(acc(2)).0, t - bps(t, IDLE_BPS), "a tick outside the hour is normal");
}

fn lock_weight_under(kind: u8) {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    let t = buy(&mut c, 1, n(10), base - HOUR);
    force_omen(&mut c, base, kind);
    ctx(1, 1, base + 10 * MIN); c.lock(U128(t / 2), 24);
    assert_eq!(c.holder(&acc(1)).locks[0].mult, 18, "x1.5 becomes x1.8 ({})", OMEN_NAMES[kind as usize]);
    ctx(1, 1, base + 2 * HOUR); c.lock(U128(t / 4), 24);
    assert_eq!(c.holder(&acc(1)).locks[1].mult, 15, "normal after the hour");
}
#[test]
fn iron_vault_raises_lock_weight_for_its_hour() { lock_weight_under(7); }
#[test]
fn fog_with_no_raid_raises_lock_weight_like_iron_vault() { lock_weight_under(13); }

#[test]
fn windfall_adds_a_quarter_to_the_next_ember_burn() {
    let run = |omen: Option<u8>, o: usize| -> u128 {
        let mut c = launch(vec![]); c.level = 2;
        let base = omen_base();
        for i in 1..=3 { buy(&mut c, o + i, n(10), base - HOUR + i as u64); give(&mut c, o + i, Card::Ember, base - HOUR); }
        c.energy = 10;
        if let Some(k) = omen { force_omen(&mut c, base, k); }
        let t0 = base + 5 * MIN;
        ctx(o + 1, 0, t0); let id = c.play_card(Card::Ember, None);
        ctx(o + 2, 0, t0 + 1000); c.back(id);
        ctx(o + 3, 0, t0 + 2000); c.back(id);
        let pot = c.pot;
        ctx(o + 1, 0, t0 + EMBER_WINDOW + FIRE_JITTER_MS + 1); c.poke();
        pot - c.pot
    };
    let plain = run(None, 0); let windfall = run(Some(8), 10);
    assert!(plain > 0);
    assert!(windfall.abs_diff(plain + plain / 4) <= plain / 1_000, "{windfall} vs {plain} + 25%");
}

#[test]
fn gold_rush_gives_a_rare_on_the_first_card_of_the_next_pack() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    buy(&mut c, 1, n(10), base - 7 * HOUR);
    ctx(1, 0, base + 2 * MIN); c.gm();
    force_omen(&mut c, base, 9);
    ctx(1, 0, base + 3 * MIN); let got = c.claim_pack();
    let rare = got.iter().filter(|x| x.tier() >= 1).count();
    assert!(rare >= 1, "the pack held a Rare or better: {got:?}");
    assert!(c.omen.used, "Gold Rush is used up");
    check_supply(&mut c, &[1], base + 4 * MIN);
}

#[test]
fn low_tide_halves_the_backing_window() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    buy(&mut c, 1, n(10), base - HOUR);
    give(&mut c, 1, Card::Ember, base - HOUR);
    c.energy = 10;
    force_omen(&mut c, base, 11);
    ctx(1, 0, base + 10 * MIN); let _ = c.play_card(Card::Ember, None);
    assert_eq!(c.get_table()[0].phase_end, base + 10 * MIN + EMBER_WINDOW / 2);
}

#[test]
fn oracle_opens_a_prophecy_on_itself_and_refunds_when_few_bet() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    buy(&mut c, 1, n(20), base - HOUR); buy(&mut c, 2, n(20), base - HOUR);
    force_omen(&mut c, base, 6);
    ctx(5, 0, base + MIN); c.poke();
    let t = c.get_table();
    assert_eq!(t.len(), 1);
    assert!(t[0].card == Card::Prophecy && t[0].phase == 1 && t[0].proposer == me(), "the coin is the caster");
    let id = t[0].id;
    let (b1, b2) = (bal(&c, 1), bal(&c, 2));
    ctx(1, 1, base + 2 * MIN); c.bet(id, true, U128(b1 / 10));
    ctx(2, 1, base + 3 * MIN); c.bet(id, false, U128(b2 / 10));
    ctx(5, 0, base + MIN + BET_WINDOW + PROPHECY_LEN + 1); c.poke();
    assert!(c.get_history()[0].result.starts_with("refunded"), "{}", c.get_history()[0].result);
    claim_all(&mut c, &[1, 2], base + MIN + BET_WINDOW + PROPHECY_LEN + 2);
    assert_eq!((bal(&c, 1), bal(&c, 2)), (b1, b2), "nobody loses when fewer than 8 wallets bet");
    assert_eq!(c.bets_held, 0);
    check_supply(&mut c, &[1, 2], base + 5 * HOUR);
}

#[test]
fn oracle_with_enough_bettors_burns_the_casters_share() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    for i in 1..=9 { buy(&mut c, i, n(20), base - HOUR + i as u64); }
    force_omen(&mut c, base, 6);
    ctx(5, 0, base + MIN); c.poke();
    let id = c.get_table()[0].id;
    let stake = bal(&c, 1) / 10;
    for i in 1..=8 { ctx(i, 1, base + 2 * MIN + i as u64); c.bet(id, i <= 5, U128(stake)); }
    buy(&mut c, 9, n(5), base + BET_WINDOW + HOUR / 2);
    let burned0 = c.burned;
    ctx(9, 0, base + MIN + BET_WINDOW + PROPHECY_LEN + 1); c.poke();
    assert_eq!(c.get_history()[0].result, "answer: Yes");
    assert!(c.burned - burned0 >= 6 * stake / 10 - 10, "20% of the losing side is burned, including the share the caster would have had");
    assert_eq!(c.bets_held, 0);
    check_supply(&mut c, &(1..=9).collect::<Vec<_>>(), base + 6 * HOUR);
}

#[test]
fn blood_moon_arms_the_next_raid_and_doubles_the_spoils_this_coin_pays() {
    let mut c = launch(vec![]); c.level = 2;
    let base = omen_base();
    buy(&mut c, 1, n(10), base - HOUR);
    force_omen(&mut c, base, 12);
    ctx(5, 0, base + MIN); c.poke();
    assert_eq!(c.blood_until, base + MIN + BLOOD_WINDOW);
    let (mut d, t) = raid_ready();
    d.blood_until = t + HOUR;
    ctx_as(moth(), 0, t, vec![]);
    assert!(d.raid_accept(7, 2, t, false, 0));
    assert!(d.raid.as_ref().unwrap().blood && d.blood_until == 0, "the raid took the Blood Moon");
    let pot = d.pot;
    ctx_as(moth(), 0, t + RAID_LEN + 5, vec![]);
    d.raid_finish(7, -1, 1_500, vec![U128(9_000); 3], vec![U128(10_000); 3]);
    assert_eq!(d.pot, pot - bps(pot, 3_000), "30% instead of 15%");
}

#[test]
fn fog_hides_the_live_scores_while_a_raid_is_on() {
    let (mut c, t) = raid_ready();
    ctx_as(moth(), 0, t, vec![]);
    assert!(c.raid_accept(7, 2, t, false, 0));
    let base = (t / OMEN_CYCLE + 1) * OMEN_CYCLE;
    force_omen(&mut c, base, 13);
    ctx_as(moth(), 0, base + 10 * MIN, vec![]);
    let v = c.get_raid().unwrap();
    assert!(v.live_base.iter().all(|x| x.0 == 0), "scores hidden during Fog");
}

// ------------------------------------------------------------------ new cards, batch 1: Kindle, Slow Burn, Recruit, Diamond Pool, Last Stand
#[test]
fn kindle_adds_heat_that_cools_and_is_once_per_wallet_per_6h() {
    let mut c = launch(vec![]);
    for i in 1..=2 { buy(&mut c, i, n(10), T0 + i as u64); give(&mut c, i, Card::Kindle, T0); give(&mut c, i, Card::Kindle, T0); }
    c.energy = 20;
    ctx(1, 0, T0 + HOUR); c.play_card(Card::Kindle, None);
    assert_eq!(c.get_coin().heat, 1);
    ctx(2, 0, T0 + HOUR + 1000); c.play_card(Card::Kindle, None);
    assert_eq!(c.get_coin().heat, 2, "another wallet can add Heat");
    assert_eq!(c.energy, 10, "5 Energy each");
    ctx(1, 0, T0 + 2 * HOUR + 5000); assert_eq!(c.get_coin().heat, 1, "Heat cools 1 an hour");
    ctx(1, 0, T0 + 4 * HOUR); assert_eq!(c.get_coin().heat, 0);
}

#[test]
#[should_panic(expected = "once per wallet per 6h")]
fn kindle_twice_in_6h_fails() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0); give(&mut c, 1, Card::Kindle, T0); give(&mut c, 1, Card::Kindle, T0);
    c.energy = 20;
    ctx(1, 0, T0 + HOUR); c.play_card(Card::Kindle, None);
    ctx(1, 0, T0 + 2 * HOUR); c.play_card(Card::Kindle, None);
}

#[test]
fn hype_siren_pins_the_coin_for_15_min_and_costs_5_energy() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0); give(&mut c, 1, Card::HypeSiren, T0);
    c.energy = 20;
    ctx(1, 0, T0 + HOUR); c.play_card(Card::HypeSiren, None);
    assert_eq!(c.get_coin().hype_until, T0 + HOUR + 15 * MIN, "pinned for 15 minutes");
    assert_eq!(c.energy, 15, "5 Energy");
    ctx(1, 0, T0 + HOUR + 14 * MIN); assert!(c.get_coin().hype_until > c.get_coin().now, "still pinned at 14 minutes");
    ctx(1, 0, T0 + HOUR + 16 * MIN); assert!(c.get_coin().hype_until <= c.get_coin().now, "the pin is over after 15 minutes");
}

#[test]
#[should_panic(expected = "once per coin per hour")]
fn hype_siren_is_once_per_coin_per_hour() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0); buy(&mut c, 2, n(10), T0 + 1);
    give(&mut c, 1, Card::HypeSiren, T0); give(&mut c, 2, Card::HypeSiren, T0);
    c.energy = 20;
    ctx(1, 0, T0 + HOUR); c.play_card(Card::HypeSiren, None);
    ctx(2, 0, T0 + HOUR + 30 * MIN); c.play_card(Card::HypeSiren, None);
}

#[test]
fn heat_makes_the_ember_burn_larger() {
    let run = |heat: bool, o: usize| -> u128 {
        let mut c = launch(vec![]);
        for i in 1..=3 { buy(&mut c, o + i, n(10), T0 + i as u64); give(&mut c, o + i, Card::Ember, T0); }
        c.energy = 10;
        if heat { c.heat = 3; c.heat_at = T0 + HOUR; }
        ctx(o + 1, 0, T0 + HOUR); let id = c.play_card(Card::Ember, None);
        ctx(o + 2, 0, T0 + HOUR + 1000); c.back(id);
        ctx(o + 3, 0, T0 + HOUR + 2000); c.back(id);
        let pot = c.pot;
        ctx(o + 1, 0, T0 + HOUR + EMBER_WINDOW + FIRE_JITTER_MS + 1); c.poke();
        pot - c.pot
    };
    let (cold, hot) = (run(false, 0), run(true, 10));
    assert!(cold > 0 && hot.abs_diff(cold + cold * 3 / 10) <= cold / 1_000, "{hot} vs {cold} + 30%");
}

#[test]
fn slow_burn_burns_one_percent_of_every_trade_for_an_hour() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0); give(&mut c, 1, Card::SlowBurn, T0);
    c.energy = 30;
    ctx(1, 0, T0 + HOUR); c.play_card(Card::SlowBurn, None);
    ctx(2, 0, T0 + HOUR + 10); let q = c.quote_buy(U128(n(5)), Some(acc(2)));
    let burned0 = c.burned;
    let t = buy(&mut c, 2, n(5), T0 + HOUR + 20);
    assert_eq!(t, q.tokens.0, "the quote includes the burn");
    assert!(c.burned > burned0, "1% of the tokens bought were burned");
    ctx(2, 1, T0 + HOUR + 30); let b1 = c.burned; let held = bal(&c, 2);
    let _ = c.sell(U128(held / 2), None);
    assert!(c.burned - b1 >= held / 2 / 100 - 1, "a sale burns 1% of what is sold");
    check_supply(&mut c, &[1, 2], T0 + HOUR + 40);
    ctx(2, 0, T0 + 3 * HOUR); let b2 = c.burned; buy(&mut c, 2, n(1), T0 + 3 * HOUR + 1);
    assert_eq!(c.burned, b2, "no burn after the hour");
}

#[test]
fn recruit_gives_a_first_big_buy_five_percent_locked_for_6h() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0); give(&mut c, 1, Card::Recruit, T0);
    c.energy = 30;
    ctx(1, 0, T0 + HOUR); c.play_card(Card::Recruit, None);
    let rp = c.reward_pool;
    let t = buy(&mut c, 2, n(5), T0 + HOUR + 100);
    let h = c.get_holder(acc(2)).unwrap();
    assert_eq!(h.locked.0, bps(t, 500) + 0, "5% bonus is locked");
    assert!(rp - c.reward_pool >= bps(t, 500));
    buy(&mut c, 2, n(5), T0 + HOUR + 200);
    assert_eq!(c.get_holder(acc(2)).unwrap().locked.0, bps(t, 500), "only the first buy");
    let h1 = c.get_holder(acc(1)).unwrap(); assert_eq!(h1.locked.0, 0, "an existing holder is not recruited");
    buy(&mut c, 3, n(2), T0 + HOUR + 300);
    assert_eq!(c.get_holder(acc(3)).unwrap().locked.0, 0, "under 3 NEAR gets nothing");
    check_supply(&mut c, &[1, 2, 3], T0 + 2 * HOUR);
}

#[test]
fn diamond_pool_boosts_24h_locks_and_adds_one_percent() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(10), T0); give(&mut c, 1, Card::DiamondPool, T0);
    c.energy = 30;
    ctx(1, 0, T0 + HOUR); c.play_card(Card::DiamondPool, None);
    ctx(1, 1, T0 + HOUR + 10); c.lock(U128(t / 2), 24);
    let l = c.holder(&acc(1)).locks[0].clone();
    assert_eq!(l.mult, 18);
    assert_eq!(l.amount.0, t / 2 + (t / 2) / 100, "+1% bonus tokens");
    ctx(1, 1, T0 + HOUR + 20); c.lock(U128(t / 4), 6);
    assert_eq!(c.holder(&acc(1)).locks[1].mult, 10, "a 6h lock gets nothing");
    ctx(1, 1, T0 + 26 * HOUR); c.lock(U128(t / 8), 24);
    assert_eq!(c.holder(&acc(1)).locks[2].mult, 15, "normal after 24h");
    check_supply(&mut c, &[1], T0 + 27 * HOUR);
}

#[test]
fn last_stand_needs_a_25_percent_dip_and_then_burns_from_the_pot() {
    let mut c = launch(vec![]);
    let t = buy(&mut c, 1, n(400), T0);
    buy(&mut c, 2, n(10), T0 + 1000); give(&mut c, 2, Card::LastStand, T0 + 3 * HOUR);
    c.energy = 30;
    ctx(2, 0, T0 + 2000);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.play_card(Card::LastStand, None); }));
    assert!(r.is_err(), "no dip yet");
    ctx(1, 1, T0 + 3000); let _ = c.sell(U128(t), None); // the whale dumps: the price falls well below its hourly high
    ctx(2, 0, T0 + 4000);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.play_card(Card::LastStand, None); }));
    assert!(r.is_err(), "a dump in the same hour can't trigger it");
    buy(&mut c, 2, n(2), T0 + HOUR + 5000); // a trade in the next hour records the low price
    let (pot, burned) = (c.pot, c.burned);
    ctx(2, 0, T0 + 3 * HOUR + 10); c.play_card(Card::LastStand, None);
    assert!(c.pot < pot && c.burned > burned, "the pot bought and burned the dip");
    assert!(pot - c.pot <= bps(pot, LAST_STAND_BPS) + 1);
}

#[test]
fn a_pump_and_dump_in_one_hour_cannot_trigger_last_stand() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(400), T0);                       // a quiet earlier hour at the normal price
    buy(&mut c, 2, n(10), T0 + 1000); give(&mut c, 2, Card::LastStand, T0 + 3 * HOUR);
    buy(&mut c, 4, n(2), T0 + HOUR / 2);
    c.energy = 30;
    let t3 = buy(&mut c, 3, n(100), T0 + 2 * HOUR + 1000); // the pump sets a new high inside this hour
    ctx(3, 1, T0 + 2 * HOUR + 2000); let _ = c.sell(U128(t3), None); // and the dump brings it back
    ctx(2, 0, T0 + 2 * HOUR + 3000);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.play_card(Card::LastStand, None); }));
    assert!(r.is_err(), "the pump raised the 24h high only inside the current hour, which doesn't count");
}

// ------------------------------------------------------------------ new cards, batch 2: the Table (Stampede, Squeeze, Supernova, Black Hole, Harvest, Whale Tax, Alliance)
/// A coin with `holders` qualified wallets (30 NEAR each, held for hours), at the given level, with the Energy set.
fn crowd(holders: usize, level: u8, energy: u32) -> (Coin, u64) {
    let mut c = launch(vec![]);
    for i in 1..=holders { buy(&mut c, i, n(30), T0 + i as u64); }
    c.level = level; while c.level_at.len() < level as usize { c.level_at.push(T0 + HOUR); }
    c.energy = energy;
    (c, T0 + 3 * HOUR)
}

#[test]
fn stampede_buys_as_one_batch_and_the_pot_matches_with_ten_wallets() {
    let (mut c, t) = crowd(12, 2, 40);
    give(&mut c, 1, Card::Stampede, T0);
    ctx(1, 0, t); let id = c.play_card(Card::Stampede, None);
    assert_eq!(c.get_table()[0].phase, 1, "the crowd window opens at once");
    assert_eq!(c.energy, 20);
    let (b0, b30) = (bal(&c, 2), bal(&c, 3));
    for i in 2..=11 { ctx(i, n(1), t + 1000 + i as u64); c.rush(id); }
    let pot = c.pot;
    ctx(1, 0, t + RUSH_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    let h = c.get_history();
    assert!(h[0].result.contains("10 wallets") && h[0].result.contains("the pot matched"), "{}", h[0].result);
    assert!(c.pot < pot, "the pot paid its match");
    let gain = bal(&c, 2) - b0;
    let g3 = bal(&c, 3) - b30;
    assert!(gain > 0);
    assert!(gain.abs_diff(g3) <= gain / 100 + 2, "about one average price for everyone: {gain} vs {g3}");
    check_supply(&mut c, &(1..=12).collect::<Vec<_>>(), t + 2 * HOUR);
}
#[test]
fn stampede_with_fewer_than_ten_wallets_gets_no_match() {
    let (mut c, t) = crowd(6, 2, 40);
    give(&mut c, 1, Card::Stampede, T0);
    ctx(1, 0, t); let id = c.play_card(Card::Stampede, None);
    for i in 2..=5 { ctx(i, n(1), t + 1000 + i as u64); c.rush(id); }
    let pot = c.pot;
    ctx(1, 0, t + RUSH_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    assert!(!c.get_history()[0].result.contains("matched"));
    assert!(c.pot >= pot, "nothing taken from the pot");
    check_supply(&mut c, &(1..=6).collect::<Vec<_>>(), t + 2 * HOUR);
}

#[test]
fn squeeze_needs_a_lopsided_prophecy_and_then_matches_half() {
    let (mut c, t) = crowd(16, 3, 100);
    give(&mut c, 1, Card::Prophecy, T0); give(&mut c, 2, Card::Squeeze, T0);
    ctx(2, 0, t);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.play_card(Card::Squeeze, None); }));
    assert!(r.is_err(), "no Prophecy yet");
    ctx(1, 0, t); let pid = c.play_card(Card::Prophecy, Some(Question::Tide));
    for i in 3..=5 { ctx(i, 0, t + 1000 + i as u64); c.back(pid); }
    ctx(6, 0, t + BACK_WINDOW + 1); c.poke();
    let stake = bal(&c, 6) / 20;
    ctx(7, 1, t + BACK_WINDOW + 10); c.bet(pid, true, U128(stake));
    ctx(8, 1, t + BACK_WINDOW + 11); c.bet(pid, false, U128(stake * 2));
    ctx(2, 0, t + BACK_WINDOW + 20); let id = c.play_card(Card::Squeeze, None);
    for i in (3..=6).chain(9..=14) { ctx(i, n(1), t + BACK_WINDOW + 30 + i as u64); c.rush(id); } // not the two bettors, who can't trade
    let pot = c.pot;
    ctx(2, 0, t + BACK_WINDOW + 20 + RUSH_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    let res = c.get_history().iter().find(|p| p.card == Card::Squeeze).unwrap().result.clone();
    assert!(res.contains("the pot matched"), "{res}");
    assert!(pot - c.pot <= bps(pot, RUSH_POT_CAP_BPS) + 1);
}

#[test]
fn supernova_needs_signers_and_spends_what_the_daily_cap_allows() {
    let (mut c, t) = crowd(10, 3, 100);
    give(&mut c, 1, Card::Supernova, T0);
    ctx(1, 0, t); let id = c.play_card(Card::Supernova, None);
    for i in 2..=9 { ctx(i, 0, t + 1000 + i as u64); c.sign(id); }
    let (pot, burned) = (c.pot, c.burned);
    ctx(1, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    assert!(c.get_table().is_empty(), "{:?}", c.get_history().last().map(|p| p.result.clone()));
    assert!(c.burned > burned && c.pot < pot);
    assert!(pot - c.pot <= bps(pot, POT_DAILY_BPS) + 1, "inside the 75% daily cap");
    assert_eq!(c.get_coin().heat, HEAT_MAX);
    assert_eq!(c.energy, 0);
}

#[test]
fn supernova_fails_without_enough_signers_and_returns_the_card() {
    let (mut c, t) = crowd(10, 3, 100);
    give(&mut c, 1, Card::Supernova, T0);
    ctx(1, 0, t); let id = c.play_card(Card::Supernova, None);
    for i in 2..=4 { ctx(i, 0, t + 1000 + i as u64); c.sign(id); }
    ctx(1, 0, t + BACK_WINDOW + 1); c.poke();
    assert!(c.get_history()[0].result.starts_with("failed"));
    assert!(c.get_hand(acc(1)).unwrap().cards.iter().any(|x| x.card == Card::Supernova), "the card is back");
    assert_eq!(c.energy, 100, "no Energy was spent");
}

#[test]
fn black_hole_burns_what_is_thrown_and_the_reward_pool_gives_some_back() {
    let (mut c, t) = crowd(6, 2, 60);
    give(&mut c, 1, Card::BlackHole, T0);
    ctx(1, 0, t); let id = c.play_card(Card::BlackHole, None);
    for i in 2..=4 { ctx(i, 0, t + 1000 + i as u64); c.sign(id); }
    ctx(5, 0, t + BACK_WINDOW + 1); c.poke();
    assert_eq!(c.get_table()[0].phase, 1, "the throwing window is open");
    let (b2, b3) = (bal(&c, 2), bal(&c, 3));
    ctx(2, 1, t + BACK_WINDOW + 10); c.throw_in(id, U128(b2 / 2));
    ctx(3, 1, t + BACK_WINDOW + 11); c.throw_in(id, U128(b3 / 4));
    assert_eq!(c.bets_held, b2 / 2 + b3 / 4);
    let (burned, rp) = (c.burned, c.reward_pool);
    ctx(5, 0, t + BACK_WINDOW + THROW_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    assert!(c.get_table().is_empty());
    assert!(c.burned - burned >= b2 / 2 + b3 / 4 - 5, "everything thrown is burned");
    assert!(rp > c.reward_pool, "the reward pool gave some back");
    assert_eq!(c.bets_held, 0);
    assert_eq!(c.pending_held, c.pending.iter().map(|p| p.tokens.0).sum::<u128>());
    ctx(2, 0, t + 3 * HOUR); let got = c.claim_payouts().0;
    assert!(got > 0 && got <= HOLE_RETURN_CAP, "the return is capped");
    assert_eq!(c.holder(&acc(2)).next_pack, 0, "a top thrower gets a pack ready");
    assert!(bal(&c, 2) > b2 - b2 / 2, "and some tokens back");
    ctx(3, 0, t + 3 * HOUR); c.claim_payouts();
    assert_eq!(c.pending_held, 0); assert!(c.pending.is_empty());
    check_supply(&mut c, &(1..=6).collect::<Vec<_>>(), t + 3 * HOUR);
}

#[test]
fn harvest_pays_25_shares_to_wallets_that_checked_in() {
    let (mut c, t) = crowd(6, 2, 60);
    give(&mut c, 1, Card::Harvest, T0);
    for i in 1..=6 { ctx(i, 0, t - 10 * MIN); c.gm(); }
    ctx(1, 0, t); let id = c.play_card(Card::Harvest, None);
    for i in 2..=4 { ctx(i, 0, t + 1000 + i as u64); c.sign(id); }
    ctx(5, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    assert!(c.get_coin().harvest_until > 0 && c.harvest.is_some());
    let before = bal(&c, 5); let rp = c.reward_pool;
    ctx(5, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 2); let got = c.harvest_claim().0;
    assert_eq!(got, HARVEST_EACH); assert_eq!(bal(&c, 5), before + HARVEST_EACH); assert_eq!(rp - c.reward_pool, HARVEST_EACH);
    check_supply(&mut c, &(1..=6).collect::<Vec<_>>(), t + 2 * HOUR);
}

#[test]
#[should_panic(expected = "already took your share")]
fn harvest_is_one_share_per_wallet() {
    let (mut c, t) = crowd(6, 2, 60);
    give(&mut c, 1, Card::Harvest, T0);
    for i in 1..=6 { ctx(i, 0, t - 10 * MIN); c.gm(); }
    ctx(1, 0, t); let id = c.play_card(Card::Harvest, None);
    for i in 2..=4 { ctx(i, 0, t + 1000 + i as u64); c.sign(id); }
    ctx(5, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    ctx(5, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 2); c.harvest_claim();
    ctx(5, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 3); c.harvest_claim();
}

#[test]
#[should_panic(expected = "you need a gm")]
fn harvest_needs_a_recent_gm() {
    let (mut c, t) = crowd(6, 2, 60);
    give(&mut c, 1, Card::Harvest, T0);
    ctx(1, 0, t - 10 * MIN); c.gm();
    ctx(1, 0, t); let id = c.play_card(Card::Harvest, None);
    for i in 2..=4 { ctx(i, 0, t + 1000 + i as u64); let _ = c.sign(id); }
    ctx(5, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    ctx(6, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 2); c.harvest_claim();
}

#[test]
fn whale_tax_adds_one_percent_on_big_wallets_selling_for_2h() {
    let (mut c, t) = crowd(6, 2, 60);
    give(&mut c, 1, Card::WhaleTax, T0);
    buy(&mut c, 7, n(150), T0 + 10); buy(&mut c, 8, n(5), T0 + 11);
    ctx(1, 0, t); let id = c.play_card(Card::WhaleTax, None);
    for i in 2..=4 { ctx(i, 0, t + 1000 + i as u64); c.sign(id); }
    ctx(5, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    assert!(c.whale_until > t);
    let whale = bal(&c, 7); assert!(whale > bps(SUPPLY, crate::trade::WHALE_CAP_BPS), "wallet 7 holds over 2% of supply");
    let now = t + BACK_WINDOW + FIRE_JITTER_MS + 100;
    ctx(7, 0, now); let q = c.quote_sell(U128(whale / 10), Some(acc(7)));
    let small = c.quote_sell(U128(bal(&c, 8) / 2), Some(acc(8)));
    let gross = q.near_out.0 + q.fee.0 + q.tax.0;
    assert!(q.tax.0 >= bps(gross, crate::trade::WHALE_TAX_BPS) && small.tax.0 == 0, "only the whale pays");
    ctx(7, 1, now + 1); let _ = c.sell(U128(whale / 10), None);
    let later = c.whale_until + 10;
    ctx(7, 0, later); let q2 = c.quote_sell(U128(c.ft_balance_of(acc(7)).0 / 10), Some(acc(7)));
    assert_eq!(q2.tax.0, 0, "over after 2h");
}

#[test]
fn alliance_blocks_raids_between_the_two_coins_for_6h() {
    let (mut c, t) = crowd(6, 2, 60);
    give(&mut c, 1, Card::Alliance, T0);
    ctx(1, 0, t); let id = c.play_alliance(moth());
    for i in 2..=4 { ctx(i, 0, t + 1000 + i as u64); c.sign(id); }
    ctx(5, 0, t + BACK_WINDOW + FIRE_JITTER_MS + 1); c.poke();
    let at = t + BACK_WINDOW + FIRE_JITTER_MS + 100;
    assert_eq!(c.get_coin().ally, Some(moth()));
    ctx(1, 0, at);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.start_raid(moth()); }));
    assert!(r.is_err(), "allied: no raid on the ally");
    ctx_as(moth(), 0, at, vec![]);
    assert!(!c.raid_accept(7, 2, at, false, 0), "and the ally can't raid us");
    ctx(5, 0, at + 7 * HOUR); assert_eq!(c.get_coin().ally, None, "the pact ends after 6h");
}

#[test]
fn an_ally_pact_is_accepted_from_a_sibling_only_once() {
    let mut c = launch(vec![]);
    ctx_as(moth(), 0, T0 + 10, vec![]);
    assert!(c.ally_accept(T0 + 10 + ALLIANCE_LEN));
    ctx_as("toad.rulecard.testnet".parse().unwrap(), 0, T0 + 20, vec![]);
    assert!(!c.ally_accept(T0 + 20 + ALLIANCE_LEN), "one pact at a time");
}

#[test]
#[should_panic(expected = "only Rulecard coins")]
fn only_siblings_can_make_a_pact() {
    let mut c = launch(vec![]);
    ctx_as("mallory.testnet".parse().unwrap(), 0, T0 + 10, vec![]);
    c.ally_accept(T0 + 10 + ALLIANCE_LEN);
}

// ------------------------------------------------------------------ new cards, batch 3: raid cards (Mirror, Counterspell, Decoy, Scout, Friendly Raid, Hard Raid)
#[test]
fn mirror_copies_the_enemys_last_tactic_counterspell_cancels_and_decoy_does_nothing() {
    let base = [10_000u128; 3];
    // Mirror in round 2 copies their Curse from round 1, so they get cursed back
    let (a, b, _) = score_rounds(&base, &[0, 40, 0], &base, &[20, 0, 0]);
    assert_eq!((a[0], b[0]), (9_500, 10_000), "their round 1 Curse hits me");
    assert_eq!((a[1], b[1]), (10_000, 9_500), "my Mirror copies it: I curse them in round 2");
    assert_eq!(a[2], 10_000);
    // Mirror in round 1 has nothing to copy
    let (a, b, _) = score_rounds(&base, &[40, 0, 0], &base, &[0, 0, 0]);
    assert_eq!((a[0], b[0]), (10_000, 10_000));
    // Counterspell cancels their Rally
    let (_, b, _) = score_rounds(&base, &[50, 0, 0], &base, &[10, 0, 0]);
    assert_eq!(b[0], 10_000, "their Rally was cancelled");
    let (_, b, _) = score_rounds(&base, &[0, 0, 0], &base, &[10, 0, 0]);
    assert_eq!(b[0], RALLY_TIER0, "without it the Rally counts");
    // Counterspell against a Curse protects me
    let (a, _, _) = score_rounds(&base, &[50, 0, 0], &base, &[20, 0, 0]);
    assert_eq!(a[0], 10_000, "their Curse was cancelled");
    // two Counterspells cancel each other
    let (a, b, _) = score_rounds(&base, &[50, 0, 0], &base, &[50, 0, 0]);
    assert_eq!((a[0], b[0]), (10_000, 10_000));
    // a Decoy does nothing and does not protect against a Curse
    let (a, _, _) = score_rounds(&base, &[60, 0, 0], &base, &[20, 0, 0]);
    assert_eq!(a[0], 9_500, "a Decoy is not a Ward");
}
const RALLY_TIER0: u128 = 10_500;

#[test]
fn rare_tactic_cards_go_into_a_plan_and_come_back_out() {
    let (mut c, t) = raid_ready();
    give(&mut c, 1, Card::Mirror, T0); give(&mut c, 1, Card::Decoy, T0);
    ctx_as(moth(), 0, t, vec![]);
    assert!(c.raid_accept(7, 2, t, false, 0));
    ctx(1, 0, t + 1000); c.set_plan(vec![Some(Card::Mirror), Some(Card::Decoy), None]);
    assert_eq!(c.holder(&acc(1)).slots[..2], [4, 6]);
    assert!(c.get_hand(acc(1)).unwrap().cards.iter().all(|x| x.card != Card::Mirror), "the Mirror is in the plan");
    ctx(1, 0, t + 2000); c.set_plan(vec![None, Some(Card::Decoy), None]);
    assert!(c.get_hand(acc(1)).unwrap().cards.iter().any(|x| x.card == Card::Mirror), "taken out of the plan, it is back in the hand");
}

#[test]
#[should_panic(expected = "only Rally, Curse, Ward, Mirror, Counterspell or Decoy")]
fn a_plan_only_takes_tactic_cards() {
    let (mut c, t) = raid_ready();
    ctx_as(moth(), 0, t, vec![]);
    assert!(c.raid_accept(7, 2, t, false, 0));
    ctx(1, 0, t + 1000); c.set_plan(vec![Some(Card::Ember), None, None]);
}

#[test]
fn a_friendly_raid_takes_no_spoils_and_a_hard_raid_takes_double_and_hangs_a_banner() {
    for (kind, expect) in [(0u8, 1_500u128), (1, 0), (2, 3_000)] {
        let (mut c, t) = raid_ready();
        ctx_as(moth(), 0, t, vec![]);
        assert!(c.raid_accept(7, 2, t, false, kind));
        assert_eq!(c.raid.as_ref().unwrap().kind, kind);
        let pot = c.pot;
        ctx_as(moth(), 0, t + RAID_LEN + 5, vec![]);
        c.raid_finish(7, -1, 1_500, vec![U128(9_000); 3], vec![U128(10_000); 3]);
        assert_eq!(c.pot, pot - bps(pot, expect), "kind {kind}: spoils {expect} bps");
        assert_eq!(c.get_coin().banner_by, if kind == 2 { Some(moth()) } else { None }, "only a Hard Raid flies a banner");
    }
}

#[test]
fn starting_a_friendly_raid_spends_the_card_and_20_energy() {
    let (mut c, t) = raid_ready();
    give(&mut c, 1, Card::FriendlyRaid, T0); c.energy = 30;
    ctx(1, 0, t); c.start_friendly_raid(moth());
    assert_eq!(c.raid.as_ref().unwrap().kind, 1);
    assert_eq!(c.energy, 10);
    assert!(c.get_hand(acc(1)).unwrap().cards.iter().all(|x| x.card != Card::FriendlyRaid));
}

#[test]
#[should_panic(expected = "you don't have that card")]
fn a_hard_raid_needs_the_card() {
    let (mut c, t) = raid_ready(); c.energy = 60;
    ctx(1, 0, t); c.start_hard_raid(moth());
}

#[test]
fn scout_asks_the_enemy_for_its_next_tactic_and_a_decoy_looks_real() {
    let (mut c, t) = raid_ready();
    for i in 1..=4 { give(&mut c, i, Card::Decoy, T0); }
    give(&mut c, 1, Card::Scout, T0); c.energy = 20;
    ctx_as(moth(), 0, t, vec![]);
    assert!(c.raid_accept(7, 2, t, false, 0));
    for i in 1..=4 { ctx(i, 0, t + 1000 + i as u64); c.set_plan(vec![Some(Card::Decoy), None, None]); }
    // the other side's scout asks us what we planned for round 1
    ctx_as(moth(), 0, t + 5000, vec![]);
    let code = c.raid_peek(7, 0);
    assert!((1..=3).contains(&(code / 10)), "a Decoy is shown as a real tactic: {code}");
    // our own scout writes the answer into the raid
    ctx(1, 0, t + 6000); let _ = c.scout();
    assert_eq!(c.energy, 15, "Scout costs 5 Energy");
    ctx_as(me(), 0, t + 7000, vec![ok_json("30")]); c.on_scout(7, 0);
    assert_eq!(c.get_raid().unwrap().scout[0], 30);
}

#[test]
#[should_panic(expected = "not your raid")]
fn only_the_enemy_coin_may_peek_at_a_plan() {
    let (mut c, t) = raid_ready();
    ctx_as(moth(), 0, t, vec![]);
    assert!(c.raid_accept(7, 2, t, false, 0));
    ctx_as("toad.rulecard.testnet".parse().unwrap(), 0, t + 10, vec![]);
    c.raid_peek(7, 0);
}

// ------------------------------------------------------------------ new cards, batch 4: Hedge, Counterspell, Duel, Bounty
#[test]
fn hedge_makes_a_loser_lose_a_quarter_and_trims_a_winners_gain() {
    let mut c = launch(vec![]);
    for i in 1..=11 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Prophecy, T0 + HOUR); give(&mut c, 7, Card::Hedge, T0); give(&mut c, 2, Card::Hedge, T0);
    c.energy = 40;
    let t0 = T0 + 2 * HOUR;
    ctx(1, 0, t0); let id = c.play_card(Card::Prophecy, Some(Question::Tide));
    ctx(2, 0, t0 + 1); c.back(id); ctx(3, 0, t0 + 2); c.back(id);
    ctx(4, 0, t0 + BACK_WINDOW + 1); c.poke();
    let stake = bal(&c, 2) / 10;
    for i in 2..=9 { ctx(i, 1, t0 + BACK_WINDOW + 10 + i as u64); c.bet(id, i <= 6, U128(stake)); } // wallets 2-6 Yes, 7-9 No
    ctx(7, 0, t0 + BACK_WINDOW + 40); c.hedge(id);
    ctx(2, 0, t0 + BACK_WINDOW + 41); c.hedge(id);
    buy(&mut c, 10, n(5), t0 + BACK_WINDOW + BET_WINDOW + HOUR);
    let (b2, b3, b7, b8) = (bal(&c, 2), bal(&c, 3), bal(&c, 7), bal(&c, 8));
    ctx(11, 0, t0 + BACK_WINDOW + BET_WINDOW + PROPHECY_LEN + 1); c.poke();
    assert_eq!(c.get_history()[0].result, "answer: Yes");
    claim_all(&mut c, &(1..=11).collect::<Vec<_>>(), t0 + 3 * HOUR);
    assert_eq!(bal(&c, 7) - b7, stake - stake / 4, "the hedged loser keeps 75%");
    assert_eq!(bal(&c, 8) - b8, stake - stake / 2, "an unhedged loser keeps 50%");
    let pool = stake / 4 + 2 * (stake / 2);
    let g = pool * 6 / 10 / 5; // one winner's share before the hedge
    assert!(close(bal(&c, 3) - b3, stake + g), "an unhedged winner gets its share");
    assert!(close(bal(&c, 2) - b2, stake + g * 3 / 4), "a hedged winner gets 25% less of the gain");
    assert_eq!(c.bets_held, 0);
    check_supply(&mut c, &(1..=11).collect::<Vec<_>>(), t0 + 4 * HOUR);
}

#[test]
#[should_panic(expected = "you have no bet")]
fn hedge_needs_a_bet() {
    let mut c = launch(vec![]);
    for i in 1..=4 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Prophecy, T0); give(&mut c, 4, Card::Hedge, T0); c.energy = 40;
    let t0 = T0 + 2 * HOUR;
    ctx(1, 0, t0); let id = c.play_card(Card::Prophecy, Some(Question::Tide));
    ctx(2, 0, t0 + 1); c.back(id); ctx(3, 0, t0 + 2); c.back(id);
    ctx(2, 0, t0 + BACK_WINDOW + 1); c.poke();
    ctx(4, 0, t0 + BACK_WINDOW + 10); c.hedge(id);
}

#[test]
fn a_counterspell_cancels_a_card_that_is_still_gathering_backers() {
    let mut c = launch(vec![]);
    for i in 1..=4 { buy(&mut c, i, n(10), T0 + i as u64); }
    give(&mut c, 1, Card::Ember, T0); give(&mut c, 2, Card::Counterspell, T0);
    c.energy = 30;
    ctx(1, 0, T0 + HOUR); let id = c.play_card(Card::Ember, None);
    ctx(2, 0, T0 + HOUR + 1000); c.counterspell_card(id);
    assert!(c.get_table().is_empty());
    assert_eq!(c.get_history()[0].result, "failed: countered");
    assert_eq!(c.holder(&acc(1)).commons[Card::Ember.common_index().unwrap()], 1, "the Ember went back to its owner");
    assert_eq!(c.energy, 10, "the Counterspell cost 20 Energy");
}

#[test]
#[should_panic(expected = "you can't counter your own card")]
fn you_cant_counter_your_own_card() {
    let mut c = launch(vec![]);
    buy(&mut c, 1, n(10), T0);
    give(&mut c, 1, Card::Ember, T0); give(&mut c, 1, Card::Counterspell, T0); c.energy = 30;
    ctx(1, 0, T0 + HOUR); let id = c.play_card(Card::Ember, None);
    ctx(1, 0, T0 + HOUR + 10); c.counterspell_card(id);
}

#[test]
fn a_duel_pays_the_winner_the_pot_minus_ten_percent_and_locks_trading() {
    let mut c = launch(vec![]);
    for i in 1..=4 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Duel, T0); c.energy = 30;
    let stake = bal(&c, 1) / 10; let (a0, b0) = (bal(&c, 1), bal(&c, 2));
    ctx(1, 0, T0 + HOUR); let id = c.duel_challenge(acc(2), U128(stake), true);
    assert_eq!(bal(&c, 1), a0 - stake);
    ctx(2, 0, T0 + HOUR + 1000); c.duel_accept(id);
    assert_eq!(c.bets_held, bal_stake_sum(stake));
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { ctx(2, 1, T0 + HOUR + 2000); c.sell(U128(1), None); }));
    assert!(r.is_err(), "a duelist can't trade");
    buy(&mut c, 3, n(5), T0 + HOUR + 20 * MIN); // the coin is a net buyer, so the Yes side wins
    let burned = c.burned;
    ctx(4, 0, T0 + HOUR + 1000 + DUEL_LEN + 1); c.poke();
    assert!(c.get_duels()[0].result.starts_with("winner"), "{}", c.get_duels()[0].result);
    assert_eq!(bal(&c, 1), a0 - stake + 2 * stake - bps(2 * stake, DUEL_BURN_BPS), "the challenger wins both stakes minus 10%");
    assert_eq!(bal(&c, 2), b0 - stake);
    assert!(c.burned - burned >= bps(2 * stake, DUEL_BURN_BPS) - 1);
    assert_eq!(c.bets_held, 0);
    check_supply(&mut c, &[1, 2, 3, 4], T0 + 3 * HOUR);
}
fn bal_stake_sum(stake: u128) -> u128 { 2 * stake }

#[test]
fn an_unanswered_duel_is_refunded() {
    let mut c = launch(vec![]);
    for i in 1..=2 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Duel, T0); c.energy = 30;
    let stake = bal(&c, 1) / 10; let a0 = bal(&c, 1);
    ctx(1, 0, T0 + HOUR); let _ = c.duel_challenge(acc(2), U128(stake), false);
    ctx(2, 0, T0 + HOUR + DUEL_OPEN + 1); c.poke();
    assert_eq!(bal(&c, 1), a0, "refunded");
    assert!(c.get_duels()[0].result.starts_with("refunded"));
    assert_eq!(c.bets_held, 0);
}

#[test]
#[should_panic(expected = "closed, or not for you")]
fn only_the_challenged_wallet_can_accept() {
    let mut c = launch(vec![]);
    for i in 1..=3 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Duel, T0); c.energy = 30;
    ctx(1, 0, T0 + HOUR); let id = c.duel_challenge(acc(2), U128(bal(&c, 1) / 10), true);
    ctx(3, 0, T0 + HOUR + 10); c.duel_accept(id);
}

#[test]
fn a_met_bounty_pays_a_bonus_and_a_missed_one_burns_ten_percent() {
    for met in [true, false] {
        let mut c = launch(vec![]);
        let o = if met { 0 } else { 10 };
        for i in 1..=4 { buy(&mut c, i + o, n(20), T0 + i as u64); }
        give(&mut c, o + 1, Card::Bounty, T0); c.energy = 30;
        let pledge = bal(&c, o + 1) / 10; let p2 = bal(&c, o + 2) / 20;
        let (a0, b0) = (bal(&c, o + 1), bal(&c, o + 2));
        ctx(o + 1, 0, T0 + HOUR); let id = c.bounty_open(Question::Crowd { n: 3 }, U128(pledge));
        ctx(o + 2, 0, T0 + HOUR + 10); c.bounty_pledge(id, U128(p2));
        assert_eq!(c.bets_held, pledge + p2);
        if met { for k in 5..=7 { buy(&mut c, k, n(5), T0 + 2 * HOUR + k as u64); } } // three new wallets: the goal is met
        let rp = c.reward_pool; let burned = c.burned;
        ctx(o + 4, 0, T0 + HOUR + BOUNTY_LEN + 1); c.poke();
        assert_eq!(c.bets_held, 0);
        let b = c.get_bounties()[0].clone();
        ctx(o + 1, 0, T0 + HOUR + BOUNTY_LEN + 2); c.claim_payouts();
        ctx(o + 2, 0, T0 + HOUR + BOUNTY_LEN + 3); c.claim_payouts();
        assert_eq!(c.pending_held, 0);
        if met {
            assert!(b.result.starts_with("goal met"), "{}", b.result);
            assert!(bal(&c, o + 1) > a0 && bal(&c, o + 2) > b0, "pledgers got a bonus");
            assert!(rp > c.reward_pool, "from the reward pool");
        } else {
            assert!(b.result.starts_with("goal missed"), "{}", b.result);
            assert_eq!(bal(&c, o + 1), a0 - bps(pledge, BOUNTY_MISS_BURN_BPS), "90% back");
            assert!(c.burned - burned >= bps(pledge + p2, BOUNTY_MISS_BURN_BPS) - 2, "10% burned");
        }
        let hs: Vec<usize> = if met { vec![1, 2, 3, 4, 5, 6, 7] } else { vec![11, 12, 13, 14] };
        check_supply(&mut c, &hs, T0 + 10 * HOUR);
    }
}

#[test]
#[should_panic(expected = "Tide")]
fn a_bounty_cannot_ask_the_tide_question() {
    let mut c = launch(vec![]);
    for i in 1..=2 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Bounty, T0); c.energy = 30;
    ctx(1, 0, T0 + HOUR); c.bounty_open(Question::Tide, U128(bal(&c, 1) / 10));
}

#[test]
fn a_hard_raid_that_never_launches_gives_back_its_card_and_energy() {
    let (mut c, t) = raid_ready();
    give(&mut c, 1, Card::HardRaid, T0); c.energy = 60;
    ctx(1, 0, t); c.start_hard_raid(moth());
    assert_eq!(c.energy, 10);
    ctx(3, 0, t + RAID_BACK + 1);
    assert!(matches!(c.launch_raid(), near_sdk::PromiseOrValue::Value(false)), "not enough signers");
    assert_eq!(c.energy, 60, "the Energy is back");
    assert!(c.get_hand(acc(1)).unwrap().cards.iter().any(|x| x.card == Card::HardRaid), "and the card");
}

#[test]
fn a_rival_raiding_first_cancels_the_proposal_and_refunds_it() {
    let (mut c, t) = raid_ready();
    give(&mut c, 1, Card::HardRaid, T0); c.energy = 60;
    ctx(1, 0, t); c.start_hard_raid(moth());
    assert!(c.raid.as_ref().unwrap().attacking && c.raid.as_ref().unwrap().phase == 0);
    ctx_as(moth(), 0, t + 5, vec![]);
    assert!(c.raid_accept(7, 2, t + 5, false, 0), "the coin can still be raided");
    let r = c.raid.as_ref().unwrap();
    assert!(!r.attacking, "now it is the defender");
    assert_eq!(c.get_raids().pop().unwrap().note, "cancelled: the coin was raided first");
    assert_eq!(c.energy, 60, "the cancelled Hard Raid gave its Energy back");
    assert!(c.get_hand(acc(1)).unwrap().cards.iter().any(|x| x.card == Card::HardRaid));
}

#[test]
fn a_friendly_raid_does_not_use_up_a_blood_moon() {
    let (mut c, t) = raid_ready();
    give(&mut c, 1, Card::FriendlyRaid, T0); c.energy = 30;
    c.blood_until = t + HOUR;
    ctx(1, 0, t); c.start_friendly_raid(moth());
    assert!(!c.raid.as_ref().unwrap().blood);
    assert_eq!(c.blood_until, t + HOUR, "the Omen is still there for a real raid");
}

#[test]
fn one_wallet_cannot_fill_the_black_hole_or_a_crowd_card() {
    let (mut c, t) = crowd(6, 2, 60);
    give(&mut c, 1, Card::BlackHole, T0);
    ctx(1, 0, t); let id = c.play_card(Card::BlackHole, None);
    for i in 2..=4 { ctx(i, 0, t + 1000 + i as u64); c.sign(id); }
    ctx(5, 0, t + BACK_WINDOW + 1); c.poke();
    let b2 = bal(&c, 2);
    for k in 0..10 { ctx(2, 1, t + BACK_WINDOW + 10 + k); c.throw_in(id, U128(b2 / 40)); }
    assert_eq!(c.get_table()[0].bets.len(), 1, "ten throws from one wallet are one entry");
    assert_eq!(c.get_table()[0].bets[0].amount.0, 10 * (b2 / 40));
}

#[test]
#[should_panic(expected = "Hedge goes on a Prophecy that is still taking bets")]
fn hedge_is_only_for_the_betting_window() {
    let mut c = launch(vec![]);
    for i in 1..=11 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Prophecy, T0 + HOUR); give(&mut c, 7, Card::Hedge, T0);
    c.energy = 40;
    let t0 = T0 + 2 * HOUR;
    ctx(1, 0, t0); let id = c.play_card(Card::Prophecy, Some(Question::Tide));
    ctx(2, 0, t0 + 1); c.back(id); ctx(3, 0, t0 + 2); c.back(id);
    ctx(4, 0, t0 + BACK_WINDOW + 1); c.poke();
    let stake = bal(&c, 7) / 10;
    ctx(7, 1, t0 + BACK_WINDOW + 10); c.bet(id, false, U128(stake));
    ctx(7, 0, t0 + BACK_WINDOW + BET_WINDOW + 5); c.hedge(id); // betting has closed: too late
}

#[test]
fn a_crowd_card_takes_at_most_40_contributors_and_merges_a_wallets_chips() {
    let (mut c, t) = crowd(6, 2, 60);
    give(&mut c, 1, Card::Stampede, T0);
    ctx(1, 0, t); let id = c.play_card(Card::Stampede, None);
    for k in 0..3 { ctx(2, n(1), t + 100 + k); c.rush(id); }
    assert_eq!(c.get_table()[0].chips.len(), 1, "the same wallet is one entry");
    // fill the list with synthetic contributors up to the cap, then one more wallet must be refused
    for k in 0..(CHIP_MAX - 1) { let acct: AccountId = format!("w{k}.x.testnet").parse().unwrap(); c.table[0].chips.push(Chip { account: acct, near: U128(GN / 10) }); }
    ctx(3, n(1), t + 200);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.rush(id); }));
    assert!(r.is_err(), "the 41st contributor is refused");
}

#[test]
#[should_panic(expected = "too many payouts are waiting")]
fn a_card_that_queues_payouts_needs_room_for_a_full_house() {
    let mut c = launch(vec![]);
    for i in 1..=3 { buy(&mut c, i, n(20), T0 + i as u64); }
    // 170 entries already waiting leave no room for a 41-bettor Prophecy (cap 200)
    for _ in 0..170 { c.pending.push(crate::stakes::Payout { account: acc(9), tokens: U128(0), pack: false, at: T0 + 2 * HOUR, what: "x".into() }); }
    give(&mut c, 1, Card::Prophecy, T0 + HOUR); c.energy = 30;
    ctx(1, 0, T0 + 2 * HOUR); c.play_card(Card::Prophecy, Some(Question::Tide));
}

#[test]
fn an_unanswered_duel_gives_back_the_trade_lock() {
    let mut c = launch(vec![]);
    for i in 1..=2 { buy(&mut c, i, n(20), T0 + i as u64); }
    give(&mut c, 1, Card::Duel, T0); c.energy = 30;
    let prev = c.holder(&acc(1)).no_trade_until;
    ctx(1, 0, T0 + HOUR); let _ = c.duel_challenge(acc(2), U128(bal(&c, 1) / 10), false);
    assert!(c.holder(&acc(1)).no_trade_until > T0 + HOUR);
    ctx(2, 0, T0 + HOUR + DUEL_OPEN + 1); c.poke();
    assert_eq!(c.holder(&acc(1)).no_trade_until, prev);
}

// ------------------------------------------------------------------ a second fuzz run: every card, stake and omen at random
const ALL_CARDS: [Card; 29] = [
    Card::Rally, Card::Curse, Card::Ward, Card::Ember, Card::RollCall, Card::HypeSiren, Card::Kindle, Card::Scout, Card::Decoy, Card::Hedge,
    Card::Prophecy, Card::Mirror, Card::Counterspell, Card::LastStand, Card::SlowBurn, Card::Duel, Card::DiamondPool, Card::Bounty, Card::FriendlyRaid, Card::Recruit, Card::Stampede,
    Card::Inferno, Card::BlackHole, Card::Harvest, Card::HardRaid, Card::WhaleTax, Card::Alliance, Card::Squeeze, Card::Supernova,
];

/// Tokens set aside for bets, throws, duels and bounties must always add up to what the coin says it holds aside.
fn escrow_matches(c: &Coin, what: &str) {
    let table: u128 = c.table.iter().filter(|p| p.phase < 3).flat_map(|p| p.bets.iter()).map(|b| b.amount.0).sum();
    let duels: u128 = c.duels.iter().map(|d| match d.phase { 0 => d.stake.0, 1 => 2 * d.stake.0, _ => 0 }).sum();
    let bounties: u128 = c.bounties.iter().filter(|b| b.phase == 0).map(|b| b.total.0).sum();
    assert_eq!(c.pending_held, c.pending.iter().map(|p| p.tokens.0).sum::<u128>(), "{what}: pending payouts don't add up");
    assert!(c.pending.len() <= crate::stakes::PENDING_MAX, "{what}: the payout list grew past its cap");
    assert_eq!(c.bets_held, table + duels + bounties, "{what}: tokens set aside don't match the open bets, duels and bounties");
}

fn quiet<R>(f: impl FnOnce() -> R) { let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { f(); })); }

#[test]
fn random_card_operations_keep_every_invariant() {
    let users: Vec<usize> = (1..=12).collect();
    let env = |k: &str, d: u64| std::env::var(k).ok().and_then(|v| v.parse().ok()).unwrap_or(d);
    let (seeds, steps) = (env("RULECARD_FUZZ_SEEDS", 3), env("RULECARD_FUZZ_STEPS", 300) as u32);
    for seed in 0..seeds {
        fresh_storage();
        let mut c = launch(vec![]);
        let mut rng = Rng(0xC0FF_EE11 ^ (seed + 1) * 104_729);
        let mut ms = T0 + 1000;
        for i in 1..=12 { buy(&mut c, i, n(25), ms + i as u64); }
        ms += 4 * HOUR;
        c.level = 3; while c.level_at.len() < 3 { c.level_at.push(T0 + HOUR); }
        c.energy = 100;
        for step in 0..steps {
            ms += 500 + rng.below(20 * 60_000);
            let u = 1 + rng.below(12) as usize;
            let v = 1 + rng.below(12) as usize;
            let what = format!("seed {seed} step {step} user {u}");
            let card = ALL_CARDS[rng.below(29) as usize];
            match rng.below(100) {
                0..=9 => { give(&mut c, u, card, ms); }
                10..=14 => { c.energy = 40 + rng.below(61) as u32; }
                95..=99 if !c.get_pending(acc(u)).is_empty() => { ctx(u, 0, ms); quiet(|| { c.claim_payouts(); }); }
                15..=34 => {
                    ctx(u, 0, ms);
                    let q = match rng.below(4) { 0 => Question::Tide, 1 => Question::Crowd { n: 3 + rng.below(10) as u32 }, 2 => Question::Vault { bps: 100 + rng.below(500) as u32 }, _ => Question::Tide };
                    match card {
                        Card::Alliance => quiet(|| { c.play_alliance(moth()); }),
                        Card::Prophecy | Card::Ember | Card::Inferno | Card::BlackHole | Card::Harvest | Card::WhaleTax | Card::Supernova | Card::Stampede | Card::Squeeze
                        | Card::Kindle | Card::SlowBurn | Card::Recruit | Card::DiamondPool | Card::LastStand | Card::RollCall | Card::HypeSiren => quiet(|| { c.play_card(card, Some(q.clone())); }),
                        Card::Duel => { let a = c.ft_balance_of(acc(u)).0 / 20; quiet(|| { c.duel_challenge(acc(v), U128(a), rng.below(2) == 0); }) }
                        Card::Bounty => { let a = c.ft_balance_of(acc(u)).0 / 20; quiet(|| { c.bounty_open(q.clone(), U128(a)); }) }
                        _ => {}
                    }
                }
                35..=44 => { // join whatever is on the table
                    if let Some(p) = c.table.get(rng.below(c.table.len().max(1) as u64) as usize).cloned() {
                        match p.card {
                            Card::Ember | Card::Prophecy => { ctx(u, 0, ms); quiet(|| c.back(p.id)); }
                            Card::Squeeze | Card::Stampede => { ctx(u, n(1), ms); quiet(|| c.rush(p.id)); }
                            Card::BlackHole => { ctx(u, 1, ms); let a = c.ft_balance_of(acc(u)).0 / 30; quiet(|| c.throw_in(p.id, U128(a))); }
                            _ => { ctx(u, 0, ms); quiet(|| c.sign(p.id)); }
                        }
                        if p.card == Card::Ember { ctx(v, n(2), ms); quiet(|| c.stoke(p.id)); }
                        if p.card == Card::Inferno { ctx(v, n(3), ms); quiet(|| c.fuel(p.id)); }
                        if p.card == Card::Prophecy { ctx(v, 1, ms); let a = c.ft_balance_of(acc(v)).0 / 40; quiet(|| c.bet(p.id, rng.below(2) == 0, U128(a))); ctx(v, 0, ms); quiet(|| c.hedge(p.id)); }
                        ctx(v, 0, ms); quiet(|| c.counterspell_card(p.id));
                    }
                }
                45..=49 => { ctx(u, 0, ms); if let Some(d) = c.duels.get(rng.below(c.duels.len().max(1) as u64) as usize).cloned() { ctx_as(d.b.clone(), 0, ms, vec![]); quiet(|| c.duel_accept(d.id)); } }
                50..=54 => { if let Some(b) = c.bounties.get(rng.below(c.bounties.len().max(1) as u64) as usize).cloned() { ctx(u, 0, ms); let a = c.ft_balance_of(acc(u)).0 / 60; quiet(|| c.bounty_pledge(b.id, U128(a))); } }
                55..=59 => { ctx(u, 0, ms); quiet(|| { c.harvest_claim(); }); }
                60..=69 => { ctx(u, 0, ms); quiet(|| c.gm()); }
                70..=76 => { let amount = GN * (1 + rng.below(40)) as u128 + STORAGE_COST; ctx(u, amount, ms); quiet(|| { c.buy(None); }); }
                77..=82 => { ctx(u, 1, ms); let b = c.ft_balance_of(acc(u)).0; let a = b / 100 * (1 + rng.below(100)) as u128; if a > 0 { quiet(|| { c.sell(U128(a), None); }); } }
                83..=86 => { ctx(u, 1, ms); let b = c.ft_balance_of(acc(u)).0; let a = b / 100 * (1 + rng.below(40)) as u128; if a > 0 { quiet(|| { c.lock(U128(a), [6u8, 24, 72][rng.below(3) as usize]); }); } }
                87..=89 => { ctx(u, 0, ms); quiet(|| { c.claim_pack(); }); }
                90..=94 => { ctx(u, 0, ms); c.poke(); }
                _ => { ms += rng.below(30) * 3_600_000; }
            }
            invariants(&c, &users, &what);
            escrow_matches(&c, &what);
            if step % 25 == 24 { vault_sums(&c, &users, &what); }
            if step % 100 == 99 { check_supply(&mut c, &users, ms); }
        }
        ctx(1, 0, ms + 30 * HOUR); c.poke();
        invariants(&c, &users, &format!("seed {seed} end"));
        escrow_matches(&c, &format!("seed {seed} end"));
    }
}
