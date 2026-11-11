//! Curve math in exact integers. NEAR in yocto, tokens with 18 decimals, products in 256 bits.
//! Every rounding goes in the curve's favour, so selling every circulating token never pays out more than the real NEAR.
#![allow(clippy::manual_div_ceil)]
use uint::construct_uint;
construct_uint! { pub struct U256(4); }

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
/// Demo builds (`--features demo`) run every NEAR amount of the game at 1/100 scale, so a full game fits in testnet NEAR.
#[cfg(feature = "demo")]
pub const NEAR_SCALE: u128 = 100;
#[cfg(not(feature = "demo"))]
pub const NEAR_SCALE: u128 = 1;
/// One "game NEAR": the unit every game amount (curve, levels, caps, seeds) is written in.
pub const GN: u128 = ONE_NEAR / NEAR_SCALE;
pub const TOKEN: u128 = 1_000_000_000_000_000_000;
/// Total supply, minted once at launch.
pub const SUPPLY: u128 = 1_000_000_000 * TOKEN;
/// Sizing A: virtual reserves 1,392 NEAR / 1,073M tokens.
pub const X0: u128 = 1_392 * GN;
pub const Y0: u128 = 1_073_000_000 * TOKEN;
/// Tokens the curve can sell. Selling all of them takes ~3,946 real NEAR (~19,074 NEAR market cap): graduation.
pub const CAP: u128 = 793_191_832 * TOKEN;
/// Locked reward pool (5% of supply).
pub const REWARD_POOL: u128 = 50_000_000 * TOKEN;
/// Kept for the DEX pool at graduation (roadmap; held by the coin contract in the demo).
pub const DEX_RESERVE: u128 = SUPPLY - CAP - REWARD_POOL;

pub fn u(v: u128) -> U256 { U256::from(v) }
pub fn low(v: U256) -> u128 { assert!(v.bits() <= 128, "math overflow"); v.low_u128() }
pub fn mul_div(a: u128, b: u128, d: u128) -> u128 { if d == 0 { return 0; } low(u(a) * u(b) / u(d)) }
pub fn div_up(n: U256, d: U256) -> U256 { (n + d - 1) / d }
pub fn bps(a: u128, b: u128) -> u128 { mul_div(a, b, 10_000) }

/// The money part of a coin. K is x*y (256-bit) and only changes on a reprice.
#[derive(Clone, Debug, PartialEq)]
pub struct Pool { pub x: u128, pub y: u128, pub k: U256, pub real: u128, pub circ: u128 }

impl Pool {
    pub fn new() -> Self { Pool { x: X0, y: Y0, k: u(X0) * u(Y0), real: 0, circ: 0 } }
    /// Tokens the curve can still sell.
    pub fn room(&self) -> u128 { self.y.saturating_sub(Y0 - CAP) }
    /// Add `net` NEAR. Returns (tokens out, NEAR actually used). Uses less NEAR when the sale cap is hit.
    pub fn buy(&mut self, net: u128) -> (u128, u128) {
        if net == 0 || self.room() == 0 { return (0, 0); }
        let nx = self.x + net;
        let mut ny = low(div_up(self.k, u(nx)));
        let mut t = self.y.saturating_sub(ny);
        let mut used = net;
        if t >= self.room() {
            t = self.room(); ny = self.y - t;
            let need = low(div_up(self.k, u(ny)));
            used = need.saturating_sub(self.x).min(net);
            self.x += used;
        } else { self.x = nx; }
        self.y = ny; self.real += used; self.circ += t;
        (t, used)
    }
    /// Return `t` tokens to the curve. Returns NEAR out (before fees).
    pub fn sell(&mut self, t: u128) -> u128 {
        assert!(t <= self.circ, "more than circulating");
        let ny = self.y + t;
        let nx = low(div_up(self.k, u(ny)));
        let out = self.x.saturating_sub(nx).min(self.real);
        self.x -= out; self.y = ny; self.real -= out; self.circ -= t;
        out
    }
    /// Set the curve so selling every circulating token pays out exactly the real NEAR.
    /// After a burn this raises the price; after reward tokens enter circulation it lowers it.
    pub fn reprice(&mut self) {
        if self.circ == 0 { return; }
        let nx = low(u(self.real) * u(self.y + self.circ) / u(self.circ));
        self.x = nx; self.k = u(self.x) * u(self.y);
    }
    /// Burn circulating tokens; the NEAR behind them goes to everyone else as a higher price.
    pub fn burn(&mut self, t: u128) -> u128 {
        let t = t.min(self.circ); if t == 0 { return 0; }
        self.circ -= t;
        let before = self.x; self.reprice(); if self.x < before { self.x = before; self.k = u(self.x) * u(self.y); }
        t
    }
    /// Reward-pool tokens enter circulation (price drops slightly so the curve stays fully backed).
    pub fn release(&mut self, t: u128) { self.circ += t; self.reprice(); }
    /// NEAR paid out if every circulating token were sold right now.
    pub fn max_payout(&self) -> u128 { self.x - low(div_up(self.k, u(self.y + self.circ))) }
    pub fn solvent(&self) -> bool { self.max_payout() <= self.real }
    /// yocto NEAR per whole token.
    pub fn price(&self) -> u128 { mul_div(self.x, TOKEN, self.y) }
    /// Market cap in yocto NEAR, on the full supply.
    pub fn mcap(&self) -> u128 { mul_div(self.x, SUPPLY, self.y) }
    pub fn value(&self, tokens: u128) -> u128 { mul_div(tokens, self.x, self.y) }
}
impl Default for Pool { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trip_never_profits_and_stays_solvent() {
        let mut p = Pool::new();
        let (a, _) = p.buy(10 * GN); let (b, _) = p.buy(5 * GN);
        assert!(p.solvent());
        let o = p.sell(a) + p.sell(b);
        assert!(o <= 15 * GN); assert_eq!(p.circ, 0); assert!(p.solvent());
    }
    #[test]
    fn burn_raises_price_and_stays_backed() {
        let mut p = Pool::new();
        let (a, _) = p.buy(100 * GN); let (b, _) = p.buy(50 * GN);
        let p0 = p.price(); p.burn(b / 2);
        assert!(p.price() > p0); assert!(p.solvent());
        let paid = p.sell(a) + p.sell(b - b / 2);
        assert!(150 * GN - paid < 1_000_000, "dust");
    }
    #[test]
    fn release_lowers_price_and_stays_backed() {
        let mut p = Pool::new(); p.buy(200 * GN);
        let p0 = p.price(); p.release(1_000_000 * TOKEN);
        assert!(p.price() < p0); assert!(p.solvent());
    }
    #[test]
    fn graduation_at_about_3946_near() {
        let mut p = Pool::new(); let (t, used) = p.buy(10_000 * GN);
        assert_eq!(t, CAP); assert_eq!(p.room(), 0);
        let n = used / GN; assert!((3_940..3_952).contains(&n), "used {n}");
        let m = p.mcap() / GN; assert!((19_000..19_150).contains(&m), "mcap {m}");
    }
    #[test]
    fn level_targets_match_sizing_a() {
        for (real, mcap) in [(625u128, 2_724u128), (1_461, 5_450), (2_382, 9_536)] {
            let mut p = Pool::new(); p.buy(real * GN);
            let m = p.mcap() / GN; assert!(m.abs_diff(mcap) <= 2, "{real}: {m}");
        }
    }
}
