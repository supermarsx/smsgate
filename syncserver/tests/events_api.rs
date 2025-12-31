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
    routes::{events, ingest},
    state::AppState,
};
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/ingest", post(ingest::ingest))
        .route("/api/v1/events/:event_id/claim", post(events::claim_event))
        .route(
            "/api/v1/events/:event_id/verify",
            post(events::verify_event),
        )
        .route(
            "/api/v1/events/:event_id/reject",
            post(events::reject_event),
        )
        .with_state(state)
}

#[tokio::test]
async fn transitions_enforce_rules_and_update_state() {
    let mut config = AppConfig::default();
    let dir = tempfile::tempdir().unwrap();
    config.database.path = Some(dir.path().join("events.json").display().to_string());
    let mut state = AppState::new(config).await;
    state.device_auth = DeviceAuthStore::default().with_token("dev-1", "t0k3n");
    let app = app_with_state(state);

    // Ingest an event to transition.
    let ingest_payload = json!({
        "events": [{
            "id": "evt-claim",
            "device_id": "dev-1",
            "number_e164": "+1555",
            "sender": "alice",
            "content": "hello world",
            "device_received_at": "2024-12-31T00:00:00Z"
        }]
    });
    let ingest_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/ingest")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-device-id", "dev-1")
                .header("authorization", "Bearer t0k3n")
                .body(Body::from(ingest_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ingest_res.status(), StatusCode::OK);

    // Claim the event.
    let claim_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/events/evt-claim/claim")
                .method("POST")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(claim_res.status(), StatusCode::OK);
    let claim_body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(claim_res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(claim_body["state"], "claimed");

    // Verify the event.
    let verify_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/events/evt-claim/verify")
                .method("POST")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(verify_res.status(), StatusCode::OK);
    let verify_body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(verify_res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(verify_body["state"], "verified");

    // Reject should fail after verified (invalid transition).
    let reject_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/events/evt-claim/reject")
                .method("POST")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reject_res.status(), StatusCode::UNPROCESSABLE_ENTITY);
}
