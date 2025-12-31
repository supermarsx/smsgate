use axum::{routing::get, Router};

use crate::{metrics, state::AppState};

mod health;

/// Build the Axum router with health, readiness, and metrics endpoints.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health::health))
        .route("/readyz", get(health::ready))
        .route("/api/v1/healthz", get(health::health))
        .route("/api/v1/readyz", get(health::ready))
        .route("/metrics", get(metrics::metrics_handler))
        .with_state(state)
}
