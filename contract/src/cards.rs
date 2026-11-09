//! Card catalogue: same names, tiers and timings as src/engine/cards.ts.
use near_sdk::near;

pub const MIN: u64 = 60_000;
pub const HOUR: u64 = 60 * MIN;
pub const DAY: u64 = 24 * HOUR;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Tier { Common, Rare, Epic, Mythic }

impl Tier {
    pub fn level(self) -> u8 { match self { Tier::Common => 1, Tier::Rare => 2, Tier::Epic => 3, Tier::Mythic => 4 } }
    pub fn announce(self) -> u64 { match self { Tier::Common => 0, Tier::Rare => 2 * MIN, Tier::Epic => 5 * MIN, Tier::Mythic => 10 * MIN } }
    pub fn next(self) -> Option<Tier> { match self { Tier::Common => Some(Tier::Rare), Tier::Rare => Some(Tier::Epic), Tier::Epic => Some(Tier::Mythic), Tier::Mythic => None } }
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "camelCase")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CardType {
    Ward, Rally, TaxHoliday, RollCall, HypeSiren, Rebrand,
    Curse, Mirror, SlowBurn, HappyHour, DiamondPool, SummoningCircle, Prophecy, FriendlyRaid,
    Inferno, BlackHole, HardRaid,
    Supernova,
}

impl CardType {
    pub fn tier(self) -> Tier {
        use CardType::*;
        match self {
            Ward | Rally | TaxHoliday | RollCall | HypeSiren | Rebrand => Tier::Common,
            Curse | Mirror | SlowBurn | HappyHour | DiamondPool | SummoningCircle | Prophecy | FriendlyRaid => Tier::Rare,
            Inferno | BlackHole | HardRaid => Tier::Epic,
            Supernova => Tier::Mythic,
        }
    }
    pub fn name(self) -> &'static str {
        use CardType::*;
        match self {
            Ward => "Ward", Rally => "Rally", TaxHoliday => "Tax Holiday", RollCall => "Roll Call", HypeSiren => "Hype Siren", Rebrand => "Rebrand",
            Curse => "Curse", Mirror => "Mirror", SlowBurn => "Slow Burn", HappyHour => "Happy Hour", DiamondPool => "Diamond Pool",
            SummoningCircle => "Summoning Circle", Prophecy => "Prophecy", FriendlyRaid => "Friendly Raid",
            Inferno => "Inferno", BlackHole => "Black Hole", HardRaid => "Hard Raid", Supernova => "Supernova",
        }
    }
    pub fn duration(self) -> u64 {
        use CardType::*;
        match self {
            TaxHoliday => 10 * MIN, HypeSiren | HappyHour => 15 * MIN, RollCall | Rebrand | SlowBurn | DiamondPool | Inferno | BlackHole => HOUR,
            Supernova => 2 * HOUR, _ => 0,
        }
    }
    /// Live in this contract version. Summoning Circle and Prophecy run in the local engine for now.
    pub fn on_chain(self) -> bool { !matches!(self, CardType::SummoningCircle | CardType::Prophecy) }
    pub fn is_tactic(self) -> bool { matches!(self, CardType::Ward | CardType::Rally | CardType::Curse | CardType::Mirror) }
    pub fn is_raid(self) -> bool { matches!(self, CardType::FriendlyRaid | CardType::HardRaid) }
    pub fn pool(tier: Tier) -> Vec<CardType> {
        use CardType::*;
        [Ward, Rally, TaxHoliday, RollCall, HypeSiren, Rebrand, Curse, Mirror, SlowBurn, HappyHour, DiamondPool, FriendlyRaid, Inferno, BlackHole, HardRaid, Supernova]
            .into_iter().filter(|c| c.tier() == tier).collect()
    }
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "camelCase")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rule { LaunchGuard, PaperTax, HoldTheLine, VaultSeal }

/// Real NEAR in the curve needed for levels 1..5.
pub const LEVELS_NEAR: [u128; 5] = [0, 5, 20, 60, 120];
