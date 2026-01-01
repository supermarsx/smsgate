//! Administrative CRUD endpoints for users, numbers, roles, and RBAC mappings.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{
    auth::{permissions, user::UserAuth},
    config::RoleDefinition,
    domain::User,
    error::AppError,
    management::{NumberPatch, PageQuery},
    routes::context::RequestContext,
    state::AppState,
};

/// Wrapper for paginated responses.
#[derive(Debug, Serialize)]
pub struct PagedResponse<T> {
    pub items: Vec<T>,
    pub page: u32,
    pub page_size: u32,
}

/// Request body to create a user.
#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub role: String,
    pub totp_secret: Option<String>,
}

/// Patch body for user updates.
#[derive(Debug, Deserialize, Default)]
pub struct UpdateUserRequest {
    pub password: Option<String>,
    pub role: Option<String>,
    pub locked: Option<bool>,
}

/// Request body to create a number.
#[derive(Debug, Deserialize)]
pub struct CreateNumberRequest {
    pub e164: String,
    pub label: Option<String>,
    #[serde(default)]
    pub shared: bool,
    pub default_device_id: Option<String>,
}

/// Request body for assigning a number.
#[derive(Debug, Deserialize)]
pub struct AssignNumberRequest {
    pub device_id: String,
}

/// Request body for updating group mappings.
#[derive(Debug, Deserialize)]
pub struct GroupMappingRequest {
    pub mapping: std::collections::HashMap<String, String>,
}

/// DELETE /api/v1/admin/numbers/:e164
pub async fn delete_number(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(e164): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::NUMBERS_WRITE)?;
    state.numbers.delete(&e164);
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.number.delete".into(),
            Some(e164.clone()),
            "success".into(),
            serde_json::json!({}),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::NO_CONTENT, ()))
}

/// GET /api/v1/admin/users
pub async fn list_users(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Query(query): Query<PageQuery>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::USERS_READ)?;
    let (page, page_size) = query.normalized();
    let users = state.user_store.list();
    let slice = paginate(users, page, page_size);
    Ok((
        StatusCode::OK,
        Json(PagedResponse {
            items: slice.into_iter().map(to_domain_user).collect(),
            page,
            page_size,
        }),
    ))
}

/// POST /api/v1/admin/users
pub async fn create_user(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(payload): Json<CreateUserRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::USERS_WRITE)?;
    let role = resolve_role(&state, &payload.role).await?;
    let created = state.user_store.create_user(
        &payload.username,
        &payload.password,
        role,
        payload.totp_secret.clone(),
    )?;
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.user.create".into(),
            Some(created.id.clone()),
            "success".into(),
            serde_json::json!({ "username": created.username, "role": payload.role }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::CREATED, Json(to_domain_user(created))))
}

/// PATCH /api/v1/admin/users/:user_id
pub async fn update_user(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(user_id): Path<String>,
    Json(patch): Json<UpdateUserRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::USERS_WRITE)?;

    let mut updated = state
        .user_store
        .get(&user_id)
        .ok_or_else(|| AppError::Validation("user not found".into()))?;

    if let Some(role_name) = patch.role {
        let role = resolve_role(&state, &role_name).await?;
        updated = state.user_store.set_role(&user_id, role)?;
    }
    if let Some(locked) = patch.locked {
        updated = state.user_store.set_locked(&user_id, locked)?;
    }
    if let Some(password) = patch.password {
        updated = state.user_store.set_password(&user_id, &password)?;
        state.session_store.revoke_by_principal(&user_id);
    }

    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.user.update".into(),
            Some(user_id.clone()),
            "success".into(),
            serde_json::json!({ "locked": updated.locked, "role": updated.role.name }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;

    Ok((StatusCode::OK, Json(to_domain_user(updated))))
}

/// DELETE /api/v1/admin/users/:user_id
pub async fn delete_user(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::USERS_WRITE)?;
    state.user_store.delete(&user_id);
    state.session_store.revoke_by_principal(&user_id);
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.user.delete".into(),
            Some(user_id.clone()),
            "success".into(),
            serde_json::json!({}),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::NO_CONTENT, ()))
}

