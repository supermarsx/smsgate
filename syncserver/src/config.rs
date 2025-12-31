//! Configuration types and loader for syncserver.
//! Supports environment overrides, partial merges, and versioned snapshots used
//! for HTTP/WS config exposure.

use crate::error::AppError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{env, fs, net::SocketAddr, path::PathBuf};

/// Serde default helper used for boolean flags that default to true.
fn default_true() -> bool {
    true
}

/// Execution environment to allow different defaults and logging levels.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RunEnvironment {
    /// Development mode with relaxed defaults.
    Development,
    /// Production mode with stricter defaults.
    Production,
}

impl Default for RunEnvironment {
    fn default() -> Self {
        RunEnvironment::Development
    }
}

impl RunEnvironment {
    /// Returns a stable string representation for logs and JSON responses.
    pub fn as_str(&self) -> &'static str {
        match self {
            RunEnvironment::Development => "development",
            RunEnvironment::Production => "production",
        }
    }

    /// Parse an environment variable into a `RunEnvironment` value.
    pub fn from_env(value: Option<String>) -> Self {
        match value
            .as_deref()
            .map(|env| env.to_ascii_lowercase())
            .as_deref()
        {
            Some("production") | Some("prod") => RunEnvironment::Production,
            _ => RunEnvironment::Development,
        }
    }
}

/// Hot store backing mode selection.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HotStoreMode {
    /// Use Redis for fanout + dedup TTL keys.
    Redis,
    /// Operate in-memory only (degraded mode).
    Memory,
}

impl Default for HotStoreMode {
    fn default() -> Self {
        HotStoreMode::Memory
    }
}

/// Storage adapter choices for durable persistence.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseAdapter {
    /// JSON DB append-only log for small installs.
    JsonDb,
    /// SQLite file.
    Sqlite,
    /// Postgres database.
    Postgres,
    /// MySQL / MariaDB database.
    Mysql,
}

impl Default for DatabaseAdapter {
    fn default() -> Self {
        DatabaseAdapter::JsonDb
    }
}

/// Supported authentication modes for the server.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMode {
    /// OAuth / OIDC.
    Oauth,
    /// Local credential store.
    SimpleSignin,
    /// LDAP / Active Directory.
    DomainSignin,
}

impl Default for AuthMode {
    fn default() -> Self {
        AuthMode::SimpleSignin
    }
}

/// Web/API server facing configuration.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerConfig {
    /// IP/interface to bind.
    pub host: String,
    /// TCP port to listen on.
    pub port: u16,
    /// WS connection cap to avoid resource exhaustion.
    pub ws_max_connections: u32,
    /// Default snapshot event count pushed on connect.
    pub ws_snapshot_limit: u32,
    /// Ping interval applied to WS clients (ms).
    pub ws_ping_interval_ms: u64,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 8080,
            ws_max_connections: 5_000,
            ws_snapshot_limit: 10,
            ws_ping_interval_ms: 15_000,
        }
    }
}

/// Hot store configuration (Redis or in-memory).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HotStoreConfig {
    /// Backend selection.
    pub mode: HotStoreMode,
    /// Redis connection string when mode = redis.
    pub redis_url: Option<String>,
}

impl Default for HotStoreConfig {
    fn default() -> Self {
        Self {
            mode: HotStoreMode::Memory,
            redis_url: None,
        }
    }
}

/// Durable storage configuration.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DatabaseConfig {
    /// Adapter type to use.
    pub adapter: DatabaseAdapter,
    /// Connection string where applicable (Postgres/MySQL/SQLite).
    pub url: Option<String>,
    /// Filesystem path for JSON DB or SQLite file (if not using URL).
    pub path: Option<String>,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            adapter: DatabaseAdapter::JsonDb,
            url: None,
            path: Some("data/syncserver.json".to_string()),
        }
    }
}

/// Authentication configuration, primarily consumed by smsgate2 to toggle UI.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AuthConfig {
    /// Enabled auth modes.
    pub modes: Vec<AuthMode>,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            modes: vec![AuthMode::SimpleSignin],
        }
    }
}

/// Role definition used in RBAC config.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RoleDefinition {
    pub name: String,
    pub precedence: u32,
    pub permissions: Vec<String>,
}

/// RBAC configuration including role definitions and group mapping.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RbacConfig {
    pub roles: Vec<RoleDefinition>,
    pub group_mapping: std::collections::HashMap<String, String>,
}

