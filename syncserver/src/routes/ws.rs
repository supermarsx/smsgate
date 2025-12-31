//! WebSocket gateway for smsgate2 dashboards.

use std::time::Duration;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures::SinkExt;
use tokio::time::timeout;

use crate::{state::AppState, ws_types::ServerMessage};

/// Upgrade HTTP requests to WebSocket and spawn session tasks.
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.subscribe_events();
    let snapshot_limit = state.config.server.ws_snapshot_limit as usize;

    if send_welcome(&mut socket).await.is_err() {
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
                    if let Err(_) = handle_client_message(&mut socket, message).await {
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
}

async fn send_welcome(socket: &mut WebSocket) -> Result<(), ()> {
    send_json(socket, &ServerMessage::Welcome { version: "1" }).await
}

async fn send_snapshot(socket: &mut WebSocket, state: &AppState, limit: usize) -> Result<(), ()> {
    let events = state.hot_store.latest(limit).await;
    let newest_id = events.first().map(|e| e.id.clone());
    let oldest_id = events.last().map(|e| e.id.clone());
    let message = ServerMessage::Snapshot {
        events,
        newest_id,
        oldest_id,
        limit: state.config.server.ws_snapshot_limit,
    };
    send_json(socket, &message).await
}

async fn handle_client_message(socket: &mut WebSocket, message: Message) -> Result<(), ()> {
    match message {
        Message::Text(text) => {
            if text.trim().eq_ignore_ascii_case("ping") {
                send_json(socket, &ServerMessage::Pong).await?;
            }
        }
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
