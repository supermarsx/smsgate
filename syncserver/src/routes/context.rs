//! Request-scoped context extractor for audit logging and tracing metadata.

use std::net::SocketAddr;

use axum::{
    async_trait,
    extract::{ConnectInfo, FromRequestParts},
    http::request::Parts,
};

/// Minimal request metadata used for audit entries.
#[derive(Debug, Clone)]
pub struct RequestContext {
    /// Optional remote IP address if captured by Axum.
    pub ip: Option<String>,
    /// Optional user agent string from request headers.
    pub user_agent: Option<String>,
    /// Correlation id propagated via `x-correlation-id` header.
    pub correlation_id: Option<String>,
}

#[async_trait]
impl<S> FromRequestParts<S> for RequestContext
where
    S: Send + Sync,
{
    type Rejection = (axum::http::StatusCode, &'static str);

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        let ip = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|connect| connect.0.ip().to_string());
        let user_agent = parts
            .headers
            .get(axum::http::header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let correlation_id = parts
            .headers
            .get("x-correlation-id")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        Ok(RequestContext {
            ip,
            user_agent,
            correlation_id,
        })
    }
}
