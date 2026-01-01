//! Metrics instrumentation and Prometheus exposition for syncserver.
//! This module owns the registry and provides helpers to render `/metrics`.

use axum::{
    extract::State,
    http::{header::CONTENT_TYPE, StatusCode},
    response::{IntoResponse, Response},
};
#[cfg(target_os = "linux")]
use prometheus::process_collector::ProcessCollector;
use prometheus::{opts, Encoder, Gauge, GaugeVec, Histogram, IntCounterVec, Registry, TextEncoder};
use std::sync::{Arc, Mutex};

use crate::{error::AppError, state::AppState};
use serde::Serialize;

/// Lightweight metrics snapshot for WS/dashboard payloads.
#[derive(Debug, Clone, Serialize, Default)]
pub struct Snapshot {
    /// Placeholder for ingest latency percentiles (p50/p95).
    pub ingest_to_dashboard_ms: Option<LatencySummary>,
}

/// Latency percentiles for dashboard display.
#[derive(Debug, Clone, Serialize)]
pub struct LatencySummary {
    pub p50: Option<f64>,
    pub p95: Option<f64>,
}

/// Shared metrics registry and counters.
#[derive(Clone)]
pub struct Metrics {
    registry: Registry,
    http_requests_total: IntCounterVec,
    device_rtt_ms: GaugeVec,
    device_queue_depth: GaugeVec,
    ingest_latency_ms: Histogram,
    ws_connections: Gauge,
    /// Ring buffer of recent ingest latencies for percentile snapshots.
    recent_ingest_latencies: Arc<Mutex<Vec<f64>>>,
    recent_capacity: usize,
}

impl Metrics {
    /// Initialize a Prometheus registry with basic process metrics and HTTP counters.
    pub fn new() -> Result<Self, AppError> {
        let registry = Registry::new();

        let http_requests_total = IntCounterVec::new(
            opts!(
                "syncserver_http_requests_total",
                "Total HTTP requests served by path and status"
            ),
            &["path", "status"],
        )
        .map_err(|err| AppError::Internal(format!("failed to create counter: {}", err)))?;
        let device_rtt_ms = GaugeVec::new(
            opts!(
                "syncserver_device_rtt_ms",
                "Latest device-reported RTT per device"
            ),
            &["device_id"],
        )
        .map_err(|err| AppError::Internal(format!("failed to create gauge: {}", err)))?;
        let device_queue_depth = GaugeVec::new(
            opts!(
                "syncserver_device_queue_depth",
                "Latest queue depth per device from heartbeat"
            ),
            &["device_id"],
        )
        .map_err(|err| AppError::Internal(format!("failed to create gauge: {}", err)))?;
        let ingest_latency_ms = Histogram::with_opts(
            prometheus::HistogramOpts::new(
                "syncserver_ingest_latency_ms",
                "End-to-end latency between device timestamp and server receipt",
            )
            .buckets(vec![
                5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2000.0,
            ]),
        )
        .map_err(|err| AppError::Internal(format!("failed to create histogram: {}", err)))?;
        let ws_connections = Gauge::with_opts(opts!(
            "syncserver_ws_connections",
            "Active WebSocket connections"
        ))
        .map_err(|err| AppError::Internal(format!("failed to create gauge: {}", err)))?;

        // Register collectors.
        registry
            .register(Box::new(http_requests_total.clone()))
            .map_err(|err| AppError::Internal(format!("failed to register counter: {}", err)))?;
        registry
            .register(Box::new(device_rtt_ms.clone()))
            .map_err(|err| AppError::Internal(format!("failed to register gauge: {}", err)))?;
        registry
            .register(Box::new(device_queue_depth.clone()))
            .map_err(|err| AppError::Internal(format!("failed to register gauge: {}", err)))?;
        registry
            .register(Box::new(ingest_latency_ms.clone()))
            .map_err(|err| AppError::Internal(format!("failed to register histogram: {}", err)))?;
        registry
            .register(Box::new(ws_connections.clone()))
            .map_err(|err| AppError::Internal(format!("failed to register gauge: {}", err)))?;
        #[cfg(target_os = "linux")]
        registry
            .register(Box::new(ProcessCollector::for_self()))
            .map_err(|err| {
                AppError::Internal(format!("failed to register process collector: {}", err))
            })?;

        Ok(Self {
            registry,
            http_requests_total,
            device_rtt_ms,
            device_queue_depth,
            ingest_latency_ms,
            ws_connections,
            recent_ingest_latencies: Arc::new(Mutex::new(Vec::with_capacity(512))),
            recent_capacity: 512,
        })
    }

