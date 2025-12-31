//! Authentication endpoints for simple_signin, domain_signin, and OAuth callbacks.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};
use serde::Deserialize;
use totp_rs::{Algorithm, Secret, TOTP};
use tracing;

use crate::{
    auth::{domain::authenticate_domain, oauth::validate_id_token, Principal},
    config::AuthMode,
    error::AppError,
    routes::context::RequestContext,
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
    /// Raw ID token for OAuth/OIDC login.
    pub id_token: Option<String>,
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
    ctx: RequestContext,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    let cfg_guard = state.config.read().await;
    let cfg = cfg_guard.config.clone();
    if !cfg.auth.modes.contains(&payload.mode) {
        let err = AppError::Validation("auth mode disabled".into());
        state
            .audit
            .log_login(
                payload.username.clone(),
                payload.mode,
                "mode_disabled".into(),
                ctx.ip.clone().unwrap_or_else(|| "unknown".into()),
                ctx.user_agent.clone(),
                false,
                ctx.correlation_id.clone(),
            )
            .await;
        tracing::warn!(
            target: "auth",
            mode = ?payload.mode,
            identity = %payload.username,
            "auth mode disabled"
        );
        return Err(err);
    }

    let login_span = tracing::info_span!(
        target: "auth",
        "auth_login",
        mode = ?payload.mode,
        identity = %payload.username
    );
    let _guard = login_span.enter();

    let attempt = (|| -> Result<(Principal, bool), AppError> {
        let mut two_fa_passed = false;
        let principal = match payload.mode {
            AuthMode::SimpleSignin => {
                let store = state.user_store.clone();
                let user = match store
                    .authenticate(&payload.username, payload.password.as_deref().unwrap_or(""))
                {
                    Ok(user) => user,
                    Err(err) => {
                        let locked = store.record_failure(&payload.username);
                        if locked {
                            tracing::warn!(
                                target: "auth",
                                user = %payload.username,
                                "account temporarily locked due to failures"
                            );
                        }
                        return Err(err);
                    }
                };
                enforce_totp(&cfg, &user, payload.totp_code.as_deref())?;
                if cfg.auth.require_admin_totp
                    && user.role.name == "admin"
                    && user.totp_secret.is_some()
                {
                    two_fa_passed = true;
                }
                Ok(Principal::from(user))
            }
            AuthMode::DomainSignin => {
                let password = payload
                    .password
                    .as_deref()
                    .ok_or_else(|| AppError::Validation("password required".into()))?;
                authenticate_domain(&cfg.auth, &payload.username, password)
            }
            AuthMode::Oauth => {
                let id_token = payload
                    .id_token
                    .as_deref()
                    .ok_or_else(|| AppError::Validation("id_token required".into()))?;
                validate_id_token(&cfg.auth, id_token)
            }
        }?;
        Ok((principal, two_fa_passed))
    })();

    let (principal, two_fa_passed) = match attempt {
        Ok(ok) => ok,
        Err(err) => {
            let result = err.to_string();
            state
                .audit
                .log_login(
                    payload.username.clone(),
                    payload.mode,
                    result.clone(),
                    ctx.ip.clone().unwrap_or_else(|| "unknown".into()),
                    ctx.user_agent.clone(),
                    false,
                    ctx.correlation_id.clone(),
                )
                .await;
            state
                .audit
                .log_action(
                    format!("identity:{}", payload.username),
                    "auth.login".into(),
                    None,
                    result.clone(),
                    serde_json::json!({ "mode": format!("{:?}", payload.mode) }),
                    ctx.correlation_id.clone(),
                    ctx.ip.clone(),
                    ctx.user_agent.clone(),
                )
                .await;
            tracing::warn!(
                target: "auth",
                mode = ?payload.mode,
                identity = %payload.username,
                error = %result,
                "login failed"
            );
            return Err(err);
        }
    };
    drop(cfg_guard);

    let session = state.session_store.create_session(principal.clone());
    let actor = principal_actor(&principal);
    tracing::info!(
        target: "auth",
        actor = %actor,
        session = %session.token,
        "login succeeded"
    );
    state
        .audit
        .log_login(
            payload.username.clone(),
            payload.mode,
            "success".into(),
            ctx.ip.clone().unwrap_or_else(|| "unknown".into()),
            ctx.user_agent.clone(),
            two_fa_passed,
            ctx.correlation_id.clone(),
        )
        .await;
    state
        .audit
        .log_action(
            actor,
            "auth.login".into(),
            None,
            "success".into(),
            serde_json::json!({ "mode": format!("{:?}", payload.mode) }),
            ctx.correlation_id.clone(),
            ctx.ip.clone(),
            ctx.user_agent.clone(),
        )
        .await;

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
    ctx: RequestContext,
    Json(payload): Json<LogoutRequest>,
) -> Result<impl IntoResponse, AppError> {
    let actor = state
        .session_store
        .validate(&payload.session_token)
        .map(|session| principal_actor(&session.principal))
        .unwrap_or_else(|| "session:unknown".into());
    state.session_store.revoke(&payload.session_token);
    state
        .audit
        .log_action(
            actor.clone(),
            "auth.logout".into(),
            None,
            "success".into(),
            serde_json::json!({ "session": payload.session_token }),
            ctx.correlation_id.clone(),
            ctx.ip.clone(),
            ctx.user_agent.clone(),
        )
        .await;
    tracing::info!(target: "auth", actor = %actor, "logout completed");
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
    ctx: RequestContext,
    Json(payload): Json<PasswordResetRequest>,
) -> Result<impl IntoResponse, AppError> {
    let token = state
        .user_store
        .issue_reset_token(&payload.username)
        .map_err(|err| AppError::Validation(err.to_string()))?;
    state
        .audit
        .log_action(
            format!("identity:{}", payload.username),
            "auth.password_reset_request".into(),
            None,
            "issued".into(),
            serde_json::json!({ "username": payload.username }),
            ctx.correlation_id.clone(),
            ctx.ip.clone(),
            ctx.user_agent.clone(),
        )
        .await;

    let smtp_cfg = {
        let guard = state.config.read().await;
        guard.config.auth.smtp.clone()
    };
    if let Some(cfg) = smtp_cfg.as_ref() {
        if let Err(err) = send_reset_email(cfg, &payload.username, &token).await {
            tracing::warn!(
                target: "auth",
                error = %err,
                user = %payload.username,
                "failed to dispatch password reset email"
            );
            return Err(err);
        }
    }

    Ok((
        StatusCode::OK,
        Json(match smtp_cfg {
            Some(_) => serde_json::json!({ "status": "email_dispatched" }),
            None => serde_json::json!({ "reset_token": token }),
        }),
    ))
}

