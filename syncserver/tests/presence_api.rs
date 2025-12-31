use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::post,
    Router,
};
use serde_json::json;
use syncserver::{auth::DeviceAuthStore, config::AppConfig, routes::presence, state::AppState};
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/presence/heartbeat", post(presence::heartbeat))
        .with_state(state)
}

#[tokio::test]
async fn returns_presence_online_then_degraded() {
    let mut config = AppConfig::default();
    config.presence.online_threshold_ms = 100;
    config.presence.degraded_threshold_ms = 500;
    let dir = tempfile::tempdir().unwrap();
    config.database.path = Some(dir.path().join("events.json").display().to_string());
    let mut state = AppState::new(config).await;
    state.device_auth = DeviceAuthStore::default().with_token("dev-1", "t0k3n");
    let app = app_with_state(state.clone());

    let payload = json!({
        "device_id": "dev-1",
        "queue_depth": 0,
        "device_rtt_ms": 5,
        "last_successful_ingest_at": null,
        "battery_level": null,
        "network_type": null,
        "client_time": "2024-12-31T00:00:00Z"
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/presence/heartbeat")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-device-id", "dev-1")
                .header("authorization", "Bearer t0k3n")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let presence_now = state.presence.evaluate(chrono::Utc::now(), "dev-1");
    assert_eq!(presence_now, syncserver::domain::PresenceState::Online);

    // Advance simulated time by sleeping past online threshold but within degraded.
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    let presence_later = state.presence.evaluate(chrono::Utc::now(), "dev-1");
    assert_eq!(presence_later, syncserver::domain::PresenceState::Degraded);
}

#[tokio::test]
async fn sim_inventory_is_tracked_from_heartbeat() {
    let mut config = AppConfig::default();
    let dir = tempfile::tempdir().unwrap();
    config.database.path = Some(dir.path().join("events.json").display().to_string());
    let mut state = AppState::new(config).await;
    state.device_auth = DeviceAuthStore::default().with_token("dev-2", "tok");
    let app = app_with_state(state.clone());

    let payload = json!({
        "device_id": "dev-2",
        "queue_depth": 1,
        "device_rtt_ms": 10,
        "last_successful_ingest_at": null,
        "battery_level": null,
        "network_type": null,
        "client_time": "2024-12-31T00:00:00Z",
        "sims": [
            {
                "slot_index": 0,
                "iccid": "123",
                "msisdn": "+15550001111",
                "carrier_name": "ACME",
                "status": "active",
                "last_seen_at": "2024-12-31T00:00:00Z"
            }
        ]
    });

    let res = app
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
    assert_eq!(res.status(), StatusCode::OK);

    let inventory = state.sim_inventory.get("dev-2").unwrap();
    assert_eq!(inventory.len(), 1);
    assert_eq!(inventory[0].msisdn.as_deref(), Some("+15550001111"));
}
