use crate::{
    audit::AuditService,
    auth::{rbac::RbacStore, session::SessionStore, users::UserStore, DeviceAuthStore},
    config::{self, AppConfig, VersionedConfig},
    hot_store::{redis_store::RedisHotStore, HotStore, MemoryHotStore},
    persistence::{sql::SqlStore, worker::PersistenceWorker, JsonDb, PersistentStore},
    presence::PresenceStore,
    ws_types::ServerMessage,
};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    time::Instant,
};

use crate::metrics::Metrics;
use std::path::PathBuf;
use tokio::sync::broadcast;
use tokio::sync::RwLock;

/// Readiness flags to report subsystem health without blocking hot paths.
#[derive(Debug)]
pub struct ReadyFlags {
    /// HTTP listener bound successfully.
    pub http_ready: AtomicBool,
    /// Configuration loaded and validated.
    pub config_ready: AtomicBool,
    /// Hot store backend (Redis/in-memory) is initialized.
    pub hot_store_ready: AtomicBool,
    /// Durable persistence backend is reachable.
    pub storage_ready: AtomicBool,
}

impl ReadyFlags {
    /// Create a new ready flag set with all checks defaulting to false.
    pub fn new() -> Self {
        Self {
            http_ready: AtomicBool::new(false),
            config_ready: AtomicBool::new(false),
            hot_store_ready: AtomicBool::new(false),
            storage_ready: AtomicBool::new(false),
        }
    }

    /// Snapshot the current readiness booleans for response structs.
    pub fn snapshot(&self) -> ReadySnapshot {
        ReadySnapshot {
            http_ready: self.http_ready.load(Ordering::Relaxed),
            config_ready: self.config_ready.load(Ordering::Relaxed),
            hot_store_ready: self.hot_store_ready.load(Ordering::Relaxed),
            storage_ready: self.storage_ready.load(Ordering::Relaxed),
            presence_ready: true,
        }
    }
}

/// Simple DTO for readiness values to avoid exposing Atomics in responses.
#[derive(Debug, Clone)]
pub struct ReadySnapshot {
    pub http_ready: bool,
    pub config_ready: bool,
    pub hot_store_ready: bool,
    pub storage_ready: bool,
    /// Presence evaluator is active (for future external deps).
    pub presence_ready: bool,
}

/// Shared application state injected into Axum routers and handlers.
#[derive(Clone)]
pub struct AppState {
    /// Global configuration loaded at startup.
    pub config: Arc<RwLock<VersionedConfig>>,
    /// Path where config is persisted.
    pub config_path: PathBuf,
    /// Monotonic start time to compute uptime.
    pub started_at: Arc<Instant>,
    /// Health/readiness tracking flags.
    pub ready_flags: Arc<ReadyFlags>,
    /// Prometheus metrics registry and counters.
    pub metrics: Metrics,
    /// Hot store implementation used for fanout/paging.
    pub hot_store: Arc<dyn HotStore>,
    /// Presence tracker used by heartbeat ingest.
    pub presence: Arc<PresenceStore>,
    /// Broadcast channel for WS fanout.
    pub event_tx: broadcast::Sender<ServerMessage>,
    /// Current WS connection count.
    pub connection_count: Arc<AtomicUsize>,
    /// Device auth store (placeholder).
    pub device_auth: DeviceAuthStore,
    /// Persistent store for events/audit.
    pub persistence: Arc<dyn PersistentStore>,
    /// RBAC store for user roles and group mapping.
    pub rbac: Arc<RbacStore>,
    /// Persistence worker for asynchronous writes.
    pub persistence_worker: PersistenceWorker,
    /// Pairing store for session lifecycle.
    pub pairing_store: Arc<crate::pairing::PairingStore>,
    /// Session store for user principals.
    pub session_store: Arc<SessionStore>,
    /// Local user store for simple_signin.
    pub user_store: Arc<UserStore>,
    /// Audit service for recording security and config changes.
    pub audit: AuditService,
}

