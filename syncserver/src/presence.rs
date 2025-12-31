//! In-memory presence tracker fed by heartbeats.
//! Evaluates online/degraded/offline based on configured thresholds.

use chrono::{DateTime, Utc};
use dashmap::DashMap;

use crate::{config::PresenceConfig, domain::PresenceState};

/// Presence entry recorded from heartbeats.
#[derive(Debug, Clone)]
pub struct PresenceEntry {
    /// Last heartbeat timestamp.
    pub last_heartbeat: DateTime<Utc>,
    /// Latest queue depth reported by device.
    pub queue_depth: u32,
    /// Last device RTT measurement (if any).
    pub device_rtt_ms: Option<u32>,
}

/// Presence tracker that uses wall-clock times to compute state.
#[derive(Debug)]
pub struct PresenceStore {
    entries: DashMap<String, PresenceEntry>,
    config: PresenceConfig,
}

impl PresenceStore {
    /// Create a new presence store with configured thresholds.
    pub fn new(config: PresenceConfig) -> Self {
        Self {
            entries: DashMap::new(),
            config,
        }
    }

    /// Record a heartbeat and return the computed presence state.
    pub fn upsert(
        &self,
        device_id: &str,
        now: DateTime<Utc>,
        queue_depth: u32,
        device_rtt_ms: Option<u32>,
    ) -> PresenceState {
        self.entries.insert(
            device_id.to_string(),
            PresenceEntry {
                last_heartbeat: now,
                queue_depth,
                device_rtt_ms,
            },
        );
        self.evaluate(now, device_id)
    }

    /// Evaluate a device's presence without mutating the store.
    pub fn evaluate(&self, now: DateTime<Utc>, device_id: &str) -> PresenceState {
        if let Some(entry) = self.entries.get(device_id) {
            let elapsed_ms = (now - entry.last_heartbeat).num_milliseconds();
            if elapsed_ms < 0 {
                return PresenceState::Online;
            }
            if elapsed_ms as u64 <= self.config.online_threshold_ms {
                PresenceState::Online
            } else if elapsed_ms as u64 <= self.config.degraded_threshold_ms {
                PresenceState::Degraded
            } else {
                PresenceState::Offline
            }
        } else {
            PresenceState::Offline
        }
    }
}
