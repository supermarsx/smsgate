use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::{env, fs, net::SocketAddr, path::PathBuf};

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
#[derive(Debug, Clone, Deserialize)]
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
#[derive(Debug, Clone, Deserialize)]
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
#[derive(Debug, Clone, Deserialize)]
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
#[derive(Debug, Clone, Deserialize)]
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

/// Top-level application configuration shared across the server.
#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    /// Runtime environment flag.
    pub env: RunEnvironment,
    /// Listener and WebSocket controls.
    pub server: ServerConfig,
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
            hot_store: HotStoreConfig::default(),
            database: DatabaseConfig::default(),
            auth: AuthConfig::default(),
        }
    }
}

impl AppConfig {
    /// Load configuration from disk + environment overrides, with validation.
    pub fn load() -> Result<Self, AppError> {
        let mut config = AppConfig::default();
        let path = env::var("SYNC_CONFIG_PATH").unwrap_or_else(|_| "config/config.json".into());
        let path_buf = PathBuf::from(&path);

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

        Ok(())
    }

    /// Merge a partially loaded config (e.g., from disk) into the current instance.
    fn merge(&mut self, from: PartialConfig) {
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
    }
}

/// Shape used to partially deserialize config.json (all fields optional).
#[derive(Debug, Default, Deserialize)]
struct PartialConfig {
    pub env: Option<RunEnvironment>,
    pub server: Option<PartialServerConfig>,
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
