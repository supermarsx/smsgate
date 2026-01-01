//! Device management endpoints for rename/enable/disable and diagnostics.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{permissions, user::UserAuth, AuthContext, DeviceRecord},
    domain::PresenceState,
    error::AppError,
    routes::context::RequestContext,
    state::AppState,
};

/// Device payload returned to administrative callers.
#[derive(Debug, Serialize)]
pub struct DeviceResponse {
    /// Device identifier.
    pub id: String,
    /// Friendly display name.
    pub name: Option<String>,
    /// Whether the device is enabled for auth.
    pub enabled: bool,
    /// When the device was first registered.
    pub created_at: DateTime<Utc>,
    /// Last successful auth timestamp.
    pub last_seen_at: Option<DateTime<Utc>>,
    /// When the token was last rotated/issued.
    pub last_token_rotated_at: Option<DateTime<Utc>>,
    /// Reason provided for disablement.
    pub disabled_reason: Option<String>,
}

impl From<DeviceRecord> for DeviceResponse {
    fn from(value: DeviceRecord) -> Self {
        Self {
            id: value.id,
            name: value.name,
            enabled: value.enabled,
            created_at: value.created_at,
            last_seen_at: value.last_seen_at,
            last_token_rotated_at: value.last_token_rotated_at,
            disabled_reason: value.disabled_reason,
        }
    }
}

/// Collection response for device listing.
#[derive(Debug, Serialize)]
pub struct DeviceListResponse {
    /// All known devices from the registry.
    pub devices: Vec<DeviceResponse>,
}

/// Request payload for rename operations.
#[derive(Debug, Deserialize)]
pub struct RenameDeviceRequest {
    /// New friendly name.
    pub name: String,
}

/// Request payload for disable operations.
#[derive(Debug, Deserialize)]
pub struct DisableDeviceRequest {
    /// Optional disable reason recorded alongside the device.
    pub reason: Option<String>,
}

/// Response for diagnostics stub combining device + presence info.
#[derive(Debug, Serialize)]
pub struct DeviceDiagnosticsResponse {
    /// Device record.
    pub device: DeviceResponse,
    /// Presence probe derived from last heartbeat.
    pub presence: PresenceProbe,
}

/// Presence snapshot returned in diagnostics.
#[derive(Debug, Serialize)]
pub struct PresenceProbe {
    /// Computed presence state.
    pub state: PresenceState,
    /// Queue depth from last heartbeat (if any).
    pub queue_depth: Option<u32>,
    /// Last heartbeat timestamp (if any).
    pub last_heartbeat: Option<DateTime<Utc>>,
    /// Device-reported RTT in ms (if any).
    pub device_rtt_ms: Option<u32>,
}

/// Response containing a rotated device token (raw).
#[derive(Debug, Serialize)]
pub struct RotateTokenResponse {
    pub device_id: String,
    pub token: String,
    pub rotated_at: DateTime<Utc>,
}

/// GET /api/v1/devices
pub async fn list_devices(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::DEVICES_READ)?;
    let mut devices = state.device_auth.list();
    devices.sort_by_key(|d| d.created_at);
    Ok((
        StatusCode::OK,
        Json(DeviceListResponse {
            devices: devices.into_iter().map(DeviceResponse::from).collect(),
        }),
    ))
}

/// POST /api/v1/devices/:device_id/rename
/// PATCH /api/v1/devices/:device_id (alias)
pub async fn rename_device(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    ctx: RequestContext,
    Json(payload): Json<RenameDeviceRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::DEVICES_WRITE)?;
    let updated = state
        .device_auth
        .rename(&device_id, payload.name)
        .map_err(AppError::Validation)?;
    tracing::info!(
        target: "sim",
        actor = %user.actor_label(),
        device_id = %device_id,
        "device renamed"
    );
    state
        .audit
        .log_action(
            user.actor_label(),
            "device.rename".into(),
            Some(device_id.clone()),
            "success".into(),
            serde_json::json!({ "name": updated.name }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::OK, Json(DeviceResponse::from(updated))))
}

/// POST /api/v1/devices/:device_id/disable
pub async fn disable_device(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    ctx: RequestContext,
    payload: Option<Json<DisableDeviceRequest>>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::DEVICES_DISABLE)?;
    let body = payload.map(|Json(p)| p).unwrap_or(DisableDeviceRequest { reason: None });
    let updated = state
        .device_auth
        .set_enabled(&device_id, false, body.reason)
        .map_err(AppError::Validation)?;
    tracing::info!(
        target: "sim",
        actor = %user.actor_label(),
        device_id = %device_id,
        "device disabled"
    );
    state
        .audit
        .log_action(
            user.actor_label(),
            "device.disable".into(),
            Some(device_id.clone()),
            "success".into(),
            serde_json::json!({ "reason": updated.disabled_reason }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::OK, Json(DeviceResponse::from(updated))))
}

/// POST /api/v1/devices/:device_id/enable
pub async fn enable_device(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    ctx: RequestContext,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::DEVICES_DISABLE)?;
    let updated = state
        .device_auth
        .set_enabled(&device_id, true, None)
        .map_err(AppError::Validation)?;
    tracing::info!(
        target: "sim",
        actor = %user.actor_label(),
        device_id = %device_id,
        "device enabled"
    );
    state
        .audit
        .log_action(
            user.actor_label(),
            "device.enable".into(),
            Some(device_id.clone()),
            "success".into(),
            serde_json::json!({ "enabled": true }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::OK, Json(DeviceResponse::from(updated))))
}

/// POST /api/v1/devices/:device_id/rotate-token
pub async fn rotate_token(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    ctx: RequestContext,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::DEVICES_ROTATE_TOKEN)?;
    let raw_token = Uuid::new_v4().to_string();
    let updated = state.device_auth.set_token(&device_id, &raw_token);
    let rotated_at = updated
        .last_token_rotated_at
        .unwrap_or_else(Utc::now);
    tracing::info!(
        target: "sim",
        actor = %user.actor_label(),
        device_id = %device_id,
        "device token rotated"
    );
    state
        .audit
        .log_action(
            user.actor_label(),
            "device.rotate_token".into(),
            Some(device_id.clone()),
            "success".into(),
            serde_json::json!({ "rotated_at": rotated_at }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((
        StatusCode::OK,
        Json(RotateTokenResponse {
            device_id: updated.id,
            token: raw_token,
            rotated_at,
        }),
    ))
}

/// GET /api/v1/devices/:device_id/diagnostics
pub async fn diagnostics(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(device_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::DEVICES_READ)?;
    let device = state
        .device_auth
        .diagnostics(&device_id)
        .map_err(AppError::Validation)?;
    let now = Utc::now();
    let presence = state
        .presence
        .snapshot(now, &device_id)
        .map(|(entry, state)| PresenceProbe {
            state,
            queue_depth: Some(entry.queue_depth),
            last_heartbeat: Some(entry.last_heartbeat),
            device_rtt_ms: entry.device_rtt_ms,
        })
        .unwrap_or(PresenceProbe {
            state: PresenceState::Offline,
            queue_depth: None,
            last_heartbeat: None,
            device_rtt_ms: None,
        });

    Ok((
        StatusCode::OK,
        Json(DeviceDiagnosticsResponse {
            device: DeviceResponse::from(device),
            presence,
        }),
    ))
}

/// Internal helper to enforce RBAC for device management endpoints.
fn require_permission(user: &AuthContext, perm: &str) -> Result<(), AppError> {
    if user.has_permission(perm) {
        Ok(())
    } else {
        Err(AppError::Validation("forbidden".into()))
    }
}
