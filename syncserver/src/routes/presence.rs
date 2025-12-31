//! Heartbeat ingestion endpoint updating presence state.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

use crate::{
    auth::{AuthContext, DeviceAuth},
    domain::{HeartbeatSample, PresenceState, SimSnapshot},
    error::AppError,
    state::AppState,
    ws_types::{PresenceUpdate, ServerMessage},
};

/// Response shape for heartbeat ingestion.
#[derive(Debug, Serialize)]
pub struct HeartbeatResponse {
    /// Computed presence state.
    pub presence: PresenceState,
}

/// POST /api/v1/presence/heartbeat
pub async fn heartbeat(
    DeviceAuth(device): DeviceAuth,
    State(state): State<AppState>,
    Json(payload): Json<HeartbeatSample>,
) -> Result<impl IntoResponse, AppError> {
    let device_id = payload.device_id.clone();
    let now = chrono::Utc::now();
    let presence = state.presence.upsert(
        &device_id,
        now,
        payload.queue_depth,
        payload.device_rtt_ms,
    );

    if let Some(rtt) = payload.device_rtt_ms {
        state.metrics.observe_device_rtt(&device_id, rtt);
    }
    state
        .metrics
        .observe_device_queue_depth(&device_id, payload.queue_depth);

    let _ = state.event_tx.send(ServerMessage::PresenceUpdate(PresenceUpdate {
        device_id: device_id.clone(),
        state: presence.clone(),
        queue_depth: payload.queue_depth,
        last_heartbeat: now,
        device_rtt_ms: payload.device_rtt_ms,
    }));

    if !payload.sims.is_empty() {
        handle_sim_inventory(&state, &device_id, payload.sims, &device).await;
    }

    state
        .metrics
        .observe_http("/api/v1/presence/heartbeat", StatusCode::OK);
    tracing::debug!(
        target: "presence",
        device_id = %device_id,
        queue_depth = payload.queue_depth,
        state = ?presence,
        "heartbeat processed"
    );

    Ok((StatusCode::OK, Json(HeartbeatResponse { presence })))
}

async fn handle_sim_inventory(
    state: &AppState,
    device_id: &str,
    sims: Vec<SimSnapshot>,
    device: &AuthContext,
) {
    let (updated, changed) = state.sim_inventory.upsert(device_id, sims);
    if changed {
        let _ = state.event_tx.send(ServerMessage::SimUpdate {
            device_id: device_id.to_string(),
            sims: updated.clone(),
        });
        state
            .audit
            .log_action(
                device.actor_label(),
                "sim.update".into(),
                Some(device_id.to_string()),
                "success".into(),
                serde_json::json!({ "sims": updated.len() }),
                None,
                None,
                None,
            )
            .await;
    }
}
