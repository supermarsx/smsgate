//! Shared WebSocket message contracts for server broadcast.

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::domain::{PresenceState, SmsEvent};

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
    /// New event appended.
    EventNew { event: SmsEvent },
    /// Presence change or heartbeat update.
    PresenceUpdate(PresenceUpdate),
    /// Pong response to client ping.
    Pong,
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
