//! Configuration exposure endpoints for smsgate2 and operators.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

use crate::{auth::user::UserAuth, error::AppError, state::AppState};

/// Public config snapshot returned to clients.
#[derive(Debug, Serialize)]
pub struct ConfigSnapshot {
    /// Environment tag.
    pub env: &'static str,
    /// Enabled authentication modes.
    pub auth_modes: Vec<&'static str>,
    /// Presence thresholds (ms).
    pub presence: PresenceSnapshot,
    /// Ingest limits and dedup TTLs.
    pub ingest: IngestSnapshot,
    /// Hot store backend.
    pub hot_store: &'static str,
    /// Role definitions for UI gating.
    pub roles: Vec<RoleSnapshot>,
}

/// Presence thresholds exposed to clients.
#[derive(Debug, Serialize)]
pub struct PresenceSnapshot {
    pub online_threshold_ms: u64,
    pub degraded_threshold_ms: u64,
}

/// Ingest constraints exposed to clients.
#[derive(Debug, Serialize)]
pub struct IngestSnapshot {
    pub dedup_ttl_ms: u64,
    pub hot_store_capacity: usize,
    pub max_batch: usize,
}

/// Role definition payload.
#[derive(Debug, Serialize)]
pub struct RoleSnapshot {
    pub name: String,
    pub precedence: u32,
    pub permissions: Vec<String>,
}

/// GET /api/v1/config
pub async fn get_config(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let config = &state.config;
    if !user.has_permission("config.read") {
        return Err(AppError::Validation("forbidden".into()));
    }
    let body = ConfigSnapshot {
        env: config.env.as_str(),
        auth_modes: config.auth.modes.iter().map(mode_label).collect(),
        presence: PresenceSnapshot {
            online_threshold_ms: config.presence.online_threshold_ms,
            degraded_threshold_ms: config.presence.degraded_threshold_ms,
        },
        ingest: IngestSnapshot {
            dedup_ttl_ms: config.ingest.dedup_ttl_ms,
            hot_store_capacity: config.ingest.hot_store_capacity,
            max_batch: config.ingest.max_batch,
        },
        hot_store: match config.hot_store.mode {
            crate::config::HotStoreMode::Redis => "redis",
            crate::config::HotStoreMode::Memory => "memory",
        },
        roles: config
            .rbac
            .roles
            .iter()
            .map(|role| RoleSnapshot {
                name: role.name.clone(),
                precedence: role.precedence,
                permissions: role.permissions.clone(),
            })
            .collect(),
    };
    Ok((StatusCode::OK, Json(body)))
}

fn mode_label(mode: &crate::config::AuthMode) -> &'static str {
    match mode {
        crate::config::AuthMode::Oauth => "oauth",
        crate::config::AuthMode::SimpleSignin => "simple_signin",
        crate::config::AuthMode::DomainSignin => "domain_signin",
    }
}
