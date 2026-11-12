//! NEP-141 (fungible token) and the NEP-145 storage calls wallets need.
//! Balances shown by `ft_balance_of` already include idle burn that is due but not yet applied.
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise, PromiseOrValue, PromiseResult};

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct FtMetadata { pub spec: String, pub name: String, pub symbol: String, pub icon: Option<String>, pub reference: Option<String>, pub reference_hash: Option<String>, pub decimals: u8 }

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalance { pub total: U128, pub available: U128 }

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalanceBounds { pub min: U128, pub max: Option<U128> }

const GAS_ON_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_RESOLVE: Gas = Gas::from_tgas(10);

#[near]
impl Coin {
    pub fn ft_total_supply(&self) -> U128 { U128(SUPPLY - self.burned) }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        if account_id == env::current_account_id() { return U128(self.contract_balance()); }
        match self.holders.get(&account_id) { Some(h) => U128(h.bal - self.idle_due(h, env::block_timestamp_ms()).burn), None => U128(0) }
    }

    pub fn ft_metadata(&self) -> FtMetadata {
        FtMetadata { spec: "ft-1.0.0".into(), name: self.p.name.clone(), symbol: self.p.symbol.clone(), icon: Some(self.p.icon.clone().unwrap_or_else(|| self.live_icon())), reference: None, reference_hash: None, decimals: 18 }
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        require!(env::attached_deposit() == NearToken::from_yoctonear(1), "attach 1 yoctoNEAR");
        let from = env::predecessor_account_id();
        self.internal_transfer(&from, &receiver_id, amount.0, memo.as_deref());
    }

    #[payable]
    pub fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        require!(env::attached_deposit() == NearToken::from_yoctonear(1), "attach 1 yoctoNEAR");
        require!(env::prepaid_gas() > GAS_ON_TRANSFER.saturating_add(GAS_RESOLVE).saturating_add(Gas::from_tgas(15)), "more gas needed");
        let from = env::predecessor_account_id();
        self.internal_transfer(&from, &receiver_id, amount.0, memo.as_deref());
        let args = json!({ "sender_id": from, "amount": amount, "msg": msg }).to_string().into_bytes();
        let back = json!({ "sender_id": from, "receiver_id": receiver_id, "amount": amount }).to_string().into_bytes();
        Promise::new(receiver_id)
            .function_call("ft_on_transfer", args, NearToken::from_yoctonear(0), GAS_ON_TRANSFER)
            .then(Promise::new(env::current_account_id()).function_call("ft_resolve_transfer", back, NearToken::from_yoctonear(0), GAS_RESOLVE))
            .into()
    }

    /// Returns the amount actually used by the receiver; the rest goes back to the sender.
    #[private]
    pub fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let unused = match env::promise_result(0) {
            PromiseResult::Successful(v) => near_sdk::serde_json::from_slice::<U128>(&v).map(|u| u.0.min(amount.0)).unwrap_or(amount.0),
            _ => amount.0,
        };
        if unused > 0 {
            let now = env::block_timestamp_ms();
            let mut r = self.holder(&receiver_id);
            let back = unused.min(r.bal);
            if back > 0 && self.is_registered(&sender_id) {
                r.bal -= back; self.save(&receiver_id, r);
                let mut s = self.holder(&sender_id); s.bal += back; if s.since == 0 { s.since = now; } self.save(&sender_id, s);
                events::ft_transfer(&receiver_id, &sender_id, back, Some("refund"));
            }
            return U128(amount.0 - back);
        }
        amount
    }

    // ---- NEP-145 (subset): register a wallet so it can receive tokens. Buying registers you automatically.
    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        let _ = registration_only;
        let a = account_id.unwrap_or_else(env::predecessor_account_id);
        let dep = env::attached_deposit().as_yoctonear();
        if self.is_registered(&a) {
            if dep > 0 { let _ = Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(dep)); }
        } else {
            require!(dep >= STORAGE_COST, "attach the storage cost");
            self.register(&a, env::block_timestamp_ms());
            if dep > STORAGE_COST { let _ = Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(dep - STORAGE_COST)); }
        }
        StorageBalance { total: U128(STORAGE_COST), available: U128(0) }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        if self.is_registered(&account_id) { Some(StorageBalance { total: U128(STORAGE_COST), available: U128(0) }) } else { None }
    }

    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds { StorageBalanceBounds { min: U128(STORAGE_COST), max: Some(U128(STORAGE_COST)) } }
}

