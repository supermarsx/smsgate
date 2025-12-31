use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

use crate::{config::AppConfig, state::AppState};

/// Health payload returned by `/healthz`.
#[derive(Serialize)]
pub(crate) struct HealthResponse {
    /// Static service status (up if route answered).
    status: &'static str,
    /// Service name for dashboards.
    service: &'static str,
    /// Version from Cargo metadata.
    version: &'static str,
    /// Environment tag.
    env: &'static str,
    /// Milliseconds since process start.
    uptime_ms: u128,
}

/// Readiness check details for `/readyz`.
#[derive(Serialize)]
pub(crate) struct ReadyChecks {
    http: &'static str,
    config: &'static str,
    storage: &'static str,
    hot_store: &'static str,
    presence: &'static str,
}

/// Readiness payload returned by `/readyz`.
#[derive(Serialize)]
pub(crate) struct ReadyResponse {
    /// Aggregated readiness status.
    status: &'static str,
    /// Environment tag.
    env: &'static str,
    /// Backend selection summary.
    backends: Backends,
    /// Individual check results.
    checks: ReadyChecks,
    /// Whether the service is degraded (some dependencies unhealthy but http/config ready).
    degraded: bool,
    /// Human-readable reasons for degradation.
    reasons: Vec<String>,
}

/// Surfaces configured storage choices for quick debugging.
#[derive(Serialize)]
pub(crate) struct Backends {
    hot_store: &'static str,
    database: &'static str,
}

/// Liveness probe handler.
pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    state
        .metrics
        .observe_http("/healthz", axum::http::StatusCode::OK);

    let cfg = state.config.read().await;
    Json(HealthResponse {
        status: "ok",
        service: "syncserver",
        version: env!("CARGO_PKG_VERSION"),
        env: cfg.config.env.as_str(),
        uptime_ms: state.started_at.elapsed().as_millis(),
    })
}

/// Readiness probe handler with backend summaries.
pub async fn ready(State(state): State<AppState>) -> impl IntoResponse {
    let snapshot = state.ready_flags.snapshot();
    let cfg_guard = state.config.read().await;
    let cfg = &cfg_guard.config;
    let dependencies_ready = snapshot.hot_store_ready && snapshot.storage_ready;
    let degraded = snapshot.http_ready && snapshot.config_ready && !dependencies_ready;
    let status = if snapshot.http_ready && snapshot.config_ready && dependencies_ready {
        "ready"
    } else if degraded {
        "degraded"
    } else {
        "initializing"
    };
    let status_code = if status == "ready" {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    let mut reasons = Vec::new();
    if !snapshot.hot_store_ready {
        reasons.push("hot_store not ready".to_string());
    }
    if !snapshot.storage_ready {
        reasons.push("storage not ready".to_string());
    }

    let payload = ReadyResponse {
        status,
        env: cfg.env.as_str(),
        backends: Backends {
            hot_store: hot_store_label(cfg),
            database: database_label(cfg),
        },
        checks: ReadyChecks {
            http: readiness_label(snapshot.http_ready),
            config: readiness_label(snapshot.config_ready),
            storage: readiness_label(snapshot.storage_ready),
            hot_store: readiness_label(snapshot.hot_store_ready),
            presence: readiness_label(snapshot.presence_ready),
        },
        degraded,
        reasons,
    };

    state.metrics.observe_http("/readyz", status_code);

    (status_code, Json(payload))
}

fn readiness_label(ready: bool) -> &'static str {
    if ready {
        "ok"
    } else {
        "pending"
    }
}

fn hot_store_label(config: &AppConfig) -> &'static str {
    match config.hot_store.mode {
        crate::config::HotStoreMode::Redis => "redis",
        crate::config::HotStoreMode::Memory => "memory",
    }
}

fn database_label(config: &AppConfig) -> &'static str {
    match config.database.adapter {
        crate::config::DatabaseAdapter::JsonDb => "json_db",
        crate::config::DatabaseAdapter::Sqlite => "sqlite",
        crate::config::DatabaseAdapter::Postgres => "postgres",
        crate::config::DatabaseAdapter::Mysql => "mysql",
    }
}
