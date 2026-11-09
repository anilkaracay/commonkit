//! Telemetry (CONTRACT_SPEC §2.4, §3.3). Counters are cumulative and monotonic per metric;
//! a decrease is accepted only on the first report after the DAO raised the epoch (D-206).

use near_sdk::json_types::U64;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require};

use crate::profile::MAX_METRIC_NAME_LEN;
use crate::types::Trigger;
use crate::{AssetContract, AssetContractExt};

pub const MAX_METRICS: usize = 16;

impl AssetContract {
    /// Validates and merges cumulative counters. Shared by `report_telemetry` and
    /// `mark_session_finished`.
    pub(crate) fn apply_telemetry(&mut self, metrics: Vec<(String, u64)>) {
        require!(
            metrics.len() <= MAX_METRICS,
            "E_INVALID_ARGS: too many metrics in one report"
        );
        let reset = self.telemetry.reset_pending;
        let mut decreased: Vec<String> = Vec::new();
        for (i, (name, value)) in metrics.iter().enumerate() {
            require!(
                !name.is_empty() && name.len() <= MAX_METRIC_NAME_LEN,
                "E_INVALID_ARGS: metric name empty or longer than 32"
            );
            require!(
                metrics[..i].iter().all(|(n, _)| n != name),
                "E_INVALID_ARGS: duplicate metric in report"
            );
            let known = self.telemetry.metrics.iter().find(|(m, _)| m == name);
            if let Some((_, previous)) = known {
                if value < previous {
                    require!(
                        reset,
                        "E_TELEMETRY_NOT_MONOTONIC: counter decreased without a new epoch"
                    );
                    decreased.push(name.clone());
                }
            }
        }
        for (name, value) in metrics.iter() {
            match self.telemetry.metrics.iter_mut().find(|(m, _)| m == name) {
                Some(entry) => entry.1 = *value,
                None => self.telemetry.metrics.push((name.clone(), *value)),
            }
        }
        require!(
            self.telemetry.metrics.len() <= MAX_METRICS,
            "E_INVALID_ARGS: more than 16 metrics tracked"
        );
        if reset {
            self.telemetry.reset_pending = false;
            for rule in self.profile.rules.clone() {
                if let Trigger::Metric { metric, .. } = &rule.trigger {
                    if decreased.contains(metric) {
                        self.rule_baselines.insert(rule.rule_id.clone(), 0);
                    }
                }
            }
        }
        self.telemetry.updated_at = U64(env::block_timestamp());
        self.telemetry.reports = U64(self.telemetry.reports.0 + 1);
        self.emit(
            "telemetry_reported",
            json!({
                "metrics": metrics,
                "epoch": self.telemetry.epoch,
                "reports": self.telemetry.reports,
                "reset_metrics": decreased,
            }),
        );
    }
}

#[near]
impl AssetContract {
    /// BRIDGE. Reports cumulative counters (≤ 16 metrics, names ≤ 32 chars).
    pub fn report_telemetry(&mut self, metrics: Vec<(String, u64)>) {
        self.assert_bridge();
        self.apply_telemetry(metrics);
    }
}
