//! Shared WebSocket message contracts for server broadcast.

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::{
    config::ClientConfigSnapshot,
    domain::{PresenceState, SmsEvent},
};

/// Server -> client messages.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum ServerMessage {
    /// Initial greeting with protocol version.
    Welcome { version: &'static str },
    /// Initial snapshot of recent events.
    Snapshot {
        events: Vec<SmsEvent>,
        newest_id: Option<String>,
        oldest_id: Option<String>,
        limit: u32,
    },
    /// Initial configuration snapshot to seed UI gating.
    ConfigSnapshot { config: ClientConfigSnapshot },
    /// New event appended.
    EventNew { event: SmsEvent },
    /// Existing event updated (state transitions).
    EventUpdate { event: SmsEvent },
    /// Presence change or heartbeat update.
    PresenceUpdate(PresenceUpdate),
    /// Config update broadcast after changes.
    ConfigUpdate { config: ClientConfigSnapshot },
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
#[serde(tag = "type", content = "data")]
pub enum ClientMessage {
    /// Client requests a pong.
    Ping,
    /// Client requests a refresh of config snapshot.
    ConfigRefresh,
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
}
