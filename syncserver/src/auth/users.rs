//! Simple user store for local credentials and TOTP secrets.

use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use axum::extract::FromRef;
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
    pub lock_until: Option<DateTime<Utc>>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub password_history: Vec<String>,
}

/// In-memory user store with password hashing and lookup helpers.
#[derive(Debug, Clone)]
pub struct UserStore {
    users: DashMap<String, UserRecord>,
    pepper: Option<String>,
    resets: DashMap<String, PasswordResetEntry>,
    failed_attempts: DashMap<String, (u32, DateTime<Utc>)>,
    config: AuthConfig,
}

#[derive(Debug, Clone)]
struct PasswordResetEntry {
    user_id: String,
    expires_at: DateTime<Utc>,
}

impl UserStore {
    /// Create a new user store with defaults and a bootstrap admin.
    pub fn new(config: &AuthConfig, default_roles: &[Role]) -> Self {
        let store = Self {
            users: DashMap::new(),
            pepper: config.password_pepper.clone(),
            resets: DashMap::new(),
            failed_attempts: DashMap::new(),
            config: config.clone(),
        };
        // Bootstrap admin if not already seeded.
        let bootstrap_username = config
            .bootstrap_admin_username
            .clone()
            .unwrap_or_else(|| "admin".into());
        if !store.contains_username(&bootstrap_username) {
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
                .create_user(&bootstrap_username, "SmsgateSync#2025!", admin_role, None)
                .map_err(|err| tracing::warn!(error = %err, "failed to create bootstrap admin"));
        }
        store
    }

    fn contains_username(&self, username: &str) -> bool {
        self.users.iter().any(|u| u.username == username)
    }

    /// Fetch a user by id.
    pub fn get(&self, user_id: &str) -> Option<UserRecord> {
        self.users.get(user_id).map(|v| v.value().clone())
    }

    /// Lookup user by username.
    pub fn user_by_username(&self, username: &str) -> Option<UserRecord> {
        self.users
            .iter()
            .find(|u| u.username == username)
            .map(|u| u.value().clone())
    }

    /// Return a sorted list of users for admin listing.
    pub fn list(&self) -> Vec<UserRecord> {
        let mut records: Vec<_> = self.users.iter().map(|u| u.value().clone()).collect();
        records.sort_by(|a, b| a.username.cmp(&b.username));
        records
    }

    /// Create a local user with the provided credentials.
    pub fn create_user(
        &self,
        username: &str,
        password: &str,
        role: Role,
        totp_secret: Option<String>,
    ) -> Result<UserRecord, AppError> {
        self.enforce_password_policy(password, &role)?;
        if self.contains_username(username) {
            return Err(AppError::Validation("username already exists".into()));
        }
        let password_hash = self.hash_password(password)?;
        let history = vec![password_hash.clone()];
        let record = UserRecord {
            id: uuid::Uuid::new_v4().to_string(),
            username: username.to_string(),
            password_hash,
            role,
            totp_secret,
            locked: false,
            lock_until: None,
            last_login_at: None,
            password_history: history,
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
        let entry = found.ok_or_else(|| AppError::Validation("invalid credentials".into()))?;
        let mut user = entry.value().clone();
        drop(entry);
        if user.locked || self.is_temporarily_locked(&user.username, &user.lock_until) {
            return Err(AppError::Validation("account locked".into()));
        }
        self.verify_password(password, &user.password_hash)?;
        self.failed_attempts.remove(&user.username);
        user.last_login_at = Some(Utc::now());
        let updated = user.clone();
        self.users.insert(user.id.clone(), updated.clone());
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
        let parsed_hash = PasswordHash::new(hash)
            .map_err(|err| AppError::Internal(format!("hash error: {}", err)))?;
        let mut password_material = password.to_string();
        if let Some(pepper) = &self.pepper {
            password_material.push_str(pepper);
        }
        Argon2::default()
            .verify_password(password_material.as_bytes(), &parsed_hash)
            .map_err(|_| AppError::Validation("invalid credentials".into()))
    }

    /// Issue a password reset token (stub for email delivery).
    pub fn issue_reset_token(&self, username: &str) -> Result<String, AppError> {
        let user_id = self
            .users
            .iter()
            .find(|u| u.username == username)
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Validation("user not found".into()))?;
        let token = crate::auth::session::generate_token();
        let entry = PasswordResetEntry {
            user_id,
            expires_at: Utc::now() + chrono::Duration::minutes(15),
        };
        self.resets.insert(token.clone(), entry);
        Ok(token)
    }

    /// Reset a user's password using a reset token.
    pub fn reset_password(&self, token: &str, new_password: &str) -> Result<String, AppError> {
        let entry = self
            .resets
            .get(token)
            .ok_or_else(|| AppError::Validation("invalid reset token".into()))?;
        if entry.expires_at < Utc::now() {
            return Err(AppError::Validation("reset token expired".into()));
        }
        let user_id = entry.user_id.clone();
        drop(entry);
        self.set_password(&user_id, new_password)?;
        self.resets.remove(token);
        Ok(user_id)
    }

