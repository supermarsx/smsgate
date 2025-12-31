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
    routes::context::RequestContext,
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
    DeviceAuth(device): DeviceAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(payload): Json<IngestRequest>,
) -> Result<impl IntoResponse, AppError> {
    let ingest_span = tracing::info_span!(
        target: "ingest",
        "ingest_request",
        otel.name = "ingest.request",
        device = %device.actor_label(),
        events = payload.events.len() as u64
    );
    let _guard = ingest_span.enter();

    let cfg = state.config.read().await;
    let ingest_cfg = cfg.config.ingest.clone();

    if payload.events.is_empty() {
        return Err(AppError::Validation(
            "at least one event is required".into(),
        ));
    }
    if payload.events.len() > ingest_cfg.max_batch {
        return Err(AppError::Validation(format!(
            "batch too large: received {}, max {}",
            payload.events.len(),
            ingest_cfg.max_batch
        )));
    }

    let mut accepted = 0usize;
    let mut deduped = 0usize;
    let dedup_ttl = Duration::from_millis(ingest_cfg.dedup_ttl_ms);
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
        if ingest_cfg.persist_new {
            state.persistence_worker.enqueue(event.clone()).await;
        }
        if let Some(device_ts) = event.device_received_at {
            let latency_ms = (now - device_ts).num_milliseconds().max(0) as f64;
            state.metrics.observe_ingest_latency_ms(latency_ms);
        }
        if let Some(number) = event.number_e164.clone() {
            tracing::debug!(
                target: "sim",
                device_id = %event.device_id,
                number = %number,
                "ingest observed number assignment"
            );
        }
        accepted += 1;
    }

    tracing::info!(
        target: "ingest",
        device = %device.actor_label(),
        accepted,
        deduped,
        "ingest processed batch"
    );
    state
        .audit
        .log_action(
            device.actor_label(),
            "ingest.accept".into(),
            None,
            "success".into(),
            serde_json::json!({ "accepted": accepted, "deduped": deduped }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;

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
