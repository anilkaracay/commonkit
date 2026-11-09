//! Per-asset reputation (CONTRACT_SPEC §2.8). Every record is appended to an on-chain log and
//! emitted as `reputation_recorded` with its `ref_id` (reservation or task id).

use near_sdk::json_types::U64;
use near_sdk::serde_json::json;
use near_sdk::AccountId;

use crate::types::ReputationRecord;
use crate::AssetContract;

pub const REP_SESSION: &str = "session";
pub const REP_CLEAN_RETURN: &str = "clean_return";
pub const REP_DAMAGE: &str = "damage";
pub const REP_UPKEEP: &str = "upkeep";
pub const REP_FAULT_REPORT: &str = "fault_report";
/// Logged only; no counter in `Reputation` (spec §2.8 fixes the counters).
pub const REP_NO_SHOW: &str = "no_show";

impl AssetContract {
    pub(crate) fn record_reputation(&mut self, account: &AccountId, kind: &str, ref_id: u64) {
        let mut rep = self.reputation.get(account).cloned().unwrap_or_default();
        match kind {
            REP_SESSION => rep.sessions += 1,
            REP_CLEAN_RETURN => rep.clean_returns += 1,
            REP_DAMAGE => rep.damages += 1,
            REP_UPKEEP => rep.upkeeps += 1,
            REP_FAULT_REPORT => rep.fault_reports += 1,
            _ => {}
        }
        self.reputation.insert(account.clone(), rep);
        let seq = u64::from(self.reputation_log.len());
        let at = Self::now();
        self.reputation_log.push(ReputationRecord {
            seq: U64(seq),
            account: account.clone(),
            kind: kind.to_string(),
            ref_id: U64(ref_id),
            at: U64(at),
        });
        self.emit(
            "reputation_recorded",
            json!({
                "seq": seq.to_string(),
                "account": account,
                "kind": kind,
                "ref_id": ref_id.to_string(),
            }),
        );
    }
}