    /// Directly set a user's password (admin path).
    pub fn set_password(&self, user_id: &str, new_password: &str) -> Result<UserRecord, AppError> {
        if let Some(mut user) = self.users.get_mut(user_id) {
            self.enforce_password_policy(new_password, &user.role)?;
            if self.password_in_history(new_password, &user) {
                return Err(AppError::Validation("password was recently used".into()));
            }
            let hash = self.hash_password(new_password)?;
            user.password_hash = hash.clone();
            user.password_history.insert(0, hash);
            user.password_history
                .truncate(self.config.password_history_size as usize);
            return Ok(user.clone());
        }
        Err(AppError::Validation("user not found".into()))
    }

    /// Update a user's role.
    pub fn set_role(&self, user_id: &str, role: Role) -> Result<UserRecord, AppError> {
        if let Some(mut user) = self.users.get_mut(user_id) {
            user.role = role;
            return Ok(user.clone());
        }
        Err(AppError::Validation("user not found".into()))
    }

    /// Lock or unlock a user account.
    pub fn set_locked(&self, user_id: &str, locked: bool) -> Result<UserRecord, AppError> {
        if let Some(mut user) = self.users.get_mut(user_id) {
            user.locked = locked;
            if !locked {
                self.failed_attempts.remove(&user.username);
                user.lock_until = None;
            }
            return Ok(user.clone());
        }
        Err(AppError::Validation("user not found".into()))
    }

    /// Delete a user.
    pub fn delete(&self, user_id: &str) {
        self.users.remove(user_id);
    }

    /// Rebind user roles from a fresh RBAC store (used when roles change).
    pub fn rebind_roles(&self, rbac: &crate::auth::rbac::RbacStore) {
        for mut user in self.users.iter_mut() {
            if let Some(role) = rbac.role_by_name(&user.role.name) {
                user.role = role;
            }
        }
    }

    /// Record a failed attempt and return whether the account is now locked.
    pub fn record_failure(&self, username: &str) -> bool {
        let mut attempts = self
            .failed_attempts
            .entry(username.to_string())
            .or_insert((0, Utc::now()));
        attempts.0 += 1;
        if attempts.0 >= self.config.max_failed_attempts {
            let until = Utc::now() + chrono::Duration::seconds(self.config.lockout_secs as i64);
            attempts.1 = until;
            if let Some(mut user) = self.users.iter_mut().find(|u| u.username == username) {
                user.lock_until = Some(until);
            }
            true
        } else {
            false
        }
    }

    fn is_temporarily_locked(&self, username: &str, lock_until: &Option<DateTime<Utc>>) -> bool {
        if let Some(until) = lock_until {
            if Utc::now() < *until {
                return true;
            }
        }
        if let Some((_, until)) = self.failed_attempts.get(username).map(|v| *v) {
            if Utc::now() < until {
                return true;
            }
        }
        false
    }

    fn enforce_password_policy(&self, password: &str, role: &Role) -> Result<(), AppError> {
        let min_len = if role.name == "admin" {
            self.config.admin_password_min_length
        } else {
            self.config.password_min_length
        };
        if password.len() < min_len as usize {
            return Err(AppError::Validation("password too short".into()));
        }
        if self.estimate_entropy(password) < self.config.password_min_entropy_bits as f64 {
            return Err(AppError::Validation("password too weak".into()));
        }
        if self.is_breached_password(password) {
            return Err(AppError::Validation(
                "password too weak (breached/denylisted)".into(),
            ));
        }
        Ok(())
    }

    fn is_breached_password(&self, password: &str) -> bool {
        let lower = password.to_ascii_lowercase();
        if self
            .config
            .weak_passwords
            .iter()
            .any(|w| lower == w.to_ascii_lowercase())
        {
            return true;
        }
        let common_patterns = [
            "password",
            "letmein",
            "welcome",
            "qwerty",
            "abc123",
            "iloveyou",
            "admin",
            "changeme",
            "111111",
            "123456",
            "123456789",
            "000000",
        ];
        if common_patterns.iter().any(|p| lower.contains(p)) {
            return true;
        }
        if password.len() >= 8 && password.chars().all(|c| c.is_ascii_digit()) {
            return true;
        }
        false
    }

    fn password_in_history(&self, password: &str, user: &UserRecord) -> bool {
        if self.verify_password(password, &user.password_hash).is_ok() {
            return true;
        }
        user.password_history
            .iter()
            .any(|hash| self.verify_password(password, hash).is_ok())
    }

    /// Rough entropy estimator based on length and character classes.
    fn estimate_entropy(&self, password: &str) -> f64 {
        let mut classes = 0f64;
        let bytes = password.as_bytes();
        if bytes.iter().any(|c| c.is_ascii_lowercase()) {
            classes += 26f64;
        }
        if bytes.iter().any(|c| c.is_ascii_uppercase()) {
            classes += 26f64;
        }
        if bytes.iter().any(|c| c.is_ascii_digit()) {
            classes += 10f64;
        }
        if bytes.iter().any(|c| !c.is_ascii_alphanumeric()) {
            classes += 32f64;
        }
        if classes == 0.0 {
            return 0.0;
        }
        (password.len() as f64) * classes.log2()
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

impl FromRef<crate::state::AppState> for std::sync::Arc<UserStore> {
    fn from_ref(state: &crate::state::AppState) -> Self {
        state.user_store.clone()
    }
}