impl AppState {
    /// Create a new state container.
    pub async fn new(config: AppConfig) -> Self {
        let ready_flags = ReadyFlags::new();
        // In-memory hot store and json_db/sqlite adapters do not require external connectivity.
        if matches!(config.hot_store.mode, config::HotStoreMode::Memory) {
            ready_flags.hot_store_ready.store(true, Ordering::Relaxed);
        }
        if matches!(
            config.database.adapter,
            config::DatabaseAdapter::JsonDb | config::DatabaseAdapter::Sqlite
        ) {
            ready_flags.storage_ready.store(true, Ordering::Relaxed);
        }
        // Config validated during load.
        ready_flags.config_ready.store(true, Ordering::Relaxed);

        let config_path = AppConfig::config_path_from_env();
        let versioned_config = Arc::new(RwLock::new(VersionedConfig::initial(config.clone())));
        let metrics = Metrics::new().expect("failed to initialize metrics");
        let hot_store: Arc<dyn HotStore> = match config.hot_store.mode {
            config::HotStoreMode::Redis => {
                if let Some(url) = &config.hot_store.redis_url {
                    match RedisHotStore::new(url, config.ingest.hot_store_capacity).await {
                        Ok(store) => {
                            ready_flags.hot_store_ready.store(true, Ordering::Relaxed);
                            Arc::new(store)
                        }
                        Err(err) => {
                            tracing::error!(error = %err, "failed to init redis hot store, falling back to memory");
                            ready_flags.hot_store_ready.store(false, Ordering::Relaxed);
                            Arc::new(MemoryHotStore::new(config.ingest.hot_store_capacity))
                        }
                    }
                } else {
                    tracing::warn!("redis hot store selected without url, using memory fallback");
                    Arc::new(MemoryHotStore::new(config.ingest.hot_store_capacity))
                }
            }
            config::HotStoreMode::Memory => {
                ready_flags.hot_store_ready.store(true, Ordering::Relaxed);
                Arc::new(MemoryHotStore::new(config.ingest.hot_store_capacity))
            }
        };
        let presence = Arc::new(PresenceStore::new(config.presence.clone()));
        let (event_tx, _rx) = broadcast::channel(1024);
        let connection_count = Arc::new(AtomicUsize::new(0));
        let device_auth = DeviceAuthStore::default();
        if let Some(bootstrap) = config.pairing.bootstrap_device.clone() {
            device_auth.register_bootstrap(&bootstrap);
        }
        let persistence: Arc<dyn PersistentStore> = match config.database.adapter {
            config::DatabaseAdapter::JsonDb => Arc::new(
                JsonDb::new(
                    config
                        .database
                        .path
                        .clone()
                        .unwrap_or_else(|| "data/syncserver.json".to_string())
                        .into(),
                )
                .await
                .expect("init json db"),
            ),
            _ => {
                let url = match config.database.adapter {
                    config::DatabaseAdapter::Sqlite => config
                        .database
                        .url
                        .clone()
                        .or_else(|| {
                            config.database.path.as_ref().map(|p| {
                                crate::persistence::sql::sqlite_url_from_path(std::path::Path::new(
                                    p,
                                ))
                            })
                        })
                        .unwrap_or_else(|| "sqlite://data/syncserver.db".into()),
                    _ => config
                        .database
                        .url
                        .clone()
                        .unwrap_or_else(|| "sqlite://data/syncserver.db".into()),
                };
                match SqlStore::connect(&url).await {
                    Ok(store) => {
                        ready_flags.storage_ready.store(true, Ordering::Relaxed);
                        Arc::new(store)
                    }
                    Err(err) => {
                        tracing::error!(error = %err, "failed to init sql store, using json fallback");
                        ready_flags.storage_ready.store(false, Ordering::Relaxed);
                        Arc::new(
                            JsonDb::new(
                                config
                                    .database
                                    .path
                                    .clone()
                                    .unwrap_or_else(|| "data/syncserver.json".to_string())
                                    .into(),
                            )
                            .await
                            .expect("init json db"),
                        )
                    }
                }
            }
        };
        let rbac = Arc::new(RbacStore::from_config(&config.rbac));
        let persistence_worker = PersistenceWorker::new(persistence.clone());
        let pairing_store = Arc::new(crate::pairing::PairingStore::new(config.pairing.clone()));
        let session_store = Arc::new(crate::auth::session::SessionStore::new(&config.auth));
        let roles: Vec<crate::auth::Role> = config
            .rbac
            .roles
            .iter()
            .map(|role| crate::auth::Role {
                name: role.name.clone(),
                precedence: role.precedence,
                permissions: role.permissions.clone(),
            })
            .collect();
        let user_store = Arc::new(crate::auth::users::UserStore::new(&config.auth, &roles));
        let audit = AuditService::new(persistence.clone(), config.database.enable_audit_log);

        Self {
            config: versioned_config,
            config_path,
            started_at: Arc::new(Instant::now()),
            ready_flags: Arc::new(ready_flags),
            metrics,
            hot_store,
            presence,
            event_tx,
            connection_count,
            device_auth,
            persistence,
            rbac,
            persistence_worker,
            pairing_store,
            session_store,
            user_store,
            audit,
        }
    }

    /// Subscribe to WS broadcast channel.
    pub fn subscribe_events(&self) -> broadcast::Receiver<ServerMessage> {
        self.event_tx.subscribe()
    }

    /// Attempt to acquire a connection slot; returns true if allowed.
    pub async fn try_acquire_connection(&self) -> bool {
        let current = self.connection_count.fetch_add(1, Ordering::SeqCst) + 1;
        let max = {
            let cfg = self.config.read().await;
            cfg.config.server.ws_max_connections as usize
        };
        if current > max {
            self.connection_count.fetch_sub(1, Ordering::SeqCst);
            return false;
        }
        true
    }

    /// Release a connection slot (called when a client disconnects).
    pub fn release_connection(&self) {
        self.connection_count.fetch_sub(1, Ordering::SeqCst);
    }

    /// Return a cloned config snapshot for use in responses/broadcasts.
    pub async fn config_snapshot(&self) -> config::ClientConfigSnapshot {
        let cfg = self.config.read().await;
        config::ClientConfigSnapshot::from_versioned(&cfg)
    }

    /// Persist the provided versioned config to disk.
    pub async fn persist_config(
        &self,
        cfg: &config::VersionedConfig,
    ) -> Result<(), crate::error::AppError> {
        if let Some(parent) = self.config_path.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|err| {
                crate::error::AppError::Config(format!("failed to create config dir: {err}"))
            })?;
        }
        let json = serde_json::to_string_pretty(&cfg.config).map_err(|err| {
            crate::error::AppError::Config(format!("failed to serialize config: {err}"))
        })?;
        tokio::fs::write(&self.config_path, json)
            .await
            .map_err(|err| {
                crate::error::AppError::Config(format!(
                    "failed to write config to {}: {err}",
                    self.config_path.display()
                ))
            })?;
        Ok(())
    }
}
