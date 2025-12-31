use axum::{routing::get, Router};

use crate::state::AppState;

mod health;

/// Build the Axum router with health and readiness endpoints.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health::health))
        .route("/readyz", get(health::ready))
        .route("/api/v1/healthz", get(health::health))
        .route("/api/v1/readyz", get(health::ready))
        .with_state(state)
}
