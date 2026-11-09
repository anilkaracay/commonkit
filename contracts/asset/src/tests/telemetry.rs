use super::*;

#[test]
fn report_telemetry_merges_counters() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 10), ("jobs_total", 1)]);
    assert_eq!(events("telemetry_reported").len(), 1);
    h.telemetry(&[("nozzle_seconds", 20), ("custom", 5)]);
    assert_eq!(h.c.telemetry.value("nozzle_seconds"), 20);
    assert_eq!(h.c.telemetry.value("jobs_total"), 1);
    assert_eq!(h.c.telemetry.value("custom"), 5);
    assert_eq!(h.c.telemetry.reports, U64(2));
    assert_eq!(h.c.telemetry.updated_at, U64(T0));
}

#[test]
#[should_panic(expected = "E_NOT_BRIDGE")]
fn report_telemetry_rejects_non_bridge() {
    let mut h = H::wired(0);
    h.call(&agent(), 0, |c| {
        c.report_telemetry(vec![("x".to_string(), 1)])
    });
}

#[test]
#[should_panic(expected = "E_NOT_BRIDGE")]
fn report_telemetry_rejects_after_bridge_cleared() {
    let mut h = H::wired(0);
    h.call(&dao(), 0, |c| c.set_operators(None, Some(agent())));
    h.telemetry(&[("x", 1)]);
}

#[test]
#[should_panic(expected = "E_TELEMETRY_NOT_MONOTONIC")]
fn report_telemetry_rejects_decrease() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 10)]);
    h.telemetry(&[("nozzle_seconds", 9)]);
}

#[test]
#[should_panic(expected = "E_TELEMETRY_NOT_MONOTONIC")]
fn report_telemetry_reset_is_single_use() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 10)]);
    h.call(&dao(), 0, |c| c.set_telemetry_epoch(U64(1)));
    h.telemetry(&[("nozzle_seconds", 2)]);
    h.telemetry(&[("nozzle_seconds", 1)]);
}

#[test]
fn report_telemetry_reset_restarts_baselines() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 5000)]);
    h.c.rule_baselines.insert("nozzle_clean".to_string(), 4000);
    h.call(&dao(), 0, |c| c.set_telemetry_epoch(U64(1)));
    h.telemetry(&[("nozzle_seconds", 3)]);
    assert_eq!(h.c.rule_baselines.get("nozzle_clean"), Some(&0));
    assert_eq!(
        events("telemetry_reported")[0]["reset_metrics"][0],
        "nozzle_seconds"
    );
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn report_telemetry_rejects_long_name() {
    let mut h = H::wired(0);
    h.telemetry(&[(&"m".repeat(33), 1)]);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn report_telemetry_rejects_duplicate_name() {
    let mut h = H::wired(0);
    h.telemetry(&[("a", 1), ("a", 2)]);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn report_telemetry_rejects_more_than_16_metrics() {
    let mut h = H::wired(0);
    let names: Vec<String> = (0..17).map(|i| format!("m{i}")).collect();
    let metrics: Vec<(&str, u64)> = names.iter().map(|n| (n.as_str(), 1)).collect();
    h.telemetry(&metrics);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn report_telemetry_rejects_17th_tracked_metric() {
    let mut h = H::wired(0);
    let names: Vec<String> = (0..17).map(|i| format!("m{i}")).collect();
    let first: Vec<(&str, u64)> = names[..16].iter().map(|n| (n.as_str(), 1)).collect();
    h.telemetry(&first);
    h.telemetry(&[(names[16].as_str(), 1)]);
}
