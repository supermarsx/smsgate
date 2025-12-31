use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::post,
    Router,
};
use serde_json::json;
use syncserver::{auth::DeviceAuthStore, config::AppConfig, routes::ingest, state::AppState};
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/ingest", post(ingest::ingest))
        .with_state(state)
}

#[tokio::test]
async fn ingests_event_and_sets_parsed_code() {
    let config = AppConfig::default();
    let mut state = AppState::new(config);
    state.device_auth = DeviceAuthStore::default().with_token("dev-1", "t0k3n");
    let app = app_with_state(state.clone());

    let payload = json!({
        "events": [
            {
                "id": "evt-1",
                "device_id": "dev-1",
                "number_e164": "+123",
                "sender": "alice",
                "content": "Your code is 987654",
                "device_received_at": "2024-12-31T00:00:00Z"
            }
        ]
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/ingest")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-device-id", "dev-1")
                .header("authorization", "Bearer t0k3n")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let events = state.hot_store.latest(1).await;
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, "evt-1");
    assert_eq!(events[0].parsed_code.as_deref(), Some("987654"));
}

#[tokio::test]
async fn deduplicates_by_content_hash() {
    let config = AppConfig::default();
    let mut state = AppState::new(config);
    state.device_auth = DeviceAuthStore::default().with_token("dev-1", "t0k3n");
    let app = app_with_state(state.clone());

    let payload = json!({
        "events": [
            {
                "id": "evt-1",
                "device_id": "dev-1",
                "number_e164": "+123",
                "sender": "alice",
                "content": "same",
                "device_received_at": "2024-12-31T00:00:00Z"
            }
        ]
    });

    // First ingest should store.
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/ingest")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-device-id", "dev-1")
                .header("authorization", "Bearer t0k3n")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Second ingest should be deduped.
    let res2 = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/ingest")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-device-id", "dev-1")
                .header("authorization", "Bearer t0k3n")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res2.status(), StatusCode::OK);

    let events = state.hot_store.latest(5).await;
    assert_eq!(events.len(), 1);
}
