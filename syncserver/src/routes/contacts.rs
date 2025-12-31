//! Contacts endpoints (placeholder implementations to satisfy client contract).

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};

use crate::{
    auth::{permissions, user::UserAuth},
    error::AppError,
    state::AppState,
};

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct ContactRecord {
    pub id: String,
    pub number: String,
    pub name: Option<String>,
}

/// GET /api/v1/contacts
pub async fn list_contacts(
    UserAuth(_user): UserAuth,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let contacts = state
        .contacts
        .list()
        .into_iter()
        .map(|(number, name)| ContactRecord {
            id: number.clone(),
            number,
            name: Some(name),
        })
        .collect::<Vec<ContactRecord>>();
    Ok((StatusCode::OK, Json(contacts)))
}

/// POST /api/v1/contacts/toggle
#[derive(Debug, serde::Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

pub async fn toggle_contacts(
    UserAuth(_user): UserAuth,
    State(_state): State<AppState>,
    Json(_body): Json<ToggleRequest>,
) -> Result<impl IntoResponse, AppError> {
    Ok((StatusCode::OK, Json(serde_json::json!({ "enabled": _body.enabled }))))
}

/// POST /api/v1/contacts/conflicts/:id/resolve
pub async fn resolve_conflict(
    UserAuth(_user): UserAuth,
    State(_state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    Ok((StatusCode::OK, Json(serde_json::json!({ "status": "ok" }))))
}

/// GET /api/v1/contacts/export
pub async fn export_contacts(
    UserAuth(_user): UserAuth,
    State(_state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    Ok((
        StatusCode::OK,
        (
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            Json(Vec::<ContactRecord>::new()),
        ),
    ))
}