impl Coin {
    /// Tokens held by the contract itself: unsold curve stock, reward pool, DEX reserve, Vault locks and Vault rewards.
    pub(crate) fn contract_balance(&self) -> u128 { self.pool().room() + self.reward_pool + DEX_RESERVE + self.vault_locked + self.vault_rewards + self.bets_held }

    pub(crate) fn register(&mut self, a: &AccountId, now: u64) {
        if self.is_registered(a) { return; }
        let h = Holder { idle_from: now, idle_applied: now, ..Default::default() };
        self.holders.insert(a.clone(), h); self.holder_count += 1;
    }

    pub(crate) fn internal_transfer(&mut self, from: &AccountId, to: &AccountId, amount: u128, memo: Option<&str>) {
        require!(from != to, "same account");
        require!(amount > 0, "amount must be positive");
        require!(self.is_registered(to), "receiver is not registered (storage_deposit first)");
        let now = env::block_timestamp_ms();
        self.touch(now);
        let mut s = self.settle(from, now);
        require!(s.bal >= amount, "not enough unlocked balance");
        require!(now >= s.no_trade_until, "you have a live Prophecy bet: no transfers until it resolves");
        self.check_creator_lock(from, &s, amount, now);
        s.bal -= amount; if s.bal == 0 { s.since = 0; }
        // the tag follows the tokens
        let moved_tag = if now < s.tag_until { amount.min(s.tagged) } else { 0 };
        s.tagged -= moved_tag; let tag_until = s.tag_until;
        self.save(from, s);
        let mut r = self.settle(to, now);
        if r.bal == 0 && r.w == 0 { r.since = now; r.idle_from = now.max(r.idle_from); r.idle_applied = now; }
        r.bal += amount;
        if moved_tag > 0 { if now >= r.tag_until { r.tagged = 0; } r.tagged += moved_tag; r.tag_until = r.tag_until.max(tag_until); }
        self.save(to, r);
        events::ft_transfer(from, to, amount, memo);
    }
}

impl Coin {
    /// The coin's face is its war record: drawn from its own state every time a wallet or explorer asks for the icon.
    /// Level ring, the symbol, the current streak, the last 7 Rituals (flame = made, ash = missed) and crossed swords during a raid.
    pub(crate) fn live_icon(&self) -> String {
        let sym: String = self.p.symbol.chars().filter(|c| c.is_ascii_alphanumeric()).take(4).collect::<String>().to_uppercase();
        let ring = ["rgb(120,130,150)", "rgb(80,200,120)", "rgb(90,160,255)", "rgb(255,204,51)"][(self.level.clamp(1, 4) - 1) as usize];
        let r = &self.ritual;
        let mut dots = String::new();
        for i in 0..7u64 {
            let day = r.day.saturating_sub(7 - i);
            let made = r.made_days.contains(&day);
            let born = day * DAY + DAY > self.p.created_ms;
            let fill = if !born { "rgb(40,44,56)" } else if made { "rgb(255,120,40)" } else { "rgb(90,90,100)" };
            dots.push_str(&format!("<circle cx='{}' cy='100' r='5' fill='{}'/>", 28 + i * 12, fill));
        }
        let raid = if self.raid.as_ref().map_or(false, |x| x.phase >= 2 && x.result.is_none()) { "<path d='M30 30L98 98M98 30L30 98' stroke='rgb(255,70,70)' stroke-width='5' opacity='0.55'/>" } else { "" };
        let svg = format!(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><circle cx='64' cy='64' r='60' fill='rgb(18,20,28)' stroke='{ring}' stroke-width='6'/><text x='64' y='62' font-family='Arial' font-weight='bold' font-size='{fs}' fill='white' text-anchor='middle'>{sym}</text><text x='64' y='84' font-family='Arial' font-size='11' fill='rgb(255,204,51)' text-anchor='middle'>L{lv} STREAK {st}</text>{dots}{raid}</svg>",
            fs = if sym.len() > 3 { 24 } else { 30 }, lv = self.level, st = r.streak);
        let enc = svg.replace('%', "%25").replace('<', "%3C").replace('>', "%3E").replace('#', "%23");
        format!("data:image/svg+xml;utf8,{enc}")
    }
}
