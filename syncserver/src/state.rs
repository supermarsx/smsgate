use crate::config::AppConfig;
use std::{sync::Arc, time::Instant};

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub started_at: Arc<Instant>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config,
            started_at: Arc::new(Instant::now()),
        }
    }
}
