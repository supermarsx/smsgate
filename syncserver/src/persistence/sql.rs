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
        let mut url_owned = url.to_string();
        let mut opts = AnyPoolOptions::new().max_connections(5);
        if url.starts_with("sqlite::memory:") {
            // Shared cache + single connection so schema persists.
            if !url.contains("cache=shared") {
                url_owned = format!("{}?cache=shared", url.trim_end_matches('?'));
            }
            opts = opts.max_connections(1);
        }

        let pool = opts
            .connect(&url_owned)
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

    async fn persist_audit(&self, audit: &crate::domain::AuditEntry) -> Result<(), String> {
        let payload =
            serde_json::to_string(audit).map_err(|err| format!("serialize audit failed: {err}"))?;
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT NULL,
                result TEXT NOT NULL,
                correlation_id TEXT NULL,
                payload TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                ip TEXT NULL,
                user_agent TEXT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|err| format!("failed to init audit_log table: {err}"))?;

        sqlx::query(
            r#"
            INSERT INTO audit_log (id, actor, action, target, result, correlation_id, payload, occurred_at, ip, user_agent)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT(id) DO NOTHING
            "#,
        )
        .bind(&audit.id)
        .bind(&audit.actor)
        .bind(&audit.action)
        .bind(&audit.target)
        .bind(&audit.result)
        .bind(&audit.correlation_id)
        .bind(payload)
        .bind(audit.occurred_at.to_rfc3339())
        .bind(&audit.ip)
        .bind(&audit.user_agent)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(|err| format!("failed to persist audit: {err}"))
    }

    async fn persist_login(&self, login: &crate::domain::LoginEvent) -> Result<(), String> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS login_events (
                id TEXT PRIMARY KEY,
                identity TEXT NOT NULL,
                mode TEXT NOT NULL,
                result TEXT NOT NULL,
                ip TEXT NOT NULL,
                user_agent TEXT NULL,
                two_fa_passed INTEGER NOT NULL,
                occurred_at TEXT NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|err| format!("failed to init login_events table: {err}"))?;

        sqlx::query(
            r#"
            INSERT INTO login_events (id, identity, mode, result, ip, user_agent, two_fa_passed, occurred_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(id) DO NOTHING
            "#,
        )
        .bind(&login.id)
        .bind(&login.identity)
        .bind(format!("{:?}", login.mode))
        .bind(&login.result)
        .bind(&login.ip)
        .bind(&login.user_agent)
        .bind(login.two_fa_passed as i32)
        .bind(login.occurred_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(|err| format!("failed to persist login event: {err}"))
    }
}

impl SqlStore {
    /// Helper used in tests to verify rows written.
    pub async fn count_events(&self) -> Result<i64, String> {
        sqlx::query_scalar("SELECT COUNT(*) FROM events")
            .fetch_one(&self.pool)
            .await
            .map_err(|err| format!("count query failed: {err}"))
    }
}
