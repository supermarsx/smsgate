//! WebSocket gateway for smsgate2 dashboards.

use std::time::Duration;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    http::{HeaderMap, StatusCode},
    response::Response,
};
use tokio::time::timeout;

use crate::{
    auth::{AuthContext, Principal},
    presence::PresenceEntry,
    state::AppState,
    ws_types::{ClientMessage, ConfigUpdate, PageDirection, PagePayload, ServerMessage},
};

/// Upgrade HTTP requests to WebSocket and spawn session tasks.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    uri: axum::http::Uri,
) -> Response {
    if !state.try_acquire_connection().await {
        return Response::builder()
            .status(axum::http::StatusCode::TOO_MANY_REQUESTS)
            .body(axum::body::Body::from("max connections reached"))
            .unwrap();
    }
    // Require a bearer session token to establish WS.
    let session_token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.trim().to_string())
        .or_else(|| token_from_query(&uri));
    let auth_ctx = session_token
        .and_then(|t| state.session_store.validate(&t))
        .map(|session| AuthContext {
            principal: session.principal,
        });
    if auth_ctx.is_none() {
        state.release_connection();
        return Response::builder()
            .status(StatusCode::UNAUTHORIZED)
            .body(axum::body::Body::from("missing or invalid session"))
            .unwrap();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, state, peer, auth_ctx.unwrap()))
}

