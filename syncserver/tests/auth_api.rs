use axum::{
    body,
    body::Body,
    http::{Request, StatusCode},
    routing::post,
    Router,
};
use serde_json::{json, Value};
use syncserver::{
    config::{AppConfig, AuthMode},
    routes::{auth as auth_routes, config},
    state::AppState,
};
use tokio::time::Duration;
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/auth/login", post(auth_routes::login))
        .route("/api/v1/auth/logout", post(auth_routes::logout))
        .route(
            "/api/v1/config",
            axum::routing::get(config::get_config).patch(config::patch_config),
        )
        .with_state(state)
}

#[tokio::test]
async fn simple_signin_login_and_session_auth() {
    let mut cfg = AppConfig::default();
    cfg.auth.modes = vec![AuthMode::SimpleSignin];
    cfg.auth.password_pepper = Some("pepper".into());
    cfg.auth.session_ttl_secs = 3600;
    let state = AppState::new(cfg).await;
    let app = app_with_state(state);

    let login_payload = json!({
        "mode": "simple_signin",
        "username": "smsgate-admin",
        "password": "SmsgateSync#2025!"
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/login")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(login_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body: serde_json::Value =
        serde_json::from_slice(&body::to_bytes(res.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    let session = body["session_token"].as_str().unwrap();

    // Use session token to read config via UserAuth session path.
    let config_res = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/config")
                .method("GET")
                .header("authorization", format!("Bearer {}", session))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(config_res.status(), StatusCode::OK);
}

#[tokio::test]
async fn login_events_are_audited() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("audit.json");
    let mut cfg = AppConfig::default();
    cfg.auth.modes = vec![AuthMode::SimpleSignin];
    cfg.database.path = Some(path.to_string_lossy().to_string());
    cfg.database.enable_audit_log = true;

    let state = AppState::new(cfg).await;
    let app = app_with_state(state);

    let login_payload = json!({
        "mode": "simple_signin",
        "username": "smsgate-admin",
        "password": "SmsgateSync#2025!"
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/login")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(login_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    tokio::time::sleep(Duration::from_millis(50)).await;
    let contents = tokio::fs::read_to_string(&path).await.unwrap();
    let entries: Vec<Value> = contents
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .collect();
    assert!(
        entries.iter().any(|entry| entry.get("identity").is_some()),
        "expected login event persisted"
    );
    assert!(
        entries
            .iter()
            .any(|entry| entry.get("action") == Some(&json!("auth.login"))),
        "expected audit log entry persisted"
    );
}
