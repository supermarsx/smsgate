use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::post,
    Router,
};
use serde_json::json;
use syncserver::{
    auth::DeviceAuthStore,
    config::AppConfig,
    routes::{self, ingest},
    state::AppState,
};
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/ingest", post(ingest::ingest))
        .with_state(state)
}

#[tokio::test]
async fn ingests_event_and_sets_parsed_code() {
    let mut config = AppConfig::default();
    let dir = tempfile::tempdir().unwrap();
    config.database.path = Some(dir.path().join("events.json").display().to_string());
    let mut state = AppState::new(config).await;
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
    let mut config = AppConfig::default();
    let dir = tempfile::tempdir().unwrap();
    config.database.path = Some(dir.path().join("events.json").display().to_string());
    let mut state = AppState::new(config).await;
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

#[tokio::test]
async fn persistence_policy_applies_state_rules() {
    let mut config = AppConfig::default();
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("events.json");
    config.database.path = Some(db_path.display().to_string());
    config.ingest.persist_new = false;
    config.ingest.persist_states = vec!["verified".into()];
    let mut state = AppState::new(config).await;
    state.device_auth = DeviceAuthStore::default().with_token("dev-1", "t0k3n");
    let app = routes::router(state.clone());

    let payload = json!({
        "events": [
            {
                "id": "evt-policy",
                "device_id": "dev-1",
                "number_e164": "+123",
                "sender": "alice",
                "content": "hello",
                "device_received_at": "2024-12-31T00:00:00Z"
            }
        ]
    });

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

    // Persist_new is disabled, so file should remain empty.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    let contents = tokio::fs::read_to_string(&db_path)
        .await
        .unwrap_or_default();
    let lines: Vec<serde_json::Value> = contents
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .collect();
    let event_lines: Vec<_> = lines
        .iter()
        .filter(|line| line.get("content_hash").is_some())
        .collect();
    assert_eq!(event_lines.len(), 0, "event was persisted unexpectedly");

    // Transition to verified, which should trigger persistence.
    let _ = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/events/evt-policy/verify")
                .method("POST")
                .header("x-user-id", "admin")
                .header("x-user-role", "admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    let contents = tokio::fs::read_to_string(&db_path).await.unwrap();
    let lines: Vec<serde_json::Value> = contents
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .collect();
    let event_lines: Vec<_> = lines
        .iter()
        .filter(|line| line.get("content_hash").is_some())
        .collect();
    assert_eq!(event_lines.len(), 1);
}
