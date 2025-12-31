//! syncserver core library modules shared between the binary and tests.
//! This exposes configuration loading, domain contracts, telemetry, and routing helpers.

pub mod auth;
pub mod audit;
pub mod config;
pub mod domain;
pub mod error;
pub mod hot_store;
pub mod metrics;
pub mod pairing;
pub mod persistence;
pub mod presence;
pub mod routes;
pub mod state;
pub mod telemetry;
pub mod ws_types;
