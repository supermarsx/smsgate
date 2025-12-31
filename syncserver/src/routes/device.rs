//! Device-facing endpoints (config fetch, SIM updates).

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use chrono::{TimeZone, Utc};

use crate::{
    auth::DeviceAuth,
    domain::{SimSnapshot, SimStatus},
    error::AppError,
    state::AppState,
    ws_types::{ServerMessage, SimUpdate},
};

/// GET /api/v1/device/config
pub async fn get_device_config(
    DeviceAuth(_device): DeviceAuth,
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let cfg = state.config.read().await;
    let etag = format!("\"{}\"", cfg.version);
    if let Some(if_none) = headers
        .get(axum::http::header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
    {
        if if_none == etag {
            return Ok((StatusCode::NOT_MODIFIED, ()));
        }
    }
    let snapshot = crate::config::ClientConfigSnapshot::from_versioned(&cfg);
    Ok((
        StatusCode::OK,
        [(axum::http::header::ETAG, etag)],
        Json(snapshot),
    ))
}

/// Payload for SIM inventory updates.
#[derive(Debug, serde::Deserialize)]
pub struct SimUpdateRequest {
    pub sims: Vec<IncomingSimSnapshot>,
}

#[derive(Debug, serde::Deserialize)]
pub struct IncomingSimSnapshot {
    pub slot_index: u8,
    pub iccid: Option<String>,
    pub msisdn: Option<String>,
    pub carrier_name: Option<String>,
    #[serde(default)]
    pub status: String,
    pub captured_at_ms: Option<i64>,
}

/// POST /api/v1/device/sims
pub async fn update_sims(
    DeviceAuth(device): DeviceAuth,
    State(state): State<AppState>,
    Json(body): Json<SimUpdateRequest>,
) -> Result<impl IntoResponse, AppError> {
    let device_id = match &device.principal {
        crate::auth::Principal::Device { id } => id.clone(),
        _ => "unknown".into(),
    };
    let now = Utc::now();
    let sims: Vec<SimSnapshot> = body.sims.into_iter().map(|s| map_sim(s, now)).collect();
    let (updated, changed) = state.sim_inventory.upsert(&device_id, sims);
    if changed {
        let _ = state
            .event_tx
            .send(ServerMessage::SimUpdate(SimUpdate {
                device_id: device_id.clone(),
                sims: updated.clone(),
            }));
    }
    Ok((StatusCode::OK, Json(serde_json::json!({ "updated": updated.len() }))))
}

fn map_sim(input: IncomingSimSnapshot, now: chrono::DateTime<Utc>) -> SimSnapshot {
    let status = match input.status.to_ascii_lowercase().as_str() {
        "inactive" => SimStatus::Inactive,
        _ => SimStatus::Active,
    };
    let seen = input
        .captured_at_ms
        .and_then(|ms| Utc.timestamp_millis_opt(ms).single())
        .unwrap_or(now);
    SimSnapshot {
        slot_index: input.slot_index,
        iccid: input.iccid,
        msisdn: input.msisdn,
        carrier_name: input.carrier_name,
        status,
        last_seen_at: seen,
    }
}
