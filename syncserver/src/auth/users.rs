//! Simple user store for local credentials and TOTP secrets.

use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use rand_core::OsRng;

use crate::{
    auth::{permissions, Principal, Role},
    config::AuthConfig,
    error::AppError,
};

/// Local user record for simple_signin and TOTP.
#[derive(Debug, Clone)]
pub struct UserRecord {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub role: Role,
    pub totp_secret: Option<String>,
    pub locked: bool,
    pub last_login_at: Option<DateTime<Utc>>,
}

/// In-memory user store with password hashing and lookup helpers.
#[derive(Debug, Clone, Default)]
pub struct UserStore {
    users: DashMap<String, UserRecord>,
    pepper: Option<String>,
    require_admin_totp: bool,
}

impl UserStore {
    /// Create a new user store with defaults and a bootstrap admin.
    pub fn new(config: &AuthConfig, default_roles: &[Role]) -> Self {
        let mut store = Self {
            users: DashMap::new(),
            pepper: config.password_pepper.clone(),
            require_admin_totp: config.require_admin_totp,
        };
        // Bootstrap admin if not already seeded.
        if !store.contains_username("admin") {
            let admin_role = default_roles
                .iter()
                .find(|r| r.name == "admin")
                .cloned()
                .unwrap_or(Role {
                    name: "admin".into(),
                    precedence: 100,
                    permissions: permissions::all_permissions(),
                });
            let _ = store
                .create_user("admin", "changeme", admin_role, None)
                .map_err(|err| tracing::warn!(error = %err, "failed to create bootstrap admin"));
        }
        store
    }

    fn contains_username(&self, username: &str) -> bool {
        self.users.iter().any(|u| u.username == username)
    }

    /// Create a local user with the provided credentials.
    pub fn create_user(
        &self,
        username: &str,
        password: &str,
        role: Role,
        totp_secret: Option<String>,
    ) -> Result<UserRecord, AppError> {
        if password.len() < 8 {
            return Err(AppError::Validation("password too short".into()));
        }
        if self.contains_username(username) {
            return Err(AppError::Validation("username already exists".into()));
        }
        let password_hash = self.hash_password(password)?;
        let record = UserRecord {
            id: uuid::Uuid::new_v4().to_string(),
            username: username.to_string(),
            password_hash,
            role,
            totp_secret,
            locked: false,
            last_login_at: None,
        };
        self.users.insert(record.id.clone(), record.clone());
        Ok(record)
    }

    /// Authenticate a user via simple_signin and update last login time.
    pub fn authenticate(&self, username: &str, password: &str) -> Result<UserRecord, AppError> {
        let mut found = None;
        for entry in self.users.iter() {
            if entry.username == username {
                found = Some(entry);
                break;
            }
        }
        let mut entry = found.ok_or_else(|| AppError::Validation("invalid credentials".into()))?;
        if entry.locked {
            return Err(AppError::Validation("account locked".into()));
        }
        self.verify_password(password, &entry.password_hash)?;
        entry.last_login_at = Some(Utc::now());
        let updated = entry.clone();
        self.users.insert(entry.id.clone(), updated.clone());
        Ok(updated)
    }

    fn hash_password(&self, password: &str) -> Result<String, AppError> {
        let salt = SaltString::generate(&mut OsRng);
        let mut password_material = password.to_string();
        if let Some(pepper) = &self.pepper {
            password_material.push_str(pepper);
        }
        let hash = Argon2::default()
            .hash_password(password_material.as_bytes(), &salt)
            .map_err(|err| AppError::Internal(format!("hash error: {}", err)))?
            .to_string();
        Ok(hash)
    }

    fn verify_password(&self, password: &str, hash: &str) -> Result<(), AppError> {
        let parsed_hash =
            PasswordHash::new(hash).map_err(|err| AppError::Internal(format!("hash error: {}", err)))?;
        let mut password_material = password.to_string();
        if let Some(pepper) = &self.pepper {
            password_material.push_str(pepper);
        }
        Argon2::default()
            .verify_password(password_material.as_bytes(), &parsed_hash)
            .map_err(|_| AppError::Validation("invalid credentials".into()))
    }
}

impl From<UserRecord> for Principal {
    fn from(value: UserRecord) -> Self {
        Principal::User {
            id: value.id,
            role: value.role,
        }
    }
}