/// POST /api/v1/admin/users/:user_id/unlock
pub async fn unlock_user(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::USERS_UNLOCK)?;
    let updated = state.user_store.set_locked(&user_id, false)?;
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.user.unlock".into(),
            Some(user_id.clone()),
            "success".into(),
            serde_json::json!({ "locked": false }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::OK, Json(to_domain_user(updated))))
}

/// POST /api/v1/admin/users/:user_id/force_logout
pub async fn force_logout(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::USERS_FORCE_LOGOUT)?;
    state.session_store.revoke_by_principal(&user_id);
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.user.force_logout".into(),
            Some(user_id.clone()),
            "success".into(),
            serde_json::json!({}),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::OK, Json(serde_json::json!({ "status": "ok" }))))
}

/// GET /api/v1/admin/numbers
pub async fn list_numbers(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Query(query): Query<PageQuery>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::NUMBERS_READ)?;
    let (page, page_size) = query.normalized();
    let numbers = state.numbers.list(page, page_size);
    Ok((
        StatusCode::OK,
        Json(PagedResponse {
            items: numbers,
            page,
            page_size,
        }),
    ))
}

/// POST /api/v1/admin/numbers
pub async fn create_number(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(payload): Json<CreateNumberRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::NUMBERS_WRITE)?;
    validate_number(&payload.e164)?;
    if let Some(default) = &payload.default_device_id {
        ensure_device_exists(&state.device_auth, default)?;
    }
    let record = state.numbers.upsert(
        payload.e164.clone(),
        payload.label.clone(),
        payload.shared,
        payload.default_device_id.clone(),
    );
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.number.create".into(),
            Some(record.e164.clone()),
            "success".into(),
            serde_json::json!({ "shared": record.shared }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::CREATED, Json(record)))
}

/// PATCH /api/v1/admin/numbers/:e164
pub async fn update_number(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(e164): Path<String>,
    Json(patch): Json<NumberPatch>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::NUMBERS_WRITE)?;
    if let Some(default) = patch.default_device_id.as_ref() {
        ensure_device_exists(&state.device_auth, default)?;
    }
    let updated = state.numbers.update(&e164, patch)?;
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.number.update".into(),
            Some(e164.clone()),
            "success".into(),
            serde_json::json!({ "shared": updated.shared }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::OK, Json(updated)))
}

/// POST /api/v1/admin/numbers/:e164/assign
pub async fn assign_number(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(e164): Path<String>,
    Json(payload): Json<AssignNumberRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::NUMBERS_WRITE)?;
    ensure_device_exists(&state.device_auth, &payload.device_id)?;
    let updated = state.numbers.assign(&e164, &payload.device_id)?;
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.number.assign".into(),
            Some(e164.clone()),
            "success".into(),
            serde_json::json!({ "device_id": payload.device_id }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::OK, Json(updated)))
}

/// POST /api/v1/admin/numbers/:e164/unassign
pub async fn unassign_number(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(e164): Path<String>,
    payload: Option<Json<AssignNumberRequest>>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::NUMBERS_WRITE)?;
    let updated = if let Some(Json(body)) = payload {
        state.numbers.unassign(&e164, &body.device_id)?
    } else {
        // Delete alias without payload removes all assignments.
        state.numbers.unassign_all(&e164)?
    };
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.number.unassign".into(),
            Some(e164.clone()),
            "success".into(),
            serde_json::json!({ "device_ids": updated.assigned_device_ids }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;
    Ok((StatusCode::OK, Json(updated)))
}

/// GET /api/v1/admin/roles
pub async fn list_roles(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::CONFIG_READ)?;
    let cfg = state.config.read().await;
    Ok((StatusCode::OK, Json(cfg.config.rbac.roles.clone())))
}

