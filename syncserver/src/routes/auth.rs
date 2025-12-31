//! Authentication endpoints for simple_signin, domain_signin, and OAuth callbacks.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::Deserialize;
use totp_rs::{Algorithm, Secret, TOTP};
use tracing;

use crate::{
    auth::{domain::authenticate_domain, oauth::validate_id_token, Principal},
    config::AuthMode,
    error::AppError,
    state::AppState,
};

/// Request payload for login.
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    /// Auth mode to use (simple_signin/domain_signin/oauth).
    pub mode: AuthMode,
    /// Username/subject.
    pub username: String,
    /// Password/secret (simple/domain).
    pub password: Option<String>,
    /// Optional TOTP code for admin accounts.
    pub totp_code: Option<String>,
    /// OAuth issuer in callback (stub).
    pub issuer: Option<String>,
    /// OAuth audience/client id (stub).
    pub audience: Option<String>,
}

/// Response payload after successful login.
#[derive(Debug, serde::Serialize)]
pub struct LoginResponse {
    pub session_token: String,
    pub user_id: String,
    pub role: String,
    pub expires_at: String,
}

/// POST /api/v1/auth/login
pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    let cfg_guard = state.config.read().await;
    let cfg = &cfg_guard.config;
    if !cfg.auth.modes.contains(&payload.mode) {
        return Err(AppError::Validation("auth mode disabled".into()));
    }

    let principal = match payload.mode {
        AuthMode::SimpleSignin => {
            let store = state.user_store.clone();
            let user = store
                .authenticate(&payload.username, payload.password.as_deref().unwrap_or(""))
                .map_err(|err| AppError::Validation(err.to_string()))?;
            enforce_totp(cfg, &user, payload.totp_code.as_deref())?;
            Principal::from(user)
        }
        AuthMode::DomainSignin => {
            let password = payload
                .password
                .as_deref()
                .ok_or_else(|| AppError::Validation("password required".into()))?;
            authenticate_domain(&cfg.auth, &payload.username, password)?
        }
        AuthMode::Oauth => {
            let issuer = payload
                .issuer
                .as_deref()
                .ok_or_else(|| AppError::Validation("issuer required".into()))?;
            let audience = payload
                .audience
                .as_deref()
                .ok_or_else(|| AppError::Validation("audience required".into()))?;
            validate_id_token(&cfg.auth, &payload.username, issuer, audience)?
        }
    };
    drop(cfg_guard);

    let session = state.session_store.create_session(principal.clone());
    Ok((
        StatusCode::OK,
        Json(LoginResponse {
            session_token: session.token.clone(),
            user_id: match &principal {
                Principal::User { id, .. } => id.clone(),
                Principal::Device { id } => id.clone(),
            },
            role: principal_role(&principal),
            expires_at: session.expires_at.to_rfc3339(),
        }),
    ))
}

/// POST /api/v1/auth/logout
pub async fn logout(
    State(state): State<AppState>,
    Json(payload): Json<LogoutRequest>,
) -> Result<impl IntoResponse, AppError> {
    state.session_store.revoke(&payload.session_token);
    Ok((StatusCode::OK, Json(serde_json::json!({ "status": "ok" }))))
}

/// Request payload for logout.
#[derive(Debug, Deserialize)]
pub struct LogoutRequest {
    pub session_token: String,
}

/// Request body for password reset.
#[derive(Debug, Deserialize)]
pub struct PasswordResetRequest {
    pub username: String,
}

/// Request body for password reset confirmation.
#[derive(Debug, Deserialize)]
pub struct PasswordResetConfirmRequest {
    pub token: String,
    pub new_password: String,
}

/// POST /api/v1/auth/password_reset/request
pub async fn request_password_reset(
    State(state): State<AppState>,
    Json(payload): Json<PasswordResetRequest>,
) -> Result<impl IntoResponse, AppError> {
    let token = state
        .user_store
        .issue_reset_token(&payload.username)
        .map_err(|err| AppError::Validation(err.to_string()))?;
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({ "reset_token": token })),
    ))
}

/// POST /api/v1/auth/password_reset/confirm
pub async fn confirm_password_reset(
    State(state): State<AppState>,
    Json(payload): Json<PasswordResetConfirmRequest>,
) -> Result<impl IntoResponse, AppError> {
    state
        .user_store
        .reset_password(&payload.token, &payload.new_password)?;
    Ok((StatusCode::OK, Json(serde_json::json!({ "status": "ok" }))))
}

fn enforce_totp(
    cfg: &crate::config::AppConfig,
    user: &crate::auth::users::UserRecord,
    provided_code: Option<&str>,
) -> Result<(), AppError> {
    if cfg.auth.require_admin_totp && user.role.name == "admin" {
        if let Some(secret) = user.totp_secret.as_ref() {
            let totp = TOTP::new(
                Algorithm::SHA1,
                6,
                1,
                30,
                Secret::Encoded(secret.to_string())
                    .to_bytes()
                    .map_err(|_| AppError::Validation("invalid totp secret".into()))?,
                Some("syncserver".into()),
                user.username.clone(),
            )
            .map_err(|_| AppError::Validation("invalid totp".into()))?;
            let code =
                provided_code.ok_or_else(|| AppError::Validation("totp code required".into()))?;
            if !totp.check_current(code).unwrap_or(false) {
                return Err(AppError::Validation("invalid totp code".into()));
            }
        } else {
            tracing::warn!("admin login without totp secret configured");
        }
    }
    Ok(())
}

fn principal_role(principal: &Principal) -> String {
    match principal {
        Principal::User { role, .. } => role.name.clone(),
        Principal::Device { .. } => "device".into(),
    }
}
