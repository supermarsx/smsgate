//! Session management for user principals.

use axum::extract::FromRef;
use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use rand_core::{OsRng, RngCore};

use crate::{auth::Principal, config::AuthConfig};

/// Session record stored in-memory.
#[derive(Debug, Clone)]
pub struct Session {
    /// Session identifier returned to clients.
    pub token: String,
    /// Associated principal.
    pub principal: Principal,
    /// Expiration timestamp.
    pub expires_at: DateTime<Utc>,
}

/// In-memory session store keyed by random bearer tokens.
#[derive(Debug, Clone, Default)]
pub struct SessionStore {
    sessions: DashMap<String, Session>,
    ttl: Duration,
}

impl SessionStore {
    /// Create a session store with TTL derived from auth config.
    pub fn new(config: &AuthConfig) -> Self {
        Self {
            sessions: DashMap::new(),
            ttl: Duration::seconds(config.session_ttl_secs as i64),
        }
    }

    /// Create and store a new session for the principal.
    pub fn create_session(&self, principal: Principal) -> Session {
        let token = generate_token();
        let session = Session {
            token: token.clone(),
            principal,
            expires_at: Utc::now() + self.ttl,
        };
        self.sessions.insert(token.clone(), session.clone());
        session
    }

    /// Validate a session token, returning the session if not expired.
    pub fn validate(&self, token: &str) -> Option<Session> {
        if let Some(session) = self.sessions.get(token) {
            if session.expires_at > Utc::now() {
                return Some(session.clone());
            }
        }
        self.sessions.remove(token);
        None
    }

    /// Invalidate a session token.
    pub fn revoke(&self, token: &str) {
        self.sessions.remove(token);
    }

    /// Revoke all sessions for a principal id (user or device).
    pub fn revoke_by_principal(&self, principal_id: &str) {
        let keys: Vec<String> = self
            .sessions
            .iter()
            .filter_map(|entry| match &entry.principal {
                Principal::User { id, .. } if id == principal_id => Some(entry.token.clone()),
                Principal::Device { id } if id == principal_id => Some(entry.token.clone()),
                _ => None,
            })
            .collect();
        for token in keys {
            self.sessions.remove(&token);
        }
    }
}

/// Generate a cryptographically random token.
pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

impl FromRef<crate::state::AppState> for std::sync::Arc<SessionStore> {
    fn from_ref(state: &crate::state::AppState) -> Self {
        state.session_store.clone()
    }
}
