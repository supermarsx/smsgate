use axum::{routing::get, Router};

use crate::{metrics, state::AppState};

mod health;
pub mod ingest;
pub mod presence;

/// Build the Axum router with health, readiness, and metrics endpoints.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health::health))
        .route("/readyz", get(health::ready))
        .route("/api/v1/healthz", get(health::health))
        .route("/api/v1/readyz", get(health::ready))
        .route("/api/v1/ingest", axum::routing::post(ingest::ingest))
        .route(
            "/api/v1/presence/heartbeat",
            axum::routing::post(presence::heartbeat),
        )
        .route("/metrics", get(metrics::metrics_handler))
        .with_state(state)
}
