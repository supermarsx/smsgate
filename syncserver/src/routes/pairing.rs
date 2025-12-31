//! Pairing endpoints for issuing device credentials.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};

use crate::{
    auth::permissions, auth::user::UserAuth, auth::AuthContext, error::AppError,
    pairing::PairingCompleteRequest, routes::context::RequestContext, state::AppState,
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
    pub config: crate::config::ClientConfigSnapshot,
}

/// POST /api/v1/pairing/session
pub async fn create_session(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(_): Json<PairingSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::DEVICES_WRITE)?;
    let session = state.pairing_store.create_session();
    tracing::info!(
        target: "auth",
        actor = %user.actor_label(),
        session_id = %session.session_id,
        "pairing session created"
    );
    state
        .audit
        .log_action(
            user.actor_label(),
            "pairing.session.create".into(),
            Some(session.session_id.clone()),
            "success".into(),
            serde_json::json!({ "expires_at": session.expires_at }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
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
    ctx: RequestContext,
    Json(payload): Json<PairingCompleteRequest>,
) -> Result<impl IntoResponse, AppError> {
    let device_name = payload.device_name.clone();
    let completed = state
        .pairing_store
        .complete_session(payload)
        .map_err(AppError::Validation)?;

    // Store hashed token for device auth.
    state.device_auth.register_with_name(
        &completed.device_id,
        &completed.device_token,
        device_name,
    );
    let cfg_snapshot = state.config_snapshot().await;
    tracing::info!(
        target: "auth",
        device_id = %completed.device_id,
        "pairing session completed"
    );
    state
        .audit
        .log_action(
            format!("pairing:{}", completed.device_id),
            "pairing.complete".into(),
            Some(completed.device_id.clone()),
            "success".into(),
            serde_json::json!({ "issued_token": true }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;

    Ok((
        StatusCode::OK,
        Json(PairingCompleteBody {
            device_id: completed.device_id,
            device_token: completed.device_token,
            config: cfg_snapshot,
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
