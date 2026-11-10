//! Sandbox sanity: chain time and wall time of `fast_forward` (used by `Env::advance_to`).

#[tokio::test]
async fn sandbox_fast_forward_cost() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    for blocks in [100u64, 300] {
        let b0 = worker.view_block().await?;
        let t = std::time::Instant::now();
        worker.fast_forward(blocks).await?;
        let b1 = worker.view_block().await?;
        println!(
            "FF {blocks}: height +{}, chain +{} s, wall {:.1} s",
            b1.height() - b0.height(),
            (b1.timestamp() - b0.timestamp()) / 1_000_000_000,
            t.elapsed().as_secs_f64()
        );
    }
    Ok(())
}
