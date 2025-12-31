use axum::{
    body,
    body::Body,
    http::{Request, StatusCode},
    routing::{get, post},
    Router,
};
use serde_json::json;
use syncserver::{
    auth::DeviceAuthStore,
    config::AppConfig,
    routes::{devices, ingest},
    state::AppState,
};
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/devices", get(devices::list_devices))
        .route(
            "/api/v1/devices/:device_id/rename",
            post(devices::rename_device),
        )
        .route(
            "/api/v1/devices/:device_id/disable",
            post(devices::disable_device),
        )
        .route(
            "/api/v1/devices/:device_id/enable",
            post(devices::enable_device),
        )
        .route(
            "/api/v1/devices/:device_id/diagnostics",
            get(devices::diagnostics),
        )
        .route("/api/v1/ingest", post(ingest::ingest))
        .with_state(state)
}

#[tokio::test]
async fn device_disable_and_enable_controls_ingest() {
    let mut config = AppConfig::default();
    let dir = tempfile::tempdir().unwrap();
    config.database.path = Some(dir.path().join("events.json").display().to_string());
    let mut state = AppState::new(config).await;
    state.device_auth = DeviceAuthStore::default().with_token("dev-1", "t0k3n");
    let app = app_with_state(state.clone());

    // Disable device.
    let disable_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/devices/dev-1/disable")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::from(json!({"reason": "rotated"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(disable_res.status(), StatusCode::OK);

    // Ingest should fail while disabled.
    let ingest_payload = json!({
        "events": [{
            "id": "evt-1",
            "device_id": "dev-1",
            "number_e164": "+1555",
            "sender": "alice",
            "content": "hello",
            "device_received_at": "2024-12-31T00:00:00Z"
        }]
    });
    let blocked_ingest = app
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
    assert_eq!(blocked_ingest.status(), StatusCode::FORBIDDEN);

    // Re-enable device.
    let enable_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/devices/dev-1/enable")
                .method("POST")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(enable_res.status(), StatusCode::OK);

    // Ingest should now succeed.
    let allowed_ingest = app
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
    assert_eq!(allowed_ingest.status(), StatusCode::OK);

    // Rename and list.
    let rename_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/devices/dev-1/rename")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::from(json!({"name": "relay-one"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rename_res.status(), StatusCode::OK);

    let list_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/devices")
                .method("GET")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_res.status(), StatusCode::OK);
    let list_body: serde_json::Value =
        serde_json::from_slice(
            &body::to_bytes(list_res.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
            .unwrap();
    assert_eq!(
        list_body["devices"][0]["name"].as_str().unwrap(),
        "relay-one"
    );

    // Diagnostics stub should respond with offline presence.
    let diag_res = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/devices/dev-1/diagnostics")
                .method("GET")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(diag_res.status(), StatusCode::OK);
    let diag_body: serde_json::Value =
        serde_json::from_slice(
            &body::to_bytes(diag_res.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
            .unwrap();
    assert_eq!(diag_body["device"]["id"], "dev-1");
    assert_eq!(diag_body["presence"]["state"], "offline");
}
