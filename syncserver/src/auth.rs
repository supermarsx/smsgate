//! Authentication and RBAC scaffolding.
//! Device auth is currently a simple token header check; RBAC structs are defined for future enforcement.

use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts},
    http::{request::Parts, StatusCode},
};
use headers::{authorization::Bearer, Authorization, Header};
use serde::{Deserialize, Serialize};

use crate::{config::AuthMode, error::AppError};

/// Actor types recognized by the system.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Principal {
    /// Human user with a role.
    User { id: String, role: Role },
    /// Device authenticated by token.
    Device { id: String },
}

/// Role descriptor for future RBAC enforcement.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Role {
    pub name: String,
    pub precedence: u32,
    pub permissions: Vec<String>,
}

/// Context extracted from requests after authentication.
#[derive(Debug, Clone)]
pub struct AuthContext {
    pub principal: Principal,
}

impl AuthContext {
    pub fn is_device(&self) -> bool {
        matches!(self.principal, Principal::Device { .. })
    }

    pub fn role(&self) -> Option<&Role> {
        match &self.principal {
            Principal::User { role, .. } => Some(role),
            _ => None,
        }
    }
}

/// Device token map used for simple header-based auth (placeholder).
#[derive(Debug, Clone, Default)]
pub struct DeviceAuthStore {
    tokens: std::collections::HashMap<String, String>,
}

impl DeviceAuthStore {
    pub fn with_token(mut self, device_id: &str, token: &str) -> Self {
        self.tokens.insert(device_id.to_string(), token.to_string());
        self
    }

    pub fn validate(&self, device_id: &str, token: &str) -> bool {
        self.tokens
            .get(device_id)
            .map(|stored| stored == token)
            .unwrap_or(false)
    }
}

impl FromRef<crate::state::AppState> for DeviceAuthStore {
    fn from_ref(state: &crate::state::AppState) -> Self {
        state.device_auth.clone()
    }
}

/// Extractor for device auth using `Authorization: Bearer <token>` and `x-device-id`.
pub struct DeviceAuth(pub AuthContext);

#[async_trait]
impl<S> FromRequestParts<S> for DeviceAuth
where
    DeviceAuthStore: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = (StatusCode, String);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_store = DeviceAuthStore::from_ref(state);
        let headers = &parts.headers;
        let device_id = headers
            .get("x-device-id")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                (
                    StatusCode::UNAUTHORIZED,
                    "missing x-device-id header".to_string(),
                )
            })?;

        let bearer = Authorization::<Bearer>::decode(headers)
            .map_err(|_| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;

        if auth_store.validate(device_id, bearer.token()) {
            Ok(DeviceAuth(AuthContext {
                principal: Principal::Device {
                    id: device_id.to_string(),
                },
            }))
        } else {
            Err((StatusCode::UNAUTHORIZED, "invalid device token".to_string()))
        }
    }
}

/// Permissions list aligned with spec; enforcement pending.
pub mod permissions {
    pub const EVENTS_READ: &str = "events.read";
    pub const EVENTS_CLAIM: &str = "events.claim";
    pub const EVENTS_VERIFY: &str = "events.verify";
    pub const EVENTS_REJECT: &str = "events.reject";
    pub const DEVICES_READ: &str = "devices.read";
    pub const DEVICES_WRITE: &str = "devices.write";
    pub const DEVICES_DISABLE: &str = "devices.disable";
    pub const DEVICES_ROTATE_TOKEN: &str = "devices.rotate_token";
    pub const NUMBERS_READ: &str = "numbers.read";
    pub const NUMBERS_WRITE: &str = "numbers.write";
    pub const USERS_READ: &str = "users.read";
    pub const USERS_WRITE: &str = "users.write";
    pub const USERS_FORCE_LOGOUT: &str = "users.force_logout";
    pub const USERS_UNLOCK: &str = "users.unlock";
    pub const CONFIG_READ: &str = "config.read";
    pub const CONFIG_WRITE: &str = "config.write";
    pub const AUDIT_READ: &str = "audit.read";
    pub const LOGINS_READ: &str = "logins.read";
}