impl Default for RbacConfig {
    fn default() -> Self {
        Self {
            roles: vec![
                RoleDefinition {
                    name: "admin".into(),
                    precedence: 100,
                    permissions: vec![
                        "events.read".into(),
                        "events.claim".into(),
                        "events.verify".into(),
                        "events.reject".into(),
                        "devices.read".into(),
                        "devices.write".into(),
                        "devices.disable".into(),
                        "devices.rotate_token".into(),
                        "numbers.read".into(),
                        "numbers.write".into(),
                        "users.read".into(),
                        "users.write".into(),
                        "users.force_logout".into(),
                        "users.unlock".into(),
                        "config.read".into(),
                        "config.write".into(),
                        "audit.read".into(),
                        "logins.read".into(),
                    ],
                },
                RoleDefinition {
                    name: "manager".into(),
                    precedence: 50,
                    permissions: vec![
                        "events.read".into(),
                        "events.claim".into(),
                        "events.verify".into(),
                        "devices.read".into(),
                        "numbers.read".into(),
                        "users.read".into(),
                        "audit.read".into(),
                        "logins.read".into(),
                    ],
                },
            ],
            group_mapping: std::collections::HashMap::new(),
        }
    }
}

/// Pairing configuration.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PairingConfig {
    /// Session TTL in seconds.
    pub session_ttl_secs: u64,
    /// Optional bootstrap device credentials for initial bring-up.
    pub bootstrap_device: Option<BootstrapDevice>,
}

/// Bootstrap device issued via config/env to allow the first relay to pair.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BootstrapDevice {
    /// Device identifier granted to the bootstrap relay.
    pub id: String,
    /// Raw token that will be hashed server-side.
    pub token: String,
    /// Friendly name shown in dashboards.
    #[serde(default)]
    pub name: Option<String>,
    /// Whether the bootstrap device is enabled on startup.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

impl Default for PairingConfig {
    fn default() -> Self {
        Self {
            session_ttl_secs: 600,
            bootstrap_device: None,
        }
    }
}

/// Ingest configuration for deduplication and buffering.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct IngestConfig {
    /// TTL in milliseconds for deduplication keys.
    pub dedup_ttl_ms: u64,
    /// Maximum events retained in the hot store ring buffer.
    pub hot_store_capacity: usize,
    /// Maximum events accepted per ingest request.
    pub max_batch: usize,
}

impl Default for IngestConfig {
    fn default() -> Self {
        Self {
            dedup_ttl_ms: 60_000,
            hot_store_capacity: 1_000,
            max_batch: 100,
        }
    }
}

/// Presence thresholds for online/degraded evaluations.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PresenceConfig {
    /// Milliseconds since last heartbeat to consider online.
    pub online_threshold_ms: u64,
    /// Milliseconds since last heartbeat to consider degraded (beyond this is offline).
    pub degraded_threshold_ms: u64,
}

impl Default for PresenceConfig {
    fn default() -> Self {
        Self {
            online_threshold_ms: 20_000,
            degraded_threshold_ms: 60_000,
        }
    }
}

/// Top-level application configuration shared across the server.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AppConfig {
    /// Runtime environment flag.
    pub env: RunEnvironment,
    /// Listener and WebSocket controls.
    pub server: ServerConfig,
    /// Ingest controls.
    pub ingest: IngestConfig,
    /// Presence evaluation thresholds.
    pub presence: PresenceConfig,
    /// RBAC roles and group mappings.
    pub rbac: RbacConfig,
    /// Pairing/session configuration.
    pub pairing: PairingConfig,
    /// Hot store backend selection.
    pub hot_store: HotStoreConfig,
    /// Durable persistence controls.
    pub database: DatabaseConfig,
    /// Authentication mode toggles.
    pub auth: AuthConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            env: RunEnvironment::default(),
            server: ServerConfig::default(),
            ingest: IngestConfig::default(),
            presence: PresenceConfig::default(),
            rbac: RbacConfig::default(),
            pairing: PairingConfig::default(),
            hot_store: HotStoreConfig::default(),
            database: DatabaseConfig::default(),
            auth: AuthConfig::default(),
        }
    }
}

impl AppConfig {
    /// Resolve the configuration path from environment (or default).
    pub fn config_path_from_env() -> PathBuf {
        env::var("SYNC_CONFIG_PATH")
            .unwrap_or_else(|_| "config/config.json".into())
            .into()
    }

