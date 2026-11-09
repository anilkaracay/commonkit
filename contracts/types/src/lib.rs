//! Cross-contract interface types shared by `asset` and `commons`.
//!
//! Ownership while both contracts are built in parallel:
//! - `commons_iface` — types the commons contract exposes to assets (owned by the commons engineer).
//! - `asset_iface`   — types the asset contract exposes to commons (owned by the asset engineer).

pub mod asset_iface;
pub mod commons_iface;
