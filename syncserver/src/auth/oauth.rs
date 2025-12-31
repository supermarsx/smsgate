//! Minimal OAuth/OIDC validation placeholder.

use crate::{auth::Principal, config::AuthConfig, error::AppError};

/// Validate an ID token payload stub against issuer/audience.
pub fn validate_id_token(
    config: &AuthConfig,
    subject: &str,
    issuer: &str,
    audience: &str,
) -> Result<Principal, AppError> {
    if let Some(expected_iss) = &config.oauth_issuer {
        if expected_iss != issuer {
            return Err(AppError::Validation("invalid issuer".into()));
        }
    }
    if let Some(expected_aud) = &config.oauth_audience {
        if expected_aud != audience {
            return Err(AppError::Validation("invalid audience".into()));
        }
    }
    Ok(Principal::User {
        id: subject.to_string(),
        role: crate::auth::Role {
            name: "admin".into(),
            precedence: 100,
            permissions: crate::auth::permissions::all_permissions(),
        },
    })
}
