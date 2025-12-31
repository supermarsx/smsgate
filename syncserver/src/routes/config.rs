//! Configuration exposure and mutation endpoints for smsgate2 and operators.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use chrono::Utc;

use crate::{
    auth::{permissions, user::UserAuth},
    config::{ClientConfigSnapshot, PartialConfig, VersionedConfig},
    error::AppError,
    routes::context::RequestContext,
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
    tracing::debug!(
        target: "config",
        actor = %user.actor_label(),
        "config snapshot served"
    );
    Ok((StatusCode::OK, Json(snapshot)))
}

/// PATCH /api/v1/config
pub async fn patch_config(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
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

    Ok((StatusCode::OK, Json(snapshot)))
}
