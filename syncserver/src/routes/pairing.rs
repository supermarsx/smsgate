//! Pairing endpoints for issuing device credentials.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};

use crate::{
    auth::user::UserAuth,
    auth::permissions,
    auth::{AuthContext, Principal},
    error::AppError,
    pairing::{PairingCompleteRequest, PairingStore},
    state::AppState,
};

/// Request body for creating a pairing session.
#[derive(Debug, Deserialize)]
pub struct PairingSessionRequest {
    pub device_name: Option<String>,
}

/// Response body for pairing session creation.
#[derive(Debug, Serialize)]
pub struct PairingSessionResponseBody {
    pub session_id: String,
    pub qr_payload: String,
    pub expires_at: String,
}

/// Response body for pairing completion.
#[derive(Debug, Serialize)]
pub struct PairingCompleteBody {
    pub device_id: String,
    pub device_token: String,
}

/// POST /api/v1/pairing/session
pub async fn create_session(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Json(_): Json<PairingSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::DEVICES_WRITE)?;
    let session = state.pairing_store.create_session();
    Ok((
        StatusCode::OK,
        Json(PairingSessionResponseBody {
            session_id: session.session_id.clone(),
            qr_payload: session.qr_payload.clone(),
            expires_at: session.expires_at.to_rfc3339(),
        }),
    ))
}

/// POST /api/v1/pairing/complete
pub async fn complete_session(
    State(state): State<AppState>,
    Json(payload): Json<PairingCompleteRequest>,
) -> Result<impl IntoResponse, AppError> {
    let completed = state
        .pairing_store
        .complete_session(payload)
        .map_err(|err| AppError::Validation(err))?;

    // Store hashed token for device auth.
    state
        .device_auth
        .set_token(&completed.device_id, &completed.device_token);

    Ok((
        StatusCode::OK,
        Json(PairingCompleteBody {
            device_id: completed.device_id,
            device_token: completed.device_token,
        }),
    ))
}

fn require_permission(user: &AuthContext, perm: &str) -> Result<(), AppError> {
    if user.has_permission(perm) {
        Ok(())
    } else {
        Err(AppError::Validation("forbidden".into()))
    }
}
