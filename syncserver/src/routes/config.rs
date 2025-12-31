//! Configuration exposure and mutation endpoints for smsgate2 and operators.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use chrono::Utc;

use crate::{
    auth::{permissions, user::UserAuth},
    config::{ClientConfigSnapshot, PartialConfig, VersionedConfig},
    error::AppError,
    state::AppState,
    ws_types::ServerMessage,
};

/// GET /api/v1/config
pub async fn get_config(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    if !user.has_permission(permissions::CONFIG_READ) {
        return Err(AppError::Validation("forbidden".into()));
    }
    let snapshot = state.config_snapshot().await;
    Ok((StatusCode::OK, Json(snapshot)))
}

/// PATCH /api/v1/config
pub async fn patch_config(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Json(patch): Json<PartialConfig>,
) -> Result<impl IntoResponse, AppError> {
    if !user.has_permission(permissions::CONFIG_WRITE) {
        return Err(AppError::Validation("forbidden".into()));
    }

    let mut guard = state.config.write().await;
    let merged = guard.config.merged(patch)?;
    let updated = VersionedConfig {
        config: merged,
        version: guard.version + 1,
        last_updated_at: Utc::now(),
    };
    *guard = updated.clone();
    drop(guard);

    state.persist_config(&updated).await?;

    let snapshot = ClientConfigSnapshot::from_versioned(&updated);
    let _ = state.event_tx.send(ServerMessage::ConfigUpdate {
        config: snapshot.clone(),
    });

    Ok((StatusCode::OK, Json(snapshot)))
}