    /// Load configuration from disk + environment overrides, with validation.
    pub fn load() -> Result<Self, AppError> {
        let mut config = AppConfig::default();
        let path_buf = Self::config_path_from_env();
        let path = path_buf.to_string_lossy();

        if path_buf.exists() {
            let raw = fs::read_to_string(&path_buf)
                .map_err(|err| AppError::Config(format!("failed to read {}: {}", path, err)))?;
            let partial: PartialConfig = serde_json::from_str(&raw)
                .map_err(|err| AppError::Config(format!("invalid JSON in {}: {}", path, err)))?;
            config.merge(partial);
            tracing::info!(config_path = %path, "loaded syncserver configuration from disk");
        } else {
            tracing::warn!(
                config_path = %path,
                "config file not found, using defaults + env overrides"
            );
        }

        config.apply_env_overrides();
        config.validate()?;

        Ok(config)
    }

    /// Derive the socket address used for the HTTP/WS server.
    pub fn socket_addr(&self) -> SocketAddr {
        let value = format!("{}:{}", self.server.host, self.server.port);
        value
            .parse()
            .unwrap_or_else(|err| panic!("invalid host/port combination: {}", err))
    }

    /// Apply environment variable overrides on top of file/default values.
    fn apply_env_overrides(&mut self) {
        if let Ok(env) = env::var("SYNC_ENV")
            .or_else(|_| env::var("APP_ENV"))
            .or_else(|_| env::var("RUN_ENV"))
        {
            self.env = RunEnvironment::from_env(Some(env));
        }

        if let Ok(host) = env::var("SYNC_HOST") {
            self.server.host = host;
        }

        if let Some(port) = env::var("SYNC_PORT").ok().and_then(|p| p.parse().ok()) {
            self.server.port = port;
        }

        if let Some(limit) = env::var("SYNC_WS_SNAPSHOT_LIMIT")
            .ok()
            .and_then(|p| p.parse().ok())
        {
            self.server.ws_snapshot_limit = limit;
        }

        if let Some(limit) = env::var("SYNC_WS_MAX_CONNECTIONS")
            .ok()
            .and_then(|p| p.parse().ok())
        {
            self.server.ws_max_connections = limit;
        }

        if let Some(interval) = env::var("SYNC_WS_PING_INTERVAL_MS")
            .ok()
            .and_then(|p| p.parse().ok())
        {
            self.server.ws_ping_interval_ms = interval;
        }

        if let Some(ttl) = env::var("SYNC_INGEST_DEDUP_TTL_MS")
            .ok()
            .and_then(|p| p.parse().ok())
        {
            self.ingest.dedup_ttl_ms = ttl;
        }

        if let Some(capacity) = env::var("SYNC_HOTSTORE_CAPACITY")
            .ok()
            .and_then(|p| p.parse().ok())
        {
            self.ingest.hot_store_capacity = capacity;
        }

        if let Some(max_batch) = env::var("SYNC_INGEST_MAX_BATCH")
            .ok()
            .and_then(|p| p.parse().ok())
        {
            self.ingest.max_batch = max_batch;
        }

        if let Some(online_ms) = env::var("SYNC_PRESENCE_ONLINE_MS")
            .ok()
            .and_then(|p| p.parse().ok())
        {
            self.presence.online_threshold_ms = online_ms;
        }

        if let Some(degraded_ms) = env::var("SYNC_PRESENCE_DEGRADED_MS")
            .ok()
            .and_then(|p| p.parse().ok())
        {
            self.presence.degraded_threshold_ms = degraded_ms;
        }

        if let Some(ttl) = env::var("SYNC_PAIRING_SESSION_TTL_SECS")
            .ok()
            .and_then(|p| p.parse().ok())
        {
            self.pairing.session_ttl_secs = ttl;
        }

        let bootstrap_id = env::var("SYNC_BOOTSTRAP_DEVICE_ID").ok();
        let bootstrap_token = env::var("SYNC_BOOTSTRAP_DEVICE_TOKEN").ok();
        if let (Some(id), Some(token)) = (bootstrap_id, bootstrap_token) {
            let name = env::var("SYNC_BOOTSTRAP_DEVICE_NAME").ok();
            let disabled = env::var("SYNC_BOOTSTRAP_DEVICE_DISABLED")
                .ok()
                .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
                .unwrap_or(false);
            self.pairing.bootstrap_device = Some(BootstrapDevice {
                id,
                token,
                name,
                enabled: !disabled,
            });
        }

        if let Ok(mode) = env::var("SYNC_HOTSTORE") {
            self.hot_store.mode = match mode.to_ascii_lowercase().as_str() {
                "redis" => HotStoreMode::Redis,
                _ => HotStoreMode::Memory,
            };
        }

        if let Ok(redis_url) = env::var("SYNC_REDIS_URL") {
            self.hot_store.redis_url = Some(redis_url);
        }

        if let Ok(adapter) = env::var("SYNC_DB_ADAPTER") {
            self.database.adapter = match adapter.to_ascii_lowercase().as_str() {
                "postgres" | "postgresql" => DatabaseAdapter::Postgres,
                "mysql" | "mariadb" => DatabaseAdapter::Mysql,
                "sqlite" => DatabaseAdapter::Sqlite,
                _ => DatabaseAdapter::JsonDb,
            };
        }

        if let Ok(url) = env::var("SYNC_DB_URL") {
            self.database.url = Some(url);
        }

        if let Ok(path) = env::var("SYNC_DB_PATH") {
            self.database.path = Some(path);
        }

        if let Ok(modes) = env::var("SYNC_AUTH_MODES") {
            let parsed_modes = modes
                .split(',')
                .filter_map(|mode| match mode.trim().to_ascii_lowercase().as_str() {
                    "oauth" => Some(AuthMode::Oauth),
                    "simple_signin" | "simple" => Some(AuthMode::SimpleSignin),
                    "domain_signin" | "domain" => Some(AuthMode::DomainSignin),
                    _ => None,
                })
                .collect::<Vec<_>>();
            if !parsed_modes.is_empty() {
                self.auth.modes = parsed_modes;
            }
        }
    }

