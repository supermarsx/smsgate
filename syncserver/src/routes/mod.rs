use axum::{routing::get, Router};

use crate::{metrics, state::AppState};

pub mod config;
mod health;
pub mod ingest;
pub mod pairing;
pub mod presence;
pub mod ws;

/// Build the Axum router with health, readiness, and metrics endpoints.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health::health))
        .route("/readyz", get(health::ready))
        .route("/api/v1/healthz", get(health::health))
        .route("/api/v1/readyz", get(health::ready))
        .route("/api/v1/config", get(config::get_config))
        .route(
            "/api/v1/pairing/session",
            axum::routing::post(pairing::create_session),
        )
        .route(
            "/api/v1/pairing/complete",
            axum::routing::post(pairing::complete_session),
        )
        .route("/api/v1/ingest", axum::routing::post(ingest::ingest))
        .route(
            "/api/v1/presence/heartbeat",
            axum::routing::post(presence::heartbeat),
        )
        .route("/api/v1/ws", axum::routing::get(ws::ws_handler))
        .route("/metrics", get(metrics::metrics_handler))
        .with_state(state)
}
