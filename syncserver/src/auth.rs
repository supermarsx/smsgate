//! Authentication and RBAC scaffolding.
//! Device auth is a header-based token check backed by an in-memory registry with enable/disable
//! controls; RBAC structs are defined for future enforcement.

use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts},
    http::{request::Parts, StatusCode},
};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use headers::{authorization::Bearer, Authorization, Header};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;

pub mod rbac;
pub mod session;
pub mod user;
pub mod users;
pub mod oauth;
pub mod domain;

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

impl Role {
    pub fn has_permission(&self, perm: &str) -> bool {
        self.permissions.iter().any(|p| p == perm)
    }
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

    pub fn has_permission(&self, perm: &str) -> bool {
        match &self.principal {
            Principal::User { role, .. } => role.has_permission(perm),
            Principal::Device { .. } => false,
        }
    }
}

/// Device record kept in-memory for token validation and admin operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceRecord {
    /// Device identifier issued during pairing.
    pub id: String,
    /// Friendly name chosen during pairing or via rename.
    pub name: Option<String>,
    /// Whether the device is allowed to authenticate.
    pub enabled: bool,
    /// When the device was first seen/registered.
    pub created_at: DateTime<Utc>,
    /// Last successful auth timestamp (ingest/presence).
    pub last_seen_at: Option<DateTime<Utc>>,
    /// When the token was last rotated/issued.
    pub last_token_rotated_at: Option<DateTime<Utc>>,
    /// Reason provided when disabled.
    pub disabled_reason: Option<String>,
    /// Hashed token for validation (never expose raw token).
    pub token_hash: String,
}

/// Validation failures for device tokens.
#[derive(Debug, Clone)]
pub enum DeviceAuthError {
    /// Device entry not found.
    NotFound,
    /// Device is disabled with an optional reason.
    Disabled(Option<String>),
    /// Provided bearer token is invalid.
    InvalidToken,
}

/// Device token map used for header-based auth with enable/disable controls.
#[derive(Debug, Clone, Default)]
pub struct DeviceAuthStore {
    devices: Arc<DashMap<String, DeviceRecord>>,
}

impl DeviceAuthStore {
    /// Create a new, empty device auth store.
    pub fn new() -> Self {
        Self {
            devices: Arc::new(DashMap::new()),
        }
    }

    pub fn from_rbac_config(roles: &[crate::config::RoleDefinition]) -> Self {
        let store = DeviceAuthStore::default();
        // Placeholder: seed a demo device token based on role name if provided via env later.
        for role in roles {
            if role.name == "device" {
                store.set_token("device-1", "devtoken-placeholder");
            }
        }
        store
    }

    pub fn with_token(self, device_id: &str, token: &str) -> Self {
        self.set_token(device_id, token);
        self
    }

    /// Set or rotate a device token (hashed) for validation and enable the device.
    pub fn set_token(&self, device_id: &str, token: &str) -> DeviceRecord {
        let hashed = hash_token(token);
        let now = Utc::now();
        let mut entry = self
            .devices
            .entry(device_id.to_string())
            .or_insert_with(|| DeviceRecord {
                id: device_id.to_string(),
                name: None,
                enabled: true,
                created_at: now,
                last_seen_at: None,
                last_token_rotated_at: Some(now),
                disabled_reason: None,
                token_hash: hashed.clone(),
            });
        entry.enabled = true;
        entry.disabled_reason = None;
        entry.token_hash = hashed;
        entry.last_token_rotated_at = Some(now);
        entry.clone()
    }

    /// Register a device with name + token, enabling it if previously disabled.
    pub fn register_with_name(
        &self,
        device_id: &str,
        token: &str,
        name: Option<String>,
    ) -> DeviceRecord {
        let mut record = self.set_token(device_id, token);
        if let Some(name) = name {
            if let Some(mut entry) = self.devices.get_mut(device_id) {
                entry.name = Some(name);
                record = entry.clone();
            }
        }
        record
    }