    /// Validate the loaded configuration and surface user-friendly errors.
    fn validate(&self) -> Result<(), AppError> {
        if self.server.port == 0 {
            return Err(AppError::Validation("port must be > 0".into()));
        }

        if self.server.ws_snapshot_limit == 0 {
            return Err(AppError::Validation(
                "ws_snapshot_limit must be greater than zero".into(),
            ));
        }

        if self.ingest.hot_store_capacity == 0 {
            return Err(AppError::Validation(
                "ingest.hot_store_capacity must be greater than zero".into(),
            ));
        }

        if self.ingest.max_batch == 0 {
            return Err(AppError::Validation(
                "ingest.max_batch must be greater than zero".into(),
            ));
        }

        if self.presence.online_threshold_ms == 0 || self.presence.degraded_threshold_ms == 0 {
            return Err(AppError::Validation(
                "presence thresholds must be greater than zero".into(),
            ));
        }

        if self.presence.online_threshold_ms >= self.presence.degraded_threshold_ms {
            return Err(AppError::Validation(
                "presence.online_threshold_ms must be less than presence.degraded_threshold_ms"
                    .into(),
            ));
        }

        if self.hot_store.mode == HotStoreMode::Redis && self.hot_store.redis_url.is_none() {
            return Err(AppError::Validation(
                "SYNC_REDIS_URL (or config.hot_store.redis_url) is required when hot_store.mode=redis"
                    .into(),
            ));
        }

        if self.auth.modes.is_empty() {
            return Err(AppError::Validation(
                "at least one auth mode must be enabled".into(),
            ));
        }

        if matches!(
            self.database.adapter,
            DatabaseAdapter::Sqlite | DatabaseAdapter::JsonDb
        ) && self.database.url.is_none()
            && self.database.path.is_none()
        {
            return Err(AppError::Validation(
                "database.path or database.url must be provided for sqlite/json_db adapters".into(),
            ));
        }

        if matches!(
            self.database.adapter,
            DatabaseAdapter::Postgres | DatabaseAdapter::Mysql
        ) && self.database.url.is_none()
        {
            return Err(AppError::Validation(
                "database.url is required for postgres/mysql adapters".into(),
            ));
        }

        if self.pairing.session_ttl_secs == 0 {
            return Err(AppError::Validation(
                "pairing.session_ttl_secs must be greater than zero".into(),
            ));
        }

        if let Some(bootstrap) = &self.pairing.bootstrap_device {
            if bootstrap.id.trim().is_empty() {
                return Err(AppError::Validation(
                    "pairing.bootstrap_device.id must not be empty".into(),
                ));
            }
            if bootstrap.token.trim().is_empty() {
                return Err(AppError::Validation(
                    "pairing.bootstrap_device.token must not be empty".into(),
                ));
            }
        }

        Ok(())
    }

