//! Event state transition endpoints (claim/verify/reject).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use crate::{
    auth::{permissions, user::UserAuth},
    domain::EventState,
    error::AppError,
    state::AppState,
    ws_types::ServerMessage,
};

/// Common response payload for event mutations.
#[derive(Debug, serde::Serialize)]
pub struct EventResponse {
    pub id: String,
    pub state: EventState,
}

/// POST /api/v1/events/:id/claim
pub async fn claim_event(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::EVENTS_CLAIM)?;
    let updated = transition_event(&state, &event_id, EventState::Claimed).await?;
    Ok((StatusCode::OK, Json(EventResponse::from(updated))))
}

/// POST /api/v1/events/:id/verify
pub async fn verify_event(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::EVENTS_VERIFY)?;
    let updated = transition_event(&state, &event_id, EventState::Verified).await?;
    Ok((StatusCode::OK, Json(EventResponse::from(updated))))
}

/// POST /api/v1/events/:id/reject
pub async fn reject_event(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::EVENTS_REJECT)?;
    let updated = transition_event(&state, &event_id, EventState::Rejected).await?;
    Ok((StatusCode::OK, Json(EventResponse::from(updated))))
}

async fn transition_event(
    state: &AppState,
    event_id: &str,
    target_state: EventState,
) -> Result<crate::domain::SmsEvent, AppError> {
    let existing = state
        .hot_store
        .get_event(event_id)
        .await
        .ok_or_else(|| AppError::Validation("event not found".into()))?;

    let next = apply_transition(existing, target_state)?;
    let updated = state
        .hot_store
        .update_event(next.clone())
        .await
        .ok_or_else(|| AppError::Validation("event not found".into()))?;

    // Broadcast and persist the updated event.
    let _ = state.event_tx.send(ServerMessage::EventUpdate {
        event: updated.clone(),
    });
    state.persistence_worker.enqueue(updated.clone()).await;

    Ok(updated)
}

fn apply_transition(
    mut event: crate::domain::SmsEvent,
    target_state: EventState,
) -> Result<crate::domain::SmsEvent, AppError> {
    if event.state == target_state {
        return Ok(event);
    }

    match (event.state.clone(), target_state.clone()) {
        (EventState::New, EventState::Claimed)
        | (EventState::New, EventState::Verified)
        | (EventState::New, EventState::Rejected)
        | (EventState::Claimed, EventState::Verified)
        | (EventState::Claimed, EventState::Rejected) => {
            event.state = target_state;
            Ok(event)
        }
        _ => Err(AppError::Validation("invalid state transition".into())),
    }
}

impl From<crate::domain::SmsEvent> for EventResponse {
    fn from(value: crate::domain::SmsEvent) -> Self {
        Self {
            id: value.id,
            state: value.state,
        }
    }
}

fn require_permission(user: &crate::auth::AuthContext, perm: &str) -> Result<(), AppError> {
    if user.has_permission(perm) {
        Ok(())
    } else {
        Err(AppError::Validation("forbidden".into()))
    }
}
