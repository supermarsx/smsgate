//! Domain/LDAP placeholder authentication.

use crate::{auth::Principal, config::AuthConfig, error::AppError};

/// Authenticate against a simple shared secret (placeholder for LDAP bind).
pub fn authenticate_domain(
    config: &AuthConfig,
    username: &str,
    password: &str,
) -> Result<Principal, AppError> {
    let expected = config
        .domain_shared_secret
        .as_deref()
        .ok_or_else(|| AppError::Validation("domain auth not configured".into()))?;
    if password == expected {
        Ok(Principal::User {
            id: username.to_string(),
            role: crate::auth::Role {
                name: "manager".into(),
                precedence: 50,
                permissions: vec![
                    crate::auth::permissions::EVENTS_READ.into(),
                    crate::auth::permissions::EVENTS_CLAIM.into(),
                    crate::auth::permissions::EVENTS_VERIFY.into(),
                    crate::auth::permissions::DEVICES_READ.into(),
                ],
            },
        })
    } else {
        Err(AppError::Validation("invalid domain credentials".into()))
    }
}
