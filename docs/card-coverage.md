# Card coverage: what each card does, and the test that proves it

All 29 cards, the contract test that simulates the effect (`contracts/coin/src/tests.rs`, run at real and demo scale), and what
the player sees in the app (`src/app/chain/cards.test.ts` checks that every card has text, a face design and a play control, and that
every contract method and argument the controls send exists).

| Card | Tier | What it does | Contract test | In the app |
|---|---|---|---|---|
| Rally | Common | Your raid score ×1.05 to 1.10 | `score_rounds_follows_rally_curse_ward` | Raids tab plan |
| Curse | Common | Their score ×0.95 to 0.90, cancels their Rally | `score_rounds_follows_rally_curse_ward` | Raids tab plan |
| Ward | Common | Turns their Curse back | `score_rounds_follows_rally_curse_ward` | Raids tab plan |
| Ember | Common | Pot burns 1 to 3% with 3, 6 or 10 copies | `ember_fires_with_3_copies…`, `ember_without_3_copies_fails…`, `heat_makes_the_ember_burn_larger` | Put on the table, then Stoke |
| Roll Call | Common | gm gives ×2 Energy for 1h | `roll_call_doubles_gm_energy_for_an_hour` | Play |
| Hype Siren | Common | Pins the coin on Trending for 15 min, once an hour | `hype_siren_pins_the_coin…`, `hype_siren_is_once_per_coin_per_hour` | Play |
| Kindle | Common | Heat +1 (max 3), cools 1 an hour | `kindle_adds_heat_that_cools…`, `kindle_twice_in_6h_fails` | Play |
| Scout | Common | Peek at the enemy's next tactic | `scout_asks_the_enemy…`, `only_the_enemy_coin_may_peek_at_a_plan` | Raids tab |
| Decoy | Common | A fake play that looks real to a Scout | `mirror_copies…_decoy_does_nothing`, `scout_asks_the_enemy…` | Raids tab plan |
| Hedge | Common | A lost Prophecy bet costs a quarter, not half | `hedge_makes_a_loser_lose_a_quarter…`, `hedge_needs_a_bet`, `hedge_is_only_for_the_betting_window` | Hedge it (pick the bet) |
| Prophecy | Rare | A 2 hour question: losers lose half | `prophecy_pays_winners_caster_and_burns`, `bettors_cant_sell_until_it_resolves`, `prophecy_caster_share_settles_idle_burn_first` | Play (pick the question) |
| Mirror | Rare | Copies the enemy's last tactic | `mirror_copies_the_enemys_last_tactic…` | Raids tab plan |
| Counterspell | Rare | Cancels a tactic or a card still gathering backers | `a_counterspell_cancels_a_card…`, `you_cant_counter_your_own_card` | Raids tab plan, or Counter it |
| Last Stand | Rare | At 25% below the 24h high the pot buys and burns 10% | `last_stand_needs_a_25_percent_dip…`, `a_pump_and_dump_in_one_hour_cannot_trigger_last_stand` | Play |
| Slow Burn | Rare | 1% of every trade burns for 1h | `slow_burn_burns_one_percent_of_every_trade_for_an_hour` | Play |
| Duel | Rare | Two holders stake on net buying, winner takes both minus 10% | `a_duel_pays_the_winner…`, `an_unanswered_duel_is_refunded`, `only_the_challenged_wallet_can_accept` | Challenge |
| Diamond Pool | Rare | 24h locks get ×1.25 weight and +1% | `diamond_pool_boosts_24h_locks_and_adds_one_percent` | Play |
| Bounty | Rare | Pledge to a goal: +10% if met, 10% burns if missed | `a_met_bounty_pays_a_bonus…`, `a_bounty_cannot_ask_the_tide_question` | Open bounty |
| Friendly Raid | Rare | A raid with no spoils | `a_friendly_raid_takes_no_spoils…`, `starting_a_friendly_raid_spends_the_card_and_20_energy` | Propose (pick the coin) |
| Recruit | Rare | First big buy gets +5% locked 6h | `recruit_gives_a_first_big_buy_five_percent_locked_for_6h` | Play |
| Stampede | Rare | Crowd buys as one batch, +20% from the pot with 10 wallets | `stampede_buys_as_one_batch…`, `stampede_with_fewer_than_ten_wallets_gets_no_match` | Put on the table |
| Inferno | Epic | Crowd fuels, then the pot burns 10% plus half the fuel | `inferno_fuel_is_capped_and_buys_before_the_pot_burns` | Put on the table |
| Black Hole | Epic | Throw tokens in (they burn), the reward pool gives some back | `black_hole_burns_what_is_thrown…`, `one_wallet_cannot_fill_the_black_hole_or_a_crowd_card` | Put on the table |
| Harvest | Epic | 25 shares from the reward pool to wallets that checked in | `harvest_pays_25_shares…`, `harvest_is_one_share_per_wallet`, `harvest_needs_a_recent_gm` | Put on the table |
| Hard Raid | Epic | Double spoils both ways, the loser flies a banner | `a_friendly_raid_takes_no_spoils_and_a_hard_raid_takes_double…`, `a_hard_raid_needs_the_card`, `a_hard_raid_that_never_launches…` | Propose (pick the coin) |
| Whale Tax | Epic | Wallets over 2% pay +1% on sells for 2h | `whale_tax_adds_one_percent_on_big_wallets_selling_for_2h` | Put on the table |
| Alliance | Epic | A 6h no-raid pact with another coin | `alliance_blocks_raids_between_the_two_coins_for_6h`, `an_ally_pact_is_accepted_from_a_sibling_only_once`, `only_siblings_can_make_a_pact` | Propose pact |
| Squeeze | Epic | A lopsided Prophecy opens a Stampede with +50% | `squeeze_needs_a_lopsided_prophecy…` | Put on the table |
| Supernova | Mythic | The pot spends its daily cap at once, Heat jumps to 3 | `supernova_needs_signers_and_spends…`, `supernova_fails_without_enough_signers…` | Put on the table (many signers) |

Across all cards, `random_card_operations_keep_every_invariant` plays every card at random under four rule sets and checks the
supply identity, escrow and payout invariants after every step.

What these tests are: unit-level simulations of the contract (an in-memory coin with controlled time) and a check of the UI against the
contract's methods and arguments. They are not a full run through a browser and a wallet against a live chain. Do that once by hand
before relying on a card in a demo.
