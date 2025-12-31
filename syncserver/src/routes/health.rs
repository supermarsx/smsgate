use axum::{extract::State, Json};
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
pub(crate) struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    env: &'static str,
    uptime_ms: u128,
}

#[derive(Serialize)]
pub(crate) struct ReadyChecks {
    http: &'static str,
    storage: &'static str,
    hot_store: &'static str,
}

#[derive(Serialize)]
pub(crate) struct ReadyResponse {
    status: &'static str,
    env: &'static str,
    checks: ReadyChecks,
}

pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "syncserver",
        version: env!("CARGO_PKG_VERSION"),
        env: state.config.env.as_str(),
        uptime_ms: state.started_at.elapsed().as_millis(),
    })
}

pub async fn ready(State(state): State<AppState>) -> Json<ReadyResponse> {
    Json(ReadyResponse {
        status: "initializing",
        env: state.config.env.as_str(),
        checks: ReadyChecks {
            http: "ok",
            storage: "pending",
            hot_store: "pending",
        },
    })
}
