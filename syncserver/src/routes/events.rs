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
    routes::context::RequestContext,
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
    ctx: RequestContext,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::EVENTS_CLAIM)?;
    let updated = transition_event(
        &state,
        &user.actor_label(),
        &ctx,
        &event_id,
        EventState::Claimed,
        "event.claim",
    )
    .await?;
    Ok((StatusCode::OK, Json(EventResponse::from(updated))))
}

/// POST /api/v1/events/:id/verify
pub async fn verify_event(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    ctx: RequestContext,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::EVENTS_VERIFY)?;
    let updated = transition_event(
        &state,
        &user.actor_label(),
        &ctx,
        &event_id,
        EventState::Verified,
        "event.verify",
    )
    .await?;
    Ok((StatusCode::OK, Json(EventResponse::from(updated))))
}

/// POST /api/v1/events/:id/reject
pub async fn reject_event(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    ctx: RequestContext,
) -> Result<impl IntoResponse, AppError> {
    require_permission(&user, permissions::EVENTS_REJECT)?;
    let updated = transition_event(
        &state,
        &user.actor_label(),
        &ctx,
        &event_id,
        EventState::Rejected,
        "event.reject",
    )
    .await?;
    Ok((StatusCode::OK, Json(EventResponse::from(updated))))
}

async fn transition_event(
    state: &AppState,
    actor: &str,
    ctx: &RequestContext,
    event_id: &str,
    target_state: EventState,
    action: &str,
) -> Result<crate::domain::SmsEvent, AppError> {
    let existing = state
        .hot_store
        .get_event(event_id)
        .await
        .ok_or_else(|| AppError::Validation("event not found".into()))?;
    let previous_state = existing.state.clone();

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
    let persist_states = {
        let cfg = state.config.read().await;
        cfg.config.ingest.persist_states.clone()
    };
    if should_persist(&persist_states, &updated.state) {
        state.persistence_worker.enqueue(updated.clone()).await;
    }
    tracing::info!(
        target: "ingest",
        actor = %actor,
        event_id = %event_id,
        from = ?previous_state,
        to = ?updated.state,
        "event transitioned"
    );
    state
        .audit
        .log_action(
            actor.to_string(),
            action.into(),
            Some(event_id.to_string()),
            "success".into(),
            serde_json::json!({ "from": previous_state, "to": updated.state }),
            ctx.correlation_id.clone(),
            ctx.ip.clone(),
            ctx.user_agent.clone(),
        )
        .await;

    Ok(updated)
}

fn should_persist(states: &[String], target_state: &EventState) -> bool {
    let key = match target_state {
        EventState::New => "new",
        EventState::Claimed => "claimed",
        EventState::Verified => "verified",
        EventState::Rejected => "rejected",
    };
    states.iter().any(|s| s.eq_ignore_ascii_case(key))
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
