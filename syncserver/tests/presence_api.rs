use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::post,
    Router,
};
use serde_json::json;
use syncserver::{config::AppConfig, routes::presence, state::AppState};
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
    let state = AppState::new(config);
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
