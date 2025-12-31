//! Ingest HTTP endpoint for smsrelay3 submissions.
//! Performs basic normalization, deduplication, and hot-store enqueueing.

use std::{sync::OnceLock, time::Duration};

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    auth::DeviceAuth,
    domain::{EventSource, EventState, SmsEvent},
    error::AppError,
    state::AppState,
    ws_types::ServerMessage,
};

/// Ingest request body supporting batch submission.
#[derive(Debug, Deserialize)]
pub struct IngestRequest {
    /// Events to ingest; batch size is limited by config.ingest.max_batch.
    pub events: Vec<InboundEvent>,
}

/// Individual event payload submitted by smsrelay3.
#[derive(Debug, Deserialize)]
pub struct InboundEvent {
    /// Unique identifier from device (ULID preferred).
    pub id: Option<String>,
    /// Device identifier.
    pub device_id: String,
    /// Destination number (E.164) if known.
    pub number_e164: Option<String>,
    /// Sender string as captured by device.
    pub sender: String,
    /// Raw content.
    pub content: String,
    /// Device-side timestamp.
    pub device_received_at: Option<DateTime<Utc>>,
    /// Source hint.
    #[serde(default = "default_source")]
    pub source: EventSource,
}

fn default_source() -> EventSource {
    EventSource::AndroidSms
}

/// Ingest response summarizing how many events were accepted or deduped.
#[derive(Debug, Serialize)]
pub struct IngestResponse {
    /// Count of newly accepted events.
    pub accepted: usize,
    /// Count of dropped events due to deduplication.
    pub deduped: usize,
    /// Total events seen in the request.
    pub total: usize,
}

/// Entry point for `/api/v1/ingest`.
pub async fn ingest(
    DeviceAuth(_): DeviceAuth,
    State(state): State<AppState>,
    Json(payload): Json<IngestRequest>,
) -> Result<impl IntoResponse, AppError> {
    if payload.events.is_empty() {
        return Err(AppError::Validation(
            "at least one event is required".into(),
        ));
    }
    if payload.events.len() > state.config.ingest.max_batch {
        return Err(AppError::Validation(format!(
            "batch too large: received {}, max {}",
            payload.events.len(),
            state.config.ingest.max_batch
        )));
    }

    let mut accepted = 0usize;
    let mut deduped = 0usize;
    let dedup_ttl = Duration::from_millis(state.config.ingest.dedup_ttl_ms);
    let now = Utc::now();

    for inbound in payload.events {
        let event = build_event(inbound, now);
        let dedup_key = dedup_key(&event);
        if state.hot_store.has_dedup_key(&dedup_key).await {
            deduped += 1;
            continue;
        }

        state.hot_store.append_event(event.clone()).await;
        state.hot_store.set_dedup_key(&dedup_key, dedup_ttl).await;
        let _ = state.event_tx.send(ServerMessage::EventNew {
            event: event.clone(),
        });
        state.persistence_worker.enqueue(event).await;
        accepted += 1;
    }

    state.metrics.observe_http("/api/v1/ingest", StatusCode::OK);

    Ok((
        StatusCode::OK,
        Json(IngestResponse {
            accepted,
            deduped,
            total: accepted + deduped,
        }),
    ))
}

fn build_event(inbound: InboundEvent, now: DateTime<Utc>) -> SmsEvent {
    let content = inbound.content.trim().to_string();
    let parsed_code = extract_code(&content);
    SmsEvent {
        id: inbound.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        device_id: inbound.device_id,
        number_e164: inbound.number_e164,
        sender: inbound.sender,
        content: content.clone(),
        content_hash: hash_content(&content),
        parsed_code,
        state: EventState::New,
        source: inbound.source,
        device_received_at: inbound.device_received_at,
        server_received_at: now,
    }
}

fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}

fn dedup_key(event: &SmsEvent) -> String {
    format!("{}:{}", event.device_id, event.content_hash)
}

fn extract_code(content: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let regex = RE.get_or_init(|| Regex::new(r"\b\d{4,8}\b").expect("compile regex"));
    regex.find(content).map(|m| m.as_str().to_string())
}
