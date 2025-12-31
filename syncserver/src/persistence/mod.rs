//! Persistence adapters for events and audit logs.
//! Currently supports a JSON lines file writer for small installs.

use async_trait::async_trait;
use tokio::{
    fs::{self, OpenOptions},
    io::AsyncWriteExt,
    sync::Mutex,
};

use crate::domain::SmsEvent;

pub mod sql;
pub mod worker;

/// Interface for durable storage of events (and later audit/login records).
#[async_trait]
pub trait PersistentStore: Send + Sync {
    /// Persist an event for compliance/retention.
    async fn persist_event(&self, event: &SmsEvent) -> Result<(), String>;
    /// Persist an audit entry.
    async fn persist_audit(&self, audit: &crate::domain::AuditEntry) -> Result<(), String>;
    /// Persist a login event.
    async fn persist_login(&self, login: &crate::domain::LoginEvent) -> Result<(), String>;
}

/// JSON lines writer for events; suitable for dev/small installs.
pub struct JsonDb {
    path: std::path::PathBuf,
    file: Mutex<tokio::fs::File>,
}

impl JsonDb {
    /// Create a new JSON DB writer at the provided file path.
    pub async fn new(path: std::path::PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|err| format!("failed to create parent dirs: {}", err))?;
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
            .map_err(|err| format!("failed to open json db file {}: {}", path.display(), err))?;
        Ok(Self {
            path,
            file: Mutex::new(file),
        })
    }
}

#[async_trait]
impl PersistentStore for JsonDb {
    async fn persist_event(&self, event: &SmsEvent) -> Result<(), String> {
        let serialized = serde_json::to_string(event)
            .map_err(|err| format!("failed to serialize event: {}", err))?;
        let mut file = self.file.lock().await;
        file.write_all(serialized.as_bytes())
            .await
            .map_err(|err| format!("failed to write event to {}: {}", self.path.display(), err))?;
        file.write_all(b"\n")
            .await
            .map_err(|err| format!("failed to write newline: {}", err))?;
        file.flush()
            .await
            .map_err(|err| format!("failed to flush json db file: {}", err))
    }

    async fn persist_audit(&self, audit: &crate::domain::AuditEntry) -> Result<(), String> {
        let serialized = serde_json::to_string(audit)
            .map_err(|err| format!("failed to serialize audit: {}", err))?;
        let mut file = self.file.lock().await;
        file.write_all(serialized.as_bytes())
            .await
            .map_err(|err| format!("failed to write audit to {}: {}", self.path.display(), err))?;
        file.write_all(b"\n")
            .await
            .map_err(|err| format!("failed to write newline: {}", err))?;
        file.flush()
            .await
            .map_err(|err| format!("failed to flush json db file: {}", err))
    }

    async fn persist_login(&self, login: &crate::domain::LoginEvent) -> Result<(), String> {
        let serialized = serde_json::to_string(login)
            .map_err(|err| format!("failed to serialize login event: {}", err))?;
        let mut file = self.file.lock().await;
        file.write_all(serialized.as_bytes())
            .await
            .map_err(|err| format!("failed to write login event to {}: {}", self.path.display(), err))?;
        file.write_all(b"\n")
            .await
            .map_err(|err| format!("failed to write newline: {}", err))?;
        file.flush()
            .await
            .map_err(|err| format!("failed to flush json db file: {}", err))
    }
}