    /// Merge a partially loaded config (e.g., from disk) into the current instance.
    /// Merge a partial configuration into this instance (overwriting provided fields).
    pub fn merge(&mut self, from: PartialConfig) {
        if let Some(env) = from.env {
            self.env = env;
        }

        if let Some(server) = from.server {
            if let Some(host) = server.host {
                self.server.host = host;
            }
            if let Some(port) = server.port {
                self.server.port = port;
            }
            if let Some(max) = server.ws_max_connections {
                self.server.ws_max_connections = max;
            }
            if let Some(limit) = server.ws_snapshot_limit {
                self.server.ws_snapshot_limit = limit;
            }
            if let Some(interval) = server.ws_ping_interval_ms {
                self.server.ws_ping_interval_ms = interval;
            }
        }

        if let Some(ingest) = from.ingest {
            if let Some(ttl) = ingest.dedup_ttl_ms {
                self.ingest.dedup_ttl_ms = ttl;
            }
            if let Some(cap) = ingest.hot_store_capacity {
                self.ingest.hot_store_capacity = cap;
            }
            if let Some(max_batch) = ingest.max_batch {
                self.ingest.max_batch = max_batch;
            }
        }

        if let Some(hot) = from.hot_store {
            if let Some(mode) = hot.mode {
                self.hot_store.mode = mode;
            }
            if let Some(url) = hot.redis_url {
                self.hot_store.redis_url = Some(url);
            }
        }

        if let Some(db) = from.database {
            if let Some(adapter) = db.adapter {
                self.database.adapter = adapter;
            }
            if let Some(url) = db.url {
                self.database.url = Some(url);
            }
            if let Some(path) = db.path {
                self.database.path = Some(path);
            }
        }

        if let Some(auth) = from.auth {
            if let Some(modes) = auth.modes {
                self.auth.modes = modes;
            }
        }

        if let Some(presence) = from.presence {
            if let Some(online_ms) = presence.online_threshold_ms {
                self.presence.online_threshold_ms = online_ms;
            }
            if let Some(degraded_ms) = presence.degraded_threshold_ms {
                self.presence.degraded_threshold_ms = degraded_ms;
            }
        }

        if let Some(rbac) = from.rbac {
            if let Some(roles) = rbac.roles {
                self.rbac.roles = roles;
            }
            if let Some(mapping) = rbac.group_mapping {
                self.rbac.group_mapping = mapping;
            }
        }

        if let Some(pairing) = from.pairing {
            if let Some(ttl) = pairing.session_ttl_secs {
                self.pairing.session_ttl_secs = ttl;
            }
            if let Some(bootstrap) = pairing.bootstrap_device {
                self.pairing.bootstrap_device = Some(bootstrap);
            }
        }
    }

    /// Produce a new config by applying the given patch and re-validating.
    pub fn merged(&self, patch: PartialConfig) -> Result<Self, AppError> {
        let mut next = self.clone();
        next.merge(patch);
        next.validate()?;
        Ok(next)
    }
}

/// Versioned configuration with monotonic version and last update time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionedConfig {
    /// Effective application configuration.
    pub config: AppConfig,
    /// Monotonic version number incremented on patch.
    pub version: u64,
    /// Timestamp when the config was last updated.
    pub last_updated_at: DateTime<Utc>,
}

impl VersionedConfig {
    /// Build a new versioned config starting at version 1.
    pub fn initial(config: AppConfig) -> Self {
        Self {
            config,
            version: 1,
            last_updated_at: Utc::now(),
        }
    }
}

/// Payload exposed to clients describing the effective configuration.
#[derive(Debug, Clone, Serialize)]
pub struct ClientConfigSnapshot {
    /// Monotonic version.
    pub version: u64,
    /// ISO8601 timestamp of last update.
    pub last_updated_at: DateTime<Utc>,
    /// Environment label.
    pub env: String,
    /// Enabled authentication modes.
    pub auth_modes: Vec<String>,
    /// Presence thresholds (ms).
    pub presence: PresenceSnapshot,
    /// Ingest limits and dedup TTLs.
    pub ingest: IngestSnapshot,
    /// Hot store backend label.
    pub hot_store: String,
    /// Role definitions for UI gating.
    pub roles: Vec<RoleSnapshot>,
}

