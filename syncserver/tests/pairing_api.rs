use axum::{
    body,
    body::Body,
    http::{Request, StatusCode},
    routing::post,
    Router,
};
use serde_json::json;
use syncserver::{
    config::AppConfig,
    routes::{ingest, pairing},
    state::AppState,
};
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/pairing/session", post(pairing::create_session))
        .route("/api/v1/pairing/complete", post(pairing::complete_session))
        .route("/api/v1/ingest", post(ingest::ingest))
        .with_state(state)
}

#[tokio::test]
async fn pairing_issues_device_token_and_ingest_works() {
    let mut config = AppConfig::default();
    let dir = tempfile::tempdir().unwrap();
    config.database.path = Some(dir.path().join("events.json").display().to_string());
    let state = AppState::new(config).await;
    let app = app_with_state(state.clone());

    // Create pairing session as admin user.
    let session_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/pairing/session")
                .method("POST")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(session_res.status(), StatusCode::OK);
    let body: serde_json::Value = serde_json::from_slice(
        &body::to_bytes(session_res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    let session_id = body["session_id"].as_str().unwrap().to_string();

    // Complete pairing from device.
    let complete_payload = json!({ "session_id": session_id, "device_name": "relay-1" });
    let complete_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/pairing/complete")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(complete_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(complete_res.status(), StatusCode::OK);
    let complete_body: serde_json::Value = serde_json::from_slice(
        &body::to_bytes(complete_res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    let device_id = complete_body["device_id"].as_str().unwrap();
    let device_token = complete_body["device_token"].as_str().unwrap();

    // Ingest should succeed with issued credentials.
    let ingest_payload = json!({
        "events": [{
            "id": "pair-evt-1",
            "device_id": device_id,
            "number_e164": "+1555",
            "sender": "bob",
            "content": "hello",
            "device_received_at": "2024-12-31T00:00:00Z"
        }]
    });
    let ingest_res = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/ingest")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-device-id", device_id)
                .header("authorization", format!("Bearer {}", device_token))
                .body(Body::from(ingest_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ingest_res.status(), StatusCode::OK);
}
