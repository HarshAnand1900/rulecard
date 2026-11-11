//! NEP-297 events. Token movements use the standard `nep141` events; game events use `rulecard`.
use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, AccountId};

fn emit(standard: &str, event: &str, data: Value) {
    let v = json!({ "standard": standard, "version": "1.0.0", "event": event, "data": [data] });
    env::log_str(&format!("EVENT_JSON:{}", v));
}

pub fn ft_mint(owner: &AccountId, amount: u128, memo: &str) { emit("nep141", "ft_mint", json!({ "owner_id": owner, "amount": U128(amount), "memo": memo })); }
pub fn ft_burn(owner: &AccountId, amount: u128, memo: &str) { emit("nep141", "ft_burn", json!({ "owner_id": owner, "amount": U128(amount), "memo": memo })); }
pub fn ft_transfer(from: &AccountId, to: &AccountId, amount: u128, memo: Option<&str>) {
    let mut d = json!({ "old_owner_id": from, "new_owner_id": to, "amount": U128(amount) });
    if let Some(m) = memo { d["memo"] = json!(m); }
    emit("nep141", "ft_transfer", d);
}
pub fn rulecard(event: &str, data: Value) { emit("rulecard", event, data); }
