//! Shared WebSocket message contracts for server broadcast.

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::{
    config::ClientConfigSnapshot,
    domain::{PresenceState, SimSnapshot, SmsEvent},
    metrics::Snapshot as MetricsSnapshot,
};

/// Server -> client messages.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "payload", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ServerMessage {
    /// Initial greeting with protocol version.
    Welcome { version: &'static str },
    /// Initial snapshot of recent events.
    Snapshot {
        events: Vec<SmsEvent>,
        newest_id: Option<String>,
        oldest_id: Option<String>,
        limit: u32,
        presence: Vec<PresenceUpdate>,
        metrics: Option<MetricsSnapshot>,
    },
    /// Initial configuration snapshot to seed UI gating.
    ConfigSnapshot { config: ClientConfigSnapshot },
    /// New event appended.
    EventNew { event: SmsEvent },
    /// Existing event updated (state transitions).
    EventUpdate { event: SmsEvent },
    /// Presence change or heartbeat update.
    PresenceUpdate(PresenceUpdate),
    /// SIM inventory update for a device.
    SimUpdate(SimUpdate),
    /// Contact update (placeholder shape).
    ContactUpdate(ContactUpdate),
    /// Config update broadcast after changes.
    ConfigUpdate { config: ClientConfigSnapshot },
    /// Service degraded notice (e.g., hot-store fallback).
    Degraded { reason: String },
    /// Pong response to client ping.
    Pong,
    /// Paged events in response to PAGE_BEFORE/PAGE_AFTER.
    Page(PagePayload),
}

/// Presence update payload.
#[derive(Debug, Clone, Serialize)]
pub struct PresenceUpdate {
    pub device_id: String,
    pub state: PresenceState,
    pub queue_depth: u32,
    pub last_heartbeat: DateTime<Utc>,
    pub device_rtt_ms: Option<u32>,
    #[serde(default)]
    pub sims: Vec<SimSnapshot>,
}

/// SIM update payload.
#[derive(Debug, Clone, Serialize)]
pub struct SimUpdate {
    pub device_id: String,
    pub sims: Vec<SimSnapshot>,
}

/// Contact update payload (minimal placeholder).
#[derive(Debug, Clone, Serialize)]
pub struct ContactUpdate {
    pub contact_id: String,
    pub name: Option<String>,
    pub numbers: Vec<String>,
    pub updated_at: DateTime<Utc>,
}

/// Page direction for paging messages.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PageDirection {
    Before,
    After,
}

/// Paged events payload.
#[derive(Debug, Clone, Serialize)]
pub struct PagePayload {
    pub direction: PageDirection,
    pub anchor_id: String,
    pub events: Vec<SmsEvent>,
    pub oldest_id: Option<String>,
    pub newest_id: Option<String>,
}

/// Client -> server messages.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ClientMessage {
    /// Client requests a pong.
    Ping,
    /// Client requests a refresh of config snapshot.
    ConfigRefresh,
    /// Client requests a subscription update (numbers currently ignored).
    Subscribe { numbers: Option<Vec<String>> },
    /// Request a page of events older than the given anchor.
    PageBefore {
        anchor_id: String,
        limit: Option<u32>,
    },
    /// Request a page of events newer than the given anchor.
    PageAfter {
        anchor_id: String,
        limit: Option<u32>,
    },
    /// Generic page request with optional before cursor (alias for PageBefore).
    Page {
        before: Option<String>,
        limit: Option<u32>,
    },
}
