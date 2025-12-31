//! Simple user auth extractor using headers (placeholder until OAuth/simple_signin are wired).

use std::sync::Arc;

use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts},
    http::{request::Parts, StatusCode},
};

use crate::auth::{rbac::RbacStore, session::SessionStore, Role};
use crate::auth::{AuthContext, Principal};

/// Extractor that reads `x-user-id`, optional `x-user-role`, and optional `x-user-groups`.
pub struct UserAuth(pub AuthContext);

impl UserAuth {
    fn session_from_headers(
        headers: &axum::http::HeaderMap,
        sessions: &SessionStore,
    ) -> Option<AuthContext> {
        let token = headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(|s| s.trim().to_string())?;
        sessions.validate(&token).map(|sess| AuthContext {
            principal: sess.principal,
        })
    }

    fn role_from_headers(headers: &axum::http::HeaderMap, rbac: &RbacStore) -> Option<Role> {
        if let Some(role_name) = headers.get("x-user-role").and_then(|v| v.to_str().ok()) {
            if let Some(role) = rbac.role_by_name(role_name) {
                return Some(role);
            }
        }

        if let Some(groups) = headers.get("x-user-groups").and_then(|v| v.to_str().ok()) {
            let parsed = groups
                .split(',')
                .filter_map(|g| {
                    let trimmed = g.trim();
                    (!trimmed.is_empty()).then(|| trimmed.to_string())
                })
                .collect::<Vec<_>>();
            if let Some(role) = rbac.role_from_groups(&parsed) {
                return Some(role);
            }
        }

        None
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for UserAuth
where
    RbacStore: FromRef<S>,
    Arc<SessionStore>: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = (StatusCode, String);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let rbac = RbacStore::from_ref(state);
        let sessions = Arc::<SessionStore>::from_ref(state);

        if let Some(ctx) = Self::session_from_headers(&parts.headers, &sessions) {
            return Ok(UserAuth(ctx));
        }

        let user_id = parts
            .headers
            .get("x-user-id")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                (
                    StatusCode::UNAUTHORIZED,
                    "missing x-user-id header".to_string(),
                )
            })?;

        let role = Self::role_from_headers(&parts.headers, &rbac)
            .or_else(|| rbac.role_by_name("admin"))
            .ok_or_else(|| (StatusCode::FORBIDDEN, "no matching role".to_string()))?;

        Ok(UserAuth(AuthContext {
            principal: Principal::User {
                id: user_id.to_string(),
                role,
            },
        }))
    }
}
