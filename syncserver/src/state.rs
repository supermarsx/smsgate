use crate::config::AppConfig;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Instant,
};

/// Readiness flags to report subsystem health without blocking hot paths.
#[derive(Debug)]
pub struct ReadyFlags {
    /// HTTP listener bound successfully.
    pub http_ready: AtomicBool,
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
            hot_store_ready: AtomicBool::new(false),
            storage_ready: AtomicBool::new(false),
        }
    }

    /// Snapshot the current readiness booleans for response structs.
    pub fn snapshot(&self) -> ReadySnapshot {
        ReadySnapshot {
            http_ready: self.http_ready.load(Ordering::Relaxed),
            hot_store_ready: self.hot_store_ready.load(Ordering::Relaxed),
            storage_ready: self.storage_ready.load(Ordering::Relaxed),
        }
    }
}

/// Simple DTO for readiness values to avoid exposing Atomics in responses.
#[derive(Debug, Clone)]
pub struct ReadySnapshot {
    pub http_ready: bool,
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
}

impl AppState {
    /// Create a new state container.
    pub fn new(config: AppConfig) -> Self {
        Self {
            config,
            started_at: Arc::new(Instant::now()),
            ready_flags: Arc::new(ReadyFlags::new()),
        }
    }
}
