use crate::{
    config::AppConfig,
    hot_store::{HotStore, MemoryHotStore},
};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Instant,
};

use crate::{config, metrics::Metrics};

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
}

/// Shared application state injected into Axum routers and handlers.
#[derive(Clone)]
pub struct AppState {
    /// Global configuration loaded at startup.
    pub config: AppConfig,
    /// Monotonic start time to compute uptime.
    pub started_at: Arc<Instant>,
    /// Health/readiness tracking flags.
    pub ready_flags: Arc<ReadyFlags>,
    /// Prometheus metrics registry and counters.
    pub metrics: Metrics,
    /// Hot store implementation used for fanout/paging.
    pub hot_store: Arc<dyn HotStore>,
}

impl AppState {
    /// Create a new state container.
    pub fn new(config: AppConfig) -> Self {
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

        let metrics = Metrics::new().expect("failed to initialize metrics");
        let hot_store: Arc<dyn HotStore> = Arc::new(MemoryHotStore::default());
        ready_flags.hot_store_ready.store(true, Ordering::Relaxed);

        Self {
            config,
            started_at: Arc::new(Instant::now()),
            ready_flags: Arc::new(ready_flags),
            metrics,
            hot_store,
        }
    }
}