    /// Increment HTTP counter for a route/status.
    pub fn observe_http(&self, path: &str, status: StatusCode) {
        let status_label = status.as_u16().to_string();
        let path_label = normalize_path(path);
        self.http_requests_total
            .with_label_values(&[path_label.as_str(), status_label.as_str()])
            .inc();
    }

    /// Record the latest device RTT (ms) for a device.
    pub fn observe_device_rtt(&self, device_id: &str, rtt_ms: u32) {
        self.device_rtt_ms
            .with_label_values(&[device_id])
            .set(rtt_ms as f64);
    }

    /// Record the latest queue depth for a device.
    pub fn observe_device_queue_depth(&self, device_id: &str, queue_depth: u32) {
        self.device_queue_depth
            .with_label_values(&[device_id])
            .set(queue_depth as f64);
    }

    /// Record end-to-end ingest latency in milliseconds.
    pub fn observe_ingest_latency_ms(&self, latency_ms: f64) {
        self.ingest_latency_ms.observe(latency_ms);
        let mut guard = self
            .recent_ingest_latencies
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if guard.len() >= self.recent_capacity {
            guard.remove(0);
        }
        guard.push(latency_ms);
    }

    /// Set the current WebSocket connection count.
    pub fn observe_ws_connections(&self, count: i64) {
        self.ws_connections.set(count as f64);
    }

    /// Produce a lightweight snapshot for WS payloads.
    pub fn snapshot(&self) -> Snapshot {
        let guard = self
            .recent_ingest_latencies
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let p50 = percentile(&guard, 0.50);
        let p95 = percentile(&guard, 0.95);
        Snapshot {
            ingest_to_dashboard_ms: Some(LatencySummary { p50, p95 }),
        }
    }

    /// Render the registry into Prometheus text format.
    pub fn render(&self) -> Result<String, AppError> {
        let encoder = TextEncoder::new();
        let metric_families = self.registry.gather();
        let mut buffer = Vec::new();
        encoder
            .encode(&metric_families, &mut buffer)
            .map_err(|err| AppError::Internal(format!("failed to encode metrics: {}", err)))?;
        String::from_utf8(buffer)
            .map_err(|err| AppError::Internal(format!("failed to write metrics: {}", err)))
    }
}

/// Normalize paths to a smaller cardinality before labeling.
fn normalize_path(path: &str) -> String {
    match path {
        "/healthz" | "/readyz" => path.to_string(),
        "/api/v1/healthz" | "/api/v1/readyz" => "api_health".to_string(),
        _ => path.to_string(),
    }
}

fn percentile(samples: &[f64], quantile: f64) -> Option<f64> {
    if samples.is_empty() {
        return None;
    }
    let mut sorted = samples.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let rank = ((sorted.len() - 1) as f64 * quantile).round() as usize;
    sorted.get(rank).cloned()
}

/// Metrics handler returning Prometheus exposition format.
pub async fn metrics_handler(State(state): State<AppState>) -> Response {
    match state.metrics.render() {
        Ok(body) => {
            state.metrics.observe_http("/metrics", StatusCode::OK);
            ([(CONTENT_TYPE, TextEncoder::new().format_type())], body).into_response()
        }
        Err(err) => {
            tracing::error!(error = %err, "failed to render metrics");
            state
                .metrics
                .observe_http("/metrics", StatusCode::INTERNAL_SERVER_ERROR);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
