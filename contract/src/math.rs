//! Curve math in exact integers. NEAR in yocto, tokens with 18 decimals, products in 256 bits.
//! Every rounding goes in the pool's favour, so selling all circulating tokens never pays out more than the real NEAR.
#![allow(clippy::manual_div_ceil)]
use uint::construct_uint;
construct_uint! { pub struct U256(4); }

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const TOKEN: u128 = 1_000_000_000_000_000_000;
pub const X0: u128 = 30 * ONE_NEAR;
pub const Y0: u128 = 1_000_000_000 * TOKEN;
pub const CAP: u128 = 800_000_000 * TOKEN;

pub fn u(v: u128) -> U256 { U256::from(v) }
pub fn low(v: U256) -> u128 { assert!(v.bits() <= 128, "math overflow"); v.low_u128() }
pub fn mul_div(a: u128, b: u128, d: u128) -> u128 { low(u(a) * u(b) / u(d)) }
pub fn mul_div_up(a: u128, b: u128, d: u128) -> u128 { let n = u(a) * u(b); let d = u(d); low((n + d - 1) / d) }
pub fn div_up(n: U256, d: U256) -> U256 { (n + d - 1) / d }

/// The money part of a coin. K is kept as x*y (256-bit) and only changes on a floor lift.
#[derive(Clone, Debug, PartialEq)]
pub struct Pool { pub x: u128, pub y: u128, pub k: U256, pub real: u128, pub circ: u128 }

impl Pool {
    pub fn new() -> Self { Pool { x: X0, y: Y0, k: u(X0) * u(Y0), real: 0, circ: 0 } }
    pub fn room(&self) -> u128 { self.y - (Y0 - CAP) }
    /// Add `net` NEAR. Returns (tokens out, NEAR actually used). Uses less NEAR when the sale cap is hit.
    pub fn buy(&mut self, net: u128) -> (u128, u128) {
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
    /// Remove `t` tokens. Returns NEAR out (before fees).
    pub fn sell(&mut self, t: u128) -> u128 {
        assert!(t <= self.circ, "more than circulating");
        let ny = self.y + t;
        let nx = low(div_up(self.k, u(ny)));
        let out = self.x.saturating_sub(nx).min(self.real);
        self.x -= out; self.y = ny; self.real -= out; self.circ -= t;
        out
    }
    /// After burns the unclaimable NEAR is handed back to holders as a higher price.
    pub fn lift(&mut self) {
        if self.circ == 0 { return; }
        let nx = low(u(self.real) * u(self.y + self.circ) / u(self.circ));
        if nx > self.x { self.x = nx; self.k = u(self.x) * u(self.y); }
    }
    pub fn burn(&mut self, t: u128) -> u128 { let t = t.min(self.circ); self.circ -= t; self.lift(); t }
    /// NEAR paid out if every circulating token were sold right now.
    pub fn max_payout(&self) -> u128 { self.x - low(div_up(self.k, u(self.y + self.circ))) }
    pub fn solvent(&self) -> bool { self.max_payout() <= self.real }
    /// Price as yocto NEAR per whole token (1e18 units).
    pub fn price_per_token(&self) -> u128 { mul_div(self.x, TOKEN, self.y) }
    /// Tokens bought for `net` NEAR, without changing state.
    pub fn quote_buy(&self, net: u128) -> u128 { let mut p = self.clone(); p.buy(net).0 }
    /// NEAR needed to buy exactly `t` tokens (used to size pot burns under the burn cap).
    pub fn near_for_tokens(&self, t: u128) -> u128 { let t = t.min(self.room()); if t == 0 { return 0; } low(div_up(self.k, u(self.y - t))).saturating_sub(self.x) }
}
impl Default for Pool { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trip_never_profits_and_stays_solvent() {
        let mut p = Pool::new();
        let (a, _) = p.buy(10 * ONE_NEAR); let (b, _) = p.buy(5 * ONE_NEAR);
        assert!(p.solvent());
        let o1 = p.sell(a); let o2 = p.sell(b);
        assert!(o1 + o2 <= 15 * ONE_NEAR); assert_eq!(p.circ, 0); assert!(p.solvent());
    }
    #[test]
    fn floor_lift_pays_out_exactly_the_real_near() {
        let mut p = Pool::new();
        let (a, _) = p.buy(10 * ONE_NEAR); let (b, _) = p.buy(5 * ONE_NEAR);
        let price0 = p.price_per_token();
        p.burn(b * 4 / 10);
        assert!(p.price_per_token() > price0);
        let left_b = b - b * 4 / 10;
        let paid = p.sell(a) + p.sell(left_b);
        let dust = 15 * ONE_NEAR - paid;
        assert!(dust < 1_000_000, "dust {}", dust); // a few yocto of rounding stay in the pool
    }
    #[test]
    fn sale_cap_uses_only_needed_near() {
        let mut p = Pool::new(); let (t, used) = p.buy(1000 * ONE_NEAR);
        assert_eq!(t, CAP); assert!(used < 1000 * ONE_NEAR); assert_eq!(p.room(), 0);
        assert!(used > 119 * ONE_NEAR && used < 121 * ONE_NEAR, "used {}", used / ONE_NEAR);
    }
}