/// POST /api/v1/auth/password_reset/confirm
pub async fn confirm_password_reset(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(payload): Json<PasswordResetConfirmRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = state
        .user_store
        .reset_password(&payload.token, &payload.new_password)?;
    state.session_store.revoke_by_principal(&user_id);
    state
        .audit
        .log_action(
            "password_reset".into(),
            "auth.password_reset_confirm".into(),
            None,
            "success".into(),
            serde_json::json!({ "token_prefix": payload.token.chars().take(6).collect::<String>() }),
            ctx.correlation_id.clone(),
            ctx.ip.clone(),
            ctx.user_agent.clone(),
        )
        .await;
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

/// Render an actor label for audit logging.
fn principal_actor(principal: &Principal) -> String {
    match principal {
        Principal::User { id, .. } => format!("user:{id}"),
        Principal::Device { id } => format!("device:{id}"),
    }
}

/// Dispatch a password reset email when SMTP is configured.
async fn send_reset_email(
    cfg: &crate::config::SmtpConfig,
    username: &str,
    token: &str,
) -> Result<(), AppError> {
    let to: Mailbox = username.parse().map_err(|_| {
        AppError::Validation("username must be a valid email for SMTP reset".into())
    })?;
    let from: Mailbox = cfg
        .from
        .parse()
        .map_err(|err| AppError::Validation(format!("invalid smtp from address: {err}")))?;
    let message = Message::builder()
        .from(from)
        .to(to)
        .subject("syncserver password reset")
        .body(format!(
            "Use this token to reset your syncserver password: {}\nThis token expires in 15 minutes.",
            token
        ))
        .map_err(|err| AppError::Internal(format!("failed to build reset email: {err}")))?;
    let transport_builder = if cfg.use_tls {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&cfg.server)
            .map_err(|err| AppError::Internal(format!("smtp relay config error: {err}")))?
            .port(cfg.port)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&cfg.server).port(cfg.port)
    };
    let transport_builder = if let Some(user) = &cfg.username {
        transport_builder.credentials(Credentials::new(
            user.clone(),
            cfg.password.clone().unwrap_or_default(),
        ))
    } else {
        transport_builder
    };
    let transport = transport_builder.build();
    transport
        .send(message)
        .await
        .map_err(|err| AppError::Internal(format!("failed to send reset email: {err}")))?;
    Ok(())
}
