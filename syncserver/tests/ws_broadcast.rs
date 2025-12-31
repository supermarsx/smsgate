use axum::{
    body::Body,
    http::Request,
    routing::{get, post},
    Router,
};
use serde_json::json;
use syncserver::{
    auth::DeviceAuthStore,
    config::AppConfig,
    routes::{ingest, presence, ws},
    state::AppState,
    ws_types::ServerMessage,
};
use tokio::task::JoinHandle;
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/ingest", post(ingest::ingest))
        .route("/api/v1/presence/heartbeat", post(presence::heartbeat))
        .route("/api/v1/ws", get(ws::ws_handler))
        .with_state(state)
}

#[tokio::test]
async fn ingest_broadcasts_event_new() {
    let mut config = AppConfig::default();
    config.ingest.max_batch = 5;
    let mut state = AppState::new(config).await;
    state.device_auth = DeviceAuthStore::default().with_token("dev-1", "tok");
    let mut rx = state.subscribe_events();
    let app = app_with_state(state.clone());

    let payload = json!({
        "events": [
            {
                "id": "ws-evt-1",
                "device_id": "dev-1",
                "sender": "alice",
                "content": "hello",
                "device_received_at": "2024-12-31T00:00:00Z"
            }
        ]
    });

    let _ = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/ingest")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-device-id", "dev-1")
                .header("authorization", "Bearer tok")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let message = rx.recv().await.expect("broadcast");
    match message {
        ServerMessage::EventNew { event } => assert_eq!(event.id, "ws-evt-1"),
        other => panic!("unexpected message: {:?}", other),
    }
}

#[tokio::test]
async fn heartbeat_emits_sim_update_when_changed() {
    let mut state = AppState::new(AppConfig::default()).await;
    state.device_auth = DeviceAuthStore::default().with_token("dev-2", "tok");
    let mut rx = state.subscribe_events();
    let app = app_with_state(state.clone());

    let payload = json!({
        "device_id": "dev-2",
        "queue_depth": 0,
        "device_rtt_ms": 12,
        "last_successful_ingest_at": null,
        "battery_level": null,
        "network_type": null,
        "client_time": "2024-12-31T00:00:00Z",
        "sims": [
            {
                "slot_index": 0,
                "iccid": "iccid-1",
                "msisdn": "+15550002222",
                "carrier_name": "ACME",
                "status": "active",
                "last_seen_at": "2024-12-31T00:00:00Z"
            }
        ]
    });

    let _ = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/presence/heartbeat")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-device-id", "dev-2")
                .header("authorization", "Bearer tok")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    // First message might be PresenceUpdate, so loop until SimUpdate.
    for _ in 0..2 {
        if let ServerMessage::SimUpdate(update) = rx.recv().await.expect("broadcast") {
            assert_eq!(update.device_id, "dev-2");
            assert_eq!(update.sims.len(), 1);
            return;
        }
    }
    panic!("expected sim update broadcast");
}
