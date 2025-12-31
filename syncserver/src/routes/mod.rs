use axum::{routing::get, Router};

use crate::{metrics, state::AppState};

pub mod auth;
pub mod config;
pub mod devices;
pub mod events;
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
        .route(
            "/api/v1/config",
            get(config::get_config).patch(config::patch_config),
        )
        .route(
            "/api/v1/pairing/session",
            axum::routing::post(pairing::create_session),
        )
        .route(
            "/api/v1/pairing/complete",
            axum::routing::post(pairing::complete_session),
        )
        .route("/api/v1/auth/login", axum::routing::post(auth::login))
        .route("/api/v1/auth/logout", axum::routing::post(auth::logout))
        .route(
            "/api/v1/auth/password_reset/request",
            axum::routing::post(auth::request_password_reset),
        )
        .route(
            "/api/v1/auth/password_reset/confirm",
            axum::routing::post(auth::confirm_password_reset),
        )
        .route("/api/v1/devices", get(devices::list_devices))
        .route(
            "/api/v1/devices/:device_id/rename",
            axum::routing::post(devices::rename_device),
        )
        .route(
            "/api/v1/devices/:device_id/disable",
            axum::routing::post(devices::disable_device),
        )
        .route(
            "/api/v1/devices/:device_id/enable",
            axum::routing::post(devices::enable_device),
        )
        .route(
            "/api/v1/devices/:device_id/diagnostics",
            axum::routing::get(devices::diagnostics),
        )
        .route(
            "/api/v1/events/:event_id/claim",
            axum::routing::post(events::claim_event),
        )
        .route(
            "/api/v1/events/:event_id/verify",
            axum::routing::post(events::verify_event),
        )
        .route(
            "/api/v1/events/:event_id/reject",
            axum::routing::post(events::reject_event),
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
