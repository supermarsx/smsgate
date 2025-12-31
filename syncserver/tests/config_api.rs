use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::{get, patch},
    Router,
};
use serde_json::json;
use syncserver::{config::AppConfig, routes::config, state::AppState};
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route(
            "/api/v1/config",
            get(config::get_config).patch(config::patch_config),
        )
        .with_state(state)
}

#[tokio::test]
async fn returns_config_snapshot() {
    let mut config = AppConfig::default();
    config.auth.modes = vec![
        syncserver::config::AuthMode::SimpleSignin,
        syncserver::config::AuthMode::Oauth,
    ];
    config.ingest.max_batch = 42;
    let state = AppState::new(config).await;
    let app = app_with_state(state);

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/config")
                .header("x-user-id", "user-1")
                .header("x-user-role", "admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let value: serde_json::Value =
        serde_json::from_slice(&hyper::body::to_bytes(res.into_body()).await.unwrap()).unwrap();
    assert_eq!(value["version"], 1);
    assert_eq!(value["ingest"]["max_batch"], 42);
    assert!(value["last_updated_at"].as_str().is_some());
}

#[tokio::test]
async fn patch_updates_config_and_persists() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    std::env::set_var("SYNC_CONFIG_PATH", path.to_string_lossy().to_string());

    let state = AppState::new(AppConfig::default()).await;
    let app = app_with_state(state.clone());

    let patch_body = json!({ "ingest": { "max_batch": 5 } });
    let patch_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/config")
                .method("PATCH")
                .header("content-type", "application/json")
                .header("x-user-id", "admin-1")
                .header("x-user-role", "admin")
                .body(Body::from(patch_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(patch_res.status(), StatusCode::OK);
    let value: serde_json::Value =
        serde_json::from_slice(&hyper::body::to_bytes(patch_res.into_body()).await.unwrap())
            .unwrap();
    assert_eq!(value["version"], 2);
    assert_eq!(value["ingest"]["max_batch"], 5);

    // Persisted file reflects patch.
    let persisted: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(persisted["ingest"]["max_batch"], 5);

    std::env::remove_var("SYNC_CONFIG_PATH");
}
