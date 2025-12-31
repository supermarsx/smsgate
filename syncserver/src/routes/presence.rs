//! Heartbeat ingestion endpoint updating presence state.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

use crate::{
    domain::{HeartbeatSample, PresenceState},
    error::AppError,
    state::AppState,
};

/// Response shape for heartbeat ingestion.
#[derive(Debug, Serialize)]
pub struct HeartbeatResponse {
    /// Computed presence state.
    pub presence: PresenceState,
}

/// POST /api/v1/presence/heartbeat
pub async fn heartbeat(
    State(state): State<AppState>,
    Json(payload): Json<HeartbeatSample>,
) -> Result<impl IntoResponse, AppError> {
    let now = chrono::Utc::now();
    let presence = state.presence.upsert(
        &payload.device_id,
        now,
        payload.queue_depth,
        payload.device_rtt_ms,
    );

    state
        .metrics
        .observe_http("/api/v1/presence/heartbeat", StatusCode::OK);

    Ok((StatusCode::OK, Json(HeartbeatResponse { presence })))
}
