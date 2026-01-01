//! Device-facing endpoints (config fetch, SIM updates).

use axum::{
    extract::State,
    http::{HeaderValue, StatusCode},
    response::IntoResponse,
    Json,
};
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
) -> Result<axum::response::Response, AppError> {
    let cfg = state.config.read().await;
    let etag = format!("\"{}\"", cfg.version);
    if let Some(if_none) = headers
        .get(axum::http::header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
    {
        if if_none == etag {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }
    let snapshot = crate::config::UiConfigEnvelope::from_versioned(&cfg);
    let mut response = Json(snapshot).into_response();
    response.headers_mut().insert(
        axum::http::header::ETAG,
        HeaderValue::from_str(&etag).unwrap_or_else(|_| HeaderValue::from_static("\"0\"")),
    );
    *response.status_mut() = StatusCode::OK;
    Ok(response)
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

/// Contact sync payload from device.
#[derive(Debug, serde::Deserialize)]
pub struct DeviceContactsPayload {
    pub device_id: Option<String>,
    #[serde(default)]
    pub contacts: Vec<DeviceContact>,
    #[serde(default)]
    pub removed: Vec<String>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, serde::Deserialize)]
pub struct DeviceContact {
    pub number: String,
    pub name: Option<String>,
}

/// POST /api/v1/device/contacts
pub async fn update_contacts(
    DeviceAuth(device): DeviceAuth,
    State(state): State<AppState>,
    Json(body): Json<DeviceContactsPayload>,
) -> Result<impl IntoResponse, AppError> {
    let device_id = match &device.principal {
        crate::auth::Principal::Device { id } => id.clone(),
        _ => body.device_id.unwrap_or_else(|| "unknown".into()),
    };
    let upserts: Vec<(String, String)> = body
        .contacts
        .iter()
        .filter_map(|c| c.name.as_ref().map(|name| (c.number.clone(), name.clone())))
        .collect();
    if !upserts.is_empty() {
        state.contacts.upsert_all(&upserts);
    }
    if !body.removed.is_empty() {
        state.contacts.remove_all(&body.removed);
    }
    tracing::info!(
        target: "contacts",
        device = %device_id,
        uploaded = body.contacts.len(),
        removed = body.removed.len(),
        "device contacts sync received"
    );
    // Broadcast contact updates to dashboards (one per contact upsert).
    for (number, name) in upserts {
        let _ = state.event_tx.send(ServerMessage::ContactUpdate(
            crate::ws_types::ContactUpdate {
                number: number.clone(),
                contact_name: name,
                updated_at: Utc::now(),
            },
        ));
    }
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({ "status": "ok", "contacts": body.contacts.len() })),
    ))
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
