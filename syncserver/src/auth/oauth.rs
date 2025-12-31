//! OAuth/OIDC validation for ID tokens using HS256 secrets.

use chrono::Utc;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;

use crate::{auth::Principal, config::AuthConfig, error::AppError};

/// Claims subset validated from an ID token.
#[derive(Debug, Deserialize)]
struct TokenClaims {
    sub: Option<String>,
    iss: Option<String>,
    #[serde(default)]
    aud: Option<Audience>,
    exp: Option<u64>,
    email: Option<String>,
}

/// Audience can be a single string or an array.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Audience {
    Single(String),
    Multiple(Vec<String>),
}

impl Audience {
    fn contains(&self, expected: &str) -> bool {
        match self {
            Audience::Single(aud) => aud == expected,
            Audience::Multiple(list) => list.iter().any(|aud| aud == expected),
        }
    }
}

/// Validate an ID token using HS256 and expected issuer/audience.
pub fn validate_id_token(config: &AuthConfig, id_token: &str) -> Result<Principal, AppError> {
    let secret = config.oauth_hmac_secret.as_ref().ok_or_else(|| {
        AppError::Validation("oauth_hmac_secret not configured for oauth mode".into())
    })?;
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    validation.validate_nbf = true;
    let token_data = decode::<TokenClaims>(
        id_token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|err| AppError::Validation(format!("invalid id token: {err}")))?;
    let claims = token_data.claims;

    if let Some(expected_iss) = &config.oauth_issuer {
        if claims.iss.as_deref() != Some(expected_iss.as_str()) {
            return Err(AppError::Validation("invalid issuer".into()));
        }
    }
    if let Some(expected_aud) = &config.oauth_audience {
        if !claims
            .aud
            .as_ref()
            .map(|aud| aud.contains(expected_aud))
            .unwrap_or(false)
        {
            return Err(AppError::Validation("invalid audience".into()));
        }
    }
    if let Some(exp) = claims.exp {
        if exp < Utc::now().timestamp() as u64 {
            return Err(AppError::Validation("id token expired".into()));
        }
    }
    let subject = claims
        .sub
        .or(claims.email)
        .ok_or_else(|| AppError::Validation("id token missing subject".into()))?;

    Ok(Principal::User {
        id: subject,
        role: crate::auth::Role {
            name: "admin".into(),
            precedence: 100,
            permissions: crate::auth::permissions::all_permissions(),
        },
    })
}
