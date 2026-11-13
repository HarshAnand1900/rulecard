//! Rulecard factory: anyone launches a coin. Each coin gets its own account `<symbol>.<factory>` running the coin
//! contract by a fixed global-contract code hash, so every coin is a separate NEP-141 token.
//! The coin code is fixed once: either a global-contract code hash given at init, or (where global contracts can't be
//! used by the deploy tooling) the wasm stored once by the factory account in its own deploy transaction.
//! The protocol fee account is set once at init. There are no owner methods: nobody can change
//! the code new coins run, and nobody can touch a coin after launch.
use near_sdk::json_types::{Base58CryptoHash, U128};
use near_sdk::serde_json::json;
use near_sdk::store::{LazyOption, LookupSet, Vector};
use near_sdk::{env, near, require, AccountId, CryptoHash, Gas, NearToken, PanicOnDefault, Promise, PromiseResult};

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
/// Storage for the new coin account (its state grows with holders; buyers pay 0.0125 NEAR each on top).
pub const DEPLOY_DEPOSIT: u128 = ONE_NEAR;
/// Without a global contract each coin carries its own copy of the code (~390 KB of storage).
pub const DEPLOY_DEPOSIT_FULL: u128 = 7 * ONE_NEAR;
/// Demo factories launch demo-scale coins: seeds (like every game NEAR amount) are 1/100. Storage is real NEAR either way.
#[cfg(feature = "demo")]
pub const NEAR_SCALE: u128 = 100;
#[cfg(not(feature = "demo"))]
pub const NEAR_SCALE: u128 = 1;
pub const SEED_MIN: u128 = 5 * ONE_NEAR / NEAR_SCALE;
pub const SEED_MAX: u128 = 100 * ONE_NEAR / NEAR_SCALE;
const GAS_INIT: Gas = Gas::from_tgas(60);
const GAS_CALLBACK: Gas = Gas::from_tgas(15);

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CoinEntry { pub account_id: AccountId, pub name: String, pub symbol: String, pub creator: AccountId, pub created_ms: u64, pub seed: U128 }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Factory {
    code_hash: Option<CryptoHash>,
    code: LazyOption<Vec<u8>>,
    protocol: AccountId,
    coins: Vector<CoinEntry>,
    taken: LookupSet<String>,
}

#[near(serializers = [json])]
pub struct FactoryParams { pub code_hash: Option<Base58CryptoHash>, pub code_stored: bool, pub protocol: AccountId, pub deploy_deposit: U128, pub seed_min: U128, pub seed_max: U128, pub admin: Option<AccountId>, pub mode: String }

#[near]
impl Factory {
    #[init]
    pub fn new(code_hash: Option<Base58CryptoHash>, protocol: AccountId) -> Self {
        Self { code_hash: code_hash.map(Into::into), code: LazyOption::new(b"w", None), protocol, coins: Vector::new(b"c"), taken: LookupSet::new(b"t") }
    }

    /// Store the coin wasm (raw input bytes). Only once, only by the factory account itself (in its deploy transaction),
    /// and only when no global code hash was given. After that nobody can change it.
    pub fn store_code(&mut self) {
        require!(env::predecessor_account_id() == env::current_account_id(), "only during the factory's own deploy");
        require!(self.code_hash.is_none() && self.code.get().is_none(), "the coin code is already fixed");
        let code = env::input().unwrap_or_default();
        require!(code.len() > 1_000, "no code");
        self.code.set(Some(code));
    }

    fn deposit_needed(&self) -> u128 { if self.code_hash.is_some() { DEPLOY_DEPOSIT } else { DEPLOY_DEPOSIT_FULL } }

