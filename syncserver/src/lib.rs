//! syncserver core library modules shared between the binary and tests.
//! This exposes configuration loading, domain contracts, telemetry, and routing helpers.

pub mod config;
pub mod domain;
pub mod error;
pub mod metrics;
pub mod routes;
pub mod state;
pub mod telemetry;