    /// Seed a bootstrap device from configuration.
    pub fn register_bootstrap(&self, bootstrap: &crate::config::BootstrapDevice) -> DeviceRecord {
        let mut record =
            self.register_with_name(&bootstrap.id, &bootstrap.token, bootstrap.name.clone());
        if !bootstrap.enabled {
            record = self
                .set_enabled(&bootstrap.id, false, Some("bootstrap disabled".into()))
                .unwrap_or(record);
        }
        record
    }

    /// Rename a device; fails if the device does not exist.
    pub fn rename(&self, device_id: &str, name: String) -> Result<DeviceRecord, String> {
        if let Some(mut entry) = self.devices.get_mut(device_id) {
            entry.name = Some(name);
            return Ok(entry.clone());
        }
        Err("device not found".into())
    }

    /// Enable or disable a device with an optional reason.
    pub fn set_enabled(
        &self,
        device_id: &str,
        enabled: bool,
        reason: Option<String>,
    ) -> Result<DeviceRecord, String> {
        if let Some(mut entry) = self.devices.get_mut(device_id) {
            entry.enabled = enabled;
            entry.disabled_reason = if enabled { None } else { reason };
            return Ok(entry.clone());
        }
        Err("device not found".into())
    }

    /// Fetch a device record for diagnostics.
    pub fn diagnostics(&self, device_id: &str) -> Result<DeviceRecord, String> {
        self.devices
            .get(device_id)
            .map(|entry| entry.value().clone())
            .ok_or_else(|| "device not found".to_string())
    }

    /// List all device records (unsorted).
    pub fn list(&self) -> Vec<DeviceRecord> {
        self.devices
            .iter()
            .map(|entry| entry.value().clone())
            .collect()
    }

    /// Validate a device token; updates last_seen on success.
    pub fn validate(&self, device_id: &str, token: &str) -> Result<DeviceRecord, DeviceAuthError> {
        if let Some(mut entry) = self.devices.get_mut(device_id) {
            if !entry.enabled {
                return Err(DeviceAuthError::Disabled(entry.disabled_reason.clone()));
            }
            if entry.token_hash == hash_token(token) {
                entry.last_seen_at = Some(Utc::now());
                return Ok(entry.clone());
            }
            return Err(DeviceAuthError::InvalidToken);
        }
        Err(DeviceAuthError::NotFound)
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
        let device_id = parts
            .headers
            .get("x-device-id")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                (
                    StatusCode::UNAUTHORIZED,
                    "missing x-device-id header".to_string(),
                )
            })?;

        let mut values = parts
            .headers
            .get_all(axum::http::header::AUTHORIZATION)
            .iter();
        let bearer = Authorization::<Bearer>::decode(&mut values)
            .map_err(|_| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;

        match auth_store.validate(device_id, bearer.token()) {
            Ok(_) => Ok(DeviceAuth(AuthContext {
                principal: Principal::Device {
                    id: device_id.to_string(),
                },
            })),
            Err(DeviceAuthError::NotFound) => {
                Err((StatusCode::UNAUTHORIZED, "unknown device".into()))
            }
            Err(DeviceAuthError::InvalidToken) => {
                Err((StatusCode::UNAUTHORIZED, "invalid device token".into()))
            }
            Err(DeviceAuthError::Disabled(reason)) => Err((
                StatusCode::FORBIDDEN,
                reason.unwrap_or_else(|| "device disabled".into()),
            )),
        }
    }
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
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

    /// Return all permissions for bootstrap/admin roles.
    pub fn all_permissions() -> Vec<String> {
        vec![
            EVENTS_READ.into(),
            EVENTS_CLAIM.into(),
            EVENTS_VERIFY.into(),
            EVENTS_REJECT.into(),
            DEVICES_READ.into(),
            DEVICES_WRITE.into(),
            DEVICES_DISABLE.into(),
            DEVICES_ROTATE_TOKEN.into(),
            NUMBERS_READ.into(),
            NUMBERS_WRITE.into(),
            USERS_READ.into(),
            USERS_WRITE.into(),
            USERS_FORCE_LOGOUT.into(),
            USERS_UNLOCK.into(),
            CONFIG_READ.into(),
            CONFIG_WRITE.into(),
            AUDIT_READ.into(),
            LOGINS_READ.into(),
        ]
    }
}
