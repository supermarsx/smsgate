//! WebSocket gateway for smsgate2 dashboards.

use std::time::Duration;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use tokio::time::timeout;

use crate::{
    state::AppState,
    ws_types::{ClientMessage, PageDirection, PagePayload, ServerMessage},
};

/// Upgrade HTTP requests to WebSocket and spawn session tasks.
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    if !state.try_acquire_connection().await {
        return Response::builder()
            .status(axum::http::StatusCode::TOO_MANY_REQUESTS)
            .body(axum::body::Body::from("max connections reached"))
            .unwrap();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
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

    loop {
        tokio::select! {
            msg = socket.recv() => {
                if let Some(Ok(message)) = msg {
                    if let Err(_) = handle_client_message(&mut socket, &state, message).await {
                        break;
                    }
                } else {
                    break;
                }
            }
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(server_msg) => {
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
    let message = ServerMessage::Snapshot {
        events,
        newest_id,
        oldest_id,
        limit: cfg.config.server.ws_snapshot_limit,
    };
    send_json(socket, &message).await
}

async fn send_config_snapshot(socket: &mut WebSocket, state: &AppState) -> Result<(), ()> {
    let snapshot = state.config_snapshot().await;
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
                let snapshot = state.config_snapshot().await;
                send_json(socket, &ServerMessage::ConfigSnapshot { config: snapshot }).await?;
            }
            Ok(ClientMessage::PageBefore { anchor_id, limit }) => {
                send_page(socket, state, PageDirection::Before, anchor_id, limit).await?;
            }
            Ok(ClientMessage::PageAfter { anchor_id, limit }) => {
                send_page(socket, state, PageDirection::After, anchor_id, limit).await?;
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
