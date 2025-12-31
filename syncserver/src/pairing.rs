use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::config::PairingConfig;

/// Stored pairing session state.
#[derive(Debug, Clone)]
    pub struct PairingSession {
        pub id: String,
        pub expires_at: DateTime<Utc>,
        pub used: bool,
    }

/// Response payload for session creation.
#[derive(Debug, Serialize)]
pub struct PairingSessionResponse {
    pub session_id: String,
    pub qr_payload: String,
    pub expires_at: DateTime<Utc>,
}

/// Request payload for session completion.
#[derive(Debug, Deserialize)]
pub struct PairingCompleteRequest {
    pub session_id: String,
    pub device_name: Option<String>,
}

/// Response payload for session completion.
#[derive(Debug, Serialize)]
pub struct PairingCompleteResponse {
    pub device_id: String,
    pub device_token: String,
}

/// In-memory pairing store.
#[derive(Debug, Clone)]
pub struct PairingStore {
    sessions: DashMap<String, PairingSession>,
    config: PairingConfig,
}

    impl PairingStore {
    pub fn new(config: PairingConfig) -> Self {
        Self {
            sessions: DashMap::new(),
            config,
        }
    }

    /// Create a new pairing session.
    pub fn create_session(&self) -> PairingSessionResponse {
        let id = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + Duration::seconds(self.config.session_ttl_secs as i64);
        self.sessions.insert(
            id.clone(),
            PairingSession {
                id: id.clone(),
                expires_at,
                used: false,
            },
        );
        let qr_payload = format!(
            "{{\"session_id\":\"{}\",\"expires_at\":\"{}\"}}",
            id, expires_at
        );
        PairingSessionResponse {
            session_id: id,
            qr_payload,
            expires_at,
        }
    }

    /// Complete a pairing session and emit device credentials.
        pub fn complete_session(
            &self,
            req: PairingCompleteRequest,
        ) -> Result<PairingCompleteResponse, String> {
            if let Some(mut entry) = self.sessions.get_mut(&req.session_id) {
            if entry.used {
                return Err("session already used".into());
            }
            if entry.expires_at < Utc::now() {
                return Err("session expired".into());
            }
            entry.used = true;
            let device_id = Uuid::new_v4().to_string();
            let device_token = Uuid::new_v4().to_string();
            return Ok(PairingCompleteResponse {
                device_id,
                device_token,
            });
            }
            Err("session not found".into())
        }

        /// Fetch pairing session status.
        pub fn get_status(&self, session_id: &str) -> Option<PairingSession> {
            self.sessions.get(session_id).map(|s| s.clone())
        }
    }