async fn handle_socket(
    mut socket: WebSocket,
    state: AppState,
    peer: std::net::SocketAddr,
    auth: AuthContext,
) {
    let mut rx = state.subscribe_events();
    let cfg = state.config.read().await;
    let snapshot_limit = cfg.config.server.ws_snapshot_limit as usize;
    drop(cfg);

    if send_welcome(&mut socket).await.is_err() {
        return;
    }
    if send_config_snapshot(&mut socket, &state).await.is_err() {
        return;
    }
    if send_degraded_notice(&mut socket, &state).await.is_err() {
        return;
    }
    if send_snapshot(&mut socket, &state, snapshot_limit)
        .await
        .is_err()
    {
        return;
    }

    let session_span = tracing::info_span!(
        target: "paging",
        "ws_session",
        otel.name = "ws.session",
        peer = %peer,
        actor = %auth_label(&auth),
        connections = state.connection_count.load(std::sync::atomic::Ordering::Relaxed)
    );
    let _guard = session_span.enter();

    loop {
        tokio::select! {
            msg = socket.recv() => {
                if let Some(Ok(message)) = msg {
                    if handle_client_message(&mut socket, &state, message)
                        .await
                        .is_err()
                    {
                        break;
                    }
                } else {
                    break;
                }
            }
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(server_msg) => {
                        let send_span = tracing::info_span!(
                            target: "paging",
                            "ws_broadcast",
                            otel.name = "ws.broadcast",
                            message = message_label(&server_msg)
                        );
                        let _guard = send_span.enter();
                        if send_json(&mut socket, &server_msg).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
    }
    state.release_connection();
}

async fn send_welcome(socket: &mut WebSocket) -> Result<(), ()> {
    send_json(socket, &ServerMessage::Welcome { version: "1" }).await
}

async fn send_snapshot(socket: &mut WebSocket, state: &AppState, limit: usize) -> Result<(), ()> {
    let events = state.hot_store.latest(limit).await;
    let newest_id = events.first().map(|e| e.id.clone());
    let oldest_id = events.last().map(|e| e.id.clone());
    let cfg = state.config.read().await;
    let presence = presence_snapshot(state);
    let metrics = Some(state.metrics.snapshot());
    let message = ServerMessage::Snapshot {
        events,
        newest_id,
        oldest_id,
        limit: cfg.config.server.ws_snapshot_limit,
        presence,
        metrics,
    };
    send_json(socket, &message).await
}

async fn send_config_snapshot(socket: &mut WebSocket, state: &AppState) -> Result<(), ()> {
    let snapshot = config_update(state).await;
    send_json(socket, &ServerMessage::ConfigSnapshot { config: snapshot }).await
}

async fn send_degraded_notice(socket: &mut WebSocket, state: &AppState) -> Result<(), ()> {
    if !state
        .ready_flags
        .hot_store_ready
        .load(std::sync::atomic::Ordering::Relaxed)
    {
        send_json(
            socket,
            &ServerMessage::Degraded {
                reason: "hot_store degraded, using in-memory fallback".into(),
            },
        )
        .await?;
    }
    Ok(())
}

async fn handle_client_message(
    socket: &mut WebSocket,
    state: &AppState,
    message: Message,
) -> Result<(), ()> {
    match message {
        Message::Text(text) => match serde_json::from_str::<ClientMessage>(&text) {
            Ok(ClientMessage::Ping) => send_json(socket, &ServerMessage::Pong).await?,
            Ok(ClientMessage::ConfigRefresh) => {
                let snapshot = config_update(state).await;
                send_json(socket, &ServerMessage::ConfigSnapshot { config: snapshot }).await?;
            }
            Ok(ClientMessage::Subscribe { .. }) => {
                // No-op for now; subscriptions will be enforced when number scoping is added.
            }
            Ok(ClientMessage::PageBefore { anchor_id, limit }) => {
                send_page(socket, state, PageDirection::Before, anchor_id, limit).await?;
            }
            Ok(ClientMessage::PageAfter { anchor_id, limit }) => {
                send_page(socket, state, PageDirection::After, anchor_id, limit).await?;
            }
            Ok(ClientMessage::Page { before, limit }) => {
                if let Some(anchor) = before {
                    send_page(socket, state, PageDirection::Before, anchor, limit).await?;
                }
            }
            Err(_) => {
                if text.trim().eq_ignore_ascii_case("ping") {
                    send_json(socket, &ServerMessage::Pong).await?;
                }
            }
        },
        Message::Ping(_) => {
            // Respond with Pong to keep connection alive.
            let _ = socket.send(Message::Pong(vec![])).await;
        }
        Message::Close(_) => return Err(()),
        _ => {}
    }
    Ok(())
}

async fn send_json(socket: &mut WebSocket, msg: &ServerMessage) -> Result<(), ()> {
    match serde_json::to_string(msg) {
        Ok(payload) => {
            if timeout(Duration::from_secs(5), socket.send(Message::Text(payload)))
                .await
                .is_err()
            {
                tracing::warn!(target: "paging", message = message_label(msg), "ws send timeout");
                return Err(());
            }
            Ok(())
        }
        Err(err) => {
            tracing::error!(error = %err, "failed to serialize WS message");
            Err(())
        }
    }
}

async fn send_page(
    socket: &mut WebSocket,
    state: &AppState,
    direction: PageDirection,
    anchor_id: String,
    limit: Option<u32>,
) -> Result<(), ()> {
    let cfg = state.config.read().await;
    let limit = limit
        .unwrap_or(cfg.config.server.ws_snapshot_limit)
        .min(cfg.config.server.ws_snapshot_limit);
    let events = match direction {
        PageDirection::Before => {
            state
                .hot_store
                .page_before(&anchor_id, limit as usize)
                .await
        }
        PageDirection::After => state.hot_store.page_after(&anchor_id, limit as usize).await,
    };
    let oldest_id = events.last().map(|e| e.id.clone());
    let newest_id = events.first().map(|e| e.id.clone());
    let payload = PagePayload {
        direction,
        anchor_id,
        events,
        oldest_id,
        newest_id,
    };
    send_json(socket, &ServerMessage::Page(payload)).await
}

fn message_label(msg: &ServerMessage) -> &'static str {
    match msg {
        ServerMessage::Welcome { .. } => "welcome",
        ServerMessage::Snapshot { .. } => "snapshot",
        ServerMessage::Page(_) => "page",
        ServerMessage::EventNew { .. } => "event_new",
        ServerMessage::EventUpdate { .. } => "event_update",
        ServerMessage::PresenceUpdate(_) => "presence_update",
        ServerMessage::ConfigSnapshot { .. } => "config_snapshot",
        ServerMessage::ConfigUpdate { .. } => "config_update",
        ServerMessage::ContactUpdate { .. } => "contact_update",
        ServerMessage::SimUpdate { .. } => "sim_update",
        ServerMessage::Degraded { .. } => "degraded_notice",
        ServerMessage::Pong => "pong",
    }
}

fn auth_label(ctx: &AuthContext) -> String {
    match &ctx.principal {
        Principal::User { id, .. } => format!("user:{id}"),
        Principal::Device { id } => format!("device:{id}"),
    }
}

fn presence_snapshot(state: &AppState) -> Vec<crate::ws_types::PresenceUpdate> {
    let sim_inventory = state.sim_inventory.clone();
    state
        .presence
        .all()
        .into_iter()
        .map(|(device_id, entry, presence_state)| {
            map_presence(&device_id, entry, presence_state, sim_inventory.as_ref())
        })
        .collect()
}

fn map_presence(
    device_id: &str,
    entry: PresenceEntry,
    presence_state: crate::domain::PresenceState,
    sims: &crate::sim_inventory::SimInventoryStore,
) -> crate::ws_types::PresenceUpdate {
    let sims = sims.get(device_id).unwrap_or_default();
    crate::ws_types::PresenceUpdate {
        device_id: device_id.to_string(),
        state: presence_state,
        queue_depth: entry.queue_depth,
        last_heartbeat: entry.last_heartbeat,
        device_rtt_ms: entry.device_rtt_ms,
        sims,
    }
}

async fn config_update(state: &AppState) -> ConfigUpdate {
    let cfg = state.config.read().await;
    let envelope = crate::config::UiConfigEnvelope::from_versioned(&cfg);
    ConfigUpdate::from(envelope)
}

fn token_from_query(uri: &axum::http::Uri) -> Option<String> {
    uri.query().and_then(|query| {
        query.split('&').find_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?;
            let value = parts.next()?;
            if key == "token" {
                Some(value.to_string())
            } else {
                None
            }
        })
    })
}
