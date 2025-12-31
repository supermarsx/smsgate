//! Metrics instrumentation and Prometheus exposition for syncserver.
//! This module owns the registry and provides helpers to render `/metrics`.

use axum::{
    http::{header::CONTENT_TYPE, StatusCode},
    response::{IntoResponse, Response},
};
use prometheus::{
    opts, process_collector::ProcessCollector, Encoder, IntCounterVec, Registry, TextEncoder,
};

use crate::error::AppError;

/// Shared metrics registry and counters.
#[derive(Clone)]
pub struct Metrics {
    registry: Registry,
    http_requests_total: IntCounterVec,
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

        // Register collectors.
        registry
            .register(Box::new(http_requests_total.clone()))
            .map_err(|err| AppError::Internal(format!("failed to register counter: {}", err)))?;
        registry
            .register(Box::new(ProcessCollector::for_self()))
            .map_err(|err| AppError::Internal(format!("failed to register process collector: {}", err)))?;

        Ok(Self {
            registry,
            http_requests_total,
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

/// Metrics handler returning Prometheus exposition format.
pub async fn metrics_handler(state: crate::state::AppState) -> Response {
    match state.metrics.render() {
        Ok(body) => {
            state.metrics.observe_http("/metrics", StatusCode::OK);
            (
                [(CONTENT_TYPE, TextEncoder::default().format_type())],
                body,
            )
                .into_response()
        }
        Err(err) => {
            tracing::error!(error = %err, "failed to render metrics");
            state.metrics.observe_http("/metrics", StatusCode::INTERNAL_SERVER_ERROR);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
