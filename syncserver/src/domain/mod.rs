//! Shared domain contracts for syncserver REST/WS payloads.
//! These are intentionally aligned with `docs/spec-syncserver.md` so smsgate2 and smsrelay3
//! clients can share the same shapes when we later publish them as an SDK crate.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::config::AuthMode;

/// Message source identifier.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventSource {
    /// SMS reported by smsrelay3.
    AndroidSms,
    /// Contact-derived note (optional).
    ContactNote,
}

/// Event state transitions allowed by syncserver.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventState {
    /// Newly ingested message.
    New,
    /// Claimed by an operator.
    Claimed,
    /// Verified by an operator.
    Verified,
    /// Rejected/ignored.
    Rejected,
}

/// Primary SMS event representation sent to dashboards.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmsEvent {
    /// Unique identifier (ULID preferred).
    pub id: String,
    /// Device identifier from pairing.
    pub device_id: String,
    /// Destination number (E.164) if known.
    pub number_e164: Option<String>,
    /// Sender string as captured on device.
    pub sender: String,
    /// Full message content.
    pub content: String,
    /// Normalized hash for deduplication.
    pub content_hash: String,
    /// Optional parsed OTP/code.
    pub parsed_code: Option<String>,
    /// Current state of the event.
    pub state: EventState,
    /// Source of the event.
    pub source: EventSource,
    /// Device-side timestamp if provided.
    pub device_received_at: Option<DateTime<Utc>>,
    /// Server ingest timestamp.
    pub server_received_at: DateTime<Utc>,
}

/// Presence state computed from heartbeats.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PresenceState {
    /// Heartbeat fresh (<20s).
    Online,
    /// Degraded heartbeat (20-60s).
    Degraded,
    /// Heartbeat stale (>60s).
    Offline,
}

/// Heartbeat sample as reported by smsrelay3.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatSample {
    /// Device identifier.
    pub device_id: String,
    /// Queue depth reported by device.
    pub queue_depth: u32,
    /// Optional device-measured RTT to syncserver.
    pub device_rtt_ms: Option<u32>,
    /// Last successful ingest time (device clock).
    pub last_successful_ingest_at: Option<DateTime<Utc>>,
    /// Battery level (0-100) if provided.
    pub battery_level: Option<u8>,
    /// Network type (wifi/cellular) if provided.
    pub network_type: Option<String>,
    /// Client-side timestamp when heartbeat was generated.
    pub client_time: DateTime<Utc>,
}

/// SIM snapshot entry for multi-SIM devices.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimSnapshot {
    /// SIM slot index (0-based).
    pub slot_index: u8,
    /// Integrated Circuit Card Identifier (if present).
    pub iccid: Option<String>,
    /// Phone number/MSISDN (if present).
    pub msisdn: Option<String>,
    /// Carrier name label (optional).
    pub carrier_name: Option<String>,
    /// Active/inactive status.
    pub status: SimStatus,
    /// When this SIM snapshot was last observed.
    pub last_seen_at: DateTime<Utc>,
}

/// SIM status flags.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SimStatus {
    /// SIM present and active.
    Active,
    /// SIM removed or inactive.
    Inactive,
}

/// Effective configuration metadata (payload kept as JSON until adapters exist).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEnvelope {
    /// Monotonic config version.
    pub version: u64,
    /// Last update timestamp.
    pub last_updated_at: DateTime<Utc>,
    /// Raw config payload to be validated client-side.
    pub payload: serde_json::Value,
}

/// Pairing session descriptor for QR flow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingSession {
    /// Session identifier.
    pub id: String,
    /// Encoded QR payload for smsrelay3.
    pub qr_payload: String,
    /// Expiration time.
    pub expires_at: DateTime<Utc>,
    /// Session status.
    pub status: PairingStatus,
}

/// Pairing lifecycle state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PairingStatus {
    /// Session is waiting for device scan.
    Pending,
    /// Device completed the scan and was issued credentials.
    Completed,
    /// Session expired before completion.
    Expired,
}

/// User record exposed to smsgate2 dashboards.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    /// Unique identifier.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Primary email/username.
    pub email: String,
    /// Effective role name.
    pub role: Role,
    /// Auth mode bound to the user.
    pub auth_mode: AuthMode,
    /// Whether the account is locked.
    pub locked: bool,
    /// Whether the account requires password change.
    pub requires_password_change: bool,
}

/// Role definition snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    /// Role label (e.g., admin, manager).
    pub name: String,
    /// Higher value means higher precedence.
    pub precedence: u32,
    /// Permission keys granted to this role.
    pub permissions: Vec<String>,
}

/// Phone number record with assignment metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumberRecord {
    /// E.164 phone number.
    pub e164: String,
    /// Optional friendly label.
    pub label: Option<String>,
    /// Whether the number is shared.
    pub shared: bool,
    /// Default device assignment (if any).
    pub default_device_id: Option<String>,
    /// Currently assigned device ids.
    pub assigned_device_ids: Vec<String>,
}

/// Structured audit entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    /// Unique audit id.
    pub id: String,
    /// Actor principal.
    pub actor: String,
    /// Action performed.
    pub action: String,
    /// Target entity identifier.
    pub target: Option<String>,
    /// Result string (success/failure reason).
    pub result: String,
    /// Correlation id for tracing.
    pub correlation_id: Option<String>,
    /// Free-form structured details.
    pub details: serde_json::Value,
    /// Timestamp when the audit was recorded.
    pub occurred_at: DateTime<Utc>,
    /// Optional IP address recorded for the action.
    pub ip: Option<String>,
    /// Optional user agent recorded for the action.
    pub user_agent: Option<String>,
}

/// Login event representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginEvent {
    /// Unique login event id.
    pub id: String,
    /// Identity attempting to log in.
    pub identity: String,
    /// Authentication mode used.
    pub mode: AuthMode,
    /// Result label (success/failure reason).
    pub result: String,
    /// IP address string.
    pub ip: String,
    /// User agent string.
    pub user_agent: Option<String>,
    /// Whether 2FA was required and satisfied.
    pub two_fa_passed: bool,
    /// Timestamp when the event occurred.
    pub occurred_at: DateTime<Utc>,
}
