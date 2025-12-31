//! Audit and login event listing routes (stubbed to JSON arrays for now).

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};

use crate::{
    auth::{permissions, user::UserAuth},
    domain::{AuditEntry, LoginEvent},
    error::AppError,
    state::AppState,
};

/// GET /api/v1/audit
pub async fn list_audit(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    if !user.has_permission(permissions::AUDIT_READ) {
        return Err(AppError::Validation("forbidden".into()));
    }
    let entries: Vec<AuditEntry> = state.audit.list_audit().await;
    Ok((StatusCode::OK, Json(entries)))
}

/// GET /api/v1/login-events
pub async fn list_login_events(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    if !user.has_permission(permissions::LOGINS_READ) {
        return Err(AppError::Validation("forbidden".into()));
    }
    let entries: Vec<LoginEvent> = state.audit.list_logins().await;
    Ok((StatusCode::OK, Json(entries)))
}
