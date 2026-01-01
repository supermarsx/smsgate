//! Common application error type for HTTP handlers and background tasks.
//! Converts rich errors into JSON API responses with consistent shapes.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

/// Application-wide error type so handlers can return rich, documented failures.
#[derive(Debug, Error)]
pub enum AppError {
    /// A configuration file could not be read or parsed.
    #[error("configuration error: {0}")]
    Config(String),
    /// A validation rule failed during startup or request processing.
    #[error("validation error: {0}")]
    Validation(String),
    /// A generic, unexpected failure bubbled up.
    #[allow(dead_code)]
    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    error: &'a str,
    message: &'a str,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::Config(msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::Validation(msg) => (StatusCode::UNPROCESSABLE_ENTITY, msg.as_str()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.as_str()),
        };

        let body = Json(ErrorBody {
            error: match &self {
                AppError::Config(_) => "config_error",
                AppError::Validation(_) => "validation_error",
                AppError::Internal(_) => "internal_error",
            },
            message,
        });

        (status, body).into_response()
    }
}