/// Presence thresholds exposed to clients.
#[derive(Debug, Clone, Serialize)]
pub struct PresenceSnapshot {
    pub online_threshold_ms: u64,
    pub degraded_threshold_ms: u64,
}

/// Ingest limits exposed to clients.
#[derive(Debug, Clone, Serialize)]
pub struct IngestSnapshot {
    pub dedup_ttl_ms: u64,
    pub hot_store_capacity: usize,
    pub max_batch: usize,
}

/// Role descriptor exposed to clients.
#[derive(Debug, Clone, Serialize)]
pub struct RoleSnapshot {
    pub name: String,
    pub precedence: u32,
    pub permissions: Vec<String>,
}

impl ClientConfigSnapshot {
    /// Build a client-facing snapshot from the versioned config.
    pub fn from_versioned(versioned: &VersionedConfig) -> Self {
        let cfg = &versioned.config;
        Self {
            version: versioned.version,
            last_updated_at: versioned.last_updated_at,
            env: cfg.env.as_str().to_string(),
            auth_modes: cfg.auth.modes.iter().map(mode_label).collect(),
            presence: PresenceSnapshot {
                online_threshold_ms: cfg.presence.online_threshold_ms,
                degraded_threshold_ms: cfg.presence.degraded_threshold_ms,
            },
            ingest: IngestSnapshot {
                dedup_ttl_ms: cfg.ingest.dedup_ttl_ms,
                hot_store_capacity: cfg.ingest.hot_store_capacity,
                max_batch: cfg.ingest.max_batch,
            },
            hot_store: match cfg.hot_store.mode {
                HotStoreMode::Redis => "redis".into(),
                HotStoreMode::Memory => "memory".into(),
            },
            roles: cfg
                .rbac
                .roles
                .iter()
                .map(|role| RoleSnapshot {
                    name: role.name.clone(),
                    precedence: role.precedence,
                    permissions: role.permissions.clone(),
                })
                .collect(),
        }
    }
}

fn mode_label(mode: &AuthMode) -> String {
    match mode {
        AuthMode::Oauth => "oauth".into(),
        AuthMode::SimpleSignin => "simple_signin".into(),
        AuthMode::DomainSignin => "domain_signin".into(),
    }
}

/// Shape used to partially deserialize config.json (all fields optional).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct PartialConfig {
    pub env: Option<RunEnvironment>,
    pub server: Option<PartialServerConfig>,
    pub ingest: Option<PartialIngestConfig>,
    pub presence: Option<PartialPresenceConfig>,
    pub rbac: Option<PartialRbacConfig>,
    pub pairing: Option<PartialPairingConfig>,
    pub hot_store: Option<PartialHotStoreConfig>,
    pub database: Option<PartialDatabaseConfig>,
    pub auth: Option<PartialAuthConfig>,
}

#[derive(Debug, Default, Deserialize)]
struct PartialServerConfig {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub ws_max_connections: Option<u32>,
    pub ws_snapshot_limit: Option<u32>,
    pub ws_ping_interval_ms: Option<u64>,
}

#[derive(Debug, Default, Deserialize)]
struct PartialIngestConfig {
    pub dedup_ttl_ms: Option<u64>,
    pub hot_store_capacity: Option<usize>,
    pub max_batch: Option<usize>,
}

#[derive(Debug, Default, Deserialize)]
struct PartialPresenceConfig {
    pub online_threshold_ms: Option<u64>,
    pub degraded_threshold_ms: Option<u64>,
}

#[derive(Debug, Default, Deserialize)]
struct PartialPairingConfig {
    pub session_ttl_secs: Option<u64>,
    pub bootstrap_device: Option<BootstrapDevice>,
}

#[derive(Debug, Default, Deserialize)]
struct PartialRbacConfig {
    pub roles: Option<Vec<RoleDefinition>>,
    pub group_mapping: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Default, Deserialize)]
struct PartialHotStoreConfig {
    pub mode: Option<HotStoreMode>,
    pub redis_url: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct PartialDatabaseConfig {
    pub adapter: Option<DatabaseAdapter>,
    pub url: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct PartialAuthConfig {
    pub modes: Option<Vec<AuthMode>>,
}
