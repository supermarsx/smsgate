//! Heartbeat ingestion endpoint updating presence state.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

use crate::{
    auth::DeviceAuth,
    domain::{HeartbeatSample, PresenceState},
    error::AppError,
    state::AppState,
    ws_types::PresenceUpdate,
};

/// Response shape for heartbeat ingestion.
#[derive(Debug, Serialize)]
pub struct HeartbeatResponse {
    /// Computed presence state.
    pub presence: PresenceState,
}

/// POST /api/v1/presence/heartbeat
pub async fn heartbeat(
    DeviceAuth(_): DeviceAuth,
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

    let _ = state
        .event_tx
        .send(crate::ws_types::ServerMessage::PresenceUpdate(
            PresenceUpdate {
                device_id: payload.device_id,
                state: presence.clone(),
                queue_depth: payload.queue_depth,
                last_heartbeat: now,
                device_rtt_ms: payload.device_rtt_ms,
            },
        ));

    state
        .metrics
        .observe_http("/api/v1/presence/heartbeat", StatusCode::OK);
    tracing::debug!(
        target: "presence",
        device_id = %payload.device_id,
        queue_depth = payload.queue_depth,
        state = ?presence,
        "heartbeat processed"
    );

    Ok((StatusCode::OK, Json(HeartbeatResponse { presence })))
}