    /// Launch a coin. Attach the seed (5-100 NEAR, all into the coin's pot) plus 1 NEAR for the coin account's storage.
    /// `rules` is passed straight to the coin (it checks them: up to 3, Paper and Soft Tax can't combine).
    #[payable]
    pub fn create_coin(&mut self, name: String, symbol: String, icon: Option<String>, rules: Vec<String>) -> Promise {
        let dep = env::attached_deposit().as_yoctonear();
        let storage = self.deposit_needed();
        require!(dep >= SEED_MIN + storage && dep <= SEED_MAX + storage, "attach a seed (5-100 NEAR; demo 0.05-1) plus the storage deposit (get_params)");
        require!(self.code_hash.is_some() || self.code.get().is_some(), "the coin code isn't stored yet");
        let sub = symbol.to_lowercase();
        require!((2..=10).contains(&sub.len()) && sub.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()), "symbol: 2-10 letters or digits");
        require!(self.taken.insert(sub.clone()), "that symbol is taken");
        let account: AccountId = format!("{}.{}", sub, env::current_account_id()).parse().unwrap_or_else(|_| env::panic_str("bad symbol"));
        let creator = env::predecessor_account_id();
        let seed = dep - storage;
        let args = json!({ "name": name, "symbol": symbol.to_uppercase(), "icon": icon, "creator": creator, "protocol": self.protocol, "rules": rules }).to_string().into_bytes();
        let back = json!({ "symbol": sub, "name": name, "creator": creator, "deposit": U128(dep), "seed": U128(seed) }).to_string().into_bytes();
        let p = Promise::new(account).create_account().transfer(NearToken::from_yoctonear(storage));
        let p = match self.code_hash { Some(h) => p.use_global_contract(h), None => p.deploy_contract(self.code.get().clone().unwrap()) };
        p.function_call("new".to_string(), args, NearToken::from_yoctonear(seed), GAS_INIT)
            .then(Promise::new(env::current_account_id()).function_call("on_coin_created".to_string(), back, NearToken::from_yoctonear(0), GAS_CALLBACK))
    }

    /// Records the coin, or frees the symbol and refunds the creator if the launch failed.
    #[private]
    pub fn on_coin_created(&mut self, symbol: String, name: String, creator: AccountId, deposit: U128, seed: U128) -> Option<AccountId> {
        let ok = matches!(env::promise_result(0), PromiseResult::Successful(_));
        if !ok {
            self.taken.remove(&symbol);
            let _ = Promise::new(creator).transfer(NearToken::from_yoctonear(deposit.0));
            return None;
        }
        let account: AccountId = format!("{}.{}", symbol, env::current_account_id()).parse().unwrap();
        self.coins.push(CoinEntry { account_id: account.clone(), name, symbol: symbol.to_uppercase(), creator: creator.clone(), created_ms: env::block_timestamp_ms(), seed });
        env::log_str(&format!("EVENT_JSON:{}", json!({ "standard": "rulecard", "version": "1.0.0", "event": "coin_created", "data": [{ "account_id": account, "creator": creator, "seed": seed }] })));
        Some(account)
    }

    /// Newest first.
    pub fn list_coins(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<CoinEntry> {
        let n = self.coins.len();
        let skip = from_index.unwrap_or(0).min(n);
        let lim = limit.unwrap_or(50).min(100);
        (0..n - skip).rev().take(lim as usize).filter_map(|i| self.coins.get(i).cloned()).collect()
    }

    pub fn coin_count(&self) -> u32 { self.coins.len() }
    pub fn is_symbol_taken(&self, symbol: String) -> bool { self.taken.contains(&symbol.to_lowercase()) }

    pub fn get_params(&self) -> FactoryParams {
        FactoryParams { code_hash: self.code_hash.map(Into::into), code_stored: self.code.get().is_some(), protocol: self.protocol.clone(), deploy_deposit: U128(self.deposit_needed()), seed_min: U128(SEED_MIN), seed_max: U128(SEED_MAX), admin: None, mode: if NEAR_SCALE > 1 { "demo".into() } else { "real".into() } }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(who: AccountId, deposit: u128, results: Vec<PromiseResult>) {
        let mut b = VMContextBuilder::new();
        b.current_account_id("rulecard.testnet".parse().unwrap()).predecessor_account_id(who).attached_deposit(NearToken::from_yoctonear(deposit)).prepaid_gas(Gas::from_tgas(300));
        testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), results);
    }
    fn dep(seed: u128) -> u128 { seed * ONE_NEAR / NEAR_SCALE + DEPLOY_DEPOSIT }
    fn factory() -> Factory { ctx(accounts(0), 0, vec![]); Factory::new(Some(Base58CryptoHash::from([7u8; 32])), "protocol.testnet".parse().unwrap()) }

    #[test]
    fn launch_reserves_the_symbol_and_records_the_coin() {
        let mut f = factory();
        ctx(accounts(1), dep(20), vec![]);
        let _ = f.create_coin("Frog".into(), "frog".into(), None, vec!["PaperTax".into()]);
        assert!(f.is_symbol_taken("FROG".into()));
        ctx("rulecard.testnet".parse().unwrap(), 0, vec![PromiseResult::Successful(vec![])]);
        let a = f.on_coin_created("frog".into(), "Frog".into(), accounts(1), U128(dep(20)), U128(20 * ONE_NEAR / NEAR_SCALE));
        assert_eq!(a.unwrap().as_str(), "frog.rulecard.testnet");
        let l = f.list_coins(None, None);
        assert_eq!(l.len(), 1); assert_eq!(l[0].symbol, "FROG"); assert_eq!(l[0].seed.0, 20 * ONE_NEAR / NEAR_SCALE);
        assert!(f.get_params().admin.is_none());
    }

    #[test]
    fn a_failed_launch_frees_the_symbol() {
        let mut f = factory();
        ctx(accounts(1), dep(20), vec![]);
        let _ = f.create_coin("Frog".into(), "frog".into(), None, vec![]);
        ctx("rulecard.testnet".parse().unwrap(), 0, vec![PromiseResult::Failed]);
        assert!(f.on_coin_created("frog".into(), "Frog".into(), accounts(1), U128(dep(20)), U128(20 * ONE_NEAR / NEAR_SCALE)).is_none());
        assert!(!f.is_symbol_taken("frog".into()));
        assert_eq!(f.coin_count(), 0);
    }

    #[test]
    #[should_panic(expected = "that symbol is taken")]
    fn symbols_are_unique() {
        let mut f = factory();
        ctx(accounts(1), dep(20), vec![]); let _ = f.create_coin("Frog".into(), "frog".into(), None, vec![]);
        ctx(accounts(2), dep(20), vec![]); let _ = f.create_coin("Frog 2".into(), "FROG".into(), None, vec![]);
    }

    #[test]
    #[should_panic(expected = "the coin code is already fixed")]
    fn code_can_be_stored_only_once_and_not_with_a_global_hash() {
        ctx("rulecard.testnet".parse().unwrap(), 0, vec![]);
        let mut f = Factory::new(Some(Base58CryptoHash::from([7u8; 32])), "protocol.testnet".parse().unwrap());
        f.store_code();
    }

    #[test]
    #[should_panic(expected = "only during the factory's own deploy")]
    fn others_cant_store_code() {
        let mut f = Factory { code_hash: None, code: LazyOption::new(b"w", None), protocol: "p.testnet".parse().unwrap(), coins: Vector::new(b"c"), taken: LookupSet::new(b"t") };
        ctx(accounts(1), 0, vec![]); f.store_code();
    }

    #[test]
    #[should_panic(expected = "attach a seed")]
    fn seed_is_checked() {
        let mut f = factory();
        ctx(accounts(1), 3 * ONE_NEAR, vec![]); let _ = f.create_coin("Frog".into(), "frog".into(), None, vec![]);
    }

    #[test]
    #[should_panic(expected = "symbol: 2-10 letters or digits")]
    fn symbol_must_be_a_valid_account_part() {
        let mut f = factory();
        ctx(accounts(1), dep(20), vec![]); let _ = f.create_coin("Frog".into(), "fr.og".into(), None, vec![]);
    }
}
