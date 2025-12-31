//! SQL-backed persistence using `sqlx::Any` to support sqlite/postgres/mysql.

use async_trait::async_trait;
use sqlx::{any::AnyPoolOptions, AnyPool};
use std::path::Path;
use std::sync::Once;

use crate::domain::SmsEvent;

use super::PersistentStore;

/// SQL store wrapper using sqlx any pool.
#[derive(Clone)]
pub struct SqlStore {
    pool: AnyPool,
}

impl SqlStore {
    /// Connect to the provided URL and ensure the events table exists.
    pub async fn connect(url: &str) -> Result<Self, String> {
        static INIT: Once = Once::new();
        INIT.call_once(|| {
            sqlx::any::install_default_drivers();
        });
        let pool = AnyPoolOptions::new()
            .max_connections(5)
            .connect(url)
            .await
            .map_err(|err| format!("failed to connect sql store: {err}"))?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                device_id TEXT NOT NULL,
                server_received_at TEXT NOT NULL
            )
            "#,
        )
        .execute(&pool)
        .await
        .map_err(|err| format!("failed to initialize events table: {err}"))?;

        Ok(Self { pool })
    }
}

/// Build a sqlite URL from a filesystem path (normalizing separators).
pub fn sqlite_url_from_path(path: &Path) -> String {
    let mut path_str = path.to_string_lossy().replace('\\', "/");
    if !path_str.starts_with('/') {
        path_str = format!("/{}", path_str);
    }
    format!("sqlite://{}", path_str)
}

#[async_trait]
impl PersistentStore for SqlStore {
    async fn persist_event(&self, event: &SmsEvent) -> Result<(), String> {
        let payload =
            serde_json::to_string(event).map_err(|err| format!("serialize event failed: {err}"))?;
        sqlx::query(
            r#"
            INSERT INTO events (id, payload, device_id, server_received_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT(id) DO UPDATE SET payload=excluded.payload
            "#,
        )
        .bind(&event.id)
        .bind(payload)
        .bind(&event.device_id)
        .bind(event.server_received_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(|err| format!("failed to persist event: {err}"))
    }
}