/// POST /api/v1/admin/roles
pub async fn create_role(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(role): Json<RoleDefinition>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::CONFIG_WRITE)?;
    let mut guard = state.config.write().await;
    if guard.config.rbac.roles.iter().any(|r| r.name == role.name) {
        return Err(AppError::Validation("role already exists".into()));
    }
    guard.config.rbac.roles.push(role.clone());
    guard.version += 1;
    guard.last_updated_at = Utc::now();
    let updated = guard.clone();
    drop(guard);

    state.persist_config(&updated).await?;
    {
        let mut rbac_guard = state.rbac.write().await;
        *rbac_guard = crate::auth::rbac::RbacStore::from_config(&updated.config.rbac);
    }
    let rbac_guard = state.rbac.read().await;
    state.user_store.rebind_roles(&rbac_guard);
    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.role.create".into(),
            Some(role.name.clone()),
            "success".into(),
            serde_json::json!({ "precedence": role.precedence }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;

    Ok((StatusCode::CREATED, Json(updated.config.rbac.roles)))
}

/// PUT /api/v1/admin/rbac/groups
pub async fn update_group_mapping(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(body): Json<GroupMappingRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::CONFIG_WRITE)?;
    let mut guard = state.config.write().await;
    guard.config.rbac.group_mapping = body.mapping.clone();
    guard.version += 1;
    guard.last_updated_at = Utc::now();
    let updated = guard.clone();
    drop(guard);

    state.persist_config(&updated).await?;
    {
        let mut rbac_guard = state.rbac.write().await;
        *rbac_guard = crate::auth::rbac::RbacStore::from_config(&updated.config.rbac);
    }
    let rbac_guard = state.rbac.read().await;
    state.user_store.rebind_roles(&rbac_guard);

    state
        .audit
        .log_action(
            user.actor_label(),
            "admin.rbac.mapping.update".into(),
            None,
            "success".into(),
            serde_json::json!({ "groups": updated.config.rbac.group_mapping.len() }),
            ctx.correlation_id,
            ctx.ip,
            ctx.user_agent,
        )
        .await;

    Ok((StatusCode::OK, Json(updated.config.rbac.group_mapping)))
}

/// Helper: ensure the caller has a permission.
fn require_permission(user: &crate::auth::AuthContext, perm: &str) -> Result<(), AppError> {
    if user.has_permission(perm) {
        Ok(())
    } else {
        Err(AppError::Validation("forbidden".into()))
    }
}

fn to_domain_user(record: crate::auth::users::UserRecord) -> User {
    User {
        id: record.id,
        name: record.username.clone(),
        email: record.username.clone(),
        role: crate::domain::Role {
            name: record.role.name,
            precedence: record.role.precedence,
            permissions: record.role.permissions,
        },
        auth_mode: crate::config::AuthMode::SimpleSignin,
        locked: record.locked,
        requires_password_change: false,
    }
}

fn paginate<T: Clone>(items: Vec<T>, page: u32, page_size: u32) -> Vec<T> {
    let skip = (page.saturating_sub(1) * page_size) as usize;
    let take = page_size as usize;
    items.into_iter().skip(skip).take(take).collect()
}

fn validate_number(e164: &str) -> Result<(), AppError> {
    if !e164.starts_with('+') || e164.len() < 8 {
        return Err(AppError::Validation("invalid e164".into()));
    }
    if !e164.chars().skip(1).all(|c| c.is_ascii_digit()) {
        return Err(AppError::Validation("invalid e164".into()));
    }
    Ok(())
}

fn ensure_device_exists(
    devices: &crate::auth::DeviceAuthStore,
    device_id: &str,
) -> Result<(), AppError> {
    devices
        .diagnostics(device_id)
        .map(|_| ())
        .map_err(|_| AppError::Validation("device not found".into()))
}

async fn resolve_role(state: &AppState, role_name: &str) -> Result<crate::auth::Role, AppError> {
    let rbac = state.rbac.read().await;
    rbac.role_by_name(role_name)
        .ok_or_else(|| AppError::Validation("role not found".into()))
}
