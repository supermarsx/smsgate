//! Event state transition endpoints (claim/verify/reject).

use axum::{
    extract::{Path, Query, State},
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

/// Body for state update endpoint to match UI contract.
#[derive(Debug, serde::Deserialize)]
pub struct StateUpdateRequest {
    pub state: EventState,
}

/// Query params for event listing.
#[derive(Debug, serde::Deserialize)]
pub struct ListEventsQuery {
    /// Fetch events older than this id.
    pub before: Option<String>,
    /// Maximum number of events to return.
    pub limit: Option<usize>,
}

/// GET /api/v1/events
pub async fn list_events(
    UserAuth(_user): UserAuth,
    State(state): State<AppState>,
    Query(query): Query<ListEventsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let cfg = state.config.read().await;
    let default_limit = cfg.config.server.ws_snapshot_limit as usize;
    let limit = query
        .limit
        .unwrap_or(default_limit)
        .min(default_limit.max(1));
    drop(cfg);
    let events = if let Some(anchor) = query.before {
        state.hot_store.page_before(&anchor, limit).await
    } else {
        state.hot_store.latest(limit).await
    };
    Ok((StatusCode::OK, Json(serde_json::json!({ "events": events }))))
}

/// POST /api/v1/events/:event_id/state (compat with smsgate2)
pub async fn update_event_state(
    UserAuth(user): UserAuth,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    ctx: RequestContext,
    Json(body): Json<StateUpdateRequest>,
) -> Result<impl IntoResponse, AppError> {
    let target = body.state.clone();
    // Map to specific transition endpoints for permission enforcement.
    match target {
        EventState::Claimed => claim_event(UserAuth(user), State(state), Path(event_id), ctx).await,
        EventState::Verified => verify_event(UserAuth(user), State(state), Path(event_id), ctx).await,
        EventState::Rejected => reject_event(UserAuth(user), State(state), Path(event_id), ctx).await,
        EventState::New => Err(AppError::Validation("cannot transition to new".into())),
    }
}

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

    let next = apply_transition(existing, target_state, actor)?;
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
    actor: &str,
) -> Result<crate::domain::SmsEvent, AppError> {
    // Set claim metadata when transitioning out of New into other states.
    if target_state != EventState::New {
        event.claimed_by = Some(actor.to_string());
        event.claimed_at = Some(chrono::Utc::now());
    }
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
