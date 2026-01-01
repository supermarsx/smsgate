//! Configuration exposure and mutation endpoints for smsgate2 and operators.

use axum::http::HeaderValue;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use chrono::Utc;

use crate::{
    auth::{permissions, user::UserAuth},
    config::{PartialConfig, UiConfigEnvelope, UiConfigPatch, VersionedConfig},
    error::AppError,
    routes::context::RequestContext,
    state::AppState,
    ws_types::ServerMessage,
};

/// Accept either the raw PartialConfig shape or the UI-friendly patch document.
#[derive(Debug, serde::Deserialize)]
#[serde(untagged)]
pub enum ConfigPatchEnvelope {
    Partial(Box<PartialConfig>),
    Ui(Box<UiConfigPatch>),
}

/// GET /api/v1/config
pub async fn get_config(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<axum::response::Response, AppError> {
    if !user.has_permission(permissions::CONFIG_READ) {
        return Err(AppError::Validation("forbidden".into()));
    }
    let versioned = { state.config.read().await.clone() };
    let client_snapshot = crate::config::ClientConfigSnapshot::from_versioned(&versioned);
    let etag = format!("\"{}\"", client_snapshot.version);
    if let Some(if_none) = headers
        .get(axum::http::header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
    {
        if if_none == etag {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }
    tracing::debug!(
        target: "config",
        actor = %user.actor_label(),
        "config snapshot served"
    );
    let etag_header =
        HeaderValue::from_str(&etag).unwrap_or_else(|_| HeaderValue::from_static("\"0\""));
    let mut response = Json(client_snapshot).into_response();
    response
        .headers_mut()
        .insert(axum::http::header::ETAG, etag_header);
    *response.status_mut() = StatusCode::OK;
    Ok(response)
}

/// PATCH /api/v1/config
pub async fn patch_config(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(patch): Json<ConfigPatchEnvelope>,
) -> Result<impl IntoResponse, AppError> {
    if !user.has_permission(permissions::CONFIG_WRITE) {
        return Err(AppError::Validation("forbidden".into()));
    }

    let partial: PartialConfig = match patch {
        ConfigPatchEnvelope::Partial(p) => *p,
        ConfigPatchEnvelope::Ui(p) => (*p).into_partial(),
    };

    let mut guard = state.config.write().await;
    let merged = guard.config.merged(partial)?;
    let updated = VersionedConfig {
        config: merged,
        version: guard.version + 1,
        last_updated_at: Utc::now(),
    };
    *guard = updated.clone();
    drop(guard);

    state.persist_config(&updated).await?;

    let snapshot = UiConfigEnvelope::from_versioned(&updated);
    let client_snapshot = crate::config::ClientConfigSnapshot::from_versioned(&updated);
    let _ = state.event_tx.send(ServerMessage::ConfigUpdate {
        config: snapshot.clone().into(),
    });

    tracing::info!(
        target: "config",
        actor = %user.actor_label(),
        version = updated.version,
        "config patched"
    );
    state
        .audit
        .log_action(
            user.actor_label(),
            "config.patch".into(),
            None,
            "success".into(),
            serde_json::json!({ "version": updated.version }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;

    let etag = format!("\"{}\"", snapshot.version);
    let etag_header =
        HeaderValue::from_str(&etag).unwrap_or_else(|_| HeaderValue::from_static("\"0\""));
    let mut response = Json(client_snapshot).into_response();
    response
        .headers_mut()
        .insert(axum::http::header::ETAG, etag_header);
    *response.status_mut() = StatusCode::OK;
    Ok(response)
}
